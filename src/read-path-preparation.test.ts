import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { createAuth, saveAuth } from "./auth";
import { rebuildOmniViewFromExactCache } from "./omni-runtime";
import { main } from "./ghostget";
import { describeOperationPermission, OperationPermissionError } from "./operation-permission";
import { providerPluginRegistry } from "./provider-plugins";
import { readCachedCapability } from "./read-client";
import { createAndSaveInvocationPlan, prepareInvocation, prepareOperationApprovalInvocation } from "./runtime";
import { installManifest } from "./storage";
import type { GhostgetManifest } from "./model";

const roots: string[] = [];
afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function manifest(path: string): GhostgetManifest {
  return JSON.parse(readFileSync(join(import.meta.dir, "assets", "adapters", path), "utf8")) as GhostgetManifest;
}

function incarnationPath(root: string, authId: string): string {
  const coordinate = createHash("sha256").update(`wrench-read-projection-auth-coordinate-v1\0${authId}`).digest("hex");
  return join(root, "read-projection-control", "incarnations", `${coordinate}.json`);
}

/**
 * Names and bytes of every file in the state home, plus directory change
 * times outside the admission-claim directory. Preparation takes a settled
 * admission, so creating and releasing its own claim is not a change here.
 */
function fingerprint(root: string): readonly string[] {
  const lines: string[] = [];
  const walk = (directory: string): void => {
    const name = relative(root, directory);
    if (name !== join("read-projection-control", "admissions")) lines.push(`${name}/ ${lstatSync(directory, { bigint: true }).mtimeNs}`);
    for (const entry of readdirSync(directory).sort()) {
      const path = join(directory, entry);
      if (lstatSync(path).isDirectory()) walk(path);
      else lines.push(`${relative(root, path)} ${createHash("sha256").update(readFileSync(path)).digest("hex")}`);
    }
  };
  walk(root);
  return lines;
}

/** A state home with the selected X or Reddit account, saved with its incarnation. */
function accounts(selected: "x" | "reddit" = "x") {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ghostget-read-path-preparation-"))); chmodSync(root, 0o700); roots.push(root);
  const environment: Readonly<Record<string, string>> = { GHOSTGET_STATE_HOME: root };
  if (selected === "x") {
    installManifest(manifest("x/wrench-adapter.json"), { force: false, environment, registry: providerPluginRegistry });
    saveAuth(createAuth("x-main", {
      oauthProvider: "x",
      tokenFile: join(root, "x-token.json"),
      scopes: ["dm.read", "tweet.read", "tweet.write", "users.read"],
      subject: "12345",
    }), environment);
  } else {
    installManifest(manifest("reddit/wrench-web-adapter.json"), { force: false, environment, registry: providerPluginRegistry });
    saveAuth(createAuth("reddit-main", { source: "chrome", subject: "reddit:t2_account" }), environment);
  }
  return { root, environment };
}

const xRead = { adapterId: "x", operationId: "messaging.list", input: { view: "all", limit: 25 }, authId: "x-main" } as const;
const redditSource = { adapterId: "reddit-web", operationId: "messaging.list", authId: "reddit-main", input: { folder: "inbox", limit: 25 } } as const;

function omniRebuild(environment: Readonly<Record<string, string>>) {
  return rebuildOmniViewFromExactCache({ schemaVersion: 1, sources: [redditSource], page: { limit: 1 } }, {
    environment, registry: providerPluginRegistry, now: new Date("2026-09-24T12:00:00.000Z"),
  });
}

function permissionCode(run: () => unknown): string | null {
  try { run(); } catch (error) { return error instanceof OperationPermissionError ? error.code : `other: ${String(error)}`; }
  return null;
}

describe("read-path preparation binds the current incarnation without creating one", () => {
  test("a capability read on an account without an incarnation fails closed and writes nothing", () => {
    const { root, environment } = accounts();
    rmSync(incarnationPath(root, "x-main"));
    const before = fingerprint(root);
    expect(() => readCachedCapability(xRead, { environment, registry: providerPluginRegistry }))
      .toThrow("auth locator x-main has no lifetime identity yet");
    expect(existsSync(incarnationPath(root, "x-main"))).toBeFalse();
    expect(fingerprint(root)).toEqual(before);
  });

  test("an omni source preparation on an account without an incarnation fails closed and creates none", () => {
    const { root, environment } = accounts("reddit");
    rmSync(incarnationPath(root, "reddit-main"));
    expect(() => omniRebuild(environment)).toThrow("auth locator reddit-main has no lifetime identity yet");
    expect(existsSync(incarnationPath(root, "reddit-main"))).toBeFalse();
  });

  test("invoke --cache-only on an account without an incarnation fails closed and writes nothing", async () => {
    const { root, environment } = accounts();
    rmSync(incarnationPath(root, "x-main"));
    const before = fingerprint(root);
    const stdout: string[] = [];
    const stderr: string[] = [];
    let cacheReads = 0;
    const code = await main(
      ["invoke", "x", "messaging.list", "--input", JSON.stringify(xRead.input), "--auth", "x-main", "--cache-only", "--json"],
      environment,
      { stdout: (value) => stdout.push(value), stderr: (value) => stderr.push(value) },
      {
        providerPluginRegistry,
        readCachedPreparedCapability: () => { cacheReads += 1; throw new Error("cache read must not run"); },
      },
    );
    expect(code).not.toBe(0);
    expect(stderr.join("")).toContain("auth locator x-main has no lifetime identity yet");
    expect(cacheReads).toBe(0);
    expect(existsSync(incarnationPath(root, "x-main"))).toBeFalse();
    expect(fingerprint(root)).toEqual(before);
  });

  test("control inspection of an unplanned approval target creates no incarnation", () => {
    const { root, environment } = accounts();
    rmSync(incarnationPath(root, "x-main"));
    expect(() => prepareOperationApprovalInvocation(
      { kind: "provider", adapterId: "x", operationId: "posts.publish", authId: "x-main", input: { body: "hello" }, planDigest: null },
      { environment, registry: providerPluginRegistry },
    )).toThrow("auth locator x-main has no lifetime identity yet");
    expect(existsSync(incarnationPath(root, "x-main"))).toBeFalse();
  });

  test("confirmation preparation of a saved plan whose incarnation disappeared fails as changed and creates none", () => {
    const { root, environment } = accounts();
    const stored = createAndSaveInvocationPlan(
      prepareInvocation("x", "posts.publish", { body: "hello" }, "x-main", environment, providerPluginRegistry),
      environment, new Date(), providerPluginRegistry,
    );
    rmSync(incarnationPath(root, "x-main"));
    expect(() => prepareOperationApprovalInvocation(
      { kind: "provider", adapterId: "x", operationId: "posts.publish", authId: "x-main", input: { body: "hello" }, planDigest: stored.digest },
      { environment, registry: providerPluginRegistry },
    )).toThrow("authentication lifetime changed or predates managed permissions; preview the action again");
    expect(existsSync(incarnationPath(root, "x-main"))).toBeFalse();
  });

  test("an operation-permission description of an account without an incarnation reads as changed and creates none", () => {
    const { root, environment } = accounts();
    rmSync(incarnationPath(root, "x-main"));
    expect(permissionCode(() => describeOperationPermission("x", "posts.publish", "x-main", { environment, registry: providerPluginRegistry })))
      .toBe("OPERATION_PERMISSION_CHANGED");
    expect(existsSync(incarnationPath(root, "x-main"))).toBeFalse();
  });

  test("an explicit invocation is the admitted execution path that creates a missing incarnation", () => {
    const { root, environment } = accounts();
    rmSync(incarnationPath(root, "x-main"));
    const invocation = prepareInvocation("x", "messaging.list", xRead.input, "x-main", environment, providerPluginRegistry);
    expect(existsSync(incarnationPath(root, "x-main"))).toBeTrue();
    // The read path then binds the same identity and leaves it unchanged.
    const created = readFileSync(incarnationPath(root, "x-main"));
    expect(readCachedCapability(xRead, { environment, registry: providerPluginRegistry }).status).toBe("miss");
    const description = describeOperationPermission("x", "messaging.list", "x-main", { environment, registry: providerPluginRegistry });
    expect(description.coordinate.authIncarnation).toBe(invocation.readProjectionAuthIdentityHash!);
    expect(readFileSync(incarnationPath(root, "x-main"))).toEqual(created);
  });
});

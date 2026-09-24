import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { createAuth, saveAuth } from "./auth";
import { canonicalJson, manifestHash, sha256, type GhostgetManifest } from "./model";
import { rebuildOmniViewFromExactCache } from "./omni-runtime";
import type { ProviderPluginRegistry } from "./provider-plugin-registry";
import { providerPluginRegistry } from "./provider-plugins";
import { readCachedPreparedCapability, revalidatePreparedCapability } from "./read-client";
import { publishReadProjection } from "./read-projections";
import { createReadProjectionQueryForInvocation, prepareInvocation } from "./runtime";
import { installManifest } from "./storage";

const roots: string[] = [];
afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function stateHome(): { readonly root: string; readonly environment: Readonly<Record<string, string>> } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ghostget-read-path-incarnation-"))); chmodSync(root, 0o700); roots.push(root);
  return { root, environment: { GHOSTGET_STATE_HOME: root } };
}

function manifest(path: string): GhostgetManifest {
  return JSON.parse(readFileSync(join(import.meta.dir, "assets", "adapters", path), "utf8")) as GhostgetManifest;
}

function incarnationPath(root: string, authId: string): string {
  const coordinate = createHash("sha256").update(`wrench-read-projection-auth-coordinate-v1\0${authId}`).digest("hex");
  return join(root, "read-projection-control", "incarnations", `${coordinate}.json`);
}

/**
 * Names and bytes of every file in the state home, plus directory change
 * times outside the admission-claim directory. A cache read's own claim is
 * the D14 exemption, so creating and releasing it is not a change here.
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

/** An X messages account whose prepared invocation and projection key already exist. */
function preparedXRead() {
  const { root, environment } = stateHome();
  installManifest(manifest("x/wrench-adapter.json"), { force: false, environment, registry: providerPluginRegistry });
  saveAuth(createAuth("x-messages", {
    oauthProvider: "x",
    tokenFile: join(root, "x-token.json"),
    scopes: ["dm.read", "tweet.read", "users.read"],
    subject: "12345",
  }), environment);
  const invocation = prepareInvocation("x", "messaging.list", { view: "all", limit: 25 }, "x-messages", environment, providerPluginRegistry);
  const query = createReadProjectionQueryForInvocation(invocation, environment, providerPluginRegistry);
  return { root, environment, invocation, query };
}

describe("cache reads hold only the incarnation read capability", () => {
  test("a cache read whose incarnation disappeared after preparation misses and creates no incarnation", () => {
    const { root, environment, invocation, query } = preparedXRead();
    rmSync(incarnationPath(root, "x-messages"));
    const before = fingerprint(root);
    expect(readCachedPreparedCapability(invocation, { environment, registry: providerPluginRegistry })).toEqual({ status: "miss", key: query.key });
    expect(existsSync(incarnationPath(root, "x-messages"))).toBeFalse();
    expect(fingerprint(root)).toEqual(before);
  });

  test("a revalidation whose incarnation disappeared fails as changed before any live read and creates no incarnation", async () => {
    const { root, environment, invocation } = preparedXRead();
    rmSync(incarnationPath(root, "x-messages"));
    const before = fingerprint(root);
    let liveReads = 0;
    await expect(revalidatePreparedCapability(invocation, {
      environment,
      registry: providerPluginRegistry,
      executeRead: () => { liveReads += 1; return Promise.reject(new Error("the live read must not start")); },
    })).rejects.toThrow("auth locator x-messages changed since this invocation was prepared");
    expect(liveReads).toBe(0);
    expect(existsSync(incarnationPath(root, "x-messages"))).toBeFalse();
    expect(fingerprint(root)).toEqual(before);
  });

  test("a cache read with its incarnation present still hits and writes nothing", async () => {
    const { root, environment, invocation } = preparedXRead();
    const output = { conversations: [{ id: "conversation" }] };
    await revalidatePreparedCapability(invocation, {
      environment,
      registry: providerPluginRegistry,
      executeRead: () => Promise.resolve({
        receipt: {
          schemaVersion: 3, transport: "provider-api", providerContractHash: "a".repeat(64), runId: "00000000-0000-4000-8000-000000000001", planDigest: null,
          adapter: { id: invocation.manifest.id, version: invocation.manifest.version, hash: manifestHash(invocation.manifest) },
          operation: invocation.operationId, risk: "R1", inputHash: sha256(canonicalJson(invocation.input)), auth: { id: invocation.auth.id, hash: sha256(canonicalJson(invocation.auth)), kind: invocation.auth.kind },
          status: "succeeded", dispatchStarted: false, dispatch: { planned: 0, started: 0, verified: 0 },
          startedAt: "2026-09-23T12:00:00.000Z", finishedAt: "2026-09-23T12:00:01.000Z", finalOrigin: "https://api.x.com", error: null,
        },
        output,
        replayed: false,
      }),
    });
    const before = fingerprint(root);
    expect(readCachedPreparedCapability(invocation, { environment, registry: providerPluginRegistry })).toMatchObject({ status: "hit", output });
    expect(fingerprint(root)).toEqual(before);
  });
});

/** Every file in the state home, keyed by path, with its content digest. */
function files(root: string): ReadonlyMap<string, string> {
  return new Map(fingerprint(root).filter((line) => !line.includes("/ ")).map((line) => {
    const space = line.lastIndexOf(" ");
    return [line.slice(0, space), line.slice(space + 1)] as const;
  }));
}

describe("the D14 projection-key exemption", () => {
  test("a first cache read creates only the projection encryption key and its store-key marker", () => {
    const { root, environment } = stateHome();
    installManifest(manifest("x/wrench-adapter.json"), { force: false, environment, registry: providerPluginRegistry });
    saveAuth(createAuth("x-messages", {
      oauthProvider: "x",
      tokenFile: join(root, "x-token.json"),
      scopes: ["dm.read", "tweet.read", "users.read"],
      subject: "12345",
    }), environment);
    const invocation = prepareInvocation("x", "messaging.list", { view: "all", limit: 25 }, "x-messages", environment, providerPluginRegistry);
    const before = files(root);
    expect(before.has(".projection-encryption-key")).toBeFalse();
    expect(readCachedPreparedCapability(invocation, { environment, registry: providerPluginRegistry }).status).toBe("miss");
    const after = files(root);
    const added = [...after.keys()].filter((path) => !before.has(path)).sort();
    expect(added).toEqual([".projection-encryption-key", join("read-projection-control", "store-key.json")]);
    for (const [path, digest] of before) expect(after.get(path)).toBe(digest);
    // A second cache read writes nothing at all.
    const settled = fingerprint(root);
    expect(readCachedPreparedCapability(invocation, { environment, registry: providerPluginRegistry }).status).toBe("miss");
    expect(fingerprint(root)).toEqual(settled);
  });
});

describe("omni materialization holds only the incarnation read capability", () => {
  test("an incarnation removed during materialization fails the current-authority check and is not recreated", () => {
    const { root, environment } = stateHome();
    installManifest(manifest("reddit/wrench-web-adapter.json"), { force: false, environment, registry: providerPluginRegistry });
    saveAuth(createAuth("reddit-main", { source: "chrome", subject: "reddit:t2_account" }), environment);
    const invocation = prepareInvocation("reddit-web", "messaging.list", { folder: "inbox", limit: 25 }, "reddit-main", environment, providerPluginRegistry);
    const query = createReadProjectionQueryForInvocation(invocation, environment, providerPluginRegistry);
    publishReadProjection(query, { messages: [], after: null, before: null, requested: null }, {
      environment,
      runId: "00000000-0000-4000-8000-000000000002",
      startedAt: "2026-09-23T12:00:00.000Z",
      finishedAt: "2026-09-23T12:00:01.000Z",
    });
    // The account's incarnation disappears after the source was prepared and
    // before its normalized page is admitted, as an account removal would.
    // The view then prepares its sources again, and preparation is a write
    // path, so the probe records the incarnation when that next preparation
    // starts: after materialization, before anything else can create it.
    const probe: { removed: boolean; afterMaterialization: boolean | null } = { removed: false, afterMaterialization: null };
    const registry: ProviderPluginRegistry = {
      ...providerPluginRegistry,
      resolveOwnedManifest: (...args: Parameters<ProviderPluginRegistry["resolveOwnedManifest"]>) => {
        if (probe.removed && probe.afterMaterialization === null) probe.afterMaterialization = existsSync(incarnationPath(root, "reddit-main"));
        return providerPluginRegistry.resolveOwnedManifest(...args);
      },
      requireOperationDefinition: (...args: Parameters<ProviderPluginRegistry["requireOperationDefinition"]>) => {
        const resolution = providerPluginRegistry.requireOperationDefinition(...args);
        const omni = resolution.operation.omni;
        if (omni?.state !== "supported") return resolution;
        return {
          ...resolution,
          operation: {
            ...resolution.operation,
            omni: {
              ...omni,
              materialize: (input: Parameters<typeof omni.materialize>[0], output: unknown) => {
                if (!probe.removed) { rmSync(incarnationPath(root, "reddit-main")); probe.removed = true; }
                return omni.materialize(input, output);
              },
            },
          },
        };
      },
    };
    expect(() => rebuildOmniViewFromExactCache({
      schemaVersion: 1,
      sources: [{ adapterId: "reddit-web", operationId: "messaging.list", authId: "reddit-main", input: { folder: "inbox", limit: 25 } }],
      page: { limit: 1 },
    }, { environment, registry, now: new Date("2026-09-23T12:00:02.000Z") })).toThrow("omni source or auth identity changed while the local view was being observed");
    expect(probe.removed).toBeTrue();
    expect(probe.afterMaterialization).toBe(false);
  });
});

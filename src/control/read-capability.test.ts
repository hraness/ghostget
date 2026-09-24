import { afterEach, describe, expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { createAuth, listAuthSnapshots, loadAuthSnapshot, saveAuth } from "../auth";
import { canonicalJson } from "../canonical-json";
import type { GhostgetManifest } from "../model";
import { currentProcessStartIdentity } from "../process-identity";
import { describeOperationPermissions } from "../operation-permission";
import { providerPluginRegistry as registry } from "../provider-plugins";
import { authIncarnationReader, type AuthIncarnationReader } from "../read-projections";
import { installManifest } from "../storage";
import { assertProperty, fc } from "../test-support";
import { connectionAccountRevision, connectionAccountSnapshotRevisions, ensureConnectionAccountIncarnations } from "./account-revision";
import { ControlService } from "./service";

const roots: string[] = [];
const services: ControlService[] = [];
afterEach(() => {
  while (services.length > 0) services.pop()!.close();
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

/** Two accounts, one of them selectable for the installed X adapter's operation permissions. */
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ghostget-read-capability-"))); chmodSync(root, 0o700); roots.push(root);
  const environment = { GHOSTGET_STATE_HOME: root };
  const manifest = JSON.parse(readFileSync(join(import.meta.dir, "../assets/adapters/x/wrench-adapter.json"), "utf8")) as GhostgetManifest;
  installManifest(manifest, { force: false, environment, registry });
  saveAuth(createAuth("x-account", { source: "chrome", profile: "Default", subject: "67890" }), environment);
  saveAuth(createAuth("permission-account", { oauthProvider: "x", tokenFile: join(root, "token.json"), scopes: ["tweet.read", "users.read"], subject: "12345" }), environment);
  return { root, environment };
}

function service(environment: Readonly<Record<string, string>>): ControlService {
  const created = new ControlService(environment); services.push(created); return created;
}

function coordinate(authId: string): string {
  return createHash("sha256").update(`wrench-read-projection-auth-coordinate-v1\0${authId}`).digest("hex");
}

function controlPath(root: string, kind: "admissions" | "incarnations", authId: string): string {
  return join(root, "read-projection-control", kind, `${coordinate(authId)}.json`);
}

/** A claim whose owner booted differently is definitely dead, so any admission reclaims it. */
function plantDeadClaim(root: string, authId: string): string {
  const identity = currentProcessStartIdentity();
  const path = controlPath(root, "admissions", authId);
  mkdirSync(join(root, "read-projection-control", "admissions"), { recursive: true, mode: 0o700 });
  const claim = {
    schemaVersion: 1, authId,
    owner: { pid: process.pid, token: randomUUID(), bootId: identity.bootId === "f".repeat(64) ? "e".repeat(64) : "f".repeat(64), processStartId: identity.processStartId },
  };
  writeFileSync(path, `${canonicalJson(claim)}\n`, { mode: 0o600 });
  return path;
}

/** Names, bytes, and directory change times of the whole read-projection control tree. */
function fingerprint(root: string): readonly string[] {
  const base = join(root, "read-projection-control");
  const lines: string[] = [];
  const walk = (directory: string): void => {
    if (!existsSync(directory)) { lines.push(`${relative(base, directory)} absent`); return; }
    lines.push(`${relative(base, directory)}/ ${lstatSync(directory, { bigint: true }).mtimeNs}`);
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      if (lstatSync(path).isDirectory()) walk(path);
      else lines.push(`${relative(base, path)} ${createHash("sha256").update(readFileSync(path)).digest("hex")}`);
    }
  };
  walk(base);
  return lines;
}

describe("menu-bar snapshot read path", () => {
  test("writes no incarnation and reclaims no orphaned admission claim", () => {
    const { root, environment } = fixture();
    const control = service(environment);
    // A legacy account without an incarnation, and a crashed writer's claim.
    rmSync(controlPath(root, "incarnations", "x-account"));
    const orphan = plantDeadClaim(root, "permission-account");
    const before = fingerprint(root);
    control.snapshot(null);
    control.snapshot("x-account");
    control.snapshot("permission-account");
    expect(fingerprint(root)).toEqual(before);
    expect(existsSync(controlPath(root, "incarnations", "x-account"))).toBeFalse();
    expect(existsSync(orphan)).toBeTrue();
  });
});

describe("incarnation backfill moves to startup", () => {
  test("constructing the control service creates a legacy account's incarnation, and the snapshot then matches the admitted revision", () => {
    const { root, environment } = fixture();
    rmSync(controlPath(root, "incarnations", "x-account"));
    const control = service(environment);
    expect(existsSync(controlPath(root, "incarnations", "x-account"))).toBeTrue();
    const account = control.snapshot(null).accounts.find((item) => item.id === "x-account");
    expect(account?.revision).toBe(connectionAccountRevision(loadAuthSnapshot("x-account", environment), environment));
  });

  test("a listing revision without an incarnation fails closed until a write path creates one", () => {
    const { root, environment } = fixture();
    rmSync(controlPath(root, "incarnations", "x-account"));
    const reader = authIncarnationReader(environment);
    const snapshot = loadAuthSnapshot("x-account", environment);
    const listed = connectionAccountSnapshotRevisions([snapshot], reader).get("x-account");
    expect(existsSync(controlPath(root, "incarnations", "x-account"))).toBeFalse();
    // The admitted write-path revision creates the incarnation and never matches the null-bound listing value.
    const authoritative = connectionAccountRevision(snapshot, environment);
    expect(listed).not.toBe(authoritative);
    expect(connectionAccountSnapshotRevisions([snapshot], reader).get("x-account")).toBe(authoritative);
  });

  test("the backfill leaves existing incarnations unchanged and reports contended accounts", () => {
    const { root, environment } = fixture();
    const kept = readFileSync(controlPath(root, "incarnations", "permission-account"), "utf8");
    rmSync(controlPath(root, "incarnations", "x-account"));
    const orphan = plantDeadClaim(root, "x-account");
    writeFileSync(orphan, readFileSync(orphan, "utf8").replace(/"bootId":"[a-f0-9]{64}"/u, `"bootId":"${currentProcessStartIdentity().bootId}"`), { mode: 0o600 });
    // A claim owned by this live process is contention, so startup skips the account instead of failing.
    expect(ensureConnectionAccountIncarnations(environment)).toEqual(["x-account"]);
    expect(existsSync(controlPath(root, "incarnations", "x-account"))).toBeFalse();
    rmSync(orphan);
    expect(ensureConnectionAccountIncarnations(environment)).toEqual([]);
    expect(existsSync(controlPath(root, "incarnations", "x-account"))).toBeTrue();
    expect(readFileSync(controlPath(root, "incarnations", "permission-account"), "utf8")).toBe(kept);
  });
});

describe("read-path listing law", () => {
  test("for any set of legacy accounts and orphaned claims, listing revisions write nothing and match the admitted revision exactly when an incarnation exists", () => {
    const ids = ["a-account", "b-account", "c-account"] as const;
    // Account saves and admitted revisions are slow on a loaded host, so each
    // run lists a private copy of one saved state whose admitted revisions are
    // known.
    const base = realpathSync(mkdtempSync(join(tmpdir(), "ghostget-read-capability-base-"))); chmodSync(base, 0o700); roots.push(base);
    const baseEnvironment = { GHOSTGET_STATE_HOME: base };
    ids.forEach((id, index) => saveAuth(createAuth(id, { source: "chrome", profile: "Default", subject: `${index + 1}0000` }), baseEnvironment));
    const authoritative = new Map(listAuthSnapshots(baseEnvironment).map((snapshot) => [snapshot.auth.id, connectionAccountRevision(snapshot, baseEnvironment)] as const));
    assertProperty(fc.property(
      fc.subarray([...ids]),
      fc.subarray([...ids]),
      (legacy, orphaned) => {
        const root = realpathSync(mkdtempSync(join(tmpdir(), "ghostget-read-capability-law-"))); roots.push(root);
        cpSync(base, root, { recursive: true, preserveTimestamps: true });
        chmodSync(root, 0o700);
        const environment = { GHOSTGET_STATE_HOME: root };
        for (const id of legacy) rmSync(controlPath(root, "incarnations", id));
        for (const id of orphaned) plantDeadClaim(root, id);
        const listed = listAuthSnapshots(environment);
        const before = fingerprint(root);
        const revisions = connectionAccountSnapshotRevisions(listed, authIncarnationReader(environment));
        expect(fingerprint(root)).toEqual(before);
        for (const id of ids) {
          expect(revisions.get(id) === authoritative.get(id)).toBe(!legacy.includes(id));
        }
      },
    ), { numRuns: 8, interruptAfterTimeLimit: 150_000 });
  });
});

describe("read capability type", () => {
  test("a read-path port exposes only read members and cannot be forged or widened", () => {
    const { environment } = fixture();
    const reader = authIncarnationReader(environment);
    expect(Object.isFrozen(reader)).toBeTrue();
    expect(Object.keys(reader).sort()).toEqual(["identityHashIfPresent", "identityHashesIfPresent"]);
    const typeChecks = (port: AuthIncarnationReader): void => {
      // @ts-expect-error the read capability has no creating member.
      port.ensure("x-account");
      // @ts-expect-error the read capability has no creating identity hash.
      port.identityHash("x-account", "0".repeat(64));
      // @ts-expect-error an environment is writer authority, not a read capability.
      connectionAccountSnapshotRevisions([], environment);
      // @ts-expect-error the snapshot's permission read path requires the read capability.
      describeOperationPermissions([], { environment, registry });
      const forged = {
        identityHashIfPresent: () => null,
        identityHashesIfPresent: () => new Map<string, string>(),
      };
      // @ts-expect-error a structurally similar object without the brand is not a read capability.
      connectionAccountSnapshotRevisions([], forged);
    };
    void typeChecks;
  });
});

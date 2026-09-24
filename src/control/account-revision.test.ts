import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAuth, listAuthSnapshots, loadAuthSnapshot, removeAuth, saveAuth } from "../auth";
import { authIncarnationReader } from "../read-projections";
import { connectionAccountRevision, connectionAccountSnapshotRevisions } from "./account-revision";

const roots: string[] = [];
afterEach(() => { while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true }); });

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ghostget-account-revision-"))); chmodSync(root, 0o700); roots.push(root);
  return { GHOSTGET_STATE_HOME: root };
}

describe("account snapshot revisions", () => {
  test("the batched listing revision equals the admitted revision and follows content and lifetime", () => {
    const environment = fixture();
    const auth = createAuth("x-account", { source: "chrome", profile: "Default", subject: "67890" });
    const second = createAuth("y-account", { source: "chrome", profile: "Default", subject: "11111" });
    saveAuth(auth, environment); saveAuth(second, environment);
    const listed = listAuthSnapshots(environment);
    // Saving an account creates its incarnation, so the read-only listing
    // reproduces the admitted revision without taking an admission.
    const revisions = connectionAccountSnapshotRevisions(listed, authIncarnationReader(environment));
    for (const snapshot of listed) expect(revisions.get(snapshot.auth.id)).toBe(connectionAccountRevision(snapshot, environment));
    removeAuth(auth.id, environment); saveAuth(auth, environment);
    const rewritten = loadAuthSnapshot(auth.id, environment);
    const after = connectionAccountSnapshotRevisions([rewritten], authIncarnationReader(environment));
    expect(after.get(auth.id)).toBe(connectionAccountRevision(rewritten, environment));
    expect(after.get(auth.id)).not.toBe(revisions.get(auth.id));
  });
  test("a removed account's listing revision is rejected by the authoritative path", () => {
    const environment = fixture();
    const auth = createAuth("x-account", { source: "chrome", profile: "Default", subject: "67890" });
    saveAuth(auth, environment);
    const snapshot = loadAuthSnapshot(auth.id, environment);
    const before = connectionAccountSnapshotRevisions([snapshot], authIncarnationReader(environment));
    expect(before.get(auth.id)).toBe(connectionAccountRevision(snapshot, environment));
    removeAuth(auth.id, environment);
    // The listing value still binds the removed bytes; the admitted comparison
    // is what rejects it at mutation time.
    expect(() => connectionAccountRevision(snapshot, environment)).toThrow();
  });
});

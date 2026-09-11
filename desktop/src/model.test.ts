import { expect, test } from "bun:test";
import fc from "fast-check";
import type { ControlRequest, ControlResponse } from "../../src/control/protocol.ts";
import { PanelModel, initialQuery } from "./model.ts";
import { parseControlResponse } from "./response.ts";
import { activityPage, createPanelSession, definition, FIXTURE_NOW, makeRows, makeSnapshot, parseWorld, SCENES, sectionFor } from "../direct/definition.ts";

test("strict worlds and response envelopes reject ambiguity", () => {
  for (const scene of SCENES) expect(parseWorld({ version: 1, scene, rowCount: scene === "activity.history" ? 10000 : 24 }).scene).toBe(scene);
  expect(() => parseWorld({ version: 1, scene: "activity.history", rowCount: 9999 })).toThrow();
  expect(() => parseWorld({ version: 1, scene: "accounts.empty", rowCount: 24, hidden: true })).toThrow();
  expect(definition.activate("?__direct_scenario=unknown").ok).toBe(false);
  const snapshot: ControlResponse = { ok: true, data: { kind: "snapshot", snapshot: makeSnapshot("activity.history") } };
  expect(parseControlResponse(snapshot)).toEqual(snapshot);
  expect(() => parseControlResponse({ ...snapshot, secret: "unrecognized" })).toThrow();
  fc.assert(fc.property(fc.stringMatching(/^[a-zA-Z0-9 ._-]{0,200}$/u), message => { const value: ControlResponse = { ok: false, code: "CONTROL_UNAVAILABLE", message }; expect(parseControlResponse(JSON.parse(JSON.stringify(value)))).toEqual(value); expect(() => parseControlResponse({ ...value, unexpected: message })).toThrow(); }), { numRuns: 200 });
});
test("vault responses reject secret-bearing, malformed and disconnected metadata", () => {
  const snapshot = makeSnapshot("vault.connected"); const vault = snapshot.vault;
  const response = (value: unknown) => ({ ok: true, data: { kind: "snapshot", snapshot: { ...snapshot, vault: value } } });
  expect(SCENES).toHaveLength(10);
  for (const scene of SCENES) expect(parseControlResponse({ ok: true, data: { kind: "snapshot", snapshot: makeSnapshot(scene) } }).ok).toBe(true);
  for (const scene of ["vault.local", "vault.connected", "vault.cancelled"] as const) expect(sectionFor(scene)).toBe("vault");
  expect(snapshot.approvals[0]!.kind).toBe("credential");
  for (const malformed of [
    { ...vault, token: "must-not-cross" }, { ...vault, locked: "false" }, { ...vault, revision: -1 },
    { ...vault, items: [{ ...vault.items[0]!, secret: "must-not-cross" }] },
    { ...vault, items: [{ ...vault.items[0]!, source: { ...vault.items[0]!.source, secret: "must-not-cross" } }] },
    { ...vault, items: [vault.items[0]!, vault.items[0]!] }, { ...vault, connections: [] },
    { ...vault, pending: [{ id: vault.items[0]!.source.kind === "local" ? vault.items[0]!.source.keyId : "", purpose: "credential" }] },
    { ...vault, grants: [{ ...vault.grants[0]!, use: { ...vault.grants[0]!.use, authentication: "basic" } }] },
    { ...vault, grants: [{ ...vault.grants[0]!, use: { ...vault.grants[0]!.use, fields: ["/password"] } }] },
    { ...vault, grants: [{ ...vault.grants[0]!, use: { ...vault.grants[0]!.use, fields: ["/name", "/name"] } }] },
    { ...vault, grants: [{ ...vault.grants[0]!, use: { ...vault.grants[0]!.use, url: "https://api.example.com/profile?key=value" } }] },
    { ...vault, grants: [{ ...vault.grants[0]!, expiresAt: "2026-02-30T12:00:00.000Z" }] },
  ]) expect(() => parseControlResponse(response(malformed))).toThrow();
  const accessor = { ...vault }; Object.defineProperty(accessor, "locked", { enumerable: true, get() { throw new Error("Accessor must not run"); } });
  expect(() => parseControlResponse(response(accessor))).toThrow("Invalid control response");
});
test("Vault fixtures use the real command model for lock, synthetic entry, grants and revocation", async () => {
  const created = createPanelSession({ kind: "scenario", scenario: "vault.local" }); if (!created.ok) throw new Error("Fixture failed");
  const session = created.value; const model = session.harness.model;
  try {
    const original = model.getSnapshot().snapshot!.vault;
    expect(await model.command({ action: "vault.lock", locked: true, expectedRevision: original.revision })).toBe(true);
    expect(await model.command({ action: "vault.local.add", title: "Example token", kind: "token", username: null, expectedRevision: original.revision })).toBe(false);
    const locked = model.getSnapshot().snapshot!.vault;
    expect(await model.command({ action: "vault.local.add", title: "Example token", kind: "token", username: null, expectedRevision: locked.revision })).toBe(false);
    expect(await model.command({ action: "vault.lock", locked: false, expectedRevision: locked.revision })).toBe(true);
    expect(await model.command({ action: "vault.local.add", title: "Example token", kind: "token", username: null, expectedRevision: model.getSnapshot().snapshot!.vault.revision })).toBe(true);
    const added = model.getSnapshot().snapshot!.vault; const item = added.items.at(-1)!;
    expect(item.title).toBe("Example token"); expect(Object.keys(item)).toEqual(["id", "title", "kind", "username", "source", "createdAt"]);
    const grant = { id: "99999999-9999-4999-8999-999999999999", title: "Read fixture profile", itemId: item.id, decision: "ask" as const, expiresAt: new Date(FIXTURE_NOW + 86400000).toISOString(), use: { kind: "https-json" as const, url: "https://api.example.com/profile", authentication: "bearer" as const, fields: ["/profile/name"] } };
    expect(await model.command({ action: "vault.grant", grant, expectedRevision: added.revision })).toBe(true);
    expect(await model.command({ action: "vault.grant", grant: { ...grant, decision: "allow" }, expectedRevision: added.revision })).toBe(false);
    expect(model.getSnapshot().snapshot!.vault.grants.at(-1)!.decision).toBe("ask");
    expect(await model.command({ action: "vault.revoke", id: grant.id, expectedRevision: model.getSnapshot().snapshot!.vault.revision })).toBe(true);
    expect(model.getSnapshot().snapshot!.vault.grants.some(value => value.id === grant.id)).toBe(false);
    expect(await model.command({ action: "vault.remove", id: item.id, kind: "item", expectedRevision: model.getSnapshot().snapshot!.vault.revision })).toBe(true);
    expect(model.getSnapshot().snapshot!.vault.items).toHaveLength(original.items.length);
    const probe = session.probe.snapshot(); expect(probe.ok).toBe(true); if (probe.ok) expect(probe.value.isQuiescent).toBe(true);
  } finally { session.dispose(); expect(session.disposalErrors()).toEqual([]); }
});
test("1Password fixture linking and disconnect preserve local items; cancellation grants no authority", async () => {
  const created = createPanelSession({ kind: "scenario", scenario: "vault.connected" }); if (!created.ok) throw new Error("Fixture failed");
  const model = created.value.harness.model;
  try {
    const vault = model.getSnapshot().snapshot!.vault;
    expect(await model.command({ action: "vault.connect", title: "Second vault", vaultId: "c".repeat(26), access: "dedicated-vault-read-only", expectedRevision: vault.revision })).toBe(true);
    const connected = model.getSnapshot().snapshot!.vault;
    const connection = connected.connections.at(-1)!;
    expect(await model.command({ action: "vault.link", title: "Linked field", kind: "token", username: null, connectionId: connection.id, itemId: "d".repeat(26), fieldId: "credential", expectedRevision: connected.revision })).toBe(true);
    expect(model.getSnapshot().snapshot!.vault.items.at(-1)!.source.kind).toBe("1password");
    expect(await model.command({ action: "vault.remove", id: connection.id, kind: "connection", expectedRevision: model.getSnapshot().snapshot!.vault.revision })).toBe(true);
    expect(model.getSnapshot().snapshot!.vault.items).toEqual(vault.items);
  } finally { created.value.dispose(); expect(created.value.disposalErrors()).toEqual([]); }
  const cancelled = createPanelSession({ kind: "scenario", scenario: "vault.cancelled" }); if (!cancelled.ok) throw new Error("Fixture failed");
  try {
    const model = cancelled.value.harness.model; const original = model.getSnapshot().snapshot!.vault;
    expect(await model.command({ action: "vault.local.add", title: "Cancelled entry", kind: "password", username: "river", expectedRevision: original.revision })).toBe(false);
    expect(model.getSnapshot().snapshot!.vault).toEqual(original);
    expect(await model.command({ action: "vault.cleanup", expectedRevision: original.revision })).toBe(true);
    expect(model.getSnapshot().snapshot!.vault.pending).toEqual([]); expect(model.getSnapshot().snapshot!.vault.grants).toEqual([]);
  } finally { cancelled.value.dispose(); expect(cancelled.value.disposalErrors()).toEqual([]); }
});
test("keyset traversal has no duplicates and ignores inserts above its snapshot", () => {
  const rows = makeRows(10000);
  for (const order of ["newest", "oldest"] as const) {
    let page = activityPage(rows, { ...initialQuery, order }); const ids = page.rows.map(row => row.id); const upper = page.snapshotSequence;
    const inserted = { ...rows[0]!, id: "later", sequence: 10001 };
    while (page.nextCursor) { page = activityPage([...rows, inserted], { ...initialQuery, order, cursor: page.nextCursor }); expect(page.snapshotSequence).toBe(upper); ids.push(...page.rows.map(row => row.id)); }
    expect(ids.length).toBe(10000); expect(new Set(ids).size).toBe(10000); expect(ids).not.toContain("later");
  }
  fc.assert(fc.property(fc.integer({ min: 1, max: 100 }), limit => { const page = activityPage(rows, { ...initialQuery, limit, search: "installation" }); expect(page.rows.length).toBeLessThanOrEqual(limit); expect(page.rows.every(row => row.endpoint?.includes("installation"))).toBe(true); }), { numRuns: 30 });
});
test("late pages cannot cross a changed query, even if its adapter ignores abort", async () => {
  const pending: ((response: ControlResponse) => void)[] = [];
  const model = new PanelModel({ request: () => new Promise(resolve => pending.push(resolve)) });
  model.setQuery({ ...initialQuery, search: "old" }); model.setQuery({ ...initialQuery, search: "new" });
  pending[1]!({ ok: true, data: { kind: "activity", page: { rows: [], nextCursor: null, snapshotSequence: 2, matchingCount: 0, newerCount: 0 } } });
  await Promise.resolve(); pending[0]!({ ok: true, data: { kind: "activity", page: { rows: makeRows(1), nextCursor: null, snapshotSequence: 1, matchingCount: 1, newerCount: 0 } } }); await Promise.resolve();
  expect(model.getSnapshot().activity.query.search).toBe("new"); expect(model.getSnapshot().activity.rows).toHaveLength(0); expect(model.getSnapshot().activity.snapshotSequence).toBe(2); model.dispose();
});
test("approval polling is bounded and replaces only transient approval state", async () => {
  const snapshot = makeSnapshot("activity.history");
  const approvals = makeSnapshot("approvals.pending").approvals;
  const requests: { request: ControlRequest; resolve: (response: ControlResponse) => void }[] = [];
  const model = new PanelModel({ request: request => new Promise(resolve => requests.push({ request, resolve })) }, { snapshot });
  const poll = model.refreshApprovals(); await model.refreshApprovals();
  expect(requests.map(value => value.request)).toEqual([{ action: "approval.list" }]);
  const response: ControlResponse = { ok: true, data: { kind: "approvals", approvals } };
  expect(parseControlResponse(response)).toEqual(response);
  const largest = { ...approvals[0]!, preview: "a".repeat(240 * 1024) };
  expect(parseControlResponse({ ok: true, data: { kind: "approvals", approvals: [largest] } }).ok).toBe(true);
  expect(() => parseControlResponse({ ok: true, data: { kind: "approvals", approvals: [{ ...largest, preview: `${largest.preview}a` }] } })).toThrow();
  expect(() => parseControlResponse({ ok: true, data: { kind: "approvals", approvals: [...approvals, ...approvals] } })).toThrow();
  expect(() => parseControlResponse({ ok: true, data: { kind: "approvals", approvals, extra: true } })).toThrow();
  requests[0]!.resolve(response); await poll;
  expect(model.getSnapshot().snapshot!.approvals).toEqual(approvals);
  expect(model.getSnapshot().snapshot!.accounts).toBe(snapshot.accounts);
  expect(model.getSnapshot().snapshot!.capabilities).toBe(snapshot.capabilities);
  expect(model.getSnapshot().loading).toBe(false); model.dispose();
});
test("late approval replies cannot restore requests or errors across newer UI state", async () => {
  await fc.assert(fc.asyncProperty(fc.constantFrom("refresh", "command", "dispose"), fc.boolean(), fc.boolean(), async (transition, replyFirst, failedPoll) => {
    const snapshot = { ...makeSnapshot("activity.history"), approvals: [] };
    const requests: { request: ControlRequest; signal: AbortSignal | undefined; resolve: (response: ControlResponse) => void }[] = [];
    // This adapter deliberately ignores cancellation; generations must still fence it.
    const model = new PanelModel({ request: (request, signal) => new Promise(resolve => requests.push({ request, signal, resolve })) }, { snapshot });
    const poll = model.refreshApprovals();
    const late: ControlResponse = failedPoll ? { ok: false, code: "STALE", message: "Old poll failed" } : { ok: true, data: { kind: "approvals", approvals: makeSnapshot("approvals.pending").approvals } };
    let newer: Promise<unknown>;
    if (transition === "dispose") { model.dispose(); newer = Promise.resolve(); }
    else if (transition === "refresh") newer = model.refresh();
    else {
      newer = model.command({ action: "approval.decide", id: "reviewed", digest: "a".repeat(64), decision: "deny" });
      requests[1]!.resolve({ ok: true, data: { kind: "success", message: "Denied" } });
      await Promise.resolve();
    }
    expect(requests[0]!.signal!.aborted).toBe(true);
    if (replyFirst) { requests[0]!.resolve(late); await poll; }
    if (transition !== "dispose") {
      const fresh = requests.find(value => value.request.action === "snapshot")!;
      fresh.resolve({ ok: true, data: { kind: "snapshot", snapshot } });
    }
    await newer;
    if (!replyFirst) { requests[0]!.resolve(late); await poll; }
    expect(model.getSnapshot().snapshot!.approvals).toEqual([]);
    expect(model.getSnapshot().error).toBeNull();
    model.dispose();
  }), { numRuns: 36 });
});
test("cancelled operations settle Direct activity and sessions dispose cleanly", async () => {
  const result = createPanelSession({ kind: "scenario", scenario: "activity.history" }); expect(result.ok).toBe(true); if (!result.ok) return;
  const session = result.value; const abort = new AbortController(); const request = session.harness.port.request({ action: "activity.query", query: initialQuery }, abort.signal); abort.abort(); await expect(request).rejects.toThrow();
  const probe = session.probe.snapshot(); expect(probe.ok).toBe(true); if (probe.ok) { expect(probe.value.isQuiescent).toBe(true); expect(probe.value.activity.active).toBe(0); }
  session.harness.failNextActivity(); await session.harness.model.loadActivity(false); expect(session.harness.model.getSnapshot().activity.error).not.toBeNull(); await session.harness.model.loadActivity(false); expect(session.harness.model.getSnapshot().activity.rows).toHaveLength(100);
  session.dispose(); expect(session.disposalErrors()).toHaveLength(0); expect(session.isDisposed()).toBe(true);
});
test("permission state stays bound to the displayed capability and revision", async () => {
  const result = createPanelSession({ kind: "scenario", scenario: "capabilities.policy" }); if (!result.ok) throw new Error("Fixture failed");
  const { model } = result.value.harness; const snapshot = model.getSnapshot().snapshot!; const capability = snapshot.capabilities[0]!;
  expect(await model.command({ action: "permission.set", adapterId: capability.adapterId, operationId: capability.operationId, accountId: null, decision: "deny", expectedRevision: snapshot.policy.revision, expectedCapabilityDigest: "stale" })).toBe(false);
  expect(model.getSnapshot().snapshot!.capabilities[0]!.permission).toBe("allow"); result.value.dispose();
});
test("a compound interface remains activatable after its first adapter", async () => {
  const created = createPanelSession({ kind: "scenario", scenario: "integrations.community" }); if (!created.ok) throw new Error("Fixture failed");
  const model = created.value.harness.model; const first = model.getSnapshot().snapshot!.interfaces[0]!;
  expect(first.activationTargets).toHaveLength(2);
  await model.command({ action: "interface.activate", id: first.id, digest: first.digest, adapterId: first.activationTargets[0]!.adapterId, expectedInstalledDigest: null });
  const partial = model.getSnapshot().snapshot!.interfaces[0]!;
  expect(partial.activeDigest).toBe(partial.digest); expect(partial.state).toBe("draft");
  expect(await model.command({ action: "interface.activate", id: partial.id, digest: partial.digest, adapterId: partial.activationTargets[1]!.adapterId, expectedInstalledDigest: partial.activationTargets[1]!.installedDigest })).toBe(true);
  expect(model.getSnapshot().snapshot!.interfaces[0]!.state).toBe("active"); created.value.dispose();
});
test("browser locator reconnect requires the displayed revision and replaces its account", async () => {
  const created = createPanelSession({ kind: "scenario", scenario: "accounts.reconnect" }); if (!created.ok) throw new Error("Fixture failed");
  const model = created.value.harness.model; const account = model.getSnapshot().snapshot!.accounts[0]!;
  expect(account.provider).toBeNull(); expect(account.kind).toBe("cookie-source");
  const request = { action: "connection.begin", id: account.id, provider: "github", browser: "chrome", profile: null } as const;
  expect(await model.command({ ...request, expectedRevision: null })).toBe(false);
  expect(await model.command({ ...request, expectedRevision: account.revision })).toBe(true);
  const attemptId = model.getSnapshot().connection!.attemptId;
  expect(await model.command({ action: "connection.verify", attemptId })).toBe(true);
  expect(await model.command({ action: "connection.commit", attemptId, expectedSubject: "river-stone" })).toBe(true);
  expect(model.getSnapshot().snapshot!.accounts.filter(row => row.id === account.id)).toHaveLength(1);
  expect(model.getSnapshot().snapshot!.accounts.find(row => row.id === account.id)!.revision).not.toBe(account.revision);
  created.value.dispose();
});
test("cancel and commit cannot cross, while pending verification stays cancellable", async () => {
  async function flow(heldAction: "connection.cancel" | "connection.commit" | "connection.verify") {
    const actions: string[] = []; let settle!: (response: ControlResponse) => void;
    const held = new Promise<ControlResponse>(resolve => { settle = resolve; });
    const model = new PanelModel({ async request(request) {
      actions.push(request.action);
      if (request.action === heldAction) return held;
      if (request.action === "snapshot") return { ok: true, data: { kind: "snapshot", snapshot: makeSnapshot("accounts.empty") } };
      if (request.action === "connection.begin" || request.action === "connection.verify") return { ok: true, data: { kind: "connection", attemptId: "held-attempt", status: request.action === "connection.begin" ? "awaiting-sign-in" : "verified", subject: request.action === "connection.begin" ? null : "river-stone" } };
      return { ok: true, data: { kind: "success", message: "Saved." } };
    } });
    await model.command({ action: "connection.begin", id: "personal", provider: "github", browser: "chrome", profile: null, expectedRevision: null });
    if (heldAction !== "connection.verify") await model.command({ action: "connection.verify", attemptId: "held-attempt" });
    return { model, actions, settle };
  }
  const cancelling = await flow("connection.cancel"); const cancel = cancelling.model.cancelConnection();
  expect(cancelling.model.getSnapshot().cancellingConnection).toBe(true);
  expect(await cancelling.model.command({ action: "connection.commit", attemptId: "held-attempt", expectedSubject: "river-stone" })).toBe(false);
  expect(cancelling.actions).not.toContain("connection.commit");
  cancelling.settle({ ok: true, data: { kind: "success", message: "Cancelled." } }); await cancel;
  expect(cancelling.model.getSnapshot().connection).toBeNull(); cancelling.model.dispose();
  const committing = await flow("connection.commit"); const commit = committing.model.command({ action: "connection.commit", attemptId: "held-attempt", expectedSubject: "river-stone" });
  await committing.model.cancelConnection(); expect(committing.actions).not.toContain("connection.cancel");
  committing.settle({ ok: true, data: { kind: "success", message: "Saved." } }); expect(await commit).toBe(true);
  expect(committing.model.getSnapshot().notice).toBe("Saved."); committing.model.dispose();
  const verifying = await flow("connection.verify"); const verify = verifying.model.command({ action: "connection.verify", attemptId: "held-attempt" });
  await verifying.model.cancelConnection(); expect(verifying.actions).toContain("connection.cancel");
  verifying.settle({ ok: true, data: { kind: "connection", attemptId: "held-attempt", status: "verified", subject: "river-stone" } }); expect(await verify).toBe(false);
  expect(verifying.model.getSnapshot().connection).toBeNull(); expect(verifying.model.getSnapshot().busy).toBe(false); verifying.model.dispose();
});

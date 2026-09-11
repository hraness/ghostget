import { defineDirect, type JsonValue } from "@hraness/direct";
import { createDirectSession, type DirectSessionActivation, type DirectSessionContext } from "@hraness/direct/testing";
import type { ActivityPage, ActivityQuery, ActivityRow, ControlPanelPort, ControlRequest, ControlResponse, ControlSection, ControlSnapshot } from "../../src/control/protocol.ts";
import type { VaultView } from "../../src/control/vault-model.ts";
import { PanelModel } from "../src/model.ts";
import { GHOSTGET_VERSION } from "../../src/version.ts";
import { parseControlResponse } from "../src/response.ts";

export const FIXTURE_NOW = Date.parse("2026-09-11T12:00:00Z");
export const SCENES = ["accounts.empty", "accounts.reconnect", "capabilities.policy", "integrations.community", "approvals.pending", "vault.cancelled", "backend.failure", "activity.history", "vault.local", "vault.connected"] as const;
export type Scene = typeof SCENES[number];
export interface PanelWorld { readonly [key: string]: JsonValue; readonly version: 1; readonly scene: Scene; readonly rowCount: number }
export function parseWorld(input: unknown): PanelWorld {
  if (input === null || typeof input !== "object" || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) throw new Error("Expected a control panel world");
  const d = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(input).length !== 3 || !["version", "scene", "rowCount"].every(key => d[key] && "value" in d[key]! && d[key]!.enumerable)) throw new Error("Unexpected world fields");
  const scene: unknown = d.scene!.value; const rowCount: unknown = d.rowCount!.value;
  if (d.version!.value !== 1 || typeof scene !== "string" || !SCENES.includes(scene as Scene) || !Number.isInteger(rowCount) || typeof rowCount !== "number" || rowCount < 0 || rowCount > 10000 || (scene === "activity.history" ? rowCount !== 10000 : rowCount !== 24)) throw new Error("Invalid control panel world");
  return Object.freeze({ version: 1, scene: scene as Scene, rowCount });
}
export const sectionFor = (scene: Scene): ControlSection => scene.startsWith("vault") ? "vault" : scene.startsWith("accounts") || scene.startsWith("backend") ? "accounts" : scene.startsWith("capabilities") ? "capabilities" : scene.startsWith("integrations") ? "integrations" : scene.startsWith("approvals") ? "approvals" : "activity";
export const definition = defineDirect({ parseWorld, defaultScenario: "activity.history", scenarios: SCENES.map(scene => ({ id: scene, title: scene.replaceAll(".", " · "), route: sectionFor(scene), world: { version: 1, scene, rowCount: scene === "activity.history" ? 10000 : 24 } satisfies PanelWorld, runtime: { schema: "direct.runtime/v1" as const, nowMs: FIXTURE_NOW, nextOperation: 1, acceleration: 1 } })), coverage: [
  { key: "panel.real-screens", mode: "fixture", claim: "Shared React screens and UI state render and handle account, vault metadata, permission, integration, approval, setup and failure states through a deterministic control port. No live IO is performed.", scenarios: [...SCENES] },
  { key: "panel.vault", mode: "fixture", claim: "The real Vault screen manages synthetic local items, optional 1Password links, exact access grants, lock state, cancellation and pending cleanup. Native secure entry and credential use require separate native acceptance.", scenarios: ["vault.local", "vault.connected", "vault.cancelled"] },
  { key: "panel.activity", mode: "fixture", claim: "The real activity screen filters and traverses ten thousand deterministic metadata rows through asynchronous snapshot-bound keyset pages with a bounded DOM window.", scenarios: ["activity.history"] },
  { key: "panel.native-control", mode: "direct", claim: "Packaged Tauri IPC, exact helper resources, private filesystem and real provider/credential behavior require separate native acceptance.", scenarios: [] },
] });

const fixtureId = (index: number): string => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
export function makeVault(scene: Scene): VaultView {
  const createdAt = new Date(FIXTURE_NOW - 86400000).toISOString();
  const local = scene === "vault.local" || scene === "vault.connected";
  return {
    schema: 1, revision: 3, available: true, storage: "macos-keychain", locked: !scene.startsWith("vault"),
    connections: scene === "vault.connected" ? [{ id: fixtureId(5), title: "Research vault", vaultId: "a".repeat(26), keyId: fixtureId(6), access: "dedicated-vault-read-only", createdAt }] : [],
    items: local ? [
      { id: fixtureId(1), title: "Reading service", kind: "token", username: null, source: { kind: "local", keyId: fixtureId(2) }, createdAt },
      { id: fixtureId(3), title: "Research account", kind: "password", username: "river", source: { kind: "local", keyId: fixtureId(4) }, createdAt },
      ...(scene === "vault.connected" ? [{ id: fixtureId(7), title: "Archive token", kind: "token" as const, username: null, source: { kind: "1password" as const, connectionId: fixtureId(5), vaultId: "a".repeat(26), itemId: "b".repeat(26), fieldId: "credential" }, createdAt }] : []),
    ] : [],
    grants: local ? [{ id: fixtureId(8), title: "Read profile", itemId: fixtureId(1), decision: "ask", expiresAt: new Date(FIXTURE_NOW + 86400000).toISOString(), use: { kind: "https-json", url: "https://api.example.com/profile", authentication: "bearer", fields: ["/profile/name", "/profile/status"] } }] : [],
    pending: scene === "vault.cancelled" ? [{ id: fixtureId(9), purpose: "credential" }, { id: fixtureId(10), purpose: "1password-bootstrap" }] : [],
  };
}

export function makeSnapshot(scene: Scene): ControlSnapshot {
  const snapshot: ControlSnapshot = {
    version: GHOSTGET_VERSION, accountId: null,
    accounts: scene === "accounts.empty" ? [] : [
      { id: "personal", provider: scene === "accounts.reconnect" ? null : "github", kind: "cookie-source", subject: "river-stone", revision: "fictional-account-1", status: scene === "accounts.reconnect" ? "reconnect-required" : "verified", source: "Chrome · Default", tokenStorage: null },
      { id: "writing", provider: "x", kind: "oauth", subject: "@river_notes", revision: "fictional-account-2", status: "configured", source: "Imported token", tokenStorage: "ghostget-import" },
    ],
    capabilities: [
      ["github-web", "read-repository", "allow", "read", "bundled"], ["github-web", "list-issues", "allow", "read", "bundled"], ["github-web", "create-issue", "ask", "write", "bundled"], ["x-official", "read-profile", "allow", "read", "bundled"], ["x-official", "publish-post", "ask", "write", "bundled"], ["x-official", "delete-post", "deny", "delete", "bundled"], ["research-library", "list-notes", "deny", "read", "user"],
    ].map(([adapterId, operationId, permission, effect, interfaceSource], index) => ({ digest: `fictional-capability-${index}`, adapterId: adapterId!, operationId: operationId!, pluginId: adapterId!, surface: "semantic", transport: "https", risk: effect === "read" ? "read" : "write", effect: effect!, state: "available", executorSource: "built-in", interfaceSource: interfaceSource as "bundled" | "user", permission: permission as "allow" | "ask" | "deny" })),
    interfaces: scene === "integrations.community" ? [
      { id: "research-notes", title: "Research notes", source: "user", digest: "fictional-interface-1", activeDigest: null, state: "draft", operationCount: 2, adapterIds: ["research-library", "research-archive"], activationTargets: [{ adapterId: "research-library", installedDigest: null }, { adapterId: "research-archive", installedDigest: null }], issues: [] },
      { id: "reading-list", title: "Community reading list", source: "imported", digest: "fictional-interface-2", activeDigest: null, state: "needs-executor", operationCount: 3, adapterIds: [], activationTargets: [], issues: ["This interface needs a supported executor before activation."] },
    ] : [],
    policy: { managed: true, revision: 2 }, web: { revision: 1, gatewayOnly: true, rules: [{ id: "docs", origin: "https://docs.example.com", path: { kind: "prefix", value: "/reference/" }, methods: ["GET"], queryKeys: ["language"], decision: "allow", effect: "retrieval", maxResponseBytes: 1048576, timeoutMs: 15000 }] },
    approvals: scene === "approvals.pending" ? [{ id: "fictional-approval-1", digest: "fictional-approval-digest", kind: "provider", title: "Publish a post", account: "writing", effect: "write", preview: "Account: @river_notes\nOperation: publish-post\nText: A small update from today's research.", expiresAt: new Date(FIXTURE_NOW + 300000).toISOString() }] : scene === "vault.connected" ? [{ id: "fictional-credential-approval", digest: "fictional-credential-digest", kind: "credential", title: "Read profile", account: "Reading service", effect: "retrieval", preview: "Item: Reading service\nGET https://api.example.com/profile\nAuthentication: Bearer (secret kept private)\nReturned fields: /profile/name, /profile/status", expiresAt: new Date(FIXTURE_NOW + 120000).toISOString() }] : [],
    connectionProviders: [{ id: "github", title: "GitHub" }, { id: "x", title: "X" }, { id: "linkedin", title: "LinkedIn" }], vault: makeVault(scene),
  };
  parseControlResponse({ ok: true, data: { kind: "snapshot", snapshot } }); return snapshot;
}
export function makeRows(count: number): ActivityRow[] {
  return Array.from({ length: count }, (_, index) => { const sequence = index + 1; const denied = sequence % 11 === 0; return { id: `request-${sequence}`, sequence, startedAt: new Date(FIXTURE_NOW - (count - sequence) * 18000).toISOString(), finishedAt: new Date(FIXTURE_NOW - (count - sequence) * 18000 + 124).toISOString(), durationMs: denied ? 0 : 124 + sequence % 300, method: sequence % 5 === 0 ? "HEAD" : "GET", origin: sequence % 3 === 0 ? "https://api.example.org" : "https://docs.example.com", endpoint: sequence % 3 === 0 ? "/articles" : `/reference/${["installation", "accounts", "permissions", "integrations"][sequence % 4]}`, ruleId: denied ? null : "docs", decision: denied ? "deny" : "allow", outcome: denied ? "denied" : "succeeded", httpStatus: denied ? null : 200, responseBytes: denied ? 0 : 1200 + sequence, errorCode: denied ? "rule-denied" : null }; });
}
const failure = (message: string): ControlResponse => ({ ok: false, code: "fixture-declared-failure", message });
export function activityPage(rows: readonly ActivityRow[], query: ActivityQuery): ActivityPage {
  const fingerprint = JSON.stringify({ ...query, cursor: null }); let upper = Math.max(0, ...rows.map(row => row.sequence)); let last: number | null = null;
  if (query.cursor) {
    const value: unknown = JSON.parse(atob(query.cursor));
    if (!Array.isArray(value) || value.length !== 3 || value[0] !== fingerprint || !Number.isSafeInteger(value[1]) || !Number.isSafeInteger(value[2])) throw new Error("Invalid fixture cursor");
    upper = value[1] as number; last = value[2] as number;
  }
  const matched = rows.filter(row => row.sequence <= upper && (query.method === "all" || row.method === query.method) && (query.outcome === "all" || row.outcome === query.outcome) && (!query.origin || row.origin === query.origin) && (!query.since || row.startedAt >= query.since) && `${row.origin} ${row.endpoint} ${row.outcome} ${row.method}`.toLowerCase().includes(query.search.toLowerCase())).sort((a, b) => query.order === "newest" ? b.sequence - a.sequence : a.sequence - b.sequence);
  const remaining = matched.filter(row => last === null || (query.order === "newest" ? row.sequence < last : row.sequence > last));
  const page = remaining.slice(0, Math.min(100, query.limit));
  return { rows: page, snapshotSequence: upper, matchingCount: matched.length, newerCount: rows.filter(row => row.sequence > upper).length, nextCursor: remaining.length > page.length ? btoa(JSON.stringify([fingerprint, upper, page.at(-1)!.sequence])) : null };
}
function createHarness(context: DirectSessionContext<PanelWorld, ControlSection>) {
  let snapshot = makeSnapshot(context.world.scene); const activated = new Set<string>(); const rows = makeRows(context.world.rowCount); let violations = 0; let failNextActivity = false; let attempt: { id: string; provider: string; verified: boolean } | null = null;
  let nextVaultId = 20;
  const success = (message: string): ControlResponse => ({ ok: true, data: { kind: "success", message } });
  const vaultChange = (patch: Partial<VaultView>, message: string): ControlResponse => {
    const next = { ...snapshot, vault: { ...snapshot.vault, ...patch, revision: snapshot.vault.revision + 1 } };
    try { parseControlResponse({ ok: true, data: { kind: "snapshot", snapshot: next } }); } catch { return failure("Review the vault metadata and exact access settings before saving."); }
    snapshot = next; return success(message);
  };
  const dispatch = (request: ControlRequest): ControlResponse => {
    if (request.action.startsWith("vault.") && request.action !== "vault.import") {
      if (!("expectedRevision" in request) || request.expectedRevision !== snapshot.vault.revision) return failure("The vault changed. Refresh before trying again.");
      if (snapshot.vault.locked && ["vault.local.add", "vault.connect", "vault.link", "vault.grant"].includes(request.action)) return failure("Unlock the vault before changing credential access.");
    }
    switch (request.action) {
      case "snapshot": return context.world.scene === "backend.failure" ? failure("The control service is unavailable. Restart Ghostget and try again.") : { ok: true, data: { kind: "snapshot", snapshot: { ...snapshot, accountId: request.accountId } } };
      case "activity.query": if (failNextActivity) { failNextActivity = false; return failure("Activity could not load. Retry this page."); } return { ok: true, data: { kind: "activity", page: activityPage(rows, request.query) } };
      case "permission.enable": if (request.expectedRevision !== snapshot.policy.revision) return failure("Permissions changed. Refresh before saving."); snapshot = { ...snapshot, policy: { managed: true, revision: snapshot.policy.revision + 1 } }; return success("Permissions enabled.");
      case "permission.set": { const target = snapshot.capabilities.find(row => row.adapterId === request.adapterId && row.operationId === request.operationId); if (!target || target.digest !== request.expectedCapabilityDigest || request.expectedRevision !== snapshot.policy.revision) return failure("This capability changed. Refresh before saving."); snapshot = { ...snapshot, capabilities: snapshot.capabilities.map(row => row === target ? { ...row, permission: request.decision } : row), policy: { ...snapshot.policy, revision: snapshot.policy.revision + 1 } }; return success("Permission saved."); }
      case "approval.list": return { ok: true, data: { kind: "approvals", approvals: snapshot.approvals.filter(row => Date.parse(row.expiresAt) > context.clock.now()) } };
      case "approval.decide": { const target = snapshot.approvals.find(row => row.id === request.id && row.digest === request.digest); if (!target || Date.parse(target.expiresAt) <= context.clock.now()) return failure("This approval expired or changed. Refresh the list."); snapshot = { ...snapshot, approvals: snapshot.approvals.filter(row => row !== target) }; return success(request.decision === "allow-once" ? "The exact action was allowed once." : "The request was denied."); }
      case "web.save": if (request.expectedRevision !== snapshot.web.revision || new Set(request.rules.map(rule => rule.id)).size !== request.rules.length) return failure("Web rules changed or contain duplicate names. Review and retry."); snapshot = { ...snapshot, web: { revision: snapshot.web.revision + 1, gatewayOnly: request.gatewayOnly, rules: request.rules } }; return success("Web access saved.");
      case "interface.save": return failure("This fixture covers interface review. Use the kernel gate to verify document parsing and storage.");
      case "interface.activate": { const target = snapshot.interfaces.find(row => row.id === request.id && row.digest === request.digest && row.activationTargets.some(value => value.adapterId === request.adapterId && value.installedDigest === request.expectedInstalledDigest)); if (!target) return failure("This interface changed. Refresh before activating."); activated.add(`${target.id}/${request.adapterId}`); const complete = target.adapterIds.every(id => activated.has(`${target.id}/${id}`)); snapshot = { ...snapshot, interfaces: snapshot.interfaces.map(row => row === target ? { ...row, state: complete ? "active" : "draft", activeDigest: row.digest, activationTargets: row.activationTargets.map(item => item.adapterId === request.adapterId ? { ...item, installedDigest: `fictional-installed-${request.adapterId}` } : item) } : row) }; return success("Interface activated."); }
      case "interface.export": return { ok: true, data: { kind: "document", filename: "ghostget-openapi.json", text: JSON.stringify({ openapi: "3.1.0", info: { title: "Fictional Ghostget example", version: "1" }, paths: {} }, null, 2) } };
      case "connection.begin": { const existing = snapshot.accounts.find(row => row.id === request.id); if ((existing?.revision ?? null) !== request.expectedRevision || !snapshot.connectionProviders.some(row => row.id === request.provider)) return failure("The connection changed or needs a provider. Review and retry."); attempt = { id: request.id, provider: request.provider, verified: false }; return { ok: true, data: { kind: "connection", attemptId: "fictional-attempt", status: "awaiting-sign-in", subject: null } }; }
      case "connection.verify": if (!attempt) return failure("Connection was cancelled."); attempt.verified = true; return { ok: true, data: { kind: "connection", attemptId: "fictional-attempt", status: "verified", subject: "river-stone" } };
      case "connection.commit": if (!attempt?.verified || request.expectedSubject !== "river-stone") return failure("Verify this exact account first."); snapshot = { ...snapshot, accounts: [...snapshot.accounts.filter(row => row.id !== attempt!.id), { id: attempt.id, provider: null, kind: "cookie-source", subject: request.expectedSubject, revision: "fictional-saved", status: "verified", source: "Chrome", tokenStorage: null }] }; attempt = null; return success("Connection saved.");
      case "connection.cancel": attempt = null; return success("Connection cancelled.");
      case "connection.disconnect": snapshot = { ...snapshot, accounts: snapshot.accounts.filter(row => row.id !== request.id || row.revision !== request.expectedRevision) }; return success("Connection disconnected.");
      case "vault.import": return failure("Use the Vault screen to manage credentials.");
      case "vault.lock": return vaultChange({ locked: request.locked }, request.locked ? "Vault locked." : "Vault unlocked.");
      case "vault.local.add": {
        if (context.world.scene === "vault.cancelled") return failure("Secure entry was cancelled. No item was added.");
        return vaultChange({ items: [...snapshot.vault.items, { id: fixtureId(nextVaultId++), title: request.title, kind: request.kind, username: request.username, source: { kind: "local", keyId: fixtureId(nextVaultId++) }, createdAt: new Date(context.clock.now()).toISOString() }] }, "Local item added. Secret entry is simulated in this fixture.");
      }
      case "vault.connect": {
        if (context.world.scene === "vault.cancelled") return failure("Service-account entry was cancelled. No connection was added.");
        return vaultChange({ connections: [...snapshot.vault.connections, { id: fixtureId(nextVaultId++), title: request.title, vaultId: request.vaultId, keyId: fixtureId(nextVaultId++), access: request.access, createdAt: new Date(context.clock.now()).toISOString() }] }, "1Password connection added. Service-account entry is simulated in this fixture.");
      }
      case "vault.link": {
        const connection = snapshot.vault.connections.find(value => value.id === request.connectionId); if (!connection) return failure("Choose a connected 1Password vault.");
        return vaultChange({ items: [...snapshot.vault.items, { id: fixtureId(nextVaultId++), title: request.title, kind: request.kind, username: request.username, source: { kind: "1password", connectionId: connection.id, vaultId: connection.vaultId, itemId: request.itemId, fieldId: request.fieldId }, createdAt: new Date(context.clock.now()).toISOString() }] }, "1Password item linked. No access has been granted.");
      }
      case "vault.grant": {
        if (Date.parse(request.grant.expiresAt) <= context.clock.now() || Date.parse(request.grant.expiresAt) > context.clock.now() + 30 * 86400000) return failure("Choose an expiry within the next 30 days.");
        return vaultChange({ grants: [...snapshot.vault.grants.filter(value => value.id !== request.grant.id), request.grant] }, "Access grant saved. Matching Web access rules still apply.");
      }
      case "vault.revoke": return vaultChange({ grants: snapshot.vault.grants.filter(value => value.id !== request.id) }, "Access grant revoked.");
      case "vault.remove": {
        const items = snapshot.vault.items.filter(item => request.kind === "item" ? item.id !== request.id : item.source.kind !== "1password" || item.source.connectionId !== request.id);
        return vaultChange({ items, connections: request.kind === "connection" ? snapshot.vault.connections.filter(connection => connection.id !== request.id) : snapshot.vault.connections, grants: snapshot.vault.grants.filter(grant => items.some(item => item.id === grant.itemId)) }, request.kind === "connection" ? "1Password disconnected. Remote items are unchanged." : "Item removed and its grants revoked.");
      }
      case "vault.cleanup": return vaultChange({ pending: [] }, "Pending vault cleanup completed.");
      case "prompt": return { ok: true, data: { kind: "prompt", text: `Fictional ${request.kind} preview. In the installed app, Ghostget provides the exact pinned instructions.\nDiscover Ghostget capabilities and respect each operation's permission.` } };
    }
  };
  const port: ControlPanelPort = { async request(request, signal) { const result = await context.activity.run("control-request", async () => { await Promise.resolve(); if (signal?.aborted || context.signal.aborted) throw new DOMException("Cancelled", "AbortError"); return parseControlResponse(dispatch(request)); }); if (!result.ok) throw new Error("Fixture operation did not complete"); return result.value; } };
  const model = new PanelModel(port, { section: sectionFor(context.world.scene), ...(context.world.scene === "backend.failure" ? {} : { snapshot }), now: () => context.clock.now(), locale: "en-US", timeZone: "UTC" });
  context.onDispose(() => { model.dispose(); });
  return { model, rows, port, recordViolation: () => { violations++; }, violations: () => violations, failNextActivity: () => { failNextActivity = true; }, addRow: (row: ActivityRow) => rows.push(row) };
}
export function createPanelSession(activation: DirectSessionActivation) { return createDirectSession({ definition, activation, create: createHarness, observe: harness => ({ violations: [{ name: "panel.unexpected-browser-io", read: harness.violations }] }) }); }

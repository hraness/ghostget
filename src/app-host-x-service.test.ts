import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { APP_HOST_X_MAX_ACTION_TICKETS, AppHostXService, appHostXActionTickets, appHostXPlanAttachments, appHostXPublicationInput, type AppHostXActionTicket, type AppHostXActionTickets } from "./app-host-x-service";
import { parseAppHostXRequest } from "./app-host-x-validation";
import type { AppHostAccount } from "./app-host-protocol";
import type { AppHostXData, AppHostXMedia, AppHostXRequest } from "./app-host-x-protocol";
import type { StoredPlan } from "./runtime";
import { providerPluginRegistry } from "./provider-plugins";
import { canonicalJson } from "./canonical-json";
import { projectXSocialPost } from "./providers/x-web-model";
import { listPrivateStateDirectory, type PrivateStateDirectoryEntry } from "./storage";
import { assertAsyncProperty, fc } from "./test-support";
import { xWebPlugin } from "./plugins/x-web/plugin";
import currentXManifest from "./assets/adapters/x/wrench-web-adapter.json";

type Runtime = NonNullable<ConstructorParameters<typeof AppHostXService>[5]>;
const revision = "a".repeat(64), planDigest = "b".repeat(64);
const binding = { accountId: "fixture", expectedAccountRevision: revision };
type WithoutBinding<T> = T extends unknown ? Omit<T, keyof typeof binding> : never;
const services: AppHostXService[] = [];
const roots: string[] = [];
afterEach(() => {
  for (const service of services.splice(0)) service.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture(options: { tickets?: AppHostXActionTickets; deniedPlans?: Set<string>; revision?: string; incarnation?: string; realTickets?: boolean; environment?: Readonly<Record<string, string>> } = {}) {
  const initialRevision = options.revision ?? revision;
  let now = 1000, currentRevision = initialRevision, currentIncarnation = options.incarnation ?? "c".repeat(64), confirms = 0, executions = 0;
  const inputs: unknown[] = [], cancellations: string[] = [];
  const deniedPlans = options.deniedPlans ?? new Set<string>();
  const account: AppHostAccount = { id: "fixture", provider: "x", subject: "123", displayName: "@fixture", browser: "chrome", profile: "Default", revision: initialRevision, status: "configured", identityVerification: "at-connection", disconnectDigest: "d".repeat(64) };
  const auth = { id: account.id, kind: "browser-profile", browser: "chrome", profile: "Default" };
  let output: unknown = { posts: [], cursor: "private-provider-cursor" };
  let readDelay = async () => {};
  let confirmation = async (_review: string, _signal: AbortSignal) => true;
  let receipts: unknown[] = [];
  let ticketFailure = false;
  let saved = (value: StoredPlan) => value;
  let execution = async () => ({ receipt: { runId: "01234567-89ab-cdef-0123-456789abcdef", status: "succeeded" } });
  const memory = new Map<string, AppHostXActionTicket>();
  const tickets = options.tickets ?? { save: (ticket: AppHostXActionTicket) => { if (ticketFailure) throw new Error("ticket write refused"); memory.set(ticket.digest, ticket); }, read: (digest: string) => memory.get(digest) ?? null };
  const runtime = {
    prepareReadInvocation: (_adapter: string, operation: string, input: unknown) => { inputs.push({ operation, input }); return { auth, readProjectionAuthIdentityHash: currentIncarnation }; },
    executeReadInvocation: async () => { await readDelay(); return { receipt: { status: "succeeded" }, output }; },
    prepareInvocation: (_adapter: string, operation: string, input: unknown) => { inputs.push({ operation, input }); return { input, operation }; },
    createAndSaveInvocationPlan: (invocation: { input: unknown; operation: string }) => saved({ digest: planDigest, plan: { input: invocation.input, operation: invocation.operation, auth: { id: account.id, kind: auth.kind, hash: createHash("sha256").update(canonicalJson(auth)).digest("hex"), incarnationHash: currentIncarnation } } } as StoredPlan),
    cancelInvocationPlan: (digest: string) => { cancellations.push(digest); },
    cancelUnstartedInvocationPlan: (digest: string) => { cancellations.push(digest); deniedPlans.add(digest); return true; },
    invocationPlanWasCancelled: (digest: string) => deniedPlans.has(digest),
    confirmInvocation: async () => { executions++; return execution(); },
    listRunReceipts: () => receipts,
    readRunReceipt: () => ({ status: "succeeded" }),
  } as unknown as Runtime;
  const service = new AppHostXService(options.environment ?? {}, providerPluginRegistry, (id, expected) => {
    if (id !== account.id || expected !== currentRevision) throw new Error("ACCOUNT_CHANGED");
    return account;
  }, async (review, signal) => { confirms++; return confirmation(review, signal); }, () => now, runtime, options.realTickets ? undefined : tickets);
  services.push(service);
  const handle = (request: WithoutBinding<AppHostXRequest>) => service.handle({ ...request, accountId: account.id, expectedAccountRevision: initialRevision } as AppHostXRequest);
  const prepare = async () => action(await handle({ action: "x.action.prepare", intent: { action: "like", postId: "42" } } as never));
  return { service, handle, prepare, inputs, cancellations, setOutput: (value: unknown) => { output = value; },
    setRevision: (value: string) => { currentRevision = value; }, setNow: (value: number) => { now = value; },
    setReadDelay: (value: typeof readDelay) => { readDelay = value; }, setConfirmation: (value: typeof confirmation) => { confirmation = value; },
    setReceipts: (value: unknown[]) => { receipts = value; }, auth, tickets,
    setSaved: (value: typeof saved) => { saved = value; }, setIncarnation: (value: string) => { currentIncarnation = value; },
    setExecution: (value: typeof execution) => { execution = value; },
    failTickets: () => { ticketFailure = true; }, deniedPlans,
    counts: () => ({ confirms, executions }) };
}
function action(value: AppHostXData) { if (value.kind !== "x-action") throw new Error("wrong action result"); return value; }
const feed = { action: "x.feed.list", source: "home", profile: null, cursor: null, limit: 20 } as const;

test("semantic X parser rejects arbitrary provider authority, writes without targets, mixed media and caller approval", () => {
  for (const request of [
    { action: "x.action.prepare", intent: { action: "like" } },
    { action: "x.action.prepare", intent: { action: "post", text: "hi", approved: true } },
    { action: "x.action.commit", preparationId: "one", digest: planDigest, approved: true },
    { ...feed, operation: "posts.publish" },
    { action: "x.media.prepare", files: [{ path: "/tmp/a", mediaType: "video/mp4" }, { path: "/tmp/b", mediaType: "image/png" }] },
    { action: "x.action.prepare", intent: { action: "follow", subject: "@other" } },
  ]) expect(() => parseAppHostXRequest({ ...request, ...binding })).toThrow();
  expect(parseAppHostXRequest({ ...binding, action: "x.action.prepare", intent: { action: "reply", postId: "42", text: "hi @fixture #tag $ABC", media: [] } })).toMatchObject({ intent: { postId: "42" } });
});

test("pagination hides provider cursor and rejects query changes, account changes and expiry", async () => {
  const f = fixture();
  const first = await f.handle(feed);
  if (first.kind !== "x-page") throw new Error("wrong page");
  expect(first.nextCursor).not.toBe("private-provider-cursor");
  expect(JSON.stringify(first)).not.toContain("private-provider-cursor");
  await f.handle({ ...feed, cursor: first.nextCursor } as never);
  expect(f.inputs.at(-1)).toMatchObject({ input: { cursor: "private-provider-cursor" } });
  await expect(f.handle({ ...feed, source: "following", cursor: first.nextCursor } as never)).rejects.toThrow();
  f.setNow(602_000);
  await expect(f.handle({ ...feed, cursor: first.nextCursor } as never)).rejects.toThrow();
});

test("repost feed preserves underlying continuation and labels a filtered profile page", async () => {
  const f = fixture();
  const raw = (id: string) => ({ __typename: "Tweet", rest_id: id, legacy: { full_text: "fixture" } });
  const original = projectXSocialPost(raw("41"));
  const repost = projectXSocialPost({ ...raw("42"), retweeted_status_result: { result: raw("40") } });
  f.setOutput({ posts: [original, repost], cursor: "private-provider-cursor" });
  const result = await f.handle({ ...feed, source: "profile-reposts" });
  if (result.kind !== "x-page") throw new Error("wrong page");
  expect(result.completeness).toBe("filtered");
  expect(result.entries.map(entry => entry.id)).toEqual(["42"]);
  expect(result.nextCursor).not.toBeNull();
  expect(f.inputs.at(-1)).toMatchObject({ operation: "feeds.read", input: { feed: "user", user_id: "123" } });
  await f.handle({ ...feed, source: "profile-reposts", cursor: result.nextCursor });
  expect(f.inputs.at(-1)).toMatchObject({ input: { cursor: "private-provider-cursor" } });
  f.setOutput({ posts: [original], cursor: "another-private-cursor" });
  const empty = await f.handle({ ...feed, source: "profile-reposts" });
  expect(empty).toMatchObject({ kind: "x-page", entries: [], completeness: "filtered" });
  if (empty.kind !== "x-page") throw new Error("wrong page");
  expect(empty.nextCursor).not.toBeNull();
});

test("exact post reads consume the provider's single-post projection and bind its ID", async () => {
  const f = fixture();
  const post = projectXSocialPost({ __typename: "Tweet", rest_id: "42", legacy: { full_text: "Exact post" } });
  f.setOutput({ post });
  expect(await f.handle({ action: "x.post.get", postId: "42" })).toMatchObject({ kind: "x-page", source: "post", entries: [{ kind: "post", id: "42", post }] });
  expect(f.inputs.at(-1)).toMatchObject({ operation: "posts.read", input: { post_id: "42" } });
  await expect(f.handle({ action: "x.post.get", postId: "43" })).rejects.toThrow("requested post");
  f.setOutput({ posts: [post] });
  await expect(f.handle({ action: "x.post.get", postId: "42" })).rejects.toThrow();
});

test("rich feed pages retain unavailable occurrences and distinguish bounded partial output", async () => {
  const f = fixture();
  const post = projectXSocialPost({ __typename: "Tweet", rest_id: "42", legacy: { full_text: "Exact post" } });
  const missing = { kind: "unavailable", id: "tweet-unavailable-occurrence", postId: null, reason: "This post is unavailable.\nAdditional visible details." };
  f.setOutput({ posts: [post], entries: [missing, { kind: "post", id: post.id, post }], entriesTruncated: false });
  expect(await f.handle(feed)).toMatchObject({ entries: [{ kind: "unavailable", id: missing.id, reason: missing.reason }, { kind: "post", id: post.id }], completeness: "page" });
  f.setOutput({ posts: [post], entries: [missing], entriesTruncated: true, cursor: null });
  expect(await f.handle(feed)).toMatchObject({ entries: [{ kind: "unavailable" }], completeness: "filtered", nextCursor: null });
  f.setOutput({ posts: [post], entries: [{ kind: "post", id: "43", post }] });
  await expect(f.handle(feed)).rejects.toThrow("mismatched post");
});

test("deletion pre-reads the single exact owned post and retains its displayed media text", async () => {
  const f = fixture();
  const text = "Exact media caption https://t.co/fixture";
  const post = projectXSocialPost({ __typename: "Tweet", rest_id: "42", legacy: { full_text: text, user_id_str: "123" } });
  f.setOutput({ post });
  expect(await f.handle({ action: "x.action.prepare", intent: { action: "delete", postId: "42", expectedText: text } })).toMatchObject({ kind: "x-action", state: "prepared" });
  expect(f.inputs.at(-1)).toEqual({ operation: "content.delete", input: { post_id: "42", expected_text: text } });
  for (const intent of [{ action: "delete", postId: "43", expectedText: text }, { action: "delete", postId: "42", expectedText: "changed" }] as const) {
    await expect(f.handle({ action: "x.action.prepare", intent })).rejects.toThrow("deletion preview");
  }
  f.setOutput({ post: { ...post, authorId: "999" } });
  await expect(f.handle({ action: "x.action.prepare", intent: { action: "delete", postId: "42", expectedText: text } })).rejects.toThrow("deletion preview");
});

test("capabilities and deferred read execution share the qualification gate", async () => {
  const f = fixture();
  const result = await f.handle({ action: "x.capabilities" });
  if (result.kind !== "x-capabilities") throw new Error("wrong capabilities");
  expect(result.capabilities.find(item => item.name === "profile-reposts")?.supported).toBe(true);
  expect(result.capabilities.find(item => item.name === "likes")?.supported).toBe(false);
  expect(result.capabilities.find(item => item.name === "post-media-images")?.supported).toBe(false);
  expect(result.capabilities.find(item => item.name === "post-media-jpeg")?.supported).toBe(false);
  expect(result.capabilities.find(item => item.name === "post-media-video")?.supported).toBe(true);
  await expect(f.handle({ ...feed, source: "likes" })).rejects.toThrow("reviewed provider contract");
  expect(f.inputs).toHaveLength(0);
});

test("a delayed read cannot return data after disconnect or host closure", async () => {
  for (const close of [false, true]) {
    const f = fixture(); let release!: () => void;
    f.setReadDelay(() => new Promise(resolve => { release = resolve; }));
    const pending = f.handle(feed);
    if (close) f.service.close(); else f.setRevision("c".repeat(64));
    release();
    await expect(pending).rejects.toThrow();
  }
});

test("preparation is single-use and denial never dispatches", async () => {
  const f = fixture(); f.setConfirmation(async () => false);
  const prepared = await f.prepare();
  expect(prepared.runId).toBe(`plan-${planDigest}`);
  const commit = { action: "x.action.commit", preparationId: prepared.preparationId!, digest: prepared.digest! } as const;
  expect(action(await f.handle(commit as never)).state).toBe("denied");
  expect(f.counts()).toEqual({ confirms: 1, executions: 0 });
  expect(f.cancellations).toEqual([planDigest]);
  await expect(f.handle(commit as never)).rejects.toThrow();
  f.service.close();
  expect(f.cancellations).toEqual([planDigest]);
});

test("host close, account replacement and expired confirmations cannot dispatch", async () => {
  for (const mode of ["close", "revision", "expiry"]) {
    const f = fixture(); const prepared = await f.prepare(); let release!: (value: boolean) => void;
    f.setConfirmation(async (_review, signal) => {
      if (mode === "close") signal.addEventListener("abort", () => release(true), { once: true });
      return new Promise(resolve => { release = resolve; });
    });
    const pending = f.handle({ action: "x.action.commit", preparationId: prepared.preparationId!, digest: prepared.digest! } as never);
    if (mode === "close") f.service.close();
    else { if (mode === "revision") f.setRevision("c".repeat(64)); else f.setNow(400_000); release(true); }
    await expect(pending).rejects.toThrow();
    expect(f.counts().executions).toBe(0);
    expect(f.cancellations).toEqual([planDigest]);
  }
});

test("an already-running confirmation blocks a second action without consuming it", async () => {
  const f = fixture(); const first = await f.prepare(), second = await f.prepare(); let release!: (value: boolean) => void;
  f.setConfirmation(() => new Promise(resolve => { release = resolve; }));
  const firstCommit = f.handle({ action: "x.action.commit", preparationId: first.preparationId!, digest: first.digest! } as never);
  await expect(f.handle({ action: "x.action.commit", preparationId: second.preparationId!, digest: second.digest! } as never)).rejects.toThrow();
  release(false); await firstCommit;
  f.setConfirmation(async () => true);
  expect(action(await f.handle({ action: "x.action.commit", preparationId: second.preparationId!, digest: second.digest! } as never)).state).toBe("completed");
  expect(f.counts().executions).toBe(1);
});

test("lost-response tickets reconcile only account-bound durable receipts and never replay", async () => {
  const f = fixture();
  await f.prepare();
  const status = { action: "x.action.status", runId: `plan-${planDigest}` } as const;
  expect(action(await f.handle(status)).state).toBe("uncertain");
  const receipt = { planDigest, operation: "likes.set", adapter: { id: "x" }, auth: { id: binding.accountId, hash: createHash("sha256").update(canonicalJson(f.auth)).digest("hex") }, status: "succeeded", runId: "01234567-89ab-cdef-0123-456789abcdef" };
  f.setReceipts([{ ...receipt, auth: { ...receipt.auth, id: "other" } }]);
  expect(action(await f.handle(status)).state).toBe("uncertain");
  f.setReceipts([receipt]);
  expect(action(await f.handle(status)).state).toBe("completed");
  f.setReceipts([receipt, receipt]);
  expect(action(await f.handle(status)).state).toBe("uncertain");
  expect(f.counts()).toEqual({ confirms: 0, executions: 0 });
});

test("cancel and shutdown release unused plans; unsupported operations perform no provider read", async () => {
  const f = fixture(); const prepared = await f.prepare();
  await f.handle({ action: "x.action.cancel", preparationId: prepared.preparationId! } as never);
  expect(f.cancellations).toEqual([planDigest]);
  await f.prepare(); f.service.close();
  expect(f.cancellations).toEqual([planDigest, planDigest]);
  const other = fixture();
  await expect(other.handle({ action: "x.explore.list", source: "trending", target: null, cursor: null, limit: 20 } as never)).rejects.toThrow();
  expect(other.inputs).toEqual([]);
});

test("cancel aborts an open confirmation and an eventual affirmative answer cannot dispatch", async () => {
  const f = fixture(); const prepared = await f.prepare(); let signal!: AbortSignal;
  f.setConfirmation((_review, value) => {
    signal = value;
    return new Promise(resolve => value.addEventListener("abort", () => resolve(true), { once: true }));
  });
  const pending = f.handle({ action: "x.action.commit", preparationId: prepared.preparationId!, digest: prepared.digest! } as never);
  expect(signal.aborted).toBe(false);
  expect(action(await f.handle({ action: "x.action.cancel", preparationId: prepared.preparationId! } as never)).state).toBe("denied");
  expect(signal.aborted).toBe(true);
  expect(action(await pending).state).toBe("denied");
  expect(f.cancellations).toEqual([planDigest]);
  expect(f.counts().executions).toBe(0);
});

test("stable-handle cancellation dismisses the matching unused native confirmation", async () => {
  const f = fixture(); const prepared = await f.prepare(); let signal!: AbortSignal;
  f.setConfirmation((_review, value) => {
    signal = value;
    return new Promise(resolve => value.addEventListener("abort", () => resolve(true), { once: true }));
  });
  const pending = f.handle({ action: "x.action.commit", preparationId: prepared.preparationId!, digest: prepared.digest! });
  expect(signal.aborted).toBe(false);
  expect(action(await f.handle({ action: "x.action.cancel", preparationId: prepared.runId! })).state).toBe("denied");
  expect(signal.aborted).toBe(true);
  expect(action(await pending).state).toBe("denied");
  expect(f.counts().executions).toBe(0);
});

test("a rejected confirmation releases the plan without handing it to the runtime", async () => {
  const f = fixture(); const prepared = await f.prepare();
  f.setConfirmation(async () => { throw new Error("native confirmation unavailable"); });
  await expect(f.handle({ action: "x.action.commit", preparationId: prepared.preparationId!, digest: prepared.digest! } as never)).rejects.toThrow("native confirmation unavailable");
  f.service.close();
  expect(f.cancellations).toEqual([planDigest]);
  expect(f.counts().executions).toBe(0);
});

test("post-save account changes, missing incarnation and attachment drift release newly created plans", async () => {
  for (const mode of ["revision", "incarnation", "attachments", "ticket"]) {
    const f = fixture();
    f.setSaved(stored => {
      if (mode === "revision") f.setRevision("e".repeat(64));
      if (mode === "incarnation") { const changed = structuredClone(stored); Reflect.deleteProperty(changed.plan.auth, "incarnationHash"); return changed; }
      if (mode === "attachments") return { ...stored, plan: { ...stored.plan, input: { ...stored.plan.input, media: { kind: "file", reference: "/tmp/unbound" } } } };
      return stored;
    });
    if (mode === "ticket") f.failTickets();
    await expect(f.prepare()).rejects.toThrow();
    expect(f.cancellations).toEqual([planDigest]);
    expect(f.counts()).toEqual({ confirms: 0, executions: 0 });
  }
});

test("executing or uncertain runtime actions are never cancelled as unused plans", async () => {
  const f = fixture(); const prepared = await f.prepare(); let release!: () => void; let entered!: () => void;
  const executing = new Promise<void>(resolve => { entered = resolve; });
  f.setExecution(async () => {
    entered();
    await new Promise<void>(resolve => { release = resolve; });
    throw new Error("transport ended with an unknown result");
  });
  const pending = f.handle({ action: "x.action.commit", preparationId: prepared.preparationId!, digest: prepared.digest! } as never);
  await executing;
  await expect(f.handle({ action: "x.action.cancel", preparationId: prepared.preparationId! } as never)).rejects.toThrow("already submitted");
  f.service.close(); release();
  await expect(pending).rejects.toThrow("unknown result");
  expect(f.cancellations).toEqual([]);
  expect(f.counts().executions).toBe(1);
});

test("restart recovery needs the exact saved connection lifetime, even when auth bytes match", async () => {
  const original = fixture(); await original.prepare();
  const receipt = { planDigest, operation: "likes.set", adapter: { id: "x" }, auth: { id: binding.accountId, hash: createHash("sha256").update(canonicalJson(original.auth)).digest("hex") }, status: "succeeded", runId: "01234567-89ab-cdef-0123-456789abcdef" };
  original.service.close();
  const status = { action: "x.action.status", runId: `plan-${planDigest}` } as const;
  const restart = fixture({ tickets: original.tickets }); restart.setReceipts([receipt]);
  expect(action(await restart.handle(status)).state).toBe("completed");
  const reconnected = fixture({ tickets: original.tickets, revision: "e".repeat(64) }); reconnected.setReceipts([receipt]);
  await expect(reconnected.handle(status)).rejects.toThrow("current account connection");
  const replaced = fixture({ tickets: original.tickets, incarnation: "f".repeat(64) }); replaced.setReceipts([receipt]);
  await expect(replaced.handle(status)).rejects.toThrow("different account connection");
  const noTicket = fixture(); noTicket.setReceipts([receipt]);
  await expect(noTicket.handle(status)).rejects.toThrow("current account connection");
  for (const candidate of [original, restart, reconnected, replaced, noTicket]) expect(candidate.counts().executions).toBe(0);
});

test("a lost cancellation response remains denied after restart without treating missing receipts as proof", async () => {
  const original = fixture();
  const prepared = await original.prepare();
  original.setConfirmation(async () => false);
  expect(action(await original.handle({ action: "x.action.commit", preparationId: prepared.preparationId!, digest: prepared.digest! })).state).toBe("denied");
  original.service.close();
  const restart = fixture({ tickets: original.tickets, deniedPlans: original.deniedPlans });
  const status = { action: "x.action.status", runId: prepared.runId! } as const;
  expect(action(await restart.handle(status)).state).toBe("denied");
  restart.setReceipts([{ runId: "invalid-fixture", invalid: true }]);
  expect(action(await restart.handle(status)).state).toBe("uncertain");
  const withoutProof = fixture({ tickets: original.tickets });
  expect(action(await withoutProof.handle(status)).state).toBe("uncertain");
  expect(restart.counts()).toEqual({ confirms: 0, executions: 0 });
});

test("explicit stable-handle cancellation recovers an unused plan after host restart", async () => {
  const original = fixture(); const prepared = await original.prepare();
  // Simulate process loss, without graceful shutdown and its cancellation.
  const restart = fixture({ tickets: original.tickets });
  const result = await restart.handle({ action: "x.action.cancel", preparationId: prepared.runId! });
  expect(action(result)).toMatchObject({ state: "denied", runId: prepared.runId, digest: prepared.digest });
  expect(restart.cancellations).toEqual([planDigest]);
  expect(action(await restart.handle({ action: "x.action.status", runId: prepared.runId! })).state).toBe("denied");
  const changed = fixture({ tickets: original.tickets, incarnation: "f".repeat(64) });
  await expect(changed.handle({ action: "x.action.cancel", preparationId: prepared.runId! })).rejects.toThrow("different account connection");
  expect(changed.cancellations).toEqual([]);
  expect(restart.counts()).toEqual({ confirms: 0, executions: 0 });
});

test("missing recovery-ticket status creates no directory or state marker", async () => {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), "ghostget-app-host-x-ticket-"))); roots.push(parent);
  const state = join(parent, "ghostget");
  const f = fixture({ realTickets: true, environment: { GHOSTGET_STATE_HOME: state } });
  await expect(f.handle({ action: "x.action.status", runId: `plan-${planDigest}` } as never)).rejects.toThrow("current account connection");
  expect(existsSync(state)).toBe(false);
  expect(readdirSync(parent)).toEqual([]);
});

test("ticket capacity fails closed without eviction and existing history stays recoverable", async () => {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), "ghostget-app-host-x-capacity-"))); roots.push(parent);
  const environment = { GHOSTGET_STATE_HOME: join(parent, "ghostget") };
  let syntheticCount = 0;
  const tickets = appHostXActionTickets(environment, (directory, env) => [
    ...listPrivateStateDirectory(directory, env),
    ...Array.from({ length: syntheticCount }, (_, index): PrivateStateDirectoryEntry => ({ name: `${(index + 1).toString(16).padStart(64, "0")}.json`, kind: "file" })),
  ]);
  const f = fixture({ environment, tickets });
  const prepared = await f.prepare();
  const original = tickets.read(planDigest)!;
  const directory = join(environment.GHOSTGET_STATE_HOME, "app-host-x-actions");
  syntheticCount = APP_HOST_X_MAX_ACTION_TICKETS - 2;
  const secondDigest = "e".repeat(64);
  f.setSaved(stored => ({ ...stored, digest: secondDigest }));
  await f.prepare(); // Exactly the last available slot is admitted.
  const retainedFiles = readdirSync(directory).sort();
  const refusedDigest = "f".repeat(64);
  f.setSaved(stored => ({ ...stored, digest: refusedDigest }));
  for (const overflow of [0, 1]) {
    syntheticCount = APP_HOST_X_MAX_ACTION_TICKETS - 2 + overflow;
    await expect(f.prepare()).rejects.toMatchObject({ code: "ACTION_HISTORY_LIMIT" });
    expect(readdirSync(directory).sort()).toEqual(retainedFiles);
    expect(tickets.read(refusedDigest)).toBeNull();
    tickets.save(original); // Duplicate saves remain idempotent even when overfull.
    expect(tickets.read(planDigest)).toEqual(original);
    expect(action(await f.handle({ action: "x.action.status", runId: prepared.runId! })).state).toBe("uncertain");
  }
  expect(f.cancellations).toEqual([refusedDigest, refusedDigest]);
  expect(f.counts()).toEqual({ confirms: 0, executions: 0 });
  f.setReceipts([{ planDigest, operation: "likes.set", adapter: { id: "x" }, auth: { id: binding.accountId, hash: original.authHash }, status: "succeeded", runId: "01234567-89ab-cdef-0123-456789abcdef" }]);
  expect(action(await f.handle({ action: "x.action.status", runId: prepared.runId! })).state).toBe("completed");
  expect(readdirSync(directory).sort()).toEqual(retainedFiles);
});

test("ticket admission rejects unexpected history and oversized metadata without replacing evidence", async () => {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), "ghostget-app-host-x-ticket-bound-"))); roots.push(parent);
  const environment = { GHOSTGET_STATE_HOME: join(parent, "ghostget") };
  let unexpected = false;
  const tickets = appHostXActionTickets(environment, (directory, env) => [
    ...listPrivateStateDirectory(directory, env),
    ...(unexpected ? [{ name: "unknown-entry", kind: "file" as const }] : []),
  ]);
  const f = fixture({ environment, tickets }); await f.prepare();
  const original = tickets.read(planDigest)!;
  const directory = join(environment.GHOSTGET_STATE_HOME, "app-host-x-actions");
  const names = readdirSync(directory);
  expect(() => tickets.save({ ...original, digest: "e".repeat(64), accountId: "x".repeat(20_000) })).toThrow("byte bound");
  expect(() => tickets.save({ ...original, operation: "posts.publish" })).toThrow("ticket changed");
  unexpected = true;
  f.setSaved(stored => ({ ...stored, digest: "f".repeat(64) }));
  await expect(f.prepare()).rejects.toThrow("unexpected state");
  expect(readdirSync(directory)).toEqual(names);
  expect(tickets.read(planDigest)).toEqual(original);
  expect(f.counts()).toEqual({ confirms: 0, executions: 0 });
});

test("capability, status and feed observations never sweep an unrelated expired durable preparation", async () => {
  for (const read of [
    { action: "x.capabilities" },
    { action: "x.action.status", runId: `plan-${"e".repeat(64)}` },
    feed,
  ] as const) {
    const f = fixture();
    const prepared = await f.prepare();
    f.setNow(400_000);
    if (read.action === "x.action.status") await expect(f.handle(read)).rejects.toThrow("current account connection");
    else await f.handle(read);
    expect(f.cancellations).toEqual([]);
    expect(f.counts().executions).toBe(0);
    expect(action(await f.handle({ action: "x.action.status", runId: prepared.runId! }))).toMatchObject({ state: "uncertain", runId: prepared.runId });
    expect(f.cancellations).toEqual([]);
    // A subsequent mutation owns the expired-plan cleanup.
    await f.prepare();
    expect(f.cancellations).toEqual([planDigest]);
  }
});

test("arbitrary observation schedules cannot cancel or dispatch a retained preparation", async () => {
  await assertAsyncProperty(fc.asyncProperty(fc.array(fc.record({
    read: fc.constantFrom("capabilities", "status", "feed"),
    advance: fc.integer({ min: 0, max: 400_000 }),
  }), { minLength: 1, maxLength: 32 }), async schedule => {
    const f = fixture(); const prepared = await f.prepare(); let now = 1000;
    try {
      for (const step of schedule) {
        now += step.advance; f.setNow(now);
        if (step.read === "capabilities") await f.handle({ action: "x.capabilities" });
        else if (step.read === "feed") await f.handle(feed);
        else expect(action(await f.handle({ action: "x.action.status", runId: prepared.runId! })).state)
          .toBe("uncertain");
        expect(f.cancellations).toEqual([]);
        expect(f.counts()).toEqual({ confirms: 0, executions: 0 });
      }
    } finally { f.service.close(); }
  }));
});

test("expired in-flight or settled writes remain uncertain during read-only status checks", async () => {
  const f = fixture(); const prepared = await f.prepare(); let release!: () => void; let entered!: () => void;
  const executing = new Promise<void>(resolve => { entered = resolve; });
  f.setExecution(async () => {
    entered(); await new Promise<void>(resolve => { release = resolve; });
    return { receipt: { runId: "01234567-89ab-cdef-0123-456789abcdef", status: "indeterminate" } };
  });
  const pending = f.handle({ action: "x.action.commit", preparationId: prepared.preparationId!, digest: prepared.digest! });
  await executing; f.setNow(400_000);
  expect(action(await f.handle({ action: "x.action.status", runId: prepared.runId! })).state).toBe("uncertain");
  release(); await pending;
  expect(action(await f.handle({ action: "x.action.status", runId: prepared.runId! })).state).toBe("uncertain");
  expect(f.cancellations).toEqual([]);
  expect(f.counts().executions).toBe(1);
});

test("uncertain commit preserves its stable recovery handle across repeated provider restarts", async () => {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), "ghostget-app-host-x-restart-"))); roots.push(parent);
  const environment = { GHOSTGET_STATE_HOME: join(parent, "ghostget") };
  const original = fixture({ environment, realTickets: true }); const prepared = await original.prepare();
  original.setExecution(async () => ({ receipt: { runId: "01234567-89ab-cdef-0123-456789abcdef", status: "indeterminate" } }));
  const committed = action(await original.handle({ action: "x.action.commit", preparationId: prepared.preparationId!, digest: prepared.digest! } as never));
  expect(committed.state).toBe("uncertain");
  expect(committed.runId).toBe(prepared.runId);
  const receipt = { planDigest, operation: "likes.set", adapter: { id: "x" }, auth: { id: binding.accountId, hash: createHash("sha256").update(canonicalJson(original.auth)).digest("hex") }, status: "indeterminate", runId: "01234567-89ab-cdef-0123-456789abcdef" };
  original.service.close();
  const first = fixture({ environment, realTickets: true }); first.setReceipts([receipt]);
  const recovered = action(await first.handle({ action: "x.action.status", runId: committed.runId! } as never));
  expect(recovered).toMatchObject({ state: "uncertain", runId: prepared.runId, digest: planDigest });
  first.service.close();
  const second = fixture({ environment, realTickets: true }); second.setReceipts([{ ...receipt, status: "succeeded" }]);
  expect(action(await second.handle({ action: "x.action.status", runId: recovered.runId! } as never))).toMatchObject({ state: "completed", runId: prepared.runId, digest: planDigest });
  expect(original.counts().executions).toBe(1);
  expect(first.counts().executions).toBe(0);
  expect(second.counts().executions).toBe(0);
});

function attachment(index: number, mediaType: AppHostXMedia["mediaType"] = "image/png"): AppHostXMedia {
  return { mediaId: `media-${index}`, mediaType, filename: `image-${index}.png`, byteLength: 64 + index, sha256: String(index).repeat(64), altText: null };
}
function boundPlan(media: readonly AppHostXMedia[]): StoredPlan {
  // This pure attachment-review fixture intentionally supplies only its input projection.
  return { digest: planDigest, plan: { input: { body: "review", media: media.map((item, index) => ({ kind: "file", reference: `sf1:${index + 1}:${item.sha256}:${item.byteLength}:${Buffer.from(item.mediaType).toString("base64url")}:asset-0${index + 1}.png` })), media_types: media.map(item => item.mediaType) } } } as unknown as StoredPlan;
}

test("publication v6 preserves ordered 1–4 images, one video and text-only inputs", () => {
  expect(appHostXPublicationInput({ action: "post", text: "hello" }, [], 6)).toEqual({ body: "hello" });
  for (let count = 1; count <= 4; count++) {
    const selected = Array.from({ length: count }, (_, index) => ({ path: `/staged/${index}`, media: attachment(index + 1, index % 2 === 0 ? "image/png" : "image/jpeg") }));
    expect(appHostXPublicationInput({ action: "post", text: "hello" }, selected, 6)).toEqual({ body: "hello", media: selected.map(item => ({ kind: "file", reference: item.path })), media_types: selected.map(item => item.media.mediaType) });
  }
  const video = { path: "/staged/video", media: attachment(1, "video/mp4") };
  expect(appHostXPublicationInput({ action: "post", text: "video" }, [video], 6)).toEqual({ body: "video", media: [{ kind: "file", reference: video.path }], media_types: ["video/mp4"] });
  expect(() => appHostXPublicationInput({ action: "post" }, [video, { path: "/staged/image", media: attachment(2) }], 6)).toThrow("four images or one video");
  expect(() => appHostXPublicationInput({ action: "reply", postId: "42" }, [video], 6)).toThrow("reviewed provider contract");
  expect(() => appHostXPublicationInput({ action: "quote", postId: "42" }, [video], 6)).toThrow("reviewed provider contract");
  expect(appHostXPublicationInput({ action: "reply", postId: "42", text: "reply" }, [], 6)).toEqual({ body: "reply", post_id: "42" });
  expect(appHostXPublicationInput({ action: "post" }, [video], 5)).toEqual({ body: "", media: { kind: "file", reference: video.path }, media_type: "video/mp4" });
  expect(() => appHostXPublicationInput({ action: "post" }, [{ path: "/staged/jpeg", media: attachment(1, "image/jpeg") }], 5)).toThrow("JPEG publishing needs");
  expect(() => appHostXPublicationInput({ action: "post" }, [{ path: "/staged/1", media: attachment(1) }, { path: "/staged/2", media: attachment(2) }], 5)).toThrow("Multiple images need");
});

test("default publication stays observed while the ordered-media successor is unqualified", async () => {
  const version = currentXManifest.operations["posts.publish"].webSession.contractVersion;
  const operations = xWebPlugin.bindings.flatMap(binding => binding.operations);
  expect(version).toBe(5);
  expect(operations.find(operation => operation.name === "posts.publish" && operation.contractVersion === version)?.state).toBe("observed");
  expect(operations.find(operation => operation.name === "posts.publish" && operation.contractVersion === 6)?.state).toBe("capture-required");
  const f = fixture();
  expect(await f.handle({ action: "x.action.prepare", intent: { action: "post", text: "Exact fixture text" } })).toMatchObject({ kind: "x-action", state: "prepared" });
  expect(f.inputs.at(-1)).toEqual({ operation: "posts.publish", input: { body: "Exact fixture text" } });
});

test("review binds each staged attachment's immutable digest, byte length, MIME and order", () => {
  const media = [attachment(1), attachment(2, "image/jpeg")];
  const stored = boundPlan(media);
  expect(appHostXPlanAttachments(stored, media)).toEqual(media);
  for (const changed of [
    [{ ...media[0]!, sha256: "e".repeat(64) }, media[1]!],
    [{ ...media[0]!, byteLength: 1 }, media[1]!],
    [{ ...media[0]!, mediaType: "video/mp4" as const }, media[1]!],
    [media[1]!, media[0]!],
    media.slice(0, 1),
  ]) expect(() => appHostXPlanAttachments(stored, changed)).toThrow("attachments changed");
  const raw = { ...stored, plan: { ...stored.plan, input: { media: [{ kind: "file", reference: "/tmp/mutable" }], media_types: ["image/png"] } } } as StoredPlan;
  expect(() => appHostXPlanAttachments(raw, [media[0]!])).toThrow("immutable bytes");
});

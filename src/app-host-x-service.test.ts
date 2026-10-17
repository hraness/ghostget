import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { APP_HOST_X_MAX_ACTION_TICKETS, AppHostXService, appHostXActionTickets, appHostXPlanAttachments, appHostXPublicationInput, type AppHostXActionTicket, type AppHostXActionTickets, type AppHostXDeleteGrant, type AppHostXDeleteGrants } from "./app-host-x-service";
import { OperationPermissionError } from "./operation-permission-store";
import type { PermissionDecision } from "./control/protocol";
import type { AppHostXDeleteGrantDecision } from "./app-host-x-confirmation";
import { parseAppHostXRequest } from "./app-host-x-validation";
import type { AppHostAccount } from "./app-host-protocol";
import type { AppHostXData, AppHostXMedia, AppHostXRequest } from "./app-host-x-protocol";
import type { StoredPlan } from "./runtime";
import { parseRuntimeManifest, validateOperationInput, type GhostgetManifest, type GhostgetOperation } from "./model";
import { providerPluginRegistry } from "./provider-plugins";
import { canonicalJson } from "./canonical-json";
import { projectXSocialPost, projectXSocialProfile } from "./providers/x-web-model";
import { installManifest, listPrivateStateDirectory, type PrivateStateDirectoryEntry } from "./storage";
import { assertAsyncProperty, assertProperty, fc } from "./test-support";
import { xWebPlugin } from "./plugins/x-web/plugin";
import currentXManifest from "./assets/adapters/x/wrench-web-adapter.json";
import archivedXManifest from "./assets/adapters/x/wrench-web-adapter.v1.20.0.json";
import { appHostFailure } from "./app-host-transport";

type Runtime = NonNullable<ConstructorParameters<typeof AppHostXService>[5]>;
type ManifestReader = NonNullable<ConstructorParameters<typeof AppHostXService>[7]>;
const revision = "a".repeat(64), planDigest = "b".repeat(64);
const manifest = (() => {
  const parsed = parseRuntimeManifest(currentXManifest, providerPluginRegistry);
  if (!parsed.ok) throw new Error(parsed.issues.join("; "));
  return parsed.value;
})();
function runtimeInput(adapter: string, operation: string, input: unknown) {
  expect(adapter).toBe(manifest.id);
  const definition = manifest.operations[operation];
  if (definition === undefined) throw new Error("Unknown fixture operation");
  const parsed = validateOperationInput(definition.input, input, manifest.origins);
  if (!parsed.ok) throw new Error(parsed.issues.join("; "));
  return parsed.value;
}
const binding = { accountId: "fixture", expectedAccountRevision: revision };
type WithoutBinding<T> = T extends unknown ? Omit<T, keyof typeof binding> : never;
const services: AppHostXService[] = [];
const roots: string[] = [];
afterEach(() => {
  for (const service of services.splice(0)) service.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture(options: { deleteDecision?: PermissionDecision | "unmanaged" | "unavailable"; ownerGrant?: boolean; tickets?: AppHostXActionTickets; deniedPlans?: Set<string>; revision?: string; incarnation?: string; realTickets?: boolean; environment?: Readonly<Record<string, string>>; installedManifest?: GhostgetManifest | null; readInstalledManifest?: ManifestReader } = {}) {
  const initialRevision = options.revision ?? revision;
  let now = 1000, currentRevision = initialRevision, currentIncarnation = options.incarnation ?? "c".repeat(64), confirms = 0, executions = 0;
  const inputs: unknown[] = [], cancellations: string[] = [];
  const deniedPlans = options.deniedPlans ?? new Set<string>();
  let account: AppHostAccount = { id: "fixture", provider: "x", subject: "123", displayName: "@fixture", browser: "chrome", profile: "Default", revision: initialRevision, status: "configured", identityVerification: "at-connection", disconnectDigest: "d".repeat(64) };
  const auth = { id: account.id, kind: "browser-profile", browser: "chrome", profile: "Default" };
  let output: unknown = { posts: [], cursor: "private-provider-cursor" };
  let readDelay = async () => {};
  let confirmation = async (_review: string, _signal: AbortSignal) => true;
  let installed = options.installedManifest === undefined ? manifest : options.installedManifest, manifestReads = 0;
  let receipts: unknown[] = [];
  let ticketFailure = false;
  let saved = (value: StoredPlan) => value;
  let execution = async () => ({ receipt: { runId: "01234567-89ab-cdef-0123-456789abcdef", status: "succeeded" } });
  const memory = new Map<string, AppHostXActionTicket>();
  // The standing own-post deletion setting, modelled on the production port:
  // a managed decision (or unmanaged state) plus an owner record that counts
  // only when unmanaged. "unavailable" models a capability that cannot be described.
  type GrantState = { digest: string; revision: number; decision: PermissionDecision | "unmanaged"; grantRevision: number; record: boolean };
  let grantState: GrantState = { digest: "e".repeat(64), revision: 1, decision: options.deleteDecision === "unavailable" ? "ask" : options.deleteDecision ?? "ask", grantRevision: options.ownerGrant === true ? 1 : 0, record: options.ownerGrant === true };
  let grantAvailable = options.deleteDecision !== "unavailable";
  const grantWrites: string[] = [], executionOptions: unknown[] = [], grantDialogs: AppHostXDeleteGrantDecision[] = [];
  let grantDialog = async (_decision: AppHostXDeleteGrantDecision, _signal: AbortSignal) => false;
  const project = (value: GrantState): AppHostXDeleteGrant => ({ digest: value.digest, revision: value.revision, decision: value.decision, grantRevision: value.grantRevision,
    unattended: value.decision === "allow" || (value.decision === "unmanaged" && value.record) });
  const describeGrant = () => { if (!grantAvailable) throw new Error("content.delete is not installed"); return project(grantState); };
  const changedGrant = () => new OperationPermissionError("OPERATION_PERMISSION_CHANGED", "changed");
  const deleteGrants: AppHostXDeleteGrants = {
    read: () => grantAvailable ? project(grantState) : null,
    describe: describeGrant,
    grant: (_account, expected) => {
      const current = describeGrant();
      if (expected.digest !== current.digest || expected.revision !== current.revision || expected.decision !== current.decision || expected.grantRevision !== current.grantRevision) throw changedGrant();
      if (current.decision === "unmanaged") { grantWrites.push("record"); grantState = { ...grantState, record: true, grantRevision: grantState.grantRevision + 1 }; }
      else { grantWrites.push("allow"); grantState = { ...grantState, decision: "allow", revision: grantState.revision + 1 }; }
    },
    revoke: (_account, expected) => {
      if (expected.grantRevision !== grantState.grantRevision) throw changedGrant();
      if (grantState.record) { grantWrites.push("remove-record"); grantState = { ...grantState, record: false, grantRevision: grantState.grantRevision + 1 }; }
      if (expected.decision === "allow") {
        if (expected.revision !== grantState.revision) throw changedGrant();
        grantWrites.push("ask"); grantState = { ...grantState, decision: "ask", revision: grantState.revision + 1 };
      }
    },
  };
  const tickets = options.tickets ?? { save: (ticket: AppHostXActionTicket) => { if (ticketFailure) throw new Error("ticket write refused"); memory.set(ticket.digest, ticket); }, read: (digest: string) => memory.get(digest) ?? null };
  const runtime = {
    prepareReadInvocation: (adapter: string, operation: string, input: unknown) => { runtimeInput(adapter, operation, input); inputs.push({ operation, input }); return { auth, readProjectionAuthIdentityHash: currentIncarnation }; },
    executeReadInvocation: async () => { await readDelay(); return { receipt: { status: "succeeded" }, output }; },
    prepareInvocation: (adapter: string, operation: string, input: unknown) => { const checked = runtimeInput(adapter, operation, input); inputs.push({ operation, input }); return { input: checked, operation }; },
    createAndSaveInvocationPlan: (invocation: { input: unknown; operation: string }) => saved({ digest: planDigest, plan: { input: invocation.input, operation: invocation.operation, auth: { id: account.id, kind: auth.kind, hash: createHash("sha256").update(canonicalJson(auth)).digest("hex"), incarnationHash: currentIncarnation } } } as StoredPlan),
    cancelInvocationPlan: (digest: string) => { cancellations.push(digest); },
    cancelUnstartedInvocationPlan: (digest: string) => { cancellations.push(digest); deniedPlans.add(digest); return true; },
    invocationPlanWasCancelled: (digest: string) => deniedPlans.has(digest),
    confirmInvocation: async (_digest: string, value: unknown) => { executions++; executionOptions.push(value); return execution(); },
    listRunReceipts: () => receipts,
    readRunReceipt: () => ({ status: "succeeded" }),
  } as unknown as Runtime;
  const service = new AppHostXService(options.environment ?? {}, providerPluginRegistry, (id, expected) => {
    if (id !== account.id || expected !== currentRevision) throw new Error("ACCOUNT_CHANGED");
    return account;
  }, async (review, signal) => { confirms++; return confirmation(review, signal); }, () => now, runtime, options.realTickets ? undefined : tickets,
  (environment, registry) => {
    manifestReads++;
    return options.readInstalledManifest?.(environment, registry) ?? (installed === null
      ? { ok: false, issues: ["X fixture is not installed"] } : { ok: true, value: installed });
  }, deleteGrants, async (decision, signal) => { grantDialogs.push(decision); return grantDialog(decision, signal); });
  services.push(service);
  const handle = (request: WithoutBinding<AppHostXRequest>) => service.handle({ ...request, accountId: account.id, expectedAccountRevision: initialRevision } as AppHostXRequest);
  const prepare = async () => action(await handle({ action: "x.action.prepare", intent: { action: "like", postId: "42" } } as never));
  return { service, handle, prepare, inputs, cancellations, setOutput: (value: unknown) => { output = value; },
    setRevision: (value: string) => { currentRevision = value; }, setNow: (value: number) => { now = value; },
    replaceAccount: (value: Partial<Pick<AppHostAccount, "id" | "subject" | "revision">>) => { account = { ...account, ...value }; currentRevision = account.revision; },
    setReadDelay: (value: typeof readDelay) => { readDelay = value; }, setConfirmation: (value: typeof confirmation) => { confirmation = value; },
    setReceipts: (value: unknown[]) => { receipts = value; }, auth, tickets,
    setSaved: (value: typeof saved) => { saved = value; }, setIncarnation: (value: string) => { currentIncarnation = value; },
    setExecution: (value: typeof execution) => { execution = value; },
    setInstalledManifest: (value: GhostgetManifest | null) => { installed = value; }, manifestReads: () => manifestReads,
    failTickets: () => { ticketFailure = true; }, deniedPlans,
    counts: () => ({ confirms, executions }),
    grant: () => project(grantState), setGrant: (value: Partial<GrantState>) => { grantState = { ...grantState, ...value }; }, setGrantAvailable: (value: boolean) => { grantAvailable = value; },
    grantWrites, grantDialogs, executionOptions, setGrantDialog: (value: typeof grantDialog) => { grantDialog = value; } };
}
function action(value: AppHostXData) { if (value.kind !== "x-action") throw new Error("wrong action result"); return value; }
const feed = { action: "x.feed.list", source: "home", profile: null, cursor: null, limit: 20 } as const;
const news = { action: "x.explore.list", source: "today-news", target: null, cursor: null, limit: 20 } as const;
function newsStoryPage(storyId = "fixture-story-876") {
  return { modelVersion: 1, source: "today-news", cursor: null, entries: [{
    kind: "trend", id: storyId,
    trend: { kind: "trend", id: storyId, source: "todays-news", title: "Fixture news", description: "News context", category: "Personalized", postCount: 12345, query: null, url: `https://x.com/i/trending/${storyId}` },
    target: { source: "today-news", kind: "story", value: storyId },
  }] };
}
async function selectNewsStory(f: ReturnType<typeof fixture>, storyId = "fixture-story-876") {
  f.setOutput(newsStoryPage(storyId));
  const page = await f.handle(news);
  if (page.kind !== "x-page" || page.entries[0]?.kind !== "trend" || page.entries[0].target === undefined) throw new Error("missing news selection");
  return page.entries[0].target;
}

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

test("dedicated repost feed preserves other-author occurrences and provider continuation", async () => {
  const f = fixture();
  const raw = (id: string) => ({ __typename: "Tweet", rest_id: id, legacy: { full_text: "fixture", user_id_str: "456" } });
  const original = projectXSocialPost(raw("41"));
  const repost = projectXSocialPost({ ...raw("42"), retweeted_status_result: { result: { ...raw("40"), quoted_status_result: { result: raw("39") } } } });
  f.setOutput({ posts: [original, repost], cursor: "private-provider-cursor" });
  const result = await f.handle({ ...feed, source: "profile-reposts" });
  if (result.kind !== "x-page") throw new Error("wrong page");
  expect(result.completeness).toBe("page");
  expect(result.entries).toEqual([{ kind: "post", id: "41", post: original }, { kind: "post", id: "42", post: repost }]);
  expect(result.nextCursor).not.toBeNull();
  expect(f.inputs.at(-1)).toEqual({ operation: "feeds.read", input: { feed: "user-reposts", user_id: "123", limit: 20 } });
  await f.handle({ ...feed, source: "profile-reposts", cursor: result.nextCursor });
  expect(f.inputs.at(-1)).toEqual({ operation: "feeds.read", input: { feed: "user-reposts", user_id: "123", limit: 20, cursor: "private-provider-cursor" } });
  f.setOutput({ posts: [original], cursor: "another-private-cursor" });
  expect(await f.handle({ ...feed, source: "profile-reposts" })).toMatchObject({ kind: "x-page", entries: [{ id: "41" }], completeness: "page" });
});

test("dedicated repost feed resolves handles and numeric profile targets consistently", async () => {
  const profile = projectXSocialProfile({ __typename: "User", rest_id: "456", legacy: { screen_name: "fixture_author" } });
  for (const target of ["456", "@fixture_author"]) {
    const f = fixture();
    f.setReadDelay(async () => {
      const invocation = f.inputs.at(-1) as { operation: string };
      f.setOutput(invocation.operation === "profiles.read" ? { profile } : { posts: [], cursor: null });
    });
    expect(await f.handle({ ...feed, source: "profile-reposts", profile: target })).toMatchObject({ kind: "x-page", entries: [], completeness: "page" });
    expect(f.inputs).toEqual([
      ...(target.startsWith("@") ? [{ operation: "profiles.read", input: { handle: "fixture_author" } }] : []),
      { operation: "feeds.read", input: { feed: "user-reposts", user_id: "456", limit: 20 } },
    ]);
  }
});

test("Today News exposes opaque Story selections and binds post continuations to the selection", async () => {
  const f = fixture();
  const target = await selectNewsStory(f);
  expect(target).toMatch(/^xdt1_[0-9a-f-]{36}$/u);
  expect(target).not.toContain("fixture-story-876");
  const otherTarget = await selectNewsStory(f, "fixture-story-877");
  const post = projectXSocialPost({ __typename: "Tweet", rest_id: "42", legacy: { full_text: "Story post", user_id_str: "456" } });
  f.setOutput({ modelVersion: 1, source: "today-news", entries: [{ kind: "post", id: post.id, post }], cursor: "private-story-cursor" });
  const page = await f.handle({ ...news, target });
  expect(page).toMatchObject({ kind: "x-page", source: "today-news", completeness: "page", entries: [{ kind: "post", id: "42", post }] });
  if (page.kind !== "x-page") throw new Error("wrong page");
  expect(page.nextCursor).not.toBeNull();
  expect(JSON.stringify(page)).not.toContain("private-story-cursor");
  expect(f.inputs.at(-1)).toEqual({ operation: "explore.read", input: { source: "today-news", limit: 20, target: canonicalJson({ source: "today-news", kind: "story", value: "fixture-story-876" }) } });
  await f.handle({ ...news, target, cursor: page.nextCursor });
  expect(f.inputs.at(-1)).toMatchObject({ operation: "explore.read", input: { cursor: "private-story-cursor", target: canonicalJson({ source: "today-news", kind: "story", value: "fixture-story-876" }) } });
  const before = f.inputs.length;
  await expect(f.handle({ ...news, target: otherTarget, cursor: page.nextCursor })).rejects.toThrow("Refresh this view");
  await expect(f.handle({ ...news, target: null, cursor: page.nextCursor })).rejects.toThrow("Refresh this view");
  await expect(f.handle({ ...news, source: "trending", target, cursor: null })).rejects.toThrow("discovery target is unavailable");
  expect(f.inputs).toHaveLength(before);
});

test("Today News Story targets reject account, subject and revision replacement before provider reads", async () => {
  for (const replacement of [{ id: "other-account" }, { subject: "456" }, { revision: "c".repeat(64) }]) {
    const f = fixture();
    const target = await selectNewsStory(f);
    f.replaceAccount(replacement);
    const before = f.inputs.length;
    await expect(f.service.handle({ ...news, target, accountId: replacement.id ?? binding.accountId, expectedAccountRevision: replacement.revision ?? revision })).rejects.toThrow("discovery target is unavailable");
    expect(f.inputs).toHaveLength(before);
  }
});

test("Today News Story selections expire, cannot survive restart and cannot be supplied as provider descriptors", async () => {
  const f = fixture();
  const target = await selectNewsStory(f);
  const before = f.inputs.length;
  for (const supplied of [canonicalJson({ source: "today-news", kind: "story", value: "fixture-story-876" }), "https://x.com/i/trending/fixture-story-876"]) {
    await expect(f.handle({ ...news, target: supplied })).rejects.toThrow("discovery target is unavailable");
  }
  f.setNow(601_000);
  await expect(f.handle({ ...news, target })).rejects.toThrow("discovery target is unavailable");
  expect(f.inputs).toHaveLength(before);
  const restarted = fixture();
  await expect(restarted.handle({ ...news, target })).rejects.toThrow("discovery target is unavailable");
  expect(restarted.inputs).toHaveLength(0);
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

test("read preparation failures have an explicit safe category and never execute a provider", async () => {
  const account: AppHostAccount = { id: "fixture", provider: "x", subject: "123", displayName: "@fixture", browser: "chrome", profile: "Default", revision, status: "configured", identityVerification: "at-connection", disconnectDigest: "d".repeat(64) };
  let executions = 0;
  const runtime = { prepareReadInvocation: () => { throw new Error("private state path and account detail"); }, executeReadInvocation: async () => { executions++; throw new Error("must not execute"); } } as unknown as Runtime;
  const service = new AppHostXService({}, providerPluginRegistry, () => account, undefined, undefined, runtime, undefined, () => ({ ok: true, value: manifest }));
  services.push(service);
  for (const request of [{ action: "x.explore.list", source: "trending", target: null, cursor: null, limit: 20 }, { action: "x.notifications.list", cursor: null, limit: 20 }] as const) {
    let failure: unknown;
    try { await service.handle({ ...request, accountId: account.id, expectedAccountRevision: revision }); }
    catch (error) { failure = error; }
    const wire = appHostFailure("fixture", failure);
    expect(wire).toMatchObject({ ok: false, code: "X_READ_PREPARATION_FAILED" });
    expect(JSON.stringify(wire)).not.toContain("private state path");
  }
  expect(executions).toBe(0);
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
  expect(f.inputs).toContainEqual({ operation: "posts.read", input: { post_id: "42" } });
  expect(f.inputs.at(-1)).toEqual({ operation: "content.delete", input: { post_id: "42", expected_text: text } });
  for (const intent of [{ action: "delete", postId: "43", expectedText: text }, { action: "delete", postId: "42", expectedText: "changed" }] as const) {
    await expect(f.handle({ action: "x.action.prepare", intent })).rejects.toThrow("deletion preview");
  }
  f.setOutput({ post: { ...post, authorId: "999" } });
  await expect(f.handle({ action: "x.action.prepare", intent: { action: "delete", postId: "42", expectedText: text } })).rejects.toThrow("deletion preview");
});

test("archived 1.20 capabilities and unsupported repost execution share the installed qualification gate", async () => {
  const installed = parseRuntimeManifest(archivedXManifest, providerPluginRegistry);
  if (!installed.ok) throw new Error(installed.issues.join("; "));
  expect(installed.value.version).toBe("1.20.0");
  const f = fixture({ installedManifest: installed.value });
  const result = await f.handle({ action: "x.capabilities" });
  if (result.kind !== "x-capabilities") throw new Error("wrong capabilities");
  expect(result.capabilities.find(item => item.name === "profile-reposts")?.supported).toBe(true);
  expect(result.capabilities.find(item => item.name === "likes")?.supported).toBe(true);
  expect(result.capabilities.find(item => item.name === "post-media-images")?.supported).toBe(false);
  expect(result.capabilities.find(item => item.name === "post-media-jpeg")?.supported).toBe(false);
  expect(result.capabilities.find(item => item.name === "post-media-video")?.supported).toBe(false);
  expect(result.capabilities.find(item => item.name === "profile-replies")?.supported).toBe(true);
  expect(result.capabilities.find(item => item.name === "profile-highlights")?.supported).toBe(true);
  expect(result.capabilities.find(item => item.name === "quote")?.supported).toBe(false);
  expect(result.capabilities.find(item => item.name === "repost")?.supported).toBe(false);
  expect(result.capabilities.find(item => item.name === "unrepost")?.supported).toBe(false);
  await expect(f.handle({ action: "x.action.prepare", intent: { action: "repost", postId: "42" } })).rejects.toThrow("reviewed provider contract");
  expect(f.inputs).toHaveLength(0);
});

function supportedCapabilities(value: AppHostXData): Readonly<Record<string, boolean>> {
  if (value.kind !== "x-capabilities") throw new Error("wrong capabilities");
  return Object.fromEntries(value.capabilities.map(item => [item.name, item.supported]));
}

for (const current of [
  { intent: { action: "quote", postId: "42", text: "Exact fixture quote" }, operation: "posts.quote", version: 3,
    input: { body: "Exact fixture quote", post_id: "42" } },
  { intent: { action: "repost", postId: "42" }, operation: "posts.repost", version: 2,
    input: { post_id: "42", reposted: true } },
  { intent: { action: "unrepost", postId: "42" }, operation: "posts.repost", version: 2,
    input: { post_id: "42", reposted: false } },
  { intent: { action: "follow", subject: "43" }, operation: "relationships.follow.set", version: 2,
    input: { user_id: "43", following: true } },
  { intent: { action: "unfollow", subject: "43" }, operation: "relationships.follow.set", version: 2,
    input: { user_id: "43", following: false } },
] as const) test(`current installed observed successors advertise and prepare ${current.intent.action} without dispatch`, async () => {
  expect(currentXManifest.operations[current.operation].webSession.contractVersion).toBe(current.version);
  const operations = xWebPlugin.bindings.flatMap<{ readonly name: string; readonly contractVersion: number; readonly state: string }>(binding => binding.operations);
  expect(operations.find(operation => operation.name === current.operation && operation.contractVersion === current.version)?.state).toBe("observed");
  const f = fixture({ installedManifest: manifest });
  const support = supportedCapabilities(await f.handle({ action: "x.capabilities" }));
  expect(support).toMatchObject({ quote: true, repost: true, unrepost: true, follow: true, unfollow: true });
  expect(f.inputs).toEqual([]);
  const prepared = action(await f.handle({ action: "x.action.prepare", intent: current.intent }));
  expect(prepared).toMatchObject({ state: "prepared", digest: planDigest, runId: `plan-${planDigest}` });
  expect(prepared.preparationId).not.toBeNull();
  expect(f.inputs).toEqual([{ operation: current.operation, input: current.input }]);
  expect(f.tickets.read(planDigest)?.operation).toBe(current.operation);
  expect(f.counts()).toEqual({ confirms: 0, executions: 0 });
});

test("installed capabilities use one read-only snapshot and never prepare an invocation", async () => {
  const f = fixture();
  const support = supportedCapabilities(await f.handle({ action: "x.capabilities" }));
  expect(support).toMatchObject({ post: true, like: true, home: true, followers: true, trending: true, notifications: true });
  // x.delete-approval.* is advertised exactly when own-post deletion is.
  expect(support["delete-approval"]).toBe(support.delete!);
  expect(support["delete-approval"]).toBeTrue();
  expect(f.manifestReads()).toBe(1);
  expect(f.inputs).toEqual([]);
  expect(f.counts()).toEqual({ confirms: 0, executions: 0 });
  f.setInstalledManifest(null);
  await expect(f.handle(feed)).rejects.toThrow("reviewed provider contract");
  await expect(f.handle({ action: "x.action.prepare", intent: { action: "post", text: "Must not prepare" } })).rejects.toThrow("reviewed provider contract");
  expect(f.inputs).toEqual([]);
});

test("installed scalar publication never advertises ordered media or prepares current array input", async () => {
  const parsed = parseRuntimeManifest(archivedXManifest, providerPluginRegistry);
  if (!parsed.ok) throw new Error(parsed.issues.join("; "));
  const f = fixture({ installedManifest: parsed.value });
  const support = supportedCapabilities(await f.handle({ action: "x.capabilities" }));
  expect(support).toMatchObject({ post: false, "post-media-images": false, "post-media-jpeg": false,
    "post-media-video": false, like: true, home: true });
  await expect(f.handle({ action: "x.action.prepare", intent: { action: "post", text: "Not the installed shape" } })).rejects.toThrow("reviewed provider contract");
  expect(f.inputs).toEqual([]);
});

test("installed missing or unreadable manifests make every capability unsupported without runtime preparation", async () => {
  for (const f of [fixture({ installedManifest: null }), fixture({ readInstalledManifest: () => {
    throw new Error("private adapter path is unsafe");
  } })]) {
    expect(Object.values(supportedCapabilities(await f.handle({ action: "x.capabilities" }))).every(value => !value)).toBeTrue();
    await expect(f.handle(feed)).rejects.toThrow("reviewed provider contract");
    await expect(f.prepare()).rejects.toThrow("reviewed provider contract");
    expect(f.inputs).toEqual([]);
  }
});

test("installed operation admission refuses unknown versions, transport, schema and replay drift", async () => {
  const publication = manifest.operations["posts.publish"]!;
  if (publication.webSession === undefined) throw new Error("missing publication recipe");
  const changes = [
    { webSession: { ...publication.webSession, contractVersion: 5 } },
    { webSession: { ...publication.webSession, contractVersion: 6 } },
    { webSession: { ...publication.webSession, contractVersion: 8 } },
    { webSession: { ...publication.webSession, site: "linkedin" } },
    { webSession: { ...publication.webSession, action: "posts.quote" } },
    { webSession: undefined, browser: { steps: [] } },
    { input: { ...publication.input, properties: { ...publication.input.properties, body: { type: "string", maxLength: 100_000 } } } },
    { risk: "R1" }, { sideEffect: "Only previews locally" }, { idempotency: "none" }, { dedupeWindowMs: 0 },
  ];
  for (const change of changes) {
    const candidate = { ...manifest, operations: { ...manifest.operations,
      "posts.publish": { ...publication, ...change } as GhostgetOperation } };
    const f = fixture({ installedManifest: candidate });
    const support = supportedCapabilities(await f.handle({ action: "x.capabilities" }));
    expect(support).toMatchObject({ post: false, "post-media-images": false, "post-media-jpeg": false, "post-media-video": false });
    await expect(f.handle({ action: "x.action.prepare", intent: { action: "post", text: "Exact text" } })).rejects.toThrow("reviewed provider contract");
    expect(f.inputs).toEqual([]);
  }
  const described = fixture({ installedManifest: { ...manifest, version: "9.0.0", operations: { ...manifest.operations,
    "posts.publish": { ...publication, description: "An alternate description grants no authority" } } } });
  expect(supportedCapabilities(await described.handle({ action: "x.capabilities" })).post).toBeTrue();
});

test("installed feed and discovery capabilities require their own current operation entries", async () => {
  const operations = Object.fromEntries(Object.entries(manifest.operations).filter(([name]) =>
    !["feeds.read", "contacts.list", "explore.read", "notifications.list"].includes(name)));
  const f = fixture({ installedManifest: { ...manifest, operations } });
  const support = supportedCapabilities(await f.handle({ action: "x.capabilities" }));
  expect(support).toMatchObject({ post: true, home: false, "profile-reposts": false, followers: false,
    "following-accounts": false, trending: false, "today-news": false, notifications: false });
  await expect(f.handle(feed)).rejects.toThrow("reviewed provider contract");
  await expect(f.handle({ ...feed, source: "followers" })).rejects.toThrow("reviewed provider contract");
  await expect(f.handle(news)).rejects.toThrow("reviewed provider contract");
  await expect(f.handle({ action: "x.notifications.list", cursor: null, limit: 20 })).rejects.toThrow("reviewed provider contract");
  expect(f.inputs).toEqual([]);
});

function defaultCapabilityReader(environment: Readonly<Record<string, string>>) {
  const account: AppHostAccount = { id: "fixture", provider: "x", subject: "123", displayName: "@fixture", browser: "chrome", profile: "Default", revision, status: "configured", identityVerification: "at-connection", disconnectDigest: "d".repeat(64) };
  const forbidden = (): never => { throw new Error("Capability inspection must not prepare or execute"); };
  const runtime = { prepareReadInvocation: forbidden, prepareInvocation: forbidden,
    executeReadInvocation: forbidden, createAndSaveInvocationPlan: forbidden } as unknown as Runtime;
  const service = new AppHostXService(environment, providerPluginRegistry, () => account, forbidden, undefined, runtime);
  services.push(service);
  const request = { ...binding, action: "x.capabilities" } as const;
  return () => service.handle(request);
}

function capabilityStateSnapshot(state: string) {
  return Object.fromEntries([[".", { kind: "directory", mode: statSync(state).mode & 0o777 }],
    ...readdirSync(state, { recursive: true, withFileTypes: true }).map(entry => {
      const path = join(entry.parentPath, entry.name);
      return [path.slice(state.length + 1), { kind: entry.isFile() ? "file" : "directory", mode: statSync(path).mode & 0o777,
        ...(entry.isFile() ? { sha256: createHash("sha256").update(readFileSync(path)).digest("hex") } : {}) }];
    })]);
}

test("installed default capability reader preserves absent and installed state bytes and modes", async () => {
  const root = mkdtempSync(join(tmpdir(), "ghostget-x-capability-read-")); roots.push(root);
  const state = join(root, "state"), environment = { GHOSTGET_STATE_HOME: state };
  const inspect = defaultCapabilityReader(environment);
  expect(Object.values(supportedCapabilities(await inspect())).every(value => !value)).toBeTrue();
  expect(existsSync(state)).toBeFalse();
  expect(readdirSync(root)).toEqual([]);
  installManifest(manifest, { force: false, environment, registry: providerPluginRegistry });
  const before = capabilityStateSnapshot(state);
  expect(supportedCapabilities(await inspect())).toMatchObject({ post: true, home: true, trending: true });
  expect(capabilityStateSnapshot(state)).toEqual(before);
});

test("installed capability inspection does not adopt empty or legacy unmarked state", async () => {
  for (const legacyManifest of [false, true]) {
    const root = mkdtempSync(join(tmpdir(), "ghostget-x-unmarked-capability-")); roots.push(root);
    const state = join(root, "state"), environment = { GHOSTGET_STATE_HOME: state };
    mkdirSync(state, { mode: legacyManifest ? 0o700 : 0o755 });
    chmodSync(state, legacyManifest ? 0o700 : 0o755);
    if (legacyManifest) {
      const adapter = join(state, "adapters", "x-web");
      mkdirSync(adapter, { recursive: true, mode: 0o700 });
      writeFileSync(join(adapter, "io-adapter.json"), JSON.stringify(manifest) + "\n", { mode: 0o600 });
    }
    const before = capabilityStateSnapshot(state);
    expect(Object.values(supportedCapabilities(await defaultCapabilityReader(environment)())).every(value => !value)).toBeTrue();
    expect(capabilityStateSnapshot(state)).toEqual(before);
    expect(existsSync(join(state, ".io-state.json"))).toBeFalse();
    expect(statSync(state).mode & 0o777).toBe(legacyManifest ? 0o700 : 0o755);
  }
});

test("installed capability inspection cannot recreate a marker or root lost between admission and reading", async () => {
  for (const loss of ["marker", "root"] as const) {
    const root = mkdtempSync(join(tmpdir(), "ghostget-x-capability-loss-")); roots.push(root);
    const state = join(root, "state"), retained = join(root, "retained-state");
    installManifest(manifest, { force: false, environment: { GHOSTGET_STATE_HOME: state }, registry: providerPluginRegistry });
    let selections = 0;
    let afterLoss: ReturnType<typeof capabilityStateSnapshot> | undefined;
    // The second selection occurs inside the normal loader, after inspection
    // has remembered the claimed root. No production race hook is needed.
    const environment = { get GHOSTGET_STATE_HOME() {
      if (++selections === 2) {
        if (loss === "marker") unlinkSync(join(state, ".io-state.json"));
        else renameSync(state, retained);
        afterLoss = capabilityStateSnapshot(loss === "marker" ? state : retained);
      }
      return state;
    } };
    expect(Object.values(supportedCapabilities(await defaultCapabilityReader(environment)())).every(value => !value)).toBeTrue();
    expect(selections).toBe(2);
    expect(afterLoss).toBeDefined();
    expect(capabilityStateSnapshot(loss === "marker" ? state : retained)).toEqual(afterLoss);
    if (loss === "marker") expect(existsSync(join(state, ".io-state.json"))).toBeFalse();
    else expect(existsSync(state)).toBeFalse();
  }
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
  const receipt = { planDigest, operation: "likes.set", adapter: { id: "x-web" }, auth: { id: binding.accountId, hash: createHash("sha256").update(canonicalJson(f.auth)).digest("hex") }, status: "succeeded", runId: "01234567-89ab-cdef-0123-456789abcdef" };
  f.setReceipts([{ ...receipt, auth: { ...receipt.auth, id: "other" } }]);
  expect(action(await f.handle(status)).state).toBe("uncertain");
  f.setReceipts([receipt]);
  expect(action(await f.handle(status)).state).toBe("completed");
  f.setReceipts([receipt, receipt]);
  expect(action(await f.handle(status)).state).toBe("uncertain");
  expect(f.counts()).toEqual({ confirms: 0, executions: 0 });
});

test("cancel and shutdown release unused plans; archived 1.20 repost performs no provider read", async () => {
  const f = fixture(); const prepared = await f.prepare();
  await f.handle({ action: "x.action.cancel", preparationId: prepared.preparationId! } as never);
  expect(f.cancellations).toEqual([planDigest]);
  await f.prepare(); f.service.close();
  expect(f.cancellations).toEqual([planDigest, planDigest]);
  const installed = parseRuntimeManifest(archivedXManifest, providerPluginRegistry);
  if (!installed.ok) throw new Error(installed.issues.join("; "));
  expect(installed.value.version).toBe("1.20.0");
  const other = fixture({ installedManifest: installed.value });
  await expect(other.handle({ action: "x.action.prepare", intent: { action: "repost", postId: "42" } } as never)).rejects.toThrow("reviewed provider contract");
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

test("stable-handle cancellation releases unused preparation capacity immediately", async () => {
  const f = fixture();
  for (let index = 0; index < 40; index++) {
    const prepared = await f.prepare();
    expect(action(await f.handle({ action: "x.action.cancel", preparationId: prepared.runId! })).state).toBe("denied");
  }
  expect(action(await f.prepare()).state).toBe("prepared");
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
  const receipt = { planDigest, operation: "likes.set", adapter: { id: "x-web" }, auth: { id: binding.accountId, hash: createHash("sha256").update(canonicalJson(original.auth)).digest("hex") }, status: "succeeded", runId: "01234567-89ab-cdef-0123-456789abcdef" };
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
  f.setReceipts([{ planDigest, operation: "likes.set", adapter: { id: "x-web" }, auth: { id: binding.accountId, hash: original.authHash }, status: "succeeded", runId: "01234567-89ab-cdef-0123-456789abcdef" }]);
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
  const receipt = { planDigest, operation: "likes.set", adapter: { id: "x-web" }, auth: { id: binding.accountId, hash: createHash("sha256").update(canonicalJson(original.auth)).digest("hex") }, status: "indeterminate", runId: "01234567-89ab-cdef-0123-456789abcdef" };
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

for (const contractVersion of [6, 7] as const) test(`publication v${contractVersion} preserves ordered 1–4 images, one video and text-only inputs`, () => {
  expect(appHostXPublicationInput({ action: "post", text: "hello" }, [], contractVersion)).toEqual({ body: "hello" });
  for (let count = 1; count <= 4; count++) {
    const selected = Array.from({ length: count }, (_, index) => ({ path: `/staged/${index}`, media: attachment(index + 1, index % 2 === 0 ? "image/png" : "image/jpeg") }));
    expect(appHostXPublicationInput({ action: "post", text: "hello" }, selected, contractVersion)).toEqual({ body: "hello", media: selected.map(item => item.path), media_types: selected.map(item => item.media.mediaType) });
  }
  const video = { path: "/staged/video", media: attachment(1, "video/mp4") };
  expect(appHostXPublicationInput({ action: "post", text: "video" }, [video], contractVersion)).toEqual({ body: "video", media: [video.path], media_types: ["video/mp4"] });
  expect(() => appHostXPublicationInput({ action: "post" }, [video, { path: "/staged/image", media: attachment(2) }], contractVersion)).toThrow("four images or one video");
  expect(() => appHostXPublicationInput({ action: "reply", postId: "42" }, [video], contractVersion)).toThrow("reviewed provider contract");
  expect(() => appHostXPublicationInput({ action: "quote", postId: "42" }, [video], contractVersion)).toThrow("reviewed provider contract");
  expect(appHostXPublicationInput({ action: "reply", postId: "42", text: "reply" }, [], contractVersion)).toEqual({ body: "reply", post_id: "42" });
  expect(appHostXPublicationInput({ action: "post" }, [video], 5)).toEqual({ body: "", media: video.path, media_type: "video/mp4" });
  expect(() => appHostXPublicationInput({ action: "post" }, [{ path: "/staged/jpeg", media: attachment(1, "image/jpeg") }], 5)).toThrow("JPEG publishing needs");
  expect(() => appHostXPublicationInput({ action: "post" }, [{ path: "/staged/1", media: attachment(1) }, { path: "/staged/2", media: attachment(2) }], 5)).toThrow("Multiple images need");
});

test("qualified ordered-media publication becomes default without activating its reservation", async () => {
  const version = currentXManifest.operations["posts.publish"].webSession.contractVersion;
  const operations = xWebPlugin.bindings.flatMap<{ readonly name: string; readonly contractVersion: number; readonly state: string }>(binding => binding.operations);
  expect(version).toBe(7);
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

const deleteApprovalGet = { action: "x.delete-approval.get" } as const;
const deleteApprovalSet = (unattended: boolean) => ({ action: "x.delete-approval.set", unattended }) as const;
const ownPostText = "Own post to delete";
async function prepareIntent(f: ReturnType<typeof fixture>, intent: "delete" | "like" | "repost" | "bookmark" | "follow") {
  if (intent === "delete") f.setOutput({ post: projectXSocialPost({ __typename: "Tweet", rest_id: "42", legacy: { full_text: ownPostText, user_id_str: "123" } }) });
  const value = intent === "delete" ? { action: "delete", postId: "42", expectedText: ownPostText } : intent === "follow" ? { action: "follow", subject: "77" } : { action: intent, postId: "42" };
  return action(await f.handle({ action: "x.action.prepare", intent: value } as never));
}

test("delete approval requests are closed: exact fields and a boolean unattended only", () => {
  expect(parseAppHostXRequest({ ...binding, ...deleteApprovalGet })).toEqual({ ...binding, ...deleteApprovalGet });
  expect(parseAppHostXRequest({ ...binding, ...deleteApprovalSet(true) })).toEqual({ ...binding, ...deleteApprovalSet(true) });
  expect(parseAppHostXRequest({ ...binding, ...deleteApprovalSet(false) })).toEqual({ ...binding, ...deleteApprovalSet(false) });
  for (const request of [
    { ...deleteApprovalGet, unattended: true },
    { ...deleteApprovalGet, approved: true },
    { action: "x.delete-approval.set" },
    { ...deleteApprovalSet(true), approved: true },
    { ...deleteApprovalSet(true), operation: "content.delete" },
    { ...deleteApprovalSet(true), accountId: undefined },
    { action: "x.delete-approval.set", unattended: "true" },
    { action: "x.delete-approval.set", unattended: 1 },
    { action: "x.delete-approval.set", unattended: null },
  ]) expect(() => parseAppHostXRequest({ ...binding, ...request })).toThrow();
  expect(() => parseAppHostXRequest({ action: "x.delete-approval.get", accountId: "fixture" })).toThrow();
});

test("delete approval parser rejects arbitrary extra fields and non-boolean unattended values", () => {
  assertProperty(fc.property(
    fc.constantFrom("x.delete-approval.get", "x.delete-approval.set"),
    fc.string({ minLength: 1, maxLength: 12 }).filter(key => !["action", "accountId", "expectedAccountRevision", "unattended", "__proto__"].includes(key)),
    fc.jsonValue(),
    (name, key, value) => {
      const base = name === "x.delete-approval.set" ? { ...binding, action: name, unattended: true } : { ...binding, action: name };
      expect(() => parseAppHostXRequest({ ...base, [key]: value })).toThrow();
    },
  ));
  assertProperty(fc.property(fc.anything().filter(value => typeof value !== "boolean"), value => {
    expect(() => parseAppHostXRequest({ ...binding, action: "x.delete-approval.set", unattended: value })).toThrow();
  }));
});

type GrantCase = Readonly<{ decision: PermissionDecision | "unmanaged"; ownerGrant: boolean }>;
const grantCases: readonly GrantCase[] = (["allow", "ask", "deny", "unmanaged"] as const).flatMap(decision => [false, true].map(ownerGrant => ({ decision, ownerGrant })));
/** The effective explicit Allow: a managed Allow, or an owner record while unmanaged. A managed Ask or Deny always wins. */
const effectiveAllow = ({ decision, ownerGrant }: GrantCase) => decision === "allow" || (decision === "unmanaged" && ownerGrant);

test("delete approval get reports the effective explicit Allow, in the shared envelope", async () => {
  for (const grantCase of grantCases) {
    const f = fixture({ deleteDecision: grantCase.decision, ownerGrant: grantCase.ownerGrant });
    expect(await f.handle(deleteApprovalGet)).toEqual({ modelVersion: 1, accountId: "fixture", accountRevision: revision, fetchedAt: new Date(1000).toISOString(), kind: "x-delete-approval", unattended: effectiveAllow(grantCase) });
    expect(f.grantDialogs).toHaveLength(0); expect(f.grantWrites).toHaveLength(0);
  }
  await expect(fixture({ deleteDecision: "unavailable" }).handle(deleteApprovalGet)).rejects.toThrow("deletion setting");
});

test("delete approval requests reject a changed account revision without a dialog or write", async () => {
  for (const request of [deleteApprovalGet, deleteApprovalSet(true), deleteApprovalSet(false)]) {
    const f = fixture({ deleteDecision: "allow" }); f.setRevision("c".repeat(64)); f.setGrantDialog(async () => true);
    await expect(f.handle(request)).rejects.toThrow("ACCOUNT_CHANGED");
    expect(f.grantDialogs).toHaveLength(0); expect(f.grantWrites).toHaveLength(0);
  }
});

test("enabling unattended deletion shows the fixed dialog and writes the grant only on approval", async () => {
  const cancelled = fixture();
  expect(await cancelled.handle(deleteApprovalSet(true))).toMatchObject({ kind: "x-delete-approval", unattended: false });
  expect(cancelled.grantDialogs).toEqual([{ subject: "123", displayName: "@fixture" }]);
  expect(cancelled.grantWrites).toEqual([]);

  const approved = fixture({ deleteDecision: "deny" }); approved.setGrantDialog(async () => true);
  expect(await approved.handle(deleteApprovalSet(true))).toMatchObject({ kind: "x-delete-approval", unattended: true });
  expect(approved.grantWrites).toEqual(["allow"]);
  expect(await approved.handle(deleteApprovalGet)).toMatchObject({ unattended: true });
  // An existing grant is reported without a second dialog or write.
  expect(await approved.handle(deleteApprovalSet(true))).toMatchObject({ unattended: true });
  expect(approved.grantDialogs).toHaveLength(1); expect(approved.grantWrites).toEqual(["allow"]);
});

test("unmanaged state records the owner grant without turning on permission management", async () => {
  const cancelled = fixture({ deleteDecision: "unmanaged" });
  expect(await cancelled.handle(deleteApprovalSet(true))).toMatchObject({ unattended: false });
  expect(cancelled.grantDialogs).toHaveLength(1); expect(cancelled.grantWrites).toEqual([]);

  const approved = fixture({ deleteDecision: "unmanaged" }); approved.setGrantDialog(async () => true);
  expect(await approved.handle(deleteApprovalSet(true))).toMatchObject({ kind: "x-delete-approval", unattended: true });
  expect(approved.grantWrites).toEqual(["record"]);
  expect(approved.grant().decision).toBe("unmanaged");
  expect(await approved.handle(deleteApprovalSet(true))).toMatchObject({ unattended: true });
  expect(approved.grantDialogs).toHaveLength(1);

  // A managed Ask or Deny wins over a standing owner record: the dialog shows again and writes the managed Allow.
  const overridden = fixture({ deleteDecision: "ask", ownerGrant: true }); overridden.setGrantDialog(async () => true);
  expect(await overridden.handle(deleteApprovalGet)).toMatchObject({ unattended: false });
  expect(await overridden.handle(deleteApprovalSet(true))).toMatchObject({ unattended: true });
  expect(overridden.grantDialogs).toHaveLength(1); expect(overridden.grantWrites).toEqual(["allow"]);
});

test("enabling unattended deletion fails closed when the setting is unavailable or changes during the dialog", async () => {
  const unavailable = fixture({ deleteDecision: "unavailable" }); unavailable.setGrantDialog(async () => true);
  await expect(unavailable.handle(deleteApprovalSet(true))).rejects.toThrow("deletion setting");
  expect(unavailable.grantDialogs).toHaveLength(0);

  for (const change of [{ revision: 9 }, { grantRevision: 9 }, { decision: "ask" }] as const) {
    for (const decision of ["deny", "unmanaged"] as const) {
      const changed = fixture({ deleteDecision: decision }); changed.setGrantDialog(async () => { changed.setGrant(change); return true; });
      await expect(changed.handle(deleteApprovalSet(true))).rejects.toThrow("permissions changed");
      expect(changed.grantWrites).toHaveLength(0);
    }
  }

  const replaced = fixture(); replaced.setGrantDialog(async () => { replaced.setRevision("c".repeat(64)); return true; });
  await expect(replaced.handle(deleteApprovalSet(true))).rejects.toThrow("ACCOUNT_CHANGED");
  expect(replaced.grantWrites).toHaveLength(0);

  const closed = fixture(); closed.setGrantDialog(async (_decision, signal) => { closed.service.close(); return !signal.aborted; });
  await expect(closed.handle(deleteApprovalSet(true))).rejects.toThrow("closed");
  expect(closed.grantWrites).toHaveLength(0);
});

test("one native dialog at a time: a pending action confirmation blocks the grant dialog", async () => {
  const f = fixture(); const prepared = await f.prepare(); let release!: (value: boolean) => void;
  f.setConfirmation(() => new Promise(resolve => { release = resolve; })); f.setGrantDialog(async () => true);
  const commit = f.handle({ action: "x.action.commit", preparationId: prepared.preparationId!, digest: prepared.digest! } as never);
  await expect(f.handle(deleteApprovalSet(true))).rejects.toThrow("Finish the current confirmation");
  release(false); await commit;
  expect(f.grantDialogs).toHaveLength(0); expect(f.grantWrites).toHaveLength(0);
});

test("disabling unattended deletion removes the owner record and turns a managed Allow into Ask, without a dialog", async () => {
  for (const grantCase of grantCases) {
    const f = fixture({ deleteDecision: grantCase.decision, ownerGrant: grantCase.ownerGrant }); f.setGrantDialog(async () => true);
    expect(await f.handle(deleteApprovalSet(false))).toMatchObject({ kind: "x-delete-approval", unattended: false });
    expect(f.grantDialogs).toHaveLength(0);
    expect(f.grantWrites).toEqual([...(grantCase.ownerGrant ? ["remove-record"] : []), ...(grantCase.decision === "allow" ? ["ask"] : [])]);
    expect(f.grant().decision).toBe(grantCase.decision === "allow" ? "ask" : grantCase.decision);
  }
});

test("an effective explicit Allow skips the action dialog for an own-post deletion and requires that Allow at dispatch", async () => {
  for (const grantCase of [{ deleteDecision: "allow" }, { deleteDecision: "unmanaged", ownerGrant: true }] as const) {
    const f = fixture(grantCase); f.setConfirmation(async () => { throw new Error("must not confirm"); });
    const prepared = await prepareIntent(f, "delete");
    expect(action(await f.handle({ action: "x.action.commit", preparationId: prepared.preparationId!, digest: prepared.digest! })).state).toBe("completed");
    expect(f.counts()).toEqual({ confirms: 0, executions: 1 });
    expect(f.executionOptions[0]).toMatchObject({ requireExplicitAllow: true });
  }
});

test("a grant revoked after preparation restores the action dialog", async () => {
  for (const grantCase of [{ deleteDecision: "allow" }, { deleteDecision: "unmanaged", ownerGrant: true }] as const) {
    const f = fixture(grantCase); f.setConfirmation(async () => false);
    const prepared = await prepareIntent(f, "delete");
    await f.handle(deleteApprovalSet(false));
    expect(action(await f.handle({ action: "x.action.commit", preparationId: prepared.preparationId!, digest: prepared.digest! })).state).toBe("denied");
    expect(f.counts()).toEqual({ confirms: 1, executions: 0 });
  }
});

test("the action dialog is skipped iff the intent is delete and the account holds an effective explicit Allow", async () => {
  await assertAsyncProperty(fc.asyncProperty(
    fc.constantFrom("allow", "ask", "deny", "unmanaged", "unavailable") as fc.Arbitrary<"allow" | "ask" | "deny" | "unmanaged" | "unavailable">,
    fc.boolean(),
    fc.constantFrom("delete", "like", "repost", "bookmark", "follow") as fc.Arbitrary<"delete" | "like" | "repost" | "bookmark" | "follow">,
    fc.boolean(),
    async (decision, ownerGrant, intent, answer) => {
      const f = fixture({ deleteDecision: decision, ownerGrant }); f.setConfirmation(async () => answer);
      try {
        const prepared = await prepareIntent(f, intent);
        const result = action(await f.handle({ action: "x.action.commit", preparationId: prepared.preparationId!, digest: prepared.digest! }));
        const skipped = intent === "delete" && decision !== "unavailable" && effectiveAllow({ decision, ownerGrant });
        expect(f.counts()).toEqual({ confirms: skipped ? 0 : 1, executions: skipped || answer ? 1 : 0 });
        expect(result.state).toBe(skipped || answer ? "completed" : "denied");
        expect(f.executionOptions.map(value => (value as { requireExplicitAllow?: boolean }).requireExplicitAllow === true)).toEqual(skipped ? [true] : answer ? [false] : []);
        expect(f.grantDialogs).toHaveLength(0); expect(f.grantWrites).toHaveLength(0);
      } finally { f.service.close(); }
    },
  ));
});

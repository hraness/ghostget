import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { canonicalJson } from "./canonical-json";
import type { AppHostAccount } from "./app-host-protocol";
import type { AppHostXData, AppHostXEntry, AppHostXIntent, AppHostXMedia, AppHostXRequest } from "./app-host-x-protocol";
import { APP_HOST_X_ACTIONS, APP_HOST_X_FEEDS } from "./app-host-x-protocol";
import { confirmAppHostXAction } from "./app-host-x-confirmation";
import { ControlError, record } from "./control/validation";
import type { ControlEnvironment } from "./control/web-policy";
import type { OperationInput } from "./model";
import type { ProviderPluginRegistry } from "./provider-plugin-registry";
import * as appRuntime from "./runtime";
import type { StoredPlan } from "./runtime";
import { isPlanBoundFile, summarizePlanFile } from "./plan-assets";
import { createPrivateJsonIfAbsent, ensurePrivateStateDirectory, ghostgetStateHome, isStateHelperArtifactName, listPrivateStateDirectory, privateStateFilesMayExist, readPrivateStateFileIfPresent } from "./storage";
type Runtime = Pick<typeof appRuntime, "cancelInvocationPlan" | "cancelUnstartedInvocationPlan" | "invocationPlanWasCancelled" | "confirmInvocation" | "createAndSaveInvocationPlan" | "executeReadInvocation" | "prepareInvocation" | "prepareReadInvocation" | "listRunReceipts" | "readRunReceipt">;
import { webSessionContractDefinitions } from "./web-session-contract-definitions";
import { readBoundXWebMedia } from "./providers/x-web-media";
import { parseXSocialPost, parseXSocialProfile, parseXSocialTrend, parseXSocialNotification, type XSocialProfile } from "./providers/x-web-model";
import { xWebWorkspaceReadSupport } from "./providers/x-web-workspace-reads";
import { XWebDiscoveryTargetStore, parseXWebDiscoveryTarget } from "./providers/x-web-captured-reads";

type Media = { accountId: string; revision: string; expires: number; path: string; media: AppHostXMedia };
type Preparation = { accountId: string; revision: string; expires: number; stored: StoredPlan; review: string; phase: "prepared" | "confirming" | "executing" | "settled" | "cancelled"; confirmation: AbortController | null; released: boolean };
export type AppHostXActionTicket = Readonly<{ schemaVersion: 1; digest: string; accountId: string; revision: string; authHash: string; incarnationHash: string; operation: string }>;
export type AppHostXActionTickets = { readonly save: (ticket: AppHostXActionTicket) => void; readonly read: (digest: string) => AppHostXActionTicket | null };
export const APP_HOST_X_MAX_ACTION_TICKETS = 4096;
const MAX_ACTION_TICKET_BYTES = 16_384;
/** Internal store. The app-host control owner lock serializes all admitted writers. */
export function appHostXActionTickets(environment: ControlEnvironment, listEntries: typeof listPrivateStateDirectory = listPrivateStateDirectory): AppHostXActionTickets {
  const path = (digest: string): string => {
    if (!/^[a-f0-9]{64}$/u.test(digest)) throw new Error("invalid app-host action digest");
    const directory = join(ghostgetStateHome(environment), "app-host-x-actions");
    return join(directory, `${digest}.json`);
  };
  const read = (digest: string): AppHostXActionTicket | null => {
    if (!/^[a-f0-9]{64}$/u.test(digest)) throw new Error("invalid app-host action digest");
    if (!privateStateFilesMayExist("app-host-x-actions", [`${digest}.json`], environment)) return null;
    const text = readPrivateStateFileIfPresent(path(digest), MAX_ACTION_TICKET_BYTES, "app-host X action ticket", environment);
    if (text === null) return null;
    const value = record(JSON.parse(text));
    if (canonicalJson(Object.keys(value).sort()) !== canonicalJson(["schemaVersion", "digest", "accountId", "revision", "authHash", "incarnationHash", "operation"].sort())
      || value.schemaVersion !== 1 || value.digest !== digest
      || ![value.authHash, value.incarnationHash].every(hash => typeof hash === "string" && /^[a-f0-9]{64}$/u.test(hash))
      || ![value.accountId, value.revision, value.operation].every(field => typeof field === "string" && field.length > 0 && field.length <= 4096)) throw new Error("invalid app-host X action ticket");
    return value as AppHostXActionTicket;
  };
  return { read, save: ticket => {
    const existing = read(ticket.digest);
    if (existing !== null) {
      if (canonicalJson(existing) !== canonicalJson(ticket)) throw new Error("app-host X action ticket changed");
      return;
    }
    if (Buffer.byteLength(JSON.stringify(ticket)) + 1 > MAX_ACTION_TICKET_BYTES) throw new Error("app-host X action ticket exceeds its byte bound");
    const directory = join(ghostgetStateHome(environment), "app-host-x-actions");
    ensurePrivateStateDirectory(directory, environment);
    const entries = listEntries(directory, environment).filter(entry => !isStateHelperArtifactName(entry.name));
    if (entries.some(entry => entry.kind !== "file" || !/^[a-f0-9]{64}\.json$/u.test(entry.name))) throw new Error("app-host X action history contains unexpected state");
    if (entries.length >= APP_HOST_X_MAX_ACTION_TICKETS) throw new ControlError("ACTION_HISTORY_LIMIT", "The retained action history is full. Inspect existing results; no new action was prepared and no recovery evidence was removed.");
    if (!createPrivateJsonIfAbsent(path(ticket.digest), ticket, { environment, privateParent: true }).created
      && canonicalJson(read(ticket.digest)) !== canonicalJson(ticket)) throw new Error("app-host X action ticket changed");
  } };
}

/** The publication contract alone chooses the attachment shape. */
export function appHostXPublicationInput(intent: AppHostXIntent, selected: readonly { path: string; media: AppHostXMedia }[], contractVersion: number): Readonly<Record<string, unknown>> {
  if (selected.length > 4 || selected.some(item => item.media.mediaType === "video/mp4") && selected.length !== 1) throw new ControlError("MEDIA_CHANGED", "Choose up to four images or one video.");
  if (selected.length > 0 && intent.action !== "post") throw new ControlError("CAPTURE_REQUIRED", "Media replies and quotes need a reviewed provider contract.");
  const input = { body: intent.text ?? "", ...(intent.postId === undefined ? {} : { post_id: intent.postId }) };
  if (selected.length === 0) return input;
  if (contractVersion === 6) return { ...input, media: selected.map(item => item.path), media_types: selected.map(item => item.media.mediaType) };
  if (selected.length !== 1) throw new ControlError("CAPTURE_REQUIRED", "Multiple images need the reviewed array publication contract.");
  if (selected[0]!.media.mediaType === "image/jpeg") throw new ControlError("CAPTURE_REQUIRED", "JPEG publishing needs the reviewed array publication contract. Choose PNG for the current publication route.");
  return { ...input, media: selected[0]!.path, media_type: selected[0]!.media.mediaType };
}

/** Review the immutable plan's bytes, refusing stale or changed staging metadata. */
export function appHostXPlanAttachments(stored: StoredPlan, selected: readonly AppHostXMedia[]): readonly AppHostXMedia[] {
  const input = stored.plan.input;
  const files = input.media === undefined ? [] : Array.isArray(input.media) ? input.media : [input.media];
  const types = input.media === undefined ? [] : Array.isArray(input.media) ? input.media_types : [input.media_type];
  if (!Array.isArray(types) || files.length !== selected.length || types.length !== selected.length) throw new ControlError("MEDIA_CHANGED", "The prepared attachments changed. Select them again.");
  return files.map((file, index) => {
    if (!isPlanBoundFile(file)) throw new ControlError("MEDIA_CHANGED", "The prepared attachment is not bound to immutable bytes.");
    const summary = summarizePlanFile(file);
    const expected = selected[index]!;
    if (summary.sha256 !== expected.sha256 || summary.bytes !== expected.byteLength || summary.mediaType !== expected.mediaType || types[index] !== expected.mediaType) throw new ControlError("MEDIA_CHANGED", "The prepared attachments changed. Select them again.");
    return { ...expected, sha256: summary.sha256, byteLength: summary.bytes, mediaType: summary.mediaType as AppHostXMedia["mediaType"] };
  });
}
const ACTIONS: Readonly<Record<string, string>> = { post: "posts.publish", reply: "replies.create", quote: "posts.quote", delete: "content.delete", like: "likes.set", unlike: "likes.set", repost: "posts.repost", unrepost: "posts.repost", bookmark: "content.save", unbookmark: "content.save", follow: "relationships.follow.set", unfollow: "relationships.follow.set" };

/** One account/revision-bound semantic facade over the normal durable runtime. */
export class AppHostXService {
  private readonly media = new Map<string, Media>();
  private readonly preparations = new Map<string, Preparation>();
  private readonly runs = new Map<string, { accountId: string; revision: string; digest: string }>();
  private closed = false;
  private readonly controller = new AbortController();
  private committing = false;
  private preparing = 0;
  private staging = 0;
  private readonly cursors = new Map<string, { key: string; value: string; expires: number }>();
  private mediaRoot: string | null = null;
  private readonly discoveryTargets: XWebDiscoveryTargetStore;
  constructor(private readonly environment: ControlEnvironment, private readonly registry: ProviderPluginRegistry,
    private readonly requireAccount: (id: string, revision: string) => AppHostAccount,
    private readonly confirm: (review: string, signal: AbortSignal) => Promise<boolean> = confirmAppHostXAction,
    private readonly now: () => number = Date.now,
    private readonly runtime: Runtime = appRuntime,
    private readonly tickets: AppHostXActionTickets = appHostXActionTickets(environment)) { this.discoveryTargets = new XWebDiscoveryTargetStore(now); }

  close(): void {
    this.closed = true; this.controller.abort();
    for (const value of this.preparations.values()) { try { this.discardPreparation(value); } catch { /* Retained runtime evidence remains authoritative. */ } }
    this.cursors.clear(); this.discoveryTargets.clear();
    if (this.mediaRoot !== null) rmSync(this.mediaRoot, { recursive: true, force: true });
    this.media.clear(); this.preparations.clear(); this.runs.clear(); this.mediaRoot = null;
  }
  private expire(): void {
    for (const [id, value] of this.cursors) if (value.expires <= this.now()) this.cursors.delete(id);
    for (const [id, value] of this.media) if (value.expires <= this.now()) { rmSync(value.path, { force: true }); this.media.delete(id); }
    for (const [id, value] of this.preparations) if (value.expires <= this.now()) {
      if (value.phase === "executing") continue;
      this.discardPreparation(value);
      this.preparations.delete(id);
    }
  }
  private discardPreparation(pending: Preparation): boolean {
    if (pending.phase === "executing" || pending.phase === "settled") return false;
    pending.phase = "cancelled";
    pending.confirmation?.abort();
    if (!pending.released) pending.released = this.runtime.cancelUnstartedInvocationPlan(pending.stored.digest, this.environment);
    return pending.released;
  }
  private operationSupported(operation: string): boolean {
    const definitions = webSessionContractDefinitions.x as Readonly<Record<string, { state: string }>>;
    return definitions[operation]?.state === "observed";
  }
  private requireSupported(operation: string): void {
    if (!this.operationSupported(operation)) throw new ControlError("CAPTURE_REQUIRED", "This X feature needs a reviewed provider contract before it can run.");
  }
  private async read(account: AppHostAccount, operation: string, input: OperationInput): Promise<Record<string, unknown>> {
    this.requireSupported(operation);
    const invocation = this.runtime.prepareReadInvocation("x-web", operation, input, account.id, this.environment, this.registry);
    const result = await this.runtime.executeReadInvocation(invocation, { headed: false, registry: this.registry, environment: this.environment, signal: this.controller.signal });
    if (this.closed) throw new ControlError("HOST_CLOSED", "The app host has closed.");
    this.requireAccount(account.id, account.revision);
    if (result.receipt.status !== "succeeded") throw new ControlError("X_READ_FAILED", "X could not verify this read. Refresh after checking the connection.");
    return record(result.output);
  }
  private richEntries(output: Record<string, unknown>, kind: "post" | "profile", maximum: number): AppHostXEntry[] | null {
    if (output.entries === undefined) return null;
    if (!Array.isArray(output.entries) || output.entries.length > maximum || output.entriesTruncated !== undefined && typeof output.entriesTruncated !== "boolean") throw new ControlError("X_MODEL_DRIFT", "X returned an unsupported page.");
    const seen = new Set<string>();
    return output.entries.map(value => {
      const item = record(value);
      if (typeof item.id !== "string" || item.id.length === 0 || item.id.length > 512 || /[\u0000-\u001f\u007f]/u.test(item.id) || seen.has(item.id)) throw new ControlError("X_MODEL_DRIFT", "X returned an unsupported page identity.");
      seen.add(item.id);
      if (item.kind === "unavailable") {
        if (Object.keys(item).some(key => !["kind", "id", "postId", "reason"].includes(key)) || item.postId !== undefined && item.postId !== null) throw new ControlError("X_MODEL_DRIFT", "X returned an unsupported unavailable item.");
        if (item.reason !== null && (typeof item.reason !== "string" || item.reason.length > 10_000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(item.reason))) throw new ControlError("X_MODEL_DRIFT", "X returned an unsupported availability reason.");
        return { kind: "unavailable", id: item.id, reason: item.reason as string | null };
      }
      if (kind === "post" && item.kind === "post") {
        if (Object.keys(item).some(key => !["kind", "id", "post"].includes(key))) throw new ControlError("X_MODEL_DRIFT", "X returned an unsupported post item.");
        const post = parseXSocialPost(item.post);
        if (post.id !== item.id) throw new ControlError("X_MODEL_DRIFT", "X returned a mismatched post identity.");
        return { kind: "post", id: post.id, post };
      }
      if (kind === "profile" && item.kind === "profile") {
        if (Object.keys(item).some(key => !["kind", "id", "profile"].includes(key))) throw new ControlError("X_MODEL_DRIFT", "X returned an unsupported profile item.");
        const profile = parseXSocialProfile(item.profile);
        if (profile.id !== item.id) throw new ControlError("X_MODEL_DRIFT", "X returned a mismatched profile identity.");
        return { kind: "profile", id: profile.id, profile };
      }
      throw new ControlError("X_MODEL_DRIFT", "X returned an unsupported page entry.");
    });
  }
  private postEntries(output: Record<string, unknown>, maximum = 50): AppHostXEntry[] {
    const rich = this.richEntries(output, "post", maximum);
    if (rich !== null) return rich;
    if (!Array.isArray(output.posts) || output.posts.length > maximum) throw new ControlError("X_MODEL_DRIFT", "X returned an unsupported post page.");
    return output.posts.map(value => {
      const post = record(value);
      if (post.modelVersion !== 1 || typeof post.id !== "string" || typeof post.content !== "object") throw new ControlError("X_MODEL_DRIFT", "X returned an unsupported post model.");
      return { kind: "post", id: post.id as string, post: parseXSocialPost(post) };
    });
  }
  private discoveryEntries(output: Record<string, unknown>, account: AppHostAccount, source: "trending" | "today-news" | "notifications", maximum: number): AppHostXEntry[] {
    if (output.modelVersion !== 1 || output.source !== source || !Array.isArray(output.entries) || output.entries.length > maximum) throw new ControlError("X_MODEL_DRIFT", "X returned an unsupported discovery page.");
    const ids = new Set<string>();
    return output.entries.map(value => {
      const item = record(value);
      if (typeof item.id !== "string" || ids.has(item.id)) throw new ControlError("X_MODEL_DRIFT", "X repeated a discovery item identity.");
      ids.add(item.id);
      if (item.kind === "post" || item.kind === "unavailable") return this.richEntries({ entries: [item] }, "post", 1)![0]!;
      if (item.kind === "trend" && source !== "notifications") {
        if (Object.keys(item).some(key => !["kind", "id", "trend", "target"].includes(key))) throw new ControlError("X_MODEL_DRIFT", "X returned an unsupported trend item.");
        const trend = parseXSocialTrend(item.trend);
        if (trend.id !== item.id || trend.source !== (source === "today-news" ? "todays-news" : "trending")) throw new ControlError("X_MODEL_DRIFT", "X returned a mismatched trend.");
        if (item.target === undefined) return { kind: "trend", id: trend.id, trend };
        const target = parseXWebDiscoveryTarget(item.target);
        if (target.source !== source) throw new ControlError("X_MODEL_DRIFT", "X returned a mismatched news target.");
        return { kind: "trend", id: trend.id, trend, target: this.discoveryTargets.issue({ accountId: account.id, subject: account.subject, revision: account.revision }, target) };
      }
      if (item.kind === "notification" && source === "notifications") {
        if (Object.keys(item).some(key => !["kind", "id", "notification"].includes(key))) throw new ControlError("X_MODEL_DRIFT", "X returned an unsupported notification item.");
        const notification = parseXSocialNotification(item.notification);
        if (notification.id !== item.id) throw new ControlError("X_MODEL_DRIFT", "X returned a mismatched notification.");
        return { kind: "notification", id: notification.id, notification };
      }
      throw new ControlError("X_MODEL_DRIFT", "X returned an unsupported discovery item.");
    });
  }
  private async profile(account: AppHostAccount, target: string | null): Promise<XSocialProfile> {
    const handle = target === null || target === account.subject ? account.displayName?.replace(/^@/u, "") : target.replace(/^@/u, "");
    if (handle === undefined || !/^[A-Za-z0-9_]{1,15}$/u.test(handle)) throw new ControlError("X_PROFILE_TARGET", "Choose this profile by its current handle.");
    const input = { handle };
    const result = await this.read(account, "profiles.read", input);
    const value = record(result.profile);
    if (value.modelVersion !== 1 || typeof value.id !== "string") throw new ControlError("X_MODEL_DRIFT", "X returned an unsupported profile model.");
    const profile = parseXSocialProfile(value);
    if ((target === null || target === account.subject) && profile.id !== account.subject) throw new ControlError("ACCOUNT_CHANGED", "This handle no longer matches the connected account.");
    return profile;
  }
  async handle(request: AppHostXRequest): Promise<AppHostXData> {
    if (this.closed) throw new ControlError("HOST_CLOSED", "The app host has closed.");
    // Observation requests cannot cancel plans or remove their retained assets.
    if (request.action === "x.media.prepare" || request.action === "x.action.prepare"
      || request.action === "x.action.commit" || request.action === "x.action.cancel") this.expire();
    const account = this.requireAccount(request.accountId, request.expectedAccountRevision);
    const queryKey = canonicalJson({ ...request, ...("cursor" in request ? { cursor: null } : {}) });
    let providerCursor: string | null = null;
    if ("cursor" in request && request.cursor !== null) {
      const binding = this.cursors.get(request.cursor);
      if (binding === undefined || binding.expires <= this.now() || binding.key !== queryKey) throw new ControlError("CURSOR_EXPIRED", "Refresh this view before loading more results.");
      providerCursor = binding.value;
    }
    const observation = { modelVersion: 1 as const, accountId: account.id, accountRevision: account.revision, fetchedAt: new Date(this.now()).toISOString() };
    const page = (source: string, entries: readonly AppHostXEntry[], cursor: unknown = null, completeness: "page" | "complete" | "filtered" = "page"): AppHostXData => {
      this.requireAccount(request.accountId, request.expectedAccountRevision);
      if (cursor !== null && typeof cursor !== "string") throw new ControlError("X_MODEL_DRIFT", "X returned an unsupported page cursor.");
      let nextCursor: string | null = null;
      if (cursor !== null && "cursor" in request) {
        if (cursor.length > 4096) throw new ControlError("X_MODEL_DRIFT", "X returned an unsupported page cursor.");
        if (this.cursors.size >= 128) this.cursors.delete(this.cursors.keys().next().value!);
        nextCursor = randomUUID(); this.cursors.set(nextCursor, { key: queryKey, value: cursor, expires: this.now() + 600_000 });
      }
      return { ...observation, kind: "x-page", source, entries, nextCursor, completeness };
    };
    const actionResult = (state: "prepared" | "completed" | "denied" | "failed" | "uncertain", preparationId: string | null, digest: string | null, review: string | null, runId: string | null): AppHostXData =>
      ({ ...observation, kind: "x-action", state, preparationId, digest, review, runId });
    switch (request.action) {
      case "x.capabilities": return { ...observation, kind: "x-capabilities", capabilities: [
        ...APP_HOST_X_FEEDS.map(name => ({ name, supported: xWebWorkspaceReadSupport[name], reason: xWebWorkspaceReadSupport[name] ? null : "Requires a reviewed provider contract." })),
        ...APP_HOST_X_ACTIONS.map(name => ({ name, supported: this.operationSupported(ACTIONS[name]!), reason: this.operationSupported(ACTIONS[name]!) ? null : "Requires a reviewed provider contract." })),
        ...["post-media-images", "post-media-jpeg", "post-media-video"].map(name => {
          const supported = this.operationSupported("posts.publish") && (name === "post-media-video" || webSessionContractDefinitions.x["posts.publish"].contractVersion >= 6);
          return { name, supported, reason: supported ? null : "Requires the reviewed ordered-media publication contract." };
        }),
        ...(["trending", "today-news", "notifications"] as const).map(name => ({ name, supported: xWebWorkspaceReadSupport[name], reason: xWebWorkspaceReadSupport[name] ? null : "Requires a reviewed provider contract." })),
      ] };
      case "x.profile.get": {
        const profile = await this.profile(account, request.profile);
        this.requireAccount(account.id, account.revision);
        return { ...observation, kind: "x-profile", profile };
      }
      case "x.post.get": {
        const output = await this.read(account, "posts.read", { post_id: request.postId });
        const post = parseXSocialPost(output.post);
        if (post.id !== request.postId) throw new ControlError("X_MODEL_DRIFT", "X did not return the requested post.");
        return page("post", [{ kind: "post", id: post.id, post }]);
      }
      case "x.feed.list": {
        if (!xWebWorkspaceReadSupport[request.source]) throw new ControlError("CAPTURE_REQUIRED", "This X feed needs a reviewed provider contract before it can run.");
        if (request.source === "followers" || request.source === "following-accounts") {
          if (request.profile !== null && request.profile !== account.subject) throw new ControlError("X_SCOPE_UNSUPPORTED", "This relationship view currently supports the connected account only.");
          const output = await this.read(account, "contacts.list", { collection: request.source === "followers" ? "followers" : "following", limit: request.limit, ...(providerCursor === null ? {} : { cursor: providerCursor }) });
          if (!Array.isArray(output.profiles) || output.profiles.length > request.limit) throw new ControlError("X_MODEL_DRIFT", "X returned an unsupported account page.");
          const entries = this.richEntries(output, "profile", request.limit) ?? output.profiles.map(value => {
            const profile = parseXSocialProfile(value);
            return { kind: "profile" as const, id: profile.id, profile };
          });
          return page(request.source, entries, output.cursor ?? output.next_cursor ?? null, output.entriesTruncated === true ? "filtered" : "page");
        }
        if (request.source === "likes" && request.profile !== null && request.profile !== account.subject) throw new ControlError("X_SCOPE_UNSUPPORTED", "Liked posts belong to the connected account only.");
        const feed = ({ home: "for-you", following: "following", bookmarks: "bookmarks", "profile-posts": "user", "profile-reposts": "user-reposts", "profile-replies": "user-replies", "profile-highlights": "user-highlights", likes: "likes" } as Record<string, string>)[request.source];
        if (feed === undefined) throw new ControlError("CAPTURE_REQUIRED", "This X feed needs a reviewed provider contract before it can run.");
        const target = ["user", "user-replies", "user-highlights", "user-reposts"].includes(feed) ? (request.profile === null ? account.subject : /^\d{1,19}$/u.test(request.profile) ? request.profile : (await this.profile(account, request.profile)).id) : null;
        const output = await this.read(account, "feeds.read", { feed, limit: request.limit, ...(target === null ? {} : { user_id: target }), ...(providerCursor === null ? {} : { cursor: providerCursor }) });
        const entries = this.postEntries(output, request.limit);
        return page(request.source, entries, output.cursor ?? null, output.entriesTruncated === true ? "filtered" : "page");
      }
      case "x.explore.list": case "x.notifications.list": {
        const source = request.action === "x.notifications.list" ? "notifications" : request.source;
        if (!xWebWorkspaceReadSupport[source]) throw new ControlError("CAPTURE_REQUIRED", "This X discovery surface needs a reviewed provider contract before it can run.");
        const target = request.action === "x.explore.list" && request.target !== null ? this.discoveryTargets.resolve(request.target, { accountId: account.id, subject: account.subject, revision: account.revision }, request.source) : null;
        const output = await this.read(account, source === "notifications" ? "notifications.list" : "explore.read", {
          ...(source === "notifications" ? {} : { source }), limit: request.limit,
          ...(providerCursor === null ? {} : { cursor: providerCursor }), ...(target === null ? {} : { target: canonicalJson(target) }),
        });
        return page(source, this.discoveryEntries(output, account, source, request.limit), output.cursor ?? null, output.filtered === true || output.entriesTruncated === true ? "filtered" : "page");
      }
      case "x.media.prepare": {
        if (this.media.size + this.staging + request.files.length > 16) throw new ControlError("MEDIA_LIMIT", "Remove pending attachments before preparing more files.");
        this.staging += request.files.length;
        try {
        const selected = await readBoundXWebMedia({ media: request.files.map(file => ({ kind: "file", reference: file.path })), media_types: request.files.map(file => file.mediaType) }, async files => files.map(file => file.reference));
        if (this.closed) throw new ControlError("HOST_CLOSED", "The app host has closed.");
        this.requireAccount(account.id, account.revision);
        if ([...this.media.values()].reduce((total, item) => total + (item.media.byteLength ?? 0), 0) + selected.reduce((total, item) => total + item.bytes.byteLength, 0) > 512 * 1024 * 1024) throw new ControlError("MEDIA_LIMIT", "Remove pending attachments before preparing more files.");
        if (request.files.some(file => file.altText !== undefined && file.altText !== null && file.altText.length > 0)) throw new ControlError("CAPTURE_REQUIRED", "Attachment descriptions need a reviewed provider contract before publishing.");
        this.mediaRoot ??= mkdtempSync(join(tmpdir(), "ghostget-app-x-"));
        const media = selected.map((bytes, index) => {
          const file = request.files[index]!; const id = randomUUID(); const path = join(this.mediaRoot!, id);
          writeFileSync(path, bytes.bytes, { mode: 0o600, flag: "wx" });
          const dto: AppHostXMedia = { mediaId: id, mediaType: file.mediaType, filename: basename(file.path), byteLength: bytes.bytes.byteLength, sha256: createHash("sha256").update(bytes.bytes).digest("hex"), altText: file.altText ?? null };
          this.media.set(id, { accountId: account.id, revision: account.revision, expires: this.now() + 600_000, path, media: dto });
          return dto;
        });
        return { ...observation, kind: "x-media", media };
        } finally { this.staging -= request.files.length; }
      }
      case "x.action.prepare": {
        if (this.preparations.size + this.preparing >= 32) throw new ControlError("ACTION_LIMIT", "Finish or cancel a pending action first.");
        this.preparing += 1;
        let stored: StoredPlan | null = null;
        let adopted = false;
        try {
        const operation = ACTIONS[request.intent.action]!; this.requireSupported(operation);
        const input = await this.actionInput(account, request.intent);
        if (this.closed) throw new ControlError("HOST_CLOSED", "The app host has closed.");
        this.requireAccount(account.id, account.revision);
        const invocation = this.runtime.prepareInvocation("x-web", operation, input, account.id, this.environment, this.registry);
        stored = this.runtime.createAndSaveInvocationPlan(invocation, this.environment, new Date(this.now()), this.registry);
        this.requireAccount(account.id, account.revision);
        const id = randomUUID();
        const attachments = appHostXPlanAttachments(stored, this.selectedMedia(account, request.intent).map(item => item.media));
        const review = `Act as ${account.displayName ?? account.subject} (${account.subject})\nAction: ${request.intent.action}\n${canonicalJson({ input: Object.fromEntries(Object.entries(stored.plan.input).filter(([key]) => !["media", "media_type", "media_types"].includes(key))), attachments })}`;
        if (stored.plan.auth.id !== account.id || stored.plan.auth.incarnationHash === undefined || !/^[a-f0-9]{64}$/u.test(stored.plan.auth.incarnationHash)) throw new ControlError("ACCOUNT_CHANGED", "Prepare the action again for the current account connection.");
        this.tickets.save({ schemaVersion: 1, digest: stored.digest, accountId: account.id, revision: account.revision, authHash: stored.plan.auth.hash, incarnationHash: stored.plan.auth.incarnationHash, operation: stored.plan.operation });
        this.preparations.set(id, { accountId: account.id, revision: account.revision, expires: this.now() + 300_000, stored, review, phase: "prepared", confirmation: null, released: false });
        adopted = true;
        return actionResult("prepared", id, stored.digest, review, `plan-${stored.digest}`);
        } finally {
          this.preparing -= 1;
          if (stored !== null && !adopted) this.runtime.cancelInvocationPlan(stored.digest, this.environment);
        }
      }
      case "x.action.cancel": {
        if (/^plan-[a-f0-9]{64}$/u.test(request.preparationId)) {
          const digest = request.preparationId.slice(5);
          this.requireCurrentTicket(account, digest);
          const denied = this.runtime.cancelUnstartedInvocationPlan(digest, this.environment);
          if (denied) for (const [id, pending] of this.preparations) {
            if (pending.stored.digest === digest && pending.accountId === account.id && pending.revision === account.revision
              && (pending.phase === "prepared" || pending.phase === "confirming")) {
              pending.phase = "cancelled"; pending.released = true; pending.confirmation?.abort();
              this.preparations.delete(id);
            }
          }
          return actionResult(denied ? "denied" : "uncertain", null, digest, null, request.preparationId);
        }
        const pending = this.preparation(account, request.preparationId);
        if (pending.phase === "executing" || pending.phase === "settled") throw new ControlError("ACTION_USED", "This action was already submitted. Inspect its result before another action.");
        const denied = this.discardPreparation(pending); this.preparations.delete(request.preparationId);
        return actionResult(denied ? "denied" : "uncertain", request.preparationId, pending.stored.digest, null, `plan-${pending.stored.digest}`);
      }
      case "x.action.commit": {
        const pending = this.preparation(account, request.preparationId);
        if (pending.phase !== "prepared" || pending.stored.digest !== request.digest) throw new ControlError("ACTION_CHANGED", "This action expired, changed or was already submitted. Inspect its result.");
        if (this.committing) throw new ControlError("HOST_BUSY", "Finish the current confirmation before starting another action.");
        this.committing = true;
        try {
        pending.phase = "confirming";
        pending.confirmation = new AbortController();
        this.requireAccount(account.id, account.revision);
        const confirmed = await this.confirm(pending.review, AbortSignal.any([this.controller.signal, pending.confirmation.signal]));
        if (this.closed || pending.expires <= this.now()) throw new ControlError("ACTION_EXPIRED", "The confirmation expired. Inspect its result before preparing another action.");
        this.requireAccount(account.id, account.revision);
        if (pending.confirmation.signal.aborted || !confirmed) {
          const denied = this.discardPreparation(pending);
          return actionResult(denied ? "denied" : "uncertain", request.preparationId, pending.stored.digest, null, `plan-${pending.stored.digest}`);
        }
        // Once handed to the durable runtime it alone owns cleanup and uncertainty.
        pending.phase = "executing";
        const result = await this.runtime.confirmInvocation(pending.stored.digest, {
          headed: false, registry: this.registry, environment: this.environment, signal: this.controller.signal,
        });
        const receipt = result.receipt;
        if (this.runs.size >= 128) this.runs.delete(this.runs.keys().next().value!);
        this.runs.set(receipt.runId, { accountId: account.id, revision: account.revision, digest: pending.stored.digest });
        return actionResult(receipt.status === "succeeded" ? "completed" : receipt.status === "indeterminate" || receipt.status === "pending" || receipt.status === "partial" ? "uncertain" : "failed", request.preparationId, pending.stored.digest, null, `plan-${pending.stored.digest}`);
        } finally {
          this.committing = false;
          if (pending.phase === "executing") pending.phase = "settled";
          else this.discardPreparation(pending);
        }
      }
      case "x.action.status": {
        if (/^plan-[a-f0-9]{64}$/u.test(request.runId)) {
          const digest = request.runId.slice(5);
          const ticket = this.requireCurrentTicket(account, digest);
          const history = this.runtime.listRunReceipts(this.environment);
          const receipts = history.filter(receipt => !("invalid" in receipt) && receipt.planDigest === digest && receipt.adapter.id === "x-web" && receipt.operation === ticket.operation && receipt.auth.id === account.id && receipt.auth.hash === ticket.authHash);
          if (this.runtime.invocationPlanWasCancelled(digest, this.environment)) {
            return actionResult(receipts.length === 0 && !history.some(receipt => "invalid" in receipt) ? "denied" : "uncertain", null, digest, null, request.runId);
          }
          if (receipts.length !== 1 || "invalid" in receipts[0]!) return actionResult("uncertain", null, digest, null, request.runId);
          const receipt = receipts[0]!;
          return actionResult(receipt.status === "succeeded" ? "completed" : receipt.status === "failed" ? "failed" : "uncertain", null, digest, null, request.runId);
        }
        const binding = this.runs.get(request.runId);
        if (binding?.accountId !== account.id || binding.revision !== account.revision) throw new ControlError("RUN_NOT_FOUND", "This action result is unavailable in the current session. Do not retry an uncertain action.");
        this.requireTicket(account, binding.digest);
        const receipt = this.runtime.readRunReceipt(request.runId, this.environment);
        return actionResult(receipt.status === "succeeded" ? "completed" : receipt.status === "failed" ? "failed" : "uncertain", null, null, null, request.runId);
      }
    }
  }
  private preparation(account: AppHostAccount, id: string): Preparation {
    const pending = this.preparations.get(id);
    if (pending === undefined || pending.accountId !== account.id || pending.revision !== account.revision) throw new ControlError("ACTION_EXPIRED", "Prepare this action again for the current account.");
    return pending;
  }
  private requireTicket(account: AppHostAccount, digest: string): AppHostXActionTicket {
    const ticket = this.tickets.read(digest);
    if (ticket === null || ticket.accountId !== account.id || ticket.revision !== account.revision) throw new ControlError("RUN_NOT_FOUND", "This action is unavailable for the current account connection. Inspect it in GhostGet before retrying.");
    return ticket;
  }
  private requireCurrentTicket(account: AppHostAccount, digest: string): AppHostXActionTicket {
    const ticket = this.requireTicket(account, digest);
    // Local identity preparation only; no live profile lookup or handle needed.
    const invocation = this.runtime.prepareReadInvocation("x-web", "feeds.read", { feed: "following", limit: 1 }, account.id, this.environment, this.registry);
    const authHash = createHash("sha256").update(canonicalJson(invocation.auth)).digest("hex");
    if (invocation.readProjectionAuthIdentityHash !== ticket.incarnationHash || authHash !== ticket.authHash) throw new ControlError("RUN_NOT_FOUND", "This action belongs to a different account connection. Inspect it in GhostGet before retrying.");
    return ticket;
  }
  private selectedMedia(account: AppHostAccount, intent: AppHostXIntent): readonly Media[] {
    const ids = intent.media ?? [];
    if (new Set(ids).size !== ids.length) throw new ControlError("MEDIA_CHANGED", "Select each attachment once.");
    return ids.map(id => {
      const selected = this.media.get(id);
      if (selected === undefined || selected.expires <= this.now() || selected.accountId !== account.id || selected.revision !== account.revision) throw new ControlError("MEDIA_EXPIRED", "Select the attachments again for this account.");
      return selected;
    });
  }
  private async actionInput(account: AppHostAccount, intent: AppHostXIntent): Promise<Readonly<Record<string, unknown>>> {
    if (intent.action === "post" || intent.action === "reply" || intent.action === "quote") {
      const contract = webSessionContractDefinitions.x["posts.publish"];
      return appHostXPublicationInput(intent, this.selectedMedia(account, intent), contract.contractVersion);
    }
    if (intent.action === "follow" || intent.action === "unfollow") return { user_id: intent.subject!, following: intent.action === "follow" };
    if (intent.action === "delete") {
      const output = await this.read(account, "posts.read", { post_id: intent.postId! });
      const post = parseXSocialPost(output.post);
      if (post.id !== intent.postId || post.authorId !== account.subject || intent.expectedText !== undefined && intent.expectedText !== post.text) throw new ControlError("DELETE_CHANGED", "The current post does not match this account and deletion preview.");
      return { post_id: intent.postId!, expected_text: post.text };
    }
    return { post_id: intent.postId!, [intent.action === "like" || intent.action === "unlike" ? "liked" : intent.action === "repost" || intent.action === "unrepost" ? "reposted" : "saved"]: !["unlike", "unrepost", "unbookmark"].includes(intent.action) };
  }
}

import { createHash } from "node:crypto";
import type { GhostgetAuth } from "../auth";
import { canonicalJson } from "../canonical-json";
import type { LocalCliExecutionOptions } from "../local-cli-execution";
import type { LocalCliRecipe, OperationInput } from "../model";
import type { AutomationAction, AutomationConversation, AutomationIdentity, AutomationMessage, AutomationProviderPage, AutomationProviderStatus, AutomationProviderSendResult, MessagingAutomationProvider } from "../messaging-automation-types";
import { AUTOMATION_ACTION_KINDS, automationArray, automationInteger, automationRecord, automationText, parseAutomationAction, parseAutomationIdentity } from "../messaging-automation-validation";
import { OperationDeadline } from "../operation-deadline";
import { executeBeeperDirectMessagingPart, executeBeeperLocalOperation, type BeeperDirectDependencies, type BeeperDirectMessagingDependencies, type BeeperLocalRuntimeDependencies } from "./beeper-local-runtime";
import { materializeBeeperExactConversation, materializeBeeperMessagingList, materializeBeeperMessagingRead, rawBeeperConversationId, rawBeeperMessageId } from "./beeper-omni";

export type BeeperAutomationOperation = "inspect" | "conversations" | "resolve" | "history" | "events" | AutomationAction["kind"];
export type BeeperAutomationAdmission = Readonly<{ auth: GhostgetAuth; accountIdentity: string; implementationIdentity: string }>;
export type BeeperAutomationOptions = Readonly<{
  authorize(operation: BeeperAutomationOperation, signal?: AbortSignal): Promise<BeeperAutomationAdmission>;
  execution: Pick<LocalCliExecutionOptions, "registerCleanupBarrier" | "environment">;
  /** Internal deterministic test seams, never populated from public input. */
  dependencies?: BeeperLocalRuntimeDependencies;
  directDependencies?: BeeperDirectDependencies;
  messagingDependencies?: BeeperDirectMessagingDependencies;
}>;

const sha = (value: unknown): string => createHash("sha256").update(canonicalJson(value)).digest("hex");

/** Recipes mirror the pinned beeper adapter manifest contracts exactly. */
const RECIPES = Object.freeze({
  accounts: Object.freeze({ surface: "beeper", action: "accounts.list", contractVersion: 2, timeoutMs: 120_000, maxOutputBytes: 10_485_760 }),
  conversations: Object.freeze({ surface: "beeper", action: "messaging.list", contractVersion: 1, timeoutMs: 120_000, maxOutputBytes: 10_485_760 }),
  conversation: Object.freeze({ surface: "beeper", action: "conversations.read", contractVersion: 2, timeoutMs: 120_000, maxOutputBytes: 10_485_760 }),
  messages: Object.freeze({ surface: "beeper", action: "messaging.read", contractVersion: 3, timeoutMs: 120_000, maxOutputBytes: 10_485_760 }),
} as const satisfies Record<string, LocalCliRecipe>);

type Coordinate = Readonly<{ provider: "beeper"; accountId: string; conversationId: string }>;
function coordinate(value: unknown): Coordinate {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Beeper automation coordinate is invalid.");
  const r = automationRecord(value, ["provider", "accountId", "conversationId"]);
  if (r.provider !== "beeper") throw new Error("Beeper cannot operate another messaging network");
  return Object.freeze({ provider: "beeper", accountId: automationText(r.accountId, 512), conversationId: automationText(r.conversationId, 2048) });
}

/** Automation message ids stay inside the strict identifier alphabet; raw
 * Beeper ids can exceed it, so long or unusual ids are deterministically hashed. */
function automationMessageId(raw: string): string {
  const id = automationText(raw, 2048);
  if (/^[A-Za-z0-9._:-]{1,256}$/u.test(id)) return id;
  return `beeper-${sha(id)}`;
}

function rawAccountFromProviderId(providerId: string): string {
  const match = /^beeper:([A-Za-z0-9_-]+):chat:[A-Za-z0-9_-]+$/u.exec(providerId);
  if (match === null) throw new Error("Normalized Beeper conversation ID is malformed.");
  const raw = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(match[1]!, "base64url"));
  if (Buffer.from(raw, "utf8").toString("base64url") !== match[1]) throw new Error("Normalized Beeper conversation ID is not canonically encoded.");
  return raw;
}

function rawUserFromProviderId(providerId: string): string | null {
  const match = /^beeper:[A-Za-z0-9_-]+:user:([A-Za-z0-9_-]+)$/u.exec(providerId);
  if (match === null) return null;
  try { return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(match[1]!, "base64url")); } catch { return null; }
}

type AccountsSnapshot = Readonly<{ subject: string; accounts: readonly Readonly<{ accountId: string; userId: string | null; isSelf: boolean | null }>[] }>;

function snapshotIdentity(admission: BeeperAutomationAdmission, snapshot: AccountsSnapshot): AutomationIdentity {
  return parseAutomationIdentity({
    provider: "beeper", authId: admission.auth.id,
    accountIdentity: admission.accountIdentity,
    accountSubject: snapshot.subject,
    implementationIdentity: admission.implementationIdentity,
    // Stable realm membership only; live per-bridge statuses flap without
    // changing the identity that enrollments and cursors must bind.
    sourceGeneration: sha(snapshot.accounts.map(account => ({ accountId: account.accountId, userId: account.userId, isSelf: account.isSelf }))),
  });
}

function conversation(entity: Readonly<Record<string, unknown>>): AutomationConversation {
  const providerId = automationText(entity.providerId, 4096);
  const accountId = rawAccountFromProviderId(providerId);
  const rawConversationId = rawBeeperConversationId(accountId, providerId);
  const kind = entity.conversationKind === "single" ? "single" : entity.conversationKind === "group" ? "group" : "unknown";
  const participants = automationArray(entity.participants, 500)
    .map(participant => rawUserFromProviderId(automationText((participant as Readonly<Record<string, unknown>>).providerId, 4096)))
    .filter((participant): participant is string => participant !== null);
  const unique = [...new Set(participants)].sort();
  if (kind === "single" && unique.length > 2) return Object.freeze({
    coordinate: Object.freeze({ provider: "beeper", accountId, conversationId: rawConversationId }),
    title: null, kind: "unknown", participants: Object.freeze([]),
  });
  return Object.freeze({
    coordinate: Object.freeze({ provider: "beeper", accountId, conversationId: rawConversationId }),
    title: entity.title === null || entity.title === undefined ? null : automationText(entity.title, 512),
    kind, participants: Object.freeze(unique),
  });
}

/** One message observation. `sortKey` orders the feed; the materialized entity
 * carries the reviewed projection fields. */
type ObservedMessage = Readonly<{ entity: Readonly<Record<string, unknown>>; id: string; sortKey: string }>;

function projectMessage(selected: Coordinate, observed: ObservedMessage): AutomationMessage {
  const entity = observed.entity;
  const body = entity.body === null || entity.body === undefined ? null : automationText(entity.body, 1_048_576, true);
  let text = body;
  if (text !== null && Buffer.byteLength(text) > 65_536) {
    let cut = 65_500;
    while (cut > 0 && (Buffer.from(text).subarray(cut, cut + 1)[0]! & 0xc0) === 0x80) cut -= 1;
    text = `${Buffer.from(text).subarray(0, cut).toString("utf8")}…`;
  }
  const state = automationText(entity.state, 64);
  const deleted = state !== "active";
  const edited = entity.providerRevision !== null && entity.providerRevision !== undefined;
  const attachments = deleted ? [] : automationArray(entity.attachments, 20).map(item => {
    const a = item as Readonly<Record<string, unknown>>;
    return Object.freeze({
      name: a.name === null || a.name === undefined ? null : automationText(a.name, 512),
      mimeType: a.mimeType === null || a.mimeType === undefined ? null : automationText(a.mimeType, 256),
      sizeBytes: a.sizeBytes === null || a.sizeBytes === undefined ? null : automationInteger(a.sizeBytes, 0, 1024 * 1024 * 1024),
    });
  });
  if (deleted) text = null;
  const reply = entity.replyToProviderId === null || entity.replyToProviderId === undefined
    ? null
    : automationMessageId(rawBeeperMessageId(selected.accountId, automationText(entity.replyToProviderId, 4096)));
  return Object.freeze({
    id: automationMessageId(observed.id),
    coordinate: Object.freeze({ provider: "beeper", accountId: selected.accountId, conversationId: selected.conversationId }),
    direction: entity.direction === "outgoing" || entity.direction === "incoming" ? entity.direction : "unknown",
    occurredAt: automationText(entity.orderedAt, 32),
    text, kind: state !== "active" ? "delete" : edited ? "edit" : "message",
    relatedMessageId: reply, attachments: Object.freeze(attachments),
  });
}

/** Feed cursor per coordinate. `mark` is the newest emitted sortKey and only
 * advances to emitted positions. `floor` non-null means a drain is active: the
 * interval (`floor`, `mark`] still has unemitted messages below the newest
 * window. `window` is the before-cursor of the window being drained (`null` =
 * the newest page) and `drained` is the last emitted sortKey inside it, so a
 * partially emitted window resumes exactly. */
type CoordinateState = Readonly<{ mark: string | null; floor: string | null; window: string | null; drained: string | null }>;
type FeedCursor = Readonly<{ version: 1; identity: string; scope: string; states: Readonly<Record<string, CoordinateState>> }>;
const coordinateKey = (selected: Coordinate): string => sha([selected.accountId, selected.conversationId]);

function encodeCursor(current: AutomationIdentity, coordinates: readonly Coordinate[], states: Readonly<Record<string, CoordinateState>>): string {
  return Buffer.from(canonicalJson({ version: 1, identity: sha(current), scope: sha(coordinates), states }), "utf8").toString("base64url");
}
function parseCursor(value: string | null, current: AutomationIdentity, coordinates: readonly Coordinate[]): FeedCursor {
  const initial = { version: 1 as const, identity: sha(current), scope: sha(coordinates) };
  if (value === null) return Object.freeze({ ...initial, states: Object.freeze({}) });
  automationText(value, 16_384);
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) throw new Error("Noncanonical Beeper cursor");
  const row = automationRecord(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decoded)), ["version", "identity", "scope", "states"]);
  if (row.version !== 1 || row.identity !== initial.identity || row.scope !== initial.scope) throw new Error("Beeper cursor identity or scope changed");
  const stateKeys = Object.keys(row.states as object);
  if (stateKeys.length > 50) throw new Error("Beeper cursor carries too many scopes");
  const rawStates = automationRecord(row.states, stateKeys);
  const states: Record<string, CoordinateState> = {};
  for (const [key, raw] of Object.entries(rawStates)) {
    const state = automationRecord(raw, ["mark", "floor", "window", "drained"]);
    states[key] = Object.freeze({
      mark: state.mark === null ? null : automationText(state.mark, 2048),
      floor: state.floor === null ? null : automationText(state.floor, 2048),
      window: state.window === null ? null : automationText(state.window, 2048),
      drained: state.drained === null ? null : automationText(state.drained, 2048),
    });
  }
  return Object.freeze({ ...initial, states: Object.freeze(states) });
}

/** Concrete pinned Beeper linked-device adapter over the reviewed local CLI and
 * Desktop loopback contracts. No push feed exists, so events are honest bounded
 * polling: a newest-page watermark plus a replayable before-cursor drain for any
 * window that outgrows one page. */
export function createBeeperAutomationProvider(options: BeeperAutomationOptions): MessagingAutomationProvider {
  const lifetime = new AbortController();
  let closed = false, inFlight: Promise<unknown> | undefined;

  async function run<T>(operation: BeeperAutomationOperation, signal: AbortSignal | undefined, work: (admission: BeeperAutomationAdmission, signal: AbortSignal) => Promise<T>): Promise<T> {
    if (closed || inFlight) throw new Error("Beeper automation provider is closed or busy");
    const activeSignal = signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal;
    const pending = (async () => { activeSignal.throwIfAborted(); const before = await options.authorize(operation, activeSignal); if (typeof before.auth.subject !== "string" || before.auth.subject.length === 0) throw new Error("Beeper automation requires a bound local account realm"); const result = await work(before, activeSignal); const after = await options.authorize(operation, activeSignal); if (sha(before) !== sha(after)) throw new Error("Beeper account or permission changed during the operation"); return result; })();
    inFlight = pending; try { return await pending; } finally { if (inFlight === pending) inFlight = undefined; }
  }

  async function execute(recipe: LocalCliRecipe, input: OperationInput, auth: GhostgetAuth, signal: AbortSignal): Promise<unknown> {
    const execution = await executeBeeperLocalOperation(recipe, input, auth, {
      signal,
      ...(options.execution.environment === undefined ? {} : { environment: options.execution.environment }),
      ...(options.execution.registerCleanupBarrier === undefined ? {} : { registerCleanupBarrier: options.execution.registerCleanupBarrier }),
      ...(options.dependencies === undefined ? {} : { dependencies: options.dependencies }),
      ...(options.directDependencies === undefined ? {} : { directDependencies: options.directDependencies }),
    });
    if (execution.status !== "succeeded") throw new Error(`Beeper ${recipe.action} did not succeed.`);
    return execution.output;
  }

  async function accountsSnapshot(admission: BeeperAutomationAdmission, signal: AbortSignal): Promise<AccountsSnapshot> {
    const output = automationRecord(await execute(RECIPES.accounts, {}, admission.auth, signal), ["provider", "operation", "accountSubject", "accounts"]);
    const subject = automationText(output.accountSubject, 512);
    const accounts = automationArray(output.accounts, 128).map(value => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Beeper account projection is invalid.");
      const account = value as Record<string, unknown>;
      const user = account.user;
      if (typeof user !== "object" || user === null || Array.isArray(user)) throw new Error("Beeper account user projection is invalid.");
      const record = user as Record<string, unknown>;
      return Object.freeze({
        accountId: automationText(account.accountId, 512),
        userId: automationText(record.id, 512),
        isSelf: record.isSelf === null || record.isSelf === undefined ? null : record.isSelf === true,
      });
    });
    return Object.freeze({ subject, accounts: Object.freeze(accounts) });
  }

  function offlineIdentity(admission: BeeperAutomationAdmission): AutomationIdentity {
    return parseAutomationIdentity({
      provider: "beeper", authId: admission.auth.id, accountIdentity: admission.accountIdentity,
      accountSubject: admission.auth.subject ?? "unreachable",
      implementationIdentity: admission.implementationIdentity, sourceGeneration: "unreachable",
    });
  }

  function status(current: AutomationIdentity, connected: boolean): AutomationProviderStatus {
    const actions = Object.fromEntries(AUTOMATION_ACTION_KINDS.map(kind => [kind, {
      available: connected && kind === "text",
      reason: kind !== "text"
        ? "The pinned Beeper local transport has no admitted operation for this experience."
        : connected ? null : "Beeper Desktop is not reachable on the reviewed local endpoint.",
    }])) as AutomationProviderStatus["actions"];
    return Object.freeze({
      identity: current, connected,
      events: Object.freeze({ available: connected, reason: connected ? null : "Beeper Desktop is not reachable on the reviewed local endpoint." }),
      actions,
    });
  }

  type ReadPage = Readonly<{ messages: readonly ObservedMessage[]; continuation: string | null }>;

  /** Internal read bound. The runtime refuses a limit smaller than one provider
   * page (it cannot prove a page-internal skip), so reads always collect a full
   * contract-sized window and callers slice the visible share. */
  const WINDOW_LIMIT = 200;

  /** Newest-first window read; `beforeCursor === null` reads the newest page. */
  async function readMessages(admission: BeeperAutomationAdmission, selected: Coordinate, beforeCursor: string | null, signal: AbortSignal): Promise<Readonly<{ page: ReadPage; output: Record<string, unknown> }>> {
    const operationInput: OperationInput = {
      account_id: selected.accountId, conversation_id: selected.conversationId,
      ...(beforeCursor === null ? {} : { before_cursor: beforeCursor }),
      limit: WINDOW_LIMIT,
    };
    const output = automationRecord(await execute(RECIPES.messages, operationInput, admission.auth, signal), ["provider", "operation", "accountSubject", "projection", "accountId", "conversationId", "selfUserId", "canonicalSelfUserId", "requestCursor", "requestDirection", "requestedSender", "messages", "tombstones", "continuation", "completeness"]);
    const materialized = materializeBeeperMessagingRead(operationInput, output);
    const rawMessages = automationArray(output.messages, WINDOW_LIMIT);
    if (rawMessages.length !== materialized.entities.length) throw new Error("Beeper message projection count drifted.");
    const observed: ObservedMessage[] = materialized.entities.map((entity, index) => {
      const raw = rawMessages[index];
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("Beeper message projection is invalid.");
      const record = raw as Record<string, unknown>;
      const id = automationText(record.id, 2048);
      if (rawBeeperMessageId(selected.accountId, (entity as Readonly<Record<string, unknown>>).providerId) !== id) throw new Error("Beeper message projection does not bind its raw record.");
      return Object.freeze({ entity: entity as Readonly<Record<string, unknown>>, id, sortKey: automationText(record.sortKey, 1024) });
    });
    const continuation = output.continuation === null ? null : automationRecord(output.continuation, ["direction", "cursor"]);
    return Object.freeze({
      page: Object.freeze({
        messages: Object.freeze(observed),
        continuation: continuation === null ? null : automationText(continuation.cursor, 2048),
      }),
      output: output as Record<string, unknown>,
    });
  }

  return {
    provider: "beeper",
    inspect(signal) {
      return run("inspect", signal, async (admission, active) => {
        try {
          const snapshot = await accountsSnapshot(admission, active);
          return status(snapshotIdentity(admission, snapshot), true);
        } catch {
          return status(offlineIdentity(admission), false);
        }
      });
    },
    conversations(input, signal) {
      const limit = automationInteger(input.limit, 1, 200);
      return run("conversations", signal, async (admission, active) => {
        const snapshot = await accountsSnapshot(admission, active);
        const output = await execute(RECIPES.conversations, { limit }, admission.auth, active);
        const materialized = materializeBeeperMessagingList({ limit }, output);
        const completeness = typeof output === "object" && output !== null
          ? (output as Readonly<Record<string, unknown>>).completeness
          : undefined;
        if (typeof completeness !== "object" || completeness === null || typeof (completeness as Readonly<Record<string, unknown>>).requestedLimitReached !== "boolean") throw new Error("Beeper conversation list completeness is invalid.");
        const requestedLimitReached = (completeness as Readonly<Record<string, unknown>>).requestedLimitReached === true;
        return Object.freeze({
          identity: snapshotIdentity(admission, snapshot),
          conversations: Object.freeze(materialized.entities.map(entity => conversation(entity as Readonly<Record<string, unknown>>))),
          // The pinned CLI list output has no continuation metadata; an exactly
          // full remote window cannot prove completeness, even when out-of-realm
          // rows were excluded from the projection.
          complete: !requestedLimitReached,
        });
      });
    },
    resolve(value, signal) {
      const selected = coordinate(value);
      return run("resolve", signal, async (admission, active) => {
        const snapshot = await accountsSnapshot(admission, active);
        const operationInput = { account_id: selected.accountId, conversation_id: selected.conversationId };
        const entity = materializeBeeperExactConversation(operationInput, await execute(RECIPES.conversation, operationInput, admission.auth, active));
        const projected = conversation(entity as Readonly<Record<string, unknown>>);
        if (canonicalJson(projected.coordinate) !== canonicalJson(selected)) throw new Error("Beeper route resolution changed target.");
        return Object.freeze({ identity: snapshotIdentity(admission, snapshot), conversation: projected });
      });
    },
    history(input, signal) {
      const selected = coordinate(input.coordinate), limit = automationInteger(input.limit, 1, 200);
      return run("history", signal, async (admission, active) => {
        const snapshot = await accountsSnapshot(admission, active);
        const current = snapshotIdentity(admission, snapshot);
        const { page } = await readMessages(admission, selected, null, active);
        // Descending window → take the newest `limit`, emit ascending; the
        // newest observed sortKey seeds the enrollment feed watermark.
        const ascending = page.messages.slice(0, limit).reverse();
        const states: Record<string, CoordinateState> = { [coordinateKey(selected)]: Object.freeze({ mark: ascending.length ? ascending[ascending.length - 1]!.sortKey : null, floor: null, window: null, drained: null }) };
        return Object.freeze({
          identity: current,
          messages: Object.freeze(ascending.map(observed => projectMessage(selected, observed))),
          nextCursor: encodeCursor(current, [selected], states),
          caughtUp: true, gap: false,
        } satisfies AutomationProviderPage);
      });
    },
    events(input, signal) {
      const coordinates = automationArray(input.coordinates, 50).map(coordinate).sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
      const limit = automationInteger(input.limit, 1, 500);
      if (coordinates.length === 0 || new Set(coordinates.map(coordinateKey)).size !== coordinates.length) throw new Error("Distinct Beeper event scopes are required");
      return run("events", signal, async (admission, active) => {
        const snapshot = await accountsSnapshot(admission, active);
        const current = snapshotIdentity(admission, snapshot);
        const prior = parseCursor(input.cursor, current, coordinates);
        const emitted: AutomationMessage[] = [];
        const states: Record<string, CoordinateState> = { ...prior.states };
        let caughtUp = true;
        for (const selected of coordinates) {
          if (emitted.length >= limit) { caughtUp = false; break; }
          const key = coordinateKey(selected);
          const stored = states[key];
          const state = { mark: stored?.mark ?? null, floor: stored?.floor ?? null, window: stored?.window ?? null, drained: stored?.drained ?? null };
          // A bounded number of window reads per coordinate per poll; a drain
          // that outlasts it keeps its cursor and resumes next poll.
          for (let scans = 0; scans < 32 && emitted.length < limit; scans += 1) {
            const draining = state.floor !== null;
            const { page } = await readMessages(admission, selected, draining ? state.window : null, active);
            const lowerBound = draining ? (state.drained ?? state.floor) : state.mark;
            const ascending = page.messages.filter(observed => lowerBound === null || observed.sortKey > lowerBound).reverse();
            const take = ascending.slice(0, limit - emitted.length);
            for (const observed of take) emitted.push(projectMessage(selected, observed));
            const lastEmitted = take[take.length - 1]?.sortKey;
            if (lastEmitted !== undefined) {
              if (draining) state.drained = lastEmitted;
              if (state.mark === null || lastEmitted > state.mark) state.mark = lastEmitted;
            }
            const exhausted = ascending.length === take.length;
            const oldest = page.messages[page.messages.length - 1];
            if (!draining) {
              const previous = lowerBound;
              if (previous !== null && page.messages.length !== 0 && ascending.length === page.messages.length && page.continuation !== null) {
                // The whole newest window postdates the watermark: arrivals may
                // sit below it. Drain deeper windows until one reaches `floor`.
                state.floor = previous;
                state.window = exhausted ? page.continuation : null;
                state.drained = exhausted ? null : (lastEmitted ?? null);
                continue;
              }
              if (!exhausted) caughtUp = false;
              break;
            }
            if (!exhausted) break;
            const floor = state.floor;
            if ((oldest !== undefined && floor !== null && oldest.sortKey <= floor) || page.continuation === null) {
              // The walk covered every surviving message above the watermark.
              // Provider pruning below it deletes unobserved history, which is
              // not a coverage gap.
              state.floor = null; state.window = null; state.drained = null;
              break;
            }
            state.window = page.continuation;
            state.drained = null;
          }
          if (state.floor !== null) caughtUp = false;
          states[key] = Object.freeze(state);
        }
        emitted.sort((a, b) => a.occurredAt === b.occurredAt ? a.id.localeCompare(b.id) : a.occurredAt.localeCompare(b.occurredAt));
        return Object.freeze({
          identity: current, messages: Object.freeze(emitted),
          nextCursor: encodeCursor(current, coordinates, states), caughtUp, gap: false,
        } satisfies AutomationProviderPage);
      });
    },
    async send(input, signal): Promise<AutomationProviderSendResult> {
      const selected = coordinate(input.coordinate), expected = parseAutomationIdentity(input.identity), action = parseAutomationAction(input.action);
      automationText(input.intentId, 256);
      let dispatched = false;
      try {
        return await run(action.kind, signal, async (admission, active) => {
          const observe = async (holder: BeeperAutomationAdmission): Promise<AutomationIdentity> => snapshotIdentity(holder, await accountsSnapshot(holder, active));
          try {
            const current = await observe(admission);
            if (sha(current) !== sha(expected) || action.kind !== "text" || !status(current, true).actions[action.kind].available) throw new Error("Beeper source identity or capability changed before dispatch");
            const operationDeadline = new OperationDeadline(300_000, { signal: active });
            try {
              const acceptance = await executeBeeperDirectMessagingPart(
                { account_id: selected.accountId, conversation_id: selected.conversationId, kind: "text", text: action.text, mentions: [], no_preview: false },
                admission.auth,
                {
                  operationDeadline, signal: active,
                  ...(options.execution.environment === undefined ? {} : { environment: options.execution.environment }),
                  ...(options.messagingDependencies === undefined ? {} : { dependencies: options.messagingDependencies }),
                  beforeExternalBegin: async () => {
                    const again = await options.authorize("text", active);
                    if (sha(again) !== sha(admission)) throw new Error("Beeper permission changed before writing the action");
                    if (sha(await observe(again)) !== sha(expected)) throw new Error("Beeper source identity changed before writing the action");
                    dispatched = true;
                  },
                },
              );
              return Object.freeze({ state: "accepted", messageId: automationMessageId(acceptance.pendingMessageId), providerReceiptId: null, delivery: "unknown" } satisfies AutomationProviderSendResult);
            } finally { operationDeadline.dispose(); }
          } catch {
            return Object.freeze(dispatched
              ? { state: "indeterminate", reason: "The Beeper receipt or cleanup could not be verified; do not retry." }
              : { state: "not-started", reason: "The selected Beeper account, permission, target, or action was unavailable." } satisfies AutomationProviderSendResult);
          }
        });
      } catch {
        return Object.freeze(dispatched
          ? { state: "indeterminate", reason: "The Beeper outcome is uncertain and cannot be retried." }
          : { state: "not-started", reason: "The selected Beeper account, permission, target, or action was unavailable." } satisfies AutomationProviderSendResult);
      }
    },
    async close() { closed = true; lifetime.abort(); await inFlight?.catch(() => undefined); },
  };
}

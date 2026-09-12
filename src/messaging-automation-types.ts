/** Closed host-side messaging contract. Provider credentials and local paths never cross it. */
export const MESSAGING_AUTOMATION_PROTOCOL = "ghostget.messaging-automation/1" as const;

export type AutomationProviderId = "imessage" | "whatsapp";
export type AutomationActionKind = AutomationAction["kind"];
export type AutomationCoordinate =
  | Readonly<{ provider: "imessage"; chatGuid: string; service: "iMessage"; observedChatRowId: number }>
  | Readonly<{ provider: "whatsapp"; conversationJid: string }>;
export type AutomationIdentity = Readonly<{
  provider: AutomationProviderId;
  authId: string;
  /** Ghostget's public lifecycle authIdentity; detects replacement including A → B → A. */
  accountIdentity: string;
  accountSubject: string;
  /** Exact reviewed provider implementation and contract closure digest. */
  implementationIdentity: string;
  /** Exact provider database/session generation; changes invalidate cursors and enrollment. */
  sourceGeneration: string;
}>;
export type AutomationCapability = Readonly<{ available: boolean; reason: string | null }>;
export type AutomationProviderStatus = Readonly<{
  identity: AutomationIdentity;
  connected: boolean;
  events: AutomationCapability;
  actions: Readonly<Record<AutomationActionKind, AutomationCapability>>;
}>;
export type AutomationConversation = Readonly<{
  coordinate: AutomationCoordinate;
  title: string | null;
  kind: "single" | "group" | "unknown";
  /** Exact current participant identities, never inferred from a display name. */
  participants: readonly string[];
}>;
export type AutomationMessage = Readonly<{
  id: string;
  coordinate: AutomationCoordinate;
  direction: "incoming" | "outgoing" | "unknown";
  occurredAt: string;
  text: string | null;
  kind: "message" | "reaction" | "edit" | "delete";
  relatedMessageId: string | null;
  /** Metadata only; provider keys and paths stay inside Ghostget. */
  attachments: readonly Readonly<{ name: string | null; mimeType: string | null; sizeBytes: number | null }>[];
}>;
export type AutomationAction =
  | Readonly<{ kind: "text"; text: string }>
  | Readonly<{ kind: "attachment"; assetId: string; name: string; mimeType: string }>
  | Readonly<{ kind: "reaction"; messageId: string; emoji: string; remove: boolean }>
  | Readonly<{ kind: "sticker"; assetId: string; messageId: string | null }>
  | Readonly<{ kind: "link"; url: string }>
  | Readonly<{ kind: "poll"; question: string; options: readonly string[]; maximumSelections: number | null }>
  | Readonly<{ kind: "app-clip"; url: string }>
  | Readonly<{ kind: "experience"; experienceId: string; parameters: Readonly<Record<string, string>> }>;
export type AutomationProviderPage = Readonly<{
  identity: AutomationIdentity;
  messages: readonly AutomationMessage[];
  nextCursor: string;
  caughtUp: boolean;
  /** A known/possible lost interval is explicit and prevents automatic dispatch. */
  gap: boolean;
}>;
export type AutomationProviderSendResult =
  | Readonly<{ state: "accepted"; messageId: string | null; providerReceiptId: string | null; delivery: "unknown" }>
  | Readonly<{ state: "not-started"; reason: string }>
  | Readonly<{ state: "indeterminate"; reason: string }>;

/**
 * Trusted Ghostget host port, never handed to an agent. Production implementations
 * check existing operation permissions and exact identity before each operation.
 * One send means one dispatch; implementations must never retry after uncertainty.
 */
export interface MessagingAutomationProvider {
  readonly provider: AutomationProviderId;
  inspect(signal?: AbortSignal): Promise<AutomationProviderStatus>;
  conversations(input: Readonly<{ limit: number }>, signal?: AbortSignal): Promise<Readonly<{
    identity: AutomationIdentity; conversations: readonly AutomationConversation[]; complete: boolean;
  }>>;
  resolve(coordinate: AutomationCoordinate, signal?: AbortSignal): Promise<Readonly<{
    identity: AutomationIdentity; conversation: AutomationConversation;
  }>>;
  history(input: Readonly<{ coordinate: AutomationCoordinate; limit: number }>, signal?: AbortSignal): Promise<AutomationProviderPage>;
  events(input: Readonly<{ coordinates: readonly AutomationCoordinate[]; cursor: string | null; limit: number }>, signal?: AbortSignal): Promise<AutomationProviderPage>;
  send(input: Readonly<{
    identity: AutomationIdentity;
    coordinate: AutomationCoordinate;
    action: AutomationAction;
    /** Host's durable action claim, useful for provider idempotency only where proven. */
    intentId: string;
  }>, signal?: AbortSignal): Promise<AutomationProviderSendResult>;
  /** Waits for owned provider children to terminate; uncertainty must reject. */
  close(): Promise<void>;
}

export type AutomationEnrollment = Readonly<{
  id: string; identity: AutomationIdentity; conversation: AutomationConversation;
  bindingDigest: string; revision: number; ready: boolean; reason: string | null;
}>;
export type AutomationGrantRequest = Readonly<{
  enrollmentId: string; expectedBindingDigest: string;
  actions: readonly AutomationActionKind[];
  expiresAt: string; maximumActions: number; minimumIntervalMs: number;
}>;
export type AutomationGrant = AutomationGrantRequest & Readonly<{ id: string; revoked: boolean; consumedActions: number }>;
export type AutomationPlanRequest = Readonly<{
  enrollmentId: string; expectedRevision: number; intentId: string; actions: readonly AutomationAction[];
}>;
export type AutomationPlan = AutomationPlanRequest & Readonly<{ id: string; digest: string; bindingDigest: string; expiresAt: string }>;
export type AutomationRun = Readonly<{
  id: string; planId: string; intentId: string; enrollmentId: string;
  state: "started" | "accepted" | "failed" | "partial" | "indeterminate";
  accepted: readonly Readonly<{ messageId: string | null; providerReceiptId: string | null }>[];
  totalActions: number; reason: string | null; retryable: false;
}>;
export type AutomationEvent = Readonly<{ sequence: number; enrollmentId: string; revision: number; message: AutomationMessage }>;

/** Public trusted-host surface. No registry, database or provider implementation
 * types are part of this contract. Creating a host requires Bun. */
export interface MessagingAutomationHostApi {
  providerStatus(provider: AutomationProviderId, signal?: AbortSignal): Promise<AutomationProviderStatus>;
  conversations(input: Readonly<{ provider: AutomationProviderId; limit: number }>, signal?: AbortSignal): Promise<Readonly<{
    identity: AutomationIdentity; conversations: readonly AutomationConversation[]; complete: boolean;
  }>>;
  enroll(input: Readonly<{ provider: AutomationProviderId; coordinate: AutomationCoordinate }>, signal?: AbortSignal): Promise<AutomationEnrollment>;
  enrollments(): readonly AutomationEnrollment[];
  history(input: Readonly<{ enrollmentId: string; limit: number }>): Readonly<{ enrollment: AutomationEnrollment; messages: readonly AutomationMessage[] }>;
  grant(request: AutomationGrantRequest, intentId?: string): AutomationGrant;
  grantByIntent(intentId: string): AutomationGrant | null;
  grantStatus(grantId: string): AutomationGrant;
  revoke(grantId: string): void;
  poll(enrollmentId: string, signal?: AbortSignal): Promise<AutomationEnrollment>;
  events(input: Readonly<{ enrollmentIds: readonly string[]; cursor: string | null; limit: number }>): Readonly<{
    events: readonly AutomationEvent[]; nextCursor: string; caughtUp: boolean;
  }>;
  prepare(request: AutomationPlanRequest): AutomationPlan;
  submit(input: Readonly<{ planId: string; grantId: string }>, signal?: AbortSignal): Promise<AutomationRun>;
  run(runId: string): AutomationRun;
  cancel(planId: string): boolean;
  /** Resolves only after all provider operations and owned children have joined. */
  close(): Promise<void>;
}

export type MessagingRuntimeInstallation = Readonly<{ version: string; sha256: string; alreadyPresent?: boolean }>;

/** Injected providers are trusted owner code and must enforce their permissions.
 * Use the CLI stdio host for built-in account/registry-managed providers. */
export declare function createMessagingAutomationHost(
  providers: readonly MessagingAutomationProvider[],
  environment?: Readonly<Record<string, string | undefined>>,
): Promise<MessagingAutomationHostApi>;

/** Installs exact bundled bytes; never pairs, starts sync or grants authority. */
export declare function installBundledMessagingRuntime(
  provider: AutomationProviderId,
  environment?: Readonly<Record<string, string | undefined>>,
): Promise<MessagingRuntimeInstallation>;

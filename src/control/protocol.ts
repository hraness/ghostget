/** Production-safe data contract. No runtime, filesystem, provider or UI imports. */
import type { VaultControlRequest, VaultView } from "./vault-model";
import type { BrowserDiscoveryView, SetupRequestView } from "./setup-model";
export const CONTROL_PROTOCOL = "ghostget.control/1" as const;
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type PermissionDecision = "allow" | "deny" | "ask";
export type ControlSection = "accounts" | "vault" | "capabilities" | "integrations" | "web" | "approvals" | "activity" | "setup";

export interface AccountView {
  readonly id: string;
  readonly provider: string | null;
  readonly kind: string;
  readonly subject: string | null;
  readonly revision: string;
  readonly status: "configured" | "verified" | "reconnect-required";
  readonly source: string | null;
  readonly tokenStorage: "external" | "ghostget-import" | "managed-oauth" | null;
}

export interface CapabilityView {
  readonly digest: string;
  readonly adapterId: string;
  readonly operationId: string;
  readonly pluginId: string | null;
  readonly surface: string;
  readonly transport: string;
  readonly risk: string;
  readonly effect: string;
  readonly state: "available" | "capture-required" | "unsupported";
  readonly executorSource: "built-in" | "source" | "portable" | "unknown";
  readonly interfaceSource: "bundled" | "user" | "imported";
  readonly permission: PermissionDecision | "unmanaged" | "unavailable";
}

export interface InterfaceView {
  readonly id: string;
  readonly title: string;
  readonly source: "user" | "imported";
  readonly digest: string;
  readonly activeDigest: string | null;
  readonly state: "draft" | "active" | "needs-executor";
  readonly operationCount: number;
  readonly adapterIds: readonly string[];
  readonly activationTargets: readonly { readonly adapterId: string; readonly installedDigest: string | null }[];
  readonly issues: readonly string[];
}

export interface WebRule {
  readonly id: string;
  readonly origin: string;
  readonly path: { readonly kind: "exact" | "prefix"; readonly value: string };
  readonly methods: readonly ("GET" | "HEAD")[];
  readonly queryKeys: readonly string[];
  readonly decision: PermissionDecision;
  /** The human reviewed the endpoint as a retrieval interface; HTTP method is not proof. */
  readonly effect: "retrieval";
  readonly maxResponseBytes: number;
  readonly timeoutMs: number;
}

export interface ApprovalView {
  readonly id: string;
  readonly digest: string;
  readonly kind: "provider" | "web" | "credential";
  readonly title: string;
  readonly account: string | null;
  readonly effect: string;
  readonly preview: string;
  readonly expiresAt: string;
}

export type ActivityOutcome = "started" | "succeeded" | "denied" | "failed" | "cancelled" | "interrupted";
export interface ActivityRow {
  readonly id: string;
  readonly sequence: number;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly durationMs: number | null;
  readonly method: "GET" | "HEAD";
  readonly origin: string | null;
  readonly ruleId: string | null;
  readonly endpoint: string | null;
  readonly decision: PermissionDecision;
  readonly outcome: ActivityOutcome;
  readonly httpStatus: number | null;
  readonly responseBytes: number;
  readonly errorCode: string | null;
}

export interface ActivityQuery {
  readonly search: string;
  readonly method: "all" | "GET" | "HEAD";
  readonly outcome: "all" | ActivityOutcome;
  readonly origin: string | null;
  readonly since: string | null;
  readonly order: "newest" | "oldest";
  readonly cursor: string | null;
  readonly limit: number;
}

export interface ActivityPage {
  readonly rows: readonly ActivityRow[];
  readonly nextCursor: string | null;
  readonly snapshotSequence: number;
  readonly matchingCount: number;
  readonly newerCount: number;
}

export interface ControlSnapshot {
  readonly version: string;
  readonly accountId: string | null;
  readonly accounts: readonly AccountView[];
  readonly capabilities: readonly CapabilityView[];
  readonly interfaces: readonly InterfaceView[];
  readonly policy: { readonly managed: boolean; readonly revision: number };
  readonly web: { readonly revision: number; readonly gatewayOnly: boolean; readonly rules: readonly WebRule[] };
  readonly approvals: readonly ApprovalView[];
  readonly connectionProviders: readonly { readonly id: string; readonly title: string }[];
  readonly vault: VaultView;
  readonly discovery: BrowserDiscoveryView;
  readonly setupRequests: readonly SetupRequestView[];
}

export type ControlRequest = VaultControlRequest
  | { readonly action: "snapshot"; readonly accountId: string | null }
  | { readonly action: "approval.list" }
  | { readonly action: "setup.list" }
  | { readonly action: "setup.dismiss"; readonly id: string }
  | { readonly action: "discovery.configure"; readonly enabled: boolean; readonly expectedRevision: number }
  | { readonly action: "discovery.refresh"; readonly expectedRevision: number }
  | { readonly action: "permission.enable"; readonly expectedRevision: number }
  | { readonly action: "permission.set"; readonly adapterId: string; readonly operationId: string; readonly accountId: string | null; readonly decision: PermissionDecision; readonly expectedRevision: number; readonly expectedCapabilityDigest: string }
  | { readonly action: "approval.decide"; readonly id: string; readonly digest: string; readonly decision: "allow-once" | "deny" }
  | { readonly action: "web.save"; readonly rules: readonly WebRule[]; readonly gatewayOnly: boolean; readonly expectedRevision: number }
  | { readonly action: "activity.query"; readonly query: ActivityQuery }
  | { readonly action: "interface.save"; readonly document: string; readonly source: "user" | "imported"; readonly expectedDigest: string | null }
  | { readonly action: "interface.activate"; readonly id: string; readonly digest: string; readonly adapterId: string; readonly expectedInstalledDigest: string | null }
  | { readonly action: "interface.export"; readonly adapterId: string | null }
  | { readonly action: "connection.begin"; readonly id: string; readonly provider: string; readonly browser: "chrome" | "safari"; readonly profile: string | null; readonly expectedRevision: string | null }
  | { readonly action: "connection.verify"; readonly attemptId: string }
  | { readonly action: "connection.commit"; readonly attemptId: string; readonly expectedSubject: string }
  | { readonly action: "connection.cancel"; readonly attemptId: string }
  | { readonly action: "connection.disconnect"; readonly id: string; readonly expectedRevision: string }
  /** @deprecated Rejected by ControlService and unavailable to the native host. Historical X-import tests only. */
  | { readonly action: "vault.import"; readonly id: string; readonly account: string; readonly reference: string; readonly expectedSubject: string; readonly scopes: readonly string[]; readonly expiresAt: string | null; readonly expectedRevision: string | null }
  | { readonly action: "prompt"; readonly kind: "install" | "use" | "extend" | "gateway"; readonly adapterId: string | null };

export type ControlData =
  | { readonly kind: "snapshot"; readonly snapshot: ControlSnapshot }
  | { readonly kind: "approvals"; readonly approvals: readonly ApprovalView[] }
  | { readonly kind: "setup-requests"; readonly setupRequests: readonly SetupRequestView[] }
  | { readonly kind: "activity"; readonly page: ActivityPage }
  | { readonly kind: "connection"; readonly attemptId: string; readonly status: "awaiting-sign-in" | "verified"; readonly subject: string | null }
  | { readonly kind: "document"; readonly text: string; readonly filename: string }
  | { readonly kind: "prompt"; readonly text: string }
  | { readonly kind: "success"; readonly message: string };

export type ControlResponse =
  | { readonly ok: true; readonly data: ControlData }
  | { readonly ok: false; readonly code: string; readonly message: string };

/** Native and Direct supply this port to the same product screens. */
export interface ControlPanelPort {
  request(request: ControlRequest, signal?: AbortSignal): Promise<ControlResponse>;
}

export type ApprovalTarget =
  | { readonly kind: "provider"; readonly adapterId: string; readonly operationId: string; readonly authId: string | null; readonly input: JsonValue; readonly planDigest: string | null }
  | { readonly kind: "web"; readonly method: "GET" | "HEAD"; readonly url: string }
  | { readonly kind: "credential"; readonly grantId: string };

export interface CheckedApproval {
  readonly digest: string;
  readonly revision: number;
  readonly decision: PermissionDecision;
  readonly kind: "provider" | "web" | "credential";
  readonly title: string;
  readonly account: string | null;
  readonly effect: string;
  readonly preview: string;
}

export type AgentApprovalRequest =
  | { readonly protocol: "ghostget.approval/1"; readonly action: "request"; readonly id: string; readonly target: ApprovalTarget; readonly expectedDigest: string }
  | { readonly protocol: "ghostget.approval/1"; readonly action: "check"; readonly id: string; readonly digest: string }
  | { readonly protocol: "ghostget.approval/1"; readonly action: "cancel"; readonly id: string; readonly digest: string };

export type AgentApprovalResponse = {
  readonly protocol: "ghostget.approval/1";
  readonly status: "pending" | "allowed" | "denied" | "expired" | "cancelled" | "invalid";
  readonly id: string;
  readonly digest: string;
};

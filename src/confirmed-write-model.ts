import type { BrowserFileResolver, executeBrowserRecipe } from "./browser";
import type { BrowserDispatchPlan } from "./model";
import type { ProviderPluginRegistry } from "./provider-plugin-registry";
import type { executeProviderOperation } from "./provider";
import type { LocalCliOperationExecutor } from "./local-cli-execution";
import type { executeReviewedTemplateOperation } from "./reviewed-template";
import type { ReadFailureProjection, WebSessionOperationExecutor, PublicWebSessionOperationExecutor, WebSessionCleanupBarrierRegistrar } from "./web-session-execution";
import type { WebSessionCleanupAdmissionBlockedError } from "./web-session-cleanup-admission";
import type { RunReceipt, ConfirmationClaimSnapshot, InvocationDuplicateRiskV1 } from "./runtime";

export type LedgerEntry = {
  readonly schemaVersion: 2 | 3;
  readonly keyHash: string;
  readonly adapterHash: string;
  readonly authHash: string;
  readonly inputHash: string;
  readonly planDigest: string;
  readonly status: "pending" | "succeeded" | "partial" | "indeterminate";
  readonly dispatch: RunReceipt["dispatch"];
  readonly runId: string;
  readonly updatedAt: string;
  readonly expiresAt: string;
  readonly duplicateIntentHash?: string;
};

export type LedgerSnapshot = {
  readonly path: string;
  readonly entry: LedgerEntry;
  readonly contentSha256: string;
};

export type BoundedExecution = {
  readonly status: "succeeded" | "failed" | "partial" | "indeterminate";
  readonly output: unknown;
  readonly finalUrl: string | null;
  readonly dispatchStarted: boolean;
  readonly dispatch: RunReceipt["dispatch"];
  readonly error?: string;
  readonly readFailure?: ReadFailureProjection;
  readonly noOp?: true;
  readonly privateArtifactsPreserved?: boolean;
  readonly recoveryHandle?: string;
};

export type RunPreparedOptions = {
  readonly headed: boolean;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly registry?: ProviderPluginRegistry;
  readonly now?: Date;
  readonly executeRecipe?: typeof executeBrowserRecipe;
  readonly executeProvider?: typeof executeProviderOperation;
  readonly executeWebSession?: WebSessionOperationExecutor;
  readonly executeLocalCli?: LocalCliOperationExecutor;
  readonly executePublicWebSession?: PublicWebSessionOperationExecutor;
  readonly executeReviewedTemplate?: typeof executeReviewedTemplateOperation;
  readonly fileResolver?: BrowserFileResolver;
  readonly confirmedDispatches?: readonly BrowserDispatchPlan[];
  readonly hasPlanAssets?: boolean;
  readonly runId?: string;
  readonly confirmationClaim?: ConfirmationClaimSnapshot;
  readonly duplicateRisk?: InvocationDuplicateRiskV1;
  readonly signal?: AbortSignal;
  readonly registerCleanupBarrier?: WebSessionCleanupBarrierRegistrar;
  readonly preflightFailure?: WebSessionCleanupAdmissionBlockedError;
  readonly persistReceipt?: (
    receipt: RunReceipt,
    environment: Readonly<Record<string, string | undefined>>,
  ) => void;
};

export const GENERIC_EXECUTOR_TERMINATION =
  "provider executor terminated without returning a bounded result";

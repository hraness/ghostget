import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import { GENERIC_EXECUTOR_TERMINATION, type BoundedExecution, type LedgerEntry, type LedgerSnapshot, type RunPreparedOptions } from "./confirmed-write-model";
import type { PreparedInvocation, StoredPlan, InvocationPlan, InvocationDuplicateRiskV1, InvocationResult, RunReceipt, ConfirmationClaimSnapshot, ConfirmationClaimRepairReport, RunJournalRepairReport, confirmInvocation } from "./runtime";
import { ConfirmedWriteFailure, confirmedWriteAttempt, type ConfirmedWritePhase } from "./confirmed-write-failure";

import { redactSensitiveText } from "@hraness/kb/clip/persist";

import { executeBrowserRecipe, PreservedBrowserArtifactsError, type BrowserDispatchEvent } from "./browser";
import { assertOperationPermission, checkOperationPermission, readOperationPolicy } from "./operation-permission";
import { canonicalJson, DOM_ACTION_TRANSPORT_DISABLED_MESSAGE, expandBrowserRecipe, isLocalCliOperation, isProviderOperation, isReviewedTemplateOperation, isWebSessionOperation, manifestHash, sha256, type FileInputValue, type InputValue, type GhostgetManifest } from "./model";

import { localCliContractIdentity } from "./local-cli-contracts";
import type { LocalCliDispatchEvent, LocalCliExecutionOptions } from "./local-cli-execution";
import { runLocalCliOperationWithDeadline } from "./local-cli-execution";
import { localCliToolArtifactForCurrentRuntime } from "./local-cli-tool-identity";

import {
  getProviderContract,
  providerContractHash,
} from "./provider-contracts";
import {
  executeProviderOperation,
  type ProviderDispatchEvent,
} from "./provider";
import { runProviderPluginPlanConformance } from "./provider-plugin";

import type {
  ProviderPluginOperationResolutionV1,
  ProviderPluginRegistry,
} from "./provider-plugin-registry";
import { isProviderPluginOperationName } from "./provider-plugin-identifiers";
import { type PortableOperationIdentityV1 } from "./provider-plugin-portable-identity";
import {
  acquirePortableProviderPluginInvocationLease,
  createPortableProviderPluginInvocationLeaseContainmentController,
  releasePortableProviderPluginInvocationLease,
} from "./provider-plugin-invocation-lease";
import {
  createPortableProviderPluginCleanupContext,
} from "./provider-plugin-cleanup-barrier";

import { providerPluginRegistry } from "./provider-plugins";
import {
  getWebSessionContract,
  webSessionContractHash,
} from "./web-session-contracts";
import { runWebSessionOperationWithDeadline, WebSessionCleanupUnverifiedError, type WebSessionExecutionOptions, type WebSessionDispatchEvent, type WebSessionProviderAcceptedMutationTargetEvent, type WebSessionProviderBoundMutationTargetEvent } from "./web-session-execution";
import {
  WebSessionCleanupAdmissionBlockedError,
  acquireWebSessionCleanupAdmission,
  type WebSessionCleanupAdmissionIdentity,
} from "./web-session-cleanup-admission";
import { isPublicWebSessionInvocationAuthority, persistedAuthAuthority, type InvocationAuthority } from "./web-session-authentication-policy";
import { executeReviewedTemplateOperation, planReviewedTemplateDispatches, reviewedTemplateHash, type ReviewedTemplateDispatchEvent } from "./reviewed-template";
import { cleanupPlanAssets, resolvePlanAssetFiles } from "./plan-assets";
import { writeProviderAcceptedMutationTargetEvidence, writeRecoveryCapsule, type RecoveryContractIdentity } from "./recovery";
import { createRunJournal, initialRunJournal, readRunJournal, updateRunJournal, type RunJournal, type RunJournalSnapshot } from "./run-journal";
import { currentProcessStartIdentity } from "./process-identity";

import { loadInstalledManifest, removePrivateStateFile } from "./storage";

export interface ConfirmedWriteKernel {
  readonly isInputArray: (value: InputValue) => value is readonly (string | number | boolean | FileInputValue)[];
  readonly isFileInputValue: (value: unknown) => value is FileInputValue;
  readonly resolveCodeOwnedPluginOperation: (operation: GhostgetManifest["operations"][string], registry: ProviderPluginRegistry) => ProviderPluginOperationResolutionV1 | null;
  readonly hasExactKeys: (value: Record<string, unknown>, keys: readonly string[]) => boolean;
  readonly revalidatePreparedInvocation: (invocation: PreparedInvocation, registry: ProviderPluginRegistry) => {
    readonly invocation: PreparedInvocation;
    readonly operation: GhostgetManifest["operations"][string];
  };
  readonly planPath: (digest: string, environment: Readonly<Record<string, string | undefined>>) => string;
  readonly acquireConfirmationClaim: (digest: string, runId: string, environment: Readonly<Record<string, string | undefined>>, now: Date) => ConfirmationClaimSnapshot;
  readonly releaseConfirmationClaim: (snapshot: ConfirmationClaimSnapshot, environment: Readonly<Record<string, string | undefined>>) => boolean;
  readonly authHash: (auth: InvocationAuthority) => string;
  readonly finalOrigin: (value: string | null, origins: readonly string[]) => string | null;
  readonly boundedRecoveryHandle: (value: string | undefined) => string | null;
  readonly loadInstalledManifestWithRegistry: (adapterId: string, environment: Readonly<Record<string, string | undefined>>, registry: ProviderPluginRegistry) => ReturnType<typeof loadInstalledManifest>;
  readonly resolveInvocationDuplicateRisk: (plan: InvocationPlan, requestedRunIds: readonly string[], environment: Readonly<Record<string, string | undefined>>) => InvocationDuplicateRiskV1 | undefined;
  readonly claimDuplicateRiskSource: (binding: InvocationDuplicateRiskV1, successorRunId: string, environment: Readonly<Record<string, string | undefined>>, now: Date) => void;
  readonly loadInvocationPlan: (digest: string, environment: Readonly<Record<string, string | undefined>>) => StoredPlan;
  readonly planDigestHasRetainingJournal: (digest: string, environment: Readonly<Record<string, string | undefined>>) => boolean;
  readonly validateFreshPlan: (stored: StoredPlan, environment: Readonly<Record<string, string | undefined>>, now: Date, registry: ProviderPluginRegistry, loadManifest: typeof loadInstalledManifest) => PreparedInvocation;
  readonly isDispatchProgress: (value: unknown) => value is RunReceipt["dispatch"];
  readonly ledgerPath: (adapterHash: string, authHashValue: string, operationId: string, inputHash: string, environment: Readonly<Record<string, string | undefined>>, duplicateIntentHash?: string) => string;
  readonly acquireLedger: (path: string, entry: LedgerEntry, environment: Readonly<Record<string, string | undefined>>, now: Date) => | { readonly acquired: true; readonly snapshot: LedgerSnapshot }
    | { readonly acquired: false; readonly existing: LedgerEntry };
  readonly writeReceipt: (receipt: RunReceipt, environment: Readonly<Record<string, string | undefined>>) => void;
  readonly runJournalReceipt: (journal: RunJournal) => RunReceipt;
  readonly relativeStatePath: (path: string, environment: Readonly<Record<string, string | undefined>>) => string;
  readonly projectRunJournal: (journal: RunJournal, environment: Readonly<Record<string, string | undefined>>) => void;
  readonly repairInterruptedConfirmationClaims: (environment: Readonly<Record<string, string | undefined>>) => ConfirmationClaimRepairReport;
  readonly repairInterruptedRunJournals: (environment: Readonly<Record<string, string | undefined>>, now: Date) => RunJournalRepairReport;
  readonly foreignDataRecord: (value: unknown) => Record<string, unknown> | null;
  readonly executionOutputLimit: (operation: GhostgetManifest["operations"][string]) => number;
  readonly boundedThrownExecutorReason: (error: unknown) => string;
  readonly boundedExecutionResult: (value: unknown, kind: | "browser"
    | "provider"
    | "web-session"
    | "local-cli"
    | "reviewed-template", maxOutputBytes: number) => BoundedExecution;
  readonly readRunReceipt: (runId: string, environment: Readonly<Record<string, string | undefined>>) => RunReceipt;
}


type ConfirmOptions = Parameters<typeof confirmInvocation>[1];
type NativeOutcome = { readonly status: "fulfilled"; readonly value: unknown } | { readonly status: "rejected"; readonly reason: unknown };

/** Each instance belongs to exactly one confirmation, including its native ALS context. */
export function makeConfirmedWritePlatform(kernel: ConfirmedWriteKernel, original: ConfirmOptions) {
  const environment = original.environment ?? process.env;
  let portableContext: ReturnType<typeof createPortableProviderPluginCleanupContext> | null = null;
  const attempt = <A>(phase: ConfirmedWritePhase, work: () => A) =>
    confirmedWriteAttempt(phase, () => portableContext === null ? work() : portableContext.run(work));
  const native = <A>(phase: ConfirmedWritePhase, work: () => Promise<A>) =>
    Effect.tryPromise({
      try: () => portableContext === null ? work() : portableContext.run(work),
      catch: cause => new ConfirmedWriteFailure({ phase, cause }),
    }).pipe(Effect.uninterruptible);
  const {
    isInputArray, isFileInputValue,
    resolveCodeOwnedPluginOperation,
    hasExactKeys,
    revalidatePreparedInvocation,
    planPath,
    acquireConfirmationClaim,
    releaseConfirmationClaim,
    authHash,
    finalOrigin,
    boundedRecoveryHandle,
    loadInstalledManifestWithRegistry,
    resolveInvocationDuplicateRisk,
    claimDuplicateRiskSource,
    loadInvocationPlan,
    planDigestHasRetainingJournal,
    validateFreshPlan,
    isDispatchProgress,
    ledgerPath,
    acquireLedger,
    writeReceipt,
    runJournalReceipt,
    relativeStatePath,
    projectRunJournal,
    repairInterruptedConfirmationClaims,
    repairInterruptedRunJournals,
    foreignDataRecord,
    executionOutputLimit,
    boundedThrownExecutorReason,
    boundedExecutionResult,
    readRunReceipt
  } = kernel;

  const now = () => original.now ?? new Date();
  function execution(checked: ReturnType<ConfirmedWriteKernel["revalidatePreparedInvocation"]>, planDigest: string, options: RunPreparedOptions) {
    const registry = options.registry ?? providerPluginRegistry;
    const invocation = checked.invocation;
    const operation = checked.operation;
    const dispatchPermissionCheck = (): void | Promise<void> => {
      const permissionOptions = { environment: options.environment, registry, ...(options.signal === undefined ? {} : { signal: options.signal }) };
      // Legacy native execution persists its dispatch prefix before returning a
      // Promise. Managed admission may need an asynchronous lease recheck.
      if (readOperationPolicy(options.environment).managed) return checkOperationPermission(invocation, permissionOptions);
      assertOperationPermission(invocation, permissionOptions);
    };
    if (operation.risk === "R4") throw new Error("R4 capabilities are blocked by wrench");
    if (operation.risk !== "R2" && operation.risk !== "R3") throw new Error("only R2 and R3 plans use confirmation");
    const risk = operation.risk;
    const isWrite = true;
    const persistReceipt = options.persistReceipt ?? writeReceipt;
    const observedTime = () => options.now ?? new Date();
    const providerOperation = isProviderOperation(operation);
    const webSessionOperation = isWebSessionOperation(operation);
    const localCliOperation = isLocalCliOperation(operation);
    const reviewedTemplateOperation = isReviewedTemplateOperation(operation);
    const pluginResolution = resolveCodeOwnedPluginOperation(operation, registry);
    const plannedDispatches = pluginResolution !== null
      ? runProviderPluginPlanConformance(
        pluginResolution.operation,
        invocation.input,
      )
      : reviewedTemplateOperation
        ? planReviewedTemplateDispatches(invocation.operationId, operation.risk, operation.reviewedTemplate)
        : operation.browser === undefined
          ? (() => {
            throw new Error(DOM_ACTION_TRANSPORT_DISABLED_MESSAGE);
          })()
          : expandBrowserRecipe(operation.browser, invocation.input).dispatches;
    if (
      options.confirmedDispatches !== undefined
      && canonicalJson(plannedDispatches) !== canonicalJson(options.confirmedDispatches)
    ) {
      throw new Error(
        "planned dispatch schedule changed before execution; preview the action again",
      );
    }
    const planned = plannedDispatches.length;
    const currentProviderContractHash = providerOperation
      ? providerContractHash(
        getProviderContract(operation.provider, registry),
        registry,
      )
      : null;
    const currentWebSessionContractHash = webSessionOperation
      ? webSessionContractHash(
        getWebSessionContract(operation.webSession, registry),
        registry,
      )
      : null;
    const currentLocalCliContractIdentity = localCliOperation
      ? localCliContractIdentity(operation.localCli, registry)
      : null;
    const currentReviewedTemplateContractHash = reviewedTemplateOperation
      ? reviewedTemplateHash(operation.reviewedTemplate)
      : null;
    const currentPortablePluginContract =
      pluginResolution?.portableIdentity ?? null;
    const recoveryContract = (): RecoveryContractIdentity => {
      if (currentPortablePluginContract !== null) {
        return {
          transport: "portable-provider-plugin",
          identity: currentPortablePluginContract,
        };
      }
      if (providerOperation) {
        if (currentProviderContractHash === null) throw new Error("official provider contract hash is unavailable");
        return {
          transport: "provider-api",
          provider: operation.provider.provider,
          action: operation.provider.action,
          version: operation.provider.contractVersion,
          hash: currentProviderContractHash,
        };
      }
      if (webSessionOperation) {
        if (currentWebSessionContractHash === null) throw new Error("authenticated web contract hash is unavailable");
        return {
          transport: "web-session-api",
          site: operation.webSession.site,
          action: operation.webSession.action,
          version: operation.webSession.contractVersion,
          hash: currentWebSessionContractHash,
        };
      }
      if (localCliOperation) {
        if (currentLocalCliContractIdentity === null) {
          throw new Error("local CLI contract identity is unavailable");
        }
        return {
          transport: "local-cli",
          identity: currentLocalCliContractIdentity,
        };
      }
      if (reviewedTemplateOperation) {
        if (currentReviewedTemplateContractHash === null) throw new Error("reviewed template contract hash is unavailable");
        return {
          transport: "reviewed-template-api",
          version: operation.reviewedTemplate.contractVersion,
          hash: currentReviewedTemplateContractHash,
        };
      }
      throw new Error(DOM_ACTION_TRANSPORT_DISABLED_MESSAGE);
    };
    const inputHash = sha256(canonicalJson(invocation.input));
    const runId = options.runId ?? crypto.randomUUID();
    if (!/^[0-9a-f-]{36}$/u.test(runId)) {
      throw new Error("run ID is malformed");
    }
    const startedAt = (options.now ?? new Date()).toISOString();
    const adapter = {
      id: invocation.manifest.id,
      version: invocation.manifest.version,
      hash: manifestHash(invocation.manifest),
    };
    const auth = { id: invocation.auth.id, hash: authHash(invocation.auth), kind: invocation.auth.kind };
    const durableWriteAuth = (): InvocationPlan["auth"] => {
      if (!isWrite) throw new Error("read invocation has no durable write auth");
      const selected = persistedAuthAuthority(invocation.auth);
      return {
        id: selected.id,
        hash: authHash(selected),
        kind: selected.kind,
      };
    };
    const withTransport = (value: Omit<RunReceipt, "schemaVersion" | "transport" | "providerContractHash" | "webSessionContractHash" | "localCliContract" | "reviewedTemplateContractHash" | "portablePluginContract">): RunReceipt => {
      if (currentPortablePluginContract !== null) {
        return {
          ...value,
          schemaVersion: 6,
          transport: "portable-provider-plugin",
          portablePluginContract: currentPortablePluginContract,
        };
      }
      if (providerOperation) {
        if (currentProviderContractHash === null) throw new Error("official provider contract hash is unavailable");
        return {
          ...value,
          schemaVersion: 3,
          transport: "provider-api",
          providerContractHash: currentProviderContractHash,
        };
      }
      if (webSessionOperation) {
        if (currentWebSessionContractHash === null) throw new Error("authenticated web contract hash is unavailable");
        return {
          ...value,
          schemaVersion: 4,
          transport: "web-session-api",
          webSessionContractHash: currentWebSessionContractHash,
        };
      }
      if (localCliOperation) {
        if (currentLocalCliContractIdentity === null) {
          throw new Error("local CLI contract identity is unavailable");
        }
        return {
          ...value,
          schemaVersion: 7,
          transport: "local-cli",
          localCliContract: currentLocalCliContractIdentity,
        };
      }
      if (reviewedTemplateOperation) {
        if (currentReviewedTemplateContractHash === null) throw new Error("reviewed template contract hash is unavailable");
        return {
          ...value,
          schemaVersion: 5,
          transport: "reviewed-template-api",
          reviewedTemplateContractHash: currentReviewedTemplateContractHash,
        };
      }
      return { ...value, schemaVersion: 2, transport: "browser" };
    };
    let journal: RunJournalSnapshot | null = null;
    let durableReceipt: RunReceipt = withTransport({
      runId,
      planDigest,
      adapter,
      operation: invocation.operationId,
      risk: operation.risk,
      inputHash,
      auth,
      status: "pending",
      dispatchStarted: false,
      dispatch: { planned, started: 0, verified: 0 },
      startedAt,
      finishedAt: startedAt,
      finalOrigin: null,
      error: "execution was prepared but no durable final outcome was recorded",
    });
    let duplicateSourceClaimed = false;
    const persistDispatchProgress = async (
      event:
        | BrowserDispatchEvent
        | ProviderDispatchEvent
        | WebSessionDispatchEvent
        | LocalCliDispatchEvent
        | ReviewedTemplateDispatchEvent,
      phase: "starting" | "verified",
    ): Promise<void> => {
      if (phase === "starting") {
        const permission = dispatchPermissionCheck();
        if (permission !== undefined) await permission;
      }
      const expectedDispatch = plannedDispatches[event.index - 1];
      const prior = durableReceipt.dispatch;
      const expectedPrior = phase === "starting"
        ? { planned, started: event.index - 1, verified: event.index - 1 }
        : { planned, started: event.index, verified: event.index - 1 };
      if (
        !isDispatchProgress(event.progress)
        || event.progress.planned !== planned
        || event.index < 1
        || event.index > planned
        || expectedDispatch === undefined
        || event.id !== expectedDispatch.id
        || canonicalJson(prior) !== canonicalJson(expectedPrior)
        || (phase === "starting"
          ? event.progress.started !== event.index - 1
          || event.progress.verified !== event.index - 1
          : event.progress.started !== event.index
          || event.progress.verified !== event.index)
      ) {
        return Promise.reject(new Error("dispatch progress diverged from the confirmed schedule"));
      }
      const dispatch = phase === "starting"
        ? { planned, started: event.index, verified: event.progress.verified }
        : event.progress;
      if (!isDispatchProgress(dispatch)) return Promise.reject(new Error("dispatch progress is malformed"));
      const progressAt = (options.now ?? new Date()).toISOString();
      let next: RunReceipt = {
        ...durableReceipt,
        status: "pending",
        dispatchStarted: dispatch.started > 0,
        dispatch,
        finishedAt: progressAt,
        error: phase === "starting"
          ? "a dispatch was durably marked before provider submission; a missing final outcome requires reconciliation"
          : "verified dispatch progress was stored; execution has not reached a durable final outcome",
      };
      try {
        if (
          phase === "starting"
          && event.index === 1
          && options.duplicateRisk !== undefined
          && !duplicateSourceClaimed
        ) {
          claimDuplicateRiskSource(
            options.duplicateRisk,
            runId,
            options.environment,
            options.now ?? new Date(),
          );
          duplicateSourceClaimed = true;
        }
        if (journal !== null) {
          journal = updateRunJournal(journal, {
            type: phase === "starting" ? "dispatch-started" : "dispatch-verified",
            index: event.index,
            at: progressAt,
          }, options.environment);
          next = runJournalReceipt(journal.journal);
          durableReceipt = next;
        } else {
          persistReceipt(next, options.environment);
        }
        durableReceipt = next;
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(new Error("refusing provider dispatch because durable progress could not be stored", { cause: error }));
      }
    };
    const persistProviderBoundMutationTarget = (
      eventValue:
        | WebSessionProviderAcceptedMutationTargetEvent
        | WebSessionProviderBoundMutationTargetEvent,
    ): Promise<void> => {
      const event = foreignDataRecord(eventValue);
      if (
        event === null
        || !hasExactKeys(event, ["id", "index", "target"])
        || typeof event.id !== "string"
        || !Number.isSafeInteger(event.index)
      ) {
        return Promise.reject(new Error(
          "provider-accepted mutation target event is malformed",
        ));
      }
      const index = event.index as number;
      const expectedDispatch = plannedDispatches[index - 1];
      const current = durableReceipt.dispatch;
      if (
        !isWrite
        || (!webSessionOperation && !localCliOperation)
        || journal === null
        || expectedDispatch === undefined
        || event.id !== expectedDispatch.id
        || index < 1
        || index > planned
        || current.planned !== planned
        || current.started !== index
        || current.verified !== index - 1
      ) {
        return Promise.reject(new Error(
          "provider-accepted mutation target diverged from the active dispatch",
        ));
      }
      const contract = recoveryContract();
      if (
        contract.transport !== "web-session-api"
        && contract.transport !== "local-cli"
      ) {
        return Promise.reject(new Error(
          "provider-accepted mutation target requires a session or local CLI contract",
        ));
      }
      try {
        writeProviderAcceptedMutationTargetEvidence({
          schemaVersion: 1,
          runId,
          acceptedAt: (options.now ?? new Date()).toISOString(),
          planDigest,
          adapter,
          operation: invocation.operationId,
          inputHash,
          auth,
          contract,
          dispatch: {
            id: event.id,
            index,
            planned,
          },
          target: event.target,
        }, options.environment);
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(new Error(
          "provider-accepted mutation target could not be stored",
          { cause: error },
        ));
      }
    };
    const executionKind = providerOperation
      ? "provider"
      : webSessionOperation
        ? "web-session"
        : localCliOperation
          ? "local-cli"
          : reviewedTemplateOperation ? "reviewed-template" : "browser";
    const exactTargetReconciliationKind =
      pluginResolution?.operation.reconciliation?.kind;
    const publicWebSessionOperation = webSessionOperation
      && isPublicWebSessionInvocationAuthority(invocation.auth);

    const requireJournal = () => {
      if (journal === null) throw new Error("remote write has no run journal");
      return journal;
    };
    const record = (event: Parameters<typeof updateRunJournal>[1]) => {
      journal = updateRunJournal(requireJournal(), event, options.environment);
    };
    return {
      startedAt, runId, inputHash, adapter, auth,
      get journalTerminal() { return journal?.journal.phase === "terminal"; },
      journalRequest: attempt("journal", () => {
        if (planDigest === null) throw new Error("remote writes require a confirmation plan");
        if (
          options.confirmationClaim === undefined
          || options.confirmationClaim.claim.digest !== planDigest
          || options.confirmationClaim.claim.runId !== runId
        ) {
          throw new Error(
            "remote writes require an exact durable confirmation ownership claim",
          );
        }
        if (!isProviderPluginOperationName(invocation.operationId)) {
          throw new Error("run journal operation name is malformed");
        }
        const contract = recoveryContract();
        const timeoutMs = providerOperation
          ? operation.provider.timeoutMs
          : webSessionOperation
            ? operation.webSession.timeoutMs
            : localCliOperation
              ? operation.localCli.timeoutMs
              : reviewedTemplateOperation
                ? operation.reviewedTemplate.state === "reviewed"
                  ? operation.reviewedTemplate.timeoutMs
                  : 10 * 60_000
                : operation.browser?.timeoutMs ?? 10 * 60_000;
        const processIdentity = currentProcessStartIdentity();
        const operationId = invocation.operationId;
        return () => {
          journal = createRunJournal(initialRunJournal({
            runId,
            planDigest,
            adapter,
            operation: operationId,
            risk,
            inputHash,
            auth: durableWriteAuth(),
            contract: contract.transport === "portable-provider-plugin"
              || contract.transport === "local-cli"
              ? contract
              : {
                transport: contract.transport,
                hash: contract.hash,
              },
            ...(options.duplicateRisk === undefined
              ? {}
              : {
                duplicateIntent: {
                  schemaVersion: 1 as const,
                  intentHash: options.duplicateRisk.intentHash,
                  sourceRunId: options.duplicateRisk.sourceRunId,
                },
              }),
            plannedDispatches: planned,
            hasPlanAssets: options.hasPlanAssets === true,
            owner: {
              pid: process.pid,
              token: crypto.randomUUID(),
              ...processIdentity,
              leaseUntil: new Date(
                Date.parse(startedAt) + timeoutMs + 30_000,
              ).toISOString(),
            },
            startedAt,
            dedupeExpiresAt: new Date(
              Date.parse(startedAt) + operation.dedupeWindowMs,
            ).toISOString(),
          }), options.environment);
        };
      }),
      createJournal: (create: () => void) => attempt("journal", create),
      removePlan: attempt("confirmation", () => removePrivateStateFile(planPath(planDigest, options.environment), options.environment)),
      releaseClaim: attempt("confirmation", () => {
        if (options.confirmationClaim === undefined) throw new Error("remote writes require an exact durable confirmation ownership claim");
        return releaseConfirmationClaim(options.confirmationClaim, options.environment);
      }),
      record: (event: Parameters<typeof updateRunJournal>[1]) => attempt("journal", () => record(event)),
      projectJournal: attempt("projection", () => projectRunJournal(requireJournal().journal, options.environment)),
      refreshReceipt: attempt("projection", () => { durableReceipt = runJournalReceipt(requireJournal().journal); }),
      persistProvisional: attempt("projection", () => persistReceipt(durableReceipt, options.environment)),
      clock: () => attempt("journal", () => observedTime().toISOString()),
      // Path and entry construction happen before the acquire-specific recovery branch.
      ledgerRequest: attempt("journal", () => ({
        path: ledgerPath(adapter.hash, auth.hash, invocation.operationId, inputHash, options.environment, options.duplicateRisk?.intentHash),
        entry: {
          schemaVersion: options.duplicateRisk === undefined ? 2 : 3,
          keyHash: options.duplicateRisk?.intentHash ?? inputHash,
          adapterHash: adapter.hash, authHash: auth.hash, inputHash, planDigest,
          status: "pending", dispatch: durableReceipt.dispatch, runId, updatedAt: startedAt,
          expiresAt: new Date(Date.parse(startedAt) + operation.dedupeWindowMs).toISOString(),
          ...(options.duplicateRisk === undefined ? {} : { duplicateIntentHash: options.duplicateRisk.intentHash }),
        } satisfies LedgerEntry,
      })),
      acquireLedger: (request: { readonly path: string; readonly entry: LedgerEntry }) => attempt("journal", () => acquireLedger(request.path, request.entry, options.environment, observedTime())),
      ledgerRelativePath: (path: string) => attempt("journal", () => relativeStatePath(path, options.environment)),
      readReceipt: (id: string) => attempt("projection", () => readRunReceipt(id, options.environment)),
      storeCapsule: attempt("journal", () => writeRecoveryCapsule({
        schemaVersion: 1, runId, createdAt: startedAt, planDigest, adapter,
        operation: invocation.operationId, risk, input: invocation.input,
        inputHash, auth: durableWriteAuth(), contract: recoveryContract(),
      }, options.environment)),
      outputLimit: attempt("dispatch", () => executionOutputLimit(operation)),
      dispatch: native("dispatch", async () => {
        const permission = dispatchPermissionCheck();
        if (permission !== undefined) await permission;
        if (options.preflightFailure !== undefined) {
          throw options.preflightFailure;
        }
        return providerOperation
          ? await (options.executeProvider ?? executeProviderOperation)(
            invocation.manifest,
            operation.provider,
            invocation.input,
            persistedAuthAuthority(invocation.auth),
            {
              registry,
              ...(options.fileResolver === undefined ? {} : { fileResolver: options.fileResolver }),
              ...(options.now === undefined ? {} : { now: options.now }),
              ...(options.signal === undefined ? {} : { signal: options.signal }),
              environment: options.environment,
              beforeDispatch: (event) => persistDispatchProgress(event, "starting"),
              afterDispatchVerified: (event) => persistDispatchProgress(event, "verified"),
            },
          )
          : webSessionOperation
            ? await runWebSessionOperationWithDeadline(
              operation.webSession,
              {
                ...(options.fileResolver === undefined ? {} : { fileResolver: options.fileResolver }),
                environment: options.environment,
                ...(options.signal === undefined ? {} : { signal: options.signal }),
                ...(options.registerCleanupBarrier === undefined
                  ? {}
                  : {
                    registerCleanupBarrier: options.registerCleanupBarrier,
                  }),
                beforeDispatch: (event) => persistDispatchProgress(event, "starting"),
                ...(isWrite
                  && exactTargetReconciliationKind
                  === "provider-accepted-target-presence"
                  ? {
                    afterProviderAcceptedMutationTarget:
                      persistProviderBoundMutationTarget,
                  }
                  : {}),
                ...(isWrite
                  && exactTargetReconciliationKind
                  === "provider-bound-target-desired-state"
                  ? {
                    afterProviderBoundMutationTarget:
                      persistProviderBoundMutationTarget,
                  }
                  : {}),
                afterDispatchVerified: (event) => persistDispatchProgress(event, "verified"),
              },
              async (executionOptions: WebSessionExecutionOptions) => {
                if (
                  pluginResolution === null
                  || (
                    pluginResolution.binding.transport !== "web-session-api"
                    && pluginResolution.binding.transport !== "linked-device"
                  )
                ) {
                  throw new Error(
                    "authenticated session operation resolved to the wrong plugin transport",
                  );
                }
                if (publicWebSessionOperation) {
                  if (pluginResolution.binding.transport !== "web-session-api") {
                    throw new Error(
                      "public access is available only to a web-session plugin binding",
                    );
                  }
                  const executePublic = options.executePublicWebSession
                    ?? pluginResolution.binding.executePublic;
                  if (executePublic === undefined) {
                    throw new Error(
                      "reviewed public web-session operation has no public runtime hook",
                    );
                  }
                  return executePublic(
                    invocation.manifest,
                    operation.webSession,
                    invocation.input,
                    executionOptions,
                  );
                }
                return (options.executeWebSession
                  ?? pluginResolution.binding.execute)(
                    invocation.manifest,
                    operation.webSession,
                    invocation.input,
                    persistedAuthAuthority(invocation.auth),
                    executionOptions,
                  );
              },
            )
            : localCliOperation
              ? await runLocalCliOperationWithDeadline(
                operation.localCli,
                {
                  ...(options.fileResolver === undefined
                    ? {}
                    : { fileResolver: options.fileResolver }),
                  environment: options.environment,
                  ...(options.signal === undefined
                    ? {}
                    : { signal: options.signal }),
                  ...(options.registerCleanupBarrier === undefined
                    ? {}
                    : { registerCleanupBarrier: options.registerCleanupBarrier }),
                  beforeDispatch: (event) =>
                    persistDispatchProgress(event, "starting"),
                  ...(isWrite
                    && exactTargetReconciliationKind
                    === "provider-accepted-target-presence"
                    ? {
                      afterProviderAcceptedMutationTarget:
                        persistProviderBoundMutationTarget,
                    }
                    : {}),
                  ...(isWrite
                    && exactTargetReconciliationKind
                    === "provider-bound-target-desired-state"
                    ? {
                      afterProviderBoundMutationTarget:
                        persistProviderBoundMutationTarget,
                    }
                    : {}),
                  afterDispatchVerified: (event) =>
                    persistDispatchProgress(event, "verified"),
                },
                async (executionOptions: LocalCliExecutionOptions) => {
                  if (
                    pluginResolution === null
                    || pluginResolution.binding.transport !== "local-cli"
                  ) {
                    throw new Error(
                      "local CLI operation resolved to the wrong plugin transport",
                    );
                  }
                  return (options.executeLocalCli
                    ?? pluginResolution.binding.execute)(
                      invocation.manifest,
                      operation.localCli,
                      invocation.input,
                      persistedAuthAuthority(invocation.auth),
                      executionOptions,
                    );
                },
              )
              : reviewedTemplateOperation
                ? await (options.executeReviewedTemplate ?? executeReviewedTemplateOperation)(
                  invocation.manifest,
                  invocation.operationId,
                  operation.reviewedTemplate,
                  invocation.input,
                  persistedAuthAuthority(invocation.auth),
                  {
                    beforeDispatch: (event) => persistDispatchProgress(event, "starting"),
                    afterDispatchVerified: (event) => persistDispatchProgress(event, "verified"),
                  },
                )
                : await (options.executeRecipe ?? executeBrowserRecipe)(
                  invocation.manifest,
                  operation.browser,
                  invocation.input,
                  persistedAuthAuthority(invocation.auth),
                  {
                    headed: options.headed,
                    ...(options.fileResolver === undefined ? {} : { fileResolver: options.fileResolver }),
                    beforeDispatch: (event) => persistDispatchProgress(event, "starting"),
                    afterDispatchVerified: (event) => persistDispatchProgress(event, "verified"),
                  },
                );

      }),
      projectExecution: (outcome: NativeOutcome, maxOutputBytes: number) => attempt("projection", () => {
        let execution: BoundedExecution;
        if (outcome.status === "fulfilled") {
          const rawExecution = outcome.value;
          try {
            execution = boundedExecutionResult(rawExecution, executionKind, maxOutputBytes);
          } catch {
            const { started } = durableReceipt.dispatch;
            execution = {
              status: started > 0 ? "indeterminate" : "failed",
              output: null,
              finalUrl: null,
              dispatchStarted: started > 0,
              dispatch: durableReceipt.dispatch,
              error: GENERIC_EXECUTOR_TERMINATION,
            };
          }
        } else {
          const error = outcome.reason;
          const { started } = durableReceipt.dispatch;
          const preservedArtifactsError =
            error instanceof PreservedBrowserArtifactsError
              ? error
              : error instanceof WebSessionCleanupUnverifiedError
                && error.cause instanceof PreservedBrowserArtifactsError
                ? error.cause
                : null;
          const cleanupRequired = error instanceof WebSessionCleanupUnverifiedError
            || error instanceof WebSessionCleanupAdmissionBlockedError;
          execution = {
            status: started > 0 ? "indeterminate" : "failed",
            output: null,
            finalUrl: null,
            dispatchStarted: started > 0,
            dispatch: durableReceipt.dispatch,
            error: preservedArtifactsError !== null
              ? "provider browser cleanup could not be verified; private artifacts were preserved and durable cleanup admission requires ghostget doctor before retry"
              : cleanupRequired
                ? localCliOperation
                  ? "local CLI child/private-root cleanup could not be verified; durable cleanup admission blocks retry until ghostget doctor proves every pinned process group quiescent and removes the exact private root"
                  : "authenticated web cleanup could not be verified; durable cleanup admission blocks retry until ghostget doctor proves and completes exact browser-session recovery"
                : boundedThrownExecutorReason(error),
            ...(preservedArtifactsError === null
              ? {}
              : {
                privateArtifactsPreserved: true,
                recoveryHandle: preservedArtifactsError.recoveryHandle,
              }),
          };
        }
        const executionNoOp = "noOp" in execution && execution.noOp === true;
        const validExecutionProgress = isDispatchProgress(execution.dispatch)
          && execution.dispatch.planned === planned
          && execution.readFailure === undefined
          && execution.dispatch.started === durableReceipt.dispatch.started
          && execution.dispatch.verified === durableReceipt.dispatch.verified
          && execution.dispatchStarted === (execution.dispatch.started > 0)
          && (!executionNoOp || (
            isWrite
            && planned > 0
            && execution.status === "succeeded"
            && execution.dispatch.started === 0
            && execution.dispatch.verified === 0
            && execution.dispatchStarted === false
          ))
          && (execution.status !== "succeeded" || executionNoOp || (
            execution.dispatch.started === planned && execution.dispatch.verified === planned
          ))
          && (execution.status !== "failed" || execution.dispatch.started === 0)
          && (execution.status !== "partial" || (
            execution.dispatch.verified > 0
            && execution.dispatch.started === execution.dispatch.verified
            && execution.dispatch.verified < planned
          ))
          && (execution.status !== "indeterminate" || execution.dispatch.started > 0);
        if (!validExecutionProgress) {
          const { started } = durableReceipt.dispatch;
          execution = {
            status: started > 0 ? "indeterminate" : "failed",
            output: null,
            finalUrl: null,
            dispatchStarted: started > 0,
            dispatch: durableReceipt.dispatch,
            error: "provider executor returned invalid dispatch progress",
          };
        }
        const receiptStatus: RunReceipt["status"] = execution.status === "succeeded"
          ? isWrite && !executionNoOp ? "submitted" : "succeeded"
          : execution.status;
        const publishedOutput = execution.output;
        const finishedAt = (options.now ?? new Date()).toISOString();
        const privateArtifactsPreserved = "privateArtifactsPreserved" in execution
          && execution.privateArtifactsPreserved === true;
        const recoveryHandle = boundedRecoveryHandle("recoveryHandle" in execution ? execution.recoveryHandle : undefined);
        const privateArtifactRecoveryMessage = privateArtifactsPreserved
          ? `private browser artifacts were preserved; ghostget doctor must prove and complete exact browser-session recovery before retry${recoveryHandle === null
            ? ""
            : `; recovery handle: ${recoveryHandle}`}`
          : null;
        const apiOperation = providerOperation
          || webSessionOperation
          || localCliOperation
          || reviewedTemplateOperation;
        const transportLabel = providerOperation
          ? "official API"
          : webSessionOperation
            ? "authenticated web API"
            : localCliOperation
              ? "local CLI"
              : reviewedTemplateOperation
                ? "reviewed authenticated API"
                : "browser";
        const providerReason = apiOperation && execution.error !== undefined
          ? redactSensitiveText(execution.error).slice(0, 2_000)
          : null;
        const withProviderReason = (message: string): string => providerReason === null
          ? message
          : `${message}; reason: ${providerReason}`;
        let receipt: RunReceipt = withTransport({
          runId,
          planDigest,
          adapter,
          operation: invocation.operationId,
          risk: operation.risk,
          inputHash,
          auth,
          status: receiptStatus,
          dispatchStarted: execution.dispatch.started > 0,
          dispatch: execution.dispatch,
          startedAt,
          finishedAt,
          finalOrigin: finalOrigin(execution.finalUrl, invocation.manifest.origins),
          error: execution.error === undefined
            ? null
            : privateArtifactRecoveryMessage !== null
              ? privateArtifactRecoveryMessage
              : redactSensitiveText(receiptStatus === "partial"
                ? withProviderReason(`${transportLabel} stopped after verified dispatches before completing the confirmed schedule; reconcile before retrying`)
                : receiptStatus === "indeterminate"
                  ? withProviderReason(`${transportLabel} result is indeterminate after the dispatch boundary`)
                  : apiOperation
                    ? withProviderReason(`${transportLabel} operation failed before the dispatch boundary`)
                    : "browser recipe failed before the dispatch boundary"),
        });

        return {
          terminalEvent: {
            type: "finished", status: receiptStatus, finalOrigin: receipt.finalOrigin,
            error: receipt.error, ...(executionNoOp ? { noOp: true as const } : {}), at: finishedAt,
          } as const,
          // This projection reads the one current journal cell after terminal CAS/readback.
          result: (): InvocationResult => {
            if (journal === null) throw new Error("remote write has no run journal");
            if (journal.journal.phase === "terminal") {
              receipt = runJournalReceipt(journal.journal);
              return {
                receipt,
                output: publishedOutput,
                replayed: false,
                privateArtifactsPreserved,
                ...(recoveryHandle === null ? {} : { recoveryHandle }),
              };
            }
            const pending = runJournalReceipt(journal.journal);
            return {
              receipt: {
                ...pending,
                error: `${execution.dispatch.started > 0
                  ? `${transportLabel} execution crossed dispatch, but its final run journal could not be stored; reconcile this run before any retry`
                  : `${transportLabel} execution ended before dispatch, but its final run journal could not be stored; run ghostget doctor before retrying`}${privateArtifactRecoveryMessage === null
                    ? ""
                    : `; ${privateArtifactRecoveryMessage}`}`,
              },
              output: null,
              replayed: false,
              privateArtifactsPreserved,
              ...(recoveryHandle === null ? {} : { recoveryHandle }),
            };
          },
        };
      }),
      reloadJournal: attempt("journal", () => { const reloaded = readRunJournal(runId, options.environment); if (reloaded !== null) journal = reloaded; }),
      result: (project: () => InvocationResult) => attempt("projection", project),
    };
  }

  return {
    initialPlan: (digest: string) => attempt("confirmation", () => loadInvocationPlan(digest, environment)),
    configure: attempt("confirmation", () => ({ registry: original.registry ?? providerPluginRegistry, observedAt: now() })),
    repairClaims: attempt("confirmation", () => repairInterruptedConfirmationClaims(environment)),
    repairJournals: (at: Date) => attempt("journal", () => repairInterruptedRunJournals(environment, at)),
    newRunId: attempt("confirmation", () => crypto.randomUUID()),
    claim: (digest: string, runId: string, at: Date) => attempt("confirmation", () => acquireConfirmationClaim(digest, runId, environment, at)),
    releaseClaim: (claim: ConfirmationClaimSnapshot) => attempt("confirmation", () => releaseConfirmationClaim(claim, environment)),
    removePlan: (digest: string) => attempt("confirmation", () => removePrivateStateFile(planPath(digest, environment), environment)),
    retainingJournal: (digest: string) => attempt("confirmation", () => planDigestHasRetainingJournal(digest, environment)),
    cleanupAssets: (digest: string) => attempt("cleanup", () => cleanupPlanAssets(digest, environment)),
    freshPlan: (stored: StoredPlan, registry: ProviderPluginRegistry, at: Date) => attempt("confirmation", () => {
      const loadManifest: typeof loadInstalledManifest = original.loadManifest
        ?? ((adapterId, selectedEnvironment = process.env) => loadInstalledManifestWithRegistry(adapterId, selectedEnvironment, registry));
      return validateFreshPlan(stored, environment, at, registry, loadManifest);
    }),
    duplicateRisk: (stored: StoredPlan) => attempt("confirmation", () => stored.plan.duplicateRisk === undefined ? undefined : resolveInvocationDuplicateRisk(stored.plan, [stored.plan.duplicateRisk.sourceRunId], environment)),
    prepareOptions: (invocation: PreparedInvocation, stored: StoredPlan, claim: ConfirmationClaimSnapshot, runId: string, registry: ProviderPluginRegistry) => attempt("confirmation", () => {
      const fileInputs: FileInputValue[] = [];
      for (const value of Object.values(invocation.input)) {
        if (isInputArray(value)) { for (const item of value) if (isFileInputValue(item)) fileInputs.push(item); }
        else if (isFileInputValue(value)) fileInputs.push(value);
      }
      if (fileInputs.length > 0) resolvePlanAssetFiles(fileInputs, stored.digest, environment);
      const operation = invocation.manifest.operations[invocation.operationId];
      if (operation?.risk !== "R2" && operation?.risk !== "R3") throw new Error("only R2 and R3 plans use confirmation");
      return {
        headed: original.headed, environment, registry,
        ...(fileInputs.length === 0 ? {} : { fileResolver: (files) => Promise.resolve(resolvePlanAssetFiles(files, stored.digest, environment)) }),
        hasPlanAssets: fileInputs.length > 0, runId, confirmationClaim: claim,
        confirmedDispatches: stored.plan.dispatches,
        ...(stored.plan.duplicateRisk === undefined ? {} : { duplicateRisk: stored.plan.duplicateRisk }),
        ...(original.now === undefined ? {} : { now: original.now }),
        ...(original.executeRecipe === undefined ? {} : { executeRecipe: original.executeRecipe }),
        ...(original.executeProvider === undefined ? {} : { executeProvider: original.executeProvider }),
        ...(original.executeWebSession === undefined ? {} : { executeWebSession: original.executeWebSession }),
        ...(original.executeLocalCli === undefined ? {} : { executeLocalCli: original.executeLocalCli }),
        ...(original.executeReviewedTemplate === undefined ? {} : { executeReviewedTemplate: original.executeReviewedTemplate }),
        ...(original.signal === undefined ? {} : { signal: original.signal }),
        ...(original.persistReceipt === undefined ? {} : { persistReceipt: original.persistReceipt }),
      } satisfies RunPreparedOptions;
    }),
    admission: (invocation: PreparedInvocation, options: RunPreparedOptions) => attempt("admission", () => {
      const registry = options.registry ?? providerPluginRegistry;
      const checked = revalidatePreparedInvocation(invocation, registry);
      assertOperationPermission(checked.invocation, { environment: options.environment, registry });
      const portableIdentity = checked.invocation.portablePluginContract ?? null;
      const runId = options.runId ?? crypto.randomUUID();
      const pluginResolution = resolveCodeOwnedPluginOperation(checked.operation, registry);
      let cleanupIdentity: WebSessionCleanupAdmissionIdentity | null = null;
      if (portableIdentity === null && (isWebSessionOperation(checked.operation) || isLocalCliOperation(checked.operation))
        && pluginResolution !== null && !isPublicWebSessionInvocationAuthority(checked.invocation.auth)) {
        const executionIdentityHash = pluginResolution.binding.transport === "local-cli"
          ? sha256(canonicalJson({ transport: "local-cli", tool: pluginResolution.binding.tool, artifact: localCliToolArtifactForCurrentRuntime(pluginResolution.binding.tool) }))
          : registry.implementationHash(pluginResolution.binding).toString("hex");
        cleanupIdentity = {
          runId, pluginId: pluginResolution.plugin.id, pluginVersion: pluginResolution.plugin.version,
          pluginImplementationHash: registry.implementationHash(pluginResolution.binding).toString("hex"),
          adapterId: checked.invocation.manifest.id, adapterHash: manifestHash(checked.invocation.manifest),
          surfaceId: pluginResolution.binding.surfaceId, authId: checked.invocation.auth.id, authHash: authHash(checked.invocation.auth),
          transport: isLocalCliOperation(checked.operation) ? "local-cli" : "web-session-api", executionIdentityHash,
        };
      }
      return { invocation: checked.invocation, options: { ...options, runId }, portableIdentity, cleanupIdentity };
    }),
    acquireWeb: (identity: WebSessionCleanupAdmissionIdentity, at: Date | undefined) => attempt("admission", () => acquireWebSessionCleanupAdmission(identity, environment, at)),
    nativeCleanup: (work: () => Promise<void>) => native("cleanup", work),
    cleanup: (work: () => void) => attempt("cleanup", work),
    acquirePortable: (identity: PortableOperationIdentityV1, runId: string, at: Date | undefined) => attempt("admission", () => {
      const lease = acquirePortableProviderPluginInvocationLease(identity, runId, environment, at);
      const containment = createPortableProviderPluginInvocationLeaseContainmentController(lease, environment);
      const context = createPortableProviderPluginCleanupContext({ containment, cleanupComplete: containment.cleanupComplete });
      portableContext = context;
      return { context, release: () => releasePortableProviderPluginInvocationLease(containment.current, environment, new Date()) };
    }),
    checkExecution: (invocation: PreparedInvocation, options: RunPreparedOptions) => attempt("journal", () => revalidatePreparedInvocation(invocation, options.registry ?? providerPluginRegistry)),
    currentTime: (options: RunPreparedOptions) => attempt("journal", () => options.now ?? new Date()),
    execution: (checked: ReturnType<ConfirmedWriteKernel["revalidatePreparedInvocation"]>, digest: string, options: RunPreparedOptions) => attempt("journal", () => execution(checked, digest, options)),
  };
}

export class ConfirmedWritePlatform extends Context.Tag("wrench/ConfirmedWritePlatform/v1")<
  ConfirmedWritePlatform, ReturnType<typeof makeConfirmedWritePlatform>
>() { }

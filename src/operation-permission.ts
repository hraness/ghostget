import { AsyncLocalStorage } from "node:async_hooks";
import { canonicalJson, sha256 } from "./canonical-json";
import { loadAuth, parseAuth } from "./auth";
import { isLocalCliOperation, isProviderOperation, isWebSessionOperation, manifestHash, parseRuntimeManifest, type GhostgetManifest, type OperationInput } from "./model";
import { providerContractHash, getProviderContract } from "./provider-contracts";
import { getWebSessionContract, webSessionContractHash } from "./web-session-contracts";
import { getLocalCliContract, localCliContractHash } from "./local-cli-contracts";
import { requireProviderPluginAuth } from "./provider-plugin-auth";
import type { ProviderPluginRegistry, ProviderPluginOperationResolutionV1 } from "./provider-plugin-registry";
import { ghostgetStateHome, loadInstalledManifest } from "./storage";
import { projectionAuthIdentityHash, withSettledReadProjectionAuthAdmission } from "./read-projections";
import { publicWebSessionAuthorityIdentityHash, webSessionAuthenticationPolicy, type InvocationAuthority } from "./web-session-authentication-policy";
import type { PreparedInvocation, StoredPlan } from "./runtime";
import { summarizePlanFile } from "./plan-assets";
import type { ApprovalTarget, CheckedApproval, JsonValue, PermissionDecision } from "./control/protocol";
import { OperationPermissionError, readOperationPolicy, setOperationPolicyEntry, type PermissionEnvironment, type OperationPolicySnapshot } from "./operation-permission-store";
export { OperationPermissionError, readOperationPolicy, enableOperationPermissions } from "./operation-permission-store";

type Options = { readonly environment: PermissionEnvironment; readonly registry: ProviderPluginRegistry; readonly signal?: AbortSignal };
type ProviderTarget = Extract<ApprovalTarget, { readonly kind: "provider" }>;
type ApprovalLease = Readonly<{ id: string; digest: string }>;
export type OperationPermissionIdentity = Readonly<{
  schemaVersion: 1; pluginId: string; transport: string; surfaceId: string; operation: string; contractVersion: number;
  adapterId: string; manifestHash: string; authId: string; authIncarnation: string; contractHash: string; closureHash: string; portableHash: string | null;
}>;
export type OperationPermissionDescription = Readonly<{
  digest: string; decision: PermissionDecision | "unmanaged"; revision: number; coordinate: OperationPermissionIdentity;
  manifest: GhostgetManifest; resolution: ProviderPluginOperationResolutionV1; auth: InvocationAuthority;
}>;
type Admission = Readonly<{ capability: string; requestDigest: string; revision: number; inputs: ReadonlySet<string>; planDigest: string | null; lease: ApprovalLease | null; stateHome: string }>;
const admissions = new AsyncLocalStorage<readonly Admission[]>();
const checkedCapabilities = new WeakMap<CheckedApproval, Readonly<{ capability: string; target: string }>>();
const MAX_APPROVAL_BYTES = 240 * 1024;

function changed(): never { throw new OperationPermissionError("OPERATION_PERMISSION_CHANGED", "Operation, account, input, or permissions changed; request fresh authorization."); }
function denied(): never { throw new OperationPermissionError("OPERATION_PERMISSION_DENIED", "This operation is denied in Ghostget. Review its account and operation permissions in the app."); }
function approvalRequired(): never { throw new OperationPermissionError("OPERATION_APPROVAL_REQUIRED", "This operation requires human approval in Ghostget. Run a live invocation with the app open; cached reads never wait for approval."); }

function resolutionFor(manifest: GhostgetManifest, operationId: string, registry: ProviderPluginRegistry): ProviderPluginOperationResolutionV1 {
  const operation = manifest.operations[operationId];
  if (operation === undefined) throw new Error("Operation is not installed.");
  if (isProviderOperation(operation)) return registry.requireOperationDefinition("provider-api", operation.provider.provider, operation.provider.action, operation.provider.contractVersion);
  if (isLocalCliOperation(operation)) return registry.requireOperationDefinition("local-cli", operation.localCli.surface, operation.localCli.action, operation.localCli.contractVersion);
  if (isWebSessionOperation(operation)) return registry.requireOperationDefinition(registry.requireSessionRoute(operation.webSession.site).transport, operation.webSession.site, operation.webSession.action, operation.webSession.contractVersion);
  throw new OperationPermissionError("OPERATION_PERMISSION_DENIED", "This legacy transport does not support managed operation permissions.");
}

function currentManifest(adapterId: string, options: Options): GhostgetManifest {
  const owned = options.registry.resolveOwnedManifest(adapterId);
  const selected = owned === undefined ? loadInstalledManifest(adapterId, options.environment, options.registry) : parseRuntimeManifest(owned, options.registry);
  if (!selected.ok) throw new Error("The selected adapter is unavailable or invalid.");
  return selected.value;
}

function publicAuthority(manifest: GhostgetManifest, operationId: string, resolution: ProviderPluginOperationResolutionV1): InvocationAuthority | null {
  const operation = manifest.operations[operationId]!;
  if (!isWebSessionOperation(operation)) return null;
  const policy = webSessionAuthenticationPolicy({
    adapterId: manifest.id, operationId, recipe: operation.webSession, pluginSourceKind: resolution.plugin.sourceKind,
    portable: resolution.portableIdentity !== null, risk: resolution.operation.risk, state: resolution.operation.state, dispatch: resolution.operation.dispatch,
    ...(resolution.contractVersion === resolution.operation.contractVersion && resolution.operation.access !== undefined ? { access: resolution.operation.access } : {}),
  });
  return policy.kind === "public" ? policy.authority : null;
}

type AccountIdentity = Readonly<{ auth: ReturnType<typeof loadAuth>; incarnation: string }>;
type Inspection = {
  policy: OperationPolicySnapshot;
  manifests: Map<string, GhostgetManifest>;
  accounts: Map<string, AccountIdentity | null>;
  closures: Map<ProviderPluginOperationResolutionV1["binding"], string>;
  contracts: Map<string, string>;
};
function accountIdentity(id: string, options: Options): AccountIdentity {
  return withSettledReadProjectionAuthAdmission(id, options.environment, () => {
    const auth = loadAuth(id, options.environment);
    return { auth, incarnation: projectionAuthIdentityHash(auth.id, sha256(canonicalJson(auth)), options.environment) };
  });
}
function inspectedAccount(id: string, options: Options, inspection: Inspection): AccountIdentity {
  if (!inspection.accounts.has(id)) {
    try { inspection.accounts.set(id, accountIdentity(id, options)); } catch { inspection.accounts.set(id, null); }
  }
  const account = inspection.accounts.get(id);
  if (account === null || account === undefined) throw new Error("The selected account is unavailable.");
  return account;
}
function describe(adapterId: string, operationId: string, authId: string | null, options: Options, inspection: Inspection): OperationPermissionDescription {
  const { policy } = inspection;
  const manifest = inspection.manifests.get(adapterId) ?? currentManifest(adapterId, options);
  inspection.manifests.set(adapterId, manifest);
  const resolution = resolutionFor(manifest, operationId, options.registry);
  const operation = manifest.operations[operationId]!;
  const publicAuth = publicAuthority(manifest, operationId, resolution);
  if (publicAuth !== null && authId !== null) throw new Error("Public operations do not accept an account.");
  if (publicAuth === null && authId === null) throw new Error("Select an explicit account to inspect private operation permissions.");
  const selectedId = authId ?? adapterId;
  const authority = publicAuth !== null
    ? { auth: publicAuth, incarnation: publicWebSessionAuthorityIdentityHash(publicAuth as Parameters<typeof publicWebSessionAuthorityIdentityHash>[0]) }
    : inspectedAccount(selectedId, options, inspection);
  if (publicAuth === null) {
    requireProviderPluginAuth(resolution.binding, authority.auth as ReturnType<typeof loadAuth>);
  }
  const contractKey = canonicalJson([resolution.binding.transport, resolution.binding.surfaceId, resolution.operation.name, resolution.contractVersion]);
  const contractHash = inspection.contracts.get(contractKey) ?? (isProviderOperation(operation) ? providerContractHash(getProviderContract(operation.provider, options.registry), options.registry)
    : isWebSessionOperation(operation) ? webSessionContractHash(getWebSessionContract(operation.webSession, options.registry), options.registry)
      : isLocalCliOperation(operation) ? localCliContractHash(getLocalCliContract(operation.localCli, options.registry), options.registry) : denied());
  inspection.contracts.set(contractKey, contractHash);
  const closureHash = inspection.closures.get(resolution.binding) ?? options.registry.implementationClosureHash(resolution.binding);
  inspection.closures.set(resolution.binding, closureHash);
  const coordinate: OperationPermissionIdentity = Object.freeze({
    schemaVersion: 1, pluginId: resolution.plugin.id, transport: resolution.binding.transport, surfaceId: resolution.binding.surfaceId,
    operation: resolution.operation.name, contractVersion: resolution.contractVersion, adapterId, manifestHash: manifestHash(manifest),
    authId: authority.auth.id, authIncarnation: authority.incarnation, contractHash,
    closureHash, portableHash: resolution.portableIdentity === null ? null : sha256(canonicalJson(resolution.portableIdentity)),
  });
  const digest = sha256(canonicalJson(coordinate));
  return Object.freeze({ digest, coordinate, revision: policy.revision, decision: policy.managed ? policy.entries.find(entry => entry.digest === digest)?.decision ?? "deny" : "unmanaged", manifest, resolution, auth: authority.auth });
}

function inspection(options: Options): Inspection {
  return { policy: readOperationPolicy(options.environment), manifests: new Map(), accounts: new Map(), closures: new Map(), contracts: new Map() };
}

export function describeOperationPermission(adapterId: string, operationId: string, authId: string | null, options: Options): OperationPermissionDescription {
  return describe(adapterId, operationId, authId, options, inspection(options));
}

/** Snapshot-local reuse keeps control-panel inspection proportional to unique accounts and adapters. Never reuse this snapshot to authorize a later request. */
export function describeOperationPermissions(requests: readonly Readonly<{ adapterId: string; operationId: string; authId: string | null }>[], options: Options): readonly (OperationPermissionDescription | null)[] {
  const unavailable = () => Object.freeze(requests.map(() => null));
  let snapshot: Inspection;
  try { snapshot = inspection(options); } catch { return unavailable(); }
  const results = requests.map(request => {
    try { return describe(request.adapterId, request.operationId, request.authId, options, snapshot); } catch { return null; }
  });
  try {
    for (const [id, manifest] of snapshot.manifests) if (manifestHash(currentManifest(id, options)) !== manifestHash(manifest)) return unavailable();
    for (const [id, identity] of snapshot.accounts) if (identity !== null && canonicalJson(accountIdentity(id, options)) !== canonicalJson(identity)) return unavailable();
    for (const [binding, closure] of snapshot.closures) if (options.registry.implementationClosureHash(binding) !== closure) return unavailable();
    if (canonicalJson(readOperationPolicy(options.environment)) !== canonicalJson(snapshot.policy)) return unavailable();
  } catch { return unavailable(); }
  return Object.freeze(results);
}

export function setOperationPermission(request: {
  readonly adapterId: string; readonly operationId: string; readonly authId: string | null; readonly decision: PermissionDecision;
  readonly expectedRevision: number; readonly expectedCapabilityDigest: string;
}, options: Options) {
  const description = describeOperationPermission(request.adapterId, request.operationId, request.authId, options);
  if (description.digest !== request.expectedCapabilityDigest || description.revision !== request.expectedRevision) return changed();
  return setOperationPolicyEntry(description.digest, request.decision, request.expectedRevision, options.environment);
}

function describeInvocation(invocation: PreparedInvocation, options: Options): OperationPermissionDescription {
  const description = describeOperationPermission(invocation.manifest.id, invocation.operationId, invocation.auth.kind === "public-web-session" ? null : invocation.auth.id, options);
  if (manifestHash(invocation.manifest) !== description.coordinate.manifestHash || canonicalJson(invocation.auth) !== canonicalJson(description.auth)
    || invocation.readProjectionAuthIdentityHash !== description.coordinate.authIncarnation) return changed();
  if (invocation.auth.kind !== "public-web-session") parseAuth(invocation.auth);
  return description;
}

function activeAdmission(description: OperationPermissionDescription, input: OperationInput, options: Options): Admission | undefined {
  const hash = sha256(canonicalJson(input));
  const stateHome = ghostgetStateHome(options.environment);
  return admissions.getStore()?.findLast(admission => admission.stateHome === stateHome && admission.capability === description.digest && admission.revision === description.revision && admission.inputs.has(hash));
}

/** Cheap deny check for construction and identity queries. Inspection by the control plane uses describeOperationPermission instead. */
export function assertOperationPreparationPermission(invocation: PreparedInvocation, options: Options): void {
  if (!readOperationPolicy(options.environment).managed) return;
  if (describeInvocation(invocation, options).decision === "deny") denied();
}

/** Synchronous disclosure never opens IPC or creates an approval request. */
export function assertOperationPermission(invocation: PreparedInvocation, options: Options): void {
  const policy = readOperationPolicy(options.environment);
  if (!policy.managed) {
    if (admissions.getStore()?.some(admission => admission.revision !== 0)) changed();
    return;
  }
  const description = describeInvocation(invocation, options);
  if (admissions.getStore()?.some(admission => admission.capability === description.digest && admission.revision !== description.revision)) changed();
  if (description.decision === "deny") denied();
  if (description.decision === "ask" && activeAdmission(description, invocation.input, options) === undefined) approvalRequired();
}

export async function checkOperationPermission(invocation: PreparedInvocation, options: Options): Promise<void> {
  assertOperationPermission(invocation, options);
  if (!readOperationPolicy(options.environment).managed) return;
  const description = describeInvocation(invocation, options);
  const admission = activeAdmission(description, invocation.input, options);
  if (admission?.lease !== null && admission?.lease !== undefined) {
    const { checkApproval } = await import("./control/approval-client");
    await checkApproval(admission.lease, { environment: options.environment, ...(options.signal === undefined ? {} : { signal: options.signal }) });
    assertOperationPermission(invocation, options);
  }
}

function inputForTarget(input: OperationInput): JsonValue {
  return JSON.parse(canonicalJson(Object.fromEntries(Object.entries(input).map(([key, value]) => [key,
    Array.isArray(value) ? value.map(item => typeof item === "object" ? item.reference : item)
      : typeof value === "object" && "reference" in value ? value.reference : value,
  ])))) as JsonValue;
}

function checkedApproval(invocation: PreparedInvocation, description: OperationPermissionDescription, stored: StoredPlan | null): CheckedApproval {
  const previewOf = (input: OperationInput): unknown => Object.fromEntries(Object.entries(input).map(([key, value]) => [key,
    Array.isArray(value) ? value.map(item => typeof item === "object" ? summarizePlanFile(item) : item)
      : typeof value === "object" ? summarizePlanFile(value as Parameters<typeof summarizePlanFile>[0]) : value,
  ]));
  const composite = stored?.plan.messagingComposite;
  const previewInput = composite === undefined ? previewOf(invocation.input) : {
    recipient: composite.recipient,
    routeRef: composite.routeRef,
    contextRef: composite.contextRef,
    parts: composite.parts.map(part => ({ part: part.partId, text: part.text, input: previewOf(part.input) })),
  };
  const preview = canonicalJson(previewInput);
  if (Buffer.byteLength(preview) > MAX_APPROVAL_BYTES) throw new OperationPermissionError("OPERATION_APPROVAL_TOO_LARGE", "This operation exceeds the human approval preview size limit; no request was executed.");
  const digest = sha256(canonicalJson({ protocol: "ghostget.operation-approval/1", capability: description.digest, revision: description.revision,
    inputHash: sha256(canonicalJson(invocation.input)), planDigest: stored?.digest ?? null, previewHash: sha256(preview) }));
  return Object.freeze({ digest, revision: description.revision, decision: description.decision === "unmanaged" ? "allow" : description.decision,
    kind: "provider", title: `${description.manifest.displayName}: ${invocation.operationId}`, account: invocation.auth.kind === "public-web-session" ? null : invocation.auth.id,
    effect: description.manifest.operations[invocation.operationId]!.sideEffect, preview });
}

/** Recompute agent requests using current installed manifests/auth and encrypted plans. Caller summaries never grant authority. */
export async function checkProviderApproval(target: ProviderTarget, options: Options): Promise<CheckedApproval> {
  const { prepareOperationApprovalInvocation } = await import("./runtime");
  const { invocation, stored } = prepareOperationApprovalInvocation(target, options);
  if (stored === null && invocation.manifest.operations[invocation.operationId]!.risk !== "R1") {
    throw new OperationPermissionError("OPERATION_APPROVAL_REQUIRED", "This operation requires an exact saved confirmation plan before human approval.");
  }
  const description = describeInvocation(invocation, options);
  const checked = checkedApproval(invocation, description, stored);
  checkedCapabilities.set(checked, { capability: description.digest, target: canonicalJson(target) });
  return checked;
}

/** A consumed plan is intentionally gone. Recheck retained admission authority, never revive or reload it. */
export async function recheckProviderApproval(target: ProviderTarget, checked: CheckedApproval, options: Options): Promise<CheckedApproval> {
  const retained = checkedCapabilities.get(checked);
  if (retained === undefined || retained.target !== canonicalJson(target)) return changed();
  const current = describeOperationPermission(target.adapterId, target.operationId, target.authId, options);
  if (current.digest !== retained.capability || current.revision !== checked.revision || current.decision !== "ask") return changed();
  return checked;
}

/** Invocation-local permits cannot authorize another input, account, manifest or policy revision. */
export async function withOperationPermission<T>(invocation: PreparedInvocation, optionsValue: Options & { readonly plan?: StoredPlan }, work: () => Promise<T>): Promise<T> {
  const options = { ...optionsValue, environment: Object.freeze({ ...optionsValue.environment }) };
  const policy = readOperationPolicy(options.environment);
  if (!policy.managed) return withUnmanagedOperationPermission(options.environment, work);
  const description = describeInvocation(invocation, options);
  if (description.decision === "deny") denied();
  const existing = activeAdmission(description, invocation.input, options);
  if (existing !== undefined) {
    if (options.plan !== undefined && existing.planDigest !== options.plan.digest) return changed();
    await checkOperationPermission(invocation, options);
    const result = await work();
    await checkOperationPermission(invocation, options);
    return result;
  }
  const checked = description.decision === "ask" ? checkedApproval(invocation, description, options.plan ?? null) : null;
  // Capture the authorized values before the first await: readonly TypeScript input is not an immutable runtime object.
  const inputHashes = [sha256(canonicalJson(invocation.input)), ...(options.plan?.plan.messagingComposite?.parts.map(part => sha256(canonicalJson(part.input))) ?? [])];
  const planDigest = options.plan?.digest ?? null;
  const stateHome = ghostgetStateHome(options.environment);
  let lease: ApprovalLease | null = null;
  if (description.decision === "ask") {
    const target: ProviderTarget = { kind: "provider", adapterId: invocation.manifest.id, operationId: invocation.operationId,
      authId: invocation.auth.kind === "public-web-session" ? null : invocation.auth.id,
      input: options.plan === undefined ? inputForTarget(invocation.input) : null, planDigest: options.plan?.digest ?? null };
    const { requestApproval } = await import("./control/approval-client");
    if (checked === null) return changed();
    lease = await requestApproval(target, checked.digest, { environment: options.environment, ...(options.signal === undefined ? {} : { signal: options.signal }) });
  }
  const admission: Admission = Object.freeze({ capability: description.digest, requestDigest: checked?.digest ?? description.digest, revision: description.revision,
    inputs: new Set(inputHashes), planDigest, lease, stateHome });
  try {
    return await admissions.run([...(admissions.getStore() ?? []), admission], async () => {
      const current = describeInvocation(invocation, options);
      if (current.digest !== description.digest || current.revision !== description.revision) changed();
      await checkOperationPermission(invocation, options);
      const result = await work();
      await checkOperationPermission(invocation, options);
      return result;
    });
  } finally {
    if (lease !== null) {
      const { releaseApproval } = await import("./control/approval-client");
      await releaseApproval(lease, { environment: options.environment });
    }
  }
}

/** Preserve synchronous native admission while preventing opt-in during an in-flight legacy request from disclosing its result. */
export async function withUnmanagedOperationPermission<T>(environment: PermissionEnvironment, work: () => Promise<T>): Promise<T> {
  const result = await work();
  if (readOperationPolicy(environment).managed) changed();
  return result;
}

export async function withOperationPermissions<T>(invocations: readonly PreparedInvocation[], options: Options, work: () => Promise<T>): Promise<T> {
  if (invocations.length === 0) return work();
  return withOperationPermission(invocations[0]!, options, () => withOperationPermissions(invocations.slice(1), options, work));
}

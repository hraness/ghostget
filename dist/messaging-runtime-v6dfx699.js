// @bun
import {
  bindMessagingCompositePreviewDigest,
  createMessagingCompositeInvocationPlan,
  executeReadInvocation,
  initializeMessagingRun,
  invocationPlanDigest,
  loadInvocationPlan,
  messagingExpectedOwnPrefix,
  messagingReceiptBinding,
  messagingRunReceipt,
  parseMaterializedPageV1,
  prepareInvocation,
  providerPluginRegistry,
  readMessagingRun,
  runLocalCliOperationWithDeadline,
  saveInvocationPlan,
  updateMessagingRun
} from "./index-9c82x6gz.js";
import {
  checkOperationPermission,
  openAuthenticatedPrivatePayload,
  requireProviderPluginAuth,
  sealAuthenticatedPrivatePayload,
  withWebSessionCleanupAdmission
} from "./index-ng3hr4kj.js";
import"./index-vdxk3xwx.js";
import"./index-74t2k197.js";
import"./index-3sdtfztq.js";
import"./index-jr8fpkck.js";
import"./index-sxj6x3b5.js";
import"./index-mfj1vvc7.js";
import"./index-wq0wgv6q.js";
import"./index-6ctj5kfr.js";
import"./index-7tcbcqs5.js";
import"./index-vnc8xn67.js";
import"./index-81sjy26h.js";
import"./index-f30rdtbs.js";
import"./index-r9zhe6em.js";
import"./index-8qr77as7.js";
import"./index-d5mavmrj.js";
import {
  createPrivateJsonIfAbsent,
  ensurePrivateStateDirectory,
  ghostgetStateHome,
  isGhostgetStatePath,
  isLocalCliOperation,
  isProviderOperation,
  isWebSessionOperation,
  manifestHash,
  readPrivateStateFileIfPresent,
  writePrivateJson,
  writePrivateJsonIfUnchanged
} from "./index-0ywm1fj9.js";
import"./index-4bpemvnc.js";
import"./index-xf199sky.js";
import"./index-j3ysa35f.js";
import {
  runWebSessionOperationWithDeadline
} from "./index-aka7rgdj.js";
import {
  OperationDeadline
} from "./index-vtj5zdgf.js";
import {
  localCliToolArtifactForCurrentRuntime
} from "./index-1r44fcqj.js";
import"./index-tp6v994c.js";
import"./index-n4szk3nw.js";
import"./index-619vcbhe.js";
import"./index-1mamsf1d.js";
import"./index-26yq8q16.js";
import {
  MESSAGING_CONTEXT_BINDING_CONTRACT_HASH,
  MESSAGING_CONTEXT_BINDING_CONTRACT_ID,
  messagingTurnDigest,
  parseMessagingContextBindingV2,
  parseMessagingContextRequestV1,
  parseMessagingRouteResolveRequestV2,
  parseMessagingRoutesRequestV1,
  parseMessagingTurnV1
} from "./index-d5mzwdjp.js";
import {
  ghostgetMessagingContextBindingSha256V2,
  parseMessageLikeMeSourceConversationCoordinateBindingV1
} from "./index-hqk9cej0.js";
import {
  canonicalJson,
  sha256
} from "./index-8sbt8qwx.js";
import"./index-z1w83f81.js";

// src/messaging-runtime.ts
import { randomBytes } from "crypto";
import { isAbsolute, resolve } from "path";

// src/messaging-store.ts
import { join } from "path";
var MAX_RECORD_BYTES = 1024 * 1024;
var MAX_ENCRYPTED_RECORD_BYTES = 2 * 1024 * 1024;
function messagingRoot(environment) {
  return join(ghostgetStateHome(environment), "messaging");
}
function ensureMessagingRecordDirectory(kind, environment) {
  ensurePrivateStateDirectory(messagingRoot(environment), environment);
  return ensurePrivateStateDirectory(join(messagingRoot(environment), kind), environment);
}
function routePath(routeRef, environment) {
  if (!/^wmroute_[A-Za-z0-9_-]{22}$/u.test(routeRef)) {
    throw new Error("messaging route reference is malformed");
  }
  return join(messagingRoot(environment), "routes", `${routeRef}.json`);
}
function contextPath(contextRef, environment) {
  if (!/^wmcontext_[A-Za-z0-9_-]{22}$/u.test(contextRef)) {
    throw new Error("messaging context reference is malformed");
  }
  return join(messagingRoot(environment), "contexts", `${contextRef}.json`);
}
function routeDomain(routeRef) {
  return `wrench-messaging-route-record-v1:${routeRef}`;
}
function contextDomain(contextRef) {
  return `wrench-messaging-context-record-v1:${contextRef}`;
}
function observationTime(value) {
  const result = value.getTime();
  if (!Number.isFinite(result))
    throw new Error("messaging record observation time is invalid");
  return result;
}
function record(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype)
    throw new Error(`${label} is malformed`);
  return value;
}
function exactKeys(value, keys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index]))
    throw new Error(`${label} has unsupported fields`);
}
function string(value, label, maximum = 4096) {
  if (typeof value !== "string" || value.length < 1 || Buffer.byteLength(value, "utf8") > maximum || /[\0\r\n]/u.test(value))
    throw new Error(`${label} is malformed`);
  return value;
}
function digest(value, label) {
  const result = string(value, label, 64);
  if (!/^[a-f0-9]{64}$/u.test(result))
    throw new Error(`${label} is malformed`);
  return result;
}
function timestamp(value, label) {
  const result = string(value, label, 64);
  if (!Number.isFinite(Date.parse(result)) || !result.endsWith("Z")) {
    throw new Error(`${label} is malformed`);
  }
  return result;
}
function parseStringRecord(value, label) {
  const source = record(value, label);
  const entries = Object.entries(source);
  if (entries.length < 1 || entries.length > 16) {
    throw new Error(`${label} has an invalid field count`);
  }
  return Object.freeze(Object.fromEntries(entries.map(([key, candidate]) => [
    string(key, `${label} key`, 128),
    string(candidate, `${label}.${key}`, 4096)
  ])));
}
function parseOperationInput(value) {
  const source = record(value, "messaging route list input");
  if (Buffer.byteLength(canonicalJson(source), "utf8") > 256 * 1024) {
    throw new Error("messaging route list input is too large");
  }
  return Object.freeze(source);
}
function parseMessagingRouteRecordV1(value) {
  const source = record(value, "messaging route record");
  exactKeys(source, [
    "schemaVersion",
    "format",
    "routeRef",
    "createdAt",
    "expiresAt",
    "adapter",
    "plugin",
    "binding",
    "auth",
    "list",
    "target",
    "resolution",
    "network",
    "sourceConversationCoordinate",
    "conversationProviderId",
    "conversation"
  ], "messaging route record");
  if (source.schemaVersion !== 1 || source.format !== "wrench.messaging-route-record") {
    throw new Error("messaging route record has an unsupported contract");
  }
  const adapter = record(source.adapter, "messaging route adapter");
  exactKeys(adapter, ["id", "version", "hash"], "messaging route adapter");
  const plugin = record(source.plugin, "messaging route plugin");
  exactKeys(plugin, ["id", "version", "closureHash"], "messaging route plugin");
  const binding = record(source.binding, "messaging route binding");
  exactKeys(binding, ["surfaceId", "transport", "implementationIdentity", "messagingContractId"], "messaging route binding");
  if (![
    "provider-api",
    "web-session-api",
    "linked-device",
    "local-cli"
  ].includes(String(binding.transport))) {
    throw new Error("messaging route binding transport is malformed");
  }
  const auth = record(source.auth, "messaging route auth");
  exactKeys(auth, ["id", "hash", "subject"], "messaging route auth");
  const list = record(source.list, "messaging route list");
  exactKeys(list, ["operation", "input", "inputHash", "exactDataRevision", "validatedAt"], "messaging route list");
  if (list.operation !== "messaging.list") {
    throw new Error("messaging route list operation is malformed");
  }
  const conversation = record(source.conversation, "messaging route conversation");
  exactKeys(conversation, ["kind", "title", "participantCount", "participantFingerprint", "providerRevision"], "messaging route conversation");
  if (conversation.kind !== "single" && conversation.kind !== "group" && conversation.kind !== "unknown")
    throw new Error("messaging route conversation kind is malformed");
  if (conversation.title !== null && typeof conversation.title !== "string" || conversation.providerRevision !== null && typeof conversation.providerRevision !== "string" || !Number.isSafeInteger(conversation.participantCount) || conversation.participantCount < 0 || conversation.participantCount > 1e4)
    throw new Error("messaging route conversation metadata is malformed");
  const routeRef = string(source.routeRef, "messaging route reference", 128);
  if (!/^wmroute_[A-Za-z0-9_-]{22}$/u.test(routeRef)) {
    throw new Error("messaging route reference is malformed");
  }
  if (source.resolution !== "list-candidate" && source.resolution !== "exact-coordinate")
    throw new Error("messaging route resolution state is malformed");
  const resolution = source.resolution;
  const network = string(source.network, "messaging route network", 64);
  if (!/^[a-z][a-z0-9-]{0,63}$/u.test(network)) {
    throw new Error("messaging route network is malformed");
  }
  const sourceConversationCoordinate = source.sourceConversationCoordinate === null ? null : parseMessageLikeMeSourceConversationCoordinateBindingV1(source.sourceConversationCoordinate);
  if (resolution === "list-candidate" && sourceConversationCoordinate !== null) {
    throw new Error("messaging list candidate cannot claim an exact source coordinate");
  }
  return Object.freeze({
    schemaVersion: 1,
    format: "wrench.messaging-route-record",
    routeRef,
    createdAt: timestamp(source.createdAt, "messaging route createdAt"),
    expiresAt: timestamp(source.expiresAt, "messaging route expiresAt"),
    adapter: Object.freeze({
      id: string(adapter.id, "messaging route adapter ID", 64),
      version: string(adapter.version, "messaging route adapter version", 64),
      hash: digest(adapter.hash, "messaging route adapter hash")
    }),
    plugin: Object.freeze({
      id: string(plugin.id, "messaging route plugin ID", 128),
      version: string(plugin.version, "messaging route plugin version", 64),
      closureHash: digest(plugin.closureHash, "messaging route plugin closure")
    }),
    binding: Object.freeze({
      surfaceId: string(binding.surfaceId, "messaging route surface", 64),
      transport: binding.transport,
      implementationIdentity: digest(binding.implementationIdentity, "messaging route implementation identity"),
      messagingContractId: string(binding.messagingContractId, "messaging route contract ID", 128)
    }),
    auth: Object.freeze({
      id: string(auth.id, "messaging route auth ID", 48),
      hash: digest(auth.hash, "messaging route auth hash"),
      subject: string(auth.subject, "messaging route auth subject", 512)
    }),
    list: Object.freeze({
      operation: "messaging.list",
      input: parseOperationInput(list.input),
      inputHash: digest(list.inputHash, "messaging route list input hash"),
      exactDataRevision: digest(list.exactDataRevision, "messaging route list data revision"),
      validatedAt: timestamp(list.validatedAt, "messaging route list validatedAt")
    }),
    target: parseStringRecord(source.target, "messaging route target"),
    resolution,
    network,
    sourceConversationCoordinate,
    conversationProviderId: string(source.conversationProviderId, "messaging route conversation identity"),
    conversation: Object.freeze({
      kind: conversation.kind,
      title: conversation.title,
      participantCount: conversation.participantCount,
      participantFingerprint: digest(conversation.participantFingerprint, "messaging route participant fingerprint"),
      providerRevision: conversation.providerRevision
    })
  });
}
function parseMessagingContextRecordV1(value) {
  const source = record(value, "messaging context record");
  exactKeys(source, [
    "schemaVersion",
    "format",
    "contextRef",
    "routeRef",
    "routeRecordHash",
    "sourceConversationCoordinate",
    "exactDataRevision",
    "latestMessageRevision",
    "validatedAt",
    "expiresAt",
    "limit",
    "liveness",
    "replyTargets"
  ], "messaging context record");
  if (source.schemaVersion !== 1 || source.format !== "wrench.messaging-context-record") {
    throw new Error("messaging context record has an unsupported contract");
  }
  const contextRef = string(source.contextRef, "messaging context reference", 128);
  const routeRef = string(source.routeRef, "messaging context route reference", 128);
  if (!/^wmcontext_[A-Za-z0-9_-]{22}$/u.test(contextRef) || !/^wmroute_[A-Za-z0-9_-]{22}$/u.test(routeRef)) {
    throw new Error("messaging context record has malformed references");
  }
  const targetsSource = record(source.replyTargets, "messaging context reply targets");
  if (Object.keys(targetsSource).length > 200) {
    throw new Error("messaging context has too many reply targets");
  }
  const replyTargets = Object.freeze(Object.fromEntries(Object.entries(targetsSource).map(([key, value2]) => {
    if (!/^wmreply_[A-Za-z0-9_-]{22}$/u.test(key)) {
      throw new Error("messaging context reply reference is malformed");
    }
    return [key, string(value2, "messaging context provider message identity")];
  })));
  if (!Number.isSafeInteger(source.limit) || source.limit < 1 || source.limit > 200)
    throw new Error("messaging context limit is malformed");
  if (source.liveness !== "fresh-as-of-live-preflight" && source.liveness !== "freshness-unproven")
    throw new Error("messaging context liveness is malformed");
  return Object.freeze({
    schemaVersion: 1,
    format: "wrench.messaging-context-record",
    contextRef,
    routeRef,
    routeRecordHash: digest(source.routeRecordHash, "messaging context route record hash"),
    sourceConversationCoordinate: source.sourceConversationCoordinate === null ? null : parseMessageLikeMeSourceConversationCoordinateBindingV1(source.sourceConversationCoordinate),
    exactDataRevision: digest(source.exactDataRevision, "messaging context data revision"),
    latestMessageRevision: digest(source.latestMessageRevision, "messaging context latest revision"),
    validatedAt: timestamp(source.validatedAt, "messaging context validatedAt"),
    expiresAt: timestamp(source.expiresAt, "messaging context expiresAt"),
    limit: source.limit,
    liveness: source.liveness,
    replyTargets
  });
}
function messagingRouteRecordHash(record2) {
  return sha256(canonicalJson(record2));
}
function saveMessagingRouteRecord(record2, environment = process.env) {
  const parent = ensureMessagingRecordDirectory("routes", environment);
  const created = createPrivateJsonIfAbsent(routePath(record2.routeRef, environment), sealAuthenticatedPrivatePayload(record2, routeDomain(record2.routeRef), environment, MAX_RECORD_BYTES), { environment, expectedStateParent: parent });
  if (!created.created)
    throw new Error("messaging route reference already exists");
}
function loadMessagingRouteRecord(routeRef, environment = process.env, observation = new Date) {
  const text = readPrivateStateFileIfPresent(routePath(routeRef, environment), MAX_ENCRYPTED_RECORD_BYTES, "messaging route record", environment);
  if (text === null)
    throw new Error("messaging route is unavailable or expired");
  const parsed = parseMessagingRouteRecordV1(openAuthenticatedPrivatePayload(JSON.parse(text), routeDomain(routeRef), environment, MAX_RECORD_BYTES));
  if (parsed.routeRef !== routeRef)
    throw new Error("messaging route record reference changed");
  if (Date.parse(parsed.expiresAt) <= observationTime(observation)) {
    throw new Error("messaging route is unavailable or expired");
  }
  return parsed;
}
function saveMessagingContextRecord(record2, environment = process.env) {
  const parent = ensureMessagingRecordDirectory("contexts", environment);
  const created = createPrivateJsonIfAbsent(contextPath(record2.contextRef, environment), sealAuthenticatedPrivatePayload(record2, contextDomain(record2.contextRef), environment, MAX_RECORD_BYTES), { environment, expectedStateParent: parent });
  if (!created.created)
    throw new Error("messaging context reference already exists");
}
function loadMessagingContextRecord(contextRef, environment = process.env, observation = new Date) {
  const text = readPrivateStateFileIfPresent(contextPath(contextRef, environment), MAX_ENCRYPTED_RECORD_BYTES, "messaging context record", environment);
  if (text === null)
    throw new Error("messaging context is unavailable or expired");
  const parsed = parseMessagingContextRecordV1(openAuthenticatedPrivatePayload(JSON.parse(text), contextDomain(contextRef), environment, MAX_RECORD_BYTES));
  if (parsed.contextRef !== contextRef)
    throw new Error("messaging context record reference changed");
  if (Date.parse(parsed.expiresAt) <= observationTime(observation)) {
    throw new Error("messaging context is unavailable or expired");
  }
  return parsed;
}

// src/local-cli-admission.ts
import { randomUUID } from "crypto";
function ownerForBinding(registry, binding) {
  const owners = registry.list().filter((plugin) => plugin.bindings.some((candidate) => candidate === binding));
  if (owners.length !== 1 || owners[0] === undefined) {
    throw new Error("local CLI cleanup admission binding ownership is ambiguous");
  }
  return owners[0];
}
function cleanupAdmissionIdentity(registry, binding, auth, purpose) {
  const plugin = ownerForBinding(registry, binding);
  if (purpose.kind === "reconcile" || purpose.kind === "messaging") {
    const operation = binding.operations.find((candidate) => candidate.name === purpose.action && candidate.contractVersions.includes(purpose.contractVersion));
    if (operation === undefined || purpose.kind === "reconcile" && operation.reconciliation === undefined || purpose.kind === "messaging" && operation.risk !== "R3") {
      throw new Error(purpose.kind === "reconcile" ? "local CLI cleanup admission reconciliation route is not installed" : "local CLI cleanup admission messaging route is not an installed R3 operation");
    }
  }
  const implementationHash = registry.implementationHash(binding).toString("hex");
  let artifact;
  try {
    artifact = localCliToolArtifactForCurrentRuntime(binding.tool);
  } catch (error) {
    if (purpose.kind !== "inspect")
      throw error;
    artifact = null;
  }
  const executionIdentityHash = sha256(canonicalJson({
    schemaVersion: 1,
    transport: "local-cli",
    plugin: {
      id: plugin.id,
      version: plugin.version,
      implementationHash
    },
    surfaceId: binding.surfaceId,
    tool: binding.tool,
    runtime: { platform: process.platform, arch: process.arch },
    artifact,
    purpose
  }));
  return Object.freeze({
    runId: randomUUID(),
    pluginId: plugin.id,
    pluginVersion: plugin.version,
    pluginImplementationHash: implementationHash,
    adapterId: "local-cli-kernel",
    adapterHash: executionIdentityHash,
    surfaceId: binding.surfaceId,
    authId: auth?.id ?? "local-cli-inspect",
    authHash: auth === null ? sha256(canonicalJson({ schemaVersion: 1, purpose: "local-cli-inspect" })) : sha256(canonicalJson(auth)),
    transport: "local-cli",
    executionIdentityHash
  });
}
function withLocalCliProviderCleanupAdmission(input, operation) {
  return withWebSessionCleanupAdmission(cleanupAdmissionIdentity(input.registry, input.binding, input.auth, input.purpose), input.environment ?? process.env, operation, input.now);
}

// src/messaging-runtime.ts
var ROUTE_TTL_MS = 15 * 60000;
var CONTEXT_TTL_MS = 5 * 60000;
function parseExpectedOwnPrefixProof(value, acceptedCount) {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype)
    throw new Error("messaging provider returned a malformed prefix proof");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) {
    throw new Error("messaging provider returned a malformed prefix proof");
  }
  for (const descriptor of Object.values(descriptors)) {
    if (!descriptor.enumerable || !("value" in descriptor)) {
      throw new Error("messaging provider returned a malformed prefix proof");
    }
  }
  const source = value;
  const keys = Object.keys(source).sort();
  if (source.state === "drift" && keys.length === 1 && keys[0] === "state") {
    return Object.freeze({ state: "drift" });
  }
  if (source.state !== "proven" || keys.length !== 2 || keys[0] !== "matchedAcceptedPrefixCount" || keys[1] !== "state" || typeof source.matchedAcceptedPrefixCount !== "number" || !Number.isSafeInteger(source.matchedAcceptedPrefixCount) || source.matchedAcceptedPrefixCount < 0 || source.matchedAcceptedPrefixCount > acceptedCount)
    throw new Error("messaging provider returned a malformed prefix proof");
  return Object.freeze({
    state: "proven",
    matchedAcceptedPrefixCount: source.matchedAcceptedPrefixCount
  });
}
function now(options) {
  const value = options.now ?? new Date;
  if (!Number.isFinite(value.getTime()))
    throw new Error("messaging observation time is invalid");
  return value;
}
function opaque(prefix) {
  return `${prefix}_${randomBytes(16).toString("base64url")}`;
}
function operationResolution(invocation, registry) {
  const operation = invocation.manifest.operations[invocation.operationId];
  if (operation === undefined)
    throw new Error("messaging operation disappeared");
  if (isLocalCliOperation(operation)) {
    return registry.requireOperationDefinition("local-cli", operation.localCli.surface, operation.localCli.action, operation.localCli.contractVersion);
  }
  if (isWebSessionOperation(operation)) {
    const binding = registry.requireSessionRoute(operation.webSession.site);
    return registry.requireOperationDefinition(binding.transport, operation.webSession.site, operation.webSession.action, operation.webSession.contractVersion);
  }
  if (isProviderOperation(operation)) {
    return registry.requireOperationDefinition("provider-api", operation.provider.provider, operation.provider.action, operation.provider.contractVersion);
  }
  throw new Error("messaging requires one code-owned provider operation");
}
function messagingResolution(invocation, registry, expected) {
  const resolution = operationResolution(invocation, registry);
  const messaging = resolution.binding.messaging;
  if (messaging === undefined) {
    throw new Error("selected provider does not expose the messaging SPI");
  }
  const expectedOperation = expected === "action" ? messaging.action.state === "supported" ? messaging.action.operation : null : expected === "messaging.list" ? messaging.listOperation : messaging.contextOperation;
  if (expectedOperation === null || resolution.operation.name !== expectedOperation) {
    throw new Error("selected operation does not match the provider messaging contract");
  }
  return Object.freeze({ ...resolution, messaging });
}
function requireBoundAuth(binding, auth) {
  if (auth.kind === "public-web-session") {
    throw new Error("messaging requires one private account-bound auth realm");
  }
  requireProviderPluginAuth(binding, auth);
  if (auth.subject === undefined || !binding.subject.matches(auth.subject)) {
    throw new Error("messaging requires one current account-bound auth realm");
  }
}
async function requireRuntimeReady(binding, auth, environment, registry) {
  requireBoundAuth(binding, auth);
  if (binding.transport === "local-cli") {
    const status = await withLocalCliProviderCleanupAdmission({
      registry,
      binding,
      auth: null,
      purpose: { kind: "inspect" },
      environment
    }, (registerCleanupBarrier) => binding.inspect(environment, {
      registerCleanupBarrier
    }));
    if (!status.ready)
      throw new Error("messaging provider runtime is unavailable");
    return;
  }
  if (binding.transport === "linked-device") {
    const lifecycle = binding.linkedDeviceLifecycle;
    if (lifecycle === undefined) {
      throw new Error("messaging linked-device runtime has no readiness inspection");
    }
    const status = await lifecycle.inspect(environment);
    if (!status.ready)
      throw new Error("messaging provider runtime is unavailable");
  }
}
function implementationIdentity(binding, registry) {
  return sha256(canonicalJson({
    surfaceId: binding.surfaceId,
    transport: binding.transport,
    closureHash: registry.implementationClosureHash(binding),
    artifactSha256: registry.artifactSha256(binding),
    ...binding.transport === "local-cli" ? { tool: binding.tool } : {}
  }));
}
function messagingWebCleanupAdmissionIdentity(invocation, resolution, registry, runId, partIndex) {
  return Object.freeze({
    runId,
    pluginId: resolution.plugin.id,
    pluginVersion: resolution.plugin.version,
    pluginImplementationHash: registry.implementationHash(resolution.binding).toString("hex"),
    adapterId: invocation.manifest.id,
    adapterHash: manifestHash(invocation.manifest),
    surfaceId: resolution.binding.surfaceId,
    authId: invocation.auth.id,
    authHash: sha256(canonicalJson(invocation.auth)),
    transport: "web-session-api",
    executionIdentityHash: sha256(canonicalJson({
      schemaVersion: 1,
      kind: "messaging",
      runId,
      partIndex,
      operation: invocation.operationId,
      binding: implementationIdentity(resolution.binding, registry)
    }))
  });
}
function identityFor(invocation, resolution, registry) {
  requireBoundAuth(resolution.binding, invocation.auth);
  return Object.freeze({
    adapter: Object.freeze({
      id: invocation.manifest.id,
      version: invocation.manifest.version,
      hash: manifestHash(invocation.manifest)
    }),
    plugin: Object.freeze({
      id: resolution.plugin.id,
      version: resolution.plugin.version,
      closureHash: registry.implementationClosureHash(resolution.binding)
    }),
    binding: Object.freeze({
      surfaceId: resolution.binding.surfaceId,
      transport: resolution.binding.transport,
      implementationIdentity: implementationIdentity(resolution.binding, registry),
      messagingContractId: resolution.messaging.contractId
    }),
    auth: Object.freeze({
      id: invocation.auth.id,
      hash: sha256(canonicalJson(invocation.auth)),
      subject: invocation.auth.subject
    })
  });
}
function exactLivePage(invocation, resolution, output) {
  const omni = resolution.operation.omni;
  if (omni?.state !== "supported") {
    throw new Error("messaging provider operation lost normalization support");
  }
  return parseMaterializedPageV1(omni.materialize(invocation.input, output));
}
function routeFingerprint(record2) {
  return sha256(canonicalJson({
    adapter: record2.adapter,
    plugin: record2.plugin,
    binding: record2.binding,
    auth: record2.auth,
    target: record2.target,
    resolution: record2.resolution,
    network: record2.network,
    sourceConversationCoordinate: record2.sourceConversationCoordinate,
    conversationProviderId: record2.conversationProviderId
  }));
}
function assertRouteIdentity(record2, invocation, resolution, registry, observation) {
  if (Date.parse(record2.expiresAt) <= observation.getTime()) {
    throw new Error("messaging route is unavailable or expired");
  }
  if (canonicalJson(invocation.input) !== canonicalJson(record2.list.input) || record2.list.inputHash !== sha256(canonicalJson(record2.list.input))) {
    throw new Error("messaging route list input changed; discover a new route");
  }
  const identity = identityFor(invocation, resolution, registry);
  const expected = sha256(canonicalJson({
    adapter: identity.adapter,
    plugin: identity.plugin,
    binding: identity.binding,
    auth: identity.auth,
    target: resolution.messaging.parseTarget(record2.target),
    resolution: record2.resolution,
    network: resolution.messaging.network,
    sourceConversationCoordinate: record2.sourceConversationCoordinate,
    conversationProviderId: record2.conversationProviderId
  }));
  if (expected !== routeFingerprint(record2)) {
    throw new Error("messaging route identity changed; discover a new route");
  }
}
function latestRevision(surfaceId, conversationProviderId, messages, exactDataRevision) {
  if (messages.length === 0) {
    return sha256(canonicalJson({
      surfaceId,
      conversationProviderId,
      empty: true,
      exactDataRevision
    }));
  }
  const latest = [...messages].sort((left, right) => (left.orderedAt ?? "").localeCompare(right.orderedAt ?? "") || left.providerId.localeCompare(right.providerId)).at(-1);
  return sha256(canonicalJson({
    surfaceId,
    conversationProviderId,
    providerId: latest.providerId,
    providerRevision: latest.providerRevision,
    orderedAt: latest.orderedAt
  }));
}
function messagingBaseMessages(messages) {
  return Object.freeze([...messages].sort((left, right) => {
    const leftKey = `${left.orderedAt ?? ""}\x00${left.providerId}`;
    const rightKey = `${right.orderedAt ?? ""}\x00${right.providerId}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  }).map((message) => Object.freeze({
    providerMessageId: message.providerId,
    providerRevision: message.providerRevision,
    orderedAt: message.orderedAt,
    messageSha256: sha256(canonicalJson(message))
  })));
}
function pageMessages(page, conversationProviderId) {
  return Object.freeze(page.entities.map((entity) => {
    if (entity.kind !== "message" || entity.conversationProviderId !== conversationProviderId) {
      throw new Error("messaging context did not bind the exact route conversation");
    }
    return entity;
  }));
}
function randomRefMap(messages) {
  const byProvider = new Map;
  const replyTargets = {};
  for (const message of messages) {
    if (byProvider.has(message.providerId)) {
      throw new Error("messaging context repeated a provider message identity");
    }
    const reference = opaque("wmreply");
    byProvider.set(message.providerId, reference);
    replyTargets[reference] = message.providerId;
  }
  return Object.freeze({
    byProvider,
    replyTargets: Object.freeze(replyTargets)
  });
}
function publicMessages(messages, refs) {
  return Object.freeze(messages.map((message) => {
    const messageRef = refs.get(message.providerId);
    if (messageRef === undefined)
      throw new Error("messaging reply reference disappeared");
    return Object.freeze({
      messageRef,
      direction: message.direction,
      time: message.orderedAt,
      author: message.sender === null ? null : Object.freeze({
        displayName: message.sender.displayName,
        handle: message.sender.handle
      }),
      body: message.body,
      bodyTruncated: message.bodyTruncated === true,
      edited: "unknown",
      retracted: message.state === "revoked" || message.state === "revoked-and-deleted-for-me" ? "observed" : "unknown",
      reply: Object.freeze({
        toMessageRef: message.replyToProviderId === null ? null : refs.get(message.replyToProviderId) ?? null
      }),
      attachments: Object.freeze(message.attachments.map((attachment) => Object.freeze({
        kind: attachment.kind,
        mimeType: attachment.mimeType,
        name: attachment.name,
        sizeBytes: attachment.sizeBytes
      }))),
      untrustedData: true
    });
  }));
}
function validateMessagingPrivateOutputPath(path, environment = process.env) {
  if (!isAbsolute(path) || resolve(path) !== path || Buffer.byteLength(path, "utf8") > 4096 || /[\0\r\n]/u.test(path))
    throw new Error("messaging private output path must be normalized and absolute");
  if (isGhostgetStatePath(path, environment)) {
    throw new Error("messaging private output path must be outside GHOSTGET_STATE_HOME");
  }
  return path;
}
function writeMessagingPrivateOutput(path, artifact, environment = process.env) {
  const outputPath = validateMessagingPrivateOutputPath(path, environment);
  writePrivateJson(outputPath, artifact, { privateParent: true });
  const artifactSha256 = sha256(canonicalJson(artifact));
  const expiresAt = artifact.format === "wrench.messaging-context" ? artifact.binding?.expiresAt ?? null : artifact.format === "wrench.messaging-preview" ? artifact.expiresAt : artifact.format === "wrench.messaging-route" ? artifact.expiresAt : artifact.format === "wrench.messaging-run" ? null : artifact.format === "wrench.messaging-receipt-binding" ? null : artifact.routes.reduce((latest, route) => latest === null || route.expiresAt < latest ? route.expiresAt : latest, null);
  return Object.freeze({
    schemaVersion: 1,
    format: "wrench.messaging-private-output-receipt",
    artifactFormat: artifact.format,
    artifactSha256,
    itemCount: artifact.format === "wrench.messaging-routes" ? artifact.routes.length : artifact.format === "wrench.messaging-context" ? artifact.messages.length : artifact.format === "wrench.messaging-route" ? 1 : artifact.format === "wrench.messaging-preview" || artifact.format === "wrench.messaging-run" ? artifact.partCount : 1,
    generatedAt: artifact.format === "wrench.messaging-routes" ? artifact.generatedAt : artifact.format === "wrench.messaging-context" ? artifact.binding?.validatedAt ?? new Date().toISOString() : artifact.format === "wrench.messaging-route" ? new Date().toISOString() : artifact.format === "wrench.messaging-run" || artifact.format === "wrench.messaging-receipt-binding" ? artifact.recordedAt : new Date().toISOString(),
    expiresAt
  });
}
function reserveMessagingPrivateOutput(path, artifactFormat, reservationId, environment) {
  const outputPath = validateMessagingPrivateOutputPath(path, environment);
  const marker = Object.freeze({
    schemaVersion: 1,
    format: "wrench.messaging-private-output-reservation",
    reservationId,
    artifactFormat
  });
  const reservedContentSha256 = sha256(`${canonicalJson(marker)}
`);
  let created;
  try {
    created = createPrivateJsonIfAbsent(outputPath, marker, { privateParent: true }).created;
  } catch {
    throw new Error("messaging private output sink failed physical reservation");
  }
  if (!created) {
    throw new Error("messaging private output sink already exists");
  }
  return Object.freeze({
    path: outputPath,
    artifactFormat,
    reservationId,
    reservedContentSha256
  });
}
function reserveMessagingPrivateOutputPair(runPath, receiptBindingPath, environment = process.env) {
  const exactRunPath = validateMessagingPrivateOutputPath(runPath, environment);
  const exactReceiptBindingPath = validateMessagingPrivateOutputPath(receiptBindingPath, environment);
  if (exactRunPath === exactReceiptBindingPath) {
    throw new Error("messaging confirmation requires distinct private output and receipt-binding paths");
  }
  const pairId = `wmoutput_${randomBytes(16).toString("base64url")}`;
  const run = reserveMessagingPrivateOutput(exactRunPath, "wrench.messaging-run", pairId, environment);
  let receiptBinding;
  try {
    receiptBinding = reserveMessagingPrivateOutput(exactReceiptBindingPath, "wrench.messaging-receipt-binding", pairId, environment);
  } catch (error) {
    throw new Error("messaging receipt-binding sink failed physical reservation after the body-free run sink was reserved", { cause: error });
  }
  return Object.freeze({ run, receiptBinding });
}
function writeReservedMessagingPrivateOutput(reservation, artifact, _environment = process.env) {
  if (artifact.format !== reservation.artifactFormat) {
    throw new Error("messaging private output reservation has another artifact format");
  }
  let written;
  try {
    written = writePrivateJsonIfUnchanged(reservation.path, artifact, {
      expectedCurrentContentSha256: reservation.reservedContentSha256,
      maximumExpectedCurrentBytes: 4096,
      privateParent: true
    });
  } catch {
    throw new Error("messaging private output final export failed");
  }
  if (!written) {
    throw new Error("messaging private output reservation changed before final export; recover by run ID");
  }
  const artifactSha256 = sha256(canonicalJson(artifact));
  const expiresAt = artifact.format === "wrench.messaging-context" ? artifact.binding?.expiresAt ?? null : artifact.format === "wrench.messaging-preview" ? artifact.expiresAt : artifact.format === "wrench.messaging-route" ? artifact.expiresAt : artifact.format === "wrench.messaging-routes" ? artifact.routes.reduce((latest, route) => latest === null || route.expiresAt < latest ? route.expiresAt : latest, null) : null;
  return Object.freeze({
    schemaVersion: 1,
    format: "wrench.messaging-private-output-receipt",
    artifactFormat: artifact.format,
    artifactSha256,
    itemCount: artifact.format === "wrench.messaging-routes" ? artifact.routes.length : artifact.format === "wrench.messaging-context" ? artifact.messages.length : artifact.format === "wrench.messaging-preview" || artifact.format === "wrench.messaging-run" ? artifact.partCount : 1,
    generatedAt: artifact.format === "wrench.messaging-routes" ? artifact.generatedAt : artifact.format === "wrench.messaging-context" ? artifact.binding?.validatedAt ?? new Date().toISOString() : artifact.format === "wrench.messaging-run" || artifact.format === "wrench.messaging-receipt-binding" ? artifact.recordedAt : new Date().toISOString(),
    expiresAt
  });
}
async function discoverMessagingRoutesInternal(value, options = {}) {
  const request = parseMessagingRoutesRequestV1(value);
  const environment = options.environment ?? process.env;
  const registry = options.registry ?? providerPluginRegistry;
  const observation = now(options);
  const generatedAt = observation.toISOString();
  const expiresAt = new Date(observation.getTime() + ROUTE_TTL_MS).toISOString();
  const routes = [];
  const routeIdentities = new Set;
  const source = request.source;
  const invocation = prepareInvocation(source.adapterId, "messaging.list", source.listInput, source.authId, environment, registry);
  const resolution = messagingResolution(invocation, registry, "messaging.list");
  await requireRuntimeReady(resolution.binding, invocation.auth, environment, registry);
  const live = await executeReadInvocation(invocation, {
    headed: false,
    environment,
    registry,
    ...options.signal === undefined ? {} : { signal: options.signal }
  });
  if (live.receipt.status !== "succeeded") {
    throw new Error("messaging route discovery live read did not succeed");
  }
  const exactDataRevision = sha256(canonicalJson(live.output));
  const page = exactLivePage(invocation, resolution, live.output);
  const candidates = resolution.messaging.enumerateRoutes(invocation.input, page);
  if (!Array.isArray(candidates) || candidates.length > 1000) {
    throw new Error("provider messaging route enumeration exceeded its bound");
  }
  const identity = identityFor(invocation, resolution, registry);
  for (const candidate of candidates) {
    const target = resolution.messaging.parseTarget(candidate.target);
    if (typeof candidate.conversationProviderId !== "string" || candidate.conversationProviderId.length < 1 || candidate.conversationProviderId.length > 4096 || !Array.isArray(candidate.participants) || candidate.participants.length > 1e4)
      throw new Error("provider messaging route candidate is malformed");
    const dedupe = sha256(canonicalJson({
      adapter: identity.adapter,
      binding: identity.binding,
      auth: identity.auth,
      target
    }));
    if (routeIdentities.has(dedupe)) {
      throw new Error("messaging route page repeated one exact provider conversation");
    }
    routeIdentities.add(dedupe);
    const routeRef = opaque("wmroute");
    const participantFingerprint = sha256(canonicalJson(candidate.participants));
    const routeRecord = Object.freeze({
      schemaVersion: 1,
      format: "wrench.messaging-route-record",
      routeRef,
      createdAt: generatedAt,
      expiresAt,
      ...identity,
      list: Object.freeze({
        operation: "messaging.list",
        input: invocation.input,
        inputHash: sha256(canonicalJson(invocation.input)),
        exactDataRevision,
        validatedAt: generatedAt
      }),
      target,
      resolution: "list-candidate",
      network: resolution.messaging.network,
      sourceConversationCoordinate: null,
      conversationProviderId: candidate.conversationProviderId,
      conversation: Object.freeze({
        kind: candidate.conversationKind,
        title: candidate.title,
        participantCount: candidate.participants.length,
        participantFingerprint,
        providerRevision: candidate.providerRevision
      })
    });
    saveMessagingRouteRecord(routeRecord, environment);
    routes.push(Object.freeze({
      schemaVersion: 2,
      format: "wrench.messaging-route",
      routeRef,
      network: resolution.messaging.network,
      conversation: Object.freeze({
        kind: candidate.conversationKind,
        title: candidate.title,
        participantCount: candidate.participants.length
      }),
      readiness: Object.freeze({
        context: "resolution-required",
        turn: "unavailable",
        reply: "unsupported",
        reason: "an exact provider coordinate must be resolved before this list candidate can become a context or action capability"
      }),
      completeness: page.completeness,
      expiresAt
    }));
  }
  return Object.freeze({
    schemaVersion: 2,
    format: "wrench.messaging-routes",
    generatedAt,
    completeness: page.completeness,
    continuation: Object.freeze({
      direction: page.cursor.direction,
      request: page.cursor.request,
      nextInput: page.cursor.nextInput
    }),
    routes: Object.freeze(routes)
  });
}
async function resolveMessagingRouteInternal(value, options = {}) {
  const request = parseMessagingRouteResolveRequestV2(value);
  const environment = options.environment ?? process.env;
  const registry = options.registry ?? providerPluginRegistry;
  const observation = now(options);
  const createdAt = observation.toISOString();
  const expiresAt = new Date(observation.getTime() + ROUTE_TTL_MS).toISOString();
  const listCandidate = loadMessagingRouteRecord(request.routeRef, environment, observation);
  if (listCandidate.resolution !== "list-candidate") {
    throw new Error("messaging route resolution requires one unresolved list candidate");
  }
  const sourceInvocation = prepareInvocation(listCandidate.adapter.id, listCandidate.list.operation, listCandidate.list.input, listCandidate.auth.id, environment, registry);
  const resolution = messagingResolution(sourceInvocation, registry, "messaging.list");
  assertRouteIdentity(listCandidate, sourceInvocation, resolution, registry, observation);
  await requireRuntimeReady(resolution.binding, sourceInvocation.auth, environment, registry);
  const storedTarget = resolution.messaging.parseTarget(listCandidate.target);
  const exactInput = resolution.messaging.resolveRoute.input(storedTarget);
  const exactInvocation = prepareInvocation(listCandidate.adapter.id, resolution.messaging.resolveRoute.operation, exactInput, listCandidate.auth.id, environment, registry);
  const exactResolution = operationResolution(exactInvocation, registry);
  if (exactResolution.plugin.id !== resolution.plugin.id || exactResolution.binding !== resolution.binding || exactResolution.binding.messaging?.contractId !== resolution.messaging.contractId || exactResolution.operation.name !== resolution.messaging.resolveRoute.operation)
    throw new Error("exact messaging route resolution changed provider binding");
  const live = await executeReadInvocation(exactInvocation, {
    headed: false,
    environment,
    registry,
    ...options.signal === undefined ? {} : { signal: options.signal }
  });
  if (live.receipt.status !== "succeeded") {
    throw new Error("exact messaging route live read did not succeed");
  }
  const exactDataRevision = sha256(canonicalJson(live.output));
  const candidates = resolution.messaging.resolveRoute.candidates(storedTarget, live.output);
  if (!Array.isArray(candidates) || candidates.length !== 1) {
    throw new Error(Array.isArray(candidates) && candidates.length === 0 ? "exact messaging route candidate was not proven by the live provider read" : "exact messaging route candidate was ambiguous in the live provider read");
  }
  const candidate = candidates[0];
  const target = resolution.messaging.parseTarget(candidate.target);
  if (candidate.conversationProviderId.length < 1 || candidate.conversationProviderId.length > 4096 || !Array.isArray(candidate.participants) || candidate.participants.length > 1e4)
    throw new Error("provider messaging route candidate is malformed");
  if (canonicalJson(target) !== canonicalJson(storedTarget) || candidate.conversationProviderId !== listCandidate.conversationProviderId) {
    throw new Error("exact messaging route read returned another conversation");
  }
  const identity = identityFor(sourceInvocation, resolution, registry);
  const sourceConversationCoordinate = resolution.messaging.resolveRoute.sourceConversationCoordinate(storedTarget, live.output, identity.auth.subject);
  const network = resolution.messaging.network;
  const routeRef = opaque("wmroute");
  const routeRecord = Object.freeze({
    schemaVersion: 1,
    format: "wrench.messaging-route-record",
    routeRef,
    createdAt,
    expiresAt,
    ...identity,
    list: Object.freeze({
      operation: "messaging.list",
      input: sourceInvocation.input,
      inputHash: sha256(canonicalJson(sourceInvocation.input)),
      exactDataRevision,
      validatedAt: createdAt
    }),
    target,
    resolution: "exact-coordinate",
    network,
    sourceConversationCoordinate,
    conversationProviderId: candidate.conversationProviderId,
    conversation: Object.freeze({
      kind: candidate.conversationKind,
      title: candidate.title,
      participantCount: candidate.participants.length,
      participantFingerprint: sha256(canonicalJson(candidate.participants)),
      providerRevision: candidate.providerRevision
    })
  });
  saveMessagingRouteRecord(routeRecord, environment);
  const action = resolution.messaging.action;
  return Object.freeze({
    schemaVersion: 2,
    format: "wrench.messaging-route",
    routeRef,
    network,
    conversation: Object.freeze({
      kind: candidate.conversationKind,
      title: candidate.title,
      participantCount: candidate.participants.length
    }),
    readiness: Object.freeze({
      context: resolution.messaging.contextLiveness === "fresh-as-of-live-preflight" ? "ready" : "historical-readable",
      turn: sourceConversationCoordinate !== null && action.state === "supported" && resolution.messaging.contextLiveness === "fresh-as-of-live-preflight" ? "ready" : "unavailable",
      reply: sourceConversationCoordinate !== null && action.state === "supported" && resolution.messaging.contextLiveness === "fresh-as-of-live-preflight" ? action.reply : "unsupported",
      reason: resolution.messaging.contextLiveness === "freshness-unproven" ? "provider context freshness is unproven" : action.state === "supported" ? sourceConversationCoordinate === null ? "this exact route is not eligible for checked turn actions" : null : action.reason
    }),
    completeness: Object.freeze({
      kind: "complete",
      reason: "provider-native exact read proved the stored route candidate"
    }),
    expiresAt
  });
}
async function resolveCurrentRoute(routeRef, observation, environment, registry) {
  const record2 = loadMessagingRouteRecord(routeRef, environment, observation);
  if (record2.resolution !== "exact-coordinate") {
    throw new Error("messaging route requires exact conversations.read resolution before context or action use");
  }
  const invocation = prepareInvocation(record2.adapter.id, record2.list.operation, record2.list.input, record2.auth.id, environment, registry);
  const resolution = messagingResolution(invocation, registry, "messaging.list");
  assertRouteIdentity(record2, invocation, resolution, registry, observation);
  await requireRuntimeReady(resolution.binding, invocation.auth, environment, registry);
  return Object.freeze({ record: record2, resolution });
}
async function currentContextPage(record2, resolution, limit, environment, registry, signal) {
  const target = resolution.messaging.parseTarget(record2.target);
  const input = resolution.messaging.contextInput(target, limit);
  const invocation = prepareInvocation(record2.adapter.id, resolution.messaging.contextOperation, input, record2.auth.id, environment, registry);
  const contextResolution = messagingResolution(invocation, registry, "messaging.read");
  if (contextResolution.plugin.id !== resolution.plugin.id || contextResolution.binding !== resolution.binding || contextResolution.messaging.contractId !== resolution.messaging.contractId)
    throw new Error("messaging context operation changed provider route");
  const live = await executeReadInvocation(invocation, {
    headed: false,
    environment,
    registry,
    ...signal === undefined ? {} : { signal }
  });
  if (live.receipt.status !== "succeeded") {
    throw new Error("messaging context live preflight did not succeed");
  }
  const exactDataRevision = sha256(canonicalJson(live.output));
  const page = exactLivePage(invocation, contextResolution, live.output);
  const messages = pageMessages(page, record2.conversationProviderId);
  return Object.freeze({
    exactDataRevision,
    latestMessageRevision: latestRevision(resolution.binding.surfaceId, record2.conversationProviderId, messages, exactDataRevision),
    page,
    messages
  });
}
async function currentMessagingRouteState(record2, resolution, environment, registry, signal) {
  const action = resolution.messaging.action;
  if (action.state !== "supported") {
    throw new Error("messaging route does not support an actionable live preflight");
  }
  const target = resolution.messaging.parseTarget(record2.target);
  const invocation = prepareInvocation(record2.adapter.id, action.livePreflight.operation, action.livePreflight.input(target), record2.auth.id, environment, registry);
  const liveResolution = operationResolution(invocation, registry);
  if (liveResolution.binding !== resolution.binding || liveResolution.plugin.id !== resolution.plugin.id)
    throw new Error("messaging live preflight changed provider binding");
  const live = await executeReadInvocation(invocation, {
    headed: false,
    environment,
    registry,
    ...signal === undefined ? {} : { signal }
  });
  if (live.receipt.status !== "succeeded") {
    throw new Error("messaging live route preflight did not succeed");
  }
  const snapshot = action.livePreflight.snapshot(live.output, record2.auth.subject);
  const sourceConversationCoordinate = parseMessageLikeMeSourceConversationCoordinateBindingV1(snapshot.sourceConversationCoordinate);
  if (typeof snapshot.conversationProviderId !== "string" || snapshot.conversationProviderId !== record2.conversationProviderId || typeof snapshot.network !== "string" || !/^[a-z][a-z0-9-]{0,63}$/u.test(snapshot.network) || snapshot.conversation.kind !== "single" && snapshot.conversation.kind !== "group" && snapshot.conversation.kind !== "unknown" || snapshot.conversation.title !== null && (typeof snapshot.conversation.title !== "string" || Buffer.byteLength(snapshot.conversation.title, "utf8") > 4096 || /[\0\r\n]/u.test(snapshot.conversation.title)) || typeof snapshot.conversation.participantCount !== "number" || !Number.isSafeInteger(snapshot.conversation.participantCount) || snapshot.conversation.participantCount < 0 || snapshot.conversation.participantCount > 1e4 || typeof snapshot.participantFingerprint !== "string" || !/^[a-f0-9]{64}$/u.test(snapshot.participantFingerprint) || snapshot.providerRevision !== null && (typeof snapshot.providerRevision !== "string" || snapshot.providerRevision.length < 1 || Buffer.byteLength(snapshot.providerRevision, "utf8") > 4096 || /[\0\r\n]/u.test(snapshot.providerRevision)))
    throw new Error("messaging live route preflight returned malformed identity state");
  if (snapshot.network !== record2.network || snapshot.conversation.kind !== record2.conversation.kind || snapshot.conversation.title !== record2.conversation.title || snapshot.conversation.participantCount !== record2.conversation.participantCount || sourceConversationCoordinate.sha256 !== record2.sourceConversationCoordinate?.sha256 || snapshot.participantFingerprint !== record2.conversation.participantFingerprint || snapshot.providerRevision !== record2.conversation.providerRevision)
    throw new Error("messaging route recipient or provider state changed; resolve a new route");
  const recipient = Object.freeze({
    network: snapshot.network,
    conversation: Object.freeze({
      kind: snapshot.conversation.kind,
      title: snapshot.conversation.title,
      participantCount: snapshot.conversation.participantCount
    })
  });
  return Object.freeze({
    revision: sha256(canonicalJson({
      conversationProviderId: snapshot.conversationProviderId,
      recipient,
      sourceConversationCoordinate,
      participantFingerprint: snapshot.participantFingerprint,
      providerRevision: snapshot.providerRevision
    })),
    recipient
  });
}
async function readMessagingContextInternal(value, options = {}) {
  const request = parseMessagingContextRequestV1(value);
  const environment = options.environment ?? process.env;
  const registry = options.registry ?? providerPluginRegistry;
  const observation = now(options);
  const { record: record2, resolution } = await resolveCurrentRoute(request.routeRef, observation, environment, registry);
  if (record2.sourceConversationCoordinate !== null && resolution.messaging.action.state === "supported") {
    await currentMessagingRouteState(record2, resolution, environment, registry, options.signal);
  }
  const current = await currentContextPage(record2, resolution, request.limit, environment, registry, options.signal);
  const validationObservation = options.now ?? new Date;
  if (!Number.isFinite(validationObservation.getTime())) {
    throw new Error("messaging live-preflight completion time is invalid");
  }
  const validatedAt = validationObservation.toISOString();
  const expiresAt = new Date(validationObservation.getTime() + CONTEXT_TTL_MS).toISOString();
  const contextRef = opaque("wmcontext");
  const references = randomRefMap(current.messages);
  const binding = record2.sourceConversationCoordinate === null ? null : parseMessagingContextBindingV2({
    schemaVersion: 2,
    format: "wrench.messaging-context-binding",
    contractId: MESSAGING_CONTEXT_BINDING_CONTRACT_ID,
    contractHash: MESSAGING_CONTEXT_BINDING_CONTRACT_HASH,
    sourceConversationCoordinate: record2.sourceConversationCoordinate,
    routeRef: record2.routeRef,
    contextRef,
    exactDataRevision: current.exactDataRevision,
    latestMessageRevision: current.latestMessageRevision,
    validatedAt,
    expiresAt
  });
  if (binding !== null) {
    const contextRecord = Object.freeze({
      schemaVersion: 1,
      format: "wrench.messaging-context-record",
      contextRef,
      routeRef: record2.routeRef,
      routeRecordHash: messagingRouteRecordHash(record2),
      sourceConversationCoordinate: binding.sourceConversationCoordinate,
      exactDataRevision: current.exactDataRevision,
      latestMessageRevision: current.latestMessageRevision,
      validatedAt,
      expiresAt,
      limit: request.limit,
      liveness: resolution.messaging.contextLiveness,
      replyTargets: references.replyTargets
    });
    saveMessagingContextRecord(contextRecord, environment);
  }
  return Object.freeze({
    schemaVersion: 1,
    format: "wrench.messaging-context",
    binding,
    network: record2.network,
    liveness: resolution.messaging.contextLiveness,
    truncated: current.page.completeness.kind !== "complete" || current.messages.some((message) => message.bodyTruncated === true),
    completeness: current.page.completeness,
    messages: publicMessages(current.messages, references.byProvider),
    warnings: Object.freeze([
      ...resolution.messaging.contextLiveness === "fresh-as-of-live-preflight" ? ["fresh-as-of-live-preflight-only"] : [],
      ...resolution.messaging.contextLiveness === "freshness-unproven" ? ["provider-freshness-unproven-action-blocked"] : [],
      ...current.page.completeness.kind === "complete" ? [] : ["provider-history-incomplete"]
    ])
  });
}
async function previewMessagingTurnInternal(value, options = {}) {
  const turn = parseMessagingTurnV1(value);
  const environment = options.environment ?? process.env;
  const registry = options.registry ?? providerPluginRegistry;
  const observation = now(options);
  const { record: record2, resolution } = await resolveCurrentRoute(turn.routeRef, observation, environment, registry);
  if (record2.sourceConversationCoordinate === null) {
    throw new Error("messaging route is not eligible for checked turn actions");
  }
  if (resolution.messaging.action.state !== "supported") {
    throw new Error("messaging route does not support checked turn actions");
  }
  const action = resolution.messaging.action;
  const context = loadMessagingContextRecord(turn.contextRef, environment, observation);
  if (context.routeRef !== record2.routeRef || context.routeRecordHash !== messagingRouteRecordHash(record2) || context.sourceConversationCoordinate === null || context.sourceConversationCoordinate.sha256 !== record2.sourceConversationCoordinate.sha256 || Date.parse(context.expiresAt) <= observation.getTime())
    throw new Error("messaging context is stale or belongs to another route");
  if (context.liveness !== "fresh-as-of-live-preflight") {
    throw new Error("messaging context freshness is unproven; no action preview is allowed");
  }
  const current = await currentContextPage(record2, resolution, context.limit, environment, registry, options.signal);
  if (current.exactDataRevision !== context.exactDataRevision || current.latestMessageRevision !== context.latestMessageRevision)
    throw new Error("messaging context changed; read a new context before preview");
  const exactContextBinding = parseMessagingContextBindingV2({
    schemaVersion: 2,
    format: "wrench.messaging-context-binding",
    contractId: MESSAGING_CONTEXT_BINDING_CONTRACT_ID,
    contractHash: MESSAGING_CONTEXT_BINDING_CONTRACT_HASH,
    sourceConversationCoordinate: context.sourceConversationCoordinate,
    routeRef: context.routeRef,
    contextRef: context.contextRef,
    exactDataRevision: context.exactDataRevision,
    latestMessageRevision: context.latestMessageRevision,
    validatedAt: context.validatedAt,
    expiresAt: context.expiresAt
  });
  const contextBindingSha256 = ghostgetMessagingContextBindingSha256V2(exactContextBinding);
  const baseRouteState = await currentMessagingRouteState(record2, resolution, environment, registry, options.signal);
  const target = resolution.messaging.parseTarget(record2.target);
  const plannedParts = turn.parts.map((part) => {
    const replyToProviderId = part.replyRef === null ? null : context.replyTargets[part.replyRef];
    if (part.replyRef !== null && replyToProviderId === undefined) {
      throw new Error("messaging reply reference is not part of the bound context");
    }
    if (replyToProviderId !== null && action.reply !== "supported") {
      throw new Error("messaging route does not support exact replies");
    }
    const input = action.compileTurnPart(target, Object.freeze({
      partId: part.partId,
      text: part.text,
      replyToProviderId: replyToProviderId ?? null
    }));
    const invocation = prepareInvocation(record2.adapter.id, action.operation, input, record2.auth.id, environment, registry);
    const actionResolution = messagingResolution(invocation, registry, "action");
    if (actionResolution.binding !== resolution.binding || actionResolution.plugin.id !== resolution.plugin.id || actionResolution.messaging.contractId !== resolution.messaging.contractId)
      throw new Error("messaging action changed provider route");
    return Object.freeze({
      partId: part.partId,
      text: part.text,
      replyRef: part.replyRef,
      replyToProviderId: replyToProviderId ?? null,
      invocation
    });
  });
  const initial = createMessagingCompositeInvocationPlan(plannedParts, Object.freeze({
    routeRef: record2.routeRef,
    contextRef: context.contextRef,
    clientIntentSha256: turn.clientIntentSha256,
    contextBindingSha256,
    sourceConversationCoordinateSha256: exactContextBinding.sourceConversationCoordinate.sha256,
    turnDigest: messagingTurnDigest(turn),
    contextLimit: context.limit,
    baseExactDataRevision: context.exactDataRevision,
    baseLatestMessageRevision: context.latestMessageRevision,
    baseRouteStateRevision: baseRouteState.revision,
    baseMessages: messagingBaseMessages(current.messages),
    recipient: baseRouteState.recipient
  }), observation, registry);
  const initialComposite = initial.plan.messagingComposite;
  if (initialComposite === undefined)
    throw new Error("messaging composite plan disappeared");
  const preview = Object.freeze({
    schemaVersion: 1,
    format: "wrench.messaging-preview",
    status: "confirmation-required",
    planDigest: initial.digest,
    expiresAt: initial.plan.expiresAt,
    routeRef: record2.routeRef,
    contextRef: context.contextRef,
    clientIntentSha256: turn.clientIntentSha256,
    turnDigest: messagingTurnDigest(turn),
    recipient: initialComposite.recipient,
    partCount: turn.parts.length,
    bubbles: Object.freeze(turn.parts.map((part) => Object.freeze({
      partId: part.partId,
      text: part.text,
      replyRef: part.replyRef
    }))),
    risk: "R3",
    sideEffect: initial.plan.sideEffect
  });
  const stored = bindMessagingCompositePreviewDigest(initial, sha256(canonicalJson(preview)));
  if (invocationPlanDigest(stored.plan) !== preview.planDigest) {
    throw new Error("messaging preview changed its confirmation digest");
  }
  saveInvocationPlan(stored, environment);
  return preview;
}
function previewFromStoredMessagingPlan(stored) {
  const composite = stored.plan.messagingComposite;
  if (composite === undefined)
    throw new Error("confirmation plan is not a messaging composite");
  return Object.freeze({
    schemaVersion: 1,
    format: "wrench.messaging-preview",
    status: "confirmation-required",
    planDigest: stored.digest,
    expiresAt: stored.plan.expiresAt,
    routeRef: composite.routeRef,
    contextRef: composite.contextRef,
    clientIntentSha256: composite.clientIntentSha256,
    turnDigest: composite.turnDigest,
    recipient: composite.recipient,
    partCount: composite.parts.length,
    bubbles: Object.freeze(composite.parts.map((part) => Object.freeze({
      partId: part.partId,
      text: part.text,
      replyRef: part.replyRef
    }))),
    risk: "R3",
    sideEffect: stored.plan.sideEffect
  });
}
function verifyStoredMessagingPreview(stored) {
  const composite = stored.plan.messagingComposite;
  if (composite === undefined)
    throw new Error("confirmation plan is not a messaging composite");
  const preview = previewFromStoredMessagingPlan(stored);
  if (sha256(canonicalJson(preview)) !== composite.previewDigest) {
    throw new Error("messaging preview digest does not match the exact reconstructed artifact");
  }
  return preview;
}
function initializeMessagingCompositeRunInternal(stored, runId, options = {}) {
  const composite = stored.plan.messagingComposite;
  if (composite === undefined) {
    throw new Error("confirmation plan is not a messaging composite");
  }
  if (composite.contextBindingSha256 === null || composite.sourceConversationCoordinateSha256 === null) {
    throw new Error("predecessor messaging plan lacks current context evidence; preview the action again");
  }
  verifyStoredMessagingPreview(stored);
  return initializeMessagingRun(runId, stored.digest, composite, options.environment ?? process.env, now(options).toISOString());
}
function messagingTransitionTime(snapshot, options) {
  const observed = now(options).toISOString();
  return Date.parse(observed) < Date.parse(snapshot.run.recordedAt) ? snapshot.run.recordedAt : observed;
}
function stopMessagingBeforeDispatch(snapshot, reason, options) {
  return updateMessagingRun(snapshot, {
    type: "categorical-stop",
    index: snapshot.run.provenPartCount,
    partState: snapshot.run.provenPartCount === 0 ? "failed-before-dispatch" : "failed-permanent",
    reason,
    at: messagingTransitionTime(snapshot, options)
  }, options.environment ?? process.env);
}
function stopMessagingIndeterminate(snapshot, reason, options, privateProviderOutcome = null) {
  return updateMessagingRun(snapshot, reason === "provider-result-indeterminate" ? {
    type: "indeterminate",
    index: snapshot.run.provenPartCount,
    reason,
    privateProviderOutcome,
    at: messagingTransitionTime(snapshot, options)
  } : {
    type: "indeterminate",
    index: snapshot.run.provenPartCount,
    reason,
    at: messagingTransitionTime(snapshot, options)
  }, options.environment ?? process.env);
}
function stopMessagingAfterError(snapshot, options) {
  const active = snapshot.run.parts[snapshot.run.provenPartCount];
  if (active?.state === "dispatching") {
    return stopMessagingIndeterminate(snapshot, "provider-result-indeterminate", options);
  }
  if (active?.state === "claimed" || active?.state === "unattempted") {
    return stopMessagingBeforeDispatch(snapshot, "provider-failed-before-dispatch", options);
  }
  if (snapshot.run.state !== "pending")
    return snapshot;
  throw new Error("messaging run error state could not be classified");
}
function stopMessagingAfterCaughtError(snapshot, options) {
  try {
    return stopMessagingAfterError(snapshot, options);
  } catch {
    const environment = options.environment ?? process.env;
    const latest = readMessagingRun(snapshot.run.runId, environment);
    if (latest.run.state !== "pending")
      return latest;
    const active = latest.run.parts[latest.run.provenPartCount];
    if (active?.state === "dispatching") {
      return stopMessagingIndeterminate(latest, "journal-recovery-required", options);
    }
    return stopMessagingBeforeDispatch(latest, "journal-recovery-required", options);
  }
}
async function executeMessagingCompositeInternal(stored, invocation, initialSnapshot, options = {}) {
  const composite = stored.plan.messagingComposite;
  if (composite === undefined) {
    throw new Error("confirmation plan is not a messaging composite");
  }
  if (composite.contextBindingSha256 === null || composite.sourceConversationCoordinateSha256 === null) {
    throw new Error("predecessor messaging plan lacks current context evidence; preview the action again");
  }
  if (initialSnapshot.run.planDigest !== stored.digest || initialSnapshot.run.turnDigest !== composite.turnDigest || initialSnapshot.run.contextBindingSha256 !== composite.contextBindingSha256 || initialSnapshot.run.sourceConversationCoordinateSha256 !== composite.sourceConversationCoordinateSha256 || initialSnapshot.run.state !== "pending")
    throw new Error("messaging run does not own the exact composite plan");
  const environment = options.environment ?? process.env;
  const registry = options.registry ?? providerPluginRegistry;
  const actionResolution = messagingResolution(invocation, registry, "action");
  await checkOperationPermission(invocation, { environment, registry, ...options.signal === undefined ? {} : { signal: options.signal } });
  const action = actionResolution.messaging.action;
  if (action.state !== "supported") {
    throw new Error("messaging action support disappeared after confirmation");
  }
  if (actionResolution.binding.executeMessagingPart === undefined) {
    throw new Error("messaging provider has no private action executor");
  }
  if (actionResolution.binding.transport === "provider-api") {
    throw new Error("messaging actions require a cleanup-qualified session or local CLI transport");
  }
  const operation = invocation.manifest.operations[invocation.operationId];
  if (operation === undefined) {
    throw new Error("messaging action lost its exact operation recipe");
  }
  const actionTimeoutMs = isLocalCliOperation(operation) ? operation.localCli.timeoutMs : isWebSessionOperation(operation) ? operation.webSession.timeoutMs : null;
  if (actionTimeoutMs === null) {
    throw new Error("messaging action has no cleanup-qualified bounded recipe");
  }
  const boundAuth = invocation.auth;
  requireBoundAuth(actionResolution.binding, boundAuth);
  let snapshot = initialSnapshot;
  for (let index = snapshot.run.provenPartCount;index < composite.parts.length; index += 1) {
    if (snapshot.run.state !== "pending" || snapshot.run.provenPartCount !== index) {
      return snapshot;
    }
    if (options.signal?.aborted === true) {
      return stopMessagingBeforeDispatch(snapshot, "provider-failed-before-dispatch", options);
    }
    const operationDeadline = new OperationDeadline(actionTimeoutMs, {
      ...options.signal === undefined ? {} : { signal: options.signal },
      ...options.deadlineClock === undefined ? {} : { clock: options.deadlineClock }
    });
    try {
      snapshot = await operationDeadline.run(async () => {
        try {
          await requireRuntimeReady(actionResolution.binding, boundAuth, environment, registry);
        } catch {
          operationDeadline.throwIfUnavailable("messaging provider action");
          return stopMessagingBeforeDispatch(snapshot, "prefix-freshness-unproven", options);
        }
        let record2;
        let routeResolution;
        let current;
        let routeState;
        try {
          const route = await resolveCurrentRoute(composite.routeRef, now(options), environment, registry);
          record2 = route.record;
          routeResolution = route.resolution;
          if (routeResolution.binding !== actionResolution.binding || routeResolution.plugin.id !== actionResolution.plugin.id || routeResolution.messaging.contractId !== actionResolution.messaging.contractId) {
            return stopMessagingBeforeDispatch(snapshot, "context-drift", options);
          }
          current = await currentContextPage(record2, routeResolution, composite.contextLimit, environment, registry, operationDeadline.signal);
          routeState = await currentMessagingRouteState(record2, routeResolution, environment, registry, operationDeadline.signal);
        } catch {
          operationDeadline.throwIfUnavailable("messaging provider action");
          return stopMessagingBeforeDispatch(snapshot, "prefix-freshness-unproven", options);
        }
        if (routeState.revision !== composite.baseRouteStateRevision || record2.sourceConversationCoordinate?.sha256 !== composite.sourceConversationCoordinateSha256) {
          return stopMessagingBeforeDispatch(snapshot, "context-drift", options);
        }
        let proof;
        try {
          const accepted = messagingExpectedOwnPrefix(snapshot.run);
          proof = parseExpectedOwnPrefixProof(action.proveExpectedOwnPrefix(Object.freeze({
            base: Object.freeze({
              exactDataRevision: composite.baseExactDataRevision,
              latestMessageRevision: composite.baseLatestMessageRevision,
              contextLimit: composite.contextLimit,
              messages: composite.baseMessages
            }),
            current: Object.freeze({
              exactDataRevision: current.exactDataRevision,
              latestMessageRevision: current.latestMessageRevision,
              messages: current.messages
            }),
            accepted
          })), accepted.length);
        } catch {
          operationDeadline.throwIfUnavailable("messaging provider action");
          return stopMessagingBeforeDispatch(snapshot, "prefix-freshness-unproven", options);
        }
        operationDeadline.throwIfUnavailable("messaging provider action");
        if (proof.state !== "proven" || proof.matchedAcceptedPrefixCount < snapshot.run.observedAcceptedPrefixCount) {
          return stopMessagingBeforeDispatch(snapshot, "context-drift", options);
        }
        snapshot = updateMessagingRun(snapshot, {
          type: "claimed",
          index,
          observedAcceptedPrefixCount: proof.matchedAcceptedPrefixCount,
          at: messagingTransitionTime(snapshot, options)
        }, environment);
        operationDeadline.throwIfUnavailable("messaging provider action");
        let crossedExternalBoundary = false;
        try {
          const recordPrivateIndeterminateOutcome = async (code) => {
            if (!crossedExternalBoundary) {
              throw new Error("messaging provider outcome preceded its durable dispatch boundary");
            }
            snapshot = stopMessagingIndeterminate(snapshot, "provider-result-indeterminate", options, Object.freeze({
              schemaVersion: 1,
              messagingContractId: actionResolution.messaging.contractId,
              code
            }));
          };
          const beforeExternalBegin = async () => {
            await checkOperationPermission({ ...invocation, input: composite.parts[index].input }, { environment, registry, ...options.signal === undefined ? {} : { signal: options.signal } });
            operationDeadline.throwIfUnavailable("messaging provider action");
            if (crossedExternalBoundary) {
              throw new Error("messaging provider attempted more than one dispatch boundary");
            }
            snapshot = updateMessagingRun(snapshot, {
              type: "dispatching",
              index,
              at: messagingTransitionTime(snapshot, options)
            }, environment);
            crossedExternalBoundary = true;
            operationDeadline.throwIfUnavailable("messaging provider action");
          };
          const executePart = (deadline, registerCleanupBarrier) => actionResolution.binding.executeMessagingPart(action.operation, composite.parts[index].input, boundAuth, Object.freeze({
            beforeExternalBegin,
            recordPrivateIndeterminateOutcome,
            operationDeadline: deadline,
            signal: deadline.signal,
            ...registerCleanupBarrier === undefined ? {} : { registerCleanupBarrier },
            environment
          }));
          const output = actionResolution.binding.transport === "local-cli" ? await (() => {
            if (!isLocalCliOperation(operation)) {
              throw new Error("local CLI messaging action lost its exact operation recipe");
            }
            return withLocalCliProviderCleanupAdmission({
              registry,
              binding: actionResolution.binding,
              auth: boundAuth,
              purpose: {
                kind: "messaging",
                action: operation.localCli.action,
                contractVersion: operation.localCli.contractVersion,
                messagingRunId: snapshot.run.runId,
                partIndex: index
              },
              environment,
              ...options.now === undefined ? {} : { now: options.now }
            }, (registerCleanupBarrier) => runLocalCliOperationWithDeadline(operation.localCli, {
              environment,
              signal: operationDeadline.signal,
              operationDeadline,
              registerCleanupBarrier
            }, (boundedOptions) => {
              const boundedDeadline = boundedOptions.operationDeadline;
              if (boundedDeadline === undefined) {
                throw new Error("local CLI messaging deadline is unavailable");
              }
              return executePart(boundedDeadline, boundedOptions.registerCleanupBarrier);
            }));
          })() : await (() => {
            if (!isWebSessionOperation(operation)) {
              throw new Error("session messaging action lost its exact operation recipe");
            }
            return withWebSessionCleanupAdmission(messagingWebCleanupAdmissionIdentity(invocation, actionResolution, registry, snapshot.run.runId, index), environment, (registerCleanupBarrier) => runWebSessionOperationWithDeadline(operation.webSession, {
              environment,
              signal: operationDeadline.signal,
              operationDeadline,
              registerCleanupBarrier
            }, (boundedOptions) => {
              const boundedDeadline = boundedOptions.operationDeadline;
              if (boundedDeadline === undefined) {
                throw new Error("session messaging deadline is unavailable");
              }
              return executePart(boundedDeadline, boundedOptions.registerCleanupBarrier);
            }), options.now);
          })();
          if (snapshot.run.state !== "pending")
            return snapshot;
          operationDeadline.throwIfUnavailable("messaging provider action");
          if (!crossedExternalBoundary) {
            throw new Error("messaging provider returned without crossing its durable dispatch boundary");
          }
          const accepted = action.mapAcceptedResult(output);
          if (accepted.state !== "submitted" || typeof accepted.providerMessageId !== "string" || accepted.providerMessageId.length < 1 || Buffer.byteLength(accepted.providerMessageId, "utf8") > 4096 || /[\0\r\n]/u.test(accepted.providerMessageId) || accepted.providerRevision !== null && (typeof accepted.providerRevision !== "string" || accepted.providerRevision.length < 1 || Buffer.byteLength(accepted.providerRevision, "utf8") > 4096 || /[\0\r\n]/u.test(accepted.providerRevision))) {
            throw new Error("messaging provider returned malformed acceptance evidence");
          }
          const existingProviderMessageIds = new Set([
            ...composite.baseMessages.map((message) => message.providerMessageId),
            ...snapshot.run.parts.slice(0, snapshot.run.provenPartCount).flatMap((part) => part.providerMessageId === null ? [] : [part.providerMessageId])
          ]);
          if (existingProviderMessageIds.has(accepted.providerMessageId)) {
            throw new Error("messaging provider reused an existing message identity for acceptance");
          }
          operationDeadline.throwIfUnavailable("messaging provider action");
          snapshot = updateMessagingRun(snapshot, {
            type: "accepted",
            index,
            providerMessageId: accepted.providerMessageId,
            providerRevision: accepted.providerRevision,
            at: messagingTransitionTime(snapshot, options)
          }, environment);
          operationDeadline.throwIfUnavailable("messaging provider action");
          return snapshot;
        } catch {
          return stopMessagingAfterCaughtError(snapshot, options);
        }
      }, "messaging provider action");
    } catch {
      snapshot = stopMessagingAfterCaughtError(snapshot, options);
    } finally {
      operationDeadline.dispose();
    }
    if (snapshot.run.state !== "pending")
      return snapshot;
  }
  return snapshot;
}
function loadMessagingPreviewForConfirmationInternal(digest2, options = {}) {
  const stored = loadInvocationPlan(digest2, options.environment ?? process.env);
  return verifyStoredMessagingPreview(stored);
}
function showMessagingRunInternal(runId, options = {}) {
  const run = readMessagingRun(runId, options.environment ?? process.env).run;
  if (run.state === "pending") {
    throw new Error("messaging run is pending or requires checked recovery");
  }
  return Object.freeze({
    run,
    receipt: messagingRunReceipt(run),
    receiptBinding: messagingReceiptBinding(run)
  });
}
function reconcileMessagingRunInternal(runId, options = {}) {
  const run = readMessagingRun(runId, options.environment ?? process.env).run;
  if (run.state === "pending") {
    throw new Error("messaging run is pending; run ghostget doctor before reconciliation");
  }
  const binding = messagingReceiptBinding(run);
  const indeterminate = run.state === "indeterminate";
  return Object.freeze({
    schemaVersion: 1,
    format: "wrench.messaging-reconciliation",
    runId,
    state: run.state,
    action: indeterminate ? "retained-unretriable" : "not-required",
    receiptBindingSha256: binding.receiptSha256,
    reason: indeterminate ? "the provider result has no exact accepted message identity; the run remains indeterminate and must not be retried" : "the messaging run already has a categorical terminal state"
  });
}
export {
  writeReservedMessagingPrivateOutput,
  writeMessagingPrivateOutput,
  verifyStoredMessagingPreview,
  validateMessagingPrivateOutputPath,
  showMessagingRunInternal,
  resolveMessagingRouteInternal,
  reserveMessagingPrivateOutputPair,
  reconcileMessagingRunInternal,
  readMessagingContextInternal,
  previewMessagingTurnInternal,
  previewFromStoredMessagingPlan,
  loadMessagingPreviewForConfirmationInternal,
  initializeMessagingCompositeRunInternal,
  executeMessagingCompositeInternal,
  discoverMessagingRoutesInternal
};

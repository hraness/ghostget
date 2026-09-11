// @bun
import {
  XUnlabeledCopyPolicyError,
  X_UNLABELED_COPY_POLICY_ERROR,
  rejectXTweetMadeWithAiLabel,
  scrubXUploadImage
} from "./index-z4mz1sjc.js";
import {
  materializeArticleDraftImages
} from "./index-sxj6x3b5.js";
import {
  PreservedBrowserArtifactsError,
  browserCleanupBarrier,
  browserResultData,
  createBrowserSession
} from "./index-d5mavmrj.js";
import {
  createWebSessionClient,
  fetchPublicWebAsset,
  webSessionAuthSubject,
  webSessionCookie
} from "./index-wn3s7nnj.js";
import"./index-4bpemvnc.js";
import {
  failedProviderRead
} from "./index-4smh9n9x.js";
import"./index-j3ysa35f.js";
import {
  readFailureProjection,
  startWebSessionCleanupTrackedOperation
} from "./index-aka7rgdj.js";
import {
  OperationDeadlineError
} from "./index-vtj5zdgf.js";
import {
  parseArticleDraftDocument,
  parseArticleDraftDocumentV2
} from "./index-tp6v994c.js";
import"./index-n4szk3nw.js";
import {
  canonicalJson,
  jsonScriptLiteral
} from "./index-8sbt8qwx.js";
import"./index-z1w83f81.js";

// src/providers/x-web-runtime.ts
import { createHash } from "crypto";
import { constants } from "fs";
import { open } from "fs/promises";

// src/providers/x-transaction-id.ts
var X_ORIGIN = "https://x.com";
var X_HOME = `${X_ORIGIN}/home`;
var X_ASSET_ORIGIN = "https://abs.twimg.com";
var MAX_MAIN_BUNDLE_BYTES = 16 * 1024 * 1024;
var MAX_EVALUATION_OUTPUT_BYTES = 64 * 1024;
var WEB_SESSION_OPERATION_LABEL = "authenticated web operation deadline";
var xTransactionBrowserManifest = Object.freeze({
  schemaVersion: 2,
  id: "wrench-x-transaction-bootstrap",
  version: "1.0.0",
  displayName: "Ghostget X transaction bootstrap",
  origins: Object.freeze([X_ORIGIN]),
  browserDomains: Object.freeze(["x.com", "*.x.com", "abs.twimg.com"]),
  operations: Object.freeze({})
});
function boundedWebpackId(value, label) {
  if (!/^[1-9][0-9]{0,9}$/u.test(value))
    throw new Error(`${label} is not a bounded webpack ID`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > 2147483647) {
    throw new Error(`${label} is not a bounded webpack ID`);
  }
  return parsed;
}
function parseXTransactionRuntimeIds(mainBundleText) {
  if (mainBundleText.length < 1 || mainBundleText.length > MAX_MAIN_BUNDLE_BYTES) {
    throw new Error("X transaction bootstrap main bundle exceeded its reviewed byte limit");
  }
  const marker = "rweb_client_transaction_id_enabled";
  const firstMarker = mainBundleText.indexOf(marker);
  if (firstMarker < 0 || mainBundleText.indexOf(marker, firstMarker + marker.length) >= 0) {
    throw new Error("X transaction bootstrap did not expose one unique current wrapper");
  }
  const window = mainBundleText.slice(Math.max(0, firstMarker - 4096), firstMarker + 4096);
  if (!window.includes("x-client-transaction-id")) {
    throw new Error("X transaction bootstrap wrapper omitted its reviewed request header");
  }
  const references = [];
  const referencePattern = /([A-Za-z_$][A-Za-z0-9_$]*)\.e\(([1-9][0-9]{0,9})\)\.then\(\1\.bind\(\1,([1-9][0-9]{0,9})\)\)/gu;
  for (const match of window.matchAll(referencePattern)) {
    if (match[2] !== undefined && match[3] !== undefined) {
      references.push({ chunk: match[2], module: match[3] });
    }
  }
  if (references.length !== 1) {
    throw new Error("X transaction bootstrap did not expose one unique lazy runtime binding");
  }
  const markerInWindow = window.indexOf(marker);
  const beforeMarker = window.slice(0, markerInWindow);
  const modulePattern = /\},([1-9][0-9]{0,9})\(([A-Za-z_$][A-Za-z0-9_$]*),([A-Za-z_$][A-Za-z0-9_$]*),([A-Za-z_$][A-Za-z0-9_$]*)\)\{"use strict";/gu;
  const modules = [...beforeMarker.matchAll(modulePattern)];
  const wrapper = modules.at(-1);
  if (wrapper?.[1] === undefined || wrapper[3] === undefined || wrapper[4] === undefined) {
    throw new Error("X transaction bootstrap did not expose its current wrapper module");
  }
  const helperMatch = /\["x-client-transaction-id"\]=await ([A-Za-z_$][A-Za-z0-9_$]*)\(/u.exec(window);
  const helperName = helperMatch?.[1];
  if (helperName === undefined) {
    throw new Error("X transaction bootstrap did not expose its current wrapper helper");
  }
  const exportMapPattern = new RegExp(`${wrapper[4]}\\.d\\(${wrapper[3]},\\{([^}]{1,2048})\\}\\)`, "u");
  const exportMap = exportMapPattern.exec(window)?.[1];
  if (exportMap === undefined)
    throw new Error("X transaction bootstrap did not expose its wrapper exports");
  const escapedHelper = helperName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const exportMatches = [...exportMap.matchAll(new RegExp(`(?:^|,)([A-Za-z_$][A-Za-z0-9_$]*):\\(\\)=>${escapedHelper}(?=,|$)`, "gu"))];
  const exportName = exportMatches.length === 1 ? exportMatches[0]?.[1] : undefined;
  if (exportName === undefined) {
    throw new Error("X transaction bootstrap did not expose one unique exported wrapper helper");
  }
  const reference = references[0];
  return Object.freeze({
    wrapperModuleId: boundedWebpackId(wrapper[1], "X transaction wrapper module ID"),
    exportName,
    chunkId: boundedWebpackId(reference.chunk, "X transaction chunk ID"),
    moduleId: boundedWebpackId(reference.module, "X transaction module ID")
  });
}
function exactMutationPath(value) {
  if (!/^\/i\/api\/graphql\/[A-Za-z0-9_-]{8,128}\/[A-Za-z][A-Za-z0-9_]{1,127}$/u.test(value)) {
    throw new Error("X transaction bootstrap path is not one exact reviewed GraphQL mutation");
  }
  return value;
}
function exactMainBundlePath(value) {
  let url;
  try {
    url = value instanceof URL ? new URL(value.href) : new URL(value);
  } catch {
    throw new Error("X transaction bootstrap main bundle URL is invalid");
  }
  if (url.origin !== X_ASSET_ORIGIN || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "" || !/^\/responsive-web\/client-web\/main\.[A-Za-z0-9_-]{6,128}\.js$/u.test(url.pathname))
    throw new Error("X transaction bootstrap main bundle URL escaped its reviewed asset path");
  return url.pathname;
}
function containedBrowserAuth(auth) {
  if (auth.kind === "cookie-source" || auth.kind === "cookies-file")
    return auth;
  if (auth.kind === "browser-profile" && auth.cookieSource !== undefined) {
    return {
      schemaVersion: 1,
      id: auth.id,
      kind: "cookie-source",
      source: auth.cookieSource,
      ...auth.cookieProfile === undefined ? {} : { profile: auth.cookieProfile },
      ...auth.subject === undefined ? {} : { subject: auth.subject }
    };
  }
  throw new Error("X transaction bootstrap requires target-filtered cookie auth");
}
function transactionEvaluationSource(input) {
  const bound = jsonScriptLiteral({
    method: input.method,
    path: exactMutationPath(input.path),
    mainBundlePath: input.mainBundlePath,
    wrapperModuleId: input.runtime.wrapperModuleId,
    exportName: input.runtime.exportName,
    chunkId: input.runtime.chunkId,
    moduleId: input.runtime.moduleId
  });
  return `(async()=>{const input=${bound};if(location.origin!=="${X_ORIGIN}")throw new Error("unexpected X origin");const mains=Array.from(document.scripts).map((node)=>{try{return new URL(node.src,location.href)}catch{return null}}).filter((url)=>url!==null&&url.origin==="${X_ASSET_ORIGIN}"&&/^\\/responsive-web\\/client-web\\/main\\.[A-Za-z0-9_-]{6,128}\\.js$/.test(url.pathname));if(mains.length!==1||mains[0].pathname!==input.mainBundlePath)throw new Error("X main runtime drifted");const chunks=globalThis.webpackChunk_twitter_responsive_web;if(!Array.isArray(chunks)||typeof chunks.push!=="function")throw new Error("X webpack runtime is unavailable");let runtime=null;chunks.push([["wrench_x_client_transaction_bootstrap"],{},(candidate)=>{runtime=candidate}]);if(typeof runtime!=="function")throw new Error("X webpack runtime is unavailable");const exports=runtime(input.wrapperModuleId);if(exports===null||typeof exports!=="object")throw new Error("X transaction wrapper is unavailable");const helper=exports[input.exportName];if(typeof helper!=="function")throw new Error("X transaction wrapper helper is unavailable");const value=await helper(location.host,input.path,input.method);if(typeof value!=="string"||value.length<8||value.length>2048)throw new Error("X transaction wrapper returned an invalid value");try{if(atob(value).startsWith("e:"))throw new Error("X transaction wrapper reported an error")}catch(error){if(error instanceof Error&&error.message==="X transaction wrapper reported an error")throw error}return value})()`;
}
function currentBrowserUrl(record) {
  const data = browserResultData(record);
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("X transaction bootstrap browser omitted its current URL");
  }
  const value = data.url;
  if (typeof value !== "string")
    throw new Error("X transaction bootstrap browser omitted its current URL");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("X transaction bootstrap browser returned an invalid current URL");
  }
  if (url.origin !== X_ORIGIN || url.username !== "" || url.password !== "") {
    throw new Error("X transaction bootstrap browser left its reviewed origin");
  }
  return url;
}
function transactionId(record) {
  const data = browserResultData(record);
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("X transaction bootstrap returned a malformed evaluation envelope");
  }
  const envelope = data;
  if (typeof envelope.origin !== "string") {
    throw new Error("X transaction bootstrap evaluation omitted its origin");
  }
  let origin;
  try {
    origin = new URL(envelope.origin);
  } catch {
    throw new Error("X transaction bootstrap evaluation returned an invalid origin");
  }
  if (origin.origin !== X_ORIGIN || origin.username !== "" || origin.password !== "") {
    throw new Error("X transaction bootstrap evaluation escaped its reviewed origin");
  }
  const value = envelope.result;
  if (typeof value !== "string" || !/^[A-Za-z0-9_+/=-]{8,2048}$/u.test(value)) {
    throw new Error("X transaction bootstrap returned an invalid request value");
  }
  return value;
}
async function finalizeBrowserSession(session) {
  const failures = [];
  let closeVerified = false;
  try {
    await session.close();
    closeVerified = true;
  } catch (error) {
    failures.push(error);
  }
  let cleanupVerified = false;
  try {
    await session.cleanup();
    cleanupVerified = true;
  } catch (error) {
    failures.push(error);
  }
  return Object.freeze({
    closeVerified,
    cleanupVerified,
    failures: Object.freeze(failures)
  });
}
function remainingTimeoutMs(timeoutMs, operationDeadline) {
  if (operationDeadline === undefined)
    return timeoutMs;
  operationDeadline.throwIfUnavailable(WEB_SESSION_OPERATION_LABEL);
  const remaining = Math.min(timeoutMs, operationDeadline.remainingTimeMs());
  if (remaining < 1) {
    operationDeadline.throwIfUnavailable(WEB_SESSION_OPERATION_LABEL);
    throw new Error("X transaction bootstrap timed out");
  }
  return remaining;
}
function runWithinOperationDeadline(operationDeadline, work) {
  return operationDeadline === undefined ? work() : operationDeadline.run(work, WEB_SESSION_OPERATION_LABEL);
}
function finalizeBrowserSessionWithoutBlocking(session) {
  finalizeBrowserSession(session);
}
async function generateXClientTransactionId(input) {
  input.operationDeadline?.throwIfUnavailable(WEB_SESSION_OPERATION_LABEL);
  if (input.method !== "POST")
    throw new Error("X transaction bootstrap supports mutations only");
  const path = exactMutationPath(input.path);
  const mainBundlePath = exactMainBundlePath(input.mainBundleUrl);
  const runtime = parseXTransactionRuntimeIds(input.mainBundleText);
  const createSession = input.dependencies?.createBrowserSession ?? createBrowserSession;
  const creation = createSession(xTransactionBrowserManifest, containedBrowserAuth(input.auth), {
    headed: false,
    timeoutMs: remainingTimeoutMs(input.timeoutMs, input.operationDeadline),
    maxOutputBytes: Math.min(input.maxOutputBytes, MAX_EVALUATION_OUTPUT_BYTES),
    allowCodeOwnedEvaluation: true,
    ...input.operationDeadline === undefined ? {} : { operationDeadline: input.operationDeadline },
    ...input.dependencies?.acquireCookieRecords === undefined ? {} : { dependencies: { acquireCookieRecords: input.dependencies.acquireCookieRecords } },
    ...input.publishCleanupResource === undefined ? {} : { publishCleanupResource: input.publishCleanupResource }
  });
  let session;
  try {
    session = input.dependencies?.createBrowserSession === undefined ? await creation : await runWithinOperationDeadline(input.operationDeadline, () => creation);
  } catch (error) {
    if (input.operationDeadline !== undefined && input.dependencies?.createBrowserSession !== undefined) {
      creation.then((lateSession) => finalizeBrowserSessionWithoutBlocking(lateSession), () => {
        return;
      });
    }
    throw error;
  }
  let generated;
  let failure;
  let failed = false;
  const activeBatchState = { current: null };
  const runBatch = (commands) => {
    const batch = session.runBatch(commands, remainingTimeoutMs(input.timeoutMs, input.operationDeadline), MAX_EVALUATION_OUTPUT_BYTES);
    activeBatchState.current = batch;
    batch.then(() => {
      if (activeBatchState.current === batch)
        activeBatchState.current = null;
    }, () => {
      if (activeBatchState.current === batch)
        activeBatchState.current = null;
    });
    return runWithinOperationDeadline(input.operationDeadline, () => batch);
  };
  try {
    await runBatch([["open", X_HOME]]);
    const [urlRecord] = await runBatch([["get", "url"]]);
    if (urlRecord === undefined)
      throw new Error("X transaction bootstrap browser omitted its current URL");
    currentBrowserUrl(urlRecord);
    const [evaluationRecord] = await runBatch([[
      "eval",
      transactionEvaluationSource({ method: "POST", path, mainBundlePath, runtime })
    ]]);
    if (evaluationRecord === undefined)
      throw new Error("X transaction bootstrap browser omitted its evaluation result");
    generated = transactionId(evaluationRecord);
  } catch (error) {
    failed = true;
    failure = error;
  }
  const activeBatch = activeBatchState.current;
  if (activeBatch !== null) {
    await activeBatch.catch(() => {
      return;
    });
  }
  const finalization = await finalizeBrowserSession(session);
  if (!finalization.closeVerified || !finalization.cleanupVerified) {
    const cleanupEvidence = finalization.closeVerified && !finalization.cleanupVerified && session.cleanupResourceIdentity !== undefined ? Object.freeze({
      kind: "agent-browser-closed-artifacts-v1",
      resource: session.cleanupResourceIdentity
    }) : undefined;
    throw new PreservedBrowserArtifactsError("X transaction bootstrap browser finalization failed; private artifacts were preserved", session.recoveryHandle ?? "session=x-transaction-bootstrap;artifacts=unknown", new AggregateError([
      ...failed ? [failure] : [],
      ...finalization.failures
    ], "X transaction bootstrap browser finalization failed"), cleanupEvidence);
  }
  if (failed)
    throw failure;
  if (generated === undefined)
    throw new Error("X transaction bootstrap produced no request value");
  return generated;
}

// src/providers/x-web.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function record(value, label) {
  if (!isRecord(value))
    throw new Error(`${label} must be an object`);
  return value;
}
function exactKeys(value, expected, label) {
  const expectedSet = new Set(expected);
  const extra = Object.keys(value).filter((key) => !expectedSet.has(key));
  const missing = expected.filter((key) => !Object.hasOwn(value, key));
  if (missing.length > 0)
    throw new Error(`${label} omitted ${missing.join(", ")}`);
  if (extra.length > 0)
    throw new Error(`${label} contained unsupported field(s): ${extra.join(", ")}`);
}
function requiredString(value, key, label) {
  const candidate = value[key];
  if (typeof candidate !== "string" || candidate.length === 0) {
    throw new Error(`${label}.${key} must be a non-empty string`);
  }
  return candidate;
}
function exactStringArray(value, label) {
  if (!Array.isArray(value))
    throw new Error(`${label} must be a string array`);
  const result = [];
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,199}$/u.test(item)) {
      throw new Error(`${label}[${index}] must be a feature or field-toggle name`);
    }
    result.push(item);
  }
  if (new Set(result).size !== result.length)
    throw new Error(`${label} contained duplicates`);
  return Object.freeze(result);
}
function exactQueryId(value, label) {
  if (!/^[A-Za-z0-9_-]{8,128}$/u.test(value)) {
    throw new Error(`${label} must be an exact X query ID`);
  }
  return value;
}
function exactOperationName(value, label) {
  if (!/^[A-Za-z][A-Za-z0-9_]{1,127}$/u.test(value)) {
    throw new Error(`${label} must be an exact X operation name`);
  }
  return value;
}
function exactOperationType(value, label) {
  if (value !== "query" && value !== "mutation") {
    throw new Error(`${label} must be query or mutation`);
  }
  return value;
}
function parseBundleQueryDescriptor(value, label) {
  const descriptor = record(value, label);
  exactKeys(descriptor, ["queryId", "operationName", "operationType", "metadata"], label);
  const metadata = record(descriptor.metadata, `${label}.metadata`);
  exactKeys(metadata, ["featureSwitches", "fieldToggles"], `${label}.metadata`);
  return Object.freeze({
    queryId: exactQueryId(requiredString(descriptor, "queryId", label), `${label}.queryId`),
    operationName: exactOperationName(requiredString(descriptor, "operationName", label), `${label}.operationName`),
    operationType: exactOperationType(descriptor.operationType, `${label}.operationType`),
    metadata: Object.freeze({
      featureSwitches: exactStringArray(metadata.featureSwitches, `${label}.metadata.featureSwitches`),
      fieldToggles: exactStringArray(metadata.fieldToggles, `${label}.metadata.fieldToggles`)
    })
  });
}
function parseDescriptorKey(value, label) {
  const key = record(value, label);
  const required = ["queryId", "operationName", "operationType"];
  const allowed = new Set([...required, "metadata", "sourceChunk", "observedOn"]);
  const missing = required.filter((name) => !Object.hasOwn(key, name));
  const extra = Object.keys(key).filter((name) => !allowed.has(name));
  if (missing.length > 0)
    throw new Error(`${label} omitted ${missing.join(", ")}`);
  if (extra.length > 0)
    throw new Error(`${label} contained unsupported field(s): ${extra.join(", ")}`);
  if (key.sourceChunk !== undefined && (typeof key.sourceChunk !== "string" || !key.sourceChunk.endsWith(".js"))) {
    throw new Error(`${label}.sourceChunk must be a JavaScript bundle name`);
  }
  if (key.observedOn !== undefined && (typeof key.observedOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(key.observedOn))) {
    throw new Error(`${label}.observedOn must be an ISO date`);
  }
  if (key.metadata !== undefined) {
    const metadata = record(key.metadata, `${label}.metadata`);
    exactKeys(metadata, ["featureSwitches", "fieldToggles"], `${label}.metadata`);
    exactStringArray(metadata.featureSwitches, `${label}.metadata.featureSwitches`);
    exactStringArray(metadata.fieldToggles, `${label}.metadata.fieldToggles`);
  }
  return Object.freeze({
    queryId: exactQueryId(requiredString(key, "queryId", label), `${label}.queryId`),
    operationName: exactOperationName(requiredString(key, "operationName", label), `${label}.operationName`),
    operationType: exactOperationType(key.operationType, `${label}.operationType`)
  });
}
function xWebQueryDescriptorKey(descriptor) {
  return `${descriptor.operationName}:${descriptor.operationType}:${descriptor.queryId}`;
}
function resolveUniqueXWebBundleDescriptor(candidates, expectedValue) {
  if (!Array.isArray(candidates))
    throw new Error("X bundle descriptors must be an array");
  const expected = parseDescriptorKey(expectedValue, "expected X descriptor");
  const parsed = candidates.map((candidate, index) => parseBundleQueryDescriptor(candidate, `X bundle descriptor ${index + 1}`));
  const nameMatches = parsed.filter((candidate) => candidate.operationName === expected.operationName);
  if (nameMatches.length === 0) {
    throw new Error(`X bundle omitted operation ${expected.operationName}`);
  }
  const typeMatches = nameMatches.filter((candidate) => candidate.operationType === expected.operationType);
  if (typeMatches.length === 0) {
    const actual = [...new Set(nameMatches.map((candidate) => candidate.operationType))].join(", ");
    throw new Error(`X operation-type drift for ${expected.operationName}: expected ${expected.operationType}, observed ${actual}`);
  }
  if (typeMatches.length > 1) {
    const ids = [...new Set(typeMatches.map((candidate) => candidate.queryId))];
    if (ids.length === 1) {
      throw new Error(`X bundle contained duplicate descriptor ${xWebQueryDescriptorKey(typeMatches[0])}`);
    }
    throw new Error(`X bundle contained ambiguous query-ID drift for ${expected.operationName}:${expected.operationType}`);
  }
  const descriptor = typeMatches[0];
  if (descriptor.queryId !== expected.queryId) {
    throw new Error(`X query-ID drift for ${expected.operationName}:${expected.operationType}; reviewed evidence is stale`);
  }
  return descriptor;
}
function exactBooleanMap(value, expectedNames, label) {
  const source = record(value, label);
  const expected = new Set(expectedNames);
  const missing = expectedNames.filter((name) => !Object.hasOwn(source, name));
  const extra = Object.keys(source).filter((name) => !expected.has(name));
  if (missing.length > 0)
    throw new Error(`${label} omitted ${missing.join(", ")}`);
  if (extra.length > 0)
    throw new Error(`${label} contained unreviewed key(s): ${extra.join(", ")}`);
  const result = {};
  for (const name of [...expectedNames].sort()) {
    const item = source[name];
    if (typeof item !== "boolean")
      throw new Error(`${label}.${name} must be boolean`);
    result[name] = item;
  }
  return Object.freeze(result);
}
function bindXWebOperationMetadataValues(descriptorValue, value) {
  const descriptor = parseBundleQueryDescriptor(descriptorValue, "resolved X descriptor");
  const metadataValues = record(value, "X operation metadata values");
  exactKeys(metadataValues, ["features", "fieldToggles"], "X operation metadata values");
  return Object.freeze({
    features: exactBooleanMap(metadataValues.features, descriptor.metadata.featureSwitches, "X operation feature values"),
    fieldToggles: exactBooleanMap(metadataValues.fieldToggles, descriptor.metadata.fieldToggles, "X operation field-toggle values")
  });
}
var xWebQueryDescriptorEvidenceSnapshot = Object.freeze({
  schemaVersion: 1,
  role: "revision-evidence-only",
  observedOn: "2026-07-22",
  currentBundleResolutionRequired: true,
  mainBundleUrl: "https://abs.twimg.com/responsive-web/client-web/main.7792f4fa.js",
  descriptors: Object.freeze([
    { operationName: "HomeTimeline", operationType: "query", queryId: "wp06oo3fRGU4P1sK8rECqQ", sourceChunk: "shared~bundle.LoggedInMain~bundle.HomeTimeline.c12c8a9a.js", observedOn: "2026-08-20" },
    { operationName: "HomeLatestTimeline", operationType: "query", queryId: "BLQWpfVqtgBqAqwRRJcJjA", sourceChunk: "shared~bundle.LoggedInMain~bundle.HomeTimeline.c12c8a9a.js", observedOn: "2026-08-20" },
    { operationName: "ListLatestTweetsTimeline", operationType: "query", queryId: "LV64djPRhnsVhGCK76s13w", sourceChunk: "shared~loader.Dock~bundle.BookmarkFolders~bundle.Bookmarks~bundle.Explore~bundle.HomeTimeline~bundle.Notifica.3b894e0a.js" },
    { operationName: "ListRankedTweetsTimeline", operationType: "query", queryId: "dPN7GrkxeMF4SUYCo9D9YA", sourceChunk: "shared~loader.Dock~bundle.BookmarkFolders~bundle.Bookmarks~bundle.Explore~bundle.HomeTimeline~bundle.Notifica.3b894e0a.js" },
    { operationName: "Bookmarks", operationType: "query", queryId: "tF6KOjmZM0WGcB2Q0mfwhw", sourceChunk: "shared~bundle.BookmarkFolders~bundle.Bookmarks.433463ce78e2afaba.js", observedOn: "2026-09-09" },
    { operationName: "BookmarkSearchTimeline", operationType: "query", queryId: "SpDsqmz6FfYESd1e7TPcAw", sourceChunk: "main.9929b02a.js" },
    { operationName: "SearchTimeline", operationType: "query", queryId: "hyPfJYJ_XAtDYoslQc-Rgg", sourceChunk: "main.ae82e9d02d3328bba.js", observedOn: "2026-09-06" },
    { operationName: "NotificationsTimeline", operationType: "query", queryId: "dDSNxYH-uWwVo2r3Y5VVqg", sourceChunk: "bundle.Notifications.eea6257a.js" },
    { operationName: "TweetDetail", operationType: "query", queryId: "rZA6K31W4E90vZKBmxXV3g", sourceChunk: "main.9929b02a.js" },
    { operationName: "TweetResultByRestId", operationType: "query", queryId: "4hhGRbehkcUVTKf8n0f0xw", sourceChunk: "main.9929b02a.js" },
    { operationName: "TweetResultsByRestIds", operationType: "query", queryId: "aSkhsainBPfEWA4mG8wnFA", sourceChunk: "main.9929b02a.js" },
    { operationName: "UserTweets", operationType: "query", queryId: "eviprbEPLvNG88V3smUngQ", sourceChunk: "main.ae82e9d02d3328bba.js", observedOn: "2026-09-06" },
    { operationName: "UserTweetsAndReplies", operationType: "query", queryId: "klja8a2iJX_3to5RdfVlgw", sourceChunk: "main.9929b02a.js" },
    { operationName: "UserMedia", operationType: "query", queryId: "IS3w9vvPg1SJysLErvnFGg", sourceChunk: "main.9929b02a.js" },
    { operationName: "FavoriteTweet", operationType: "mutation", queryId: "lI07N6Otwv1PhnEgXILM7A", sourceChunk: "main.9929b02a.js" },
    { operationName: "UnfavoriteTweet", operationType: "mutation", queryId: "ZYKSe-w7KEslx3JhSIk5LA", sourceChunk: "main.9929b02a.js" },
    { operationName: "CreateBookmark", operationType: "mutation", queryId: "aoDbu3RHznuiSkQ9aNM67Q", sourceChunk: "main.9929b02a.js" },
    { operationName: "DeleteBookmark", operationType: "mutation", queryId: "Wlmlj2-xzyS1GN3a6cj-mQ", sourceChunk: "main.9929b02a.js" },
    { operationName: "CreateRetweet", operationType: "mutation", queryId: "mbRO74GrOvSfRcJnlMapnQ", sourceChunk: "main.9929b02a.js" },
    { operationName: "DeleteRetweet", operationType: "mutation", queryId: "ZyZigVsNiFO6v1dEks1eWg", sourceChunk: "main.9929b02a.js" },
    { operationName: "CreateTweet", operationType: "mutation", queryId: "WXTdKnLddrQOunD6MhWi3g", sourceChunk: "main.7792f4fa.js", observedOn: "2026-08-20" },
    { operationName: "CreateNoteTweet", operationType: "mutation", queryId: "uGXMU9aKbNB9qxxAg4jxkA", sourceChunk: "main.9929b02a.js" },
    { operationName: "DeleteTweet", operationType: "mutation", queryId: "nxpZCY2K-I6QoFHAHeojFQ", sourceChunk: "main.9929b02a.js" },
    { operationName: "DmAllSearchSlice", operationType: "query", queryId: "zd0F6a_svKAXdlMGbCZDFg", sourceChunk: "bundle.DirectMessages.265735ba.js" },
    { operationName: "DmGroupSearchSlice", operationType: "query", queryId: "LxrvmqF3Lokl_BYZ1c83LA", sourceChunk: "bundle.DirectMessages.265735ba.js" },
    { operationName: "DmPeopleSearchSlice", operationType: "query", queryId: "c1MnRRmI-_Bggpntlq9-hQ", sourceChunk: "bundle.DirectMessages.265735ba.js" },
    { operationName: "Viewer", operationType: "query", queryId: "9t128XgFic52jPUEkJMf6w", sourceChunk: "main.cd39a626fdb81748a.js", observedOn: "2026-09-09" },
    { operationName: "UserByScreenName", operationType: "query", queryId: "Gb-d6r0vxPOADdG62OEBpQ", sourceChunk: "main.dd6a5b6a.js", observedOn: "2026-08-21" },
    { operationName: "ArticleEntityDraftCreate", operationType: "mutation", queryId: "btD9FyMDa3_vydVp7fr87Q", sourceChunk: "bundle.TwitterArticles.305538ca.js", observedOn: "2026-08-14" },
    { operationName: "ArticleEntityUpdateContent", operationType: "mutation", queryId: "P5Nc3DYs9D4XqVthNrig8w", sourceChunk: "bundle.TwitterArticles.305538ca.js", observedOn: "2026-08-14" },
    { operationName: "ArticleEntityUpdateTitle", operationType: "mutation", queryId: "z_xdvTUbZjSVjt232b4D4A", sourceChunk: "bundle.TwitterArticles.305538ca.js", observedOn: "2026-08-14" },
    { operationName: "ArticleEntityPublish", operationType: "mutation", queryId: "UyL9qgpV23A8471opeYQbw", sourceChunk: "bundle.TwitterArticles.305538ca.js", observedOn: "2026-08-14" },
    { operationName: "ArticleEntityResultByRestId", operationType: "query", queryId: "rPdndX2XxQoXIMUafLSSJQ", sourceChunk: "bundle.TwitterArticles.305538ca.js", observedOn: "2026-08-14" }
  ])
});
var xWebSemanticOperationRegistry = Object.freeze({
  "feeds.for-you": { semanticOperation: "feeds.read", risk: "R1", transport: "graphql-query", operationName: "HomeTimeline", operationType: "query", responseRoot: ["home", "home_timeline_urt"] },
  "feeds.following": { semanticOperation: "feeds.read", risk: "R1", transport: "graphql-query", operationName: "HomeLatestTimeline", operationType: "query", responseRoot: ["home", "home_timeline_urt"] },
  "feeds.list-latest": { semanticOperation: "feeds.read", risk: "R1", transport: "graphql-query", operationName: "ListLatestTweetsTimeline", operationType: "query", responseRoot: ["list", "tweets_timeline", "timeline"] },
  "feeds.list-ranked": { semanticOperation: "feeds.read", risk: "R1", transport: "graphql-query", operationName: "ListRankedTweetsTimeline", operationType: "query", responseRoot: ["list", "tweets_timeline", "timeline"] },
  "feeds.bookmarks": { semanticOperation: "feeds.read", risk: "R1", transport: "graphql-query", operationName: "Bookmarks", operationType: "query", responseRoot: ["bookmark_timeline_v2", "timeline"] },
  "feeds.bookmark-search": { semanticOperation: "feeds.read", risk: "R1", transport: "graphql-query", operationName: "BookmarkSearchTimeline", operationType: "query", responseRoot: ["bookmark_search_timeline", "timeline"] },
  "feeds.search": { semanticOperation: "feeds.read", risk: "R1", transport: "graphql-query", operationName: "SearchTimeline", operationType: "query", responseRoot: ["search_by_raw_query", "search_timeline", "timeline"] },
  "feeds.notifications": { semanticOperation: "feeds.read", risk: "R1", transport: "graphql-query", operationName: "NotificationsTimeline", operationType: "query", responseRoot: ["viewer_v2", "user_results", "result", "notification_timeline", "timeline"] },
  "profiles.by-handle": { semanticOperation: "profiles.read", risk: "R1", transport: "graphql-query", operationName: "UserByScreenName", operationType: "query", responseRoot: ["user", "result"] },
  "posts.detail": { semanticOperation: "posts.read", risk: "R1", transport: "graphql-query", operationName: "TweetDetail", operationType: "query", responseRoot: ["threaded_conversation_with_injections_v2"] },
  "posts.by-id": { semanticOperation: "posts.read", risk: "R1", transport: "graphql-query", operationName: "TweetResultByRestId", operationType: "query", responseRoot: ["tweetResult", "result"] },
  "posts.by-ids": { semanticOperation: "posts.read", risk: "R1", transport: "graphql-query", operationName: "TweetResultsByRestIds", operationType: "query", responseRoot: ["tweetResult"] },
  "feeds.user": { semanticOperation: "feeds.read", risk: "R1", transport: "graphql-query", operationName: "UserTweets", operationType: "query", responseRoot: ["user", "result", "timeline", "timeline"] },
  "messaging.primary": { semanticOperation: "messaging.list", risk: "R1", transport: "legacy-dm-read", inbox: "primary" },
  "messaging.requests": { semanticOperation: "messaging.list", risk: "R1", transport: "legacy-dm-read", inbox: "requests" },
  "messaging.additional": { semanticOperation: "messaging.list", risk: "R1", transport: "legacy-dm-read", inbox: "additional" },
  "messaging.conversation": { semanticOperation: "messaging.read", risk: "R1", transport: "legacy-dm-read", inbox: "conversation" },
  "likes.set": { semanticOperation: "likes.set", risk: "R2", transport: "graphql-desired-state", enabled: { operationName: "FavoriteTweet", operationType: "mutation" }, disabled: { operationName: "UnfavoriteTweet", operationType: "mutation" } },
  "bookmarks.set": { semanticOperation: "content.save", risk: "R2", transport: "graphql-desired-state", enabled: { operationName: "CreateBookmark", operationType: "mutation" }, disabled: { operationName: "DeleteBookmark", operationType: "mutation" } },
  "reposts.set": { semanticOperation: "posts.repost", risk: "R3", transport: "graphql-desired-state", enabled: { operationName: "CreateRetweet", operationType: "mutation" }, disabled: { operationName: "DeleteRetweet", operationType: "mutation" } }
});
var xWebHeaderSinkPolicy = Object.freeze({
  browserManaged: Object.freeze([
    "cookie",
    "host",
    "origin",
    "referer",
    "user-agent",
    "content-length"
  ]),
  browserManagedPrefixes: Object.freeze(["sec-", "proxy-"]),
  inOriginEphemeral: Object.freeze([
    "authorization",
    "x-csrf-token",
    "x-client-transaction-id"
  ]),
  fixedCodeHeaders: Object.freeze([
    "accept",
    "content-type",
    "x-twitter-auth-type",
    "x-twitter-active-user",
    "x-twitter-client-language"
  ]),
  permittedRawSink: "network-request",
  persistentSinks: Object.freeze(["plan", "receipt", "log", "fixture"]),
  forbiddenSources: Object.freeze(["manifest", "adapter", "user-input"])
});
var forbiddenXWebHeaderSourceSet = new Set(xWebHeaderSinkPolicy.forbiddenSources);
function hasAsciiControl(value) {
  for (let index = 0;index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127)
      return true;
  }
  return false;
}
function assertFixedHeaderValue(name, value) {
  if (name === "accept" && value !== "application/json") {
    throw new Error("X fixed request header accept had an unsupported value");
  }
  if (name === "content-type" && value !== "application/json" && !/^multipart\/form-data; boundary=wrench-x-media-[a-f0-9]{32}$/u.test(value)) {
    throw new Error("X fixed request header content-type had an unsupported value");
  }
  if (name === "x-twitter-auth-type" && value !== "OAuth2Session") {
    throw new Error("X fixed request header x-twitter-auth-type had an unsupported value");
  }
  if (name === "x-twitter-active-user" && value !== "yes") {
    throw new Error("X fixed request header x-twitter-active-user had an unsupported value");
  }
  if (name === "x-twitter-client-language" && !/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u.test(value)) {
    throw new Error("X fixed request header x-twitter-client-language had an unsupported value");
  }
}
function assertEphemeralHeaderValue(name, value) {
  if (value.length === 0 || value.length > 8192 || hasAsciiControl(value)) {
    throw new Error(`X ephemeral request header ${name} had an invalid value`);
  }
  if (name === "authorization" && !/^Bearer [^\s]+$/u.test(value)) {
    throw new Error("X ephemeral request header authorization must be a bearer value");
  }
  if (name === "x-csrf-token" && !/^[A-Za-z0-9_-]{16,512}$/u.test(value)) {
    throw new Error("X ephemeral request header x-csrf-token had an invalid value");
  }
  if (name === "x-client-transaction-id" && !/^[A-Za-z0-9_+/=-]{8,2048}$/u.test(value)) {
    throw new Error("X ephemeral request header x-client-transaction-id had an invalid value");
  }
}
function enforceXWebHeaderSinkPolicy(input) {
  if (!isRecord(input.headers))
    throw new Error("X headers must be an object");
  const entries = Object.entries(input.headers);
  if (input.sink !== "network-request") {
    if (entries.length > 0)
      throw new Error(`raw X headers may not flow to ${input.sink}`);
    return Object.freeze({ names: Object.freeze([]), values: Object.freeze({}) });
  }
  if (forbiddenXWebHeaderSourceSet.has(input.source)) {
    if (entries.length > 0)
      throw new Error(`${input.source} may not supply X request headers`);
    return Object.freeze({ names: Object.freeze([]), values: Object.freeze({}) });
  }
  const normalized = {};
  for (const [rawName, value] of entries) {
    const name = rawName.toLowerCase();
    if (!/^[a-z0-9-]+$/u.test(name))
      throw new Error("X request contained an invalid header name");
    if (Object.hasOwn(normalized, name))
      throw new Error(`X request contained duplicate header ${name}`);
    if (typeof value !== "string" || hasAsciiControl(value)) {
      throw new Error(`X request header ${name} had an invalid value`);
    }
    if (xWebHeaderSinkPolicy.browserManaged.includes(name) || xWebHeaderSinkPolicy.browserManagedPrefixes.some((prefix) => name.startsWith(prefix))) {
      throw new Error(`X request header ${name} must be browser-managed`);
    }
    if (xWebHeaderSinkPolicy.inOriginEphemeral.includes(name)) {
      if (input.source !== "in-origin-session") {
        throw new Error(`X request header ${name} must come from the in-origin session`);
      }
      assertEphemeralHeaderValue(name, value);
    } else if (xWebHeaderSinkPolicy.fixedCodeHeaders.includes(name)) {
      if (input.source !== "code" && input.source !== "in-origin-session") {
        throw new Error(`X request header ${name} must be code-owned`);
      }
      assertFixedHeaderValue(name, value);
    } else {
      throw new Error(`X request header ${name} is not allowlisted`);
    }
    normalized[name] = value;
  }
  return Object.freeze({
    names: Object.freeze(Object.keys(normalized).sort()),
    values: Object.freeze(normalized)
  });
}
function exactUrl(value, label) {
  let url;
  try {
    url = value instanceof URL ? new URL(value.href) : new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute URL`);
  }
  if (url.origin !== "https://x.com" || url.username !== "" || url.password !== "") {
    throw new Error(`${label} must use the exact https://x.com origin`);
  }
  if (url.hash !== "")
    throw new Error(`${label} may not contain a fragment`);
  return url;
}
function normalizedMethod(value) {
  const method = value.toUpperCase();
  if (method !== "GET" && method !== "POST")
    throw new Error("X GraphQL method must be GET or POST");
  return method;
}
function bodyRecord(value) {
  if (typeof value === "string") {
    try {
      return record(JSON.parse(value), "X GraphQL body");
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("X GraphQL body"))
        throw error;
      throw new Error("X GraphQL body must be valid JSON");
    }
  }
  return record(value, "X GraphQL body");
}
function buildXWebGraphQlPath(descriptorValue) {
  const descriptor = parseDescriptorKey(descriptorValue, "X GraphQL descriptor");
  return `/i/api/graphql/${descriptor.queryId}/${descriptor.operationName}`;
}
function assertExactXWebGraphQlBinding(input) {
  const descriptor = parseBundleQueryDescriptor(input.descriptor, "resolved X descriptor");
  const method = normalizedMethod(input.method);
  if (descriptor.operationType === "mutation" && method !== "POST") {
    throw new Error("X GraphQL mutations require POST");
  }
  if (method === "GET" && input.body !== undefined)
    throw new Error("X GraphQL GET may not contain a body");
  const url = exactUrl(input.url, "X GraphQL URL");
  const expectedPath = buildXWebGraphQlPath(descriptor);
  if (url.pathname !== expectedPath) {
    throw new Error("X GraphQL path did not bind the resolved operation name and query ID");
  }
  const allowedParameters = new Set(["variables", "features", "fieldToggles", "queryId", "operationName"]);
  const seenParameters = new Set;
  for (const [name, value] of url.searchParams) {
    if (!allowedParameters.has(name))
      throw new Error(`X GraphQL URL contained unsupported parameter ${name}`);
    if (seenParameters.has(name))
      throw new Error(`X GraphQL URL repeated parameter ${name}`);
    seenParameters.add(name);
    if (name === "queryId" && value !== descriptor.queryId)
      throw new Error("X GraphQL URL queryId drifted from its path");
    if (name === "operationName" && value !== descriptor.operationName)
      throw new Error("X GraphQL URL operationName drifted from its path");
  }
  if (input.body !== undefined) {
    const body = bodyRecord(input.body);
    if (body.queryId !== undefined && body.queryId !== descriptor.queryId) {
      throw new Error("X GraphQL body queryId drifted from its path");
    }
    if (body.operationName !== undefined && body.operationName !== descriptor.operationName) {
      throw new Error("X GraphQL body operationName drifted from its path");
    }
    if (body.operationType !== undefined && body.operationType !== descriptor.operationType) {
      throw new Error("X GraphQL body operationType drifted from its descriptor");
    }
  }
  return Object.freeze({
    method,
    operationName: descriptor.operationName,
    operationType: descriptor.operationType,
    queryId: descriptor.queryId,
    path: expectedPath
  });
}
function authorizeXWebR1GraphQlRequest(operationId, input) {
  const definition = xWebSemanticOperationRegistry[operationId];
  if (definition.transport !== "graphql-query" || definition.risk !== "R1") {
    throw new Error(`${operationId} is not an allowlisted X R1 GraphQL read`);
  }
  const binding = assertExactXWebGraphQlBinding(input);
  if (binding.operationType !== "query" || binding.operationName !== definition.operationName) {
    throw new Error(`${operationId} did not bind its reviewed X query operation`);
  }
  return binding;
}
var xWebMutationOperationIds = Object.freeze([
  "posts.publish",
  "threads.publish",
  "threads.reply",
  "replies.create",
  "posts.quote",
  "likes.enable",
  "likes.disable",
  "bookmarks.enable",
  "bookmarks.disable",
  "reposts.enable",
  "reposts.disable",
  "articles.create",
  "articles.title",
  "articles.content"
]);
var mutationOperationNames = Object.freeze({
  "posts.publish": "CreateTweet",
  "threads.publish": "CreateTweet",
  "threads.reply": "CreateTweet",
  "replies.create": "CreateTweet",
  "posts.quote": "CreateTweet",
  "likes.enable": "FavoriteTweet",
  "likes.disable": "UnfavoriteTweet",
  "bookmarks.enable": "CreateBookmark",
  "bookmarks.disable": "DeleteBookmark",
  "reposts.enable": "CreateRetweet",
  "reposts.disable": "DeleteRetweet",
  "articles.create": "ArticleEntityDraftCreate",
  "articles.title": "ArticleEntityUpdateTitle",
  "articles.content": "ArticleEntityUpdateContent"
});
function exactMutationKeys(value, keys, label) {
  exactKeys(value, keys, label);
}
function exactMutationPostId(value, label) {
  if (typeof value !== "string" || !/^[0-9]{1,19}$/u.test(value)) {
    throw new Error(`${label} must be an exact X post ID`);
  }
  return value;
}
var MAX_X_CREATE_TWEET_TEXT_LENGTH = 25000;
function exactMutationText(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > MAX_X_CREATE_TWEET_TEXT_LENGTH || /[\0\r]/u.test(value)) {
    throw new Error("X CreateTweet text must be bounded and contain no NUL or carriage return");
  }
}
var CREATE_TWEET_AI_DISCLOSURE_FIELDS = [
  "made_with_ai",
  "content_disclosure",
  "ai_generated_disclosure"
];
function rejectCreateTweetAiDisclosureFields(variables, operationId) {
  for (const field of CREATE_TWEET_AI_DISCLOSURE_FIELDS) {
    if (Object.hasOwn(variables, field)) {
      throw new Error(`X ${operationId} ${field} is outside the reviewed CreateTweet contract`);
    }
  }
}
function validateCreateTweetVariables(operationId, variables) {
  rejectCreateTweetAiDisclosureFields(variables, operationId);
  const relationKey = operationId === "replies.create" || operationId === "threads.reply" ? "reply" : operationId === "posts.quote" ? "attachment_url" : null;
  exactMutationKeys(variables, ["tweet_text", "dark_request", "media", "semantic_annotation_ids", ...relationKey === null ? [] : [relationKey]], `X ${operationId} variables`);
  exactMutationText(variables.tweet_text);
  if (variables.dark_request !== false)
    throw new Error(`X ${operationId} dark_request must be false`);
  const media = record(variables.media, `X ${operationId} media`);
  exactMutationKeys(media, ["media_entities", "possibly_sensitive"], `X ${operationId} media`);
  if (!Array.isArray(media.media_entities) || media.possibly_sensitive !== false) {
    throw new Error(`X ${operationId} media left the reviewed shape`);
  }
  if (operationId === "posts.publish") {
    if (media.media_entities.length > 1) {
      throw new Error("X posts.publish supports at most one reviewed image or video");
    }
    if (media.media_entities.length === 1) {
      const entity = record(media.media_entities[0], "X posts.publish media entity");
      exactMutationKeys(entity, ["media_id", "tagged_users"], "X posts.publish media entity");
      exactMutationPostId(entity.media_id, "X posts.publish media entity ID");
      if (!Array.isArray(entity.tagged_users) || entity.tagged_users.length !== 0) {
        throw new Error("X posts.publish media tagged_users must be empty");
      }
    }
  } else if (media.media_entities.length !== 0) {
    throw new Error(`X ${operationId} supports only the reviewed text-only media shape`);
  }
  if (!Array.isArray(variables.semantic_annotation_ids) || variables.semantic_annotation_ids.length !== 0) {
    throw new Error(`X ${operationId} semantic annotations are outside the reviewed contract`);
  }
  if (operationId === "replies.create" || operationId === "threads.reply") {
    const reply = record(variables.reply, "X replies.create reply");
    exactMutationKeys(reply, ["in_reply_to_tweet_id", "exclude_reply_user_ids"], "X replies.create reply");
    exactMutationPostId(reply.in_reply_to_tweet_id, "X replies.create parent");
    if (!Array.isArray(reply.exclude_reply_user_ids) || reply.exclude_reply_user_ids.length !== 0) {
      throw new Error("X replies.create exclude_reply_user_ids must be empty");
    }
  }
  if (operationId === "posts.quote") {
    if (typeof variables.attachment_url !== "string")
      throw new Error("X posts.quote attachment_url must be a string");
    const match = /^https:\/\/x\.com\/i\/status\/([0-9]{1,19})$/u.exec(variables.attachment_url);
    if (match?.[1] === undefined)
      throw new Error("X posts.quote attachment_url must bind one exact X post");
  }
}
function validateDesiredStateVariables(operationId, variables) {
  if (operationId.startsWith("reposts.")) {
    const key = operationId === "reposts.enable" ? "tweet_id" : "source_tweet_id";
    exactMutationKeys(variables, [key, "dark_request"], `X ${operationId} variables`);
    exactMutationPostId(variables[key], `X ${operationId} target`);
    if (variables.dark_request !== false)
      throw new Error(`X ${operationId} dark_request must be false`);
    return;
  }
  exactMutationKeys(variables, ["tweet_id"], `X ${operationId} variables`);
  exactMutationPostId(variables.tweet_id, `X ${operationId} target`);
}
var richArticleBlockTypes = new Set([
  "unstyled",
  "header-one",
  "header-two",
  "blockquote",
  "unordered-list-item",
  "ordered-list-item",
  "atomic"
]);
var richArticleInlineStyles = new Set(["Bold", "Italic", "Strikethrough"]);
function exactArticleRange(value, label, maximum) {
  const range = record(value, label);
  const hasKey = Object.hasOwn(range, "key");
  const hasStyle = Object.hasOwn(range, "style");
  if (hasKey === hasStyle)
    throw new Error(`${label} must be exactly one entity or style range`);
  exactMutationKeys(range, hasKey ? ["key", "offset", "length"] : ["length", "offset", "style"], label);
  if (!Number.isSafeInteger(range.offset) || !Number.isSafeInteger(range.length) || range.offset < 0 || range.length < 1 || range.offset + range.length > maximum)
    throw new Error(`${label} must stay inside its block text`);
  if (hasKey && (!Number.isSafeInteger(range.key) || range.key < 0)) {
    throw new Error(`${label}.key must be a non-negative integer`);
  }
  if (hasStyle && (typeof range.style !== "string" || !richArticleInlineStyles.has(range.style))) {
    throw new Error(`${label}.style is outside the reviewed Article styles`);
  }
  return Object.freeze({
    ...hasKey ? { key: range.key } : { style: range.style },
    offset: range.offset,
    length: range.length
  });
}
function exactArticleUrl(value, label) {
  if (typeof value !== "string" || value.length < 1 || value.length > 2048 || /[\0\r\n]/u.test(value)) {
    throw new Error(`${label} must be a bounded HTTPS URL`);
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a bounded HTTPS URL`);
  }
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "") {
    throw new Error(`${label} must be a bounded HTTPS URL`);
  }
  return parsed.href;
}
function validateXWebRichArticleContentState(value) {
  const contentState = record(value, "X rich Article content_state");
  exactMutationKeys(contentState, ["blocks", "entity_map"], "X rich Article content_state");
  if (!Array.isArray(contentState.blocks) || contentState.blocks.length < 1 || contentState.blocks.length > 2000) {
    throw new Error("X rich Article content_state.blocks must contain 1-2000 blocks");
  }
  if (!Array.isArray(contentState.entity_map) || contentState.entity_map.length > 2000) {
    throw new Error("X rich Article content_state.entity_map exceeded its reviewed bound");
  }
  const entityKinds = [];
  let mediaCount = 0;
  for (const [index, value2] of contentState.entity_map.entries()) {
    const entity = record(value2, `X rich Article entity ${index}`);
    exactMutationKeys(entity, ["key", "value"], `X rich Article entity ${index}`);
    if (entity.key !== `${index}`)
      throw new Error("X rich Article entity keys must be contiguous strings");
    const entry = record(entity.value, `X rich Article entity ${index}.value`);
    exactMutationKeys(entry, ["data", "type", "mutability"], `X rich Article entity ${index}.value`);
    const data = record(entry.data, `X rich Article entity ${index}.data`);
    if (entry.type === "LINK") {
      if (entry.mutability !== "Mutable")
        throw new Error("X rich Article links must be mutable");
      exactMutationKeys(data, ["url"], `X rich Article entity ${index}.data`);
      exactArticleUrl(data.url, `X rich Article entity ${index}.data.url`);
      entityKinds.push("LINK");
      continue;
    }
    if (entry.type !== "MEDIA" || entry.mutability !== "Immutable") {
      throw new Error("X rich Article entities support only reviewed LINK and MEDIA values");
    }
    const mediaKeys = Object.keys(data).sort().join(",");
    if (mediaKeys !== "entity_key,media_items" && mediaKeys !== "caption,entity_key,media_items") {
      throw new Error(`X rich Article entity ${index}.data contained unsupported media fields`);
    }
    if (data.entity_key !== `${index}`)
      throw new Error("X rich Article media entity_key must bind its entity");
    if (data.caption !== undefined && (typeof data.caption !== "string" || data.caption.length > 1000 || /[\0\r]/u.test(data.caption)))
      throw new Error("X rich Article media caption must be bounded text");
    if (!Array.isArray(data.media_items) || data.media_items.length !== 1) {
      throw new Error("X rich Article media entities must contain one image");
    }
    const media = record(data.media_items[0], `X rich Article entity ${index}.media_items[0]`);
    exactMutationKeys(media, ["local_media_id", "media_category", "media_id"], `X rich Article entity ${index}.media_items[0]`);
    if (!Number.isSafeInteger(media.local_media_id) || media.local_media_id < 1) {
      throw new Error("X rich Article local media IDs must be positive integers");
    }
    if (media.media_category !== "DraftTweetImage") {
      throw new Error("X rich Article inline media must use DraftTweetImage");
    }
    exactMutationPostId(media.media_id, "X rich Article media ID");
    mediaCount += 1;
    if (mediaCount > 20)
      throw new Error("X rich Article supports at most 20 inline images");
    entityKinds.push("MEDIA");
  }
  const references = Array.from({ length: entityKinds.length }, () => 0);
  const blockKeys = new Set;
  let characters = 0;
  for (const [index, value2] of contentState.blocks.entries()) {
    const block = record(value2, `X rich Article block ${index + 1}`);
    exactMutationKeys(block, ["data", "text", "key", "type", "entity_ranges", "inline_style_ranges"], `X rich Article block ${index + 1}`);
    const data = record(block.data, `X rich Article block ${index + 1}.data`);
    exactMutationKeys(data, [], `X rich Article block ${index + 1}.data`);
    if (typeof block.text !== "string" || /[\0\r\n]/u.test(block.text) || typeof block.key !== "string" || !/^[a-z0-9]{5}$/u.test(block.key) || blockKeys.has(block.key) || typeof block.type !== "string" || !richArticleBlockTypes.has(block.type) || !Array.isArray(block.entity_ranges) || !Array.isArray(block.inline_style_ranges))
      throw new Error(`X rich Article block ${index + 1} left the reviewed shape`);
    const blockText = block.text;
    blockKeys.add(block.key);
    characters += blockText.length;
    if (characters > 20000)
      throw new Error("X rich Article text exceeds 20000 characters");
    const entityRanges = block.entity_ranges.map((range, rangeIndex) => exactArticleRange(range, `X rich Article block ${index + 1}.entity_ranges[${rangeIndex}]`, blockText.length));
    block.inline_style_ranges.forEach((range, rangeIndex) => {
      exactArticleRange(range, `X rich Article block ${index + 1}.inline_style_ranges[${rangeIndex}]`, blockText.length);
    });
    let previousEnd = 0;
    for (const range of entityRanges) {
      if (range.offset < previousEnd)
        throw new Error("X rich Article entity ranges may not overlap");
      previousEnd = range.offset + range.length;
      const key = range.key;
      const kind = entityKinds[key];
      if (kind === undefined)
        throw new Error("X rich Article entity range referenced an unknown entity");
      references[key] = (references[key] ?? 0) + 1;
      if (block.type === "atomic" ? kind !== "MEDIA" : kind !== "LINK") {
        throw new Error("X rich Article entity range used the wrong block kind");
      }
    }
    if (block.type === "atomic") {
      if (blockText !== " " || entityRanges.length !== 1 || entityRanges[0]?.offset !== 0 || entityRanges[0]?.length !== 1 || block.inline_style_ranges.length !== 0)
        throw new Error("X rich Article atomic image blocks must bind one media entity");
    }
  }
  if (references.some((count) => count !== 1)) {
    throw new Error("X rich Article entities must each be referenced exactly once");
  }
}
function validateRichArticleCreateVariables(variables) {
  exactMutationKeys(variables, ["content_state", "title"], "X articles.create variables");
  if (typeof variables.title !== "string" || variables.title.length < 1 || variables.title.length > 100 || /[\0\r\n]/u.test(variables.title))
    throw new Error("X articles.create title must be one bounded line");
  validateXWebRichArticleContentState(variables.content_state);
}
function validateRichArticleUpdateVariables(operationId, variables) {
  if (operationId === "articles.title") {
    exactMutationKeys(variables, ["articleEntityId", "title"], "X articles.title variables");
    exactMutationPostId(variables.articleEntityId, "X articles.title draft");
    if (typeof variables.title !== "string" || variables.title.length < 1 || variables.title.length > 100 || /[\0\r\n]/u.test(variables.title))
      throw new Error("X articles.title title must be one bounded line");
    return;
  }
  if (operationId === "articles.content") {
    exactMutationKeys(variables, ["content_state", "article_entity"], "X articles.content variables");
    exactMutationPostId(variables.article_entity, "X articles.content draft");
    validateXWebRichArticleContentState(variables.content_state);
    return;
  }
  throw new Error("X rich Article update operation is outside the reviewed title/content contract");
}
function authorizeXWebMutationRequest(operationId, input) {
  const expectedName = mutationOperationNames[operationId];
  if (expectedName === undefined)
    throw new Error("X mutation operation is not allowlisted");
  const binding = assertExactXWebGraphQlBinding(input);
  if (binding.operationType !== "mutation" || binding.operationName !== expectedName || binding.method !== "POST") {
    throw new Error(`${operationId} did not bind its reviewed X mutation operation`);
  }
  const body = bodyRecord(input.body);
  const descriptor = parseBundleQueryDescriptor(input.descriptor, `X ${operationId} descriptor`);
  exactMutationKeys(body, ["variables", "features", "queryId", ...descriptor.metadata.fieldToggles.length === 0 ? [] : ["fieldToggles"]], `X ${operationId} body`);
  if (body.queryId !== binding.queryId)
    throw new Error(`X ${operationId} body queryId drifted`);
  const variables = record(body.variables, `X ${operationId} variables`);
  if (expectedName === "CreateTweet")
    validateCreateTweetVariables(operationId, variables);
  else if (operationId === "articles.create")
    validateRichArticleCreateVariables(variables);
  else if (operationId === "articles.title" || operationId === "articles.content") {
    validateRichArticleUpdateVariables(operationId, variables);
  } else
    validateDesiredStateVariables(operationId, variables);
  exactBooleanMap(body.features, descriptor.metadata.featureSwitches, `X ${operationId} features`);
  if (descriptor.metadata.fieldToggles.length > 0) {
    exactBooleanMap(body.fieldToggles, descriptor.metadata.fieldToggles, `X ${operationId} fieldToggles`);
  }
  return binding;
}
function responseData(value, label) {
  const body = record(value, label);
  if (body.errors !== undefined) {
    if (!Array.isArray(body.errors))
      throw new Error(`${label}.errors must be an array`);
    if (body.errors.length > 0)
      throw new Error(`${label} contained provider errors`);
  }
  return record(body.data, `${label}.data`);
}
function normalizeXWebProfileHandle(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_]{1,15}$/u.test(value)) {
    throw new Error("X profile handle must contain 1-15 letters, digits, or underscores");
  }
  return value.toLowerCase();
}
function xProfileText(value, label, maximum, optional = false) {
  if (value === undefined || value === null || optional && value === "")
    return null;
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || hasAsciiControl(value))
    throw new Error(`${label} must be bounded public text`);
  return value;
}
function xProfileCount(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be an exact nonnegative safe integer`);
  }
  return Object.freeze({
    status: "available",
    value,
    precision: "exact",
    unit: "count"
  });
}
function xProfileBio(value) {
  if (value === undefined || value === null || value === "")
    return null;
  if (typeof value !== "string" || value.length > 1e4 || /[\0-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(value))
    throw new Error("X profile description must be bounded public text");
  return value;
}
function xProfileWebsite(legacy) {
  if (legacy.entities === undefined || legacy.entities === null)
    return null;
  const entities = record(legacy.entities, "X profile legacy.entities");
  if (entities.url === undefined || entities.url === null)
    return null;
  const urlEntity = record(entities.url, "X profile legacy.entities.url");
  if (!Array.isArray(urlEntity.urls) || urlEntity.urls.length > 10) {
    throw new Error("X profile website URL projection exceeded its reviewed bound");
  }
  const expanded = urlEntity.urls.map((item, index) => {
    const url = record(item, `X profile website URL ${index + 1}`);
    return xProfileText(url.expanded_url, `X profile website URL ${index + 1}`, 2048);
  });
  const unique = [...new Set(expanded.filter((value) => value !== null))];
  if (unique.length === 0)
    return null;
  if (unique.length !== 1)
    throw new Error("X profile exposed ambiguous website URLs");
  const parsed = new URL(unique[0]);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:" || parsed.username !== "" || parsed.password !== "")
    throw new Error("X profile website URL is not a safe public HTTP URL");
  return parsed.href;
}
function xProfileModernWebsite(value) {
  if (value === undefined || value === null)
    return null;
  const website = record(value, "X profile website");
  const rawUrl = xProfileText(website.url, "X profile website URL", 2048, true);
  if (rawUrl === null)
    return null;
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:" || parsed.username !== "" || parsed.password !== "")
    throw new Error("X profile website URL is not a safe public HTTP URL");
  return parsed.href;
}
function xProfileObservationTime(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || !Number.isFinite(Date.parse(value)))
    throw new Error("X profile observedAt must be an exact UTC timestamp");
  return value;
}

class XProfileTargetUnavailableError extends Error {
  constructor() {
    super("X profile target is unavailable");
    this.name = "XProfileTargetUnavailableError";
  }
}
function projectXWebProfileStats(response, expectedHandleValue, observedAt) {
  const expectedHandle = normalizeXWebProfileHandle(expectedHandleValue);
  const result = record(extractXWebGraphQlReadResponseRoot("profiles.by-handle", response), "X profile response result");
  if (result.__typename === "UserUnavailable") {
    throw new XProfileTargetUnavailableError;
  }
  if (result.__typename !== "User") {
    throw new Error("X profile response contained an unreviewed result typename");
  }
  const id = xProfileText(result.rest_id, "X profile rest_id", 19);
  if (id === null || !/^[0-9]{1,19}$/u.test(id)) {
    throw new Error("X profile rest_id must be an exact 1-19 digit identifier");
  }
  const core = record(result.core, "X profile core");
  const handle = normalizeXWebProfileHandle(core.screen_name);
  if (handle !== expectedHandle) {
    throw new Error("X profile response did not bind the requested handle");
  }
  const displayName = xProfileText(core.name, "X profile display name", 1000);
  if (displayName === null)
    throw new Error("X profile display name is unavailable");
  let followerValue;
  let followingValue;
  let bio;
  let websiteUrl;
  if (isRecord(result.legacy)) {
    const legacy = result.legacy;
    if (legacy.screen_name !== undefined && normalizeXWebProfileHandle(legacy.screen_name) !== expectedHandle)
      throw new Error("X profile legacy response changed the requested handle");
    followerValue = legacy.followers_count;
    followingValue = legacy.friends_count;
    bio = xProfileBio(legacy.description);
    websiteUrl = xProfileWebsite(legacy);
  } else {
    const relationships = record(result.relationship_counts, "X profile relationship_counts");
    const profileBio = result.profile_bio === undefined || result.profile_bio === null ? null : record(result.profile_bio, "X profile profile_bio");
    followerValue = relationships.followers;
    followingValue = relationships.following;
    if (profileBio !== null && typeof profileBio.description !== "string" && profileBio.description !== null && profileBio.description !== undefined) {
      throw new Error(`X profile description changed shape; fields: ${isRecord(profileBio.description) ? Object.keys(profileBio.description).sort().join(",") : typeof profileBio.description}`);
    }
    bio = profileBio === null ? null : xProfileBio(profileBio.description);
    websiteUrl = xProfileModernWebsite(result.website);
  }
  return Object.freeze({
    schemaVersion: 1,
    provider: "x",
    target: Object.freeze({
      kind: "profile",
      id,
      url: `https://x.com/${handle}`
    }),
    observedAt: xProfileObservationTime(observedAt),
    completeness: "complete",
    metrics: Object.freeze({
      followers: xProfileCount(followerValue, "X profile followers"),
      following: xProfileCount(followingValue, "X profile following")
    }),
    metadata: Object.freeze({
      handle,
      displayName,
      bio,
      websiteUrl
    })
  });
}
var X_USER_SNOWFLAKE = /^[0-9]{1,19}$/u;
var X_USER_RELAY = /^User:([0-9]{1,19})$/u;
var X_USER_RELAY_BASE64 = /^[A-Za-z0-9+/]+=*$/u;
function decodeXWebUserRelayId(value) {
  const raw = X_USER_RELAY.exec(value);
  if (raw)
    return raw[1];
  if (!X_USER_RELAY_BASE64.test(value) || value.length > 64)
    return null;
  const decoded = Buffer.from(value, "base64").toString("utf8");
  return X_USER_RELAY.exec(decoded)?.[1] ?? null;
}
function xWebUserIdentity(value, label) {
  if (value === undefined || value === null)
    return null;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`${label} must be a 1-19 digit X identifier`);
    }
    return String(value);
  }
  if (typeof value !== "string" || value.length < 1 || value.length > 64 || /[\0\r]/u.test(value)) {
    throw new Error(`${label} must be a bounded string`);
  }
  if (X_USER_SNOWFLAKE.test(value))
    return value;
  return decodeXWebUserRelayId(value);
}
function unwrapXWebUserResult(value, label) {
  let result = record(value, label);
  for (let depth = 0;depth < 3; depth += 1) {
    const typename = result.__typename;
    if (typename === "UserUnavailable") {
      throw new Error("X user feed target is unavailable");
    }
    if (typename === undefined || typename === "User")
      return result;
    if (typename !== "UserWithVisibilityResults") {
      throw new Error("X user feed response contained an unreviewed result typename");
    }
    if (isRecord(result.user)) {
      result = record(result.user, `${label}.user`);
      continue;
    }
    if (isRecord(result.user_results)) {
      const userResults = record(result.user_results, `${label}.user_results`);
      result = record(userResults.result, `${label}.user_results.result`);
      continue;
    }
    throw new Error(`${label} omitted a nested User`);
  }
  throw new Error(`${label} nested User wrappers exceeded the reviewed bound`);
}
function collectXWebUserIdentities(user, result) {
  const returnedIds = new Set;
  const candidates = [
    [result.rest_id, "X user feed response rest_id"],
    [result.id, "X user feed response id"],
    [isRecord(result.legacy) ? result.legacy.id_str : undefined, "X user feed response legacy.id_str"],
    [isRecord(result.core) ? result.core.rest_id : undefined, "X user feed response core.rest_id"],
    [user.rest_id, "X user feed response.data.user rest_id"],
    [user.id, "X user feed response.data.user id"],
    [user.id_str, "X user feed response.data.user id_str"]
  ];
  for (const [value, label] of candidates) {
    const id = xWebUserIdentity(value, label);
    if (id !== null)
      returnedIds.add(id);
  }
  return returnedIds;
}
function userFeedTimelineContainer(result) {
  if (Object.hasOwn(result, "timeline") && result.timeline !== undefined && result.timeline !== null) {
    return record(result.timeline, "X user feed response.data.user.result.timeline");
  }
  if (Object.hasOwn(result, "timeline_v2") && result.timeline_v2 !== undefined && result.timeline_v2 !== null) {
    return record(result.timeline_v2, "X user feed response.data.user.result.timeline_v2");
  }
  return null;
}
function collectXWebUserTimelineAuthorIds(result) {
  const container = userFeedTimelineContainer(result);
  if (container === null || !Object.hasOwn(container, "timeline") || container.timeline === undefined || container.timeline === null) {
    return new Set;
  }
  const authorIds = new Set;
  for (const item of normalizeXWebUrtTimeline(container.timeline).items) {
    if (item.kind !== "tweet" || item.author.id === null)
      continue;
    authorIds.add(item.author.id);
  }
  return authorIds;
}
function assertXWebUserFeedTargetBound(response, expectedUserId) {
  const expected = exactTweetId(expectedUserId, "input.user_id");
  const data = responseData(response, "X user feed response");
  const user = record(data.user, "X user feed response.data.user");
  const result = unwrapXWebUserResult(user.result, "X user feed response.data.user.result");
  const nodeIds = collectXWebUserIdentities(user, result);
  const authorIds = collectXWebUserTimelineAuthorIds(result);
  const returnedIds = new Set([...nodeIds, ...authorIds]);
  if (returnedIds.size === 0) {
    throw new Error("X user feed response omitted a bindable user rest_id");
  }
  if (returnedIds.size !== 1 || !returnedIds.has(expected)) {
    throw new Error("X user feed response did not bind the requested user");
  }
}
function userFeedRootSegment(operationId, parent, segment, root) {
  if (operationId === "feeds.user" && segment === "timeline" && !Object.hasOwn(parent, "timeline") && Object.hasOwn(parent, "timeline_v2")) {
    return parent.timeline_v2;
  }
  if (!Object.hasOwn(parent, segment) || parent[segment] === null || parent[segment] === undefined) {
    throw new Error(`X ${operationId} response omitted reviewed root ${root.join(".")}`);
  }
  const next = parent[segment];
  if (operationId === "feeds.user" && segment === "result") {
    return unwrapXWebUserResult(next, "X user feed response.data.user.result");
  }
  return next;
}
function extractXWebGraphQlReadResponseRoot(operationId, response) {
  const definition = xWebSemanticOperationRegistry[operationId];
  if (definition.transport !== "graphql-query" || definition.risk !== "R1") {
    throw new Error(`${operationId} is not an X GraphQL read response contract`);
  }
  let current = responseData(response, `X ${operationId} response`);
  for (const [index, segment] of definition.responseRoot.entries()) {
    const parent = record(current, `X ${operationId} response root ${definition.responseRoot.slice(0, index).join(".") || "data"}`);
    current = userFeedRootSegment(operationId, parent, segment, definition.responseRoot);
  }
  return current;
}
function normalizeXWebGraphQlTimelineResponse(operationId, response) {
  const definition = xWebSemanticOperationRegistry[operationId];
  if (definition.transport !== "graphql-query" || definition.semanticOperation !== "feeds.read" && operationId !== "posts.detail") {
    throw new Error(`${operationId} is not an X URT timeline response contract`);
  }
  return normalizeXWebUrtTimeline(extractXWebGraphQlReadResponseRoot(operationId, response));
}
var xWebLegacyDmInboxMapping = Object.freeze({
  primary: Object.freeze({
    providerClass: "PRIMARY",
    route: "/messages",
    stateKey: "dmInbox",
    cursorSelector: "selectInboxCursor",
    fetchAction: "fetchTrustedInboxHistory",
    uiMayUpdateLastSeen: true
  }),
  requests: Object.freeze({
    providerClass: "SECONDARY",
    route: "/messages/requests",
    stateKey: "dmUntrustedInbox",
    cursorSelector: "selectUntrustedCursor",
    fetchAction: "fetchUntrustedInboxHistory",
    uiMayUpdateLastSeen: true
  }),
  additional: Object.freeze({
    providerClass: "TERTIARY",
    route: "/messages/requests/additional",
    stateKey: "dmLowQualityUntrustedInbox",
    cursorSelector: "selectUntrustedLowQualityCursor",
    fetchAction: "fetchUntrustedLowQualityInboxHistory",
    uiMayUpdateLastSeen: false
  })
});
var legacyDmStaticPaths = Object.freeze({
  "/i/api/1.1/dm/inbox_initial_state.json": Object.freeze(["primary"]),
  "/i/api/1.1/dm/inbox_timeline/trusted.json": Object.freeze(["primary"]),
  "/i/api/1.1/dm/inbox_timeline/untrusted.json": Object.freeze(["requests"]),
  "/i/api/1.1/dm/inbox_timeline/untrusted_low_quality.json": Object.freeze(["additional"])
});
var xWebLegacyDmReadQueryParameterNames = Object.freeze([
  "cards_platform",
  "context",
  "count",
  "cursor",
  "dm_users",
  "ext",
  "filter_low_quality",
  "include_blocked_by",
  "include_blocking",
  "include_can_dm",
  "include_can_media_tag",
  "include_cards",
  "include_conversation_info",
  "include_entities",
  "include_ext_alt_text",
  "include_ext_has_nft_avatar",
  "include_ext_is_blue_verified",
  "include_ext_limited_action_results",
  "include_ext_media_availability",
  "include_ext_media_color",
  "include_ext_profile_image_shape",
  "include_ext_sensitive_media_warning",
  "include_ext_trusted_friends_metadata",
  "include_ext_verified_type",
  "include_ext_views",
  "include_followed_by",
  "include_groups",
  "include_inbox_timelines",
  "include_mute_edge",
  "include_profile_interstitial_type",
  "include_quality",
  "include_quote_count",
  "include_reply_count",
  "include_want_retweets",
  "max_id",
  "min_entry_id",
  "requestContext",
  "send_error_codes",
  "simple_quoted_tweet",
  "skip_status",
  "tweet_mode"
]);
var legacyDmQueryParameterSet = new Set(xWebLegacyDmReadQueryParameterNames);
var forbiddenLegacyDmParameters = new Set([
  "accept",
  "accepted",
  "last_seen_event_id",
  "lastseeneventid",
  "mark_read",
  "markread",
  "poll",
  "update_last_seen",
  "watch"
]);
function optionalString(value, key) {
  const candidate = value[key];
  if (candidate === undefined || candidate === null)
    return null;
  if (typeof candidate !== "string")
    throw new Error(`X URT ${key} must be a string`);
  return candidate;
}
function timelineEntry(value, label) {
  const entry = record(value, label);
  const entryId = requiredString(entry, "entryId", label);
  if (entryId.length > 512 || hasAsciiControl(entryId))
    throw new Error(`${label}.entryId is invalid`);
  record(entry.content, `${label}.content`);
  return entry;
}
function exactTweetId(value, label) {
  if (typeof value !== "string" || !/^[0-9]{1,19}$/u.test(value)) {
    throw new Error(`${label} must be an exact 1-19 digit identifier`);
  }
  return value;
}
function optionalTweetId(value, label) {
  if (value === undefined || value === null)
    return null;
  return exactTweetId(value, label);
}
function optionalAuthorName(value, label) {
  if (value === undefined || value === null)
    return null;
  if (typeof value !== "string" || value.length < 1 || value.length > 1000 || hasAsciiControl(value)) {
    throw new Error(`${label} must be bounded public text`);
  }
  return value;
}
function optionalAuthorHandle(value, label) {
  if (value === undefined || value === null)
    return null;
  try {
    return normalizeXWebProfileHandle(value);
  } catch {
    throw new Error(`${label} must be a valid X handle`);
  }
}
function projectXWebTweetAuthor(tweet, legacy, label) {
  const legacyId = legacy === null ? null : optionalTweetId(legacy.user_id_str, `${label}.legacy.user_id_str`);
  if (tweet.core === undefined || tweet.core === null) {
    return Object.freeze({ id: legacyId, username: null, name: null });
  }
  const core = record(tweet.core, `${label}.core`);
  if (core.user_results === undefined || core.user_results === null) {
    return Object.freeze({ id: legacyId, username: null, name: null });
  }
  const userResults = record(core.user_results, `${label}.core.user_results`);
  if (userResults.result === undefined || userResults.result === null) {
    return Object.freeze({ id: legacyId, username: null, name: null });
  }
  const user = record(userResults.result, `${label}.core.user_results.result`);
  const typename = typeof user.__typename === "string" ? user.__typename : null;
  if (typename === "UserUnavailable") {
    return Object.freeze({ id: legacyId, username: null, name: null });
  }
  if (typename !== null && typename !== "User") {
    throw new Error(`${label} author had an unreviewed typename`);
  }
  const userId = optionalTweetId(user.rest_id, `${label} author rest_id`);
  if (legacyId !== null && userId !== null && legacyId !== userId) {
    throw new Error(`${label} author id disagreed with tweet legacy.user_id_str`);
  }
  const userCore = user.core === undefined || user.core === null ? null : record(user.core, `${label} author core`);
  const userLegacy = user.legacy === undefined || user.legacy === null ? null : record(user.legacy, `${label} author legacy`);
  const coreHandle = userCore === null ? null : optionalAuthorHandle(userCore.screen_name, `${label} author core.screen_name`);
  const legacyHandle = userLegacy === null ? null : optionalAuthorHandle(userLegacy.screen_name, `${label} author legacy.screen_name`);
  if (coreHandle !== null && legacyHandle !== null && coreHandle !== legacyHandle) {
    throw new Error(`${label} author handle disagreed across core and legacy`);
  }
  const coreName = userCore === null ? null : optionalAuthorName(userCore.name, `${label} author core.name`);
  const legacyName = userLegacy === null ? null : optionalAuthorName(userLegacy.name, `${label} author legacy.name`);
  if (coreName !== null && legacyName !== null && coreName !== legacyName) {
    throw new Error(`${label} author name disagreed across core and legacy`);
  }
  return Object.freeze({
    id: userId ?? legacyId,
    username: coreHandle ?? legacyHandle,
    name: coreName ?? legacyName
  });
}
function unwrapTweetResult(value, label) {
  const typename = requiredString(value, "__typename", label);
  if (typename === "Tweet")
    return { result: value, typename, reason: null };
  if (typename === "TweetWithVisibilityResults" || typename === "TweetPreviewDisplay") {
    const nested = value.tweet;
    if (isRecord(nested))
      return { result: nested, typename, reason: null };
    const nestedResults = isRecord(value.tweet_results) ? value.tweet_results.result : undefined;
    if (isRecord(nestedResults))
      return { result: nestedResults, typename, reason: null };
    throw new Error(`X URT ${typename} omitted its nested tweet`);
  }
  const reason = typeof value.reason === "string" ? value.reason : isRecord(value.tombstone) && typeof value.tombstone.text === "string" ? value.tombstone.text : null;
  return { result: null, typename, reason };
}
function normalizeItemContent(itemValue, entryId, moduleEntryId, sortIndex) {
  const item = record(itemValue, `X URT item ${entryId}`);
  const itemType = requiredString(item, "itemType", `X URT item ${entryId}`);
  if (itemType !== "TimelineTweet") {
    return Object.freeze({ kind: "other", entryId, moduleEntryId, sortIndex, itemType });
  }
  const tweetResults = record(item.tweet_results, `X URT tweet ${entryId}.tweet_results`);
  const resultValue = tweetResults.result;
  if (resultValue === null || resultValue === undefined) {
    return Object.freeze({
      kind: "unavailable",
      entryId,
      moduleEntryId,
      sortIndex,
      typename: "MissingTweetResult",
      reason: null
    });
  }
  const result = record(resultValue, `X URT tweet ${entryId}.tweet_results.result`);
  const unwrapped = unwrapTweetResult(result, `X URT tweet ${entryId}`);
  if (unwrapped.result === null) {
    return Object.freeze({
      kind: "unavailable",
      entryId,
      moduleEntryId,
      sortIndex,
      typename: unwrapped.typename,
      reason: unwrapped.reason
    });
  }
  const tweetId = exactTweetId(unwrapped.result.rest_id, `X URT tweet ${entryId}.rest_id`);
  const legacy = unwrapped.result.legacy === undefined || unwrapped.result.legacy === null ? null : Object.freeze(record(unwrapped.result.legacy, `X URT tweet ${entryId}.legacy`));
  return Object.freeze({
    kind: "tweet",
    entryId,
    moduleEntryId,
    sortIndex,
    tweetId,
    typename: unwrapped.typename,
    legacy,
    author: projectXWebTweetAuthor(unwrapped.result, legacy, `X URT tweet ${entryId}`)
  });
}
function uniqueDirectionalCursor(cursors, type) {
  const matching = cursors.filter((cursor) => cursor.cursorType === type);
  if (matching.length === 0)
    return null;
  const values = new Set(matching.map((cursor) => cursor.value));
  if (matching.length > 1 || values.size > 1) {
    throw new Error(`X URT timeline contained ambiguous ${type.toLowerCase()} cursors`);
  }
  return matching[0];
}
function normalizeXWebUrtTimeline(value) {
  const timeline = record(value, "X URT timeline");
  if (!Array.isArray(timeline.instructions))
    throw new Error("X URT timeline.instructions must be an array");
  const entries = new Map;
  const terminatedDirections = [];
  for (const [instructionIndex, instructionValue] of timeline.instructions.entries()) {
    const label = `X URT instruction ${instructionIndex + 1}`;
    const instruction = record(instructionValue, label);
    const type = requiredString(instruction, "type", label);
    if (type === "TimelineAddEntries") {
      if (!Array.isArray(instruction.entries))
        throw new Error(`${label}.entries must be an array`);
      for (const [entryIndex, entryValue] of instruction.entries.entries()) {
        const entry = timelineEntry(entryValue, `${label}.entries[${entryIndex}]`);
        entries.set(requiredString(entry, "entryId", label), entry);
      }
    } else if (type === "TimelineReplaceEntry" || type === "TimelinePinEntry") {
      const entry = timelineEntry(instruction.entry, `${label}.entry`);
      const replacementId = optionalString(instruction, "entryIdToReplace");
      if (replacementId !== null && replacementId !== entry.entryId)
        entries.delete(replacementId);
      entries.set(requiredString(entry, "entryId", label), entry);
    } else if (type === "TimelineRemoveEntries") {
      if (!Array.isArray(instruction.entryIds) || !instruction.entryIds.every((id) => typeof id === "string")) {
        throw new Error(`${label}.entryIds must be a string array`);
      }
      for (const entryId of instruction.entryIds)
        entries.delete(entryId);
    } else if (type === "TimelineClearCache") {
      entries.clear();
    } else if (type === "TimelineTerminateTimeline") {
      const direction = requiredString(instruction, "direction", label);
      if (!terminatedDirections.includes(direction))
        terminatedDirections.push(direction);
    } else {
      throw new Error(`X URT instruction type ${type} is not reviewed`);
    }
  }
  const items = [];
  const cursors = [];
  for (const entry of entries.values()) {
    const entryId = requiredString(entry, "entryId", "X URT entry");
    const sortIndex = optionalString(entry, "sortIndex");
    const content = record(entry.content, `X URT entry ${entryId}.content`);
    const entryType = requiredString(content, "entryType", `X URT entry ${entryId}.content`);
    if (entryType === "TimelineTimelineCursor") {
      const cursorType = requiredString(content, "cursorType", `X URT cursor ${entryId}`);
      const cursorValue = requiredString(content, "value", `X URT cursor ${entryId}`);
      if (cursorValue.length > 16384 || hasAsciiControl(cursorValue)) {
        throw new Error(`X URT cursor ${entryId} had an invalid value`);
      }
      cursors.push(Object.freeze({ entryId, cursorType, value: cursorValue }));
    } else if (entryType === "TimelineTimelineItem") {
      items.push(normalizeItemContent(content.itemContent, entryId, null, sortIndex));
    } else if (entryType === "TimelineTimelineModule") {
      if (!Array.isArray(content.items))
        throw new Error(`X URT module ${entryId}.items must be an array`);
      for (const [moduleIndex, moduleItemValue] of content.items.entries()) {
        const moduleItem = record(moduleItemValue, `X URT module ${entryId}.items[${moduleIndex}]`);
        const moduleItemId = requiredString(moduleItem, "entryId", `X URT module ${entryId}.items[${moduleIndex}]`);
        const itemContainer = record(moduleItem.item, `X URT module item ${moduleItemId}.item`);
        items.push(normalizeItemContent(itemContainer.itemContent, moduleItemId, entryId, sortIndex));
      }
    } else {
      throw new Error(`X URT entry type ${entryType} is not reviewed`);
    }
  }
  const deduplicated = [];
  const seenTweetIds = new Set;
  const duplicateTweetIds = [];
  for (const item of items) {
    if (item.kind !== "tweet") {
      deduplicated.push(item);
      continue;
    }
    if (seenTweetIds.has(item.tweetId)) {
      if (!duplicateTweetIds.includes(item.tweetId))
        duplicateTweetIds.push(item.tweetId);
      continue;
    }
    seenTweetIds.add(item.tweetId);
    deduplicated.push(item);
  }
  const top = uniqueDirectionalCursor(cursors, "Top");
  const bottom = uniqueDirectionalCursor(cursors, "Bottom");
  return Object.freeze({
    items: Object.freeze(deduplicated),
    cursors: Object.freeze({
      top,
      bottom,
      other: Object.freeze(cursors.filter((cursor) => cursor.cursorType !== "Top" && cursor.cursorType !== "Bottom"))
    }),
    duplicateTweetIds: Object.freeze(duplicateTweetIds),
    terminatedDirections: Object.freeze(terminatedDirections),
    finalEntryCount: entries.size
  });
}
var X_STATUS_ORIGIN = "https://x.com";
var X_BOOKMARK_EXPORT_RECORD_KEYS = Object.freeze([
  "post_id",
  "url",
  "author_username",
  "author_name",
  "text",
  "created_at",
  "folder_id",
  "bookmarked_at"
]);
var X_BOOKMARK_EXPORT_PAGE_KEYS = Object.freeze([
  "feed",
  "items",
  "posts",
  "cursor",
  "terminatedDirections"
]);
var X_FEED_POST_KEYS = Object.freeze([
  "kind",
  "id",
  "text",
  "createdAt",
  "authorId",
  "authorUsername",
  "authorName",
  "replyToPostId",
  "liked",
  "reposted",
  "saved",
  "metrics",
  "url"
]);
function hasForbiddenPublicTextControl(value) {
  for (let index = 0;index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 9 || code === 10 || code === 13)
      continue;
    if (code <= 31 || code === 127)
      return true;
  }
  return false;
}
function requireBoundedPublicText(value, label, maximum) {
  if (typeof value !== "string" || value.length > maximum || hasForbiddenPublicTextControl(value)) {
    throw new Error(`${label} must be bounded public text`);
  }
  return value;
}
function optionalBoundedText(value, label, maximum) {
  if (value === undefined || value === null)
    return null;
  if (typeof value !== "string" || value.length > maximum || hasAsciiControl(value)) {
    throw new Error(`${label} must be bounded public text`);
  }
  return value;
}
function optionalBoolean(value, label) {
  if (value === undefined || value === null)
    return null;
  if (typeof value !== "boolean")
    throw new Error(`${label} must be a boolean`);
  return value;
}
function optionalMetric(value, label) {
  if (value === undefined || value === null)
    return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be an exact nonnegative safe integer`);
  }
  return value;
}
function xWebStatusUrl(postId) {
  return `${X_STATUS_ORIGIN}/i/status/${postId}`;
}
function boundXWebProviderPage(items, limit, continuationAvailable, label) {
  if (items.length <= limit)
    return { items, truncated: false };
  if (!continuationAvailable) {
    throw new Error(`${label} returned more entries than the requested limit; no continuation cursor was exposed`);
  }
  return { items: items.slice(0, limit), truncated: true };
}
function projectXWebFeedPost(item) {
  if (item.kind !== "tweet")
    return null;
  const legacy = item.legacy;
  const createdAt = optionalBoundedText(legacy?.created_at, "X post createdAt", 128);
  const text = typeof legacy?.full_text === "string" ? requireBoundedPublicText(legacy.full_text, "X post text", 32768) : "";
  return Object.freeze({
    kind: "post",
    id: item.tweetId,
    text,
    createdAt,
    authorId: item.author.id,
    authorUsername: item.author.username,
    authorName: item.author.name,
    replyToPostId: optionalTweetId(legacy?.in_reply_to_status_id_str, "X post replyToPostId"),
    liked: optionalBoolean(legacy?.favorited, "X post liked"),
    reposted: optionalBoolean(legacy?.retweeted, "X post reposted"),
    saved: optionalBoolean(legacy?.bookmarked, "X post saved"),
    metrics: Object.freeze({
      replies: optionalMetric(legacy?.reply_count, "X post reply_count"),
      reposts: optionalMetric(legacy?.retweet_count, "X post retweet_count"),
      likes: optionalMetric(legacy?.favorite_count, "X post favorite_count"),
      bookmarks: optionalMetric(legacy?.bookmark_count, "X post bookmark_count")
    }),
    url: xWebStatusUrl(item.tweetId)
  });
}
function projectXWebBookmarkExportRecord(post) {
  return Object.freeze({
    post_id: post.id,
    url: post.url,
    author_username: post.authorUsername,
    author_name: post.authorName,
    text: post.text,
    created_at: post.createdAt,
    folder_id: null,
    bookmarked_at: null
  });
}
function projectXWebFeedPage(operationId, response, limit) {
  const normalized = normalizeXWebGraphQlTimelineResponse(operationId, response);
  const posts = normalized.items.map(projectXWebFeedPost).filter((row) => row !== null);
  const page = boundXWebProviderPage(posts, limit, normalized.cursors.bottom !== null, "X feed page");
  return Object.freeze({
    posts: Object.freeze(page.items),
    cursor: page.truncated ? null : normalized.cursors.bottom?.value ?? null,
    terminatedDirections: normalized.terminatedDirections
  });
}
function projectXWebBookmarkExportPage(response, limit) {
  const page = projectXWebFeedPage("feeds.bookmarks", response, limit);
  return Object.freeze({
    feed: "bookmarks",
    items: Object.freeze(page.posts.map(projectXWebBookmarkExportRecord)),
    posts: page.posts,
    cursor: page.cursor,
    terminatedDirections: page.terminatedDirections
  });
}
function exactPostId(value) {
  if (!/^[0-9]{1,19}$/u.test(value))
    throw new Error("X desired-state target must be an exact post ID");
  return value;
}
function graphQlData(response) {
  return responseData(response, "X mutation response");
}
function optionalPostIdentity(result) {
  if (typeof result.rest_id === "string")
    return exactPostId(result.rest_id);
  if (isRecord(result.legacy) && typeof result.legacy.id_str === "string")
    return exactPostId(result.legacy.id_str);
  return null;
}
function nestedRetweetTarget(result) {
  const candidates = [
    result.retweeted_status_result,
    isRecord(result.legacy) ? result.legacy.retweeted_status_result : undefined
  ];
  for (const candidate of candidates) {
    if (!isRecord(candidate) || !isRecord(candidate.result))
      continue;
    const identity = optionalPostIdentity(candidate.result);
    if (identity !== null)
      return identity;
  }
  return null;
}
function validateXWebDesiredStateMutation(input) {
  const targetPostId = exactPostId(input.targetPostId);
  const data = graphQlData(input.response);
  if (input.kind === "like") {
    const key = input.enabled ? "favorite_tweet" : "unfavorite_tweet";
    if (data[key] !== "Done")
      throw new Error(`X ${input.enabled ? "like" : "unlike"} response omitted the exact Done marker`);
    return Object.freeze({ kind: input.kind, enabled: input.enabled, targetPostId, providerResultId: null, requiresReadback: true });
  }
  if (input.kind === "bookmark") {
    const key = input.enabled ? "tweet_bookmark_put" : "tweet_bookmark_delete";
    if (data[key] !== "Done")
      throw new Error(`X ${input.enabled ? "bookmark" : "unbookmark"} response omitted the exact Done marker`);
    return Object.freeze({ kind: input.kind, enabled: input.enabled, targetPostId, providerResultId: null, requiresReadback: true });
  }
  if (input.kind !== "repost")
    throw new Error("X desired-state kind is not reviewed");
  if (input.enabled) {
    const create = record(data.create_retweet, "X repost response.create_retweet");
    const results = record(create.retweet_results, "X repost response.retweet_results");
    const result2 = record(results.result, "X repost response.result");
    const resultId = optionalPostIdentity(result2);
    if (resultId === null)
      throw new Error("X repost response omitted the created repost ID");
    const returnedTarget2 = nestedRetweetTarget(result2);
    if (returnedTarget2 !== null && returnedTarget2 !== targetPostId) {
      throw new Error("X repost response targeted a different post");
    }
    return Object.freeze({
      kind: input.kind,
      enabled: true,
      targetPostId,
      providerResultId: resultId,
      requiresReadback: returnedTarget2 === null
    });
  }
  const unretweet = record(data.unretweet, "X unrepost response.unretweet");
  const sourceResults = record(unretweet.source_tweet_results, "X unrepost response.source_tweet_results");
  const result = record(sourceResults.result, "X unrepost response.result");
  const returnedTarget = optionalPostIdentity(result);
  if (returnedTarget === null)
    throw new Error("X unrepost response omitted the source post ID");
  if (returnedTarget !== targetPostId)
    throw new Error("X unrepost response targeted a different post");
  return Object.freeze({
    kind: input.kind,
    enabled: false,
    targetPostId,
    providerResultId: null,
    requiresReadback: false
  });
}

// src/providers/x-web-runtime.ts
var X_ORIGIN2 = "https://x.com";
var X_UPLOAD_ORIGIN = "https://upload.x.com";
var X_ASSET_ORIGIN2 = "https://abs.twimg.com";
var X_DEFAULT_ARTICLE_UPLOAD_ORIGIN = "https://upload.x.com";
var X_ARTICLE_UPLOAD_HOSTS = new Set(["upload.x.com", "upload-a.x.com", "upload-b.x.com"]);
var MAX_HOME_BYTES = 2 * 1024 * 1024;
var MAX_BUNDLE_BYTES = 16 * 1024 * 1024;
var DEFAULT_LIMIT = 20;
var MAX_ARTICLE_TITLE_CHARACTERS = 100;
var MAX_ARTICLE_BODY_CHARACTERS = 20000;
var MAX_ARTICLE_BLOCKS = 2000;
var MAX_ARTICLE_IMAGE_BYTES = 5 * 1024 * 1024;
var MAX_ARTICLE_INLINE_IMAGES = 20;
var MAX_ARTICLE_MEDIA_RESPONSE_BYTES = 2 * 1024 * 1024;
var MAX_X_IMAGE_BYTES = 20 * 1024 * 1024;
var MAX_X_VIDEO_BYTES = 512 * 1024 * 1024;
var X_UPLOAD_CHUNK_BYTES = 5 * 1024 * 1024;
var MAX_X_IMAGE_UPLOAD_CHUNKS = 4;
var MAX_X_VIDEO_UPLOAD_CHUNKS = Math.ceil(MAX_X_VIDEO_BYTES / X_UPLOAD_CHUNK_BYTES);
var MAX_X_MEDIA_STATUS_POLLS = 100;
var MAX_X_MEDIA_STATUS_WAIT_MS = 8 * 60000;
var MAX_X_UPLOAD_RESPONSE_BYTES = 512 * 1024;
var PUBLISH_READBACK_DELAYS_MS = Object.freeze([0, 250, 750, 1500]);
var viewerEvidence = Object.freeze({
  operationName: "Viewer",
  operationType: "query",
  queryId: "9t128XgFic52jPUEkJMf6w",
  sourceChunk: "main.cd39a626fdb81748a.js",
  observedOn: "2026-09-09"
});
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function xProfileReadFailure(error, stage) {
  let deadlineCause = error;
  for (let depth = 0;depth < 8 && deadlineCause !== undefined; depth += 1) {
    if (deadlineCause instanceof OperationDeadlineError) {
      return deadlineCause.failure === "timed-out" ? readFailureProjection("operation-timeout") : readFailureProjection("contract-drift");
    }
    deadlineCause = deadlineCause instanceof Error ? deadlineCause.cause : undefined;
  }
  let current = error;
  for (let depth = 0;depth < 8 && current !== undefined; depth += 1) {
    const message = current instanceof Error ? current.message : "";
    if (message.includes("viewer no longer matches")) {
      return readFailureProjection("account-mismatch");
    }
    if (stage === "target" && current instanceof XProfileTargetUnavailableError) {
      return readFailureProjection("target-unavailable");
    }
    if (message.includes("ct0 session cookie is invalid or expired")) {
      return readFailureProjection("auth-repair-required");
    }
    const response = /status(?:\/content type)? (302|401|403|404|408|429|5[0-9]{2})(?:\/|$)/u.exec(message);
    if (response?.[1] === "401" || response?.[1] === "403") {
      return readFailureProjection("auth-repair-required");
    }
    if (response?.[1] === "404") {
      return readFailureProjection("contract-drift");
    }
    if (response?.[1] === "429") {
      return readFailureProjection("provider-throttled");
    }
    if (response?.[1] === "302" || response?.[1] === "408" || response?.[1]?.startsWith("5")) {
      return readFailureProjection("provider-temporary");
    }
    if (message.includes("failed before a reviewed response was received") || message === "authenticated web response body stream failed before completion" || message === "public first-party web asset request failed" || message.includes("Failed to fetch"))
      return readFailureProjection("provider-temporary");
    current = current instanceof Error ? current.cause : undefined;
  }
  return readFailureProjection("contract-drift");
}
function failedXProfileRead(error, finalUrl, stage) {
  return {
    status: "failed",
    output: null,
    finalUrl,
    dispatchStarted: false,
    dispatch: { planned: 0, started: 0, verified: 0 },
    error: "X profile read failed before the dispatch boundary",
    readFailure: xProfileReadFailure(error, stage)
  };
}
function xFeedReadAccountMismatch(error) {
  return error.message.includes("viewer no longer matches") || error.message.includes("personalized operations require an auth locator bound");
}
function xFeedReadAuthRepairRequired(error) {
  return error.message.includes("ct0 session cookie is invalid or expired");
}
function feedsReadFinalUrl(input) {
  try {
    return stringInput(input, "feed") === "bookmarks" ? `${X_ORIGIN2}/i/bookmarks` : `${X_ORIGIN2}/home`;
  } catch {
    return null;
  }
}
function failedXFeedRead(error, input, stage) {
  const projected = failedProviderRead("X feed", error, feedsReadFinalUrl(input), {
    stage,
    authenticated: true,
    accountMismatch: xFeedReadAccountMismatch,
    authRepairRequired: xFeedReadAuthRepairRequired
  });
  return {
    ...projected,
    error: error instanceof Error ? error.message : "X feed read failed before the dispatch boundary"
  };
}
function record2(value, label) {
  if (!isRecord2(value))
    throw new Error(`${label} must be an object`);
  return value;
}
function requiredString2(value, label, maximum = 32768) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || /[\0\r]/u.test(value)) {
    throw new Error(`${label} must be a bounded string`);
  }
  return value;
}
function optionalStringInput(input, name) {
  const value = input[name];
  if (value === undefined)
    return;
  return requiredString2(value, `input.${name}`);
}
function stringInput(input, name) {
  return requiredString2(input[name], `input.${name}`);
}
function threadTexts(input) {
  const value = input.items;
  if (!Array.isArray(value))
    throw new Error("input.items must be a string array");
  const texts = [];
  for (const item of value) {
    if (typeof item !== "string" || item.length === 0 || item.length > MAX_X_CREATE_TWEET_TEXT_LENGTH || /[\0\r]/u.test(item))
      throw new Error("input.items must be a string array");
    texts.push(item);
  }
  return texts;
}
function booleanInput(input, name) {
  const value = input[name];
  if (typeof value !== "boolean")
    throw new Error(`input.${name} must be boolean`);
  return value;
}
function buildXWebRichArticleContentState(document, uploadedImageIds = Object.freeze([])) {
  if (uploadedImageIds.length > MAX_ARTICLE_INLINE_IMAGES || uploadedImageIds.some((id) => !/^[0-9]{1,19}$/u.test(id)))
    throw new Error("X rich Article image uploads must be exact media IDs");
  const entities = [];
  const blocks = [];
  const usedImages = new Set;
  const blockType = Object.freeze({
    paragraph: "unstyled",
    heading1: "header-one",
    heading2: "header-two",
    blockquote: "blockquote",
    "unordered-list-item": "unordered-list-item",
    "ordered-list-item": "ordered-list-item"
  });
  const styleName = Object.freeze({ bold: "Bold", italic: "Italic", strikethrough: "Strikethrough" });
  for (const [blockIndex, block] of document.blocks.entries()) {
    const key = blockIndex.toString(36).padStart(5, "0");
    if (block.type === "image") {
      const mediaId = uploadedImageIds[block.imageIndex];
      if (mediaId === undefined || usedImages.has(block.imageIndex)) {
        throw new Error("input.document imageIndex did not bind one uploaded inline image");
      }
      usedImages.add(block.imageIndex);
      const entityKey = `${entities.length}`;
      entities.push(Object.freeze({
        key: entityKey,
        value: Object.freeze({
          data: Object.freeze({
            ...block.caption === undefined ? {} : { caption: block.caption },
            entity_key: entityKey,
            media_items: Object.freeze([Object.freeze({
              local_media_id: block.imageIndex + 1,
              media_category: "DraftTweetImage",
              media_id: mediaId
            })])
          }),
          type: "MEDIA",
          mutability: "Immutable"
        })
      }));
      blocks.push(Object.freeze({
        data: Object.freeze({}),
        key,
        text: " ",
        type: "atomic",
        entity_ranges: Object.freeze([Object.freeze({
          key: Number(entityKey),
          offset: 0,
          length: 1
        })]),
        inline_style_ranges: Object.freeze([])
      }));
      continue;
    }
    const entityRanges = block.links.map((link) => {
      const key2 = entities.length;
      entities.push(Object.freeze({
        key: `${key2}`,
        value: Object.freeze({
          data: Object.freeze({ url: link.url }),
          type: "LINK",
          mutability: "Mutable"
        })
      }));
      return Object.freeze({ key: key2, offset: link.offset, length: link.length });
    });
    blocks.push(Object.freeze({
      data: Object.freeze({}),
      key,
      text: block.text,
      type: blockType[block.type],
      entity_ranges: Object.freeze(entityRanges),
      inline_style_ranges: Object.freeze(block.styles.map((style) => Object.freeze({
        length: style.length,
        offset: style.offset,
        style: styleName[style.style]
      })))
    }));
  }
  if (usedImages.size !== uploadedImageIds.length) {
    throw new Error("every input.inline_images item must be referenced exactly once by input.document");
  }
  const contentState = Object.freeze({ blocks: Object.freeze(blocks), entity_map: Object.freeze(entities) });
  validateXWebRichArticleContentState(contentState);
  return contentState;
}
function integerInput(input, name, fallback, minimum, maximum) {
  const value = input[name] ?? fallback;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`input.${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}
function postId(value, label) {
  const id = requiredString2(value, label, 19);
  if (!/^[0-9]{1,19}$/u.test(id))
    throw new Error(`${label} must be a 1-19 digit X post ID`);
  return id;
}
function quotedStrings(value, label) {
  if (value.trim() === "")
    return [];
  const values = [...value.matchAll(/"([A-Za-z][A-Za-z0-9_]{0,199})"/gu)].map((match) => match[1]);
  const remainder = value.replace(/"[A-Za-z][A-Za-z0-9_]{0,199}"/gu, "").replaceAll(",", "").trim();
  if (remainder !== "" || new Set(values).size !== values.length) {
    throw new Error(`${label} contained an invalid or duplicate name`);
  }
  return values;
}
function parseXWebBundleDescriptors(value) {
  if (value.length > MAX_BUNDLE_BYTES)
    throw new Error("X first-party bundle exceeded its byte limit");
  const descriptors = [];
  const pattern = /queryId:"([A-Za-z0-9_-]{8,128})",operationName:"([A-Za-z][A-Za-z0-9_]{1,127})",operationType:"(query|mutation)",metadata:\{featureSwitches:\[([^\]]*)\],fieldToggles:\[([^\]]*)\]\}/gu;
  for (const match of value.matchAll(pattern)) {
    descriptors.push(Object.freeze({
      queryId: match[1],
      operationName: match[2],
      operationType: match[3],
      metadata: Object.freeze({
        featureSwitches: Object.freeze(quotedStrings(match[4], "X featureSwitches")),
        fieldToggles: Object.freeze(quotedStrings(match[5], "X fieldToggles"))
      })
    }));
  }
  if (descriptors.length < 1)
    throw new Error("X first-party bundle contained no reviewed query descriptors");
  return Object.freeze(descriptors);
}
function currentMainUrl(html) {
  const urls = new Set;
  for (const match of html.matchAll(/(?:src|href)="(https:\/\/abs\.twimg\.com\/responsive-web\/client-web\/main\.[A-Za-z0-9_-]+\.js)"/gu)) {
    if (match[1] !== undefined)
      urls.add(match[1]);
  }
  if (urls.size !== 1)
    throw new Error("X bootstrap did not expose one unique current main bundle");
  return new URL(urls.values().next().value);
}
function sourceChunkLogicalName(sourceChunk) {
  const match = /^([A-Za-z0-9_~.-]{1,240})\.(?:[a-f0-9]{8}|[a-f0-9]{17})\.js$/u.exec(sourceChunk);
  if (match?.[1] === undefined)
    throw new Error("X revision evidence source chunk is not a reviewed hashed JavaScript asset");
  return match[1];
}
var ALLOWED_INSERTED_CHUNK_SEGMENT = /^(?:loader|bundle)\.[A-Za-z][A-Za-z0-9]{0,80}$/u;
function matchesReviewedChunkFamily(currentName, reviewedName) {
  if (currentName === reviewedName || currentName.startsWith(`${reviewedName}~`) || reviewedName.startsWith(`${currentName}~`))
    return true;
  const reviewed = reviewedName.split("~");
  const current = currentName.split("~");
  if (reviewed.length === 0 || current.length < reviewed.length)
    return false;
  let next = 0;
  for (const segment of current) {
    if (next < reviewed.length && segment === reviewed[next]) {
      next += 1;
      continue;
    }
    if (!ALLOWED_INSERTED_CHUNK_SEGMENT.test(segment))
      return false;
  }
  return next === reviewed.length;
}
function setUniqueChunkMapValue(target, id, value, label) {
  if (target.has(id))
    throw new Error(`X bootstrap contained a duplicate webpack chunk ${label}`);
  target.set(id, value);
}
function extraReviewedChunkSegments(currentName, reviewedName) {
  return currentName.split("~").length - reviewedName.split("~").length;
}
function uniqueReviewedChunkMatch(names, logicalName) {
  const exact = [...names].filter(([, name]) => name === logicalName);
  if (exact.length === 1)
    return exact[0];
  const family = exact.length === 0 ? [...names].filter(([, name]) => matchesReviewedChunkFamily(name, logicalName)) : exact;
  if (family.length === 1)
    return family[0];
  if (family.length === 0) {
    throw new Error("X current build did not bind one unique reviewed logical chunk; reviewed evidence is stale");
  }
  let minimumExtras = Number.POSITIVE_INFINITY;
  const tightest = [];
  for (const candidate of family) {
    const extras = extraReviewedChunkSegments(candidate[1], logicalName);
    if (extras < minimumExtras) {
      minimumExtras = extras;
      tightest.length = 0;
      tightest.push(candidate);
      continue;
    }
    if (extras === minimumExtras)
      tightest.push(candidate);
  }
  if (tightest.length !== 1) {
    throw new Error("X current build did not bind one unique reviewed logical chunk; reviewed evidence is stale");
  }
  return tightest[0];
}
function resolveCurrentXWebChunkUrl(html, sourceChunk) {
  if (html.length > MAX_HOME_BYTES)
    throw new Error("X bootstrap exceeded its byte limit");
  const logicalName = sourceChunkLogicalName(sourceChunk);
  const start = html.indexOf("p.u=e=>");
  const separator = '})[e]||e)+"."+({';
  const middle = start < 0 ? -1 : html.indexOf(separator, start);
  const suffix = middle < 0 ? -1 : html.indexOf('})[e]+"a.js"', middle + separator.length);
  if (start < 0 || middle < 0 || suffix < 0 || suffix - start > 256 * 1024) {
    throw new Error("X bootstrap omitted its bounded current webpack chunk map");
  }
  const names = new Map;
  for (const match of html.slice(start, middle).matchAll(/(?:\{|,)([0-9A-Za-z]+):"([A-Za-z0-9_~.-]{1,240})"/gu)) {
    if (match[1] !== undefined && match[2] !== undefined) {
      setUniqueChunkMapValue(names, match[1], match[2], "name");
    }
  }
  const [id, currentName] = uniqueReviewedChunkMatch(names, logicalName);
  const hashes = new Map;
  const hashStart = middle + separator.length;
  for (const match of html.slice(hashStart, suffix).matchAll(/(?:^|,)([0-9A-Za-z]+):"([a-f0-9]{7}|[a-f0-9]{16})"/gu)) {
    if (match[1] !== undefined && match[2] !== undefined) {
      setUniqueChunkMapValue(hashes, match[1], match[2], "hash");
    }
  }
  const hash = hashes.get(id);
  if (hash === undefined)
    throw new Error("X current build omitted the reviewed logical chunk hash");
  return new URL(`/responsive-web/client-web/${currentName}.${hash}a.js`, X_ASSET_ORIGIN2);
}
function currentBearer(mainText) {
  const values = new Set;
  for (const match of mainText.matchAll(/AAAA[A-Za-z0-9._~+/%=-]{80,250}/gu)) {
    try {
      const decoded = decodeURIComponent(match[0]);
      if (/^AAAA[A-Za-z0-9._~+/=-]{80,250}$/u.test(decoded))
        values.add(decoded);
    } catch {}
  }
  if (values.size !== 1)
    throw new Error("X bootstrap did not expose one unique current web authorization value");
  return values.values().next().value;
}
function currentFeatureConfig(html) {
  const prefix = "window.__INITIAL_STATE__=";
  const start = html.indexOf(prefix);
  if (start < 0 || html.indexOf(prefix, start + prefix.length) >= 0) {
    throw new Error("X bootstrap did not expose one unique initial-state payload");
  }
  const jsonStart = start + prefix.length;
  const jsonEnd = html.indexOf(";window.__META_DATA__=", jsonStart);
  if (jsonEnd < jsonStart || jsonEnd - jsonStart > MAX_HOME_BYTES) {
    throw new Error("X bootstrap initial-state payload exceeded its reviewed boundary");
  }
  let parsed;
  try {
    parsed = JSON.parse(html.slice(jsonStart, jsonEnd));
  } catch {
    throw new Error("X bootstrap returned malformed initial-state JSON");
  }
  const root = record2(parsed, "X initial state");
  const featureSwitch = record2(root.featureSwitch, "X initial state.featureSwitch");
  const user = record2(featureSwitch.user, "X initial state.featureSwitch.user");
  const config = record2(user.config, "X initial state.featureSwitch.user.config");
  if (Object.keys(config).length > 1e4)
    throw new Error("X user feature configuration exceeded its reviewed limit");
  return new Map(Object.entries(config));
}
async function bootstrapX(auth, recipe, dependencies, budget = {}) {
  const client = await createWebSessionClient(X_ORIGIN2, auth, {
    timeoutMs: recipe.timeoutMs,
    ...budget.signal === undefined ? {} : { signal: budget.signal },
    ...budget.operationDeadline === undefined ? {} : { operationDeadline: budget.operationDeadline },
    ...dependencies === undefined ? {} : { dependencies }
  });
  const csrf = webSessionCookie(client.cookies, "ct0");
  if (!/^[A-Za-z0-9_-]{16,512}$/u.test(csrf))
    throw new Error("X ct0 session cookie is invalid or expired");
  const html = await client.requestText({
    url: new URL("/home", X_ORIGIN2),
    headers: { accept: "text/html" },
    expectedContentTypes: ["text/html"],
    maxBytes: MAX_HOME_BYTES
  });
  const mainUrl = currentMainUrl(html);
  const mainText = await fetchPublicWebAsset(mainUrl, {
    allowedOrigin: X_ASSET_ORIGIN2,
    contentTypes: ["application/javascript", "text/javascript"],
    maxBytes: MAX_BUNDLE_BYTES,
    timeoutMs: recipe.timeoutMs,
    ...budget.signal === undefined ? {} : { signal: budget.signal },
    ...budget.operationDeadline === undefined ? {} : { operationDeadline: budget.operationDeadline },
    ...dependencies === undefined ? {} : { dependencies }
  });
  return {
    auth,
    client,
    html,
    mainUrl,
    mainText,
    bearer: currentBearer(mainText),
    csrf,
    features: currentFeatureConfig(html),
    timeoutMs: recipe.timeoutMs,
    maxOutputBytes: recipe.maxOutputBytes,
    ...budget.signal === undefined ? {} : { signal: budget.signal },
    ...budget.operationDeadline === undefined ? {} : { operationDeadline: budget.operationDeadline },
    ...budget.registerCleanupBarrier === undefined ? {} : { registerCleanupBarrier: budget.registerCleanupBarrier },
    ...dependencies === undefined ? {} : { dependencies },
    chunks: new Map([[mainUrl.pathname.split("/").at(-1), mainText]]),
    descriptors: new Map
  };
}
function descriptorEvidence(operationName, operationType) {
  const matches = xWebQueryDescriptorEvidenceSnapshot.descriptors.filter((candidate) => candidate.operationName === operationName && candidate.operationType === operationType);
  if (matches.length !== 1)
    throw new Error(`X ${operationName} has no unique reviewed revision evidence`);
  return matches[0];
}
async function sourceText(bootstrap, evidence) {
  return currentChunkText(bootstrap, evidence.sourceChunk);
}
async function currentChunkText(bootstrap, sourceChunk) {
  if (sourceChunk.startsWith("main."))
    return bootstrap.mainText;
  const cached = bootstrap.chunks.get(sourceChunk);
  if (cached !== undefined)
    return cached;
  const currentUrl = resolveCurrentXWebChunkUrl(bootstrap.html, sourceChunk);
  const text = await fetchPublicWebAsset(currentUrl, {
    allowedOrigin: X_ASSET_ORIGIN2,
    contentTypes: ["application/javascript", "text/javascript"],
    maxBytes: MAX_BUNDLE_BYTES,
    timeoutMs: bootstrap.timeoutMs,
    ...bootstrap.signal === undefined ? {} : { signal: bootstrap.signal },
    ...bootstrap.operationDeadline === undefined ? {} : { operationDeadline: bootstrap.operationDeadline },
    ...bootstrap.dependencies === undefined ? {} : { dependencies: bootstrap.dependencies }
  });
  bootstrap.chunks.set(sourceChunk, text);
  return text;
}
var articleRichContractEvidence = Object.freeze({
  uploader: "shared~bundle.LoggedInMain~ondemand.HoverCard~loader.AudioDock~loader.Dock~bundle.BookmarkFolders~bundle.Book.a9bac6ba.js",
  entities: "shared~bundle.TwitterArticles~ondemand.Verified~bundle.SettingsExtendedProfile~bundle.WorkHistory.d1314bba.js",
  converter: "shared~bundle.Grok~bundle.GrokDrawer~bundle.ReaderMode~bundle.Birdwatch~bundle.TwitterArticles~bundle.Compose.02f6dc7a.js",
  observedOn: "2026-08-14"
});
function requireCurrentBundleTokens(text, tokens, label) {
  if (tokens.some((token) => !text.includes(token))) {
    throw new Error(`X current ${label} bundle drifted outside the reviewed rich Article contract`);
  }
}
async function assertCurrentArticleRichContract(bootstrap, includeImages) {
  const [entities, converter] = await Promise.all([
    currentChunkText(bootstrap, articleRichContractEvidence.entities),
    currentChunkText(bootstrap, articleRichContractEvidence.converter)
  ]);
  requireCurrentBundleTokens(entities, [
    'createEntity(w.Sg,"MUTABLE",{url:'
  ], "Article entity");
  requireCurrentBundleTokens(converter, [
    "mutability:s[r.mutability]",
    "inline_style_ranges:"
  ], "Article content converter");
  if (!includeImages)
    return;
  const uploader = await currentChunkText(bootstrap, articleRichContractEvidence.uploader);
  requireCurrentBundleTokens(uploader, [
    '"upload.x.com"',
    '"upload-a.x.com"',
    '"upload-b.x.com"',
    "/i/media/${l}",
    '"INIT"',
    '"APPEND"',
    '"FINALIZE"',
    "media_category=${p}",
    'TweetImage:"tweet_image"',
    'TwitterArticle:"twitter_article"'
  ], "media uploader");
  requireCurrentBundleTokens(entities, [
    "createEntity(p.LA.MEDIA,p.Ei.IMMUTABLE",
    "mediaCategory:E(e)",
    "mediaId:e.uploadId"
  ], "Article entity");
  requireCurrentBundleTokens(converter, [
    "media_items:r.data?.mediaItems?.map",
    "media_category:e.mediaCategory"
  ], "Article content converter");
}
async function resolveDescriptor(bootstrap, operationName, operationType, explicitEvidence) {
  const key = `${operationName}:${operationType}`;
  const cached = bootstrap.descriptors.get(key);
  if (cached !== undefined)
    return cached;
  const evidence = explicitEvidence ?? descriptorEvidence(operationName, operationType);
  const descriptor = resolveUniqueXWebBundleDescriptor(parseXWebBundleDescriptors(await sourceText(bootstrap, evidence)), evidence);
  bootstrap.descriptors.set(key, descriptor);
  return descriptor;
}
function featureValue(bootstrap, name) {
  const entry = bootstrap.features.get(name);
  if (entry === undefined)
    return false;
  if (!isRecord2(entry) || typeof entry.value !== "boolean") {
    throw new Error(`X user feature configuration changed type for feature ${name}`);
  }
  return entry.value;
}
function featureStringValue(bootstrap, name) {
  const entry = bootstrap.features.get(name);
  if (entry === undefined)
    return;
  if (!isRecord2(entry) || entry.value !== undefined && typeof entry.value !== "string") {
    throw new Error(`X user feature configuration changed type for feature ${name}`);
  }
  return entry.value;
}
function articleUploadOrigin(bootstrap) {
  const configured = featureStringValue(bootstrap, "responsive_web_media_upload_host");
  if (configured === undefined)
    return X_DEFAULT_ARTICLE_UPLOAD_ORIGIN;
  if (!X_ARTICLE_UPLOAD_HOSTS.has(configured)) {
    throw new Error("X selected an unreviewed media upload host");
  }
  return new URL(`https://${configured}`).origin;
}
function fieldToggleValue(bootstrap, name) {
  if (name === "withArticlePlainText" || name === "withPayments" || name === "withAuxiliaryUserLabels" || name === "isDelegate") {
    return false;
  }
  if (name === "withArticleRichContentState") {
    return featureValue(bootstrap, "responsive_web_twitter_article_seed_tweet_detail_enabled");
  }
  if (name === "withArticleSummaryText" || name === "withArticleVoiceOver") {
    return featureValue(bootstrap, "responsive_web_grok_article_summary_enabled");
  }
  if (name === "withGrokAnalyze")
    return featureValue(bootstrap, "subscriptions_inapp_grok_analyze");
  if (name === "withDisallowedReplyControls") {
    return featureValue(bootstrap, "disallowed_reply_controls_callout_enabled");
  }
  throw new Error(`X field toggle ${name} requires fresh reviewed evidence`);
}
function operationMetadata(bootstrap, descriptor) {
  const features = Object.fromEntries(descriptor.metadata.featureSwitches.map((name) => [name, featureValue(bootstrap, name)]));
  const fieldToggles = {};
  for (const name of descriptor.metadata.fieldToggles) {
    fieldToggles[name] = fieldToggleValue(bootstrap, name);
  }
  return bindXWebOperationMetadataValues(descriptor, { features, fieldToggles });
}
function xHeaders(bootstrap, json, transactionId2) {
  const fixed = enforceXWebHeaderSinkPolicy({
    source: "code",
    sink: "network-request",
    headers: {
      accept: "application/json",
      "x-twitter-auth-type": "OAuth2Session",
      "x-twitter-active-user": "yes",
      "x-twitter-client-language": "en",
      ...json ? { "content-type": "application/json" } : {}
    }
  }).values;
  const session = enforceXWebHeaderSinkPolicy({
    source: "in-origin-session",
    sink: "network-request",
    headers: {
      authorization: `Bearer ${bootstrap.bearer}`,
      "x-csrf-token": bootstrap.csrf,
      ...transactionId2 === undefined ? {} : { "x-client-transaction-id": transactionId2 }
    }
  }).values;
  return { ...fixed, ...session, referer: `${X_ORIGIN2}/` };
}
async function graphQl(bootstrap, descriptor, variables, method, readOperation, mutationOperation, beforeRequest) {
  const metadata = operationMetadata(bootstrap, descriptor);
  const url = new URL(`/i/api/graphql/${descriptor.queryId}/${descriptor.operationName}`, X_ORIGIN2);
  let body;
  if (method === "GET") {
    url.searchParams.set("variables", JSON.stringify(variables));
    if (Object.keys(metadata.features).length > 0)
      url.searchParams.set("features", JSON.stringify(metadata.features));
    if (Object.keys(metadata.fieldToggles).length > 0)
      url.searchParams.set("fieldToggles", JSON.stringify(metadata.fieldToggles));
  } else {
    body = JSON.stringify({
      variables,
      features: metadata.features,
      ...Object.keys(metadata.fieldToggles).length === 0 ? {} : { fieldToggles: metadata.fieldToggles },
      queryId: descriptor.queryId
    });
  }
  let mutationBinding = null;
  if (mutationOperation !== undefined) {
    mutationBinding = authorizeXWebMutationRequest(mutationOperation, { url, method, descriptor, ...body === undefined ? {} : { body } });
  } else if (readOperation === undefined) {
    assertExactXWebGraphQlBinding({ url, method, descriptor, ...body === undefined ? {} : { body } });
  } else {
    authorizeXWebR1GraphQlRequest(readOperation, { url, method, descriptor, ...body === undefined ? {} : { body } });
  }
  let transactionId2;
  if (mutationBinding !== null) {
    const transaction = startWebSessionCleanupTrackedOperation(bootstrap.registerCleanupBarrier, (publishCleanupResource) => generateXClientTransactionId({
      auth: bootstrap.auth,
      mainBundleText: bootstrap.mainText,
      mainBundleUrl: bootstrap.mainUrl,
      method: "POST",
      path: mutationBinding.path,
      timeoutMs: bootstrap.timeoutMs,
      maxOutputBytes: bootstrap.maxOutputBytes,
      ...bootstrap.operationDeadline === undefined ? {} : { operationDeadline: bootstrap.operationDeadline },
      ...publishCleanupResource === undefined ? {} : { publishCleanupResource },
      dependencies: {
        ...bootstrap.dependencies?.createBrowserSession === undefined ? {} : { createBrowserSession: bootstrap.dependencies.createBrowserSession },
        ...bootstrap.dependencies?.acquireCookies === undefined ? {} : { acquireCookieRecords: bootstrap.dependencies.acquireCookies }
      }
    }), browserCleanupBarrier);
    transactionId2 = await transaction;
  }
  await beforeRequest?.();
  return bootstrap.client.requestJson({
    url,
    method,
    headers: xHeaders(bootstrap, body !== undefined, transactionId2),
    ...body === undefined ? {} : { body },
    maxBytes: bootstrap.maxOutputBytes
  });
}
async function viewer(bootstrap) {
  const descriptor = await resolveDescriptor(bootstrap, "Viewer", "query", viewerEvidence);
  const response = record2(await graphQl(bootstrap, descriptor, {}, "GET"), "X Viewer response");
  if (response.errors !== undefined && (!Array.isArray(response.errors) || response.errors.length > 0)) {
    throw new Error("X Viewer response contained provider errors");
  }
  const data = record2(response.data, "X Viewer response.data");
  const viewerRoot = record2(data.viewer, "X Viewer response.data.viewer");
  const userResults = record2(viewerRoot.user_results, "X Viewer user_results");
  const result = record2(userResults.result, "X Viewer result");
  const id = postId(result.rest_id, "X Viewer rest_id");
  const core = isRecord2(result.core) ? result.core : null;
  const legacy = isRecord2(result.legacy) ? result.legacy : null;
  const screenName = typeof core?.screen_name === "string" ? core.screen_name : typeof legacy?.screen_name === "string" ? legacy.screen_name : null;
  return { id, screenName };
}
async function probeXWebSubject(auth, options = {}) {
  const bootstrap = await bootstrapX(auth, {
    site: "x",
    action: "feeds.read",
    contractVersion: 1,
    timeoutMs: options.timeoutMs ?? 60000,
    maxOutputBytes: 2 * 1024 * 1024
  }, options.dependencies, {
    ...options.signal === undefined ? {} : { signal: options.signal }
  });
  return (await viewer(bootstrap)).id;
}
async function requireBoundViewer(bootstrap, auth) {
  const expected = webSessionAuthSubject(auth);
  if (expected === null) {
    throw new Error("X personalized operations require an auth locator bound to the exact viewer subject");
  }
  const current = await viewer(bootstrap);
  if (current.id !== expected)
    throw new Error("X browser session viewer no longer matches the confirmed auth subject");
  return current;
}
function feedRequest(bootstrap, input) {
  const feed = stringInput(input, "feed");
  const count = integerInput(input, "limit", DEFAULT_LIMIT, 1, 100);
  const cursor = optionalStringInput(input, "cursor");
  const withCursor = (value) => cursor === undefined ? value : { ...value, cursor };
  if (feed === "for-you") {
    return {
      operationId: "feeds.for-you",
      operationName: "HomeTimeline",
      method: "GET",
      variables: withCursor({ count, includePromotedContent: false, latestControlAvailable: true, requestContext: "launch", withCommunity: true })
    };
  }
  if (feed === "following") {
    return {
      operationId: "feeds.following",
      operationName: "HomeLatestTimeline",
      method: "POST",
      variables: withCursor({ count, includePromotedContent: false, latestControlAvailable: true, requestContext: "launch", seenTweetIds: [] })
    };
  }
  if (feed === "bookmarks") {
    return {
      operationId: "feeds.bookmarks",
      operationName: "Bookmarks",
      method: "GET",
      variables: withCursor({ count, includePromotedContent: false })
    };
  }
  if (feed === "list") {
    const listId = postId(input.list_id, "input.list_id");
    return {
      operationId: "feeds.list-latest",
      operationName: "ListLatestTweetsTimeline",
      method: "GET",
      variables: withCursor({ listId, count })
    };
  }
  if (feed === "user") {
    const userId = postId(input.user_id, "input.user_id");
    return {
      operationId: "feeds.user",
      operationName: "UserTweets",
      method: "GET",
      variables: withCursor({
        userId,
        count,
        includePromotedContent: true,
        withQuickPromoteEligibilityTweetFields: true,
        withVoice: featureValue(bootstrap, "voice_consumption_enabled")
      })
    };
  }
  if (feed === "search") {
    const rawQuery = stringInput(input, "query");
    return {
      operationId: "feeds.search",
      operationName: "SearchTimeline",
      method: "GET",
      variables: withCursor({ rawQuery, count, querySource: "typed_query", product: "Latest" })
    };
  }
  throw new Error("input.feed is not an implemented X internal feed");
}
function assertFeedTargetBound(request, input, response) {
  if (request.operationId === "feeds.user") {
    assertXWebUserFeedTargetBound(response, input.user_id);
    return;
  }
  if (request.operationId !== "feeds.list-latest")
    return;
  const data = graphQlData2(response, `X ${request.operationId} response`);
  const expected = postId(input.list_id, "input.list_id");
  const list = record2(data.list, "X List feed response.data.list");
  const returnedIds = new Set;
  for (const field of ["rest_id", "id_str", "id"]) {
    if (list[field] === undefined)
      continue;
    returnedIds.add(postId(list[field], `X List feed response ${field}`));
  }
  if (returnedIds.size !== 1 || !returnedIds.has(expected)) {
    throw new Error("X List feed response did not bind the requested List");
  }
}
async function readFeed(bootstrap, input) {
  const request = feedRequest(bootstrap, input);
  const descriptor = await resolveDescriptor(bootstrap, request.operationName, "query");
  const response = await graphQl(bootstrap, descriptor, request.variables, request.method, request.operationId);
  assertFeedTargetBound(request, input, response);
  const limit = integerInput(input, "limit", DEFAULT_LIMIT, 1, 100);
  if (request.operationId === "feeds.bookmarks") {
    return projectXWebBookmarkExportPage(response, limit);
  }
  return projectXWebFeedPage(request.operationId, response, limit);
}
async function readProfile(bootstrap, input) {
  const handle = normalizeXWebProfileHandle(input.handle);
  const descriptor = await resolveDescriptor(bootstrap, "UserByScreenName", "query");
  const response = await graphQl(bootstrap, descriptor, {
    screen_name: handle,
    withGrokTranslatedBio: featureValue(bootstrap, "responsive_web_grok_bio_auto_translation_is_enabled")
  }, "GET", "profiles.by-handle");
  return projectXWebProfileStats(response, handle, new Date(bootstrap.dependencies?.now?.() ?? Date.now()).toISOString());
}
function tweetDetailVariables(bootstrap, id, input) {
  const cursor = optionalStringInput(input, "cursor");
  return {
    focalTweetId: id,
    referrer: "tweet",
    with_rux_injections: false,
    includePromotedContent: false,
    rankingMode: "Recency",
    withCommunity: featureValue(bootstrap, "c9s_enabled"),
    withQuickPromoteEligibilityTweetFields: true,
    withBirdwatchNotes: featureValue(bootstrap, "responsive_web_birdwatch_consumption_enabled"),
    withVoice: featureValue(bootstrap, "voice_consumption_enabled"),
    ...cursor === undefined ? {} : { cursor }
  };
}
async function readConversation(bootstrap, input, commentsOnly) {
  const id = postId(input.post_id, "input.post_id");
  const descriptor = await resolveDescriptor(bootstrap, "TweetDetail", "query");
  const response = await graphQl(bootstrap, descriptor, tweetDetailVariables(bootstrap, id, input), "GET", "posts.detail");
  const normalized = normalizeXWebGraphQlTimelineResponse("posts.detail", response);
  const posts = normalized.items.map(projectXWebFeedPost).filter((row) => row !== null);
  const root = posts.find((row) => row.id === id);
  if (root === undefined)
    throw new Error("X TweetDetail response did not contain the requested focal post");
  if (!commentsOnly)
    return { post: root };
  const limit = integerInput(input, "limit", DEFAULT_LIMIT, 1, 100);
  const descendants = [];
  const acceptedIds = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of posts) {
      if (row.id === id || acceptedIds.has(row.id))
        continue;
      if (row.replyToPostId === null || !acceptedIds.has(row.replyToPostId))
        continue;
      acceptedIds.add(row.id);
      descendants.push(row);
      changed = true;
    }
  }
  const page = boundXWebProviderPage(descendants, limit, normalized.cursors.bottom !== null, "X conversation page");
  return {
    comments: page.items,
    cursor: page.truncated ? null : normalized.cursors.bottom?.value ?? null
  };
}
function graphQlData2(value, label) {
  const body = record2(value, label);
  if (body.errors !== undefined) {
    if (!Array.isArray(body.errors) || body.errors.length > 0)
      throw new Error(`${label} contained provider errors`);
  }
  return record2(body.data, `${label}.data`);
}
function unwrapTweet(value, label) {
  let result = record2(value, label);
  if (isRecord2(result.tweet))
    result = result.tweet;
  if (result.__typename === "TweetWithVisibilityResults" && isRecord2(result.tweet))
    result = result.tweet;
  return result;
}
async function tweetReadback(bootstrap, id) {
  const descriptor = await resolveDescriptor(bootstrap, "TweetResultByRestId", "query");
  const response = await graphQl(bootstrap, descriptor, {
    tweetId: id,
    withCommunity: false,
    includePromotedContent: false,
    withVoice: false
  }, "GET", "posts.by-id");
  const result = unwrapTweet(extractXWebGraphQlReadResponseRoot("posts.by-id", response), "X post readback result");
  if (postId(result.rest_id, "X post readback rest_id") !== id) {
    throw new Error("X desired-state readback did not bind the requested post");
  }
  return result;
}
async function waitForTweetPublishReadback(bootstrap, id, sleep) {
  let lastError;
  for (const delay of PUBLISH_READBACK_DELAYS_MS) {
    if (delay > 0) {
      const pause = () => sleep(delay);
      if (bootstrap.operationDeadline === undefined)
        await pause();
      else
        await bootstrap.operationDeadline.run(pause, "authenticated web operation deadline");
    }
    try {
      return await tweetReadback(bootstrap, id);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error("X independent post readback did not settle within the reviewed bound", {
    cause: lastError
  });
}
function parseXWebPublishedMutationTarget(identifier) {
  let value;
  try {
    value = JSON.parse(identifier);
  } catch {
    throw new Error("X provider-accepted post target is not canonical JSON");
  }
  const target = record2(value, "X provider-accepted post target");
  if (Object.keys(target).sort().join(",") !== "mediaId,postId") {
    throw new Error("X provider-accepted post target contained unsupported fields");
  }
  const postIdValue = postId(target.postId, "X provider-accepted post target post ID");
  const mediaId = target.mediaId === null ? null : xMediaId(target.mediaId, "X provider-accepted post target media ID");
  const parsed = Object.freeze({ postId: postIdValue, mediaId });
  if (canonicalJson(parsed) !== identifier) {
    throw new Error("X provider-accepted post target is not canonical");
  }
  return parsed;
}
async function readXWebPublishedMutationTarget(recipe, input, auth, identifier, options = {}) {
  if (recipe.site !== "x" || recipe.action !== "posts.publish" || recipe.contractVersion !== 3 && recipe.contractVersion !== 4 && recipe.contractVersion !== 5) {
    throw new Error("X publish recovery supports only posts.publish@3, posts.publish@4, or posts.publish@5");
  }
  const target = parseXWebPublishedMutationTarget(identifier);
  const hasMedia = input.media !== undefined;
  const mediaType = xPublishMediaType(input.media_type, hasMedia);
  if (hasMedia !== (target.mediaId !== null)) {
    throw new Error("X provider-accepted post target did not bind the confirmed attachment shape");
  }
  const text = requiredString2(input.body, "input.body", MAX_X_CREATE_TWEET_TEXT_LENGTH);
  const bootstrap = await bootstrapX(auth, recipe, options.dependencies);
  const viewer2 = await requireBoundViewer(bootstrap, auth);
  const readback = await tweetReadback(bootstrap, target.postId);
  const rebound = assertTweetBinding(readback, text, null, null, viewer2.id, target.mediaId, mediaType, "X publish recovery readback");
  if (rebound.id !== target.postId) {
    throw new Error("X publish recovery readback changed the accepted post ID");
  }
  return Object.freeze({ present: true, postId: target.postId });
}
async function desiredStateReadback(bootstrap, id, kind) {
  const result = await tweetReadback(bootstrap, id);
  const legacy = record2(result.legacy, "X desired-state readback legacy");
  const actual = kind === "like" ? legacy.favorited : kind === "bookmark" ? legacy.bookmarked : legacy.retweeted;
  if (typeof actual !== "boolean") {
    throw new Error(`X desired-state readback omitted the exact ${kind} boolean`);
  }
  return actual;
}
async function readXWebDesiredState(recipe, input, auth, options = {}) {
  if (recipe.site !== "x" || recipe.action !== "likes.set" && recipe.action !== "content.save") {
    throw new Error("X recovery readback supports only likes.set and content.save");
  }
  const bootstrap = await bootstrapX(auth, recipe, options.dependencies);
  await requireBoundViewer(bootstrap, auth);
  const id = postId(input.post_id, "input.post_id");
  const kind = recipe.action === "likes.set" ? "like" : "bookmark";
  return {
    kind,
    enabled: await desiredStateReadback(bootstrap, id, kind),
    postId: id
  };
}
async function readXWebArticleDraftDesiredState(recipe, input, auth, options = {}) {
  if (recipe.site !== "x" || recipe.action !== "articles.draft.save" || recipe.contractVersion !== 1) {
    throw new Error("X Article draft recovery supports only articles.draft.save@1");
  }
  const draftId = postId(input.draft_id, "input.draft_id");
  const title = requiredString2(input.title, "input.title", MAX_ARTICLE_TITLE_CHARACTERS);
  const document = parseArticleDraftDocument(input.document, {
    maximumBlocks: MAX_ARTICLE_BLOCKS,
    maximumCharacters: MAX_ARTICLE_BODY_CHARACTERS
  });
  const expectedContent = buildXWebRichArticleContentState(document);
  const bootstrap = await bootstrapX(auth, recipe, options.dependencies);
  const currentViewer = await requireBoundViewer(bootstrap, auth);
  const article = await readArticleDraft(bootstrap, draftId);
  requirePrivateDraftArticle(article, draftId, currentViewer.id);
  const actualContent = normalizeArticleContentReadback(article.content_state);
  return {
    matches: articleTitle(article, "X Article recovery readback") === title && canonicalJson(actualContent) === canonicalJson(expectedContent),
    draftId
  };
}
function xPublishMediaType(value, hasMedia) {
  if (!hasMedia) {
    if (value !== undefined)
      throw new Error("X media_type requires one plan-bound PNG or MP4");
    return null;
  }
  if (value !== "image/png" && value !== "video/mp4") {
    throw new Error("X reviewed media upload supports one PNG or one MP4");
  }
  return value;
}
function xMediaMaxBytes(mediaType) {
  return mediaType === "video/mp4" ? MAX_X_VIDEO_BYTES : MAX_X_IMAGE_BYTES;
}
function xMediaCategory(mediaType) {
  return mediaType === "video/mp4" ? "tweet_video" : "tweet_image";
}
function xMediaUploadName(mediaType) {
  return mediaType === "video/mp4" ? "upload.mp4" : "media.png";
}
function xMediaReadbackType(mediaType) {
  return mediaType === "video/mp4" ? "video" : "photo";
}
async function readBoundXMedia(input, fileResolver, operationDeadline) {
  const mediaType = xPublishMediaType(input.media_type, input.media !== undefined);
  if (input.media === undefined || mediaType === null)
    return null;
  if (!isRecord2(input.media))
    throw new Error("X media must be one plan-bound file");
  const descriptor = input.media;
  if (Object.keys(descriptor).sort().join(",") !== "kind,reference" || descriptor.kind !== "file" || typeof descriptor.reference !== "string" || descriptor.reference.length < 1 || descriptor.reference.length > 1024)
    throw new Error("X media must be one plan-bound file");
  if (fileResolver === undefined) {
    throw new Error("X media upload requires the plan-bound file resolver");
  }
  const resolveFile = () => fileResolver([descriptor]);
  const paths = operationDeadline === undefined ? await resolveFile() : await operationDeadline.run(resolveFile, "authenticated web operation deadline");
  if (paths.length !== 1 || typeof paths[0] !== "string") {
    throw new Error("X media resolver did not return exactly one file");
  }
  const noFollow = "O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0;
  const handle = await open(paths[0], constants.O_RDONLY | noFollow);
  const maxBytes = xMediaMaxBytes(mediaType);
  try {
    const before = operationDeadline === undefined ? await handle.stat() : await operationDeadline.run(() => handle.stat(), "authenticated web operation deadline");
    if (!before.isFile() || before.size < 1 || before.size > maxBytes) {
      throw new Error(mediaType === "video/mp4" ? "X video must be a regular MP4 no larger than 512 MiB" : "X image must be a regular PNG no larger than 20 MiB");
    }
    const bytes = operationDeadline === undefined ? await handle.readFile() : await operationDeadline.run(() => handle.readFile(), "authenticated web operation deadline");
    const after = operationDeadline === undefined ? await handle.stat() : await operationDeadline.run(() => handle.stat(), "authenticated web operation deadline");
    if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size || bytes.byteLength !== before.size)
      throw new Error("X media changed while it was materialized");
    const materialized = new Uint8Array(bytes);
    return Object.freeze({
      bytes: mediaType === "image/png" ? scrubXUploadImage(materialized, "image/png") : materialized,
      mediaType
    });
  } finally {
    await handle.close();
  }
}
function xMediaId(value, label) {
  const id = requiredString2(value, label, 20);
  if (!/^[1-9][0-9]{0,19}$/u.test(id)) {
    throw new Error(`${label} must be an exact X media ID`);
  }
  return id;
}
function exactResponseKeys(value, required, optional, label) {
  const keys = new Set(Object.keys(value));
  for (const name of required) {
    if (!keys.delete(name))
      throw new Error(`${label} omitted ${name}`);
  }
  for (const name of optional)
    keys.delete(name);
  if (keys.size > 0)
    throw new Error(`${label} contained unsupported fields`);
}
function xMediaKey(value, id, label) {
  const key = requiredString2(value, label, 64);
  if (!/^[1-9][0-9]{0,2}_[1-9][0-9]{0,19}$/u.test(key) || !key.endsWith(`_${id}`)) {
    throw new Error(`${label} did not bind the initialized media ID`);
  }
  return key;
}
function parseXMediaInit(value, expectedSize, mediaType) {
  const response = record2(value, "X media INIT response");
  exactResponseKeys(response, ["expires_after_secs", "media_id", "media_id_string", "media_key"], [], "X media INIT response");
  if (typeof response.media_id !== "number" || !Number.isFinite(response.media_id) || response.media_id < 1) {
    throw new Error("X media INIT response media_id was invalid");
  }
  if (!Number.isSafeInteger(response.expires_after_secs) || response.expires_after_secs < 1 || response.expires_after_secs > 7 * 24 * 60 * 60)
    throw new Error("X media INIT response expiry was invalid");
  const id = xMediaId(response.media_id_string, "X media INIT response media_id_string");
  const key = xMediaKey(response.media_key, id, "X media INIT response media_key");
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 1 || expectedSize > xMediaMaxBytes(mediaType)) {
    throw new Error("X media INIT expected size was invalid");
  }
  return Object.freeze({ id, key, mediaType });
}
function parseXMediaProcessingInfo(value, label) {
  const processing = record2(value, label);
  exactResponseKeys(processing, ["state"], ["check_after_secs", "error", "progress_percent"], label);
  if (processing.state !== "pending" && processing.state !== "in_progress" && processing.state !== "succeeded" && processing.state !== "failed")
    throw new Error(`${label} contained an unsupported state`);
  const check = processing.check_after_secs;
  if (check !== undefined && (!Number.isSafeInteger(check) || check < 0 || check > 60))
    throw new Error(`${label} contained an invalid check_after_secs`);
  if (processing.progress_percent !== undefined && (!Number.isSafeInteger(processing.progress_percent) || processing.progress_percent < 0 || processing.progress_percent > 100))
    throw new Error(`${label} contained an invalid progress_percent`);
  if (processing.error !== undefined)
    record2(processing.error, `${label}.error`);
  return Object.freeze({
    state: processing.state,
    checkAfterSeconds: check === undefined ? 1 : check
  });
}
function parseXMediaFinalize(value, expected, expectedSize, expectedMediaType, onFailureStage) {
  onFailureStage?.("media-upload-finalize-response-object");
  const response = record2(value, "X media FINALIZE response");
  onFailureStage?.("media-upload-finalize-response-fields");
  exactResponseKeys(response, ["expires_after_secs", "media_id", "media_id_string", "size"], expectedMediaType === "video/mp4" ? ["media_key", "processing_info", "video"] : ["image", "media_key"], "X media FINALIZE response");
  onFailureStage?.("media-upload-finalize-media-id");
  if (xMediaId(response.media_id_string, "X media FINALIZE response media_id_string") !== expected.id) {
    throw new Error("X media FINALIZE response did not bind the initialized media ID");
  }
  if (response.media_key !== undefined) {
    onFailureStage?.("media-upload-finalize-media-key");
    if (xMediaKey(response.media_key, expected.id, "X media FINALIZE response media_key") !== expected.key) {
      throw new Error("X media FINALIZE response changed the initialized media key");
    }
  }
  onFailureStage?.("media-upload-finalize-size-type");
  if (!Number.isSafeInteger(response.size) || response.size < 1 || response.size > xMediaMaxBytes(expectedMediaType))
    throw new Error("X media FINALIZE response size was invalid");
  onFailureStage?.("media-upload-finalize-size-value");
  if (response.size !== expectedSize) {
    throw new Error("X media FINALIZE response did not bind the confirmed file size");
  }
  onFailureStage?.("media-upload-finalize-expiry");
  if (!Number.isSafeInteger(response.expires_after_secs) || response.expires_after_secs < 1 || response.expires_after_secs > 7 * 24 * 60 * 60)
    throw new Error("X media FINALIZE response expiry was invalid");
  if (response.image !== undefined) {
    onFailureStage?.("media-upload-finalize-image");
    const image = record2(response.image, "X media FINALIZE response image");
    exactResponseKeys(image, ["h", "image_type", "w"], [], "X media FINALIZE response image");
    if (image.image_type !== expectedMediaType || !Number.isSafeInteger(image.w) || !Number.isSafeInteger(image.h) || image.w < 1 || image.h < 1 || image.w > 1e5 || image.h > 1e5)
      throw new Error("X media FINALIZE response image metadata was invalid");
  }
  if (response.video !== undefined) {
    onFailureStage?.("media-upload-finalize-video");
    const video = record2(response.video, "X media FINALIZE response video");
    exactResponseKeys(video, ["video_type"], [], "X media FINALIZE response video");
    if (video.video_type !== expectedMediaType) {
      throw new Error("X media FINALIZE response video metadata was invalid");
    }
  }
  if (response.processing_info === undefined)
    return null;
  onFailureStage?.("media-upload-finalize-processing");
  return parseXMediaProcessingInfo(response.processing_info, "X media FINALIZE response processing_info");
}
function xMediaUploadUrl(command, values) {
  const url = new URL("/i/media/upload.json", X_UPLOAD_ORIGIN);
  url.searchParams.set("command", command);
  if (command === "INIT") {
    const mediaType = values.mediaType;
    if (mediaType !== "image/png" && mediaType !== "video/mp4") {
      throw new Error("X media INIT request escaped its reviewed contract");
    }
    if (!Number.isSafeInteger(values.totalBytes) || values.totalBytes < 1 || values.totalBytes > xMediaMaxBytes(mediaType) || values.id !== undefined || values.segmentIndex !== undefined)
      throw new Error("X media INIT request escaped its reviewed contract");
    url.searchParams.set("total_bytes", String(values.totalBytes));
    url.searchParams.set("media_type", mediaType);
    url.searchParams.set("media_category", xMediaCategory(mediaType));
  } else {
    const id = xMediaId(values.id, `X media ${command} media ID`);
    url.searchParams.set("media_id", id);
    if (command === "APPEND") {
      if (!Number.isSafeInteger(values.segmentIndex) || values.segmentIndex < 0 || values.segmentIndex > MAX_X_VIDEO_UPLOAD_CHUNKS - 1 || values.totalBytes !== undefined || values.mediaType !== undefined)
        throw new Error("X media APPEND request escaped its reviewed contract");
      url.searchParams.set("segment_index", String(values.segmentIndex));
    } else if (values.segmentIndex !== undefined || values.totalBytes !== undefined || values.mediaType !== undefined)
      throw new Error(`X media ${command} request escaped its reviewed contract`);
  }
  return url;
}
function multipartMediaChunk(chunk, segmentIndex, mediaType) {
  const digest = createHash("sha256").update(chunk).update(`:${segmentIndex}`).digest("hex").slice(0, 32);
  const boundary = `wrench-x-media-${digest}`;
  const boundaryBytes = Buffer.from(boundary, "ascii");
  if (Buffer.from(chunk).includes(boundaryBytes)) {
    throw new Error("X media chunk collided with its deterministic multipart boundary");
  }
  const filename = xMediaUploadName(mediaType);
  const prefix = Buffer.from(`--${boundary}\r
Content-Disposition: form-data; name="media"; filename="${filename}"\r
Content-Type: ${mediaType}\r
\r
`, "utf8");
  const suffix = Buffer.from(`\r
--${boundary}--\r
`, "ascii");
  return Object.freeze({
    body: new Uint8Array(Buffer.concat([prefix, Buffer.from(chunk), suffix])),
    contentType: `multipart/form-data; boundary=${boundary}`
  });
}
function xUploadHeaders(bootstrap, contentType) {
  if (contentType === undefined)
    return xHeaders(bootstrap, false);
  const fixed = enforceXWebHeaderSinkPolicy({
    source: "code",
    sink: "network-request",
    headers: { "content-type": contentType }
  }).values;
  return { ...xHeaders(bootstrap, false), ...fixed };
}
function parseXMediaStatus(value, expected) {
  const response = record2(value, "X media STATUS response");
  exactResponseKeys(response, ["media_id_string", "processing_info"], ["expires_after_secs", "media_id", "media_key", "size", "video"], "X media STATUS response");
  if (xMediaId(response.media_id_string, "X media STATUS response media_id_string") !== expected.id) {
    throw new Error("X media STATUS response did not bind the initialized media ID");
  }
  if (response.media_key !== undefined) {
    if (xMediaKey(response.media_key, expected.id, "X media STATUS response media_key") !== expected.key) {
      throw new Error("X media STATUS response changed the initialized media key");
    }
  }
  return parseXMediaProcessingInfo(response.processing_info, "X media STATUS response processing_info");
}
async function waitForXMediaProcessing(uploadClient, bootstrap, initialized, initial, sleep, onFailureStage) {
  let current = initial;
  if (current === null || current.state === "succeeded")
    return;
  if (current.state === "failed")
    throw new Error("X media processing failed");
  const deadline = Date.now() + MAX_X_MEDIA_STATUS_WAIT_MS;
  for (let attempt = 0;attempt < MAX_X_MEDIA_STATUS_POLLS; attempt += 1) {
    const remaining = deadline - Date.now();
    if (remaining < 1)
      break;
    const delay = current.checkAfterSeconds * 1000;
    if (delay >= remaining)
      break;
    if (delay > 0)
      await sleep(delay);
    onFailureStage?.("media-upload-status");
    current = parseXMediaStatus(await uploadClient.requestJson({
      url: xMediaUploadUrl("STATUS", { id: initialized.id }),
      method: "GET",
      headers: xUploadHeaders(bootstrap),
      expectedStatuses: [200],
      maxBytes: MAX_X_UPLOAD_RESPONSE_BYTES
    }), initialized);
    if (current.state === "succeeded")
      return;
    if (current.state === "failed")
      throw new Error("X media processing failed");
  }
  throw new Error("X media processing did not complete within the bounded polling window");
}
async function uploadXMedia(bootstrap, media, onFailureStage) {
  onFailureStage?.("media-upload-session");
  const uploadClient = await createWebSessionClient(X_UPLOAD_ORIGIN, bootstrap.auth, {
    timeoutMs: bootstrap.timeoutMs,
    ...bootstrap.signal === undefined ? {} : { signal: bootstrap.signal },
    ...bootstrap.operationDeadline === undefined ? {} : { operationDeadline: bootstrap.operationDeadline },
    ...bootstrap.dependencies === undefined ? {} : { dependencies: bootstrap.dependencies }
  });
  if (webSessionCookie(uploadClient.cookies, "ct0") !== bootstrap.csrf) {
    throw new Error("X upload origin no longer matched the confirmed session");
  }
  onFailureStage?.("media-upload-init");
  const initialized = parseXMediaInit(await uploadClient.requestJson({
    url: xMediaUploadUrl("INIT", {
      totalBytes: media.bytes.byteLength,
      mediaType: media.mediaType
    }),
    method: "POST",
    headers: xUploadHeaders(bootstrap),
    expectedStatuses: [200, 202],
    maxBytes: MAX_X_UPLOAD_RESPONSE_BYTES
  }), media.bytes.byteLength, media.mediaType);
  const maxChunks = media.mediaType === "video/mp4" ? MAX_X_VIDEO_UPLOAD_CHUNKS : MAX_X_IMAGE_UPLOAD_CHUNKS;
  const chunks = Math.ceil(media.bytes.byteLength / X_UPLOAD_CHUNK_BYTES);
  if (chunks < 1 || chunks > maxChunks) {
    throw new Error(media.mediaType === "video/mp4" ? "X video exceeded the reviewed upload chunk count" : "X image exceeded the reviewed upload chunk count");
  }
  onFailureStage?.("media-upload-append");
  for (let segmentIndex = 0;segmentIndex < chunks; segmentIndex += 1) {
    const start = segmentIndex * X_UPLOAD_CHUNK_BYTES;
    const chunk = media.bytes.subarray(start, Math.min(media.bytes.byteLength, start + X_UPLOAD_CHUNK_BYTES));
    const multipart = multipartMediaChunk(chunk, segmentIndex, media.mediaType);
    const appended = await uploadClient.requestStatus({
      url: xMediaUploadUrl("APPEND", { id: initialized.id, segmentIndex }),
      method: "POST",
      headers: xUploadHeaders(bootstrap, multipart.contentType),
      body: multipart.body,
      expectedStatuses: [204]
    });
    if (appended.location !== null) {
      throw new Error("X media APPEND response added an unsupported location");
    }
  }
  onFailureStage?.("media-upload-finalize-request");
  const finalized = await uploadClient.requestJson({
    url: xMediaUploadUrl("FINALIZE", { id: initialized.id }),
    method: "POST",
    headers: xUploadHeaders(bootstrap),
    expectedStatuses: [200, 201],
    maxBytes: MAX_X_UPLOAD_RESPONSE_BYTES
  });
  const processing = parseXMediaFinalize(finalized, initialized, media.bytes.byteLength, media.mediaType, onFailureStage);
  if (media.mediaType === "video/mp4") {
    await waitForXMediaProcessing(uploadClient, bootstrap, initialized, processing, bootstrap.dependencies?.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))), onFailureStage);
  }
  return initialized;
}
function xArticleUploadHeaders(bootstrap) {
  const fixed = enforceXWebHeaderSinkPolicy({
    source: "code",
    sink: "network-request",
    headers: {
      accept: "application/json",
      "x-twitter-auth-type": "OAuth2Session",
      "x-twitter-active-user": "yes"
    }
  }).values;
  const session = enforceXWebHeaderSinkPolicy({
    source: "in-origin-session",
    sink: "network-request",
    headers: {
      authorization: `Bearer ${bootstrap.bearer}`,
      "x-csrf-token": bootstrap.csrf
    }
  }).values;
  return { ...fixed, ...session, origin: X_ORIGIN2, referer: `${X_ORIGIN2}/compose/articles` };
}
function articleMediaUploadUrl(origin, command, values) {
  const url = new URL("/i/media/upload.json", origin);
  url.searchParams.set("command", command);
  for (const [name, value] of Object.entries(values))
    url.searchParams.set(name, value);
  const expected = command === "INIT" ? ["command", "media_category", "media_type", "total_bytes"] : command === "APPEND" ? ["command", "media_id", "segment_index"] : ["command", "media_id"];
  if (Object.keys(Object.fromEntries(url.searchParams)).sort().join(",") !== expected.sort().join(",")) {
    throw new Error("X Article media upload request left its reviewed query shape");
  }
  return url;
}
function articleUploadMediaId(value, label) {
  const response = record2(value, label);
  const id = response.media_id_string;
  if (typeof id !== "string" || !/^[0-9]{1,19}$/u.test(id)) {
    throw new Error(`${label} did not return one exact media ID`);
  }
  if (response.expires_after_secs !== undefined && (!Number.isSafeInteger(response.expires_after_secs) || response.expires_after_secs < 1))
    throw new Error(`${label} returned an invalid expiry`);
  return id;
}
function containsBytes(haystack, needle) {
  if (needle.length === 0 || needle.length > haystack.length)
    return false;
  outer:
    for (let index = 0;index <= haystack.length - needle.length; index += 1) {
      for (let offset = 0;offset < needle.length; offset += 1) {
        if (haystack[index + offset] !== needle[offset])
          continue outer;
      }
      return true;
    }
  return false;
}
function articleMediaMultipart(image) {
  const digest = createHash("sha256").update(image.bytes).digest("hex");
  let boundary = `----wrench-x-article-${digest}`;
  const encoder = new TextEncoder;
  for (let suffix2 = 0;containsBytes(image.bytes, encoder.encode(boundary)); suffix2 += 1) {
    if (suffix2 >= 16)
      throw new Error("X Article media could not bind a safe multipart boundary");
    boundary = `----wrench-x-article-${digest}-${suffix2 + 1}`;
  }
  const prefix = encoder.encode(`--${boundary}\r
Content-Disposition: form-data; name="media"; filename="blob"\r
Content-Type: ${image.mediaType}\r
\r
`);
  const suffix = encoder.encode(`\r
--${boundary}--\r
`);
  const body = new Uint8Array(prefix.length + image.bytes.length + suffix.length);
  body.set(prefix, 0);
  body.set(image.bytes, prefix.length);
  body.set(suffix, prefix.length + image.bytes.length);
  return Object.freeze({ body, contentType: `multipart/form-data; boundary=${boundary}` });
}
async function uploadArticleImage(bootstrap, client, image, beforeInit) {
  const headers = xArticleUploadHeaders(bootstrap);
  const initUrl = articleMediaUploadUrl(client.origin, "INIT", {
    total_bytes: `${image.bytes.byteLength}`,
    media_type: image.mediaType,
    media_category: "tweet_image"
  });
  await beforeInit();
  const mediaId = await xArticleImageUploadStep("init", async () => {
    const init = await client.requestJson({
      url: initUrl,
      method: "POST",
      headers,
      maxBytes: MAX_ARTICLE_MEDIA_RESPONSE_BYTES,
      expectedStatuses: [200, 201, 202]
    });
    return articleUploadMediaId(init, "X media INIT response");
  });
  const multipart = articleMediaMultipart(image);
  await xArticleImageUploadStep("append", () => client.requestStatus({
    url: articleMediaUploadUrl(client.origin, "APPEND", {
      media_id: mediaId,
      segment_index: "0"
    }),
    method: "POST",
    headers: { ...headers, "content-type": multipart.contentType },
    body: multipart.body,
    expectedStatuses: [200, 204]
  }).then(() => {
    return;
  }));
  await xArticleImageUploadStep("finalize", async () => {
    const finalized = await client.requestJson({
      url: articleMediaUploadUrl(client.origin, "FINALIZE", { media_id: mediaId }),
      method: "POST",
      headers,
      maxBytes: MAX_ARTICLE_MEDIA_RESPONSE_BYTES,
      expectedStatuses: [200, 201, 202]
    });
    if (articleUploadMediaId(finalized, "X media FINALIZE response") !== mediaId) {
      throw new Error("X media FINALIZE response changed the uploaded media ID");
    }
    if (record2(finalized, "X media FINALIZE response").processing_info !== undefined) {
      throw new Error("X image upload unexpectedly entered an unreviewed processing branch");
    }
  });
  return mediaId;
}

class XArticleImageUploadStepError extends Error {
  category;
  step;
  constructor(step, category, cause) {
    super(`X Article image ${step} step failed (${category})`, { cause });
    this.name = "XArticleImageUploadStepError";
    this.step = step;
    this.category = category;
  }
}
async function xArticleImageUploadStep(step, operation) {
  try {
    return await operation();
  } catch (error) {
    throw new XArticleImageUploadStepError(step, xWebArticleImageFailureCategory(error), error);
  }
}
function xWebArticleImageFailureCategory(error) {
  if (error instanceof XArticleImageUploadStepError) {
    return `media-${error.step}-${error.category}`;
  }
  const message = error instanceof Error ? error.message : "";
  const response = /authenticated web (?:API|API request|request) returned unreviewed status(?:\/content type)? ([0-9]{3})(?:\/([A-Za-z0-9.+-]+\/[A-Za-z0-9.+-]+|missing))?/u.exec(message);
  if (response !== null) {
    const status = Number.parseInt(response[1], 10);
    if (status === 401 || status === 403)
      return "session-rejected";
    if (status === 400 || status === 413 || status === 415 || status === 422) {
      return `request-rejected-${status}`;
    }
    if (status === 429)
      return "provider-throttled";
    if (status >= 500)
      return "provider-unavailable";
    if (status !== 200)
      return "media-status-drift";
    if (response[2] === "text/plain")
      return "text-plain-response";
    if (response[2] === "text/html")
      return "html-response";
    if (response[2] === "application/octet-stream")
      return "binary-response";
    if (response[2] === "missing")
      return "missing-content-type";
    return "media-content-type-drift";
  }
  if (message.includes("X media INIT response"))
    return "media-init-response-drift";
  if (message.includes("X media FINALIZE response"))
    return "media-finalize-response-drift";
  if (message.includes("X articleentity_create_draft response contained provider errors")) {
    return "article-create-provider-errors";
  }
  if (message.includes("X articleentity_create_draft response.data must be an object")) {
    return "article-create-data-shape-drift";
  }
  if (message.includes("X articleentity_create_draft response.articleentity_create_draft must be an object")) {
    return "article-create-root-shape-drift";
  }
  if (message.includes("X articleentity_create_draft response.articleentity_create_draft.article_entity_results.result must be an object")) {
    return "article-create-result-shape-drift";
  }
  if (message.includes("X articleentity_create_draft response Article identifier")) {
    return "article-create-id-shape-drift";
  }
  if (message.includes("processing branch"))
    return "media-processing-required";
  if (message.includes("media upload session"))
    return "media-session-binding-drift";
  if (message.includes("failed before a reviewed response"))
    return "transport-failed";
  if (message.includes("deadline") || message.includes("cancel"))
    return "operation-interrupted";
  return "media-contract-step-failed";
}
function tweetMediaIds(legacy, expectedReadbackType) {
  const ids = [];
  for (const [name, value] of [
    ["entities", legacy.entities],
    ["extended_entities", legacy.extended_entities]
  ]) {
    if (value === undefined)
      continue;
    const container = record2(value, `X post ${name}`);
    if (container.media === undefined)
      continue;
    if (!Array.isArray(container.media) || container.media.length > 4) {
      throw new Error(`X post ${name}.media exceeded the reviewed attachment bound`);
    }
    ids.push(container.media.map((item, index) => {
      const media = record2(item, `X post ${name}.media[${index}]`);
      if (media.type !== expectedReadbackType) {
        throw new Error("X post readback contained an unsupported media type");
      }
      return xMediaId(media.id_str, `X post ${name}.media[${index}].id_str`);
    }));
  }
  if (ids.length === 0)
    return Object.freeze([]);
  const first = ids[0];
  if (ids.some((candidate) => canonicalJson(candidate) !== canonicalJson(first))) {
    throw new Error("X post media projections disagreed");
  }
  return Object.freeze(first);
}
function boundCreateTweetText(result, legacy) {
  if (isRecord2(result.note_tweet) && isRecord2(result.note_tweet.note_tweet_results) && isRecord2(result.note_tweet.note_tweet_results.result) && typeof result.note_tweet.note_tweet_results.result.text === "string") {
    return result.note_tweet.note_tweet_results.result.text;
  }
  return typeof legacy.full_text === "string" ? legacy.full_text : null;
}
function assertTweetBinding(value, expectedText, replyTo, quote, expectedAuthorId, expectedMediaId, expectedMediaType, label) {
  const result = unwrapTweet(value, `${label}.result`);
  const id = postId(result.rest_id, "X created post rest_id");
  const legacy = record2(result.legacy, `${label}.legacy`);
  const returnedText = boundCreateTweetText(result, legacy);
  if (returnedText !== expectedText)
    throw new Error("X created post response did not bind the confirmed text");
  if (legacy.user_id_str !== expectedAuthorId)
    throw new Error("X created post response did not bind the confirmed viewer");
  const returnedReply = typeof legacy.in_reply_to_status_id_str === "string" ? legacy.in_reply_to_status_id_str : null;
  if (returnedReply !== replyTo)
    throw new Error("X created post response did not bind the confirmed reply target");
  const returnedQuote = typeof legacy.quoted_status_id_str === "string" ? legacy.quoted_status_id_str : null;
  if (returnedQuote !== quote)
    throw new Error("X created post response did not bind the confirmed quote target");
  const mediaIds = expectedMediaType === null ? tweetMediaIds(legacy, "photo") : tweetMediaIds(legacy, xMediaReadbackType(expectedMediaType));
  if (expectedMediaId === null && mediaIds.length !== 0 || expectedMediaId !== null && (mediaIds.length !== 1 || mediaIds[0] !== expectedMediaId))
    throw new Error("X created post response did not bind the confirmed media upload");
  const bound = { id, url: `${X_ORIGIN2}/i/status/${id}` };
  rejectXTweetMadeWithAiLabel(result, bound);
  return bound;
}
function createdTweet(response, expectedText, replyTo, quote, expectedAuthorId, expectedMediaId, expectedMediaType) {
  const data = graphQlData2(response, "X CreateTweet response");
  const create = record2(data.create_tweet, "X CreateTweet response.create_tweet");
  const results = record2(create.tweet_results, "X CreateTweet response.tweet_results");
  return assertTweetBinding(results.result, expectedText, replyTo, quote, expectedAuthorId, expectedMediaId, expectedMediaType, "X CreateTweet response");
}
function createTweetVariables(text, replyTo, quote, mediaId) {
  return {
    tweet_text: text,
    dark_request: false,
    media: {
      media_entities: mediaId === null ? [] : [{ media_id: mediaId, tagged_users: [] }],
      possibly_sensitive: false
    },
    semantic_annotation_ids: [],
    ...replyTo === null ? {} : { reply: { in_reply_to_tweet_id: replyTo, exclude_reply_user_ids: [] } },
    ...quote === null ? {} : { attachment_url: `${X_ORIGIN2}/i/status/${quote}` }
  };
}
function articleEntityResult(response, rootName, label) {
  const data = graphQlData2(response, label);
  const root = record2(data[rootName], `${label}.${rootName}`);
  if (isRecord2(root.result))
    return record2(root.result, `${label}.${rootName}.result`);
  if (isRecord2(root.article_entity_results)) {
    const results = record2(root.article_entity_results, `${label}.${rootName}.article_entity_results`);
    return record2(results.result, `${label}.${rootName}.article_entity_results.result`);
  }
  return root;
}
function articleId(article, label) {
  const restId = article.rest_id;
  const entityId = article.id;
  return postId(typeof restId === "string" ? restId : entityId, `${label} Article identifier`);
}
function articleTitle(article, label) {
  const directTitle = typeof article.title === "string" ? article.title : null;
  const metadataTitle = isRecord2(article.metadata) && typeof article.metadata.title === "string" ? article.metadata.title : null;
  if (directTitle !== null && metadataTitle !== null && directTitle !== metadataTitle) {
    throw new Error(`${label} returned conflicting Article titles`);
  }
  const title = directTitle ?? metadataTitle;
  if (title === null)
    throw new Error(`${label} omitted the Article title`);
  return title;
}
function responseBoundArticle(response, rootName, expectedId, expectedTitle) {
  const article = articleEntityResult(response, rootName, `X ${rootName} response`);
  const id = articleId(article, `X ${rootName} response`);
  if (expectedId !== null && id !== expectedId) {
    throw new Error(`X ${rootName} response changed the confirmed Article draft`);
  }
  if (expectedTitle !== undefined && articleTitle(article, `X ${rootName} response`) !== expectedTitle) {
    throw new Error(`X ${rootName} response did not bind the confirmed title`);
  }
  return article;
}
function articleAuthorId(article) {
  const metadata = record2(article.metadata, "X Article metadata");
  const authorResults = record2(metadata.author_results, "X Article metadata.author_results");
  const author = record2(authorResults.result, "X Article metadata.author_results.result");
  return postId(author.rest_id, "X Article author rest_id");
}
function requirePrivateDraftArticle(article, expectedId, expectedViewerId) {
  if (articleId(article, "X Article readback") !== expectedId) {
    throw new Error("X Article readback changed the confirmed draft ID");
  }
  if (articleAuthorId(article) !== expectedViewerId) {
    throw new Error("X Article draft does not belong to the bound viewer");
  }
  const lifecycle = record2(article.lifecycle_state, "X Article lifecycle_state");
  if (lifecycle.lifecycle !== "Draft") {
    throw new Error("X Article target must remain an unpublished private draft");
  }
}
function normalizedArticleEntityKey(value, label) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_ARTICLE_BLOCKS) {
    return `${value}`;
  }
  if (typeof value === "string" && /^(?:0|[1-9][0-9]{0,3})$/u.test(value)) {
    return value;
  }
  throw new Error(`${label} is not one bounded Article entity key`);
}
function articleReadbackEntityKeyMap(values, blocks, rangesKey) {
  const known = new Set;
  values.forEach((value, index) => {
    const entity = record2(value, `X Article readback entity ${index}`);
    const source = normalizedArticleEntityKey(entity.key, `X Article readback entity ${index}.key`);
    if (known.has(source)) {
      throw new Error("X Article readback repeated one entity key");
    }
    known.add(source);
  });
  const result = new Map;
  blocks.forEach((value, blockIndex) => {
    const block = record2(value, `X Article readback block ${blockIndex + 1}`);
    const ranges = block[rangesKey];
    if (!Array.isArray(ranges)) {
      throw new Error("X Article readback block ranges changed shape");
    }
    ranges.forEach((value2) => {
      const range = record2(value2, "X Article readback entity range");
      const source = normalizedArticleEntityKey(range.key, "X Article readback entity range key");
      if (!known.has(source)) {
        throw new Error("X Article readback range referenced an unknown entity");
      }
      if (result.has(source)) {
        throw new Error("X Article readback repeated one entity reference");
      }
      result.set(source, `${result.size}`);
    });
  });
  if (result.size !== values.length) {
    throw new Error("X Article readback contained one unreferenced entity");
  }
  return result;
}
function orderedArticleReadbackEntities(values, keys) {
  return [...values].sort((left, right) => {
    const leftKey = normalizedArticleEntityKey(record2(left, "X Article readback entity").key, "X Article readback entity key");
    const rightKey = normalizedArticleEntityKey(record2(right, "X Article readback entity").key, "X Article readback entity key");
    return Number(keys.get(leftKey)) - Number(keys.get(rightKey));
  });
}
function remappedArticleEntityKey(value, keys, label) {
  const source = normalizedArticleEntityKey(value, label);
  const normalized = keys.get(source);
  if (normalized === undefined) {
    throw new Error(`${label} referenced an unknown Article entity`);
  }
  return normalized;
}
function normalizedArticleBlockData(value, label, blockText) {
  if (typeof blockText !== "string") {
    throw new Error(`${label} has no bounded block text`);
  }
  const data = record2(value, label);
  const keys = Object.keys(data);
  if (keys.length === 0)
    return Object.freeze({});
  if (keys.length !== 1 || keys[0] !== "urls" || !Array.isArray(data.urls)) {
    throw new Error(`${label} left the reviewed empty-or-urls shape`);
  }
  if (data.urls.length > 100) {
    throw new Error(`${label}.urls exceeded its reviewed bound`);
  }
  let previousEnd = 0;
  data.urls.forEach((value2, index) => {
    const url = record2(value2, `${label}.urls[${index}]`);
    const urlKeys = Object.keys(url).sort();
    if (urlKeys.join(",") !== "fromIndex,text,toIndex") {
      throw new Error(`${label}.urls[${index}] left its reviewed range shape`);
    }
    if (!Number.isSafeInteger(url.fromIndex) || !Number.isSafeInteger(url.toIndex) || url.fromIndex < previousEnd || url.fromIndex < 0 || url.toIndex <= url.fromIndex || url.toIndex > blockText.length) {
      throw new Error(`${label}.urls[${index}] escaped its block text`);
    }
    if (typeof url.text !== "string" || /[\0\r\n]/u.test(url.text) || blockText.slice(url.fromIndex, url.toIndex) !== url.text) {
      throw new Error(`${label}.urls[${index}].text did not bind its block range`);
    }
    previousEnd = url.toIndex;
  });
  return Object.freeze({});
}
function normalizedArticleBlockKey(value, index, observed) {
  if (typeof value !== "string" || !/^[a-z0-9]{5}$/u.test(value) || observed.has(value)) {
    throw new Error(`X Article readback block ${index + 1} has an invalid key`);
  }
  observed.add(value);
  return index.toString(36).padStart(5, "0");
}
function normalizeArticleContentReadback(value) {
  const state = record2(value, "X Article readback content_state");
  if (Array.isArray(state.entity_map)) {
    if (!Array.isArray(state.blocks)) {
      throw new Error("X Article readback omitted its rich content blocks");
    }
    const entityKeys2 = articleReadbackEntityKeyMap(state.entity_map, state.blocks, "entity_ranges");
    const observedBlockKeys2 = new Set;
    const blocks2 = state.blocks.map((value2, index) => {
      const block = record2(value2, `X Article readback block ${index + 1}`);
      if (!Array.isArray(block.entity_ranges) || !Array.isArray(block.inline_style_ranges)) {
        throw new Error("X Article readback block ranges changed shape");
      }
      return Object.freeze({
        data: normalizedArticleBlockData(block.data, `X Article readback block ${index + 1}.data`, block.text),
        text: block.text,
        key: normalizedArticleBlockKey(block.key, index, observedBlockKeys2),
        type: block.type,
        entity_ranges: Object.freeze(block.entity_ranges.map((range) => {
          const item = record2(range, "X Article readback entity range");
          return Object.freeze({
            key: Number(remappedArticleEntityKey(item.key, entityKeys2, "X Article readback entity range key")),
            offset: item.offset,
            length: item.length
          });
        })),
        inline_style_ranges: Object.freeze(block.inline_style_ranges.map((range) => {
          const item = record2(range, "X Article readback style range");
          return Object.freeze({
            length: item.length,
            offset: item.offset,
            style: item.style
          });
        }))
      });
    });
    const entity_map2 = orderedArticleReadbackEntities(state.entity_map, entityKeys2).map((value2, index) => {
      const entity = record2(value2, `X Article readback entity ${index}`);
      const sourceEntityKey = normalizedArticleEntityKey(entity.key, `X Article readback entity ${index}.key`);
      const entry = record2(entity.value, `X Article readback entity ${index}.value`);
      const data = record2(entry.data, `X Article readback entity ${index}.data`);
      const normalizedData = entry.type === "MEDIA" ? Object.freeze({
        ...data.caption === undefined || data.caption === null || data.caption === "" ? {} : { caption: data.caption },
        entity_key: (() => {
          const sourceDataKey = normalizedArticleEntityKey(data.entity_key, `X Article readback entity ${index}.data.entity_key`);
          if (sourceDataKey !== sourceEntityKey) {
            throw new Error(`X Article readback entity ${index} changed its media entity key`);
          }
          return `${index}`;
        })(),
        media_items: data.media_items
      }) : Object.freeze({ url: data.url });
      return Object.freeze({
        key: `${index}`,
        value: Object.freeze({
          data: normalizedData,
          type: entry.type,
          mutability: entry.mutability
        })
      });
    });
    const normalized2 = Object.freeze({
      blocks: Object.freeze(blocks2),
      entity_map: Object.freeze(entity_map2)
    });
    validateXWebRichArticleContentState(normalized2);
    return normalized2;
  }
  if (!Array.isArray(state.blocks) || !Array.isArray(state.entityMap)) {
    throw new Error("X Article readback omitted its rich content state");
  }
  const entityKeys = articleReadbackEntityKeyMap(state.entityMap, state.blocks, "entityRanges");
  const observedBlockKeys = new Set;
  const blocks = state.blocks.map((value2, index) => {
    const block = record2(value2, `X Article readback block ${index + 1}`);
    if (!Array.isArray(block.entityRanges) || !Array.isArray(block.inlineStyleRanges)) {
      throw new Error("X Article readback block ranges changed shape");
    }
    return Object.freeze({
      data: normalizedArticleBlockData(block.data, `X Article readback block ${index + 1}.data`, block.text),
      text: block.text,
      key: normalizedArticleBlockKey(block.key, index, observedBlockKeys),
      type: block.type,
      entity_ranges: Object.freeze(block.entityRanges.map((range) => {
        const item = record2(range, "X Article readback entity range");
        return Object.freeze({
          key: Number(remappedArticleEntityKey(item.key, entityKeys, "X Article readback entity range key")),
          offset: item.offset,
          length: item.length
        });
      })),
      inline_style_ranges: Object.freeze(block.inlineStyleRanges.map((range) => {
        const item = record2(range, "X Article readback style range");
        return Object.freeze({ length: item.length, offset: item.offset, style: item.style });
      }))
    });
  });
  const entity_map = orderedArticleReadbackEntities(state.entityMap, entityKeys).map((value2, index) => {
    const entity = record2(value2, `X Article readback entity ${index}`);
    const sourceEntityKey = normalizedArticleEntityKey(entity.key, `X Article readback entity ${index}.key`);
    const entry = record2(entity.value, `X Article readback entity ${index}.value`);
    const data = record2(entry.data, `X Article readback entity ${index}.data`);
    const normalizedData = entry.type === "MEDIA" ? Object.freeze({
      ...data.caption === undefined || data.caption === null || data.caption === "" ? {} : { caption: data.caption },
      entity_key: (() => {
        const sourceDataKey = normalizedArticleEntityKey(data.entityKey, `X Article readback entity ${index}.data.entityKey`);
        if (sourceDataKey !== sourceEntityKey) {
          throw new Error(`X Article readback entity ${index} changed its media entity key`);
        }
        return `${index}`;
      })(),
      media_items: Array.isArray(data.mediaItems) ? Object.freeze(data.mediaItems.map((value3) => {
        const item = record2(value3, "X Article readback media item");
        return Object.freeze({
          local_media_id: item.localMediaId,
          media_category: item.mediaCategory,
          media_id: item.mediaId
        });
      })) : data.mediaItems
    }) : Object.freeze({ url: data.url });
    return Object.freeze({
      key: `${index}`,
      value: Object.freeze({
        data: normalizedData,
        type: entry.type,
        mutability: entry.mutability
      })
    });
  });
  const normalized = Object.freeze({ blocks: Object.freeze(blocks), entity_map: Object.freeze(entity_map) });
  validateXWebRichArticleContentState(normalized);
  return normalized;
}
async function readArticleDraft(bootstrap, id) {
  const descriptor = await resolveDescriptor(bootstrap, "ArticleEntityResultByRestId", "query");
  const response = await graphQl(bootstrap, descriptor, { articleEntityId: id }, "GET");
  return responseBoundArticle(response, "article_result_by_rest_id", id);
}
function projectPrivateArticleDraftRead(article, expectedId, expectedViewerId) {
  requirePrivateDraftArticle(article, expectedId, expectedViewerId);
  const title = articleTitle(article, "X private Article draft readback");
  if (title.length < 1 || title.length > 100 || /[\0\r\n]/u.test(title)) {
    throw new Error("X private Article draft title must be one bounded plain-text line");
  }
  return Object.freeze({
    provider: "x",
    operation: "articles.read",
    article: Object.freeze({
      id: expectedId,
      ownerId: expectedViewerId,
      kind: "private-draft",
      lifecycle: "Draft",
      published: false,
      title,
      content: normalizeArticleContentReadback(article.content_state)
    })
  });
}
async function executePrivateArticleDraftRead(bootstrap, recipe, input, auth) {
  if (recipe.site !== "x" || recipe.action !== "articles.read" || recipe.contractVersion !== 2) {
    throw new Error("X private Article draft reads support only articles.read@2");
  }
  const id = postId(input.article_id, "input.article_id");
  const currentViewer = await requireBoundViewer(bootstrap, auth);
  const output = projectPrivateArticleDraftRead(await readArticleDraft(bootstrap, id), id, currentViewer.id);
  return {
    status: "succeeded",
    output,
    finalUrl: `${X_ORIGIN2}/compose/articles/edit/${id}`,
    dispatchStarted: false,
    dispatch: { planned: 0, started: 0, verified: 0 }
  };
}
function verifyFinalRichArticle(article, expected) {
  requirePrivateDraftArticle(article, expected.id, expected.viewerId);
  if (articleTitle(article, "X Article readback") !== expected.title) {
    throw new Error("X Article readback did not bind the confirmed title");
  }
  const content = normalizeArticleContentReadback(article.content_state);
  if (canonicalJson(content) !== canonicalJson(expected.contentState)) {
    throw new Error("X Article readback did not bind the confirmed rich content state");
  }
}
function dispatchEvent(id, index, planned, started, verified) {
  return { id, index, progress: { planned, started, verified } };
}
async function publishOne(bootstrap, text, replyTo, quote, media, authorId, mutationOperation, sleep, afterProviderAcceptedMutationTarget, beforeRequest, onFailureStage) {
  onFailureStage?.("post-request-preparation");
  const descriptor = await resolveDescriptor(bootstrap, "CreateTweet", "mutation");
  const response = await graphQl(bootstrap, descriptor, createTweetVariables(text, replyTo, quote, media?.id ?? null), "POST", undefined, mutationOperation, beforeRequest);
  onFailureStage?.("create-response-binding");
  const created = createdTweet(response, text, replyTo, quote, authorId, media?.id ?? null, media?.mediaType ?? null);
  onFailureStage?.("accepted-target-recording");
  await afterProviderAcceptedMutationTarget?.({
    ...created,
    mediaId: media?.id ?? null
  });
  if (mutationOperation !== "posts.publish")
    return created;
  onFailureStage?.("independent-readback");
  const readback = await waitForTweetPublishReadback(bootstrap, created.id, sleep);
  const rebound = assertTweetBinding(readback, text, replyTo, quote, authorId, media?.id ?? null, media?.mediaType ?? null, "X independent post readback");
  if (rebound.id !== created.id) {
    throw new Error("X independent post readback changed the created post ID");
  }
  return created;
}
function rejectUnsupportedPostBranches(input) {
  for (const field of ["made_with_ai", "content_disclosure", "ai_generated_disclosure", "semantic_annotation_ids"]) {
    if (input[field] !== undefined) {
      throw new Error(`X posts.publish ${field} is outside the reviewed CreateTweet contract`);
    }
  }
  if (input.root_media !== undefined) {
    throw new Error("X internal root_media upload requires a separately reviewed thread contract");
  }
  const replySettings = optionalStringInput(input, "reply_settings");
  if (replySettings !== undefined && replySettings !== "everyone") {
    throw new Error("X restricted reply settings require a separately reviewed conversation-control contract");
  }
}
async function executePublish(bootstrap, recipe, input, auth, options) {
  rejectUnsupportedPostBranches(input);
  const currentViewer = await requireBoundViewer(bootstrap, auth);
  const action = recipe.action;
  if (action !== "posts.publish" && (input.media !== undefined || input.media_type !== undefined))
    throw new Error("X media upload is reviewed only for posts.publish");
  const boundMedia = action === "posts.publish" ? await readBoundXMedia(input, options.fileResolver, bootstrap.operationDeadline) : null;
  const texts = action === "threads.publish" ? threadTexts(input) : [requiredString2(input.body, "input.body", MAX_X_CREATE_TWEET_TEXT_LENGTH)];
  const planned = texts.length;
  const posts = [];
  let started = 0;
  let verified = 0;
  let failureStage = "post-request-preparation";
  let previous = action === "replies.create" ? postId(input.post_id, "input.post_id") : null;
  const quote = action === "posts.quote" ? postId(input.post_id, "input.post_id") : null;
  try {
    for (const [offset, text] of texts.entries()) {
      const index = offset + 1;
      const id = action === "threads.publish" ? `${action}[${index}]` : action;
      let media = null;
      const beforeRequest = async () => {
        failureStage = "dispatch-admission";
        await options.beforeDispatch?.(dispatchEvent(id, index, planned, started, verified));
        started = index;
        failureStage = "post-dispatch";
      };
      if (boundMedia !== null) {
        failureStage = "viewer-binding-before-media-upload";
        const rebound = await requireBoundViewer(bootstrap, auth);
        if (rebound.id !== currentViewer.id) {
          throw new Error("X viewer changed during media dispatch preparation");
        }
        failureStage = "media-upload-session";
        media = await uploadXMedia(bootstrap, boundMedia, (stage) => {
          failureStage = stage;
        });
        failureStage = "viewer-binding-after-media-upload";
        const afterUpload = await requireBoundViewer(bootstrap, auth);
        if (afterUpload.id !== currentViewer.id) {
          throw new Error("X viewer changed after media upload");
        }
      }
      const post = await publishOne(bootstrap, text, previous, quote, media, currentViewer.id, action === "threads.publish" && offset > 0 ? "threads.reply" : action, bootstrap.dependencies?.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))), options.afterProviderAcceptedMutationTarget === undefined ? undefined : (accepted) => options.afterProviderAcceptedMutationTarget({
        id,
        index,
        target: {
          schemaVersion: 1,
          identifier: canonicalJson({
            postId: accepted.id,
            mediaId: accepted.mediaId
          })
        }
      }), beforeRequest, (stage) => {
        failureStage = stage;
      });
      posts.push(post);
      previous = post.id;
      verified = index;
      failureStage = "verification-recording";
      await options.afterDispatchVerified?.(dispatchEvent(id, index, planned, started, verified));
    }
    return {
      status: "succeeded",
      output: { posts },
      finalUrl: posts.at(-1)?.url ?? X_ORIGIN2,
      dispatchStarted: started > 0,
      dispatch: { planned, started, verified }
    };
  } catch (error) {
    if (error instanceof XUnlabeledCopyPolicyError) {
      const labeled = error.post === undefined ? posts : [...posts, error.post];
      return {
        status: "indeterminate",
        output: labeled.length === 0 ? null : { posts: labeled },
        finalUrl: error.post?.url ?? posts.at(-1)?.url ?? null,
        dispatchStarted: started > 0,
        dispatch: { planned, started, verified },
        error: X_UNLABELED_COPY_POLICY_ERROR
      };
    }
    const status = started > verified ? "indeterminate" : verified > 0 ? "partial" : "failed";
    return {
      status,
      output: posts.length === 0 ? null : { posts },
      finalUrl: posts.at(-1)?.url ?? null,
      dispatchStarted: started > 0,
      dispatch: { planned, started, verified },
      error: status === "indeterminate" ? `X may have accepted the current post dispatch; failure stage: ${failureStage}; reconcile before retrying` : status === "partial" ? `X verified only part of the confirmed post workflow; failure stage: ${failureStage}; inspect the verified results before retrying` : `X post preparation failed before public post submission; failure stage: ${failureStage}; retry with a fresh confirmed plan`
    };
  }
}
async function executeArticleDraftSave(bootstrap, recipe, input, auth, options) {
  if (recipe.contractVersion !== 1 && recipe.contractVersion !== 2 || recipe.action !== "articles.draft.save") {
    throw new Error("X Article draft saving supports only articles.draft.save@1 or @2");
  }
  const title = requiredString2(input.title, "input.title", MAX_ARTICLE_TITLE_CHARACTERS);
  if (/[\0\r\n]/u.test(title))
    throw new Error("input.title must be one plain-text line");
  const document = recipe.contractVersion === 1 ? parseArticleDraftDocument(input.document, {
    maximumBlocks: MAX_ARTICLE_BLOCKS,
    maximumCharacters: MAX_ARTICLE_BODY_CHARACTERS
  }) : parseArticleDraftDocumentV2(input.document, {
    maximumBlocks: MAX_ARTICLE_BLOCKS,
    maximumCharacters: MAX_ARTICLE_BODY_CHARACTERS,
    maximumImages: MAX_ARTICLE_INLINE_IMAGES
  });
  if (recipe.contractVersion === 2 && document.blocks.some((block) => block.type === "image" && block.altText !== undefined))
    throw new Error("X Article inline-image alternative text remains capture-required");
  const images = recipe.contractVersion === 1 ? Object.freeze([]) : await materializeArticleDraftImages(input.inline_images, options.fileResolver, {
    maximumBytes: MAX_ARTICLE_IMAGE_BYTES,
    maximumImages: MAX_ARTICLE_INLINE_IMAGES,
    ...bootstrap.operationDeadline === undefined ? {} : { operationDeadline: bootstrap.operationDeadline }
  });
  if (recipe.contractVersion === 2 && document.blocks.filter((block) => block.type === "image").length !== images.length)
    throw new Error("input.inline_images must align one-to-one with input.document image blocks");
  await assertCurrentArticleRichContract(bootstrap, recipe.contractVersion === 2);
  const currentViewer = await requireBoundViewer(bootstrap, auth);
  const requestedDraftId = input.draft_id === undefined ? null : postId(input.draft_id, "input.draft_id");
  if (requestedDraftId !== null) {
    requirePrivateDraftArticle(await readArticleDraft(bootstrap, requestedDraftId), requestedDraftId, currentViewer.id);
  }
  const planned = images.length + (requestedDraftId === null ? 1 : 2);
  let started = 0;
  let verified = 0;
  let draftId = requestedDraftId;
  let contentState = recipe.contractVersion === 1 ? buildXWebRichArticleContentState(document) : null;
  const uploadedImageIds = [];
  let nextIndex = 0;
  let failureStage = "binding the Article mutation session";
  const begin = async (id) => {
    const index = nextIndex + 1;
    await options.beforeDispatch?.(dispatchEvent(id, index, planned, started, verified));
    nextIndex = index;
    started = index;
    return index;
  };
  const complete = async (id, index) => {
    await options.afterDispatchVerified?.(dispatchEvent(id, index, planned, started, index));
    verified = index;
  };
  try {
    if (images.length > 0) {
      failureStage = "binding the media upload session";
      const uploadClient = await createWebSessionClient(articleUploadOrigin(bootstrap), auth, {
        timeoutMs: bootstrap.timeoutMs,
        ...bootstrap.signal === undefined ? {} : { signal: bootstrap.signal },
        ...bootstrap.operationDeadline === undefined ? {} : { operationDeadline: bootstrap.operationDeadline },
        ...bootstrap.dependencies === undefined ? {} : { dependencies: bootstrap.dependencies }
      });
      if (webSessionCookie(uploadClient.cookies, "ct0") !== bootstrap.csrf) {
        throw new Error("X media upload session did not bind the Article session CSRF realm");
      }
      for (const [offset, image] of images.entries()) {
        const id = `articles.media.inline[${offset + 1}]`;
        failureStage = `uploading inline image ${offset + 1}`;
        let index = 0;
        const mediaId = await uploadArticleImage(bootstrap, uploadClient, image, async () => {
          index = await begin(id);
        });
        uploadedImageIds.push(mediaId);
        await complete(id, index);
      }
      contentState = buildXWebRichArticleContentState(document, uploadedImageIds);
    }
    if (contentState === null) {
      throw new Error("X Article inline images did not produce a verified content state");
    }
    if (draftId === null) {
      const id = "articles.create";
      failureStage = "resolving the Article create mutation";
      const descriptor = await resolveDescriptor(bootstrap, "ArticleEntityDraftCreate", "mutation");
      let index = 0;
      failureStage = "preparing the Article create mutation";
      const response = await graphQl(bootstrap, descriptor, { content_state: contentState, title }, "POST", undefined, "articles.create", async () => {
        index = await begin(id);
      });
      failureStage = "binding the Article create response";
      const article = responseBoundArticle(response, "articleentity_create_draft", null);
      draftId = articleId(article, "X created Article draft response");
      failureStage = "reading back the created Article";
      const finalArticle = await readArticleDraft(bootstrap, draftId);
      failureStage = "verifying the created Article readback";
      verifyFinalRichArticle(finalArticle, {
        id: draftId,
        viewerId: currentViewer.id,
        title,
        contentState
      });
      await complete(id, index);
    } else {
      const titleId = "articles.title";
      failureStage = "resolving the Article title mutation";
      const titleDescriptor = await resolveDescriptor(bootstrap, "ArticleEntityUpdateTitle", "mutation");
      let titleIndex = 0;
      failureStage = "preparing the Article title mutation";
      const titleResponse = await graphQl(bootstrap, titleDescriptor, { articleEntityId: draftId, title }, "POST", undefined, "articles.title", async () => {
        titleIndex = await begin(titleId);
      });
      responseBoundArticle(titleResponse, "articleentity_update_title", draftId, title);
      await complete(titleId, titleIndex);
      const contentId = "articles.content";
      failureStage = "resolving the Article content mutation";
      const contentDescriptor = await resolveDescriptor(bootstrap, "ArticleEntityUpdateContent", "mutation");
      let contentIndex = 0;
      failureStage = "preparing the Article content mutation";
      const contentResponse = await graphQl(bootstrap, contentDescriptor, { content_state: contentState, article_entity: draftId }, "POST", undefined, "articles.content", async () => {
        contentIndex = await begin(contentId);
      });
      responseBoundArticle(contentResponse, "articleentity_update_content_state", draftId);
      const finalArticle = await readArticleDraft(bootstrap, draftId);
      verifyFinalRichArticle(finalArticle, {
        id: draftId,
        viewerId: currentViewer.id,
        title,
        contentState
      });
      await complete(contentId, contentIndex);
    }
    if (draftId === null || nextIndex !== planned || verified !== planned) {
      throw new Error("X Article draft workflow did not complete its exact dispatch schedule");
    }
    const url = `${X_ORIGIN2}/compose/articles/edit/${draftId}`;
    return {
      status: "succeeded",
      output: {
        provider: "x",
        operation: "articles.draft.save",
        published: false,
        mode: "draft",
        draftId,
        title,
        documentSchemaVersion: recipe.contractVersion,
        ...recipe.contractVersion === 1 ? {} : { inlineImageCount: uploadedImageIds.length },
        url
      },
      finalUrl: url,
      dispatchStarted: started > 0,
      dispatch: { planned, started, verified }
    };
  } catch (error) {
    const url = draftId === null ? null : `${X_ORIGIN2}/compose/articles/edit/${draftId}`;
    return {
      status: started > verified ? "indeterminate" : verified > 0 ? "partial" : "failed",
      output: null,
      finalUrl: url,
      dispatchStarted: started > 0,
      dispatch: { planned, started, verified },
      error: started > verified ? images.length > 0 ? `X may have accepted an inline-image upload or private Article dispatch while ${failureStage}; ${xWebArticleImageFailureCategory(error)}; its provider media IDs are not present in the confirmed input, so preserve the indeterminate run and do not retry` : requestedDraftId === null ? "X may have accepted the private Article create, but the confirmed input has no exact draft ID for safe reconciliation; preserve the indeterminate run and do not retry" : "X may have accepted the current private Article replacement dispatch; reconcile the exact existing draft before retrying" : verified > 0 ? "X verified only part of the confirmed private Article workflow; inspect the draft before retrying" : `X Article draft failed before remote submission while ${failureStage}`
    };
  }
}
async function executeDesiredState(bootstrap, recipe, input, auth, options) {
  await requireBoundViewer(bootstrap, auth);
  const id = postId(input.post_id, "input.post_id");
  const kind = recipe.action === "likes.set" ? "like" : recipe.action === "content.save" ? "bookmark" : "repost";
  const enabled = recipe.action === "likes.set" ? booleanInput(input, "liked") : recipe.action === "content.save" ? booleanInput(input, "saved") : booleanInput(input, "reposted");
  const operationName = kind === "like" ? enabled ? "FavoriteTweet" : "UnfavoriteTweet" : kind === "bookmark" ? enabled ? "CreateBookmark" : "DeleteBookmark" : enabled ? "CreateRetweet" : "DeleteRetweet";
  const variables = kind === "repost" && !enabled ? { source_tweet_id: id, dark_request: false } : kind === "repost" ? { tweet_id: id, dark_request: false } : { tweet_id: id };
  let started = 0;
  let verified = 0;
  try {
    const initial = await desiredStateReadback(bootstrap, id, kind);
    if (initial === enabled) {
      return {
        status: "succeeded",
        output: {
          effect: "already-satisfied",
          kind,
          enabled,
          postId: id
        },
        finalUrl: `${X_ORIGIN2}/i/status/${id}`,
        noOp: true,
        dispatchStarted: false,
        dispatch: { planned: 1, started: 0, verified: 0 }
      };
    }
    const descriptor = await resolveDescriptor(bootstrap, operationName, "mutation");
    const mutationOperation = `${kind === "bookmark" ? "bookmarks" : kind === "like" ? "likes" : "reposts"}.${enabled ? "enable" : "disable"}`;
    const response = await graphQl(bootstrap, descriptor, variables, "POST", undefined, mutationOperation, async () => {
      await options.beforeDispatch?.(dispatchEvent(recipe.action, 1, 1, 0, 0));
      started = 1;
    });
    validateXWebDesiredStateMutation({ kind, enabled, targetPostId: id, response });
    const actual = await desiredStateReadback(bootstrap, id, kind);
    if (actual !== enabled)
      throw new Error("X desired-state readback did not match the confirmed state");
    verified = 1;
    await options.afterDispatchVerified?.(dispatchEvent(recipe.action, 1, 1, 1, 1));
    return {
      status: "succeeded",
      output: { kind, enabled, postId: id },
      finalUrl: `${X_ORIGIN2}/i/status/${id}`,
      dispatchStarted: true,
      dispatch: { planned: 1, started, verified }
    };
  } catch {
    return {
      status: started > 0 ? "indeterminate" : "failed",
      output: null,
      finalUrl: `${X_ORIGIN2}/i/status/${id}`,
      dispatchStarted: started > 0,
      dispatch: { planned: 1, started, verified },
      error: started > 0 ? "X may have changed the requested state but exact readback was not verified; reconcile before retrying" : "X desired-state dispatch failed before submission"
    };
  }
}
async function executeXWebOperation(recipe, input, auth, options = {}) {
  if (recipe.action === "articles.read" && (recipe.site !== "x" || recipe.contractVersion !== 2)) {
    throw new Error("X private Article draft reads support only articles.read@2");
  }
  if (recipe.action === "posts.publish" || recipe.action === "threads.publish" || recipe.action === "replies.create" || recipe.action === "posts.quote") {
    rejectUnsupportedPostBranches(input);
  }
  let profileUrl = null;
  let bootstrap;
  try {
    if (recipe.action === "profiles.read") {
      profileUrl = `${X_ORIGIN2}/${normalizeXWebProfileHandle(input.handle)}`;
    }
    bootstrap = await bootstrapX(auth, recipe, options.dependencies, options);
  } catch (error) {
    if (recipe.action === "profiles.read") {
      return failedXProfileRead(error, profileUrl, "bootstrap");
    }
    if (recipe.action === "feeds.read") {
      return failedXFeedRead(error, input, "bootstrap");
    }
    throw error;
  }
  if (recipe.action === "feeds.read") {
    try {
      await requireBoundViewer(bootstrap, auth);
    } catch (error) {
      return failedXFeedRead(error, input, "identity");
    }
    try {
      const output = await readFeed(bootstrap, input);
      return {
        status: "succeeded",
        output,
        finalUrl: stringInput(input, "feed") === "bookmarks" ? `${X_ORIGIN2}/i/bookmarks` : `${X_ORIGIN2}/home`,
        dispatchStarted: false,
        dispatch: { planned: 0, started: 0, verified: 0 }
      };
    } catch (error) {
      return failedXFeedRead(error, input, "target");
    }
  }
  if (recipe.action === "profiles.read") {
    try {
      await requireBoundViewer(bootstrap, auth);
    } catch (error) {
      return failedXProfileRead(error, profileUrl, "viewer");
    }
    try {
      const output = await readProfile(bootstrap, input);
      return {
        status: "succeeded",
        output,
        finalUrl: output.target.url,
        dispatchStarted: false,
        dispatch: { planned: 0, started: 0, verified: 0 }
      };
    } catch (error) {
      return failedXProfileRead(error, profileUrl, "target");
    }
  }
  if (recipe.action === "posts.read" || recipe.action === "comments.read") {
    await requireBoundViewer(bootstrap, auth);
    const comments = recipe.action === "comments.read";
    const id = postId(input.post_id, "input.post_id");
    return {
      status: "succeeded",
      output: await readConversation(bootstrap, input, comments),
      finalUrl: `${X_ORIGIN2}/i/status/${id}`,
      dispatchStarted: false,
      dispatch: { planned: 0, started: 0, verified: 0 }
    };
  }
  if (recipe.action === "articles.read") {
    return executePrivateArticleDraftRead(bootstrap, recipe, input, auth);
  }
  if (recipe.action === "posts.publish" || recipe.action === "threads.publish" || recipe.action === "replies.create" || recipe.action === "posts.quote")
    return executePublish(bootstrap, recipe, input, auth, options);
  if (recipe.action === "articles.draft.save") {
    return executeArticleDraftSave(bootstrap, recipe, input, auth, options);
  }
  if (recipe.action === "likes.set" || recipe.action === "content.save" || recipe.action === "posts.repost") {
    return executeDesiredState(bootstrap, recipe, input, auth, options);
  }
  throw new Error(`X authenticated web operation ${recipe.action} has no executable reviewed contract`);
}
export {
  xWebArticleImageFailureCategory,
  resolveCurrentXWebChunkUrl,
  readXWebPublishedMutationTarget,
  readXWebDesiredState,
  readXWebArticleDraftDesiredState,
  probeXWebSubject,
  parseXWebBundleDescriptors,
  executeXWebOperation,
  buildXWebRichArticleContentState
};

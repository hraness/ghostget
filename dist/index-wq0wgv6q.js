// @bun
import {
  projectContactDirectionStats
} from "./index-f30rdtbs.js";
import {
  canonicalJson,
  sha256
} from "./index-8sbt8qwx.js";

// src/providers/meta-web-descriptors.ts
var META_RELAY_ORIGINS = Object.freeze({
  facebook: "https://www.facebook.com",
  instagram: "https://www.instagram.com",
  threads: "https://www.threads.com"
});
var issuedRelayRequestCoordinates = new WeakMap;
var issuedPaginationCursors = new WeakSet;
var EMPTY_DISPATCHES = Object.freeze([]);
var EXPECTED_ORIGIN = {
  facebook: META_RELAY_ORIGINS.facebook,
  instagram: META_RELAY_ORIGINS.instagram,
  threads: META_RELAY_ORIGINS.threads
};
var EXPECTED_RELAY_PATHS = Object.freeze({
  facebook: Object.freeze(["/api/graphql/"]),
  instagram: Object.freeze(["/api/graphql", "/api/graphql/"]),
  threads: Object.freeze(["/api/graphql", "/api/graphql/"])
});
var PROOF_SOURCES = Object.freeze({
  viewer: "bootstrap.viewer",
  actor: "bootstrap.actor",
  fb_dtsg: "bootstrap.fb_dtsg",
  jazoest: "derived.fb_dtsg-jazoest",
  lsd: "bootstrap.lsd",
  "client-revision": "bootstrap.client-revision",
  hsi: "bootstrap.hsi",
  "comet-environment": "bootstrap.comet-environment",
  "request-counter": "session.request-counter"
});
var PROOF_SINKS = Object.freeze({
  viewer: Object.freeze(["access.viewer-id", "form.__user"]),
  actor: Object.freeze(["access.actor-id", "form.av"]),
  fb_dtsg: Object.freeze(["form.fb_dtsg"]),
  jazoest: Object.freeze(["form.jazoest"]),
  lsd: Object.freeze(["form.lsd"]),
  "client-revision": Object.freeze(["form.__rev"]),
  hsi: Object.freeze(["form.__hsi"]),
  "comet-environment": Object.freeze(["form.__comet_req"]),
  "request-counter": Object.freeze(["form.__req"])
});
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function record(value, label) {
  if (!isRecord(value))
    throw new Error(`${label} must be an object`);
  return value;
}
function exactKeys(value, required, optional, label) {
  const allowed = new Set([...required, ...optional]);
  const missing = required.filter((key) => !Object.hasOwn(value, key));
  const extra = Object.keys(value).filter((key) => !allowed.has(key));
  if (missing.length > 0)
    throw new Error(`${label} omitted ${missing.join(", ")}`);
  if (extra.length > 0) {
    throw new Error(`${label} contained unsupported field(s): ${extra.join(", ")}`);
  }
}
function boundedString(value, label, minimum, maximum) {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum || /[\0\r]/u.test(value)) {
    throw new Error(`${label} must be bounded text`);
  }
  return value;
}
function boundedInteger(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}
function boundedFiniteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}
function exactIdentifier(value, label) {
  if (typeof value !== "string" || value.length < 1 || value.length > 256 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value)) {
    throw new Error(`${label} must be an exact bounded Meta identifier`);
  }
  return value;
}
function exactCursor(value, label) {
  if (typeof value !== "string" || value.length < 1 || value.length > 4096 || [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  })) {
    throw new Error(`${label} must be an exact bounded opaque cursor`);
  }
  return value;
}
function exactFieldName(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/u.test(value) || value === "__proto__" || value === "constructor" || value === "prototype") {
    throw new Error(`${label} must be an exact variable field name`);
  }
  return value;
}
function exactDescriptorId(value, label) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9.-]{2,127}$/u.test(value)) {
    throw new Error(`${label} must be a stable code-owned descriptor ID`);
  }
  return value;
}
function assertMetaFriendlyName(value) {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_]{2,160}$/u.test(value)) {
    throw new Error("Meta friendlyName must match the reviewed Relay operation-name grammar");
  }
  return value;
}
function assertMetaDocId(value) {
  if (typeof value !== "string" || !/^[0-9]{5,32}$/u.test(value)) {
    throw new Error("Meta docId must be an exact 5-32 digit registered-operation revision");
  }
  return value;
}
function exactPlatform(value, label) {
  if (value !== "facebook" && value !== "instagram" && value !== "threads") {
    throw new Error(`${label} must be facebook, instagram, or threads`);
  }
  return value;
}
function exactOperationType(value, label) {
  if (value !== "query" && value !== "mutation") {
    throw new Error(`${label} must be query or mutation`);
  }
  return value;
}
function exactMethod(value, label) {
  if (value !== "GET" && value !== "POST") {
    throw new Error(`${label} must be exactly GET or POST`);
  }
  return value;
}
function exactOrigin(value, platform, label) {
  const expected = EXPECTED_ORIGIN[platform];
  if (value !== expected) {
    throw new Error(`${label} must be the exact ${platform} first-party origin`);
  }
  return expected;
}
function exactPath(value, platform, label) {
  if (typeof value !== "string" || !EXPECTED_RELAY_PATHS[platform].includes(value)) {
    throw new Error(`${label} must be an exact reviewed ${platform} Relay path`);
  }
  return value;
}
function parseContract(value, label) {
  const candidate = record(value, label);
  if (candidate.state === "capture-required") {
    exactKeys(candidate, ["state", "contractVersion", "reason"], [], label);
    return Object.freeze({
      state: "capture-required",
      contractVersion: boundedInteger(candidate.contractVersion, `${label}.contractVersion`, 1, 1e6),
      reason: boundedString(candidate.reason, `${label}.reason`, 1, 1024)
    });
  }
  if (candidate.state === "observed") {
    exactKeys(candidate, ["state", "contractVersion", "evidenceId"], [], label);
    return Object.freeze({
      state: "observed",
      contractVersion: boundedInteger(candidate.contractVersion, `${label}.contractVersion`, 1, 1e6),
      evidenceId: boundedString(candidate.evidenceId, `${label}.evidenceId`, 1, 256)
    });
  }
  throw new Error(`${label}.state must be observed or capture-required`);
}
function parseAccessPolicy(value, platform, label) {
  const candidate = record(value, label);
  exactKeys(candidate, ["kind", "actorBinding"], [], label);
  const kind = candidate.kind;
  if (kind !== "personal" && kind !== "page" && kind !== "group" && kind !== "marketplace") {
    throw new Error(`${label}.kind must be personal, page, group, or marketplace`);
  }
  if (kind !== "personal" && platform !== "facebook") {
    throw new Error(`${label}.${kind} access is available only on facebook`);
  }
  if (candidate.actorBinding !== "viewer" && candidate.actorBinding !== "target") {
    throw new Error(`${label}.actorBinding must be viewer or target`);
  }
  if (kind !== "page" && candidate.actorBinding !== "viewer") {
    throw new Error(`${label}.${kind} access must bind its actor to the viewer`);
  }
  return Object.freeze({ kind, actorBinding: candidate.actorBinding });
}
function parseProofDeclarations(value, method, label) {
  if (!Array.isArray(value))
    throw new Error(`${label} must be an array`);
  const results = [];
  const kinds = new Set;
  const allSinks = new Set;
  for (const [index, item] of value.entries()) {
    const itemLabel = `${label}[${index}]`;
    const candidate = record(item, itemLabel);
    exactKeys(candidate, ["kind", "source", "sinks"], [], itemLabel);
    const kind = candidate.kind;
    if (kind !== "viewer" && kind !== "actor" && kind !== "fb_dtsg" && kind !== "jazoest" && kind !== "lsd" && kind !== "client-revision" && kind !== "hsi" && kind !== "comet-environment" && kind !== "request-counter") {
      throw new Error(`${itemLabel}.kind is not a reviewed Meta bootstrap proof`);
    }
    if (kinds.has(kind))
      throw new Error(`${label} contained duplicate ${kind} proof`);
    kinds.add(kind);
    if (candidate.source !== PROOF_SOURCES[kind]) {
      throw new Error(`${itemLabel}.source did not match the ${kind} proof source`);
    }
    if (!Array.isArray(candidate.sinks) || candidate.sinks.length < 1) {
      throw new Error(`${itemLabel}.sinks must be a non-empty array`);
    }
    const allowedSinks = PROOF_SINKS[kind];
    const sinks = [];
    for (const sink of candidate.sinks) {
      if (typeof sink !== "string" || !allowedSinks.includes(sink)) {
        throw new Error(`${itemLabel} declared an invalid ${kind} proof sink`);
      }
      if (sinks.includes(sink))
        throw new Error(`${itemLabel} contained a duplicate proof sink`);
      if (allSinks.has(sink))
        throw new Error(`${label} bound one proof sink more than once`);
      if (method === "GET" && sink.startsWith("form.")) {
        throw new Error(`${itemLabel} may not bind a form proof sink to GET`);
      }
      sinks.push(sink);
      allSinks.add(sink);
    }
    results.push(Object.freeze({
      kind,
      source: PROOF_SOURCES[kind],
      sinks: Object.freeze(sinks)
    }));
  }
  if (!allSinks.has("access.viewer-id")) {
    throw new Error(`${label} must bind bootstrap.viewer to access.viewer-id`);
  }
  if (!allSinks.has("access.actor-id")) {
    throw new Error(`${label} must bind bootstrap.actor to access.actor-id`);
  }
  return Object.freeze(results);
}
function parseJsonScalar(value, label) {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  throw new Error(`${label} must be a JSON scalar`);
}
function parseNestedFields(value, label, depth) {
  if (!Array.isArray(value))
    throw new Error(`${label} must be an array`);
  if (value.length > 128)
    throw new Error(`${label} exceeded its reviewed field bound`);
  const names = new Set;
  const fields = [];
  for (const [index, item] of value.entries()) {
    const itemLabel = `${label}[${index}]`;
    const candidate = record(item, itemLabel);
    exactKeys(candidate, ["name", "optional", "schema"], [], itemLabel);
    const name = exactFieldName(candidate.name, `${itemLabel}.name`);
    if (names.has(name))
      throw new Error(`${label} contained duplicate field ${name}`);
    names.add(name);
    if (typeof candidate.optional !== "boolean") {
      throw new Error(`${itemLabel}.optional must be boolean`);
    }
    fields.push(Object.freeze({
      name,
      optional: candidate.optional,
      schema: parseVariableSchema(candidate.schema, `${itemLabel}.schema`, depth + 1)
    }));
  }
  return Object.freeze(fields);
}
function parseVariableSchema(value, label, depth = 0) {
  if (depth > 12)
    throw new Error(`${label} exceeded the reviewed schema depth`);
  const candidate = record(value, label);
  switch (candidate.kind) {
    case "id":
    case "cursor":
    case "boolean":
      exactKeys(candidate, ["kind"], [], label);
      return Object.freeze({ kind: candidate.kind });
    case "string": {
      exactKeys(candidate, ["kind", "minimumLength", "maximumLength"], [], label);
      const minimumLength = boundedInteger(candidate.minimumLength, `${label}.minimumLength`, 0, 1e6);
      const maximumLength = boundedInteger(candidate.maximumLength, `${label}.maximumLength`, 0, 1e6);
      if (maximumLength < minimumLength) {
        throw new Error(`${label}.maximumLength must not be below minimumLength`);
      }
      return Object.freeze({ kind: "string", minimumLength, maximumLength });
    }
    case "integer":
    case "number": {
      exactKeys(candidate, ["kind", "minimum", "maximum"], [], label);
      const minimum = candidate.kind === "integer" ? boundedInteger(candidate.minimum, `${label}.minimum`, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER) : boundedFiniteNumber(candidate.minimum, `${label}.minimum`);
      const maximum = candidate.kind === "integer" ? boundedInteger(candidate.maximum, `${label}.maximum`, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER) : boundedFiniteNumber(candidate.maximum, `${label}.maximum`);
      if (maximum < minimum)
        throw new Error(`${label}.maximum must not be below minimum`);
      return Object.freeze({ kind: candidate.kind, minimum, maximum });
    }
    case "enum": {
      exactKeys(candidate, ["kind", "values"], [], label);
      if (!Array.isArray(candidate.values) || candidate.values.length < 1) {
        throw new Error(`${label}.values must be a non-empty array`);
      }
      const values = candidate.values.map((item, index) => boundedString(item, `${label}.values[${index}]`, 1, 256));
      if (new Set(values).size !== values.length) {
        throw new Error(`${label}.values contained duplicates`);
      }
      return Object.freeze({ kind: "enum", values: Object.freeze(values) });
    }
    case "literal":
      exactKeys(candidate, ["kind", "value"], [], label);
      return Object.freeze({
        kind: "literal",
        value: parseJsonScalar(candidate.value, `${label}.value`)
      });
    case "nullable":
      exactKeys(candidate, ["kind", "value"], [], label);
      return Object.freeze({
        kind: "nullable",
        value: parseVariableSchema(candidate.value, `${label}.value`, depth + 1)
      });
    case "list": {
      exactKeys(candidate, ["kind", "items", "minimumItems", "maximumItems"], [], label);
      const minimumItems = boundedInteger(candidate.minimumItems, `${label}.minimumItems`, 0, 1e4);
      const maximumItems = boundedInteger(candidate.maximumItems, `${label}.maximumItems`, 0, 1e4);
      if (maximumItems < minimumItems) {
        throw new Error(`${label}.maximumItems must not be below minimumItems`);
      }
      return Object.freeze({
        kind: "list",
        items: parseVariableSchema(candidate.items, `${label}.items`, depth + 1),
        minimumItems,
        maximumItems
      });
    }
    case "object":
      exactKeys(candidate, ["kind", "fields"], [], label);
      return Object.freeze({
        kind: "object",
        fields: parseNestedFields(candidate.fields, `${label}.fields`, depth)
      });
    default:
      throw new Error(`${label}.kind is not a reviewed Meta variable schema`);
  }
}
function parseVariableSource(value, label) {
  const candidate = record(value, label);
  switch (candidate.kind) {
    case "input":
      exactKeys(candidate, ["kind", "key"], [], label);
      return Object.freeze({
        kind: "input",
        key: exactFieldName(candidate.key, `${label}.key`)
      });
    case "viewer":
    case "actor":
    case "target":
    case "pagination":
      exactKeys(candidate, ["kind"], [], label);
      return Object.freeze({ kind: candidate.kind });
    case "literal":
      exactKeys(candidate, ["kind", "value"], [], label);
      return Object.freeze({
        kind: "literal",
        value: parseJsonScalar(candidate.value, `${label}.value`)
      });
    default:
      throw new Error(`${label}.kind is not a reviewed Meta variable source`);
  }
}
function schemaAcceptsKind(schema, kind) {
  return schema.kind === kind || schema.kind === "nullable" && schemaAcceptsKind(schema.value, kind);
}
function parseVariableDefinition(value, label) {
  const candidate = record(value, label);
  exactKeys(candidate, ["fields"], [], label);
  if (!Array.isArray(candidate.fields) || candidate.fields.length > 128) {
    throw new Error(`${label}.fields must be a bounded array`);
  }
  const names = new Set;
  const fields = [];
  for (const [index, item] of candidate.fields.entries()) {
    const itemLabel = `${label}.fields[${index}]`;
    const field = record(item, itemLabel);
    exactKeys(field, ["name", "optional", "source", "schema"], [], itemLabel);
    const name = exactFieldName(field.name, `${itemLabel}.name`);
    if (names.has(name))
      throw new Error(`${label}.fields contained duplicate field ${name}`);
    names.add(name);
    if (typeof field.optional !== "boolean") {
      throw new Error(`${itemLabel}.optional must be boolean`);
    }
    const source = parseVariableSource(field.source, `${itemLabel}.source`);
    const schema = parseVariableSchema(field.schema, `${itemLabel}.schema`);
    if ((source.kind === "viewer" || source.kind === "actor" || source.kind === "target") && !schemaAcceptsKind(schema, "id")) {
      throw new Error(`${itemLabel} identity source requires an id schema`);
    }
    if (source.kind === "pagination") {
      if (!field.optional || !schemaAcceptsKind(schema, "cursor")) {
        throw new Error(`${itemLabel} pagination source requires an optional cursor schema`);
      }
    }
    if (source.kind === "literal") {
      validateVariableValue(schema, source.value, `${itemLabel}.source.value`);
    }
    fields.push(Object.freeze({ name, optional: field.optional, source, schema }));
  }
  return Object.freeze({ fields: Object.freeze(fields) });
}
function parsePaginationPolicy(value, variables, label) {
  const candidate = record(value, label);
  if (candidate.kind === "none") {
    exactKeys(candidate, ["kind"], [], label);
    if (variables.fields.some((field) => field.source.kind === "pagination")) {
      throw new Error(`${label} none cannot declare a pagination variable`);
    }
    return Object.freeze({ kind: "none" });
  }
  if (candidate.kind === "cursor") {
    exactKeys(candidate, ["kind", "variableName"], [], label);
    const variableName = exactFieldName(candidate.variableName, `${label}.variableName`);
    const cursorFields = variables.fields.filter((field) => field.source.kind === "pagination");
    if (cursorFields.length !== 1 || cursorFields[0]?.name !== variableName) {
      throw new Error(`${label} must bind exactly one matching pagination variable`);
    }
    return Object.freeze({ kind: "cursor", variableName });
  }
  throw new Error(`${label}.kind must be none or cursor`);
}
function parsePath(value, label) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) {
    throw new Error(`${label} must be a non-empty bounded path`);
  }
  return Object.freeze(value.map((segment, index) => exactFieldName(segment, `${label}[${index}]`)));
}
function parseResponseRoots(value, operationType, label) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 16) {
    throw new Error(`${label} must be a non-empty bounded array`);
  }
  const roots = [];
  const keys = new Set;
  for (const [index, item] of value.entries()) {
    const itemLabel = `${label}[${index}]`;
    const candidate = record(item, itemLabel);
    const kind = candidate.kind;
    if (kind === "incremental-data") {
      exactKeys(candidate, ["kind", "label", "path"], [], itemLabel);
      const root2 = Object.freeze({
        kind,
        label: exactFieldName(candidate.label, `${itemLabel}.label`),
        path: parsePath(candidate.path, `${itemLabel}.path`)
      });
      const key2 = `${root2.kind}:${root2.label}:${root2.path.join(".")}`;
      if (keys.has(key2))
        throw new Error(`${label} contained duplicate response root`);
      keys.add(key2);
      roots.push(root2);
      continue;
    }
    exactKeys(candidate, ["kind", "path"], [], itemLabel);
    const allowed = operationType === "query" ? kind === "query-data" || kind === "prefetch-data" : kind === "mutation-data";
    if (!allowed) {
      throw new Error(`${itemLabel}.kind did not agree with ${operationType}`);
    }
    const root = Object.freeze({
      kind,
      path: parsePath(candidate.path, `${itemLabel}.path`)
    });
    const key = `${root.kind}:${root.path.join(".")}`;
    if (keys.has(key))
      throw new Error(`${label} contained duplicate response root`);
    keys.add(key);
    roots.push(root);
  }
  return Object.freeze(roots);
}
function parseReadbackSchedule(value, label) {
  const candidate = record(value, label);
  if (candidate.kind === "none") {
    exactKeys(candidate, ["kind", "reason"], [], label);
    return Object.freeze({
      kind: "none",
      reason: boundedString(candidate.reason, `${label}.reason`, 1, 1024)
    });
  }
  if (candidate.kind === "independent-query") {
    exactKeys(candidate, [
      "kind",
      "descriptorId",
      "after",
      "actorBinding",
      "targetBinding",
      "attempts"
    ], [], label);
    if (candidate.after !== "dispatch-response" || candidate.actorBinding !== "same" || candidate.targetBinding !== "same" || candidate.attempts !== 1) {
      throw new Error(`${label} must be one same-actor, same-target independent readback`);
    }
    return Object.freeze({
      kind: "independent-query",
      descriptorId: exactDescriptorId(candidate.descriptorId, `${label}.descriptorId`),
      after: "dispatch-response",
      actorBinding: "same",
      targetBinding: "same",
      attempts: 1
    });
  }
  throw new Error(`${label}.kind must be none or independent-query`);
}
function parseDispatchSchedule(value, label) {
  const candidate = record(value, label);
  if (candidate.kind === "inert") {
    exactKeys(candidate, ["kind", "dispatches", "readback"], [], label);
    if (!Array.isArray(candidate.dispatches) || candidate.dispatches.length !== 0) {
      throw new Error(`${label}.dispatches must be exactly empty while inert`);
    }
    const readback = parseReadbackSchedule(candidate.readback, `${label}.readback`);
    if (readback.kind !== "none")
      throw new Error(`${label}.inert schedule cannot read back`);
    return Object.freeze({
      kind: "inert",
      dispatches: EMPTY_DISPATCHES,
      readback
    });
  }
  if (candidate.kind === "single-dispatch") {
    exactKeys(candidate, ["kind", "dispatchId", "attempts", "retry", "readback"], [], label);
    if (candidate.attempts !== 1 || candidate.retry !== "never") {
      throw new Error(`${label} must be one non-retried dispatch`);
    }
    const readback = parseReadbackSchedule(candidate.readback, `${label}.readback`);
    if (readback.kind !== "independent-query") {
      throw new Error(`${label} requires an independent query readback`);
    }
    return Object.freeze({
      kind: "single-dispatch",
      dispatchId: exactDescriptorId(candidate.dispatchId, `${label}.dispatchId`),
      attempts: 1,
      retry: "never",
      readback
    });
  }
  throw new Error(`${label}.kind must be inert or single-dispatch`);
}
function defineMetaOperationDescriptor(value) {
  const candidate = record(value, "Meta operation descriptor");
  const shared = [
    "schemaVersion",
    "id",
    "platform",
    "kind",
    "operationType",
    "friendlyName",
    "docId",
    "origin",
    "method",
    "path",
    "contract",
    "access",
    "proofs",
    "variables",
    "pagination",
    "responseRoots"
  ];
  if (candidate.kind === "query") {
    exactKeys(candidate, shared, [], "Meta query descriptor");
  } else if (candidate.kind === "mutation") {
    exactKeys(candidate, [...shared, "schedule"], [], "Meta mutation descriptor");
  } else {
    throw new Error("Meta operation descriptor.kind must be query or mutation");
  }
  if (candidate.schemaVersion !== 1) {
    throw new Error("Meta operation descriptor.schemaVersion must be 1");
  }
  const platform = exactPlatform(candidate.platform, "Meta operation descriptor.platform");
  const operationType = exactOperationType(candidate.operationType, "Meta operation descriptor.operationType");
  if (candidate.kind !== operationType) {
    throw new Error("Meta descriptor kind and operationType did not agree");
  }
  const method = exactMethod(candidate.method, "Meta operation descriptor.method");
  if (operationType === "mutation" && method !== "POST") {
    throw new Error("Meta Relay mutations require POST");
  }
  const origin = exactOrigin(candidate.origin, platform, "Meta operation descriptor.origin");
  const path = exactPath(candidate.path, platform, "Meta operation descriptor.path");
  const contract = parseContract(candidate.contract, "Meta operation descriptor.contract");
  const access = parseAccessPolicy(candidate.access, platform, "Meta operation descriptor.access");
  const proofs = parseProofDeclarations(candidate.proofs, method, "Meta operation descriptor.proofs");
  const variables = parseVariableDefinition(candidate.variables, "Meta operation descriptor.variables");
  const pagination = parsePaginationPolicy(candidate.pagination, variables, "Meta operation descriptor.pagination");
  const id = exactDescriptorId(candidate.id, "Meta operation descriptor.id");
  const common = {
    schemaVersion: 1,
    id,
    platform,
    friendlyName: assertMetaFriendlyName(candidate.friendlyName),
    docId: assertMetaDocId(candidate.docId),
    origin,
    method,
    path,
    contract,
    access,
    proofs,
    variables,
    pagination
  };
  if (operationType === "query") {
    return Object.freeze({
      ...common,
      kind: "query",
      operationType: "query",
      method,
      responseRoots: parseResponseRoots(candidate.responseRoots, "query", "Meta operation descriptor.responseRoots")
    });
  }
  const schedule = parseDispatchSchedule(candidate.schedule, "Meta operation descriptor.schedule");
  if (contract.state === "capture-required" && schedule.kind !== "inert") {
    throw new Error("capture-required Meta mutations must have an inert schedule");
  }
  if (contract.state === "observed" && schedule.kind !== "single-dispatch") {
    throw new Error("observed Meta mutations require one exact dispatch and readback schedule");
  }
  if (schedule.kind === "single-dispatch" && schedule.readback.descriptorId === id) {
    throw new Error("Meta mutation readback must use a separate query descriptor");
  }
  return Object.freeze({
    ...common,
    kind: "mutation",
    operationType: "mutation",
    method: "POST",
    responseRoots: parseResponseRoots(candidate.responseRoots, "mutation", "Meta operation descriptor.responseRoots"),
    schedule
  });
}
function parseObservedDescriptor(value, label) {
  const candidate = record(value, label);
  exactKeys(candidate, ["friendlyName", "docId", "operationType", "origin", "method", "path"], [], label);
  const origin = candidate.origin;
  let platform;
  if (origin === META_RELAY_ORIGINS.facebook)
    platform = "facebook";
  else if (origin === META_RELAY_ORIGINS.instagram)
    platform = "instagram";
  else if (origin === META_RELAY_ORIGINS.threads)
    platform = "threads";
  else
    throw new Error(`${label}.origin is not an exact Meta first-party origin`);
  return Object.freeze({
    friendlyName: assertMetaFriendlyName(candidate.friendlyName),
    docId: assertMetaDocId(candidate.docId),
    operationType: exactOperationType(candidate.operationType, `${label}.operationType`),
    origin: exactOrigin(candidate.origin, platform, `${label}.origin`),
    method: exactMethod(candidate.method, `${label}.method`),
    path: exactPath(candidate.path, platform, `${label}.path`)
  });
}
function resolveMetaOperationDescriptor(candidatesValue, expectedValue) {
  if (!Array.isArray(candidatesValue)) {
    throw new Error("observed Meta descriptors must be an array");
  }
  const expected = defineMetaOperationDescriptor(expectedValue);
  const candidates = candidatesValue.map((candidate, index) => parseObservedDescriptor(candidate, `observed Meta descriptor ${index + 1}`));
  const named = candidates.filter((candidate) => candidate.friendlyName === expected.friendlyName);
  if (named.length === 0) {
    throw new Error(`observed Meta descriptors omitted ${expected.friendlyName}`);
  }
  if (named.some((candidate) => candidate.operationType !== expected.operationType)) {
    throw new Error(`Meta operation-type drift for ${expected.friendlyName}`);
  }
  const typed = named.filter((candidate) => candidate.operationType === expected.operationType);
  if (typed.some((candidate) => candidate.origin !== expected.origin || candidate.method !== expected.method || candidate.path !== expected.path)) {
    throw new Error(`Meta transport drift for ${expected.friendlyName}`);
  }
  if (typed.length > 1) {
    const revisions = new Set(typed.map((candidate) => candidate.docId));
    if (revisions.size === 1) {
      throw new Error(`observed Meta descriptors contained duplicate ${expected.friendlyName}`);
    }
    throw new Error(`observed Meta descriptors contained ambiguous revision drift for ${expected.friendlyName}`);
  }
  const resolved = typed[0];
  if (resolved === undefined) {
    throw new Error(`observed Meta descriptors omitted ${expected.friendlyName}`);
  }
  if (resolved.docId !== expected.docId) {
    throw new Error(`Meta docId drift for ${expected.friendlyName}; reviewed evidence is stale`);
  }
  return resolved;
}
function metaOperationDescriptorKey(value) {
  const descriptor = defineMetaOperationDescriptor(value);
  return `meta1:${sha256(canonicalJson(descriptor))}`;
}
function bindMetaAccessContext(descriptorValue, value) {
  const descriptor = defineMetaOperationDescriptor(descriptorValue);
  const candidate = record(value, "Meta access context");
  exactKeys(candidate, ["kind", "platform", "viewerId", "actorId", "targetId"], [], "Meta access context");
  if (candidate.kind !== descriptor.access.kind) {
    throw new Error("Meta access context kind did not match its descriptor");
  }
  if (candidate.platform !== descriptor.platform) {
    throw new Error("Meta access context platform did not match its descriptor");
  }
  const viewerId = exactIdentifier(candidate.viewerId, "Meta access context.viewerId");
  const actorId = exactIdentifier(candidate.actorId, "Meta access context.actorId");
  const targetId = exactIdentifier(candidate.targetId, "Meta access context.targetId");
  const expectedActor = descriptor.access.actorBinding === "viewer" ? viewerId : targetId;
  if (actorId !== expectedActor) {
    throw new Error(`Meta ${descriptor.access.kind} actor did not match its ${descriptor.access.actorBinding}`);
  }
  if (descriptor.access.kind === "personal") {
    return Object.freeze({
      kind: "personal",
      platform: descriptor.platform,
      viewerId,
      actorId,
      targetId
    });
  }
  if (descriptor.platform !== "facebook") {
    throw new Error(`Meta ${descriptor.access.kind} access is available only on facebook`);
  }
  return Object.freeze({
    kind: descriptor.access.kind,
    platform: "facebook",
    viewerId,
    actorId,
    targetId
  });
}
function validateVariableValue(schema, value, label) {
  switch (schema.kind) {
    case "id":
      return exactIdentifier(value, label);
    case "cursor":
      return exactCursor(value, label);
    case "string":
      return boundedString(value, label, schema.minimumLength, schema.maximumLength);
    case "boolean":
      if (typeof value !== "boolean")
        throw new Error(`${label} must be boolean`);
      return value;
    case "integer":
      return boundedInteger(value, label, schema.minimum, schema.maximum);
    case "number": {
      const number = boundedFiniteNumber(value, label);
      if (number < schema.minimum || number > schema.maximum) {
        throw new Error(`${label} must be a number between ${schema.minimum} and ${schema.maximum}`);
      }
      return number;
    }
    case "enum":
      if (typeof value !== "string" || !schema.values.includes(value)) {
        throw new Error(`${label} must be one exact reviewed enum value`);
      }
      return value;
    case "literal":
      if (!Object.is(value, schema.value))
        throw new Error(`${label} did not match its exact literal`);
      return schema.value;
    case "nullable":
      return value === null ? null : validateVariableValue(schema.value, value, label);
    case "list": {
      if (!Array.isArray(value) || value.length < schema.minimumItems || value.length > schema.maximumItems) {
        throw new Error(`${label} must be a bounded array`);
      }
      return Object.freeze(value.map((item, index) => validateVariableValue(schema.items, item, `${label}[${index}]`)));
    }
    case "object": {
      const source = record(value, label);
      const required = schema.fields.filter((field) => !field.optional).map((field) => field.name);
      const optional = schema.fields.filter((field) => field.optional).map((field) => field.name);
      exactKeys(source, required, optional, label);
      const result = {};
      for (const field of schema.fields) {
        if (!Object.hasOwn(source, field.name))
          continue;
        result[field.name] = validateVariableValue(field.schema, source[field.name], `${label}.${field.name}`);
      }
      return Object.freeze(result);
    }
  }
}
function assertPaginationCursorBinding(descriptor, access, value) {
  if (descriptor.pagination.kind !== "cursor") {
    throw new Error("Meta operation does not permit pagination");
  }
  if (!isRecord(value) || !issuedPaginationCursors.has(value)) {
    throw new Error("Meta pagination cursor was not issued by the binding policy");
  }
  exactKeys(value, [
    "schemaVersion",
    "descriptorKey",
    "actorId",
    "targetId",
    "cursor",
    "previousCursor"
  ], [], "Meta pagination cursor");
  if (value.schemaVersion !== 1) {
    throw new Error("Meta pagination cursor schemaVersion must be 1");
  }
  if (value.descriptorKey !== metaOperationDescriptorKey(descriptor)) {
    throw new Error("Meta pagination cursor did not match its descriptor");
  }
  if (value.actorId !== access.actorId) {
    throw new Error("Meta pagination cursor did not match its actor");
  }
  if (value.targetId !== access.targetId) {
    throw new Error("Meta pagination cursor did not match its target");
  }
  const cursor = exactCursor(value.cursor, "Meta pagination cursor.cursor");
  const previousCursor = value.previousCursor === null ? null : exactCursor(value.previousCursor, "Meta pagination cursor.previousCursor");
  if (cursor === previousCursor) {
    throw new Error("Meta pagination cursor did not advance");
  }
  return value;
}
function assertMetaPaginationCursorBinding(descriptorValue, accessValue, cursorValue) {
  const descriptor = defineMetaOperationDescriptor(descriptorValue);
  const access = bindMetaAccessContext(descriptor, accessValue);
  return assertPaginationCursorBinding(descriptor, access, cursorValue);
}
function bindMetaPaginationCursor(descriptorValue, accessValue, cursorValue, previousValue = null) {
  const descriptor = defineMetaOperationDescriptor(descriptorValue);
  const access = bindMetaAccessContext(descriptor, accessValue);
  if (descriptor.pagination.kind !== "cursor") {
    throw new Error("Meta operation does not permit pagination");
  }
  const cursor = exactCursor(cursorValue, "Meta next pagination cursor");
  const previous = previousValue === null ? null : assertPaginationCursorBinding(descriptor, access, previousValue);
  if (previous?.cursor === cursor) {
    throw new Error("Meta pagination cursor did not advance");
  }
  const result = Object.freeze({
    schemaVersion: 1,
    descriptorKey: metaOperationDescriptorKey(descriptor),
    actorId: access.actorId,
    targetId: access.targetId,
    cursor,
    previousCursor: previous?.cursor ?? null
  });
  issuedPaginationCursors.add(result);
  return result;
}
function buildMetaRelayVariables(descriptorValue, inputValue, accessValue, paginationValue = null) {
  const descriptor = defineMetaOperationDescriptor(descriptorValue);
  const access = bindMetaAccessContext(descriptor, accessValue);
  const input = record(inputValue, "Meta semantic input");
  const inputKeys = new Set(descriptor.variables.fields.flatMap((field) => field.source.kind === "input" ? [field.source.key] : []));
  const extra = Object.keys(input).filter((key) => !inputKeys.has(key));
  if (extra.length > 0) {
    throw new Error(`Meta semantic input contained unsupported field(s): ${extra.join(", ")}`);
  }
  const pagination = paginationValue === null ? null : assertPaginationCursorBinding(descriptor, access, paginationValue);
  const result = {};
  for (const field of descriptor.variables.fields) {
    let sourceValue;
    let present = true;
    switch (field.source.kind) {
      case "input":
        present = Object.hasOwn(input, field.source.key);
        sourceValue = input[field.source.key];
        break;
      case "viewer":
        sourceValue = access.viewerId;
        break;
      case "actor":
        sourceValue = access.actorId;
        break;
      case "target":
        sourceValue = access.targetId;
        break;
      case "pagination":
        present = pagination !== null;
        sourceValue = pagination?.cursor;
        break;
      case "literal":
        sourceValue = field.source.value;
        break;
    }
    if (!present) {
      if (!field.optional) {
        const sourceName = field.source.kind === "input" ? `input.${field.source.key}` : field.name;
        throw new Error(`Meta variables omitted required ${sourceName}`);
      }
      continue;
    }
    result[field.name] = validateVariableValue(field.schema, sourceValue, `Meta variables.${field.name}`);
  }
  return Object.freeze(result);
}
function proofFormFields(proofs) {
  const fields = [];
  for (const proof of proofs) {
    for (const sink of proof.sinks) {
      switch (sink) {
        case "form.__user":
          fields.push("__user");
          break;
        case "form.av":
          fields.push("av");
          break;
        case "form.fb_dtsg":
          fields.push("fb_dtsg");
          break;
        case "form.jazoest":
          fields.push("jazoest");
          break;
        case "form.lsd":
          fields.push("lsd");
          break;
        case "form.__rev":
          fields.push("__rev");
          break;
        case "form.__hsi":
          fields.push("__hsi");
          break;
        case "form.__comet_req":
          fields.push("__comet_req");
          break;
        case "form.__req":
          fields.push("__req");
          break;
        case "access.viewer-id":
        case "access.actor-id":
          break;
      }
    }
  }
  return Object.freeze(fields);
}
function buildMetaRelayRequest(descriptorValue, value) {
  const descriptor = defineMetaOperationDescriptor(descriptorValue);
  if (descriptor.contract.state !== "observed") {
    throw new Error(`Meta operation ${descriptor.id} is capture-required and cannot build a request`);
  }
  const candidate = record(value, "Meta Relay request build input");
  exactKeys(candidate, ["input", "access"], ["pagination"], "Meta Relay request build input");
  const access = bindMetaAccessContext(descriptor, candidate.access);
  const paginationValue = candidate.pagination === undefined || candidate.pagination === null ? null : assertPaginationCursorBinding(descriptor, access, candidate.pagination);
  const variables = buildMetaRelayVariables(descriptor, candidate.input, access, paginationValue);
  const parameters = Object.freeze([
    Object.freeze({
      name: "fb_api_req_friendly_name",
      value: descriptor.friendlyName
    }),
    Object.freeze({ name: "doc_id", value: descriptor.docId }),
    Object.freeze({ name: "variables", value: JSON.stringify(variables) })
  ]);
  const request = Object.freeze({
    descriptorId: descriptor.id,
    operationType: descriptor.operationType,
    origin: descriptor.origin,
    method: descriptor.method,
    path: descriptor.path,
    url: `${descriptor.origin}${descriptor.path}`,
    parameterLocation: descriptor.method === "GET" ? "query" : "form",
    parameters,
    proofBindings: descriptor.proofs,
    proofFormFields: proofFormFields(descriptor.proofs),
    access,
    pagination: paginationValue,
    schedule: descriptor.kind === "mutation" ? descriptor.schedule : null
  });
  issuedRelayRequestCoordinates.set(request, Object.freeze({
    descriptorKey: metaOperationDescriptorKey(descriptor),
    viewerId: access.viewerId,
    actorId: access.actorId,
    targetId: access.targetId,
    proofFormFields: request.proofFormFields
  }));
  return request;
}
function metaRelayRequestProofCoordinates(value) {
  if (!isRecord(value)) {
    throw new Error("Meta Relay request handle is invalid");
  }
  const coordinates = issuedRelayRequestCoordinates.get(value);
  if (coordinates === undefined) {
    throw new Error("Meta Relay request handle is invalid");
  }
  return coordinates;
}
function valueAtPath(value, path) {
  let current = value;
  for (const segment of path) {
    if (!isRecord(current) || !Object.hasOwn(current, segment))
      return;
    current = current[segment];
  }
  return current;
}
function assertMetaRelayResponseBinding(descriptorValue, responseValue) {
  const descriptor = defineMetaOperationDescriptor(descriptorValue);
  const response = record(responseValue, "Meta Relay response");
  if (Object.hasOwn(response, "errors")) {
    if (!Array.isArray(response.errors)) {
      throw new Error("Meta Relay response.errors must be an array");
    }
    if (response.errors.length > 0) {
      throw new Error("Meta Relay response contained provider errors");
    }
  }
  const matches = descriptor.responseRoots.flatMap((variant) => {
    const value = valueAtPath(response, variant.path);
    return value === undefined || value === null ? [] : [{ variant, value }];
  });
  if (matches.length === 0) {
    throw new Error("Meta Relay response omitted every reviewed root variant");
  }
  if (matches.length > 1) {
    throw new Error("Meta Relay response matched multiple reviewed root variants");
  }
  const match = matches[0];
  if (match === undefined) {
    throw new Error("Meta Relay response omitted every reviewed root variant");
  }
  return Object.freeze({
    descriptorId: descriptor.id,
    operationType: descriptor.operationType,
    variant: match.variant,
    value: match.value
  });
}

// src/providers/meta-bootstrap.ts
var MAX_JSON_ROOTS = 512;
var MAX_TREE_NODES = 250000;
var MAX_TREE_DEPTH = 40;
var MAX_CONTAINER_ENTRIES = 1e4;
var MAX_STRING_CHARACTERS = 4 * 1024 * 1024;
var MAX_MODULE_ID = 1e6;
var MAX_REQUEST_COUNTER = 36 ** 6 - 1;
var FACEBOOK_CURRENT_USER_ASYNC_KEY_PATTERN = /^adp_WebWorkerV2HasteResponsePreloader_[A-Za-z0-9_]{1,192}$/u;
var REVIEWED_MODULE_NAMES = Object.freeze([
  "CurrentUserInitialData",
  "RelayAPIConfigDefaults",
  "DTSGInitialData",
  "SprinkleConfig",
  "LSD",
  "SiteData"
]);
function classification(value) {
  return Object.freeze({
    ...value,
    sinks: Object.freeze([...value.sinks])
  });
}
var META_COMET_FIELD_CLASSIFICATIONS = Object.freeze([
  classification({
    name: "viewerId",
    class: "identity",
    source: "bootstrap.viewer",
    sinks: ["access.viewer-id", "form.__user"],
    lifetime: "browser-session"
  }),
  classification({
    name: "actingId",
    class: "identity",
    source: "bootstrap.actor",
    sinks: ["access.actor-id", "form.av"],
    lifetime: "browser-session"
  }),
  classification({
    name: "fb_dtsg",
    class: "csrf-proof",
    source: "bootstrap.fb_dtsg",
    sinks: ["form.fb_dtsg"],
    lifetime: "bootstrap"
  }),
  classification({
    name: "jazoest",
    class: "derived-proof",
    source: "derived.fb_dtsg-jazoest",
    sinks: ["form.jazoest"],
    lifetime: "bootstrap"
  }),
  classification({
    name: "lsd",
    class: "bootstrap-proof",
    source: "bootstrap.lsd",
    sinks: ["form.lsd"],
    lifetime: "bootstrap"
  }),
  classification({
    name: "__rev",
    class: "build",
    source: "bootstrap.client-revision",
    sinks: ["form.__rev"],
    lifetime: "build"
  }),
  classification({
    name: "__hsi",
    class: "build",
    source: "bootstrap.hsi",
    sinks: ["form.__hsi"],
    lifetime: "bootstrap"
  }),
  classification({
    name: "__comet_req",
    class: "build",
    source: "bootstrap.comet-environment",
    sinks: ["form.__comet_req"],
    lifetime: "build"
  }),
  classification({
    name: "__req",
    class: "request-counter",
    source: "session.request-counter",
    sinks: ["form.__req"],
    lifetime: "request"
  })
]);
var BOOTSTRAP_EVIDENCE = Object.freeze({
  schemaVersion: 1,
  provider: "facebook-comet",
  identityBound: true,
  fields: META_COMET_FIELD_CLASSIFICATIONS
});
var REQUEST_PROOF_EVIDENCE = Object.freeze({
  schemaVersion: 1,
  provider: "facebook-comet",
  redaction: "raw-values-omitted",
  fields: Object.freeze([
    Object.freeze({ name: "__user", class: "identity" }),
    Object.freeze({ name: "av", class: "identity" }),
    Object.freeze({ name: "fb_dtsg", class: "csrf-proof" }),
    Object.freeze({ name: "jazoest", class: "derived-proof" }),
    Object.freeze({ name: "lsd", class: "bootstrap-proof" }),
    Object.freeze({ name: "__rev", class: "build" }),
    Object.freeze({ name: "__hsi", class: "build" }),
    Object.freeze({ name: "__comet_req", class: "build" }),
    Object.freeze({ name: "__req", class: "request-counter" })
  ])
});
var bootstrapMaterial = new WeakMap;
var requestMaterial = new WeakMap;
var consumedRequests = new WeakSet;
var reviewedModuleNameSet = new Set(REVIEWED_MODULE_NAMES);
var PAYLOAD_FIELDS = Object.freeze({
  CurrentUserInitialData: Object.freeze([
    "ACCOUNT_ID",
    "USER_ID",
    "NAME",
    "SHORT_NAME",
    "IS_BUSINESS_PERSON_ACCOUNT",
    "HAS_SECONDARY_BUSINESS_PERSON",
    "IS_FACEBOOK_WORK_ACCOUNT",
    "IS_MESSENGER_ONLY_USER",
    "IS_DEACTIVATED_ALLOWED_ON_MESSENGER",
    "IS_MESSENGER_CALL_GUEST_USER",
    "IS_WORK_MESSENGER_CALL_GUEST_USER",
    "IS_WORKROOMS_USER",
    "APP_ID",
    "IS_BUSINESS_DOMAIN",
    "IS_INSTAGRAM_BUSINESS_PERSON",
    "IS_WABA_BUSINESS_PERSON"
  ]),
  RelayAPIConfigDefaults: Object.freeze([
    "accessToken",
    "actorID",
    "customHeaders",
    "enableNetworkLogger",
    "enableVerboseNetworkLogger",
    "fetchTimeout",
    "graphBatchURI",
    "graphURI",
    "retryDelays",
    "useXController",
    "xhrEncoding",
    "subscriptionTopicURI",
    "withCredentials",
    "isProductionEndpoint",
    "workRequestTaggingProduct",
    "encryptionKeyParams"
  ]),
  DTSGInitialData: Object.freeze(["token", "async_get_token"]),
  SprinkleConfig: Object.freeze(["param_name", "version", "should_randomize"]),
  LSD: Object.freeze(["token"]),
  SiteData: Object.freeze([
    "server_revision",
    "client_revision",
    "tier",
    "push_phase",
    "pkg_cohort",
    "haste_session",
    "pr",
    "haste_site",
    "manifest_base_uri",
    "manifest_origin",
    "manifest_version_prefix",
    "be_one_ahead",
    "is_rtl",
    "is_comet",
    "is_experimental_tier",
    "is_jit_warmed_up",
    "hsi",
    "semr_host_bucket",
    "bl_hash_version",
    "skip_rd_bl",
    "comet_env",
    "wbloks_env",
    "ef_page",
    "compose_bootloads",
    "spin",
    "__spin_r",
    "__spin_b",
    "__spin_t",
    "__spin_dev_mhenv",
    "vip",
    "polytrace_id"
  ])
});
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isUnknownArray(value) {
  return Array.isArray(value);
}
function record2(value, label) {
  if (!isRecord2(value))
    throw new Error(`${label} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must be plain JSON`);
  }
  return value;
}
function dataRecordEntries(value, label) {
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length > MAX_CONTAINER_ENTRIES) {
    throw new Error(`${label} exceeded its reviewed field bound`);
  }
  const entries = [];
  for (const key of ownKeys) {
    if (typeof key !== "string")
      throw new Error(`${label} contained unsupported fields`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true)
      throw new Error(`${label} must contain only plain JSON fields`);
    entries.push(Object.freeze([key, descriptor.value]));
  }
  return entries;
}
function dataArrayValues(value, label) {
  if (value.length > MAX_CONTAINER_ENTRIES) {
    throw new Error(`${label} exceeded its reviewed entry bound`);
  }
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== value.length + 1 || ownKeys.some((key) => typeof key !== "string" || key !== "length" && !/^(?:0|[1-9][0-9]*)$/u.test(key)))
    throw new Error(`${label} contained unsupported array fields`);
  const values = [];
  for (let index = 0;index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true)
      throw new Error(`${label} must be a dense plain JSON array`);
    values.push(descriptor.value);
  }
  return values;
}
function exactInputKeys(value, required, optional, label) {
  const keys = dataRecordEntries(value, label).map(([key]) => key);
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !keys.includes(key)) || keys.some((key) => !allowed.has(key)))
    throw new Error(`${label} has unsupported fields`);
}
function validatePayloadFields(moduleName, payload) {
  const allowed = new Set(PAYLOAD_FIELDS[moduleName]);
  const keys = dataRecordEntries(payload, `Facebook Comet ${moduleName} payload`).map(([key]) => key);
  if (keys.some((key) => !allowed.has(key))) {
    throw new Error(`Facebook Comet ${moduleName} payload has unsupported fields`);
  }
}
function decimalId(value, label) {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,31}$/u.test(value)) {
    throw new Error(`${label} must be a bounded nonzero decimal identifier`);
  }
  return value;
}
function proofToken(value, label, maximumCharacters) {
  if (typeof value !== "string" || value.length < 8 || value.length > maximumCharacters || !/^[A-Za-z0-9._~:-]+$/u.test(value))
    throw new Error(`${label} is missing or malformed`);
  return value;
}
function boundedPositiveInteger(value, label, maximum) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${label} must be a bounded positive integer`);
  }
  return value;
}
function directModulePathIsReviewed(path) {
  return path.length === 3 && typeof path[0] === "number" && (path[1] === "define" || path[1] === "require") && typeof path[2] === "number";
}
function scheduledServerModulePathIsReviewed(roots, path, moduleValue) {
  if (path.length !== 8 || typeof path[0] !== "number" || path[1] !== "require" || typeof path[2] !== "number" || path[3] !== 3 || typeof path[4] !== "number" || path[5] !== "__bbox" || path[6] !== "define" && path[6] !== "require" || typeof path[7] !== "number")
    return false;
  const root = roots[path[0]];
  if (!isRecord2(root))
    return false;
  const outerContainer = root.require;
  if (!isUnknownArray(outerContainer))
    return false;
  const scheduledValue = outerContainer[path[2]];
  if (!isUnknownArray(scheduledValue))
    return false;
  const scheduled = dataArrayValues(scheduledValue, "Facebook Comet ScheduledServerJS module");
  if (scheduled.length !== 4 || scheduled[0] !== "ScheduledServerJS" || scheduled[1] !== "handle" || scheduled[2] !== null || !isUnknownArray(scheduled[3]))
    return false;
  const payload = scheduled[3][path[4]];
  if (!isRecord2(payload) || !isRecord2(payload.__bbox))
    return false;
  const innerContainer = payload.__bbox[path[6]];
  return isUnknownArray(innerContainer) && innerContainer[path[7]] === moduleValue;
}
function hydratedAsyncDataModulePathIsReviewed(roots, path, moduleValue) {
  if (path.length !== 16 || typeof path[0] !== "number" || path[1] !== "require" || typeof path[2] !== "number" || path[3] !== 3 || typeof path[4] !== "number" || path[5] !== "__bbox" || path[6] !== "require" || typeof path[7] !== "number" || path[8] !== 3 || typeof path[9] !== "number" || path[10] !== "data" || path[11] !== "__bbox" || path[12] !== "hrp" || path[13] !== "jsmods" || path[14] !== "define" || typeof path[15] !== "number")
    return false;
  const root = roots[path[0]];
  if (!isRecord2(root) || !isUnknownArray(root.require))
    return false;
  const scheduledValue = root.require[path[2]];
  if (!isUnknownArray(scheduledValue) || scheduledValue.length !== 4 || scheduledValue[0] !== "ScheduledServerJS" || scheduledValue[1] !== "handle" || scheduledValue[2] !== null || !isUnknownArray(scheduledValue[3]))
    return false;
  const scheduledPayload = scheduledValue[3][path[4]];
  if (!isRecord2(scheduledPayload) || !isRecord2(scheduledPayload.__bbox) || !isUnknownArray(scheduledPayload.__bbox.require))
    return false;
  const asyncValue = scheduledPayload.__bbox.require[path[7]];
  if (!isUnknownArray(asyncValue) || asyncValue.length !== 4 || asyncValue[0] !== "AsyncData" || asyncValue[1] !== "resolve" || !isUnknownArray(asyncValue[2]) || asyncValue[2].length !== 0 || !isUnknownArray(asyncValue[3]) || asyncValue[3].length !== 2 || typeof asyncValue[3][0] !== "string" || !FACEBOOK_CURRENT_USER_ASYNC_KEY_PATTERN.test(asyncValue[3][0]))
    return false;
  const asyncPayload = asyncValue[3][path[9]];
  if (!isRecord2(asyncPayload) || !isRecord2(asyncPayload.data))
    return false;
  const dataBbox = asyncPayload.data.__bbox;
  if (!isRecord2(dataBbox) || !isRecord2(dataBbox.hrp))
    return false;
  const jsmods = dataBbox.hrp.jsmods;
  return isRecord2(jsmods) && isUnknownArray(jsmods.define) && jsmods.define[path[15]] === moduleValue;
}
function modulePathIsReviewed(roots, path, moduleValue) {
  return directModulePathIsReviewed(path) || scheduledServerModulePathIsReviewed(roots, path, moduleValue) || hydratedAsyncDataModulePathIsReviewed(roots, path, moduleValue);
}
function reviewedModuleTuple(roots, value, path, moduleName) {
  if (!modulePathIsReviewed(roots, path, value)) {
    throw new Error(`Facebook Comet ${moduleName} appeared outside a reviewed module path`);
  }
  const items = dataArrayValues(value, `Facebook Comet ${moduleName} module`);
  if (items.length !== 4 || items[0] !== moduleName || !Array.isArray(items[1]) || dataArrayValues(items[1], `Facebook Comet ${moduleName} dependencies`).length !== 0 || !Number.isSafeInteger(items[3]) || items[3] < 0 || items[3] > MAX_MODULE_ID)
    throw new Error(`Facebook Comet ${moduleName} module is malformed`);
  const payload = record2(items[2], `Facebook Comet ${moduleName} payload`);
  validatePayloadFields(moduleName, payload);
  return payload;
}
function collectReviewedModules(roots) {
  const rootsWithModules = new Map;
  const seen = new WeakSet;
  const stack = roots.map((value, index) => ({
    value,
    path: Object.freeze([index]),
    depth: 0
  }));
  let nodes = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined)
      break;
    nodes += 1;
    if (nodes > MAX_TREE_NODES) {
      throw new Error("Facebook Comet bootstrap exceeded its reviewed structural bound");
    }
    if (current.depth > MAX_TREE_DEPTH) {
      throw new Error("Facebook Comet bootstrap exceeded its reviewed depth bound");
    }
    const value = current.value;
    if (value === null || typeof value === "boolean")
      continue;
    if (typeof value === "string") {
      if (value.length > MAX_STRING_CHARACTERS) {
        throw new Error("Facebook Comet bootstrap contained oversized text");
      }
      continue;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value))
        throw new Error("Facebook Comet bootstrap was not plain JSON");
      continue;
    }
    if (typeof value !== "object") {
      throw new Error("Facebook Comet bootstrap was not plain JSON");
    }
    if (seen.has(value)) {
      throw new Error("Facebook Comet bootstrap contained shared or cyclic structures");
    }
    seen.add(value);
    if (Array.isArray(value)) {
      const values = dataArrayValues(value, "Facebook Comet bootstrap array");
      const possibleName = values[0];
      if (typeof possibleName === "string" && reviewedModuleNameSet.has(possibleName)) {
        const moduleName = REVIEWED_MODULE_NAMES.find((name) => name === possibleName);
        if (moduleName === undefined)
          throw new Error("Facebook Comet module name was not reviewed");
        const rootIndex = current.path[0];
        if (typeof rootIndex !== "number") {
          throw new Error("Facebook Comet module root was malformed");
        }
        const found = rootsWithModules.get(rootIndex) ?? new Map;
        if (found.has(moduleName)) {
          throw new Error(`Facebook Comet bootstrap contained duplicate ${moduleName} modules`);
        }
        found.set(moduleName, reviewedModuleTuple(roots, value, current.path, moduleName));
        rootsWithModules.set(rootIndex, found);
      }
      for (let index = values.length - 1;index >= 0; index -= 1) {
        stack.push({
          value: values[index],
          path: Object.freeze([...current.path, index]),
          depth: current.depth + 1
        });
      }
      continue;
    }
    const entries = dataRecordEntries(record2(value, "Facebook Comet bootstrap object"), "Facebook Comet bootstrap object");
    for (let index = entries.length - 1;index >= 0; index -= 1) {
      const entry = entries[index];
      if (entry === undefined)
        continue;
      stack.push({
        value: entry[1],
        path: Object.freeze([...current.path, entry[0]]),
        depth: current.depth + 1
      });
    }
  }
  const anchoredRoots = [...rootsWithModules.values()].filter((modules) => modules.has("RelayAPIConfigDefaults"));
  if (anchoredRoots.length > 1) {
    throw new Error("Facebook Comet bootstrap contained multiple RelayAPIConfigDefaults anchor roots");
  }
  const selected = anchoredRoots[0] ?? (rootsWithModules.size === 1 ? [...rootsWithModules.values()][0] : undefined) ?? new Map;
  const selectedUser = selected.get("CurrentUserInitialData");
  if (selectedUser !== undefined) {
    for (const modules of rootsWithModules.values()) {
      const candidate = modules.get("CurrentUserInitialData");
      if (candidate !== undefined && (candidate.ACCOUNT_ID !== selectedUser.ACCOUNT_ID || candidate.USER_ID !== selectedUser.USER_ID))
        throw new Error("Facebook Comet bootstrap identities drifted across hydrated roots");
    }
  }
  return selected;
}
function requiredModule(modules, name) {
  const payload = modules.get(name);
  if (payload === undefined)
    throw new Error(`Facebook Comet bootstrap omitted ${name}`);
  return payload;
}
function assertMetaCometReadActor(roots, expectedViewerId) {
  if (roots.length < 1 || roots.length > MAX_JSON_ROOTS) {
    throw new Error("Facebook Comet read actor roots were not a bounded list");
  }
  const expected = decimalId(expectedViewerId, "Facebook Comet expected read viewer");
  const modules = collectReviewedModules(roots);
  const actingId = decimalId(requiredModule(modules, "RelayAPIConfigDefaults").actorID, "Facebook Comet RelayAPIConfigDefaults.actorID");
  if (actingId !== expected) {
    throw new Error("Facebook Comet read actor did not match the bound viewer");
  }
}
function deriveJazoest(fbDtsg, sprinkle) {
  if (sprinkle.param_name !== "jazoest" || sprinkle.version !== 2 || sprinkle.should_randomize !== false)
    throw new Error("Facebook Comet SprinkleConfig changed its reviewed jazoest derivation");
  let sum = 0;
  for (let index = 0;index < fbDtsg.length; index += 1) {
    sum += fbDtsg.charCodeAt(index);
  }
  const value = `2${sum}`;
  if (!/^2[0-9]{2,10}$/u.test(value)) {
    throw new Error("Facebook Comet jazoest derivation exceeded its reviewed bound");
  }
  return value;
}
function isParseMetaJsonScripts(value) {
  return typeof value === "function";
}
function parseOptions(value) {
  const input = record2(value, "Facebook Comet bootstrap options");
  exactInputKeys(input, ["parseMetaJsonScripts"], ["expectedViewerId", "expectedActingId"], "Facebook Comet bootstrap options");
  const parser = input.parseMetaJsonScripts;
  if (!isParseMetaJsonScripts(parser)) {
    throw new Error("Facebook Comet bootstrap parser must be a function");
  }
  return Object.freeze({
    parseMetaJsonScripts: parser,
    expectedViewerId: input.expectedViewerId === undefined ? null : decimalId(input.expectedViewerId, "Facebook Comet expected viewer"),
    expectedActingId: input.expectedActingId === undefined ? null : decimalId(input.expectedActingId, "Facebook Comet expected actor")
  });
}
function bootstrapMetaComet(html, options) {
  const parsedOptions = parseOptions(options);
  let parsed;
  try {
    parsed = parsedOptions.parseMetaJsonScripts(html);
  } catch {
    throw new Error("Facebook Comet bootstrap JSON parsing failed");
  }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > MAX_JSON_ROOTS)
    throw new Error("Facebook Comet bootstrap parser returned a malformed bounded root list");
  const roots = dataArrayValues(parsed, "Facebook Comet bootstrap roots");
  const modules = collectReviewedModules(roots);
  const currentUser = requiredModule(modules, "CurrentUserInitialData");
  const accountId = decimalId(currentUser.ACCOUNT_ID, "Facebook Comet CurrentUserInitialData.ACCOUNT_ID");
  const userId = decimalId(currentUser.USER_ID, "Facebook Comet CurrentUserInitialData.USER_ID");
  if (accountId !== userId) {
    throw new Error("Facebook Comet bootstrap viewer identities did not agree");
  }
  const relay = requiredModule(modules, "RelayAPIConfigDefaults");
  const actingId = decimalId(relay.actorID, "Facebook Comet RelayAPIConfigDefaults.actorID");
  if (actingId !== userId) {
    throw new Error("Facebook Comet bootstrap viewer and actor did not agree");
  }
  if (parsedOptions.expectedViewerId !== null && parsedOptions.expectedViewerId !== userId)
    throw new Error("Facebook Comet bootstrap viewer did not match the expected identity");
  if (parsedOptions.expectedActingId !== null && parsedOptions.expectedActingId !== actingId)
    throw new Error("Facebook Comet bootstrap actor did not match the expected identity");
  const dtsg = requiredModule(modules, "DTSGInitialData");
  const fbDtsg = proofToken(dtsg.token, "Facebook Comet DTSGInitialData.token", 4096);
  const lsd = proofToken(requiredModule(modules, "LSD").token, "Facebook Comet LSD.token", 512);
  const jazoest = deriveJazoest(fbDtsg, requiredModule(modules, "SprinkleConfig"));
  const siteData = requiredModule(modules, "SiteData");
  if (siteData.wbloks_env !== false || siteData.is_comet !== undefined && siteData.is_comet !== true) {
    throw new Error("Facebook Comet SiteData did not describe a reviewed Comet environment");
  }
  const revision = String(boundedPositiveInteger(siteData.client_revision, "Facebook Comet SiteData.client_revision", Number.MAX_SAFE_INTEGER));
  const hsi = decimalId(siteData.hsi, "Facebook Comet SiteData.hsi");
  const cometRequest = String(boundedPositiveInteger(siteData.comet_env, "Facebook Comet SiteData.comet_env", 999));
  const bootstrap = Object.freeze({
    viewerId: userId,
    actingId,
    evidence: BOOTSTRAP_EVIDENCE
  });
  bootstrapMaterial.set(bootstrap, {
    viewerId: userId,
    actingId,
    fbDtsg,
    jazoest,
    lsd,
    revision,
    hsi,
    cometRequest,
    nextRequestCounter: 1
  });
  return bootstrap;
}
function requireBootstrapMaterial(bootstrap) {
  const material = bootstrapMaterial.get(bootstrap);
  if (material === undefined) {
    throw new Error("Facebook Comet bootstrap handle is invalid");
  }
  return material;
}
function takeRequestCounter(material) {
  const current = material.nextRequestCounter;
  if (!Number.isSafeInteger(current) || current < 1 || current > MAX_REQUEST_COUNTER) {
    throw new Error("Facebook Comet request counter exhausted its reviewed range");
  }
  material.nextRequestCounter += 1;
  return current.toString(36);
}
function requestField(name, value) {
  return Object.freeze([name, value]);
}
function materializeMetaCometRequestProof(bootstrap, request) {
  const material = requireBootstrapMaterial(bootstrap);
  const coordinates = metaRelayRequestProofCoordinates(request);
  if (coordinates.viewerId !== material.viewerId || coordinates.actorId !== material.actingId) {
    throw new Error("Facebook Comet request proof did not match its request access coordinates");
  }
  const fieldNames = [];
  for (const name of coordinates.proofFormFields) {
    if (!REQUEST_PROOF_EVIDENCE.fields.some((field) => field.name === name) || fieldNames.includes(name)) {
      throw new Error("Facebook Comet request proof fields did not match its descriptor");
    }
    fieldNames.push(name);
  }
  const valueFor = (name) => {
    switch (name) {
      case "__user":
        return material.viewerId;
      case "av":
        return material.actingId;
      case "fb_dtsg":
        return material.fbDtsg;
      case "jazoest":
        return material.jazoest;
      case "lsd":
        return material.lsd;
      case "__rev":
        return material.revision;
      case "__hsi":
        return material.hsi;
      case "__comet_req":
        return material.cometRequest;
      case "__req":
        return takeRequestCounter(material);
    }
  };
  const evidence = Object.freeze({
    ...REQUEST_PROOF_EVIDENCE,
    fields: Object.freeze(REQUEST_PROOF_EVIDENCE.fields.filter((field) => fieldNames.includes(field.name)))
  });
  const proof = Object.freeze({
    evidence
  });
  requestMaterial.set(proof, {
    fields: Object.freeze(fieldNames.map((name) => requestField(name, valueFor(name)))),
    request,
    consumed: false
  });
  return proof;
}
function isMetaCometNetworkWriter(value) {
  return typeof value === "function";
}
function consumeMetaCometRequestProof(proof, request, sinkValue) {
  const material = requestMaterial.get(proof);
  if (material === undefined) {
    throw new Error("Facebook Comet request-proof handle is invalid");
  }
  if (material.consumed) {
    throw new Error("Facebook Comet request proof was already consumed");
  }
  metaRelayRequestProofCoordinates(request);
  if (material.request !== request) {
    throw new Error("Facebook Comet request proof did not match its request handle");
  }
  if (consumedRequests.has(request)) {
    throw new Error("Facebook Comet request handle was already consumed");
  }
  const sink = record2(sinkValue, "Facebook Comet request-proof sink");
  exactInputKeys(sink, ["sink", "write"], [], "Facebook Comet request-proof sink");
  const write = sink.write;
  if (sink.sink !== "network-request" || !isMetaCometNetworkWriter(write)) {
    throw new Error("Facebook Comet raw proof may flow only to the network-request sink");
  }
  material.consumed = true;
  consumedRequests.add(request);
  try {
    for (const [name, value] of material.fields)
      write(name, value);
  } catch {
    throw new Error("Facebook Comet request-proof network sink failed");
  }
  return proof.evidence;
}

// src/providers/meta-relay-bundle.ts
import ts from "typescript";
var META_ASSET_ORIGIN = "https://static.xx.fbcdn.net";
var MAX_ROOT_HTML_BYTES = 16 * 1024 * 1024;
var MAX_ASSET_URL_CHARACTERS = 4096;
var MAX_LINK_ELEMENTS = 4096;
var MAX_JSON_SCRIPT_ELEMENTS = 512;
var MAX_JSON_SCRIPT_BYTES = 12 * 1024 * 1024;
var MAX_LINK_ATTRIBUTES = 128;
var MAX_ELEMENT_TAG_CHARACTERS = 64 * 1024;
var MAX_ASSET_URLS = 16;
var MAX_BUNDLE_BYTES = 16 * 1024 * 1024;
var MAX_TOTAL_BUNDLE_BYTES = 64 * 1024 * 1024;
var MAX_BUNDLES = 64;
var UTF8_ENCODER = new TextEncoder;
var FRIENDLY_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{2,160}$/u;
var IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;
var HTML_ATTRIBUTE_NAME_PATTERN = /^[A-Za-z_:][A-Za-z0-9_.:-]*$/u;
var RAW_TEXT_ELEMENT_NAMES = new Set([
  "iframe",
  "noembed",
  "noframes",
  "noscript",
  "script",
  "style",
  "textarea",
  "title",
  "xmp"
]);
var CONTROL_HEADER_KEYWORDS = new Set([
  "catch",
  "for",
  "if",
  "switch",
  "while",
  "with"
]);
var REGEX_PREFIX_KEYWORDS = new Set([
  "await",
  "case",
  "delete",
  "do",
  "else",
  "in",
  "instanceof",
  "new",
  "return",
  "throw",
  "typeof",
  "void",
  "yield"
]);
function utf8ByteLengthWithin(value, maximum) {
  if (value.length > maximum)
    return maximum + 1;
  const bytes = UTF8_ENCODER.encode(value).byteLength;
  return bytes > maximum ? maximum + 1 : bytes;
}
function boundedText(value, maximumBytes, label) {
  const bytes = typeof value === "string" ? utf8ByteLengthWithin(value, maximumBytes) : maximumBytes + 1;
  if (typeof value !== "string" || value.length < 1 || bytes > maximumBytes || value.includes("\x00"))
    throw new Error(`${label} must be bounded inert text`);
  return { text: value, bytes };
}
function inspected(read, label) {
  try {
    return read();
  } catch {
    throw new Error(`${label} could not be inspected as plain data`);
  }
}
function denseArray(value, label, maximum) {
  if (!inspected(() => Array.isArray(value), label)) {
    throw new Error(`${label} must contain between 1 and ${maximum} entries`);
  }
  const array = value;
  const length = inspected(() => array.length, label);
  if (length < 1 || length > maximum) {
    throw new Error(`${label} must contain between 1 and ${maximum} entries`);
  }
  if (inspected(() => Object.getPrototypeOf(array), label) !== Array.prototype) {
    throw new Error(`${label} must be a dense plain array`);
  }
  const result = [];
  for (let index = 0;index < length; index += 1) {
    const descriptor = inspected(() => Object.getOwnPropertyDescriptor(array, String(index)), label);
    if (descriptor === undefined || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true)
      throw new Error(`${label} must be a dense plain array`);
    result.push(descriptor.value);
  }
  const keys = inspected(() => Reflect.ownKeys(array), label);
  if (keys.length !== length + 1 || keys.some((key) => typeof key !== "string" || key !== "length" && !/^(?:0|[1-9][0-9]*)$/u.test(key)))
    throw new Error(`${label} contained unsupported fields`);
  return result;
}
function exactFriendlyName(value) {
  if (typeof value !== "string" || !FRIENDLY_NAME_PATTERN.test(value)) {
    throw new Error("Meta Relay friendly name changed its reviewed grammar");
  }
  return value;
}
function exactMetaAssetUrl(raw) {
  if (raw.length < 1 || raw.length > MAX_ASSET_URL_CHARACTERS || raw.includes("\\"))
    throw new Error("Meta root HTML contained a malformed JavaScript asset source");
  if (!raw.startsWith(`${META_ASSET_ORIGIN}/rsrc.php/`) || raw.includes("?") || raw.includes("#") || raw.includes("%"))
    throw new Error("Meta root HTML contained a noncanonical JavaScript asset source");
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Meta root HTML contained a malformed JavaScript asset source");
  }
  if (parsed.protocol !== "https:" || parsed.origin !== META_ASSET_ORIGIN || parsed.hostname !== "static.xx.fbcdn.net" || parsed.port !== "" || parsed.username !== "" || parsed.password !== "" || parsed.search !== "" || parsed.hash !== "" || parsed.href !== raw || parsed.pathname.length > 2048 || !/^\/rsrc\.php\/(?:[A-Za-z0-9_-]{1,128}\/){1,16}[A-Za-z0-9_-]{1,1024}\.js$/u.test(parsed.pathname))
    throw new Error("Meta root HTML contained an unreviewed JavaScript asset source");
  return parsed.href;
}
function isHtmlSpace(value) {
  return value === " " || value === "\t" || value === `
` || value === "\r" || value === "\f";
}
function isHtmlNameCharacter(value) {
  return value !== undefined && /[A-Za-z0-9_:-]/u.test(value);
}
function htmlTagAt(source, start) {
  let index = start + 1;
  let closing = false;
  if (source[index] === "/") {
    closing = true;
    index += 1;
  }
  const nameStart = index;
  while (isHtmlNameCharacter(source[index]))
    index += 1;
  if (index === nameStart)
    return null;
  const boundary = source[index];
  if (boundary !== ">" && boundary !== "/" && !isHtmlSpace(boundary))
    return null;
  let quote = null;
  for (let cursor = index;cursor < source.length; cursor += 1) {
    if (cursor + 1 - start > MAX_ELEMENT_TAG_CHARACTERS) {
      throw new Error("Meta root HTML contained an oversized element");
    }
    const character = source[cursor];
    if (quote !== null) {
      if (character === quote)
        quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === "<") {
      throw new Error("Meta root HTML contained a malformed element");
    }
    if (character === ">") {
      return {
        closing,
        end: cursor + 1,
        name: source.slice(nameStart, index).toLowerCase(),
        nameEnd: index
      };
    }
  }
  throw new Error("Meta root HTML contained a malformed element");
}
function isExactRawTextClosingTag(source, tag, elementName) {
  if (tag?.closing !== true || tag.name !== elementName)
    return false;
  for (let index = tag.nameEnd;index < tag.end - 1; index += 1) {
    if (!isHtmlSpace(source[index]))
      return false;
  }
  return true;
}
function skipHtmlComment(source, start) {
  const end = source.indexOf("-->", start + 4);
  if (end < 0)
    throw new Error("Meta root HTML contained a malformed comment");
  return end + 3;
}
function skipHtmlDeclaration(source, start) {
  if (source.startsWith("<![CDATA[", start)) {
    const end2 = source.indexOf("]]>", start + 9);
    if (end2 < 0)
      throw new Error("Meta root HTML contained malformed CDATA");
    return end2 + 3;
  }
  const end = source.indexOf(">", start + 2);
  if (end < 0)
    throw new Error("Meta root HTML contained a malformed declaration");
  return end + 1;
}
function rawTextElementEnd(source, start, elementName) {
  let index = start;
  while (index < source.length) {
    const candidate = source.indexOf("</", index);
    if (candidate < 0) {
      throw new Error("Meta root HTML contained an unterminated raw-text element");
    }
    const tag = htmlTagAt(source, candidate);
    if (isExactRawTextClosingTag(source, tag, elementName))
      return tag.end;
    index = candidate + 2;
  }
  throw new Error("Meta root HTML contained an unterminated raw-text element");
}
function rawTextElementClosingTag(source, start, elementName) {
  let index = start;
  while (index < source.length) {
    const candidate = source.indexOf("</", index);
    if (candidate < 0) {
      throw new Error("Meta root HTML contained an unterminated raw-text element");
    }
    const tag = htmlTagAt(source, candidate);
    if (isExactRawTextClosingTag(source, tag, elementName)) {
      return { start: candidate, end: tag.end };
    }
    index = candidate + 2;
  }
  throw new Error("Meta root HTML contained an unterminated raw-text element");
}
function htmlAttributes(source, tagStart, tag) {
  if (tag.end - tagStart > MAX_ELEMENT_TAG_CHARACTERS) {
    throw new Error("Meta root HTML contained an oversized element");
  }
  const attributes = new Map;
  const bodyEnd = tag.end - 1;
  let index = tag.nameEnd;
  while (index < bodyEnd) {
    let spaces = 0;
    while (isHtmlSpace(source[index])) {
      index += 1;
      spaces += 1;
    }
    if (index >= bodyEnd)
      break;
    if (source[index] === "/") {
      index += 1;
      while (isHtmlSpace(source[index]))
        index += 1;
      if (index !== bodyEnd) {
        throw new Error("Meta root HTML contained malformed element attributes");
      }
      break;
    }
    if (spaces < 1) {
      throw new Error("Meta root HTML contained ambiguous element attributes");
    }
    const nameStart = index;
    while (source[index] !== undefined && /[A-Za-z0-9_.:-]/u.test(source[index] ?? ""))
      index += 1;
    const rawName = source.slice(nameStart, index);
    if (!HTML_ATTRIBUTE_NAME_PATTERN.test(rawName)) {
      throw new Error("Meta root HTML contained malformed element attributes");
    }
    const name = rawName.toLowerCase();
    if (attributes.has(name)) {
      throw new Error("Meta root HTML contained duplicate element attributes");
    }
    if (attributes.size >= MAX_LINK_ATTRIBUTES) {
      throw new Error("Meta root HTML exceeded its reviewed element-attribute bound");
    }
    const afterName = index;
    while (isHtmlSpace(source[index]))
      index += 1;
    let value = null;
    let quoted = false;
    if (source[index] === "=") {
      index += 1;
      while (isHtmlSpace(source[index]))
        index += 1;
      const quote = source[index];
      if (quote === "'" || quote === '"') {
        quoted = true;
        index += 1;
        const valueStart = index;
        while (index < bodyEnd && source[index] !== quote)
          index += 1;
        if (index >= bodyEnd) {
          throw new Error("Meta root HTML contained malformed element attributes");
        }
        value = source.slice(valueStart, index);
        index += 1;
        if (index < bodyEnd && !isHtmlSpace(source[index]) && source[index] !== "/") {
          throw new Error("Meta root HTML contained ambiguous element attributes");
        }
      } else {
        const valueStart = index;
        while (index < bodyEnd && !isHtmlSpace(source[index]))
          index += 1;
        value = source.slice(valueStart, index);
        if (value.length < 1 || /["'`=<>]/u.test(value)) {
          throw new Error("Meta root HTML contained malformed element attributes");
        }
      }
    } else {
      index = afterName;
    }
    attributes.set(name, { value, quoted });
  }
  return attributes;
}
function exactPreloadScriptHref(attributes) {
  const rel = attributes.get("rel");
  const as = attributes.get("as");
  const relTokens = rel?.value?.split(/[\t\n\f\r ]+/u).filter((token) => token.length > 0) ?? [];
  const hasPreloadSemantics = relTokens.some((token) => token.toLowerCase() === "preload");
  if (hasPreloadSemantics && rel?.value !== "preload") {
    throw new Error("Meta root HTML contained an ambiguous preload relation");
  }
  const hasScriptSemantics = as?.value?.toLowerCase() === "script";
  if (hasScriptSemantics && as?.value !== "script") {
    throw new Error("Meta root HTML contained an ambiguous script destination");
  }
  if (!hasPreloadSemantics || !hasScriptSemantics)
    return null;
  const href = attributes.get("href");
  if (href?.quoted !== true || href.value === null) {
    throw new Error("Meta preload-script link omitted one quoted href");
  }
  return href.value;
}
function extractMetaRelayBundleUrls(htmlValue) {
  const { text: html } = boundedText(htmlValue, MAX_ROOT_HTML_BYTES, "Meta root HTML");
  const urls = [];
  const unique = new Set;
  let linkElements = 0;
  let index = 0;
  while (index < html.length) {
    const tagStart = html.indexOf("<", index);
    if (tagStart < 0)
      break;
    if (html.startsWith("<!--", tagStart)) {
      index = skipHtmlComment(html, tagStart);
      continue;
    }
    if (html.startsWith("<!", tagStart) || html.startsWith("<?", tagStart)) {
      index = skipHtmlDeclaration(html, tagStart);
      continue;
    }
    const tag = htmlTagAt(html, tagStart);
    if (tag === null) {
      index = tagStart + 1;
      continue;
    }
    index = tag.end;
    if (!tag.closing && RAW_TEXT_ELEMENT_NAMES.has(tag.name)) {
      index = rawTextElementEnd(html, tag.end, tag.name);
      continue;
    }
    if (tag.closing || tag.name !== "link")
      continue;
    linkElements += 1;
    if (linkElements > MAX_LINK_ELEMENTS) {
      throw new Error("Meta root HTML exceeded its reviewed link-element bound");
    }
    const href = exactPreloadScriptHref(htmlAttributes(html, tagStart, tag));
    if (href === null)
      continue;
    const exact = exactMetaAssetUrl(href);
    if (unique.has(exact))
      continue;
    unique.add(exact);
    urls.push(exact);
    if (urls.length > MAX_ASSET_URLS) {
      throw new Error("Meta root HTML exposed too many preload-script assets");
    }
  }
  if (urls.length < 1) {
    throw new Error("Meta root HTML omitted a reviewed preload-script asset");
  }
  return Object.freeze(urls);
}
function extractMetaJsonScriptTexts(htmlValue) {
  const { text: html } = boundedText(htmlValue, MAX_ROOT_HTML_BYTES, "Meta root HTML");
  const texts = [];
  let scriptElements = 0;
  let index = 0;
  while (index < html.length) {
    const tagStart = html.indexOf("<", index);
    if (tagStart < 0)
      break;
    if (html.startsWith("<!--", tagStart)) {
      index = skipHtmlComment(html, tagStart);
      continue;
    }
    if (html.startsWith("<!", tagStart) || html.startsWith("<?", tagStart)) {
      index = skipHtmlDeclaration(html, tagStart);
      continue;
    }
    const tag = htmlTagAt(html, tagStart);
    if (tag === null) {
      index = tagStart + 1;
      continue;
    }
    index = tag.end;
    if (tag.closing || tag.name !== "script") {
      if (!tag.closing && RAW_TEXT_ELEMENT_NAMES.has(tag.name)) {
        index = rawTextElementEnd(html, tag.end, tag.name);
      }
      continue;
    }
    scriptElements += 1;
    if (scriptElements > MAX_JSON_SCRIPT_ELEMENTS) {
      throw new Error("Meta root HTML exceeded its reviewed script-element bound");
    }
    const attributes = htmlAttributes(html, tagStart, tag);
    const closing = rawTextElementClosingTag(html, tag.end, "script");
    index = closing.end;
    const type = attributes.get("type");
    if (type?.value?.toLowerCase() === "application/json") {
      if (type.quoted !== true || type.value !== "application/json") {
        throw new Error("Meta JSON script contained an ambiguous type attribute");
      }
      const text = html.slice(tag.end, closing.start);
      if (utf8ByteLengthWithin(text, MAX_JSON_SCRIPT_BYTES) > MAX_JSON_SCRIPT_BYTES) {
        throw new Error("Meta bootloader JSON script exceeded its reviewed bound");
      }
      texts.push(text);
    }
  }
  if (texts.length < 1) {
    throw new Error("Meta HTML response omitted bootloader JSON");
  }
  return Object.freeze(texts);
}
function skipQuoted(source, start, quote) {
  for (let index = start + 1;index < source.length; index += 1) {
    const character = source[index];
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (character === quote)
      return index + 1;
    if (quote !== "`" && isLineTerminator(character)) {
      throw new Error("Meta Relay bundle contained malformed JavaScript");
    }
  }
  throw new Error("Meta Relay bundle contained malformed JavaScript");
}
function isLineTerminator(value) {
  return value === `
` || value === "\r" || value === "\u2028" || value === "\u2029";
}
function skipLineComment(source, start) {
  for (let index = start + 2;index < source.length; index += 1) {
    if (isLineTerminator(source[index])) {
      return source[index] === "\r" && source[index + 1] === `
` ? index + 2 : index + 1;
    }
  }
  return source.length;
}
function skipBlockComment(source, start) {
  const end = source.indexOf("*/", start + 2);
  if (end < 0)
    throw new Error("Meta Relay bundle contained malformed JavaScript");
  return end + 2;
}
function skipRegexLiteral(source, start) {
  let inClass = false;
  for (let index = start + 1;index < source.length; index += 1) {
    const character = source[index];
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (isLineTerminator(character)) {
      throw new Error("Meta Relay bundle contained malformed JavaScript");
    }
    if (character === "[")
      inClass = true;
    else if (character === "]")
      inClass = false;
    else if (character === "/" && !inClass) {
      index += 1;
      while (/[A-Za-z]/u.test(source[index] ?? ""))
        index += 1;
      return index;
    }
  }
  throw new Error("Meta Relay bundle contained malformed JavaScript");
}
function identifierEnd(source, start) {
  let index = start + 1;
  while (/[A-Za-z0-9_$]/u.test(source[index] ?? ""))
    index += 1;
  return index;
}
function numberEnd(source, start) {
  let index = start + 1;
  while (/[A-Za-z0-9._]/u.test(source[index] ?? ""))
    index += 1;
  return index;
}
function nextNonWhitespace(source, start) {
  let index = start;
  while (/\s/u.test(source[index] ?? ""))
    index += 1;
  return index;
}
function previousNonWhitespace(source, start) {
  for (let index = start - 1;index >= 0; index -= 1) {
    const character = source[index];
    if (character !== undefined && !/\s/u.test(character))
      return character;
  }
  return null;
}
function hasReviewedCallTerminator(source, start) {
  let index = start;
  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];
    if (character !== undefined && /\s/u.test(character)) {
      index += 1;
      continue;
    }
    if (character === "/" && next === "/") {
      index = skipLineComment(source, index);
      continue;
    }
    if (character === "/" && next === "*") {
      index = skipBlockComment(source, index);
      continue;
    }
    return character === ";";
  }
  return true;
}
function findCallEnd(source, openParenthesis) {
  let depth = 1;
  let index = openParenthesis + 1;
  let canStartRegex = true;
  let pendingControlParenthesis = false;
  const controlParentheses = [false];
  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];
    if (character === "'" || character === '"' || character === "`") {
      index = skipQuoted(source, index, character);
      canStartRegex = false;
      pendingControlParenthesis = false;
      continue;
    }
    if (character === "/" && next === "/") {
      index = skipLineComment(source, index);
      continue;
    }
    if (character === "/" && next === "*") {
      index = skipBlockComment(source, index);
      continue;
    }
    if (character === "/" && canStartRegex) {
      index = skipRegexLiteral(source, index);
      canStartRegex = false;
      pendingControlParenthesis = false;
      continue;
    }
    if (character === "/") {
      index += 1;
      canStartRegex = true;
      pendingControlParenthesis = false;
      continue;
    }
    if (character !== undefined && /[A-Za-z_$]/u.test(character)) {
      const end = identifierEnd(source, index);
      const identifier = source.slice(index, end);
      canStartRegex = REGEX_PREFIX_KEYWORDS.has(identifier);
      pendingControlParenthesis = CONTROL_HEADER_KEYWORDS.has(identifier);
      index = end;
      continue;
    }
    if (character !== undefined && /[0-9]/u.test(character)) {
      index = numberEnd(source, index);
      canStartRegex = false;
      pendingControlParenthesis = false;
      continue;
    }
    if (character === "(") {
      depth += 1;
      controlParentheses.push(pendingControlParenthesis);
      canStartRegex = true;
      pendingControlParenthesis = false;
    } else if (character === ")") {
      depth -= 1;
      const closedControlHeader = controlParentheses.pop() ?? false;
      if (depth === 0)
        return index + 1;
      if (depth < 0)
        throw new Error("Meta Relay bundle contained malformed JavaScript");
      canStartRegex = closedControlHeader;
      pendingControlParenthesis = false;
    } else if (character === "]" || character === "}") {
      canStartRegex = false;
      pendingControlParenthesis = false;
    } else if (character !== undefined && !/\s/u.test(character)) {
      canStartRegex = character !== "." && character !== "?";
      pendingControlParenthesis = false;
    }
    index += 1;
  }
  throw new Error("Meta Relay bundle contained malformed JavaScript");
}
function moduleNameFromCall(call) {
  const match = /^__d\s*\(\s*"([A-Za-z][A-Za-z0-9_]{2,220})"\s*,/u.exec(call);
  return match?.[1] ?? null;
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
function docIdFromReviewedModule(call, moduleName) {
  const escapedName = escapeRegExp(moduleName);
  const wrapper = new RegExp(`^__d\\s*\\(\\s*"${escapedName}"\\s*,\\s*\\[\\s*\\]\\s*,\\s*\\(\\s*function\\s*\\(([^)]*)\\)\\s*\\{([\\s\\S]*)\\}\\s*\\)\\s*,\\s*(?:null|-?[0-9]{1,7})\\s*\\)$`, "u");
  const wrapped = wrapper.exec(call);
  if (wrapped?.[1] === undefined || wrapped[2] === undefined) {
    throw new Error("Meta Relay operation module changed its reviewed boundary");
  }
  const parameters = wrapped[1].split(",").map((value) => value.trim());
  if (parameters.length !== 6 || parameters.some((value) => !IDENTIFIER_PATTERN.test(value)) || new Set(parameters).size !== parameters.length)
    throw new Error("Meta Relay operation module changed its reviewed function shape");
  const exporter = parameters[4];
  if (exporter === undefined) {
    throw new Error("Meta Relay operation module omitted its reviewed exporter");
  }
  const exportPattern = new RegExp(`^\\s*(?:"use strict";\\s*)?${escapeRegExp(exporter)}\\.exports\\s*=\\s*(["'])([0-9]{10,24})\\1\\s*;?\\s*$`, "u");
  const exported = exportPattern.exec(wrapped[2]);
  if (exported?.[2] === undefined) {
    throw new Error("Meta Relay operation module did not uniquely export a bounded doc ID");
  }
  return exported[2];
}
function parsedTargetCallPositions(source, moduleName) {
  const sourceFile = ts.createSourceFile("meta-relay-bundle.js", source, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
  const diagnostics = sourceFile.parseDiagnostics ?? [];
  if (diagnostics.length > 0) {
    throw new Error("Meta Relay bundle contained malformed JavaScript");
  }
  const isTargetCall = (node) => {
    if (!ts.isCallExpression(node))
      return false;
    const first = node.arguments[0];
    if (first === undefined || !ts.isStringLiteral(first) && !ts.isNoSubstitutionTemplateLiteral(first) || first.text !== moduleName)
      return false;
    return ts.isIdentifier(node.expression) ? node.expression.text === "__d" : ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "__d";
  };
  const all = new Set;
  const visit = (node) => {
    if (isTargetCall(node)) {
      const expression = node.expression;
      all.add(ts.isIdentifier(expression) ? expression.getStart(sourceFile) : ts.isPropertyAccessExpression(expression) ? expression.name.getStart(sourceFile) : node.getStart(sourceFile));
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  const directStatements = new Set;
  for (const statement of sourceFile.statements) {
    if (ts.isExpressionStatement(statement) && isTargetCall(statement.expression) && ts.isIdentifier(statement.expression.expression)) {
      directStatements.add(statement.expression.getStart(sourceFile));
    }
  }
  return { all, directStatements };
}
function targetModuleDocIds(source, moduleName) {
  const ids = [];
  const parsedPositions = parsedTargetCallPositions(source, moduleName);
  let parenthesisDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let canStartRegex = true;
  let atStatementBoundary = true;
  let pendingControlParenthesis = false;
  const controlParentheses = [];
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];
    if (character === "'" || character === '"' || character === "`") {
      index = skipQuoted(source, index, character);
      canStartRegex = false;
      atStatementBoundary = false;
      pendingControlParenthesis = false;
      continue;
    }
    if (character === "/" && next === "/") {
      index = skipLineComment(source, index);
      continue;
    }
    if (character === "/" && next === "*") {
      index = skipBlockComment(source, index);
      continue;
    }
    if (character === "/" && canStartRegex) {
      index = skipRegexLiteral(source, index);
      canStartRegex = false;
      atStatementBoundary = false;
      pendingControlParenthesis = false;
      continue;
    }
    if (character === "/") {
      index += 1;
      canStartRegex = true;
      atStatementBoundary = false;
      pendingControlParenthesis = false;
      continue;
    }
    if (character !== undefined && /[A-Za-z_$]/u.test(character)) {
      const end = identifierEnd(source, index);
      const identifier = source.slice(index, end);
      const open = nextNonWhitespace(source, end);
      if (identifier === "__d" && source[open] === "(" && parenthesisDepth === 0 && bracketDepth === 0 && braceDepth === 0 && parsedPositions.all.has(index)) {
        const callEnd = findCallEnd(source, open);
        const call = source.slice(index, callEnd);
        if (moduleNameFromCall(call) === moduleName) {
          if (!parsedPositions.directStatements.has(index) || !atStatementBoundary || previousNonWhitespace(source, index) === "." || !hasReviewedCallTerminator(source, callEnd)) {
            throw new Error("Meta Relay operation module changed its reviewed boundary");
          }
          ids.push(docIdFromReviewedModule(call, moduleName));
          if (ids.length > 1) {
            throw new Error("Meta Relay bundle contained a duplicate operation module");
          }
        }
        index = callEnd;
        canStartRegex = false;
        atStatementBoundary = false;
        pendingControlParenthesis = false;
        continue;
      }
      canStartRegex = REGEX_PREFIX_KEYWORDS.has(identifier);
      atStatementBoundary = false;
      pendingControlParenthesis = CONTROL_HEADER_KEYWORDS.has(identifier);
      index = end;
      continue;
    }
    if (character !== undefined && /[0-9]/u.test(character)) {
      index = numberEnd(source, index);
      canStartRegex = false;
      atStatementBoundary = false;
      pendingControlParenthesis = false;
      continue;
    }
    let closedControlHeader = false;
    if (character === "(") {
      parenthesisDepth += 1;
      controlParentheses.push(pendingControlParenthesis);
      pendingControlParenthesis = false;
    } else if (character === ")") {
      parenthesisDepth -= 1;
      closedControlHeader = controlParentheses.pop() ?? false;
      pendingControlParenthesis = false;
    } else if (character === "[")
      bracketDepth += 1;
    else if (character === "]")
      bracketDepth -= 1;
    else if (character === "{")
      braceDepth += 1;
    else if (character === "}")
      braceDepth -= 1;
    if (parenthesisDepth < 0 || bracketDepth < 0 || braceDepth < 0) {
      throw new Error("Meta Relay bundle contained malformed JavaScript");
    }
    if (character === ";" && parenthesisDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      atStatementBoundary = true;
    } else if (character === "}" && parenthesisDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      atStatementBoundary = true;
    } else if (character !== undefined && !/\s/u.test(character)) {
      atStatementBoundary = false;
      pendingControlParenthesis = false;
    }
    if (character === ")") {
      canStartRegex = closedControlHeader;
    } else if (character === "]" || character === "}") {
      canStartRegex = false;
    } else if (character !== undefined && !/\s/u.test(character)) {
      canStartRegex = character !== "." && character !== "?";
    }
    index += 1;
  }
  if (parenthesisDepth !== 0 || bracketDepth !== 0 || braceDepth !== 0) {
    throw new Error("Meta Relay bundle contained malformed JavaScript");
  }
  return ids;
}
function resolveMetaRelayOperationRevision(bundleTextsValue, friendlyNameValue) {
  const friendlyName = exactFriendlyName(friendlyNameValue);
  const moduleName = `${friendlyName}_facebookRelayOperation`;
  const values = denseArray(bundleTextsValue, "Meta Relay bundle list", MAX_BUNDLES);
  const texts = [];
  let totalBytes = 0;
  for (const value of values) {
    const { text, bytes } = boundedText(value, MAX_BUNDLE_BYTES, "Meta Relay bundle");
    totalBytes += bytes;
    if (totalBytes > MAX_TOTAL_BUNDLE_BYTES) {
      throw new Error("Meta Relay bundles exceeded their reviewed aggregate byte bound");
    }
    texts.push(text);
  }
  const ids = [];
  for (const text of texts) {
    const matches = targetModuleDocIds(text, moduleName);
    if (matches[0] !== undefined)
      ids.push(matches[0]);
  }
  if (ids.length < 1) {
    throw new Error("Meta Relay bundles omitted the exact reviewed operation module");
  }
  if (new Set(ids).size !== 1) {
    throw new Error("Meta Relay bundles contained ambiguous registered-operation revisions");
  }
  const docId = ids[0];
  if (docId === undefined) {
    throw new Error("Meta Relay bundles omitted the exact reviewed operation module");
  }
  return Object.freeze({
    schemaVersion: 1,
    friendlyName,
    moduleName,
    docId,
    agreeingBundleCount: ids.length
  });
}

// src/providers/meta-web.ts
var META_WEB_SITES = Object.freeze([
  "instagram",
  "threads",
  "facebook",
  "facebook-page",
  "facebook-group",
  "facebook-marketplace"
]);
var unavailableInstagramContactStats = Object.freeze({
  count: null,
  complete: false,
  lowerBound: false,
  truncated: false,
  lastAt: null,
  lastAtComplete: false,
  lastAtBasis: "unavailable",
  incompleteReasons: Object.freeze(["message-history-capture-required"])
});
var unavailableInstagramContactStatsProjection = projectContactDirectionStats(unavailableInstagramContactStats, unavailableInstagramContactStats);
var META_WEB_OPERATION_NAMES = Object.freeze({
  instagram: Object.freeze([
    "comments.create",
    "comments.read",
    "contacts.list",
    "content.delete",
    "content.edit",
    "content.save",
    "content.share",
    "feeds.read",
    "likes.set",
    "media.publish",
    "media.read",
    "messaging.list",
    "messaging.read",
    "messaging.send",
    "posts.read",
    "posts.repost",
    "profiles.read",
    "reactions.set",
    "relationships.follow.set",
    "replies.create"
  ]),
  threads: Object.freeze([
    "comments.read",
    "content.edit",
    "content.save",
    "content.share",
    "feeds.read",
    "likes.set",
    "media.publish",
    "media.read",
    "messaging.list",
    "messaging.read",
    "messaging.send",
    "posts.publish",
    "posts.quote",
    "posts.read",
    "posts.repost",
    "profiles.read",
    "relationships.follow.set",
    "replies.create",
    "threads.publish"
  ]),
  facebook: Object.freeze([
    "comments.create",
    "comments.read",
    "contacts.list",
    "content.edit",
    "content.save",
    "content.share",
    "feeds.read",
    "likes.set",
    "media.publish",
    "media.read",
    "messaging.list",
    "messaging.read",
    "messaging.send",
    "posts.publish",
    "posts.quote",
    "posts.read",
    "posts.repost",
    "reactions.set",
    "relationships.follow.set",
    "replies.create"
  ]),
  "facebook-page": Object.freeze([
    "comments.create",
    "comments.read",
    "content.edit",
    "content.save",
    "content.schedule",
    "content.share",
    "feeds.read",
    "likes.set",
    "media.publish",
    "media.read",
    "messaging.list",
    "messaging.read",
    "messaging.send",
    "posts.publish",
    "posts.quote",
    "posts.read",
    "posts.repost",
    "reactions.set",
    "relationships.follow.set",
    "replies.create"
  ]),
  "facebook-group": Object.freeze([
    "comments.create",
    "comments.read",
    "communities.membership.set",
    "content.edit",
    "content.save",
    "content.share",
    "feeds.read",
    "likes.set",
    "media.publish",
    "media.read",
    "posts.publish",
    "posts.quote",
    "posts.read",
    "posts.repost",
    "reactions.set",
    "replies.create"
  ]),
  "facebook-marketplace": Object.freeze([
    "content.edit",
    "content.save",
    "content.share",
    "feeds.read",
    "listings.publish",
    "listings.read",
    "media.read",
    "messaging.list",
    "messaging.read",
    "messaging.send"
  ])
});
var META_NUMERIC_ID_PATTERN = /^[1-9][0-9]{0,31}$/u;
function isCanonicalMetaNumericId(value) {
  return typeof value === "string" && META_NUMERIC_ID_PATTERN.test(value);
}
var observed = (reason, contractVersion = 1) => Object.freeze({
  contractVersion,
  effect: "read",
  risk: "R1",
  state: "observed",
  evidence: "live-direct",
  reason
});
var observedMutation = (risk, reason, contractVersion = 1) => Object.freeze({
  contractVersion,
  effect: "write",
  risk,
  state: "observed",
  evidence: "first-party-bundle",
  reason
});
function riskForOperation(operation) {
  if (operation.endsWith(".read") || operation.endsWith(".list") || operation === "feeds.read" || operation === "media.read" || operation === "listings.read")
    return "R1";
  if (operation === "likes.set" || operation === "reactions.set" || operation === "content.save" || operation === "relationships.follow.set" || operation === "communities.membership.set")
    return "R2";
  return "R3";
}
var captureRequired = (operation, reason, contractVersion = 1) => {
  const risk = riskForOperation(operation);
  return Object.freeze({
    contractVersion,
    effect: risk === "R1" ? "read" : "write",
    risk,
    state: "capture-required",
    evidence: "none",
    reason: reason ?? (risk === "R1" ? "the exact acknowledgement-free response and target binding still require a reviewed live capture" : risk === "R2" ? "the exact actor, target, mutation response, and independent desired-state readback require an authorized fixture" : "the exact actor, audience, attachment transport, dispatch response, and independent publication readback require an authorized fixture")
  });
};
function contracts(site, overrides) {
  return Object.freeze(Object.fromEntries(META_WEB_OPERATION_NAMES[site].map((operation) => [
    operation,
    overrides[operation] ?? captureRequired(operation)
  ])));
}
var META_WEB_OPERATIONS = Object.freeze({
  instagram: contracts("instagram", {
    "contacts.list": observed("unique non-viewer participants from one bounded first page of the live direct_v2 inbox summary GET; the contact set and all message statistics retain explicit first-page or unavailable completeness", 1),
    "feeds.read": observed("one bounded first page from live direct /api/v1/feed/timeline JSON with viewer binding and no continuation cursor accepted or exposed", 2),
    "posts.read": observed("live direct /api/v1/media/{id}/info JSON with exact returned-media binding"),
    "media.read": observed("the target-bound media-info response supplies bounded media metadata without copying credentials"),
    "comments.read": observed("one bounded first page from live direct /api/v1/media/{id}/comments JSON with caption/root binding and no continuation cursor accepted or exposed", 2),
    "messaging.list": observed("one bounded first page from the live direct_v2 inbox summary GET, with no continuation cursor accepted or exposed and no seen, ack, or presence endpoint issued", 2),
    "messaging.read": captureRequired("messaging.read", "Direct thread reads require a reviewed no-seen/no-presence capture; listing evidence does not authorize reading messages"),
    "messaging.send": captureRequired("messaging.send", "Instagram messaging is split across Direct, LS/Msys, and E2EE transports; plaintext replay is prohibited"),
    "media.publish": captureRequired("media.publish", "one exact plan-bound MP4 and JPEG cover can reach one configure POST, but the observed first response was 202 without an accepted target; no safe retry or independent upload-ID reconciliation contract is proven", 3),
    "content.delete": observedMutation("R3", "two exact authored-video pre-reads bind actor, caption, kind, full media ID, and shortcode before one delete POST; did_delete acknowledgement and the exact authenticated soft-200 removal marker verify deletion", 2),
    "profiles.read": observed("live direct target-bound /api/v1/users/web_profile_info JSON with exact current-viewer ID binding and exact follower, following, and post counts")
  }),
  threads: contracts("threads", {
    "feeds.read": observed("one bounded first page from live direct signed-in Threads Relay preload JSON with exact Barcelona viewer binding and no continuation cursor accepted or exposed", 2),
    "posts.publish": observedMutation("R3", "reviewed live configure_text_post_app_feed create with optional single-PNG upload, exact minimal created-locator binding, durable response-bound post identity plus completed-upload dimensions when an image is supplied, and independent exact permalink actor/text and optional image readback", 5),
    "media.publish": observedMutation("R3", "reviewed live single-MP4 rupload_igvideo transfer with synchronous 200 completion, exact configure_text_post_app_feed actor and created-locator binding, durable response-bound post identity plus completed-upload dimensions, and independent exact permalink actor/text/video readback", 1),
    "profiles.read": observed("live direct target-bound signed-in Threads profile HTML preload with exact current-viewer ID binding; recent views remain explicitly unavailable while this account is below the provider's Insights eligibility threshold"),
    "messaging.list": captureRequired("messaging.list", "Threads inbox uses Lightspeed/Msys state and may acknowledge or update presence; Relay setup metadata is not message-list authority"),
    "messaging.read": captureRequired("messaging.read", "Threads conversation reads require protocol-correct Lightspeed/Msys acknowledgement analysis"),
    "messaging.send": captureRequired("messaging.send", "Threads message send requires protocol-correct Lightspeed/Msys or E2EE implementation")
  }),
  facebook: contracts("facebook", {
    "contacts.list": captureRequired("contacts.list", "personal Facebook contacts require either an exact friends collection or a separately reviewed Messenger-participant transport with actor binding, paging, completeness, and acknowledgement analysis"),
    "feeds.read": observed("live direct signed-in Comet Relay news-feed preload JSON with exact current-user binding", 2),
    "messaging.list": captureRequired("messaging.list", "a homepage Comet preload does not establish the inbox route or folder, paging or completeness, or acknowledgement/presence behavior; Messenger Msys/E2EE needs its own reviewed transport", 2),
    "messaging.read": captureRequired("messaging.read", "Messenger conversation reads require protocol-correct Lightspeed/Msys acknowledgement analysis"),
    "messaging.send": captureRequired("messaging.send", "Messenger send requires protocol-correct Lightspeed/Msys/E2EE and cannot be represented as a plaintext GraphQL replay")
  }),
  "facebook-page": contracts("facebook-page", {
    "messaging.list": captureRequired("messaging.list", "Page inbox actor switching and Page-vs-person recipient binding require a reviewed business-inbox capture"),
    "messaging.send": captureRequired("messaging.send", "Page messaging requires exact Page actor proof plus protocol-correct inbox transport")
  }),
  "facebook-group": contracts("facebook-group", {
    "feeds.read": observed("live direct signed-in Group HTML bootstrap with exact current-user and numeric Group target binding, complete streamed-fragment assembly, no client-script execution, and no pagination claim", 2)
  }),
  "facebook-marketplace": contracts("facebook-marketplace", {
    "feeds.read": observed("live direct signed-in Marketplace HTML bootstrap plus current-bundle-resolved Relay continuation with exact current-user proof binding, complete streamed-page assembly, and no client-script execution", 2),
    "listings.read": observed("live direct signed-in Marketplace product-details HTML bootstrap with exact current-user and requested-listing binding; the browser item-seen mutation is not executed", 2),
    "messaging.list": captureRequired("messaging.list", "Marketplace inbox scope must remain distinct from personal Messenger and requires listing-bound capture"),
    "messaging.send": captureRequired("messaging.send", "Marketplace send requires exact listing, seller/buyer, thread, and protocol-correct Messenger binding")
  })
});
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isUnknownArray2(value) {
  return Array.isArray(value);
}
function record3(value, label) {
  if (!isRecord3(value))
    throw new Error(`${label} must be an object`);
  return value;
}
function boundedString2(value, label, maximum, allowEmpty = false) {
  if (typeof value !== "string" || !allowEmpty && value.length < 1 || value.length > maximum || /[\0\r]/u.test(value))
    throw new Error(`${label} must be bounded text`);
  return value;
}
function optionalString(value, label, maximum) {
  if (value === undefined || value === null || value === "")
    return null;
  return boundedString2(value, label, maximum);
}
function optionalInteger(value, label) {
  if (value === undefined || value === null)
    return null;
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(`${label} must be a non-negative integer`);
  return value;
}
function optionalBoolean(value, label) {
  if (value === undefined || value === null)
    return null;
  if (typeof value !== "boolean")
    throw new Error(`${label} must be boolean`);
  return value;
}
var MAX_JSON_SCRIPTS = 512;
var MAX_TREE_NODES2 = 250000;
var MAX_TREE_DEPTH2 = 40;
var FACEBOOK_HOME_STREAM_KEY_PATTERN = /^adp_CometModernHomeFeedQueryRelayPreloader_[A-Za-z0-9_]{1,192}$/u;
var FACEBOOK_GROUP_STREAM_KEY_PATTERN = /^adp_CometGroupDiscussionRootSuccessQueryRelayPreloader_[A-Za-z0-9_]{1,192}$/u;
var FACEBOOK_MARKETPLACE_FEED_STREAM_KEY_PATTERN = /^adp_MarketplaceCometBrowseFeedLightContainerQueryRelayPreloader_[A-Za-z0-9_]{1,192}$/u;
var FACEBOOK_MARKETPLACE_LISTING_DETAIL_STREAM_KEY_PATTERN = /^adp_MarketplacePDPContainerQueryRelayPreloader_[A-Za-z0-9_]{1,192}$/u;
var FACEBOOK_MARKETPLACE_LISTING_MEDIA_STREAM_KEY_PATTERN = /^adp_MarketplacePDPC2CMediaViewerWithImagesQueryRelayPreloader_[A-Za-z0-9_]{1,192}$/u;
var FACEBOOK_CURRENT_USER_ASYNC_KEY_PATTERN2 = /^adp_WebWorkerV2HasteResponsePreloader_[A-Za-z0-9_]{1,192}$/u;
function parseMetaJsonScripts(html) {
  const texts = extractMetaJsonScriptTexts(html);
  if (texts.length > MAX_JSON_SCRIPTS) {
    throw new Error("Meta HTML response contained too many JSON scripts");
  }
  const results = texts.map((text) => {
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Meta bootloader JSON script was malformed");
    }
  });
  return Object.freeze(results);
}
function parseMetaJsonDocuments(text) {
  if (typeof text !== "string" || text.length < 1 || text.length > 16 * 1024 * 1024 || text.includes("\x00"))
    throw new Error("Meta streamed JSON response must be bounded text");
  let source = text;
  if (source.startsWith("for (;;);"))
    source = source.slice("for (;;);".length);
  const lines = source.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  if (lines.length < 1 || lines.length > 512) {
    throw new Error("Meta streamed JSON response had an unsupported document count");
  }
  const documents = lines.map((line, index) => {
    if (line.length > 4 * 1024 * 1024) {
      throw new Error(`Meta streamed JSON document[${index}] exceeded its reviewed bound`);
    }
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error(`Meta streamed JSON document[${index}] was malformed`);
    }
    if (!isRecord3(parsed)) {
      throw new Error(`Meta streamed JSON document[${index}] must be an object`);
    }
    return parsed;
  });
  return Object.freeze(documents);
}
function walk(roots, visit) {
  let nodes = 0;
  const stack = roots.map((value) => ({ value, path: Object.freeze([]), depth: 0 })).reverse();
  while (stack.length > 0) {
    const item = stack.pop();
    if (item === undefined)
      break;
    nodes += 1;
    if (nodes > MAX_TREE_NODES2)
      throw new Error("Meta bootloader JSON exceeded its reviewed structural bound");
    visit(item.value, item.path);
    if (item.depth >= MAX_TREE_DEPTH2) {
      if (Array.isArray(item.value) && item.value.length > 0 || isRecord3(item.value) && Object.keys(item.value).length > 0) {
        throw new Error("Meta bootloader JSON exceeded its reviewed depth bound");
      }
      continue;
    }
    if (Array.isArray(item.value)) {
      if (item.value.length > 1e4)
        throw new Error("Meta bootloader JSON contained an oversized array");
      for (let index = item.value.length - 1;index >= 0; index -= 1) {
        stack.push({
          value: item.value[index],
          path: Object.freeze([...item.path, "[]"]),
          depth: item.depth + 1
        });
      }
    } else if (isRecord3(item.value)) {
      const entries = Object.entries(item.value);
      if (entries.length > 1e4)
        throw new Error("Meta bootloader JSON contained an oversized object");
      for (let index = entries.length - 1;index >= 0; index -= 1) {
        const entry = entries[index];
        if (entry === undefined)
          continue;
        stack.push({
          value: entry[1],
          path: Object.freeze([...item.path, entry[0]]),
          depth: item.depth + 1
        });
      }
    }
  }
}
function pathEquals(value, expected) {
  return value.length === expected.length && value.every((segment, index) => segment === expected[index]);
}
function directRelayResultMatches(roots, path, value) {
  return pathEquals(path, ["result"]) && roots.some((root) => isRecord3(root) && root.result === value);
}
function directRelayDataMatches(roots, path, value) {
  if (pathEquals(path, ["data"])) {
    return roots.some((root) => isRecord3(root) && root.data === value);
  }
  return pathEquals(path, ["result", "data"]) && roots.some((root) => isRecord3(root) && isRecord3(root.result) && root.result.data === value);
}
function relayPrefetchedStreamResultMatches(roots, path, value, selectData, preloaderKeyPattern) {
  return relayPrefetchedStreamResultKey(roots, path, value, selectData, preloaderKeyPattern) !== null;
}
function relayPrefetchedStreamResultKey(roots, path, value, selectData, preloaderKeyPattern) {
  const expectedPath = selectData ? [
    "require",
    "[]",
    "[]",
    "[]",
    "__bbox",
    "require",
    "[]",
    "[]",
    "[]",
    "__bbox",
    "result",
    "data"
  ] : [
    "require",
    "[]",
    "[]",
    "[]",
    "__bbox",
    "require",
    "[]",
    "[]",
    "[]",
    "__bbox",
    "result"
  ];
  if (!pathEquals(path, expectedPath))
    return null;
  let matchedKey = null;
  for (const root of roots) {
    if (!isRecord3(root) || !isUnknownArray2(root.require))
      continue;
    for (const scheduled of root.require) {
      if (!isUnknownArray2(scheduled) || scheduled.length !== 4 || scheduled[0] !== "ScheduledServerJS" || scheduled[1] !== "handle" || scheduled[2] !== null || !isUnknownArray2(scheduled[3]))
        continue;
      for (const scheduledPayload of scheduled[3]) {
        if (!isRecord3(scheduledPayload) || !isRecord3(scheduledPayload.__bbox) || !isUnknownArray2(scheduledPayload.__bbox.require))
          continue;
        for (const stream of scheduledPayload.__bbox.require) {
          if (!isUnknownArray2(stream) || stream.length !== 4 || stream[0] !== "RelayPrefetchedStreamCache" || stream[1] !== "next" || !isUnknownArray2(stream[2]) || stream[2].length !== 0 || !isUnknownArray2(stream[3]) || stream[3].length !== 2 || typeof stream[3][0] !== "string" || !preloaderKeyPattern.test(stream[3][0]))
            continue;
          const streamPayload = stream[3][1];
          if (!isRecord3(streamPayload) || !isRecord3(streamPayload.__bbox) || !isRecord3(streamPayload.__bbox.result))
            continue;
          const selected = selectData ? streamPayload.__bbox.result.data : streamPayload.__bbox.result;
          if (selected !== value)
            continue;
          const candidateKey = stream[3][0];
          if (matchedKey !== null && matchedKey !== candidateKey) {
            throw new Error("Meta streamed result matched multiple preloader keys");
          }
          matchedKey = candidateKey;
        }
      }
    }
  }
  return matchedKey;
}
function reviewedFacebookHomeFeedDataEnvelopeKey(roots, path, value) {
  return relayPrefetchedStreamResultKey(roots, path, value, true, FACEBOOK_HOME_STREAM_KEY_PATTERN);
}
function isReviewedFacebookHomeFeedResultEnvelope(roots, path, value) {
  return relayPrefetchedStreamResultMatches(roots, path, value, false, FACEBOOK_HOME_STREAM_KEY_PATTERN);
}
function reviewedFacebookHomeFeedResultEnvelopeKey(roots, path, value) {
  return relayPrefetchedStreamResultKey(roots, path, value, false, FACEBOOK_HOME_STREAM_KEY_PATTERN);
}
function isReviewedFacebookGroupRelayResultEnvelope(roots, path, value) {
  return relayPrefetchedStreamResultMatches(roots, path, value, false, FACEBOOK_GROUP_STREAM_KEY_PATTERN);
}
function reviewedFacebookMarketplaceFeedDataEnvelopeKey(roots, path, value) {
  return relayPrefetchedStreamResultKey(roots, path, value, true, FACEBOOK_MARKETPLACE_FEED_STREAM_KEY_PATTERN);
}
function reviewedFacebookMarketplaceFeedResultEnvelopeKey(roots, path, value) {
  return relayPrefetchedStreamResultKey(roots, path, value, false, FACEBOOK_MARKETPLACE_FEED_STREAM_KEY_PATTERN);
}
function isReviewedFacebookMarketplaceListingDetailDataEnvelope(roots, path, value) {
  return relayPrefetchedStreamResultMatches(roots, path, value, true, FACEBOOK_MARKETPLACE_LISTING_DETAIL_STREAM_KEY_PATTERN);
}
function isReviewedFacebookMarketplaceListingMediaDataEnvelope(roots, path, value) {
  return relayPrefetchedStreamResultMatches(roots, path, value, true, FACEBOOK_MARKETPLACE_LISTING_MEDIA_STREAM_KEY_PATTERN);
}
function isReviewedFacebookMarketplaceListingResultEnvelope(roots, path, value) {
  return relayPrefetchedStreamResultMatches(roots, path, value, false, FACEBOOK_MARKETPLACE_LISTING_DETAIL_STREAM_KEY_PATTERN) || relayPrefetchedStreamResultMatches(roots, path, value, false, FACEBOOK_MARKETPLACE_LISTING_MEDIA_STREAM_KEY_PATTERN);
}
function assertEmptyProviderErrors(value, label) {
  if (!Object.hasOwn(value, "errors"))
    return;
  if (!Array.isArray(value.errors)) {
    throw new Error(`${label}.errors must be an array`);
  }
  if (value.errors.length > 0) {
    throw new Error(`${label} contained provider errors`);
  }
}
function directModuleContainerContains(roots, path, moduleValue) {
  if (!pathEquals(path, ["require", "[]"]) && !pathEquals(path, ["define", "[]"]))
    return false;
  const containerName = path[0];
  if (containerName === undefined)
    return false;
  return roots.some((root) => isRecord3(root) && Array.isArray(root[containerName]) && root[containerName].some((candidate) => candidate === moduleValue));
}
function scheduledServerModuleContainerContains(roots, path, moduleValue) {
  const innerContainerName = path[5];
  if (!pathEquals(path, [
    "require",
    "[]",
    "[]",
    "[]",
    "__bbox",
    "define",
    "[]"
  ]) && !pathEquals(path, [
    "require",
    "[]",
    "[]",
    "[]",
    "__bbox",
    "require",
    "[]"
  ]) || innerContainerName !== "define" && innerContainerName !== "require")
    return false;
  for (const root of roots) {
    if (!isRecord3(root) || !Array.isArray(root.require))
      continue;
    for (const scheduledValue of root.require) {
      if (!Array.isArray(scheduledValue) || scheduledValue.length !== 4 || scheduledValue[0] !== "ScheduledServerJS" || scheduledValue[1] !== "handle" || scheduledValue[2] !== null || !Array.isArray(scheduledValue[3]))
        continue;
      for (const payload of scheduledValue[3]) {
        if (!isRecord3(payload) || !isRecord3(payload.__bbox))
          continue;
        const container = payload.__bbox[innerContainerName];
        if (Array.isArray(container) && container.some((candidate) => candidate === moduleValue))
          return true;
      }
    }
  }
  return false;
}
function hydratedAsyncDataModuleContainerContains(roots, path, moduleValue) {
  if (!pathEquals(path, [
    "require",
    "[]",
    "[]",
    "[]",
    "__bbox",
    "require",
    "[]",
    "[]",
    "[]",
    "data",
    "__bbox",
    "hrp",
    "jsmods",
    "define",
    "[]"
  ]))
    return false;
  for (const root of roots) {
    if (!isRecord3(root) || !isUnknownArray2(root.require))
      continue;
    for (const scheduledValue of root.require) {
      if (!isUnknownArray2(scheduledValue) || scheduledValue.length !== 4 || scheduledValue[0] !== "ScheduledServerJS" || scheduledValue[1] !== "handle" || scheduledValue[2] !== null || !isUnknownArray2(scheduledValue[3]))
        continue;
      for (const scheduledPayload of scheduledValue[3]) {
        if (!isRecord3(scheduledPayload) || !isRecord3(scheduledPayload.__bbox) || !isUnknownArray2(scheduledPayload.__bbox.require))
          continue;
        for (const asyncValue of scheduledPayload.__bbox.require) {
          if (!isUnknownArray2(asyncValue) || asyncValue.length !== 4 || asyncValue[0] !== "AsyncData" || asyncValue[1] !== "resolve" || !isUnknownArray2(asyncValue[2]) || asyncValue[2].length !== 0 || !isUnknownArray2(asyncValue[3]) || asyncValue[3].length !== 2 || typeof asyncValue[3][0] !== "string" || !FACEBOOK_CURRENT_USER_ASYNC_KEY_PATTERN2.test(asyncValue[3][0]))
            continue;
          const asyncPayload = asyncValue[3][1];
          if (!isRecord3(asyncPayload) || !isRecord3(asyncPayload.data))
            continue;
          const dataBbox = asyncPayload.data.__bbox;
          if (!isRecord3(dataBbox) || !isRecord3(dataBbox.hrp))
            continue;
          const jsmods = dataBbox.hrp.jsmods;
          if (isRecord3(jsmods) && isUnknownArray2(jsmods.define) && jsmods.define.some((candidate) => candidate === moduleValue))
            return true;
        }
      }
    }
  }
  return false;
}
function modulePathIsReviewed2(roots, path, moduleValue, moduleName) {
  return directModuleContainerContains(roots, path, moduleValue) || scheduledServerModuleContainerContains(roots, path, moduleValue) || moduleName === "CurrentUserInitialData" && hydratedAsyncDataModuleContainerContains(roots, path, moduleValue);
}
function modulePayloads(roots, moduleName) {
  const results = [];
  walk(roots, (value, path) => {
    if (!Array.isArray(value) || value[0] !== moduleName)
      return;
    if (!modulePathIsReviewed2(roots, path, value, moduleName)) {
      throw new Error(`${moduleName} appeared outside a reviewed module path`);
    }
    if (value.length !== 4 || !Array.isArray(value[1]) || value[1].length !== 0 || !isRecord3(value[2]) || !Number.isSafeInteger(value[3]) || value[3] < 0) {
      throw new Error(`${moduleName} module was malformed`);
    }
    results.push(value[2]);
  });
  return Object.freeze(results);
}
function oneStableId(values, label) {
  const ids = new Set;
  for (const value of values) {
    if (isCanonicalMetaNumericId(value))
      ids.add(value);
  }
  if (ids.size !== 1)
    throw new Error(`${label} did not resolve to exactly one stable account ID`);
  return [...ids][0];
}
function parseInstagramViewerId(html) {
  const roots = parseMetaJsonScripts(html);
  const payloads = modulePayloads(roots, "PolarisViewer");
  return oneStableId(payloads.map((payload) => payload.id), "Instagram Polaris viewer");
}
function parseFacebookViewerId(html) {
  const roots = parseMetaJsonScripts(html);
  const payloads = modulePayloads(roots, "CurrentUserInitialData");
  if (payloads.length < 1) {
    throw new Error("Facebook current user did not resolve to exactly one stable account ID");
  }
  const candidates = [];
  for (const [index, payload] of payloads.entries()) {
    if (!isCanonicalMetaNumericId(payload.ACCOUNT_ID) || payload.ACCOUNT_ID !== payload.USER_ID) {
      throw new Error(`Facebook CurrentUserInitialData[${index}] contained malformed or conflicting viewer identities`);
    }
    candidates.push(payload.ACCOUNT_ID);
  }
  return oneStableId(candidates, "Facebook current user");
}

class ThreadsAuthRepairRequiredError extends Error {
  constructor() {
    super("Threads selected session is signed out");
    this.name = "ThreadsAuthRepairRequiredError";
  }
}
function parseThreadsViewerId(html) {
  const roots = parseMetaJsonScripts(html);
  const sessionPayloads = modulePayloads(roots, "BarcelonaSessionInfo");
  if (sessionPayloads.length > 0 && sessionPayloads.every((payload) => payload.is_th_session === true && payload.is_logged_out === true))
    throw new ThreadsAuthRepairRequiredError;
  if (sessionPayloads.length < 1 || sessionPayloads.some((payload) => payload.is_th_session !== true || payload.is_logged_out !== false))
    throw new Error("Threads bootstrap did not prove one signed-in Barcelona session");
  const ids = [];
  walk(roots, (value) => {
    if (!isRecord3(value))
      return;
    const viewer = isRecord3(value.viewer) ? value.viewer : null;
    const user = viewer !== null && isRecord3(viewer.user) ? viewer.user : null;
    if (user !== null)
      ids.push(user.id);
  });
  return oneStableId(ids, "Threads Barcelona viewer");
}
function unavailableProfileMetric(reason) {
  return Object.freeze({ status: "unavailable", reason });
}
function exactProfileMetric(value) {
  if (value === undefined || value === null) {
    return unavailableProfileMetric("not-exposed");
  }
  const candidate = typeof value === "string" && /^(?:0|[1-9][0-9]*)$/u.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(candidate) || candidate < 0) {
    return unavailableProfileMetric("provider-drift");
  }
  return Object.freeze({
    status: "available",
    value: candidate,
    precision: "exact",
    unit: "count"
  });
}
function exactProfileObservedAt(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || !Number.isFinite(Date.parse(value)))
    throw new Error("Meta profile observation time must be one exact UTC instant");
  return value;
}
function profileCountContainer(value) {
  if (value === undefined || value === null) {
    return unavailableProfileMetric("not-exposed");
  }
  if (!isRecord3(value))
    return unavailableProfileMetric("provider-drift");
  return exactProfileMetric(value.count);
}
function canonicalMetaProfileHandle(value, label, maximum) {
  const handle = boundedString2(value, label, maximum).toLowerCase();
  if (!/^[a-z0-9._]+$/u.test(handle)) {
    throw new Error(`${label} must be one canonical profile handle`);
  }
  return handle;
}
function optionalPublicProfileUrl(value, label) {
  const candidate = optionalString(value, label, 2048);
  if (candidate === null)
    return null;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`${label} must be an absolute public URL`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:" || parsed.username !== "" || parsed.password !== "")
    throw new Error(`${label} must be a credential-free public HTTP URL`);
  return parsed.href;
}
function firstProfileBioLink(value, label) {
  if (value === undefined || value === null)
    return null;
  if (!Array.isArray(value) || value.length > 5) {
    throw new Error(`${label} must be a bounded array`);
  }
  for (const [index, item] of value.entries()) {
    if (!isRecord3(item))
      throw new Error(`${label}[${index}] must be an object`);
    const url = optionalPublicProfileUrl(item.url, `${label}[${index}].url`);
    if (url !== null)
      return url;
  }
  return null;
}
function normalizeInstagramProfileStats(value, expectedViewerId, expectedProfile, observedAt) {
  if (!isCanonicalMetaNumericId(expectedViewerId)) {
    throw new Error("Instagram profile expected viewer ID is invalid");
  }
  const profile = canonicalMetaProfileHandle(expectedProfile, "Instagram profile target", 30);
  const root = record3(value, "Instagram profile response");
  if (root.status !== "ok")
    throw new Error("Instagram profile response status changed");
  const data = record3(root.data, "Instagram profile response.data");
  const user = record3(data.user, "Instagram profile response.data.user");
  const id = boundedString2(user.id ?? user.pk, "Instagram profile response user ID", 32);
  if (!isCanonicalMetaNumericId(id) || id !== expectedViewerId) {
    throw new Error("Instagram profile response did not bind the current viewer ID");
  }
  const handle = canonicalMetaProfileHandle(user.username, "Instagram profile response username", 30);
  if (handle !== profile) {
    throw new Error("Instagram profile response did not bind the requested handle");
  }
  const followers = profileCountContainer(user.edge_followed_by);
  const following = profileCountContainer(user.edge_follow);
  const posts = profileCountContainer(user.edge_owner_to_timeline_media);
  const displayName = optionalString(user.full_name, "Instagram profile full_name", 256);
  const bio = optionalString(user.biography, "Instagram profile biography", 2048);
  const websiteUrl = optionalPublicProfileUrl(user.external_url, "Instagram profile external_url");
  const complete = [followers, following, posts].every((metric) => metric.status === "available");
  return Object.freeze({
    schemaVersion: 1,
    provider: "instagram",
    target: Object.freeze({
      kind: "profile",
      id,
      url: `https://www.instagram.com/${handle}/`
    }),
    observedAt: exactProfileObservedAt(observedAt),
    completeness: complete ? "complete" : "partial",
    metrics: Object.freeze({ followers, following, posts }),
    metadata: Object.freeze({
      handle,
      ...displayName === null ? {} : { displayName },
      ...bio === null ? {} : { bio },
      ...websiteUrl === null ? {} : { websiteUrl }
    })
  });
}
function threadsProfileCandidate(value, expectedProfile) {
  if (value.follower_count === undefined || value.username === undefined)
    return null;
  const handle = canonicalMetaProfileHandle(value.username, "Threads profile username", 30);
  if (handle !== expectedProfile)
    return null;
  const id = boundedString2(value.pk ?? value.id, "Threads profile ID", 32);
  if (!isCanonicalMetaNumericId(id))
    throw new Error("Threads profile ID is invalid");
  return Object.freeze({
    id,
    handle,
    displayName: optionalString(value.full_name, "Threads profile full_name", 256),
    bio: optionalString(value.biography, "Threads profile biography", 2048),
    websiteUrl: firstProfileBioLink(value.bio_links, "Threads profile bio_links"),
    followers: exactProfileMetric(value.follower_count)
  });
}
function sameThreadsProfile(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
function normalizeThreadsProfileStats(html, expectedViewerId, expectedProfile, recentViews, observedAt) {
  if (!isCanonicalMetaNumericId(expectedViewerId)) {
    throw new Error("Threads profile expected viewer ID is invalid");
  }
  const profile = canonicalMetaProfileHandle(expectedProfile, "Threads profile target", 30);
  if (parseThreadsViewerId(html) !== expectedViewerId) {
    throw new Error("Threads profile response changed its bound viewer");
  }
  const candidates = [];
  walk(parseMetaJsonScripts(html), (candidate) => {
    if (!isRecord3(candidate))
      return;
    const projected = threadsProfileCandidate(candidate, profile);
    if (projected !== null)
      candidates.push(projected);
  });
  if (candidates.length < 1)
    throw new Error("Threads profile preload omitted the requested profile");
  const first = candidates[0];
  if (candidates.some((candidate) => !sameThreadsProfile(first, candidate))) {
    throw new Error("Threads profile preload returned conflicting profile projections");
  }
  if (first.id !== expectedViewerId) {
    throw new Error("Threads profile response did not bind the current viewer ID");
  }
  const boundRecentViews = recentViews.status === "unavailable" && recentViews.reason === "provider-drift" && first.followers.status === "available" && first.followers.value < 100 ? unavailableProfileMetric("not-authorized") : recentViews;
  const complete = first.followers.status === "available" && boundRecentViews.status === "available";
  return Object.freeze({
    schemaVersion: 1,
    provider: "threads",
    target: Object.freeze({
      kind: "profile",
      id: first.id,
      url: `https://www.threads.com/@${first.handle}`
    }),
    observedAt: exactProfileObservedAt(observedAt),
    completeness: complete ? "complete" : "partial",
    metrics: Object.freeze({ followers: first.followers, recentViews: boundRecentViews }),
    metadata: Object.freeze({
      handle: first.handle,
      ...first.displayName === null ? {} : { displayName: first.displayName },
      ...first.bio === null ? {} : { bio: first.bio },
      ...first.websiteUrl === null ? {} : { websiteUrl: first.websiteUrl }
    })
  });
}
function normalizeThreadsRecentViewsAvailability(html) {
  const source = boundedString2(html, "Threads Insights response", 12 * 1024 * 1024);
  const normalized = source.replaceAll("\\u0027", "'").replaceAll("\\u2019", "'").replaceAll("\u2019", "'").replaceAll("&#39;", "'").replaceAll("&#x27;", "'").replaceAll("&apos;", "'");
  if (normalized.includes("Check back in once you've reached 100 followers to see your insights."))
    return unavailableProfileMetric("not-authorized");
  return unavailableProfileMetric("provider-drift");
}
function instagramUser(value, label) {
  if (value === undefined || value === null)
    return null;
  const user = record3(value, label);
  const id = optionalString(user.pk ?? user.id, `${label}.id`, 32);
  if (id !== null && !isCanonicalMetaNumericId(id)) {
    throw new Error(`${label}.id must be a canonical decimal account ID`);
  }
  return Object.freeze({
    id,
    username: optionalString(user.username, `${label}.username`, 64),
    full_name: optionalString(user.full_name, `${label}.full_name`, 256)
  });
}
function instagramMedia(value, label) {
  const media = record3(value, label);
  const id = boundedString2(media.id, `${label}.id`, 80);
  if (!/^[0-9]{1,32}(?:_[0-9]{1,32})?$/u.test(id))
    throw new Error(`${label}.id must be an exact Instagram media ID`);
  const caption = media.caption === undefined || media.caption === null ? null : optionalString(record3(media.caption, `${label}.caption`).text, `${label}.caption.text`, 1e4);
  return Object.freeze({
    id,
    pk: optionalString(media.pk, `${label}.pk`, 32),
    code: optionalString(media.code, `${label}.code`, 64),
    media_type: optionalInteger(media.media_type, `${label}.media_type`),
    taken_at: optionalInteger(media.taken_at, `${label}.taken_at`),
    caption,
    user: instagramUser(media.user ?? media.owner, `${label}.user`),
    has_liked: optionalBoolean(media.has_liked, `${label}.has_liked`),
    has_viewer_saved: optionalBoolean(media.has_viewer_saved ?? media.has_privately_liked, `${label}.has_viewer_saved`),
    like_count: optionalInteger(media.like_count, `${label}.like_count`),
    comment_count: optionalInteger(media.comment_count, `${label}.comment_count`)
  });
}
function okInstagramEnvelope(value, label) {
  const envelope = record3(value, label);
  if (envelope.status !== "ok")
    throw new Error(`${label}.status must be ok`);
  return envelope;
}
function normalizeInstagramFeed(value, limit) {
  const envelope = okInstagramEnvelope(value, "Instagram timeline response");
  if (!Array.isArray(envelope.feed_items) || envelope.feed_items.length > 500) {
    throw new Error("Instagram timeline response.feed_items must be a bounded array");
  }
  const items = [];
  for (const [index, itemValue] of envelope.feed_items.entries()) {
    const item = record3(itemValue, `Instagram timeline response.feed_items[${index}]`);
    if (item.media_or_ad === undefined)
      continue;
    items.push(instagramMedia(item.media_or_ad, `Instagram timeline media[${index}]`));
    if (items.length >= limit)
      break;
  }
  optionalString(envelope.next_max_id, "Instagram timeline response.next_max_id", 4096);
  optionalBoolean(envelope.more_available, "Instagram timeline response.more_available");
  return Object.freeze({
    feed: "home",
    items: Object.freeze(items),
    page_scope: "first-page-only",
    continuation_supported: false
  });
}
function normalizeInstagramPost(value, mediaId) {
  const envelope = okInstagramEnvelope(value, "Instagram media-info response");
  if (!Array.isArray(envelope.items) || envelope.items.length !== 1) {
    throw new Error("Instagram media-info response must contain exactly one item");
  }
  const item = instagramMedia(envelope.items[0], "Instagram media-info item");
  if (item.id !== mediaId)
    throw new Error("Instagram media-info response did not bind the requested media");
  return item;
}
function normalizeInstagramComments(value, mediaId, limit) {
  const envelope = okInstagramEnvelope(value, "Instagram comments response");
  const caption = record3(envelope.caption, "Instagram comments response.caption");
  const captionMediaId = boundedString2(caption.media_id, "Instagram comments response.caption.media_id", 80);
  const bare = mediaId.split("_", 1)[0] ?? mediaId;
  if (captionMediaId !== mediaId && captionMediaId !== bare) {
    throw new Error("Instagram comments response did not bind the requested media");
  }
  if (!Array.isArray(envelope.comments) || envelope.comments.length > 1e4) {
    throw new Error("Instagram comments response.comments must be a bounded array");
  }
  const comments = envelope.comments.slice(0, limit).map((value2, index) => {
    const comment = record3(value2, `Instagram comments response.comments[${index}]`);
    const id = boundedString2(comment.pk ?? comment.id, `Instagram comments response.comments[${index}].id`, 80);
    return Object.freeze({
      id,
      text: boundedString2(comment.text, `Instagram comments response.comments[${index}].text`, 1e4, true),
      created_at: optionalInteger(comment.created_at, `Instagram comments response.comments[${index}].created_at`),
      parent_comment_id: optionalString(comment.parent_comment_id, `Instagram comments response.comments[${index}].parent_comment_id`, 80),
      user: instagramUser(comment.user, `Instagram comments response.comments[${index}].user`),
      has_liked_comment: optionalBoolean(comment.has_liked_comment, `Instagram comments response.comments[${index}].has_liked_comment`),
      comment_like_count: optionalInteger(comment.comment_like_count, `Instagram comments response.comments[${index}].comment_like_count`)
    });
  });
  optionalString(envelope.next_min_id ?? envelope.next_max_id, "Instagram comments response.next_cursor", 4096);
  optionalBoolean(envelope.has_more_comments ?? envelope.has_more_headload_comments, "Instagram comments response.has_more");
  return Object.freeze({
    media_id: mediaId,
    comments: Object.freeze(comments),
    page_scope: "first-page-only",
    continuation_supported: false
  });
}
function normalizeInstagramInbox(value, viewerId, limit) {
  if (!isCanonicalMetaNumericId(viewerId)) {
    throw new Error("Instagram inbox viewer ID must be a canonical decimal account ID");
  }
  const envelope = okInstagramEnvelope(value, "Instagram inbox response");
  const viewer = record3(envelope.viewer, "Instagram inbox response.viewer");
  const responseViewerId = boundedString2(viewer.pk ?? viewer.id, "Instagram inbox response.viewer.id", 32);
  if (!isCanonicalMetaNumericId(responseViewerId)) {
    throw new Error("Instagram inbox response.viewer.id must be a canonical decimal account ID");
  }
  if (responseViewerId !== viewerId) {
    throw new Error("Instagram inbox response changed its bound viewer");
  }
  const inbox = record3(envelope.inbox, "Instagram inbox response.inbox");
  if (!Array.isArray(inbox.threads) || inbox.threads.length > 1000) {
    throw new Error("Instagram inbox response.inbox.threads must be a bounded array");
  }
  const rawThreadCount = inbox.threads.length;
  const threads = inbox.threads.slice(0, limit).map((value2, index) => {
    const thread = record3(value2, `Instagram inbox response.inbox.threads[${index}]`);
    if (thread.users !== undefined && !Array.isArray(thread.users)) {
      throw new Error(`Instagram inbox thread[${index}].users must be a bounded array`);
    }
    if (Array.isArray(thread.users) && thread.users.length > 100) {
      throw new Error(`Instagram inbox thread[${index}].users exceeded its reviewed bound`);
    }
    const users = Array.isArray(thread.users) ? thread.users.map((user, userIndex) => instagramUser(user, `Instagram inbox thread[${index}].users[${userIndex}]`)) : [];
    return Object.freeze({
      thread_id: boundedString2(thread.thread_id, `Instagram inbox thread[${index}].thread_id`, 512),
      thread_title: optionalString(thread.thread_title, `Instagram inbox thread[${index}].thread_title`, 512),
      users: Object.freeze(users),
      last_activity_at: optionalInteger(thread.last_activity_at, `Instagram inbox thread[${index}].last_activity_at`),
      read_state: optionalInteger(thread.read_state, `Instagram inbox thread[${index}].read_state`),
      pending: optionalBoolean(thread.pending, `Instagram inbox thread[${index}].pending`)
    });
  });
  const providerCursor = optionalString(inbox.oldest_cursor ?? inbox.next_cursor, "Instagram inbox next cursor", 4096);
  const providerHasOlder = optionalBoolean(inbox.has_older, "Instagram inbox has_older") ?? false;
  return Object.freeze({
    folder: "inbox",
    threads: Object.freeze(threads),
    page_scope: "first-page-only",
    continuation_supported: false,
    raw_thread_count: rawThreadCount,
    provider_has_older: providerHasOlder,
    provider_cursor_present: providerCursor !== null,
    pending_requests_total: optionalInteger(envelope.pending_requests_total, "Instagram inbox pending_requests_total")
  });
}
function normalizeInstagramContacts(value, viewerId, threadLimit, contactLimit) {
  const inbox = record3(normalizeInstagramInbox(value, viewerId, threadLimit), "Instagram normalized inbox");
  if (!Array.isArray(inbox.threads)) {
    throw new Error("Instagram normalized inbox omitted its bounded threads");
  }
  const rawThreadCount = optionalInteger(inbox.raw_thread_count, "Instagram normalized inbox.raw_thread_count");
  const providerHasOlder = optionalBoolean(inbox.provider_has_older, "Instagram normalized inbox.provider_has_older");
  const providerCursorPresent = optionalBoolean(inbox.provider_cursor_present, "Instagram normalized inbox.provider_cursor_present");
  if (rawThreadCount === null || providerHasOlder === null || providerCursorPresent === null) {
    throw new Error("Instagram normalized inbox omitted its pagination evidence");
  }
  const byId = new Map;
  for (const [threadIndex, threadValue] of inbox.threads.entries()) {
    const thread = record3(threadValue, `Instagram normalized inbox.threads[${threadIndex}]`);
    if (!Array.isArray(thread.users)) {
      throw new Error(`Instagram normalized inbox.threads[${threadIndex}].users must be a bounded array`);
    }
    for (const [userIndex, userValue] of thread.users.entries()) {
      const user = record3(userValue, `Instagram normalized inbox.threads[${threadIndex}].users[${userIndex}]`);
      const id = boundedString2(user.id, `Instagram normalized inbox.threads[${threadIndex}].users[${userIndex}].id`, 32);
      if (id === viewerId || byId.has(id))
        continue;
      byId.set(id, Object.freeze({
        providerId: id,
        displayName: optionalString(user.full_name, `Instagram normalized inbox.threads[${threadIndex}].users[${userIndex}].full_name`, 256),
        handle: optionalString(user.username, `Instagram normalized inbox.threads[${threadIndex}].users[${userIndex}].username`, 64),
        ...unavailableInstagramContactStatsProjection
      }));
    }
  }
  const allContacts = [...byId.values()];
  const threadLimitReached = rawThreadCount > threadLimit;
  const contactLimitReached = allContacts.length > contactLimit;
  const contactSetIncompleteReasons = [
    "first-inbox-page-only",
    ...providerHasOlder ? ["provider-has-older"] : [],
    ...providerCursorPresent ? ["provider-cursor-present"] : [],
    ...threadLimitReached ? ["thread-limit-reached"] : [],
    ...contactLimitReached ? ["contact-limit-reached"] : []
  ];
  const contactTruncated = providerHasOlder || providerCursorPresent || threadLimitReached || contactLimitReached;
  return Object.freeze({
    provider: "instagram",
    operation: "contacts.list",
    accountSubject: `instagram:${viewerId}`,
    contacts: Object.freeze(allContacts.slice(0, contactLimit)),
    metadataScope: "first-page-inbox-participant-summary",
    contactSetCompleteness: "first-page-only",
    contactSetIncompleteReasons: Object.freeze(contactSetIncompleteReasons),
    contactTruncated,
    statsScope: "unavailable-without-acknowledgement-free-message-history"
  });
}
function positiveThreadsImageDimension(value, label) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 20000) {
    throw new Error(`${label} must be an integer between 1 and 20000`);
  }
  return value;
}
function threadsImageCandidateUrl(value, label) {
  const source = boundedString2(value, label, 16384);
  let url;
  try {
    url = new URL(source);
  } catch {
    throw new Error(`${label} must be an exact reviewed HTTPS media URL`);
  }
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.hash !== "" || ![
    "cdninstagram.com",
    "fbcdn.net",
    "instagram.com",
    "threads.com"
  ].some((family) => hostname === family || hostname.endsWith(`.${family}`)))
    throw new Error(`${label} left the reviewed Threads media host families`);
  return url.href;
}
function threadsImage(post, mediaId, label) {
  const hasImageFields = post.media_type !== undefined || post.original_width !== undefined || post.original_height !== undefined || post.image_versions2 !== undefined;
  if (!hasImageFields)
    return null;
  if (post.media_type !== 1) {
    throw new Error(`${label}.media_type must identify one reviewed image`);
  }
  if (post.carousel_media !== undefined && post.carousel_media !== null) {
    throw new Error(`${label} unexpectedly returned carousel media`);
  }
  const width = positiveThreadsImageDimension(post.original_width, `${label}.original_width`);
  const height = positiveThreadsImageDimension(post.original_height, `${label}.original_height`);
  const versions = record3(post.image_versions2, `${label}.image_versions2`);
  if (!Array.isArray(versions.candidates) || versions.candidates.length < 1 || versions.candidates.length > 20)
    throw new Error(`${label}.image_versions2.candidates must contain 1 to 20 images`);
  let originalCandidateFound = false;
  for (const [index, candidateValue] of versions.candidates.entries()) {
    const candidate = record3(candidateValue, `${label}.image_versions2.candidates[${index}]`);
    const candidateWidth = positiveThreadsImageDimension(candidate.width, `${label}.image_versions2.candidates[${index}].width`);
    const candidateHeight = positiveThreadsImageDimension(candidate.height, `${label}.image_versions2.candidates[${index}].height`);
    threadsImageCandidateUrl(candidate.url, `${label}.image_versions2.candidates[${index}].url`);
    if (candidateWidth === width && candidateHeight === height) {
      originalCandidateFound = true;
    }
  }
  if (!originalCandidateFound) {
    throw new Error(`${label} omitted an exact original-dimension image candidate`);
  }
  return Object.freeze({
    candidateCount: versions.candidates.length,
    height,
    mediaId,
    mediaType: 1,
    width
  });
}
function optionalThreadsVideoDuration(value, label) {
  if (value === undefined || value === null)
    return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 3600)
    throw new Error(`${label} must be a finite duration no longer than 3600 seconds`);
  return value;
}
function optionalThreadsVideoHasAudio(value, label) {
  if (value === undefined || value === null)
    return null;
  if (typeof value !== "boolean")
    throw new Error(`${label} must be boolean when present`);
  return value;
}
function threadsVideo(post, mediaId, label) {
  const hasVideoFields = post.media_type !== undefined || post.original_width !== undefined || post.original_height !== undefined || post.video_versions !== undefined;
  if (!hasVideoFields)
    return null;
  if (post.media_type !== 2) {
    throw new Error(`${label}.media_type must identify one reviewed video`);
  }
  if (post.carousel_media !== undefined && post.carousel_media !== null) {
    throw new Error(`${label} unexpectedly returned carousel media`);
  }
  const width = positiveThreadsImageDimension(post.original_width, `${label}.original_width`);
  const height = positiveThreadsImageDimension(post.original_height, `${label}.original_height`);
  if (!Array.isArray(post.video_versions) || post.video_versions.length < 1 || post.video_versions.length > 20)
    throw new Error(`${label}.video_versions must contain 1 to 20 videos`);
  let originalCandidateFound = false;
  for (const [index, candidateValue] of post.video_versions.entries()) {
    const candidate = record3(candidateValue, `${label}.video_versions[${index}]`);
    const candidateWidth = positiveThreadsImageDimension(candidate.width, `${label}.video_versions[${index}].width`);
    const candidateHeight = positiveThreadsImageDimension(candidate.height, `${label}.video_versions[${index}].height`);
    threadsImageCandidateUrl(candidate.url, `${label}.video_versions[${index}].url`);
    if (candidateWidth === width && candidateHeight === height) {
      originalCandidateFound = true;
    }
  }
  if (!originalCandidateFound) {
    throw new Error(`${label} omitted an exact original-dimension video candidate`);
  }
  return Object.freeze({
    candidateCount: post.video_versions.length,
    durationSeconds: optionalThreadsVideoDuration(post.video_duration, `${label}.video_duration`),
    hasAudio: optionalThreadsVideoHasAudio(post.has_audio, `${label}.has_audio`),
    height,
    mediaId,
    mediaType: 2,
    width
  });
}
function threadsPost(value, label) {
  const post = record3(value, label);
  const id = boundedString2(post.id ?? post.pk, `${label}.id`, 80);
  if (!/^[0-9]{1,32}(?:_[0-9]{1,32})?$/u.test(id))
    throw new Error(`${label}.id must be an exact Threads post ID`);
  const caption = post.caption === undefined || post.caption === null ? null : optionalString(record3(post.caption, `${label}.caption`).text, `${label}.caption.text`, 1e4);
  return Object.freeze({
    id,
    code: optionalString(post.code, `${label}.code`, 64),
    canonical_url: optionalString(post.canonical_url, `${label}.canonical_url`, 2048),
    caption,
    user: instagramUser(post.user, `${label}.user`),
    taken_at: optionalInteger(post.taken_at, `${label}.taken_at`),
    has_liked: optionalBoolean(post.has_liked, `${label}.has_liked`),
    has_viewer_saved: optionalBoolean(post.has_viewer_saved, `${label}.has_viewer_saved`),
    like_count: optionalInteger(post.like_count, `${label}.like_count`)
  });
}
function projectThreadsPublishPost(value, label) {
  const post = record3(value, label);
  const projected = threadsPost(post, label);
  return Object.freeze({
    ...projected,
    image: threadsImage(post, projected.id, label)
  });
}
function projectThreadsPublishVideo(value, label) {
  const post = record3(value, label);
  const projected = threadsPost(post, label);
  return Object.freeze({
    ...projected,
    video: threadsVideo(post, projected.id, label)
  });
}
function normalizeThreadsFeedHtml(html, viewerId, limit) {
  const roots = parseMetaJsonScripts(html);
  if (parseThreadsViewerId(html) !== viewerId)
    throw new Error("Threads feed response changed its bound viewer");
  const posts = [];
  const seen = new Set;
  walk(roots, (value) => {
    if (!isRecord3(value) || !Array.isArray(value.edges) || posts.length >= limit)
      return;
    for (const edgeValue of value.edges) {
      if (posts.length >= limit || !isRecord3(edgeValue))
        break;
      const node = isRecord3(edgeValue.node) ? edgeValue.node : null;
      const thread = node !== null && isRecord3(node.text_post_app_thread) ? node.text_post_app_thread : null;
      if (thread === null || !Array.isArray(thread.thread_items))
        continue;
      for (const itemValue of thread.thread_items) {
        if (posts.length >= limit || !isRecord3(itemValue) || !isRecord3(itemValue.post))
          break;
        const projected = threadsPost(itemValue.post, "Threads feed post");
        const id = projected.id;
        if (typeof id !== "string" || seen.has(id))
          continue;
        seen.add(id);
        posts.push(projected);
      }
    }
  });
  if (posts.length === 0)
    throw new Error("Threads Relay preload omitted a bounded feed");
  return Object.freeze({
    feed: "for-you",
    posts: Object.freeze(posts),
    page_scope: "first-page-only",
    continuation_supported: false
  });
}
function normalizeThreadsPostHtml(html, viewerId, expectedPostId, expectedCode, expectedUrl, expectedCaption, expectedImage) {
  if (!/^[0-9]{1,32}(?:_[0-9]{1,32})?$/u.test(expectedPostId)) {
    throw new Error("Threads readback expected post ID is invalid");
  }
  if (!/^[A-Za-z0-9_-]{1,64}$/u.test(expectedCode)) {
    throw new Error("Threads readback expected post code is invalid");
  }
  let locator;
  try {
    locator = new URL(expectedUrl);
  } catch {
    throw new Error("Threads readback expected permalink is invalid");
  }
  const locatorPath = locator.pathname.split("/");
  if (locator.origin !== "https://www.threads.com" || locator.username !== "" || locator.password !== "" || locator.search !== "" || locator.hash !== "" || locatorPath.length !== 4 || !/^@[A-Za-z0-9._]{1,64}$/u.test(locatorPath[1] ?? "") || locatorPath[2] !== "post" || locatorPath[3] !== expectedCode)
    throw new Error("Threads readback expected permalink is invalid");
  if (parseThreadsViewerId(html) !== viewerId) {
    throw new Error("Threads post readback changed its bound viewer");
  }
  const matches = [];
  walk(parseMetaJsonScripts(html), (value) => {
    if (!isRecord3(value) || value.id !== expectedPostId && value.pk !== expectedPostId || value.caption === undefined || value.user === undefined)
      return;
    const projected = projectThreadsPublishPost(value, "Threads post readback");
    const user = isRecord3(projected.user) ? projected.user : null;
    const imageMatches = expectedImage === null ? projected.image === null : projected.image !== null && projected.image.mediaId === expectedPostId && projected.image.width === expectedImage.width && projected.image.height === expectedImage.height;
    if (projected.caption === expectedCaption && projected.code === expectedCode && projected.canonical_url === locator.href && user?.id === viewerId && imageMatches) {
      matches.push(projected);
    }
  });
  if (matches.length < 1) {
    throw new Error(expectedImage === null ? "Threads post readback did not bind the confirmed actor, ID, code, permalink, and text" : "Threads post readback did not bind the confirmed actor, ID, code, permalink, text, and image");
  }
  if (matches.length !== 1) {
    throw new Error("Threads post readback returned an ambiguous exact post");
  }
  return matches[0];
}
function normalizeThreadsVideoPostHtml(html, viewerId, expectedPostId, expectedCode, expectedUrl, expectedCaption, expectedVideo) {
  if (!/^[0-9]{1,32}(?:_[0-9]{1,32})?$/u.test(expectedPostId)) {
    throw new Error("Threads video readback expected post ID is invalid");
  }
  if (!/^[A-Za-z0-9_-]{1,64}$/u.test(expectedCode)) {
    throw new Error("Threads video readback expected post code is invalid");
  }
  let locator;
  try {
    locator = new URL(expectedUrl);
  } catch {
    throw new Error("Threads video readback expected permalink is invalid");
  }
  const locatorPath = locator.pathname.split("/");
  if (locator.origin !== "https://www.threads.com" || locator.username !== "" || locator.password !== "" || locator.search !== "" || locator.hash !== "" || locatorPath.length !== 4 || !/^@[A-Za-z0-9._]{1,64}$/u.test(locatorPath[1] ?? "") || locatorPath[2] !== "post" || locatorPath[3] !== expectedCode)
    throw new Error("Threads video readback expected permalink is invalid");
  if (parseThreadsViewerId(html) !== viewerId) {
    throw new Error("Threads video post readback changed its bound viewer");
  }
  const matches = [];
  walk(parseMetaJsonScripts(html), (value) => {
    if (!isRecord3(value) || value.id !== expectedPostId && value.pk !== expectedPostId || value.caption === undefined || value.user === undefined)
      return;
    const projected = projectThreadsPublishVideo(value, "Threads video post readback");
    const user = isRecord3(projected.user) ? projected.user : null;
    if (projected.caption === expectedCaption && projected.code === expectedCode && projected.canonical_url === locator.href && user?.id === viewerId && projected.video !== null && projected.video.mediaId === expectedPostId && projected.video.width === expectedVideo.width && projected.video.height === expectedVideo.height)
      matches.push(projected);
  });
  if (matches.length < 1) {
    throw new Error("Threads video post readback did not bind the confirmed actor, ID, code, permalink, text, and video");
  }
  if (matches.length !== 1) {
    throw new Error("Threads video post readback returned an ambiguous exact post");
  }
  return matches[0];
}
function facebookPost(value, label) {
  const node = record3(value, label);
  const id = boundedString2(node.post_id ?? node.id, `${label}.id`, 256);
  const actors = Array.isArray(node.actors) ? node.actors.slice(0, 20).map((actorValue, index) => {
    const actor = record3(actorValue, `${label}.actors[${index}]`);
    return Object.freeze({
      id: optionalString(actor.id, `${label}.actors[${index}].id`, 64),
      name: optionalString(actor.name, `${label}.actors[${index}].name`, 512)
    });
  }) : [];
  let message = null;
  const sections = isRecord3(node.comet_sections) ? node.comet_sections : null;
  const content = sections !== null && isRecord3(sections.content) ? sections.content : null;
  const story = content !== null && isRecord3(content.story) ? content.story : null;
  const storyMessage = story !== null && isRecord3(story.message) ? story.message : null;
  if (storyMessage !== null)
    message = optionalString(storyMessage.text, `${label}.message`, 20000);
  return Object.freeze({
    id,
    permalink_url: optionalString(node.permalink_url, `${label}.permalink_url`, 4096),
    creation_time: optionalInteger(node.creation_time, `${label}.creation_time`),
    message,
    actors: Object.freeze(actors)
  });
}
function normalizeFacebookFeedHtml(html, viewerId, limit) {
  const roots = parseMetaJsonScripts(html);
  if (parseFacebookViewerId(html) !== viewerId)
    throw new Error("Facebook feed response changed its bound viewer");
  assertMetaCometReadActor(roots, viewerId);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 30) {
    throw new Error("Facebook feed limit must be an integer between 1 and 30");
  }
  const posts = [];
  const seen = new Set;
  const indexedEdges = new Map;
  let rootCount = 0;
  let streamedEdgeCount = 0;
  let finalPageInfoCount = 0;
  let streamPhase = "before-root";
  let streamPreloaderKey = null;
  const addNode = (node, label) => {
    if (!isRecord3(node))
      return;
    const isFeedStory = node.__isFeedUnit === "Story";
    if (node.__typename !== undefined && node.__typename !== "Story" && isFeedStory || node.__typename === "Story" && !isFeedStory) {
      throw new Error(`${label} changed its Story type markers`);
    }
    if (!isFeedStory)
      return;
    const post = facebookPost(node, label);
    const id = post.id;
    if (typeof id !== "string")
      return;
    if (seen.has(id))
      throw new Error("Facebook news feed contained a duplicate Story ID");
    seen.add(id);
    if (posts.length < limit)
      posts.push(post);
  };
  walk(roots, (value, path) => {
    if (!isRecord3(value))
      return;
    if (path.length === 0 || isReviewedFacebookHomeFeedResultEnvelope(roots, path, value)) {
      assertEmptyProviderErrors(value, "Facebook news-feed envelope");
    }
    const viewer = isRecord3(value.viewer) ? value.viewer : null;
    const feed = viewer !== null && isRecord3(viewer.news_feed) ? viewer.news_feed : null;
    if (feed !== null) {
      const feedPreloaderKey = reviewedFacebookHomeFeedDataEnvelopeKey(roots, path, value);
      if (feedPreloaderKey === null) {
        throw new Error("Facebook news feed appeared outside its reviewed Relay data root");
      }
      if (streamPhase !== "before-root") {
        throw new Error("Facebook news feed emitted its initial root out of order");
      }
      streamPhase = "edges";
      streamPreloaderKey = feedPreloaderKey;
      if (!Array.isArray(feed.edges) || feed.edges.length > 500) {
        throw new Error("Facebook news-feed root edges must be a bounded array");
      }
      rootCount += 1;
      for (const [index, edgeValue] of feed.edges.entries()) {
        const edge = record3(edgeValue, `Facebook news-feed edge[${index}]`);
        boundedString2(edge.cursor, `Facebook news-feed edge[${index}].cursor`, 4096);
        if (indexedEdges.has(index)) {
          throw new Error("Facebook news feed contained a duplicate edge coordinate");
        }
        indexedEdges.set(index, {
          edge,
          label: `Facebook news-feed edge[${index}]`
        });
      }
    }
    if (Array.isArray(value.path)) {
      const patch = value.path;
      const patchPreloaderKey = reviewedFacebookHomeFeedResultEnvelopeKey(roots, path, value);
      const reviewedPatchEnvelope = patchPreloaderKey !== null;
      if (reviewedPatchEnvelope && streamPreloaderKey !== null && patchPreloaderKey !== streamPreloaderKey) {
        throw new Error("Facebook news-feed stream changed its bound preloader key");
      }
      if (patch.length === 4 && patch[0] === "viewer" && patch[1] === "news_feed" && patch[2] === "edges" && typeof patch[3] === "number") {
        if (!reviewedPatchEnvelope || patch[3] < 0 || patch[3] > 499) {
          throw new Error("Facebook news-feed patch used an unreviewed path");
        }
        if (streamPhase !== "edges") {
          throw new Error("Facebook news-feed edge patch appeared outside its reviewed stream order");
        }
        const extensions = record3(value.extensions, `Facebook news-feed patch[${patch[3]}].extensions`);
        if (extensions.is_final !== false) {
          throw new Error("Facebook news-feed edge patch was not explicitly nonfinal");
        }
        const edge = record3(value.data, `Facebook news-feed patch[${patch[3]}]`);
        boundedString2(edge.cursor, `Facebook news-feed patch[${patch[3]}].cursor`, 4096);
        if (indexedEdges.has(patch[3])) {
          throw new Error("Facebook news feed contained a duplicate edge coordinate");
        }
        indexedEdges.set(patch[3], {
          edge,
          label: `Facebook news-feed patch[${patch[3]}]`
        });
        streamedEdgeCount += 1;
      } else if (patch.length === 2 && patch[0] === "viewer" && patch[1] === "news_feed") {
        if (!reviewedPatchEnvelope) {
          throw new Error("Facebook news-feed patch used an unreviewed path");
        }
        if (streamPhase !== "edges") {
          throw new Error("Facebook news-feed final patch appeared outside its reviewed stream order");
        }
        streamPhase = "final";
        const extensions = record3(value.extensions, "Facebook news-feed final patch extensions");
        if (extensions.is_final !== true) {
          throw new Error("Facebook news-feed final patch was not explicitly final");
        }
        const data = record3(value.data, "Facebook news-feed final patch data");
        const pageInfo = record3(data.page_info, "Facebook news-feed final patch page_info");
        if (typeof pageInfo.has_next_page !== "boolean") {
          throw new Error("Facebook news-feed final page_info.has_next_page must be boolean");
        }
        if (pageInfo.end_cursor !== null) {
          boundedString2(pageInfo.end_cursor, "Facebook news-feed final page_info.end_cursor", 4096);
        }
        finalPageInfoCount += 1;
      } else if (patch[0] === "viewer" && patch[1] === "news_feed") {
        throw new Error("Facebook news-feed patch used an unreviewed path");
      }
    }
  });
  if (rootCount !== 1) {
    throw new Error("Facebook Relay preload did not contain exactly one news-feed root");
  }
  if (finalPageInfoCount > 1 || streamedEdgeCount > 0 && finalPageInfoCount !== 1) {
    throw new Error("Facebook news feed did not contain exactly one final page_info fragment");
  }
  const orderedEdges = [...indexedEdges.entries()].sort(([left], [right]) => left - right);
  for (const [expectedIndex, [providerIndex, indexed]] of orderedEdges.entries()) {
    if (providerIndex !== expectedIndex) {
      throw new Error("Facebook news feed used a noncontiguous edge coordinate");
    }
    addNode(indexed.edge.node, `${indexed.label}.node`);
  }
  if (posts.length === 0)
    throw new Error("Facebook Relay preload omitted a bounded news feed");
  return Object.freeze({
    feed: "home",
    posts: Object.freeze(posts),
    nextCursor: null,
    continuationSupported: false,
    complete: false
  });
}
function exactDecimalId(value, label) {
  const id = boundedString2(value, label, 32);
  if (!/^[0-9]{1,32}$/u.test(id) || id === "0")
    throw new Error(`${label} must be a stable decimal ID`);
  return id;
}
function optionalHttpsUrl(value, label, maximum = 4096) {
  const raw = optionalString(value, label, maximum);
  if (raw === null)
    return null;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${label} must be an absolute HTTPS URL`);
  }
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "") {
    throw new Error(`${label} must be an absolute HTTPS URL`);
  }
  return parsed.href;
}
function marketplaceLocation(value, label) {
  if (value === undefined || value === null) {
    return Object.freeze({ city: null, state: null });
  }
  const location = record3(value, label);
  const reverseGeocode = record3(location.reverse_geocode, `${label}.reverse_geocode`);
  return Object.freeze({
    city: optionalString(reverseGeocode.city, `${label}.reverse_geocode.city`, 256),
    state: optionalString(reverseGeocode.state, `${label}.reverse_geocode.state`, 256)
  });
}
function marketplaceFeedListing(value, label) {
  const node = record3(value, label);
  if (node.__typename === "MarketplaceFeedGeneralListingObject") {
    if (node.__isMarketplaceFeedGeneralListingData !== "MarketplaceFeedGeneralListingObject") {
      throw new Error(`${label} changed its reviewed listing marker`);
    }
    const entity = record3(node.entity, `${label}.entity`);
    const listing = record3(node.listing, `${label}.listing`);
    const entityId = exactDecimalId(entity.id, `${label}.entity.id`);
    const listingId = exactDecimalId(listing.id, `${label}.listing.id`);
    if (entityId !== listingId)
      throw new Error(`${label} did not bind one exact Marketplace listing`);
    const data = record3(node.data, `${label}.data`);
    const price = record3(data.price, `${label}.data.price`);
    const photo = record3(node.photo, `${label}.photo`);
    const image = record3(photo.default_image, `${label}.photo.default_image`);
    return Object.freeze({
      id: listingId,
      title: boundedString2(data.title, `${label}.data.title`, 512),
      amount: boundedString2(price.amount_with_offset, `${label}.data.price.amount_with_offset`, 64),
      currency: boundedString2(price.currency, `${label}.data.price.currency`, 16),
      formatted_price: null,
      location: marketplaceLocation(entity.location, `${label}.entity.location`),
      image_url: optionalHttpsUrl(image.uri, `${label}.photo.default_image.uri`),
      creation_time: optionalInteger(listing.creation_time, `${label}.listing.creation_time`)
    });
  }
  if (node.__typename === "GroupCommerceProductItem") {
    const id = exactDecimalId(node.id, `${label}.id`);
    const price = record3(node.listing_price, `${label}.listing_price`);
    const formattedPrice = record3(node.formatted_price, `${label}.formatted_price`);
    const photo = record3(node.primary_listing_photo, `${label}.primary_listing_photo`);
    const image = record3(photo.image, `${label}.primary_listing_photo.image`);
    return Object.freeze({
      id,
      title: boundedString2(node.marketplace_listing_title, `${label}.marketplace_listing_title`, 512),
      amount: boundedString2(price.amount, `${label}.listing_price.amount`, 64),
      currency: null,
      formatted_price: boundedString2(formattedPrice.text, `${label}.formatted_price.text`, 128),
      location: marketplaceLocation(node.location, `${label}.location`),
      image_url: optionalHttpsUrl(image.uri, `${label}.primary_listing_photo.image.uri`),
      creation_time: optionalInteger(node.creation_time, `${label}.creation_time`)
    });
  }
  throw new Error(`${label} used an unreviewed Marketplace listing variant`);
}
function marketplaceFeedStream(roots, source) {
  const indexed = new Map;
  let rootCount = 0;
  let selectedRoot = null;
  const pageInfoCandidates = [];
  let finalPageInfoCount = 0;
  let streamPhase = "before-root";
  let streamPreloaderKey = null;
  const addEdge = (index, value, label) => {
    if (!Number.isSafeInteger(index) || index < 0 || index > 499) {
      throw new Error(`${label} used an out-of-bounds edge index`);
    }
    if (value === null)
      return;
    const edge = record3(value, label);
    if (indexed.has(index))
      throw new Error("Marketplace feed stream contained a duplicate edge index");
    indexed.set(index, edge);
  };
  walk(roots, (value, pathToValue) => {
    if (!isRecord3(value))
      return;
    const resultPreloaderKey = source === "html" ? reviewedFacebookMarketplaceFeedResultEnvelopeKey(roots, pathToValue, value) : null;
    const reviewedResultEnvelope = source === "html" ? resultPreloaderKey !== null : pathToValue.length === 0 || directRelayResultMatches(roots, pathToValue, value);
    if (pathToValue.length === 0 || reviewedResultEnvelope) {
      assertEmptyProviderErrors(value, "Marketplace feed envelope");
    }
    if (Object.hasOwn(value, "marketplace_home_feed")) {
      const dataPreloaderKey = source === "html" ? reviewedFacebookMarketplaceFeedDataEnvelopeKey(roots, pathToValue, value) : null;
      const reviewedDataEnvelope = source === "html" ? dataPreloaderKey !== null : directRelayDataMatches(roots, pathToValue, value);
      if (!reviewedDataEnvelope) {
        throw new Error("Marketplace feed root appeared outside its reviewed Relay data root");
      }
      if (streamPhase !== "before-root") {
        throw new Error("Marketplace feed emitted its initial root out of order");
      }
      streamPhase = "edges";
      if (source === "html") {
        streamPreloaderKey = dataPreloaderKey;
      }
      const feed = record3(value.marketplace_home_feed, "Marketplace feed root");
      if (!Array.isArray(feed.edges) || feed.edges.length > 500) {
        throw new Error("Marketplace feed root edges must be a bounded array");
      }
      rootCount += 1;
      selectedRoot = feed;
      for (const [index, edge] of feed.edges.entries()) {
        addEdge(index, edge, `Marketplace feed root edge[${index}]`);
      }
    }
    if (!Array.isArray(value.path))
      return;
    const path = value.path;
    const concernsMarketplace = path[0] === "marketplace_home_feed";
    const patchPreloaderKey = source === "html" ? reviewedFacebookMarketplaceFeedResultEnvelopeKey(roots, pathToValue, value) : null;
    if (concernsMarketplace && (source === "html" ? patchPreloaderKey === null : pathToValue.length !== 0)) {
      throw new Error("Marketplace feed patch appeared outside its reviewed streamed envelope");
    }
    if (concernsMarketplace && source === "html" && streamPreloaderKey !== null && patchPreloaderKey !== streamPreloaderKey) {
      throw new Error("Marketplace feed stream changed its bound preloader key");
    }
    if (concernsMarketplace && streamPhase !== "edges") {
      throw new Error("Marketplace feed patch appeared outside its reviewed stream order");
    }
    if (path.length === 3 && path[0] === "marketplace_home_feed" && path[1] === "edges" && typeof path[2] === "number") {
      const extensions = record3(value.extensions, "Marketplace feed streamed edge extensions");
      if (extensions.is_final !== false) {
        throw new Error("Marketplace feed streamed edge must be explicitly nonfinal");
      }
      addEdge(path[2], value.data, `Marketplace feed streamed edge[${path[2]}]`);
      return;
    }
    if (path.length === 1 && path[0] === "marketplace_home_feed") {
      const extensions = record3(value.extensions, "Marketplace feed streamed page-info extensions");
      if (extensions.is_final !== true) {
        throw new Error("Marketplace feed streamed page-info fragment was not final");
      }
      const data = record3(value.data, "Marketplace feed streamed page info");
      pageInfoCandidates.push(record3(data.page_info, "Marketplace feed streamed page_info"));
      finalPageInfoCount += 1;
      streamPhase = "final";
      return;
    }
    if (concernsMarketplace) {
      throw new Error("Marketplace feed patch used an unreviewed path");
    }
  });
  if (rootCount !== 1)
    throw new Error("Marketplace response did not contain exactly one feed root");
  if (selectedRoot === null) {
    throw new Error("Marketplace response did not contain exactly one feed root");
  }
  if (pageInfoCandidates.length !== 1 || finalPageInfoCount !== 1) {
    throw new Error("Marketplace response did not contain one final page-info fragment");
  }
  const ordered = [...indexed.entries()].sort(([left], [right]) => left - right).map(([index, edge]) => Object.freeze({ index, edge }));
  if (ordered.length === 0 || ordered.some((entry, index) => entry.index !== index)) {
    throw new Error("Marketplace feed stream did not contain one contiguous provider page");
  }
  const pageInfo = pageInfoCandidates[0];
  if (pageInfo === undefined || typeof pageInfo.has_next_page !== "boolean") {
    throw new Error("Marketplace feed page_info.has_next_page must be boolean");
  }
  return {
    edges: Object.freeze(ordered),
    endCursor: boundedString2(pageInfo.end_cursor, "Marketplace feed page_info.end_cursor", 4096),
    hasNextPage: pageInfo.has_next_page,
    root: selectedRoot
  };
}
function projectFacebookMarketplaceFeed(stream, limit) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    throw new Error("Marketplace feed limit must be an integer between 1 and 50");
  }
  const allListings = [];
  const seen = new Set;
  let sponsoredUnits = 0;
  for (const { index, edge } of stream.edges) {
    boundedString2(edge.cursor, `Marketplace feed edge[${index}].cursor`, 4096);
    const node = record3(edge.node, `Marketplace feed edge[${index}].node`);
    let candidates;
    if (node.__typename === "MarketplaceFeedTopPicksUnit") {
      if (!Array.isArray(node.marketplace_listings) || node.marketplace_listings.length > 100) {
        throw new Error(`Marketplace feed edge[${index}] top picks must be a bounded array`);
      }
      candidates = node.marketplace_listings;
    } else if (node.__typename === "MarketplaceFeedAdStory") {
      sponsoredUnits += 1;
      continue;
    } else {
      candidates = [node];
    }
    for (const [candidateIndex, candidate] of candidates.entries()) {
      const listing = marketplaceFeedListing(candidate, `Marketplace feed edge[${index}] listing[${candidateIndex}]`);
      const id = listing.id;
      if (typeof id !== "string" || seen.has(id))
        continue;
      seen.add(id);
      allListings.push(listing);
    }
  }
  if (allListings.length === 0)
    throw new Error("Marketplace feed contained no reviewed listings");
  const truncated = allListings.length > limit;
  const continuationSupported = !truncated;
  return Object.freeze({
    feed: "marketplace",
    listings: Object.freeze(allListings.slice(0, limit)),
    sponsored_units: sponsoredUnits,
    provider_has_next_page: stream.hasNextPage,
    next_cursor: stream.hasNextPage && continuationSupported ? stream.endCursor : null,
    continuation_supported: continuationSupported,
    truncated,
    complete: !stream.hasNextPage && !truncated
  });
}
function normalizeFacebookMarketplaceFeedHtml(html, viewerId, limit) {
  const roots = parseMetaJsonScripts(html);
  if (parseFacebookViewerId(html) !== viewerId) {
    throw new Error("Marketplace feed response changed its bound viewer");
  }
  assertMetaCometReadActor(roots, viewerId);
  return projectFacebookMarketplaceFeed(marketplaceFeedStream(roots, "html"), limit);
}
function normalizeFacebookMarketplaceFeedJsonDocuments(documents, previousCursor, limit, expectedRoot) {
  for (const [index, value] of documents.entries()) {
    const document = record3(value, `Marketplace streamed document[${index}]`);
    if (!Object.hasOwn(document, "errors"))
      continue;
    if (!Array.isArray(document.errors)) {
      throw new Error(`Marketplace streamed document[${index}].errors must be an array`);
    }
    if (document.errors.length > 0) {
      throw new Error("Marketplace streamed response contained provider errors");
    }
  }
  const stream = marketplaceFeedStream(documents, "documents");
  if (expectedRoot !== undefined && stream.root !== expectedRoot) {
    throw new Error("Marketplace streamed response changed its descriptor-bound root");
  }
  const prior = boundedString2(previousCursor, "Marketplace previous cursor", 4096);
  if (stream.endCursor === prior) {
    throw new Error("Marketplace continuation repeated its prior cursor");
  }
  return projectFacebookMarketplaceFeed(stream, limit);
}
function marketplaceListingPhoto(value, label) {
  const photo = record3(value, label);
  const image = record3(photo.image, `${label}.image`);
  return Object.freeze({
    id: exactDecimalId(photo.id, `${label}.id`),
    url: optionalHttpsUrl(image.uri, `${label}.image.uri`),
    width: optionalInteger(image.width, `${label}.image.width`),
    height: optionalInteger(image.height, `${label}.image.height`),
    accessibility_caption: optionalString(photo.accessibility_caption, `${label}.accessibility_caption`, 1024)
  });
}
function normalizeFacebookMarketplaceListingHtml(html, viewerId, listingId) {
  const expectedListingId = exactDecimalId(listingId, "Marketplace requested listing ID");
  const roots = parseMetaJsonScripts(html);
  if (parseFacebookViewerId(html) !== viewerId) {
    throw new Error("Marketplace listing response changed its bound viewer");
  }
  assertMetaCometReadActor(roots, viewerId);
  const detailCandidates = [];
  const mediaCandidates = [];
  walk(roots, (value, path) => {
    if (!isRecord3(value))
      return;
    if (path.length === 0 || isReviewedFacebookMarketplaceListingResultEnvelope(roots, path, value)) {
      assertEmptyProviderErrors(value, "Marketplace listing envelope");
    }
    const viewer = isRecord3(value.viewer) ? value.viewer : null;
    const detailsPage = viewer !== null && isRecord3(viewer.marketplace_product_details_page) ? viewer.marketplace_product_details_page : null;
    const reviewedDetailDataRoot = isReviewedFacebookMarketplaceListingDetailDataEnvelope(roots, path, value);
    const reviewedMediaDataRoot = isReviewedFacebookMarketplaceListingMediaDataEnvelope(roots, path, value);
    const reviewedDataRoot = reviewedDetailDataRoot || reviewedMediaDataRoot;
    const directTarget = reviewedDataRoot && isRecord3(value.target) ? value.target : null;
    if (detailsPage === null && directTarget === null)
      return;
    if (!reviewedDataRoot) {
      throw new Error("Marketplace product-details root appeared outside its reviewed Relay data root");
    }
    if (detailsPage !== null && directTarget !== null) {
      throw new Error("Marketplace product-details response matched multiple reviewed root variants");
    }
    const target = directTarget ?? record3(detailsPage?.target, "Marketplace product-details target");
    if (target.__typename !== "GroupCommerceProductItem" || target.id !== expectedListingId) {
      throw new Error("Marketplace product-details root changed its requested listing target");
    }
    const hasDetailProjection = typeof target.marketplace_listing_title === "string" && isRecord3(target.listing_price) && isRecord3(target.redacted_description);
    const hasMediaProjection = Array.isArray(target.listing_photos);
    if (hasDetailProjection && !reviewedDetailDataRoot) {
      throw new Error("Marketplace listing detail came from an unreviewed preloader");
    }
    if (hasMediaProjection && !reviewedMediaDataRoot) {
      throw new Error("Marketplace listing media came from an unreviewed preloader");
    }
    if (hasDetailProjection)
      detailCandidates.push(target);
    if (hasMediaProjection)
      mediaCandidates.push(target);
  });
  if (detailCandidates.length !== 1 || mediaCandidates.length !== 1) {
    throw new Error("Marketplace listing response did not bind one exact detailed listing");
  }
  const detail = detailCandidates[0];
  const media = mediaCandidates[0];
  if (detail === undefined || media === undefined) {
    throw new Error("Marketplace listing response omitted its reviewed target");
  }
  const primary = record3(detail.primary_mp_ent, "Marketplace listing primary entity");
  if (exactDecimalId(primary.id, "Marketplace listing primary entity.id") !== expectedListingId) {
    throw new Error("Marketplace listing primary entity changed its requested target");
  }
  const price = record3(detail.listing_price, "Marketplace listing price");
  const description = record3(detail.redacted_description, "Marketplace listing description");
  const locationText = record3(detail.location_text, "Marketplace listing location text");
  const seller = record3(detail.marketplace_listing_seller, "Marketplace listing seller");
  const sellerId = exactDecimalId(seller.id, "Marketplace listing seller.id");
  if (seller.user_id !== undefined && seller.user_id !== sellerId) {
    throw new Error("Marketplace listing seller identity was ambiguous");
  }
  if (!Array.isArray(media.listing_photos) || media.listing_photos.length > 100) {
    throw new Error("Marketplace listing photos must be a bounded array");
  }
  if (media.pre_recorded_videos !== undefined && (!Array.isArray(media.pre_recorded_videos) || media.pre_recorded_videos.length > 100)) {
    throw new Error("Marketplace listing videos must be a bounded array");
  }
  const photos = media.listing_photos.map((photo, index) => marketplaceListingPhoto(photo, `Marketplace listing photo[${index}]`));
  return Object.freeze({
    id: expectedListingId,
    title: boundedString2(detail.marketplace_listing_title, "Marketplace listing title", 512),
    description: boundedString2(description.text, "Marketplace listing description.text", 1e5, true),
    price: Object.freeze({
      amount: boundedString2(price.amount, "Marketplace listing price.amount", 64),
      currency: optionalString(price.currency, "Marketplace listing price.currency", 16),
      formatted: optionalString(price.formatted_amount_zeros_stripped, "Marketplace listing price.formatted_amount_zeros_stripped", 128)
    }),
    location: optionalString(locationText.text, "Marketplace listing location_text.text", 512),
    creation_time: optionalInteger(detail.creation_time, "Marketplace listing creation_time"),
    is_live: optionalBoolean(detail.is_live, "Marketplace listing is_live"),
    is_pending: optionalBoolean(detail.is_pending, "Marketplace listing is_pending"),
    is_sold: optionalBoolean(detail.is_sold, "Marketplace listing is_sold"),
    is_viewer_seller: optionalBoolean(detail.is_viewer_seller, "Marketplace listing is_viewer_seller"),
    seller: Object.freeze({
      id: sellerId,
      name: optionalString(seller.name, "Marketplace listing seller.name", 512)
    }),
    photos: Object.freeze(photos),
    video_count: Array.isArray(media.pre_recorded_videos) ? media.pre_recorded_videos.length : 0
  });
}
var metaWebEvidenceSnapshot = Object.freeze({
  schemaVersion: 1,
  role: "revision-evidence-only",
  observedOn: "2026-08-22",
  authentication: "browser-cookie-session",
  operations: Object.freeze({
    instagram: Object.freeze({
      viewer: "GET / HTML PolarisViewer, corroborated by ds_user_id",
      feed: "GET /api/v1/feed/timeline/ first page without cursor continuation",
      post: "GET /api/v1/media/{id}/info/",
      comments: "GET /api/v1/media/{id}/comments/ first page without cursor continuation",
      inbox: "GET /api/v1/direct_v2/inbox/ first page without cursor continuation or seen/ack dispatch"
    }),
    threads: Object.freeze({
      viewer: "GET / HTML BarcelonaSessionInfo plus Relay viewer.user.id",
      feed: "GET / signed-in first-page Relay feedData preload without cursor continuation",
      publishImage: "POST configure_text_post_app_feed with exact created-locator response binding after optional PNG rupload; when an image is supplied, require synchronous 200 upload completion and completed-upload dimensions; then GET the exact returned permalink for independent actor/text and optional image readback",
      publishVideo: "POST one MP4 to the exact rupload_igvideo entity with synchronous 200 completion and exact dimensions, POST configure_text_post_app_feed with exact actor/text/video locator binding, then GET the exact returned permalink for independent video readback"
    }),
    facebook: Object.freeze({
      viewer: "GET / HTML CurrentUserInitialData, corroborated by c_user",
      feed: "GET / signed-in Comet Relay viewer.news_feed preload"
    }),
    "facebook-marketplace": Object.freeze({
      feed: "GET /marketplace/ signed-in Relay bootstrap without script execution",
      listing: "GET /marketplace/item/{id}/ signed-in product-details bootstrap without item-seen dispatch"
    }),
    "facebook-group": Object.freeze({
      feed: "GET /groups/{id}/ signed-in first-page Relay bootstrap without script execution or cursor continuation"
    })
  })
});

export { META_RELAY_ORIGINS, defineMetaOperationDescriptor, resolveMetaOperationDescriptor, metaOperationDescriptorKey, bindMetaAccessContext, assertMetaPaginationCursorBinding, bindMetaPaginationCursor, buildMetaRelayRequest, assertMetaRelayResponseBinding, assertMetaCometReadActor, bootstrapMetaComet, materializeMetaCometRequestProof, consumeMetaCometRequestProof, extractMetaRelayBundleUrls, resolveMetaRelayOperationRevision, META_WEB_SITES, META_WEB_OPERATION_NAMES, isCanonicalMetaNumericId, META_WEB_OPERATIONS, parseMetaJsonScripts, parseMetaJsonDocuments, isReviewedFacebookGroupRelayResultEnvelope, parseInstagramViewerId, parseFacebookViewerId, ThreadsAuthRepairRequiredError, parseThreadsViewerId, normalizeInstagramProfileStats, normalizeThreadsProfileStats, normalizeThreadsRecentViewsAvailability, normalizeInstagramFeed, normalizeInstagramPost, normalizeInstagramComments, normalizeInstagramInbox, normalizeInstagramContacts, projectThreadsPublishVideo, normalizeThreadsFeedHtml, normalizeThreadsPostHtml, normalizeThreadsVideoPostHtml, normalizeFacebookFeedHtml, normalizeFacebookMarketplaceFeedHtml, normalizeFacebookMarketplaceFeedJsonDocuments, normalizeFacebookMarketplaceListingHtml };

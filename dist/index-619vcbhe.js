// @bun
// src/provider-plugin-portable-identity.ts
var PORTABLE_OPERATION_IDENTITY_VERSION = 1;
var descriptorDomain = `io-portable-operation-descriptor-v${PORTABLE_OPERATION_IDENTITY_VERSION}\x00`;
var pluginIdPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
var pluginVersionPattern = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
var sha256Pattern = /^[a-f0-9]{64}$/u;
var adapterIdPattern = /^[a-z][a-z0-9-]{0,47}$/u;
var operationPattern = /^[a-z][a-z0-9-]{0,39}(?:\.[a-z][a-z0-9-]{0,39}){1,3}$/u;
function ownDataValue(value, key, label) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
    throw new Error(`${label} contains unsupported accessor state`);
  }
  return descriptor.value;
}
function identityRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("portable operation identity must be an object");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("portable operation identity must be a plain object");
  }
  const keys = Reflect.ownKeys(value);
  const expected = [
    "pluginId",
    "pluginVersion",
    "hostApiVersion",
    "bundleSha256",
    "manifestSha256",
    "adapterId",
    "transport",
    "surfaceId",
    "operation",
    "contractVersion",
    "descriptorSha256"
  ].sort();
  if (keys.some((key) => typeof key !== "string") || keys.length !== expected.length || keys.sort().some((key, index) => key !== expected[index])) {
    throw new Error("portable operation identity has unsupported fields");
  }
  const result = {};
  for (const key of expected) {
    result[key] = ownDataValue(value, key, `portable operation identity.${key}`);
  }
  return result;
}
function parsePortableOperationIdentityV1(value) {
  const record = identityRecord(value);
  if (typeof record.pluginId !== "string" || record.pluginId.length > 128 || !pluginIdPattern.test(record.pluginId) || typeof record.pluginVersion !== "string" || record.pluginVersion.length > 128 || !pluginVersionPattern.test(record.pluginVersion) || record.hostApiVersion !== 1 || typeof record.bundleSha256 !== "string" || !sha256Pattern.test(record.bundleSha256) || typeof record.manifestSha256 !== "string" || !sha256Pattern.test(record.manifestSha256) || typeof record.adapterId !== "string" || !adapterIdPattern.test(record.adapterId) || record.transport !== "provider-api" && record.transport !== "web-session-api" && record.transport !== "linked-device" || typeof record.surfaceId !== "string" || record.surfaceId.length > 128 || !pluginIdPattern.test(record.surfaceId) || typeof record.operation !== "string" || !operationPattern.test(record.operation) || typeof record.contractVersion !== "number" || !Number.isSafeInteger(record.contractVersion) || record.contractVersion < 1 || record.contractVersion > 1e6 || typeof record.descriptorSha256 !== "string" || !sha256Pattern.test(record.descriptorSha256)) {
    throw new Error("portable operation identity is malformed");
  }
  return Object.freeze({
    pluginId: record.pluginId,
    pluginVersion: record.pluginVersion,
    hostApiVersion: 1,
    bundleSha256: record.bundleSha256,
    manifestSha256: record.manifestSha256,
    adapterId: record.adapterId,
    transport: record.transport,
    surfaceId: record.surfaceId,
    operation: record.operation,
    contractVersion: record.contractVersion,
    descriptorSha256: record.descriptorSha256
  });
}

export { parsePortableOperationIdentityV1 };

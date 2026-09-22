// @bun
// src/model.ts
import { isPrivateAddress, isPrivateHostname } from "@hraness/kb/clip/network";
var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
function hasUnpairedSurrogate(value) {
  for (let index = 0;index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 55296 && code <= 56319) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 56320 && next <= 57343))
        return true;
      index += 1;
    } else if (code >= 56320 && code <= 57343)
      return true;
  }
  return false;
}
function hasAmbiguousPathSyntax(value) {
  return value.includes("\\") || /%(?:25|2e|2f|5c)/iu.test(value) || value.split("/").some((segment) => segment === "." || segment === "..");
}
function matchesUrlPathPrefix(pathname, prefix) {
  return prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(`${prefix}/`);
}
function rawUrlPath(value) {
  const authority = value.indexOf("://");
  const start = authority < 0 ? 0 : value.indexOf("/", authority + 3);
  if (start < 0)
    return "/";
  const end = value.search(/[?#]/u);
  return value.slice(start, end >= start ? end : undefined);
}
function validateOperationInput(schema, value, origins) {
  const issues = [];
  if (!isRecord(value))
    return { ok: false, issues: ["input must be a JSON object"] };
  const output = {};
  for (const key of Object.keys(value)) {
    if (!(key in schema.properties))
      issues.push(`input.${key} is not supported`);
  }
  for (const key of schema.required) {
    if (!(key in value))
      issues.push(`input.${key} is required`);
  }
  const validateValue = (field, candidate, path) => {
    if (field.type === "file") {
      if (typeof candidate !== "string" || candidate.length < 1 || candidate.length > 4096 || candidate.includes(String.fromCharCode(0)) || hasUnpairedSurrogate(candidate)) {
        issues.push(`${path} must be a non-empty opaque file reference`);
        return null;
      }
      return { kind: "file", reference: candidate };
    }
    if (typeof candidate !== field.type) {
      issues.push(`${path} must be ${field.type}`);
      return null;
    }
    if (typeof candidate === "string") {
      if (candidate.length < (field.minLength ?? 0) || candidate.length > (field.maxLength ?? 64 * 1024)) {
        issues.push(`${path} has an invalid length`);
        return null;
      }
      if (candidate.includes(String.fromCharCode(0))) {
        issues.push(`${path} must not contain NUL`);
        return null;
      }
      if (hasUnpairedSurrogate(candidate)) {
        issues.push(`${path} must contain well-formed Unicode`);
        return null;
      }
      if (field.format === "url") {
        try {
          if (field.urlPathPrefixes !== undefined && hasAmbiguousPathSyntax(rawUrlPath(candidate))) {
            issues.push(`${path} must use an unambiguous allowed URL path`);
            return null;
          }
          const url = new URL(candidate);
          if (!origins.includes(url.origin) || url.username !== "" || url.password !== "") {
            issues.push(`${path} must use an adapter origin and contain no credentials`);
            return null;
          }
          if (field.urlPathPrefixes !== undefined && !field.urlPathPrefixes.some((prefix) => matchesUrlPathPrefix(url.pathname, prefix))) {
            issues.push(`${path} must use an allowed URL path prefix`);
            return null;
          }
        } catch {
          issues.push(`${path} must be a valid URL`);
          return null;
        }
      }
      if (field.format === "path-segment" && (candidate === "." || candidate === ".." || candidate.includes("/") || candidate.includes("\\") || candidate.includes("%"))) {
        issues.push(`${path} must be one unambiguous URL path segment`);
        return null;
      }
    }
    if (typeof candidate === "number" && (!Number.isFinite(candidate) || candidate < (field.minimum ?? -Infinity) || candidate > (field.maximum ?? Infinity))) {
      issues.push(`${path} is outside its numeric bounds`);
      return null;
    }
    if (field.enum !== undefined && !field.enum.some((enumValue) => Object.is(enumValue, candidate))) {
      issues.push(`${path} is not an allowed value`);
      return null;
    }
    return candidate;
  };
  for (const [key, field] of Object.entries(schema.properties)) {
    const candidate = value[key];
    if (candidate === undefined)
      continue;
    if (field.type === "array") {
      if (!Array.isArray(candidate)) {
        issues.push(`input.${key} must be array`);
        continue;
      }
      if (candidate.length < field.minItems || candidate.length > field.maxItems) {
        issues.push(`input.${key} must contain ${field.minItems}-${field.maxItems} items`);
        continue;
      }
      const parsed2 = [];
      candidate.forEach((item, index) => {
        const result = validateValue(field.items, item, `input.${key}[${index}]`);
        if (result !== null)
          parsed2.push(result);
      });
      if (parsed2.length === candidate.length)
        output[key] = parsed2;
      continue;
    }
    const parsed = validateValue(field, candidate, `input.${key}`);
    if (parsed !== null)
      output[key] = parsed;
  }
  return issues.length === 0 ? { ok: true, value: output } : { ok: false, issues };
}

export { validateOperationInput };

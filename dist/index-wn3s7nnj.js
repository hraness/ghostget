// @bun
import {
  pinnedHttpsFetch
} from "./index-j3ysa35f.js";
import {
  OperationDeadline,
  OperationDeadlineError
} from "./index-vtj5zdgf.js";

// src/web-session-read-errors.ts
class WebSessionResponseRejectedError extends Error {
  status;
  contentType;
  constructor(message, status, contentType) {
    super(message);
    this.status = status;
    this.contentType = contentType;
  }
}

class WebSessionReadTransportError extends Error {
  constructor(message, cause) {
    super(message, { cause });
  }
}

class WebSessionAuthStateError extends Error {
}
function validateWebSessionAuthState(validate) {
  try {
    return validate();
  } catch (cause) {
    if (cause instanceof Error)
      throw new WebSessionAuthStateError(cause.message, { cause });
    throw cause;
  }
}

// src/web-session-client.ts
import {
  acquireCookieRecords
} from "@hraness/kb/clip/acquire";
import { BoundedByteBuffer } from "@hraness/kb/clip/bounded-byte-buffer";
import {
  filterCookies,
  renderCookieHeader
} from "@hraness/kb/clip/cookies";
var WEB_SESSION_OPERATION_LABEL = "authenticated web operation deadline";
var MIN_PINNED_HTTPS_TIMEOUT_MS = 1000;
function requestInputUrl(input) {
  if (input instanceof Request) {
    if (input.body !== null || input.bodyUsed) {
      throw new Error("authenticated pinned transport does not accept a Request body wrapper");
    }
    return new URL(input.url);
  }
  return new URL(input);
}
function networkDependencies(overrides) {
  return {
    acquireCookies: overrides?.acquireCookies ?? acquireCookieRecords,
    fetch: overrides?.fetch === undefined ? (input, init, timeoutMs) => {
      if (timeoutMs < MIN_PINNED_HTTPS_TIMEOUT_MS) {
        throw new Error("authenticated web operation has insufficient time for its next request");
      }
      return pinnedHttpsFetch(requestInputUrl(input), init, timeoutMs);
    } : (input, init) => overrides.fetch(input, init)
  };
}
async function withWebSessionDeadline(options, work) {
  const ownedDeadline = options.operationDeadline === undefined ? new OperationDeadline(options.timeoutMs, {
    ...options.signal === undefined ? {} : { signal: options.signal }
  }) : null;
  const deadline = options.operationDeadline ?? ownedDeadline;
  if (deadline === null) {
    throw new Error("authenticated web operation deadline is unavailable");
  }
  try {
    return await deadline.run(() => work(deadline), WEB_SESSION_OPERATION_LABEL);
  } finally {
    ownedDeadline?.dispose();
  }
}
function remainingRequestTimeMs(deadline) {
  deadline.throwIfUnavailable(WEB_SESSION_OPERATION_LABEL);
  const remaining = deadline.remainingTimeMs();
  if (remaining < 1) {
    throw new Error("authenticated web operation timed out before its next request");
  }
  return remaining;
}
function cookieSelection(auth, timeoutMs) {
  if (auth.kind === "cookie-source") {
    return {
      cookieSources: [auth.source],
      cookiesFile: undefined,
      cookieProfile: auth.profile,
      timeoutMs,
      requireExplicitCookieScope: true
    };
  }
  if (auth.kind === "cookies-file") {
    return {
      cookieSources: [],
      cookiesFile: auth.path,
      cookieProfile: undefined,
      timeoutMs,
      requireExplicitCookieScope: true
    };
  }
  if (auth.kind === "browser-profile" && auth.cookieSource !== undefined) {
    return {
      cookieSources: [auth.cookieSource],
      cookiesFile: undefined,
      cookieProfile: auth.cookieProfile,
      timeoutMs,
      requireExplicitCookieScope: true
    };
  }
  if (auth.kind === "browser-profile") {
    throw new WebSessionAuthStateError("authenticated web API execution requires the browser auth locator to name a cookie source");
  }
  throw new WebSessionAuthStateError("authenticated web API execution requires browser-session or cookie auth");
}
function contentTypeEssence(response) {
  const raw = response.headers.get("content-type");
  if (raw === null)
    return null;
  const essence = raw.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return essence === "" ? null : essence;
}
function isJsonContentType(value) {
  if (value === null)
    return false;
  const slash = value.indexOf("/");
  if (slash < 0)
    return false;
  const subtype = value.slice(slash + 1);
  return subtype === "json" || subtype.endsWith("+json");
}
async function boundedBytes(response, maximum, deadline) {
  deadline.throwIfUnavailable(WEB_SESSION_OPERATION_LABEL);
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 16 * 1024 * 1024) {
    throw new Error("authenticated web response byte limit is invalid");
  }
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const bytes = Number(declared);
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > maximum) {
      response.body?.cancel().catch(() => {
        return;
      });
      throw new Error("authenticated web response exceeded its reviewed byte limit");
    }
  }
  if (response.body === null)
    return new Uint8Array;
  const reader = response.body.getReader();
  const buffer = new BoundedByteBuffer(maximum);
  try {
    for (;; ) {
      const item = await (async () => {
        try {
          return await deadline.run(() => reader.read(), WEB_SESSION_OPERATION_LABEL);
        } catch (error) {
          if (error instanceof OperationDeadlineError)
            throw error;
          throw new WebSessionReadTransportError("authenticated web response body stream failed before completion", error);
        }
      })();
      if (item.done)
        break;
      const value = item.value;
      if (!(value instanceof Uint8Array)) {
        reader.cancel().catch(() => {
          return;
        });
        throw new Error("authenticated web response yielded a non-byte chunk");
      }
      if (!buffer.append(value)) {
        reader.cancel().catch(() => {
          return;
        });
        throw new Error("authenticated web response exceeded its reviewed byte limit");
      }
    }
  } catch (error) {
    reader.cancel().catch(() => {
      return;
    });
    throw error;
  } finally {
    reader.releaseLock();
  }
  deadline.throwIfUnavailable(WEB_SESSION_OPERATION_LABEL);
  return buffer.toUint8Array();
}
function parseJson(bytes) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("authenticated web API returned invalid UTF-8 JSON");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("authenticated web API returned malformed JSON");
  }
}
function exactCookie(cookies, name) {
  const matches = cookies.filter((cookie) => cookie.name === name);
  if (matches.length !== 1)
    throw new Error(`authenticated session must contain exactly one ${name} cookie`);
  return matches[0]?.value ?? "";
}
function cookieIdentity(cookie) {
  return `${cookie.domain}\x00${cookie.hostOnly ? "host" : "domain"}\x00${cookie.path}\x00${cookie.name}`;
}
function responseSetCookieHeaders(headers) {
  const extended = headers;
  const values = typeof extended.getSetCookie === "function" ? extended.getSetCookie() : (() => {
    const value = headers.get("set-cookie");
    return value === null ? [] : [value];
  })();
  if (values.length > 64 || values.some((value) => typeof value !== "string" || Buffer.byteLength(value, "utf8") > 64 * 1024))
    throw new Error("authenticated web response Set-Cookie fields exceeded their reviewed bounds");
  return values;
}
function parseResponseCookie(value, target, allowedNames, nowSeconds) {
  const fields = value.split(";");
  const pair = fields.shift()?.trim() ?? "";
  const separator = pair.indexOf("=");
  if (separator < 1)
    return null;
  const name = pair.slice(0, separator).trim();
  if (!allowedNames.has(name))
    return null;
  const candidate = {
    name,
    value: pair.slice(separator + 1).trim(),
    domain: target.hostname,
    hostOnly: true,
    path: "/",
    secure: false,
    httpOnly: false,
    sameSite: null
  };
  let expiresAttribute;
  let maxAgeAttribute;
  const seen = new Set;
  for (const rawField of fields) {
    const field = rawField.trim();
    if (field === "")
      continue;
    const attributeSeparator = field.indexOf("=");
    const rawName = attributeSeparator < 0 ? field : field.slice(0, attributeSeparator);
    const attribute = rawName.trim().toLowerCase();
    const attributeValue = attributeSeparator < 0 ? null : field.slice(attributeSeparator + 1).trim();
    if (seen.has(attribute)) {
      throw new Error(`reviewed rotating cookie ${name} repeated an attribute`);
    }
    seen.add(attribute);
    if (attribute === "domain") {
      if (attributeValue === null || attributeValue === "") {
        throw new Error(`reviewed rotating cookie ${name} has an invalid Domain`);
      }
      candidate.domain = attributeValue;
      candidate.hostOnly = false;
    } else if (attribute === "path") {
      if (attributeValue === null || attributeValue === "") {
        throw new Error(`reviewed rotating cookie ${name} has an invalid Path`);
      }
      candidate.path = attributeValue;
    } else if (attribute === "secure") {
      if (attributeValue !== null)
        throw new Error(`reviewed rotating cookie ${name} has an invalid Secure flag`);
      candidate.secure = true;
    } else if (attribute === "httponly") {
      if (attributeValue !== null)
        throw new Error(`reviewed rotating cookie ${name} has an invalid HttpOnly flag`);
      candidate.httpOnly = true;
    } else if (attribute === "samesite") {
      if (attributeValue === null || !["strict", "lax", "none"].includes(attributeValue.toLowerCase())) {
        throw new Error(`reviewed rotating cookie ${name} has an invalid SameSite`);
      }
      candidate.sameSite = `${attributeValue[0]?.toUpperCase() ?? ""}${attributeValue.slice(1).toLowerCase()}`;
    } else if (attribute === "expires") {
      if (attributeValue === null)
        throw new Error(`reviewed rotating cookie ${name} has an invalid Expires`);
      const milliseconds = Date.parse(attributeValue);
      if (!Number.isFinite(milliseconds))
        throw new Error(`reviewed rotating cookie ${name} has an invalid Expires`);
      expiresAttribute = Math.trunc(milliseconds / 1000);
    } else if (attribute === "max-age") {
      if (attributeValue === null || !/^-?[0-9]{1,12}$/u.test(attributeValue)) {
        throw new Error(`reviewed rotating cookie ${name} has an invalid Max-Age`);
      }
      const seconds = Number(attributeValue);
      if (!Number.isSafeInteger(seconds))
        throw new Error(`reviewed rotating cookie ${name} has an invalid Max-Age`);
      maxAgeAttribute = seconds;
    } else if (attribute === "priority") {
      if (attributeValue === null || !["low", "medium", "high"].includes(attributeValue.toLowerCase())) {
        throw new Error(`reviewed rotating cookie ${name} has an invalid Priority`);
      }
    } else {
      throw new Error(`reviewed rotating cookie ${name} added an unsupported attribute`);
    }
  }
  const effectiveExpires = maxAgeAttribute === undefined ? expiresAttribute : maxAgeAttribute <= 0 ? nowSeconds : nowSeconds + maxAgeAttribute;
  const remove = effectiveExpires !== undefined && effectiveExpires <= nowSeconds;
  if (!remove && effectiveExpires !== undefined)
    candidate.expires = effectiveExpires;
  const validated = filterCookies([candidate], target, nowSeconds);
  if (validated.rejected !== 0 || validated.cookies.length !== 1) {
    throw new Error(`reviewed rotating cookie ${name} escaped its exact origin scope`);
  }
  const cookie = validated.cookies[0];
  if (cookie === undefined)
    throw new Error(`reviewed rotating cookie ${name} disappeared during validation`);
  return remove ? {
    kind: "remove",
    name: cookie.name,
    domain: cookie.domain,
    hostOnly: cookie.hostOnly,
    path: cookie.path
  } : { kind: "set", cookie };
}
function webSessionCookie(cookies, name) {
  try {
    return exactCookie(cookies, name);
  } catch (cause) {
    if (cause instanceof Error)
      throw new WebSessionAuthStateError(cause.message, { cause });
    throw cause;
  }
}
function webSessionAuthSubject(auth) {
  if (!("subject" in auth) || typeof auth.subject !== "string" || auth.subject.length === 0)
    return null;
  return auth.subject;
}
async function createWebSessionClient(origin, auth, options) {
  const parsedOrigin = new URL(origin);
  if (parsedOrigin.protocol !== "https:" || parsedOrigin.origin !== origin || parsedOrigin.pathname !== "/" || parsedOrigin.search !== "" || parsedOrigin.hash !== "")
    throw new Error("authenticated web client origin must be exact canonical HTTPS");
  const dependencies = networkDependencies(options.dependencies);
  const cookieResult = await withWebSessionDeadline(options, (deadline) => dependencies.acquireCookies(cookieSelection(auth, deadline.remainingTimeMs()), parsedOrigin));
  const validatedSource = filterCookies(cookieResult.cookies, parsedOrigin);
  if (validatedSource.rejected !== 0 || validatedSource.cookies.length !== cookieResult.cookies.length)
    throw new WebSessionAuthStateError("authenticated web cookie source returned malformed or out-of-scope records");
  const rotation = options.cookieRotation;
  const allowedNames = new Set(rotation?.allowedNames ?? []);
  if (rotation !== undefined && (allowedNames.size !== rotation.allowedNames.length || allowedNames.size < 1 || allowedNames.size > 16 || [...allowedNames].some((name) => !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]{1,128}$/u.test(name)) || !Number.isSafeInteger(rotation.maxCachedCookieAgeSeconds) || rotation.maxCachedCookieAgeSeconds < 1 || rotation.maxCachedCookieAgeSeconds > 31 * 24 * 60 * 60 || !Number.isSafeInteger(rotation.tombstoneTtlSeconds) || rotation.tombstoneTtlSeconds < 1 || rotation.tombstoneTtlSeconds > 31 * 24 * 60 * 60))
    throw new WebSessionAuthStateError("authenticated web rotating-cookie allowlist is invalid");
  const nowSeconds = Math.floor(Date.now() / 1000);
  const cachedCookies = new Map;
  const cachedTombstones = new Map;
  if (rotation !== undefined) {
    if (rotation.cachedState.cookies.length > 64 || rotation.cachedState.tombstones.length > 64)
      throw new Error("authenticated web rotating-cookie cache exceeded its reviewed bounds");
    for (const entry of rotation.cachedState.cookies) {
      if (!Number.isSafeInteger(entry.acceptedAtSeconds) || entry.acceptedAtSeconds < 0 || entry.acceptedAtSeconds > nowSeconds + 300 || !allowedNames.has(entry.cookie.name))
        throw new WebSessionAuthStateError("authenticated web rotating-cookie cache is invalid");
      const validated = filterCookies([entry.cookie], parsedOrigin, nowSeconds);
      if (validated.rejected !== 0 || validated.cookies.length !== 1) {
        throw new WebSessionAuthStateError("authenticated web rotating-cookie cache is invalid");
      }
      if (nowSeconds - entry.acceptedAtSeconds > rotation.maxCachedCookieAgeSeconds)
        continue;
      const cookie = validated.cookies[0];
      if (cookie === undefined)
        throw new WebSessionAuthStateError("authenticated web rotating-cookie cache is invalid");
      const key = cookieIdentity(cookie);
      if (cachedCookies.has(key))
        throw new Error("authenticated web rotating-cookie cache contains a duplicate");
      cachedCookies.set(key, Object.freeze({
        acceptedAtSeconds: entry.acceptedAtSeconds,
        cookie
      }));
    }
    for (const tombstone of rotation.cachedState.tombstones) {
      if (!Number.isSafeInteger(tombstone.acceptedAtSeconds) || tombstone.acceptedAtSeconds < 0 || tombstone.acceptedAtSeconds > nowSeconds + 300 || !allowedNames.has(tombstone.name))
        throw new WebSessionAuthStateError("authenticated web rotating-cookie cache is invalid");
      const validated = filterCookies([{
        name: tombstone.name,
        value: "",
        domain: tombstone.domain,
        hostOnly: tombstone.hostOnly,
        path: tombstone.path,
        secure: parsedOrigin.protocol === "https:",
        httpOnly: false,
        sameSite: null,
        expires: 0
      }], parsedOrigin, nowSeconds);
      const identity = validated.cookies[0];
      if (validated.rejected !== 0 || validated.cookies.length !== 1 || identity === undefined) {
        throw new WebSessionAuthStateError("authenticated web rotating-cookie cache is invalid");
      }
      const key = cookieIdentity(identity);
      if (identity.name !== tombstone.name || identity.domain !== tombstone.domain || identity.hostOnly !== tombstone.hostOnly || identity.path !== tombstone.path || cachedTombstones.has(key) || cachedCookies.has(key))
        throw new WebSessionAuthStateError("authenticated web rotating-cookie cache is invalid");
      if (nowSeconds - tombstone.acceptedAtSeconds > rotation.tombstoneTtlSeconds)
        continue;
      cachedTombstones.set(key, Object.freeze({ ...tombstone }));
    }
  }
  let rotatingCookies = cachedCookies;
  let rotatingTombstones = cachedTombstones;
  const combinedCookies = () => {
    const combined = new Map;
    for (const cookie of validatedSource.cookies) {
      const key = cookieIdentity(cookie);
      if (!rotatingTombstones.has(key) && !rotatingCookies.has(key))
        combined.set(key, cookie);
    }
    for (const { cookie } of rotatingCookies.values()) {
      combined.set(cookieIdentity(cookie), cookie);
    }
    return [...combined.values()];
  };
  const applyResponseCookies = async (response, target) => {
    if (rotation === undefined)
      return;
    const changes = responseSetCookieHeaders(response.headers).map((value) => parseResponseCookie(value, target, allowedNames, Math.floor(Date.now() / 1000))).filter((value) => value !== null);
    if (changes.length === 0)
      return;
    const acceptedAtSeconds = Math.floor(Date.now() / 1000);
    const nextCookies = new Map(rotatingCookies);
    const nextTombstones = new Map(rotatingTombstones);
    for (const change of changes) {
      const key = change.kind === "set" ? cookieIdentity(change.cookie) : `${change.domain}\x00${change.hostOnly ? "host" : "domain"}\x00${change.path}\x00${change.name}`;
      if (change.kind === "set") {
        nextCookies.set(key, Object.freeze({
          acceptedAtSeconds,
          cookie: change.cookie
        }));
        nextTombstones.delete(key);
      } else {
        nextCookies.delete(key);
        nextTombstones.set(key, Object.freeze({
          acceptedAtSeconds,
          domain: change.domain,
          hostOnly: change.hostOnly,
          name: change.name,
          path: change.path
        }));
      }
    }
    rotatingCookies = nextCookies;
    rotatingTombstones = nextTombstones;
    await rotation.save(Object.freeze({
      cookies: Object.freeze([...rotatingCookies.values()]),
      tombstones: Object.freeze([...rotatingTombstones.values()])
    }));
  };
  const requestJsonResponse = async (request) => {
    if (request.url.origin !== origin || request.url.username !== "" || request.url.password !== "" || request.url.hash !== "") {
      throw new Error("authenticated web API request escaped its reviewed origin");
    }
    if (request.body !== undefined && request.method !== "POST") {
      throw new Error("authenticated web API request body requires POST");
    }
    const headers = new Headers(request.headers);
    headers.set("cookie", renderCookieHeader(combinedCookies()));
    return withWebSessionDeadline(options, async (deadline) => {
      let response;
      try {
        try {
          response = await deadline.run(() => dependencies.fetch(request.url, {
            method: request.method,
            headers,
            ...request.body === undefined ? {} : { body: request.body },
            redirect: "error",
            signal: deadline.signal
          }, remainingRequestTimeMs(deadline)), WEB_SESSION_OPERATION_LABEL);
        } catch (error) {
          throw new WebSessionReadTransportError("authenticated web API request failed before a reviewed response was received", error);
        }
        const expected = request.expectedStatuses ?? [200];
        const contentType = contentTypeEssence(response);
        const contentTypeAllowed = request.expectedContentTypes === undefined ? isJsonContentType(contentType) : contentType !== null && request.expectedContentTypes.includes(contentType);
        if (!expected.includes(response.status) || !contentTypeAllowed) {
          response.body?.cancel().catch(() => {
            return;
          });
          throw new WebSessionResponseRejectedError(`authenticated web API returned unreviewed status/content type ${response.status}/${contentType ?? "missing"}`, response.status, contentType);
        }
        await applyResponseCookies(response, request.url);
        const status = response.status;
        const value = parseJson(await boundedBytes(response, request.maxBytes, deadline));
        return Object.freeze({ status, value });
      } finally {
        if (deadline.signal.aborted) {
          response?.body?.cancel().catch(() => {
            return;
          });
        }
      }
    });
  };
  return {
    origin,
    get cookies() {
      return combinedCookies();
    },
    requestText: async (request) => {
      if (request.url.origin !== origin || request.url.username !== "" || request.url.password !== "" || request.url.hash !== "") {
        throw new Error("authenticated web request escaped its reviewed origin");
      }
      const method = request.method ?? "GET";
      if (request.body !== undefined && method !== "POST") {
        throw new Error("authenticated web text request body requires POST");
      }
      if (method === "POST" && request.body === undefined) {
        throw new Error("authenticated web text POST requires a body");
      }
      const headers = new Headers(request.headers);
      headers.set("cookie", renderCookieHeader(combinedCookies()));
      return withWebSessionDeadline(options, async (deadline) => {
        let response;
        try {
          try {
            response = await deadline.run(() => dependencies.fetch(request.url, {
              method,
              headers,
              ...request.body === undefined ? {} : { body: request.body },
              redirect: "error",
              signal: deadline.signal
            }, remainingRequestTimeMs(deadline)), WEB_SESSION_OPERATION_LABEL);
          } catch (error) {
            throw new WebSessionReadTransportError("authenticated web request failed before a reviewed response was received", error);
          }
          const contentType = contentTypeEssence(response);
          if (response.status !== 200 || contentType === null || !request.expectedContentTypes.includes(contentType)) {
            response.body?.cancel().catch(() => {
              return;
            });
            throw new WebSessionResponseRejectedError(`authenticated web request returned unreviewed status/content type ${response.status}/${contentType ?? "missing"}`, response.status, contentType);
          }
          await applyResponseCookies(response, request.url);
          const bytes = await boundedBytes(response, request.maxBytes, deadline);
          try {
            return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
          } catch {
            throw new Error("authenticated web request returned invalid UTF-8");
          }
        } finally {
          if (deadline.signal.aborted) {
            response?.body?.cancel().catch(() => {
              return;
            });
          }
        }
      });
    },
    requestJson: async (request) => (await requestJsonResponse(request)).value,
    requestJsonResponse,
    requestStatus: async (request) => {
      if (request.url.origin !== origin || request.url.username !== "" || request.url.password !== "" || request.url.hash !== "") {
        throw new Error("authenticated web API request escaped its reviewed origin");
      }
      if (request.body !== undefined && request.method !== "POST") {
        throw new Error("authenticated web API request body requires POST");
      }
      if (request.expectedStatuses.length < 1 || request.expectedStatuses.length > 10 || request.expectedStatuses.some((status) => !Number.isSafeInteger(status) || status < 100 || status > 599))
        throw new Error("authenticated web API expected status list is invalid");
      const headers = new Headers(request.headers);
      headers.set("cookie", renderCookieHeader(combinedCookies()));
      return withWebSessionDeadline(options, async (deadline) => {
        let response;
        try {
          try {
            response = await deadline.run(() => dependencies.fetch(request.url, {
              method: request.method,
              headers,
              ...request.body === undefined ? {} : { body: request.body },
              redirect: "error",
              signal: deadline.signal
            }, remainingRequestTimeMs(deadline)), WEB_SESSION_OPERATION_LABEL);
          } catch (error) {
            throw new WebSessionReadTransportError("authenticated web API request failed before a reviewed response was received", error);
          }
          if (!request.expectedStatuses.includes(response.status)) {
            response.body?.cancel().catch(() => {
              return;
            });
            throw new WebSessionResponseRejectedError(`authenticated web API request returned unreviewed status ${response.status}`, response.status, null);
          }
          await applyResponseCookies(response, request.url);
          let responseId;
          if (request.reviewedResponseIdHeader !== undefined) {
            const rawResponseId = response.headers.get(request.reviewedResponseIdHeader);
            if (rawResponseId !== null && (rawResponseId.length < 1 || rawResponseId.length > 512 || /[\0\r\n]/u.test(rawResponseId))) {
              response.body?.cancel().catch(() => {
                return;
              });
              throw new Error("authenticated web API response returned an invalid reviewed identifier");
            }
            responseId = rawResponseId;
          }
          const rawLocation = response.headers.get("location");
          let location = null;
          if (rawLocation !== null) {
            const parsed = new URL(rawLocation, origin);
            if (parsed.origin !== origin || parsed.username !== "" || parsed.password !== "" || parsed.hash !== "") {
              response.body?.cancel().catch(() => {
                return;
              });
              throw new Error("authenticated web API response attempted an unreviewed redirect");
            }
            location = `${parsed.pathname}${parsed.search}`;
          }
          response.body?.cancel().catch(() => {
            return;
          });
          deadline.throwIfUnavailable(WEB_SESSION_OPERATION_LABEL);
          return {
            status: response.status,
            location,
            ...request.reviewedResponseIdHeader === undefined ? {} : { responseId: responseId ?? null }
          };
        } finally {
          if (deadline.signal.aborted) {
            response?.body?.cancel().catch(() => {
              return;
            });
          }
        }
      });
    }
  };
}
async function fetchPublicWebAsset(url, options) {
  if (url.origin !== options.allowedOrigin || url.username !== "" || url.password !== "" || url.hash !== "") {
    throw new Error("public web asset escaped its reviewed origin");
  }
  const dependencies = networkDependencies(options.dependencies);
  return withWebSessionDeadline(options, async (deadline) => {
    let response;
    try {
      try {
        response = await deadline.run(() => dependencies.fetch(url, {
          method: "GET",
          redirect: "error",
          signal: deadline.signal
        }, remainingRequestTimeMs(deadline)), WEB_SESSION_OPERATION_LABEL);
      } catch (error) {
        throw new Error("public first-party web asset request failed", { cause: error });
      }
      const contentType = contentTypeEssence(response);
      if (response.status !== 200 || contentType === null || !options.contentTypes.includes(contentType)) {
        response.body?.cancel().catch(() => {
          return;
        });
        throw new Error(`public first-party web asset returned unreviewed status/content type ${response.status}/${contentType ?? "missing"}`);
      }
      const bytes = await boundedBytes(response, options.maxBytes, deadline);
      try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        throw new Error("public first-party web asset returned invalid UTF-8");
      }
    } finally {
      if (deadline.signal.aborted) {
        response?.body?.cancel().catch(() => {
          return;
        });
      }
    }
  });
}
async function uploadPublicWebAsset(url, options) {
  const parsedOrigin = new URL(options.allowedOrigin);
  if (parsedOrigin.protocol !== "https:" || parsedOrigin.origin !== options.allowedOrigin || parsedOrigin.pathname !== "/" || parsedOrigin.search !== "" || parsedOrigin.hash !== "" || url.origin !== options.allowedOrigin || url.username !== "" || url.password !== "" || url.hash !== "")
    throw new Error("public web asset upload escaped its reviewed origin");
  if (!(options.body instanceof Uint8Array) || !Number.isSafeInteger(options.maxBytes) || options.maxBytes < 1 || options.maxBytes > 513 * 1024 * 1024 || options.body.byteLength < 1 || options.body.byteLength > options.maxBytes)
    throw new Error("public web asset upload exceeded its reviewed byte limit");
  if (typeof options.contentType !== "string" || options.contentType.length < 1 || options.contentType.length > 512 || /[\0\r\n]/u.test(options.contentType))
    throw new Error("public web asset upload content type is invalid");
  if (!Number.isSafeInteger(options.expectedStatus) || options.expectedStatus < 200 || options.expectedStatus > 299)
    throw new Error("public web asset upload expected status is invalid");
  if (options.userAgent !== undefined && (options.userAgent.length < 1 || options.userAgent.length > 512 || /[\0\r\n]/u.test(options.userAgent)))
    throw new Error("public web asset upload user agent is invalid");
  const dependencies = networkDependencies(options.dependencies);
  return withWebSessionDeadline(options, async (deadline) => {
    let response;
    try {
      const headers = new Headers({
        accept: "application/xml",
        "content-type": options.contentType,
        ...options.userAgent === undefined ? {} : { "user-agent": options.userAgent }
      });
      try {
        response = await deadline.run(() => dependencies.fetch(url, {
          method: "POST",
          headers,
          body: options.body,
          redirect: "error",
          signal: deadline.signal
        }, remainingRequestTimeMs(deadline)), WEB_SESSION_OPERATION_LABEL);
      } catch (error) {
        throw new Error("public web asset upload failed before a reviewed response was received", { cause: error });
      }
      if (response.status !== options.expectedStatus) {
        response.body?.cancel().catch(() => {
          return;
        });
        throw new Error(`public web asset upload returned unreviewed status ${response.status}`);
      }
      response.body?.cancel().catch(() => {
        return;
      });
      deadline.throwIfUnavailable(WEB_SESSION_OPERATION_LABEL);
      return Object.freeze({ status: response.status });
    } finally {
      if (deadline.signal.aborted) {
        response?.body?.cancel().catch(() => {
          return;
        });
      }
    }
  });
}

export { WebSessionResponseRejectedError, WebSessionReadTransportError, WebSessionAuthStateError, validateWebSessionAuthState, webSessionCookie, webSessionAuthSubject, createWebSessionClient, fetchPublicWebAsset, uploadPublicWebAsset };

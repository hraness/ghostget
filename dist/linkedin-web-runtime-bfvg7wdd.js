// @bun
import {
  LINKEDIN_ARTICLE_INLINE_IMAGE_UPLOAD_PATH,
  LINKEDIN_ARTICLE_PAGE_MAX_CHARACTERS,
  LINKEDIN_FIRST_PARTY_ARTICLES_PATH,
  LINKEDIN_GRAPHQL_PATH,
  LINKEDIN_MESSENGER_CONVERSATIONS_OBSERVED_QUERY_ID,
  LINKEDIN_MESSENGER_CONVERSATIONS_QUERY_PREFIX,
  LINKEDIN_POST_CREATE_MUTATION_ID,
  LINKEDIN_POST_READBACK_QUERY_ID,
  LINKEDIN_PROFILE_ACTIVITY_MAX_ITEMS,
  LINKEDIN_PROFILE_ACTIVITY_QUERY_PREFIX,
  assertLinkedInMessengerConversationsRequest,
  assertLinkedInProfileActivityRequest,
  buildLinkedInArticleContentPatch,
  buildLinkedInArticleContentPatchV2,
  buildLinkedInArticleCoverPatch,
  buildLinkedInArticleCreateBody,
  buildLinkedInArticleTitlePatch,
  buildLinkedInPostCreateVariables,
  encodeRestliV2Value,
  linkedInArticleDraftEditUrl,
  linkedInArticleDraftEntityUrl,
  linkedInArticleDraftEnvelopeFromCodePayloads,
  linkedInArticleDraftEnvelopeFromHtml,
  linkedInArticleDraftId,
  linkedInCsrfTokenFromJSessionId,
  linkedInMailboxUrnFromMiniProfile,
  linkedInMessengerConversationsUrl,
  linkedInOrganizationTarget,
  linkedInPersonalProfilePublicIdentifier,
  linkedInPersonalProfileTarget,
  linkedInPostAltText,
  linkedInPostEntityUrn,
  linkedInPostMediaUrn,
  linkedInPostText,
  linkedInPostVisibility,
  linkedInProfileActivityFeed,
  linkedInProfileActivityPageUrl,
  linkedInProfileActivityTarget,
  linkedInProfileActivityTargetFromVanity,
  normalizeLinkedInArticleDraft,
  normalizeLinkedInArticleDraftMetadata,
  normalizeLinkedInArticleDraftSnapshot,
  normalizeLinkedInArticleDraftV2,
  normalizeLinkedInArticleDraftV2Metadata,
  normalizeLinkedInArticleImageUploadRegistration,
  normalizeLinkedInMessagingList,
  normalizeLinkedInPostProjection,
  parseLinkedInProfileActivityCursor,
  projectLinkedInOrganizationStats,
  projectLinkedInPersonalProfileStats,
  projectLinkedInProfileActivityPage,
  readNative,
  resolveLinkedInProfileActivityBinding,
  resolveLinkedInRegisteredQueryId
} from "./index-jr8fpkck.js";
import {
  materializeArticleDraftImage,
  materializeArticleDraftImages
} from "./index-sxj6x3b5.js";
import {
  ReadEffectFailure,
  readAttempt,
  runReadEffect,
  withReadResource
} from "./index-mfj1vvc7.js";
import {
  readSessionSecretSnapshot,
  writeSessionSecretIfUnchanged
} from "./index-8qr77as7.js";
import {
  PreservedBrowserArtifactsError,
  browserCleanupBarrier,
  browserResultData,
  createBrowserSession,
  runCommand
} from "./index-d5mavmrj.js";
import {
  WebSessionAuthStateError,
  WebSessionReadTransportError,
  WebSessionResponseRejectedError,
  createWebSessionClient,
  validateWebSessionAuthState,
  webSessionAuthSubject,
  webSessionCookie
} from "./index-wn3s7nnj.js";
import"./index-0ywm1fj9.js";
import"./index-4bpemvnc.js";
import"./index-j3ysa35f.js";
import {
  readFailureProjection,
  startWebSessionCleanupTrackedOperation
} from "./index-aka7rgdj.js";
import {
  OperationDeadline,
  OperationDeadlineError
} from "./index-vtj5zdgf.js";
import {
  parseArticleDraftDocument,
  parseArticleDraftDocumentV2
} from "./index-tp6v994c.js";
import"./index-n4szk3nw.js";
import"./index-26yq8q16.js";
import {
  canonicalJson,
  canonicalJsonScriptLiteral,
  jsonScriptLiteral,
  sha256
} from "./index-8sbt8qwx.js";
import"./index-z1w83f81.js";

// src/providers/linkedin-web-runtime.ts
import * as Effect9 from "effect/Effect";

// src/providers/linkedin-self-platform.ts
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
var native = (work) => Effect.tryPromise({ try: work, catch: (cause) => new ReadEffectFailure({ cause }) });
function platform(ports) {
  return {
    openBrowser: native(ports.openBrowser),
    closeBrowser: (browser) => native(() => browser.close()),
    browserIdentity: (browser) => native(() => browser.currentIdentityResponse()).pipe(Effect.flatMap((value) => readAttempt(() => ports.decodeIdentity(value)))),
    openDirect: native(ports.openDirect),
    directIdentity: (client) => native(() => ports.directIdentity(client)),
    bindIdentity: (identity) => readAttempt(() => ports.bindIdentity(identity)),
    browserProfile: (browser, url) => native(() => browser.readProfileHtml(url)),
    browserConnections: (browser, url) => native(() => browser.readConnectionsHtml(url)),
    directProfile: (client, url) => native(() => ports.readProfile(client, url)),
    directConnections: (client, url) => native(() => ports.readConnections(client, url)),
    observedAt: readAttempt(ports.observedAt)
  };
}

class LinkedInSelfPlatform extends Context.Tag("wrench/LinkedInSelfPlatform/v1")() {
}
var LinkedInSelfPlatformLive = (ports) => Layer.succeed(LinkedInSelfPlatform, platform(ports));

// src/providers/linkedin-company-platform.ts
import * as Context2 from "effect/Context";
import * as Effect2 from "effect/Effect";
import * as Layer2 from "effect/Layer";
function platform2(ports) {
  return {
    openBrowser: readNative(ports.openBrowser),
    closeBrowser: (browser) => readNative(() => browser.close()),
    browserIdentity: (browser) => readNative(() => browser.currentIdentityResponse()).pipe(Effect2.flatMap((value) => readAttempt(() => ports.decodeIdentity(value)))),
    browserCompany: (browser, url) => readNative(() => browser.readOrganizationHtml(url)),
    openDirect: readNative(ports.openDirect),
    directIdentity: (client) => readNative(() => ports.directIdentity(client)),
    bindIdentity: (identity) => readAttempt(() => ports.bindIdentity(identity)),
    directCompany: (client, url) => readNative(() => ports.readCompany(client, url)),
    observedAt: readAttempt(ports.observedAt)
  };
}

class LinkedInCompanyPlatform extends Context2.Tag("wrench/LinkedInCompanyPlatform/v1")() {
}
var LinkedInCompanyPlatformLive = (ports) => Layer2.succeed(LinkedInCompanyPlatform, platform2(ports));

// src/providers/linkedin-company-program.ts
import * as Effect3 from "effect/Effect";
import * as Either from "effect/Either";

// src/providers/linkedin-web-profile-browser.ts
import { createHash } from "crypto";

// src/providers/linkedin-web-contact.ts
var LINKEDIN_PROFILE_CONTACT_INFO_QUERY_NAME = "voyagerIdentityDashProfileContactInfo";
var CONTACT_QUERY_ID = /^voyagerIdentityDashProfileContactInfo\.[0-9a-f]{32}$/u;
var PROFILE_URN = /^urn:li:fsd_profile:[A-Za-z0-9_-]{1,256}$/u;
var VIEWER_SUBJECT = /^urn:li:fsd_profile:[0-9]{1,32}$/u;
var EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}$/u;
var PHONE = /^\+?[0-9][0-9 .\-()]{6,30}[0-9]$/u;
var BIRTHDAY = /^(?:[0-9]{4}-)?(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])$/u;
var CONNECTED_DISPLAY = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ([1-9]|[12][0-9]|3[01]), ([0-9]{4})$/u;
var MONTHS = Object.freeze({
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12"
});
var HTML_ENTITY = /&(?:nbsp|quot|amp|lt|gt|apos|#(?:[xX][0-9A-Fa-f]{1,6}|[0-9]{1,7}));/gu;
var MAX_HTML_BYTES = 8 * 1024 * 1024;
var MAX_CODE_TAGS = 256;
var MAX_COMO_ASSIGNMENTS = 8;
var MAX_COMO_DECODED_ROOTS = 256;
var MAX_WALK_NODES = 500000;
var MAX_WALK_DEPTH = 128;
var RSC_FLIGHT_ROW = /(?:^|\n)(\d+):/u;
var PROFILE_ID = /^[A-Za-z0-9_-]{1,256}$/u;
var DISTANCE_IN_TEXT = /(?:^|["'\\{,])(?:networkDistance|memberDistance|distance)\\*"?\s*:\s*\\*"?(DISTANCE_[A-Z0-9]+|OUT_OF_NETWORK|SELF|[0-9]+)\\*"?/gu;
var PROFILE_URN_IN_TEXT = /urn:li:fsd_profile:[A-Za-z0-9_-]{1,256}/gu;
var VIEWEE_PROFILE_ID_IN_TEXT = /vieweeProfileId\\*"?\s*:\s*\\*"?([A-Za-z0-9_-]{1,256})/gu;
var VIEWEE_MEMBER_URN_IN_TEXT = /vieweeMemberUrn\\*"?\s*:\s*\\*"?(urn:li:(?:fsd_profile|member):[A-Za-z0-9_-]{1,256}|[0-9]{1,32})/gu;
var MEMBER_URN = /^urn:li:member:[0-9]{1,32}$/u;
var VANITY_IN_TEXT = /(?:vanityName|publicIdentifier)\\*"?\s*:\s*\\*"?([A-Za-z0-9][A-Za-z0-9_-]{1,99})/gu;
var MAX_JSON_STRING_PEELS = 4;
var KEYED_IDENTITY_KEYS = new Set([
  "distance",
  "entityUrn",
  "isSelfView",
  "memberDistance",
  "networkDistance",
  "objectUrn",
  "profileUrn",
  "publicIdentifier",
  "vanityName",
  "vieweeMemberUrn",
  "vieweeProfileId"
]);
var MAX_PHONES = 8;
var MAX_WEBSITES = 8;
var CONTACT_TYPE_SUFFIX = "ProfileContactInfo";
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function boundedText(value, label, maximum) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || /[\0\r]/u.test(value))
    throw new Error(`${label} must be a bounded string`);
  return value;
}
function observationTime(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || !Number.isFinite(Date.parse(value)))
    throw new Error("LinkedIn contact-info observedAt must be an exact UTC timestamp");
  return value;
}
function viewerSubject(value) {
  const subject = boundedText(value, "LinkedIn contact-info viewer subject", 512);
  if (!VIEWER_SUBJECT.test(subject)) {
    throw new Error("LinkedIn contact-info viewer subject has an unsupported format");
  }
  return subject;
}
function profileUrn(value) {
  const urn = boundedText(value, "LinkedIn contact-info profile URN", 512);
  if (!PROFILE_URN.test(urn)) {
    throw new Error("LinkedIn contact-info profile URN changed format");
  }
  return urn;
}
function linkedInContactInfoTarget(value) {
  return linkedInPersonalProfileTarget(value);
}
function contactQueryId(value) {
  const queryId = boundedText(value, "LinkedIn contact-info GraphQL queryId", 128);
  if (!CONTACT_QUERY_ID.test(queryId)) {
    throw new Error("LinkedIn contact-info GraphQL queryId changed format");
  }
  return queryId;
}
function buildLinkedInProfileContactInfoGraphqlPath(input) {
  const urn = profileUrn(input.profileUrn);
  const selector = input.queryId === undefined ? `queryName=${encodeURIComponent(LINKEDIN_PROFILE_CONTACT_INFO_QUERY_NAME)}` : `queryId=${encodeURIComponent(contactQueryId(input.queryId))}`;
  return `${LINKEDIN_GRAPHQL_PATH}?includeWebMetadata=true&${selector}&variables=(profileUrn:${encodeRestliV2Value(urn)})`;
}
function resolveLinkedInProfileContactInfoQueryId(html) {
  if (typeof html !== "string" || html.length < 1 || html.length > MAX_HTML_BYTES) {
    return;
  }
  const unique = new Set;
  for (const match of html.matchAll(/voyagerIdentityDashProfileContactInfo\.([0-9a-f]{32})/giu)) {
    const decoration = match[1];
    if (decoration === undefined)
      continue;
    unique.add(`voyagerIdentityDashProfileContactInfo.${decoration.toLowerCase()}`);
  }
  if (unique.size !== 1)
    return;
  return unique.values().next().value;
}
function decodeHtmlEntity(entity) {
  if (entity === "&nbsp;")
    return " ";
  if (entity === "&quot;")
    return '"';
  if (entity === "&amp;")
    return "&";
  if (entity === "&lt;")
    return "<";
  if (entity === "&gt;")
    return ">";
  if (entity === "&apos;")
    return "'";
  const numeric = /^&#(?:[xX]([0-9A-Fa-f]{1,6})|([0-9]{1,7}));$/u.exec(entity);
  if (numeric === null) {
    throw new Error("LinkedIn contact-info page used an unsupported HTML entity");
  }
  const codePoint = Number.parseInt(numeric[1] ?? numeric[2] ?? "", numeric[1] === undefined ? 10 : 16);
  if (!Number.isSafeInteger(codePoint) || codePoint < 0 || codePoint > 1114111 || codePoint >= 55296 && codePoint <= 57343)
    throw new Error("LinkedIn contact-info page used an invalid numeric HTML entity");
  return String.fromCodePoint(codePoint);
}
function htmlAttribute(value, name) {
  const matches = [...value.matchAll(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "giu"))];
  if (matches.length === 0)
    return null;
  if (matches.length !== 1)
    throw new Error(`LinkedIn contact-info HTML repeated ${name}`);
  const raw = matches[0]?.[1] ?? matches[0]?.[2];
  if (raw === undefined || raw.length > 4096) {
    throw new Error(`LinkedIn contact-info HTML ${name} exceeded its reviewed bound`);
  }
  return raw.replace(HTML_ENTITY, (entity) => decodeHtmlEntity(entity));
}
function skipWhitespace(source, start) {
  let index = start;
  while (index < source.length && /\s/u.test(source[index] ?? ""))
    index += 1;
  return index;
}
function extractBalancedJsonValue(source, start) {
  const opener = source[start];
  if (opener !== "{" && opener !== "[")
    return;
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  const limit = Math.min(source.length, start + MAX_HTML_BYTES);
  for (let index = start;index < limit; index += 1) {
    const character = source[index];
    if (character === undefined)
      break;
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (character === '"')
        inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === opener)
      depth += 1;
    else if (character === closer) {
      depth -= 1;
      if (depth === 0)
        return source.slice(start, index + 1);
    }
  }
  return;
}
function parseJsonRoot(json) {
  try {
    return JSON.parse(json);
  } catch {
    throw new Error("LinkedIn contact-info bootstrap payload contained malformed JSON");
  }
}
function looksLikeRscFlight(value) {
  return RSC_FLIGHT_ROW.test(value);
}
function extractJsonString(source, start) {
  if (source[start] !== '"')
    return;
  let escaped = false;
  const limit = Math.min(source.length, start + MAX_HTML_BYTES);
  for (let index = start + 1;index < limit; index += 1) {
    const character = source[index];
    if (character === undefined)
      break;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"')
      return source.slice(start, index + 1);
  }
  return;
}
function uniqueTextCapture(values) {
  const unique = [...new Set(values)];
  return unique.length === 1 ? unique[0] : null;
}
function peelOneJsonStringLayer(value) {
  if (!value.includes("\\"))
    return value;
  let peeled = "";
  for (let index = 0;index < value.length; index += 1) {
    const character = value[index];
    if (character !== "\\") {
      peeled += character;
      continue;
    }
    const escaped = value[index + 1];
    if (escaped === undefined) {
      peeled += character;
      break;
    }
    if (escaped === '"' || escaped === "\\" || escaped === "/") {
      peeled += escaped;
      index += 1;
      continue;
    }
    if (escaped === "n" || escaped === "r" || escaped === "t") {
      peeled += escaped === "n" ? `
` : escaped === "r" ? "\r" : "\t";
      index += 1;
      continue;
    }
    if (escaped === "u") {
      const hex = value.slice(index + 2, index + 6);
      if (/^[0-9A-Fa-f]{4}$/u.test(hex)) {
        const codePoint = Number.parseInt(hex, 16);
        if (codePoint < 55296 || codePoint > 57343) {
          peeled += String.fromCharCode(codePoint);
          index += 5;
          continue;
        }
      }
    }
    peeled += character;
  }
  return peeled;
}
function peelJsonStringEscapes(value) {
  let current = value;
  for (let peel = 0;peel < MAX_JSON_STRING_PEELS; peel += 1) {
    const next = peelOneJsonStringLayer(current);
    if (next === current)
      break;
    current = next;
  }
  return current;
}
function captureBreadcrumbRecord(value) {
  const distances = [...value.matchAll(DISTANCE_IN_TEXT)].map((match) => match[1]).filter((item) => item !== undefined);
  const urns = [...value.matchAll(PROFILE_URN_IN_TEXT)].map((match) => match[0]).filter((item) => item !== undefined);
  const vieweeIds = [...value.matchAll(VIEWEE_PROFILE_ID_IN_TEXT)].map((match) => match[1]).filter((item) => item !== undefined);
  const vieweeMembers = [...value.matchAll(VIEWEE_MEMBER_URN_IN_TEXT)].map((match) => match[1]).filter((item) => item !== undefined);
  const vanities = [...value.matchAll(VANITY_IN_TEXT)].map((match) => match[1]).filter((item) => item !== undefined);
  if (distances.length === 0 && urns.length === 0 && vieweeIds.length === 0 && vieweeMembers.length === 0 && vanities.length === 0)
    return null;
  const record = {};
  const distance = uniqueTextCapture(distances);
  if (distance !== null) {
    record.networkDistance = /^[0-9]+$/u.test(distance) ? Number(distance) : distance;
  }
  const vieweeMemberUrn = uniqueTextCapture(vieweeMembers);
  if (vieweeMemberUrn !== null)
    record.vieweeMemberUrn = vieweeMemberUrn;
  else {
    const incidental = uniqueTextCapture(urns);
    if (incidental !== null)
      record.profileUrn = incidental;
  }
  if (vieweeIds.length === 1)
    record.vieweeProfileId = vieweeIds[0];
  if (vanities.length === 1)
    record.vanityName = vanities[0];
  return Object.keys(record).length > 0 ? Object.freeze(record) : null;
}
function breadcrumbRecordFromText(value) {
  if (value.length < 8 || value.length > 1024 * 1024)
    return null;
  const peeled = peelJsonStringEscapes(value);
  return captureBreadcrumbRecord(peeled) ?? (peeled === value ? null : captureBreadcrumbRecord(value));
}
function stringLooksLikeBootstrap(value) {
  return value.includes("networkDistance") || value.includes("memberDistance") || value.includes("vieweeProfileId") || value.includes("vieweeMemberUrn") || value.includes("vanityName") || value.includes("publicIdentifier") || /"distance"\s*:/u.test(value);
}
function decodeStringBootstrap(value) {
  const trimmed = value.trim();
  if (trimmed.length < 8 || trimmed.length > 1024 * 1024)
    return [];
  const peeled = peelJsonStringEscapes(trimmed);
  for (const candidate of peeled === trimmed ? [trimmed] : [trimmed, peeled]) {
    if (candidate.startsWith("{") || candidate.startsWith("[")) {
      try {
        return [JSON.parse(candidate)];
      } catch {}
    }
  }
  if (!stringLooksLikeBootstrap(trimmed) && !stringLooksLikeBootstrap(peeled)) {
    return [];
  }
  const breadcrumb = breadcrumbRecordFromText(peeled);
  return breadcrumb === null ? [] : [breadcrumb];
}
function recordFromKeyedArray(value) {
  if (value.length < 2 || value.length % 2 !== 0 || value.length > 64)
    return null;
  const record = {};
  let recognized = 0;
  for (let index = 0;index < value.length; index += 2) {
    const key = value[index];
    if (typeof key !== "string" || key.length < 1 || key.length > 128)
      return null;
    record[key] = value[index + 1];
    if (KEYED_IDENTITY_KEYS.has(key))
      recognized += 1;
  }
  return recognized > 0 ? Object.freeze(record) : null;
}
function decodeRscFlightRecords(text) {
  const records = [];
  let index = 0;
  while (index < text.length && records.length < MAX_COMO_DECODED_ROOTS) {
    index = skipWhitespace(text, index);
    const row = /^(\d+):/u.exec(text.slice(index));
    if (row === null)
      break;
    index += row[0].length;
    const first = text[index];
    if (first === "{" || first === "[") {
      const json = extractBalancedJsonValue(text, index);
      if (json === undefined) {
        index += 1;
        continue;
      }
      records.push(parseJsonRoot(json));
      index += json.length;
      continue;
    }
    if (first === '"') {
      const json = extractJsonString(text, index);
      if (json === undefined) {
        index += 1;
        continue;
      }
      try {
        const decoded = JSON.parse(json);
        if (typeof decoded === "string")
          records.push(...decodeStringBootstrap(decoded));
        else
          records.push(decoded);
      } catch {
        const breadcrumb2 = breadcrumbRecordFromText(json);
        if (breadcrumb2 !== null)
          records.push(breadcrumb2);
      }
      index += json.length;
      continue;
    }
    const remainder = text.slice(index);
    const nextRow = remainder.search(/\n\d+:/u);
    const rowText = nextRow === -1 ? remainder : remainder.slice(0, nextRow);
    const breadcrumb = breadcrumbRecordFromText(rowText);
    if (breadcrumb !== null)
      records.push(breadcrumb);
    index = nextRow === -1 ? text.length : index + nextRow + 1;
  }
  return records;
}
function decodeComoRehydrationValue(value) {
  if (typeof value === "string") {
    return looksLikeRscFlight(value) ? decodeRscFlightRecords(value) : decodeStringBootstrap(value);
  }
  if (Array.isArray(value)) {
    if (value.length > 20000) {
      throw new Error("LinkedIn contact-info bootstrap array exceeded its reviewed bound");
    }
    const decoded = [];
    for (const item of value) {
      if (decoded.length >= MAX_COMO_DECODED_ROOTS)
        break;
      if (typeof item === "string") {
        decoded.push(...decodeComoRehydrationValue(item));
        continue;
      }
      decoded.push(item);
    }
    return decoded;
  }
  if (isRecord(value))
    return [value];
  return [];
}
function extractComoRehydrationRoots(html) {
  const roots = [];
  const marker = "__como_rehydration__";
  let searchFrom = 0;
  let assignments = 0;
  while (searchFrom < html.length && assignments < MAX_COMO_ASSIGNMENTS && roots.length < MAX_COMO_DECODED_ROOTS) {
    const markerIndex = html.indexOf(marker, searchFrom);
    if (markerIndex === -1)
      break;
    let cursor = skipWhitespace(html, markerIndex + marker.length);
    if (html[cursor] !== "=") {
      searchFrom = markerIndex + marker.length;
      continue;
    }
    cursor = skipWhitespace(html, cursor + 1);
    const json = extractBalancedJsonValue(html, cursor);
    if (json === undefined) {
      searchFrom = cursor + 1;
      continue;
    }
    assignments += 1;
    const decoded = decodeComoRehydrationValue(parseJsonRoot(json));
    for (const root of decoded) {
      if (roots.length >= MAX_COMO_DECODED_ROOTS)
        break;
      roots.push(root);
    }
    searchFrom = cursor + json.length;
  }
  return roots;
}
function embeddedRecords(html) {
  if (typeof html !== "string" || html.length < 1 || html.length > MAX_HTML_BYTES) {
    throw new Error("LinkedIn contact-info profile page exceeded its reviewed HTML bound");
  }
  const roots = [];
  let codeTags = 0;
  for (const match of html.matchAll(/<code\b([^>]{0,4096})>([\s\S]*?)<\/code>/giu)) {
    codeTags += 1;
    if (codeTags > MAX_CODE_TAGS) {
      throw new Error("LinkedIn contact-info profile page returned too many code payloads");
    }
    const attributes = match[1];
    const body = match[2];
    if (attributes === undefined || body === undefined)
      continue;
    const id = htmlAttribute(attributes, "id");
    if (id === null || !/^bpr-guid-[0-9]{1,12}$/u.test(id))
      continue;
    if (body.length < 1 || body.length > 1024 * 1024) {
      throw new Error("LinkedIn contact-info bootstrap payload exceeded its reviewed bound");
    }
    const json = body.replace(HTML_ENTITY, (entity) => decodeHtmlEntity(entity)).trim();
    try {
      roots.push(JSON.parse(json));
    } catch {
      throw new Error("LinkedIn contact-info bootstrap payload contained malformed JSON");
    }
  }
  roots.push(...extractComoRehydrationRoots(html));
  if (roots.length < 1) {
    throw new Error("LinkedIn contact-info profile page omitted its bootstrap payloads");
  }
  const records = [];
  const stack = roots.map((value) => ({ value, depth: 0 }));
  let nodes = 0;
  while (stack.length > 0) {
    const next = stack.pop();
    nodes += 1;
    if (nodes > MAX_WALK_NODES || next.depth > MAX_WALK_DEPTH) {
      throw new Error("LinkedIn contact-info bootstrap exceeded its traversal bound");
    }
    if (typeof next.value === "string") {
      for (const value of decodeStringBootstrap(next.value)) {
        stack.push({ value, depth: next.depth + 1 });
      }
      continue;
    }
    if (Array.isArray(next.value)) {
      if (next.value.length > 20000) {
        throw new Error("LinkedIn contact-info bootstrap array exceeded its reviewed bound");
      }
      const keyed = recordFromKeyedArray(next.value);
      if (keyed !== null)
        records.push(keyed);
      for (const value of next.value)
        stack.push({ value, depth: next.depth + 1 });
      continue;
    }
    if (!isRecord(next.value))
      continue;
    records.push(next.value);
    for (const value of Object.values(next.value)) {
      stack.push({ value, depth: next.depth + 1 });
    }
  }
  return Object.freeze(records);
}
function typeName(value) {
  return typeof value === "string" ? value : "";
}
function distanceValue(record) {
  const raw = record.memberDistance ?? record.networkDistance ?? record.distance;
  if (typeof raw === "string" || typeof raw === "number")
    return raw;
  if (isRecord(raw) && (typeof raw.value === "string" || typeof raw.value === "number")) {
    return raw.value;
  }
  return null;
}
function isFirstDegree(value) {
  return value === "DISTANCE_1" || value === 1 || value === "1";
}
function isSelfDistance(value) {
  return value === "DISTANCE_SELF" || value === "SELF" || value === 0 || value === "0";
}
function optionalPublicIdentifier(value) {
  if (typeof value !== "string" || value.length < 1)
    return null;
  try {
    return linkedInPersonalProfilePublicIdentifier(value);
  } catch {
    return null;
  }
}
function vanityFromHref(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 2048)
    return null;
  let url;
  try {
    url = new URL(value.startsWith("http") ? value : `https://www.linkedin.com${value.startsWith("/") ? value : `/${value}`}`);
  } catch {
    return null;
  }
  if (url.hostname !== "www.linkedin.com" && url.hostname !== "linkedin.com")
    return null;
  const match = /^\/in\/([A-Za-z0-9][A-Za-z0-9_-]{1,99})\/?$/u.exec(url.pathname);
  if (match?.[1] === undefined)
    return null;
  return optionalPublicIdentifier(match[1]);
}
function vanityFromRecord(record) {
  return optionalPublicIdentifier(record.publicIdentifier) ?? optionalPublicIdentifier(record.vanityName) ?? vanityFromHref(record.profileUrl) ?? vanityFromHref(record.url) ?? vanityFromHref(record.canonicalUrl) ?? vanityFromHref(record.navigationUrl);
}
function profileUrnFromIdentity(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 512)
    return null;
  if (value.startsWith("urn:li:fsd_profile:")) {
    try {
      return profileUrn(value);
    } catch {
      return null;
    }
  }
  if (!PROFILE_ID.test(value))
    return null;
  try {
    return profileUrn(`urn:li:fsd_profile:${value}`);
  } catch {
    return null;
  }
}
function profileUrnFromRecord(record) {
  for (const key of ["entityUrn", "objectUrn", "profileUrn", "vieweeMemberUrn"]) {
    const urn = profileUrnFromIdentity(record[key]);
    if (urn !== null)
      return urn;
  }
  return profileUrnFromIdentity(record.vieweeProfileId);
}
function durableProfileUrnFromRecord(record) {
  for (const key of ["entityUrn", "objectUrn", "profileUrn"]) {
    const urn = profileUrnFromIdentity(record[key]);
    if (urn !== null)
      return urn;
  }
  const viewee = profileUrnFromIdentity(record.vieweeMemberUrn);
  if (viewee !== null && !VIEWER_SUBJECT.test(viewee))
    return viewee;
  return profileUrnFromIdentity(record.vieweeProfileId);
}
function classicProfileUrnFromRecord(record) {
  for (const key of ["entityUrn", "objectUrn", "profileUrn"]) {
    const urn = profileUrnFromIdentity(record[key]);
    if (urn !== null)
      return urn;
  }
  return null;
}
function vieweeMemberIdentity(record) {
  const value = record.vieweeMemberUrn;
  if (typeof value !== "string" || value.length < 1 || value.length > 512)
    return null;
  return profileUrnFromIdentity(value) ?? (MEMBER_URN.test(value) ? value : null) ?? (PROFILE_ID.test(value) ? value : null);
}
function recordIsSelfView(record) {
  return record.isSelfView === true;
}
function selfProfileError() {
  return new Error("LinkedIn contacts.read reads one 1st-degree connection; use profiles.read for the signed-in self profile");
}
function omittedDistanceError() {
  return new Error("LinkedIn contact-info profile page omitted or contradicted its relationship distance");
}
function uniqueDistances(values) {
  const unique = [...new Set(values.map((value) => String(value)))];
  return unique.map((value) => values.find((candidate) => String(candidate) === value));
}
function recordMatchesTarget(record, slug, urn) {
  const vanity = vanityFromRecord(record);
  const recordUrn = profileUrnFromRecord(record);
  return vanity === slug || recordUrn === urn;
}
function recordContradictsTarget(record, slug, urn) {
  const vanity = vanityFromRecord(record);
  const classicUrn = classicProfileUrnFromRecord(record);
  return vanity !== null && vanity !== slug || classicUrn !== null && classicUrn !== urn;
}
function recordIsViewerViewee(record, viewer) {
  const member = vieweeMemberIdentity(record);
  return member === viewer || profileUrnFromIdentity(member) === viewer;
}
function uniqueNonSelfDistance(values) {
  const other = values.filter((value) => !isSelfDistance(value));
  const unique = uniqueDistances(other);
  if (unique.length > 1)
    throw omittedDistanceError();
  return unique[0];
}
function relationshipDistance(records, slug, urn, viewer) {
  const bound = records.filter((record) => recordMatchesTarget(record, slug, urn)).map(distanceValue).filter((value) => value !== null);
  const boundDistance = uniqueNonSelfDistance(bound);
  if (boundDistance !== undefined)
    return boundDistance;
  if (bound.some(isSelfDistance) && urn === viewer)
    throw selfProfileError();
  const vieweeJoined = records.filter((record) => !recordContradictsTarget(record, slug, urn) && !recordIsViewerViewee(record, viewer) && vieweeMemberIdentity(record) !== null).map(distanceValue).filter((value) => value !== null);
  const vieweeDistance = uniqueNonSelfDistance(vieweeJoined);
  if (vieweeDistance !== undefined)
    return vieweeDistance;
  if (vieweeJoined.some(isSelfDistance) && (urn === viewer || !vieweeJoined.some((value) => !isSelfDistance(value)))) {
    throw selfProfileError();
  }
  const breadcrumbs = records.filter((record) => !recordContradictsTarget(record, slug, urn) && !recordMatchesTarget(record, slug, urn) && vieweeMemberIdentity(record) === null).map(distanceValue).filter((value) => value !== null);
  const breadcrumbDistance = uniqueNonSelfDistance(breadcrumbs);
  if (breadcrumbDistance !== undefined)
    return breadcrumbDistance;
  if (breadcrumbs.some(isSelfDistance) && (urn === viewer || !breadcrumbs.some((value) => !isSelfDistance(value)))) {
    throw selfProfileError();
  }
  throw omittedDistanceError();
}
function projectLinkedInProfileContactBinding(input) {
  const target = linkedInContactInfoTarget(input.profileUrl);
  const viewer = viewerSubject(input.expectedViewerSubject);
  const records = embeddedRecords(input.profileHtml);
  const vanityRecords = records.filter((record) => vanityFromRecord(record) === target.slug);
  if (vanityRecords.length < 1) {
    throw new Error("LinkedIn contact-info profile page did not bind the requested vanity");
  }
  if (vanityRecords.some(recordIsSelfView))
    throw selfProfileError();
  const urns = new Set;
  for (const record of vanityRecords) {
    const urn2 = durableProfileUrnFromRecord(record);
    if (urn2 !== null)
      urns.add(urn2);
  }
  if (urns.size < 1) {
    const joined = new Set;
    let sawSelf = false;
    for (const record of records) {
      const urn2 = durableProfileUrnFromRecord(record);
      const distance2 = distanceValue(record);
      if (recordIsSelfView(record) || urn2 === viewer || distance2 !== null && isSelfDistance(distance2)) {
        sawSelf = true;
      }
      if (urn2 === null || urn2 === viewer || distance2 === null)
        continue;
      joined.add(urn2);
    }
    if (joined.size === 1) {
      for (const urn2 of joined)
        urns.add(urn2);
    } else if (sawSelf && joined.size === 0) {
      throw selfProfileError();
    }
  }
  if (urns.size < 1) {
    throw new Error("LinkedIn contact-info profile page omitted its target identity");
  }
  if (urns.size !== 1) {
    throw new Error("LinkedIn contact-info profile page exposed ambiguous target identities");
  }
  const urn = urns.values().next().value;
  if (urn === viewer)
    throw selfProfileError();
  const distance = relationshipDistance(records, target.slug, urn, viewer);
  if (isSelfDistance(distance))
    throw selfProfileError();
  if (!isFirstDegree(distance)) {
    throw new Error("LinkedIn hid Contact info because the signed-in viewer is not a 1st-degree connection of this profile");
  }
  return Object.freeze({
    vanity: target.slug,
    profileUrn: urn,
    url: target.url,
    relationship: "first-degree"
  });
}
function projectLinkedInEmbeddedContactFields(html, vanity) {
  const records = embeddedRecords(html);
  const entities = collectRecords(records).filter(contactEntity);
  if (entities.length < 1)
    return;
  return projectFields(records, vanity);
}
function oneUnique(values, label) {
  const unique = [...new Set(values)];
  if (unique.length === 0)
    return null;
  if (unique.length !== 1)
    throw new Error(`${label} was ambiguous`);
  return unique[0];
}
function emailAddress(value, label) {
  const email = boundedText(value, label, 254).toLowerCase();
  if (!EMAIL.test(email))
    throw new Error(`${label} is not a reviewed email`);
  return email;
}
function optionalEmail(value, label) {
  if (value === undefined || value === null || value === "")
    return null;
  return emailAddress(value, label);
}
function phoneNumber(value, label) {
  const phone = boundedText(value, label, 32);
  if (!PHONE.test(phone))
    throw new Error(`${label} is not a reviewed phone number`);
  return phone;
}
function websiteUrl(value, label) {
  const raw = boundedText(value, label, 2048);
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label} must be an absolute URL`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:" || url.username !== "" || url.password !== "")
    throw new Error(`${label} must be a safe public HTTP URL`);
  return url.href;
}
function linkedInProfileHref(value, expectedVanity) {
  if (value === undefined || value === null || value === "")
    return null;
  const raw = boundedText(value, "LinkedIn contact-info profile link", 2048);
  let url;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    throw new Error("LinkedIn contact-info profile link must be an absolute URL");
  }
  if (url.hostname !== "www.linkedin.com" && url.hostname !== "linkedin.com")
    throw new Error("LinkedIn contact-info profile link escaped LinkedIn");
  const match = /^\/in\/([A-Za-z0-9][A-Za-z0-9_-]{1,99})\/?$/u.exec(url.pathname);
  if (match?.[1] === undefined) {
    throw new Error("LinkedIn contact-info profile link has an unsupported path");
  }
  const vanity = linkedInPersonalProfilePublicIdentifier(match[1]);
  if (vanity !== expectedVanity) {
    throw new Error("LinkedIn contact-info profile link does not match the requested vanity");
  }
  return `https://www.linkedin.com/in/${vanity}/`;
}
function padDay(value) {
  return String(value).padStart(2, "0");
}
function birthdayValue(value) {
  if (value === undefined || value === null || value === "")
    return null;
  if (typeof value === "string") {
    const text = boundedText(value, "LinkedIn contact-info birthday", 16);
    if (!BIRTHDAY.test(text))
      throw new Error("LinkedIn contact-info birthday changed format");
    return text;
  }
  if (!isRecord(value))
    throw new Error("LinkedIn contact-info birthday changed shape");
  const month = value.month;
  const day = value.day;
  if (!Number.isSafeInteger(month) || month < 1 || month > 12) {
    throw new Error("LinkedIn contact-info birthday month is invalid");
  }
  if (!Number.isSafeInteger(day) || day < 1 || day > 31) {
    throw new Error("LinkedIn contact-info birthday day is invalid");
  }
  if (value.year === undefined || value.year === null) {
    return `${padDay(month)}-${padDay(day)}`;
  }
  if (!Number.isSafeInteger(value.year) || value.year < 1900 || value.year > 2100)
    throw new Error("LinkedIn contact-info birthday year is invalid");
  return `${value.year}-${padDay(month)}-${padDay(day)}`;
}
function connectedSinceValue(value) {
  if (value === undefined || value === null || value === "")
    return null;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error("LinkedIn contact-info connected-since timestamp is invalid");
    }
    const date = new Date(value);
    if (!Number.isFinite(date.valueOf())) {
      throw new Error("LinkedIn contact-info connected-since timestamp is invalid");
    }
    return date.toISOString().slice(0, 10);
  }
  const text = boundedText(value, "LinkedIn contact-info connected-since", 32);
  if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u.test(text))
    return text;
  const match = CONNECTED_DISPLAY.exec(text);
  if (match === null) {
    throw new Error("LinkedIn contact-info connected-since changed format");
  }
  const month = MONTHS[match[1]];
  const day = padDay(Number(match[2]));
  return `${match[3]}-${month}-${day}`;
}
function phonesFromUnknown(value) {
  if (value === undefined || value === null)
    return Object.freeze([]);
  if (!Array.isArray(value) || value.length > MAX_PHONES) {
    throw new Error("LinkedIn contact-info phone list exceeded its reviewed bound");
  }
  return Object.freeze(value.map((item, index) => {
    if (typeof item === "string")
      return phoneNumber(item, `LinkedIn contact-info phone[${index}]`);
    if (!isRecord(item))
      throw new Error("LinkedIn contact-info phone changed shape");
    return phoneNumber(item.number ?? item.phoneNumber ?? item.value, `LinkedIn contact-info phone[${index}]`);
  }));
}
function websitesFromUnknown(value) {
  if (value === undefined || value === null)
    return Object.freeze([]);
  if (!Array.isArray(value) || value.length > MAX_WEBSITES) {
    throw new Error("LinkedIn contact-info website list exceeded its reviewed bound");
  }
  return Object.freeze(value.map((item, index) => {
    if (typeof item === "string")
      return websiteUrl(item, `LinkedIn contact-info website[${index}]`);
    if (!isRecord(item))
      throw new Error("LinkedIn contact-info website changed shape");
    return websiteUrl(item.url ?? item.value, `LinkedIn contact-info website[${index}]`);
  }));
}
function labelKey(value) {
  return boundedText(value, "LinkedIn contact-info field label", 64).trim().toLowerCase();
}
function labeledFields(value) {
  if (!Array.isArray(value) || value.length > 32)
    return null;
  const collected = { phones: [], websites: [] };
  for (const item of value) {
    if (!isRecord(item))
      continue;
    const label = item.label ?? item.title ?? item.heading;
    const raw = item.value ?? item.text ?? item.href;
    if (typeof label !== "string")
      continue;
    const key = labelKey(label);
    if (key === "email") {
      const email = optionalEmail(raw, "LinkedIn contact-info Email");
      if (email !== null)
        collected.email = email;
      continue;
    }
    if (key === "connected since") {
      const connected = connectedSinceValue(raw);
      if (connected !== null)
        collected.connectedSince = connected;
      continue;
    }
    if (key === "phone" || key === "phone number") {
      collected.phones.push(phoneNumber(raw, "LinkedIn contact-info Phone"));
      continue;
    }
    if (key === "website" || key === "websites") {
      collected.websites.push(websiteUrl(raw, "LinkedIn contact-info Website"));
      continue;
    }
    if (key === "birthday") {
      const birthday = birthdayValue(raw);
      if (birthday !== null)
        collected.birthday = birthday;
    }
  }
  if (collected.email === undefined && collected.profileUrl === undefined && collected.connectedSince === undefined && collected.phones.length === 0 && collected.websites.length === 0 && collected.birthday === undefined)
    return null;
  return Object.freeze({
    emailAddress: collected.email ?? null,
    connectedAt: collected.connectedSince ?? null,
    phoneNumbers: collected.phones,
    websites: collected.websites,
    birthDateOn: collected.birthday ?? null
  });
}
function contactEntity(record) {
  const type = typeName(record.$type);
  return type.endsWith(CONTACT_TYPE_SUFFIX) || record.emailAddress !== undefined || record.connectedAt !== undefined || record.phoneNumbers !== undefined || record.websites !== undefined || record.birthDateOn !== undefined;
}
function collectRecords(value) {
  const records = [];
  const stack = [{ value, depth: 0 }];
  let nodes = 0;
  while (stack.length > 0) {
    const next = stack.pop();
    nodes += 1;
    if (nodes > MAX_WALK_NODES || next.depth > MAX_WALK_DEPTH) {
      throw new Error("LinkedIn contact-info payload exceeded its traversal bound");
    }
    if (Array.isArray(next.value)) {
      if (next.value.length > 20000) {
        throw new Error("LinkedIn contact-info payload array exceeded its reviewed bound");
      }
      const labeled = labeledFields(next.value);
      if (labeled !== null)
        records.push(labeled);
      for (const item of next.value)
        stack.push({ value: item, depth: next.depth + 1 });
      continue;
    }
    if (!isRecord(next.value))
      continue;
    records.push(next.value);
    const nestedLabels = labeledFields(next.value.fields ?? next.value.items ?? next.value.rows);
    if (nestedLabels !== null)
      records.push(nestedLabels);
    for (const item of Object.values(next.value)) {
      stack.push({ value: item, depth: next.depth + 1 });
    }
  }
  return Object.freeze(records);
}
function projectFields(payload, vanity) {
  if (!isRecord(payload) && !Array.isArray(payload)) {
    throw new Error("LinkedIn contact-info payload must be a JSON object or array");
  }
  const records = collectRecords(payload);
  const entities = records.filter(contactEntity);
  if (entities.length < 1) {
    throw new Error("LinkedIn contact-info payload omitted its contact fields");
  }
  const emails = entities.map((record) => optionalEmail(record.emailAddress ?? record.email, "LinkedIn contact-info email")).filter((value) => value !== null);
  const profileUrls = entities.map((record) => linkedInProfileHref(record.profileUrl ?? record.vanityName ?? record.publicIdentifier, vanity)).filter((value) => value !== null);
  const connected = entities.map((record) => connectedSinceValue(record.connectedAt ?? record.connectedSince)).filter((value) => value !== null);
  const birthdays = entities.map((record) => birthdayValue(record.birthDateOn ?? record.birthday)).filter((value) => value !== null);
  const phones = entities.flatMap((record) => [...phonesFromUnknown(record.phoneNumbers ?? record.phones)]);
  const websites = entities.flatMap((record) => [...websitesFromUnknown(record.websites)]);
  return Object.freeze({
    email: oneUnique(emails, "LinkedIn contact-info email"),
    profileUrl: oneUnique(profileUrls, "LinkedIn contact-info profile link") ?? `https://www.linkedin.com/in/${vanity}/`,
    connectedSince: oneUnique(connected, "LinkedIn contact-info connected-since"),
    phones: Object.freeze([...new Set(phones)]),
    websites: Object.freeze([...new Set(websites)]),
    birthday: oneUnique(birthdays, "LinkedIn contact-info birthday")
  });
}
function projectLinkedInContactInfo(input) {
  const binding = projectLinkedInProfileContactBinding({
    profileHtml: input.profileHtml,
    profileUrl: input.profileUrl,
    expectedViewerSubject: input.expectedViewerSubject
  });
  const contact = projectFields(input.contactPayload, binding.vanity);
  const hasAny = contact.email !== null || contact.connectedSince !== null || contact.phones.length > 0 || contact.websites.length > 0 || contact.birthday !== null;
  return Object.freeze({
    schemaVersion: 1,
    provider: "linkedin",
    profile: binding,
    viewer: Object.freeze({ subject: viewerSubject(input.expectedViewerSubject) }),
    observedAt: observationTime(input.observedAt),
    completeness: hasAny ? "complete" : "partial",
    contact
  });
}

// src/providers/linkedin-web-profile-browser.ts
var LINKEDIN_ORIGIN = "https://www.linkedin.com";
var LINKEDIN_FEED_URL = `${LINKEDIN_ORIGIN}/feed/`;
var LINKEDIN_PRE_COOKIE_REALM_URL = `${LINKEDIN_ORIGIN}/robots.txt`;
var LINKEDIN_INITIAL_ROOT_BATCH = JSON.stringify([
  ["open", LINKEDIN_ORIGIN]
]);
var LINKEDIN_INITIAL_BLANK_BATCH = JSON.stringify([
  ["open", "about:blank"]
]);
var LINKEDIN_INITIAL_REALM_BATCH = JSON.stringify([
  ["open", LINKEDIN_PRE_COOKIE_REALM_URL]
]);
var LINKEDIN_CONNECTIONS_URL = `${LINKEDIN_ORIGIN}/mynetwork/invite-connect/connections/`;
var MAX_IDENTITY_BYTES = 2 * 1024 * 1024;
var MAX_STATS_PAGE_BYTES = 8 * 1024 * 1024;
var BROWSER_ENVELOPE_BYTES = 64 * 1024;
var profileBrowserManifest = Object.freeze({
  schemaVersion: 4,
  id: "linkedin-profile-runtime",
  version: "1.0.0",
  displayName: "LinkedIn profile stats runtime",
  surfaceId: "linkedin",
  origins: Object.freeze([LINKEDIN_ORIGIN]),
  browserDomains: Object.freeze(["www.linkedin.com", "static.licdn.com"]),
  operations: Object.freeze({})
});
var LINKEDIN_RESPONSE_MEDIA_TYPE = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u;

class LinkedInProfileBrowserFailure extends Error {
  category;
  constructor(category, message) {
    super(message);
    this.name = "LinkedInProfileBrowserFailure";
    this.category = category;
  }
}

class LinkedInProfileBrowserResponseRejectedError extends LinkedInProfileBrowserFailure {
  status;
  contentType;
  constructor(status, contentType) {
    super("response-rejected", "LinkedIn stats browser request returned a reviewed rejection");
    this.name = "LinkedInProfileBrowserResponseRejectedError";
    if (!Number.isSafeInteger(status) || status < 100 || status > 599 || contentType.length > 128 || contentType !== "" && !LINKEDIN_RESPONSE_MEDIA_TYPE.test(contentType))
      throw new Error("LinkedIn stats browser returned a malformed response category");
    this.status = status;
    this.contentType = contentType === "" ? "missing" : contentType;
  }
}
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys(value, expected, label) {
  if (Object.keys(value).sort().join(",") !== [...expected].sort().join(",")) {
    throw new Error(`${label} returned an unexpected result shape`);
  }
}
function exactLinkedInUrl(value, kind) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`LinkedIn ${kind} browser target is invalid`);
  }
  const pathAllowed = kind === "profile" ? /^\/in\/[A-Za-z0-9_-]{1,256}\/$/u.test(url.pathname) : /^\/company\/[a-z0-9][a-z0-9-]{0,255}\/$/u.test(url.pathname);
  if (url.origin !== LINKEDIN_ORIGIN || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "" || !pathAllowed)
    throw new Error(`LinkedIn ${kind} browser target escaped its reviewed route`);
  return url;
}
function browserReadEvaluationSource(binding) {
  const bound = jsonScriptLiteral(binding);
  return `(async()=>{const input=${bound};if(location.origin!=="${LINKEDIN_ORIGIN}")throw new Error("unexpected LinkedIn origin");if((input.kind!=="json"&&input.kind!=="html")||!Number.isSafeInteger(input.maxBytes)||input.maxBytes<1||input.maxBytes>${MAX_STATS_PAGE_BYTES})throw new Error("invalid LinkedIn stats browser request binding");const expected=new URL(input.path,"${LINKEDIN_ORIGIN}");if(expected.origin!=="${LINKEDIN_ORIGIN}"||expected.username!==""||expected.password!==""||expected.hash!==""||expected.href!=="${LINKEDIN_ORIGIN}"+input.path)throw new Error("invalid LinkedIn stats browser path binding");const headers=input.kind==="json"?{accept:"application/vnd.linkedin.normalized+json+2.1","x-li-lang":"en_US","x-requested-with":"XMLHttpRequest","x-restli-protocol-version":"2.0.0"}:{accept:"text/html"};if(input.kind==="json"){const raw=document.cookie.split("; ").find((part)=>part.startsWith("JSESSIONID="));if(typeof raw!=="string")throw new Error("missing LinkedIn browser CSRF cookie");const csrf=decodeURIComponent(raw.slice("JSESSIONID=".length)).replace(/^"|"$/g,"");if(!/^ajax:[A-Za-z0-9_-]{1,512}$/.test(csrf))throw new Error("invalid LinkedIn browser CSRF cookie");headers["csrf-token"]=csrf}const response=await fetch(input.path,{credentials:"include",headers,method:"GET",redirect:"error",referrer:input.referrer});const responseUrl=new URL(response.url);if(responseUrl.origin!=="${LINKEDIN_ORIGIN}"||responseUrl.username!==""||responseUrl.password!==""||responseUrl.hash!==""||responseUrl.href!==expected.href)throw new Error("LinkedIn stats browser response escaped its exact route");const contentType=(response.headers.get("content-type")||"").split(";",1)[0].trim().toLowerCase();const contentTypeAllowed=input.kind==="json"?(contentType==="application/vnd.linkedin.normalized+json+2.1"||contentType==="application/json"):contentType==="text/html";if(response.status!==200||!contentTypeAllowed){response.body?.cancel();return{authWall:false,bodyBase64:null,bodyBytes:0,bodySha256:null,contentType,status:response.status}}if(response.body===null)throw new Error("LinkedIn stats browser response omitted its body");const reader=response.body.getReader();const chunks=[];let bytes=0;while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>input.maxBytes){await reader.cancel();throw new Error("LinkedIn stats browser response exceeded its reviewed byte bound")}chunks.push(part.value)}const body=new Uint8Array(bytes);let cursor=0;for(const chunk of chunks){body.set(chunk,cursor);cursor+=chunk.byteLength}const text=new TextDecoder("utf-8",{fatal:true}).decode(body);const authWall=input.kind==="html"&&/(?:id|data-test-id)=["']authwall["']|name=["']loginCsrfParam["']|<form[^>]+(?:login|sign-in)/iu.test(text);if(authWall)return{authWall:true,bodyBase64:null,bodyBytes:0,bodySha256:null,contentType,status:response.status};const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",body)),(value)=>value.toString(16).padStart(2,"0")).join("");let binary="";for(let offset=0;offset<body.length;offset+=32768)binary+=String.fromCharCode(...body.subarray(offset,Math.min(offset+32768,body.length)));return{authWall:false,bodyBase64:btoa(binary),bodyBytes:body.byteLength,bodySha256:digest,contentType,status:response.status}})()`;
}
function encodedBodyBound(bytes) {
  return Math.ceil(bytes / 3) * 4;
}
function decodedBody(result, maximumBytes) {
  if (typeof result.bodyBase64 !== "string" || result.bodyBase64.length > encodedBodyBound(maximumBytes) || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(result.bodyBase64) || !Number.isSafeInteger(result.bodyBytes) || result.bodyBytes < 0 || result.bodyBytes > maximumBytes || typeof result.bodySha256 !== "string" || !/^[a-f0-9]{64}$/u.test(result.bodySha256))
    throw new LinkedInProfileBrowserFailure("body-envelope", "LinkedIn stats browser body envelope changed shape");
  const bytes = Buffer.from(result.bodyBase64, "base64");
  if (bytes.byteLength !== result.bodyBytes || bytes.toString("base64") !== result.bodyBase64 || createHash("sha256").update(bytes).digest("hex") !== result.bodySha256)
    throw new LinkedInProfileBrowserFailure("body-envelope", "LinkedIn stats browser body envelope failed integrity verification");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new LinkedInProfileBrowserFailure("body-envelope", "LinkedIn stats browser body was not valid UTF-8");
  }
}
function browserEvaluationResult(value) {
  const data = browserResultData(value);
  if (!isRecord2(data) || typeof data.origin !== "string" || !isRecord2(data.result)) {
    throw new LinkedInProfileBrowserFailure("response-envelope", "LinkedIn stats browser returned a malformed evaluation envelope");
  }
  let origin;
  try {
    origin = new URL(data.origin);
  } catch {
    throw new LinkedInProfileBrowserFailure("response-envelope", "LinkedIn stats browser returned a malformed evaluation envelope");
  }
  if (origin.origin !== LINKEDIN_ORIGIN || origin.username !== "" || origin.password !== "")
    throw new LinkedInProfileBrowserFailure("response-envelope", "LinkedIn stats browser returned a malformed evaluation envelope");
  return data.result;
}
function hasNoDefaultExecutionContext(error) {
  let current = error;
  for (let depth = 0;depth < 8 && current !== undefined; depth += 1) {
    if (current instanceof Error && /(?:cannot find|no) default execution context/iu.test(current.message))
      return true;
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}
function hasUnexpectedLinkedInOrigin(error) {
  let current = error;
  for (let depth = 0;depth < 8 && current !== undefined; depth += 1) {
    if (current instanceof Error && /(?:^|: )unexpected LinkedIn origin(?:$|[\r\n])/u.test(current.message))
      return true;
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}
function classifiedBrowserCommandFailure(error) {
  const message = error instanceof Error && error.message.length <= 1500 ? error.message : "";
  if (/(?:^|: )(?:missing|invalid) LinkedIn browser CSRF cookie$/u.test(message)) {
    return new LinkedInProfileBrowserFailure("session-cookie", "LinkedIn stats browser could not establish its reviewed CSRF cookie");
  }
  if (message.includes("Failed to fetch")) {
    return new LinkedInProfileBrowserFailure("provider-fetch", "LinkedIn stats browser could not complete its first-party fetch");
  }
  if (message.endsWith("LinkedIn stats browser response escaped its exact route")) {
    return new LinkedInProfileBrowserFailure("response-envelope", "LinkedIn stats browser response escaped its exact route");
  }
  if (message.includes("process output exceeded") || message.includes("response exceeded its reviewed byte bound")) {
    return new LinkedInProfileBrowserFailure("output-bound", "LinkedIn stats browser exceeded a reviewed output bound");
  }
  if (message.includes("malformed batch") || message.includes("malformed batch entry") || message.includes("did not return JSON") || message.includes("command omitted its result")) {
    return new LinkedInProfileBrowserFailure("browser-envelope", "LinkedIn stats browser command returned a malformed envelope");
  }
  return new LinkedInProfileBrowserFailure("browser-command", "LinkedIn stats browser command failed before a reviewed response");
}
function contextSettlementRejected(result) {
  return result.exitCode !== 0 && /Failed to install browser network controls:[^\r\n]{0,256}Cannot find default execution context/u.test(`${result.stderr}
${result.stdout}`);
}
function commandWasAborted(options) {
  return options.signal?.aborted === true;
}
function linkedInProfileBrowserCommandRunner(execute, settleContext, authKind) {
  let initialBatchPending = true;
  return async (command, options) => {
    const rewroteInitialRoot = initialBatchPending && options.stdin === LINKEDIN_INITIAL_ROOT_BATCH;
    const rewroteInitialBlank = initialBatchPending && authKind === "browser-profile" && options.stdin === LINKEDIN_INITIAL_BLANK_BATCH;
    const executionOptions = rewroteInitialRoot || rewroteInitialBlank ? { ...options, stdin: LINKEDIN_INITIAL_REALM_BATCH } : options;
    initialBatchPending = false;
    const first = await execute(command, executionOptions);
    if (!rewroteInitialRoot || authKind === "browser-profile" || !contextSettlementRejected(first) || commandWasAborted(executionOptions))
      return first;
    await settleContext();
    if (commandWasAborted(executionOptions))
      return first;
    return execute(command, executionOptions);
  };
}
function settleLinkedInBrowserContext() {
  return new Promise((resolve) => {
    setTimeout(resolve, 500);
  });
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
  if (cleanupVerified)
    return;
  const cleanupEvidence = closeVerified && !cleanupVerified && session.cleanupResourceIdentity !== undefined ? Object.freeze({
    kind: "agent-browser-closed-artifacts-v1",
    resource: session.cleanupResourceIdentity
  }) : undefined;
  throw new PreservedBrowserArtifactsError("LinkedIn stats browser finalization failed; private artifacts were preserved", session.recoveryHandle ?? "session=linkedin-profile-runtime;artifacts=unknown", new AggregateError(failures, "LinkedIn stats browser finalization failed"), cleanupEvidence);
}
async function createLinkedInProfileBrowserTransport(auth, options) {
  if (!Number.isSafeInteger(options.maxOutputBytes) || options.maxOutputBytes < 1 || options.maxOutputBytes > MAX_STATS_PAGE_BYTES)
    throw new Error("LinkedIn stats browser output bound is invalid");
  const createSession = options.dependencies?.createBrowserSession ?? createBrowserSession;
  const browserOutputBytes = encodedBodyBound(options.maxOutputBytes) + BROWSER_ENVELOPE_BYTES;
  const sessionOptions = {
    allowCodeOwnedEvaluation: true,
    headed: true,
    maxOutputBytes: browserOutputBytes,
    timeoutMs: options.timeoutMs,
    dependencies: {
      runCommand: linkedInProfileBrowserCommandRunner(options.dependencies?.runCommand ?? runCommand, options.dependencies?.settleContext ?? settleLinkedInBrowserContext, auth.kind)
    },
    ...options.operationDeadline === undefined ? {} : { operationDeadline: options.operationDeadline },
    ...options.publishCleanupResource === undefined ? {} : { publishCleanupResource: options.publishCleanupResource }
  };
  let session;
  try {
    session = await createSession(profileBrowserManifest, auth, sessionOptions);
  } catch (error) {
    if (error instanceof PreservedBrowserArtifactsError)
      throw error;
    options.operationDeadline?.throwIfUnavailable("LinkedIn stats browser startup");
    throw new LinkedInProfileBrowserFailure("startup", "LinkedIn stats browser could not start its contained session");
  }
  let closed = false;
  let state = "ready";
  const remainingTimeMs = () => options.operationDeadline?.remainingTimeMs() ?? options.timeoutMs;
  const run = async (binding) => {
    if (closed)
      throw new Error("LinkedIn stats browser transport is closed");
    const source = browserReadEvaluationSource(binding);
    let records;
    try {
      records = await session.runBatch([["eval", source]], remainingTimeMs(), Math.min(encodedBodyBound(binding.maxBytes) + BROWSER_ENVELOPE_BYTES, browserOutputBytes));
    } catch (error) {
      if (error instanceof PreservedBrowserArtifactsError)
        throw error;
      if (error instanceof LinkedInProfileBrowserFailure)
        throw error;
      options.operationDeadline?.throwIfUnavailable("LinkedIn stats browser operation");
      if (hasNoDefaultExecutionContext(error)) {
        throw new LinkedInProfileBrowserFailure("execution-context", "LinkedIn stats browser lost its reviewed execution context");
      }
      if (hasUnexpectedLinkedInOrigin(error)) {
        throw new LinkedInProfileBrowserFailure("bootstrap", "LinkedIn stats browser was not on its reviewed signed-in origin");
      }
      throw classifiedBrowserCommandFailure(error);
    }
    const first = records[0];
    if (first === undefined) {
      throw new LinkedInProfileBrowserFailure("response-envelope", "LinkedIn stats browser omitted its response");
    }
    const result = browserEvaluationResult(first);
    try {
      exactKeys(result, [
        "authWall",
        "bodyBase64",
        "bodyBytes",
        "bodySha256",
        "contentType",
        "status"
      ], "LinkedIn stats browser request");
    } catch {
      throw new LinkedInProfileBrowserFailure("response-envelope", "LinkedIn stats browser request returned an unexpected result shape");
    }
    const expectedContentTypes = binding.kind === "json" ? ["application/vnd.linkedin.normalized+json+2.1", "application/json"] : ["text/html"];
    if (typeof result.status !== "number" || !Number.isSafeInteger(result.status) || result.status < 100 || result.status > 599 || typeof result.contentType !== "string" || result.contentType.length > 128 || result.contentType !== "" && !LINKEDIN_RESPONSE_MEDIA_TYPE.test(result.contentType))
      throw new LinkedInProfileBrowserFailure("response-envelope", "LinkedIn stats browser returned a malformed response category");
    if (result.authWall === true) {
      if (binding.kind !== "html" || result.status !== 200 || result.contentType !== "text/html" || result.bodyBase64 !== null || result.bodyBytes !== 0 || result.bodySha256 !== null)
        throw new LinkedInProfileBrowserFailure("response-envelope", "LinkedIn stats browser returned a malformed authwall envelope");
      throw new LinkedInProfileBrowserFailure("authwall", "LinkedIn stats browser reached the signed-out authwall");
    }
    if (result.authWall !== false) {
      throw new LinkedInProfileBrowserFailure("response-envelope", "LinkedIn stats browser returned a malformed authwall envelope");
    }
    if (result.status !== 200 || !expectedContentTypes.includes(result.contentType)) {
      if (result.bodyBase64 !== null || result.bodyBytes !== 0 || result.bodySha256 !== null)
        throw new LinkedInProfileBrowserFailure("response-envelope", "LinkedIn stats browser returned a malformed rejection envelope");
      throw new LinkedInProfileBrowserResponseRejectedError(result.status, result.contentType);
    }
    return result;
  };
  return Object.freeze({
    currentIdentityResponse: async () => {
      if (state !== "ready") {
        throw new Error("LinkedIn stats browser identity read is out of order");
      }
      const result = await run({
        kind: "json",
        maxBytes: Math.min(MAX_IDENTITY_BYTES, options.maxOutputBytes),
        path: "/voyager/api/me",
        referrer: LINKEDIN_FEED_URL
      });
      state = "identity";
      const text = decodedBody(result, Math.min(MAX_IDENTITY_BYTES, options.maxOutputBytes));
      try {
        return JSON.parse(text);
      } catch {
        throw new LinkedInProfileBrowserFailure("identity-json", "LinkedIn stats browser identity response was not valid JSON");
      }
    },
    readProfileHtml: async (profileUrl) => {
      if (state !== "identity") {
        throw new Error("LinkedIn stats browser profile read is out of order");
      }
      const target = exactLinkedInUrl(profileUrl, "profile");
      const result = await run({
        kind: "html",
        maxBytes: options.maxOutputBytes,
        path: target.pathname,
        referrer: LINKEDIN_FEED_URL
      });
      state = "profile";
      return decodedBody(result, options.maxOutputBytes);
    },
    readConnectionsHtml: async (profileUrl) => {
      if (state !== "profile") {
        throw new Error("LinkedIn stats browser connections read is out of order");
      }
      const profile = exactLinkedInUrl(profileUrl, "profile");
      const result = await run({
        kind: "html",
        maxBytes: options.maxOutputBytes,
        path: new URL(LINKEDIN_CONNECTIONS_URL).pathname,
        referrer: profile.href
      });
      state = "complete";
      return decodedBody(result, options.maxOutputBytes);
    },
    readContactInfoJson: async (input) => {
      if (state !== "profile") {
        throw new Error("LinkedIn stats browser Contact-info read is out of order");
      }
      const profile = exactLinkedInUrl(input.profileUrl, "profile");
      const result = await run({
        kind: "json",
        maxBytes: Math.min(MAX_IDENTITY_BYTES, options.maxOutputBytes),
        path: buildLinkedInProfileContactInfoGraphqlPath({
          profileUrn: input.profileUrn,
          queryId: input.queryId
        }),
        referrer: profile.href
      });
      state = "complete";
      const text = decodedBody(result, Math.min(MAX_IDENTITY_BYTES, options.maxOutputBytes));
      try {
        return JSON.parse(text);
      } catch {
        throw new LinkedInProfileBrowserFailure("identity-json", "LinkedIn stats browser Contact-info response was not valid JSON");
      }
    },
    readOrganizationHtml: async (organizationUrl) => {
      if (state !== "identity") {
        throw new Error("LinkedIn stats browser organization read is out of order");
      }
      const target = exactLinkedInUrl(organizationUrl, "organization");
      const result = await run({
        kind: "html",
        maxBytes: options.maxOutputBytes,
        path: target.pathname,
        referrer: LINKEDIN_FEED_URL
      });
      state = "complete";
      return decodedBody(result, options.maxOutputBytes);
    },
    close: async () => {
      if (closed)
        return;
      closed = true;
      await finalizeBrowserSession(session);
    }
  });
}

// src/providers/linkedin-read-failure.ts
function linkedInProfileReadFailure(error) {
  let current = error;
  for (let depth = 0;depth < 8 && current instanceof Error; depth += 1) {
    if (current instanceof OperationDeadlineError)
      return readFailureProjection(current.failure === "timed-out" ? "operation-timeout" : "contract-drift");
    current = current.cause;
  }
  current = error;
  for (let depth = 0;depth < 8 && current instanceof Error; depth += 1) {
    if (current instanceof LinkedInProfileBrowserResponseRejectedError || current instanceof WebSessionResponseRejectedError) {
      const status = current.status;
      return readFailureProjection(status === 401 || status === 403 ? "auth-repair-required" : status === 429 ? "provider-throttled" : status === 302 || status === 408 || status >= 500 ? "provider-temporary" : "contract-drift");
    }
    if (current instanceof WebSessionAuthStateError)
      return readFailureProjection("auth-repair-required");
    if (current instanceof WebSessionReadTransportError)
      return readFailureProjection("provider-temporary");
    if (current instanceof LinkedInProfileBrowserFailure)
      return readFailureProjection(current.category === "authwall" || current.category === "session-cookie" ? "auth-repair-required" : current.category === "startup" || current.category === "execution-context" || current.category === "provider-fetch" ? "provider-temporary" : "contract-drift");
    current = current.cause;
  }
  return readFailureProjection("contract-drift");
}
function linkedInProfileIdentityAllowsBrowserFallback(cause) {
  return cause instanceof WebSessionResponseRejectedError && [302, 401, 403].includes(cause.status) && /^(?:missing|[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+)$/u.test(cause.contentType ?? "missing") && (cause.contentType ?? "missing").length <= 128;
}

// src/providers/linkedin-company-program.ts
function linkedInCompanyReadProgram(target, preferBrowser, diagnostic) {
  return Effect3.gen(function* () {
    const platform3 = yield* LinkedInCompanyPlatform;
    let requestStage = preferBrowser ? "contained-browser signed-in identity preflight" : "signed-in identity preflight";
    let identityMismatch = false;
    const report = (error) => {
      if (error.cause instanceof PreservedBrowserArtifactsError)
        return Effect3.fail(error);
      return Effect3.succeed({
        status: "failed",
        output: null,
        finalUrl: target.url,
        dispatchStarted: false,
        dispatch: { planned: 0, started: 0, verified: 0 },
        error: diagnostic(error.cause, requestStage),
        readFailure: identityMismatch ? readFailureProjection("account-mismatch") : linkedInProfileReadFailure(error.cause)
      });
    };
    const readBoundCompany = (identity2, browser, company) => Effect3.gen(function* () {
      yield* platform3.bindIdentity(identity2).pipe(Effect3.tapError(() => Effect3.sync(() => {
        identityMismatch = true;
      })));
      requestStage = browser ? "contained-browser public company page read" : "public company page read";
      const html = yield* company;
      requestStage = "exact company metric projection";
      const observedAt = yield* platform3.observedAt;
      const output = yield* readAttempt(() => projectLinkedInOrganizationStats({
        html,
        organizationUrl: target.url,
        observedAt
      }));
      return {
        status: "succeeded",
        output,
        finalUrl: target.url,
        dispatchStarted: false,
        dispatch: { planned: 0, started: 0, verified: 0 }
      };
    });
    const browserRead = () => {
      let closeFailed = false;
      return withReadResource(platform3.openBrowser, (browser) => platform3.browserIdentity(browser).pipe(Effect3.flatMap((identity2) => readBoundCompany(identity2, true, platform3.browserCompany(browser, target.url)))), (browser) => platform3.closeBrowser(browser).pipe(Effect3.tapError(() => Effect3.sync(() => {
        closeFailed = true;
      })))).pipe(Effect3.catchTag("ReadEffectFailure", (error) => closeFailed ? Effect3.fail(error) : report(error)));
    };
    if (preferBrowser)
      return yield* browserRead();
    const direct = yield* Effect3.either(platform3.openDirect);
    if (Either.isLeft(direct))
      return yield* report(direct.left);
    const identity = yield* Effect3.either(platform3.directIdentity(direct.right));
    if (Either.isLeft(identity)) {
      if (linkedInProfileIdentityAllowsBrowserFallback(identity.left.cause)) {
        requestStage = "contained-browser signed-in identity preflight";
        return yield* browserRead();
      }
      return yield* report(identity.left);
    }
    return yield* readBoundCompany(identity.right, false, platform3.directCompany(direct.right, target.url)).pipe(Effect3.catchTag("ReadEffectFailure", report));
  });
}

// src/providers/linkedin-profile-activity-platform.ts
import * as Context3 from "effect/Context";
import * as Effect4 from "effect/Effect";
import * as Layer3 from "effect/Layer";

// src/providers/linkedin-web-feed-browser.ts
import { createHash as createHash2 } from "crypto";
var LINKEDIN_ORIGIN2 = "https://www.linkedin.com";
var LINKEDIN_FEED_URL2 = `${LINKEDIN_ORIGIN2}/feed/`;
var LINKEDIN_PRE_COOKIE_REALM_URL2 = `${LINKEDIN_ORIGIN2}/robots.txt`;
var LINKEDIN_INITIAL_ROOT_BATCH2 = JSON.stringify([["open", LINKEDIN_ORIGIN2]]);
var LINKEDIN_INITIAL_BLANK_BATCH2 = JSON.stringify([["open", "about:blank"]]);
var LINKEDIN_INITIAL_REALM_BATCH2 = JSON.stringify([["open", LINKEDIN_PRE_COOKIE_REALM_URL2]]);
var MAX_IDENTITY_BYTES2 = 2 * 1024 * 1024;
var MAX_FEED_PAGE_BYTES = 8 * 1024 * 1024;
var BROWSER_ENVELOPE_BYTES2 = 64 * 1024;
var MAX_NETWORK_REQUESTS = 1e4;
var MAX_REQUEST_URL_CHARACTERS = 64 * 1024;
var feedBrowserManifest = Object.freeze({
  schemaVersion: 4,
  id: "linkedin-profile-activity-runtime",
  version: "1.0.0",
  displayName: "LinkedIn profile-activity runtime",
  surfaceId: "linkedin",
  origins: Object.freeze([LINKEDIN_ORIGIN2]),
  browserDomains: Object.freeze(["www.linkedin.com", "static.licdn.com"]),
  operations: Object.freeze({})
});
var LINKEDIN_RESPONSE_MEDIA_TYPE2 = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u;

class LinkedInFeedBrowserFailure extends Error {
  category;
  constructor(category, message) {
    super(message);
    this.name = "LinkedInFeedBrowserFailure";
    this.category = category;
  }
}

class LinkedInFeedBrowserResponseRejectedError extends LinkedInFeedBrowserFailure {
  status;
  contentType;
  constructor(status, contentType) {
    super("response-rejected", "LinkedIn profile-activity browser request returned a reviewed rejection");
    this.name = "LinkedInFeedBrowserResponseRejectedError";
    if (!Number.isSafeInteger(status) || status < 100 || status > 599 || contentType.length > 128 || contentType !== "" && !LINKEDIN_RESPONSE_MEDIA_TYPE2.test(contentType))
      throw new Error("LinkedIn profile-activity browser returned a malformed response category");
    this.status = status;
    this.contentType = contentType === "" ? "missing" : contentType;
  }
}
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys2(value, expected, label) {
  if (Object.keys(value).sort().join(",") !== [...expected].sort().join(",")) {
    throw new Error(`${label} returned an unexpected result shape`);
  }
}
function browserReadEvaluationSource2(binding) {
  const bound = jsonScriptLiteral(binding);
  return `(async()=>{const input=${bound};if(location.origin!=="${LINKEDIN_ORIGIN2}")throw new Error("unexpected LinkedIn origin");if(input.kind!=="json"||!Number.isSafeInteger(input.maxBytes)||input.maxBytes<1||input.maxBytes>${MAX_FEED_PAGE_BYTES}||(input.documentUrl!==null&&typeof input.documentUrl!=="string"))throw new Error("invalid LinkedIn profile-activity browser request binding");if(input.documentUrl!==null&&location.href!==input.documentUrl){if(location.origin==="${LINKEDIN_ORIGIN2}"&&/^/(?:authwall|checkpoint|login|uas/login(?:-submit)?)(?:/|$)/u.test(location.pathname))throw new Error("LinkedIn profile-activity browser reached its signed-out authwall");throw new Error("LinkedIn profile-activity browser left its bound document")}const expected=new URL(input.path,"${LINKEDIN_ORIGIN2}");if(expected.origin!=="${LINKEDIN_ORIGIN2}"||expected.username!==""||expected.password!==""||expected.hash!==""||expected.href!=="${LINKEDIN_ORIGIN2}"+input.path)throw new Error("invalid LinkedIn profile-activity browser path binding");if(expected.pathname!=="/voyager/api/me"&&expected.pathname!=="${LINKEDIN_GRAPHQL_PATH}")throw new Error("invalid LinkedIn profile-activity browser path binding");const headers={accept:"application/vnd.linkedin.normalized+json+2.1","x-li-lang":"en_US","x-requested-with":"XMLHttpRequest","x-restli-protocol-version":"2.0.0"};const raw=document.cookie.split("; ").find((part)=>part.startsWith("JSESSIONID="));if(typeof raw!=="string")throw new Error("missing LinkedIn browser CSRF cookie");const csrf=decodeURIComponent(raw.slice("JSESSIONID=".length)).replace(/^"|"$/g,"");if(!/^ajax:[A-Za-z0-9_-]{1,512}$/.test(csrf))throw new Error("invalid LinkedIn browser CSRF cookie");headers["csrf-token"]=csrf;const response=await fetch(input.path,{credentials:"include",headers,method:"GET",redirect:"manual",referrer:input.referrer});if(response.type==="opaqueredirect"){response.body?.cancel();return{authWall:true,bodyBase64:null,bodyBytes:0,bodySha256:null,contentType:"",status:0}}const responseUrl=new URL(response.url);if(responseUrl.origin!=="${LINKEDIN_ORIGIN2}"||responseUrl.username!==""||responseUrl.password!==""||responseUrl.hash!==""||responseUrl.href!==expected.href)throw new Error("LinkedIn profile-activity browser response escaped its exact route");if(response.status>=300&&response.status<=399){response.body?.cancel();return{authWall:true,bodyBase64:null,bodyBytes:0,bodySha256:null,contentType:"",status:response.status}}const contentType=(response.headers.get("content-type")||"").split(";",1)[0].trim().toLowerCase();if(response.status!==200||(contentType!=="application/vnd.linkedin.normalized+json+2.1"&&contentType!=="application/json")){response.body?.cancel();return{authWall:false,bodyBase64:null,bodyBytes:0,bodySha256:null,contentType,status:response.status}}if(response.body===null)throw new Error("LinkedIn profile-activity browser response omitted its body");const reader=response.body.getReader();const chunks=[];let bytes=0;while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>input.maxBytes){await reader.cancel();throw new Error("LinkedIn profile-activity browser response exceeded its reviewed byte bound")}chunks.push(part.value)}const body=new Uint8Array(bytes);let cursor=0;for(const chunk of chunks){body.set(chunk,cursor);cursor+=chunk.byteLength}const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",body)),(value)=>value.toString(16).padStart(2,"0")).join("");let binary="";for(let offset=0;offset<body.length;offset+=32768)binary+=String.fromCharCode(...body.subarray(offset,Math.min(offset+32768,body.length)));return{authWall:false,bodyBase64:btoa(binary),bodyBytes:body.byteLength,bodySha256:digest,contentType,status:response.status}})()`;
}
function encodedBodyBound2(bytes) {
  return Math.ceil(bytes / 3) * 4;
}
function decodedBody2(result, maximumBytes) {
  if (typeof result.bodyBase64 !== "string" || result.bodyBase64.length > encodedBodyBound2(maximumBytes) || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(result.bodyBase64) || !Number.isSafeInteger(result.bodyBytes) || result.bodyBytes < 0 || result.bodyBytes > maximumBytes || typeof result.bodySha256 !== "string" || !/^[a-f0-9]{64}$/u.test(result.bodySha256))
    throw new LinkedInFeedBrowserFailure("body-envelope", "LinkedIn profile-activity browser body envelope changed shape");
  const bytes = Buffer.from(result.bodyBase64, "base64");
  if (bytes.byteLength !== result.bodyBytes || bytes.toString("base64") !== result.bodyBase64 || createHash2("sha256").update(bytes).digest("hex") !== result.bodySha256)
    throw new LinkedInFeedBrowserFailure("body-envelope", "LinkedIn profile-activity browser body envelope failed integrity verification");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new LinkedInFeedBrowserFailure("body-envelope", "LinkedIn profile-activity browser body was not valid UTF-8");
  }
}
function browserEvaluationResult2(value) {
  const data = browserResultData(value);
  if (!isRecord3(data) || typeof data.origin !== "string" || !isRecord3(data.result)) {
    throw new LinkedInFeedBrowserFailure("response-envelope", "LinkedIn profile-activity browser returned a malformed evaluation envelope");
  }
  let origin;
  try {
    origin = new URL(data.origin);
  } catch {
    throw new LinkedInFeedBrowserFailure("response-envelope", "LinkedIn profile-activity browser returned a malformed evaluation envelope");
  }
  if (origin.origin !== LINKEDIN_ORIGIN2 || origin.username !== "" || origin.password !== "")
    throw new LinkedInFeedBrowserFailure("response-envelope", "LinkedIn profile-activity browser returned a malformed evaluation envelope");
  return data.result;
}
function hasNoDefaultExecutionContext2(error) {
  let current = error;
  for (let depth = 0;depth < 8 && current !== undefined; depth += 1) {
    if (current instanceof Error && /(?:cannot find|no) default execution context/iu.test(current.message))
      return true;
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}
function hasUnexpectedLinkedInOrigin2(error) {
  let current = error;
  for (let depth = 0;depth < 8 && current !== undefined; depth += 1) {
    if (current instanceof Error && /(?:^|: )unexpected LinkedIn origin(?:$|[\r\n])/u.test(current.message))
      return true;
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}
function classifiedBrowserCommandFailure2(error) {
  const message = error instanceof Error && error.message.length <= 1500 ? error.message : "";
  if (/(?:^|: )(?:missing|invalid) LinkedIn browser CSRF cookie$/u.test(message)) {
    return new LinkedInFeedBrowserFailure("session-cookie", "LinkedIn profile-activity browser could not establish its reviewed CSRF cookie");
  }
  if (message.includes("Failed to fetch")) {
    return new LinkedInFeedBrowserFailure("provider-fetch", "LinkedIn profile-activity browser could not complete its first-party fetch");
  }
  if (message.endsWith("LinkedIn profile-activity browser response escaped its exact route")) {
    return new LinkedInFeedBrowserFailure("response-envelope", "LinkedIn profile-activity browser response escaped its exact route");
  }
  if (message.endsWith("LinkedIn profile-activity browser left its bound document")) {
    return new LinkedInFeedBrowserFailure("response-envelope", "LinkedIn profile-activity browser left its exact target page");
  }
  if (message.endsWith("LinkedIn profile-activity browser reached its signed-out authwall")) {
    return new LinkedInFeedBrowserFailure("authwall", "LinkedIn profile-activity browser reached the signed-out authwall");
  }
  if (message.includes("process output exceeded") || message.includes("response exceeded its reviewed byte bound")) {
    return new LinkedInFeedBrowserFailure("output-bound", "LinkedIn profile-activity browser exceeded a reviewed output bound");
  }
  if (message.includes("malformed batch") || message.includes("malformed batch entry") || message.includes("did not return JSON") || message.includes("command omitted its result")) {
    return new LinkedInFeedBrowserFailure("browser-envelope", "LinkedIn profile-activity browser command returned a malformed envelope");
  }
  return new LinkedInFeedBrowserFailure("browser-command", "LinkedIn profile-activity browser command failed before a reviewed response");
}
function contextSettlementRejected2(result) {
  return result.exitCode !== 0 && /Failed to install browser network controls:[^\r\n]{0,256}Cannot find default execution context/u.test(`${result.stderr}
${result.stdout}`);
}
function commandWasAborted2(options) {
  return options.signal?.aborted === true;
}
function linkedInFeedBrowserCommandRunner(execute, settleContext, authKind) {
  let initialBatchPending = true;
  return async (command, options) => {
    const rewroteInitialRoot = initialBatchPending && options.stdin === LINKEDIN_INITIAL_ROOT_BATCH2;
    const rewroteInitialBlank = initialBatchPending && authKind === "browser-profile" && options.stdin === LINKEDIN_INITIAL_BLANK_BATCH2;
    const executionOptions = rewroteInitialRoot || rewroteInitialBlank ? { ...options, stdin: LINKEDIN_INITIAL_REALM_BATCH2 } : options;
    initialBatchPending = false;
    const first = await execute(command, executionOptions);
    if (!rewroteInitialRoot || authKind === "browser-profile" || !contextSettlementRejected2(first) || commandWasAborted2(executionOptions))
      return first;
    await settleContext();
    if (commandWasAborted2(executionOptions))
      return first;
    return execute(command, executionOptions);
  };
}
function settleLinkedInBrowserContext2() {
  return new Promise((resolve) => {
    setTimeout(resolve, 500);
  });
}
async function finalizeBrowserSession2(session) {
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
  if (closeVerified && cleanupVerified)
    return;
  const cleanupEvidence = closeVerified && !cleanupVerified && session.cleanupResourceIdentity !== undefined ? Object.freeze({
    kind: "agent-browser-closed-artifacts-v1",
    resource: session.cleanupResourceIdentity
  }) : undefined;
  throw new PreservedBrowserArtifactsError("LinkedIn profile-activity browser finalization failed; private artifacts were preserved", session.recoveryHandle ?? "session=linkedin-profile-activity-runtime;artifacts=unknown", new AggregateError(failures, "LinkedIn profile-activity browser finalization failed"), cleanupEvidence);
}
function observedRequests(value) {
  if (!isRecord3(value) || !Array.isArray(value.requests) || value.requests.length > MAX_NETWORK_REQUESTS) {
    throw new LinkedInFeedBrowserFailure("browser-envelope", "LinkedIn profile-activity network observation returned a malformed bounded request list");
  }
  const requests = [];
  for (const item of value.requests) {
    if (!isRecord3(item) || typeof item.requestId !== "string" || item.requestId.length < 1 || item.requestId.length > 512 || /[\0\r\n]/u.test(item.requestId)) {
      throw new LinkedInFeedBrowserFailure("browser-envelope", "LinkedIn profile-activity network observation returned a malformed request");
    }
    requests.push(Object.freeze({
      requestId: item.requestId,
      method: item.method,
      status: item.status,
      url: item.url
    }));
  }
  return requests;
}
function observedRequestIds(requests) {
  const ids = new Set;
  for (const request of requests) {
    if (ids.has(request.requestId)) {
      throw new LinkedInFeedBrowserFailure("browser-envelope", "LinkedIn profile-activity network observation returned duplicate request identities");
    }
    ids.add(request.requestId);
  }
  return ids;
}
function currentProfileActivityUrl(value, expected) {
  if (!isRecord3(value) || typeof value.url !== "string" || value.url.length > 2048) {
    throw new LinkedInFeedBrowserFailure("browser-envelope", "LinkedIn profile-activity browser omitted its current URL");
  }
  let current;
  try {
    current = new URL(value.url);
  } catch {
    throw new LinkedInFeedBrowserFailure("browser-envelope", "LinkedIn profile-activity browser returned a malformed current URL");
  }
  if (current.origin === LINKEDIN_ORIGIN2 && /^\/(?:authwall|checkpoint|login|uas\/login(?:-submit)?)(?:\/|$)/u.test(current.pathname)) {
    throw new LinkedInFeedBrowserFailure("authwall", "LinkedIn profile-activity browser reached the signed-out authwall");
  }
  if (current.username !== "" || current.password !== "" || current.hash !== "" || current.href !== expected)
    throw new LinkedInFeedBrowserFailure("response-envelope", "LinkedIn profile-activity browser left its exact target page");
}
async function createLinkedInFeedBrowserTransport(auth, options) {
  if (!Number.isSafeInteger(options.maxOutputBytes) || options.maxOutputBytes < 1 || options.maxOutputBytes > MAX_FEED_PAGE_BYTES)
    throw new Error("LinkedIn profile-activity browser output bound is invalid");
  const createSession = options.dependencies?.createBrowserSession ?? createBrowserSession;
  const browserOutputBytes = encodedBodyBound2(options.maxOutputBytes) + BROWSER_ENVELOPE_BYTES2;
  const sessionOptions = {
    allowCodeOwnedEvaluation: true,
    allowCodeOwnedNetworkObservation: true,
    headed: true,
    maxOutputBytes: browserOutputBytes,
    timeoutMs: options.timeoutMs,
    dependencies: {
      runCommand: linkedInFeedBrowserCommandRunner(options.dependencies?.runCommand ?? runCommand, options.dependencies?.settleContext ?? settleLinkedInBrowserContext2, auth.kind)
    },
    ...options.operationDeadline === undefined ? {} : { operationDeadline: options.operationDeadline },
    ...options.publishCleanupResource === undefined ? {} : { publishCleanupResource: options.publishCleanupResource }
  };
  let session;
  try {
    session = await createSession(feedBrowserManifest, auth, sessionOptions);
  } catch (error) {
    if (error instanceof PreservedBrowserArtifactsError)
      throw error;
    options.operationDeadline?.throwIfUnavailable("LinkedIn profile-activity browser startup");
    throw new LinkedInFeedBrowserFailure("startup", "LinkedIn profile-activity browser could not start its contained session");
  }
  let closed = false;
  let state = "ready";
  let boundPage = null;
  const remainingTimeMs = () => options.operationDeadline?.remainingTimeMs() ?? options.timeoutMs;
  const observeProfileActivityRequests = async () => {
    const entries = await session.runBatch([["network", "requests", "--filter", LINKEDIN_PROFILE_ACTIVITY_QUERY_PREFIX]], Math.min(remainingTimeMs(), 30000), 8 * 1024 * 1024);
    const first = entries[0];
    if (first === undefined) {
      throw new LinkedInFeedBrowserFailure("browser-envelope", "LinkedIn profile-activity browser omitted its network observation");
    }
    return observedRequests(browserResultData(first));
  };
  const run = async (binding) => {
    if (closed)
      throw new Error("LinkedIn profile-activity browser transport is closed");
    const source = browserReadEvaluationSource2(binding);
    let records;
    try {
      records = await session.runBatch([["eval", source]], remainingTimeMs(), Math.min(encodedBodyBound2(binding.maxBytes) + BROWSER_ENVELOPE_BYTES2, browserOutputBytes));
    } catch (error) {
      if (error instanceof PreservedBrowserArtifactsError)
        throw error;
      if (error instanceof LinkedInFeedBrowserFailure)
        throw error;
      options.operationDeadline?.throwIfUnavailable("LinkedIn profile-activity browser operation");
      if (hasNoDefaultExecutionContext2(error)) {
        throw new LinkedInFeedBrowserFailure("execution-context", "LinkedIn profile-activity browser lost its reviewed execution context");
      }
      if (hasUnexpectedLinkedInOrigin2(error)) {
        throw new LinkedInFeedBrowserFailure("bootstrap", "LinkedIn profile-activity browser was not on its reviewed signed-in origin");
      }
      throw classifiedBrowserCommandFailure2(error);
    }
    const first = records[0];
    if (first === undefined) {
      throw new LinkedInFeedBrowserFailure("response-envelope", "LinkedIn profile-activity browser omitted its response");
    }
    const result = browserEvaluationResult2(first);
    try {
      exactKeys2(result, [
        "authWall",
        "bodyBase64",
        "bodyBytes",
        "bodySha256",
        "contentType",
        "status"
      ], "LinkedIn profile-activity browser request");
    } catch {
      throw new LinkedInFeedBrowserFailure("response-envelope", "LinkedIn profile-activity browser request returned an unexpected result shape");
    }
    if (typeof result.authWall !== "boolean" || typeof result.status !== "number" || !Number.isSafeInteger(result.status) || typeof result.contentType !== "string" || result.contentType.length > 128 || result.contentType !== "" && !LINKEDIN_RESPONSE_MEDIA_TYPE2.test(result.contentType))
      throw new LinkedInFeedBrowserFailure("response-envelope", "LinkedIn profile-activity browser returned a malformed response category");
    if (result.authWall) {
      if (!(result.status === 0 || result.status >= 300 && result.status <= 399) || result.contentType !== "" || result.bodyBase64 !== null || result.bodyBytes !== 0 || result.bodySha256 !== null)
        throw new LinkedInFeedBrowserFailure("response-envelope", "LinkedIn profile-activity browser returned a malformed authwall envelope");
      throw new LinkedInFeedBrowserFailure("authwall", "LinkedIn profile-activity browser reached the signed-out authwall");
    }
    if (result.status < 100 || result.status > 599) {
      throw new LinkedInFeedBrowserFailure("response-envelope", "LinkedIn profile-activity browser returned a malformed response category");
    }
    if (result.status >= 300 && result.status <= 399) {
      throw new LinkedInFeedBrowserFailure("response-envelope", "LinkedIn profile-activity browser returned a malformed redirect envelope");
    }
    if (result.status === 401 || result.status === 403) {
      if (result.bodyBase64 !== null || result.bodyBytes !== 0 || result.bodySha256 !== null)
        throw new LinkedInFeedBrowserFailure("response-envelope", "LinkedIn profile-activity browser returned a malformed rejection envelope");
      throw new LinkedInFeedBrowserFailure("authwall", "LinkedIn profile-activity browser reached the signed-out authwall");
    }
    if (result.status !== 200 || result.contentType !== "application/vnd.linkedin.normalized+json+2.1" && result.contentType !== "application/json") {
      if (result.bodyBase64 !== null || result.bodyBytes !== 0 || result.bodySha256 !== null)
        throw new LinkedInFeedBrowserFailure("response-envelope", "LinkedIn profile-activity browser returned a malformed rejection envelope");
      throw new LinkedInFeedBrowserResponseRejectedError(result.status, result.contentType);
    }
    return result;
  };
  const parseJsonBody = (result, maximumBytes, label) => {
    const text = decodedBody2(result, maximumBytes);
    try {
      return JSON.parse(text);
    } catch {
      throw new LinkedInFeedBrowserFailure("identity-json", `${label} was not valid JSON`);
    }
  };
  return Object.freeze({
    currentIdentityResponse: async () => {
      if (state !== "ready") {
        throw new Error("LinkedIn profile-activity browser identity read is out of order");
      }
      const result = await run({
        documentUrl: null,
        kind: "json",
        maxBytes: Math.min(MAX_IDENTITY_BYTES2, options.maxOutputBytes),
        path: "/voyager/api/me",
        referrer: LINKEDIN_FEED_URL2
      });
      state = "identity";
      return parseJsonBody(result, Math.min(MAX_IDENTITY_BYTES2, options.maxOutputBytes), "LinkedIn profile-activity browser identity response");
    },
    resolveProfileActivityBinding: async (vanity) => {
      if (state !== "identity") {
        throw new Error("LinkedIn profile-activity browser query observation is out of order");
      }
      const target = linkedInProfileActivityTargetFromVanity(vanity);
      try {
        const baselineRequestIds = observedRequestIds(await observeProfileActivityRequests());
        await session.runBatch([["open", target.activityUrl]], remainingTimeMs(), 2 * 1024 * 1024);
        await session.runBatch([["wait", "8000"]], Math.min(remainingTimeMs(), 20000), 1024 * 1024);
        const requests = await observeProfileActivityRequests();
        observedRequestIds(requests);
        const currentUrlEntries = await session.runBatch([["get", "url"]], Math.min(remainingTimeMs(), 1e4), 1024 * 1024);
        const currentUrl = currentUrlEntries[0];
        if (currentUrl === undefined) {
          throw new LinkedInFeedBrowserFailure("browser-envelope", "LinkedIn profile-activity browser omitted its current URL");
        }
        currentProfileActivityUrl(browserResultData(currentUrl), target.activityUrl);
        const bounded = requests.flatMap((request) => {
          if (baselineRequestIds.has(request.requestId))
            return [];
          if (typeof request.url !== "string" || request.url.length > MAX_REQUEST_URL_CHARACTERS) {
            return [];
          }
          return [{
            method: request.method,
            status: request.status,
            url: request.url
          }];
        });
        const binding = resolveLinkedInProfileActivityBinding(bounded);
        boundPage = Object.freeze({
          binding,
          targetUrl: target.activityUrl,
          vanity: target.slug
        });
        state = "bound";
        return binding;
      } catch (error) {
        if (error instanceof PreservedBrowserArtifactsError)
          throw error;
        if (error instanceof LinkedInFeedBrowserFailure)
          throw error;
        options.operationDeadline?.throwIfUnavailable("LinkedIn profile-activity query observation");
        throw new LinkedInFeedBrowserFailure("browser-command", "LinkedIn current registered query was not observed");
      }
    },
    readProfileActivityPage: async (input) => {
      if (state !== "bound" || boundPage === null) {
        throw new Error("LinkedIn profile-activity browser page read is out of order");
      }
      const request = {
        queryId: boundPage.binding.queryId,
        profileUrn: boundPage.binding.profileUrn,
        count: input.count,
        start: input.start
      };
      const url = linkedInProfileActivityPageUrl(request);
      assertLinkedInProfileActivityRequest({ method: "GET", url }, request);
      const path = `${url.pathname}${url.search}`;
      const result = await run({
        documentUrl: boundPage.targetUrl,
        kind: "json",
        maxBytes: options.maxOutputBytes,
        path,
        referrer: boundPage.targetUrl
      });
      state = "bound";
      return parseJsonBody(result, options.maxOutputBytes, "LinkedIn profile-activity browser page response");
    },
    close: async () => {
      if (closed)
        return;
      closed = true;
      await finalizeBrowserSession2(session);
    }
  });
}

// src/providers/linkedin-profile-activity-failure.ts
class LinkedInProfileActivityIdentityMismatch extends Error {
  constructor(cause) {
    super("LinkedIn current member no longer matches the bound auth subject", { cause });
    this.name = "LinkedInProfileActivityIdentityMismatch";
  }
}
function linkedInProfileActivityReadFailure(error, stage) {
  let deadlineCause = error;
  for (let depth = 0;depth < 8 && deadlineCause !== undefined; depth += 1) {
    if (deadlineCause instanceof OperationDeadlineError) {
      return readFailureProjection(deadlineCause.failure === "timed-out" ? "operation-timeout" : "contract-drift");
    }
    deadlineCause = deadlineCause instanceof Error ? deadlineCause.cause : undefined;
  }
  let current = error;
  for (let depth = 0;depth < 8 && current !== undefined; depth += 1) {
    if (current instanceof LinkedInProfileActivityIdentityMismatch)
      return readFailureProjection("account-mismatch");
    if (current instanceof LinkedInFeedBrowserResponseRejectedError) {
      if (current.status === 401 || current.status === 403)
        return readFailureProjection("auth-repair-required");
      if (current.status === 429)
        return readFailureProjection("provider-throttled");
      if (current.status === 302 || current.status === 408 || current.status >= 500)
        return readFailureProjection("provider-temporary");
      if (current.status === 404 && stage !== "identity")
        return readFailureProjection("target-unavailable");
      return readFailureProjection("contract-drift");
    }
    if (current instanceof LinkedInFeedBrowserFailure) {
      if (current.category === "authwall" || current.category === "session-cookie")
        return readFailureProjection("auth-repair-required");
      if (current.category === "startup" || current.category === "execution-context" || current.category === "provider-fetch") {
        return readFailureProjection("provider-temporary");
      }
      return readFailureProjection("contract-drift");
    }
    current = current instanceof Error ? current.cause : undefined;
  }
  return readFailureProjection("contract-drift");
}
var REQUEST_STAGE = {
  identity: "contained-browser signed-in identity preflight",
  binding: "contained-browser profile-activity query observation",
  page: "contained-browser profile-activity page read",
  projection: "exact profile-activity projection"
};
function linkedInProfileActivityDiagnostic(error, stage) {
  let category = stage === "binding" ? "live query observation" : stage === "projection" ? "exact page projection" : "reviewed response projection";
  let current = error;
  for (let depth = 0;depth < 8 && current !== undefined; depth += 1) {
    if (current instanceof LinkedInProfileActivityIdentityMismatch) {
      category = "signed-in account binding";
      break;
    }
    if (current instanceof LinkedInFeedBrowserFailure) {
      if (current.category === "authwall")
        category = "signed-out authwall";
      if (current.category === "session-cookie")
        category = "signed-in session cookie";
      break;
    }
    current = current instanceof Error ? current.cause : undefined;
  }
  return `LinkedIn profile-activity read failed during ${REQUEST_STAGE[stage]} at ${category}; no remote write occurred`;
}

// src/providers/linkedin-profile-activity-platform.ts
function platform3(ports) {
  return {
    openBrowser: readNative(ports.openBrowser).pipe(Effect4.uninterruptible),
    identity: (browser) => readNative(() => browser.currentIdentityResponse()).pipe(Effect4.uninterruptible, Effect4.flatMap((value) => readAttempt(() => ports.decodeIdentity(value)))),
    bindIdentity: (identity) => readAttempt(() => ports.bindIdentity(identity)).pipe(Effect4.mapError((error) => new ReadEffectFailure({ cause: new LinkedInProfileActivityIdentityMismatch(error.cause) }))),
    binding: (browser, slug) => readNative(() => browser.resolveProfileActivityBinding(slug)).pipe(Effect4.uninterruptible),
    page: (browser, count, start) => readNative(() => browser.readProfileActivityPage({ count, start })).pipe(Effect4.uninterruptible),
    observedAt: readAttempt(ports.observedAt),
    closeBrowser: (browser) => readNative(() => browser.close()).pipe(Effect4.uninterruptible)
  };
}

class LinkedInProfileActivityPlatform extends Context3.Tag("wrench/LinkedInProfileActivityPlatform/v1")() {
}
var LinkedInProfileActivityPlatformLive = (ports) => Layer3.succeed(LinkedInProfileActivityPlatform, platform3(ports));

// src/providers/linkedin-profile-activity-program.ts
import * as Effect5 from "effect/Effect";
function linkedInProfileActivityReadProgram(target, start, limit) {
  return Effect5.gen(function* () {
    const platform4 = yield* LinkedInProfileActivityPlatform;
    let stage = "identity";
    let closeFailed = false;
    return yield* withReadResource(platform4.openBrowser, (browser) => Effect5.gen(function* () {
      const identity = yield* platform4.identity(browser);
      yield* platform4.bindIdentity(identity);
      stage = "binding";
      const binding = yield* platform4.binding(browser, target.slug);
      stage = "page";
      const response = yield* platform4.page(browser, limit, start);
      stage = "projection";
      const observedAt = yield* platform4.observedAt;
      const output = yield* readAttempt(() => projectLinkedInProfileActivityPage({
        response,
        target,
        profileUrn: binding.profileUrn,
        queryId: binding.queryId,
        limit,
        start,
        observedAt
      }));
      return {
        status: "succeeded",
        output,
        finalUrl: target.activityUrl,
        dispatchStarted: false,
        dispatch: { planned: 0, started: 0, verified: 0 }
      };
    }), (browser) => platform4.closeBrowser(browser).pipe(Effect5.tapError(() => Effect5.sync(() => {
      closeFailed = true;
    })))).pipe(Effect5.catchTag("ReadEffectFailure", (error) => {
      if (closeFailed || error.cause instanceof PreservedBrowserArtifactsError)
        return Effect5.fail(error);
      return Effect5.succeed({
        status: "failed",
        output: null,
        finalUrl: target.activityUrl,
        dispatchStarted: false,
        dispatch: { planned: 0, started: 0, verified: 0 },
        error: linkedInProfileActivityDiagnostic(error.cause, stage),
        readFailure: linkedInProfileActivityReadFailure(error.cause, stage)
      });
    }));
  });
}

// src/providers/linkedin-contact-platform.ts
import * as Context4 from "effect/Context";
import * as Effect6 from "effect/Effect";
import * as Layer4 from "effect/Layer";

// src/providers/linkedin-contact-failure.ts
class LinkedInContactIdentityMismatch extends Error {
  constructor(cause) {
    super("LinkedIn current member no longer matches the bound auth subject", { cause });
    this.name = "LinkedInContactIdentityMismatch";
  }
}
function linkedInContactReadFailure(error, stage) {
  let deadlineCause = error;
  for (let depth = 0;depth < 8 && deadlineCause !== undefined; depth += 1) {
    if (deadlineCause instanceof OperationDeadlineError) {
      return readFailureProjection(deadlineCause.failure === "timed-out" ? "operation-timeout" : "contract-drift");
    }
    deadlineCause = deadlineCause instanceof Error ? deadlineCause.cause : undefined;
  }
  let current = error;
  for (let depth = 0;depth < 8 && current !== undefined; depth += 1) {
    if (current instanceof LinkedInContactIdentityMismatch)
      return readFailureProjection("account-mismatch");
    if (current instanceof LinkedInProfileBrowserResponseRejectedError) {
      if (current.status === 401 || current.status === 403)
        return readFailureProjection("auth-repair-required");
      if (current.status === 429)
        return readFailureProjection("provider-throttled");
      if (current.status === 302 || current.status === 408 || current.status >= 500) {
        return readFailureProjection("provider-temporary");
      }
      if (current.status === 404 && stage !== "identity")
        return readFailureProjection("target-unavailable");
      return readFailureProjection("contract-drift");
    }
    if (current instanceof LinkedInProfileBrowserFailure) {
      if (current.category === "authwall" || current.category === "session-cookie") {
        return readFailureProjection("auth-repair-required");
      }
      if (current.category === "startup" || current.category === "execution-context" || current.category === "provider-fetch") {
        return readFailureProjection("provider-temporary");
      }
      return readFailureProjection("contract-drift");
    }
    current = current instanceof Error ? current.cause : undefined;
  }
  return readFailureProjection("contract-drift");
}
var REQUEST_STAGE2 = {
  identity: "contained-browser signed-in identity preflight",
  profile: "contained-browser 1st-degree profile binding",
  contact: "contained-browser Contact-info read",
  projection: "exact Contact-info projection"
};
function linkedInContactDiagnostic(error, stage) {
  let category = stage === "profile" ? "1st-degree relationship binding" : stage === "projection" ? "exact Contact-info projection" : "reviewed response projection";
  let current = error;
  for (let depth = 0;depth < 8 && current !== undefined; depth += 1) {
    if (current instanceof LinkedInContactIdentityMismatch) {
      category = "signed-in account binding";
      break;
    }
    if (current instanceof LinkedInProfileBrowserFailure) {
      if (current.category === "authwall")
        category = "signed-out authwall";
      if (current.category === "session-cookie")
        category = "signed-in session cookie";
      break;
    }
    current = current instanceof Error ? current.cause : undefined;
  }
  return `LinkedIn contacts.read failed during ${REQUEST_STAGE2[stage]} at ${category}; no remote write occurred`;
}

// src/providers/linkedin-contact-platform.ts
function platform4(ports) {
  return {
    openBrowser: readNative(ports.openBrowser).pipe(Effect6.uninterruptible),
    identity: (browser) => readNative(() => browser.currentIdentityResponse()).pipe(Effect6.uninterruptible, Effect6.flatMap((value) => readAttempt(() => ports.decodeIdentity(value)))),
    bindIdentity: (identity) => readAttempt(() => ports.bindIdentity(identity)).pipe(Effect6.mapError((error) => new ReadEffectFailure({ cause: new LinkedInContactIdentityMismatch(error.cause) }))),
    profileHtml: (browser, profileUrl) => readNative(() => browser.readProfileHtml(profileUrl)).pipe(Effect6.uninterruptible),
    contactPayload: (browser, input) => readNative(() => browser.readContactInfoJson(input)).pipe(Effect6.uninterruptible),
    observedAt: readAttempt(ports.observedAt),
    closeBrowser: (browser) => readNative(() => browser.close()).pipe(Effect6.uninterruptible)
  };
}

class LinkedInContactPlatform extends Context4.Tag("wrench/LinkedInContactPlatform/v1")() {
}
var LinkedInContactPlatformLive = (ports) => Layer4.succeed(LinkedInContactPlatform, platform4(ports));

// src/providers/linkedin-contact-program.ts
import * as Effect7 from "effect/Effect";
function linkedInContactReadProgram(target) {
  return Effect7.gen(function* () {
    const platform5 = yield* LinkedInContactPlatform;
    let stage = "identity";
    let closeFailed = false;
    return yield* withReadResource(platform5.openBrowser, (browser) => Effect7.gen(function* () {
      const identity = yield* platform5.identity(browser);
      yield* platform5.bindIdentity(identity);
      stage = "profile";
      const profileHtml = yield* platform5.profileHtml(browser, target.url);
      const binding = yield* readAttempt(() => projectLinkedInProfileContactBinding({
        profileHtml,
        profileUrl: target.url,
        expectedViewerSubject: identity.subject
      }));
      const embedded = yield* readAttempt(() => projectLinkedInEmbeddedContactFields(profileHtml, binding.vanity));
      let contactPayload;
      if (embedded !== undefined && embedded.email !== null) {
        contactPayload = Object.freeze({
          emailAddress: embedded.email,
          connectedAt: embedded.connectedSince,
          phoneNumbers: embedded.phones,
          websites: embedded.websites,
          birthDateOn: embedded.birthday,
          profileUrl: embedded.profileUrl
        });
      } else {
        stage = "contact";
        const queryId = resolveLinkedInProfileContactInfoQueryId(profileHtml);
        contactPayload = yield* platform5.contactPayload(browser, {
          profileUrl: target.url,
          profileUrn: binding.profileUrn,
          ...queryId === undefined ? {} : { queryId }
        });
      }
      stage = "projection";
      const observedAt = yield* platform5.observedAt;
      const output = yield* readAttempt(() => projectLinkedInContactInfo({
        profileHtml,
        contactPayload,
        profileUrl: target.url,
        expectedViewerSubject: identity.subject,
        observedAt
      }));
      return {
        status: "succeeded",
        output,
        finalUrl: target.url,
        dispatchStarted: false,
        dispatch: { planned: 0, started: 0, verified: 0 }
      };
    }), (browser) => platform5.closeBrowser(browser).pipe(Effect7.tapError(() => Effect7.sync(() => {
      closeFailed = true;
    })))).pipe(Effect7.catchTag("ReadEffectFailure", (error) => {
      if (closeFailed || error.cause instanceof PreservedBrowserArtifactsError)
        return Effect7.fail(error);
      return Effect7.succeed({
        status: "failed",
        output: null,
        finalUrl: target.url,
        dispatchStarted: false,
        dispatch: { planned: 0, started: 0, verified: 0 },
        error: linkedInContactDiagnostic(error.cause, stage),
        readFailure: linkedInContactReadFailure(error.cause, stage)
      });
    }));
  });
}

// src/providers/linkedin-self-program.ts
import * as Effect8 from "effect/Effect";
import * as Either2 from "effect/Either";
function linkedInSelfReadProgram(target, includeConnections, preferBrowser, diagnostic) {
  return Effect8.gen(function* () {
    const platform5 = yield* LinkedInSelfPlatform;
    let requestStage = preferBrowser ? "contained-browser signed-in identity preflight" : "signed-in identity preflight";
    let identityMismatch = false;
    const report = (error) => {
      if (error.cause instanceof PreservedBrowserArtifactsError)
        return Effect8.fail(error);
      return Effect8.succeed({
        status: "failed",
        output: null,
        finalUrl: target.url,
        dispatchStarted: false,
        dispatch: { planned: 0, started: 0, verified: 0 },
        error: diagnostic(error.cause, requestStage),
        readFailure: identityMismatch ? readFailureProjection("account-mismatch") : linkedInProfileReadFailure(error.cause)
      });
    };
    const readBoundProfile = (identity2, browser, profile, connections) => Effect8.gen(function* () {
      const subject = yield* platform5.bindIdentity(identity2).pipe(Effect8.tapError(() => Effect8.sync(() => {
        identityMismatch = true;
      })));
      yield* readAttempt(() => {
        if (identity2.publicIdentifier === null)
          throw new Error("LinkedIn current member omitted its bound public profile identifier");
        if (identity2.publicIdentifier !== target.slug) {
          identityMismatch = true;
          throw new Error("LinkedIn current member public profile identifier does not match the requested profile URL");
        }
      });
      requestStage = browser ? "contained-browser public self-profile page read" : "public self-profile page read";
      const profileHtml = yield* profile;
      let connectionsHtml = null;
      if (includeConnections) {
        requestStage = browser ? "contained-browser private My Network connections page read" : "private My Network connections page read";
        connectionsHtml = yield* connections;
      }
      requestStage = "exact metric projection";
      const observedAt = yield* platform5.observedAt;
      const output = yield* readAttempt(() => projectLinkedInPersonalProfileStats({
        profileHtml,
        connectionsHtml,
        profileUrl: target.url,
        expectedSubject: subject,
        expectedPublicIdentifier: identity2.publicIdentifier,
        observedAt
      }));
      return {
        status: "succeeded",
        output,
        finalUrl: target.url,
        dispatchStarted: false,
        dispatch: { planned: 0, started: 0, verified: 0 }
      };
    });
    const browserRead = () => {
      let closeFailed = false;
      return withReadResource(platform5.openBrowser, (browser) => platform5.browserIdentity(browser).pipe(Effect8.flatMap((identity2) => readBoundProfile(identity2, true, platform5.browserProfile(browser, target.url), platform5.browserConnections(browser, target.url)))), (browser) => platform5.closeBrowser(browser).pipe(Effect8.tapError(() => Effect8.sync(() => {
        closeFailed = true;
      })))).pipe(Effect8.catchTag("ReadEffectFailure", (error) => closeFailed ? Effect8.fail(error) : report(error)));
    };
    if (preferBrowser)
      return yield* browserRead();
    const direct = yield* Effect8.either(platform5.openDirect);
    if (Either2.isLeft(direct))
      return yield* report(direct.left);
    const identity = yield* Effect8.either(platform5.directIdentity(direct.right));
    if (Either2.isLeft(identity)) {
      const cause = identity.left.cause;
      if (linkedInProfileIdentityAllowsBrowserFallback(cause)) {
        requestStage = "contained-browser signed-in identity preflight";
        return yield* browserRead();
      }
      return yield* report(identity.left);
    }
    return yield* readBoundProfile(identity.right, false, platform5.directProfile(direct.right, target.url), platform5.directConnections(direct.right, target.url)).pipe(Effect8.catchTag("ReadEffectFailure", report));
  });
}

// src/providers/linkedin-web-runtime.ts
import { constants } from "fs";
import { open } from "fs/promises";
import {
  filterCookies
} from "@hraness/kb/clip/cookies";

// src/providers/linkedin-web-bootstrap.ts
var LINKEDIN_ORIGIN3 = "https://www.linkedin.com";
var MAX_NETWORK_REQUESTS2 = 1e4;
var MAX_REQUEST_URL_CHARACTERS2 = 64 * 1024;
var bootstrapManifest = Object.freeze({
  schemaVersion: 4,
  id: "linkedin-query-bootstrap",
  version: "1.0.0",
  displayName: "LinkedIn registered-query bootstrap",
  surfaceId: "linkedin",
  origins: Object.freeze([LINKEDIN_ORIGIN3]),
  browserDomains: Object.freeze(["www.linkedin.com", "static.licdn.com"]),
  operations: Object.freeze({})
});
function isRecord4(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function record(value) {
  return isRecord4(value) ? value : null;
}
function observedRequests2(value) {
  const envelope = record(value);
  if (envelope === null || !Array.isArray(envelope.requests) || envelope.requests.length > MAX_NETWORK_REQUESTS2) {
    throw new Error("LinkedIn network observation returned a malformed bounded request list");
  }
  const requests = [];
  for (const item of envelope.requests) {
    const request = record(item);
    if (request === null)
      throw new Error("LinkedIn network observation returned a malformed request");
    requests.push(request);
  }
  return requests;
}
function queryCandidates(value, expectedMailboxUrn) {
  const candidates = [];
  for (const request of observedRequests2(value)) {
    if (request.method !== "GET" || request.status !== 200 || typeof request.url !== "string" || request.url.length > MAX_REQUEST_URL_CHARACTERS2)
      continue;
    let reviewed;
    try {
      reviewed = assertLinkedInMessengerConversationsRequest({
        method: request.method,
        url: request.url
      }, expectedMailboxUrn);
    } catch {
      continue;
    }
    const queryId = reviewed.searchParams.get("queryId");
    if (queryId !== null)
      candidates.push(queryId);
  }
  return Object.freeze(candidates);
}
async function resolveLinkedInMessengerConversationsQueryId(auth, expectedMailboxUrn, options = {}) {
  const timeoutMs = options.timeoutMs ?? 60000;
  const createSession = options.dependencies?.createSession ?? createBrowserSession;
  const session = await createSession(bootstrapManifest, auth, {
    headed: false,
    timeoutMs,
    maxOutputBytes: 8 * 1024 * 1024,
    allowCodeOwnedNetworkObservation: true
  });
  let operationError;
  let queryId;
  try {
    await session.runBatch([["open", `${LINKEDIN_ORIGIN3}/feed/`]], timeoutMs, 2 * 1024 * 1024);
    await session.runBatch([["wait", "8000"]], Math.min(timeoutMs, 20000), 1024 * 1024);
    const entries = await session.runBatch([["network", "requests", "--filter", LINKEDIN_MESSENGER_CONVERSATIONS_QUERY_PREFIX]], Math.min(timeoutMs, 30000), 8 * 1024 * 1024);
    const result = entries[0];
    if (result === undefined)
      throw new Error("LinkedIn network observation omitted its result");
    const candidates = queryCandidates(browserResultData(result), expectedMailboxUrn);
    queryId = resolveLinkedInRegisteredQueryId(LINKEDIN_MESSENGER_CONVERSATIONS_QUERY_PREFIX, candidates);
  } catch (error) {
    operationError = error;
  }
  let cleanupError;
  try {
    await session.close();
    await session.cleanup();
  } catch (error) {
    cleanupError = error;
  }
  if (cleanupError !== undefined) {
    throw new Error("LinkedIn registered-query bootstrap failed and private browser cleanup could not be verified", { cause: cleanupError });
  }
  if (operationError !== undefined) {
    throw new Error("LinkedIn current registered query was not observed", { cause: operationError });
  }
  if (queryId !== undefined)
    return queryId;
  throw new Error("LinkedIn registered-query bootstrap ended without a result");
}

// src/providers/linkedin-web-article-browser.ts
import { randomUUID } from "crypto";
var LINKEDIN_ORIGIN4 = "https://www.linkedin.com";
var LINKEDIN_ARTICLE_NEW_URL = `${LINKEDIN_ORIGIN4}/article/new/`;
var LINKEDIN_ARTICLE_AUTOSAVE_PEM_METADATA = "Voyager - Article Creator=autosave-article";
var MAX_BROWSER_OUTPUT_BYTES = 2 * 1024 * 1024;
var LINKEDIN_IMAGE_STAGING_COMMANDS_PER_BATCH = 16;
var articleBrowserManifest = Object.freeze({
  schemaVersion: 4,
  id: "linkedin-article-runtime",
  version: "1.0.0",
  displayName: "LinkedIn native Article runtime",
  surfaceId: "linkedin",
  origins: Object.freeze([LINKEDIN_ORIGIN4]),
  browserDomains: Object.freeze(["www.linkedin.com", "static.licdn.com"]),
  operations: Object.freeze({})
});
var LINKEDIN_PAGE_INSTANCE_PATTERN = /^urn:li:page:[A-Za-z0-9_:-]{1,128};[A-Za-z0-9+/=_-]{1,512}$/u;
function linkedInPageInstance(value) {
  if (typeof value !== "string" || !LINKEDIN_PAGE_INSTANCE_PATTERN.test(value)) {
    throw new Error("LinkedIn Article page omitted its bounded page-instance binding");
  }
  return value;
}
function boundedString(value, label, maximum) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || /[\0\r\n]/u.test(value))
    throw new Error(`${label} changed its reviewed bound`);
  return value;
}
function isRecord5(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys3(value, expected, label) {
  if (Object.keys(value).sort().join(",") !== [...expected].sort().join(",")) {
    throw new Error(`${label} returned an unexpected result shape`);
  }
}
function linkedInArticleTrack(value) {
  const track = boundedString(value, "LinkedIn Article x-li-track binding", 4096);
  let parsed;
  try {
    parsed = JSON.parse(track);
  } catch {
    throw new Error("LinkedIn Article x-li-track binding changed shape");
  }
  if (!isRecord5(parsed)) {
    throw new Error("LinkedIn Article x-li-track binding changed shape");
  }
  exactKeys3(parsed, [
    "clientVersion",
    "deviceFormFactor",
    "displayDensity",
    "displayHeight",
    "displayWidth",
    "mpName",
    "mpVersion",
    "osName",
    "timezone",
    "timezoneOffset"
  ], "LinkedIn Article x-li-track binding");
  const clientVersion = boundedString(parsed.clientVersion, "LinkedIn Article x-li-track clientVersion", 64);
  if (!/^[0-9]+(?:\.[0-9]+){1,7}$/u.test(clientVersion) || parsed.mpVersion !== clientVersion) {
    throw new Error("LinkedIn Article x-li-track version changed shape");
  }
  boundedString(parsed.osName, "LinkedIn Article x-li-track osName", 32);
  const timezone = boundedString(parsed.timezone, "LinkedIn Article x-li-track timezone", 128);
  if (!/^[A-Za-z0-9_+.-]+(?:\/[A-Za-z0-9_+.-]+)+$/u.test(timezone)) {
    throw new Error("LinkedIn Article x-li-track timezone changed shape");
  }
  if (parsed.deviceFormFactor !== "DESKTOP" || parsed.mpName !== "voyager-web") {
    throw new Error("LinkedIn Article x-li-track client binding changed shape");
  }
  if (!Number.isInteger(parsed.timezoneOffset) || parsed.timezoneOffset < -24 || parsed.timezoneOffset > 24 || typeof parsed.displayDensity !== "number" || !Number.isFinite(parsed.displayDensity) || parsed.displayDensity < 0.5 || parsed.displayDensity > 10 || !Number.isInteger(parsed.displayWidth) || parsed.displayWidth < 1 || parsed.displayWidth > 20000 || !Number.isInteger(parsed.displayHeight) || parsed.displayHeight < 1 || parsed.displayHeight > 20000)
    throw new Error("LinkedIn Article x-li-track display binding changed shape");
  return track;
}
function linkedInArticlePageBindings(value, expectedPageName) {
  if (!isRecord5(value) || !Array.isArray(value.requests) || value.requests.length > 1e4) {
    throw new Error("LinkedIn Article network observation changed shape");
  }
  let selected = null;
  for (const item of value.requests) {
    if (!isRecord5(item) || !isRecord5(item.headers))
      continue;
    if (item.method !== "GET" || item.status !== 200 || typeof item.url !== "string" || item.url.length > 64 * 1024)
      continue;
    let url;
    try {
      url = new URL(item.url);
    } catch {
      continue;
    }
    if (url.origin !== LINKEDIN_ORIGIN4 || url.username !== "" || url.password !== "" || !url.pathname.startsWith("/voyager/api/"))
      continue;
    const pageInstanceValue = item.headers["x-li-page-instance"];
    if (typeof pageInstanceValue !== "string")
      continue;
    const name = /^urn:li:page:([A-Za-z0-9_:-]{1,128});/u.exec(pageInstanceValue)?.[1];
    if (name !== expectedPageName)
      continue;
    const candidate = Object.freeze({
      pageInstance: linkedInPageInstance(pageInstanceValue),
      track: linkedInArticleTrack(item.headers["x-li-track"])
    });
    selected = candidate;
  }
  if (selected === null) {
    throw new Error("LinkedIn Article page omitted its bounded page-instance binding");
  }
  return selected;
}
function articleReadbackResponseCategory(status, contentType, body) {
  const bodyShape = isRecord5(body) ? `:${Object.keys(body).sort().join("+") || "empty"}` : typeof contentType === "string" && contentType.includes("json") ? ":json-error" : typeof contentType === "string" && contentType.startsWith("text/") ? ":text-error" : ":opaque-error";
  if (status === 401 || status === 403)
    return "session-rejected";
  if (status === 400 || status === 422)
    return `request-rejected-${status}${bodyShape}`;
  if (status === 404)
    return "contract-route-not-found";
  if (status === 410)
    return "contract-route-retired";
  if (status === 409)
    return "provider-conflict";
  if (status === 429)
    return "provider-throttled";
  if (typeof status === "number" && status >= 500)
    return "provider-unavailable";
  if (status !== 200)
    return "status-drift";
  if (contentType !== "application/vnd.linkedin.normalized+json+2.1" && contentType !== "application/json")
    return "content-type-drift";
  return "response-drift";
}
function articleEditUrl(draftId) {
  return linkedInArticleDraftEditUrl(draftId).href;
}
function exactRequestPath(url) {
  if (url.origin !== LINKEDIN_ORIGIN4 || url.username !== "" || url.password !== "" || url.hash !== "")
    throw new Error("LinkedIn Article browser request escaped its reviewed origin");
  return `${url.pathname}${url.search}`;
}
function requestEvaluationSource(binding) {
  const bound = jsonScriptLiteral(binding);
  return `(async()=>{const input=${bound};if(location.origin!=="${LINKEDIN_ORIGIN4}")throw new Error("unexpected LinkedIn origin");const raw=document.cookie.split("; ").find((part)=>part.startsWith("JSESSIONID="));if(typeof raw!=="string")throw new Error("missing LinkedIn browser CSRF cookie");const csrf=decodeURIComponent(raw.slice("JSESSIONID=".length)).replace(/^"|"$/g,"");if(!/^ajax:[A-Za-z0-9_-]{1,512}$/.test(csrf))throw new Error("invalid LinkedIn browser CSRF cookie");const headers=input.response==="page"?{accept:"text/html"}:{accept:"application/vnd.linkedin.normalized+json+2.1","csrf-token":csrf,"x-li-lang":"en_US","x-restli-protocol-version":"2.0.0"};if(input.body!==null){if(!/^urn:li:page:[A-Za-z0-9_:-]{1,128};[A-Za-z0-9+/=_-]{1,512}$/.test(input.pageInstance||""))throw new Error("missing LinkedIn browser page instance");if(typeof input.track!=="string"||input.track.length<1||input.track.length>4096||/[\\0\\r\\n]/u.test(input.track))throw new Error("missing LinkedIn browser track binding");if(input.pemMetadata!==null&&input.pemMetadata!=="article-autosave")throw new Error("invalid LinkedIn browser PEM binding");headers["x-li-page-instance"]=input.pageInstance;if(input.pemMetadata==="article-autosave")headers["x-li-pem-metadata"]="${LINKEDIN_ARTICLE_AUTOSAVE_PEM_METADATA}";headers["x-li-track"]=input.track;headers["content-type"]="application/json; charset=UTF-8"}else if(input.pemMetadata!==null)throw new Error("invalid LinkedIn browser PEM binding");const response=await fetch(input.path,{body:input.body===null?undefined:input.body,credentials:"include",headers,method:input.method,redirect:"error",referrer:input.referrer});const contentType=(response.headers.get("content-type")||"").split(";",1)[0].trim().toLowerCase();if(input.response==="page"){const payloads=[];if(response.status===200&&contentType==="text/html"){if(response.body===null)throw new Error("missing LinkedIn Article page body");const reader=response.body.getReader();const decoder=new TextDecoder();const chunks=[];let bytes=0;while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>${LINKEDIN_ARTICLE_PAGE_MAX_CHARACTERS}){await reader.cancel();throw new Error("LinkedIn Article page exceeded its reviewed bound")}chunks.push(decoder.decode(part.value,{stream:true}))}chunks.push(decoder.decode());const html=chunks.join("");const id=new RegExp("^/article/edit/([0-9]{1,32})/$","u").exec(input.path)?.[1];if(typeof id!=="string")throw new Error("invalid LinkedIn Article page path");const urn="urn:li:fsd_firstPartyArticle:"+id;for(const match of html.matchAll(/<code\\b([^>]*)>([\\s\\S]*?)<\\/code>/giu)){const attributes=match[1]||"";const body=match[2]||"";if(!body.includes(urn))continue;payloads.push({attributes,body});if(payloads.length>20)throw new Error("LinkedIn Article page returned too many matching payloads")}}return{contentType,payloads,status:response.status}}if(input.response==="json"){let body=null;if(contentType==="application/vnd.linkedin.normalized+json+2.1"||contentType==="application/json")body=await response.json();return{body,contentType,status:response.status}}if(input.response==="created")return{contentType,responseId:response.headers.get("x-restli-id"),status:response.status};return{contentType,status:response.status}})()`;
}
function evaluationResult(record2) {
  const data = browserResultData(record2);
  if (!isRecord5(data) || typeof data.origin !== "string" || !isRecord5(data.result)) {
    throw new Error("LinkedIn Article browser returned a malformed evaluation envelope");
  }
  let origin;
  try {
    origin = new URL(data.origin);
  } catch {
    throw new Error("LinkedIn Article browser returned a malformed evaluation envelope");
  }
  if (origin.origin !== LINKEDIN_ORIGIN4 || origin.username !== "" || origin.password !== "")
    throw new Error("LinkedIn Article browser returned a malformed evaluation envelope");
  return data.result;
}
function linkedInArticleImageUploadEvaluationSource(input) {
  const bound = jsonScriptLiteral(input);
  return `(async()=>{const input=${bound};if(location.origin!=="${LINKEDIN_ORIGIN4}")throw new Error("unexpected LinkedIn origin");if(!Number.isSafeInteger(input.expectedBase64Length)||input.expectedBase64Length<1||!Number.isSafeInteger(input.expectedByteLength)||input.expectedByteLength<1||!Number.isSafeInteger(input.expectedChunkCount)||input.expectedChunkCount<1||input.expectedChunkCount>256)throw new Error("invalid LinkedIn image byte binding");const chunks=globalThis[input.key];delete globalThis[input.key];if(!Array.isArray(chunks)||chunks.length!==input.expectedChunkCount)throw new Error("missing bounded LinkedIn image bytes");let encoded="";for(const chunk of chunks){if(typeof chunk!=="string"||chunk.length<1||chunk.length>49152||!/^[A-Za-z0-9+/]*={0,2}$/.test(chunk))throw new Error("invalid LinkedIn image bytes");encoded+=chunk}if(encoded.length!==input.expectedBase64Length)throw new Error("LinkedIn image changed encoded size");const binary=atob(encoded);encoded="";if(binary.length!==input.expectedByteLength)throw new Error("LinkedIn image changed size");const bytes=new Uint8Array(binary.length);for(let index=0;index<binary.length;index+=1)bytes[index]=binary.charCodeAt(index);const image=new Blob([bytes],{type:input.mediaType});if(image.size!==input.expectedByteLength||image.type!==input.mediaType)throw new Error("LinkedIn image blob changed shape");const raw=document.cookie.split("; ").find((part)=>part.startsWith("JSESSIONID="));if(typeof raw!=="string")throw new Error("missing LinkedIn browser CSRF cookie");const csrf=decodeURIComponent(raw.slice("JSESSIONID=".length)).replace(/^"|"$/g,"");if(!/^ajax:[A-Za-z0-9_-]{1,512}$/.test(csrf))throw new Error("invalid LinkedIn browser CSRF cookie");const upload=await fetch(input.uploadUrl,{body:image,credentials:"include",headers:{...input.uploadHeaders,"content-type":input.mediaType,"csrf-token":csrf},method:"PUT",redirect:"error",referrer:input.referrer});return{uploadStatus:upload.status}})()`;
}
async function stageLinkedInArticleImageBytes(session, key, image, timeoutMs) {
  const init = `(async()=>{const key=${jsonScriptLiteral(key)};if(Object.hasOwn(globalThis,key))throw new Error("LinkedIn image staging key collision");globalThis[key]=[];return true})()`;
  await session.runBatch([["eval", init]], timeoutMs, MAX_BROWSER_OUTPUT_BYTES);
  const encoded = Buffer.from(image.bytes).toString("base64");
  try {
    const commands = [];
    for (let offset = 0;offset < encoded.length; offset += 48 * 1024) {
      const chunk = encoded.slice(offset, offset + 48 * 1024);
      const source = `(async()=>{const key=${jsonScriptLiteral(key)};const chunks=globalThis[key];if(!Array.isArray(chunks)||chunks.length>=256)throw new Error("LinkedIn image staging changed shape");chunks.push(${jsonScriptLiteral(chunk)});return true})()`;
      commands.push(["eval", source]);
    }
    for (let offset = 0;offset < commands.length; offset += LINKEDIN_IMAGE_STAGING_COMMANDS_PER_BATCH) {
      await session.runBatch(commands.slice(offset, offset + LINKEDIN_IMAGE_STAGING_COMMANDS_PER_BATCH), timeoutMs, MAX_BROWSER_OUTPUT_BYTES);
    }
  } catch (error) {
    try {
      await session.runBatch([["eval", `(async()=>{delete globalThis[${jsonScriptLiteral(key)}];return true})()`]], timeoutMs, MAX_BROWSER_OUTPUT_BYTES);
    } catch {}
    throw error;
  }
}
async function finalizeBrowserSession3(session) {
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
  if (closeVerified && cleanupVerified)
    return;
  const cleanupEvidence = closeVerified && !cleanupVerified && session.cleanupResourceIdentity !== undefined ? Object.freeze({
    kind: "agent-browser-closed-artifacts-v1",
    resource: session.cleanupResourceIdentity
  }) : undefined;
  throw new PreservedBrowserArtifactsError("LinkedIn Article browser finalization failed; private artifacts were preserved", session.recoveryHandle ?? "session=linkedin-article-runtime;artifacts=unknown", new AggregateError(failures, "LinkedIn Article browser finalization failed"), cleanupEvidence);
}
async function createLinkedInArticleBrowserTransport(auth, options) {
  const createSession = options.dependencies?.createBrowserSession ?? createBrowserSession;
  const sessionOptions = {
    allowCodeOwnedEvaluation: true,
    allowCodeOwnedNetworkObservation: true,
    headed: true,
    maxOutputBytes: MAX_BROWSER_OUTPUT_BYTES,
    timeoutMs: options.timeoutMs,
    ...options.operationDeadline === undefined ? {} : { operationDeadline: options.operationDeadline },
    ...options.publishCleanupResource === undefined ? {} : { publishCleanupResource: options.publishCleanupResource }
  };
  const session = await createSession(articleBrowserManifest, auth, sessionOptions);
  let closed = false;
  let articleBindings = null;
  let activeEditor = null;
  const run = async (binding) => {
    if (closed)
      throw new Error("LinkedIn Article browser transport is closed");
    const records = await session.runBatch([["eval", requestEvaluationSource(binding)]], options.operationDeadline?.remainingTimeMs() ?? options.timeoutMs, MAX_BROWSER_OUTPUT_BYTES);
    const first = records[0];
    if (first === undefined)
      throw new Error("LinkedIn Article browser omitted its response");
    return evaluationResult(first);
  };
  const open = async (url) => {
    if (url.origin !== LINKEDIN_ORIGIN4 || url.username !== "" || url.password !== "" || url.hash !== "")
      throw new Error("LinkedIn Article browser navigation escaped its reviewed origin");
    await session.runBatch([["open", url.href]], options.operationDeadline?.remainingTimeMs() ?? options.timeoutMs, MAX_BROWSER_OUTPUT_BYTES);
  };
  const openEditor = async (url, expectedPageName, editor) => {
    for (let attempt = 0;attempt < 2; attempt += 1) {
      try {
        await open(url);
        await session.runBatch([["wait", "5000"]], Math.min(options.operationDeadline?.remainingTimeMs() ?? options.timeoutMs, 20000), MAX_BROWSER_OUTPUT_BYTES);
        const records = await session.runBatch([["network", "requests", "--filter", "/voyager/api/"]], Math.min(options.operationDeadline?.remainingTimeMs() ?? options.timeoutMs, 30000), MAX_BROWSER_OUTPUT_BYTES);
        const first = records[0];
        if (first === undefined) {
          throw new Error("LinkedIn Article page-binding observation omitted its response");
        }
        articleBindings = linkedInArticlePageBindings(browserResultData(first), expectedPageName);
        activeEditor = editor;
        return;
      } catch (error) {
        articleBindings = null;
        activeEditor = null;
        if (attempt === 1)
          throw error;
      }
    }
  };
  try {
    await session.runBatch([["open", `${LINKEDIN_ORIGIN4}/feed/`]], options.operationDeadline?.remainingTimeMs() ?? options.timeoutMs, MAX_BROWSER_OUTPUT_BYTES);
    await session.runBatch([["wait", "2000"]], Math.min(options.operationDeadline?.remainingTimeMs() ?? options.timeoutMs, 1e4), MAX_BROWSER_OUTPUT_BYTES);
  } catch (error) {
    try {
      await finalizeBrowserSession3(session);
    } catch (cleanupError) {
      throw cleanupError;
    }
    throw error;
  }
  const uploadArticleImage = async (draftId, image, mediaUploadType, label) => {
    if (activeEditor?.kind !== "edit" || activeEditor.draftId !== draftId || articleBindings === null)
      throw new Error(`${label} upload omitted its exact editor binding`);
    const registrationResult = await run({
      method: "POST",
      path: LINKEDIN_ARTICLE_INLINE_IMAGE_UPLOAD_PATH,
      referrer: articleEditUrl(draftId),
      body: canonicalJson({
        fileSize: image.bytes.byteLength,
        filename: image.filename,
        mediaUploadType
      }),
      pageInstance: articleBindings.pageInstance,
      pemMetadata: null,
      track: articleBindings.track,
      response: "json"
    });
    exactKeys3(registrationResult, ["body", "contentType", "status"], `${label} registration request`);
    if (registrationResult.status !== 200 || registrationResult.contentType !== "application/vnd.linkedin.normalized+json+2.1" && registrationResult.contentType !== "application/json")
      throw new Error(`${label} registration returned an unreviewed response`);
    const registration = normalizeLinkedInArticleImageUploadRegistration(registrationResult.body);
    const key = `__ghostgetLinkedInArticleImage_${randomUUID().replaceAll("-", "")}`;
    const timeoutMs = options.operationDeadline?.remainingTimeMs() ?? options.timeoutMs;
    const encodedLength = Buffer.from(image.bytes).toString("base64").length;
    const chunkCount = Math.ceil(encodedLength / (48 * 1024));
    await stageLinkedInArticleImageBytes(session, key, image, timeoutMs);
    let transfer;
    try {
      const records = await session.runBatch([["eval", linkedInArticleImageUploadEvaluationSource({
        expectedBase64Length: encodedLength,
        expectedByteLength: image.bytes.byteLength,
        expectedChunkCount: chunkCount,
        key,
        mediaType: image.mediaType,
        referrer: articleEditUrl(draftId),
        uploadHeaders: registration.uploadHeaders,
        uploadUrl: registration.uploadUrl
      })]], options.operationDeadline?.remainingTimeMs() ?? options.timeoutMs, MAX_BROWSER_OUTPUT_BYTES);
      const first = records[0];
      if (first === undefined)
        throw new Error(`${label} upload omitted its response`);
      transfer = evaluationResult(first);
    } catch (error) {
      try {
        await session.runBatch([["eval", `(async()=>{delete globalThis[${jsonScriptLiteral(key)}];return true})()`]], options.operationDeadline?.remainingTimeMs() ?? options.timeoutMs, MAX_BROWSER_OUTPUT_BYTES);
      } catch {}
      throw error;
    }
    exactKeys3(transfer, ["uploadStatus"], `${label} upload`);
    if (transfer.uploadStatus !== 201) {
      throw new Error(`${label} upload returned an unreviewed response`);
    }
    return registration.assetUrn;
  };
  const transport = {
    currentIdentityResponse: async () => {
      const result = await run({
        method: "GET",
        path: "/voyager/api/me",
        referrer: `${LINKEDIN_ORIGIN4}/feed/`,
        body: null,
        pageInstance: null,
        pemMetadata: null,
        track: null,
        response: "json"
      });
      exactKeys3(result, ["body", "contentType", "status"], "LinkedIn current-member browser request");
      if (result.status !== 200 || result.contentType !== "application/vnd.linkedin.normalized+json+2.1" && result.contentType !== "application/json")
        throw new Error("LinkedIn current-member browser request returned an unreviewed response");
      return result.body;
    },
    prepareCreateDraft: () => openEditor(new URL(LINKEDIN_ARTICLE_NEW_URL), "d_flagship3_publishing_post_new", Object.freeze({ kind: "new" })),
    createDraft: async (profileUrn2, title) => {
      if (activeEditor?.kind !== "new" || articleBindings === null) {
        throw new Error("LinkedIn Article create omitted its exact editor binding");
      }
      const result = await run({
        method: "POST",
        path: `${LINKEDIN_FIRST_PARTY_ARTICLES_PATH}/`,
        referrer: LINKEDIN_ARTICLE_NEW_URL,
        body: canonicalJson(buildLinkedInArticleCreateBody(profileUrn2, title)),
        pageInstance: articleBindings.pageInstance,
        pemMetadata: "article-autosave",
        track: articleBindings.track,
        response: "created"
      });
      exactKeys3(result, ["contentType", "responseId", "status"], "LinkedIn Article create browser request");
      if (result.status !== 201) {
        throw new Error("LinkedIn Article create browser request returned an unreviewed response");
      }
      if (result.responseId !== null && typeof result.responseId !== "string") {
        throw new Error("LinkedIn Article create browser response returned an invalid identifier");
      }
      return result.responseId;
    },
    readDraftResponse: async (draftId) => {
      const editUrl = linkedInArticleDraftEditUrl(draftId);
      if (activeEditor?.kind !== "edit" || activeEditor.draftId !== draftId) {
        await openEditor(editUrl, "d_flagship3_publishing_post_edit", Object.freeze({ kind: "edit", draftId }));
      }
      const result = await run({
        method: "GET",
        path: exactRequestPath(editUrl),
        referrer: editUrl.href,
        body: null,
        pageInstance: null,
        pemMetadata: null,
        track: null,
        response: "page"
      });
      exactKeys3(result, ["contentType", "payloads", "status"], "LinkedIn Article readback browser request");
      if (result.status !== 200 || result.contentType !== "text/html") {
        throw new Error(`LinkedIn Article readback browser request returned an unreviewed response (${articleReadbackResponseCategory(result.status, result.contentType, null)})`);
      }
      return linkedInArticleDraftEnvelopeFromCodePayloads(result.payloads, draftId);
    },
    updateTitle: async (draftId, title) => {
      if (activeEditor?.kind !== "edit" || activeEditor.draftId !== draftId || articleBindings === null)
        throw new Error("LinkedIn Article title update omitted its exact editor binding");
      const result = await run({
        method: "POST",
        path: exactRequestPath(linkedInArticleDraftEntityUrl(draftId)),
        referrer: articleEditUrl(draftId),
        body: canonicalJson(buildLinkedInArticleTitlePatch(title)),
        pageInstance: articleBindings.pageInstance,
        pemMetadata: "article-autosave",
        track: articleBindings.track,
        response: "status"
      });
      exactKeys3(result, ["contentType", "status"], "LinkedIn Article title browser request");
      if (result.status !== 200) {
        throw new Error(`LinkedIn Article title browser request returned an unreviewed response (${articleReadbackResponseCategory(result.status, result.contentType, null)})`);
      }
    },
    updateContent: async (draftId, document) => {
      if (activeEditor?.kind !== "edit" || activeEditor.draftId !== draftId || articleBindings === null)
        throw new Error("LinkedIn Article content update omitted its exact editor binding");
      const result = await run({
        method: "POST",
        path: exactRequestPath(linkedInArticleDraftEntityUrl(draftId)),
        referrer: articleEditUrl(draftId),
        body: canonicalJson(buildLinkedInArticleContentPatch(document)),
        pageInstance: articleBindings.pageInstance,
        pemMetadata: "article-autosave",
        track: articleBindings.track,
        response: "status"
      });
      exactKeys3(result, ["contentType", "status"], "LinkedIn Article content browser request");
      if (result.status !== 200) {
        throw new Error(`LinkedIn Article content browser request returned an unreviewed response (${articleReadbackResponseCategory(result.status, result.contentType, null)})`);
      }
    },
    uploadInlineImage: (draftId, image) => uploadArticleImage(draftId, image, "PUBLISHING_INLINE_IMAGE", "LinkedIn Article inline image"),
    uploadCoverImage: (draftId, image) => uploadArticleImage(draftId, image, "PUBLISHING_COVER_IMAGE", "LinkedIn Article cover image"),
    updateCover: async (draftId, assetUrn) => {
      if (activeEditor?.kind !== "edit" || activeEditor.draftId !== draftId || articleBindings === null)
        throw new Error("LinkedIn Article cover update omitted its exact editor binding");
      const result = await run({
        method: "POST",
        path: exactRequestPath(linkedInArticleDraftEntityUrl(draftId)),
        referrer: articleEditUrl(draftId),
        body: canonicalJson(buildLinkedInArticleCoverPatch(assetUrn)),
        pageInstance: articleBindings.pageInstance,
        pemMetadata: "article-autosave",
        track: articleBindings.track,
        response: "status"
      });
      exactKeys3(result, ["contentType", "status"], "LinkedIn Article cover browser request");
      if (result.status !== 200) {
        throw new Error(`LinkedIn Article cover browser request returned an unreviewed response (${articleReadbackResponseCategory(result.status, result.contentType, null)})`);
      }
    },
    updateContentV2: async (draftId, document, imageAssetUrns) => {
      if (activeEditor?.kind !== "edit" || activeEditor.draftId !== draftId || articleBindings === null)
        throw new Error("LinkedIn Article content update omitted its exact editor binding");
      const result = await run({
        method: "POST",
        path: exactRequestPath(linkedInArticleDraftEntityUrl(draftId)),
        referrer: articleEditUrl(draftId),
        body: canonicalJson(buildLinkedInArticleContentPatchV2(document, imageAssetUrns)),
        pageInstance: articleBindings.pageInstance,
        pemMetadata: "article-autosave",
        track: articleBindings.track,
        response: "status"
      });
      exactKeys3(result, ["contentType", "status"], "LinkedIn Article content browser request");
      if (result.status !== 200) {
        throw new Error(`LinkedIn Article content browser request returned an unreviewed response (${articleReadbackResponseCategory(result.status, result.contentType, null)})`);
      }
    },
    close: async () => {
      if (closed)
        return;
      closed = true;
      await finalizeBrowserSession3(session);
    }
  };
  return Object.freeze(transport);
}

// src/providers/linkedin-web-post-browser.ts
import { randomUUID as randomUUID2 } from "crypto";
var LINKEDIN_ORIGIN5 = "https://www.linkedin.com";
var LINKEDIN_FEED_URL3 = `${LINKEDIN_ORIGIN5}/feed/`;
var LINKEDIN_IMAGE_REGISTRATION_PATH = "/voyager/api/voyagerVideoDashMediaUploadMetadata?action=upload";
var LINKEDIN_IMAGE_FINALIZATION_PATH = "/voyager/api/voyagerVideoDashMediaUploadMetadata?action=completeMultipartUpload";
var MAX_BROWSER_OUTPUT_BYTES2 = 2 * 1024 * 1024;
var MAX_IMAGE_BYTES = 20 * 1024 * 1024;
var IMAGE_STAGING_CHUNK_CHARACTERS = 48 * 1024;
var IMAGE_STAGING_COMMANDS_PER_BATCH = 32;
var MAX_IMAGE_STAGING_COMMAND_CHARACTERS = 64 * 1024;
var MAX_IMAGE_BASE64_CHARACTERS = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
var MAX_IMAGE_STAGING_CHUNKS = Math.ceil(MAX_IMAGE_BASE64_CHARACTERS / IMAGE_STAGING_CHUNK_CHARACTERS);
var postBrowserManifest = Object.freeze({
  schemaVersion: 4,
  id: "linkedin-post-runtime",
  version: "1.0.0",
  displayName: "LinkedIn native post runtime",
  surfaceId: "linkedin",
  origins: Object.freeze([LINKEDIN_ORIGIN5]),
  browserDomains: Object.freeze(["www.linkedin.com", "static.licdn.com"]),
  operations: Object.freeze({})
});
function linkedInPostImageFailureStage(error) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("LinkedIn image registration"))
    return "image registration response";
  if (message.includes("LinkedIn image finalization"))
    return "image finalization response";
  if (message.includes("LinkedIn image upload"))
    return "image transfer response";
  return "image registration or upload response";
}

class LinkedInPostImagePreparationError extends Error {
  stage;
  constructor(stage, cause) {
    super(`LinkedIn post image preparation failed during ${stage}`, { cause });
    this.name = "LinkedInPostImagePreparationError";
    this.stage = stage;
  }
}
function linkedInPostCreateFailureStage(error) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("LinkedIn current member"))
    return "post create current-member binding";
  if (message.includes("LinkedIn post create status"))
    return "post create status";
  if (message.includes("LinkedIn post create content type"))
    return "post create content type";
  if (message.includes("LinkedIn GraphQL response changed shape"))
    return "post create response shape";
  if (message.includes("LinkedIn post create returned provider errors"))
    return "post create provider errors";
  if (message.includes("LinkedIn post create entity used direct nesting")) {
    return "post create entity direct nesting";
  }
  if (message.includes("LinkedIn post create entity used alternate data nesting")) {
    return "post create entity alternate data nesting";
  }
  if (message.includes("LinkedIn post create returned normalized included entities")) {
    return "post create normalized included entity";
  }
  if (message.includes("LinkedIn post create omitted its entity")) {
    return "post create entity absent";
  }
  if (message.includes("LinkedIn post create returned an invalid entity URN")) {
    return "post create entity URN";
  }
  if (message.includes("LinkedIn post create did not report a published lifecycle")) {
    return "post create published lifecycle";
  }
  return "post create response";
}

class LinkedInPostCreateResponseError extends Error {
  stage;
  constructor(cause) {
    super("LinkedIn post create response failed strict binding", { cause });
    this.name = "LinkedInPostCreateResponseError";
    this.stage = linkedInPostCreateFailureStage(cause);
  }
}
var LINKEDIN_PAGE_INSTANCE_PATTERN2 = /^urn:li:page:d_flagship3_[A-Za-z0-9_:-]{1,128};[A-Za-z0-9+/=_-]{1,512}$/u;
function isRecord6(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys4(value, expected, label) {
  if (Object.keys(value).sort().join(",") !== [...expected].sort().join(",")) {
    throw new Error(`${label} returned an unexpected result shape`);
  }
}
function boundedHeader(value, label, maximum) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || /[\0\r\n]/u.test(value))
    throw new Error(`${label} changed its reviewed bound`);
  return value;
}
function linkedInPostPageBindings(value) {
  if (!isRecord6(value) || !Array.isArray(value.requests) || value.requests.length > 1e4) {
    throw new Error("LinkedIn post network observation changed shape");
  }
  let selected = null;
  for (const item of value.requests) {
    if (!isRecord6(item) || !isRecord6(item.headers))
      continue;
    if (item.method !== "GET" || item.status !== 200 || typeof item.url !== "string" || item.url.length > 64 * 1024)
      continue;
    let url;
    try {
      url = new URL(item.url);
    } catch {
      continue;
    }
    if (url.origin !== LINKEDIN_ORIGIN5 || url.username !== "" || url.password !== "" || !url.pathname.startsWith("/voyager/api/"))
      continue;
    const pageInstance = item.headers["x-li-page-instance"];
    if (typeof pageInstance !== "string" || !LINKEDIN_PAGE_INSTANCE_PATTERN2.test(pageInstance))
      continue;
    const track = boundedHeader(item.headers["x-li-track"], "LinkedIn post x-li-track binding", 4096);
    let parsedTrack;
    try {
      parsedTrack = JSON.parse(track);
    } catch {
      throw new Error("LinkedIn post x-li-track binding changed shape");
    }
    if (!isRecord6(parsedTrack) || parsedTrack.mpName !== "voyager-web") {
      throw new Error("LinkedIn post x-li-track binding changed shape");
    }
    selected = Object.freeze({ pageInstance, track });
  }
  if (selected === null) {
    throw new Error("LinkedIn post page omitted its bounded page-instance binding");
  }
  return selected;
}
function browserEvaluationResult3(record2) {
  const data = browserResultData(record2);
  if (!isRecord6(data) || typeof data.origin !== "string" || !isRecord6(data.result)) {
    throw new Error("LinkedIn post browser returned a malformed evaluation envelope");
  }
  let origin;
  try {
    origin = new URL(data.origin);
  } catch {
    throw new Error("LinkedIn post browser returned a malformed evaluation envelope");
  }
  if (origin.origin !== LINKEDIN_ORIGIN5 || origin.username !== "" || origin.password !== "") {
    throw new Error("LinkedIn post browser returned a malformed evaluation envelope");
  }
  return data.result;
}
function commonEvaluationPrelude(input) {
  return `const input=${canonicalJsonScriptLiteral(input)};if(location.origin!=="${LINKEDIN_ORIGIN5}")throw new Error("unexpected LinkedIn origin");const raw=document.cookie.split("; ").find((part)=>part.startsWith("JSESSIONID="));if(typeof raw!=="string")throw new Error("missing LinkedIn browser CSRF cookie");const csrf=decodeURIComponent(raw.slice("JSESSIONID=".length)).replace(/^"|"$/g,"");if(!/^ajax:[A-Za-z0-9_-]{1,512}$/.test(csrf))throw new Error("invalid LinkedIn browser CSRF cookie");const baseHeaders={accept:"application/vnd.linkedin.normalized+json+2.1","csrf-token":csrf,"x-li-lang":"en_US","x-requested-with":"XMLHttpRequest","x-restli-protocol-version":"2.0.0"};const jsonTypes=new Set(["application/graphql","application/json","application/vnd.linkedin.normalized+json+2.1"]);const jsonResponse=async(response,label)=>{const contentType=(response.headers.get("content-type")||"").split(";",1)[0].trim().toLowerCase();if(!jsonTypes.has(contentType))throw new Error(label+" content type changed");if(response.status<200||response.status>=300)throw new Error(label+" status changed");return response.json()};const requestJson=async(path,init,label)=>jsonResponse(await fetch(path,{credentials:"include",redirect:"error",referrer:"${LINKEDIN_FEED_URL3}",...init}),label);const identity=async()=>requestJson("/voyager/api/me",{headers:baseHeaders,method:"GET"},"LinkedIn current member");const assertIdentity=(body)=>{if(!body||typeof body!=="object"||Array.isArray(body)||!body.data||typeof body.data!=="object"||Array.isArray(body.data))throw new Error("LinkedIn current member changed shape");const plain=typeof body.data.plainId==="string"?body.data.plainId:Number.isSafeInteger(body.data.plainId)?String(body.data.plainId):"";if("urn:li:fsd_profile:"+plain!==input.expectedSubject)throw new Error("LinkedIn current member changed before dispatch");if(input.expectedProfileUrn!==undefined){const mini=body.data["*miniProfile"]??body.data.miniProfile;const suffix=typeof mini==="string"?/^urn:li:fs_miniProfile:([A-Za-z0-9_-]{1,256})$/.exec(mini)?.[1]:undefined;if("urn:li:fsd_profile:"+suffix!==input.expectedProfileUrn)throw new Error("LinkedIn current profile changed before dispatch")}};`;
}
function identityEvaluationSource() {
  const input = Object.freeze({});
  return `(async()=>{${commonEvaluationPrelude(input)}const body=await identity();return{body,contentType:"application/vnd.linkedin.normalized+json+2.1",status:200}})()`;
}
function imageStagingInitializationSource(staging) {
  const input = Object.freeze({
    stagingKey: staging.key,
    expectedChunkCount: staging.chunkCount
  });
  return `(async()=>{const input=${canonicalJsonScriptLiteral(input)};if(location.origin!=="${LINKEDIN_ORIGIN5}")throw new Error("unexpected LinkedIn origin");if(!/^__ghostgetLinkedInPostImage_[a-f0-9]{32}$/.test(input.stagingKey)||!Number.isSafeInteger(input.expectedChunkCount)||input.expectedChunkCount<1||input.expectedChunkCount>${MAX_IMAGE_STAGING_CHUNKS})throw new Error("LinkedIn image staging input changed shape");if(Object.hasOwn(globalThis,input.stagingKey))throw new Error("LinkedIn image staging key collision");Object.defineProperty(globalThis,input.stagingKey,{configurable:true,enumerable:false,value:[],writable:false});return{ready:true}})()`;
}
function imageStagingChunkSource(staging, index, chunk) {
  const input = Object.freeze({
    chunk,
    expectedChunkCount: staging.chunkCount,
    index,
    stagingKey: staging.key
  });
  const source = `(async()=>{const input=${canonicalJsonScriptLiteral(input)};if(location.origin!=="${LINKEDIN_ORIGIN5}")throw new Error("unexpected LinkedIn origin");const chunks=globalThis[input.stagingKey];if(!Array.isArray(chunks)||!Number.isSafeInteger(input.index)||input.index<0||input.index>=input.expectedChunkCount||input.expectedChunkCount<1||input.expectedChunkCount>${MAX_IMAGE_STAGING_CHUNKS}||chunks.length!==input.index)throw new Error("LinkedIn image staging order changed");if(typeof input.chunk!=="string"||input.chunk.length<1||input.chunk.length>${IMAGE_STAGING_CHUNK_CHARACTERS}||!/^[A-Za-z0-9+/]*={0,2}$/.test(input.chunk))throw new Error("LinkedIn image staging chunk changed shape");chunks.push(input.chunk);return{staged:chunks.length}})()`;
  if (source.length > MAX_IMAGE_STAGING_COMMAND_CHARACTERS) {
    throw new Error("LinkedIn image staging command exceeded its reviewed bound");
  }
  return source;
}
function imageStagingCleanupSource(stagingKey) {
  const input = Object.freeze({ stagingKey });
  return `(async()=>{const input=${canonicalJsonScriptLiteral(input)};if(location.origin!=="${LINKEDIN_ORIGIN5}")throw new Error("unexpected LinkedIn origin");const removed=Object.hasOwn(globalThis,input.stagingKey);delete globalThis[input.stagingKey];return{removed}})()`;
}
function baseUploadEvaluationSource(bindings, expectedSubject, staging) {
  if (staging.byteLength < 24 || staging.byteLength > MAX_IMAGE_BYTES || staging.base64Length < 32 || staging.base64Length > MAX_IMAGE_BASE64_CHARACTERS || staging.chunkCount < 1 || staging.chunkCount > MAX_IMAGE_STAGING_CHUNKS) {
    throw new Error("LinkedIn post image is outside the reviewed byte bound");
  }
  const input = Object.freeze({
    expectedSubject,
    expectedBase64Length: staging.base64Length,
    expectedByteLength: staging.byteLength,
    expectedChunkCount: staging.chunkCount,
    pageInstance: bindings.pageInstance,
    stagingKey: staging.key,
    track: bindings.track
  });
  return `(async()=>{${commonEvaluationPrelude(input)}const chunks=globalThis[input.stagingKey];if(!Array.isArray(chunks)||chunks.length!==input.expectedChunkCount||chunks.length<1||chunks.length>${MAX_IMAGE_STAGING_CHUNKS})throw new Error("missing bounded LinkedIn image bytes");delete globalThis[input.stagingKey];if(Object.hasOwn(globalThis,input.stagingKey))throw new Error("LinkedIn image staging cleanup failed");let encoded="";for(let index=0;index<chunks.length;index+=1){const chunk=chunks[index];if(typeof chunk!=="string"||chunk.length<1||chunk.length>${IMAGE_STAGING_CHUNK_CHARACTERS}||!/^[A-Za-z0-9+/]*={0,2}$/.test(chunk))throw new Error("invalid LinkedIn image bytes");encoded+=chunk;chunks[index]=""}if(encoded.length!==input.expectedBase64Length||encoded.length>${MAX_IMAGE_BASE64_CHARACTERS})throw new Error("LinkedIn image changed encoded size");const binary=atob(encoded);encoded="";if(binary.length!==input.expectedByteLength||binary.length<24||binary.length>${MAX_IMAGE_BYTES})throw new Error("LinkedIn image changed size");const bytes=new Uint8Array(binary.length);for(let index=0;index<binary.length;index+=1)bytes[index]=binary.charCodeAt(index);const firstIdentity=await identity();assertIdentity(firstIdentity);const image=new Blob([bytes],{type:"image/png"});const mutationHeaders={...baseHeaders,"content-type":"application/json; charset=UTF-8","x-li-page-instance":input.pageInstance,"x-li-pem-metadata":"Voyager - Feed Images=register-vector-upload","x-li-track":input.track};const registrationBody=await requestJson("${LINKEDIN_IMAGE_REGISTRATION_PATH}",{body:JSON.stringify({fileSize:image.size,filename:"image.png",mediaUploadType:"IMAGE_SHARING"}),headers:mutationHeaders,method:"POST"},"LinkedIn image registration");const registrationEnvelope=registrationBody&&typeof registrationBody==="object"&&!Array.isArray(registrationBody)?registrationBody:null;if(registrationEnvelope===null)throw new Error("LinkedIn image registration changed shape");const registration=registrationEnvelope.data&&typeof registrationEnvelope.data==="object"&&!Array.isArray(registrationEnvelope.data)&&registrationEnvelope.data.value!==undefined?registrationEnvelope.data.value:registrationEnvelope.value!==undefined?registrationEnvelope.value:null;if(!registration||typeof registration!=="object"||Array.isArray(registration))throw new Error("LinkedIn image registration omitted its value");const allowedKeys=new Set(["mediaArtifactUrn","multipartMetadata","partUploadRequests","recipes","singleUploadHeaders","singleUploadUrl","type","urn"]);for(const key of Object.keys(registration))if(!allowedKeys.has(key))throw new Error("LinkedIn image registration returned an unreviewed field");if(!/^urn:li:(?:digitalmediaAsset|fsd_image):[A-Za-z0-9_(),.:%=-]{1,448}$/.test(registration.urn||""))throw new Error("LinkedIn image registration omitted its media URN");if(typeof registration.mediaArtifactUrn!=="string"||registration.mediaArtifactUrn.length<1||registration.mediaArtifactUrn.length>1024)throw new Error("LinkedIn image registration omitted its artifact URN");const checkedUrl=(value)=>{if(typeof value!=="string"||value.length<1||value.length>16384)throw new Error("LinkedIn image upload target changed shape");const url=new URL(value);if(url.protocol!=="https:"||url.username!==""||url.password!==""||url.hash!==""||url.port!==""||!(url.hostname==="linkedin.com"||url.hostname.endsWith(".linkedin.com")||url.hostname==="licdn.com"||url.hostname.endsWith(".licdn.com")))throw new Error("LinkedIn image upload target escaped its reviewed host family");return url};const checkedHeaders=(value,formData)=>{if(value===undefined)return {"csrf-token":csrf};if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).length>32)throw new Error("LinkedIn image upload headers changed shape");const output={};for(const [name,headerValue] of Object.entries(value)){const lower=name.toLowerCase();if(!/^[a-z0-9!#$%&'*+.^_|~-]{1,128}$/.test(lower)||typeof headerValue!=="string"||headerValue.length>8192||/[\\0\\r\\n]/.test(headerValue)||["cookie","host","content-length","origin","referer"].includes(lower)||lower.startsWith("sec-"))throw new Error("LinkedIn image upload headers changed shape");if(formData&&lower==="content-type")continue;output[lower]=headerValue}output["csrf-token"]=csrf;return output};const upload=async(urlValue,body,headers,formData)=>{const url=checkedUrl(urlValue);const response=await fetch(url.href,{body,credentials:url.origin===location.origin?"include":"omit",headers:checkedHeaders(headers,formData),method:"PUT",redirect:"error",referrer:"${LINKEDIN_FEED_URL3}"});if(response.status<200||response.status>=300)throw new Error("LinkedIn image upload status changed");return{headers:Object.fromEntries(response.headers.entries()),httpStatusCode:response.status}};if(registration.type==="SINGLE"||registration.type==="MULTIPART_FORMDATA"){if(registration.partUploadRequests!==undefined||registration.multipartMetadata!==undefined)throw new Error("LinkedIn single image upload returned multipart fields");await upload(registration.singleUploadUrl,image,registration.singleUploadHeaders,registration.type==="MULTIPART_FORMDATA")}else if(registration.type==="MULTIPART"){if(registration.singleUploadUrl!==undefined||registration.singleUploadHeaders!==undefined||!Array.isArray(registration.partUploadRequests)||registration.partUploadRequests.length<1||registration.partUploadRequests.length>20||!registration.multipartMetadata||typeof registration.multipartMetadata!=="object"||Array.isArray(registration.multipartMetadata)||JSON.stringify(registration.multipartMetadata).length>65536)throw new Error("LinkedIn multipart image registration changed shape");let next=0;const parts=[];for(const part of registration.partUploadRequests){if(!part||typeof part!=="object"||Array.isArray(part)||Object.keys(part).sort().join(",")!=="firstByte,headers,lastByte,uploadUrl"||!Number.isSafeInteger(part.firstByte)||!Number.isSafeInteger(part.lastByte)||part.firstByte!==next||part.lastByte<part.firstByte||part.lastByte>=image.size)throw new Error("LinkedIn multipart image offsets changed shape");parts.push(await upload(part.uploadUrl,image.slice(part.firstByte,part.lastByte+1,"image/png"),part.headers,false));next=part.lastByte+1}if(next!==image.size)throw new Error("LinkedIn multipart image registration did not cover the file");await requestJson("${LINKEDIN_IMAGE_FINALIZATION_PATH}",{body:JSON.stringify({completeUploadRequest:{mediaArtifactUrn:registration.mediaArtifactUrn,multipartMetadata:registration.multipartMetadata,partUploadResponses:parts}}),headers:mutationHeaders,method:"POST"},"LinkedIn image finalization")}else throw new Error("LinkedIn image upload mechanism changed");return{mediaUrn:registration.urn}})()`;
}
function replaceRequiredUploadSource(source, from, to) {
  const first = source.indexOf(from);
  if (first < 0 || source.indexOf(from, first + from.length) >= 0) {
    throw new Error("LinkedIn image upload source rewrite changed shape");
  }
  return source.replace(from, to);
}
function uploadEvaluationSource(bindings, expectedSubject, staging) {
  let source = baseUploadEvaluationSource(bindings, expectedSubject, staging);
  source = replaceRequiredUploadSource(source, 'const allowedKeys=new Set(["mediaArtifactUrn","multipartMetadata","partUploadRequests","recipes","singleUploadHeaders","singleUploadUrl","type","urn"]);', 'const allowedKeys=new Set(["$type","assetRealtimeTopic","mediaArtifactUrn","multipartMetadata","partUploadRequests","pollingUrl","recipes","singleUploadHeaders","singleUploadUrl","type","urn"]);if(registration.$type!==undefined&&registration.$type!=="com.linkedin.mediauploader.MediaUploadMetadata")throw new Error("LinkedIn image registration changed response type");if(registration.assetRealtimeTopic!==undefined&&(typeof registration.assetRealtimeTopic!=="string"||registration.assetRealtimeTopic.length<1||registration.assetRealtimeTopic.length>4096))throw new Error("LinkedIn image registration changed realtime topic");if(registration.recipes!==undefined&&(!Array.isArray(registration.recipes)||registration.recipes.length<1||registration.recipes.length>20||registration.recipes.some((recipe)=>typeof recipe!=="string"||!/^urn:li:[A-Za-z0-9_(),.:%=-]{1,448}$/.test(recipe))||new Set(registration.recipes).size!==registration.recipes.length))throw new Error("LinkedIn image registration changed recipes");');
  source = replaceRequiredUploadSource(source, "const checkedHeaders=(value,formData)=>{", "if(registration.pollingUrl!==undefined)checkedUrl(registration.pollingUrl);const checkedHeaders=(value,formData)=>{");
  source = replaceRequiredUploadSource(source, 'if(registration.type==="SINGLE"||registration.type==="MULTIPART_FORMDATA"){', 'if(registration.type==="SINGLE"||registration.type==="MULTIPART_FORMDATA"||registration.type==="VECTOR"){if(registration.type==="VECTOR"&&(!registration.singleUploadHeaders||typeof registration.singleUploadHeaders!=="object"||Array.isArray(registration.singleUploadHeaders)||Object.keys(registration.singleUploadHeaders).sort().join(",")!=="media-type-family"||registration.singleUploadHeaders["media-type-family"]!=="STILLIMAGE"))throw new Error("LinkedIn vector image upload headers changed shape");');
  return source;
}
function baseCreateEvaluationSource(bindings, expectedSubject, expectedProfileUrn, variables, mediaUrn) {
  const input = Object.freeze({
    expectedProfileUrn,
    expectedSubject,
    mediaUrn,
    pageInstance: bindings.pageInstance,
    track: bindings.track,
    variables
  });
  return `(async()=>{${commonEvaluationPrelude(input)}const firstIdentity=await identity();assertIdentity(firstIdentity);const mutationHeaders={...baseHeaders,"content-type":"application/json; charset=UTF-8","x-li-page-instance":input.pageInstance,"x-li-pem-metadata":"Voyager - Sharing - CreateShare=sharing-create-content","x-li-track":input.track};const createPath="${LINKEDIN_GRAPHQL_PATH}?action=execute&queryId=${encodeURIComponent(LINKEDIN_POST_CREATE_MUTATION_ID)}";const createBody=await requestJson(createPath,{body:JSON.stringify({includeWebMetadata:true,queryId:"${LINKEDIN_POST_CREATE_MUTATION_ID}",variables:input.variables}),headers:mutationHeaders,method:"POST"},"LinkedIn post create");const createPayload=createBody&&typeof createBody==="object"&&!Array.isArray(createBody)&&createBody.data&&typeof createBody.data==="object"&&!Array.isArray(createBody.data)&&createBody.data.value&&typeof createBody.data.value==="object"&&!Array.isArray(createBody.data.value)?createBody.data.value:createBody&&typeof createBody==="object"&&!Array.isArray(createBody)&&createBody.value&&typeof createBody.value==="object"&&!Array.isArray(createBody.value)?createBody.value:createBody;if(!createPayload||typeof createPayload!=="object"||Array.isArray(createPayload))throw new Error("LinkedIn GraphQL response changed shape");if(Array.isArray(createPayload.errors)&&createPayload.errors.length>0)throw new Error("LinkedIn post create returned provider errors");const entity=createPayload.data?.createContentcreationDashShares?.entity;if(!entity||typeof entity!=="object"||Array.isArray(entity))throw new Error("LinkedIn post create omitted its entity");const entityUrn=entity.entityUrn;if(!/^urn:li:(?:fsd_share|share|ugcPost):[A-Za-z0-9_(),.:%=-]{1,448}$/.test(entityUrn||""))throw new Error("LinkedIn post create returned an invalid entity URN");if(!entity.status||typeof entity.status!=="object"||Array.isArray(entity.status)||!entity.status.lifecycleState||typeof entity.status.lifecycleState!=="object"||Array.isArray(entity.status.lifecycleState)||!entity.status.lifecycleState.PublishedState||typeof entity.status.lifecycleState.PublishedState!=="object"||Array.isArray(entity.status.lifecycleState.PublishedState))throw new Error("LinkedIn post create did not report a published lifecycle");return{entityUrn}})()`;
}
function createEvaluationSource(bindings, expectedSubject, expectedProfileUrn, variables, mediaUrn) {
  return replaceRequiredUploadSource(baseCreateEvaluationSource(bindings, expectedSubject, expectedProfileUrn, variables, mediaUrn), 'const entity=createPayload.data?.createContentcreationDashShares?.entity;if(!entity||typeof entity!=="object"||Array.isArray(entity))throw new Error("LinkedIn post create omitted its entity");', 'const entity=createPayload.data?.createContentcreationDashShares?.entity;if(!entity||typeof entity!=="object"||Array.isArray(entity)){const direct=createPayload.createContentcreationDashShares?.entity;const alternate=createBody&&typeof createBody==="object"&&!Array.isArray(createBody)?createBody.data?.createContentcreationDashShares?.entity:null;if(direct&&typeof direct==="object"&&!Array.isArray(direct))throw new Error("LinkedIn post create entity used direct nesting");if(alternate&&typeof alternate==="object"&&!Array.isArray(alternate))throw new Error("LinkedIn post create entity used alternate data nesting");if(createBody&&typeof createBody==="object"&&!Array.isArray(createBody)&&Array.isArray(createBody.included)&&createBody.included.length>0)throw new Error("LinkedIn post create returned normalized included entities");throw new Error("LinkedIn post create omitted its entity")}');
}
function readbackEvaluationSource(bindings, expectedSubject, expectedProfileUrn, variables, mediaUrn, entityUrn) {
  const input = Object.freeze({
    entityUrn,
    expectedProfileUrn,
    expectedSubject,
    mediaUrn,
    pageInstance: bindings.pageInstance,
    track: bindings.track,
    variables
  });
  return `(async()=>{${commonEvaluationPrelude(input)}const graphqlEnvelope=(body)=>{if(!body||typeof body!=="object"||Array.isArray(body))throw new Error("LinkedIn GraphQL response changed shape");const value=body.data&&typeof body.data==="object"&&!Array.isArray(body.data)&&body.data.value&&typeof body.data.value==="object"&&!Array.isArray(body.data.value)?body.data.value:body.value&&typeof body.value==="object"&&!Array.isArray(body.value)?body.value:body;return value};const variablesText="(moduleKey:feed-item:desktop,urnOrNss:"+input.entityUrn+")";const readbackPath="${LINKEDIN_GRAPHQL_PATH}?includeWebMetadata=true&queryId=${encodeURIComponent(LINKEDIN_POST_READBACK_QUERY_ID)}&variables="+encodeURIComponent(variablesText);const readbackBody=await requestJson(readbackPath,{headers:baseHeaders,method:"GET"},"LinkedIn post readback");const readbackPayload=graphqlEnvelope(readbackBody);if(Array.isArray(readbackPayload.errors)&&readbackPayload.errors.length>0)throw new Error("LinkedIn post readback returned provider errors");const elements=readbackPayload.data?.feedDashUpdatesByBackendUrnOrNss?.elements;if(!Array.isArray(elements)||elements.length!==1||!elements[0]||typeof elements[0]!=="object"||Array.isArray(elements[0]))throw new Error("LinkedIn post readback omitted its exact update");const update=elements[0];let visited=0;const contains=(value,expected,depth=0)=>{if(++visited>50000||depth>32)throw new Error("LinkedIn post readback exceeded its reviewed shape");if(value===expected)return true;if(Array.isArray(value))return value.some((item)=>contains(item,expected,depth+1));if(value&&typeof value==="object")return Object.values(value).some((item)=>contains(item,expected,depth+1));return false};const withinNamed=(value,name,expected,depth=0)=>{if(depth>32||!value||typeof value!=="object")return false;if(Array.isArray(value))return value.some((item)=>withinNamed(item,name,expected,depth+1));for(const [key,item] of Object.entries(value)){if(key===name&&contains(item,expected,depth+1))return true;if(withinNamed(item,name,expected,depth+1))return true}return false};visited=0;const entityMatched=contains(update,input.entityUrn);visited=0;const actorMatched=withinNamed(update,"actor",input.expectedProfileUrn);visited=0;const textMatched=withinNamed(update,"commentary",input.variables.post.commentary.text);visited=0;const mediaMatched=input.mediaUrn===null?false:contains(update,input.mediaUrn);if(!entityMatched||!actorMatched||!textMatched||(input.mediaUrn!==null&&!mediaMatched))throw new Error("LinkedIn independent post readback did not bind the confirmed post");const id=input.entityUrn.slice(input.entityUrn.lastIndexOf(":")+1);if(!/^[A-Za-z0-9_(),.=%-]{1,448}$/.test(id))throw new Error("LinkedIn post entity ID changed shape");const url="${LINKEDIN_ORIGIN5}/feed/update/urn:li:activity:"+id+"/";return{actorMatched,entityMatched,entityUrn:input.entityUrn,lifecycle:"PUBLISHED",mediaMatched,mediaUrn:input.mediaUrn,textMatched,url}})()`;
}
async function finalizeBrowserSession4(session) {
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
  if (closeVerified && cleanupVerified)
    return;
  const cleanupEvidence = closeVerified && !cleanupVerified && session.cleanupResourceIdentity !== undefined ? Object.freeze({
    kind: "agent-browser-closed-artifacts-v1",
    resource: session.cleanupResourceIdentity
  }) : undefined;
  throw new PreservedBrowserArtifactsError("LinkedIn post browser finalization failed; private artifacts were preserved", session.recoveryHandle ?? "session=linkedin-post-runtime;artifacts=unknown", new AggregateError(failures, "LinkedIn post browser finalization failed"), cleanupEvidence);
}
async function createLinkedInPostBrowserTransport(auth, options) {
  const createSession = options.dependencies?.createBrowserSession ?? createBrowserSession;
  const sessionOptions = {
    allowCodeOwnedEvaluation: true,
    allowCodeOwnedNetworkObservation: true,
    headed: true,
    maxOutputBytes: MAX_BROWSER_OUTPUT_BYTES2,
    timeoutMs: options.timeoutMs,
    ...options.operationDeadline === undefined ? {} : { operationDeadline: options.operationDeadline },
    ...options.publishCleanupResource === undefined ? {} : { publishCleanupResource: options.publishCleanupResource }
  };
  const session = await createSession(postBrowserManifest, auth, sessionOptions);
  let closed = false;
  const remaining = () => options.operationDeadline?.remainingTimeMs() ?? options.timeoutMs;
  const runEvaluations = async (sources) => {
    if (closed)
      throw new Error("LinkedIn post browser transport is closed");
    const records = await session.runBatch(sources.map((source) => ["eval", source]), remaining(), MAX_BROWSER_OUTPUT_BYTES2);
    if (records.length !== sources.length) {
      throw new Error("LinkedIn post browser omitted an evaluation response");
    }
    return Object.freeze(records.map((record2) => browserEvaluationResult3(record2)));
  };
  const run = async (source) => {
    const first = (await runEvaluations([source]))[0];
    if (first === undefined)
      throw new Error("LinkedIn post browser omitted its response");
    return first;
  };
  let bindings;
  try {
    await session.runBatch([["open", LINKEDIN_FEED_URL3], ["wait", "5000"]], remaining(), MAX_BROWSER_OUTPUT_BYTES2);
    const records = await session.runBatch([["network", "requests", "--filter", "/voyager/api/"]], Math.min(remaining(), 30000), MAX_BROWSER_OUTPUT_BYTES2);
    const first = records[0];
    if (first === undefined)
      throw new Error("LinkedIn post page-binding observation omitted its response");
    bindings = linkedInPostPageBindings(browserResultData(first));
  } catch (error) {
    try {
      await finalizeBrowserSession4(session);
    } catch (cleanupError) {
      throw cleanupError;
    }
    throw error;
  }
  return Object.freeze({
    currentIdentityResponse: async () => {
      const result = await run(identityEvaluationSource());
      exactKeys4(result, ["body", "contentType", "status"], "LinkedIn current-member browser request");
      if (result.status !== 200) {
        throw new Error("LinkedIn current-member browser request returned an unreviewed response");
      }
      return result.body;
    },
    uploadImage: async (expectedSubject, image) => {
      if (image.byteLength < 24 || image.byteLength > MAX_IMAGE_BYTES) {
        throw new Error("LinkedIn post image is outside the reviewed byte bound");
      }
      const encoded = Buffer.from(image).toString("base64");
      const chunkCount = Math.ceil(encoded.length / IMAGE_STAGING_CHUNK_CHARACTERS);
      const staging = Object.freeze({
        key: `__ghostgetLinkedInPostImage_${randomUUID2().replaceAll("-", "")}`,
        byteLength: image.byteLength,
        base64Length: encoded.length,
        chunkCount
      });
      let failureStage = "page image staging";
      try {
        const initialized = await run(imageStagingInitializationSource(staging));
        exactKeys4(initialized, ["ready"], "LinkedIn image staging initialization");
        if (initialized.ready !== true) {
          throw new Error("LinkedIn image staging initialization changed shape");
        }
        const sources = [];
        for (let index = 0;index < chunkCount; index += 1) {
          const offset = index * IMAGE_STAGING_CHUNK_CHARACTERS;
          sources.push(imageStagingChunkSource(staging, index, encoded.slice(offset, offset + IMAGE_STAGING_CHUNK_CHARACTERS)));
        }
        for (let offset = 0;offset < sources.length; offset += IMAGE_STAGING_COMMANDS_PER_BATCH) {
          const batch = sources.slice(offset, offset + IMAGE_STAGING_COMMANDS_PER_BATCH);
          const staged = await runEvaluations(batch);
          for (let index = 0;index < staged.length; index += 1) {
            const result2 = staged[index];
            exactKeys4(result2, ["staged"], "LinkedIn image staging command");
            if (result2.staged !== offset + index + 1) {
              throw new Error("LinkedIn image staging command changed order");
            }
          }
        }
        failureStage = "image registration or upload response";
        const result = await run(uploadEvaluationSource(bindings, expectedSubject, staging));
        exactKeys4(result, ["mediaUrn"], "LinkedIn image upload browser request");
        return linkedInPostMediaUrn(result.mediaUrn);
      } catch (error) {
        throw new LinkedInPostImagePreparationError(failureStage === "page image staging" ? failureStage : linkedInPostImageFailureStage(error), error);
      } finally {
        try {
          await run(imageStagingCleanupSource(staging.key));
        } catch {}
      }
    },
    createPost: async (expectedSubject, expectedProfileUrn, variables, mediaUrn) => {
      try {
        const result = await run(createEvaluationSource(bindings, expectedSubject, expectedProfileUrn, variables, mediaUrn));
        exactKeys4(result, ["entityUrn"], "LinkedIn post create browser request");
        return linkedInPostEntityUrn(result.entityUrn);
      } catch (error) {
        throw new LinkedInPostCreateResponseError(error);
      }
    },
    readPost: async (expectedSubject, expectedProfileUrn, variables, mediaUrn, entityUrn) => {
      const result = await run(readbackEvaluationSource(bindings, expectedSubject, expectedProfileUrn, variables, mediaUrn, linkedInPostEntityUrn(entityUrn)));
      return result;
    },
    close: async () => {
      if (closed)
        return;
      closed = true;
      await finalizeBrowserSession4(session);
    }
  });
}

// src/providers/linkedin-web-runtime.ts
var LINKEDIN_ORIGIN6 = "https://www.linkedin.com";
var MAX_SUBJECT_BYTES = 2 * 1024 * 1024;
var LINKEDIN_COOKIE_ROTATION_NAMESPACE = "linkedin-cookie-rotation";
var LINKEDIN_ROTATING_COOKIE_NAMES = Object.freeze(["__cf_bm"]);
var LINKEDIN_ROTATING_COOKIE_MAX_CACHE_AGE_SECONDS = 24 * 60 * 60;
var LINKEDIN_ROTATING_COOKIE_TOMBSTONE_TTL_SECONDS = 60 * 60;
var MAX_LINKEDIN_ARTICLE_BLOCKS = 5000;
var MAX_LINKEDIN_ARTICLE_CHARACTERS = 125000;
var MAX_LINKEDIN_ARTICLE_INLINE_IMAGES = 20;
var MAX_LINKEDIN_ARTICLE_IMAGE_BYTES = 5 * 1024 * 1024;
var MAX_LINKEDIN_POST_IMAGE_BYTES = 20 * 1024 * 1024;
function isRecord7(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function record2(value, label) {
  if (!isRecord7(value))
    throw new Error(`${label} must be an object`);
  return value;
}
function exactKeys5(value, keys, label) {
  if (Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) {
    throw new Error(`${label} has unsupported fields`);
  }
}
var LINKEDIN_COOKIE_KEYS = Object.freeze([
  "name",
  "value",
  "domain",
  "hostOnly",
  "path",
  "secure",
  "httpOnly",
  "sameSite",
  "expires"
]);
function parseCachedLinkedInCookie(value, acceptedAtSeconds, nowSeconds, includesAcceptanceTime) {
  const cookie = record2(value, "LinkedIn rotating-cookie cache entry");
  const expectedKeys = includesAcceptanceTime ? [...LINKEDIN_COOKIE_KEYS, "acceptedAtSeconds"] : [...LINKEDIN_COOKIE_KEYS];
  exactKeys5(cookie, expectedKeys, "LinkedIn rotating-cookie cache entry");
  if (!LINKEDIN_ROTATING_COOKIE_NAMES.includes(cookie.name))
    throw new Error("LinkedIn rotating-cookie cache contains an unreviewed cookie");
  if (typeof cookie.expires !== "number" || !Number.isSafeInteger(cookie.expires) || cookie.expires < 0 || cookie.expires > 253402300799)
    throw new Error("LinkedIn rotating-cookie cache has an invalid expiry");
  const expired = cookie.expires > 0 && cookie.expires <= nowSeconds;
  const candidate = { ...cookie };
  delete candidate.acceptedAtSeconds;
  if (expired)
    candidate.expires = 0;
  const validated = filterCookies([candidate], new URL(LINKEDIN_ORIGIN6), nowSeconds);
  if (validated.rejected !== 0 || validated.cookies.length !== 1) {
    throw new Error("LinkedIn rotating-cookie cache is malformed");
  }
  const parsed = validated.cookies[0];
  if (parsed === undefined)
    throw new Error("LinkedIn rotating-cookie cache is malformed");
  if (expired || !includesAcceptanceTime && parsed.expires === 0)
    return null;
  return Object.freeze({ acceptedAtSeconds, cookie: parsed });
}
function parseCachedLinkedInCookies(value) {
  if (value === null) {
    return Object.freeze({
      cookies: Object.freeze([]),
      tombstones: Object.freeze([])
    });
  }
  const cache = record2(value, "LinkedIn rotating-cookie cache");
  if (cache.schemaVersion === 1) {
    exactKeys5(cache, ["schemaVersion", "origin", "cookies"], "LinkedIn rotating-cookie cache");
  } else if (cache.schemaVersion === 2) {
    exactKeys5(cache, ["schemaVersion", "origin", "cookies", "tombstones"], "LinkedIn rotating-cookie cache");
  } else {
    throw new Error("LinkedIn rotating-cookie cache is malformed");
  }
  if (cache.origin !== LINKEDIN_ORIGIN6 || !Array.isArray(cache.cookies) || cache.cookies.length > 4 || cache.schemaVersion === 2 && (!Array.isArray(cache.tombstones) || cache.tombstones.length > 4))
    throw new Error("LinkedIn rotating-cookie cache is malformed");
  const nowSeconds = Math.floor(Date.now() / 1000);
  const cookies = [];
  for (const item of cache.cookies) {
    const raw = record2(item, "LinkedIn rotating-cookie cache entry");
    const acceptedAtSeconds = cache.schemaVersion === 1 ? nowSeconds : raw.acceptedAtSeconds;
    if (!Number.isSafeInteger(acceptedAtSeconds) || acceptedAtSeconds < 0 || acceptedAtSeconds > nowSeconds + 300)
      throw new Error("LinkedIn rotating-cookie cache has an invalid acceptance time");
    const parsed = parseCachedLinkedInCookie(item, acceptedAtSeconds, nowSeconds, cache.schemaVersion === 2);
    if (parsed !== null)
      cookies.push(parsed);
  }
  const tombstones = [];
  if (cache.schemaVersion === 2) {
    for (const item of cache.tombstones) {
      const tombstone = record2(item, "LinkedIn rotating-cookie cache tombstone");
      exactKeys5(tombstone, ["acceptedAtSeconds", "name", "domain", "hostOnly", "path"], "LinkedIn rotating-cookie cache tombstone");
      if (!Number.isSafeInteger(tombstone.acceptedAtSeconds) || tombstone.acceptedAtSeconds < 0 || tombstone.acceptedAtSeconds > nowSeconds + 300 || !LINKEDIN_ROTATING_COOKIE_NAMES.includes(tombstone.name) || typeof tombstone.domain !== "string" || typeof tombstone.hostOnly !== "boolean" || typeof tombstone.path !== "string")
        throw new Error("LinkedIn rotating-cookie cache tombstone is malformed");
      tombstones.push(Object.freeze({
        acceptedAtSeconds: tombstone.acceptedAtSeconds,
        domain: tombstone.domain,
        hostOnly: tombstone.hostOnly,
        name: tombstone.name,
        path: tombstone.path
      }));
    }
  }
  return Object.freeze({
    cookies: Object.freeze(cookies),
    tombstones: Object.freeze(tombstones)
  });
}
function linkedInRotationIdentity(value) {
  return `${value.domain}\x00${value.hostOnly ? "host" : "domain"}\x00${value.path}\x00${value.name}`;
}
function linkedInRotationCandidates(state) {
  const candidates = new Map;
  for (const entry of state.cookies) {
    const identity = linkedInRotationIdentity(entry.cookie);
    if (candidates.has(identity)) {
      throw new Error("LinkedIn rotating-cookie cache contains a duplicate");
    }
    candidates.set(identity, Object.freeze({
      kind: "cookie",
      acceptedAtSeconds: entry.acceptedAtSeconds,
      entry
    }));
  }
  for (const entry of state.tombstones) {
    const identity = linkedInRotationIdentity(entry);
    if (candidates.has(identity)) {
      throw new Error("LinkedIn rotating-cookie cache contains a duplicate");
    }
    candidates.set(identity, Object.freeze({
      kind: "tombstone",
      acceptedAtSeconds: entry.acceptedAtSeconds,
      entry
    }));
  }
  return candidates;
}
function sameLinkedInRotationCandidate(left, right) {
  return left.kind === right.kind && canonicalJson(left.entry) === canonicalJson(right.entry);
}
function mergeLinkedInRotationStates(attempted, latest) {
  const merged = new Map(linkedInRotationCandidates(latest));
  for (const [identity, candidate] of linkedInRotationCandidates(attempted)) {
    const current = merged.get(identity);
    if (current === undefined || candidate.acceptedAtSeconds > current.acceptedAtSeconds) {
      merged.set(identity, candidate);
      continue;
    }
    if (candidate.acceptedAtSeconds < current.acceptedAtSeconds)
      continue;
    if (!sameLinkedInRotationCandidate(candidate, current)) {
      throw new Error("LinkedIn rotating session state changed concurrently without a safe ordering");
    }
  }
  const cookies = [];
  const tombstones = [];
  for (const [, candidate] of [...merged].sort(([left], [right]) => left.localeCompare(right))) {
    if (candidate.kind === "cookie")
      cookies.push(candidate.entry);
    else
      tombstones.push(candidate.entry);
  }
  if (cookies.length > 4 || tombstones.length > 4) {
    throw new Error("LinkedIn rotating session state changed concurrently beyond its reviewed bounds");
  }
  return Object.freeze({
    cookies: Object.freeze(cookies),
    tombstones: Object.freeze(tombstones)
  });
}
function cachedLinkedInCookiesValue(state) {
  return Object.freeze({
    schemaVersion: 2,
    origin: LINKEDIN_ORIGIN6,
    cookies: Object.freeze(state.cookies.map(({ acceptedAtSeconds, cookie }) => Object.freeze({ ...cookie, acceptedAtSeconds }))),
    tombstones: Object.freeze(state.tombstones.map((tombstone) => Object.freeze({ ...tombstone })))
  });
}
function linkedInCacheHasOrderedProvenance(value, contentSha256) {
  if (value === null)
    return contentSha256 === null;
  return isRecord7(value) && value.schemaVersion === 2;
}
async function loadLinkedInCookieSnapshot(auth, authHash, dependencies) {
  if (dependencies?.loadCachedCookies === undefined !== (dependencies?.saveCachedCookies === undefined)) {
    throw new Error("LinkedIn rotating-session cache dependencies must be provided together");
  }
  return dependencies?.loadCachedCookies === undefined ? readSessionSecretSnapshot(LINKEDIN_COOKIE_ROTATION_NAMESPACE, auth.id, authHash) : dependencies.loadCachedCookies(auth, authHash);
}
async function saveLinkedInCookieSnapshot(auth, authHash, value, expectedContentSha256, dependencies) {
  return dependencies?.saveCachedCookies === undefined ? writeSessionSecretIfUnchanged(LINKEDIN_COOKIE_ROTATION_NAMESPACE, auth.id, authHash, value, expectedContentSha256) : dependencies.saveCachedCookies(auth, authHash, value, expectedContentSha256);
}
async function createLinkedInClient(auth, timeoutMs, dependencies, budget = {}) {
  const authHash = sha256(canonicalJson(auth));
  const initialSnapshot = await loadLinkedInCookieSnapshot(auth, authHash, dependencies);
  let expectedContentSha256 = initialSnapshot.contentSha256;
  let cacheHasOrderedProvenance = linkedInCacheHasOrderedProvenance(initialSnapshot.value, initialSnapshot.contentSha256);
  const cachedState = validateWebSessionAuthState(() => parseCachedLinkedInCookies(initialSnapshot.value));
  return createWebSessionClient(LINKEDIN_ORIGIN6, auth, {
    timeoutMs,
    ...budget.signal === undefined ? {} : { signal: budget.signal },
    ...budget.operationDeadline === undefined ? {} : { operationDeadline: budget.operationDeadline },
    ...dependencies === undefined ? {} : { dependencies },
    cookieRotation: {
      allowedNames: LINKEDIN_ROTATING_COOKIE_NAMES,
      cachedState,
      maxCachedCookieAgeSeconds: LINKEDIN_ROTATING_COOKIE_MAX_CACHE_AGE_SECONDS,
      tombstoneTtlSeconds: LINKEDIN_ROTATING_COOKIE_TOMBSTONE_TTL_SECONDS,
      save: async (state) => {
        const value = validateWebSessionAuthState(() => cachedLinkedInCookiesValue(state));
        const saved = await saveLinkedInCookieSnapshot(auth, authHash, value, expectedContentSha256, dependencies);
        if (saved.written) {
          expectedContentSha256 = saved.contentSha256;
          cacheHasOrderedProvenance = true;
          return;
        }
        const latestSnapshot = await loadLinkedInCookieSnapshot(auth, authHash, dependencies);
        if (latestSnapshot.contentSha256 === null || latestSnapshot.contentSha256 === expectedContentSha256) {
          throw new Error("LinkedIn rotating session state changed concurrently; retry with a fresh session");
        }
        if (!cacheHasOrderedProvenance || !linkedInCacheHasOrderedProvenance(latestSnapshot.value, latestSnapshot.contentSha256)) {
          throw new Error("LinkedIn rotating session state changed concurrently without ordered provenance");
        }
        const latest = validateWebSessionAuthState(() => parseCachedLinkedInCookies(latestSnapshot.value));
        const merged = validateWebSessionAuthState(() => mergeLinkedInRotationStates(state, latest));
        if (canonicalJson(merged) !== canonicalJson(latest)) {
          const reconciled = await saveLinkedInCookieSnapshot(auth, authHash, cachedLinkedInCookiesValue(merged), latestSnapshot.contentSha256, dependencies);
          if (!reconciled.written) {
            throw new Error("LinkedIn rotating session state changed repeatedly; retry with a fresh session");
          }
        }
        throw new Error("LinkedIn rotating session state was reconciled concurrently; retry with a fresh session");
      }
    }
  });
}
function responseErrors(value, label) {
  if (value.serviceErrorCode !== undefined)
    throw new Error(`${label} contained a service error`);
  if (value.errors !== undefined) {
    if (!Array.isArray(value.errors) || value.errors.length > 0)
      throw new Error(`${label} contained provider errors`);
  }
  if (typeof value.status === "number" && value.status >= 400)
    throw new Error(`${label} contained a failure status`);
}
function headers(csrf, referer) {
  return {
    accept: "application/vnd.linkedin.normalized+json+2.1",
    "csrf-token": csrf,
    referer,
    "x-li-lang": "en_US",
    "x-requested-with": "XMLHttpRequest",
    "x-restli-protocol-version": "2.0.0"
  };
}
function linkedInMemberIdFromUrn(value) {
  if (typeof value !== "string")
    return null;
  return /^urn:li:(?:fsd_profile|member):([0-9]{1,32})$/u.exec(value)?.[1] ?? null;
}
function linkedInMiniProfileUrn(value) {
  if (typeof value !== "string" || value.length > 512)
    return null;
  return /^urn:li:fs_miniProfile:[A-Za-z0-9_-]{1,256}$/u.test(value) ? value : null;
}
function optionalLinkedInPublicIdentifier(value) {
  return value === undefined || value === null ? null : linkedInPersonalProfilePublicIdentifier(value);
}
function identityFromMeResponse(value) {
  const envelope = record2(value, "LinkedIn /voyager/api/me response");
  responseErrors(envelope, "LinkedIn /voyager/api/me response");
  const data = record2(envelope.data, "LinkedIn /voyager/api/me response.data");
  const primaryId = typeof data.plainId === "string" && /^[0-9]{1,32}$/u.test(data.plainId) ? data.plainId : Number.isSafeInteger(data.plainId) && data.plainId > 0 ? String(data.plainId) : null;
  if (primaryId === null) {
    throw new Error("LinkedIn /voyager/api/me omitted its exact primary member subject");
  }
  const included = envelope.included === undefined ? [] : envelope.included;
  if (!Array.isArray(included) || included.length > 1e4) {
    throw new Error("LinkedIn /voyager/api/me response.included must be a bounded array");
  }
  const entities = [];
  for (const item of included) {
    if (!isRecord7(item))
      throw new Error("LinkedIn /voyager/api/me included an invalid entity");
    entities.push(item);
  }
  const profileReferences = [data["*miniProfile"], data.miniProfile].filter((reference) => reference !== undefined);
  if (profileReferences.length > 1) {
    throw new Error("LinkedIn /voyager/api/me included ambiguous normalized profile references");
  }
  if (profileReferences.length === 1) {
    const reference = linkedInMiniProfileUrn(profileReferences[0]);
    if (reference === null) {
      throw new Error("LinkedIn /voyager/api/me included an invalid normalized profile reference");
    }
    const referenced = entities.filter((item) => item.entityUrn === reference || item.urn === reference);
    if (referenced.length === 0) {
      throw new Error("LinkedIn /voyager/api/me did not corroborate its normalized profile reference");
    }
    if (referenced.length !== 1) {
      throw new Error("LinkedIn /voyager/api/me included an ambiguous normalized profile reference");
    }
    const memberId = typeof referenced[0]?.objectUrn === "string" ? /^urn:li:member:([0-9]{1,32})$/u.exec(referenced[0].objectUrn)?.[1] ?? null : null;
    if (memberId === null) {
      throw new Error("LinkedIn /voyager/api/me did not bind its normalized profile to one member subject");
    }
    if (memberId !== primaryId) {
      throw new Error("LinkedIn /voyager/api/me included a conflicting member subject");
    }
    return Object.freeze({
      subject: `urn:li:fsd_profile:${primaryId}`,
      mailboxUrn: linkedInMailboxUrnFromMiniProfile(reference),
      profileUrn: linkedInMailboxUrnFromMiniProfile(reference),
      publicIdentifier: optionalLinkedInPublicIdentifier(referenced[0]?.publicIdentifier)
    });
  }
  const corroboratedEntities = entities.filter((item) => ["entityUrn", "backendUrn", "objectUrn", "urn"].some((field) => linkedInMemberIdFromUrn(item[field]) === primaryId));
  if (corroboratedEntities.length === 0) {
    throw new Error("LinkedIn /voyager/api/me did not corroborate its primary member subject");
  }
  const publicIdentifiers = new Set(corroboratedEntities.flatMap((item) => {
    const publicIdentifier = optionalLinkedInPublicIdentifier(item.publicIdentifier);
    return publicIdentifier === null ? [] : [publicIdentifier];
  }));
  if (publicIdentifiers.size > 1) {
    throw new Error("LinkedIn /voyager/api/me included conflicting public profile identifiers for its primary member subject");
  }
  return Object.freeze({
    subject: `urn:li:fsd_profile:${primaryId}`,
    mailboxUrn: null,
    profileUrn: null,
    publicIdentifier: publicIdentifiers.values().next().value ?? null
  });
}
async function currentIdentity(client, csrf) {
  const response = await client.requestJson({
    url: new URL("/voyager/api/me", LINKEDIN_ORIGIN6),
    method: "GET",
    headers: headers(csrf, `${LINKEDIN_ORIGIN6}/feed/`),
    expectedContentTypes: ["application/vnd.linkedin.normalized+json+2.1", "application/json"],
    maxBytes: MAX_SUBJECT_BYTES
  });
  return identityFromMeResponse(response);
}
async function probeLinkedInWebSubject(auth, options = {}) {
  if (auth.kind === "browser-profile") {
    const timeoutMs = options.timeoutMs ?? 60000;
    const deadline = new OperationDeadline(timeoutMs, {
      ...options.signal === undefined ? {} : { signal: options.signal }
    });
    const createTransport = options.dependencies?.createProfileBrowserTransport ?? createLinkedInProfileBrowserTransport;
    let transport = null;
    try {
      deadline.throwIfUnavailable("authenticated web subject probe");
      transport = await deadline.run(() => createTransport(auth, {
        timeoutMs,
        maxOutputBytes: MAX_SUBJECT_BYTES,
        operationDeadline: deadline
      }), "authenticated web subject probe");
      return identityFromMeResponse(await deadline.run(() => transport.currentIdentityResponse(), "authenticated web subject probe")).subject;
    } finally {
      try {
        await transport?.close();
      } finally {
        deadline.dispose();
      }
    }
  }
  const client = await createLinkedInClient(auth, options.timeoutMs ?? 60000, options.dependencies, {
    ...options.signal === undefined ? {} : { signal: options.signal }
  });
  const csrf = linkedInCsrfTokenFromJSessionId(webSessionCookie(client.cookies, "JSESSIONID"));
  return (await currentIdentity(client, csrf)).subject;
}
function boundLinkedInStatsIdentity(auth, identity) {
  const expected = webSessionAuthSubject(auth);
  if (expected === null || expected !== identity.subject) {
    throw new Error("LinkedIn current member no longer matches the bound auth subject");
  }
  return expected;
}
function linkedInHtmlHeaders(referer) {
  return Object.freeze({
    accept: "text/html",
    "accept-language": "en-US,en;q=0.9",
    referer
  });
}
function linkedInProfileStatsFailure(error, target, requestStage) {
  const message = error instanceof Error ? error.message : "";
  const browserFailureStage = error instanceof LinkedInProfileBrowserFailure ? {
    authwall: "signed-out authwall",
    "body-envelope": "bounded response body envelope",
    bootstrap: "contained-browser origin bootstrap",
    "browser-envelope": "contained-browser command envelope",
    "browser-command": "contained-browser command",
    "execution-context": "contained-browser execution context",
    "identity-json": "signed-in identity JSON",
    "output-bound": "contained-browser output bound",
    "provider-fetch": "contained-browser first-party fetch",
    "response-envelope": "bounded response envelope",
    "response-rejected": "first-party page response",
    "session-cookie": "signed-in browser CSRF cookie",
    startup: "contained-browser startup"
  }[error.category] : null;
  const typedStage = error instanceof LinkedInProfileBrowserResponseRejectedError ? `first-party page response ${error.status}/${error.contentType}` : browserFailureStage;
  const stage = typedStage ?? (message.includes("current member") || message.includes("cookie") || message.includes("session") ? "signed-in account binding" : message.includes("byte") || message.includes("size") ? "bounded page read" : message.includes("follower") ? "exact follower projection" : message.includes("connection") ? "exact connection projection" : message.includes("Company") || message.includes("FollowingState") || message.includes("universal name") ? "target company-state projection" : message.includes("status") || message.includes("content type") ? "first-party page response" : "reviewed response projection");
  return `LinkedIn ${target} profile stats failed during ${requestStage} at ${stage}; no remote write occurred`;
}
async function createLinkedInStatsBrowserTransport(auth, recipe, options) {
  const createTransport = options.dependencies?.createProfileBrowserTransport ?? createLinkedInProfileBrowserTransport;
  return createTransport(auth, {
    timeoutMs: recipe.timeoutMs,
    maxOutputBytes: recipe.maxOutputBytes,
    ...options.operationDeadline === undefined ? {} : { operationDeadline: options.operationDeadline },
    ...options.publishCleanupResource === undefined ? {} : { publishCleanupResource: options.publishCleanupResource }
  });
}
async function executeLinkedInContactInfoRead(recipe, input, auth, options) {
  const target = linkedInContactInfoTarget(input.profile_url);
  return runReadEffect(linkedInContactReadProgram(target).pipe(Effect9.provide(LinkedInContactPlatformLive({
    openBrowser: () => createLinkedInStatsBrowserTransport(auth, recipe, options),
    decodeIdentity: identityFromMeResponse,
    bindIdentity: (identity) => boundLinkedInStatsIdentity(auth, identity),
    observedAt: () => new Date(options.dependencies?.now?.() ?? Date.now()).toISOString()
  }))));
}
async function executeLinkedInPersonalProfileRead(recipe, input, auth, options) {
  const target = linkedInPersonalProfileTarget(input.profile_url);
  const includeConnections = input.include_connections ?? false;
  if (typeof includeConnections !== "boolean") {
    throw new Error("input.include_connections must be boolean");
  }
  return runReadEffect(linkedInSelfReadProgram(target, includeConnections, auth.kind === "browser-profile", (error, stage) => linkedInProfileStatsFailure(error, "personal", stage)).pipe(Effect9.provide(LinkedInSelfPlatformLive({
    openBrowser: () => createLinkedInStatsBrowserTransport(auth, recipe, options),
    openDirect: () => createLinkedInClient(auth, recipe.timeoutMs, options.dependencies, options),
    directIdentity: (client) => currentIdentity(client, validateWebSessionAuthState(() => linkedInCsrfTokenFromJSessionId(webSessionCookie(client.cookies, "JSESSIONID")))),
    decodeIdentity: identityFromMeResponse,
    bindIdentity: (identity) => boundLinkedInStatsIdentity(auth, identity),
    readProfile: (client, url) => client.requestText({ url: new URL(url), method: "GET", headers: linkedInHtmlHeaders(`${LINKEDIN_ORIGIN6}/feed/`), expectedContentTypes: ["text/html"], maxBytes: recipe.maxOutputBytes }),
    readConnections: (client, url) => client.requestText({ url: new URL(`${LINKEDIN_ORIGIN6}/mynetwork/invite-connect/connections/`), method: "GET", headers: linkedInHtmlHeaders(url), expectedContentTypes: ["text/html"], maxBytes: recipe.maxOutputBytes }),
    observedAt: () => new Date(options.dependencies?.now?.() ?? Date.now()).toISOString()
  }))));
}
async function executeLinkedInOrganizationRead(recipe, input, auth, options) {
  const target = linkedInOrganizationTarget(input.organization_url);
  return runReadEffect(linkedInCompanyReadProgram(target, auth.kind === "browser-profile", (error, stage) => linkedInProfileStatsFailure(error, "organization", stage)).pipe(Effect9.provide(LinkedInCompanyPlatformLive({
    openBrowser: () => createLinkedInStatsBrowserTransport(auth, recipe, options),
    openDirect: () => createLinkedInClient(auth, recipe.timeoutMs, options.dependencies, options),
    directIdentity: (client) => currentIdentity(client, validateWebSessionAuthState(() => linkedInCsrfTokenFromJSessionId(webSessionCookie(client.cookies, "JSESSIONID")))),
    decodeIdentity: identityFromMeResponse,
    bindIdentity: (identity) => boundLinkedInStatsIdentity(auth, identity),
    readCompany: (client, url) => client.requestText({
      url: new URL(url),
      method: "GET",
      headers: linkedInHtmlHeaders(`${LINKEDIN_ORIGIN6}/feed/`),
      expectedContentTypes: ["text/html"],
      maxBytes: recipe.maxOutputBytes
    }),
    observedAt: () => new Date(options.dependencies?.now?.() ?? Date.now()).toISOString()
  }))));
}
function integerInput(input, name, fallback, minimum, maximum) {
  const value = input[name] ?? fallback;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`input.${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}
function linkedInReadFailure(error) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("cookie") || message.includes("session") || message.includes("current member") || message.includes("primary member subject") || /status\/content type (?:302|401|403)\//u.test(message)) {
    return "LinkedIn signed-in session or account binding failed preflight; refresh the selected browser realm and bind it again";
  }
  if (message.includes("registered revision") || message.includes("query failed") || message.includes("query revision")) {
    return "LinkedIn inbox query revision drifted; capture and review the current first-party contract before retrying";
  }
  if (message.includes("mailbox") || message.includes("normalized profile") || message.includes("/voyager/api/me")) {
    return "LinkedIn current-account projection drifted before the inbox read; capture and review the new identity binding";
  }
  return "LinkedIn inbox read failed before any remote write; no conversation was opened or acknowledged";
}
function assertLinkedInWebExecutionAvailable() {
  throw new Error("LinkedIn authenticated web operations are capture-required; recapture and review the current first-party contract before execution");
}
function linkedInArticleHeaders(csrf, referer) {
  return Object.freeze({
    ...headers(csrf, referer),
    "content-type": "application/json; charset=UTF-8"
  });
}
async function createDirectLinkedInArticleTransport(auth, timeoutMs, options) {
  const client = await createLinkedInClient(auth, timeoutMs, options.dependencies, options);
  const csrf = linkedInCsrfTokenFromJSessionId(webSessionCookie(client.cookies, "JSESSIONID"));
  const transport = {
    currentIdentityResponse: () => client.requestJson({
      url: new URL("/voyager/api/me", LINKEDIN_ORIGIN6),
      method: "GET",
      headers: headers(csrf, `${LINKEDIN_ORIGIN6}/feed/`),
      expectedContentTypes: [
        "application/vnd.linkedin.normalized+json+2.1",
        "application/json"
      ],
      maxBytes: MAX_SUBJECT_BYTES
    }),
    prepareCreateDraft: () => Promise.resolve(),
    createDraft: async (profileUrn2, title) => {
      const response = await client.requestStatus({
        url: new URL(`${LINKEDIN_FIRST_PARTY_ARTICLES_PATH}/`, LINKEDIN_ORIGIN6),
        method: "POST",
        headers: linkedInArticleHeaders(csrf, `${LINKEDIN_ORIGIN6}/article/new/`),
        body: canonicalJson(buildLinkedInArticleCreateBody(profileUrn2, title)),
        expectedStatuses: [201],
        reviewedResponseIdHeader: "x-restli-id"
      });
      return response.responseId ?? null;
    },
    readDraftResponse: async (draftId) => {
      const url = linkedInArticleDraftEditUrl(draftId);
      const html = await client.requestText({
        url,
        headers: { accept: "text/html", referer: url.href },
        expectedContentTypes: ["text/html"],
        maxBytes: LINKEDIN_ARTICLE_PAGE_MAX_CHARACTERS
      });
      return linkedInArticleDraftEnvelopeFromHtml(html, draftId);
    },
    updateTitle: async (draftId, title) => {
      await client.requestStatus({
        url: linkedInArticleDraftEntityUrl(draftId),
        method: "POST",
        headers: linkedInArticleHeaders(csrf, articleEditUrl2(draftId)),
        body: canonicalJson(buildLinkedInArticleTitlePatch(title)),
        expectedStatuses: [200]
      });
    },
    updateContent: async (draftId, document) => {
      await client.requestStatus({
        url: linkedInArticleDraftEntityUrl(draftId),
        method: "POST",
        headers: linkedInArticleHeaders(csrf, articleEditUrl2(draftId)),
        body: canonicalJson(buildLinkedInArticleContentPatch(document)),
        expectedStatuses: [200]
      });
    },
    uploadInlineImage: () => {
      throw new Error("LinkedIn Article inline images require the reviewed browser-bound upload transport");
    },
    uploadCoverImage: () => {
      throw new Error("LinkedIn Article cover images require the reviewed browser-bound upload transport");
    },
    updateCover: async (draftId, assetUrn) => {
      await client.requestStatus({
        url: linkedInArticleDraftEntityUrl(draftId),
        method: "POST",
        headers: linkedInArticleHeaders(csrf, articleEditUrl2(draftId)),
        body: canonicalJson(buildLinkedInArticleCoverPatch(assetUrn)),
        expectedStatuses: [200]
      });
    },
    updateContentV2: async (draftId, document, imageAssetUrns) => {
      await client.requestStatus({
        url: linkedInArticleDraftEntityUrl(draftId),
        method: "POST",
        headers: linkedInArticleHeaders(csrf, articleEditUrl2(draftId)),
        body: canonicalJson(buildLinkedInArticleContentPatchV2(document, imageAssetUrns)),
        expectedStatuses: [200]
      });
    },
    close: () => Promise.resolve()
  };
  return Object.freeze(transport);
}
async function createLinkedInArticleTransport(auth, timeoutMs, options) {
  const injected = options.dependencies?.createArticleBrowserTransport;
  if (injected !== undefined) {
    return injected(auth, {
      timeoutMs,
      ...options.operationDeadline === undefined ? {} : { operationDeadline: options.operationDeadline },
      ...options.publishCleanupResource === undefined ? {} : { publishCleanupResource: options.publishCleanupResource }
    });
  }
  if (options.dependencies?.fetch !== undefined) {
    return createDirectLinkedInArticleTransport(auth, timeoutMs, options);
  }
  return createLinkedInArticleBrowserTransport(auth, {
    timeoutMs,
    ...options.operationDeadline === undefined ? {} : { operationDeadline: options.operationDeadline },
    ...options.publishCleanupResource === undefined ? {} : { publishCleanupResource: options.publishCleanupResource }
  });
}
function linkedInPostFileInput(value) {
  if (value === undefined)
    return null;
  if (!Array.isArray(value) || value.length !== 1 || !isRecord7(value[0])) {
    throw new Error("LinkedIn posts.publish media must contain exactly one plan-bound PNG");
  }
  const descriptor = value[0];
  if (Object.keys(descriptor).sort().join(",") !== "kind,reference" || descriptor.kind !== "file" || typeof descriptor.reference !== "string" || descriptor.reference.length < 1 || descriptor.reference.length > 1024)
    throw new Error("LinkedIn posts.publish media must contain exactly one plan-bound PNG");
  return descriptor;
}
async function materializeLinkedInPostImage(media, fileResolver, operationDeadline) {
  if (media === null)
    return null;
  if (fileResolver === undefined) {
    throw new Error("LinkedIn image upload requires the plan-bound file resolver");
  }
  const resolveFile = () => fileResolver([media]);
  const paths = operationDeadline === undefined ? await resolveFile() : await operationDeadline.run(resolveFile, "authenticated web operation deadline");
  if (paths.length !== 1 || typeof paths[0] !== "string") {
    throw new Error("LinkedIn image resolver did not return exactly one file");
  }
  const noFollow = "O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0;
  const handle = operationDeadline === undefined ? await open(paths[0], constants.O_RDONLY | noFollow) : await operationDeadline.run(() => open(paths[0], constants.O_RDONLY | noFollow), "authenticated web operation deadline");
  try {
    const before = operationDeadline === undefined ? await handle.stat() : await operationDeadline.run(() => handle.stat(), "authenticated web operation deadline");
    if (!before.isFile() || before.size < 24 || before.size > MAX_LINKEDIN_POST_IMAGE_BYTES)
      throw new Error("LinkedIn image must be a regular PNG no larger than 20 MiB");
    const bytes = operationDeadline === undefined ? await handle.readFile() : await operationDeadline.run(() => handle.readFile(), "authenticated web operation deadline");
    const after = operationDeadline === undefined ? await handle.stat() : await operationDeadline.run(() => handle.stat(), "authenticated web operation deadline");
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || bytes.byteLength !== before.size)
      throw new Error("LinkedIn image changed while it was materialized");
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (signature.some((value, index) => bytes[index] !== value) || bytes.subarray(12, 16).toString("ascii") !== "IHDR")
      throw new Error("LinkedIn image must be a PNG fixture");
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    if (width < 1 || height < 1 || width > 20000 || height > 20000 || width * height > 36152320)
      throw new Error("LinkedIn PNG dimensions are outside the reviewed bound");
    return Object.freeze({
      bytes: new Uint8Array(bytes),
      height,
      width
    });
  } finally {
    await handle.close();
  }
}
async function createLinkedInPostTransport(auth, timeoutMs, options) {
  const createTransport = options.dependencies?.createPostBrowserTransport ?? createLinkedInPostBrowserTransport;
  return createTransport(auth, {
    timeoutMs,
    ...options.operationDeadline === undefined ? {} : { operationDeadline: options.operationDeadline },
    ...options.publishCleanupResource === undefined ? {} : { publishCleanupResource: options.publishCleanupResource }
  });
}
function parseLinkedInAcceptedPostTarget(identifier) {
  if (typeof identifier !== "string" || identifier.length < 1 || identifier.length > 2048 || /[\0\r\n]/u.test(identifier))
    throw new Error("LinkedIn accepted post target must be bounded canonical JSON");
  let value;
  try {
    value = JSON.parse(identifier);
  } catch {
    throw new Error("LinkedIn accepted post target must be bounded canonical JSON");
  }
  if (!isRecord7(value)) {
    throw new Error("LinkedIn accepted post target changed shape");
  }
  exactKeys5(value, ["entityUrn", "mediaUrn"], "LinkedIn accepted post target");
  if (canonicalJson(value) !== identifier) {
    throw new Error("LinkedIn accepted post target must use canonical JSON");
  }
  return Object.freeze({
    entityUrn: linkedInPostEntityUrn(value.entityUrn),
    mediaUrn: value.mediaUrn === null ? null : linkedInPostMediaUrn(value.mediaUrn)
  });
}
async function readLinkedInWebAcceptedPostTargetPresenceInternal(recipe, input, auth, acceptedIdentifier, options) {
  if (recipe.site !== "linkedin" || recipe.action !== "posts.publish" || recipe.contractVersion !== 3)
    throw new Error("LinkedIn accepted post readback supports only posts.publish@3");
  if (input.media_title !== undefined || input.link_url !== undefined) {
    throw new Error("LinkedIn reviewed post publishing supports text or one PNG image only");
  }
  const target = parseLinkedInAcceptedPostTarget(acceptedIdentifier);
  const body = linkedInPostText(input.body);
  const visibility = linkedInPostVisibility(input.visibility);
  const media = linkedInPostFileInput(input.media);
  const altText = linkedInPostAltText(input.alt_text, media !== null);
  if (media !== null !== (target.mediaUrn !== null)) {
    throw new Error("LinkedIn accepted post target did not bind the confirmed media input");
  }
  const transport = await createLinkedInPostTransport(auth, recipe.timeoutMs, options);
  try {
    const identity = identityFromMeResponse(await transport.currentIdentityResponse());
    const profileUrn2 = requireBoundLinkedInIdentity(identity, auth);
    const expectedSubject = webSessionAuthSubject(auth);
    if (expectedSubject === null || expectedSubject !== identity.subject) {
      throw new Error("LinkedIn current member no longer matches the bound auth subject");
    }
    const variables = buildLinkedInPostCreateVariables({
      altText,
      body,
      mediaUrn: target.mediaUrn,
      visibility
    });
    const projection = normalizeLinkedInPostProjection(await transport.readPost(expectedSubject, profileUrn2, variables, target.mediaUrn, target.entityUrn), { body, mediaUrn: target.mediaUrn, profileUrn: profileUrn2 });
    if (projection.entityUrn !== target.entityUrn) {
      throw new Error("LinkedIn accepted post target readback changed entity identity");
    }
    return Object.freeze({
      present: true,
      entityUrn: target.entityUrn,
      mediaUrn: target.mediaUrn
    });
  } finally {
    await transport.close();
  }
}
function readLinkedInWebAcceptedPostTargetPresence(recipe, input, auth, acceptedIdentifier, options = {}) {
  return startWebSessionCleanupTrackedOperation(options.registerCleanupBarrier, (publishCleanupResource) => readLinkedInWebAcceptedPostTargetPresenceInternal(recipe, input, auth, acceptedIdentifier, {
    ...options,
    ...publishCleanupResource === undefined ? {} : { publishCleanupResource }
  }), browserCleanupBarrier);
}
function linkedInArticleTitle(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 150 || /[\0\r\n]/u.test(value))
    throw new Error("input.title must be one bounded plain-text line");
  return value;
}
function articleEditUrl2(id) {
  return `${LINKEDIN_ORIGIN6}/article/edit/${id}/`;
}
function linkedInCreatedArticleId(value) {
  if (typeof value !== "string") {
    throw new Error("LinkedIn Article create response omitted its stable draft identity");
  }
  const urnMatch = /^urn:li:fsd_firstPartyArticle:([0-9]{1,32})$/u.exec(value);
  return linkedInArticleDraftId(urnMatch?.[1] ?? value, "LinkedIn created Article draft ID");
}
function linkedInArticleFailureCategory(error) {
  const message = error instanceof Error ? error.message : "";
  const response = /\((session-rejected|request-rejected-(?:400|422)(?::[a-z0-9+_-]+)?|contract-route-(?:not-found|retired)|provider-(?:conflict|throttled|unavailable)|status-drift|content-type-drift|response-drift)\)$/u.exec(message)?.[1];
  if (response !== undefined)
    return response;
  if (message.includes("agent-browser"))
    return "browser-command-failed";
  if (message.includes("cleanup") || message.includes("finalization"))
    return "browser-cleanup-failed";
  if (message.includes("page-instance") || message.includes("page instance")) {
    return "page-instance-binding-missing";
  }
  if (message.includes("bootstrap"))
    return "bootstrap-response-drift";
  if (message.includes("readback"))
    return "readback-rejected";
  if (message.includes("image registration request"))
    return "image-registration-request-failed";
  const imageRegistrationShape = /image registration shape drifted:([a-z0-9-]{1,192})/u.exec(message)?.[1];
  if (imageRegistrationShape !== undefined) {
    return `image-registration-shape-${imageRegistrationShape}`;
  }
  if (message.includes("image registration shape"))
    return "image-registration-shape-drift";
  if (message.includes("image registration response") || /Article (?:cover |inline )?image registration/u.test(message))
    return "image-registration-response-drift";
  if (message.includes("image staging changed shape"))
    return "image-byte-staging-failed";
  if (message.includes("image staging"))
    return "image-staging-failed";
  if (message.includes("image bytes"))
    return "image-byte-staging-failed";
  if (message.includes("image signed transfer status"))
    return "image-transfer-status-drift";
  if (message.includes("image signed transfer"))
    return "image-transfer-failed";
  if (/Article (?:cover |inline )?image upload/u.test(message)) {
    return "image-transfer-response-drift";
  }
  return "contract-step-failed";
}
async function readLinkedInArticleDraft(transport, draftId, profileUrn2) {
  const response = await transport.readDraftResponse(draftId);
  return normalizeLinkedInArticleDraft(response, draftId, profileUrn2);
}
async function readLinkedInArticleDraftMetadata(transport, draftId, profileUrn2) {
  const response = await transport.readDraftResponse(draftId);
  return normalizeLinkedInArticleDraftMetadata(response, draftId, profileUrn2);
}
async function readLinkedInArticleDraftSnapshot(transport, draftId, profileUrn2) {
  const response = await transport.readDraftResponse(draftId);
  return normalizeLinkedInArticleDraftSnapshot(response, draftId, profileUrn2);
}
async function readLinkedInArticleDraftV2(transport, draftId, profileUrn2) {
  const response = await transport.readDraftResponse(draftId);
  return normalizeLinkedInArticleDraftV2(response, draftId, profileUrn2);
}
async function readLinkedInArticleDraftV2Metadata(transport, draftId, profileUrn2) {
  const response = await transport.readDraftResponse(draftId);
  return normalizeLinkedInArticleDraftV2Metadata(response, draftId, profileUrn2);
}
function requireBoundLinkedInIdentity(identity, auth) {
  const expectedSubject = webSessionAuthSubject(auth);
  if (expectedSubject === null || expectedSubject !== identity.subject) {
    throw new Error("LinkedIn current member no longer matches the bound auth subject");
  }
  if (identity.profileUrn === null) {
    throw new Error("LinkedIn current-account response omitted the Article author profile binding");
  }
  return identity.profileUrn;
}
function articleDispatchEvent(id, index, planned, started, verified) {
  return { id, index, progress: { planned, started, verified } };
}
async function readLinkedInWebArticleDraftDesiredState(recipe, input, auth, options = {}) {
  if (recipe.site !== "linkedin" || recipe.action !== "articles.draft.save" || recipe.contractVersion !== 2)
    throw new Error("LinkedIn Article draft recovery supports only articles.draft.save@2");
  const draftId = linkedInArticleDraftId(input.draft_id, "input.draft_id");
  const title = linkedInArticleTitle(input.title);
  const document = parseArticleDraftDocument(input.document, {
    maximumBlocks: MAX_LINKEDIN_ARTICLE_BLOCKS,
    maximumCharacters: MAX_LINKEDIN_ARTICLE_CHARACTERS
  });
  buildLinkedInArticleContentPatch(document);
  const transport = await createLinkedInArticleTransport(auth, recipe.timeoutMs, {
    ...options.dependencies === undefined ? {} : { dependencies: options.dependencies },
    ...options.operationDeadline === undefined ? {} : { operationDeadline: options.operationDeadline },
    ...options.publishCleanupResource === undefined ? {} : { publishCleanupResource: options.publishCleanupResource }
  });
  try {
    const profileUrn2 = requireBoundLinkedInIdentity(identityFromMeResponse(await transport.currentIdentityResponse()), auth);
    const actual = await readLinkedInArticleDraftSnapshot(transport, draftId, profileUrn2);
    return Object.freeze({
      draftId,
      matches: actual.title === title && actual.document !== null && canonicalJson(actual.document) === canonicalJson(document)
    });
  } finally {
    await transport.close();
  }
}
async function executeLinkedInPostPublish(recipe, input, auth, options) {
  if (recipe.site !== "linkedin" || recipe.action !== "posts.publish" || recipe.contractVersion !== 3)
    throw new Error("LinkedIn post publishing supports only posts.publish@3");
  if (input.media_title !== undefined || input.link_url !== undefined) {
    throw new Error("LinkedIn reviewed post publishing supports text or one PNG image only");
  }
  const body = linkedInPostText(input.body);
  const visibility = linkedInPostVisibility(input.visibility);
  const media = linkedInPostFileInput(input.media);
  const altText = linkedInPostAltText(input.alt_text, media !== null);
  const image = await materializeLinkedInPostImage(media, options.fileResolver, options.operationDeadline);
  let started = 0;
  let verified = 0;
  let transport = null;
  let projection = null;
  let failureStage = "opening the contained post transport";
  try {
    transport = await createLinkedInPostTransport(auth, recipe.timeoutMs, options);
    failureStage = "current-member binding";
    const identity = identityFromMeResponse(await transport.currentIdentityResponse());
    const profileUrn2 = requireBoundLinkedInIdentity(identity, auth);
    const expectedSubject = webSessionAuthSubject(auth);
    if (expectedSubject === null || expectedSubject !== identity.subject) {
      throw new Error("LinkedIn current member no longer matches the bound auth subject");
    }
    failureStage = image === null ? "public post dispatch admission" : "image preparation";
    const mediaUrn = image === null ? null : await transport.uploadImage(expectedSubject, image.bytes);
    const variables = buildLinkedInPostCreateVariables({
      altText,
      body,
      mediaUrn,
      visibility
    });
    failureStage = "public post dispatch admission";
    await options.beforeDispatch?.(articleDispatchEvent("posts.publish", 1, 1, started, verified));
    started = 1;
    failureStage = "post create response";
    const entityUrn = await transport.createPost(expectedSubject, profileUrn2, variables, mediaUrn);
    failureStage = "accepted target retention";
    await options.afterProviderAcceptedMutationTarget?.({
      id: "posts.publish",
      index: 1,
      target: {
        schemaVersion: 1,
        identifier: canonicalJson({ entityUrn, mediaUrn })
      }
    });
    failureStage = "independent post readback";
    projection = normalizeLinkedInPostProjection(await transport.readPost(expectedSubject, profileUrn2, variables, mediaUrn, entityUrn), { body, mediaUrn, profileUrn: profileUrn2 });
    verified = 1;
    failureStage = "dispatch verification";
    await options.afterDispatchVerified?.(articleDispatchEvent("posts.publish", 1, 1, started, verified));
    return {
      status: "succeeded",
      output: Object.freeze({
        provider: "linkedin",
        operation: "posts.publish",
        post: Object.freeze({
          entityUrn: projection.entityUrn,
          url: projection.url
        }),
        visibility,
        ...image === null ? {} : {
          image: Object.freeze({
            altText,
            height: image.height,
            mediaType: "image/png",
            width: image.width
          })
        }
      }),
      finalUrl: projection.url,
      dispatchStarted: true,
      dispatch: { planned: 1, started, verified }
    };
  } catch (error) {
    const publicFailureStage = error instanceof LinkedInPostImagePreparationError ? error.stage : error instanceof LinkedInPostCreateResponseError ? error.stage : failureStage;
    return {
      status: started > verified ? "indeterminate" : "failed",
      output: null,
      finalUrl: projection?.url ?? null,
      dispatchStarted: started > 0,
      dispatch: { planned: 1, started, verified },
      error: started > verified ? `LinkedIn may have accepted the post but exact member, text, media, and permalink readback was not verified; failure stage: ${publicFailureStage}; reconcile before retrying` : `LinkedIn post publishing failed before public post submission; failure stage: ${publicFailureStage}; retry with a fresh confirmed plan`
    };
  } finally {
    await transport?.close();
  }
}
async function executeLinkedInArticleDraftSave(recipe, input, auth, options) {
  if (recipe.site !== "linkedin" || recipe.action !== "articles.draft.save" || recipe.contractVersion !== 2)
    throw new Error("LinkedIn Article draft saving supports only articles.draft.save@2");
  const title = linkedInArticleTitle(input.title);
  const document = parseArticleDraftDocument(input.document, {
    maximumBlocks: MAX_LINKEDIN_ARTICLE_BLOCKS,
    maximumCharacters: MAX_LINKEDIN_ARTICLE_CHARACTERS
  });
  buildLinkedInArticleContentPatch(document);
  const requestedDraftId = input.draft_id === undefined ? null : linkedInArticleDraftId(input.draft_id, "input.draft_id");
  const planned = requestedDraftId === null ? 2 : 1;
  let started = 0;
  let verified = 0;
  let nextIndex = 0;
  let draftId = requestedDraftId;
  let failureStage = "starting the contained LinkedIn Article browser";
  let transport = null;
  const begin = async (id) => {
    const index = nextIndex + 1;
    await options.beforeDispatch?.(articleDispatchEvent(id, index, planned, started, verified));
    nextIndex = index;
    started = index;
    return index;
  };
  const complete = async (id, index) => {
    await options.afterDispatchVerified?.(articleDispatchEvent(id, index, planned, started, index));
    verified = index;
  };
  try {
    transport = await createLinkedInArticleTransport(auth, recipe.timeoutMs, options);
    failureStage = "reading the current LinkedIn member in the contained browser";
    const currentIdentity2 = identityFromMeResponse(await transport.currentIdentityResponse());
    failureStage = "binding the current LinkedIn member";
    const profileUrn2 = requireBoundLinkedInIdentity(currentIdentity2, auth);
    let finalDispatchId;
    let finalDispatchIndex;
    if (draftId === null) {
      failureStage = "opening the private Article editor before creation";
      await transport.prepareCreateDraft();
      const dispatchId = "articles.create";
      failureStage = "creating the private Article title shell";
      const index = await begin(dispatchId);
      draftId = linkedInCreatedArticleId(await transport.createDraft(profileUrn2, title));
      failureStage = "verifying the new private Article title shell";
      const created = await readLinkedInArticleDraftMetadata(transport, draftId, profileUrn2);
      if (created.title !== title) {
        throw new Error("LinkedIn Article create readback did not bind the confirmed title");
      }
      await complete(dispatchId, index);
      finalDispatchId = "articles.content";
      failureStage = "replacing the new private Article document";
      finalDispatchIndex = await begin(finalDispatchId);
      await transport.updateContent(draftId, document);
    } else {
      failureStage = "reading the exact existing private Article";
      const existing = await readLinkedInArticleDraftSnapshot(transport, draftId, profileUrn2);
      const titleMatches = existing.title === title;
      const documentMatches = existing.document !== null && canonicalJson(existing.document) === canonicalJson(document);
      if (titleMatches && documentMatches) {
        const url2 = articleEditUrl2(draftId);
        return {
          status: "succeeded",
          output: {
            provider: "linkedin",
            operation: "articles.draft.save",
            published: false,
            mode: "draft",
            draftId,
            title,
            documentSchemaVersion: 1,
            effect: "already-satisfied"
          },
          finalUrl: url2,
          noOp: true,
          dispatchStarted: false,
          dispatch: { planned, started: 0, verified: 0 }
        };
      }
      finalDispatchId = "articles.replace";
      failureStage = "starting the exact private Article replacement";
      finalDispatchIndex = await begin(finalDispatchId);
      if (!titleMatches) {
        failureStage = "replacing the exact private Article title";
        await transport.updateTitle(draftId, title);
      }
      if (!documentMatches) {
        failureStage = "replacing the exact private Article document";
        await transport.updateContent(draftId, document);
      }
    }
    failureStage = "verifying the replaced private Article document";
    const final = await readLinkedInArticleDraft(transport, draftId, profileUrn2);
    if (final.title !== title || canonicalJson(final.document) !== canonicalJson(document))
      throw new Error("LinkedIn Article final readback did not bind the confirmed draft");
    await complete(finalDispatchId, finalDispatchIndex);
    if (nextIndex !== planned || verified !== planned) {
      throw new Error("LinkedIn Article draft workflow did not complete its exact dispatch schedule");
    }
    const url = articleEditUrl2(draftId);
    return {
      status: "succeeded",
      output: {
        provider: "linkedin",
        operation: "articles.draft.save",
        published: false,
        mode: "draft",
        draftId,
        title,
        documentSchemaVersion: 1,
        url
      },
      finalUrl: url,
      dispatchStarted: started > 0,
      dispatch: { planned, started, verified }
    };
  } catch (error) {
    const url = draftId === null ? null : articleEditUrl2(draftId);
    const diagnostic = `${failureStage}; ${linkedInArticleFailureCategory(error)}`;
    return {
      status: started > verified ? "indeterminate" : verified > 0 ? "partial" : "failed",
      output: null,
      finalUrl: url,
      dispatchStarted: started > 0,
      dispatch: { planned, started, verified },
      error: started > verified ? requestedDraftId === null && verified === 0 ? "LinkedIn may have accepted the private Article create, but the confirmed input has no exact draft ID for safe reconciliation; preserve the indeterminate run and do not retry" : `LinkedIn may have accepted the current private Article replacement dispatch while ${diagnostic}; reconcile the exact existing draft before retrying` : verified > 0 ? `LinkedIn verified only part of the confirmed private Article workflow while ${diagnostic}; inspect the draft before retrying` : `LinkedIn Article draft failed before remote submission while ${diagnostic}`
    };
  } finally {
    await transport?.close();
  }
}
async function executeLinkedInArticleDraftSaveV7(recipe, input, auth, options) {
  if (recipe.site !== "linkedin" || recipe.action !== "articles.draft.save" || recipe.contractVersion !== 7)
    throw new Error("LinkedIn image Article draft saving supports only articles.draft.save@7");
  const title = linkedInArticleTitle(input.title);
  const document = parseArticleDraftDocumentV2(input.document, {
    maximumBlocks: MAX_LINKEDIN_ARTICLE_BLOCKS,
    maximumCharacters: MAX_LINKEDIN_ARTICLE_CHARACTERS,
    maximumImages: MAX_LINKEDIN_ARTICLE_INLINE_IMAGES
  });
  const imageCount = document.blocks.filter((block) => block.type === "image").length;
  if (imageCount < 1) {
    throw new Error("LinkedIn ArticleDraftDocument schemaVersion 2 requires at least one inline image");
  }
  const trailing = document.blocks.at(-1);
  const beforeTrailing = document.blocks.at(-2);
  if (trailing?.type === "paragraph" && trailing.text === "" && beforeTrailing?.type === "image") {
    throw new Error("LinkedIn Article documents must omit the editor-owned empty paragraph after a final image");
  }
  const fixtureAssets = Object.freeze(Array.from({ length: imageCount }, (_, index) => `urn:li:digitalmediaAsset:ghostgetFixture${index}`));
  buildLinkedInArticleContentPatchV2(document, fixtureAssets);
  const requestedDraftId = input.draft_id === undefined ? null : linkedInArticleDraftId(input.draft_id, "input.draft_id");
  if (input.cover_image === undefined && requestedDraftId === null) {
    throw new Error("input.cover_image is required when creating a LinkedIn Article draft");
  }
  const coverImage = input.cover_image === undefined ? null : await materializeArticleDraftImage(input.cover_image, options.fileResolver, {
    maximumBytes: MAX_LINKEDIN_ARTICLE_IMAGE_BYTES,
    inputLabel: "input.cover_image",
    filenamePrefix: "cover-image",
    ...options.operationDeadline === undefined ? {} : { operationDeadline: options.operationDeadline }
  });
  const images = await materializeArticleDraftImages(input.inline_images, options.fileResolver, {
    maximumBytes: MAX_LINKEDIN_ARTICLE_IMAGE_BYTES,
    maximumImages: MAX_LINKEDIN_ARTICLE_INLINE_IMAGES,
    ...options.operationDeadline === undefined ? {} : { operationDeadline: options.operationDeadline }
  });
  if (images.length !== imageCount) {
    throw new Error("input.inline_images must match every document imageIndex exactly");
  }
  const planned = images.length + (requestedDraftId === null ? 2 : 1) + (coverImage === null ? 0 : 1);
  let started = 0;
  let verified = 0;
  let nextIndex = 0;
  let draftId = requestedDraftId;
  let failureStage = "starting the contained LinkedIn Article browser";
  let transport = null;
  const begin = async (id) => {
    const index = nextIndex + 1;
    await options.beforeDispatch?.(articleDispatchEvent(id, index, planned, started, verified));
    nextIndex = index;
    started = index;
    return index;
  };
  const complete = async (id, index) => {
    await options.afterDispatchVerified?.(articleDispatchEvent(id, index, planned, started, index));
    verified = index;
  };
  try {
    transport = await createLinkedInArticleTransport(auth, recipe.timeoutMs, options);
    failureStage = "reading the current LinkedIn member in the contained browser";
    const currentIdentity2 = identityFromMeResponse(await transport.currentIdentityResponse());
    failureStage = "binding the current LinkedIn member";
    const profileUrn2 = requireBoundLinkedInIdentity(currentIdentity2, auth);
    if (transport.uploadInlineImage === undefined || transport.updateContentV2 === undefined)
      throw new Error("LinkedIn Article cover and inline image transport is unavailable");
    const uploadInlineImage = transport.uploadInlineImage;
    const updateContentV2 = transport.updateContentV2;
    let coverAssetUrn = null;
    if (draftId === null) {
      failureStage = "opening the private Article editor before creation";
      await transport.prepareCreateDraft();
      const dispatchId = "articles.create";
      failureStage = "creating the private Article title shell";
      const index = await begin(dispatchId);
      draftId = linkedInCreatedArticleId(await transport.createDraft(profileUrn2, title));
      failureStage = "verifying the new private Article title shell";
      const created = await readLinkedInArticleDraftMetadata(transport, draftId, profileUrn2);
      if (created.title !== title) {
        throw new Error("LinkedIn Article create readback did not bind the confirmed title");
      }
      await complete(dispatchId, index);
    } else {
      failureStage = "reading the exact existing private Article";
      const existing = await readLinkedInArticleDraftV2Metadata(transport, draftId, profileUrn2);
      coverAssetUrn = existing.coverAssetUrn;
      if (coverImage === null && coverAssetUrn === null) {
        throw new Error("LinkedIn Article replacement without input.cover_image requires one existing private banner");
      }
    }
    if (coverImage !== null) {
      if (transport.uploadCoverImage === undefined || transport.updateCover === undefined)
        throw new Error("LinkedIn Article cover transport is unavailable");
      const coverDispatchId = "articles.cover";
      failureStage = "uploading the private Article cover image";
      const coverDispatchIndex = await begin(coverDispatchId);
      coverAssetUrn = await transport.uploadCoverImage(draftId, coverImage);
      failureStage = "binding the private Article cover only to the banner slot";
      await transport.updateCover(draftId, coverAssetUrn);
      failureStage = "verifying the private Article cover banner";
      const covered = await readLinkedInArticleDraftV2Metadata(transport, draftId, profileUrn2);
      if (covered.coverAssetUrn !== coverAssetUrn) {
        throw new Error("LinkedIn Article cover readback did not bind the confirmed banner asset");
      }
      await complete(coverDispatchId, coverDispatchIndex);
    }
    if (coverAssetUrn === null) {
      throw new Error("LinkedIn Article draft requires one exact private banner");
    }
    const imageAssetUrns = [];
    for (const [imageIndex, image] of images.entries()) {
      const dispatchId = `articles.image[${imageIndex + 1}]`;
      failureStage = `uploading private Article inline image ${imageIndex + 1}`;
      const index = await begin(dispatchId);
      imageAssetUrns.push(await uploadInlineImage(draftId, image));
      failureStage = `verifying private Article inline image ${imageIndex + 1}`;
      await complete(dispatchId, index);
    }
    const finalDispatchId = requestedDraftId === null ? "articles.content" : "articles.replace";
    failureStage = "starting the exact private Article replacement";
    const finalDispatchIndex = await begin(finalDispatchId);
    if (requestedDraftId !== null) {
      failureStage = "replacing the exact private Article title";
      await transport.updateTitle(draftId, title);
    }
    failureStage = "replacing the exact private Article document and inline images";
    await updateContentV2(draftId, document, imageAssetUrns);
    failureStage = "verifying the replaced private Article document and inline images";
    const final = await readLinkedInArticleDraftV2(transport, draftId, profileUrn2);
    if (final.title !== title || canonicalJson(final.document) !== canonicalJson(document) || final.coverAssetUrn !== coverAssetUrn || canonicalJson(final.imageAssetUrns) !== canonicalJson(imageAssetUrns))
      throw new Error("LinkedIn Article final readback did not bind the confirmed draft, cover, and inline images");
    await complete(finalDispatchId, finalDispatchIndex);
    if (nextIndex !== planned || verified !== planned) {
      throw new Error("LinkedIn Article image workflow did not complete its exact dispatch schedule");
    }
    const url = articleEditUrl2(draftId);
    return {
      status: "succeeded",
      output: {
        provider: "linkedin",
        operation: "articles.draft.save",
        published: false,
        mode: "draft",
        draftId,
        title,
        documentSchemaVersion: 2,
        coverImageCount: 1,
        inlineImageCount: images.length,
        url
      },
      finalUrl: url,
      dispatchStarted: started > 0,
      dispatch: { planned, started, verified }
    };
  } catch (error) {
    const url = draftId === null ? null : articleEditUrl2(draftId);
    const diagnostic = `${failureStage}; ${linkedInArticleFailureCategory(error)}`;
    return {
      status: started > verified ? "indeterminate" : verified > 0 ? "partial" : "failed",
      output: null,
      finalUrl: url,
      dispatchStarted: started > 0,
      dispatch: { planned, started, verified },
      error: started > verified ? `LinkedIn may have accepted the current private Article cover, inline image, or replacement dispatch while ${diagnostic}; preserve the indeterminate run, inspect the exact draft, and do not retry` : verified > 0 ? `LinkedIn verified only part of the confirmed private Article image workflow while ${diagnostic}; inspect the draft before retrying` : `LinkedIn Article image draft failed before remote submission while ${diagnostic}`
    };
  } finally {
    await transport?.close();
  }
}
async function executeLinkedInProfileActivityRead(recipe, input, auth, options) {
  const feed = linkedInProfileActivityFeed(input.feed);
  if (feed === "home") {
    throw new Error("LinkedIn home-feed read remains capture-required; recapture and review the current first-party contract before execution");
  }
  const target = linkedInProfileActivityTarget({
    profile_url: input.profile_url,
    vanity: input.vanity
  });
  const cursor = parseLinkedInProfileActivityCursor(input.cursor, target.slug);
  const limit = integerInput(input, "limit", 20, 1, LINKEDIN_PROFILE_ACTIVITY_MAX_ITEMS);
  return runReadEffect(linkedInProfileActivityReadProgram(target, cursor.start, limit).pipe(Effect9.provide(LinkedInProfileActivityPlatformLive({
    openBrowser: () => {
      const createTransport = options.dependencies?.createFeedBrowserTransport ?? createLinkedInFeedBrowserTransport;
      return createTransport(auth, {
        timeoutMs: recipe.timeoutMs,
        maxOutputBytes: recipe.maxOutputBytes,
        ...options.operationDeadline === undefined ? {} : { operationDeadline: options.operationDeadline },
        ...options.publishCleanupResource === undefined ? {} : { publishCleanupResource: options.publishCleanupResource }
      });
    },
    decodeIdentity: identityFromMeResponse,
    bindIdentity: (identity) => boundLinkedInStatsIdentity(auth, identity),
    observedAt: () => new Date(options.dependencies?.now?.() ?? Date.now()).toISOString()
  }))));
}
async function executeLinkedInWebOperation(recipe, input, auth, options = {}) {
  if (recipe.site === "linkedin" && recipe.contractVersion === 2 && recipe.action === "feeds.read") {
    if (input.feed === "home") {
      throw new Error("LinkedIn home-feed read remains capture-required; recapture and review the current first-party contract before execution");
    }
    return startWebSessionCleanupTrackedOperation(options.registerCleanupBarrier, (publishCleanupResource) => executeLinkedInProfileActivityRead(recipe, input, auth, {
      ...options,
      ...publishCleanupResource === undefined ? {} : { publishCleanupResource }
    }), browserCleanupBarrier);
  }
  if (recipe.site === "linkedin" && recipe.contractVersion === 1 && recipe.action === "contacts.read") {
    return startWebSessionCleanupTrackedOperation(options.registerCleanupBarrier, (publishCleanupResource) => executeLinkedInContactInfoRead(recipe, input, auth, {
      ...options,
      ...publishCleanupResource === undefined ? {} : { publishCleanupResource }
    }), browserCleanupBarrier);
  }
  if (recipe.site === "linkedin" && recipe.contractVersion === 1 && recipe.action === "profiles.read") {
    return startWebSessionCleanupTrackedOperation(options.registerCleanupBarrier, (publishCleanupResource) => executeLinkedInPersonalProfileRead(recipe, input, auth, {
      ...options,
      ...publishCleanupResource === undefined ? {} : { publishCleanupResource }
    }), browserCleanupBarrier);
  }
  if (recipe.site === "linkedin" && recipe.contractVersion === 1 && recipe.action === "organizations.read") {
    return startWebSessionCleanupTrackedOperation(options.registerCleanupBarrier, (publishCleanupResource) => executeLinkedInOrganizationRead(recipe, input, auth, {
      ...options,
      ...publishCleanupResource === undefined ? {} : { publishCleanupResource }
    }), browserCleanupBarrier);
  }
  if (recipe.site === "linkedin" && recipe.contractVersion === 7 && recipe.action === "articles.draft.save") {
    return startWebSessionCleanupTrackedOperation(options.registerCleanupBarrier, (publishCleanupResource) => executeLinkedInArticleDraftSaveV7(recipe, input, auth, {
      ...options,
      ...publishCleanupResource === undefined ? {} : { publishCleanupResource }
    }), browserCleanupBarrier);
  }
  if (recipe.site === "linkedin" && recipe.contractVersion === 3 && recipe.action === "posts.publish") {
    return startWebSessionCleanupTrackedOperation(options.registerCleanupBarrier, (publishCleanupResource) => executeLinkedInPostPublish(recipe, input, auth, {
      ...options,
      ...publishCleanupResource === undefined ? {} : { publishCleanupResource }
    }), browserCleanupBarrier);
  }
  if (recipe.site === "linkedin" && recipe.contractVersion === 2 && recipe.action === "articles.draft.save") {
    return startWebSessionCleanupTrackedOperation(options.registerCleanupBarrier, (publishCleanupResource) => executeLinkedInArticleDraftSave(recipe, input, auth, {
      ...options,
      ...publishCleanupResource === undefined ? {} : { publishCleanupResource }
    }), browserCleanupBarrier);
  }
  assertLinkedInWebExecutionAvailable();
  if (recipe.site !== "linkedin" || recipe.contractVersion !== 1 || recipe.action !== "messaging.list")
    throw new Error(`LinkedIn authenticated web operation ${recipe.action} has no executable reviewed contract`);
  try {
    if (input.cursor !== undefined) {
      throw new Error("LinkedIn messaging.list cursor pagination is capture-required");
    }
    const folder = input.folder;
    if (typeof folder !== "string")
      throw new Error("input.folder must be a LinkedIn inbox folder");
    const limit = integerInput(input, "limit", 20, 1, 100);
    const client = await createLinkedInClient(auth, recipe.timeoutMs, options.dependencies, options);
    const csrf = linkedInCsrfTokenFromJSessionId(webSessionCookie(client.cookies, "JSESSIONID"));
    const identity = await currentIdentity(client, csrf);
    const expectedSubject = webSessionAuthSubject(auth);
    if (expectedSubject === null || expectedSubject !== identity.subject) {
      throw new Error("LinkedIn current member no longer matches the bound auth subject");
    }
    if (identity.mailboxUrn === null) {
      throw new Error("LinkedIn current-account response omitted the mailbox-bound normalized profile");
    }
    const requestConversations = (queryId) => client.requestJson({
      url: linkedInMessengerConversationsUrl(identity.mailboxUrn, queryId),
      method: "GET",
      headers: headers(csrf, `${LINKEDIN_ORIGIN6}/feed/`),
      expectedContentTypes: [
        "application/graphql",
        "application/vnd.linkedin.normalized+json+2.1",
        "application/json"
      ],
      maxBytes: recipe.maxOutputBytes
    });
    let response;
    try {
      response = await requestConversations(LINKEDIN_MESSENGER_CONVERSATIONS_OBSERVED_QUERY_ID);
    } catch (initialError) {
      const resolveQueryId = options.dependencies?.resolveMessengerConversationsQueryId ?? resolveLinkedInMessengerConversationsQueryId;
      let currentQueryId;
      try {
        currentQueryId = await resolveQueryId(auth, identity.mailboxUrn, {
          timeoutMs: options.operationDeadline?.remainingTimeMs() ?? recipe.timeoutMs
        });
      } catch (bootstrapError) {
        throw new Error("LinkedIn inbox query failed and its current registered revision could not be resolved", {
          cause: bootstrapError
        });
      }
      if (currentQueryId === LINKEDIN_MESSENGER_CONVERSATIONS_OBSERVED_QUERY_ID)
        throw initialError;
      response = await requestConversations(currentQueryId);
    }
    return {
      status: "succeeded",
      output: normalizeLinkedInMessagingList(response, folder, limit),
      finalUrl: `${LINKEDIN_ORIGIN6}/messaging/`,
      dispatchStarted: false,
      dispatch: { planned: 0, started: 0, verified: 0 }
    };
  } catch (error) {
    return {
      status: "failed",
      output: null,
      finalUrl: `${LINKEDIN_ORIGIN6}/messaging/`,
      dispatchStarted: false,
      dispatch: { planned: 0, started: 0, verified: 0 },
      error: linkedInReadFailure(error)
    };
  }
}
export {
  readLinkedInWebArticleDraftDesiredState,
  readLinkedInWebAcceptedPostTargetPresence,
  probeLinkedInWebSubject,
  executeLinkedInWebOperation
};

// @bun
import {
  ReadEffectFailure
} from "./index-mfj1vvc7.js";

// src/providers/linkedin-web.ts
var MAX_CSRF_TOKEN_CHARACTERS = 1024;
var MAX_QUERY_CANDIDATES = 4096;
var MAX_QUERY_CANDIDATE_CHARACTERS = 512;
var MAX_MESSAGING_ITEMS = 100;
var LINKEDIN_MESSENGER_CONVERSATIONS_QUERY_PREFIX = "messengerConversations";
var LINKEDIN_MESSENGER_CONVERSATIONS_OBSERVED_QUERY_ID = "messengerConversations.0d5e6781bbee71c3e51c8843c6519f48";
var LINKEDIN_MESSENGER_GRAPHQL_PATH = "/voyager/api/voyagerMessagingGraphQL/graphql";
var LINKEDIN_POST_CREATE_MUTATION_ID = "voyagerContentcreationDashShares.80089eb2e82a2dfa23cb621fb09eb7bf";
var LINKEDIN_POST_READBACK_QUERY_ID = "voyagerFeedDashUpdates.00f9ed72d35c2a949114759b829f9886";
var LINKEDIN_GRAPHQL_PATH = "/voyager/api/graphql";
var LINKEDIN_WEB_OPERATION_NAMES = Object.freeze([
  "feeds.read",
  "contacts.list",
  "contacts.read",
  "profiles.read",
  "organizations.read",
  "relationships.recommendations.read",
  "messaging.list",
  "messaging.read",
  "messaging.send",
  "media.publish",
  "posts.read",
  "posts.publish",
  "posts.repost",
  "posts.quote",
  "comments.read",
  "comments.create",
  "replies.create",
  "reactions.set",
  "relationships.connect",
  "articles.read",
  "articles.draft.save",
  "articles.publish"
]);
var LINKEDIN_WEB_OPERATIONS = {
  "contacts.list": {
    effect: "read",
    risk: "R1",
    state: "capture-required",
    evidence: "none",
    requests: []
  },
  "contacts.read": {
    effect: "read",
    risk: "R1",
    state: "observed",
    evidence: "live-response",
    requests: [{
      kind: "server-rendered-read",
      method: "GET",
      path: "/in/:publicIdentifier/ and /voyager/api/graphql voyagerIdentityDashProfileContactInfo",
      queryPrefix: "voyagerIdentityDashProfileContactInfo",
      allowedQueryParameters: ["includeWebMetadata", "queryId", "queryName", "variables"],
      requiredQueryParameters: ["includeWebMetadata", "variables"],
      fixedQueryParameters: [["includeWebMetadata", "true"]]
    }, {
      kind: "server-rendered-read",
      method: "GET",
      path: "/flagship-web/rsc-action/actions/navigation ProfileContactDetailsOverlay",
      queryPrefix: null,
      allowedQueryParameters: ["screenId", "profileUrn"],
      requiredQueryParameters: ["screenId", "profileUrn"],
      fixedQueryParameters: [[
        "screenId",
        "com.linkedin.sdui.flagshipnav.profile.ProfileContactDetailsOverlay"
      ]]
    }]
  },
  "feeds.read": {
    effect: "read",
    risk: "R1",
    state: "observed",
    evidence: "live-response",
    requests: [{
      kind: "registered-query",
      method: "GET",
      path: "/voyager/api/graphql",
      queryPrefix: "voyagerFeedDashProfileUpdates",
      allowedQueryParameters: ["includeWebMetadata", "queryId", "variables"],
      requiredQueryParameters: ["includeWebMetadata", "queryId", "variables"],
      fixedQueryParameters: [["includeWebMetadata", "true"]]
    }]
  },
  "profiles.read": {
    effect: "read",
    risk: "R1",
    state: "observed",
    evidence: "live-response",
    requests: [{
      kind: "server-rendered-read",
      method: "GET",
      path: "/in/:publicIdentifier/ and /mynetwork/invite-connect/connections/",
      queryPrefix: null,
      allowedQueryParameters: [],
      requiredQueryParameters: [],
      fixedQueryParameters: []
    }]
  },
  "organizations.read": {
    effect: "read",
    risk: "R1",
    state: "observed",
    evidence: "live-response",
    requests: [{
      kind: "server-rendered-read",
      method: "GET",
      path: "/company/:universalName/",
      queryPrefix: null,
      allowedQueryParameters: [],
      requiredQueryParameters: [],
      fixedQueryParameters: []
    }]
  },
  "relationships.recommendations.read": {
    effect: "read",
    risk: "R1",
    state: "capture-required",
    evidence: "none",
    requests: []
  },
  "messaging.list": {
    effect: "read",
    risk: "R1",
    state: "capture-required",
    evidence: "live-har",
    requests: []
  },
  "messaging.read": {
    effect: "read",
    risk: "R1",
    state: "capture-required",
    evidence: "live-har",
    requests: []
  },
  "messaging.send": {
    effect: "write",
    risk: "R3",
    state: "capture-required",
    evidence: "none",
    requests: []
  },
  "media.publish": {
    effect: "write",
    risk: "R3",
    state: "capture-required",
    evidence: "none",
    requests: []
  },
  "posts.read": {
    effect: "read",
    risk: "R1",
    state: "capture-required",
    evidence: "none",
    requests: []
  },
  "posts.publish": {
    effect: "write",
    risk: "R3",
    state: "observed",
    evidence: "first-party-bundle",
    requests: [
      {
        kind: "restli-write",
        method: "POST",
        path: "/voyager/api/voyagerVideoDashMediaUploadMetadata",
        queryId: null,
        fixedQueryParameters: [["action", "upload"]],
        bodyContract: "IMAGE_SHARING registration for the exact plan-bound PNG size and fixed filename",
        targetHostnameFamilies: ["linkedin.com"]
      },
      {
        kind: "server-bound-upload",
        method: "PUT",
        path: "server-returned exact upload URL",
        queryId: null,
        fixedQueryParameters: [],
        bodyContract: "exact registered PNG bytes once, or exact contiguous registered parts once",
        targetHostnameFamilies: ["linkedin.com", "licdn.com"]
      },
      {
        kind: "restli-write",
        method: "POST",
        path: "/voyager/api/voyagerVideoDashMediaUploadMetadata",
        queryId: null,
        fixedQueryParameters: [["action", "completeMultipartUpload"]],
        bodyContract: "registered artifact, multipart metadata, and exact per-part response evidence only",
        targetHostnameFamilies: ["linkedin.com"]
      },
      {
        kind: "registered-mutation",
        method: "POST",
        path: LINKEDIN_GRAPHQL_PATH,
        queryId: LINKEDIN_POST_CREATE_MUTATION_ID,
        fixedQueryParameters: [["action", "execute"]],
        bodyContract: "one PUBLISHED FEED post with exact commentary, fixed commenter scope, confirmed visibility, and optional response-bound IMAGE media URN",
        targetHostnameFamilies: ["linkedin.com"]
      },
      {
        kind: "registered-query",
        method: "GET",
        path: LINKEDIN_GRAPHQL_PATH,
        queryPrefix: "voyagerFeedDashUpdates",
        allowedQueryParameters: ["includeWebMetadata", "queryId", "variables"],
        requiredQueryParameters: ["includeWebMetadata", "queryId", "variables"],
        fixedQueryParameters: [
          ["includeWebMetadata", "true"],
          ["queryId", LINKEDIN_POST_READBACK_QUERY_ID]
        ]
      }
    ]
  },
  "posts.repost": {
    effect: "write",
    risk: "R3",
    state: "capture-required",
    evidence: "none",
    requests: []
  },
  "posts.quote": {
    effect: "write",
    risk: "R3",
    state: "capture-required",
    evidence: "none",
    requests: []
  },
  "comments.read": {
    effect: "read",
    risk: "R1",
    state: "capture-required",
    evidence: "first-party-bundle",
    requests: []
  },
  "comments.create": {
    effect: "write",
    risk: "R3",
    state: "capture-required",
    evidence: "first-party-bundle",
    requests: []
  },
  "replies.create": {
    effect: "write",
    risk: "R3",
    state: "capture-required",
    evidence: "first-party-bundle",
    requests: []
  },
  "reactions.set": {
    effect: "write",
    risk: "R2",
    state: "capture-required",
    evidence: "none",
    requests: []
  },
  "relationships.connect": {
    effect: "write",
    risk: "R3",
    state: "capture-required",
    evidence: "none",
    requests: []
  },
  "articles.read": {
    effect: "read",
    risk: "R1",
    state: "capture-required",
    evidence: "live-har",
    requests: []
  },
  "articles.draft.save": {
    effect: "write",
    risk: "R2",
    state: "observed",
    evidence: "live-har",
    requests: []
  },
  "articles.publish": {
    effect: "write",
    risk: "R3",
    state: "capture-required",
    evidence: "none",
    requests: []
  }
};
for (const contract of Object.values(LINKEDIN_WEB_OPERATIONS)) {
  for (const request of contract.requests)
    Object.freeze(request);
  Object.freeze(contract.requests);
  Object.freeze(contract);
}
Object.freeze(LINKEDIN_WEB_OPERATIONS);
var LINKEDIN_WEB_FOLDER_CATEGORIES = Object.freeze({
  focused: "PRIMARY_INBOX",
  other: "SECONDARY_INBOX",
  requests: "MESSAGE_REQUEST_PENDING",
  archive: "ARCHIVE",
  spam: "SPAM",
  all: "INBOX"
});
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasOwn(record, key) {
  return Object.prototype.hasOwnProperty.call(record, key);
}
function linkedInCsrfTokenFromJSessionId(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_CSRF_TOKEN_CHARACTERS) {
    throw new Error("LinkedIn JSESSIONID must be a bounded cookie value");
  }
  const startsQuoted = value.startsWith('"');
  const endsQuoted = value.endsWith('"');
  if (startsQuoted !== endsQuoted) {
    throw new Error("LinkedIn JSESSIONID has mismatched wrapper quotes");
  }
  const token = startsQuoted ? value.slice(1, -1) : value;
  if (!token.startsWith("ajax:") || token.length === "ajax:".length) {
    throw new Error("LinkedIn JSESSIONID is not an ajax session token");
  }
  for (let index = 0;index < token.length; index += 1) {
    const code = token.charCodeAt(index);
    if (code < 33 || code > 126 || code === 34 || code === 44 || code === 59 || code === 92) {
      throw new Error("LinkedIn JSESSIONID contains an invalid cookie character");
    }
  }
  return token;
}
function queryPrefix(value) {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,127}$/u.test(value)) {
    throw new Error("LinkedIn registered-query prefix is invalid");
  }
  return value;
}
function escapedRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
function resolveLinkedInRegisteredQueryId(prefixValue, candidatesValue) {
  const prefix = queryPrefix(prefixValue);
  if (!Array.isArray(candidatesValue) || candidatesValue.length > MAX_QUERY_CANDIDATES) {
    throw new Error("LinkedIn registered-query candidates must be a bounded array");
  }
  const matcher = new RegExp(`^${escapedRegularExpression(prefix)}\\.[0-9a-fA-F]{32}$`, "u");
  const matches = new Set;
  for (const candidate of candidatesValue) {
    if (typeof candidate !== "string" || candidate.length > MAX_QUERY_CANDIDATE_CHARACTERS) {
      throw new Error("LinkedIn registered-query candidate is invalid");
    }
    if (matcher.test(candidate))
      matches.add(candidate);
  }
  if (matches.size === 0) {
    throw new Error(`LinkedIn registered query ${prefix} was not found`);
  }
  if (matches.size !== 1) {
    throw new Error(`LinkedIn registered query ${prefix} is ambiguous`);
  }
  const match = matches.values().next().value;
  if (match === undefined)
    throw new Error("LinkedIn registered-query resolution failed");
  return match;
}
var RESTLI_V2_VALUE_LIMITS = Object.freeze({
  maximumDepth: 12,
  maximumNodes: 4096,
  maximumStringCharacters: 8192,
  maximumListItems: 512,
  maximumObjectFields: 256,
  maximumEncodedCharacters: 64 * 1024
});
function encodedRestliString(value) {
  if (value.length > RESTLI_V2_VALUE_LIMITS.maximumStringCharacters) {
    throw new Error("Rest.li string exceeds the value limit");
  }
  let encoded;
  try {
    encoded = encodeURIComponent(value);
  } catch {
    throw new Error("Rest.li string contains invalid Unicode");
  }
  return encoded.replace(/[!'()*]/gu, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}
function boundedEncodedValue(value) {
  if (value.length > RESTLI_V2_VALUE_LIMITS.maximumEncodedCharacters) {
    throw new Error("Rest.li encoded value exceeds the output limit");
  }
  return value;
}
function encodeRestliValue(value, depth, state) {
  if (depth > RESTLI_V2_VALUE_LIMITS.maximumDepth) {
    throw new Error("Rest.li value exceeds the nesting-depth limit");
  }
  state.nodes += 1;
  if (state.nodes > RESTLI_V2_VALUE_LIMITS.maximumNodes) {
    throw new Error("Rest.li value exceeds the node limit");
  }
  if (value === null)
    return "null";
  if (typeof value === "string")
    return boundedEncodedValue(encodedRestliString(value));
  if (typeof value === "boolean")
    return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value))
      throw new Error("Rest.li numbers must be safe integers");
    return Object.is(value, -0) ? "0" : String(value);
  }
  if (Array.isArray(value)) {
    if (value.length > RESTLI_V2_VALUE_LIMITS.maximumListItems) {
      throw new Error("Rest.li list exceeds the item limit");
    }
    if (state.active.has(value))
      throw new Error("Rest.li value contains a cycle");
    state.active.add(value);
    try {
      const items = value.map((item) => encodeRestliValue(item, depth + 1, state));
      return boundedEncodedValue(`List(${items.join(",")})`);
    } finally {
      state.active.delete(value);
    }
  }
  if (typeof value !== "object" || value === null) {
    throw new Error("Rest.li value contains an unsupported type");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("Rest.li objects must be plain records");
  }
  if (state.active.has(value))
    throw new Error("Rest.li value contains a cycle");
  const keys = Reflect.ownKeys(value);
  if (keys.length > RESTLI_V2_VALUE_LIMITS.maximumObjectFields) {
    throw new Error("Rest.li object exceeds the field limit");
  }
  if (keys.some((key) => typeof key !== "string")) {
    throw new Error("Rest.li object cannot contain symbol fields");
  }
  const stringKeys = keys;
  for (const key of stringKeys) {
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(key)) {
      throw new Error("Rest.li object contains an invalid field name");
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw new Error("Rest.li object fields must be enumerable data properties");
    }
  }
  state.active.add(value);
  try {
    const fields = stringKeys.sort().map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor)) {
        throw new Error("Rest.li object field changed during encoding");
      }
      return `${key}:${encodeRestliValue(descriptor.value, depth + 1, state)}`;
    });
    return boundedEncodedValue(`(${fields.join(",")})`);
  } finally {
    state.active.delete(value);
  }
}
function encodeRestliV2Value(value) {
  return encodeRestliValue(value, 0, { nodes: 0, active: new WeakSet });
}
function canonicalJson(value, depth, state) {
  if (depth > 64)
    throw new Error("LinkedIn GraphQL response exceeds the nesting-depth limit");
  state.nodes += 1;
  if (state.nodes > 1e5)
    throw new Error("LinkedIn GraphQL response exceeds the node limit");
  if (value === null)
    return "null";
  if (typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error("LinkedIn GraphQL response contains a non-finite number");
    return Object.is(value, -0) ? "0" : String(value);
  }
  if (typeof value !== "object" || value === null) {
    throw new Error("LinkedIn GraphQL response contains a non-JSON value");
  }
  if (state.active.has(value))
    throw new Error("LinkedIn GraphQL response contains a cycle");
  state.active.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((item) => canonicalJson(item, depth + 1, state)).join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("LinkedIn GraphQL response contains a non-plain object");
    }
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string")) {
      throw new Error("LinkedIn GraphQL response contains symbol fields");
    }
    const stringKeys = keys;
    for (const key of stringKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
        throw new Error("LinkedIn GraphQL response fields must be enumerable data properties");
      }
    }
    return `{${stringKeys.sort().map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor)) {
        throw new Error("LinkedIn GraphQL response changed during normalization");
      }
      return `${JSON.stringify(key)}:${canonicalJson(descriptor.value, depth + 1, state)}`;
    }).join(",")}}`;
  } finally {
    state.active.delete(value);
  }
}
function graphqlRecord(value, label) {
  if (!isRecord(value))
    throw new Error(`LinkedIn GraphQL ${label} must be an object`);
  return value;
}
function entityIdentityKeys(entity) {
  const keys = [];
  for (const field of ["entityUrn", "backendUrn", "urn"]) {
    if (!hasOwn(entity, field))
      continue;
    const value = entity[field];
    if (typeof value !== "string" || value.length === 0 || value.length > 4096) {
      throw new Error(`LinkedIn GraphQL included entity has an invalid ${field}`);
    }
    keys.push(value);
  }
  if (keys.length === 0)
    throw new Error("LinkedIn GraphQL included entity has no canonical URN");
  return [...new Set(keys)];
}
function normalizeLinkedInGraphqlEnvelope(value) {
  const envelope = graphqlRecord(value, "envelope");
  if (hasOwn(envelope, "serviceErrorCode")) {
    throw new Error("LinkedIn GraphQL response contains a service error");
  }
  if (hasOwn(envelope, "errors")) {
    if (!Array.isArray(envelope.errors))
      throw new Error("LinkedIn GraphQL errors must be an array");
    if (envelope.errors.length > 0)
      throw new Error("LinkedIn GraphQL response contains provider errors");
  }
  const data = graphqlRecord(envelope.data, "data");
  canonicalJson(data, 0, { nodes: 0, active: new WeakSet });
  const rawIncluded = envelope.included === undefined ? [] : envelope.included;
  if (!Array.isArray(rawIncluded))
    throw new Error("LinkedIn GraphQL included must be an array");
  const included = [];
  const entitiesByUrn = new Map;
  const canonicalByUrn = new Map;
  const primaryUrns = new Set;
  for (const rawEntity of rawIncluded) {
    const entity = graphqlRecord(rawEntity, "included entity");
    const canonical = canonicalJson(entity, 0, { nodes: 0, active: new WeakSet });
    const urns = entityIdentityKeys(entity);
    let duplicate = false;
    for (const urn of urns) {
      const prior = canonicalByUrn.get(urn);
      if (prior !== undefined && prior !== canonical) {
        throw new Error("LinkedIn GraphQL included entities conflict for one URN");
      }
      if (prior === canonical)
        duplicate = true;
    }
    for (const urn of urns) {
      canonicalByUrn.set(urn, canonical);
      if (!entitiesByUrn.has(urn))
        entitiesByUrn.set(urn, entity);
    }
    const primaryUrn = urns[0];
    if (primaryUrn === undefined)
      throw new Error("LinkedIn GraphQL included entity identity disappeared");
    if (!duplicate && !primaryUrns.has(primaryUrn)) {
      included.push(entity);
      primaryUrns.add(primaryUrn);
    }
  }
  return {
    data,
    included: Object.freeze(included),
    entitiesByUrn
  };
}
function boundedText(value, label, maximum) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || /[\0\r]/u.test(value))
    throw new Error(`${label} must be a bounded string`);
  return value;
}
function optionalText(value, label, maximum) {
  if (value === null || value === undefined)
    return null;
  return boundedText(value, label, maximum);
}
function nonnegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return value;
}
function optionalNonnegativeInteger(value, label) {
  if (value === null || value === undefined)
    return null;
  return nonnegativeInteger(value, label);
}
function linkedInUrn(value, label, maximum = 4096) {
  const urn = boundedText(value, label, maximum);
  if (!/^urn:li:[A-Za-z][A-Za-z0-9_]*:.+$/u.test(urn)) {
    throw new Error(`${label} must be an exact LinkedIn URN`);
  }
  return urn;
}
function linkedInPersonalProfilePublicIdentifier(value) {
  const identifier = boundedText(value, "LinkedIn personal profile public identifier", 100);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,99}$/u.test(identifier)) {
    throw new Error("LinkedIn personal profile public identifier has an unsupported format");
  }
  return identifier.toLowerCase();
}
function linkedInTarget(value, kind) {
  const label = kind === "in" ? "personal profile" : "organization";
  const raw = boundedText(value, `LinkedIn ${label} URL`, 512);
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`LinkedIn ${label} URL must be an absolute URL`);
  }
  if (url.origin !== "https://www.linkedin.com" || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "")
    throw new Error(`LinkedIn ${label} URL must use the exact public LinkedIn origin`);
  const match = new RegExp(`^/${kind}/([A-Za-z0-9][A-Za-z0-9_-]{1,99})/?$`, "u").exec(url.pathname);
  if (match?.[1] === undefined) {
    throw new Error(`LinkedIn ${label} URL has an unsupported path`);
  }
  const slug = kind === "in" ? linkedInPersonalProfilePublicIdentifier(match[1]) : match[1].toLowerCase();
  return Object.freeze({
    slug,
    url: `https://www.linkedin.com/${kind}/${slug}/`
  });
}
function linkedInPersonalProfileTarget(value) {
  return linkedInTarget(value, "in");
}
function linkedInOrganizationTarget(value) {
  return linkedInTarget(value, "company");
}
function linkedInObservationTime(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || !Number.isFinite(Date.parse(value)))
    throw new Error("LinkedIn profile observedAt must be an exact UTC timestamp");
  return value;
}
function linkedInExactCountMetric(value, label) {
  return Object.freeze({
    status: "available",
    value: nonnegativeInteger(value, label),
    precision: "exact",
    unit: "count"
  });
}
function decodeLinkedInProfileEntity(entity) {
  if (entity === "&nbsp;")
    return " ";
  return decodeLinkedInArticleEntity(entity);
}
function linkedInVisibleText(value) {
  const withoutScripts = value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ");
  return withoutScripts.replace(/<[^>]+>/gu, " ").replace(/&(?:nbsp|quot|amp|lt|gt|apos|#(?:[xX][0-9A-Fa-f]{1,6}|[0-9]{1,7}));/gu, (entity) => decodeLinkedInProfileEntity(entity)).replace(/\s+/gu, " ").trim();
}
function exactLinkedInLabelCount(value, noun) {
  const match = new RegExp(`^(0|[1-9][0-9]{0,2}(?:,[0-9]{3})*) ${noun}$`, "u").exec(value);
  if (match?.[1] === undefined) {
    throw new Error(`LinkedIn ${noun} label was not an exact count`);
  }
  const count = Number(match[1].replaceAll(",", ""));
  return nonnegativeInteger(count, `LinkedIn ${noun} count`);
}
function linkedInHtmlAttribute(value, name) {
  const matches = [...value.matchAll(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "giu"))];
  if (matches.length === 0)
    return null;
  if (matches.length !== 1)
    throw new Error(`LinkedIn HTML repeated ${name}`);
  const raw = matches[0]?.[1] ?? matches[0]?.[2];
  if (raw === undefined || raw.length > 4096) {
    throw new Error(`LinkedIn HTML ${name} exceeded its reviewed bound`);
  }
  return raw.replace(/&(?:quot|amp|lt|gt|apos|#(?:[xX][0-9A-Fa-f]{1,6}|[0-9]{1,7}));/gu, (entity) => decodeLinkedInProfileEntity(entity));
}
function linkedInSelfFollowerCount(html) {
  if (typeof html !== "string" || html.length < 1 || html.length > 8 * 1024 * 1024) {
    throw new Error("LinkedIn personal profile exceeded its reviewed HTML bound");
  }
  const counts = [];
  let anchors = 0;
  for (const match of html.matchAll(/<a\b([^>]{0,4096})>([\s\S]{0,16384}?)<\/a>/giu)) {
    anchors += 1;
    if (anchors > 1e4)
      throw new Error("LinkedIn personal profile returned too many anchors");
    const attributes = match[1];
    const body = match[2];
    if (attributes === undefined || body === undefined)
      continue;
    const href = linkedInHtmlAttribute(attributes, "href");
    if (href === null)
      continue;
    let url;
    try {
      url = new URL(href, "https://www.linkedin.com");
    } catch {
      continue;
    }
    if (url.origin !== "https://www.linkedin.com" || url.pathname !== "/mynetwork/network-manager/people-follow/followers" || url.search !== "" || url.hash !== "")
      continue;
    counts.push(exactLinkedInLabelCount(linkedInVisibleText(body), "followers"));
  }
  if (counts.length !== 1) {
    throw new Error("LinkedIn personal profile did not bind one exact self follower count");
  }
  return counts[0];
}
function linkedInConnectionsCount(html) {
  if (typeof html !== "string" || html.length < 1 || html.length > 8 * 1024 * 1024) {
    throw new Error("LinkedIn connections page exceeded its reviewed HTML bound");
  }
  const text = linkedInVisibleText(html);
  if (!text.includes("Sort by:") || !text.includes("Search with filters")) {
    throw new Error("LinkedIn connections page omitted its exact list controls");
  }
  const labels = [...text.matchAll(/\b(0|[1-9][0-9]{0,2}(?:,[0-9]{3})*) connections\b/gu)].map((match) => match[0]);
  if (labels.length !== 1 || labels[0] === undefined) {
    throw new Error("LinkedIn connections page did not expose one exact total");
  }
  return exactLinkedInLabelCount(labels[0], "connections");
}
function projectLinkedInPersonalProfileStats(input) {
  const target = linkedInPersonalProfileTarget(input.profileUrl);
  const subject = boundedText(input.expectedSubject, "LinkedIn personal profile subject", 512);
  if (!/^urn:li:fsd_profile:[0-9]{1,32}$/u.test(subject)) {
    throw new Error("LinkedIn personal profile subject has an unsupported format");
  }
  const publicIdentifier = linkedInPersonalProfilePublicIdentifier(input.expectedPublicIdentifier);
  if (target.slug !== publicIdentifier) {
    throw new Error("LinkedIn personal profile URL does not match the bound current member public identifier");
  }
  const connections = input.connectionsHtml === null ? Object.freeze({ status: "unavailable", reason: "not-authorized" }) : linkedInExactCountMetric(linkedInConnectionsCount(input.connectionsHtml), "LinkedIn connections");
  return Object.freeze({
    schemaVersion: 1,
    provider: "linkedin",
    target: Object.freeze({ kind: "profile", id: subject, url: target.url }),
    observedAt: linkedInObservationTime(input.observedAt),
    completeness: input.connectionsHtml === null ? "partial" : "complete",
    metrics: Object.freeze({
      followers: linkedInExactCountMetric(linkedInSelfFollowerCount(input.profileHtml), "LinkedIn followers"),
      connections
    }),
    metadata: Object.freeze({ profileSlug: target.slug })
  });
}
function linkedInEmbeddedRecords(html) {
  if (typeof html !== "string" || html.length < 1 || html.length > 8 * 1024 * 1024) {
    throw new Error("LinkedIn organization page exceeded its reviewed HTML bound");
  }
  const roots = [];
  let codeTags = 0;
  for (const match of html.matchAll(/<code\b([^>]{0,4096})>([\s\S]*?)<\/code>/giu)) {
    codeTags += 1;
    if (codeTags > 256)
      throw new Error("LinkedIn organization page returned too many code payloads");
    const attributes = match[1];
    const body = match[2];
    if (attributes === undefined || body === undefined)
      continue;
    const id = linkedInHtmlAttribute(attributes, "id");
    if (id === null || !/^bpr-guid-[0-9]{1,12}$/u.test(id))
      continue;
    linkedInArticleCodeAttributes(attributes);
    if (body.length < 1 || body.length > 1024 * 1024) {
      throw new Error("LinkedIn organization bootstrap payload exceeded its reviewed bound");
    }
    const json = body.replace(LINKEDIN_ARTICLE_HTML_ENTITY, (entity) => decodeLinkedInArticleEntity(entity)).trim();
    try {
      roots.push(JSON.parse(json));
    } catch {
      throw new Error("LinkedIn organization bootstrap payload contained malformed JSON");
    }
  }
  if (roots.length < 1)
    throw new Error("LinkedIn organization page omitted its bootstrap payloads");
  const records = [];
  const stack = roots.map((value) => ({ value, depth: 0 }));
  let nodes = 0;
  while (stack.length > 0) {
    const next = stack.pop();
    nodes += 1;
    if (nodes > 500000 || next.depth > 32) {
      throw new Error("LinkedIn organization bootstrap exceeded its traversal bound");
    }
    if (Array.isArray(next.value)) {
      if (next.value.length > 20000) {
        throw new Error("LinkedIn organization bootstrap array exceeded its reviewed bound");
      }
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
function oneUniqueLinkedInText(values, label, maximum, required) {
  const normalized = values.filter((value) => value !== undefined && value !== null && value !== "").map((value) => boundedText(value, label, maximum));
  const unique = [...new Set(normalized)];
  if (unique.length === 0 && !required)
    return null;
  if (unique.length !== 1)
    throw new Error(`${label} was missing or ambiguous`);
  return unique[0];
}
function safeLinkedInPublicUrl(value, label) {
  if (value === null)
    return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute URL`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:" || url.username !== "" || url.password !== "")
    throw new Error(`${label} must be a safe public HTTP URL`);
  return url.href;
}
function projectLinkedInOrganizationStats(input) {
  const target = linkedInOrganizationTarget(input.organizationUrl);
  const records = linkedInEmbeddedRecords(input.html);
  const companies = records.filter((record) => record.$type === "com.linkedin.voyager.dash.organization.Company" && record.universalName === target.slug);
  if (companies.length < 1) {
    throw new Error("LinkedIn organization response did not bind the requested universal name");
  }
  const companyIds = new Set(companies.map((company) => {
    const id = boundedText(company.entityUrn, "LinkedIn organization entity URN", 512);
    if (!/^urn:li:fsd_company:[0-9]{1,32}$/u.test(id)) {
      throw new Error("LinkedIn organization entity URN changed format");
    }
    return id;
  }));
  const followingRefs = new Set(companies.map((company) => {
    const ref = boundedText(company["*followingState"], "LinkedIn organization following-state reference", 1024);
    if (!ref.startsWith("urn:li:fsd_followingState:")) {
      throw new Error("LinkedIn organization following-state reference changed format");
    }
    return ref;
  }));
  if (companyIds.size !== 1 || followingRefs.size !== 1) {
    throw new Error("LinkedIn organization response exposed ambiguous target identities");
  }
  const followingRef = followingRefs.values().next().value;
  const states = records.filter((record) => record.$type === "com.linkedin.voyager.dash.feed.FollowingState" && record.entityUrn === followingRef);
  const followerCounts = new Set(states.map((state) => nonnegativeInteger(state.followerCount, "LinkedIn organization followerCount")));
  if (followerCounts.size !== 1) {
    throw new Error("LinkedIn organization response omitted or contradicted its exact follower count");
  }
  const name = oneUniqueLinkedInText(companies.map((company) => company.name), "LinkedIn organization name", 1000, true);
  if (name === null)
    throw new Error("LinkedIn organization name is unavailable");
  const description = oneUniqueLinkedInText(companies.map((company) => company.description), "LinkedIn organization description", 20000, false);
  const websiteUrl = safeLinkedInPublicUrl(oneUniqueLinkedInText(companies.map((company) => company.websiteUrl), "LinkedIn organization website URL", 2048, false), "LinkedIn organization website URL");
  return Object.freeze({
    schemaVersion: 1,
    provider: "linkedin",
    target: Object.freeze({
      kind: "organization",
      id: companyIds.values().next().value,
      url: target.url
    }),
    observedAt: linkedInObservationTime(input.observedAt),
    completeness: "complete",
    metrics: Object.freeze({
      followers: linkedInExactCountMetric(followerCounts.values().next().value, "LinkedIn organization followers")
    }),
    metadata: Object.freeze({
      universalName: target.slug,
      name,
      description,
      websiteUrl
    })
  });
}
function linkedInMailboxUrnFromMiniProfile(value) {
  const miniProfile = boundedText(value, "LinkedIn normalized mini-profile URN", 512);
  const suffix = /^urn:li:fs_miniProfile:([A-Za-z0-9_-]{1,256})$/u.exec(miniProfile)?.[1];
  if (suffix === undefined)
    throw new Error("LinkedIn normalized mini-profile URN is invalid");
  return `urn:li:fsd_profile:${suffix}`;
}
var LINKEDIN_FIRST_PARTY_ARTICLES_PATH = "/voyager/api/voyagerPublishingDashFirstPartyArticles";
var LINKEDIN_ARTICLE_PAGE_MAX_CHARACTERS = 2 * 1024 * 1024;
var LINKEDIN_ARTICLE_CODE_PAYLOAD_MAX_CHARACTERS = 1024 * 1024;
var LINKEDIN_ARTICLE_CODE_TAG_MAX_COUNT = 5000;
var LINKEDIN_ARTICLE_MATCHING_PAYLOAD_MAX_COUNT = 20;
var LINKEDIN_ARTICLE_TYPE = "com.linkedin.voyager.dash.publishing.FirstPartyArticle";
var LINKEDIN_ARTICLE_COLLECTION_TYPE = "com.linkedin.restli.common.CollectionResponse";
var LINKEDIN_TEXT_BLOCK_TYPE = "com.linkedin.voyager.dash.publishing.TextBlock";
var LINKEDIN_TEXT_VIEW_MODEL_TYPE = "com.linkedin.voyager.dash.common.text.TextViewModel";
var LINKEDIN_TEXT_ATTRIBUTE_TYPE = "com.linkedin.voyager.dash.common.text.TextAttribute";
var LINKEDIN_IMAGE_BLOCK_TYPE = "com.linkedin.voyager.dash.publishing.ImageBlock";
var LINKEDIN_IMAGE_VIEW_MODEL_TYPE = "com.linkedin.voyager.dash.common.image.ImageViewModel";
var LINKEDIN_IMAGE_ATTRIBUTE_TYPE = "com.linkedin.voyager.dash.common.image.ImageAttribute";
var LINKEDIN_VECTOR_IMAGE_TYPE = "com.linkedin.common.VectorImage";
var LINKEDIN_VECTOR_ARTIFACT_TYPE = "com.linkedin.common.VectorArtifact";
var LINKEDIN_COVER_IMAGE_TYPE = "com.linkedin.voyager.dash.publishing.CoverImage";
function exactObjectKeys(value, expected, label) {
  if (Object.keys(value).sort().join(",") !== [...expected].sort().join(",")) {
    throw new Error(`${label} has unsupported fields`);
  }
}
function linkedInArticleDraftId(value, label = "LinkedIn Article draft ID") {
  if (typeof value !== "string" || !/^[0-9]{1,32}$/u.test(value)) {
    throw new Error(`${label} must be one exact 1-32 digit private LinkedIn Article ID`);
  }
  return value;
}
function linkedInArticleDraftUrn(value) {
  return `urn:li:fsd_firstPartyArticle:${linkedInArticleDraftId(value)}`;
}
function linkedInArticleProfileUrn(value) {
  if (typeof value !== "string" || value.length > 512 || !/^urn:li:fsd_profile:[A-Za-z0-9_-]{1,256}$/u.test(value))
    throw new Error("LinkedIn Article profile URN is invalid");
  return value;
}
function linkedInArticleDraftEntityUrl(value) {
  const urn = linkedInArticleDraftUrn(value);
  return new URL(`${LINKEDIN_FIRST_PARTY_ARTICLES_PATH}/${urn}`, "https://www.linkedin.com");
}
function linkedInArticleDraftEditUrl(value) {
  const draftId = linkedInArticleDraftId(value);
  return new URL(`/article/edit/${draftId}/`, "https://www.linkedin.com");
}
var LINKEDIN_ARTICLE_INLINE_IMAGE_UPLOAD_PATH = "/voyager/api/voyagerVideoDashMediaUploadMetadata?action=upload";
function linkedInArticleBoundUrl(value, label, pathPrefix) {
  const href = boundedText(value, label, 64 * 1024);
  let url;
  try {
    url = new URL(href);
  } catch {
    throw new Error(`${label} escaped its reviewed LinkedIn origin`);
  }
  if (url.origin !== "https://www.linkedin.com" || url.username !== "" || url.password !== "" || url.hash !== "" || !url.pathname.startsWith(pathPrefix) || url.href !== href)
    throw new Error(`${label} escaped its reviewed LinkedIn origin`);
  return href;
}
function normalizeLinkedInArticleImageUploadRegistration(value) {
  const envelope = graphqlRecord(value, "LinkedIn Article image registration response");
  const envelopeFields = Object.keys(envelope).sort().join(",");
  let dataValue;
  if (envelopeFields === "data,included") {
    if (!Array.isArray(envelope.included) || envelope.included.length !== 0) {
      throw new Error("LinkedIn Article image registration returned unexpected included entities");
    }
    const data = graphqlRecord(envelope.data, "LinkedIn Article image registration response.data");
    const dataFields = Object.keys(data).sort().join(",");
    if (dataFields === "$type,value") {
      if (data.$type !== "com.linkedin.restli.common.ActionResponse") {
        throw new Error("LinkedIn Article image registration changed its response type");
      }
    } else if (dataFields !== "value") {
      throw new Error("LinkedIn Article image registration response.data has unsupported fields");
    }
    dataValue = data.value;
  } else if (envelopeFields === "value") {
    dataValue = envelope.value;
  } else {
    throw new Error("LinkedIn Article image registration response has unsupported fields");
  }
  const registration = graphqlRecord(dataValue, "LinkedIn Article image registration response.data.value");
  const fullRegistrationFields = [
    "$type",
    "assetRealtimeTopic",
    "mediaArtifactUrn",
    "pollingUrl",
    "recipes",
    "singleUploadHeaders",
    "singleUploadUrl",
    "type",
    "urn"
  ];
  const legacySingleRegistrationFields = [
    "mediaArtifactUrn",
    "recipes",
    "singleUploadHeaders",
    "singleUploadUrl",
    "type",
    "urn"
  ];
  const currentSingleRegistrationFields = [
    "$type",
    "mediaArtifactUrn",
    "singleUploadHeaders",
    "singleUploadUrl",
    "type",
    "urn"
  ];
  const registrationFields = Object.keys(registration).sort().join(",");
  const fullFields = [...fullRegistrationFields].sort().join(",");
  const legacySingleFields = [...legacySingleRegistrationFields].sort().join(",");
  const currentSingleFields = [...currentSingleRegistrationFields].sort().join(",");
  if (registrationFields !== fullFields && registrationFields !== legacySingleFields && registrationFields !== currentSingleFields) {
    throw new Error("LinkedIn Article image registration response.data.value has unsupported fields");
  }
  const fullRegistration = registrationFields === fullFields;
  const currentSingleRegistration = registrationFields === currentSingleFields;
  if (registration.$type !== undefined && registration.$type !== "com.linkedin.mediauploader.MediaUploadMetadata")
    throw new Error("LinkedIn Article image registration changed its response type");
  if (registration.type !== "VECTOR" && registration.type !== "SINGLE") {
    throw new Error("LinkedIn Article image registration changed its media type");
  }
  if (registration.type === "VECTOR" && !fullRegistration) {
    throw new Error("LinkedIn Article image registration response.data.value has unsupported fields");
  }
  if (fullRegistration) {
    boundedText(registration.assetRealtimeTopic, "LinkedIn Article image registration assetRealtimeTopic", 4096);
  }
  linkedInUrn(registration.mediaArtifactUrn, "LinkedIn Article image registration mediaArtifactUrn");
  const assetUrn = linkedInArticleImageAssetUrn(registration.urn, "LinkedIn Article image registration urn");
  const recipeValues = currentSingleRegistration ? [] : registration.recipes;
  if (!Array.isArray(recipeValues) || !currentSingleRegistration && recipeValues.length < 1 || recipeValues.length > 20) {
    throw new Error("LinkedIn Article image registration recipes changed shape");
  }
  const recipes = recipeValues.map((recipe, index) => linkedInUrn(recipe, `LinkedIn Article image registration recipes[${index}]`));
  if (new Set(recipes).size !== recipes.length) {
    throw new Error("LinkedIn Article image registration repeated a recipe");
  }
  const headers = graphqlRecord(registration.singleUploadHeaders, "LinkedIn Article image registration singleUploadHeaders");
  exactObjectKeys(headers, ["media-type-family"], "LinkedIn Article image registration singleUploadHeaders");
  if (headers["media-type-family"] !== "STILLIMAGE") {
    throw new Error("LinkedIn Article image registration changed its upload headers");
  }
  let pollingUrl = null;
  if (fullRegistration && registration.type === "VECTOR") {
    pollingUrl = linkedInArticleBoundUrl(registration.pollingUrl, "LinkedIn Article image polling URL", "/voyager/api/");
  } else if (fullRegistration && registration.type === "SINGLE" && registration.pollingUrl !== null) {
    linkedInArticleBoundUrl(registration.pollingUrl, "LinkedIn Article image polling URL", "/");
  }
  return Object.freeze({
    assetUrn,
    pollingUrl,
    recipes: Object.freeze(recipes),
    uploadHeaders: Object.freeze({ "media-type-family": "STILLIMAGE" }),
    uploadUrl: linkedInArticleBoundUrl(registration.singleUploadUrl, "LinkedIn Article image upload URL", "/dms-uploads/")
  });
}
function linkedInArticleCodeAttributes(value) {
  if (typeof value !== "string" || value.length > 4096) {
    throw new Error("LinkedIn Article bootstrap code attributes exceeded their reviewed bound");
  }
  const attributes = new Map;
  let remaining = value.trim();
  while (remaining.length > 0) {
    const match = /^([A-Za-z][A-Za-z0-9:_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/u.exec(remaining);
    if (match === null) {
      throw new Error("LinkedIn Article bootstrap code attributes changed shape");
    }
    const name = match[1]?.toLowerCase();
    const attributeValue = match[2] ?? match[3];
    if (name === undefined || attributeValue === undefined || attributes.has(name)) {
      throw new Error("LinkedIn Article bootstrap code attributes were ambiguous");
    }
    attributes.set(name, attributeValue);
    remaining = remaining.slice(match[0].length).trimStart();
  }
  if ([...attributes.keys()].sort().join(",") !== "id,style") {
    throw new Error("LinkedIn Article bootstrap code attributes changed shape");
  }
  if (!/^bpr-guid-[0-9]{1,12}$/u.test(attributes.get("id") ?? "")) {
    throw new Error("LinkedIn Article bootstrap code identifier changed shape");
  }
  const style = (attributes.get("style") ?? "").replace(/\s/gu, "");
  if (style !== "display:none" && style !== "display:none;") {
    throw new Error("LinkedIn Article bootstrap code payload is no longer hidden");
  }
}
var LINKEDIN_ARTICLE_HTML_ENTITY = /&(?:quot|amp|lt|gt|apos|#(?:[xX][0-9A-Fa-f]{1,6}|[0-9]{1,7}));/gu;
function decodeLinkedInArticleEntity(entity) {
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
    throw new Error("LinkedIn Article bootstrap used an unsupported HTML entity");
  }
  const codePoint = Number.parseInt(numeric[1] ?? numeric[2] ?? "", numeric[1] === undefined ? 10 : 16);
  if (!Number.isSafeInteger(codePoint) || codePoint < 0 || codePoint > 1114111 || codePoint >= 55296 && codePoint <= 57343)
    throw new Error("LinkedIn Article bootstrap used an invalid numeric HTML entity");
  return String.fromCodePoint(codePoint);
}
function parseLinkedInArticleCodePayload(value, draftUrn) {
  linkedInArticleCodeAttributes(value.attributes);
  if (value.body.length < 1 || value.body.length > LINKEDIN_ARTICLE_CODE_PAYLOAD_MAX_CHARACTERS || !value.body.includes(draftUrn))
    throw new Error("LinkedIn Article bootstrap code payload did not bind the exact draft");
  const json = value.body.replace(LINKEDIN_ARTICLE_HTML_ENTITY, (entity) => decodeLinkedInArticleEntity(entity)).trim();
  if (!json.startsWith("{") || !json.endsWith("}")) {
    throw new Error("LinkedIn Article bootstrap code payload changed its JSON boundary");
  }
  try {
    return JSON.parse(json);
  } catch {
    throw new Error("LinkedIn Article bootstrap code payload contained malformed JSON");
  }
}
function linkedInArticleDraftEnvelopeFromCodePayloads(value, draftIdValue) {
  const draftUrn = linkedInArticleDraftUrn(draftIdValue);
  if (!Array.isArray(value) || value.length !== 1) {
    throw new Error("LinkedIn Article bootstrap did not isolate one exact hidden payload");
  }
  const payload = graphqlRecord(value[0], "Article bootstrap code payload");
  exactObjectKeys(payload, ["attributes", "body"], "LinkedIn Article bootstrap code payload");
  const attributes = boundedText(payload.attributes, "LinkedIn Article bootstrap code attributes", 4096);
  const body = boundedText(payload.body, "LinkedIn Article bootstrap code body", LINKEDIN_ARTICLE_CODE_PAYLOAD_MAX_CHARACTERS);
  return parseLinkedInArticleCodePayload({ attributes, body }, draftUrn);
}
function linkedInArticleDraftEnvelopeFromHtml(value, draftIdValue) {
  const draftUrn = linkedInArticleDraftUrn(draftIdValue);
  if (typeof value !== "string" || value.length < 1 || value.length > LINKEDIN_ARTICLE_PAGE_MAX_CHARACTERS)
    throw new Error("LinkedIn Article page exceeded its reviewed HTML bound");
  const payloads = [];
  let codeTags = 0;
  for (const match of value.matchAll(/<code\b([^>]*)>([\s\S]*?)<\/code>/giu)) {
    codeTags += 1;
    if (codeTags > LINKEDIN_ARTICLE_CODE_TAG_MAX_COUNT) {
      throw new Error("LinkedIn Article page returned too many code payloads");
    }
    const attributes = match[1];
    const body = match[2];
    if (attributes === undefined || body === undefined || !body.includes(draftUrn))
      continue;
    payloads.push(Object.freeze({ attributes, body }));
    if (payloads.length > LINKEDIN_ARTICLE_MATCHING_PAYLOAD_MAX_COUNT) {
      throw new Error("LinkedIn Article page returned too many matching payloads");
    }
  }
  return linkedInArticleDraftEnvelopeFromCodePayloads(payloads, draftIdValue);
}
function linkedInArticleBlockType(type) {
  if (type === "paragraph")
    return "PARAGRAPH";
  if (type === "heading1")
    return "HEADING_1";
  if (type === "heading2")
    return "HEADING_2";
  if (type === "blockquote")
    return "QUOTE";
  throw new Error("LinkedIn Article drafts currently support only paragraph, heading1, heading2, and blockquote blocks");
}
function linkedInArticleDocumentBlockType(value, label) {
  if (value === "PARAGRAPH")
    return "paragraph";
  if (value === "HEADING_1")
    return "heading1";
  if (value === "HEADING_2")
    return "heading2";
  if (value === "QUOTE")
    return "blockquote";
  throw new Error(`${label} has an unsupported LinkedIn Article text-block type`);
}
function linkedInArticleAttribute(link) {
  return Object.freeze({
    $type: LINKEDIN_TEXT_ATTRIBUTE_TYPE,
    detailDataUnion: Object.freeze({ hyperlink: link.url }),
    length: link.length,
    start: link.offset
  });
}
function buildLinkedInArticleContent(document) {
  return Object.freeze(document.blocks.map((block) => {
    if (block.styles.length !== 0) {
      throw new Error("LinkedIn Article text styles remain capture-required");
    }
    return Object.freeze({
      textBlock: Object.freeze({
        $type: LINKEDIN_TEXT_BLOCK_TYPE,
        content: Object.freeze({
          $type: LINKEDIN_TEXT_VIEW_MODEL_TYPE,
          attributesV2: Object.freeze(block.links.map(linkedInArticleAttribute)),
          text: block.text
        }),
        type: linkedInArticleBlockType(block.type)
      })
    });
  }));
}
function linkedInArticleImageAssetUrn(value, label) {
  if (typeof value !== "string" || value.length > 512 || !/^urn:li:digitalmediaAsset:[A-Za-z0-9_-]{1,256}$/u.test(value))
    throw new Error(`${label} must be one exact LinkedIn digital-media asset URN`);
  return value;
}
function linkedInArticleImageWriteBlock(block, assetUrnValue) {
  const assetUrn = linkedInArticleImageAssetUrn(assetUrnValue, `LinkedIn Article image ${block.imageIndex}`);
  if (block.altText === undefined) {
    throw new Error("LinkedIn Article inline images require descriptive altText");
  }
  return Object.freeze({
    imageBlock: Object.freeze({
      $type: LINKEDIN_IMAGE_BLOCK_TYPE,
      alignment: "FULL_WIDTH",
      caption: Object.freeze({
        $type: LINKEDIN_TEXT_VIEW_MODEL_TYPE,
        text: block.caption ?? ""
      }),
      content: Object.freeze({
        $type: LINKEDIN_IMAGE_VIEW_MODEL_TYPE,
        accessibilityText: block.altText,
        attributes: Object.freeze([Object.freeze({
          $type: LINKEDIN_IMAGE_ATTRIBUTE_TYPE,
          detailDataUnion: Object.freeze({
            vectorImage: Object.freeze({
              $type: LINKEDIN_VECTOR_IMAGE_TYPE,
              artifacts: Object.freeze([]),
              digitalmediaAsset: assetUrn
            })
          })
        })])
      })
    })
  });
}
function buildLinkedInArticleContentV2(document, imageAssetUrns) {
  const used = new Set;
  const content = document.blocks.map((block) => {
    if (block.type === "image") {
      used.add(block.imageIndex);
      return linkedInArticleImageWriteBlock(block, imageAssetUrns[block.imageIndex]);
    }
    return buildLinkedInArticleContent(Object.freeze({
      schemaVersion: 1,
      blocks: Object.freeze([block])
    }))[0];
  });
  if (imageAssetUrns.length !== used.size || imageAssetUrns.some((_, index) => !used.has(index)))
    throw new Error("LinkedIn Article image assets did not bind every exact image block");
  return Object.freeze(content);
}
function escapeLinkedInArticleHtmlText(value) {
  return value.replace(/[&<>]/gu, (character) => {
    if (character === "&")
      return "&amp;";
    if (character === "<")
      return "&lt;";
    return "&gt;";
  });
}
function escapeLinkedInArticleHtmlAttribute(value) {
  return value.replace(/[&<>"]/gu, (character) => {
    if (character === "&")
      return "&amp;";
    if (character === "<")
      return "&lt;";
    if (character === ">")
      return "&gt;";
    return "&quot;";
  });
}
function linkedInArticleHtmlTag(type) {
  if (type === "paragraph")
    return "p";
  if (type === "heading1")
    return "h2";
  if (type === "heading2")
    return "h3";
  if (type === "blockquote")
    return "blockquote";
  throw new Error("LinkedIn Article drafts currently support only paragraph, heading1, heading2, and blockquote blocks");
}
function buildLinkedInArticleContentHtml(document) {
  return document.blocks.map((block) => {
    if (block.styles.length !== 0) {
      throw new Error("LinkedIn Article text styles remain capture-required");
    }
    let cursor = 0;
    let content = "";
    for (const link of block.links) {
      content += escapeLinkedInArticleHtmlText(block.text.slice(cursor, link.offset));
      content += `<a href="${escapeLinkedInArticleHtmlAttribute(link.url)}" target="_blank">`;
      content += escapeLinkedInArticleHtmlText(block.text.slice(link.offset, link.offset + link.length));
      content += "</a>";
      cursor = link.offset + link.length;
    }
    content += escapeLinkedInArticleHtmlText(block.text.slice(cursor));
    const tag = linkedInArticleHtmlTag(block.type);
    return `<${tag}>${content}</${tag}>`;
  }).join("");
}
function buildLinkedInArticleContentHtmlV2(document, imageAssetUrns) {
  const used = new Set;
  const html = document.blocks.map((block) => {
    if (block.type !== "image") {
      return buildLinkedInArticleContentHtml(Object.freeze({
        schemaVersion: 1,
        blocks: Object.freeze([block])
      }));
    }
    const assetUrn = linkedInArticleImageAssetUrn(imageAssetUrns[block.imageIndex], `LinkedIn Article image ${block.imageIndex}`);
    used.add(block.imageIndex);
    return `<figure><img data-media-urn="${escapeLinkedInArticleHtmlAttribute(assetUrn)}"><figcaption>${escapeLinkedInArticleHtmlText(block.caption ?? "")}</figcaption></figure>`;
  }).join("");
  if (imageAssetUrns.length !== used.size || imageAssetUrns.some((_, index) => !used.has(index)))
    throw new Error("LinkedIn Article image assets did not bind every exact image block");
  return html;
}
function buildLinkedInArticleCreateBody(profileUrnValue, titleValue) {
  const profileUrn = linkedInArticleProfileUrn(profileUrnValue);
  if (typeof titleValue !== "string" || titleValue.length < 1 || titleValue.length > 150 || /[\0\r\n]/u.test(titleValue))
    throw new Error("input.title must be one bounded plain-text line");
  return Object.freeze({
    authors: Object.freeze([Object.freeze({ profileUrn })]),
    contentHtml: "",
    state: "AUTOSAVED",
    title: titleValue
  });
}
function buildLinkedInArticleTitlePatch(titleValue) {
  const title = buildLinkedInArticleCreateBody("urn:li:fsd_profile:fixture", titleValue).title;
  return Object.freeze({
    patch: Object.freeze({ $set: Object.freeze({ state: "AUTOSAVED", title }) })
  });
}
function buildLinkedInArticleCoverPatch(assetUrnValue) {
  const originalImageUrn = linkedInArticleImageAssetUrn(assetUrnValue, "LinkedIn Article cover image");
  return Object.freeze({
    patch: Object.freeze({
      $set: Object.freeze({
        coverMediaV2Union: Object.freeze({
          coverImage: Object.freeze({
            $type: LINKEDIN_COVER_IMAGE_TYPE,
            caption: Object.freeze({ text: "" }),
            originalImageUrn
          })
        }),
        state: "AUTOSAVED"
      })
    })
  });
}
function buildLinkedInArticleContentPatch(document) {
  return Object.freeze({
    patch: Object.freeze({
      $set: Object.freeze({
        content: buildLinkedInArticleContent(document),
        contentHtml: buildLinkedInArticleContentHtml(document),
        state: "AUTOSAVED"
      })
    })
  });
}
function buildLinkedInArticleContentPatchV2(document, imageAssetUrns) {
  return Object.freeze({
    patch: Object.freeze({
      $set: Object.freeze({
        content: buildLinkedInArticleContentV2(document, imageAssetUrns),
        contentHtml: buildLinkedInArticleContentHtmlV2(document, imageAssetUrns),
        state: "AUTOSAVED"
      })
    })
  });
}
function normalizeLinkedInArticleLink(value, text, label) {
  const attribute = graphqlRecord(value, label);
  exactObjectKeys(attribute, ["$type", "detailDataUnion", "length", "start"], label);
  if (attribute.$type !== LINKEDIN_TEXT_ATTRIBUTE_TYPE) {
    throw new Error(`${label} changed its reviewed LinkedIn text-attribute type`);
  }
  const detail = graphqlRecord(attribute.detailDataUnion, `${label}.detailDataUnion`);
  exactObjectKeys(detail, ["hyperlink"], `${label}.detailDataUnion`);
  const start = attribute.start;
  const length = attribute.length;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(length) || start < 0 || length < 1 || start + length > text.length)
    throw new Error(`${label} escaped its LinkedIn Article text`);
  const hyperlink = boundedText(detail.hyperlink, `${label}.hyperlink`, 8192);
  let parsed;
  try {
    parsed = new URL(hyperlink);
  } catch {
    throw new Error(`${label}.hyperlink is not an absolute HTTPS URL`);
  }
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "" || parsed.href !== hyperlink)
    throw new Error(`${label}.hyperlink is not one canonical absolute HTTPS URL`);
  return Object.freeze({ offset: start, length, url: hyperlink });
}
function normalizeLinkedInArticleBlock(value, index) {
  const label = `LinkedIn Article content[${index}]`;
  const wrapper = graphqlRecord(value, label);
  exactObjectKeys(wrapper, ["textBlock"], label);
  const textBlock = graphqlRecord(wrapper.textBlock, `${label}.textBlock`);
  exactObjectKeys(textBlock, ["$type", "content", "type"], `${label}.textBlock`);
  if (textBlock.$type !== LINKEDIN_TEXT_BLOCK_TYPE) {
    throw new Error(`${label}.textBlock changed its reviewed type`);
  }
  const content = graphqlRecord(textBlock.content, `${label}.textBlock.content`);
  exactObjectKeys(content, ["$type", "attributesV2", "text"], `${label}.textBlock.content`);
  if (content.$type !== LINKEDIN_TEXT_VIEW_MODEL_TYPE) {
    throw new Error(`${label}.textBlock.content changed its reviewed type`);
  }
  if (typeof content.text !== "string" || /[\0\r\n]/u.test(content.text)) {
    throw new Error(`${label}.textBlock.content.text must be one bounded line`);
  }
  if (!Array.isArray(content.attributesV2) || content.attributesV2.length > 500) {
    throw new Error(`${label}.textBlock.content.attributesV2 exceeded its reviewed bound`);
  }
  const links = content.attributesV2.map((attribute, linkIndex) => normalizeLinkedInArticleLink(attribute, content.text, `${label}.textBlock.content.attributesV2[${linkIndex}]`));
  let linkEnd = 0;
  for (const link of links) {
    if (link.offset < linkEnd)
      throw new Error(`${label} links must be ordered and non-overlapping`);
    linkEnd = link.offset + link.length;
  }
  return Object.freeze({
    type: linkedInArticleDocumentBlockType(textBlock.type, `${label}.textBlock.type`),
    text: content.text,
    links: Object.freeze(links),
    styles: Object.freeze([])
  });
}
function linkedInCanonicalHttpsUrl(value, label) {
  const url = boundedText(value, label, 8192);
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${label} is not one canonical absolute HTTPS URL`);
  }
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "" || parsed.href !== url)
    throw new Error(`${label} is not one canonical absolute HTTPS URL`);
  return url;
}
function normalizeLinkedInArticleImageBlock(value, index, imageIndex) {
  const label = `LinkedIn Article content[${index}]`;
  const wrapper = graphqlRecord(value, label);
  exactObjectKeys(wrapper, ["imageBlock"], label);
  const imageBlock = graphqlRecord(wrapper.imageBlock, `${label}.imageBlock`);
  exactObjectKeys(imageBlock, ["$type", "alignment", "caption", "content"], `${label}.imageBlock`);
  if (imageBlock.$type !== LINKEDIN_IMAGE_BLOCK_TYPE || imageBlock.alignment !== "FULL_WIDTH")
    throw new Error(`${label}.imageBlock changed its reviewed type or alignment`);
  const captionModel = graphqlRecord(imageBlock.caption, `${label}.imageBlock.caption`);
  exactObjectKeys(captionModel, ["$type", "attributesV2", "text"], `${label}.imageBlock.caption`);
  if (captionModel.$type !== LINKEDIN_TEXT_VIEW_MODEL_TYPE || !Array.isArray(captionModel.attributesV2) || captionModel.attributesV2.length !== 0 || typeof captionModel.text !== "string" || captionModel.text.length > 1000 || /[\0\r]/u.test(captionModel.text))
    throw new Error(`${label}.imageBlock.caption changed its reviewed shape`);
  const content = graphqlRecord(imageBlock.content, `${label}.imageBlock.content`);
  exactObjectKeys(content, ["$type", "accessibilityText", "accessibilityTextAttributes", "attributes"], `${label}.imageBlock.content`);
  if (content.$type !== LINKEDIN_IMAGE_VIEW_MODEL_TYPE || typeof content.accessibilityText !== "string" || content.accessibilityText.length < 1 || content.accessibilityText.length > 1000 || /[\0\r]/u.test(content.accessibilityText) || !Array.isArray(content.accessibilityTextAttributes) || content.accessibilityTextAttributes.length !== 0 || !Array.isArray(content.attributes) || content.attributes.length !== 1)
    throw new Error(`${label}.imageBlock.content changed its reviewed shape`);
  const attribute = graphqlRecord(content.attributes[0], `${label}.imageBlock.content.attributes[0]`);
  exactObjectKeys(attribute, ["$type", "detailDataUnion"], `${label}.imageBlock.content.attributes[0]`);
  if (attribute.$type !== LINKEDIN_IMAGE_ATTRIBUTE_TYPE) {
    throw new Error(`${label}.imageBlock.content changed its reviewed image attribute`);
  }
  const detail = graphqlRecord(attribute.detailDataUnion, `${label}.imageBlock.content.attributes[0].detailDataUnion`);
  exactObjectKeys(detail, ["vectorImage"], `${label}.imageBlock.content.attributes[0].detailDataUnion`);
  const vector = graphqlRecord(detail.vectorImage, `${label}.imageBlock.content.attributes[0].detailDataUnion.vectorImage`);
  exactObjectKeys(vector, ["$type", "artifacts", "digitalmediaAsset", "rootUrl"], `${label}.imageBlock.content.attributes[0].detailDataUnion.vectorImage`);
  if (vector.$type !== LINKEDIN_VECTOR_IMAGE_TYPE || !Array.isArray(vector.artifacts) || vector.artifacts.length < 1 || vector.artifacts.length > 20)
    throw new Error(`${label}.imageBlock vector image changed its reviewed shape`);
  const assetUrn = linkedInArticleImageAssetUrn(vector.digitalmediaAsset, `${label}.imageBlock vector image`);
  linkedInCanonicalHttpsUrl(vector.rootUrl, `${label}.imageBlock vector image rootUrl`);
  for (const [artifactIndex, rawArtifact] of vector.artifacts.entries()) {
    const artifactLabel = `${label}.imageBlock vector image artifacts[${artifactIndex}]`;
    const artifact = graphqlRecord(rawArtifact, artifactLabel);
    exactObjectKeys(artifact, ["$type", "expiresAt", "fileIdentifyingUrlPathSegment", "height", "width"], artifactLabel);
    if (artifact.$type !== LINKEDIN_VECTOR_ARTIFACT_TYPE || !Number.isSafeInteger(artifact.expiresAt) || artifact.expiresAt < 0 || !Number.isSafeInteger(artifact.height) || artifact.height < 1 || !Number.isSafeInteger(artifact.width) || artifact.width < 1 || typeof artifact.fileIdentifyingUrlPathSegment !== "string" || artifact.fileIdentifyingUrlPathSegment.length < 1 || artifact.fileIdentifyingUrlPathSegment.length > 4096 || /[\0\r\n]/u.test(artifact.fileIdentifyingUrlPathSegment))
      throw new Error(`${artifactLabel} changed its reviewed shape`);
  }
  return Object.freeze({
    assetUrn,
    block: Object.freeze({
      type: "image",
      imageIndex,
      altText: content.accessibilityText,
      ...captionModel.text === "" ? {} : { caption: captionModel.text }
    })
  });
}
function normalizeLinkedInCoverImageViewModel(value, label, requireAssetUrn) {
  const image = graphqlRecord(value, label);
  exactObjectKeys(image, ["$type", "attributes"], label);
  if (image.$type !== LINKEDIN_IMAGE_VIEW_MODEL_TYPE || !Array.isArray(image.attributes) || image.attributes.length !== 1)
    throw new Error(`${label} changed its reviewed image shape`);
  const attribute = graphqlRecord(image.attributes[0], `${label}.attributes[0]`);
  exactObjectKeys(attribute, ["$type", "detailDataUnion"], `${label}.attributes[0]`);
  if (attribute.$type !== LINKEDIN_IMAGE_ATTRIBUTE_TYPE) {
    throw new Error(`${label} changed its reviewed image attribute`);
  }
  const detail = graphqlRecord(attribute.detailDataUnion, `${label}.attributes[0].detailDataUnion`);
  exactObjectKeys(detail, ["vectorImage"], `${label}.attributes[0].detailDataUnion`);
  const vector = graphqlRecord(detail.vectorImage, `${label}.attributes[0].detailDataUnion.vectorImage`);
  exactObjectKeys(vector, requireAssetUrn ? ["$type", "artifacts", "digitalmediaAsset", "rootUrl"] : ["$type", "artifacts", "rootUrl"], `${label}.attributes[0].detailDataUnion.vectorImage`);
  if (vector.$type !== LINKEDIN_VECTOR_IMAGE_TYPE || !Array.isArray(vector.artifacts) || vector.artifacts.length < 1 || vector.artifacts.length > 20)
    throw new Error(`${label} changed its reviewed vector image shape`);
  linkedInCanonicalHttpsUrl(vector.rootUrl, `${label}.vectorImage.rootUrl`);
  for (const [artifactIndex, rawArtifact] of vector.artifacts.entries()) {
    const artifactLabel = `${label}.vectorImage.artifacts[${artifactIndex}]`;
    const artifact = graphqlRecord(rawArtifact, artifactLabel);
    exactObjectKeys(artifact, ["$type", "expiresAt", "fileIdentifyingUrlPathSegment", "height", "width"], artifactLabel);
    if (artifact.$type !== LINKEDIN_VECTOR_ARTIFACT_TYPE || !Number.isSafeInteger(artifact.expiresAt) || artifact.expiresAt < 0 || !Number.isSafeInteger(artifact.height) || artifact.height < 1 || !Number.isSafeInteger(artifact.width) || artifact.width < 1 || typeof artifact.fileIdentifyingUrlPathSegment !== "string" || artifact.fileIdentifyingUrlPathSegment.length < 1 || artifact.fileIdentifyingUrlPathSegment.length > 4096 || /[\0\r\n]/u.test(artifact.fileIdentifyingUrlPathSegment))
      throw new Error(`${artifactLabel} changed its reviewed shape`);
  }
  return requireAssetUrn ? linkedInArticleImageAssetUrn(vector.digitalmediaAsset, `${label}.vectorImage`) : null;
}
function normalizeLinkedInArticleCover(coverMediaValue, coverMediaV2UnionValue) {
  if (coverMediaValue === null && coverMediaV2UnionValue === null)
    return null;
  if (coverMediaValue === null || coverMediaV2UnionValue === null) {
    throw new Error("LinkedIn Article cover readback omitted one reviewed cover projection");
  }
  const legacy = graphqlRecord(coverMediaValue, "LinkedIn Article coverMedia");
  exactObjectKeys(legacy, ["$type", "caption", "originalImage", "originalImageUrn"], "LinkedIn Article coverMedia");
  if (legacy.$type !== LINKEDIN_COVER_IMAGE_TYPE) {
    throw new Error("LinkedIn Article coverMedia changed its reviewed type");
  }
  const legacyAssetUrn = linkedInArticleImageAssetUrn(legacy.originalImageUrn, "LinkedIn Article coverMedia.originalImageUrn");
  normalizeLinkedInCoverImageViewModel(legacy.originalImage, "LinkedIn Article coverMedia.originalImage", false);
  const caption = graphqlRecord(legacy.caption, "LinkedIn Article coverMedia.caption");
  exactObjectKeys(caption, ["$type", "attributesV2", "text", "textDirection"], "LinkedIn Article coverMedia.caption");
  if (caption.$type !== LINKEDIN_TEXT_VIEW_MODEL_TYPE || !Array.isArray(caption.attributesV2) || caption.attributesV2.length !== 0 || caption.text !== "" || caption.textDirection !== "USER_LOCALE")
    throw new Error("LinkedIn Article cover caption changed its reviewed empty shape");
  const union = graphqlRecord(coverMediaV2UnionValue, "LinkedIn Article coverMediaV2Union");
  exactObjectKeys(union, ["coverImage"], "LinkedIn Article coverMediaV2Union");
  const cover = graphqlRecord(union.coverImage, "LinkedIn Article coverMediaV2Union.coverImage");
  exactObjectKeys(cover, ["$type", "originalImage", "originalImageUrn"], "LinkedIn Article coverMediaV2Union.coverImage");
  if (cover.$type !== LINKEDIN_COVER_IMAGE_TYPE) {
    throw new Error("LinkedIn Article coverMediaV2Union changed its reviewed type");
  }
  const unionAssetUrn = linkedInArticleImageAssetUrn(cover.originalImageUrn, "LinkedIn Article coverMediaV2Union.coverImage.originalImageUrn");
  const vectorAssetUrn = normalizeLinkedInCoverImageViewModel(cover.originalImage, "LinkedIn Article coverMediaV2Union.coverImage.originalImage", true);
  if (legacyAssetUrn !== unionAssetUrn || unionAssetUrn !== vectorAssetUrn) {
    throw new Error("LinkedIn Article cover projections no longer bind one exact asset");
  }
  return unionAssetUrn;
}
function normalizeLinkedInArticleDraftValue(value, draftIdValue, profileUrnValue, allowEmptyContent, schemaVersion = 1, metadataOnly = false, normalizeDocument = true) {
  const draftId = linkedInArticleDraftId(draftIdValue);
  const profileUrn = linkedInArticleProfileUrn(profileUrnValue);
  const urn = linkedInArticleDraftUrn(draftId);
  const normalized = normalizeLinkedInGraphqlEnvelope(value);
  exactObjectKeys(normalized.data, ["$type", "*elements", "entityUrn", "paging"], "LinkedIn Article response.data");
  if (normalized.data.$type !== LINKEDIN_ARTICLE_COLLECTION_TYPE) {
    throw new Error("LinkedIn Article readback changed its collection response type");
  }
  linkedInUrn(normalized.data.entityUrn, "LinkedIn Article readback collection entityUrn");
  const paging = graphqlRecord(normalized.data.paging, "LinkedIn Article response.data.paging");
  exactObjectKeys(paging, ["count", "links", "start"], "LinkedIn Article response.data.paging");
  if (nonnegativeInteger(paging.count, "LinkedIn Article response.data.paging.count") !== 10 || nonnegativeInteger(paging.start, "LinkedIn Article response.data.paging.start") !== 0 || !Array.isArray(paging.links) || paging.links.length !== 0)
    throw new Error("LinkedIn Article readback changed its exact draft paging boundary");
  if (!Array.isArray(normalized.data["*elements"]) || normalized.data["*elements"].length !== 1 || normalized.data["*elements"][0] !== urn)
    throw new Error("LinkedIn Article readback did not select the exact draft");
  const article = normalized.entitiesByUrn.get(urn);
  if (article === undefined)
    throw new Error("LinkedIn Article readback omitted the exact draft entity");
  exactObjectKeys(article, [
    "$type",
    "activityUrn",
    "annotation",
    "annotationActionType",
    "articleActionUnions",
    "articleAnnotation",
    "articlePublishedTimeDescription",
    "articleType",
    "authors",
    "availableLocales",
    "content",
    "contentDescription",
    "contentHtml",
    "contentSegments",
    "coverMedia",
    "coverMediaV2Union",
    "createdAt",
    "entityUrn",
    "featured",
    "followingStateUrn",
    "gatedArticleMetadata",
    "initialUpdateUrn",
    "issueNumber",
    "linkedInArticleUrn",
    "locale",
    "memberContributionInsight",
    "permalink",
    "publishedAt",
    "scheduledAt",
    "seoDescription",
    "seoTitle",
    "series",
    "servedLocale",
    "socialDetailUrn",
    "socialProofInsight",
    "sponsoredAccountUrn",
    "state",
    "surveyComponent",
    "title",
    "trackingId",
    "ugcPostUrn",
    "updatedAt",
    "version",
    "viewerAllowedToEdit"
  ], "LinkedIn Article readback entity");
  const nullFields = [
    "activityUrn",
    "annotation",
    "annotationActionType",
    "articleAnnotation",
    "articlePublishedTimeDescription",
    "contentDescription",
    "contentSegments",
    "featured",
    "gatedArticleMetadata",
    "initialUpdateUrn",
    "issueNumber",
    "locale",
    "memberContributionInsight",
    "permalink",
    "publishedAt",
    "scheduledAt",
    "seoDescription",
    "seoTitle",
    "series",
    "servedLocale",
    "socialDetailUrn",
    "socialProofInsight",
    "sponsoredAccountUrn",
    "surveyComponent",
    "trackingId",
    "ugcPostUrn",
    "viewerAllowedToEdit"
  ];
  if (nullFields.some((field) => article[field] !== null)) {
    throw new Error("LinkedIn Article readback was not the exact private unpublished draft");
  }
  const coverAssetUrn = normalizeLinkedInArticleCover(article.coverMedia, article.coverMediaV2Union);
  if (article.$type !== LINKEDIN_ARTICLE_TYPE || article.entityUrn !== urn || article.linkedInArticleUrn !== `urn:li:linkedInArticle:${draftId}` || article.state !== "DRAFT" || article.articleType !== "FIRST_PARTY_ARTICLE")
    throw new Error("LinkedIn Article readback was not the exact private unpublished draft");
  if (!Array.isArray(article.articleActionUnions) || article.articleActionUnions.length !== 0 || !Array.isArray(article.availableLocales) || article.availableLocales.length !== 0)
    throw new Error("LinkedIn Article readback added unsupported actions or locales");
  linkedInUrn(article.followingStateUrn, "LinkedIn Article readback followingStateUrn");
  if (!Array.isArray(article.authors) || article.authors.length !== 1) {
    throw new Error("LinkedIn Article readback did not bind one exact author");
  }
  const author = graphqlRecord(article.authors[0], "LinkedIn Article readback author");
  exactObjectKeys(author, ["profileUrn"], "LinkedIn Article readback author");
  if (author.profileUrn !== profileUrn) {
    throw new Error("LinkedIn Article readback author no longer matches the current member");
  }
  const title = boundedText(article.title, "LinkedIn Article readback title", 150);
  if (article.contentHtml !== null && (typeof article.contentHtml !== "string" || article.contentHtml.length > 524288) || !Array.isArray(article.content) || !allowEmptyContent && article.content.length < 1 || article.content.length > 5000)
    throw new Error("LinkedIn Article readback content exceeded its reviewed bounds");
  nonnegativeInteger(article.createdAt, "LinkedIn Article readback createdAt");
  nonnegativeInteger(article.updatedAt, "LinkedIn Article readback updatedAt");
  nonnegativeInteger(article.version, "LinkedIn Article readback version");
  const imageAssetUrns = [];
  const blocks = metadataOnly || !normalizeDocument ? [] : article.content.map((block, index) => {
    if (schemaVersion === 1)
      return normalizeLinkedInArticleBlock(block, index);
    const wrapper = graphqlRecord(block, `LinkedIn Article content[${index}]`);
    if (Object.hasOwn(wrapper, "imageBlock")) {
      const normalized2 = normalizeLinkedInArticleImageBlock(block, index, imageAssetUrns.length);
      imageAssetUrns.push(normalized2.assetUrn);
      return normalized2.block;
    }
    return normalizeLinkedInArticleBlock(block, index);
  });
  if (schemaVersion === 2 && blocks.length >= 2 && blocks.at(-2)?.type === "image" && blocks.at(-1)?.type === "paragraph" && blocks.at(-1).text === "" && blocks.at(-1).links.length === 0 && blocks.at(-1).styles.length === 0)
    blocks.pop();
  return Object.freeze({
    draftId,
    title,
    profileUrn,
    coverAssetUrn,
    document: metadataOnly || blocks.length === 0 ? null : Object.freeze({ schemaVersion, blocks: Object.freeze(blocks) }),
    imageAssetUrns: Object.freeze(imageAssetUrns)
  });
}
function normalizeLinkedInArticleDraftV2Metadata(value, draftIdValue, profileUrnValue) {
  const normalized = normalizeLinkedInArticleDraftValue(value, draftIdValue, profileUrnValue, true, 2, true, false);
  return Object.freeze({
    draftId: normalized.draftId,
    title: normalized.title,
    profileUrn: normalized.profileUrn,
    coverAssetUrn: normalized.coverAssetUrn
  });
}
function normalizeLinkedInArticleDraftSnapshot(value, draftIdValue, profileUrnValue) {
  const normalized = normalizeLinkedInArticleDraftValue(value, draftIdValue, profileUrnValue, true);
  if (normalized.document !== null && normalized.document.schemaVersion !== 1) {
    throw new Error("LinkedIn Article readback changed its text-only schema version");
  }
  return Object.freeze({
    draftId: normalized.draftId,
    title: normalized.title,
    profileUrn: normalized.profileUrn,
    document: normalized.document
  });
}
function normalizeLinkedInArticleDraftMetadata(value, draftIdValue, profileUrnValue) {
  const normalized = normalizeLinkedInArticleDraftValue(value, draftIdValue, profileUrnValue, true, 1, true);
  return Object.freeze({
    draftId: normalized.draftId,
    profileUrn: normalized.profileUrn,
    title: normalized.title
  });
}
function normalizeLinkedInArticleDraft(value, draftIdValue, profileUrnValue) {
  const normalized = normalizeLinkedInArticleDraftValue(value, draftIdValue, profileUrnValue, false);
  if (normalized.document === null || normalized.document.schemaVersion !== 1) {
    throw new Error("LinkedIn Article readback omitted its confirmed document");
  }
  return Object.freeze({
    draftId: normalized.draftId,
    profileUrn: normalized.profileUrn,
    title: normalized.title,
    document: normalized.document
  });
}
function normalizeLinkedInArticleDraftV2Snapshot(value, draftIdValue, profileUrnValue) {
  const normalized = normalizeLinkedInArticleDraftValue(value, draftIdValue, profileUrnValue, true, 2);
  if (normalized.document !== null && normalized.document.schemaVersion !== 2) {
    throw new Error("LinkedIn Article readback changed its image-capable schema version");
  }
  return Object.freeze({
    draftId: normalized.draftId,
    title: normalized.title,
    profileUrn: normalized.profileUrn,
    document: normalized.document,
    coverAssetUrn: normalized.coverAssetUrn,
    imageAssetUrns: normalized.imageAssetUrns
  });
}
function normalizeLinkedInArticleDraftV2(value, draftIdValue, profileUrnValue) {
  const normalized = normalizeLinkedInArticleDraftV2Snapshot(value, draftIdValue, profileUrnValue);
  if (normalized.document === null) {
    throw new Error("LinkedIn Article readback omitted its confirmed document");
  }
  return Object.freeze({
    draftId: normalized.draftId,
    title: normalized.title,
    profileUrn: normalized.profileUrn,
    document: normalized.document,
    coverAssetUrn: normalized.coverAssetUrn,
    imageAssetUrns: normalized.imageAssetUrns
  });
}
function linkedInMessengerConversationsUrl(mailboxUrnValue, queryIdValue = LINKEDIN_MESSENGER_CONVERSATIONS_OBSERVED_QUERY_ID) {
  const mailboxUrn = boundedText(mailboxUrnValue, "LinkedIn mailbox URN", 512);
  if (!/^urn:li:fsd_profile:[A-Za-z0-9_-]{1,256}$/u.test(mailboxUrn)) {
    throw new Error("LinkedIn mailbox URN is invalid");
  }
  const queryId = resolveLinkedInRegisteredQueryId(LINKEDIN_MESSENGER_CONVERSATIONS_QUERY_PREFIX, [queryIdValue]);
  const url = new URL(LINKEDIN_MESSENGER_GRAPHQL_PATH, "https://www.linkedin.com");
  url.searchParams.set("queryId", queryId);
  url.searchParams.set("variables", `(mailboxUrn:${mailboxUrn})`);
  return url;
}
function linkedInPostText(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 3000 || /\0/u.test(value))
    throw new Error("LinkedIn post body must be 1-3000 characters without NUL");
  return value;
}
function linkedInPostVisibility(value) {
  if (value !== "public" && value !== "connections") {
    throw new Error("LinkedIn post visibility must be public or connections");
  }
  return value;
}
function linkedInPostAltText(value, mediaPresent) {
  if (value === undefined)
    return null;
  if (!mediaPresent)
    throw new Error("LinkedIn alt_text requires one reviewed image");
  if (typeof value !== "string" || value.length < 1 || value.length > 4000 || /\0/u.test(value))
    throw new Error("LinkedIn image alt_text must be 1-4000 characters without NUL");
  return value;
}
function linkedInPostMediaUrn(value) {
  if (typeof value !== "string" || value.length > 512 || !/^urn:li:(?:digitalmediaAsset|fsd_image):[A-Za-z0-9_(),.:%=-]{1,448}$/u.test(value))
    throw new Error("LinkedIn image upload returned an invalid media URN");
  return value;
}
function linkedInPostEntityUrn(value) {
  if (typeof value !== "string" || value.length > 512 || !/^urn:li:(?:fsd_share|share|ugcPost):[A-Za-z0-9_(),.:%=-]{1,448}$/u.test(value))
    throw new Error("LinkedIn post response returned an invalid entity URN");
  return value;
}
function buildLinkedInPostCreateVariables(input) {
  const body = linkedInPostText(input.body);
  const visibility = linkedInPostVisibility(input.visibility);
  const mediaUrn = input.mediaUrn === null ? null : linkedInPostMediaUrn(input.mediaUrn);
  const altText = linkedInPostAltText(input.altText ?? undefined, mediaUrn !== null);
  const post = {
    allowedCommentersScope: "ALL",
    commentary: {
      $type: "com.linkedin.voyager.dash.deco.common.text.TextViewModelV2",
      attributesV2: [],
      text: body
    },
    intendedShareLifeCycleState: "PUBLISHED",
    origin: "FEED",
    paidEndorsement: false,
    visibilityDataUnion: {
      visibilityType: visibility === "public" ? "ANYONE" : "CONNECTIONS_ONLY"
    }
  };
  if (mediaUrn !== null) {
    post.media = {
      category: "IMAGE",
      mediaUrn,
      tapTargets: [],
      ...altText === null ? {} : { altText }
    };
  }
  return Object.freeze({ post: Object.freeze(post) });
}
function normalizeLinkedInPostProjection(value, expected) {
  const projection = isRecord(value) ? value : null;
  if (projection === null)
    throw new Error("LinkedIn post browser returned an invalid projection");
  exactObjectKeys(projection, [
    "actorMatched",
    "entityMatched",
    "entityUrn",
    "lifecycle",
    "mediaMatched",
    "mediaUrn",
    "textMatched",
    "url"
  ], "LinkedIn post browser projection");
  linkedInPostText(expected.body);
  if (!/^urn:li:fsd_profile:[A-Za-z0-9_-]{1,256}$/u.test(expected.profileUrn)) {
    throw new Error("LinkedIn post expected profile binding is invalid");
  }
  const entityUrn = linkedInPostEntityUrn(projection.entityUrn);
  const mediaUrn = projection.mediaUrn === null ? null : linkedInPostMediaUrn(projection.mediaUrn);
  if (projection.lifecycle !== "PUBLISHED" || projection.actorMatched !== true || projection.entityMatched !== true || projection.textMatched !== true || projection.mediaMatched !== (expected.mediaUrn !== null) || mediaUrn !== expected.mediaUrn)
    throw new Error("LinkedIn independent post readback did not bind the confirmed post");
  if (typeof projection.url !== "string" || projection.url.length > 2048) {
    throw new Error("LinkedIn post browser returned an invalid permalink");
  }
  const url = new URL(projection.url);
  if (url.origin !== "https://www.linkedin.com" || url.username !== "" || url.password !== "" || url.hash !== "" || !url.pathname.startsWith("/feed/update/"))
    throw new Error("LinkedIn post browser returned an unreviewed permalink");
  return Object.freeze({ entityUrn, mediaUrn, url: url.href });
}
function assertLinkedInMessengerConversationsRequest(requestValue, expectedMailboxUrnValue) {
  const url = requestValue.url instanceof URL ? new URL(requestValue.url.href) : new URL(requestValue.url);
  if (requestValue.method !== "GET" || url.origin !== "https://www.linkedin.com" || url.pathname !== LINKEDIN_MESSENGER_GRAPHQL_PATH || url.username !== "" || url.password !== "" || url.hash !== "")
    throw new Error("LinkedIn messenger-conversations request escaped its exact reviewed route");
  const queryNames = [...url.searchParams.keys()];
  if (queryNames.length !== 2 || queryNames[0] !== "queryId" || queryNames[1] !== "variables" || url.searchParams.getAll("queryId").length !== 1 || url.searchParams.getAll("variables").length !== 1)
    throw new Error("LinkedIn messenger-conversations request query shape is invalid");
  const expected = linkedInMessengerConversationsUrl(expectedMailboxUrnValue, url.searchParams.get("queryId"));
  if (url.searchParams.get("variables") !== expected.searchParams.get("variables")) {
    throw new Error("LinkedIn messenger-conversations request mailbox binding changed");
  }
  return url;
}
function exactStringList(value, label, maximumItems) {
  if (!Array.isArray(value) || value.length > maximumItems) {
    throw new Error(`${label} must be a bounded string array`);
  }
  const result = value.map((item, index) => boundedText(item, `${label}[${index}]`, 4096));
  return Object.freeze(result);
}
function displayNameFromPreview(value) {
  if (!isRecord(value))
    return null;
  const candidates = new Set;
  let nodes = 0;
  const visit = (item, depth) => {
    if (depth > 5 || nodes >= 256 || !isRecord(item))
      return;
    nodes += 1;
    const first = typeof item.firstName === "string" ? item.firstName.trim() : "";
    const last = typeof item.lastName === "string" ? item.lastName.trim() : "";
    const combined = `${first} ${last}`.trim();
    if (combined.length > 0 && combined.length <= 256 && !/[\0\r]/u.test(combined))
      candidates.add(combined);
    for (const key of ["name", "displayName"]) {
      const candidate = item[key];
      if (typeof candidate === "string" && candidate.trim().length > 0 && candidate.length <= 256 && !/[\0\r]/u.test(candidate))
        candidates.add(candidate.trim());
    }
    for (const child of Object.values(item))
      visit(child, depth + 1);
  };
  visit(value, 0);
  return candidates.size === 1 ? candidates.values().next().value ?? null : null;
}
function normalizedParticipant(entity) {
  if (entity.$type !== "com.linkedin.messenger.MessagingParticipant") {
    throw new Error("LinkedIn messaging participant reference resolved to the wrong entity type");
  }
  return Object.freeze({
    urn: linkedInUrn(entity.entityUrn ?? entity.backendUrn, "LinkedIn messaging participant URN"),
    identityUrn: entity.hostIdentityUrn === null || entity.hostIdentityUrn === undefined ? null : linkedInUrn(entity.hostIdentityUrn, "LinkedIn messaging participant identity URN"),
    displayName: displayNameFromPreview(entity.preview)
  });
}
function messageBody(entity) {
  if (typeof entity.body === "string")
    return boundedText(entity.body, "LinkedIn message body", 32768);
  if (isRecord(entity.body) && typeof entity.body.text === "string") {
    return boundedText(entity.body.text, "LinkedIn message body.text", 32768);
  }
  if (typeof entity.renderContentFallbackText === "string") {
    return boundedText(entity.renderContentFallbackText, "LinkedIn message fallback text", 32768);
  }
  return "";
}
function normalizedMessage(entity) {
  if (entity.$type !== "com.linkedin.messenger.Message") {
    throw new Error("LinkedIn message reference resolved to the wrong entity type");
  }
  const urn = linkedInUrn(entity.entityUrn ?? entity.backendUrn, "LinkedIn message URN");
  return Object.freeze({
    id: linkedInUrn(entity.backendUrn ?? entity.entityUrn, "LinkedIn message backend URN"),
    urn,
    deliveredAt: nonnegativeInteger(entity.deliveredAt, "LinkedIn message deliveredAt"),
    body: messageBody(entity),
    subject: optionalText(entity.subject, "LinkedIn message subject", 8192),
    senderUrn: entity["*sender"] === null || entity["*sender"] === undefined ? null : linkedInUrn(entity["*sender"], "LinkedIn message sender reference")
  });
}
function exactConversationUrl(value) {
  const raw = boundedText(value, "LinkedIn conversation URL", 4096);
  const parsed = new URL(raw, "https://www.linkedin.com");
  if (parsed.origin !== "https://www.linkedin.com" || !parsed.pathname.startsWith("/messaging/") || parsed.username !== "" || parsed.password !== "" || parsed.hash !== "")
    throw new Error("LinkedIn conversation URL escaped the reviewed messaging surface");
  return parsed.href;
}
function normalizedConversation(entity, entitiesByUrn) {
  if (entity.$type !== "com.linkedin.messenger.Conversation") {
    throw new Error("LinkedIn conversation reference resolved to the wrong entity type");
  }
  const participantReferences = exactStringList(entity["*conversationParticipants"], "LinkedIn conversation participant references", 100);
  const participants = [];
  for (const reference of participantReferences) {
    const participant = entitiesByUrn.get(reference);
    if (participant !== undefined)
      participants.push(normalizedParticipant(participant));
  }
  const messages = graphqlRecord(entity.messages, "conversation messages");
  const messageReferences = exactStringList(messages["*elements"], "LinkedIn conversation message references", 100);
  const latestReference = messageReferences[0];
  const latestEntity = latestReference === undefined ? undefined : entitiesByUrn.get(latestReference);
  const latestMessage = latestEntity === undefined ? null : normalizedMessage(latestEntity);
  const categories = exactStringList(entity.categories, "LinkedIn conversation categories", 32);
  for (const category of categories) {
    if (!/^[A-Z][A-Z0-9_]{0,63}$/u.test(category)) {
      throw new Error("LinkedIn conversation category is invalid");
    }
  }
  if (typeof entity.groupChat !== "boolean" || typeof entity.read !== "boolean") {
    throw new Error("LinkedIn conversation state flags are invalid");
  }
  return Object.freeze({
    id: linkedInUrn(entity.backendUrn ?? entity.entityUrn, "LinkedIn conversation backend URN"),
    urn: linkedInUrn(entity.entityUrn ?? entity.backendUrn, "LinkedIn conversation URN"),
    categories,
    groupChat: entity.groupChat,
    title: optionalText(entity.title, "LinkedIn conversation title", 8192),
    createdAt: nonnegativeInteger(entity.createdAt, "LinkedIn conversation createdAt"),
    lastActivityAt: nonnegativeInteger(entity.lastActivityAt, "LinkedIn conversation lastActivityAt"),
    lastReadAt: optionalNonnegativeInteger(entity.lastReadAt, "LinkedIn conversation lastReadAt"),
    read: entity.read,
    unreadCount: nonnegativeInteger(entity.unreadCount, "LinkedIn conversation unreadCount"),
    notificationStatus: boundedText(entity.notificationStatus, "LinkedIn conversation notificationStatus", 64),
    participants: Object.freeze(participants),
    latestMessage,
    url: exactConversationUrl(entity.conversationUrl)
  });
}
function folderIncludesConversation(folder, categories) {
  if (folder === "all")
    return true;
  return categories.includes(LINKEDIN_WEB_FOLDER_CATEGORIES[folder]);
}
function normalizeLinkedInMessagingList(value, folderValue, limitValue) {
  if (typeof folderValue !== "string" || !hasOwn(LINKEDIN_WEB_FOLDER_CATEGORIES, folderValue))
    throw new Error("LinkedIn folder must be focused, other, requests, archive, spam, or all");
  const folder = folderValue;
  if (!Number.isSafeInteger(limitValue) || limitValue < 1 || limitValue > MAX_MESSAGING_ITEMS) {
    throw new Error("LinkedIn messaging limit must be an integer between 1 and 100");
  }
  const limit = limitValue;
  const normalized = normalizeLinkedInGraphqlEnvelope(value);
  const outerData = graphqlRecord(normalized.data.data, "messenger-conversations data");
  const collection = graphqlRecord(outerData.messengerConversationsBySyncToken, "messenger-conversations collection");
  if (collection.$type !== "com.linkedin.restli.common.CollectionResponse") {
    throw new Error("LinkedIn messenger-conversations collection type changed");
  }
  const references = exactStringList(collection["*elements"], "LinkedIn messenger-conversations references", MAX_MESSAGING_ITEMS);
  const conversations = [];
  let matchingConversations = 0;
  for (const reference of references) {
    const entity = normalized.entitiesByUrn.get(reference);
    if (entity === undefined) {
      throw new Error("LinkedIn messenger-conversations response omitted a referenced conversation");
    }
    const conversation = normalizedConversation(entity, normalized.entitiesByUrn);
    if (folderIncludesConversation(folder, conversation.categories)) {
      matchingConversations += 1;
      if (conversations.length < limit)
        conversations.push(conversation);
    }
  }
  const metadata = graphqlRecord(collection.metadata, "messenger-conversations metadata");
  const nextCursor = optionalText(metadata.newSyncToken, "LinkedIn messenger-conversations sync token", 4096);
  return Object.freeze({
    folder,
    conversations: Object.freeze(conversations),
    nextCursor,
    continuationSupported: false,
    complete: nextCursor === null && matchingConversations <= limit
  });
}

// src/providers/linkedin-web-feed.ts
var LINKEDIN_PROFILE_ACTIVITY_QUERY_PREFIX = "voyagerFeedDashProfileUpdates";
var LINKEDIN_PROFILE_ACTIVITY_CURSOR_PREFIX = "linkedin-profile-activity-v1";
var LINKEDIN_PROFILE_ACTIVITY_MAX_ITEMS = 100;
var LINKEDIN_PROFILE_ACTIVITY_MAX_START = 1e5;
var LINKEDIN_ORIGIN = "https://www.linkedin.com";
var ACTIVITY_URN = /urn:li:activity:([0-9]{10,20})/u;
var PROFILE_URN = /^urn:li:fsd_profile:[A-Za-z0-9_-]{1,256}$/u;
var POST_URN = /^urn:li:(?:ugcPost|share|fsd_share):[A-Za-z0-9_(),.:%=-]{1,448}$/u;
var UPDATE_TYPE = "com.linkedin.voyager.dash.feed.Update";
var SOCIAL_COUNTS_TYPE = "com.linkedin.voyager.dash.feed.SocialActivityCounts";
var COLLECTION_TYPE = "com.linkedin.restli.common.CollectionResponse";
var MEDIA_FIELD_NAMES = Object.freeze([
  "articleComponent",
  "content",
  "contentV2",
  "documentComponent",
  "imageComponent",
  "linkedInVideoComponent",
  "videoComponent"
]);
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function record(value, label) {
  if (!isRecord2(value))
    throw new Error(`${label} must be an object`);
  return value;
}
function boundedText2(value, label, maximum) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || /[\0\r]/u.test(value))
    throw new Error(`${label} must be a bounded string`);
  return value;
}
function optionalBoundedText(value, label, maximum) {
  if (value === null || value === undefined)
    return null;
  return boundedText2(value, label, maximum);
}
function nonnegativeInteger2(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return value;
}
function optionalNonnegativeInteger2(value, label) {
  if (value === null || value === undefined)
    return null;
  return nonnegativeInteger2(value, label);
}
function linkedInProfileActivityFeed(value) {
  if (value !== "home" && value !== "profile-activity") {
    throw new Error("LinkedIn feed must be home or profile-activity");
  }
  return value;
}
function linkedInProfileActivityTarget(input) {
  const fromUrl = input.profile_url === undefined ? null : linkedInProfileActivityTargetFromUrl(input.profile_url);
  const fromVanity = input.vanity === undefined ? null : linkedInProfileActivityTargetFromVanity(input.vanity);
  if (fromUrl === null && fromVanity === null) {
    throw new Error("LinkedIn profile-activity feed requires profile_url or vanity");
  }
  if (fromUrl !== null && fromVanity !== null && fromUrl.slug !== fromVanity.slug) {
    throw new Error("LinkedIn profile_url and vanity named different profiles");
  }
  return fromUrl ?? fromVanity;
}
function linkedInProfileActivityTargetFromVanity(value) {
  const slug = linkedInPersonalProfilePublicIdentifier(value);
  return Object.freeze({
    slug,
    profileUrl: `${LINKEDIN_ORIGIN}/in/${slug}/`,
    activityUrl: `${LINKEDIN_ORIGIN}/in/${slug}/recent-activity/all/`
  });
}
function linkedInProfileActivityTargetFromUrl(value) {
  const raw = boundedText2(value, "LinkedIn profile activity URL", 2048);
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("LinkedIn profile activity URL must be an absolute URL");
  }
  if (url.origin !== LINKEDIN_ORIGIN || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "")
    throw new Error("LinkedIn profile activity URL must use the exact public LinkedIn origin");
  const match = /^\/in\/([A-Za-z0-9][A-Za-z0-9_-]{1,99})(?:\/recent-activity(?:\/all)?)?\/?$/u.exec(url.pathname);
  if (match?.[1] === undefined) {
    throw new Error("LinkedIn profile activity URL has an unsupported path");
  }
  return linkedInProfileActivityTargetFromVanity(match[1]);
}
function linkedInProfileActivityProfileUrn(value) {
  const urn = boundedText2(value, "LinkedIn profile activity profile URN", 512);
  if (!PROFILE_URN.test(urn)) {
    throw new Error("LinkedIn profile activity profile URN is invalid");
  }
  return urn;
}
function linkedInProfileActivityQueryId(value) {
  return resolveLinkedInRegisteredQueryId(LINKEDIN_PROFILE_ACTIVITY_QUERY_PREFIX, [value]);
}
function encodeLinkedInProfileActivityCursor(cursor) {
  const slug = linkedInPersonalProfilePublicIdentifier(cursor.slug);
  const start = nonnegativeInteger2(cursor.start, "LinkedIn profile-activity cursor start");
  if (start > LINKEDIN_PROFILE_ACTIVITY_MAX_START) {
    throw new Error("LinkedIn profile-activity cursor start exceeded its reviewed bound");
  }
  return `${LINKEDIN_PROFILE_ACTIVITY_CURSOR_PREFIX}:${slug}:${start}`;
}
function parseLinkedInProfileActivityCursor(value, expectedSlug) {
  if (value === undefined) {
    return Object.freeze({
      slug: linkedInPersonalProfilePublicIdentifier(expectedSlug),
      start: 0
    });
  }
  const raw = boundedText2(value, "LinkedIn profile-activity cursor", 4096);
  const match = new RegExp(`^${LINKEDIN_PROFILE_ACTIVITY_CURSOR_PREFIX}:([A-Za-z0-9][A-Za-z0-9_-]{1,99}):(0|[1-9][0-9]{0,6})$`, "u").exec(raw);
  if (match?.[1] === undefined || match[2] === undefined) {
    throw new Error("LinkedIn profile-activity cursor is invalid");
  }
  const slug = linkedInPersonalProfilePublicIdentifier(match[1]);
  const expected = linkedInPersonalProfilePublicIdentifier(expectedSlug);
  if (slug !== expected) {
    throw new Error("LinkedIn profile-activity cursor does not match the requested profile");
  }
  const start = nonnegativeInteger2(Number(match[2]), "LinkedIn profile-activity cursor start");
  if (start > LINKEDIN_PROFILE_ACTIVITY_MAX_START) {
    throw new Error("LinkedIn profile-activity cursor start exceeded its reviewed bound");
  }
  return Object.freeze({ slug, start });
}
function linkedInProfileActivityPageUrl(input) {
  const queryId = linkedInProfileActivityQueryId(input.queryId);
  const profileUrn = linkedInProfileActivityProfileUrn(input.profileUrn);
  const count = nonnegativeInteger2(input.count, "LinkedIn profile-activity count");
  const start = nonnegativeInteger2(input.start, "LinkedIn profile-activity start");
  if (count < 1 || count > LINKEDIN_PROFILE_ACTIVITY_MAX_ITEMS) {
    throw new Error("LinkedIn profile-activity count must be an integer between 1 and 100");
  }
  if (start > LINKEDIN_PROFILE_ACTIVITY_MAX_START) {
    throw new Error("LinkedIn profile-activity start exceeded its reviewed bound");
  }
  const variables = `(count:${count},start:${start},profileUrn:${encodeRestliV2Value(profileUrn)})`;
  return new URL(`${LINKEDIN_ORIGIN}${LINKEDIN_GRAPHQL_PATH}?includeWebMetadata=true&queryId=${encodeURIComponent(queryId)}&variables=${variables}`);
}
function assertLinkedInProfileActivityRequest(requestValue, expected) {
  const url = requestValue.url instanceof URL ? new URL(requestValue.url.href) : new URL(requestValue.url);
  if (requestValue.method !== "GET" || url.origin !== LINKEDIN_ORIGIN || url.pathname !== LINKEDIN_GRAPHQL_PATH || url.username !== "" || url.password !== "" || url.hash !== "")
    throw new Error("LinkedIn profile-activity request escaped its exact reviewed route");
  const queryNames = [...url.searchParams.keys()];
  if (queryNames.length !== 3 || queryNames[0] !== "includeWebMetadata" || queryNames[1] !== "queryId" || queryNames[2] !== "variables" || url.searchParams.getAll("includeWebMetadata").length !== 1 || url.searchParams.getAll("queryId").length !== 1 || url.searchParams.getAll("variables").length !== 1)
    throw new Error("LinkedIn profile-activity request query shape is invalid");
  const expectedUrl = linkedInProfileActivityPageUrl(expected);
  if (url.searchParams.get("includeWebMetadata") !== expectedUrl.searchParams.get("includeWebMetadata") || url.searchParams.get("queryId") !== expectedUrl.searchParams.get("queryId") || url.searchParams.get("variables") !== expectedUrl.searchParams.get("variables") || url.search !== expectedUrl.search)
    throw new Error("LinkedIn profile-activity request binding changed");
  return url;
}
function linkedInProfileActivityVariables(value) {
  const raw = boundedText2(value, "LinkedIn profile-activity variables", 4096);
  const match = /^\((.*)\)$/u.exec(raw);
  if (match?.[1] === undefined) {
    throw new Error("LinkedIn profile-activity variables must be a Rest.li tuple");
  }
  const fields = new Map;
  for (const part of match[1].split(",")) {
    const separator = part.indexOf(":");
    if (separator < 1)
      throw new Error("LinkedIn profile-activity variables field is malformed");
    const key = part.slice(0, separator);
    const fieldValue = part.slice(separator + 1);
    if (!/^[A-Za-z][A-Za-z0-9]{0,63}$/u.test(key) || fieldValue.length < 1) {
      throw new Error("LinkedIn profile-activity variables field is malformed");
    }
    if (fields.has(key))
      throw new Error("LinkedIn profile-activity variables repeated a field");
    fields.set(key, fieldValue);
  }
  const profileUrn = linkedInProfileActivityProfileUrn(fields.get("profileUrn"));
  const count = fields.has("count") ? nonnegativeInteger2(Number(fields.get("count")), "LinkedIn profile-activity variables count") : null;
  const start = fields.has("start") ? nonnegativeInteger2(Number(fields.get("start")), "LinkedIn profile-activity variables start") : null;
  return Object.freeze({ profileUrn, count, start });
}
function resolveLinkedInProfileActivityBinding(candidates) {
  if (candidates.length > 4096) {
    throw new Error("LinkedIn profile-activity observation exceeded its reviewed bound");
  }
  const queryIds = new Set;
  const profileUrns = new Set;
  for (const candidate of candidates) {
    if (candidate.method !== "GET" || candidate.status !== 200)
      continue;
    if (typeof candidate.url !== "string" || candidate.url.length > 64 * 1024)
      continue;
    let url;
    try {
      url = new URL(candidate.url);
    } catch {
      continue;
    }
    if (url.origin !== LINKEDIN_ORIGIN || url.pathname !== LINKEDIN_GRAPHQL_PATH || url.username !== "" || url.password !== "" || url.hash !== "")
      continue;
    const queryId = url.searchParams.get("queryId");
    const variables = url.searchParams.get("variables");
    if (queryId === null || variables === null)
      continue;
    try {
      queryIds.add(linkedInProfileActivityQueryId(queryId));
      profileUrns.add(linkedInProfileActivityVariables(variables).profileUrn);
    } catch {
      continue;
    }
  }
  if (queryIds.size === 0 || profileUrns.size === 0) {
    throw new Error("LinkedIn registered query voyagerFeedDashProfileUpdates was not found");
  }
  if (queryIds.size !== 1) {
    throw new Error("LinkedIn registered query voyagerFeedDashProfileUpdates is ambiguous");
  }
  if (profileUrns.size !== 1) {
    throw new Error("LinkedIn profile-activity observation bound more than one profile URN");
  }
  return Object.freeze({
    queryId: [...queryIds][0],
    profileUrn: [...profileUrns][0]
  });
}
function activityUrnFromValue(value) {
  if (typeof value !== "string" || value.length > 4096)
    return null;
  const match = ACTIVITY_URN.exec(value);
  return match?.[0] ?? null;
}
function uniqueOptionalText(values, label, maximum) {
  const unique = [...new Set(values.filter((value) => value !== undefined && value !== null && value !== "").map((value) => boundedText2(value, label, maximum)))];
  if (unique.length === 0)
    return null;
  if (unique.length !== 1)
    throw new Error(`${label} was ambiguous`);
  return unique[0];
}
function textFromViewModel(value, label) {
  if (value === null || value === undefined)
    return null;
  const model = record(value, label);
  if (isRecord2(model.text)) {
    return optionalBoundedText(model.text.text, `${label}.text.text`, 12000);
  }
  return optionalBoundedText(model.text, `${label}.text`, 12000);
}
function vanityFromNavigation(value) {
  if (typeof value !== "string" || value.length > 2048)
    return null;
  let url;
  try {
    url = new URL(value, LINKEDIN_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== LINKEDIN_ORIGIN)
    return null;
  const match = /^\/in\/([A-Za-z0-9][A-Za-z0-9_-]{1,99})\/?$/u.exec(url.pathname);
  return match?.[1] === undefined ? null : linkedInPersonalProfilePublicIdentifier(match[1]);
}
function createdAtFromValue(value, label) {
  if (value === null || value === undefined)
    return null;
  if (typeof value === "number") {
    const milliseconds = nonnegativeInteger2(value, label);
    if (milliseconds < 1000000000000 || milliseconds > 4102444800000) {
      throw new Error(`${label} is outside the reviewed timestamp window`);
    }
    return new Date(milliseconds).toISOString();
  }
  const raw = boundedText2(value, label, 64);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(raw)) {
    throw new Error(`${label} must be an exact UTC timestamp`);
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed))
    throw new Error(`${label} must be an exact UTC timestamp`);
  return new Date(parsed).toISOString();
}
function relativeTimeFromActor(actor) {
  if (actor === null)
    return null;
  const fromViewModel = isRecord2(actor.subDescription) ? textFromViewModel(actor.subDescription, "LinkedIn update actor.subDescription") : null;
  const fromText = typeof actor.subDescription === "string" ? optionalBoundedText(actor.subDescription, "LinkedIn update actor.subDescription", 64) : null;
  const unique = [...new Set([fromViewModel, fromText].filter((value2) => value2 !== null))];
  if (unique.length !== 1)
    return null;
  const value = unique[0];
  return /^(?:[1-9][0-9]?[smhdw]|[1-9][0-9]?mo|now|just now)$/iu.test(value) ? value : null;
}
function authorUrnFromActor(actor) {
  if (actor === null)
    return null;
  for (const field of ["urn", "backendUrn", "entityUrn", "*profile"]) {
    const value = actor[field];
    if (typeof value === "string" && PROFILE_URN.test(value))
      return value;
  }
  return null;
}
function postUrnFromUpdate(update) {
  const metadata = isRecord2(update.metadata) ? update.metadata : null;
  const socialDetail = isRecord2(update.socialDetail) ? update.socialDetail : null;
  const candidates = [
    metadata?.shareUrn,
    metadata?.backendUrn,
    metadata?.ugcPostUrn,
    socialDetail?.urn,
    update.shareUrn,
    update.ugcPostUrn
  ];
  const urns = candidates.filter((value) => typeof value === "string" && POST_URN.test(value));
  return uniqueOptionalText(urns, "LinkedIn update post URN", 512);
}
function hasReviewedMedia(update) {
  return MEDIA_FIELD_NAMES.some((field) => {
    const value = update[field];
    return value !== undefined && value !== null && value !== false;
  });
}
function commentaryTruncated(commentary) {
  if (commentary === null)
    return false;
  if (commentary.truncated === true || commentary.textTruncated === true)
    return true;
  const attributes = commentary.attributesV2;
  return Array.isArray(attributes) && attributes.some((attribute) => {
    if (!isRecord2(attribute))
      return false;
    const type = attribute.$type;
    return typeof type === "string" && /seeMore|SeeMore|truncated/iu.test(type);
  });
}
function socialCountsByActivityUrn(included) {
  const counts = new Map;
  for (const entity of included) {
    if (entity.$type !== SOCIAL_COUNTS_TYPE)
      continue;
    const activityUrn = activityUrnFromValue(entity.urn);
    if (activityUrn === null)
      continue;
    const next = Object.freeze({
      reactionCount: optionalNonnegativeInteger2(entity.numLikes, "LinkedIn social numLikes"),
      commentCount: optionalNonnegativeInteger2(entity.numComments, "LinkedIn social numComments"),
      repostCount: optionalNonnegativeInteger2(entity.numShares, "LinkedIn social numShares")
    });
    const prior = counts.get(activityUrn);
    if (prior !== undefined) {
      if (prior.reactionCount !== next.reactionCount || prior.commentCount !== next.commentCount || prior.repostCount !== next.repostCount)
        throw new Error("LinkedIn social activity counts conflict for one activity URN");
      continue;
    }
    counts.set(activityUrn, next);
  }
  return counts;
}
function projectUpdate(update, counts) {
  if (update.$type !== UPDATE_TYPE) {
    throw new Error("LinkedIn profile-activity element is not a feed Update");
  }
  const activityUrn = activityUrnFromValue(update.entityUrn) ?? activityUrnFromValue(update.urn) ?? activityUrnFromValue(isRecord2(update.metadata) ? update.metadata.urn : null);
  if (activityUrn === null) {
    throw new Error("LinkedIn profile-activity update omitted its activity URN");
  }
  const commentary = isRecord2(update.commentary) ? update.commentary : null;
  const text = textFromViewModel(commentary, "LinkedIn update commentary") ?? "";
  const actor = isRecord2(update.actor) ? update.actor : null;
  const navigation = actor === null ? null : vanityFromNavigation(isRecord2(actor.navigationContext) ? actor.navigationContext.actionTarget : actor.navigationUrl);
  const kind = update.resharedUpdate === undefined || update.resharedUpdate === null ? "original" : "reshare";
  const engagement = counts.get(activityUrn);
  const createdAt = createdAtFromValue(update.publishedAt ?? update.createdAt ?? (isRecord2(update.metadata) ? update.metadata.createdAt : null), "LinkedIn update createdAt");
  return Object.freeze({
    activityUrn,
    postUrn: postUrnFromUpdate(update),
    url: `${LINKEDIN_ORIGIN}/feed/update/${activityUrn}/`,
    authorVanity: navigation,
    authorUrn: authorUrnFromActor(actor),
    text,
    textComplete: !commentaryTruncated(commentary),
    createdAt,
    relativeTime: relativeTimeFromActor(actor),
    reactionCount: engagement?.reactionCount ?? null,
    commentCount: engagement?.commentCount ?? null,
    repostCount: engagement?.repostCount ?? null,
    hasMedia: hasReviewedMedia(update),
    kind
  });
}
function collectionResponses(value, depth, seen) {
  if (depth > 8 || value === null || typeof value !== "object")
    return [];
  if (seen.has(value))
    return [];
  seen.add(value);
  if (Array.isArray(value)) {
    if (value.length > 256)
      throw new Error("LinkedIn profile-activity data exceeded its reviewed bound");
    return value.flatMap((item) => collectionResponses(item, depth + 1, seen));
  }
  const candidate = record(value, "LinkedIn profile-activity data node");
  const collections = [];
  if (candidate.$type === COLLECTION_TYPE && Array.isArray(candidate["*elements"]))
    collections.push(candidate);
  for (const nested of Object.values(candidate)) {
    collections.push(...collectionResponses(nested, depth + 1, seen));
  }
  return collections;
}
function pagingHasNext(input) {
  if (input.hasNextLink)
    return true;
  return input.total !== null && input.total > 0 && input.start + input.count < input.total;
}
function profileActivityPageCursor(input) {
  if (input.paging === undefined) {
    return Object.freeze({ known: false, nextStart: null });
  }
  const paging = record(input.paging, "LinkedIn profile-activity paging");
  const start = nonnegativeInteger2(paging.start, "LinkedIn profile-activity paging.start");
  const count = nonnegativeInteger2(paging.count, "LinkedIn profile-activity paging.count");
  if (start !== input.requestedStart || count !== input.requestedCount) {
    throw new Error("LinkedIn profile-activity paging did not bind the exact requested page");
  }
  if (input.returnedCount > count) {
    throw new Error("LinkedIn profile-activity paging count contradicted the returned page");
  }
  const total = optionalNonnegativeInteger2(paging.total, "LinkedIn profile-activity paging.total");
  if (total !== null && total > 0) {
    const expectedReturned = Math.min(count, Math.max(total - start, 0));
    if (input.returnedCount !== expectedReturned) {
      throw new Error("LinkedIn profile-activity page length contradicted its paging total");
    }
  }
  let hasNextLink = false;
  if (paging.links !== undefined) {
    if (!Array.isArray(paging.links) || paging.links.length > 16) {
      throw new Error("LinkedIn profile-activity paging links were invalid or exceeded their bound");
    }
    const seenRelations = new Set;
    for (let index = 0;index < paging.links.length; index += 1) {
      const label = `LinkedIn profile-activity paging.links[${index}]`;
      const link = record(paging.links[index], label);
      const relation = boundedText2(link.rel, `${label}.rel`, 100);
      if (relation !== "next" && relation !== "prev") {
        throw new Error("LinkedIn profile-activity paging returned an invalid relation");
      }
      if (seenRelations.has(relation)) {
        throw new Error(`LinkedIn profile-activity paging repeated its ${relation} relation`);
      }
      seenRelations.add(relation);
      const href = boundedText2(link.href, `${label}.href`, 8192);
      if (/\s/u.test(href)) {
        throw new Error("LinkedIn profile-activity paging returned an invalid URL");
      }
      const linkedStart = relation === "next" ? start + count : Math.max(0, start - count);
      if (!Number.isSafeInteger(linkedStart) || linkedStart > LINKEDIN_PROFILE_ACTIVITY_MAX_START || relation === "next" && linkedStart <= start || relation === "prev" && start === 0) {
        throw new Error(`LinkedIn profile-activity paging returned a contradictory ${relation} link`);
      }
      let linkedPage;
      try {
        linkedPage = new URL(href, LINKEDIN_ORIGIN);
      } catch {
        throw new Error("LinkedIn profile-activity paging returned an invalid URL");
      }
      linkedInProfileActivityQueryId(linkedPage.searchParams.get("queryId"));
      const expectedPage = linkedInProfileActivityPageUrl({
        queryId: input.queryId,
        profileUrn: input.profileUrn,
        count,
        start: linkedStart
      });
      if (linkedPage.href !== expectedPage.href) {
        throw new Error("LinkedIn profile-activity paging link changed the exact collection");
      }
      if (relation === "next")
        hasNextLink = true;
    }
  }
  if (pagingHasNext({ start, count, total, hasNextLink })) {
    if (input.returnedCount === 0) {
      throw new Error("LinkedIn profile-activity page did not advance its cursor");
    }
    if (hasNextLink && input.returnedCount < count) {
      throw new Error("LinkedIn profile-activity paging linked past a terminal short page");
    }
    if (total !== null && total > 0 && start + input.returnedCount >= total) {
      throw new Error("LinkedIn profile-activity paging contradicted its terminal total");
    }
    return Object.freeze({ known: true, nextStart: start + count });
  }
  const known = paging.links !== undefined || total !== null;
  return Object.freeze({ known, nextStart: null });
}
function projectLinkedInProfileActivityPage(input) {
  const profileUrn = linkedInProfileActivityProfileUrn(input.profileUrn);
  const queryId = linkedInProfileActivityQueryId(input.queryId);
  const limit = nonnegativeInteger2(input.limit, "LinkedIn profile-activity limit");
  const start = nonnegativeInteger2(input.start, "LinkedIn profile-activity start");
  if (limit < 1 || limit > LINKEDIN_PROFILE_ACTIVITY_MAX_ITEMS) {
    throw new Error("LinkedIn profile-activity limit must be an integer between 1 and 100");
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(input.observedAt) || !Number.isFinite(Date.parse(input.observedAt)))
    throw new Error("LinkedIn profile-activity observedAt must be an exact UTC timestamp");
  const normalized = normalizeLinkedInGraphqlEnvelope(input.response);
  const collections = collectionResponses(normalized.data, 0, new WeakSet);
  if (collections.length !== 1) {
    throw new Error("LinkedIn profile-activity response did not bind one collection");
  }
  const collection = collections[0];
  const references = collection["*elements"];
  if (!Array.isArray(references) || references.length > LINKEDIN_PROFILE_ACTIVITY_MAX_ITEMS) {
    throw new Error("LinkedIn profile-activity collection exceeded its reviewed bound");
  }
  if (references.length > limit) {
    throw new Error("LinkedIn profile-activity page exceeded the requested limit");
  }
  const counts = socialCountsByActivityUrn(normalized.included);
  const posts = references.map((reference, index) => {
    const urn = boundedText2(reference, `LinkedIn profile-activity elements[${index}]`, 4096);
    const entity = normalized.entitiesByUrn.get(urn);
    if (entity === undefined) {
      throw new Error("LinkedIn profile-activity response omitted a referenced update");
    }
    return projectUpdate(entity, counts);
  });
  const cursor = profileActivityPageCursor({
    paging: collection.paging,
    profileUrn,
    queryId,
    requestedCount: limit,
    requestedStart: start,
    returnedCount: posts.length
  });
  if (!cursor.known && posts.length === 0) {
    throw new Error("LinkedIn profile-activity page did not advance its cursor");
  }
  const nextCursor = cursor.nextStart === null ? null : encodeLinkedInProfileActivityCursor({
    slug: input.target.slug,
    start: cursor.nextStart
  });
  return Object.freeze({
    schemaVersion: 1,
    provider: "linkedin",
    feed: "profile-activity",
    profile: Object.freeze({
      vanity: input.target.slug,
      profileUrn,
      url: input.target.profileUrl
    }),
    observedAt: input.observedAt,
    posts: Object.freeze(posts),
    items: Object.freeze(posts.map((post) => Object.freeze({
      activity_urn: post.activityUrn,
      url: post.url
    }))),
    nextCursor,
    complete: cursor.known && nextCursor === null
  });
}
function linkedInProfileActivityInputIssues(input) {
  const issues = [];
  if (input.feed === "home") {
    if (input.profile_url !== undefined) {
      issues.push("input.profile_url is not accepted for the capture-required home feed");
    }
    if (input.vanity !== undefined) {
      issues.push("input.vanity is not accepted for the capture-required home feed");
    }
    return Object.freeze(issues);
  }
  if (input.feed !== "profile-activity")
    return Object.freeze(issues);
  try {
    linkedInProfileActivityTarget({
      profile_url: input.profile_url,
      vanity: input.vanity
    });
  } catch (error) {
    issues.push(error instanceof Error ? error.message : "LinkedIn profile-activity target is invalid");
  }
  if (input.cursor !== undefined) {
    try {
      const target = linkedInProfileActivityTarget({
        profile_url: input.profile_url,
        vanity: input.vanity
      });
      parseLinkedInProfileActivityCursor(input.cursor, target.slug);
    } catch (error) {
      issues.push(error instanceof Error ? error.message : "LinkedIn profile-activity cursor is invalid");
    }
  }
  return Object.freeze(issues);
}

// src/read-effect-platform.ts
import * as Effect from "effect/Effect";
var readNative = (work) => Effect.tryPromise({ try: work, catch: (cause) => new ReadEffectFailure({ cause }) });

export { LINKEDIN_MESSENGER_CONVERSATIONS_QUERY_PREFIX, LINKEDIN_MESSENGER_CONVERSATIONS_OBSERVED_QUERY_ID, LINKEDIN_POST_CREATE_MUTATION_ID, LINKEDIN_POST_READBACK_QUERY_ID, LINKEDIN_GRAPHQL_PATH, linkedInCsrfTokenFromJSessionId, resolveLinkedInRegisteredQueryId, encodeRestliV2Value, linkedInPersonalProfilePublicIdentifier, linkedInPersonalProfileTarget, linkedInOrganizationTarget, projectLinkedInPersonalProfileStats, projectLinkedInOrganizationStats, linkedInMailboxUrnFromMiniProfile, LINKEDIN_FIRST_PARTY_ARTICLES_PATH, LINKEDIN_ARTICLE_PAGE_MAX_CHARACTERS, linkedInArticleDraftId, linkedInArticleDraftEntityUrl, linkedInArticleDraftEditUrl, LINKEDIN_ARTICLE_INLINE_IMAGE_UPLOAD_PATH, normalizeLinkedInArticleImageUploadRegistration, linkedInArticleDraftEnvelopeFromCodePayloads, linkedInArticleDraftEnvelopeFromHtml, buildLinkedInArticleCreateBody, buildLinkedInArticleTitlePatch, buildLinkedInArticleCoverPatch, buildLinkedInArticleContentPatch, buildLinkedInArticleContentPatchV2, normalizeLinkedInArticleDraftV2Metadata, normalizeLinkedInArticleDraftSnapshot, normalizeLinkedInArticleDraftMetadata, normalizeLinkedInArticleDraft, normalizeLinkedInArticleDraftV2, linkedInMessengerConversationsUrl, linkedInPostText, linkedInPostVisibility, linkedInPostAltText, linkedInPostMediaUrn, linkedInPostEntityUrn, buildLinkedInPostCreateVariables, normalizeLinkedInPostProjection, assertLinkedInMessengerConversationsRequest, normalizeLinkedInMessagingList, LINKEDIN_PROFILE_ACTIVITY_QUERY_PREFIX, LINKEDIN_PROFILE_ACTIVITY_MAX_ITEMS, linkedInProfileActivityFeed, linkedInProfileActivityTarget, linkedInProfileActivityTargetFromVanity, parseLinkedInProfileActivityCursor, linkedInProfileActivityPageUrl, assertLinkedInProfileActivityRequest, resolveLinkedInProfileActivityBinding, projectLinkedInProfileActivityPage, linkedInProfileActivityInputIssues, readNative };

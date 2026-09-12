import {
  encodeRestliV2Value,
  LINKEDIN_GRAPHQL_PATH,
  linkedInPersonalProfilePublicIdentifier,
  linkedInPersonalProfileTarget,
  type LinkedInProfileTarget,
} from "./linkedin-web";

export const LINKEDIN_PROFILE_CONTACT_INFO_QUERY_NAME =
  "voyagerIdentityDashProfileContactInfo";
export const LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID =
  "com.linkedin.sdui.flagshipnav.profile.ProfileContactDetailsOverlay";
export const LINKEDIN_CONTACT_DETAILS_OVERLAY_PATH =
  "/flagship-web/rsc-action/actions/navigation";
export const LINKEDIN_CONTACT_NAVIGATION_SDUIID_MAX_LENGTH = 256;
export const LINKEDIN_CONTACT_DETAILS_PAGE_KEY = "profile_view_base_contact_details";
export const LINKEDIN_CONTACT_NAVIGATION_CLIENT_ARGUMENT_KEYS = Object.freeze([
  "$type",
  "requestedStateKeys",
  "payload",
  "requestMetadata",
] as const);
export const LINKEDIN_CONTACT_NAVIGATION_PAYLOAD_KEYS = Object.freeze([
  "vanityName",
  "givenName",
  "familyName",
  "isVanityNameResolved",
] as const);
export const LINKEDIN_CONTACT_NAVIGATION_REQUESTED_ARGUMENTS_TYPE =
  "proto.sdui.actions.requests.RequestedArguments";
export const LINKEDIN_CONTACT_NAVIGATION_REQUEST_METADATA_TYPE =
  "proto.sdui.common.RequestMetadata";
export const LINKEDIN_CONTACT_NAVIGATION_REQUEST_METADATA_KEYS = Object.freeze([
  "$type",
  "states",
  "screenId",
  "knownTemplates",
] as const);
const CONTACT_NAVIGATION_CLIENT_ARGUMENT_KEY_SET = new Set<string>(
  LINKEDIN_CONTACT_NAVIGATION_CLIENT_ARGUMENT_KEYS,
);
const CONTACT_NAVIGATION_PAYLOAD_KEY_SET = new Set<string>(
  LINKEDIN_CONTACT_NAVIGATION_PAYLOAD_KEYS,
);
const CONTACT_NAVIGATION_REQUEST_METADATA_KEY_SET = new Set<string>(
  LINKEDIN_CONTACT_NAVIGATION_REQUEST_METADATA_KEYS,
);
const LINKEDIN_SDUI_TYPE = /^com\.linkedin(?:\.[A-Za-z][A-Za-z0-9]*)+$/u;
const PROTO_SDUI_TYPE = /^proto\.sdui(?:\.[A-Za-z][A-Za-z0-9]*)+$/u;
const CONTACT_NAVIGATION_HREF =
  /(?:https:\/\/www\.linkedin\.com)?(\/flagship-web\/rsc-action\/actions\/navigation\?[^\s"'<>]+)/gu;
const CONTACT_QUERY_ID =
  /^voyagerIdentityDashProfileContactInfo\.[0-9a-f]{32}$/u;
const LINKEDIN_CONTACT_INFO_OVERLAY_PATH =
  /^\/in\/([A-Za-z0-9][A-Za-z0-9_-]{1,99})\/overlay\/contact-info\/$/u;
const LINKEDIN_CONTACT_INFO_FIELD_LABEL_ERROR =
  "LinkedIn contact-info field label must be a bounded string";

const LINKEDIN_ORIGIN = "https://www.linkedin.com";
const PROFILE_URN = /^urn:li:fsd_profile:[A-Za-z0-9_-]{1,256}$/u;
const VIEWER_SUBJECT = /^urn:li:fsd_profile:[0-9]{1,32}$/u;
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}$/u;
const PHONE = /^\+?[0-9][0-9 .\-()]{6,30}[0-9]$/u;
const BIRTHDAY = /^(?:[0-9]{4}-)?(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])$/u;
const CONNECTED_DISPLAY =
  /^(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ([1-9]|[12][0-9]|3[01]), ([0-9]{4})$/u;
const MONTHS = Object.freeze({
  Jan: "01",
  January: "01",
  Feb: "02",
  February: "02",
  Mar: "03",
  March: "03",
  Apr: "04",
  April: "04",
  May: "05",
  Jun: "06",
  June: "06",
  Jul: "07",
  July: "07",
  Aug: "08",
  August: "08",
  Sep: "09",
  September: "09",
  Oct: "10",
  October: "10",
  Nov: "11",
  November: "11",
  Dec: "12",
  December: "12",
});
const HTML_ENTITY =
  /&(?:nbsp|quot|amp|lt|gt|apos|#(?:[xX][0-9A-Fa-f]{1,6}|[0-9]{1,7}));/gu;
const MAX_HTML_BYTES = 8 * 1024 * 1024;
const MAX_CODE_TAGS = 256;
const MAX_COMO_ASSIGNMENTS = 8;
const MAX_COMO_DECODED_ROOTS = 256;
const MAX_WALK_NODES = 500_000;
const MAX_WALK_DEPTH = 128;
const RSC_FLIGHT_ROW = /(?:^|\n)(\d+):/u;
const PROFILE_ID = /^[A-Za-z0-9_-]{1,256}$/u;
const DISTANCE_IN_TEXT =
  /(?:^|["'\\{,])(?:networkDistance|memberDistance|distance)\\*"?\s*:\s*\\*"?(DISTANCE_[A-Z0-9]+|OUT_OF_NETWORK|SELF|[0-9]+)\\*"?/gu;
const PROFILE_URN_IN_TEXT = /urn:li:fsd_profile:[A-Za-z0-9_-]{1,256}/gu;
const VIEWEE_PROFILE_ID_IN_TEXT =
  /vieweeProfileId\\*"?\s*:\s*\\*"?([A-Za-z0-9_-]{1,256})/gu;
const VIEWEE_MEMBER_URN_IN_TEXT =
  /vieweeMemberUrn\\*"?\s*:\s*\\*"?(urn:li:(?:fsd_profile|member):[A-Za-z0-9_-]{1,256}|[0-9]{1,32})/gu;
const MEMBER_URN = /^urn:li:member:[0-9]{1,32}$/u;
const VANITY_IN_TEXT =
  /(?:vanityName|publicIdentifier)\\*"?\s*:\s*\\*"?([A-Za-z0-9][A-Za-z0-9_-]{1,99})/gu;
const MAX_JSON_STRING_PEELS = 4;
const KEYED_IDENTITY_KEYS = new Set([
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
  "vieweeProfileId",
]);
const MAX_PHONES = 8;
const MAX_WEBSITES = 8;
const CONTACT_TYPE_SUFFIX = "ProfileContactInfo";

export type LinkedInContactInfoTarget = LinkedInProfileTarget;

export type LinkedInContactRelationship = "first-degree";

export type LinkedInProfileContactBinding = {
  readonly vanity: string;
  readonly profileUrn: string;
  readonly url: string;
  readonly relationship: LinkedInContactRelationship;
};

export type LinkedInContactFields = {
  readonly email: string | null;
  readonly profileUrl: string | null;
  readonly connectedSince: string | null;
  readonly phones: readonly string[];
  readonly websites: readonly string[];
  readonly birthday: string | null;
};

export type LinkedInContactInfo = {
  readonly schemaVersion: 1;
  readonly provider: "linkedin";
  readonly profile: LinkedInProfileContactBinding;
  readonly viewer: { readonly subject: string };
  readonly observedAt: string;
  readonly completeness: "complete" | "partial";
  readonly contact: LinkedInContactFields;
};

export type LinkedInContactInfoJsonInput = {
  readonly profileUrl: string;
  readonly profileUrn: string;
  readonly queryId?: string;
};

export type LinkedInContactNavigationRequestMetadata = {
  readonly $type?: string;
  readonly states?: readonly string[];
  readonly screenId?: string;
  readonly knownTemplates?: readonly string[];
};

export type LinkedInContactNavigationPayload = {
  readonly vanityName?: string;
  readonly givenName?: string;
  readonly familyName?: string;
  readonly isVanityNameResolved?: boolean;
};

export type LinkedInContactNavigationClientArguments = {
  readonly $type?: string;
  readonly requestedStateKeys?: readonly string[];
  readonly payload: LinkedInContactNavigationPayload;
  readonly requestMetadata?: LinkedInContactNavigationRequestMetadata;
};

export type LinkedInContactNavigationAction = {
  readonly sduiid: string;
  readonly clientArguments: LinkedInContactNavigationClientArguments;
  readonly isModal: true;
};

export type LinkedInContactNavigationInput = {
  readonly profileUrl: string;
  readonly profileUrn: string;
  readonly sduiid: string;
  readonly clientArguments: LinkedInContactNavigationClientArguments;
};

export type LinkedInContactNavigationActionResult =
  | { readonly kind: "action"; readonly action: LinkedInContactNavigationAction }
  | { readonly kind: "absent" }
  | { readonly kind: "omitted-sduiid" }
  | { readonly kind: "unreviewed-sduiid" }
  | { readonly kind: "ambiguous-sduiid" }
  | { readonly kind: "unreviewed-client-arguments"; readonly keys: readonly string[] }
  | { readonly kind: "unbound-client-arguments" };

type JsonRecord = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, label: string, maximum: number): string {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > maximum
    || /[\0\r]/u.test(value)
  ) throw new Error(`${label} must be a bounded string`);
  return value;
}

function observationTime(value: string): string {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    || !Number.isFinite(Date.parse(value))
  ) throw new Error("LinkedIn contact-info observedAt must be an exact UTC timestamp");
  return value;
}

function viewerSubject(value: unknown): string {
  const subject = boundedText(value, "LinkedIn contact-info viewer subject", 512);
  if (!VIEWER_SUBJECT.test(subject)) {
    throw new Error("LinkedIn contact-info viewer subject has an unsupported format");
  }
  return subject;
}

function profileUrn(value: unknown): string {
  const urn = boundedText(value, "LinkedIn contact-info profile URN", 512);
  if (!PROFILE_URN.test(urn)) {
    throw new Error("LinkedIn contact-info profile URN changed format");
  }
  return urn;
}

export function linkedInContactInfoTarget(value: unknown): LinkedInContactInfoTarget {
  return linkedInPersonalProfileTarget(value);
}

function contactQueryId(value: unknown): string {
  const queryId = boundedText(value, "LinkedIn contact-info GraphQL queryId", 128);
  if (!CONTACT_QUERY_ID.test(queryId)) {
    throw new Error("LinkedIn contact-info GraphQL queryId changed format");
  }
  return queryId;
}

export function buildLinkedInProfileContactInfoGraphqlPath(input: {
  readonly profileUrn: unknown;
  readonly queryId?: unknown;
}): string {
  const urn = profileUrn(input.profileUrn);
  const selector = input.queryId === undefined
    ? `queryName=${encodeURIComponent(LINKEDIN_PROFILE_CONTACT_INFO_QUERY_NAME)}`
    : `queryId=${encodeURIComponent(contactQueryId(input.queryId))}`;
  return `${LINKEDIN_GRAPHQL_PATH}?includeWebMetadata=true&${selector}&variables=(profileUrn:${encodeRestliV2Value(urn)})`;
}

export function linkedInProfileContactInfoGraphqlUrl(input: {
  readonly profileUrn: unknown;
  readonly queryId?: unknown;
}): URL {
  return new URL(buildLinkedInProfileContactInfoGraphqlPath(input), LINKEDIN_ORIGIN);
}

export function buildLinkedInProfileContactDetailsOverlayPath(input: {
  readonly profileUrn: unknown;
}): string {
  const urn = profileUrn(input.profileUrn);
  return `${LINKEDIN_CONTACT_DETAILS_OVERLAY_PATH}?screenId=${encodeURIComponent(LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID)}&profileUrn=${encodeURIComponent(urn)}`;
}

export function linkedInProfileContactDetailsOverlayUrl(input: {
  readonly profileUrn: unknown;
}): URL {
  return new URL(buildLinkedInProfileContactDetailsOverlayPath(input), LINKEDIN_ORIGIN);
}

export function parseLinkedInContactNavigationSduiid(raw: unknown): string {
  const sduiid = boundedText(
    raw,
    "LinkedIn contact-info navigation sduiid",
    LINKEDIN_CONTACT_NAVIGATION_SDUIID_MAX_LENGTH,
  );
  if (
    /[\s"'<>\\]/u.test(sduiid)
    || sduiid !== LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID
  ) {
    throw new Error("LinkedIn contact-info navigation sduiid must equal ProfileContactDetailsOverlay");
  }
  return sduiid;
}

export function buildLinkedInProfileContactDetailsNavigationPostPath(
  input: { readonly sduiid?: unknown } = {},
): string {
  const sduiid = input.sduiid === undefined
    ? LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID
    : parseLinkedInContactNavigationSduiid(input.sduiid);
  return `${LINKEDIN_CONTACT_DETAILS_OVERLAY_PATH}?screenId=${encodeURIComponent(LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID)}&sduiid=${encodeURIComponent(sduiid)}`;
}

export function linkedInProfileContactDetailsNavigationPostUrl(input: {
  readonly sduiid: unknown;
}): URL {
  return new URL(buildLinkedInProfileContactDetailsNavigationPostPath(input), LINKEDIN_ORIGIN);
}

export function buildLinkedInContactNavigationBody(
  input: Pick<LinkedInContactNavigationAction, "clientArguments">,
): string {
  return JSON.stringify({
    clientArguments: input.clientArguments,
    isModal: true,
  });
}

export function buildLinkedInProfileContactInfoOverlayPath(input: {
  readonly profileUrl: unknown;
}): string {
  const target = linkedInPersonalProfileTarget(input.profileUrl);
  return `/in/${target.slug}/overlay/contact-info/`;
}

export function linkedInProfileContactInfoOverlayUrl(input: {
  readonly profileUrl: unknown;
}): URL {
  return new URL(buildLinkedInProfileContactInfoOverlayPath(input), LINKEDIN_ORIGIN);
}

function assertLinkedInContactInfoOverlayUrl(url: URL): void {
  const match = LINKEDIN_CONTACT_INFO_OVERLAY_PATH.exec(url.pathname);
  if (url.search !== "" || match?.[1] === undefined) {
    throw new Error("LinkedIn contact-info request escaped its exact reviewed route");
  }
  linkedInPersonalProfilePublicIdentifier(match[1]);
}

export function resolveLinkedInProfileContactInfoQueryId(html: unknown): string | undefined {
  if (typeof html !== "string" || html.length < 1 || html.length > MAX_HTML_BYTES) {
    return undefined;
  }
  const unique = new Set<string>();
  for (const match of html.matchAll(/voyagerIdentityDashProfileContactInfo\.([0-9a-f]{32})/giu)) {
    const decoration = match[1];
    if (decoration === undefined) continue;
    unique.add(`voyagerIdentityDashProfileContactInfo.${decoration.toLowerCase()}`);
  }
  if (unique.size !== 1) return undefined;
  return unique.values().next().value;
}

function assertLinkedInContactInfoNavigationPostUrl(url: URL): void {
  const queryNames = [...url.searchParams.keys()];
  if (
    url.pathname !== LINKEDIN_CONTACT_DETAILS_OVERLAY_PATH
    || queryNames.length !== 2
    || queryNames[0] !== "screenId"
    || queryNames[1] !== "sduiid"
    || url.searchParams.get("screenId") !== LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID
    || url.searchParams.getAll("screenId").length !== 1
    || url.searchParams.getAll("sduiid").length !== 1
  ) throw new Error("LinkedIn contact-info request escaped its exact reviewed route");
  parseLinkedInContactNavigationSduiid(url.searchParams.get("sduiid"));
}

function assertLinkedInContactInfoNavigationBody(body: unknown): void {
  if (typeof body === "string") {
    if (body.length < 1 || body.length > 4_096) {
      throw new Error("LinkedIn contact-info navigation body exceeded its reviewed bound");
    }
    try {
      body = JSON.parse(body) as unknown;
    } catch {
      throw new Error("LinkedIn contact-info navigation body must be JSON");
    }
  }
  if (!isRecord(body)) throw new Error("LinkedIn contact-info navigation body must be an object");
  const keys = Object.keys(body);
  if (
    keys.length !== 2
    || keys[0] !== "clientArguments"
    || keys[1] !== "isModal"
    || body.isModal !== true
    || !isRecord(body.clientArguments)
  ) throw new Error("LinkedIn contact-info navigation body escaped its reviewed shape");
  const reviewed = reviewedContactNavigationClientArguments(body.clientArguments);
  if (reviewed.kind === "unreviewed") {
    throw new Error(
      `LinkedIn contact-info navigation clientArguments used unreviewed keys: ${reviewed.keys.join(", ")}`,
    );
  }
  if (reviewed.kind !== "args") {
    throw new Error("LinkedIn contact-info navigation body escaped its reviewed shape");
  }
}

function assertLinkedInContactInfoGraphqlUrl(url: URL): void {
  const queryNames = [...url.searchParams.keys()];
  const queryKey = queryNames[1];
  if (
    queryNames.length !== 3
    || queryNames[0] !== "includeWebMetadata"
    || queryNames[2] !== "variables"
    || (queryKey !== "queryId" && queryKey !== "queryName")
    || url.searchParams.get("includeWebMetadata") !== "true"
    || url.searchParams.getAll("includeWebMetadata").length !== 1
    || url.searchParams.getAll("variables").length !== 1
    || (queryKey !== undefined && url.searchParams.getAll(queryKey).length !== 1)
  ) throw new Error("LinkedIn contact-info request escaped its exact reviewed route");
  if (queryKey === "queryId") {
    contactQueryId(url.searchParams.get("queryId"));
  } else if (url.searchParams.get("queryName") !== LINKEDIN_PROFILE_CONTACT_INFO_QUERY_NAME) {
    throw new Error("LinkedIn contact-info request escaped its exact reviewed route");
  }
  const variables = url.searchParams.get("variables");
  if (
    typeof variables !== "string"
    || !/^\(profileUrn:urn:li:fsd_profile:[A-Za-z0-9_-]{1,256}\)$/u.test(variables)
  ) throw new Error("LinkedIn contact-info request escaped its exact reviewed route");
  profileUrn(/^\(profileUrn:(urn:li:fsd_profile:[A-Za-z0-9_-]{1,256})\)$/u.exec(variables)?.[1]);
}

export function assertLinkedInContactInfoRequest(requestValue: unknown): void {
  if (!isRecord(requestValue)) {
    throw new Error("LinkedIn contact-info request must be an object");
  }
  const method = boundedText(requestValue.method, "LinkedIn contact-info request method", 16)
    .toUpperCase();
  if (method !== "GET" && method !== "POST") {
    throw new Error("LinkedIn contact-info reads require GET or the reviewed navigation POST");
  }
  const rawUrl = requestValue.url;
  if (!(rawUrl instanceof URL) && typeof rawUrl !== "string") {
    throw new Error("LinkedIn contact-info request URL is invalid");
  }
  const url = rawUrl instanceof URL ? new URL(rawUrl.href) : new URL(rawUrl);
  if (
    url.origin === LINKEDIN_ORIGIN
    && url.username === ""
    && url.password === ""
    && url.hash === ""
  ) {
    if (method === "POST") {
      assertLinkedInContactInfoNavigationPostUrl(url);
      if (requestValue.body !== undefined) {
        assertLinkedInContactInfoNavigationBody(requestValue.body);
      }
      return;
    }
    if (url.search === "" && url.pathname === "/voyager/api/me") return;
    if (url.search === "" && /^\/in\/[A-Za-z0-9][A-Za-z0-9_-]{1,99}\/$/u.test(url.pathname)) {
      linkedInPersonalProfileTarget(url.href);
      return;
    }
    if (url.pathname === LINKEDIN_GRAPHQL_PATH) {
      assertLinkedInContactInfoGraphqlUrl(url);
      return;
    }
    if (LINKEDIN_CONTACT_INFO_OVERLAY_PATH.test(url.pathname)) {
      assertLinkedInContactInfoOverlayUrl(url);
      return;
    }
  }
  throw new Error("LinkedIn contact-info request escaped its exact reviewed route");
}

function decodeHtmlEntity(entity: string): string {
  if (entity === "&nbsp;") return " ";
  if (entity === "&quot;") return '"';
  if (entity === "&amp;") return "&";
  if (entity === "&lt;") return "<";
  if (entity === "&gt;") return ">";
  if (entity === "&apos;") return "'";
  const numeric = /^&#(?:[xX]([0-9A-Fa-f]{1,6})|([0-9]{1,7}));$/u.exec(entity);
  if (numeric === null) {
    throw new Error("LinkedIn contact-info page used an unsupported HTML entity");
  }
  const codePoint = Number.parseInt(
    numeric[1] ?? numeric[2] ?? "",
    numeric[1] === undefined ? 10 : 16,
  );
  if (
    !Number.isSafeInteger(codePoint)
    || codePoint < 0
    || codePoint > 0x10_FFFF
    || (codePoint >= 0xD800 && codePoint <= 0xDFFF)
  ) throw new Error("LinkedIn contact-info page used an invalid numeric HTML entity");
  return String.fromCodePoint(codePoint);
}

function htmlAttribute(value: string, name: string): string | null {
  const matches = [...value.matchAll(
    new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "giu"),
  )];
  if (matches.length === 0) return null;
  if (matches.length !== 1) throw new Error(`LinkedIn contact-info HTML repeated ${name}`);
  const raw = matches[0]?.[1] ?? matches[0]?.[2];
  if (raw === undefined || raw.length > 4_096) {
    throw new Error(`LinkedIn contact-info HTML ${name} exceeded its reviewed bound`);
  }
  return raw.replace(HTML_ENTITY, (entity) => decodeHtmlEntity(entity));
}

function skipWhitespace(source: string, start: number): number {
  let index = start;
  while (index < source.length && /\s/u.test(source[index] ?? "")) index += 1;
  return index;
}

function extractBalancedJsonValue(source: string, start: number): string | undefined {
  const opener = source[start];
  if (opener !== "{" && opener !== "[") return undefined;
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  const limit = Math.min(source.length, start + MAX_HTML_BYTES);
  for (let index = start; index < limit; index += 1) {
    const character = source[index];
    if (character === undefined) break;
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (character === "\"") inString = false;
      continue;
    }
    if (character === "\"") {
      inString = true;
      continue;
    }
    if (character === opener) depth += 1;
    else if (character === closer) {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return undefined;
}

function parseJsonRoot(json: string): unknown {
  try {
    return JSON.parse(json) as unknown;
  } catch {
    throw new Error("LinkedIn contact-info bootstrap payload contained malformed JSON");
  }
}

function looksLikeRscFlight(value: string): boolean {
  return RSC_FLIGHT_ROW.test(value);
}

function extractJsonString(source: string, start: number): string | undefined {
  if (source[start] !== "\"") return undefined;
  let escaped = false;
  const limit = Math.min(source.length, start + MAX_HTML_BYTES);
  for (let index = start + 1; index < limit; index += 1) {
    const character = source[index];
    if (character === undefined) break;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "\"") return source.slice(start, index + 1);
  }
  return undefined;
}

function uniqueTextCapture(values: readonly string[]): string | null {
  const unique = [...new Set(values)];
  return unique.length === 1 ? unique[0]! : null;
}

function peelOneJsonStringLayer(value: string): string {
  if (!value.includes("\\")) return value;
  let peeled = "";
  for (let index = 0; index < value.length; index += 1) {
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
    if (escaped === "\"" || escaped === "\\" || escaped === "/") {
      peeled += escaped;
      index += 1;
      continue;
    }
    if (escaped === "n" || escaped === "r" || escaped === "t") {
      peeled += escaped === "n" ? "\n" : escaped === "r" ? "\r" : "\t";
      index += 1;
      continue;
    }
    if (escaped === "u") {
      const hex = value.slice(index + 2, index + 6);
      if (/^[0-9A-Fa-f]{4}$/u.test(hex)) {
        const codePoint = Number.parseInt(hex, 16);
        if (codePoint < 0xD800 || codePoint > 0xDFFF) {
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

function peelJsonStringEscapes(value: string): string {
  let current = value;
  for (let peel = 0; peel < MAX_JSON_STRING_PEELS; peel += 1) {
    const next = peelOneJsonStringLayer(current);
    if (next === current) break;
    current = next;
  }
  return current;
}

function captureBreadcrumbRecord(value: string): JsonRecord | null {
  const distances = [...value.matchAll(DISTANCE_IN_TEXT)]
    .map((match) => match[1])
    .filter((item): item is string => item !== undefined);
  const urns = [...value.matchAll(PROFILE_URN_IN_TEXT)]
    .map((match) => match[0])
    .filter((item): item is string => item !== undefined);
  const vieweeIds = [...value.matchAll(VIEWEE_PROFILE_ID_IN_TEXT)]
    .map((match) => match[1])
    .filter((item): item is string => item !== undefined);
  const vieweeMembers = [...value.matchAll(VIEWEE_MEMBER_URN_IN_TEXT)]
    .map((match) => match[1])
    .filter((item): item is string => item !== undefined);
  const vanities = [...value.matchAll(VANITY_IN_TEXT)]
    .map((match) => match[1])
    .filter((item): item is string => item !== undefined);
  if (
    distances.length === 0
    && urns.length === 0
    && vieweeIds.length === 0
    && vieweeMembers.length === 0
    && vanities.length === 0
  ) return null;
  const record: Record<string, unknown> = {};
  const distance = uniqueTextCapture(distances);
  if (distance !== null) {
    record.networkDistance = /^[0-9]+$/u.test(distance) ? Number(distance) : distance;
  }
  const vieweeMemberUrn = uniqueTextCapture(vieweeMembers);
  if (vieweeMemberUrn !== null) record.vieweeMemberUrn = vieweeMemberUrn;
  else {
    const incidental = uniqueTextCapture(urns);
    if (incidental !== null) record.profileUrn = incidental;
  }
  if (vieweeIds.length === 1) record.vieweeProfileId = vieweeIds[0];
  if (vanities.length === 1) record.vanityName = vanities[0];
  return Object.keys(record).length > 0 ? Object.freeze(record) : null;
}

function breadcrumbRecordFromText(value: string): JsonRecord | null {
  if (value.length < 8 || value.length > 1024 * 1024) return null;
  const peeled = peelJsonStringEscapes(value);
  return captureBreadcrumbRecord(peeled) ?? (
    peeled === value ? null : captureBreadcrumbRecord(value)
  );
}

function stringLooksLikeBootstrap(value: string): boolean {
  return value.includes("networkDistance")
    || value.includes("memberDistance")
    || value.includes("vieweeProfileId")
    || value.includes("vieweeMemberUrn")
    || value.includes("vanityName")
    || value.includes("publicIdentifier")
    || /"distance"\s*:/u.test(value);
}

function decodeStringBootstrap(value: string): unknown[] {
  const trimmed = value.trim();
  if (trimmed.length < 8 || trimmed.length > 1024 * 1024) return [];
  const peeled = peelJsonStringEscapes(trimmed);
  for (const candidate of peeled === trimmed ? [trimmed] : [trimmed, peeled]) {
    if (candidate.startsWith("{") || candidate.startsWith("[")) {
      try {
        return [JSON.parse(candidate) as unknown];
      } catch {
        // Fall through to breadcrumb extraction from partial RSC string rows.
      }
    }
  }
  if (!stringLooksLikeBootstrap(trimmed) && !stringLooksLikeBootstrap(peeled)) {
    return [];
  }
  const breadcrumb = breadcrumbRecordFromText(peeled);
  return breadcrumb === null ? [] : [breadcrumb];
}

function recordFromKeyedArray(value: readonly unknown[]): JsonRecord | null {
  if (value.length < 2 || value.length % 2 !== 0 || value.length > 64) return null;
  const record: Record<string, unknown> = {};
  let recognized = 0;
  for (let index = 0; index < value.length; index += 2) {
    const key = value[index];
    if (typeof key !== "string" || key.length < 1 || key.length > 128) return null;
    record[key] = value[index + 1];
    if (KEYED_IDENTITY_KEYS.has(key)) recognized += 1;
  }
  return recognized > 0 ? Object.freeze(record) : null;
}

function decodeRscFlightRecords(text: string): unknown[] {
  const records: unknown[] = [];
  let index = 0;
  while (index < text.length && records.length < MAX_COMO_DECODED_ROOTS) {
    index = skipWhitespace(text, index);
    const row = /^(\d+):/u.exec(text.slice(index));
    if (row === null) break;
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
    if (first === "\"") {
      const json = extractJsonString(text, index);
      if (json === undefined) {
        index += 1;
        continue;
      }
      try {
        const decoded = JSON.parse(json) as unknown;
        if (typeof decoded === "string") records.push(...decodeStringBootstrap(decoded));
        else records.push(decoded);
      } catch {
        const breadcrumb = breadcrumbRecordFromText(json);
        if (breadcrumb !== null) records.push(breadcrumb);
      }
      index += json.length;
      continue;
    }
    const remainder = text.slice(index);
    const nextRow = remainder.search(/\n\d+:/u);
    const rowText = nextRow === -1 ? remainder : remainder.slice(0, nextRow);
    const breadcrumb = breadcrumbRecordFromText(rowText);
    if (breadcrumb !== null) records.push(breadcrumb);
    index = nextRow === -1 ? text.length : index + nextRow + 1;
  }
  return records;
}

function decodeComoRehydrationValue(value: unknown): unknown[] {
  if (typeof value === "string") {
    return looksLikeRscFlight(value)
      ? decodeRscFlightRecords(value)
      : decodeStringBootstrap(value);
  }
  if (Array.isArray(value)) {
    if (value.length > 20_000) {
      throw new Error("LinkedIn contact-info bootstrap array exceeded its reviewed bound");
    }
    const decoded: unknown[] = [];
    for (const item of value) {
      if (decoded.length >= MAX_COMO_DECODED_ROOTS) break;
      if (typeof item === "string") {
        decoded.push(...decodeComoRehydrationValue(item));
        continue;
      }
      decoded.push(item);
    }
    return decoded;
  }
  if (isRecord(value)) return [value];
  return [];
}

function extractComoRehydrationRoots(html: string): unknown[] {
  const roots: unknown[] = [];
  const marker = "__como_rehydration__";
  let searchFrom = 0;
  let assignments = 0;
  while (
    searchFrom < html.length
    && assignments < MAX_COMO_ASSIGNMENTS
    && roots.length < MAX_COMO_DECODED_ROOTS
  ) {
    const markerIndex = html.indexOf(marker, searchFrom);
    if (markerIndex === -1) break;
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
      if (roots.length >= MAX_COMO_DECODED_ROOTS) break;
      roots.push(root);
    }
    searchFrom = cursor + json.length;
  }
  return roots;
}

function embeddedRecords(html: unknown): readonly JsonRecord[] {
  if (typeof html !== "string" || html.length < 1 || html.length > MAX_HTML_BYTES) {
    throw new Error("LinkedIn contact-info profile page exceeded its reviewed HTML bound");
  }
  const roots: unknown[] = [];
  let codeTags = 0;
  for (const match of html.matchAll(/<code\b([^>]{0,4096})>([\s\S]*?)<\/code>/giu)) {
    codeTags += 1;
    if (codeTags > MAX_CODE_TAGS) {
      throw new Error("LinkedIn contact-info profile page returned too many code payloads");
    }
    const attributes = match[1];
    const body = match[2];
    if (attributes === undefined || body === undefined) continue;
    const id = htmlAttribute(attributes, "id");
    if (id === null || !/^bpr-guid-[0-9]{1,12}$/u.test(id)) continue;
    if (body.length < 1 || body.length > 1024 * 1024) {
      throw new Error("LinkedIn contact-info bootstrap payload exceeded its reviewed bound");
    }
    const json = body.replace(HTML_ENTITY, (entity) => decodeHtmlEntity(entity)).trim();
    try {
      roots.push(JSON.parse(json) as unknown);
    } catch {
      throw new Error("LinkedIn contact-info bootstrap payload contained malformed JSON");
    }
  }
  roots.push(...extractComoRehydrationRoots(html));
  if (roots.length < 1) {
    throw new Error("LinkedIn contact-info profile page omitted its bootstrap payloads");
  }
  const records: JsonRecord[] = [];
  const stack = roots.map((value) => ({ value, depth: 0 }));
  let nodes = 0;
  while (stack.length > 0) {
    const next = stack.pop()!;
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
      if (next.value.length > 20_000) {
        throw new Error("LinkedIn contact-info bootstrap array exceeded its reviewed bound");
      }
      const keyed = recordFromKeyedArray(next.value);
      if (keyed !== null) records.push(keyed);
      for (const value of next.value) stack.push({ value, depth: next.depth + 1 });
      continue;
    }
    if (!isRecord(next.value)) continue;
    records.push(next.value);
    for (const value of Object.values(next.value)) {
      stack.push({ value, depth: next.depth + 1 });
    }
  }
  return Object.freeze(records);
}

function typeName(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function distanceValue(record: JsonRecord): string | number | null {
  const raw = record.memberDistance ?? record.networkDistance ?? record.distance;
  if (typeof raw === "string" || typeof raw === "number") return raw;
  if (isRecord(raw) && (typeof raw.value === "string" || typeof raw.value === "number")) {
    return raw.value;
  }
  return null;
}

function isFirstDegree(value: string | number): boolean {
  return value === "DISTANCE_1" || value === 1 || value === "1";
}

function isSelfDistance(value: string | number): boolean {
  return value === "DISTANCE_SELF" || value === "SELF" || value === 0 || value === "0";
}

function optionalPublicIdentifier(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 1) return null;
  try {
    return linkedInPersonalProfilePublicIdentifier(value);
  } catch {
    return null;
  }
}

function vanityFromHref(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 1 || value.length > 2_048) return null;
  let url: URL;
  try {
    url = new URL(value.startsWith("http") ? value : `https://www.linkedin.com${value.startsWith("/") ? value : `/${value}`}`);
  } catch {
    return null;
  }
  if (url.hostname !== "www.linkedin.com" && url.hostname !== "linkedin.com") return null;
  const match = /^\/in\/([A-Za-z0-9][A-Za-z0-9_-]{1,99})\/?$/u.exec(url.pathname);
  if (match?.[1] === undefined) return null;
  return optionalPublicIdentifier(match[1]);
}

function vanityFromRecord(record: JsonRecord): string | null {
  return optionalPublicIdentifier(record.publicIdentifier)
    ?? optionalPublicIdentifier(record.vanityName)
    ?? vanityFromHref(record.profileUrl)
    ?? vanityFromHref(record.url)
    ?? vanityFromHref(record.canonicalUrl)
    ?? vanityFromHref(record.navigationUrl);
}

function profileUrnFromIdentity(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 1 || value.length > 512) return null;
  if (value.startsWith("urn:li:fsd_profile:")) {
    try {
      return profileUrn(value);
    } catch {
      return null;
    }
  }
  if (!PROFILE_ID.test(value)) return null;
  try {
    return profileUrn(`urn:li:fsd_profile:${value}`);
  } catch {
    return null;
  }
}

function profileUrnFromRecord(record: JsonRecord): string | null {
  for (const key of ["entityUrn", "objectUrn", "profileUrn", "vieweeMemberUrn"] as const) {
    const urn = profileUrnFromIdentity(record[key]);
    if (urn !== null) return urn;
  }
  return profileUrnFromIdentity(record.vieweeProfileId);
}

function durableProfileUrnFromRecord(record: JsonRecord): string | null {
  for (const key of ["entityUrn", "objectUrn", "profileUrn"] as const) {
    const urn = profileUrnFromIdentity(record[key]);
    if (urn !== null) return urn;
  }
  const viewee = profileUrnFromIdentity(record.vieweeMemberUrn);
  if (viewee !== null && !VIEWER_SUBJECT.test(viewee)) return viewee;
  return profileUrnFromIdentity(record.vieweeProfileId);
}

function classicProfileUrnFromRecord(record: JsonRecord): string | null {
  for (const key of ["entityUrn", "objectUrn", "profileUrn"] as const) {
    const urn = profileUrnFromIdentity(record[key]);
    if (urn !== null) return urn;
  }
  return null;
}

function vieweeMemberIdentity(record: JsonRecord): string | null {
  const value = record.vieweeMemberUrn;
  if (typeof value !== "string" || value.length < 1 || value.length > 512) return null;
  return profileUrnFromIdentity(value)
    ?? (MEMBER_URN.test(value) ? value : null)
    ?? (PROFILE_ID.test(value) ? value : null);
}

function recordIsSelfView(record: JsonRecord): boolean {
  return record.isSelfView === true;
}

function selfProfileError(): Error {
  return new Error(
    "LinkedIn contacts.read reads one 1st-degree connection; use profiles.read for the signed-in self profile",
  );
}

function omittedDistanceError(): Error {
  return new Error(
    "LinkedIn contact-info profile page omitted or contradicted its relationship distance",
  );
}

function uniqueDistances(values: readonly (string | number)[]): (string | number)[] {
  const unique = [...new Set(values.map((value) => String(value)))];
  return unique.map((value) => values.find((candidate) => String(candidate) === value)!);
}

function recordMatchesTarget(
  record: JsonRecord,
  slug: string,
  urn: string,
): boolean {
  const vanity = vanityFromRecord(record);
  const recordUrn = profileUrnFromRecord(record);
  return vanity === slug || recordUrn === urn;
}

function recordContradictsTarget(
  record: JsonRecord,
  slug: string,
  urn: string,
): boolean {
  const vanity = vanityFromRecord(record);
  const classicUrn = classicProfileUrnFromRecord(record);
  return (vanity !== null && vanity !== slug)
    || (classicUrn !== null && classicUrn !== urn);
}

function recordIsViewerViewee(
  record: JsonRecord,
  viewer: string,
): boolean {
  const member = vieweeMemberIdentity(record);
  return member === viewer || profileUrnFromIdentity(member) === viewer;
}

function uniqueNonSelfDistance(
  values: readonly (string | number)[],
): string | number | undefined {
  const other = values.filter((value) => !isSelfDistance(value));
  const unique = uniqueDistances(other);
  if (unique.length > 1) throw omittedDistanceError();
  return unique[0];
}

function relationshipDistance(
  records: readonly JsonRecord[],
  slug: string,
  urn: string,
  viewer: string,
): string | number {
  const bound = records
    .filter((record) => recordMatchesTarget(record, slug, urn))
    .map(distanceValue)
    .filter((value): value is string | number => value !== null);
  const boundDistance = uniqueNonSelfDistance(bound);
  if (boundDistance !== undefined) return boundDistance;
  if (bound.some(isSelfDistance) && urn === viewer) throw selfProfileError();

  const vieweeJoined = records
    .filter((record) => (
      !recordContradictsTarget(record, slug, urn)
      && !recordIsViewerViewee(record, viewer)
      && vieweeMemberIdentity(record) !== null
    ))
    .map(distanceValue)
    .filter((value): value is string | number => value !== null);
  const vieweeDistance = uniqueNonSelfDistance(vieweeJoined);
  if (vieweeDistance !== undefined) return vieweeDistance;
  if (vieweeJoined.some(isSelfDistance) && (urn === viewer || !vieweeJoined.some((value) => !isSelfDistance(value)))) {
    throw selfProfileError();
  }

  const breadcrumbs = records
    .filter((record) => (
      !recordContradictsTarget(record, slug, urn)
      && !recordMatchesTarget(record, slug, urn)
      && vieweeMemberIdentity(record) === null
    ))
    .map(distanceValue)
    .filter((value): value is string | number => value !== null);
  const breadcrumbDistance = uniqueNonSelfDistance(breadcrumbs);
  if (breadcrumbDistance !== undefined) return breadcrumbDistance;
  if (breadcrumbs.some(isSelfDistance) && (urn === viewer || !breadcrumbs.some((value) => !isSelfDistance(value)))) {
    throw selfProfileError();
  }
  throw omittedDistanceError();
}

export function projectLinkedInProfileContactBinding(input: {
  readonly profileHtml: unknown;
  readonly profileUrl: unknown;
  readonly expectedViewerSubject: unknown;
}): LinkedInProfileContactBinding {
  const target = linkedInContactInfoTarget(input.profileUrl);
  const viewer = viewerSubject(input.expectedViewerSubject);
  const records = embeddedRecords(input.profileHtml);
  const vanityRecords = records.filter((record) => vanityFromRecord(record) === target.slug);
  if (vanityRecords.length < 1) {
    throw new Error("LinkedIn contact-info profile page did not bind the requested vanity");
  }
  if (vanityRecords.some(recordIsSelfView)) throw selfProfileError();
  const urns = new Set<string>();
  for (const record of vanityRecords) {
    const urn = durableProfileUrnFromRecord(record);
    if (urn !== null) urns.add(urn);
  }
  if (urns.size < 1) {
    const joined = new Set<string>();
    let sawSelf = false;
    for (const record of records) {
      const urn = durableProfileUrnFromRecord(record);
      const distance = distanceValue(record);
      if (
        recordIsSelfView(record)
        || urn === viewer
        || (distance !== null && isSelfDistance(distance))
      ) {
        sawSelf = true;
      }
      if (urn === null || urn === viewer || distance === null) continue;
      joined.add(urn);
    }
    if (joined.size === 1) {
      for (const urn of joined) urns.add(urn);
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
  const urn = urns.values().next().value!;
  if (urn === viewer) throw selfProfileError();
  const distance = relationshipDistance(records, target.slug, urn, viewer);
  if (isSelfDistance(distance)) throw selfProfileError();
  if (!isFirstDegree(distance)) {
    throw new Error(
      "LinkedIn hid Contact info because the signed-in viewer is not a 1st-degree connection of this profile",
    );
  }
  return Object.freeze({
    vanity: target.slug,
    profileUrn: urn,
    url: target.url,
    relationship: "first-degree",
  });
}

function isOverlayContactScreen(value: unknown): boolean {
  return value === LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID
    || value === "ProfileContactDetailsOverlay";
}

function isContactDetailsPageKey(value: unknown): boolean {
  return value === LINKEDIN_CONTACT_DETAILS_PAGE_KEY;
}

function reviewedSduiType(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 12 || value.length > 256) return null;
  return LINKEDIN_SDUI_TYPE.test(value) || PROTO_SDUI_TYPE.test(value) ? value : null;
}

function reviewedStateKeyList(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length > 32) return null;
  const keys: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.length < 1 || item.length > 256 || /[\s"'<>\\]/u.test(item)) {
      return null;
    }
    keys.push(item);
  }
  return Object.freeze(keys);
}

function optionalPersonName(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 1 || value.length > 128) return null;
  if (/[@:/\\<>]/u.test(value)) return null;
  return value;
}

type OptionalSduiid =
  | { readonly kind: "absent" }
  | { readonly kind: "reviewed"; readonly sduiid: string }
  | { readonly kind: "unreviewed" };

function optionalNavigationSduiid(value: unknown): OptionalSduiid {
  if (value === undefined || value === null || value === "") return { kind: "absent" };
  if (typeof value !== "string") return { kind: "unreviewed" };
  try {
    return { kind: "reviewed", sduiid: parseLinkedInContactNavigationSduiid(value) };
  } catch {
    return { kind: "unreviewed" };
  }
}

function parseContactNavigationHref(value: unknown): {
  readonly screenId: string | null;
  readonly sduiid: OptionalSduiid;
} | null {
  if (typeof value !== "string" || value.length < 1 || value.length > 2_048) return null;
  let url: URL;
  try {
    url = new URL(
      value.startsWith("http")
        ? value
        : `https://www.linkedin.com${value.startsWith("/") ? value : `/${value}`}`,
    );
  } catch {
    return null;
  }
  if (
    (url.hostname !== "www.linkedin.com" && url.hostname !== "linkedin.com")
    || url.pathname !== LINKEDIN_CONTACT_DETAILS_OVERLAY_PATH
  ) return null;
  const screenId = url.searchParams.get("screenId");
  return Object.freeze({
    screenId,
    sduiid: optionalNavigationSduiid(url.searchParams.get("sduiid")),
  });
}

function peelContactNavigationClientArguments(value: unknown): JsonRecord | null {
  if (!isRecord(value)) return null;
  if (isRecord(value.clientArguments)) return value.clientArguments;
  const requested = isRecord(value.requestedArguments) ? value.requestedArguments : null;
  const nested = isRecord(value.arguments) ? value.arguments : null;
  for (const candidate of [requested, nested]) {
    if (candidate === null) continue;
    if (isRecord(candidate.clientArguments)) return candidate.clientArguments;
    if (isRecord(candidate.payload) || candidate.$type !== undefined) return candidate;
    return Object.freeze({ payload: candidate });
  }
  if (isRecord(value.payload) || value.requestMetadata !== undefined) {
    const root: Record<string, unknown> = {};
    if (value.$type !== undefined) root.$type = value.$type;
    if (value.requestedStateKeys !== undefined) root.requestedStateKeys = value.requestedStateKeys;
    if (isRecord(value.payload)) root.payload = value.payload;
    if (value.requestMetadata !== undefined) root.requestMetadata = value.requestMetadata;
    return Object.freeze(root);
  }
  return null;
}

function requestMetadataEquals(
  left: LinkedInContactNavigationRequestMetadata,
  right: LinkedInContactNavigationRequestMetadata,
): boolean {
  return left.$type === right.$type
    && left.screenId === right.screenId
    && JSON.stringify(left.states ?? null) === JSON.stringify(right.states ?? null)
    && JSON.stringify(left.knownTemplates ?? null) === JSON.stringify(right.knownTemplates ?? null);
}

function reviewedRequestMetadata(
  raw: unknown,
):
  | { readonly kind: "meta"; readonly meta: LinkedInContactNavigationRequestMetadata }
  | { readonly kind: "unreviewed"; readonly keys: readonly string[] }
  | { readonly kind: "empty" }
{
  if (raw === undefined) return { kind: "empty" };
  if (!isRecord(raw)) return { kind: "unreviewed", keys: Object.freeze(["requestMetadata"]) };
  const extra = Object.keys(raw).filter((key) => !CONTACT_NAVIGATION_REQUEST_METADATA_KEY_SET.has(key));
  if (extra.length > 0) return { kind: "unreviewed", keys: Object.freeze(extra.map((key) => `requestMetadata.${key}`)) };
  const meta: {
    $type?: string;
    states?: readonly string[];
    screenId?: string;
    knownTemplates?: readonly string[];
  } = {};
  if (raw.$type !== undefined) {
    const type = reviewedSduiType(raw.$type);
    if (type === null) return { kind: "unreviewed", keys: Object.freeze(["requestMetadata.$type"]) };
    meta.$type = type;
  }
  if (raw.states !== undefined) {
    const states = reviewedStateKeyList(raw.states);
    if (states === null) return { kind: "unreviewed", keys: Object.freeze(["requestMetadata.states"]) };
    meta.states = states;
  }
  if (raw.screenId !== undefined) {
    if (!isOverlayContactScreen(raw.screenId)) {
      return { kind: "unreviewed", keys: Object.freeze(["requestMetadata.screenId"]) };
    }
    meta.screenId = LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID;
  }
  if (raw.knownTemplates !== undefined) {
    const templates = reviewedStateKeyList(raw.knownTemplates);
    if (templates === null) return { kind: "unreviewed", keys: Object.freeze(["requestMetadata.knownTemplates"]) };
    meta.knownTemplates = templates;
  }
  return Object.keys(meta).length === 0
    ? { kind: "empty" }
    : { kind: "meta", meta: Object.freeze(meta) };
}

function reviewedContactNavigationClientArguments(
  raw: JsonRecord | null,
):
  | { readonly kind: "args"; readonly args: LinkedInContactNavigationClientArguments }
  | { readonly kind: "unreviewed"; readonly keys: readonly string[] }
  | { readonly kind: "empty" }
{
  if (raw === null) return { kind: "empty" };
  if (
    isRecord(raw.payload)
    || raw.$type !== undefined
    || raw.requestedStateKeys !== undefined
    || raw.requestMetadata !== undefined
  ) {
    const extra = Object.keys(raw).filter((key) => !CONTACT_NAVIGATION_CLIENT_ARGUMENT_KEY_SET.has(key));
    if (extra.length > 0) return { kind: "unreviewed", keys: Object.freeze(extra) };
    const args: {
      $type?: string;
      requestedStateKeys?: readonly string[];
      payload: LinkedInContactNavigationPayload;
      requestMetadata?: LinkedInContactNavigationRequestMetadata;
    } = { payload: Object.freeze({}) };
    if (raw.$type !== undefined) {
      const type = reviewedSduiType(raw.$type);
      if (type === null) return { kind: "unreviewed", keys: Object.freeze(["$type"]) };
      args.$type = type;
    }
    if (raw.requestedStateKeys !== undefined) {
      const keys = reviewedStateKeyList(raw.requestedStateKeys);
      if (keys === null) return { kind: "unreviewed", keys: Object.freeze(["requestedStateKeys"]) };
      args.requestedStateKeys = keys;
    }
    const siblingMetadata = reviewedRequestMetadata(raw.requestMetadata);
    if (siblingMetadata.kind === "unreviewed") return siblingMetadata;
    let nestedMetadata:
      | { readonly kind: "meta"; readonly meta: LinkedInContactNavigationRequestMetadata }
      | { readonly kind: "unreviewed"; readonly keys: readonly string[] }
      | { readonly kind: "empty" } = { kind: "empty" };
    if (raw.payload !== undefined) {
      if (!isRecord(raw.payload)) return { kind: "unreviewed", keys: Object.freeze(["payload"]) };
      const extraPayload = Object.keys(raw.payload)
        .filter((key) => key !== "requestMetadata" && !CONTACT_NAVIGATION_PAYLOAD_KEY_SET.has(key));
      if (extraPayload.length > 0) {
        return { kind: "unreviewed", keys: Object.freeze(extraPayload.map((key) => `payload.${key}`)) };
      }
      const payload: {
        vanityName?: string;
        givenName?: string;
        familyName?: string;
        isVanityNameResolved?: boolean;
      } = {};
      if (raw.payload.vanityName !== undefined) {
        const vanity = optionalPublicIdentifier(raw.payload.vanityName);
        if (vanity === null) return { kind: "unreviewed", keys: Object.freeze(["payload.vanityName"]) };
        payload.vanityName = vanity;
      }
      if (raw.payload.givenName !== undefined) {
        const givenName = optionalPersonName(raw.payload.givenName);
        if (givenName === null) return { kind: "unreviewed", keys: Object.freeze(["payload.givenName"]) };
        payload.givenName = givenName;
      }
      if (raw.payload.familyName !== undefined) {
        const familyName = optionalPersonName(raw.payload.familyName);
        if (familyName === null) return { kind: "unreviewed", keys: Object.freeze(["payload.familyName"]) };
        payload.familyName = familyName;
      }
      if (raw.payload.isVanityNameResolved !== undefined) {
        if (typeof raw.payload.isVanityNameResolved !== "boolean") {
          return { kind: "unreviewed", keys: Object.freeze(["payload.isVanityNameResolved"]) };
        }
        payload.isVanityNameResolved = raw.payload.isVanityNameResolved;
      }
      nestedMetadata = reviewedRequestMetadata(raw.payload.requestMetadata);
      if (nestedMetadata.kind === "unreviewed") {
        return {
          kind: "unreviewed",
          keys: Object.freeze(nestedMetadata.keys.map((key) => (
            key.startsWith("requestMetadata") ? `payload.${key}` : key
          ))),
        };
      }
      args.payload = Object.freeze(payload);
    }
    if (siblingMetadata.kind === "meta" && nestedMetadata.kind === "meta") {
      if (!requestMetadataEquals(siblingMetadata.meta, nestedMetadata.meta)) {
        return { kind: "unreviewed", keys: Object.freeze(["requestMetadata"]) };
      }
      args.requestMetadata = siblingMetadata.meta;
    } else if (siblingMetadata.kind === "meta") {
      args.requestMetadata = siblingMetadata.meta;
    } else if (nestedMetadata.kind === "meta") {
      args.requestMetadata = nestedMetadata.meta;
    }
    return { kind: "args", args: Object.freeze(args) };
  }
  const extra = Object.keys(raw).filter((key) => (
    key !== "vanityName"
    && key !== "publicIdentifier"
    && key !== "vanity"
  ));
  if (extra.length > 0) return { kind: "unreviewed", keys: Object.freeze(extra) };
  const vanity = optionalPublicIdentifier(raw.vanityName)
    ?? optionalPublicIdentifier(raw.publicIdentifier)
    ?? optionalPublicIdentifier(raw.vanity);
  return vanity === null
    ? { kind: "empty" }
    : { kind: "args", args: Object.freeze({ payload: Object.freeze({ vanityName: vanity }) }) };
}

function clientArgumentsBindTarget(
  args: LinkedInContactNavigationClientArguments,
  publicIdentifier: string,
): boolean {
  const vanity = optionalPublicIdentifier(args.payload.vanityName);
  if (vanity !== null && vanity !== publicIdentifier) return false;
  return vanity === publicIdentifier || vanity === null;
}

function actionNameLooksLikeNavigateToScreen(value: unknown): boolean {
  return typeof value === "string" && /NavigateToScreen/iu.test(value);
}

function collectContactNavigationCandidates(
  records: readonly JsonRecord[],
  html: string,
): readonly {
  readonly sduiid: OptionalSduiid;
  readonly clientArguments: JsonRecord | null;
}[] {
  const candidates: {
    sduiid: OptionalSduiid;
    clientArguments: JsonRecord | null;
  }[] = [];
  const push = (sduiid: OptionalSduiid, clientArguments: JsonRecord | null) => {
    candidates.push({ sduiid, clientArguments });
  };
  for (const record of records) {
    const href = parseContactNavigationHref(
      record.href ?? record.url ?? record.navigationUrl ?? record.canonicalUrl,
    );
    const screen = record.screenId
      ?? record.destinationScreen
      ?? record.screen
      ?? record.destination;
    const pageKey = record.pageKey ?? record.page_key;
    const overlay = isOverlayContactScreen(screen)
      || isContactDetailsPageKey(pageKey)
      || (href !== null && isOverlayContactScreen(href.screenId));
    const navigate = actionNameLooksLikeNavigateToScreen(
      record.actionName ?? record.action ?? record.$type ?? record.type,
    );
    const sduiid = optionalNavigationSduiid(record.sduiid ?? record.sduiId ?? record.sduiID);
    const hrefSduiid = href?.sduiid ?? { kind: "absent" as const };
    const args = peelContactNavigationClientArguments(record);
    if (!overlay) continue;
    if (
      !navigate
      && sduiid.kind === "absent"
      && hrefSduiid.kind === "absent"
      && args === null
      && href === null
      && !isContactDetailsPageKey(pageKey)
    ) continue;
    push(
      sduiid.kind !== "absent" ? sduiid : hrefSduiid,
      args,
    );
  }
  for (const match of html.matchAll(CONTACT_NAVIGATION_HREF)) {
    const href = parseContactNavigationHref(match[1] ?? match[0]);
    if (href === null || !isOverlayContactScreen(href.screenId)) continue;
    push(href.sduiid, null);
  }
  return Object.freeze(candidates);
}

export function linkedInContactNavigationActionError(
  result: Exclude<LinkedInContactNavigationActionResult, { kind: "action" | "absent" }>,
): Error {
  if (result.kind === "omitted-sduiid") {
    return new Error("LinkedIn contact-info profile page omitted its Contact-info navigation sduiid");
  }
  if (result.kind === "unreviewed-sduiid") {
    return new Error(
      "LinkedIn contact-info navigation sduiid must equal ProfileContactDetailsOverlay",
    );
  }
  if (result.kind === "ambiguous-sduiid") {
    return new Error(
      "LinkedIn contact-info profile page exposed ambiguous Contact-info navigation sduiids",
    );
  }
  if (result.kind === "unreviewed-client-arguments") {
    return new Error(
      `LinkedIn contact-info navigation clientArguments used unreviewed keys: ${result.keys.join(", ")}`,
    );
  }
  return new Error(
    "LinkedIn contact-info navigation clientArguments did not bind the requested profile",
  );
}

export function extractLinkedInContactNavigationAction(input: {
  readonly profileHtml: unknown;
  readonly publicIdentifier: string;
  readonly profileUrn: string;
}): LinkedInContactNavigationActionResult {
  const publicIdentifier = linkedInPersonalProfilePublicIdentifier(input.publicIdentifier);
  profileUrn(input.profileUrn);
  const html = typeof input.profileHtml === "string" ? input.profileHtml : "";
  const records = embeddedRecords(input.profileHtml);
  const candidates = collectContactNavigationCandidates(records, html);
  if (candidates.length < 1) return { kind: "absent" };
  if (candidates.some((candidate) => candidate.sduiid.kind === "unreviewed")) {
    return { kind: "unreviewed-sduiid" };
  }
  const sduiids = [...new Set(
    candidates
      .map((candidate) => candidate.sduiid.kind === "reviewed" ? candidate.sduiid.sduiid : undefined)
      .filter((value): value is string => value !== undefined),
  )];
  if (sduiids.length > 1) return { kind: "ambiguous-sduiid" };
  let reviewed:
    | { readonly kind: "args"; readonly args: LinkedInContactNavigationClientArguments }
    | { readonly kind: "empty" }
    | undefined;
  for (const candidate of candidates) {
    const peeled = reviewedContactNavigationClientArguments(candidate.clientArguments);
    if (peeled.kind === "unreviewed") {
      return { kind: "unreviewed-client-arguments", keys: peeled.keys };
    }
    if (peeled.kind === "args") {
      if (!clientArgumentsBindTarget(peeled.args, publicIdentifier)) {
        return { kind: "unbound-client-arguments" };
      }
      reviewed = peeled;
    }
  }
  const clientArguments = reviewed?.kind === "args"
    ? Object.freeze({
        ...reviewed.args,
        payload: Object.freeze({
          ...reviewed.args.payload,
          vanityName: reviewed.args.payload.vanityName ?? publicIdentifier,
        }),
      })
    : Object.freeze({
        payload: Object.freeze({ vanityName: publicIdentifier }),
      });
  if (!clientArgumentsBindTarget(clientArguments, publicIdentifier)) {
    return { kind: "unbound-client-arguments" };
  }
  return {
    kind: "action",
    action: Object.freeze({
      sduiid: LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID,
      clientArguments,
      isModal: true,
    }),
  };
}

export function projectLinkedInEmbeddedContactFields(
  html: unknown,
  vanity: string,
): LinkedInContactFields | undefined {
  try {
    const records = embeddedRecords(html);
    const entities = collectRecords(records).filter(contactEntity);
    if (entities.length < 1) return undefined;
    return projectFields(records, vanity);
  } catch (error) {
    if (error instanceof Error && error.message === LINKEDIN_CONTACT_INFO_FIELD_LABEL_ERROR) {
      return undefined;
    }
    throw error;
  }
}

function overlayMailtoFields(value: string): JsonRecord | null {
  const emails = [...value.matchAll(/mailto:([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24})/giu)]
    .map((match) => match[1]?.toLowerCase())
    .filter((item): item is string => item !== undefined);
  const unique = [...new Set(emails)];
  if (unique.length !== 1) return null;
  return Object.freeze({ emailAddress: unique[0] });
}

function overlayTextPairFields(value: readonly unknown[]): JsonRecord | null {
  const texts: string[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      const text = item.trim();
      if (text.length > 0 && text.length <= 2_048) texts.push(text);
      continue;
    }
    if (!isRecord(item)) continue;
    const text = item.text ?? item.value ?? item.title ?? item.label;
    if (typeof text === "string") {
      const trimmed = text.trim();
      if (trimmed.length > 0 && trimmed.length <= 2_048) texts.push(trimmed);
    }
    const href = item.href ?? item.url;
    if (typeof href === "string" && href.toLowerCase().startsWith("mailto:")) {
      texts.push(href);
    }
  }
  if (texts.length < 2) return null;
  const collected: {
    email?: string;
    connectedSince?: string;
    phones: string[];
    websites: string[];
    birthday?: string;
  } = { phones: [], websites: [] };
  for (let index = 0; index < texts.length - 1; index += 1) {
    const label = texts[index];
    const raw = texts[index + 1];
    if (label === undefined || raw === undefined) continue;
    const key = optionalLabelKey(label);
    if (key === undefined) continue;
    if (key === "email") {
      const email = optionalEmail(
        raw.toLowerCase().startsWith("mailto:") ? raw.slice("mailto:".length) : raw,
        "LinkedIn contact-info Email",
      );
      if (email !== null) collected.email = email;
      continue;
    }
    if (key === "connected since") {
      const connected = connectedSinceValue(raw);
      if (connected !== null) collected.connectedSince = connected;
    }
  }
  if (collected.email === undefined && collected.connectedSince === undefined) return null;
  return Object.freeze({
    emailAddress: collected.email ?? null,
    connectedAt: collected.connectedSince ?? null,
    phoneNumbers: collected.phones,
    websites: collected.websites,
    birthDateOn: collected.birthday ?? null,
  });
}

function normalizeOverlayPayload(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (value.length < 1 || value.length > MAX_HTML_BYTES) {
    throw new Error("LinkedIn contact-info overlay payload exceeded its reviewed bound");
  }
  const trimmed = value.trim();
  if (looksLikeRscFlight(trimmed)) return decodeRscFlightRecords(trimmed);
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return parseJsonRoot(trimmed);
  const mailto = overlayMailtoFields(trimmed);
  return mailto === null ? trimmed : [mailto];
}

const LINKEDIN_CONTACT_OVERLAY_OMITTED_FIELDS =
  "LinkedIn contact-info overlay omitted its contact fields";

function overlayHasProjectedField(fields: LinkedInContactFields): boolean {
  return fields.email !== null
    || fields.connectedSince !== null
    || fields.phones.length > 0
    || fields.websites.length > 0
    || fields.birthday !== null;
}

function leftoverOverlayMailtoEmails(value: string): string[] {
  return [...new Set(
    [...value.matchAll(/mailto:([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24})/giu)]
      .map((match) => match[1]?.toLowerCase())
      .filter((item): item is string => item !== undefined),
  )];
}

function projectOverlayContactFields(
  overlay: unknown,
  vanity: string,
): LinkedInContactFields {
  const normalized = normalizeOverlayPayload(overlay);
  if (typeof normalized !== "string") return projectFields(normalized, vanity);
  if (leftoverOverlayMailtoEmails(normalized).length > 1) {
    throw new Error("LinkedIn contact-info email was ambiguous");
  }
  try {
    const embedded = projectLinkedInEmbeddedContactFields(normalized, vanity);
    if (embedded !== undefined && overlayHasProjectedField(embedded)) return embedded;
  } catch (error) {
    if (
      !(error instanceof Error)
      || !/bootstrap|HTML bound|too many code payloads/u.test(error.message)
    ) {
      throw error;
    }
  }
  throw new Error(LINKEDIN_CONTACT_OVERLAY_OMITTED_FIELDS);
}

export function projectLinkedInOverlayContactFields(
  overlay: unknown,
  vanity: string,
): LinkedInContactFields {
  return projectOverlayContactFields(overlay, vanity);
}

function oneUnique<T>(
  values: readonly T[],
  label: string,
): T | null {
  const unique = [...new Set(values)];
  if (unique.length === 0) return null;
  if (unique.length !== 1) throw new Error(`${label} was ambiguous`);
  return unique[0]!;
}

function emailAddress(value: unknown, label: string): string {
  const email = boundedText(value, label, 254).toLowerCase();
  if (!EMAIL.test(email)) throw new Error(`${label} is not a reviewed email`);
  return email;
}

function optionalEmail(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  return emailAddress(value, label);
}

function phoneNumber(value: unknown, label: string): string {
  const phone = boundedText(value, label, 32);
  if (!PHONE.test(phone)) throw new Error(`${label} is not a reviewed phone number`);
  return phone;
}

function websiteUrl(value: unknown, label: string): string {
  const raw = boundedText(value, label, 2_048);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label} must be an absolute URL`);
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:")
    || url.username !== ""
    || url.password !== ""
  ) throw new Error(`${label} must be a safe public HTTP URL`);
  return url.href;
}

function linkedInProfileHref(value: unknown, expectedVanity: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  const raw = boundedText(value, "LinkedIn contact-info profile link", 2_048);
  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    throw new Error("LinkedIn contact-info profile link must be an absolute URL");
  }
  if (
    url.hostname !== "www.linkedin.com" && url.hostname !== "linkedin.com"
  ) throw new Error("LinkedIn contact-info profile link escaped LinkedIn");
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

function padDay(value: number): string {
  return String(value).padStart(2, "0");
}

function birthdayValue(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string") {
    const text = boundedText(value, "LinkedIn contact-info birthday", 16);
    if (!BIRTHDAY.test(text)) throw new Error("LinkedIn contact-info birthday changed format");
    return text;
  }
  if (!isRecord(value)) throw new Error("LinkedIn contact-info birthday changed shape");
  const month = value.month;
  const day = value.day;
  if (!Number.isSafeInteger(month) || (month as number) < 1 || (month as number) > 12) {
    throw new Error("LinkedIn contact-info birthday month is invalid");
  }
  if (!Number.isSafeInteger(day) || (day as number) < 1 || (day as number) > 31) {
    throw new Error("LinkedIn contact-info birthday day is invalid");
  }
  if (value.year === undefined || value.year === null) {
    return `${padDay(month as number)}-${padDay(day as number)}`;
  }
  if (
    !Number.isSafeInteger(value.year)
    || (value.year as number) < 1900
    || (value.year as number) > 2100
  ) throw new Error("LinkedIn contact-info birthday year is invalid");
  return `${value.year}-${padDay(month as number)}-${padDay(day as number)}`;
}

function connectedSinceValue(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
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
  if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u.test(text)) return text;
  const match = CONNECTED_DISPLAY.exec(text);
  if (match === null) {
    throw new Error("LinkedIn contact-info connected-since changed format");
  }
  const month = MONTHS[match[1] as keyof typeof MONTHS];
  const day = padDay(Number(match[2]));
  return `${match[3]}-${month}-${day}`;
}

function phonesFromUnknown(value: unknown): readonly string[] {
  if (value === undefined || value === null) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > MAX_PHONES) {
    throw new Error("LinkedIn contact-info phone list exceeded its reviewed bound");
  }
  return Object.freeze(value.map((item, index) => {
    if (typeof item === "string") return phoneNumber(item, `LinkedIn contact-info phone[${index}]`);
    if (!isRecord(item)) throw new Error("LinkedIn contact-info phone changed shape");
    return phoneNumber(
      item.number ?? item.phoneNumber ?? item.value,
      `LinkedIn contact-info phone[${index}]`,
    );
  }));
}

function websitesFromUnknown(value: unknown): readonly string[] {
  if (value === undefined || value === null) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > MAX_WEBSITES) {
    throw new Error("LinkedIn contact-info website list exceeded its reviewed bound");
  }
  return Object.freeze(value.map((item, index) => {
    if (typeof item === "string") return websiteUrl(item, `LinkedIn contact-info website[${index}]`);
    if (!isRecord(item)) throw new Error("LinkedIn contact-info website changed shape");
    return websiteUrl(item.url ?? item.value, `LinkedIn contact-info website[${index}]`);
  }));
}

function optionalLabelKey(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > 64 || /[\0\r]/u.test(trimmed)) {
    return undefined;
  }
  return trimmed.toLowerCase();
}

function labeledFields(value: unknown): JsonRecord | null {
  if (!Array.isArray(value) || value.length > 32) return null;
  const collected: {
    email?: string;
    profileUrl?: string;
    connectedSince?: string;
    phones: string[];
    websites: string[];
    birthday?: string;
  } = { phones: [], websites: [] };
  for (const item of value) {
    if (!isRecord(item)) continue;
    const label = item.label ?? item.title ?? item.heading;
    const raw = item.value ?? item.text ?? item.href;
    if (typeof label !== "string") continue;
    const key = optionalLabelKey(label);
    if (key === undefined) continue;
    if (key === "email") {
      const email = optionalEmail(raw, "LinkedIn contact-info Email");
      if (email !== null) collected.email = email;
      continue;
    }
    if (key === "connected since") {
      const connected = connectedSinceValue(raw);
      if (connected !== null) collected.connectedSince = connected;
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
      if (birthday !== null) collected.birthday = birthday;
    }
  }
  if (
    collected.email === undefined
    && collected.profileUrl === undefined
    && collected.connectedSince === undefined
    && collected.phones.length === 0
    && collected.websites.length === 0
    && collected.birthday === undefined
  ) return null;
  return Object.freeze({
    emailAddress: collected.email ?? null,
    connectedAt: collected.connectedSince ?? null,
    phoneNumbers: collected.phones,
    websites: collected.websites,
    birthDateOn: collected.birthday ?? null,
  });
}

function contactEntity(record: JsonRecord): boolean {
  const type = typeName(record.$type);
  return type.endsWith(CONTACT_TYPE_SUFFIX)
    || record.emailAddress !== undefined
    || record.connectedAt !== undefined
    || record.phoneNumbers !== undefined
    || record.websites !== undefined
    || record.birthDateOn !== undefined;
}

function collectRecords(value: unknown): readonly JsonRecord[] {
  const records: JsonRecord[] = [];
  const stack = [{ value, depth: 0 }];
  let nodes = 0;
  while (stack.length > 0) {
    const next = stack.pop()!;
    nodes += 1;
    if (nodes > MAX_WALK_NODES || next.depth > MAX_WALK_DEPTH) {
      throw new Error("LinkedIn contact-info payload exceeded its traversal bound");
    }
    if (Array.isArray(next.value)) {
      if (next.value.length > 20_000) {
        throw new Error("LinkedIn contact-info payload array exceeded its reviewed bound");
      }
      const labeled = labeledFields(next.value) ?? overlayTextPairFields(next.value);
      if (labeled !== null) records.push(labeled);
      for (const item of next.value) stack.push({ value: item, depth: next.depth + 1 });
      continue;
    }
    if (!isRecord(next.value)) continue;
    records.push(next.value);
    const nestedLabels = labeledFields(next.value.fields ?? next.value.items ?? next.value.rows)
      ?? overlayTextPairFields(
        Array.isArray(next.value.fields) ? next.value.fields
          : Array.isArray(next.value.items) ? next.value.items
            : Array.isArray(next.value.rows) ? next.value.rows
              : [],
      );
    if (nestedLabels !== null) records.push(nestedLabels);
    if (typeof next.value.href === "string" || typeof next.value.url === "string") {
      const mailto = overlayMailtoFields(String(next.value.href ?? next.value.url));
      if (mailto !== null) records.push(mailto);
    }
    for (const item of Object.values(next.value)) {
      stack.push({ value: item, depth: next.depth + 1 });
    }
  }
  return Object.freeze(records);
}

function projectFields(
  payload: unknown,
  vanity: string,
): LinkedInContactFields {
  if (!isRecord(payload) && !Array.isArray(payload)) {
    throw new Error("LinkedIn contact-info payload must be a JSON object or array");
  }
  const records = collectRecords(payload);
  const entities = records.filter(contactEntity);
  if (entities.length < 1) {
    throw new Error("LinkedIn contact-info payload omitted its contact fields");
  }
  const emails = entities
    .map((record) => optionalEmail(record.emailAddress ?? record.email, "LinkedIn contact-info email"))
    .filter((value): value is string => value !== null);
  const profileUrls = entities
    .map((record) => linkedInProfileHref(
      record.profileUrl ?? record.vanityName ?? record.publicIdentifier,
      vanity,
    ))
    .filter((value): value is string => value !== null);
  const connected = entities
    .map((record) => connectedSinceValue(record.connectedAt ?? record.connectedSince))
    .filter((value): value is string => value !== null);
  const birthdays = entities
    .map((record) => birthdayValue(record.birthDateOn ?? record.birthday))
    .filter((value): value is string => value !== null);
  const phones = entities.flatMap((record) => [...phonesFromUnknown(record.phoneNumbers ?? record.phones)]);
  const websites = entities.flatMap((record) => [...websitesFromUnknown(record.websites)]);
  return Object.freeze({
    email: oneUnique(emails, "LinkedIn contact-info email"),
    profileUrl: oneUnique(profileUrls, "LinkedIn contact-info profile link") ?? `https://www.linkedin.com/in/${vanity}/`,
    connectedSince: oneUnique(connected, "LinkedIn contact-info connected-since"),
    phones: Object.freeze([...new Set(phones)]),
    websites: Object.freeze([...new Set(websites)]),
    birthday: oneUnique(birthdays, "LinkedIn contact-info birthday"),
  });
}

export function projectLinkedInContactInfo(input: {
  readonly profileHtml: unknown;
  readonly contactPayload: unknown;
  readonly profileUrl: unknown;
  readonly expectedViewerSubject: unknown;
  readonly observedAt: string;
}): LinkedInContactInfo {
  const binding = projectLinkedInProfileContactBinding({
    profileHtml: input.profileHtml,
    profileUrl: input.profileUrl,
    expectedViewerSubject: input.expectedViewerSubject,
  });
  const contact = projectOverlayContactFields(input.contactPayload, binding.vanity);
  const hasAny = contact.email !== null
    || contact.connectedSince !== null
    || contact.phones.length > 0
    || contact.websites.length > 0
    || contact.birthday !== null;
  return Object.freeze({
    schemaVersion: 1,
    provider: "linkedin",
    profile: binding,
    viewer: Object.freeze({ subject: viewerSubject(input.expectedViewerSubject) }),
    observedAt: observationTime(input.observedAt),
    completeness: hasAny ? "complete" : "partial",
    contact,
  });
}

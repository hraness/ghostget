import { createHash } from "node:crypto";

import type { GhostgetAuth } from "../auth";
import {
  PreservedBrowserArtifactsError,
  browserResultData,
  createBrowserSession,
  runCommand,
  type BrowserSession,
  type CommandResult,
  type CreateBrowserSessionOptions,
} from "../browser";
import type { GhostgetManifest } from "../model";
import {
  assertLinkedInContactInfoRequest,
  buildLinkedInProfileContactDetailsNavigationPostPath,
  buildLinkedInProfileContactInfoGraphqlPath,
  buildLinkedInProfileContactInfoOverlayPath,
  type LinkedInContactInfoJsonInput,
  type LinkedInContactNavigationInput,
} from "./linkedin-web-contact";
import type {
  WebSessionCleanupResourcePublisher,
  WebSessionOperationDeadline,
} from "../web-session-execution";
import { jsonScriptLiteral } from "../canonical-json";

const LINKEDIN_ORIGIN = "https://www.linkedin.com";
const LINKEDIN_FEED_URL = `${LINKEDIN_ORIGIN}/feed/`;
const LINKEDIN_PRE_COOKIE_REALM_URL = `${LINKEDIN_ORIGIN}/robots.txt`;
const LINKEDIN_INITIAL_ROOT_BATCH = JSON.stringify([
  ["open", LINKEDIN_ORIGIN],
]);
const LINKEDIN_INITIAL_BLANK_BATCH = JSON.stringify([
  ["open", "about:blank"],
]);
const LINKEDIN_INITIAL_REALM_BATCH = JSON.stringify([
  ["open", LINKEDIN_PRE_COOKIE_REALM_URL],
]);
const LINKEDIN_CONNECTIONS_URL =
  `${LINKEDIN_ORIGIN}/mynetwork/invite-connect/connections/`;
const MAX_IDENTITY_BYTES = 2 * 1024 * 1024;
const MAX_STATS_PAGE_BYTES = 8 * 1024 * 1024;
const BROWSER_ENVELOPE_BYTES = 64 * 1024;

const profileBrowserManifest: GhostgetManifest = Object.freeze({
  schemaVersion: 4,
  id: "linkedin-profile-runtime",
  version: "1.0.0",
  displayName: "LinkedIn profile stats runtime",
  surfaceId: "linkedin",
  origins: Object.freeze([LINKEDIN_ORIGIN]),
  browserDomains: Object.freeze(["www.linkedin.com", "static.licdn.com"]),
  operations: Object.freeze({}),
});

export type LinkedInProfileBrowserTransport = {
  readonly currentIdentityResponse: () => Promise<unknown>;
  readonly readProfileHtml: (profileUrl: string) => Promise<string>;
  readonly readConnectionsHtml: (profileUrl: string) => Promise<string>;
  readonly readContactInfoJson: (input: LinkedInContactInfoJsonInput) => Promise<unknown>;
  readonly readContactOverlayText: (input: LinkedInContactInfoJsonInput) => Promise<string>;
  readonly readContactNavigationText: (input: LinkedInContactNavigationInput) => Promise<string>;
  readonly readOrganizationHtml: (organizationUrl: string) => Promise<string>;
  readonly close: () => Promise<void>;
};

export type LinkedInProfileBrowserDependencies = {
  readonly createBrowserSession: typeof createBrowserSession;
  readonly runCommand: typeof runCommand;
  readonly settleContext: () => Promise<void>;
};

type BrowserReadBinding = {
  readonly kind: "html" | "json" | "rsc" | "rsc-action";
  readonly maxBytes: number;
  readonly path: string;
  readonly referrer: string;
  readonly body?: string;
  readonly documentUrl?: string;
  readonly pageInstance?: string;
  readonly track?: string;
  readonly applicationVersion?: string;
  readonly applicationInstance?: string;
  readonly anchorPageKey?: string;
  readonly rscStream?: string;
  readonly pageInstanceTrackingId?: string;
  readonly pageforestId?: string;
  readonly traceparent?: string;
  readonly tracestate?: string;
  readonly layoutTree?: string;
};

type LinkedInProfilePageBindings = {
  readonly pageInstance: string;
  readonly track?: string;
  readonly applicationVersion?: string;
  readonly applicationInstance?: string;
  readonly anchorPageKey?: string;
  readonly rscStream?: "true";
  readonly pageInstanceTrackingId?: string;
  readonly pageforestId?: string;
  readonly traceparent?: string;
  readonly tracestate?: string;
  readonly layoutTree?: string;
};

type LinkedInProfileNetworkRoute = "rsc-action" | "voyager";

type BrowserReadState = "ready" | "identity" | "profile" | "complete";

const PROFILE_PAGE_INSTANCE_PATTERN =
  /^urn:li:page:d_flagship3_profile[A-Za-z0-9_:-]{0,128};[A-Za-z0-9+/=_-]{1,512}$/u;
const PROFILE_OBSERVED_ID_PATTERN = /^[A-Za-z0-9+/=._-]{1,512}$/u;
const PROFILE_TRACEPARENT_PATTERN =
  /^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/u;
const PROFILE_TRACESTATE_PATTERN = /^[A-Za-z0-9=,_.*@/+-]{1,512}$/u;
const PROFILE_LAYOUT_TREE_PATTERN = /^[\x20-\x7E]{1,8192}$/u;
const PROFILE_PAGE_WAIT_MS = 5_000;
const PROFILE_PAGE_CONTEXT_EXTRACT_SOURCE =
  `(async()=>{if(location.origin!=="${LINKEDIN_ORIGIN}")throw new Error("unexpected LinkedIn origin");if(/^\\/(?:authwall|checkpoint|login|uas\\/login(?:-submit)?)(?:\\/|$)/u.test(location.pathname))throw new Error("LinkedIn stats browser reached the signed-out authwall");const root=document.documentElement;if(root===null)throw new Error("LinkedIn profile document omitted its root");const html=root.outerHTML;if(typeof html!=="string"||html.length<1||html.length>${MAX_STATS_PAGE_BYTES})throw new Error("LinkedIn profile document changed shape");const matches=html.match(/urn:li:page:d_flagship3_profile[A-Za-z0-9_:-]{0,128};[A-Za-z0-9+/=_-]{1,512}/g)||[];const unique=[];for(const value of matches){if(!unique.includes(value))unique.push(value);if(unique.length>1)throw new Error("LinkedIn profile document page-instance binding is ambiguous")}return{href:location.href,pageInstance:unique[0]??null}})()`;

const LINKEDIN_RESPONSE_MEDIA_TYPE =
  /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u;

export type LinkedInProfileBrowserFailureCategory =
  | "authwall"
  | "body-envelope"
  | "bootstrap"
  | "browser-envelope"
  | "browser-command"
  | "execution-context"
  | "identity-json"
  | "output-bound"
  | "page-binding"
  | "provider-fetch"
  | "response-envelope"
  | "response-rejected"
  | "session-cookie"
  | "startup";

export class LinkedInProfileBrowserFailure extends Error {
  readonly category: LinkedInProfileBrowserFailureCategory;

  constructor(category: LinkedInProfileBrowserFailureCategory, message: string) {
    super(message);
    this.name = "LinkedInProfileBrowserFailure";
    this.category = category;
  }
}

export class LinkedInProfileBrowserResponseRejectedError
  extends LinkedInProfileBrowserFailure {
  readonly status: number;
  readonly contentType: string;

  constructor(status: number, contentType: string) {
    super(
      "response-rejected",
      "LinkedIn stats browser request returned a reviewed rejection",
    );
    this.name = "LinkedInProfileBrowserResponseRejectedError";
    if (
      !Number.isSafeInteger(status)
      || status < 100
      || status > 599
      || contentType.length > 128
      || (contentType !== "" && !LINKEDIN_RESPONSE_MEDIA_TYPE.test(contentType))
    ) throw new Error("LinkedIn stats browser returned a malformed response category");
    this.status = status;
    this.contentType = contentType === "" ? "missing" : contentType;
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
  label: string,
): void {
  if (Object.keys(value).sort().join(",") !== [...expected].sort().join(",")) {
    throw new Error(`${label} returned an unexpected result shape`);
  }
}

function exactLinkedInUrl(
  value: string,
  kind: "organization" | "profile",
): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`LinkedIn ${kind} browser target is invalid`);
  }
  const pathAllowed = kind === "profile"
    ? /^\/in\/[A-Za-z0-9_-]{1,256}\/$/u.test(url.pathname)
    : /^\/company\/[a-z0-9][a-z0-9-]{0,255}\/$/u.test(url.pathname);
  if (
    url.origin !== LINKEDIN_ORIGIN
    || url.username !== ""
    || url.password !== ""
    || url.search !== ""
    || url.hash !== ""
    || !pathAllowed
  ) throw new Error(`LinkedIn ${kind} browser target escaped its reviewed route`);
  return url;
}

function boundedProfileHeader(value: unknown, label: string, maximum: number): string {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > maximum
    || /[\0\r\n]/u.test(value)
  ) throw new LinkedInProfileBrowserFailure(
    "page-binding",
    `${label} changed its reviewed bound`,
  );
  return value;
}

function linkedInProfilePageInstance(value: unknown): string {
  const pageInstance = boundedProfileHeader(
    value,
    "LinkedIn profile x-li-page-instance binding",
    768,
  );
  if (!PROFILE_PAGE_INSTANCE_PATTERN.test(pageInstance)) {
    throw new LinkedInProfileBrowserFailure(
      "page-binding",
      "LinkedIn stats browser omitted its reviewed profile page-instance binding",
    );
  }
  return pageInstance;
}

function linkedInProfileTrack(value: unknown): string {
  const track = boundedProfileHeader(value, "LinkedIn profile x-li-track binding", 4_096);
  let parsed: unknown;
  try {
    parsed = JSON.parse(track) as unknown;
  } catch {
    throw new LinkedInProfileBrowserFailure(
      "page-binding",
      "LinkedIn profile x-li-track binding changed shape",
    );
  }
  if (
    !isRecord(parsed)
    || (parsed.mpName !== "voyager-web" && parsed.mpName !== "web")
  ) {
    throw new LinkedInProfileBrowserFailure(
      "page-binding",
      "LinkedIn profile x-li-track binding changed shape",
    );
  }
  return track;
}

function observedHeader(
  headers: Readonly<Record<string, unknown>>,
  name: string,
): unknown {
  if (Object.hasOwn(headers, name)) return headers[name];
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return value;
  }
  return undefined;
}

function linkedInProfileApplicationVersion(value: unknown): string {
  const version = boundedProfileHeader(
    value,
    "LinkedIn profile x-li-application-version binding",
    64,
  );
  if (!/^[0-9]+(?:\.[0-9A-Za-z_-]+){1,8}$/u.test(version)) {
    throw new LinkedInProfileBrowserFailure(
      "page-binding",
      "LinkedIn profile x-li-application-version binding changed shape",
    );
  }
  return version;
}

function linkedInProfileApplicationInstance(value: unknown): string {
  const instance = boundedProfileHeader(
    value,
    "LinkedIn profile x-li-application-instance binding",
    512,
  );
  if (!/^[A-Za-z0-9+/=_-]{1,512}$/u.test(instance)) {
    throw new LinkedInProfileBrowserFailure(
      "page-binding",
      "LinkedIn profile x-li-application-instance binding changed shape",
    );
  }
  return instance;
}

function linkedInProfileAnchorPageKey(value: unknown): string {
  const key = boundedProfileHeader(
    value,
    "LinkedIn profile x-li-anchor-page-key binding",
    160,
  );
  if (!/^d_flagship3_profile[A-Za-z0-9_-]{0,128}$/u.test(key)) {
    throw new LinkedInProfileBrowserFailure(
      "page-binding",
      "LinkedIn profile x-li-anchor-page-key binding changed shape",
    );
  }
  return key;
}

function linkedInProfileObservedId(value: unknown, label: string): string {
  const observed = boundedProfileHeader(value, label, 512);
  if (!PROFILE_OBSERVED_ID_PATTERN.test(observed)) {
    throw new LinkedInProfileBrowserFailure(
      "page-binding",
      `${label} changed shape`,
    );
  }
  return observed;
}

function linkedInProfileTraceparent(value: unknown): string {
  const traceparent = boundedProfileHeader(
    value,
    "LinkedIn profile x-li-traceparent binding",
    55,
  );
  if (!PROFILE_TRACEPARENT_PATTERN.test(traceparent)) {
    throw new LinkedInProfileBrowserFailure(
      "page-binding",
      "LinkedIn profile x-li-traceparent binding changed shape",
    );
  }
  return traceparent;
}

function linkedInProfileTracestate(value: unknown): string {
  const tracestate = boundedProfileHeader(
    value,
    "LinkedIn profile x-li-tracestate binding",
    512,
  );
  if (!PROFILE_TRACESTATE_PATTERN.test(tracestate)) {
    throw new LinkedInProfileBrowserFailure(
      "page-binding",
      "LinkedIn profile x-li-tracestate binding changed shape",
    );
  }
  return tracestate;
}

function linkedInProfileLayoutTree(value: unknown): string {
  const layoutTree = boundedProfileHeader(
    value,
    "LinkedIn profile x-li-layout-tree binding",
    8_192,
  );
  if (!PROFILE_LAYOUT_TREE_PATTERN.test(layoutTree)) {
    throw new LinkedInProfileBrowserFailure(
      "page-binding",
      "LinkedIn profile x-li-layout-tree binding changed shape",
    );
  }
  return layoutTree;
}

function linkedInProfileCopiedHeaders(
  headers: Readonly<Record<string, unknown>>,
): Omit<LinkedInProfilePageBindings, "pageInstance"> {
  const trackValue = observedHeader(headers, "x-li-track");
  const applicationVersion = observedHeader(headers, "x-li-application-version");
  const applicationInstance = observedHeader(headers, "x-li-application-instance");
  const anchorPageKey = observedHeader(headers, "x-li-anchor-page-key");
  const rscStream = observedHeader(headers, "x-li-rsc-stream");
  const pageInstanceTrackingId = observedHeader(
    headers,
    "x-li-page-instance-tracking-id",
  );
  const pageforestId = observedHeader(headers, "x-li-pageforestid");
  const traceparent = observedHeader(headers, "x-li-traceparent");
  const tracestate = observedHeader(headers, "x-li-tracestate");
  const layoutTree = observedHeader(headers, "x-li-layout-tree");
  return Object.freeze({
    ...(typeof trackValue === "string" ? { track: linkedInProfileTrack(trackValue) } : {}),
    ...(typeof applicationVersion === "string"
      ? { applicationVersion: linkedInProfileApplicationVersion(applicationVersion) }
      : {}),
    ...(typeof applicationInstance === "string"
      ? { applicationInstance: linkedInProfileApplicationInstance(applicationInstance) }
      : {}),
    ...(typeof anchorPageKey === "string"
      ? { anchorPageKey: linkedInProfileAnchorPageKey(anchorPageKey) }
      : {}),
    ...(rscStream === "true" ? { rscStream: "true" as const } : {}),
    ...(typeof pageInstanceTrackingId === "string"
      ? {
        pageInstanceTrackingId: linkedInProfileObservedId(
          pageInstanceTrackingId,
          "LinkedIn profile x-li-page-instance-tracking-id binding",
        ),
      }
      : {}),
    ...(typeof pageforestId === "string"
      ? {
        pageforestId: linkedInProfileObservedId(
          pageforestId,
          "LinkedIn profile x-li-pageforestid binding",
        ),
      }
      : {}),
    ...(typeof traceparent === "string"
      ? { traceparent: linkedInProfileTraceparent(traceparent) }
      : {}),
    ...(typeof tracestate === "string"
      ? { tracestate: linkedInProfileTracestate(tracestate) }
      : {}),
    ...(typeof layoutTree === "string"
      ? { layoutTree: linkedInProfileLayoutTree(layoutTree) }
      : {}),
  });
}

function linkedInProfileNetworkBindings(
  value: unknown,
  route: LinkedInProfileNetworkRoute,
): LinkedInProfilePageBindings | null {
  if (!isRecord(value) || !Array.isArray(value.requests) || value.requests.length > 10_000) {
    throw new LinkedInProfileBrowserFailure(
      "page-binding",
      "LinkedIn profile network observation changed shape",
    );
  }
  const pathPrefix = route === "rsc-action"
    ? "/flagship-web/rsc-action/"
    : "/voyager/api/";
  let selected: LinkedInProfilePageBindings | null = null;
  for (const item of value.requests) {
    if (!isRecord(item) || !isRecord(item.headers)) continue;
    if (
      (route === "voyager" ? item.method !== "GET" : item.method !== "GET" && item.method !== "POST")
      || item.status !== 200
      || typeof item.url !== "string"
      || item.url.length > 64 * 1_024
    ) continue;
    let url: URL;
    try {
      url = new URL(item.url);
    } catch {
      continue;
    }
    if (
      url.origin !== LINKEDIN_ORIGIN
      || url.username !== ""
      || url.password !== ""
      || !url.pathname.startsWith(pathPrefix)
    ) continue;
    const pageInstanceValue = observedHeader(item.headers, "x-li-page-instance");
    if (
      typeof pageInstanceValue !== "string"
      || !PROFILE_PAGE_INSTANCE_PATTERN.test(pageInstanceValue)
    ) continue;
    selected = Object.freeze({
      pageInstance: linkedInProfilePageInstance(pageInstanceValue),
      ...linkedInProfileCopiedHeaders(item.headers),
    });
  }
  return selected;
}

function linkedInProfileDocumentBindings(
  value: unknown,
  profileHref: string,
): { readonly pageInstance: string | null } {
  if (!isRecord(value) || typeof value.href !== "string") {
    throw new LinkedInProfileBrowserFailure(
      "page-binding",
      "LinkedIn profile document omitted its page-instance binding",
    );
  }
  let href: URL;
  let expected: URL;
  try {
    href = new URL(value.href);
    expected = new URL(profileHref);
  } catch {
    throw new LinkedInProfileBrowserFailure(
      "page-binding",
      "LinkedIn profile document omitted its page-instance binding",
    );
  }
  const normalize = (path: string): string => path.endsWith("/") ? path : `${path}/`;
  if (
    href.origin !== expected.origin
    || href.username !== ""
    || href.password !== ""
    || href.search !== ""
    || href.hash !== ""
    || normalize(href.pathname) !== normalize(expected.pathname)
  ) {
    throw new LinkedInProfileBrowserFailure(
      "bootstrap",
      "LinkedIn stats browser left its bound profile document",
    );
  }
  if (value.pageInstance === null) return { pageInstance: null };
  return { pageInstance: linkedInProfilePageInstance(value.pageInstance) };
}

const CONTACT_INFO_CONTROL_NAME = "Contact info";

function contactModalEvaluationSource(documentUrl: string): string {
  const bound = jsonScriptLiteral({ documentUrl });
  return `(async()=>{const modalInput=${bound};if(location.origin!=="${LINKEDIN_ORIGIN}")throw new Error("unexpected LinkedIn origin");if(typeof modalInput.documentUrl!=="string")throw new Error("LinkedIn stats browser left its bound profile document");const documentUrl=new URL(modalInput.documentUrl);const here=new URL(location.href);const normalize=(path)=>path.endsWith("/")?path:path+"/";if(/^\\/(?:authwall|checkpoint|login|uas\\/login(?:-submit)?)(?:\\/|$)/u.test(here.pathname))throw new Error("LinkedIn stats browser reached the signed-out authwall");if(here.origin!==documentUrl.origin||here.username!==""||here.password!==""||normalize(here.pathname)!==normalize(documentUrl.pathname))throw new Error("LinkedIn stats browser left its bound profile document");const nameOf=(el)=>{const labelled=el.getAttribute("aria-label");if(typeof labelled==="string"&&labelled.trim())return labelled.replace(/\\s+/g," ").trim();return((el.textContent||"").replace(/\\s+/g," ").trim())};const matches=[];for(const el of document.querySelectorAll('a,button,[role="button"],[role="link"]')){if(nameOf(el)==="${CONTACT_INFO_CONTROL_NAME}")matches.push(el)}if(matches.length===0)throw new Error("LinkedIn stats browser omitted its reviewed Contact-info control");if(matches.length!==1)throw new Error("LinkedIn stats browser Contact-info control was ambiguous");matches[0].click();const deadline=Date.now()+8000;let dialog=null;while(Date.now()<deadline){const after=new URL(location.href);if(/^\\/(?:authwall|checkpoint|login|uas\\/login(?:-submit)?)(?:\\/|$)/u.test(after.pathname))throw new Error("LinkedIn stats browser reached the signed-out authwall");if(after.origin!==documentUrl.origin||after.username!==""||after.password!==""||normalize(after.pathname)!==normalize(documentUrl.pathname))throw new Error("LinkedIn stats browser left its bound profile document");const found=document.querySelectorAll('[role="dialog"],dialog,[aria-modal="true"]');if(found.length===1){dialog=found[0];break}if(found.length>1){const withEmail=[];for(const node of found){const text=node.innerText||"";const html=node.innerHTML||"";if(/Email/u.test(text)||/mailto:/iu.test(text)||/mailto:/iu.test(html))withEmail.push(node)}if(withEmail.length===1){dialog=withEmail[0];break}if(withEmail.length>1)throw new Error("LinkedIn stats browser Contact-info modal was ambiguous")}await new Promise((resolve)=>setTimeout(resolve,50))}if(dialog===null)throw new Error("LinkedIn stats browser omitted its Contact-info modal");const html=dialog.outerHTML;if(typeof html!=="string"||html.length<1||html.length>${MAX_STATS_PAGE_BYTES})throw new Error("LinkedIn stats browser Contact-info modal changed shape");const bytes=new TextEncoder().encode(html);const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),(value)=>value.toString(16).padStart(2,"0")).join("");let binary="";for(let offset=0;offset<bytes.length;offset+=32768)binary+=String.fromCharCode(...bytes.subarray(offset,Math.min(offset+32768,bytes.length)));return{authWall:false,bodyBase64:btoa(binary),bodyBytes:bytes.byteLength,bodySha256:digest,contentType:"text/html",status:200}})()`;
}

function browserReadEvaluationSource(binding: BrowserReadBinding): string {
  const bound = jsonScriptLiteral(binding);
  return `(async()=>{const input=${bound};if(location.origin!=="${LINKEDIN_ORIGIN}")throw new Error("unexpected LinkedIn origin");if((input.kind!=="json"&&input.kind!=="html"&&input.kind!=="rsc"&&input.kind!=="rsc-action")||!Number.isSafeInteger(input.maxBytes)||input.maxBytes<1||input.maxBytes>${MAX_STATS_PAGE_BYTES}||(input.kind==="rsc-action"?typeof input.body!=="string"||input.body.length<1||input.body.length>4096:input.body!==undefined))throw new Error("invalid LinkedIn stats browser request binding");const expected=new URL(input.path,"${LINKEDIN_ORIGIN}");if(expected.origin!=="${LINKEDIN_ORIGIN}"||expected.username!==""||expected.password!==""||expected.hash!==""||expected.href!=="${LINKEDIN_ORIGIN}"+input.path)throw new Error("invalid LinkedIn stats browser path binding");const headers=input.kind==="json"?{accept:"application/vnd.linkedin.normalized+json+2.1","x-li-lang":"en_US","x-requested-with":"XMLHttpRequest","x-restli-protocol-version":"2.0.0"}:input.kind==="rsc"?{accept:"text/x-component","x-li-lang":"en_US","x-requested-with":"XMLHttpRequest",RSC:"1"}:input.kind==="rsc-action"?{accept:"*/*","content-type":"application/json","x-li-lang":"en_US"}:{accept:"text/html"};if(input.kind==="json"||input.kind==="rsc"||input.kind==="rsc-action"){const raw=document.cookie.split("; ").find((part)=>part.startsWith("JSESSIONID="));if(typeof raw!=="string")throw new Error("missing LinkedIn browser CSRF cookie");const csrf=decodeURIComponent(raw.slice("JSESSIONID=".length)).replace(/^\"|\"$/g,"");if(!/^ajax:[A-Za-z0-9_-]{1,512}$/.test(csrf))throw new Error("invalid LinkedIn browser CSRF cookie");headers["csrf-token"]=csrf}if(input.kind==="rsc-action"){if(typeof input.documentUrl!=="string")throw new Error("LinkedIn stats browser left its bound profile document");const documentUrl=new URL(input.documentUrl);const here=new URL(location.href);const normalize=(path)=>path.endsWith("/")?path:path+"/";if(/^\\/(?:authwall|checkpoint|login|uas\\/login(?:-submit)?)(?:\\/|$)/u.test(here.pathname))throw new Error("LinkedIn stats browser reached the signed-out authwall");if(here.origin!==documentUrl.origin||here.username!==""||here.password!==""||here.search!==""||here.hash!==""||normalize(here.pathname)!==normalize(documentUrl.pathname))throw new Error("LinkedIn stats browser left its bound profile document");if(typeof input.pageInstance!=="string"||!/^urn:li:page:d_flagship3_profile[A-Za-z0-9_:-]{0,128};[A-Za-z0-9+/=_-]{1,512}$/.test(input.pageInstance))throw new Error("missing LinkedIn browser page instance");headers["x-li-page-instance"]=input.pageInstance;if(input.track!==undefined){if(typeof input.track!=="string"||input.track.length<1||input.track.length>4096||/[\\0\\r\\n]/.test(input.track))throw new Error("invalid LinkedIn browser track binding");headers["x-li-track"]=input.track}if(input.applicationVersion!==undefined){if(typeof input.applicationVersion!=="string"||!/^[0-9]+(?:[.][0-9A-Za-z_-]+){1,8}$/.test(input.applicationVersion)||input.applicationVersion.length>64)throw new Error("invalid LinkedIn browser application version");headers["x-li-application-version"]=input.applicationVersion}if(input.applicationInstance!==undefined){if(typeof input.applicationInstance!=="string"||!/^[A-Za-z0-9+/=_-]{1,512}$/.test(input.applicationInstance))throw new Error("invalid LinkedIn browser application instance");headers["x-li-application-instance"]=input.applicationInstance}if(input.anchorPageKey!==undefined){if(typeof input.anchorPageKey!=="string"||!/^d_flagship3_profile[A-Za-z0-9_-]{0,128}$/.test(input.anchorPageKey))throw new Error("invalid LinkedIn browser anchor page key");headers["x-li-anchor-page-key"]=input.anchorPageKey}if(input.rscStream!==undefined){if(input.rscStream!=="true")throw new Error("invalid LinkedIn browser rsc stream");headers["x-li-rsc-stream"]="true"}if(input.pageInstanceTrackingId!==undefined){if(typeof input.pageInstanceTrackingId!=="string"||!/^[A-Za-z0-9+/=._-]{1,512}$/.test(input.pageInstanceTrackingId))throw new Error("invalid LinkedIn browser page-instance tracking id");headers["x-li-page-instance-tracking-id"]=input.pageInstanceTrackingId}if(input.pageforestId!==undefined){if(typeof input.pageforestId!=="string"||!/^[A-Za-z0-9+/=._-]{1,512}$/.test(input.pageforestId))throw new Error("invalid LinkedIn browser pageforest id");headers["x-li-pageforestid"]=input.pageforestId}if(input.traceparent!==undefined){if(typeof input.traceparent!=="string"||!/^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/.test(input.traceparent))throw new Error("invalid LinkedIn browser traceparent");headers["x-li-traceparent"]=input.traceparent}if(input.tracestate!==undefined){if(typeof input.tracestate!=="string"||!/^[A-Za-z0-9=,_.*@/+-]{1,512}$/.test(input.tracestate))throw new Error("invalid LinkedIn browser tracestate");headers["x-li-tracestate"]=input.tracestate}if(input.layoutTree!==undefined){if(typeof input.layoutTree!=="string"||input.layoutTree.length<1||input.layoutTree.length>8192||/[\\0\\r\\n]/.test(input.layoutTree)||!/^[\\x20-\\x7E]+$/.test(input.layoutTree))throw new Error("invalid LinkedIn browser layout tree");headers["x-li-layout-tree"]=input.layoutTree}}const response=await fetch(input.path,{credentials:"include",headers,method:input.kind==="rsc-action"?"POST":"GET",redirect:"error",referrer:input.referrer,...(input.kind==="rsc-action"?{body:input.body}:{})});const responseUrl=new URL(response.url);if(responseUrl.origin!=="${LINKEDIN_ORIGIN}"||responseUrl.username!==""||responseUrl.password!==""||responseUrl.hash!==""||responseUrl.href!==expected.href)throw new Error("LinkedIn stats browser response escaped its exact route");const contentType=(response.headers.get("content-type")||"").split(";",1)[0].trim().toLowerCase();const contentTypeAllowed=input.kind==="json"?(contentType==="application/vnd.linkedin.normalized+json+2.1"||contentType==="application/json"):input.kind==="rsc"?(contentType==="text/x-component"||contentType==="text/html"||contentType==="text/plain"):input.kind==="rsc-action"?(contentType==="application/octet-stream"||contentType==="text/x-component"||contentType==="text/html"||contentType==="text/plain"):contentType==="text/html";if(response.status!==200||!contentTypeAllowed){response.body?.cancel();return{authWall:false,bodyBase64:null,bodyBytes:0,bodySha256:null,contentType,status:response.status}}if(response.body===null)throw new Error("LinkedIn stats browser response omitted its body");const reader=response.body.getReader();const chunks=[];let bytes=0;while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>input.maxBytes){await reader.cancel();throw new Error("LinkedIn stats browser response exceeded its reviewed byte bound")}chunks.push(part.value)}const body=new Uint8Array(bytes);let cursor=0;for(const chunk of chunks){body.set(chunk,cursor);cursor+=chunk.byteLength}const text=new TextDecoder("utf-8",{fatal:true}).decode(body);const authWall=(input.kind==="html"||input.kind==="rsc"||input.kind==="rsc-action")&&/(?:id|data-test-id)=[\"']authwall[\"']|name=[\"']loginCsrfParam[\"']|<form[^>]+(?:login|sign-in)/iu.test(text);if(authWall)return{authWall:true,bodyBase64:null,bodyBytes:0,bodySha256:null,contentType,status:response.status};const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",body)),(value)=>value.toString(16).padStart(2,"0")).join("");let binary="";for(let offset=0;offset<body.length;offset+=32768)binary+=String.fromCharCode(...body.subarray(offset,Math.min(offset+32768,body.length)));return{authWall:false,bodyBase64:btoa(binary),bodyBytes:body.byteLength,bodySha256:digest,contentType,status:response.status}})()`;
}

function encodedBodyBound(bytes: number): number {
  return Math.ceil(bytes / 3) * 4;
}

function decodedBody(
  result: Readonly<Record<string, unknown>>,
  maximumBytes: number,
): string {
  if (
    typeof result.bodyBase64 !== "string"
    || result.bodyBase64.length > encodedBodyBound(maximumBytes)
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      result.bodyBase64,
    )
    || !Number.isSafeInteger(result.bodyBytes)
    || (result.bodyBytes as number) < 0
    || (result.bodyBytes as number) > maximumBytes
    || typeof result.bodySha256 !== "string"
    || !/^[a-f0-9]{64}$/u.test(result.bodySha256)
  ) throw new LinkedInProfileBrowserFailure(
    "body-envelope",
    "LinkedIn stats browser body envelope changed shape",
  );
  const bytes = Buffer.from(result.bodyBase64, "base64");
  if (
    bytes.byteLength !== result.bodyBytes
    || bytes.toString("base64") !== result.bodyBase64
    || createHash("sha256").update(bytes).digest("hex") !== result.bodySha256
  ) throw new LinkedInProfileBrowserFailure(
    "body-envelope",
    "LinkedIn stats browser body envelope failed integrity verification",
  );
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new LinkedInProfileBrowserFailure(
      "body-envelope",
      "LinkedIn stats browser body was not valid UTF-8",
    );
  }
}

function browserEvaluationResult(
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const data = browserResultData(value as Record<string, unknown>);
  if (!isRecord(data) || typeof data.origin !== "string" || !isRecord(data.result)) {
    throw new LinkedInProfileBrowserFailure(
      "response-envelope",
      "LinkedIn stats browser returned a malformed evaluation envelope",
    );
  }
  let origin: URL;
  try {
    origin = new URL(data.origin);
  } catch {
    throw new LinkedInProfileBrowserFailure(
      "response-envelope",
      "LinkedIn stats browser returned a malformed evaluation envelope",
    );
  }
  if (
    origin.origin !== LINKEDIN_ORIGIN
    || origin.username !== ""
    || origin.password !== ""
  ) throw new LinkedInProfileBrowserFailure(
    "response-envelope",
    "LinkedIn stats browser returned a malformed evaluation envelope",
  );
  return data.result;
}

function hasNoDefaultExecutionContext(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current !== undefined; depth += 1) {
    if (
      current instanceof Error
      && /(?:cannot find|no) default execution context/iu.test(current.message)
    ) return true;
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}

function hasUnexpectedLinkedInOrigin(error: unknown): boolean {
  return matchesLinkedInBrowserEvalError(error, "unexpected LinkedIn origin");
}

function escapeLinkedInBrowserEvalPhrase(phrase: string): string {
  return phrase.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function matchesLinkedInBrowserEvalError(error: unknown, phrase: string): boolean {
  const pattern = new RegExp(
    `(?:^|: )${escapeLinkedInBrowserEvalPhrase(phrase)}(?:$|[\\r\\n]| +at )`,
    "u",
  );
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current !== undefined; depth += 1) {
    if (current instanceof Error && pattern.test(current.message)) return true;
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}

function classifiedBrowserCommandFailure(
  error: unknown,
): LinkedInProfileBrowserFailure {
  const message = error instanceof Error && error.message.length <= 1_500
    ? error.message
    : "";
  if (
    /(?:^|: )(?:missing|invalid) LinkedIn browser CSRF cookie$/u.test(message)
  ) {
    return new LinkedInProfileBrowserFailure(
      "session-cookie",
      "LinkedIn stats browser could not establish its reviewed CSRF cookie",
    );
  }
  if (message.includes("Failed to fetch")) {
    return new LinkedInProfileBrowserFailure(
      "provider-fetch",
      "LinkedIn stats browser could not complete its first-party fetch",
    );
  }
  if (message.endsWith("LinkedIn stats browser response escaped its exact route")) {
    return new LinkedInProfileBrowserFailure(
      "response-envelope",
      "LinkedIn stats browser response escaped its exact route",
    );
  }
  if (
    message.includes("process output exceeded")
    || message.includes("response exceeded its reviewed byte bound")
  ) {
    return new LinkedInProfileBrowserFailure(
      "output-bound",
      "LinkedIn stats browser exceeded a reviewed output bound",
    );
  }
  if (
    message.includes("malformed batch")
    || message.includes("malformed batch entry")
    || message.includes("did not return JSON")
    || message.includes("command omitted its result")
  ) {
    return new LinkedInProfileBrowserFailure(
      "browser-envelope",
      "LinkedIn stats browser command returned a malformed envelope",
    );
  }
  return new LinkedInProfileBrowserFailure(
    "browser-command",
    "LinkedIn stats browser command failed before a reviewed response",
  );
}

function contextSettlementRejected(result: CommandResult): boolean {
  return result.exitCode !== 0
    && /Failed to install browser network controls:[^\r\n]{0,256}Cannot find default execution context/u.test(
      `${result.stderr}\n${result.stdout}`,
    );
}

function commandWasAborted(options: Parameters<typeof runCommand>[1]): boolean {
  return options.signal?.aborted === true;
}

function linkedInProfileBrowserCommandRunner(
  execute: typeof runCommand,
  settleContext: () => Promise<void>,
  authKind: GhostgetAuth["kind"],
): typeof runCommand {
  let initialBatchPending = true;
  return async (command, options) => {
    const rewroteInitialRoot = initialBatchPending
      && options.stdin === LINKEDIN_INITIAL_ROOT_BATCH;
    const rewroteInitialBlank = initialBatchPending
      && authKind === "browser-profile"
      && options.stdin === LINKEDIN_INITIAL_BLANK_BATCH;
    const executionOptions = rewroteInitialRoot || rewroteInitialBlank
      ? { ...options, stdin: LINKEDIN_INITIAL_REALM_BATCH }
      : options;
    initialBatchPending = false;
    const first = await execute(command, executionOptions);
    if (
      !rewroteInitialRoot
      || authKind === "browser-profile"
      || !contextSettlementRejected(first)
      || commandWasAborted(executionOptions)
    ) return first;
    // Only a root navigation from a cookie-importing auth kind is safe to
    // repeat: it occurs before any cookies are imported. Browser profiles may
    // already contain cookies when their initial about:blank is rewritten, so
    // that navigation and every later command remain single-attempt.
    await settleContext();
    if (commandWasAborted(executionOptions)) return first;
    return execute(command, executionOptions);
  };
}

function settleLinkedInBrowserContext(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 500);
  });
}

async function finalizeBrowserSession(session: BrowserSession): Promise<void> {
  const failures: unknown[] = [];
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
  // BrowserSession cleanup can resolve only after close was acknowledged or
  // the same pinned resource was independently proved quiescent.
  if (cleanupVerified) return;
  const cleanupEvidence = (
    closeVerified
    && !cleanupVerified
    && session.cleanupResourceIdentity !== undefined
  )
    ? Object.freeze({
        kind: "agent-browser-closed-artifacts-v1" as const,
        resource: session.cleanupResourceIdentity,
      })
    : undefined;
  throw new PreservedBrowserArtifactsError(
    "LinkedIn stats browser finalization failed; private artifacts were preserved",
    session.recoveryHandle ?? "session=linkedin-profile-runtime;artifacts=unknown",
    new AggregateError(failures, "LinkedIn stats browser finalization failed"),
    cleanupEvidence,
  );
}

export async function createLinkedInProfileBrowserTransport(
  auth: GhostgetAuth,
  options: {
    readonly timeoutMs: number;
    readonly maxOutputBytes: number;
    readonly operationDeadline?: WebSessionOperationDeadline;
    readonly publishCleanupResource?: WebSessionCleanupResourcePublisher;
    readonly dependencies?: Partial<LinkedInProfileBrowserDependencies>;
  },
): Promise<LinkedInProfileBrowserTransport> {
  if (
    !Number.isSafeInteger(options.maxOutputBytes)
    || options.maxOutputBytes < 1
    || options.maxOutputBytes > MAX_STATS_PAGE_BYTES
  ) throw new Error("LinkedIn stats browser output bound is invalid");
  const createSession = options.dependencies?.createBrowserSession
    ?? createBrowserSession;
  const browserOutputBytes = encodedBodyBound(options.maxOutputBytes)
    + BROWSER_ENVELOPE_BYTES;
  const sessionOptions: CreateBrowserSessionOptions = {
    allowCodeOwnedEvaluation: true,
    allowCodeOwnedNetworkObservation: true,
    headed: true,
    maxOutputBytes: browserOutputBytes,
    timeoutMs: options.timeoutMs,
    dependencies: {
      runCommand: linkedInProfileBrowserCommandRunner(
        options.dependencies?.runCommand ?? runCommand,
        options.dependencies?.settleContext ?? settleLinkedInBrowserContext,
        auth.kind,
      ),
    },
    ...(options.operationDeadline === undefined
      ? {}
      : { operationDeadline: options.operationDeadline }),
    ...(options.publishCleanupResource === undefined
      ? {}
      : { publishCleanupResource: options.publishCleanupResource }),
  };
  let session: BrowserSession;
  try {
    session = await createSession(profileBrowserManifest, auth, sessionOptions);
  } catch (error) {
    if (error instanceof PreservedBrowserArtifactsError) throw error;
    options.operationDeadline?.throwIfUnavailable(
      "LinkedIn stats browser startup",
    );
    throw new LinkedInProfileBrowserFailure(
      "startup",
      "LinkedIn stats browser could not start its contained session",
    );
  }
  let closed = false;
  let state: BrowserReadState = "ready";

  const remainingTimeMs = (): number =>
    options.operationDeadline?.remainingTimeMs() ?? options.timeoutMs;
  const classifySessionError = (error: unknown): never => {
    if (error instanceof PreservedBrowserArtifactsError) throw error;
    if (error instanceof LinkedInProfileBrowserFailure) throw error;
    options.operationDeadline?.throwIfUnavailable(
      "LinkedIn stats browser operation",
    );
    if (hasNoDefaultExecutionContext(error)) {
      throw new LinkedInProfileBrowserFailure(
        "execution-context",
        "LinkedIn stats browser lost its reviewed execution context",
      );
    }
    if (hasUnexpectedLinkedInOrigin(error)) {
      throw new LinkedInProfileBrowserFailure(
        "bootstrap",
        "LinkedIn stats browser was not on its reviewed signed-in origin",
      );
    }
    if (matchesLinkedInBrowserEvalError(error, "LinkedIn stats browser left its bound profile document")) {
      throw new LinkedInProfileBrowserFailure(
        "bootstrap",
        "LinkedIn stats browser left its bound profile document",
      );
    }
    if (matchesLinkedInBrowserEvalError(error, "LinkedIn stats browser reached the signed-out authwall")) {
      throw new LinkedInProfileBrowserFailure(
        "authwall",
        "LinkedIn stats browser reached the signed-out authwall",
      );
    }
    if (
      error instanceof Error
      && /(?:^|: )(?:missing LinkedIn browser page instance|invalid LinkedIn browser (?:track binding|application version|application instance|anchor page key|rsc stream|page-instance tracking id|pageforest id|traceparent|tracestate|layout tree)|LinkedIn profile document page-instance binding is ambiguous)(?:$|[\r\n]| +at )/u
        .test(error.message)
    ) {
      throw new LinkedInProfileBrowserFailure(
        "page-binding",
        "LinkedIn stats browser omitted its reviewed profile page-instance binding",
      );
    }
    if (error instanceof Error) {
      if (matchesLinkedInBrowserEvalError(error, "LinkedIn stats browser Contact-info control was ambiguous")) {
        throw new LinkedInProfileBrowserFailure(
          "page-binding",
          "LinkedIn stats browser Contact-info control was ambiguous",
        );
      }
      if (matchesLinkedInBrowserEvalError(error, "LinkedIn stats browser omitted its reviewed Contact-info control")) {
        throw new LinkedInProfileBrowserFailure(
          "page-binding",
          "LinkedIn stats browser omitted its reviewed Contact-info control",
        );
      }
      if (matchesLinkedInBrowserEvalError(error, "LinkedIn stats browser Contact-info modal was ambiguous")) {
        throw new LinkedInProfileBrowserFailure(
          "page-binding",
          "LinkedIn stats browser Contact-info modal was ambiguous",
        );
      }
      if (matchesLinkedInBrowserEvalError(error, "LinkedIn stats browser omitted its Contact-info modal")) {
        throw new LinkedInProfileBrowserFailure(
          "page-binding",
          "LinkedIn stats browser omitted its Contact-info modal",
        );
      }
      if (matchesLinkedInBrowserEvalError(error, "LinkedIn stats browser Contact-info modal changed shape")) {
        throw new LinkedInProfileBrowserFailure(
          "page-binding",
          "LinkedIn stats browser Contact-info modal changed shape",
        );
      }
    }
    throw classifiedBrowserCommandFailure(error);
  };
  const runCommands = async (
    commands: readonly (readonly string[])[],
    maxOutputBytes = browserOutputBytes,
    timeoutMs = remainingTimeMs(),
  ): Promise<readonly Readonly<Record<string, unknown>>[]> => {
    if (closed) throw new Error("LinkedIn stats browser transport is closed");
    try {
      return await session.runBatch(commands, timeoutMs, maxOutputBytes);
    } catch (error) {
      throw classifySessionError(error);
    }
  };
  const bindProfilePageContext = async (
    profileHref: string,
  ): Promise<LinkedInProfilePageBindings> => {
    await runCommands([["open", profileHref]]);
    await runCommands(
      [["wait", String(PROFILE_PAGE_WAIT_MS)]],
      browserOutputBytes,
      Math.min(remainingTimeMs(), 20_000),
    );
    const observeRoute = async (
      filter: string,
      route: LinkedInProfileNetworkRoute,
    ): Promise<LinkedInProfilePageBindings | null> => {
      const observed = await runCommands(
        [["network", "requests", "--filter", filter]],
        browserOutputBytes,
        Math.min(remainingTimeMs(), 30_000),
      );
      const firstObserved = observed[0];
      if (firstObserved === undefined) {
        throw new LinkedInProfileBrowserFailure(
          "page-binding",
          "LinkedIn profile page-binding observation omitted its response",
        );
      }
      return linkedInProfileNetworkBindings(browserResultData(firstObserved), route);
    };
    const sdui = await observeRoute("/flagship-web/rsc-action/", "rsc-action");
    if (sdui !== null) return sdui;
    const voyager = await observeRoute("/voyager/api/", "voyager");
    if (voyager !== null) return voyager;
    const extracted = await runCommands(
      [["eval", PROFILE_PAGE_CONTEXT_EXTRACT_SOURCE]],
      BROWSER_ENVELOPE_BYTES,
    );
    const firstExtracted = extracted[0];
    if (firstExtracted === undefined) {
      throw new LinkedInProfileBrowserFailure(
        "page-binding",
        "LinkedIn profile document omitted its page-instance binding",
      );
    }
    const document = linkedInProfileDocumentBindings(
      browserEvaluationResult(firstExtracted),
      profileHref,
    );
    if (document.pageInstance === null) {
      throw new LinkedInProfileBrowserFailure(
        "page-binding",
        "LinkedIn stats browser omitted its reviewed profile page-instance binding",
      );
    }
    return Object.freeze({ pageInstance: document.pageInstance });
  };
  const run = async (
    binding: BrowserReadBinding,
  ): Promise<Readonly<Record<string, unknown>>> => {
    const records = await runCommands(
      [["eval", browserReadEvaluationSource(binding)]],
      Math.min(
        encodedBodyBound(binding.maxBytes) + BROWSER_ENVELOPE_BYTES,
        browserOutputBytes,
      ),
    );
    const first = records[0];
    if (first === undefined) {
      throw new LinkedInProfileBrowserFailure(
        "response-envelope",
        "LinkedIn stats browser omitted its response",
      );
    }
    const result = browserEvaluationResult(first);
    try {
      exactKeys(
        result,
        [
          "authWall",
          "bodyBase64",
          "bodyBytes",
          "bodySha256",
          "contentType",
          "status",
        ],
        "LinkedIn stats browser request",
      );
    } catch {
      throw new LinkedInProfileBrowserFailure(
        "response-envelope",
        "LinkedIn stats browser request returned an unexpected result shape",
      );
    }
    const expectedContentTypes = binding.kind === "json"
      ? ["application/vnd.linkedin.normalized+json+2.1", "application/json"]
      : binding.kind === "rsc"
        ? ["text/x-component", "text/html", "text/plain"]
        : binding.kind === "rsc-action"
          ? ["application/octet-stream", "text/x-component", "text/html", "text/plain"]
          : ["text/html"];
    if (
      typeof result.status !== "number"
      || !Number.isSafeInteger(result.status)
      || result.status < 100
      || result.status > 599
      || typeof result.contentType !== "string"
      || result.contentType.length > 128
      || (result.contentType !== "" && !LINKEDIN_RESPONSE_MEDIA_TYPE.test(result.contentType))
    ) throw new LinkedInProfileBrowserFailure(
      "response-envelope",
      "LinkedIn stats browser returned a malformed response category",
    );
    if (result.authWall === true) {
      if (
        (binding.kind !== "html" && binding.kind !== "rsc" && binding.kind !== "rsc-action")
        || result.status !== 200
        || result.contentType !== "text/html"
        || result.bodyBase64 !== null
        || result.bodyBytes !== 0
        || result.bodySha256 !== null
      ) throw new LinkedInProfileBrowserFailure(
        "response-envelope",
        "LinkedIn stats browser returned a malformed authwall envelope",
      );
      throw new LinkedInProfileBrowserFailure(
        "authwall",
        "LinkedIn stats browser reached the signed-out authwall",
      );
    }
    if (result.authWall !== false) {
      throw new LinkedInProfileBrowserFailure(
        "response-envelope",
        "LinkedIn stats browser returned a malformed authwall envelope",
      );
    }
    if (
      result.status !== 200
      || !expectedContentTypes.includes(result.contentType)
    ) {
      if (
        result.bodyBase64 !== null
        || result.bodyBytes !== 0
        || result.bodySha256 !== null
      ) throw new LinkedInProfileBrowserFailure(
        "response-envelope",
        "LinkedIn stats browser returned a malformed rejection envelope",
      );
      throw new LinkedInProfileBrowserResponseRejectedError(
        result.status,
        result.contentType,
      );
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
        referrer: LINKEDIN_FEED_URL,
      });
      state = "identity";
      const text = decodedBody(
        result,
        Math.min(MAX_IDENTITY_BYTES, options.maxOutputBytes),
      );
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new LinkedInProfileBrowserFailure(
          "identity-json",
          "LinkedIn stats browser identity response was not valid JSON",
        );
      }
    },
    readProfileHtml: async (profileUrl: string) => {
      if (state !== "identity") {
        throw new Error("LinkedIn stats browser profile read is out of order");
      }
      const target = exactLinkedInUrl(profileUrl, "profile");
      const result = await run({
        kind: "html",
        maxBytes: options.maxOutputBytes,
        path: target.pathname,
        referrer: LINKEDIN_FEED_URL,
      });
      state = "profile";
      return decodedBody(result, options.maxOutputBytes);
    },
    readConnectionsHtml: async (profileUrl: string) => {
      if (state !== "profile") {
        throw new Error("LinkedIn stats browser connections read is out of order");
      }
      const profile = exactLinkedInUrl(profileUrl, "profile");
      const result = await run({
        kind: "html",
        maxBytes: options.maxOutputBytes,
        path: new URL(LINKEDIN_CONNECTIONS_URL).pathname,
        referrer: profile.href,
      });
      state = "complete";
      return decodedBody(result, options.maxOutputBytes);
    },
    readContactInfoJson: async (input: LinkedInContactInfoJsonInput) => {
      if (state !== "profile") {
        throw new Error("LinkedIn stats browser Contact-info read is out of order");
      }
      const profile = exactLinkedInUrl(input.profileUrl, "profile");
      try {
        const result = await run({
          kind: "json",
          maxBytes: Math.min(MAX_IDENTITY_BYTES, options.maxOutputBytes),
          path: buildLinkedInProfileContactInfoGraphqlPath({
            profileUrn: input.profileUrn,
            queryId: input.queryId,
          }),
          referrer: profile.href,
        });
        state = "complete";
        const text = decodedBody(
          result,
          Math.min(MAX_IDENTITY_BYTES, options.maxOutputBytes),
        );
        try {
          return JSON.parse(text) as unknown;
        } catch {
          throw new LinkedInProfileBrowserFailure(
            "identity-json",
            "LinkedIn stats browser Contact-info response was not valid JSON",
          );
        }
      } catch (error) {
        if (error instanceof LinkedInProfileBrowserResponseRejectedError) throw error;
        state = "complete";
        throw error;
      }
    },
    readContactOverlayText: async (input: LinkedInContactInfoJsonInput) => {
      if (state !== "profile") {
        throw new Error("LinkedIn stats browser Contact-info overlay read is out of order");
      }
      const profile = exactLinkedInUrl(input.profileUrl, "profile");
      const result = await run({
        kind: "rsc",
        maxBytes: options.maxOutputBytes,
        path: buildLinkedInProfileContactInfoOverlayPath({
          profileUrl: input.profileUrl,
        }),
        referrer: profile.href,
      });
      state = "complete";
      return decodedBody(result, options.maxOutputBytes);
    },
    readContactNavigationText: async (input: LinkedInContactNavigationInput) => {
      if (state !== "profile") {
        throw new Error("LinkedIn stats browser Contact-info navigation read is out of order");
      }
      const profile = exactLinkedInUrl(input.profileUrl, "profile");
      assertLinkedInContactInfoRequest({
        method: "POST",
        url: new URL(
          buildLinkedInProfileContactDetailsNavigationPostPath({
            sduiid: input.sduiid,
          }),
          LINKEDIN_ORIGIN,
        ),
      });
      await bindProfilePageContext(profile.href);
      const records = await runCommands(
        [["eval", contactModalEvaluationSource(profile.href)]],
        Math.min(
          encodedBodyBound(options.maxOutputBytes) + BROWSER_ENVELOPE_BYTES,
          browserOutputBytes,
        ),
      );
      const first = records[0];
      if (first === undefined) {
        throw new LinkedInProfileBrowserFailure(
          "response-envelope",
          "LinkedIn stats browser omitted its response",
        );
      }
      const result = browserEvaluationResult(first);
      try {
        exactKeys(
          result,
          [
            "authWall",
            "bodyBase64",
            "bodyBytes",
            "bodySha256",
            "contentType",
            "status",
          ],
          "LinkedIn stats browser request",
        );
      } catch {
        throw new LinkedInProfileBrowserFailure(
          "response-envelope",
          "LinkedIn stats browser request returned an unexpected result shape",
        );
      }
      if (
        typeof result.status !== "number"
        || !Number.isSafeInteger(result.status)
        || result.status < 100
        || result.status > 599
        || typeof result.contentType !== "string"
        || result.contentType.length > 128
        || (result.contentType !== "" && !LINKEDIN_RESPONSE_MEDIA_TYPE.test(result.contentType))
      ) throw new LinkedInProfileBrowserFailure(
        "response-envelope",
        "LinkedIn stats browser returned a malformed response category",
      );
      if (result.authWall === true) {
        if (
          result.status !== 200
          || result.contentType !== "text/html"
          || result.bodyBase64 !== null
          || result.bodyBytes !== 0
          || result.bodySha256 !== null
        ) throw new LinkedInProfileBrowserFailure(
          "response-envelope",
          "LinkedIn stats browser returned a malformed authwall envelope",
        );
        throw new LinkedInProfileBrowserFailure(
          "authwall",
          "LinkedIn stats browser reached the signed-out authwall",
        );
      }
      if (result.authWall !== false) {
        throw new LinkedInProfileBrowserFailure(
          "response-envelope",
          "LinkedIn stats browser returned a malformed authwall envelope",
        );
      }
      if (result.status !== 200 || result.contentType !== "text/html") {
        if (
          result.bodyBase64 !== null
          || result.bodyBytes !== 0
          || result.bodySha256 !== null
        ) throw new LinkedInProfileBrowserFailure(
          "response-envelope",
          "LinkedIn stats browser returned a malformed rejection envelope",
        );
        throw new LinkedInProfileBrowserResponseRejectedError(
          result.status,
          result.contentType,
        );
      }
      state = "complete";
      return decodedBody(result, options.maxOutputBytes);
    },
    readOrganizationHtml: async (organizationUrl: string) => {
      if (state !== "identity") {
        throw new Error("LinkedIn stats browser organization read is out of order");
      }
      const target = exactLinkedInUrl(organizationUrl, "organization");
      const result = await run({
        kind: "html",
        maxBytes: options.maxOutputBytes,
        path: target.pathname,
        referrer: LINKEDIN_FEED_URL,
      });
      state = "complete";
      return decodedBody(result, options.maxOutputBytes);
    },
    close: async () => {
      if (closed) return;
      closed = true;
      await finalizeBrowserSession(session);
    },
  });
}

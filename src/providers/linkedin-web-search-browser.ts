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
import type {
  WebSessionCleanupResourcePublisher,
  WebSessionOperationDeadline,
} from "../web-session-execution";
import {
  LINKEDIN_SEARCH_MAX_KEYWORDS,
  LINKEDIN_SEARCH_PATH,
  type LinkedInSearchTarget,
} from "./linkedin-web-search";
import { jsonScriptLiteral } from "../canonical-json";
import { hasExactKeys } from "../contracts-shape.js";

const LINKEDIN_ORIGIN = "https://www.linkedin.com";
const LINKEDIN_PRE_COOKIE_REALM_URL = `${LINKEDIN_ORIGIN}/robots.txt`;
const LINKEDIN_INITIAL_ROOT_BATCH = JSON.stringify([["open", LINKEDIN_ORIGIN]]);
const LINKEDIN_INITIAL_BLANK_BATCH = JSON.stringify([["open", "about:blank"]]);
const LINKEDIN_INITIAL_REALM_BATCH = JSON.stringify([["open", LINKEDIN_PRE_COOKIE_REALM_URL]]);
const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
const BROWSER_ENVELOPE_BYTES = 64 * 1024;
const SEARCH_NAVIGATION_WAIT_MS = 9_000;
const SEARCH_PAGER_WAIT_MS = 4_000;
const SEARCH_MAX_PAGER_ADVANCES = 16;

const searchBrowserManifest: GhostgetManifest = Object.freeze({
  schemaVersion: 4,
  id: "linkedin-search-runtime",
  version: "1.0.0",
  displayName: "LinkedIn content-search runtime",
  surfaceId: "linkedin",
  origins: Object.freeze([LINKEDIN_ORIGIN]),
  browserDomains: Object.freeze(["www.linkedin.com", "static.licdn.com"]),
  operations: Object.freeze({}),
});

export type LinkedInSearchBrowserTransport = {
  readonly openSearch: (target: LinkedInSearchTarget) => Promise<unknown>;
  readonly advancePager: () => Promise<unknown>;
  readonly close: () => Promise<void>;
};

export type LinkedInSearchBrowserDependencies = {
  readonly createBrowserSession: typeof createBrowserSession;
  readonly runCommand: typeof runCommand;
  readonly settleContext: () => Promise<void>;
};

export type LinkedInSearchBrowserFailureCategory =
  | "authwall"
  | "bootstrap"
  | "browser-envelope"
  | "browser-command"
  | "execution-context"
  | "output-bound"
  | "pager"
  | "response-envelope"
  | "session-cookie"
  | "startup";

export class LinkedInSearchBrowserFailure extends Error {
  readonly category: LinkedInSearchBrowserFailureCategory;

  constructor(category: LinkedInSearchBrowserFailureCategory, message: string) {
    super(message);
    this.name = "LinkedInSearchBrowserFailure";
    this.category = category;
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
  if (!hasExactKeys(value, expected)) {
    throw new Error(`${label} returned an unexpected result shape`);
  }
}

function linkedInSearchCardSource(keywords: string): string {
  return `(async()=>{if(location.origin!=="${LINKEDIN_ORIGIN}")throw new Error("unexpected LinkedIn origin");if(location.pathname!=="${LINKEDIN_SEARCH_PATH}")throw new Error("LinkedIn search browser left its bound document");if(new URL(location.href).searchParams.get("keywords")!==${jsonScriptLiteral(keywords)})throw new Error("LinkedIn search browser left its bound document");if(/^\\/(?:authwall|checkpoint|login|uas\\/login(?:-submit)?)(?:\\/|$)/u.test(location.pathname))throw new Error("LinkedIn search browser reached its signed-out authwall");const items=[...document.querySelectorAll('div[role="listitem"]')].filter((el)=>el.querySelector('a[href*="/feed/update/urn:li:activity:"]')!==null);const cards=items.slice(0,100).map((el)=>{const perma=el.querySelector('a[href*="/feed/update/urn:li:activity:"]');const href=perma?perma.getAttribute("href"):null;const urn=href&&/urn:li:activity:[0-9]{10,20}/.exec(href);const authorAnchor=el.querySelector('a[href*="/in/"]:has(figure)')??el.querySelector('a[href*="/in/"]');const authorHref=authorAnchor?authorAnchor.getAttribute("href"):null;const vanity=authorHref&&/linkedin\\.com\\/in\\/([A-Za-z0-9][A-Za-z0-9_-]{1,99})/.exec(authorHref);const labelled=authorAnchor?authorAnchor.querySelector("[aria-label]"):null;const labelText=labelled?labelled.getAttribute("aria-label"):"";const paras=el.querySelectorAll("p");let authorHeadline=null;const nameParagraphs=labelled?[...labelled.querySelectorAll("p")]:[];if(nameParagraphs.length>1){authorHeadline=nameParagraphs[1].textContent.trim()||null}const box=el.querySelector('[data-testid="expandable-text-box"]');const text=box?box.innerText:null;let relativeTime=null;for(const sp of el.querySelectorAll("span")){const t=(sp.textContent||"").trim();if(/^(?:now|just now|[1-9][0-9]?[smhdw]|[1-9][0-9]?mo)$/iu.test(t)){relativeTime=t;break}}let reactionCount=null;const rb=el.querySelector('button[aria-label^="Reaction button state"]');if(rb){const nums=[...rb.querySelectorAll("span")].map((s)=>(s.textContent||"").trim()).filter((t)=>/^[0-9]+$/.test(t));if(nums.length>0)reactionCount=Number(nums[nums.length-1])}let commentCount=null;const cb=el.querySelector('button[aria-label="Comment"]');if(cb){const nums=[...cb.querySelectorAll("span")].map((s)=>(s.textContent||"").trim()).filter((t)=>/^[0-9]+$/.test(t));if(nums.length>0)commentCount=Number(nums[nums.length-1])}return{activityUrn:urn?urn[0]:null,url:href,authorVanity:vanity?vanity[1]:null,authorName:typeof labelText==="string"&&labelText.length>0?labelText.split(",")[0].trim():null,authorHeadline,text,relativeTime,reactionCount,commentCount}});const hyd=document.getElementById("rehydrate-data");let searchId=null;let nextPageRequest=false;if(hyd&&typeof hyd.textContent==="string"){const t=hyd.textContent;if(t.includes("nextPageRequest"))nextPageRequest=true;const sm=/"searchId\\\\?":\\\\?"([0-9a-f-]{36})/.exec(t);if(sm)searchId=sm[1]}return{cards,searchId,nextPageRequest}})()`;
}

const LINKEDIN_SEARCH_ADVANCE_SOURCE = `(async()=>{if(location.origin!=="${LINKEDIN_ORIGIN}")throw new Error("unexpected LinkedIn origin");if(location.pathname!=="${LINKEDIN_SEARCH_PATH}")throw new Error("LinkedIn search browser left its bound document");const items=[...document.querySelectorAll('div[role="listitem"]')].filter((el)=>el.querySelector('a[href*="/feed/update/urn:li:activity:"]')!==null);const last=items[items.length-1];if(last===undefined)return{advanced:false,items:0};last.scrollIntoView({block:"end",behavior:"instant"});window.scrollBy(0,400);return{advanced:true,items:items.length}})()`;

function searchNavigationSource(target: LinkedInSearchTarget): string {
  const input = Object.freeze({ searchUrl: target.searchUrl });
  return `(async()=>{const input=${jsonScriptLiteral(input)};if(location.origin!=="${LINKEDIN_ORIGIN}")throw new Error("unexpected LinkedIn origin");location.href=input.searchUrl;return{navigated:true}})()`;
}

function currentSearchUrl(value: unknown, target: LinkedInSearchTarget): void {
  if (!isRecord(value) || typeof value.url !== "string" || value.url.length > 2_048) {
    throw new LinkedInSearchBrowserFailure(
      "browser-envelope",
      "LinkedIn search browser omitted its current URL",
    );
  }
  let current: URL;
  try {
    current = new URL(value.url);
  } catch {
    throw new LinkedInSearchBrowserFailure(
      "browser-envelope",
      "LinkedIn search browser returned a malformed current URL",
    );
  }
  if (
    current.origin === LINKEDIN_ORIGIN
    && /^\/(?:authwall|checkpoint|login|uas\/login(?:-submit)?)(?:\/|$)/u.test(current.pathname)
  ) {
    throw new LinkedInSearchBrowserFailure(
      "authwall",
      "LinkedIn search browser reached the signed-out authwall",
    );
  }
  if (
    current.username !== ""
    || current.password !== ""
    || current.hash !== ""
    || current.origin !== LINKEDIN_ORIGIN
    || current.pathname !== LINKEDIN_SEARCH_PATH
    || current.searchParams.get("keywords") !== target.keywords
  ) throw new LinkedInSearchBrowserFailure(
    "response-envelope",
    "LinkedIn search browser left its exact target page",
  );
}

function browserEvaluationResult(
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const data = browserResultData(value as Record<string, unknown>);
  if (!isRecord(data) || typeof data.origin !== "string" || !isRecord(data.result)) {
    throw new LinkedInSearchBrowserFailure(
      "response-envelope",
      "LinkedIn search browser returned a malformed evaluation envelope",
    );
  }
  let origin: URL;
  try {
    origin = new URL(data.origin);
  } catch {
    throw new LinkedInSearchBrowserFailure(
      "response-envelope",
      "LinkedIn search browser returned a malformed evaluation envelope",
    );
  }
  if (
    origin.origin !== LINKEDIN_ORIGIN
    || origin.username !== ""
    || origin.password !== ""
  ) throw new LinkedInSearchBrowserFailure(
    "response-envelope",
    "LinkedIn search browser returned a malformed evaluation envelope",
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
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current !== undefined; depth += 1) {
    if (
      current instanceof Error
      && /(?:^|: )unexpected LinkedIn origin(?:$|[\r\n])/u.test(current.message)
    ) return true;
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}

function classifiedBrowserCommandFailure(error: unknown): LinkedInSearchBrowserFailure {
  const message = error instanceof Error && error.message.length <= 1_500
    ? error.message
    : "";
  if (message.endsWith("LinkedIn search browser left its bound document")) {
    return new LinkedInSearchBrowserFailure(
      "response-envelope",
      "LinkedIn search browser left its exact target page",
    );
  }
  if (message.endsWith("LinkedIn search browser reached its signed-out authwall")) {
    return new LinkedInSearchBrowserFailure(
      "authwall",
      "LinkedIn search browser reached the signed-out authwall",
    );
  }
  if (
    message.includes("process output exceeded")
    || message.includes("response exceeded its reviewed byte bound")
  ) {
    return new LinkedInSearchBrowserFailure(
      "output-bound",
      "LinkedIn search browser exceeded a reviewed output bound",
    );
  }
  if (
    message.includes("malformed batch")
    || message.includes("malformed batch entry")
    || message.includes("did not return JSON")
    || message.includes("command omitted its result")
  ) {
    return new LinkedInSearchBrowserFailure(
      "browser-envelope",
      "LinkedIn search browser command returned a malformed envelope",
    );
  }
  return new LinkedInSearchBrowserFailure(
    "browser-command",
    "LinkedIn search browser command failed before a reviewed response",
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

function linkedInSearchBrowserCommandRunner(
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
  if (closeVerified && cleanupVerified) return;
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
    "LinkedIn search browser finalization failed; private artifacts were preserved",
    session.recoveryHandle ?? "session=linkedin-search-runtime;artifacts=unknown",
    new AggregateError(failures, "LinkedIn search browser finalization failed"),
    cleanupEvidence,
  );
}

export async function createLinkedInSearchBrowserTransport(
  auth: GhostgetAuth,
  options: {
    readonly timeoutMs: number;
    readonly maxOutputBytes: number;
    readonly operationDeadline?: WebSessionOperationDeadline;
    readonly publishCleanupResource?: WebSessionCleanupResourcePublisher;
    readonly dependencies?: Partial<LinkedInSearchBrowserDependencies>;
  },
): Promise<LinkedInSearchBrowserTransport> {
  if (
    !Number.isSafeInteger(options.maxOutputBytes)
    || options.maxOutputBytes < 1
    || options.maxOutputBytes > MAX_SNAPSHOT_BYTES
  ) throw new Error("LinkedIn search browser output bound is invalid");
  const createSession = options.dependencies?.createBrowserSession
    ?? createBrowserSession;
  const browserOutputBytes = options.maxOutputBytes + BROWSER_ENVELOPE_BYTES;
  const sessionOptions: CreateBrowserSessionOptions = {
    allowCodeOwnedEvaluation: true,
    headed: true,
    maxOutputBytes: browserOutputBytes,
    timeoutMs: options.timeoutMs,
    dependencies: {
      runCommand: linkedInSearchBrowserCommandRunner(
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
    session = await createSession(searchBrowserManifest, auth, sessionOptions);
  } catch (error) {
    if (error instanceof PreservedBrowserArtifactsError) throw error;
    options.operationDeadline?.throwIfUnavailable(
      "LinkedIn search browser startup",
    );
    throw new LinkedInSearchBrowserFailure(
      "startup",
      "LinkedIn search browser could not start its contained session",
    );
  }
  let closed = false;
  let state: "ready" | "bound" = "ready";
  let boundKeywords: string | null = null;
  let advances = 0;

  const remainingTimeMs = (): number =>
    options.operationDeadline?.remainingTimeMs() ?? options.timeoutMs;

  const evalBatch = async (
    source: string,
    extra: readonly (readonly [string, ...string[]])[] = [],
  ): Promise<Readonly<Record<string, unknown>>> => {
    let records: readonly Readonly<Record<string, unknown>>[];
    try {
      records = await session.runBatch(
        [["eval", source], ...extra],
        remainingTimeMs(),
        Math.min(browserOutputBytes, options.maxOutputBytes + BROWSER_ENVELOPE_BYTES),
      );
    } catch (error) {
      if (error instanceof PreservedBrowserArtifactsError) throw error;
      if (error instanceof LinkedInSearchBrowserFailure) throw error;
      options.operationDeadline?.throwIfUnavailable(
        "LinkedIn search browser operation",
      );
      if (hasNoDefaultExecutionContext(error)) {
        throw new LinkedInSearchBrowserFailure(
          "execution-context",
          "LinkedIn search browser lost its reviewed execution context",
        );
      }
      if (hasUnexpectedLinkedInOrigin(error)) {
        throw new LinkedInSearchBrowserFailure(
          "bootstrap",
          "LinkedIn search browser was not on its reviewed signed-in origin",
        );
      }
      throw classifiedBrowserCommandFailure(error);
    }
    const first = records[0];
    if (first === undefined) {
      throw new LinkedInSearchBrowserFailure(
        "response-envelope",
        "LinkedIn search browser omitted its response",
      );
    }
    return browserEvaluationResult(first);
  };

  const snapshot = async (): Promise<Readonly<Record<string, unknown>>> => {
    if (boundKeywords === null) {
      throw new LinkedInSearchBrowserFailure(
        "pager",
        "LinkedIn search snapshot ran before its query bound",
      );
    }
    const result = await evalBatch(linkedInSearchCardSource(boundKeywords));
    exactKeys(result, ["cards", "searchId", "nextPageRequest"], "LinkedIn search snapshot");
    if (!Array.isArray(result.cards) || result.cards.length > 100) {
      throw new LinkedInSearchBrowserFailure(
        "response-envelope",
        "LinkedIn search browser returned a malformed card list",
      );
    }
    return result;
  };

  return Object.freeze({
    openSearch: async (target: LinkedInSearchTarget) => {
      if (state !== "ready") {
        throw new Error("LinkedIn search browser navigation is out of order");
      }
      if (
        target.keywords.length < 1
        || target.keywords.length > LINKEDIN_SEARCH_MAX_KEYWORDS
        || !target.searchUrl.startsWith(`${LINKEDIN_ORIGIN}${LINKEDIN_SEARCH_PATH}?`)
      ) throw new Error("LinkedIn search target escaped its exact reviewed route");
      const navigation = await evalBatch(
        searchNavigationSource(target),
        [["wait", `${SEARCH_NAVIGATION_WAIT_MS}`]],
      );
      exactKeys(navigation, ["navigated"], "LinkedIn search browser navigation");
      if (navigation.navigated !== true) {
        throw new LinkedInSearchBrowserFailure(
          "response-envelope",
          "LinkedIn search browser navigation changed shape",
        );
      }
      const currentUrlEntries = await session.runBatch(
        [["get", "url"]],
        Math.min(remainingTimeMs(), 10_000),
        1024 * 1024,
      );
      const currentUrl = currentUrlEntries[0];
      if (currentUrl === undefined) {
        throw new LinkedInSearchBrowserFailure(
          "browser-envelope",
          "LinkedIn search browser omitted its current URL",
        );
      }
      currentSearchUrl(browserResultData(currentUrl), target);
      boundKeywords = target.keywords;
      state = "bound";
      return snapshot();
    },
    advancePager: async () => {
      if (state !== "bound") {
        throw new Error("LinkedIn search browser pager is out of order");
      }
      if (advances >= SEARCH_MAX_PAGER_ADVANCES) {
        throw new LinkedInSearchBrowserFailure(
          "pager",
          "LinkedIn search browser exceeded its reviewed pager bound",
        );
      }
      advances += 1;
      const advance = await evalBatch(
        LINKEDIN_SEARCH_ADVANCE_SOURCE,
        [["wait", `${SEARCH_PAGER_WAIT_MS}`]],
      );
      exactKeys(advance, ["advanced", "items"], "LinkedIn search pager");
      if (typeof advance.advanced !== "boolean" || !Number.isSafeInteger(advance.items)) {
        throw new LinkedInSearchBrowserFailure(
          "pager",
          "LinkedIn search pager returned a malformed advance",
        );
      }
      return snapshot();
    },
    close: async () => {
      if (closed) return;
      closed = true;
      await finalizeBrowserSession(session);
    },
  });
}

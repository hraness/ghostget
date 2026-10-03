import type { GhostgetAuth } from "../auth";
import {
  PreservedBrowserArtifactsError,
  browserResultData,
  createBrowserSession,
  type BrowserSession,
  type CreateBrowserSessionOptions,
} from "../browser";
import type { GhostgetManifest } from "../model";
import { canonicalJsonScriptLiteral } from "../canonical-json";
import { hasExactKeys } from "../contracts-shape.js";
import type {
  WebSessionCleanupResourcePublisher,
  WebSessionOperationDeadline,
} from "../web-session-execution";
import {
  LINKEDIN_COMMENT_CREATE_PATH,
  LINKEDIN_COMMENT_DECORATION_ID,
  LINKEDIN_COMMENTS_OBSERVED_QUERY_ID,
  LINKEDIN_COMMENTS_QUERY_PREFIX,
  linkedInCommentPostUrn,
  linkedInCommentsReadPath,
  linkedInCreatedCommentThreadUrn,
  linkedInCreatedCommentUrn,
  resolveLinkedInRegisteredQueryId,
} from "./linkedin-web";
import {
  browserEvaluationResult,
  commonEvaluationPrelude,
  linkedInPostPageBindings,
  type LinkedInPostPageBindings,
} from "./linkedin-web-post-browser";

const LINKEDIN_ORIGIN = "https://www.linkedin.com";
const LINKEDIN_FEED_URL = `${LINKEDIN_ORIGIN}/feed/`;
const MAX_BROWSER_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_CREATE_RESPONSE_CHARACTERS = 65_536;

const commentBrowserManifest: GhostgetManifest = Object.freeze({
  schemaVersion: 4,
  id: "linkedin-comment-runtime",
  version: "1.0.0",
  displayName: "LinkedIn native comment runtime",
  surfaceId: "linkedin",
  origins: Object.freeze([LINKEDIN_ORIGIN]),
  browserDomains: Object.freeze(["www.linkedin.com"]),
  operations: Object.freeze({}),
});

export type LinkedInCommentDispatchKind = "comment" | "reply";

export type LinkedInCommentDispatch = Readonly<{
  readonly kind: LinkedInCommentDispatchKind;
  readonly body: Readonly<Record<string, unknown>>;
  readonly postUrn: string;
}>;

export type LinkedInCommentCreateResult = Readonly<{
  readonly status: number;
  readonly commentUrn: string | null;
  readonly entityConfirmed: boolean;
}>;

export type LinkedInCommentsReadRequest = Readonly<{
  readonly postUrn: string;
  readonly queryId: string;
  readonly count: number;
  readonly numReplies: number;
  readonly start: number;
  readonly maxComments: number;
}>;

export type LinkedInCommentBrowserTransport = {
  readonly currentIdentityResponse: () => Promise<unknown>;
  readonly createComment: (
    expectedSubject: string,
    expectedProfileUrn: string,
    dispatch: LinkedInCommentDispatch,
  ) => Promise<LinkedInCommentCreateResult>;
  readonly readComments: (
    expectedSubject: string,
    expectedProfileUrn: string,
    read: LinkedInCommentsReadRequest,
  ) => Promise<unknown>;
  readonly close: () => Promise<void>;
};

export type LinkedInCommentBrowserDependencies = {
  readonly createBrowserSession: typeof createBrowserSession;
};

export type LinkedInCommentCreateFailureStage =
  | "comment create current-member binding"
  | "comment create response envelope"
  | "comment create response";

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

function linkedInCommentCreateFailureStage(error: unknown): LinkedInCommentCreateFailureStage {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("LinkedIn current member")) return "comment create current-member binding";
  if (message.includes("LinkedIn comment create result")) return "comment create response envelope";
  return "comment create response";
}

export class LinkedInCommentCreateResponseError extends Error {
  readonly stage: LinkedInCommentCreateFailureStage;

  constructor(cause: unknown) {
    super("LinkedIn comment create response failed strict binding", { cause });
    this.name = "LinkedInCommentCreateResponseError";
    this.stage = linkedInCommentCreateFailureStage(cause);
  }
}

function pemMetadata(kind: LinkedInCommentDispatchKind): string {
  return kind === "reply"
    ? "Voyager - Feed - Comments=create-a-comment-reply"
    : "Voyager - Feed - Comments=create-a-comment";
}

function identityEvaluationSource(): string {
  const input = Object.freeze({});
  return `(async()=>{${commonEvaluationPrelude(input)}const body=await identity();return{body,contentType:"application/vnd.linkedin.normalized+json+2.1",status:200}})()`;
}

function commentsNavigationSource(vanity: string): string {
  const input = Object.freeze({
    activityUrl: `${LINKEDIN_ORIGIN}/in/${vanity}/recent-activity/all/`,
  });
  return `(async()=>{const input=${canonicalJsonScriptLiteral(input)};if(location.origin!=="${LINKEDIN_ORIGIN}")throw new Error("unexpected LinkedIn origin");location.href=input.activityUrl;return{navigated:true}})()`;
}

function commentsTriggerSource(): string {
  return `(async()=>{if(location.origin!=="${LINKEDIN_ORIGIN}")throw new Error("unexpected LinkedIn origin");const buttons=[...document.querySelectorAll("button")];const target=buttons.find((button)=>{const label=(button.getAttribute("aria-label")||button.textContent||"").trim();return/^[0-9]{1,6} comments? on /iu.test(label)});if(target===undefined)return{clicked:false};target.scrollIntoView({block:"center"});target.click();return{clicked:true}})()`;
}

function commentCreateEvaluationSource(
  bindings: LinkedInPostPageBindings,
  expectedSubject: string,
  expectedProfileUrn: string,
  dispatch: LinkedInCommentDispatch,
  referrer: string,
): string {
  const input = Object.freeze({
    body: dispatch.body,
    createPath:
      `${LINKEDIN_COMMENT_CREATE_PATH}?decorationId=${encodeURIComponent(LINKEDIN_COMMENT_DECORATION_ID)}`,
    expectedProfileUrn,
    expectedSubject,
    pageInstance: bindings.pageInstance,
    pemMetadata: pemMetadata(dispatch.kind),
    referrer,
    track: bindings.track,
  });
  return `(async()=>{${commonEvaluationPrelude(input)}const firstIdentity=await identity();assertIdentity(firstIdentity);const mutationHeaders={...baseHeaders,"content-type":"application/json; charset=UTF-8","x-li-deco-include-micro-schema":"true","x-li-page-instance":input.pageInstance,"x-li-pem-metadata":input.pemMetadata,"x-li-track":input.track};delete mutationHeaders["x-requested-with"];const response=await fetch(input.createPath,{body:JSON.stringify(input.body),credentials:"include",headers:mutationHeaders,method:"POST",redirect:"error",referrer:input.referrer});const text=await response.text();return{contentType:(response.headers.get("content-type")||"").split(";",1)[0].trim().toLowerCase(),restliId:response.headers.get("x-restli-id"),status:response.status,text:text.slice(0,${MAX_CREATE_RESPONSE_CHARACTERS})}})()`;
}

function commentReadEvaluationSource(
  bindings: LinkedInPostPageBindings,
  queryId: string,
  expectedSubject: string,
  expectedProfileUrn: string,
  read: LinkedInCommentsReadRequest,
  referrer: string,
): string {
  const input = Object.freeze({
    expectedProfileUrn,
    expectedSubject,
    maxComments: read.maxComments,
    pageInstance: bindings.pageInstance,
    readPath: linkedInCommentsReadPath(read.postUrn, queryId, {
      count: read.count,
      numReplies: read.numReplies,
      start: read.start,
    }),
    referrer,
    track: bindings.track,
  });
  return `(async()=>{${commonEvaluationPrelude(input)}const firstIdentity=await identity();assertIdentity(firstIdentity);const readHeaders={...baseHeaders,"x-li-page-instance":input.pageInstance,"x-li-pem-metadata":"Voyager - Feed - Comments=load-comments","x-li-track":input.track};delete readHeaders["x-requested-with"];const body=await requestJson(input.readPath,{headers:readHeaders,method:"GET",referrer:input.referrer},"LinkedIn comments read");const comments=[];const seen=new Set();let nodes=0;const visit=(v,d)=>{if(v===null||typeof v!=="object"||d>24||nodes>60000||comments.length>=input.maxComments*4)return;nodes+=1;if(Array.isArray(v)){for(const item of v)visit(item,d+1);return}let own=null;for(const k of["entityUrn","commentUrn","urn","backendUrn","objectUrn"]){const c=v[k];if(typeof c==="string"&&/^urn:li:(?:fsd_)?comment:\\(/.test(c)&&c.length<=512){own=c;break}}if(own===null){for(const val of Object.values(v))visit(val,d+1);return}const urns=[];const collect=(x,dd)=>{if(x===null||typeof x!=="object"||dd>10||urns.length>=64)return;if(Array.isArray(x)){for(const i of x)collect(i,dd+1);return}for(const val of Object.values(x)){if(typeof val==="string"&&/^urn:li:/.test(val)&&val.length<=512){if(!urns.includes(val))urns.push(val)}else collect(val,dd+1)}};collect(v,0);if(urns.length>=64||!urns.includes(own))return;let text=null;const c=v.commentary&&typeof v.commentary==="object"?v.commentary:v;if(typeof c.text==="string")text=c.text;else if(c.attributedText&&typeof c.attributedText==="object"&&typeof c.attributedText.text==="string")text=c.attributedText.text;else if(v.text&&typeof v.text==="object"&&typeof v.text.text==="string")text=v.text.text;const actor=urns.find((u)=>/^urn:li:(?:fsd_profile|fs_miniProfile|member):/.test(u))??null;if(!seen.has(own)){seen.add(own);comments.push({actorUrn:actor,text,urn:own,urns})}for(const val of Object.values(v))visit(val,d+1)};visit(body,0);return{comments}})()`;
}

const LINKEDIN_MEMBER_VANITY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{1,99}$/u;

function linkedInMemberVanity(body: unknown, expectedProfileUrn: string): string {
  const miniUrn = `urn:li:fs_miniProfile:${expectedProfileUrn.slice("urn:li:fsd_profile:".length)}`;
  const candidates: string[] = [];
  const visit = (value: unknown, depth: number): void => {
    if (value === null || typeof value !== "object" || depth > 8 || candidates.length > 4) {
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    const entity = value as Readonly<Record<string, unknown>>;
    if (entity.entityUrn === miniUrn || entity.objectUrn === miniUrn) {
      const candidate = entity.publicIdentifier;
      if (typeof candidate === "string") candidates.push(candidate);
    }
    for (const item of Object.values(entity)) visit(item, depth + 1);
  };
  visit(body, 0);
  const unique = [...new Set(candidates)].filter((candidate) =>
    LINKEDIN_MEMBER_VANITY_PATTERN.test(candidate)
  );
  if (unique.length === 0) {
    throw new Error("LinkedIn current member omitted its profile identifier");
  }
  if (unique.length !== 1) {
    throw new Error("LinkedIn current member profile identifier is ambiguous");
  }
  return unique[0]!;
}

function linkedInCommentsReadDonor(
  value: unknown,
  fallbackQueryId: string,
  activityUrl: string,
): Readonly<{ pageInstance: string; queryId: string; referrer: string; track: string }> {
  const candidates: string[] = [];
  let donor: LinkedInPostPageBindings | null = null;
  if (isRecord(value) && Array.isArray(value.requests)) {
    for (const item of value.requests) {
      if (!isRecord(item) || !isRecord(item.headers)) continue;
      if (
        item.method !== "GET"
        || item.status !== 200
        || typeof item.url !== "string"
        || item.url.length > 64 * 1024
      ) continue;
      let url: URL;
      try {
        url = new URL(item.url);
      } catch {
        continue;
      }
      if (url.origin !== LINKEDIN_ORIGIN || url.pathname !== "/voyager/api/graphql") continue;
      const queryId = url.searchParams.get("queryId");
      if (
        queryId === null
        || !queryId.startsWith(`${LINKEDIN_COMMENTS_QUERY_PREFIX}.`)
      ) continue;
      candidates.push(queryId);
      const pageInstance = item.headers["x-li-page-instance"];
      const track = item.headers["x-li-track"];
      if (typeof pageInstance === "string" && typeof track === "string") {
        donor = Object.freeze({ pageInstance, track });
      }
    }
  }
  const queryId = resolveLinkedInRegisteredQueryId(
    LINKEDIN_COMMENTS_QUERY_PREFIX,
    candidates.length > 0 ? candidates : [fallbackQueryId],
  );
  const bindings = donor ?? linkedInPostPageBindings(value);
  return Object.freeze({
    pageInstance: bindings.pageInstance,
    queryId,
    referrer: activityUrl,
    track: bindings.track,
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
    "LinkedIn comment browser finalization failed; private artifacts were preserved",
    session.recoveryHandle ?? "session=linkedin-comment-runtime;artifacts=unknown",
    new AggregateError(failures, "LinkedIn comment browser finalization failed"),
    cleanupEvidence,
  );
}

export async function createLinkedInCommentBrowserTransport(
  auth: GhostgetAuth,
  options: {
    readonly timeoutMs: number;
    readonly operationDeadline?: WebSessionOperationDeadline;
    readonly publishCleanupResource?: WebSessionCleanupResourcePublisher;
    readonly dependencies?: Partial<LinkedInCommentBrowserDependencies>;
  },
): Promise<LinkedInCommentBrowserTransport> {
  const createSession = options.dependencies?.createBrowserSession ?? createBrowserSession;
  const sessionOptions: CreateBrowserSessionOptions = {
    allowCodeOwnedEvaluation: true,
    allowCodeOwnedNetworkObservation: true,
    headed: true,
    maxOutputBytes: MAX_BROWSER_OUTPUT_BYTES,
    timeoutMs: options.timeoutMs,
    ...(options.operationDeadline === undefined
      ? {}
      : { operationDeadline: options.operationDeadline }),
    ...(options.publishCleanupResource === undefined
      ? {}
      : { publishCleanupResource: options.publishCleanupResource }),
  };
  const session = await createSession(commentBrowserManifest, auth, sessionOptions);
  let closed = false;
  const remaining = (): number => options.operationDeadline?.remainingTimeMs() ?? options.timeoutMs;
  const run = async (source: string): Promise<Readonly<Record<string, unknown>>> => {
    if (closed) throw new Error("LinkedIn comment browser transport is closed");
    const records = await session.runBatch(
      [["eval", source]],
      remaining(),
      MAX_BROWSER_OUTPUT_BYTES,
    );
    const first = records[0];
    if (first === undefined) throw new Error("LinkedIn comment browser omitted its response");
    return browserEvaluationResult(first);
  };

  try {
    await session.runBatch(
      [["open", LINKEDIN_FEED_URL], ["wait", "5000"]],
      remaining(),
      MAX_BROWSER_OUTPUT_BYTES,
    );
  } catch (error) {
    try {
      await finalizeBrowserSession(session);
    } catch (cleanupError) {
      throw cleanupError;
    }
    throw error;
  }

  let lastIdentityBody: unknown;
  let commentsContext: Readonly<{
    pageInstance: string;
    queryId: string;
    referrer: string;
    track: string;
  }> | null = null;
  const ensureCommentsContext = async (
    expectedProfileUrn: string,
    fallbackQueryId: string,
  ): Promise<Readonly<{
    pageInstance: string;
    queryId: string;
    referrer: string;
    track: string;
  }>> => {
    if (closed) throw new Error("LinkedIn comment browser transport is closed");
    if (commentsContext !== null) return commentsContext;
    const vanity = linkedInMemberVanity(lastIdentityBody, expectedProfileUrn);
    const activityUrl = `${LINKEDIN_ORIGIN}/in/${vanity}/recent-activity/all/`;
    const navigation = await session.runBatch(
      [
        ["eval", commentsNavigationSource(vanity)],
        ["wait", "9000"],
      ],
      Math.min(remaining(), 60_000),
      MAX_BROWSER_OUTPUT_BYTES,
    );
    const navigationResult = navigation[0];
    if (navigationResult === undefined) {
      throw new Error("LinkedIn comments navigation omitted its response");
    }
    const navigated = browserEvaluationResult(navigationResult);
    exactKeys(navigated, ["navigated"], "LinkedIn comments navigation");
    const preTrigger = await session.runBatch(
      [["network", "requests", "--filter", "/voyager/api/"]],
      Math.min(remaining(), 30_000),
      MAX_BROWSER_OUTPUT_BYTES,
    );
    const preTriggerFirst = preTrigger[0];
    if (preTriggerFirst === undefined) {
      throw new Error("LinkedIn comments pre-trigger observation omitted its response");
    }
    const preTriggerRequests = browserResultData(preTriggerFirst);
    const beforeCount =
      isRecord(preTriggerRequests) && Array.isArray(preTriggerRequests.requests)
        ? preTriggerRequests.requests.length
        : 0;
    const trigger = await session.runBatch(
      [
        ["eval", commentsTriggerSource()],
        ["wait", "5000"],
      ],
      Math.min(remaining(), 45_000),
      MAX_BROWSER_OUTPUT_BYTES,
    );
    const triggerResult = trigger[0];
    if (triggerResult === undefined) {
      throw new Error("LinkedIn comments trigger omitted its response");
    }
    const triggered = browserEvaluationResult(triggerResult);
    exactKeys(triggered, ["clicked"], "LinkedIn comments trigger");
    if (triggered.clicked !== true) {
      throw new Error("LinkedIn comments trigger found no reviewed comments control");
    }
    const observed = await session.runBatch(
      [["network", "requests", "--filter", "/voyager/api/"]],
      Math.min(remaining(), 30_000),
      MAX_BROWSER_OUTPUT_BYTES,
    );
    const first = observed[0];
    if (first === undefined) {
      throw new Error("LinkedIn comments observation omitted its response");
    }
    const observedRequests = browserResultData(first);
    const freshRequests =
      isRecord(observedRequests) && Array.isArray(observedRequests.requests)
        ? Object.freeze({
            requests: observedRequests.requests.slice(
              Math.min(beforeCount, observedRequests.requests.length),
            ),
          })
        : observedRequests;
    const donor = linkedInCommentsReadDonor(
      freshRequests,
      fallbackQueryId,
      activityUrl,
    );
    commentsContext = donor;
    return commentsContext;
  };

  return Object.freeze({
    currentIdentityResponse: async () => {
      const result = await run(identityEvaluationSource());
      exactKeys(result, ["body", "contentType", "status"], "LinkedIn current-member browser request");
      if (result.status !== 200) {
        throw new Error("LinkedIn current-member browser request returned an unreviewed response");
      }
      lastIdentityBody = result.body;
      return result.body;
    },
    createComment: async (
      expectedSubject: string,
      expectedProfileUrn: string,
      dispatch: LinkedInCommentDispatch,
    ) => {
      const postUrn = linkedInCommentPostUrn(dispatch.postUrn);
      let result: Readonly<Record<string, unknown>>;
      const context = await ensureCommentsContext(
        expectedProfileUrn,
        LINKEDIN_COMMENTS_OBSERVED_QUERY_ID,
      );
      try {
        result = await run(commentCreateEvaluationSource(
          Object.freeze({
            pageInstance: context.pageInstance,
            track: context.track,
          }),
          expectedSubject,
          expectedProfileUrn,
          Object.freeze({ ...dispatch, postUrn }),
          context.referrer,
        ));
      } catch (error) {
        throw new LinkedInCommentCreateResponseError(error);
      }
      exactKeys(
        result,
        ["contentType", "restliId", "status", "text"],
        "LinkedIn comment create result",
      );
      if (
        !Number.isSafeInteger(result.status)
        || (result.status as number) < 100
        || (result.status as number) > 599
      ) throw new Error("LinkedIn comment create result omitted a valid status");
      let commentUrn: string | null = null;
      if (result.restliId !== null) {
        const candidate = linkedInCreatedCommentUrn(result.restliId);
        if (linkedInCreatedCommentThreadUrn(candidate) !== postUrn) {
          throw new Error("LinkedIn comment create returned a mismatched thread binding");
        }
        commentUrn = candidate;
      }
      let entityConfirmed = false;
      if (
        result.status === 201
        && typeof result.text === "string"
        && result.contentType === "application/vnd.linkedin.normalized+json+2.1"
      ) {
        let body: unknown;
        try {
          body = JSON.parse(result.text) as unknown;
        } catch {
          throw new Error("LinkedIn comment create returned a malformed body");
        }
        if (isRecord(body) && isRecord(body.data) && typeof body.data.entityUrn === "string") {
          entityConfirmed =
            body.data.entityUrn === `urn:li:fsd_normComment:${commentUrn}`;
        }
      }
      return Object.freeze({
        commentUrn,
        entityConfirmed,
        status: result.status as number,
      });
    },
    readComments: async (
      expectedSubject: string,
      expectedProfileUrn: string,
      read: LinkedInCommentsReadRequest,
    ) => {
      if (
        !Number.isSafeInteger(read.maxComments)
        || read.maxComments < 1
        || read.maxComments > 100
      ) throw new Error("LinkedIn comments read bound is outside the reviewed contract");
      const context = await ensureCommentsContext(expectedProfileUrn, read.queryId);
      const result = await run(commentReadEvaluationSource(
        context,
        context.queryId,
        expectedSubject,
        expectedProfileUrn,
        Object.freeze({
          ...read,
          postUrn: linkedInCommentPostUrn(read.postUrn),
        }),
        context.referrer,
      ));
      exactKeys(result, ["comments"], "LinkedIn comments read result");
      return result;
    },
    close: async () => {
      if (closed) return;
      closed = true;
      await finalizeBrowserSession(session);
    },
  });
}

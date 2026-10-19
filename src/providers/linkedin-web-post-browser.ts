import { randomUUID } from "node:crypto";

import type { GhostgetAuth } from "../auth";
import {
  PreservedBrowserArtifactsError,
  browserResultData,
  createBrowserSession,
  type BrowserSession,
  type CreateBrowserSessionOptions,
} from "../browser";
import { canonicalJsonScriptLiteral } from "../canonical-json";
import type { GhostgetManifest } from "../model";
import { hasExactKeys } from "../contracts-shape.js";
import type {
  WebSessionCleanupResourcePublisher,
  WebSessionOperationDeadline,
} from "../web-session-execution";
import {
  LINKEDIN_GRAPHQL_PATH,
  LINKEDIN_POST_CREATE_MUTATION_ID,
  linkedInPostEntityUrn,
  linkedInPostMediaUrn,
} from "./linkedin-web";

const LINKEDIN_ORIGIN = "https://www.linkedin.com";
const LINKEDIN_FEED_URL = `${LINKEDIN_ORIGIN}/feed/`;
const LINKEDIN_IMAGE_REGISTRATION_PATH =
  "/voyager/api/voyagerVideoDashMediaUploadMetadata?action=upload";
const LINKEDIN_IMAGE_FINALIZATION_PATH =
  "/voyager/api/voyagerVideoDashMediaUploadMetadata?action=completeMultipartUpload";
const MAX_BROWSER_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_BYTES = 64 * 1024 * 1024;
const MIN_VIDEO_BYTES = 75_000;
const IMAGE_STAGING_CHUNK_CHARACTERS = 48 * 1024;
const IMAGE_STAGING_COMMANDS_PER_BATCH = 32;
const MAX_IMAGE_STAGING_COMMAND_CHARACTERS = 64 * 1024;
const MAX_IMAGE_BASE64_CHARACTERS = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
const MAX_IMAGE_STAGING_CHUNKS = Math.ceil(
  MAX_IMAGE_BASE64_CHARACTERS / IMAGE_STAGING_CHUNK_CHARACTERS,
);
const MAX_VIDEO_BASE64_CHARACTERS = Math.ceil(MAX_VIDEO_BYTES / 3) * 4;
const MAX_VIDEO_STAGING_CHUNKS = Math.ceil(
  MAX_VIDEO_BASE64_CHARACTERS / IMAGE_STAGING_CHUNK_CHARACTERS,
);

/** Exact upload-shape constants bound to one reviewed LinkedIn media family. */
type LinkedInPostMediaSpec = {
  readonly label: "image" | "video";
  readonly stagingKeyPrefix: string;
  readonly minBytes: number;
  readonly maxBytes: number;
  readonly maxBase64Characters: number;
  readonly maxStagingChunks: number;
  readonly maxParts: number;
  readonly blobType: string;
  readonly filename: string;
  readonly uploadType: string;
  readonly pemMetadata: string;
  readonly urnFamilies: string;
  readonly vectorFamily: string;
};

const IMAGE_MEDIA_SPEC: LinkedInPostMediaSpec = Object.freeze({
  label: "image",
  stagingKeyPrefix: "__ghostgetLinkedInPostImage_",
  minBytes: 24,
  maxBytes: MAX_IMAGE_BYTES,
  maxBase64Characters: MAX_IMAGE_BASE64_CHARACTERS,
  maxStagingChunks: MAX_IMAGE_STAGING_CHUNKS,
  maxParts: 20,
  blobType: "image/png",
  filename: "image.png",
  uploadType: "IMAGE_SHARING",
  pemMetadata: "Voyager - Feed Images=register-vector-upload",
  urnFamilies: "digitalmediaAsset|fsd_image",
  vectorFamily: "STILLIMAGE",
});

const VIDEO_MEDIA_SPEC: LinkedInPostMediaSpec = Object.freeze({
  label: "video",
  stagingKeyPrefix: "__ghostgetLinkedInPostVideo_",
  minBytes: MIN_VIDEO_BYTES,
  maxBytes: MAX_VIDEO_BYTES,
  maxBase64Characters: MAX_VIDEO_BASE64_CHARACTERS,
  maxStagingChunks: MAX_VIDEO_STAGING_CHUNKS,
  maxParts: 64,
  blobType: "video/mp4",
  filename: "video.mp4",
  uploadType: "VIDEO_SHARING",
  pemMetadata: "Voyager - Feed Video=register-upload",
  urnFamilies: "digitalmediaAsset|fsd_video",
  vectorFamily: "VIDEO",
});

const postBrowserManifest: GhostgetManifest = Object.freeze({
  schemaVersion: 4,
  id: "linkedin-post-runtime",
  version: "1.0.0",
  displayName: "LinkedIn native post runtime",
  surfaceId: "linkedin",
  origins: Object.freeze([LINKEDIN_ORIGIN]),
  browserDomains: Object.freeze(["www.linkedin.com", "static.licdn.com"]),
  operations: Object.freeze({}),
});

export type LinkedInPostBrowserTransport = {
  readonly currentIdentityResponse: () => Promise<unknown>;
  readonly uploadImage: (
    expectedSubject: string,
    image: Uint8Array,
  ) => Promise<string>;
  readonly uploadVideo: (
    expectedSubject: string,
    video: Uint8Array,
  ) => Promise<string>;
  readonly createPost: (
    expectedSubject: string,
    expectedProfileUrn: string,
    variables: Readonly<Record<string, unknown>>,
    mediaUrn: string | null,
    mediaCategory?: "IMAGE" | "VIDEO",
  ) => Promise<string>;
  readonly readPost: (
    expectedSubject: string,
    expectedProfileUrn: string,
    variables: Readonly<Record<string, unknown>>,
    mediaUrn: string | null,
    entityUrn: string,
    mediaCategory?: "IMAGE" | "VIDEO",
  ) => Promise<unknown>;
  readonly close: () => Promise<void>;
};

export type LinkedInPostBrowserDependencies = {
  readonly createBrowserSession: typeof createBrowserSession;
};

export type LinkedInPostImageFailureStage =
  | "page image staging"
  | "image registration response"
  | "image transfer response"
  | "image finalization response"
  | "image registration or upload response";

function linkedInPostImageFailureStage(error: unknown): LinkedInPostImageFailureStage {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("LinkedIn image registration")) return "image registration response";
  if (message.includes("LinkedIn image finalization")) return "image finalization response";
  if (message.includes("LinkedIn image upload")) return "image transfer response";
  return "image registration or upload response";
}

/**
 * Secret-free stage evidence for the preparatory image path. The underlying
 * contained-browser failure remains attached as a cause and is never copied
 * into a public run receipt.
 */
export class LinkedInPostImagePreparationError extends Error {
  readonly stage: LinkedInPostImageFailureStage;

  constructor(stage: LinkedInPostImageFailureStage, cause: unknown) {
    super(`LinkedIn post image preparation failed during ${stage}`, { cause });
    this.name = "LinkedInPostImagePreparationError";
    this.stage = stage;
  }
}

export type LinkedInPostCreateFailureStage =
  | "post create current-member binding"
  | "post create status"
  | "post create content type"
  | "post create response shape"
  | "post create provider errors"
  | "post create entity direct nesting"
  | "post create entity alternate data nesting"
  | "post create normalized included entity"
  | "post create entity absent"
  | "post create entity URN"
  | "post create published lifecycle"
  | "post create response";

function linkedInPostCreateFailureStage(error: unknown): LinkedInPostCreateFailureStage {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("LinkedIn current member")) return "post create current-member binding";
  if (message.includes("LinkedIn post create status")) return "post create status";
  if (message.includes("LinkedIn post create content type")) return "post create content type";
  if (message.includes("LinkedIn GraphQL response changed shape")) return "post create response shape";
  if (message.includes("LinkedIn post create returned provider errors")) return "post create provider errors";
  if (message.includes("LinkedIn post create returned nested provider errors")) {
    return "post create provider errors";
  }
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

export class LinkedInPostCreateResponseError extends Error {
  readonly stage: LinkedInPostCreateFailureStage;

  constructor(cause: unknown) {
    super("LinkedIn post create response failed strict binding", { cause });
    this.name = "LinkedInPostCreateResponseError";
    this.stage = linkedInPostCreateFailureStage(cause);
  }
}

export type LinkedInPostPageBindings = {
  readonly pageInstance: string;
  readonly track: string;
};

const LINKEDIN_PAGE_INSTANCE_PATTERN =
  /^urn:li:page:d_flagship3_[A-Za-z0-9_:-]{1,128};[A-Za-z0-9+/=_-]{1,512}$/u;

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

function boundedHeader(value: unknown, label: string, maximum: number): string {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > maximum
    || /[\0\r\n]/u.test(value)
  ) throw new Error(`${label} changed its reviewed bound`);
  return value;
}

export function linkedInPostPageBindings(value: unknown): LinkedInPostPageBindings {
  if (!isRecord(value) || !Array.isArray(value.requests) || value.requests.length > 10_000) {
    throw new Error("LinkedIn post network observation changed shape");
  }
  let selected: LinkedInPostPageBindings | null = null;
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
    if (
      url.origin !== LINKEDIN_ORIGIN
      || url.username !== ""
      || url.password !== ""
      || !url.pathname.startsWith("/voyager/api/")
    ) continue;
    const pageInstance = item.headers["x-li-page-instance"];
    if (
      typeof pageInstance !== "string"
      || !LINKEDIN_PAGE_INSTANCE_PATTERN.test(pageInstance)
    ) continue;
    const track = boundedHeader(
      item.headers["x-li-track"],
      "LinkedIn post x-li-track binding",
      4_096,
    );
    let parsedTrack: unknown;
    try {
      parsedTrack = JSON.parse(track) as unknown;
    } catch {
      throw new Error("LinkedIn post x-li-track binding changed shape");
    }
    if (!isRecord(parsedTrack) || parsedTrack.mpName !== "voyager-web") {
      throw new Error("LinkedIn post x-li-track binding changed shape");
    }
    // The feed can rotate both tracking fields and its page-instance while it
    // settles. Network observations are ordered, so retain only the newest
    // fully validated same-origin request from this freshly opened page.
    selected = Object.freeze({ pageInstance, track });
  }
  if (selected === null) {
    throw new Error("LinkedIn post page omitted its bounded page-instance binding");
  }
  return selected;
}

export function browserEvaluationResult(
  record: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const data = browserResultData(record as Record<string, unknown>);
  if (!isRecord(data) || typeof data.origin !== "string" || !isRecord(data.result)) {
    throw new Error("LinkedIn post browser returned a malformed evaluation envelope");
  }
  let origin: URL;
  try {
    origin = new URL(data.origin);
  } catch {
    throw new Error("LinkedIn post browser returned a malformed evaluation envelope");
  }
  if (origin.origin !== LINKEDIN_ORIGIN || origin.username !== "" || origin.password !== "") {
    throw new Error("LinkedIn post browser returned a malformed evaluation envelope");
  }
  return data.result;
}

export function commonEvaluationPrelude(input: Readonly<Record<string, unknown>>): string {
  return `const input=${canonicalJsonScriptLiteral(input)};if(location.origin!=="${LINKEDIN_ORIGIN}")throw new Error("unexpected LinkedIn origin");const raw=document.cookie.split("; ").find((part)=>part.startsWith("JSESSIONID="));if(typeof raw!=="string")throw new Error("missing LinkedIn browser CSRF cookie");const csrf=decodeURIComponent(raw.slice("JSESSIONID=".length)).replace(/^\"|\"$/g,"");if(!/^ajax:[A-Za-z0-9_-]{1,512}$/.test(csrf))throw new Error("invalid LinkedIn browser CSRF cookie");const baseHeaders={accept:"application/vnd.linkedin.normalized+json+2.1","csrf-token":csrf,"x-li-lang":"en_US","x-requested-with":"XMLHttpRequest","x-restli-protocol-version":"2.0.0"};const jsonTypes=new Set(["application/graphql","application/json","application/vnd.linkedin.normalized+json+2.1"]);const jsonResponse=async(response,label)=>{const contentType=(response.headers.get("content-type")||"").split(";",1)[0].trim().toLowerCase();if(!jsonTypes.has(contentType))throw new Error(label+" content type changed: status="+response.status+" ct="+contentType);if(response.status<200||response.status>=300)throw new Error(label+" status changed");return response.json()};const requestJson=async(path,init,label)=>jsonResponse(await fetch(path,{credentials:"include",redirect:"error",referrer:"${LINKEDIN_FEED_URL}",...init}),label);const identity=async()=>requestJson("/voyager/api/me",{headers:baseHeaders,method:"GET"},"LinkedIn current member");const assertIdentity=(body)=>{if(!body||typeof body!=="object"||Array.isArray(body)||!body.data||typeof body.data!=="object"||Array.isArray(body.data))throw new Error("LinkedIn current member changed shape");const plain=typeof body.data.plainId==="string"?body.data.plainId:Number.isSafeInteger(body.data.plainId)?String(body.data.plainId):"";if("urn:li:fsd_profile:"+plain!==input.expectedSubject)throw new Error("LinkedIn current member changed before dispatch");if(input.expectedProfileUrn!==undefined){const mini=body.data["*miniProfile"]??body.data.miniProfile;const suffix=typeof mini==="string"?/^urn:li:fs_miniProfile:([A-Za-z0-9_-]{1,256})$/.exec(mini)?.[1]:undefined;if("urn:li:fsd_profile:"+suffix!==input.expectedProfileUrn)throw new Error("LinkedIn current profile changed before dispatch")}};`;
}

function identityEvaluationSource(): string {
  const input = Object.freeze({});
  return `(async()=>{${commonEvaluationPrelude(input)}const body=await identity();return{body,contentType:"application/vnd.linkedin.normalized+json+2.1",status:200}})()`;
}

type LinkedInPostImageStaging = {
  readonly key: string;
  readonly byteLength: number;
  readonly base64Length: number;
  readonly chunkCount: number;
};

function imageStagingInitializationSource(
  staging: LinkedInPostImageStaging,
  spec: LinkedInPostMediaSpec,
): string {
  const input = Object.freeze({
    stagingKey: staging.key,
    expectedChunkCount: staging.chunkCount,
  });
  return `(async()=>{const input=${canonicalJsonScriptLiteral(input)};if(location.origin!=="${LINKEDIN_ORIGIN}")throw new Error("unexpected LinkedIn origin");if(!/^${spec.stagingKeyPrefix}[a-f0-9]{32}$/.test(input.stagingKey)||!Number.isSafeInteger(input.expectedChunkCount)||input.expectedChunkCount<1||input.expectedChunkCount>${spec.maxStagingChunks})throw new Error("LinkedIn ${spec.label} staging input changed shape");if(Object.hasOwn(globalThis,input.stagingKey))throw new Error("LinkedIn ${spec.label} staging key collision");Object.defineProperty(globalThis,input.stagingKey,{configurable:true,enumerable:false,value:[],writable:false});return{ready:true}})()`;
}

function imageStagingChunkSource(
  staging: LinkedInPostImageStaging,
  index: number,
  chunk: string,
  spec: LinkedInPostMediaSpec,
): string {
  const input = Object.freeze({
    chunk,
    expectedChunkCount: staging.chunkCount,
    index,
    stagingKey: staging.key,
  });
  const source = `(async()=>{const input=${canonicalJsonScriptLiteral(input)};if(location.origin!=="${LINKEDIN_ORIGIN}")throw new Error("unexpected LinkedIn origin");const chunks=globalThis[input.stagingKey];if(!Array.isArray(chunks)||!Number.isSafeInteger(input.index)||input.index<0||input.index>=input.expectedChunkCount||input.expectedChunkCount<1||input.expectedChunkCount>${spec.maxStagingChunks}||chunks.length!==input.index)throw new Error("LinkedIn ${spec.label} staging order changed");if(typeof input.chunk!=="string"||input.chunk.length<1||input.chunk.length>${IMAGE_STAGING_CHUNK_CHARACTERS}||!/^[A-Za-z0-9+/]*={0,2}$/.test(input.chunk))throw new Error("LinkedIn ${spec.label} staging chunk changed shape");chunks.push(input.chunk);return{staged:chunks.length}})()`;
  if (source.length > MAX_IMAGE_STAGING_COMMAND_CHARACTERS) {
    throw new Error("LinkedIn media staging command exceeded its reviewed bound");
  }
  return source;
}

function imageStagingCleanupSource(stagingKey: string): string {
  const input = Object.freeze({ stagingKey });
  return `(async()=>{const input=${canonicalJsonScriptLiteral(input)};if(location.origin!=="${LINKEDIN_ORIGIN}")throw new Error("unexpected LinkedIn origin");const removed=Object.hasOwn(globalThis,input.stagingKey);delete globalThis[input.stagingKey];return{removed}})()`;
}

function baseUploadEvaluationSource(
  bindings: LinkedInPostPageBindings,
  expectedSubject: string,
  staging: LinkedInPostImageStaging,
  spec: LinkedInPostMediaSpec,
): string {
  if (
    staging.byteLength < spec.minBytes
    || staging.byteLength > spec.maxBytes
    || staging.base64Length < 32
    || staging.base64Length > spec.maxBase64Characters
    || staging.chunkCount < 1
    || staging.chunkCount > spec.maxStagingChunks
  ) {
    throw new Error(`LinkedIn post ${spec.label} is outside the reviewed byte bound`);
  }
  const input = Object.freeze({
    expectedSubject,
    expectedBase64Length: staging.base64Length,
    expectedByteLength: staging.byteLength,
    expectedChunkCount: staging.chunkCount,
    pageInstance: bindings.pageInstance,
    stagingKey: staging.key,
    track: bindings.track,
  });
  return `(async()=>{${commonEvaluationPrelude(input)}const chunks=globalThis[input.stagingKey];if(!Array.isArray(chunks)||chunks.length!==input.expectedChunkCount||chunks.length<1||chunks.length>${spec.maxStagingChunks})throw new Error("missing bounded LinkedIn ${spec.label} bytes");delete globalThis[input.stagingKey];if(Object.hasOwn(globalThis,input.stagingKey))throw new Error("LinkedIn ${spec.label} staging cleanup failed");let encoded="";for(let index=0;index<chunks.length;index+=1){const chunk=chunks[index];if(typeof chunk!=="string"||chunk.length<1||chunk.length>${IMAGE_STAGING_CHUNK_CHARACTERS}||!/^[A-Za-z0-9+/]*={0,2}$/.test(chunk))throw new Error("invalid LinkedIn ${spec.label} bytes");encoded+=chunk;chunks[index]=""}if(encoded.length!==input.expectedBase64Length||encoded.length>${spec.maxBase64Characters})throw new Error("LinkedIn ${spec.label} changed encoded size");const binary=atob(encoded);encoded="";if(binary.length!==input.expectedByteLength||binary.length<${spec.minBytes}||binary.length>${spec.maxBytes})throw new Error("LinkedIn ${spec.label} changed size");const bytes=new Uint8Array(binary.length);for(let index=0;index<binary.length;index+=1)bytes[index]=binary.charCodeAt(index);const firstIdentity=await identity();assertIdentity(firstIdentity);const media=new Blob([bytes],{type:"${spec.blobType}"});const mutationHeaders={...baseHeaders,"content-type":"application/json; charset=UTF-8","x-li-page-instance":input.pageInstance,"x-li-pem-metadata":"${spec.pemMetadata}","x-li-track":input.track};const registrationBody=await requestJson("${LINKEDIN_IMAGE_REGISTRATION_PATH}",{body:JSON.stringify({fileSize:media.size,filename:"${spec.filename}",mediaUploadType:"${spec.uploadType}"}),headers:mutationHeaders,method:"POST"},"LinkedIn ${spec.label} registration");const registrationEnvelope=registrationBody&&typeof registrationBody==="object"&&!Array.isArray(registrationBody)?registrationBody:null;if(registrationEnvelope===null)throw new Error("LinkedIn ${spec.label} registration changed shape");const registration=registrationEnvelope.data&&typeof registrationEnvelope.data==="object"&&!Array.isArray(registrationEnvelope.data)&&registrationEnvelope.data.value!==undefined?registrationEnvelope.data.value:registrationEnvelope.value!==undefined?registrationEnvelope.value:null;if(!registration||typeof registration!=="object"||Array.isArray(registration))throw new Error("LinkedIn ${spec.label} registration omitted its value");const allowedKeys=new Set(["mediaArtifactUrn","multipartMetadata","partUploadRequests","recipes","singleUploadHeaders","singleUploadUrl","type","urn"]);for(const key of Object.keys(registration))if(!allowedKeys.has(key))throw new Error("LinkedIn ${spec.label} registration returned an unreviewed field");if(!/^urn:li:(?:${spec.urnFamilies}):[A-Za-z0-9_(),.:%=-]{1,448}$/.test(registration.urn||""))throw new Error("LinkedIn ${spec.label} registration omitted its media URN");if(typeof registration.mediaArtifactUrn!=="string"||registration.mediaArtifactUrn.length<1||registration.mediaArtifactUrn.length>1024)throw new Error("LinkedIn ${spec.label} registration omitted its artifact URN");const checkedUrl=(value)=>{if(typeof value!=="string"||value.length<1||value.length>16384)throw new Error("LinkedIn ${spec.label} upload target changed shape");const url=new URL(value);if(url.protocol!=="https:"||url.username!==""||url.password!==""||url.hash!==""||url.port!==""||!(url.hostname==="linkedin.com"||url.hostname.endsWith(".linkedin.com")||url.hostname==="licdn.com"||url.hostname.endsWith(".licdn.com")))throw new Error("LinkedIn ${spec.label} upload target escaped its reviewed host family");return url};const checkedHeaders=(value,formData)=>{if(value===undefined)return {"csrf-token":csrf};if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).length>32)throw new Error("LinkedIn ${spec.label} upload headers changed shape");const output={};for(const [name,headerValue] of Object.entries(value)){const lower=name.toLowerCase();if(!/^[a-z0-9!#$%&'*+.^_|~-]{1,128}$/.test(lower)||typeof headerValue!=="string"||headerValue.length>8192||/[\\0\\r\\n]/.test(headerValue)||["cookie","host","content-length","origin","referer"].includes(lower)||lower.startsWith("sec-"))throw new Error("LinkedIn ${spec.label} upload headers changed shape");if(formData&&lower==="content-type")continue;output[lower]=headerValue}output["csrf-token"]=csrf;return output};const upload=async(urlValue,body,headers,formData)=>{const url=checkedUrl(urlValue);const response=await fetch(url.href,{body,credentials:url.origin===location.origin?"include":"omit",headers:checkedHeaders(headers,formData),method:"PUT",redirect:"error",referrer:"${LINKEDIN_FEED_URL}"});if(response.status<200||response.status>=300)throw new Error("LinkedIn ${spec.label} upload status changed");return{headers:Object.fromEntries(response.headers.entries()),httpStatusCode:response.status}};if(registration.type==="SINGLE"||registration.type==="MULTIPART_FORMDATA"){if(registration.partUploadRequests!==undefined||registration.multipartMetadata!==undefined)throw new Error("LinkedIn single ${spec.label} upload returned multipart fields");await upload(registration.singleUploadUrl,media,registration.singleUploadHeaders,registration.type==="MULTIPART_FORMDATA")}else if(registration.type==="MULTIPART"){if(registration.singleUploadUrl!==undefined||registration.singleUploadHeaders!==undefined||!Array.isArray(registration.partUploadRequests)||registration.partUploadRequests.length<1||registration.partUploadRequests.length>${spec.maxParts}||!registration.multipartMetadata||typeof registration.multipartMetadata!=="object"||Array.isArray(registration.multipartMetadata)||JSON.stringify(registration.multipartMetadata).length>65536)throw new Error("LinkedIn multipart ${spec.label} registration changed shape");let next=0;const parts=[];for(const part of registration.partUploadRequests){if(!part||typeof part!=="object"||Array.isArray(part)||Object.keys(part).sort().join(",")!=="firstByte,headers,lastByte,uploadUrl"||!Number.isSafeInteger(part.firstByte)||!Number.isSafeInteger(part.lastByte)||part.firstByte!==next||part.lastByte<part.firstByte||part.lastByte>=media.size)throw new Error("LinkedIn multipart ${spec.label} offsets changed shape");parts.push(await upload(part.uploadUrl,media.slice(part.firstByte,part.lastByte+1,"${spec.blobType}"),part.headers,false));next=part.lastByte+1}if(next!==media.size)throw new Error("LinkedIn multipart ${spec.label} registration did not cover the file");await requestJson("${LINKEDIN_IMAGE_FINALIZATION_PATH}",{body:JSON.stringify({completeUploadRequest:{mediaArtifactUrn:registration.mediaArtifactUrn,multipartMetadata:registration.multipartMetadata,partUploadResponses:parts}}),headers:mutationHeaders,method:"POST"},"LinkedIn ${spec.label} finalization")}else throw new Error("LinkedIn ${spec.label} upload mechanism changed");return{mediaUrn:registration.urn}})()`;
}

function replaceRequiredUploadSource(
  source: string,
  from: string,
  to: string,
): string {
  const first = source.indexOf(from);
  if (first < 0 || source.indexOf(from, first + from.length) >= 0) {
    throw new Error("LinkedIn image upload source rewrite changed shape");
  }
  return source.replace(from, to);
}

function uploadEvaluationSource(
  bindings: LinkedInPostPageBindings,
  expectedSubject: string,
  staging: LinkedInPostImageStaging,
  spec: LinkedInPostMediaSpec,
): string {
  let source = baseUploadEvaluationSource(bindings, expectedSubject, staging, spec);
  source = replaceRequiredUploadSource(
    source,
    'const allowedKeys=new Set(["mediaArtifactUrn","multipartMetadata","partUploadRequests","recipes","singleUploadHeaders","singleUploadUrl","type","urn"]);',
    'const allowedKeys=new Set(["$type","assetRealtimeTopic","mediaArtifactUrn","multipartMetadata","partUploadRequests","pollingUrl","recipes","singleUploadHeaders","singleUploadUrl","type","urn"]);if(registration.$type!==undefined&&registration.$type!=="com.linkedin.mediauploader.MediaUploadMetadata")throw new Error("LinkedIn registration changed response type");if(registration.assetRealtimeTopic!==undefined&&(typeof registration.assetRealtimeTopic!=="string"||registration.assetRealtimeTopic.length<1||registration.assetRealtimeTopic.length>4096))throw new Error("LinkedIn registration changed realtime topic");if(registration.recipes!==undefined&&(!Array.isArray(registration.recipes)||registration.recipes.length<1||registration.recipes.length>20||registration.recipes.some((recipe)=>typeof recipe!=="string"||!/^urn:li:[A-Za-z0-9_(),.:%=-]{1,448}$/.test(recipe))||new Set(registration.recipes).size!==registration.recipes.length))throw new Error("LinkedIn registration changed recipes");',
  );
  source = replaceRequiredUploadSource(
    source,
    "const checkedHeaders=(value,formData)=>{",
    "if(registration.pollingUrl!==undefined)checkedUrl(registration.pollingUrl);const checkedHeaders=(value,formData)=>{",
  );
  source = replaceRequiredUploadSource(
    source,
    'if(registration.type==="SINGLE"||registration.type==="MULTIPART_FORMDATA"){',
    `if(registration.type==="SINGLE"||registration.type==="MULTIPART_FORMDATA"||registration.type==="VECTOR"){if(registration.type==="VECTOR"&&(!registration.singleUploadHeaders||typeof registration.singleUploadHeaders!=="object"||Array.isArray(registration.singleUploadHeaders)||Object.keys(registration.singleUploadHeaders).sort().join(",")!=="media-type-family"||registration.singleUploadHeaders["media-type-family"]!=="${spec.vectorFamily}"))throw new Error("LinkedIn vector ${spec.label} upload headers changed shape");`,
  );
  return source;
}

function baseCreateEvaluationSource(
  bindings: LinkedInPostPageBindings,
  expectedSubject: string,
  expectedProfileUrn: string,
  variables: Readonly<Record<string, unknown>>,
  mediaUrn: string | null,
  mediaCategory: "IMAGE" | "VIDEO" | null,
): string {
  const input = Object.freeze({
    expectedProfileUrn,
    expectedSubject,
    mediaCategory,
    mediaUrn,
    pageInstance: bindings.pageInstance,
    track: bindings.track,
    variables,
  });
  return `(async()=>{${commonEvaluationPrelude(input)}const firstIdentity=await identity();assertIdentity(firstIdentity);const mutationHeaders={...baseHeaders,"content-type":"application/json; charset=UTF-8","x-li-page-instance":input.pageInstance,"x-li-pem-metadata":"Voyager - Sharing - CreateShare=sharing-create-content","x-li-track":input.track};const createPath="${LINKEDIN_GRAPHQL_PATH}?action=execute&queryId=${encodeURIComponent(LINKEDIN_POST_CREATE_MUTATION_ID)}";const createBody=await requestJson(createPath,{body:JSON.stringify({includeWebMetadata:true,queryId:"${LINKEDIN_POST_CREATE_MUTATION_ID}",variables:input.variables}),headers:mutationHeaders,method:"POST"},"LinkedIn post create");const createPayload=createBody&&typeof createBody==="object"&&!Array.isArray(createBody)&&createBody.data&&typeof createBody.data==="object"&&!Array.isArray(createBody.data)&&createBody.data.value&&typeof createBody.data.value==="object"&&!Array.isArray(createBody.data.value)?createBody.data.value:createBody&&typeof createBody==="object"&&!Array.isArray(createBody)&&createBody.value&&typeof createBody.value==="object"&&!Array.isArray(createBody.value)?createBody.value:createBody;if(!createPayload||typeof createPayload!=="object"||Array.isArray(createPayload))throw new Error("LinkedIn GraphQL response changed shape");if(Array.isArray(createPayload.errors)&&createPayload.errors.length>0)throw new Error("LinkedIn post create returned provider errors");if(createPayload.data&&typeof createPayload.data==="object"&&!Array.isArray(createPayload.data)&&Array.isArray(createPayload.data.errors)&&createPayload.data.errors.length>0)throw new Error("LinkedIn post create returned nested provider errors");const entity=createPayload.data?.createContentcreationDashShares?.entity;if(!entity||typeof entity!=="object"||Array.isArray(entity))throw new Error("LinkedIn post create omitted its entity");const entityUrn=entity.entityUrn;if(!/^urn:li:(?:fsd_share|share|ugcPost):[A-Za-z0-9_(),.:%=-]{1,448}$/.test(entityUrn||""))throw new Error("LinkedIn post create returned an invalid entity URN");if(!entity.status||typeof entity.status!=="object"||Array.isArray(entity.status)||!entity.status.lifecycleState||typeof entity.status.lifecycleState!=="object"||Array.isArray(entity.status.lifecycleState)||!entity.status.lifecycleState.PublishedState||typeof entity.status.lifecycleState.PublishedState!=="object"||Array.isArray(entity.status.lifecycleState.PublishedState))throw new Error("LinkedIn post create did not report a published lifecycle");return{entityUrn}})()`;
}

function createEvaluationSource(
  bindings: LinkedInPostPageBindings,
  expectedSubject: string,
  expectedProfileUrn: string,
  variables: Readonly<Record<string, unknown>>,
  mediaUrn: string | null,
  mediaCategory: "IMAGE" | "VIDEO" | null,
): string {
  return replaceRequiredUploadSource(
    baseCreateEvaluationSource(
      bindings,
      expectedSubject,
      expectedProfileUrn,
      variables,
      mediaUrn,
      mediaCategory,
    ),
    'const entity=createPayload.data?.createContentcreationDashShares?.entity;if(!entity||typeof entity!=="object"||Array.isArray(entity))throw new Error("LinkedIn post create omitted its entity");',
    'const entity=createPayload.data?.createContentcreationDashShares?.entity;if(!entity||typeof entity!=="object"||Array.isArray(entity)){const direct=createPayload.createContentcreationDashShares?.entity;const alternate=createBody&&typeof createBody==="object"&&!Array.isArray(createBody)?createBody.data?.createContentcreationDashShares?.entity:null;if(direct&&typeof direct==="object"&&!Array.isArray(direct))throw new Error("LinkedIn post create entity used direct nesting");if(alternate&&typeof alternate==="object"&&!Array.isArray(alternate))throw new Error("LinkedIn post create entity used alternate data nesting");if(createBody&&typeof createBody==="object"&&!Array.isArray(createBody)&&Array.isArray(createBody.included)&&createBody.included.length>0){let includedShare=null;let includedUpdate=null;for(const candidate of createBody.included){if(!candidate||typeof candidate!=="object"||Array.isArray(candidate))continue;if(candidate.$type==="com.linkedin.voyager.dash.contentcreation.Share"){if(includedShare!==null)throw new Error("LinkedIn post create returned duplicate share entities");includedShare=candidate}if(candidate.$type==="com.linkedin.voyager.dash.feed.Update"){if(includedUpdate!==null)throw new Error("LinkedIn post create returned duplicate update entities");includedUpdate=candidate}}if(includedUpdate===null&&includedShare!==null&&input.mediaCategory==="VIDEO"){const shareUrn=typeof includedShare.entityUrn==="string"?includedShare.entityUrn:"";if(!/^urn:li:fsd_share:urn:li:(?:ugcPost|share|activity):[0-9]{10,20}$/.test(shareUrn))throw new Error("LinkedIn video post create share URN changed shape: "+shareUrn.slice(0,256));const videoLifecycle=includedShare.status&&typeof includedShare.status==="object"&&!Array.isArray(includedShare.status)?includedShare.status.lifecycleState:null;if(!videoLifecycle||typeof videoLifecycle!=="object"||Array.isArray(videoLifecycle))throw new Error("LinkedIn video post create omitted its lifecycle");const publishedRef=videoLifecycle["*PublishedState"];const publishedFlag=videoLifecycle.PublishedState;const unpublished=videoLifecycle.UnpublishedState;const lifecycleOk=(typeof publishedRef==="string"&&publishedRef===shareUrn)||(publishedFlag===null&&unpublished==="MEDIA_PROCESSING");if(!lifecycleOk)throw new Error("LinkedIn video post create lifecycle changed shape: "+JSON.stringify(videoLifecycle).slice(0,512));return{entityUrn:shareUrn}}if(includedShare===null||includedUpdate===null)throw new Error("LinkedIn post create normalized included entities omitted the share or update: "+JSON.stringify(createBody.included.map((entry)=>entry&&typeof entry==="object"?entry.$type:null)).slice(0,512)+" share="+JSON.stringify(includedShare===null?null:{entityUrn:includedShare.entityUrn,status:includedShare.status,content:includedShare.content&&typeof includedShare.content==="object"?Object.keys(includedShare.content):includedShare.content}).slice(0,768));const lifecycle=includedShare.status&&typeof includedShare.status==="object"&&!Array.isArray(includedShare.status)?includedShare.status.lifecycleState:null;if(!lifecycle||typeof lifecycle!=="object"||Array.isArray(lifecycle)||lifecycle.UnpublishedState!==null||typeof lifecycle["*PublishedState"]!=="string")throw new Error("LinkedIn post create did not report a published lifecycle: "+JSON.stringify(includedShare.status).slice(0,512));const updateUrn=typeof includedUpdate.entityUrn==="string"?includedUpdate.entityUrn:"";if(lifecycle["*PublishedState"]!==updateUrn)throw new Error("LinkedIn post create published lifecycle did not bind the update entity: "+String(updateUrn).slice(0,256));const prefix="urn:li:fsd_update:(urn:li:activity:";if(!updateUrn.startsWith(prefix)||!updateUrn.endsWith(")")||updateUrn.length>512)throw new Error("LinkedIn post create update entity URN changed shape: "+String(updateUrn).slice(0,256));const tail=updateUrn.slice(prefix.length,-1);const comma=tail.indexOf(",");const activityId=comma<0?"":tail.slice(0,comma);if(activityId.length<10||activityId.length>20||!/^[0-9]+$/.test(activityId))throw new Error("LinkedIn post create update entity URN changed shape: "+String(updateUrn).slice(0,256));return{entityUrn:updateUrn}}throw new Error("LinkedIn post create omitted its entity")}',
  );
}

function linkedInPostPermalinkUrl(entityUrn: string): string {
  for (const kind of ["urn:li:activity:", "urn:li:ugcPost:", "urn:li:share:"]) {
    const index = entityUrn.indexOf(kind);
    if (index >= 0) {
      const id = entityUrn.slice(index + kind.length).replace(/[^0-9].*/u, "");
      if (/^[0-9]{10,20}$/u.test(id)) {
        return `${LINKEDIN_ORIGIN}/feed/update/${kind}${id}/`;
      }
    }
  }
  return `${LINKEDIN_ORIGIN}/feed/update/${entityUrn}/`;
}

function readbackEvaluationSource(
  bindings: LinkedInPostPageBindings,
  expectedSubject: string,
  expectedProfileUrn: string,
  variables: Readonly<Record<string, unknown>>,
  mediaUrn: string | null,
  entityUrn: string,
  postUrl: string,
): string {
  const input = Object.freeze({
    entityUrn,
    expectedProfileUrn,
    expectedSubject,
    mediaUrn,
    pageInstance: bindings.pageInstance,
    postUrl,
    track: bindings.track,
    variables,
  });
  return `(async()=>{${commonEvaluationPrelude(input)}const htmlEscape=(text)=>text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");const response=await fetch(input.postUrl,{credentials:"include",redirect:"error",referrer:"${LINKEDIN_FEED_URL}",headers:baseHeaders,method:"GET"});const contentType=(response.headers.get("content-type")||"").split(";",1)[0].trim().toLowerCase();if(contentType!=="text/html"||response.status<200||response.status>=300)throw new Error("LinkedIn post readback permalink changed shape; status="+response.status+" ct="+contentType);const html=await response.text();if(html.length>8*1024*1024)throw new Error("LinkedIn post readback permalink exceeded its reviewed bound");const activityIdx=input.entityUrn.indexOf("urn:li:activity:");const activityUrn=activityIdx<0?null:"urn:li:activity:"+input.entityUrn.slice(activityIdx+16).replace(/[^0-9].*/,"");const digits=(input.entityUrn.match(/[0-9]{10,20}/g)||[]);const entityMatched=html.indexOf(input.entityUrn)>=0||(activityUrn!==null&&html.indexOf(activityUrn)>=0)||digits.some((d)=>html.indexOf("urn:li:activity:"+d)>=0||html.indexOf("urn:li:share:"+d)>=0||html.indexOf("urn:li:ugcPost:"+d)>=0||html.indexOf("urn%3Ali%3Aactivity%3A"+d)>=0||html.indexOf("urn%3Ali%3Ashare%3A"+d)>=0||html.indexOf("urn%3Ali%3AugcPost%3A"+d)>=0);const text=input.variables.post.commentary.text;const textMatched=html.indexOf(text)>=0||html.indexOf(htmlEscape(text))>=0;const me=await identity();assertIdentity(me);const miniRef=me.data&&typeof me.data==="object"?(me.data["*miniProfile"]??me.data.miniProfile):null;let mini=null;if(miniRef&&typeof miniRef==="object"){mini=miniRef}else if(typeof miniRef==="string"&&Array.isArray(me.included)){for(const cand of me.included){if(cand&&typeof cand==="object"&&cand.entityUrn===miniRef){mini=cand}}}const slug=mini&&typeof mini.publicIdentifier==="string"&&mini.publicIdentifier.length>0?mini.publicIdentifier:null;const authorName=mini&&typeof mini.firstName==="string"&&typeof mini.lastName==="string"&&mini.firstName.length>0&&mini.lastName.length>0?mini.firstName+" "+mini.lastName:null;const fsdId=input.expectedProfileUrn.split(":").pop();const urnMatched=html.indexOf(input.expectedProfileUrn)>=0||html.indexOf("fsd_profile:"+fsdId)>=0||html.indexOf("fsd_profile%3A"+fsdId)>=0;const slugMatched=slug!==null&&(html.indexOf("linkedin.com/in/"+slug+"/")>=0||html.indexOf("linkedin.com/in/"+slug+"?")>=0);const nameMatched=authorName!==null&&html.indexOf(authorName)>=0;const actorMatched=urnMatched||(slugMatched&&nameMatched);const mediaMatched=input.mediaUrn===null?true:html.indexOf(input.mediaUrn)>=0||html.indexOf(htmlEscape(input.mediaUrn))>=0||html.indexOf(encodeURIComponent(input.mediaUrn))>=0;if(!entityMatched||!actorMatched||!textMatched||!mediaMatched)throw new Error("LinkedIn independent post readback did not bind the confirmed post: "+JSON.stringify({entityMatched,actorMatched,textMatched,mediaMatched,htmlBytes:html.length,urnMatched,slugMatched,nameMatched}));return{actorMatched,entityMatched,entityUrn:input.entityUrn,lifecycle:"PUBLISHED",mediaMatched:input.mediaUrn===null?false:mediaMatched,mediaUrn:input.mediaUrn,textMatched,url:input.postUrl}})()`;
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
    "LinkedIn post browser finalization failed; private artifacts were preserved",
    session.recoveryHandle ?? "session=linkedin-post-runtime;artifacts=unknown",
    new AggregateError(failures, "LinkedIn post browser finalization failed"),
    cleanupEvidence,
  );
}

export async function createLinkedInPostBrowserTransport(
  auth: GhostgetAuth,
  options: {
    readonly timeoutMs: number;
    readonly operationDeadline?: WebSessionOperationDeadline;
    readonly publishCleanupResource?: WebSessionCleanupResourcePublisher;
    readonly dependencies?: Partial<LinkedInPostBrowserDependencies>;
  },
): Promise<LinkedInPostBrowserTransport> {
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
  const session = await createSession(postBrowserManifest, auth, sessionOptions);
  let closed = false;
  const remaining = (): number => options.operationDeadline?.remainingTimeMs() ?? options.timeoutMs;
  const runEvaluations = async (
    sources: readonly string[],
  ): Promise<readonly Readonly<Record<string, unknown>>[]> => {
    if (closed) throw new Error("LinkedIn post browser transport is closed");
    const records = await session.runBatch(
      sources.map((source) => ["eval", source] as const),
      remaining(),
      MAX_BROWSER_OUTPUT_BYTES,
    );
    if (records.length !== sources.length) {
      throw new Error("LinkedIn post browser omitted an evaluation response");
    }
    return Object.freeze(records.map((record) => browserEvaluationResult(record)));
  };
  const run = async (source: string): Promise<Readonly<Record<string, unknown>>> => {
    const first = (await runEvaluations([source]))[0];
    if (first === undefined) throw new Error("LinkedIn post browser omitted its response");
    return first;
  };

  let bindings: LinkedInPostPageBindings;
  try {
    await session.runBatch(
      [["open", LINKEDIN_FEED_URL], ["wait", "5000"]],
      remaining(),
      MAX_BROWSER_OUTPUT_BYTES,
    );
    const records = await session.runBatch(
      [["network", "requests", "--filter", "/voyager/api/"]],
      Math.min(remaining(), 30_000),
      MAX_BROWSER_OUTPUT_BYTES,
    );
    const first = records[0];
    if (first === undefined) throw new Error("LinkedIn post page-binding observation omitted its response");
    bindings = linkedInPostPageBindings(browserResultData(first));
  } catch (error) {
    try {
      await finalizeBrowserSession(session);
    } catch (cleanupError) {
      throw cleanupError;
    }
    throw error;
  }

  const uploadMedia = async (
    expectedSubject: string,
    bytes: Uint8Array,
    spec: LinkedInPostMediaSpec,
  ): Promise<string> => {
    if (bytes.byteLength < spec.minBytes || bytes.byteLength > spec.maxBytes) {
      throw new Error(`LinkedIn post ${spec.label} is outside the reviewed byte bound`);
    }
    const encoded = Buffer.from(bytes).toString("base64");
    const chunkCount = Math.ceil(encoded.length / IMAGE_STAGING_CHUNK_CHARACTERS);
    const staging = Object.freeze({
      key: `${spec.stagingKeyPrefix}${randomUUID().replaceAll("-", "")}`,
      byteLength: bytes.byteLength,
      base64Length: encoded.length,
      chunkCount,
    });
    let failureStage: LinkedInPostImageFailureStage = "page image staging";
    try {
      const initialized = await run(imageStagingInitializationSource(staging, spec));
      exactKeys(initialized, ["ready"], `LinkedIn ${spec.label} staging initialization`);
      if (initialized.ready !== true) {
        throw new Error(`LinkedIn ${spec.label} staging initialization changed shape`);
      }
      const sources: string[] = [];
      for (let index = 0; index < chunkCount; index += 1) {
        const offset = index * IMAGE_STAGING_CHUNK_CHARACTERS;
        sources.push(imageStagingChunkSource(
          staging,
          index,
          encoded.slice(offset, offset + IMAGE_STAGING_CHUNK_CHARACTERS),
          spec,
        ));
      }
      for (
        let offset = 0;
        offset < sources.length;
        offset += IMAGE_STAGING_COMMANDS_PER_BATCH
      ) {
        const batch = sources.slice(offset, offset + IMAGE_STAGING_COMMANDS_PER_BATCH);
        const staged = await runEvaluations(batch);
        for (let index = 0; index < staged.length; index += 1) {
          const result = staged[index]!;
          exactKeys(result, ["staged"], `LinkedIn ${spec.label} staging command`);
          if (result.staged !== offset + index + 1) {
            throw new Error(`LinkedIn ${spec.label} staging command changed order`);
          }
        }
      }
      failureStage = "image registration or upload response";
      const result = await run(uploadEvaluationSource(
        bindings,
        expectedSubject,
        staging,
        spec,
      ));
      exactKeys(result, ["mediaUrn"], `LinkedIn ${spec.label} upload browser request`);
      return linkedInPostMediaUrn(result.mediaUrn);
    } catch (error) {
      throw new LinkedInPostImagePreparationError(
        failureStage === "page image staging"
          ? failureStage
          : linkedInPostImageFailureStage(error),
        error,
      );
    } finally {
      try {
        await run(imageStagingCleanupSource(staging.key));
      } catch {
        // Browser finalization remains the authoritative private-artifact cleanup.
      }
    }
  };

  return Object.freeze({
    currentIdentityResponse: async () => {
      const result = await run(identityEvaluationSource());
      exactKeys(result, ["body", "contentType", "status"], "LinkedIn current-member browser request");
      if (result.status !== 200) {
        throw new Error("LinkedIn current-member browser request returned an unreviewed response");
      }
      return result.body;
    },
    uploadImage: async (expectedSubject: string, image: Uint8Array) => {
      return uploadMedia(expectedSubject, image, IMAGE_MEDIA_SPEC);
    },
    uploadVideo: async (expectedSubject: string, video: Uint8Array) => {
      return uploadMedia(expectedSubject, video, VIDEO_MEDIA_SPEC);
    },
    createPost: async (
      expectedSubject: string,
      expectedProfileUrn: string,
      variables: Readonly<Record<string, unknown>>,
      mediaUrn: string | null,
      mediaCategory: "IMAGE" | "VIDEO" = "IMAGE",
    ) => {
      try {
        const result = await run(createEvaluationSource(
          bindings,
          expectedSubject,
          expectedProfileUrn,
          variables,
          mediaUrn,
          mediaCategory,
        ));
        exactKeys(result, ["entityUrn"], "LinkedIn post create browser request");
        return linkedInPostEntityUrn(result.entityUrn);
      } catch (error) {
        throw new LinkedInPostCreateResponseError(error);
      }
    },
    readPost: async (
      expectedSubject: string,
      expectedProfileUrn: string,
      variables: Readonly<Record<string, unknown>>,
      mediaUrn: string | null,
      entityUrn: string,
      mediaCategory: "IMAGE" | "VIDEO" = "IMAGE",
    ) => {
      const boundUrn = linkedInPostEntityUrn(entityUrn);
      const postUrl = linkedInPostPermalinkUrl(boundUrn);
      // Let the provider settle briefly, then bind the exact post through its
      // independent server-rendered permalink readback. Video posts enter
      // MEDIA_PROCESSING after acceptance and need a longer settle.
      await session.runBatch(
        [["wait", mediaCategory === "VIDEO" ? "15000" : "3000"]],
        Math.min(remaining(), 25_000),
        MAX_BROWSER_OUTPUT_BYTES,
      );
      const result = await run(readbackEvaluationSource(
        bindings,
        expectedSubject,
        expectedProfileUrn,
        variables,
        mediaUrn,
        boundUrn,
        postUrl,
      ));
      return result;
    },
    close: async () => {
      if (closed) return;
      closed = true;
      await finalizeBrowserSession(session);
    },
  });
}

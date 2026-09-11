// @bun
import {
  localCliToolArtifactForCurrentRuntime,
  parseLocalCliToolIdentityV1
} from "./index-1r44fcqj.js";
import {
  ARTICLE_DRAFT_DOCUMENT_IMAGE_SCHEMA_VERSION,
  ARTICLE_DRAFT_DOCUMENT_SCHEMA_VERSION,
  MAX_ARTICLE_DRAFT_BLOCKS,
  MAX_ARTICLE_DRAFT_CHARACTERS,
  MAX_ARTICLE_DRAFT_DOCUMENT_BYTES,
  articleDraftDocumentIssues,
  articleDraftDocumentV2Issues,
  parseArticleDraftDocument,
  parseArticleDraftDocumentV2
} from "./index-tp6v994c.js";
import {
  startProviderPluginCleanupTrackedOperation
} from "./index-n4szk3nw.js";
import {
  PROVIDER_PLUGIN_ID_MAX_LENGTH,
  PROVIDER_PLUGIN_OPERATION_NAME_MAX_LENGTH,
  isPortableProviderPluginVersion,
  isProviderPluginId,
  isProviderPluginOperationName,
  isProviderPluginSurfaceId
} from "./index-26yq8q16.js";
import {
  GHOSTGET_MESSAGING_CLIENT_INTENT_BINDING_V1_CONTRACT_ID,
  GHOSTGET_MESSAGING_CLIENT_INTENT_BINDING_V1_FORMAT,
  GHOSTGET_MESSAGING_CONTEXT_BINDING_V1_CONTRACT_DESCRIPTOR,
  GHOSTGET_MESSAGING_CONTEXT_BINDING_V1_CONTRACT_HASH,
  GHOSTGET_MESSAGING_CONTEXT_BINDING_V1_CONTRACT_ID,
  GHOSTGET_MESSAGING_CONTEXT_BINDING_V1_FORMAT,
  GHOSTGET_MESSAGING_CONTEXT_BINDING_V2_CONTRACT_DESCRIPTOR,
  GHOSTGET_MESSAGING_CONTEXT_BINDING_V2_CONTRACT_HASH,
  GHOSTGET_MESSAGING_CONTEXT_BINDING_V2_CONTRACT_ID,
  GHOSTGET_MESSAGING_CONTEXT_BINDING_V2_FORMAT,
  GHOSTGET_MESSAGING_CONTEXT_INSTANCE_V1_CONTRACT_ID,
  GHOSTGET_MESSAGING_CONTEXT_INSTANCE_V2_CONTRACT_ID,
  GHOSTGET_MESSAGING_RECEIPT_BINDING_V1_CONTRACT_DESCRIPTOR,
  GHOSTGET_MESSAGING_RECEIPT_BINDING_V1_CONTRACT_HASH,
  GHOSTGET_MESSAGING_RECEIPT_BINDING_V1_CONTRACT_ID,
  GHOSTGET_MESSAGING_RECEIPT_BINDING_V1_FORMAT,
  GHOSTGET_MESSAGING_RECEIPT_BINDING_V2_CONTRACT_DESCRIPTOR,
  GHOSTGET_MESSAGING_RECEIPT_BINDING_V2_CONTRACT_HASH,
  GHOSTGET_MESSAGING_RECEIPT_BINDING_V2_CONTRACT_ID,
  GHOSTGET_MESSAGING_RECEIPT_BINDING_V2_FORMAT,
  MESSAGE_LIKE_ME_SOURCE_CONVERSATION_COORDINATE_V1_CONTRACT_ID,
  MESSAGE_LIKE_ME_SOURCE_CONVERSATION_COORDINATE_V1_SCHEMA_VERSION,
  createBeeperMessageLikeMeContextBindingV1,
  createBeeperMessageLikeMeContextBindingV2,
  createGhostgetMessagingReceiptBindingV1,
  createGhostgetMessagingReceiptBindingV2,
  ghostgetMessagingContextBindingSha256V1,
  ghostgetMessagingContextBindingSha256V2,
  messageLikeMeSourceConversationCoordinateBindingV1,
  parseGhostgetMessagingClientIntentBindingV1,
  parseGhostgetMessagingContextBindingV1,
  parseGhostgetMessagingContextBindingV2,
  parseMessageLikeMeSourceConversationCoordinateV1
} from "./index-hqk9cej0.js";
import"./index-8sbt8qwx.js";
import"./index-z1w83f81.js";
// src/article-draft-embeds.ts
var MAX_X_STATUS_ARTICLE_EMBED_CHARACTERS = 25000;
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactEmbed(value) {
  if (!isRecord(value)) {
    throw new Error("X status Article embed must contain exactly text,url");
  }
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string") || keys.sort().join(",") !== "text,url") {
    throw new Error("X status Article embed must contain exactly text,url");
  }
  const textDescriptor = Object.getOwnPropertyDescriptor(value, "text");
  const urlDescriptor = Object.getOwnPropertyDescriptor(value, "url");
  if (textDescriptor === undefined || urlDescriptor === undefined || !("value" in textDescriptor) || !("value" in urlDescriptor) || !textDescriptor.enumerable || !urlDescriptor.enumerable)
    throw new Error("X status Article embed must contain plain text,url values");
  const text = textDescriptor.value;
  const url = urlDescriptor.value;
  if (typeof text !== "string" || text.length < 1 || text.length > MAX_X_STATUS_ARTICLE_EMBED_CHARACTERS || text.includes("\x00") || text.trim().length < 1) {
    throw new Error(`X status Article embed text must contain 1-${MAX_X_STATUS_ARTICLE_EMBED_CHARACTERS} characters`);
  }
  if (typeof url !== "string" || url.length < 1 || url.length > 8192 || /[\0\r\n]/u.test(url)) {
    throw new Error("X status Article embed URL must be one bounded X status URL");
  }
  return Object.freeze({ text, url });
}
function canonicalXStatusUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("X status Article embed URL must be one bounded X status URL");
  }
  const hosts = new Set(["x.com", "www.x.com", "twitter.com", "www.twitter.com"]);
  const match = /^\/([A-Za-z0-9_]{1,15})\/status\/([0-9]{1,32})\/?$/u.exec(url.pathname);
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.port !== "" || !hosts.has(url.hostname) || match === null)
    throw new Error("X status Article embed URL must be one bounded X status URL");
  return `https://x.com/${match[1]}/status/${match[2]}`;
}
function textBlock(type, text) {
  return Object.freeze({
    type,
    text,
    links: Object.freeze([]),
    styles: Object.freeze([])
  });
}
function projectXStatusArticleEmbed(value, target) {
  const embed = exactEmbed(value);
  if (target !== "x-web" && target !== "linkedin-web") {
    throw new Error("X status Article embed target must be x-web or linkedin-web");
  }
  const canonicalUrl = canonicalXStatusUrl(embed.url);
  const quoteBlocks = embed.text.replaceAll(`\r
`, `
`).replaceAll("\r", `
`).split(`
`).filter((line) => line.length > 0).map((line) => textBlock("blockquote", line));
  return Object.freeze([
    ...quoteBlocks,
    Object.freeze({
      type: "paragraph",
      text: canonicalUrl,
      links: Object.freeze([Object.freeze({
        offset: 0,
        length: canonicalUrl.length,
        url: canonicalUrl
      })]),
      styles: Object.freeze([])
    })
  ]);
}

// src/index.ts
var PROVIDER_PLUGIN_ID_MAX_LENGTH2 = PROVIDER_PLUGIN_ID_MAX_LENGTH;
var PROVIDER_PLUGIN_OPERATION_NAME_MAX_LENGTH2 = PROVIDER_PLUGIN_OPERATION_NAME_MAX_LENGTH;
var isPortableProviderPluginVersion2 = isPortableProviderPluginVersion;
var isProviderPluginId2 = isProviderPluginId;
var isProviderPluginOperationName2 = isProviderPluginOperationName;
var isProviderPluginSurfaceId2 = isProviderPluginSurfaceId;
export {
  startProviderPluginCleanupTrackedOperation,
  projectXStatusArticleEmbed,
  parseMessageLikeMeSourceConversationCoordinateV1,
  parseLocalCliToolIdentityV1,
  parseGhostgetMessagingContextBindingV2,
  parseGhostgetMessagingContextBindingV1,
  parseGhostgetMessagingClientIntentBindingV1,
  parseArticleDraftDocumentV2,
  parseArticleDraftDocument,
  messageLikeMeSourceConversationCoordinateBindingV1,
  localCliToolArtifactForCurrentRuntime,
  isProviderPluginSurfaceId2 as isProviderPluginSurfaceId,
  isProviderPluginOperationName2 as isProviderPluginOperationName,
  isProviderPluginId2 as isProviderPluginId,
  isPortableProviderPluginVersion2 as isPortableProviderPluginVersion,
  ghostgetMessagingContextBindingSha256V2,
  ghostgetMessagingContextBindingSha256V1,
  createGhostgetMessagingReceiptBindingV2,
  createGhostgetMessagingReceiptBindingV1,
  createBeeperMessageLikeMeContextBindingV2,
  createBeeperMessageLikeMeContextBindingV1,
  articleDraftDocumentV2Issues,
  articleDraftDocumentIssues,
  PROVIDER_PLUGIN_OPERATION_NAME_MAX_LENGTH2 as PROVIDER_PLUGIN_OPERATION_NAME_MAX_LENGTH,
  PROVIDER_PLUGIN_ID_MAX_LENGTH2 as PROVIDER_PLUGIN_ID_MAX_LENGTH,
  MESSAGE_LIKE_ME_SOURCE_CONVERSATION_COORDINATE_V1_SCHEMA_VERSION,
  MESSAGE_LIKE_ME_SOURCE_CONVERSATION_COORDINATE_V1_CONTRACT_ID,
  MAX_X_STATUS_ARTICLE_EMBED_CHARACTERS,
  MAX_ARTICLE_DRAFT_DOCUMENT_BYTES,
  MAX_ARTICLE_DRAFT_CHARACTERS,
  MAX_ARTICLE_DRAFT_BLOCKS,
  GHOSTGET_MESSAGING_RECEIPT_BINDING_V2_FORMAT,
  GHOSTGET_MESSAGING_RECEIPT_BINDING_V2_CONTRACT_ID,
  GHOSTGET_MESSAGING_RECEIPT_BINDING_V2_CONTRACT_HASH,
  GHOSTGET_MESSAGING_RECEIPT_BINDING_V2_CONTRACT_DESCRIPTOR,
  GHOSTGET_MESSAGING_RECEIPT_BINDING_V1_FORMAT,
  GHOSTGET_MESSAGING_RECEIPT_BINDING_V1_CONTRACT_ID,
  GHOSTGET_MESSAGING_RECEIPT_BINDING_V1_CONTRACT_HASH,
  GHOSTGET_MESSAGING_RECEIPT_BINDING_V1_CONTRACT_DESCRIPTOR,
  GHOSTGET_MESSAGING_CONTEXT_INSTANCE_V2_CONTRACT_ID,
  GHOSTGET_MESSAGING_CONTEXT_INSTANCE_V1_CONTRACT_ID,
  GHOSTGET_MESSAGING_CONTEXT_BINDING_V2_FORMAT,
  GHOSTGET_MESSAGING_CONTEXT_BINDING_V2_CONTRACT_ID,
  GHOSTGET_MESSAGING_CONTEXT_BINDING_V2_CONTRACT_HASH,
  GHOSTGET_MESSAGING_CONTEXT_BINDING_V2_CONTRACT_DESCRIPTOR,
  GHOSTGET_MESSAGING_CONTEXT_BINDING_V1_FORMAT,
  GHOSTGET_MESSAGING_CONTEXT_BINDING_V1_CONTRACT_ID,
  GHOSTGET_MESSAGING_CONTEXT_BINDING_V1_CONTRACT_HASH,
  GHOSTGET_MESSAGING_CONTEXT_BINDING_V1_CONTRACT_DESCRIPTOR,
  GHOSTGET_MESSAGING_CLIENT_INTENT_BINDING_V1_FORMAT,
  GHOSTGET_MESSAGING_CLIENT_INTENT_BINDING_V1_CONTRACT_ID,
  ARTICLE_DRAFT_DOCUMENT_SCHEMA_VERSION,
  ARTICLE_DRAFT_DOCUMENT_IMAGE_SCHEMA_VERSION
};

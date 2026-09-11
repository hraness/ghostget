// @bun
import {
  isoBmffMp4VideoMetadata
} from "./index-kqaaw64h.js";
import {
  createWebSessionClient,
  webSessionAuthSubject,
  webSessionCookie
} from "./index-wn3s7nnj.js";
import {
  failedProviderRead
} from "./index-4smh9n9x.js";
import"./index-j3ysa35f.js";
import"./index-aka7rgdj.js";
import"./index-vtj5zdgf.js";
import"./index-n4szk3nw.js";
import {
  canonicalJson
} from "./index-8sbt8qwx.js";
import"./index-z1w83f81.js";

// src/providers/youtube-web-runtime.ts
import { Blob } from "buffer";
import { createHash as createHash2 } from "crypto";
import { constants } from "fs";
import { open } from "fs/promises";
import { types as nodeTypes } from "util";

// src/providers/youtube-web.ts
import { createHash } from "crypto";
var YOUTUBE_ORIGIN = "https://www.youtube.com";
var MAX_CONFIG_BYTES = 2 * 1024 * 1024;
var MAX_PROFILE_PAGE_BYTES = 4 * 1024 * 1024;
var MAX_WALK_NODES = 250000;
var MAX_WALK_DEPTH = 80;
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function record(value, label) {
  if (!isRecord(value))
    throw new Error(`${label} must be an object`);
  return value;
}
function boundedString(value, label, maximum = 32768) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || /[\0\r]/u.test(value))
    throw new Error(`${label} must be a bounded string`);
  return value;
}
function optionalBoundedString(value, maximum = 32768) {
  return typeof value === "string" && value.length > 0 && value.length <= maximum && !/[\0\r]/u.test(value) ? value : null;
}
function boundedIntegerString(value, label) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 99) {
    return String(value);
  }
  if (typeof value === "string" && /^(?:0|[1-9][0-9]?)$/u.test(value))
    return value;
  throw new Error(`${label} must be an account index between 0 and 99`);
}
function balancedJsonObject(text, start, maximumBytes = MAX_CONFIG_BYTES) {
  if (text[start] !== "{")
    throw new Error("YouTube configuration did not begin with an object");
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start;index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{")
      depth += 1;
    if (character !== "}")
      continue;
    depth -= 1;
    if (depth !== 0)
      continue;
    if (index - start + 1 > maximumBytes) {
      throw new Error("YouTube configuration exceeded its reviewed byte limit");
    }
    try {
      return { value: JSON.parse(text.slice(start, index + 1)), end: index + 1 };
    } catch {
      return { value: undefined, end: index + 1 };
    }
  }
  throw new Error("YouTube configuration contained an unterminated object");
}
function parseYouTubeInitialDataHtml(html) {
  if (html.length > MAX_PROFILE_PAGE_BYTES) {
    throw new Error("YouTube profile page exceeded its reviewed byte limit");
  }
  const prefixes = [
    "var ytInitialData =",
    'window["ytInitialData"] =',
    "window['ytInitialData'] ="
  ];
  const candidates = new Map;
  for (const prefix of prefixes) {
    let offset = 0;
    while (offset < html.length) {
      const found = html.indexOf(prefix, offset);
      if (found < 0)
        break;
      const afterPrefix = found + prefix.length;
      let start = afterPrefix;
      while (start < html.length && /\s/u.test(html[start]))
        start += 1;
      if (html[start] !== "{") {
        offset = afterPrefix;
        continue;
      }
      const parsed = balancedJsonObject(html, start, MAX_PROFILE_PAGE_BYTES);
      if (isRecord(parsed.value)) {
        candidates.set(JSON.stringify(parsed.value), parsed.value);
      }
      offset = parsed.end;
    }
  }
  if (candidates.size !== 1) {
    throw new Error("YouTube profile page did not contain one strict initial-data object");
  }
  return candidates.values().next().value;
}
function ytcfgObjects(html) {
  if (html.length > MAX_CONFIG_BYTES)
    throw new Error("YouTube bootstrap exceeded its reviewed byte limit");
  const result = [];
  const prefix = "ytcfg.set(";
  let offset = 0;
  while (offset < html.length) {
    const found = html.indexOf(prefix, offset);
    if (found < 0)
      break;
    const candidate = found + prefix.length;
    let objectStart = candidate;
    while (objectStart < html.length && /\s/u.test(html[objectStart]))
      objectStart += 1;
    if (html[objectStart] === "{") {
      const parsed = balancedJsonObject(html, objectStart);
      if (isRecord(parsed.value))
        result.push(parsed.value);
      offset = parsed.end;
    } else {
      offset = candidate;
    }
  }
  if (result.length < 1)
    throw new Error("YouTube bootstrap omitted its ytcfg objects");
  return Object.freeze(result);
}
function uniqueConfigValue(configs, key) {
  const values = configs.filter((config) => Object.hasOwn(config, key)).map((config) => config[key]);
  if (values.length < 1)
    return;
  const encoded = new Set(values.map((value) => JSON.stringify(value)));
  if (encoded.size !== 1)
    throw new Error(`YouTube bootstrap contained conflicting ${key} values`);
  return values[0];
}
function optionalContextScalar(value, key, maximum) {
  const candidate = value[key];
  if (typeof candidate === "boolean")
    return candidate;
  if (typeof candidate === "number" && Number.isSafeInteger(candidate))
    return candidate;
  if (typeof candidate === "string" && candidate.length > 0 && candidate.length <= maximum && !/[\0\r]/u.test(candidate))
    return candidate;
  return;
}
function reviewedContext(value, clientName, clientVersion) {
  const source = record(value, "YouTube INNERTUBE_CONTEXT");
  const sourceClient = record(source.client, "YouTube INNERTUBE_CONTEXT.client");
  const client = { clientName, clientVersion };
  for (const [key, maximum] of [
    ["hl", 32],
    ["gl", 8],
    ["visitorData", 4096],
    ["platform", 64],
    ["clientFormFactor", 64],
    ["originalUrl", 2048],
    ["utcOffsetMinutes", 16],
    ["timeZone", 128],
    ["userAgent", 1024]
  ]) {
    const candidate = optionalContextScalar(sourceClient, key, maximum);
    if (candidate !== undefined)
      client[key] = candidate;
  }
  const sourceUser = isRecord(source.user) ? source.user : null;
  const user = {};
  if (sourceUser !== null) {
    const lockedSafetyMode = sourceUser.lockedSafetyMode;
    if (typeof lockedSafetyMode === "boolean")
      user.lockedSafetyMode = lockedSafetyMode;
    const onBehalfOfUser = optionalBoundedString(sourceUser.onBehalfOfUser, 512);
    if (onBehalfOfUser !== null)
      user.onBehalfOfUser = onBehalfOfUser;
  }
  const sourceRequest = isRecord(source.request) ? source.request : null;
  const request = sourceRequest !== null && typeof sourceRequest.useSsl === "boolean" ? { useSsl: sourceRequest.useSsl } : undefined;
  return Object.freeze({
    client: Object.freeze(client),
    ...Object.keys(user).length === 0 ? {} : { user: Object.freeze(user) },
    ...request === undefined ? {} : { request: Object.freeze(request) }
  });
}
function parseYouTubeBootstrapHtml(html) {
  const configs = ytcfgObjects(html);
  const apiKey = boundedString(uniqueConfigValue(configs, "INNERTUBE_API_KEY"), "YouTube INNERTUBE_API_KEY", 256);
  if (!/^[A-Za-z0-9_-]{20,256}$/u.test(apiKey)) {
    throw new Error("YouTube INNERTUBE_API_KEY had an invalid public-key shape");
  }
  const contextValue = uniqueConfigValue(configs, "INNERTUBE_CONTEXT");
  const contextRecord = record(contextValue, "YouTube INNERTUBE_CONTEXT");
  const contextClient = record(contextRecord.client, "YouTube INNERTUBE_CONTEXT.client");
  const clientName = boundedString(contextClient.clientName ?? uniqueConfigValue(configs, "INNERTUBE_CONTEXT_CLIENT_NAME"), "YouTube client name", 64);
  if (!/^[A-Z][A-Z0-9_]{1,63}$/u.test(clientName))
    throw new Error("YouTube client name is invalid");
  const clientVersion = boundedString(contextClient.clientVersion ?? uniqueConfigValue(configs, "INNERTUBE_CONTEXT_CLIENT_VERSION"), "YouTube client version", 128);
  if (!/^[A-Za-z0-9._-]{3,128}$/u.test(clientVersion))
    throw new Error("YouTube client version is invalid");
  const clientNameHeader = boundedIntegerString(uniqueConfigValue(configs, "INNERTUBE_CONTEXT_CLIENT_NAME"), "YouTube numeric client name");
  const loggedIn = uniqueConfigValue(configs, "LOGGED_IN");
  if (typeof loggedIn !== "boolean")
    throw new Error("YouTube bootstrap omitted its login-state flag");
  const sessionIndex = boundedIntegerString(uniqueConfigValue(configs, "SESSION_INDEX") ?? 0, "YouTube session index");
  const delegatedSessionId = optionalBoundedString(uniqueConfigValue(configs, "DELEGATED_SESSION_ID"), 512);
  const context = reviewedContext(contextRecord, clientName, clientVersion);
  const visitorData = optionalBoundedString(context.client.visitorData, 4096);
  return Object.freeze({
    apiKey,
    bootstrapLoggedIn: loggedIn,
    clientName,
    clientNameHeader,
    clientVersion,
    context,
    sessionIndex,
    delegatedSessionId,
    visitorData
  });
}
function createYouTubeSapisidAuthorization(sapisid, nowMs, origin = YOUTUBE_ORIGIN) {
  if (origin !== YOUTUBE_ORIGIN)
    throw new Error("YouTube SAPISIDHASH origin is not reviewed");
  if (typeof sapisid !== "string" || sapisid.length < 8 || sapisid.length > 4096 || /[\0\r\n\s]/u.test(sapisid))
    throw new Error("YouTube SAPISID cookie is invalid");
  if (!Number.isSafeInteger(nowMs) || nowMs < 0)
    throw new Error("YouTube authorization time is invalid");
  const timestamp = Math.floor(nowMs / 1000);
  const digest = createHash("sha1").update(`${timestamp} ${sapisid} ${origin}`, "utf8").digest("hex");
  return `SAPISIDHASH ${timestamp}_${digest}`;
}
function walkRecords(value, label) {
  const result = [];
  const stack = [{ value, depth: 0 }];
  let visited = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    visited += 1;
    if (visited > MAX_WALK_NODES)
      throw new Error(`${label} exceeded its reviewed node limit`);
    if (current.depth > MAX_WALK_DEPTH)
      throw new Error(`${label} exceeded its reviewed nesting limit`);
    if (Array.isArray(current.value)) {
      if (current.value.length > 1e4)
        throw new Error(`${label} contained an oversized array`);
      for (let index = current.value.length - 1;index >= 0; index -= 1) {
        stack.push({ value: current.value[index], depth: current.depth + 1 });
      }
      continue;
    }
    if (!isRecord(current.value))
      continue;
    result.push(current.value);
    const values = Object.values(current.value);
    for (let index = values.length - 1;index >= 0; index -= 1) {
      stack.push({ value: values[index], depth: current.depth + 1 });
    }
  }
  return Object.freeze(result);
}
function simpleText(value, maximum = 32768) {
  if (typeof value === "string")
    return optionalBoundedString(value, maximum);
  if (!isRecord(value))
    return null;
  const direct = optionalBoundedString(value.simpleText, maximum);
  if (direct !== null)
    return direct;
  if (!Array.isArray(value.runs) || value.runs.length > 1000)
    return null;
  let result = "";
  for (const run of value.runs) {
    if (!isRecord(run) || typeof run.text !== "string" || run.text.length > maximum)
      return null;
    result += run.text;
    if (result.length > maximum)
      return null;
  }
  return result.length > 0 ? result : null;
}
function channelIdFromEndpoint(value) {
  if (!isRecord(value))
    return null;
  const browse = isRecord(value.browseEndpoint) ? value.browseEndpoint : null;
  const candidate = browse?.browseId;
  return typeof candidate === "string" && /^UC[A-Za-z0-9_-]{22}$/u.test(candidate) ? candidate : null;
}
function canonicalYouTubePath(value) {
  if (!isRecord(value))
    return null;
  const command = isRecord(value.commandMetadata) ? value.commandMetadata : null;
  const web = command !== null && isRecord(command.webCommandMetadata) ? command.webCommandMetadata : null;
  const url = optionalBoundedString(web?.url, 2048);
  return url !== null && url.startsWith("/") && !url.startsWith("//") ? url : null;
}
function uniqueStrings(values, label) {
  const unique = [...new Set(values.filter((value) => value !== null))];
  if (unique.length > 1000)
    throw new Error(`${label} exceeded its reviewed identity limit`);
  return Object.freeze(unique);
}
function identityCandidates(value) {
  const records = walkRecords(value, "YouTube account response");
  return uniqueStrings(records.flatMap((item) => {
    const candidates = [];
    for (const key of ["channelId", "externalChannelId", "browseId"]) {
      const candidate = item[key];
      candidates.push(typeof candidate === "string" && /^UC[A-Za-z0-9_-]{22}$/u.test(candidate) ? candidate : null);
    }
    return candidates;
  }), "YouTube account response");
}
function selectedIdentityCandidates(value) {
  const selected = [];
  for (const item of walkRecords(value, "YouTube account list response")) {
    if (item.isSelected !== true && item.selected !== true && item.isCurrentAccount !== true)
      continue;
    selected.push(...identityCandidates(item));
  }
  return uniqueStrings(selected, "YouTube selected account response");
}
function selectedGaiaCandidates(value) {
  const selected = [];
  for (const item of walkRecords(value, "YouTube account list response")) {
    if (item.isSelected !== true && item.selected !== true && item.isCurrentAccount !== true)
      continue;
    for (const nested of walkRecords(item, "YouTube selected account")) {
      const candidate = nested.obfuscatedGaiaId ?? nested.gaiaId;
      if (typeof candidate === "string" && /^[0-9]{1,32}$/u.test(candidate)) {
        selected.push(candidate);
      }
    }
  }
  return uniqueStrings(selected, "YouTube selected Gaia account");
}
function youtubeCurrentSubject(accountMenu, accountsList, delegatedSessionId = null) {
  assertYouTubeResponseSuccess(accountMenu, "YouTube account menu");
  assertYouTubeResponseSuccess(accountsList, "YouTube accounts list");
  const menuCandidates = identityCandidates(accountMenu);
  const selectedCandidates = selectedIdentityCandidates(accountsList);
  const listCandidates = selectedCandidates.length > 0 ? selectedCandidates : identityCandidates(accountsList);
  const intersection = menuCandidates.filter((candidate) => listCandidates.includes(candidate));
  const candidates = intersection.length > 0 ? uniqueStrings(intersection, "YouTube current account") : menuCandidates.length === 1 && listCandidates.length === 0 ? menuCandidates : listCandidates.length === 1 && menuCandidates.length === 0 ? listCandidates : [];
  if (candidates.length !== 1) {
    throw new Error("YouTube account endpoints did not bind one unique current channel");
  }
  const gaiaCandidates = selectedGaiaCandidates(accountsList);
  if (gaiaCandidates.length > 1) {
    throw new Error("YouTube accounts list did not bind one unique selected Gaia account");
  }
  if (delegatedSessionId !== null && !/^[A-Za-z0-9_-]{1,128}$/u.test(delegatedSessionId))
    throw new Error("YouTube bootstrap exposed an invalid delegated-session identity");
  return [
    `youtube:channel:${candidates[0]}`,
    ...gaiaCandidates.length === 0 ? [] : [`gaia:${gaiaCandidates[0]}`],
    ...delegatedSessionId === null ? [] : [`delegate:${delegatedSessionId}`]
  ].join("/");
}
function assertYouTubeResponseSuccess(value, label) {
  const envelope = record(value, `${label} response`);
  if (envelope.error !== undefined)
    throw new Error(`${label} response contained an API error`);
  for (const item of walkRecords(envelope.alerts, `${label} alerts`)) {
    if (item.type === "ERROR")
      throw new Error(`${label} response contained an error alert`);
  }
  return envelope;
}
function exactYouTubePublicUrl(value, _label) {
  if (typeof value !== "string" || value.length < 1 || value.length > 2048 || /[\0\r\n]/u.test(value)) {
    return null;
  }
  const candidate = value.startsWith("https://") ? value : value.startsWith("www.youtube.com/") || value.startsWith("youtube.com/") ? `https://${value}` : value.startsWith("/") && !value.startsWith("//") ? `${YOUTUBE_ORIGIN}${value}` : null;
  if (candidate === null)
    return null;
  let url;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.origin !== YOUTUBE_ORIGIN || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "")
    return null;
  const path = url.pathname.replace(/\/$/u, "");
  if (!/^\/@[A-Za-z0-9._-]{2,64}$/u.test(path) && !/^\/channel\/UC[A-Za-z0-9_-]{22}$/u.test(path))
    return null;
  return `${YOUTUBE_ORIGIN}${path}`;
}
function youtubeProfileTarget(value) {
  const input = boundedString(value, "input.profile", 2048);
  const candidate = input.startsWith("@") ? `${YOUTUBE_ORIGIN}/${input}` : input;
  const url = exactYouTubePublicUrl(candidate, "input.profile");
  if (url === null) {
    throw new Error("input.profile must be an exact @handle or canonical YouTube channel URL");
  }
  const pathname = new URL(url).pathname;
  const handle = pathname.startsWith("/@") ? pathname.slice(2) : null;
  const channelId = pathname.startsWith("/channel/") ? pathname.slice("/channel/".length) : null;
  return Object.freeze({ url, handle, channelId });
}
function youtubeHandleFromUrl(value) {
  const path = new URL(value).pathname;
  return path.startsWith("/@") ? path.slice(2) : null;
}
function youtubeProfileBrowseRequest(value, target) {
  assertYouTubeResponseSuccess(value, "YouTube profile URL resolution");
  const candidates = new Map;
  for (const item of walkRecords(value, "YouTube profile URL resolution")) {
    const browse = isRecord(item.browseEndpoint) ? item.browseEndpoint : null;
    const browseId = browse?.browseId;
    if (typeof browseId !== "string" || !/^UC[A-Za-z0-9_-]{22}$/u.test(browseId))
      continue;
    const params = browse?.params;
    if (typeof params !== "string" || params.length < 1 || params.length > 4096 || /[\0\r\n]/u.test(params))
      continue;
    if (target.channelId !== null) {
      if (browseId === target.channelId) {
        candidates.set(`${browseId}\x00${params}`, Object.freeze({ browseId, params }));
      }
      continue;
    }
    candidates.set(`${browseId}\x00${params}`, Object.freeze({ browseId, params }));
  }
  if (candidates.size !== 1) {
    throw new Error("YouTube profile URL resolution did not bind one exact channel");
  }
  const candidate = candidates.values().next().value;
  return Object.freeze({ browseId: candidate.browseId });
}
function exactEnglishCount(value, singular, plural) {
  const text = simpleText(value, 128);
  if (text === null)
    return null;
  if (text === `No ${plural}`)
    return 0;
  const match = new RegExp(`^((?:0|[1-9][0-9]{0,2}(?:,[0-9]{3})*)) (?:${singular}|${plural})$`, "u").exec(text);
  if (match === null)
    return null;
  const number = Number(match[1].replaceAll(",", ""));
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}
function uniqueMetadataRenderer(value, expectedChannelId) {
  const candidates = walkRecords(value, "YouTube profile response").filter((item) => item.externalId === expectedChannelId && typeof item.title === "string" && (Object.hasOwn(item, "vanityChannelUrl") || Object.hasOwn(item, "description")));
  const signatures = new Map(candidates.map((item) => [JSON.stringify(item), item]));
  if (signatures.size !== 1) {
    throw new Error("YouTube profile response did not bind one exact channel metadata renderer");
  }
  return signatures.values().next().value;
}
function exactYouTubeResponsePublicUrl(value) {
  const normalized = typeof value === "string" && value.startsWith("http://www.youtube.com/") ? `https://${value.slice("http://".length)}` : value;
  return exactYouTubePublicUrl(normalized, "YouTube response canonical URL");
}
function uniqueAboutViewModel(value, expectedChannelId, expectedHandle) {
  const candidates = walkRecords(value, "YouTube profile response").filter((item) => {
    if (!Object.hasOwn(item, "videoCountText") || !Object.hasOwn(item, "viewCountText"))
      return false;
    if (item.channelId !== expectedChannelId)
      return false;
    const modelUrl = exactYouTubeResponsePublicUrl(item.canonicalChannelUrl);
    if (modelUrl === null)
      return false;
    const modelHandle = youtubeHandleFromUrl(modelUrl);
    return expectedHandle === null || modelHandle?.toLocaleLowerCase("en-US") === expectedHandle.toLocaleLowerCase("en-US");
  });
  const signatures = new Map(candidates.map((item) => [JSON.stringify({
    channelId: item.channelId,
    canonicalChannelUrl: exactYouTubeResponsePublicUrl(item.canonicalChannelUrl),
    subscriberCountText: simpleText(item.subscriberCountText, 128),
    videoCountText: simpleText(item.videoCountText, 128),
    viewCountText: simpleText(item.viewCountText, 128)
  }), item]));
  if (signatures.size > 1) {
    throw new Error("YouTube profile response contained conflicting exact about statistics");
  }
  return signatures.size === 0 ? null : signatures.values().next().value;
}
function projectYouTubeProfile(value, expectedChannelId, expectedHandle = null) {
  assertYouTubeResponseSuccess(value, "YouTube profile");
  if (!/^UC[A-Za-z0-9_-]{22}$/u.test(expectedChannelId)) {
    throw new Error("Expected YouTube channel ID is invalid");
  }
  if (expectedHandle !== null && !/^[A-Za-z0-9._-]{2,64}$/u.test(expectedHandle)) {
    throw new Error("Expected YouTube handle is invalid");
  }
  const metadata = uniqueMetadataRenderer(value, expectedChannelId);
  const displayName = boundedString(metadata.title, "YouTube profile title", 256);
  const metadataUrl = exactYouTubePublicUrl(metadata.vanityChannelUrl, "YouTube profile canonical URL");
  const metadataHandle = metadataUrl === null ? null : youtubeHandleFromUrl(metadataUrl);
  if (expectedHandle !== null && metadataHandle !== null && metadataHandle.toLocaleLowerCase("en-US") !== expectedHandle.toLocaleLowerCase("en-US"))
    throw new Error("YouTube profile metadata did not bind the requested handle");
  const about = uniqueAboutViewModel(value, expectedChannelId, expectedHandle);
  const aboutUrl = about === null ? null : exactYouTubeResponsePublicUrl(about.canonicalChannelUrl);
  const canonicalUrl = expectedHandle === null ? metadataUrl ?? aboutUrl ?? `${YOUTUBE_ORIGIN}/channel/${expectedChannelId}` : `${YOUTUBE_ORIGIN}/@${expectedHandle}`;
  return Object.freeze({
    channelId: expectedChannelId,
    canonicalUrl,
    handle: expectedHandle ?? youtubeHandleFromUrl(canonicalUrl),
    displayName,
    bio: optionalBoundedString(metadata.description, 4096),
    subscribers: exactEnglishCount(about?.subscriberCountText, "subscriber", "subscribers"),
    videos: exactEnglishCount(about?.videoCountText, "video", "videos"),
    views: exactEnglishCount(about?.viewCountText, "view", "views")
  });
}
function projectionFromRenderer(renderer) {
  const videoId = optionalBoundedString(renderer.videoId, 64);
  const playlistId = optionalBoundedString(renderer.playlistId, 256);
  const postId = optionalBoundedString(renderer.postId, 256);
  const directChannelId = optionalBoundedString(renderer.channelId, 64);
  const kind = videoId !== null && /^[A-Za-z0-9_-]{11}$/u.test(videoId) ? "video" : playlistId !== null && /^[A-Za-z0-9_-]{2,256}$/u.test(playlistId) ? "playlist" : postId !== null && /^[A-Za-z0-9_-]{10,256}$/u.test(postId) ? "post" : directChannelId !== null && /^UC[A-Za-z0-9_-]{22}$/u.test(directChannelId) ? "channel" : null;
  if (kind === null)
    return null;
  const id = kind === "video" ? videoId : kind === "playlist" ? playlistId : kind === "post" ? postId : directChannelId;
  const ownerEndpoint = isRecord(renderer.ownerText) && Array.isArray(renderer.ownerText.runs) ? renderer.ownerText.runs.find(isRecord)?.navigationEndpoint ?? null : null;
  const authorEndpoint = isRecord(renderer.authorText) && Array.isArray(renderer.authorText.runs) ? renderer.authorText.runs.find(isRecord)?.navigationEndpoint ?? null : null;
  const channelId = kind === "channel" ? id : channelIdFromEndpoint(ownerEndpoint) ?? channelIdFromEndpoint(authorEndpoint) ?? optionalBoundedString(renderer.channelId, 64);
  const title = simpleText(renderer.title) ?? simpleText(renderer.headline) ?? simpleText(renderer.contentText) ?? simpleText(renderer.name);
  const endpoint = renderer.navigationEndpoint ?? renderer.endpoint;
  const url = canonicalYouTubePath(endpoint) ?? (kind === "video" ? `/watch?v=${id}` : kind === "channel" ? `/channel/${id}` : null);
  return Object.freeze({
    kind,
    id,
    title,
    url,
    channelId: channelId !== null && /^UC[A-Za-z0-9_-]{22}$/u.test(channelId) ? channelId : null,
    channelName: simpleText(renderer.ownerText) ?? simpleText(renderer.shortBylineText) ?? simpleText(renderer.longBylineText) ?? simpleText(renderer.authorText),
    description: simpleText(renderer.descriptionSnippet, 4096) ?? simpleText(renderer.descriptionText, 4096) ?? simpleText(renderer.contentText, 4096),
    published: simpleText(renderer.publishedTimeText, 256),
    duration: simpleText(renderer.lengthText, 256),
    views: simpleText(renderer.viewCountText, 256) ?? simpleText(renderer.shortViewCountText, 256)
  });
}
function projectYouTubeItems(value, limit) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("YouTube projection limit must be between 1 and 100");
  }
  const records = walkRecords(value, "YouTube browse response");
  const items = [];
  const seen = new Set;
  for (const item of records) {
    const renderer = Object.entries(item).filter(([key2, candidate]) => key2.endsWith("Renderer") && isRecord(candidate)).map(([, candidate]) => candidate).find((candidate) => projectionFromRenderer(candidate) !== null);
    const projection = renderer === undefined ? projectionFromRenderer(item) : projectionFromRenderer(renderer);
    if (projection === null)
      continue;
    const key = `${projection.kind}:${projection.id}`;
    if (seen.has(key))
      continue;
    seen.add(key);
    items.push(projection);
  }
  const continuations = uniqueStrings(records.map((item) => {
    const command = isRecord(item.continuationCommand) ? item.continuationCommand : null;
    const token = optionalBoundedString(command?.token, 8192);
    return token;
  }), "YouTube continuation");
  return Object.freeze({
    items: Object.freeze(items.slice(0, limit)),
    continuation: continuations[0] ?? null,
    truncated: items.length > limit || continuations.length > 0
  });
}
function projectYouTubeMedia(value, expectedVideoId) {
  const envelope = assertYouTubeResponseSuccess(value, "YouTube player");
  const details = record(envelope.videoDetails, "YouTube player.videoDetails");
  if (details.videoId !== expectedVideoId)
    throw new Error("YouTube player response did not bind the requested video");
  const microformat = isRecord(envelope.microformat) && isRecord(envelope.microformat.playerMicroformatRenderer) ? envelope.microformat.playerMicroformatRenderer : {};
  const keywords = Array.isArray(details.keywords) ? details.keywords.filter((item) => typeof item === "string" && item.length > 0 && item.length <= 256).slice(0, 100) : [];
  const countries = Array.isArray(microformat.availableCountries) ? microformat.availableCountries.filter((item) => typeof item === "string" && /^[A-Z]{2}$/u.test(item)).slice(0, 300) : [];
  const playability = isRecord(envelope.playabilityStatus) ? envelope.playabilityStatus : {};
  return Object.freeze({
    videoId: expectedVideoId,
    title: optionalBoundedString(details.title, 1024),
    channelId: optionalBoundedString(details.channelId, 64),
    author: optionalBoundedString(details.author, 512),
    lengthSeconds: optionalBoundedString(details.lengthSeconds, 32),
    viewCount: optionalBoundedString(details.viewCount, 32),
    shortDescription: optionalBoundedString(details.shortDescription, 16384),
    keywords: Object.freeze(keywords),
    isLiveContent: details.isLiveContent === true,
    playability: optionalBoundedString(playability.status, 64),
    publishDate: optionalBoundedString(microformat.publishDate, 64),
    uploadDate: optionalBoundedString(microformat.uploadDate, 64),
    category: optionalBoundedString(microformat.category, 256),
    familySafe: microformat.isFamilySafe === true,
    availableCountries: Object.freeze(countries)
  });
}
function attachmentKinds(renderer) {
  const keys = new Set;
  for (const item of walkRecords(renderer, "YouTube Community post")) {
    for (const key of Object.keys(item)) {
      if (key === "backstageImageRenderer" || key === "imageRenderer")
        keys.add("image");
      if (key === "videoRenderer")
        keys.add("video");
      if (key === "pollRenderer" || key === "backstagePollRenderer")
        keys.add("poll");
      if (key === "playlistRenderer")
        keys.add("playlist");
      if (key === "quizRenderer")
        keys.add("quiz");
    }
  }
  return Object.freeze([...keys].sort());
}
function projectYouTubePost(value, expectedPostId) {
  assertYouTubeResponseSuccess(value, "YouTube Community post");
  const renderers = [];
  for (const item of walkRecords(value, "YouTube Community post response")) {
    for (const key of ["backstagePostRenderer", "postRenderer"]) {
      if (isRecord(item[key]) && item[key].postId === expectedPostId)
        renderers.push(item[key]);
    }
  }
  if (renderers.length !== 1)
    throw new Error("YouTube Community response did not bind one exact requested post");
  const renderer = renderers[0];
  const body = simpleText(renderer.contentText, 16384) ?? simpleText(renderer.content, 16384);
  if (body === null)
    throw new Error("YouTube Community post omitted its bounded body");
  const authorRun = isRecord(renderer.authorText) && Array.isArray(renderer.authorText.runs) ? renderer.authorText.runs.find(isRecord) : undefined;
  return Object.freeze({
    id: expectedPostId,
    authorChannelId: channelIdFromEndpoint(authorRun?.navigationEndpoint),
    author: simpleText(renderer.authorText, 512),
    body,
    published: simpleText(renderer.publishedTimeText, 256),
    likes: simpleText(renderer.voteCount, 256) ?? simpleText(renderer.likeCount, 256),
    attachmentKinds: attachmentKinds(renderer)
  });
}
function youtubePostBrowseRequest(value, expectedPostId) {
  assertYouTubeResponseSuccess(value, "YouTube Community URL resolution");
  const expectedPath = `/post/${expectedPostId}`;
  const candidates = [];
  for (const item of walkRecords(value, "YouTube Community URL resolution")) {
    const endpoint = isRecord(item.endpoint) ? item.endpoint : item;
    const browse = isRecord(endpoint.browseEndpoint) ? endpoint.browseEndpoint : null;
    if (browse === null)
      continue;
    const command = isRecord(endpoint.commandMetadata) ? endpoint.commandMetadata : null;
    const web = command !== null && isRecord(command.webCommandMetadata) ? command.webCommandMetadata : null;
    const returnedPath = optionalBoundedString(web?.url, 2048);
    const browseId = optionalBoundedString(browse.browseId, 256);
    const params = optionalBoundedString(browse.params, 8192);
    if (returnedPath !== expectedPath || browseId === null || params === null)
      continue;
    if (!/^[A-Za-z0-9_-]{2,256}$/u.test(browseId) || !/^[A-Za-z0-9_=-]{8,8192}$/u.test(params)) {
      throw new Error("YouTube Community URL resolution returned an invalid browse binding");
    }
    candidates.push({ browseId, params });
  }
  const unique = new Map(candidates.map((candidate) => [
    `${candidate.browseId}\x00${candidate.params}`,
    candidate
  ]));
  if (unique.size !== 1) {
    throw new Error("YouTube Community URL resolution did not bind one exact post browse request");
  }
  return Object.freeze(unique.values().next().value);
}
function commentProjection(renderer) {
  const id = optionalBoundedString(renderer.commentId, 256);
  if (id === null || !/^[A-Za-z0-9_.-]{8,256}$/u.test(id))
    return null;
  const body = simpleText(renderer.contentText, 16384) ?? simpleText(renderer.commentText, 16384) ?? simpleText(renderer.content, 16384);
  if (body === null)
    return null;
  const authorRun = isRecord(renderer.authorText) && Array.isArray(renderer.authorText.runs) ? renderer.authorText.runs.find(isRecord) : undefined;
  const parentId = optionalBoundedString(renderer.parentCommentId, 256);
  return Object.freeze({
    id,
    parentId,
    authorChannelId: channelIdFromEndpoint(renderer.authorEndpoint) ?? channelIdFromEndpoint(authorRun?.navigationEndpoint),
    author: simpleText(renderer.authorText, 512),
    body,
    published: simpleText(renderer.publishedTimeText, 256),
    votes: simpleText(renderer.voteCount, 256),
    heartedByCreator: renderer.isHearted === true || isRecord(renderer.creatorHeart) || isRecord(renderer.creatorHeartButton),
    pinned: renderer.pinnedCommentBadge !== undefined || renderer.isPinned === true
  });
}
function entityCommentProjection(payload) {
  const properties = isRecord(payload.properties) ? payload.properties : null;
  const author = isRecord(payload.author) ? payload.author : null;
  const toolbar = isRecord(payload.toolbar) ? payload.toolbar : null;
  if (properties === null)
    return null;
  const id = optionalBoundedString(properties.commentId, 256);
  if (id === null || !/^[A-Za-z0-9_.-]{8,256}$/u.test(id))
    return null;
  const content = isRecord(properties.content) ? properties.content : null;
  const body = simpleText(properties.content, 16384) ?? optionalBoundedString(content?.content, 16384);
  if (body === null)
    return null;
  const channelId = optionalBoundedString(author?.channelId, 64);
  const parentId = optionalBoundedString(properties.parentCommentId, 256);
  return Object.freeze({
    id,
    parentId: parentId !== null && /^[A-Za-z0-9_.-]{8,256}$/u.test(parentId) ? parentId : null,
    authorChannelId: channelId !== null && /^UC[A-Za-z0-9_-]{22}$/u.test(channelId) ? channelId : null,
    author: optionalBoundedString(author?.displayName, 512),
    body,
    published: optionalBoundedString(properties.publishedTime, 256),
    votes: optionalBoundedString(toolbar?.likeCountNotliked, 256) ?? optionalBoundedString(toolbar?.likeCountLiked, 256),
    heartedByCreator: toolbar?.heartState === "TOOLBAR_HEART_STATE_HEARTED",
    pinned: properties.isPinned === true
  });
}
function projectYouTubeComments(value, limit) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("YouTube comment limit must be between 1 and 100");
  }
  assertYouTubeResponseSuccess(value, "YouTube comments");
  const records = walkRecords(value, "YouTube comments response");
  const comments = [];
  const seen = new Set;
  for (const item of records) {
    const entity = isRecord(item.commentEntityPayload) ? entityCommentProjection(item.commentEntityPayload) : null;
    const projected = entity ?? [
      isRecord(item.commentRenderer) ? item.commentRenderer : null,
      isRecord(item.commentViewModel) ? item.commentViewModel : null,
      item
    ].map((candidate) => candidate === null ? null : commentProjection(candidate)).find((candidate) => candidate !== null);
    if (projected === undefined || seen.has(projected.id))
      continue;
    seen.add(projected.id);
    comments.push(projected);
  }
  const continuations = uniqueStrings(records.map((item) => {
    const command = isRecord(item.continuationCommand) ? item.continuationCommand : null;
    return optionalBoundedString(command?.token, 8192);
  }), "YouTube comments continuation");
  return Object.freeze({
    comments: Object.freeze(comments.slice(0, limit)),
    continuation: continuations[0] ?? null,
    truncated: comments.length > limit || continuations.length > 0
  });
}
function findYouTubeCommentsContinuation(value) {
  for (const item of walkRecords(value, "YouTube next response")) {
    const section = isRecord(item.itemSectionRenderer) ? item.itemSectionRenderer : null;
    const targetId = optionalBoundedString(section?.targetId, 256);
    if (section === null || targetId === null || !targetId.includes("comment"))
      continue;
    const tokens = uniqueStrings(walkRecords(section, "YouTube comments section").map((recordValue) => {
      const command = isRecord(recordValue.continuationCommand) ? recordValue.continuationCommand : null;
      return optionalBoundedString(command?.token, 8192);
    }), "YouTube comments section continuation");
    if (tokens.length > 1)
      throw new Error("YouTube comments section exposed ambiguous continuations");
    if (tokens.length === 1)
      return tokens[0];
  }
  return null;
}
function assertYouTubeVideoBinding(value, expectedVideoId, label) {
  const matches = new Set;
  for (const item of walkRecords(value, label)) {
    for (const key of ["videoId", "currentVideoId"]) {
      const candidate = item[key];
      if (typeof candidate === "string" && /^[A-Za-z0-9_-]{11}$/u.test(candidate))
        matches.add(candidate);
    }
  }
  if (!matches.has(expectedVideoId))
    throw new Error(`${label} did not bind the requested video`);
}
function youtubeLikeState(value, expectedVideoId) {
  assertYouTubeResponseSuccess(value, "YouTube like readback");
  assertYouTubeVideoBinding(value, expectedVideoId, "YouTube like readback");
  const states = new Set;
  for (const item of walkRecords(value, "YouTube like readback")) {
    const icon = isRecord(item.defaultIcon) ? item.defaultIcon.iconType : isRecord(item.icon) ? item.icon.iconType : null;
    if (icon === "LIKE" && typeof item.isToggled === "boolean")
      states.add(item.isToggled);
    if (item.likeStatus === "LIKE")
      states.add(true);
    if (item.likeStatus === "INDIFFERENT")
      states.add(false);
  }
  if (states.size !== 1)
    throw new Error("YouTube like readback did not expose one exact state");
  return states.values().next().value;
}
function exactOpaqueParams(value, label) {
  const params = boundedString(value, label, 8192);
  if (!/^[A-Za-z0-9_=%-]{8,8192}$/u.test(params)) {
    throw new Error(`${label} had an invalid first-party parameter shape`);
  }
  return params;
}
function youtubeLikeMutationRequest(value, expectedVideoId, desired) {
  assertYouTubeResponseSuccess(value, "YouTube like command discovery");
  assertYouTubeVideoBinding(value, expectedVideoId, "YouTube like command discovery");
  const apiUrl = desired ? "/youtubei/v1/like/like" : "/youtubei/v1/like/removelike";
  const expectedStatus = desired ? "LIKE" : "INDIFFERENT";
  const paramsKey = desired ? "likeParams" : "removeLikeParams";
  const candidates = [];
  const likeControls = [];
  for (const item of walkRecords(value, "YouTube like-control discovery")) {
    const primary = isRecord(item.videoPrimaryInfoRenderer) ? item.videoPrimaryInfoRenderer : null;
    const actions = primary !== null && isRecord(primary.videoActions) ? primary.videoActions : null;
    const menu = actions !== null && isRecord(actions.menuRenderer) ? actions.menuRenderer : null;
    if (!Array.isArray(menu?.topLevelButtons) || menu.topLevelButtons.length > 100)
      continue;
    for (const button of menu.topLevelButtons) {
      if (!isRecord(button))
        continue;
      const modern = isRecord(button.segmentedLikeDislikeButtonViewModel) ? button.segmentedLikeDislikeButtonViewModel : null;
      const legacy = isRecord(button.segmentedLikeDislikeButtonRenderer) ? button.segmentedLikeDislikeButtonRenderer : null;
      if (modern !== null && modern.likeButtonViewModel !== undefined) {
        likeControls.push(modern.likeButtonViewModel);
      }
      if (legacy !== null && legacy.likeButton !== undefined)
        likeControls.push(legacy.likeButton);
    }
  }
  for (const root of likeControls) {
    for (const item of walkRecords(root, "YouTube like control")) {
      const command = isRecord(item.commandMetadata) ? item.commandMetadata : null;
      const web = command !== null && isRecord(command.webCommandMetadata) ? command.webCommandMetadata : null;
      const payload = isRecord(item.likeEndpoint) ? item.likeEndpoint : null;
      if (web?.apiUrl !== apiUrl || payload === null)
        continue;
      const target = record(payload.target, "YouTube like command target");
      if (target.videoId !== expectedVideoId || payload.status !== expectedStatus)
        continue;
      candidates.push(Object.freeze({
        status: expectedStatus,
        target: Object.freeze({ videoId: expectedVideoId }),
        [paramsKey]: exactOpaqueParams(payload[paramsKey], `YouTube ${paramsKey}`)
      }));
    }
  }
  const unique = new Map(candidates.map((candidate) => [JSON.stringify(candidate), candidate]));
  if (unique.size !== 1)
    throw new Error("YouTube did not expose one exact current like command");
  return Object.freeze({
    endpoint: desired ? "like/like" : "like/removelike",
    body: unique.values().next().value
  });
}
function youtubeWatchLaterState(value, expectedVideoId) {
  assertYouTubeResponseSuccess(value, "YouTube save readback");
  assertYouTubeVideoBinding(value, expectedVideoId, "YouTube save readback");
  const states = new Set;
  for (const item of walkRecords(value, "YouTube save readback")) {
    if (item.playlistId !== "WL")
      continue;
    if (!Array.isArray(item.actions) || item.actions.length > 100)
      continue;
    for (const action of item.actions) {
      if (!isRecord(action))
        continue;
      if (action.action === "ACTION_ADD_VIDEO" && action.addedVideoId === expectedVideoId) {
        states.add(false);
      }
      if (action.action === "ACTION_REMOVE_VIDEO" && action.removedVideoId === expectedVideoId) {
        states.add(true);
      }
    }
  }
  if (states.size !== 1)
    throw new Error("YouTube save readback did not expose one exact Watch Later state");
  return states.values().next().value;
}
function youtubeSubscriptionMutationRequest(value, expectedChannelId, desired) {
  assertYouTubeResponseSuccess(value, "YouTube subscription command discovery");
  const apiUrl = desired ? "/youtubei/v1/subscription/subscribe" : "/youtubei/v1/subscription/unsubscribe";
  const endpointKey = desired ? "subscribeEndpoint" : "unsubscribeEndpoint";
  const candidates = [];
  for (const item of walkRecords(value, "YouTube subscription command discovery")) {
    const command = isRecord(item.commandMetadata) ? item.commandMetadata : null;
    const web = command !== null && isRecord(command.webCommandMetadata) ? command.webCommandMetadata : null;
    const payload = isRecord(item[endpointKey]) ? item[endpointKey] : null;
    if (web?.apiUrl !== apiUrl || payload === null)
      continue;
    if (!Array.isArray(payload.channelIds) || payload.channelIds.length !== 1 || payload.channelIds[0] !== expectedChannelId)
      continue;
    candidates.push(Object.freeze({
      channelIds: Object.freeze([expectedChannelId]),
      params: exactOpaqueParams(payload.params, "YouTube subscription params")
    }));
  }
  const unique = new Map(candidates.map((candidate) => [JSON.stringify(candidate), candidate]));
  if (unique.size !== 1) {
    throw new Error("YouTube did not expose one exact current subscription command");
  }
  return Object.freeze({
    endpoint: desired ? "subscription/subscribe" : "subscription/unsubscribe",
    body: unique.values().next().value
  });
}
function youtubeSubscriptionState(value, expectedChannelId) {
  assertYouTubeResponseSuccess(value, "YouTube subscription readback");
  const channelIds = new Set;
  const entityStates = new Set;
  const legacyStates = new Set;
  for (const item of walkRecords(value, "YouTube subscription readback")) {
    for (const key of ["channelId", "externalId", "browseId"]) {
      const candidate = item[key];
      if (typeof candidate === "string" && /^UC[A-Za-z0-9_-]{22}$/u.test(candidate)) {
        channelIds.add(candidate);
      }
    }
    const stateEntity = isRecord(item.subscriptionStateEntity) ? item.subscriptionStateEntity : null;
    if (typeof stateEntity?.subscribed === "boolean")
      entityStates.add(stateEntity.subscribed);
    if (typeof item.subscribed === "boolean")
      legacyStates.add(item.subscribed);
    if (item.subscriptionState === "SUBSCRIBED")
      legacyStates.add(true);
    if (item.subscriptionState === "NOT_SUBSCRIBED")
      legacyStates.add(false);
  }
  if (!channelIds.has(expectedChannelId)) {
    throw new Error("YouTube subscription readback did not bind the requested channel");
  }
  const states = entityStates.size > 0 ? entityStates : legacyStates;
  if (states.size !== 1)
    throw new Error("YouTube subscription readback did not expose one exact state");
  return states.values().next().value;
}

// src/providers/youtube-web-runtime.ts
var YOUTUBE_ORIGIN2 = "https://www.youtube.com";
var MAX_BOOTSTRAP_BYTES = 2 * 1024 * 1024;
var MAX_PROFILE_PAGE_BYTES2 = 4 * 1024 * 1024;
var MAX_YOUTUBE_VIDEO_BYTES = 128 * 1024 * 1024;
var DEFAULT_LIMIT = 20;
var YOUTUBE_MP4_COMPATIBILITY_POLICY = Object.freeze({
  compatibleBrands: Object.freeze([
    "M4V ",
    "MSNV",
    "avc1",
    "iso2",
    "isom",
    "mp41",
    "mp42"
  ]),
  rejectedMajorBrands: Object.freeze(["qt  "])
});
var YOUTUBE_VIDEO_PUBLISH_BINDING_KEYS = Object.freeze([
  "ageRestricted",
  "byteLength",
  "bytes",
  "caption",
  "categoryId",
  "containsSyntheticMedia",
  "durationSeconds",
  "height",
  "madeForKids",
  "mediaSha256",
  "mediaType",
  "notifySubscribers",
  "title",
  "visibility",
  "width"
]);
var TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype);
var TYPED_ARRAY_BUFFER_GETTER = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTOTYPE, "buffer")?.get;
var TYPED_ARRAY_BYTE_LENGTH_GETTER = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTOTYPE, "byteLength")?.get;

class YouTubeAuthRepairRequiredError extends Error {
  constructor() {
    super("YouTube selected session is not signed in");
    this.name = "YouTubeAuthRepairRequiredError";
  }
}
function exactYouTubeVideoPublishBinding(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("YouTube video binding must be one exact object");
  if (nodeTypes.isProxy(value)) {
    throw new Error("YouTube video binding must not be a proxy");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("YouTube video binding must use a plain prototype");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const ownKeys = Reflect.ownKeys(descriptors);
  if (ownKeys.length !== YOUTUBE_VIDEO_PUBLISH_BINDING_KEYS.length || ownKeys.some((key) => typeof key !== "string") || ownKeys.sort().join(",") !== [...YOUTUBE_VIDEO_PUBLISH_BINDING_KEYS].sort().join(","))
    throw new Error("YouTube video binding contained unsupported fields");
  const snapshot = Object.create(null);
  for (const key of YOUTUBE_VIDEO_PUBLISH_BINDING_KEYS) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw new Error("YouTube video binding must contain only enumerable data properties");
    }
    snapshot[key] = descriptor.value;
  }
  return Object.freeze(snapshot);
}
function snapshotYouTubeVideoBytes(value) {
  if (typeof value !== "object" || value === null || nodeTypes.isProxy(value) || !(value instanceof Uint8Array) || Object.getPrototypeOf(value) !== Uint8Array.prototype || TYPED_ARRAY_BUFFER_GETTER === undefined || TYPED_ARRAY_BYTE_LENGTH_GETTER === undefined)
    throw new Error("YouTube video binding must contain one bounded MP4");
  let buffer;
  let byteLength;
  try {
    buffer = TYPED_ARRAY_BUFFER_GETTER.call(value);
    byteLength = TYPED_ARRAY_BYTE_LENGTH_GETTER.call(value);
  } catch {
    throw new Error("YouTube video binding must contain one bounded MP4");
  }
  if (typeof byteLength !== "number" || !Number.isSafeInteger(byteLength) || byteLength < 24 || byteLength > MAX_YOUTUBE_VIDEO_BYTES || nodeTypes.isSharedArrayBuffer(buffer))
    throw new Error("YouTube video binding must contain one bounded MP4");
  const bytes = new Uint8Array(byteLength);
  try {
    Uint8Array.prototype.set.call(bytes, value);
  } catch {
    throw new Error("YouTube video binding must contain one bounded MP4");
  }
  return bytes;
}
var YOUTUBE_VIDEO_CAPTURE_REQUIRED_REASONS = Object.freeze({
  "content.delete": "cleanup only discarded the stalled incomplete Studio draft; no uploaded-video authored pre-read, accepted video/delete response, or exact-target absence readback was observed",
  "media.publish": "the signed-in Studio capture reached metadata JSON responses, but the selected MP4 remained at 0%; resumable initiation, byte-transfer acceptance, finalization, processing, and exact current-account readback remain unproved"
});
function boundedString2(value, label, maximum) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || /[\0\r]/u.test(value))
    throw new Error(`${label} must be a bounded string`);
  return value;
}
function stringInput(input, name, maximum) {
  return boundedString2(input[name], `input.${name}`, maximum);
}
function booleanInput(input, name) {
  const value = input[name];
  if (typeof value !== "boolean")
    throw new Error(`input.${name} must be boolean`);
  return value;
}
function exactInputKeys(input, required, optional, label) {
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(input);
  if (keys.some((key) => !allowed.has(key))) {
    throw new Error(`${label} contained an unsupported input field`);
  }
  if (required.some((key) => !Object.hasOwn(input, key))) {
    throw new Error(`${label} omitted a required input field`);
  }
}
function fileInput(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.keys(value).sort().join(",") !== "kind,reference" || value.kind !== "file" || typeof value.reference !== "string" || value.reference.length < 1 || value.reference.length > 4096 || /[\0\r\n]/u.test(value.reference))
    throw new Error(`${label} must be one plan-bound file`);
  return value;
}
function youtubeTitleInput(input, name) {
  const value = stringInput(input, name, 90);
  if (/\n/u.test(value))
    throw new Error(`input.${name} must be one exact YouTube title`);
  return value;
}
function youtubeVideoId(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{11}$/u.test(value)) {
    throw new Error(`${label} must be an exact YouTube video ID`);
  }
  return value;
}
function youtubeVideoWatchUrl(videoId) {
  return `${YOUTUBE_ORIGIN2}/watch?v=${videoId}`;
}
function youtubeMp4Metadata(bytes) {
  return isoBmffMp4VideoMetadata(bytes, "YouTube video", YOUTUBE_MP4_COMPATIBILITY_POLICY);
}
function youtubeVideoSha256(bytes) {
  return createHash2("sha256").update(bytes).digest("hex");
}
function youtubeVideoTargetIdentifier(videoIdValue) {
  const videoId = youtubeVideoId(videoIdValue, "YouTube canonical video target ID");
  return canonicalJson({
    schemaVersion: 1,
    url: youtubeVideoWatchUrl(videoId),
    videoId
  });
}
function parseYouTubeVideoTargetIdentifier(identifier) {
  if (typeof identifier !== "string" || identifier.length < 1 || identifier.length > 4096)
    throw new Error("YouTube canonical video target is not canonical JSON");
  let value;
  try {
    value = JSON.parse(identifier);
  } catch {
    throw new Error("YouTube canonical video target is not canonical JSON");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.keys(value).sort().join(",") !== "schemaVersion,url,videoId")
    throw new Error("YouTube canonical video target contained unsupported fields");
  const target = value;
  if (target.schemaVersion !== 1) {
    throw new Error("YouTube canonical video target schema version is unsupported");
  }
  const videoId = youtubeVideoId(target.videoId, "YouTube canonical video target ID");
  const parsed = Object.freeze({
    schemaVersion: 1,
    url: youtubeVideoWatchUrl(videoId),
    videoId
  });
  if (target.url !== parsed.url || canonicalJson(parsed) !== identifier) {
    throw new Error("YouTube canonical video target is not canonical");
  }
  return parsed;
}
function revalidateYouTubeVideoPublishBindingForDispatch(value) {
  const binding = exactYouTubeVideoPublishBinding(value);
  const bytes = snapshotYouTubeVideoBytes(binding.bytes);
  const metadata = youtubeMp4Metadata(bytes);
  const mediaSha256 = youtubeVideoSha256(bytes);
  const declaredByteLength = binding.byteLength;
  const declaredDurationSeconds = binding.durationSeconds;
  const declaredHeight = binding.height;
  const declaredMediaSha256 = binding.mediaSha256;
  const declaredWidth = binding.width;
  if (!Number.isSafeInteger(declaredByteLength) || declaredByteLength !== bytes.byteLength || typeof declaredMediaSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(declaredMediaSha256) || declaredMediaSha256 !== mediaSha256 || declaredDurationSeconds !== metadata.durationSeconds || declaredHeight !== metadata.height || declaredWidth !== metadata.width)
    throw new Error("YouTube video binding changed from its exact bytes");
  const ageRestricted = binding.ageRestricted;
  const containsSyntheticMedia = binding.containsSyntheticMedia;
  const madeForKids = binding.madeForKids;
  const mediaType = binding.mediaType;
  const notifySubscribers = binding.notifySubscribers;
  const visibility = binding.visibility;
  if (typeof ageRestricted !== "boolean" || typeof containsSyntheticMedia !== "boolean" || typeof madeForKids !== "boolean" || typeof notifySubscribers !== "boolean" || mediaType !== "video/mp4" || visibility !== "private" && visibility !== "unlisted" && visibility !== "public")
    throw new Error("YouTube video binding declarations are invalid");
  if (ageRestricted && madeForKids) {
    throw new Error("YouTube video cannot be both made for kids and creator age-restricted");
  }
  const categoryId = boundedString2(binding.categoryId, "YouTube video binding category ID", 3);
  if (!/^[1-9][0-9]{0,2}$/u.test(categoryId)) {
    throw new Error("YouTube video binding category ID must be exact");
  }
  const title = boundedString2(binding.title, "YouTube video binding title", 90);
  if (/\n/u.test(title)) {
    throw new Error("YouTube video binding title must be one exact title");
  }
  const caption = binding.caption === null ? null : boundedString2(binding.caption, "YouTube video binding caption", 1000);
  const body = new Blob([bytes], { type: "video/mp4" });
  if (body.size !== bytes.byteLength || body.type !== "video/mp4") {
    throw new Error("YouTube video dispatch snapshot changed shape");
  }
  return Object.freeze({
    ageRestricted,
    body,
    byteLength: bytes.byteLength,
    caption,
    categoryId,
    containsSyntheticMedia,
    durationSeconds: metadata.durationSeconds,
    height: metadata.height,
    madeForKids,
    mediaSha256,
    mediaType: "video/mp4",
    notifySubscribers,
    title,
    visibility,
    width: metadata.width
  });
}
async function materializeYouTubeVideoPublishInput(input, fileResolver, operationDeadline) {
  const required = [
    "age_restricted",
    "category_id",
    "contains_synthetic_media",
    "made_for_kids",
    "media",
    "notify_subscribers",
    "title",
    "visibility"
  ];
  exactInputKeys(input, required, ["caption"], "YouTube video publishing");
  const media = fileInput(input.media, "input.media");
  const title = youtubeTitleInput(input, "title");
  const caption = input.caption === undefined ? null : stringInput(input, "caption", 1000);
  const visibility = input.visibility;
  if (visibility !== "private" && visibility !== "unlisted" && visibility !== "public") {
    throw new Error("input.visibility must be private, unlisted, or public");
  }
  const madeForKids = booleanInput(input, "made_for_kids");
  const notifySubscribers = booleanInput(input, "notify_subscribers");
  const containsSyntheticMedia = booleanInput(input, "contains_synthetic_media");
  const ageRestricted = booleanInput(input, "age_restricted");
  if (madeForKids && ageRestricted) {
    throw new Error("YouTube video cannot be both made for kids and creator age-restricted");
  }
  const categoryId = stringInput(input, "category_id", 3);
  if (!/^[1-9][0-9]{0,2}$/u.test(categoryId)) {
    throw new Error("input.category_id must be an exact positive YouTube category ID");
  }
  if (fileResolver === undefined) {
    throw new Error("YouTube video upload requires the plan-bound file resolver");
  }
  const resolve = () => fileResolver([media]);
  const paths = operationDeadline === undefined ? await resolve() : await operationDeadline.run(resolve, "authenticated web operation deadline");
  operationDeadline?.throwIfUnavailable("authenticated web operation deadline");
  if (paths.length !== 1 || typeof paths[0] !== "string") {
    throw new Error("YouTube file resolver did not return one exact video path");
  }
  const noFollow = "O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0;
  const handle = operationDeadline === undefined ? await open(paths[0], constants.O_RDONLY | noFollow) : await operationDeadline.run(() => open(paths[0], constants.O_RDONLY | noFollow), "authenticated web operation deadline");
  try {
    const before = operationDeadline === undefined ? await handle.stat() : await operationDeadline.run(() => handle.stat(), "authenticated web operation deadline");
    if (!before.isFile() || before.size < 24 || before.size > MAX_YOUTUBE_VIDEO_BYTES) {
      throw new Error("YouTube video must be a regular MP4 no larger than the 128 MiB in-memory publish limit");
    }
    const fileBytes = operationDeadline === undefined ? await handle.readFile() : await operationDeadline.run(() => handle.readFile(), "authenticated web operation deadline");
    const after = operationDeadline === undefined ? await handle.stat() : await operationDeadline.run(() => handle.stat(), "authenticated web operation deadline");
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || fileBytes.byteLength !== before.size)
      throw new Error("YouTube video changed while it was materialized");
    const bytes = new Uint8Array(fileBytes);
    const metadata = youtubeMp4Metadata(bytes);
    const mediaSha256 = youtubeVideoSha256(bytes);
    return Object.freeze({
      ageRestricted,
      bytes,
      byteLength: bytes.byteLength,
      caption,
      categoryId,
      containsSyntheticMedia,
      durationSeconds: metadata.durationSeconds,
      height: metadata.height,
      madeForKids,
      mediaType: "video/mp4",
      mediaSha256,
      notifySubscribers,
      title,
      visibility,
      width: metadata.width
    });
  } finally {
    await handle.close();
  }
}
function prepareYouTubeVideoDeleteInput(input) {
  exactInputKeys(input, ["expected_title", "video_id"], [], "YouTube video deletion");
  return Object.freeze({
    expectedTitle: youtubeTitleInput(input, "expected_title"),
    videoId: youtubeVideoId(input.video_id, "input.video_id")
  });
}
function integerInput(input, name, fallback, minimum, maximum) {
  const value = input[name] ?? fallback;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`input.${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}
function videoIdInput(input) {
  const value = stringInput(input, "video_id", 11);
  if (!/^[A-Za-z0-9_-]{11}$/u.test(value))
    throw new Error("input.video_id must be an exact YouTube video ID");
  return value;
}
function postIdInput(input) {
  const value = stringInput(input, "post_id", 256);
  if (!/^[A-Za-z0-9_-]{10,256}$/u.test(value)) {
    throw new Error("input.post_id must be an exact YouTube Community post ID");
  }
  return value;
}
function channelIdInput(input) {
  const value = stringInput(input, "channel_id", 24);
  if (!/^UC[A-Za-z0-9_-]{22}$/u.test(value)) {
    throw new Error("input.channel_id must be an exact YouTube channel ID");
  }
  return value;
}
function sapisidCookie(client) {
  for (const name of ["SAPISID", "__Secure-3PAPISID", "__Secure-1PAPISID"]) {
    if (client.cookies.some((cookie) => cookie.name === name))
      return webSessionCookie(client.cookies, name);
  }
  throw new Error("YouTube signed-in session omitted its SAPISID cookie");
}
function requestHeaders(bootstrap) {
  const authorization = createYouTubeSapisidAuthorization(bootstrap.sapisid, bootstrap.now());
  return {
    accept: "application/json",
    authorization,
    "content-type": "application/json",
    origin: YOUTUBE_ORIGIN2,
    referer: `${YOUTUBE_ORIGIN2}/`,
    "x-goog-authuser": bootstrap.config.sessionIndex,
    ...bootstrap.config.delegatedSessionId === null ? {} : { "x-goog-pageid": bootstrap.config.delegatedSessionId },
    ...bootstrap.config.visitorData === null ? {} : { "x-goog-visitor-id": bootstrap.config.visitorData },
    "x-origin": YOUTUBE_ORIGIN2,
    "x-youtube-bootstrap-logged-in": String(bootstrap.config.bootstrapLoggedIn),
    "x-youtube-client-name": bootstrap.config.clientNameHeader,
    "x-youtube-client-version": bootstrap.config.clientVersion
  };
}
function endpointUrl(endpoint, apiKey) {
  const url = new URL(`/youtubei/v1/${endpoint}`, YOUTUBE_ORIGIN2);
  url.searchParams.set("prettyPrint", "false");
  url.searchParams.set("key", apiKey);
  return url;
}
async function innertube(bootstrap, endpoint, body, label) {
  const response = await bootstrap.client.requestJson({
    url: endpointUrl(endpoint, bootstrap.config.apiKey),
    method: "POST",
    headers: requestHeaders(bootstrap),
    body: JSON.stringify({ context: bootstrap.config.context, ...body }),
    expectedStatuses: [200],
    expectedContentTypes: ["application/json"],
    maxBytes: bootstrap.maxOutputBytes
  });
  assertYouTubeResponseSuccess(response, label);
  return response;
}
async function currentSubject(bootstrap) {
  const accountMenu = await innertube(bootstrap, "account/account_menu", {}, "YouTube account menu");
  const accountsList = await innertube(bootstrap, "account/accounts_list", {}, "YouTube accounts list");
  return youtubeCurrentSubject(accountMenu, accountsList, bootstrap.config.delegatedSessionId);
}
async function bootstrapYouTube(auth, options) {
  const client = await createWebSessionClient(YOUTUBE_ORIGIN2, auth, {
    timeoutMs: options.timeoutMs,
    ...options.signal === undefined ? {} : { signal: options.signal },
    ...options.operationDeadline === undefined ? {} : { operationDeadline: options.operationDeadline },
    ...options.dependencies === undefined ? {} : { dependencies: options.dependencies }
  });
  const html = await client.requestText({
    url: new URL("/", YOUTUBE_ORIGIN2),
    headers: { accept: "text/html" },
    expectedContentTypes: ["text/html"],
    maxBytes: MAX_BOOTSTRAP_BYTES
  });
  const config = parseYouTubeBootstrapHtml(html);
  if (config.bootstrapLoggedIn === false) {
    throw new YouTubeAuthRepairRequiredError;
  }
  const partial = {
    auth,
    client,
    config,
    sapisid: sapisidCookie(client),
    timeoutMs: options.timeoutMs,
    maxOutputBytes: options.maxOutputBytes,
    now: options.dependencies?.now ?? Date.now
  };
  const subject = await currentSubject(partial);
  return Object.freeze({ ...partial, subject });
}
function requireBoundSubject(bootstrap) {
  const expected = webSessionAuthSubject(bootstrap.auth);
  if (expected === null) {
    throw new Error("YouTube authenticated operations require a bound auth subject");
  }
  if (expected !== bootstrap.subject) {
    throw new Error("YouTube current account did not match the bound auth subject");
  }
  return expected;
}
async function probeYouTubeWebSubject(auth, options = {}) {
  const bootstrap = await bootstrapYouTube(auth, {
    timeoutMs: options.timeoutMs ?? 60000,
    maxOutputBytes: 2 * 1024 * 1024,
    ...options.signal === undefined ? {} : { signal: options.signal },
    ...options.dependencies === undefined ? {} : { dependencies: options.dependencies }
  });
  return bootstrap.subject;
}
var feedBrowseIds = Object.freeze({
  home: "FEwhat_to_watch",
  subscriptions: "FEsubscriptions",
  library: "FElibrary",
  history: "FEhistory",
  playlists: "FEplaylist_aggregation",
  "watch-later": "VLWL",
  liked: "VLLL"
});
function feedName(input) {
  const value = stringInput(input, "feed", 32);
  if (!Object.hasOwn(feedBrowseIds, value))
    throw new Error("input.feed must name a reviewed YouTube feed");
  return value;
}
async function executeFeed(bootstrap, input) {
  requireBoundSubject(bootstrap);
  const feed = feedName(input);
  const limit = integerInput(input, "limit", DEFAULT_LIMIT, 1, 100);
  const response = await innertube(bootstrap, "browse", { browseId: feedBrowseIds[feed] }, "YouTube feed");
  return {
    status: "succeeded",
    output: { feed, ...projectYouTubeItems(response, limit) },
    finalUrl: feed === "home" ? `${YOUTUBE_ORIGIN2}/` : feed === "subscriptions" ? `${YOUTUBE_ORIGIN2}/feed/subscriptions` : feed === "history" ? `${YOUTUBE_ORIGIN2}/feed/history` : feed === "watch-later" ? `${YOUTUBE_ORIGIN2}/playlist?list=WL` : feed === "liked" ? `${YOUTUBE_ORIGIN2}/playlist?list=LL` : `${YOUTUBE_ORIGIN2}/feed/you`,
    dispatchStarted: false,
    dispatch: { planned: 0, started: 0, verified: 0 }
  };
}
async function executeMediaRead(bootstrap, input) {
  requireBoundSubject(bootstrap);
  const videoId = videoIdInput(input);
  const response = await innertube(bootstrap, "player", { videoId, contentCheckOk: true, racyCheckOk: true }, "YouTube player");
  return {
    status: "succeeded",
    output: projectYouTubeMedia(response, videoId),
    finalUrl: `${YOUTUBE_ORIGIN2}/watch?v=${videoId}`,
    dispatchStarted: false,
    dispatch: { planned: 0, started: 0, verified: 0 }
  };
}
async function executePostRead(bootstrap, input) {
  requireBoundSubject(bootstrap);
  const postId = postIdInput(input);
  const resolved = await innertube(bootstrap, "navigation/resolve_url", { url: `${YOUTUBE_ORIGIN2}/post/${postId}` }, "YouTube Community URL resolution");
  const browse = youtubePostBrowseRequest(resolved, postId);
  const response = await innertube(bootstrap, "browse", browse, "YouTube Community post");
  return {
    status: "succeeded",
    output: projectYouTubePost(response, postId),
    finalUrl: `${YOUTUBE_ORIGIN2}/post/${postId}`,
    dispatchStarted: false,
    dispatch: { planned: 0, started: 0, verified: 0 }
  };
}
async function executeCommentsRead(bootstrap, input) {
  requireBoundSubject(bootstrap);
  const videoId = videoIdInput(input);
  const limit = integerInput(input, "limit", DEFAULT_LIMIT, 1, 100);
  const initial = await innertube(bootstrap, "next", { videoId }, "YouTube video comments bootstrap");
  assertYouTubeVideoBinding(initial, videoId, "YouTube video comments bootstrap");
  const continuation = findYouTubeCommentsContinuation(initial);
  const response = continuation === null ? initial : await innertube(bootstrap, "next", { continuation }, "YouTube comments");
  return {
    status: "succeeded",
    output: { videoId, ...projectYouTubeComments(response, limit) },
    finalUrl: `${YOUTUBE_ORIGIN2}/watch?v=${videoId}`,
    dispatchStarted: false,
    dispatch: { planned: 0, started: 0, verified: 0 }
  };
}
function exactProfileCount(value) {
  return value === null ? Object.freeze({ status: "unavailable", reason: "not-exposed" }) : Object.freeze({
    status: "available",
    value,
    precision: "exact",
    unit: "count"
  });
}
async function executeProfileRead(bootstrap, input) {
  requireBoundSubject(bootstrap);
  const target = youtubeProfileTarget(input.profile);
  const resolved = await innertube(bootstrap, "navigation/resolve_url", { url: target.url }, "YouTube profile URL resolution");
  const browse = youtubeProfileBrowseRequest(resolved, target);
  const html = await bootstrap.client.requestText({
    url: new URL(`${target.url}/about`),
    headers: { accept: "text/html" },
    expectedContentTypes: ["text/html"],
    maxBytes: Math.min(bootstrap.maxOutputBytes, MAX_PROFILE_PAGE_BYTES2)
  });
  const response = parseYouTubeInitialDataHtml(html);
  const profile = projectYouTubeProfile(response, browse.browseId, target.handle);
  if (target.handle !== null && profile.handle?.toLocaleLowerCase("en-US") !== target.handle.toLocaleLowerCase("en-US"))
    throw new Error("YouTube profile response did not bind the requested handle");
  const observationTime = bootstrap.now();
  if (!Number.isSafeInteger(observationTime) || observationTime < 0 || observationTime > 8640000000000000)
    throw new Error("YouTube profile observation time is invalid");
  const complete = profile.subscribers !== null && profile.videos !== null && profile.views !== null;
  return {
    status: "succeeded",
    output: Object.freeze({
      schemaVersion: 1,
      provider: "youtube",
      target: Object.freeze({
        kind: "profile",
        id: profile.channelId,
        url: profile.canonicalUrl
      }),
      observedAt: new Date(observationTime).toISOString(),
      completeness: complete ? "complete" : "partial",
      metrics: Object.freeze({
        subscribers: exactProfileCount(profile.subscribers),
        videos: exactProfileCount(profile.videos),
        views: exactProfileCount(profile.views)
      }),
      metadata: Object.freeze({
        ...profile.handle === null ? {} : { handle: profile.handle },
        displayName: profile.displayName,
        ...profile.bio === null ? {} : { bio: profile.bio }
      })
    }),
    finalUrl: profile.canonicalUrl,
    dispatchStarted: false,
    dispatch: { planned: 0, started: 0, verified: 0 }
  };
}
function dispatchEvent(action, started, verified) {
  return { id: action, index: 1, progress: { planned: 1, started, verified } };
}
async function likeReadback(bootstrap, videoId) {
  const response = await innertube(bootstrap, "next", { videoId }, "YouTube like readback");
  return youtubeLikeState(response, videoId);
}
async function saveReadback(bootstrap, videoId) {
  const response = await innertube(bootstrap, "next", { videoId }, "YouTube save readback");
  return youtubeWatchLaterState(response, videoId);
}
async function followReadback(bootstrap, channelId) {
  const response = await innertube(bootstrap, "browse", { browseId: channelId }, "YouTube subscription readback");
  return youtubeSubscriptionState(response, channelId);
}
function isYouTubeDesiredStateRecipe(recipe) {
  return recipe.site === "youtube" && recipe.contractVersion === 1 && (recipe.action === "likes.set" || recipe.action === "content.save" || recipe.action === "relationships.follow.set");
}
async function prepareDesiredStateWithBootstrap(bootstrap, recipe, input) {
  if (!isYouTubeDesiredStateRecipe(recipe)) {
    throw new Error("YouTube desired-state preparation supports only likes.set, content.save, and relationships.follow.set");
  }
  requireBoundSubject(bootstrap);
  const kind = recipe.action === "likes.set" ? "like" : recipe.action === "content.save" ? "watch-later" : "subscription";
  const targetId = kind === "subscription" ? channelIdInput(input) : videoIdInput(input);
  const desiredState = kind === "like" ? booleanInput(input, "liked") : kind === "watch-later" ? booleanInput(input, "saved") : booleanInput(input, "followed");
  const commandSource = kind === "subscription" ? await innertube(bootstrap, "browse", { browseId: targetId }, "YouTube subscription command discovery") : await innertube(bootstrap, "next", { videoId: targetId }, kind === "like" ? "YouTube like command discovery" : "YouTube save readback");
  const actualState = kind === "like" ? youtubeLikeState(commandSource, targetId) : kind === "watch-later" ? youtubeWatchLaterState(commandSource, targetId) : youtubeSubscriptionState(commandSource, targetId);
  return Object.freeze({
    preparation: Object.freeze({
      kind,
      targetId,
      desiredState,
      actualState,
      alreadyDesired: actualState === desiredState
    }),
    commandSource: kind === "watch-later" ? null : commandSource
  });
}
async function prepareYouTubeWebDesiredState(recipe, input, auth, options = {}) {
  if (!isYouTubeDesiredStateRecipe(recipe)) {
    throw new Error("YouTube desired-state preparation supports only likes.set, content.save, and relationships.follow.set");
  }
  const bootstrap = await bootstrapYouTube(auth, {
    timeoutMs: recipe.timeoutMs,
    maxOutputBytes: recipe.maxOutputBytes,
    ...options.signal === undefined ? {} : { signal: options.signal },
    ...options.operationDeadline === undefined ? {} : { operationDeadline: options.operationDeadline },
    ...options.dependencies === undefined ? {} : { dependencies: options.dependencies }
  });
  return (await prepareDesiredStateWithBootstrap(bootstrap, recipe, input)).preparation;
}
async function readYouTubeWebDesiredState(recipe, input, auth, options = {}) {
  const preparation = await prepareYouTubeWebDesiredState(recipe, input, auth, options);
  return Object.freeze({
    kind: preparation.kind,
    targetId: preparation.targetId,
    enabled: preparation.actualState
  });
}
function desiredStateNoOp(preparation) {
  return {
    status: "succeeded",
    output: Object.freeze({
      kind: preparation.kind,
      targetId: preparation.targetId,
      enabled: preparation.desiredState,
      noOp: true,
      effect: "already-satisfied"
    }),
    finalUrl: preparation.kind === "subscription" ? `${YOUTUBE_ORIGIN2}/channel/${preparation.targetId}` : `${YOUTUBE_ORIGIN2}/watch?v=${preparation.targetId}`,
    dispatchStarted: false,
    dispatch: { planned: 1, started: 0, verified: 0 }
  };
}
async function executeDesiredState(bootstrap, recipe, input, options) {
  const prepared = await prepareDesiredStateWithBootstrap(bootstrap, recipe, input);
  const { kind, targetId, desiredState: desired } = prepared.preparation;
  if (prepared.preparation.alreadyDesired) {
    return desiredStateNoOp(prepared.preparation);
  }
  let started = 0;
  let verified = 0;
  try {
    if (kind === "like") {
      const mutation = youtubeLikeMutationRequest(prepared.commandSource, targetId, desired);
      await options.beforeDispatch?.(dispatchEvent(recipe.action, 0, 0));
      started = 1;
      await innertube(bootstrap, mutation.endpoint, mutation.body, "YouTube like mutation");
    } else if (kind === "watch-later") {
      await options.beforeDispatch?.(dispatchEvent(recipe.action, 0, 0));
      started = 1;
      await innertube(bootstrap, "playlist/edit", {
        playlistId: "WL",
        actions: [{
          action: desired ? "ACTION_ADD_VIDEO" : "ACTION_REMOVE_VIDEO",
          ...desired ? { addedVideoId: targetId } : { removedVideoId: targetId }
        }]
      }, "YouTube Watch Later mutation");
    } else {
      const mutation = youtubeSubscriptionMutationRequest(prepared.commandSource, targetId, desired);
      await options.beforeDispatch?.(dispatchEvent(recipe.action, 0, 0));
      started = 1;
      await innertube(bootstrap, mutation.endpoint, mutation.body, "YouTube subscription mutation");
    }
    const actual = kind === "like" ? await likeReadback(bootstrap, targetId) : kind === "watch-later" ? await saveReadback(bootstrap, targetId) : await followReadback(bootstrap, targetId);
    if (actual !== desired)
      throw new Error("YouTube desired-state readback did not match the confirmed state");
    verified = 1;
    await options.afterDispatchVerified?.(dispatchEvent(recipe.action, started, verified));
    return {
      status: "succeeded",
      output: { kind, targetId, enabled: desired },
      finalUrl: kind === "subscription" ? `${YOUTUBE_ORIGIN2}/channel/${targetId}` : `${YOUTUBE_ORIGIN2}/watch?v=${targetId}`,
      dispatchStarted: true,
      dispatch: { planned: 1, started, verified }
    };
  } catch {
    return {
      status: started > 0 ? "indeterminate" : "failed",
      output: null,
      finalUrl: kind === "subscription" ? `${YOUTUBE_ORIGIN2}/channel/${targetId}` : `${YOUTUBE_ORIGIN2}/watch?v=${targetId}`,
      dispatchStarted: started > 0,
      dispatch: { planned: 1, started, verified },
      error: started > 0 ? "YouTube may have changed the requested state but exact readback was not verified; reconcile before retrying" : "YouTube desired-state dispatch failed before submission"
    };
  }
}
async function executeYouTubeWebOperation(recipe, input, auth, options = {}) {
  if (recipe.site === "youtube" && (recipe.action === "media.publish" && recipe.contractVersion === 2 || recipe.action === "content.delete" && recipe.contractVersion === 1)) {
    const reason = YOUTUBE_VIDEO_CAPTURE_REQUIRED_REASONS[recipe.action];
    throw new Error(`YouTube authenticated web operation ${recipe.action} is capture-required: ${reason}`);
  }
  if (recipe.site === "youtube" && recipe.contractVersion === 1 && [
    "content.save",
    "likes.set",
    "relationships.follow.set"
  ].includes(recipe.action)) {
    throw new Error(`YouTube authenticated web operation ${recipe.action} is capture-required until an authorized low-stakes live fixture passes`);
  }
  if (recipe.site !== "youtube" || recipe.contractVersion !== 1 || ![
    "comments.read",
    "content.save",
    "feeds.read",
    "likes.set",
    "media.read",
    "posts.read",
    "profiles.read",
    "relationships.follow.set"
  ].includes(recipe.action)) {
    throw new Error(`YouTube authenticated web operation ${recipe.action} has no executable reviewed contract`);
  }
  const bootstrapOptions = {
    timeoutMs: recipe.timeoutMs,
    maxOutputBytes: recipe.maxOutputBytes,
    ...options.signal === undefined ? {} : { signal: options.signal },
    ...options.operationDeadline === undefined ? {} : { operationDeadline: options.operationDeadline },
    ...options.dependencies === undefined ? {} : { dependencies: options.dependencies }
  };
  if (recipe.action === "profiles.read") {
    const target = youtubeProfileTarget(input.profile);
    let bootstrap2;
    try {
      bootstrap2 = await bootstrapYouTube(auth, bootstrapOptions);
    } catch (error) {
      return failedProviderRead("YouTube profile", error, target.url, {
        stage: "bootstrap",
        authenticated: true,
        authRepairRequired: (candidate) => candidate.message.includes("cookie") || candidate.message.includes("bound auth subject") || candidate instanceof YouTubeAuthRepairRequiredError,
        accountMismatch: (candidate) => candidate.message.includes("current account did not match")
      });
    }
    try {
      return await executeProfileRead(bootstrap2, input);
    } catch (error) {
      return failedProviderRead("YouTube profile", error, target.url, {
        stage: "target",
        authenticated: true,
        authRepairRequired: (candidate) => candidate.message.includes("cookie") || candidate.message.includes("bound auth subject") || candidate instanceof YouTubeAuthRepairRequiredError,
        accountMismatch: (candidate) => candidate.message.includes("current account did not match")
      });
    }
  }
  const bootstrap = await bootstrapYouTube(auth, bootstrapOptions);
  if (recipe.action === "feeds.read")
    return executeFeed(bootstrap, input);
  if (recipe.action === "media.read")
    return executeMediaRead(bootstrap, input);
  if (recipe.action === "posts.read")
    return executePostRead(bootstrap, input);
  if (recipe.action === "comments.read")
    return executeCommentsRead(bootstrap, input);
  if (recipe.action === "likes.set" || recipe.action === "content.save" || recipe.action === "relationships.follow.set")
    return executeDesiredState(bootstrap, recipe, input, options);
  throw new Error(`YouTube authenticated web operation ${recipe.action} has no executable reviewed contract`);
}
export {
  youtubeVideoTargetIdentifier,
  revalidateYouTubeVideoPublishBindingForDispatch,
  readYouTubeWebDesiredState,
  probeYouTubeWebSubject,
  prepareYouTubeWebDesiredState,
  prepareYouTubeVideoDeleteInput,
  parseYouTubeVideoTargetIdentifier,
  materializeYouTubeVideoPublishInput,
  executeYouTubeWebOperation,
  YouTubeAuthRepairRequiredError,
  YOUTUBE_VIDEO_CAPTURE_REQUIRED_REASONS
};

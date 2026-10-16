/** Pure, bounded projections. These functions grant no transport or account authority. */
export const X_SOCIAL_MODEL_VERSION = 1 as const;

type RecordValue = Readonly<Record<string, unknown>>;
type EvidenceStatus = "unknown" | "available";

export type XSocialEntityRange = { readonly start: number; readonly end: number };
export type XSocialMention = XSocialEntityRange & {
  readonly handle: string;
  readonly userId: string | null;
};
export type XSocialTag = XSocialEntityRange & { readonly tag: string };
export type XSocialCashtag = XSocialEntityRange & { readonly symbol: string };
export type XSocialLink = XSocialEntityRange & {
  readonly url: string;
  readonly expandedUrl: string | null;
  readonly displayUrl: string | null;
};
export type XSocialText = {
  readonly text: string;
  readonly source: "legacy" | "note" | "profile";
  readonly offsetEncoding: "utf16";
  readonly entities: {
    readonly status: EvidenceStatus;
    readonly mentions: readonly XSocialMention[];
    readonly hashtags: readonly XSocialTag[];
    readonly cashtags: readonly XSocialCashtag[];
    readonly links: readonly XSocialLink[];
  };
};
export type XSocialMedia = {
  readonly id: string | null;
  readonly mediaKey: string | null;
  readonly type: "image" | "video" | "animated-gif";
  readonly url: string | null;
  readonly previewUrl: string | null;
  readonly altText: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly durationMs: number | null;
  readonly variants: readonly {
    readonly contentType: "video/mp4" | "application/x-mpegURL";
    readonly url: string;
    readonly bitrate: number | null;
  }[];
};
export type XSocialModerationLabel = {
  readonly kind: "sensitive" | "interstitial" | "ai-disclosure";
  readonly source: string;
  readonly text: string | null;
  readonly reason: string | null;
};
export type XSocialModeration = {
  // Absence of the known fields cannot prove absence of every provider flag.
  readonly status: "unknown" | "present";
  readonly labels: readonly XSocialModerationLabel[];
};
export type XSocialPromotion = {
  readonly status: "unknown" | "present";
  readonly source: "promotedMetadata" | null;
};
export type XSocialPostSnapshot = {
  readonly kind: "post";
  readonly id: string;
  readonly text: string;
  readonly content: XSocialText;
  readonly createdAt: string | null;
  readonly authorId: string | null;
  readonly authorUsername: string | null;
  readonly authorName: string | null;
  readonly replyToPostId: string | null;
  readonly liked: boolean | null;
  readonly reposted: boolean | null;
  readonly saved: boolean | null;
  readonly metrics: {
    readonly replies: number | null;
    readonly reposts: number | null;
    readonly likes: number | null;
    readonly bookmarks: number | null;
  };
  readonly media: { readonly status: EvidenceStatus; readonly items: readonly XSocialMedia[] };
  readonly moderation: XSocialModeration;
  readonly url: string;
};
export type XSocialPostReference = {
  readonly status: "unknown" | "absent" | "present";
  readonly postId: string | null;
  // Deliberately a snapshot: nested quotes/reposts cannot grow recursively.
  readonly post: XSocialPostSnapshot | null;
};
/** A repost may retain its original's quote, with neither snapshot recursive. */
export type XSocialRepostReference = XSocialPostReference & {
  readonly quote?: XSocialPostReference;
};
export type XSocialPost = XSocialPostSnapshot & {
  readonly modelVersion: typeof X_SOCIAL_MODEL_VERSION;
  readonly quote: XSocialPostReference;
  readonly repost: XSocialRepostReference;
  /** Placement evidence belongs to this occurrence, not every appearance of this id. */
  readonly promotion: XSocialPromotion;
};
export type XSocialProfile = {
  readonly modelVersion: typeof X_SOCIAL_MODEL_VERSION;
  readonly id: string;
  readonly handle: string;
  readonly displayName: string | null;
  readonly bio: string | null;
  readonly bioContent: XSocialText | null;
  readonly websiteUrl: string | null;
  readonly joinedAt: string | null;
  readonly location: string | null;
  readonly verification: {
    readonly verified: boolean | null;
    readonly blueVerified: boolean | null;
    readonly type: string | null;
  };
  readonly counts: { readonly followers: number | null; readonly following: number | null };
  readonly relationship: { readonly following: boolean | null; readonly followedBy: boolean | null };
  readonly url: string;
};
export type XSocialActor = {
  readonly id: string;
  readonly handle: string | null;
  readonly displayName: string | null;
};
export type XSocialNotification = {
  readonly kind: "notification";
  readonly id: string;
  readonly eventType: "like" | "repost" | "follow" | "reply" | "mention" | "quote" | "recommendation" | "other";
  readonly createdAt: string | null;
  readonly text: string | null;
  readonly actors: readonly XSocialActor[];
  readonly postIds: readonly string[];
  readonly read: boolean | null;
  readonly url: string | null;
};
export type XSocialTrend = {
  readonly kind: "trend";
  readonly id: string;
  readonly source: "trending" | "todays-news";
  readonly title: string;
  readonly description: string | null;
  readonly category: string | null;
  readonly postCount: number | null;
  readonly query: string | null;
  readonly url: string | null;
};
export type XSocialTimelineEntry =
  | { readonly kind: "post"; readonly post: XSocialPost }
  | { readonly kind: "unavailable"; readonly postId: string | null; readonly reason: string | null }
  | XSocialNotification
  | XSocialTrend;
export type XSocialFeedSource =
  | "for-you" | "following" | "bookmarks" | "likes"
  | "profile-posts" | "profile-replies" | "profile-highlights" | "profile-reposts"
  | "notifications" | "trending" | "todays-news" | "search" | "list" | "conversation";
export type XSocialPage<T = XSocialTimelineEntry> = {
  readonly modelVersion: typeof X_SOCIAL_MODEL_VERSION;
  readonly source: XSocialFeedSource;
  readonly items: readonly T[];
  readonly cursor: string | null;
  readonly terminatedDirections: readonly string[];
};

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function record(value: unknown, label: string): RecordValue {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function optionalRecord(value: unknown, label: string): RecordValue | null {
  return value === undefined || value === null ? null : record(value, label);
}

function text(value: unknown, label: string, max = 32_768, multiline = true): string {
  if (typeof value !== "string" || value.length > max
    || (multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u : /[\u0000-\u001f\u007f]/u).test(value)) {
    throw new Error(`${label} must be bounded public text`);
  }
  return value;
}

function optionalText(value: unknown, label: string, max = 1_000, multiline = false): string | null {
  return value === undefined || value === null ? null : text(value, label, max, multiline);
}

function id(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[0-9]{1,19}$/u.test(value)) {
    throw new Error(`${label} must be an exact decimal id`);
  }
  return value;
}

function optionalId(value: unknown, label: string): string | null {
  return value === undefined || value === null ? null : id(value, label);
}

function handle(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_]{1,15}$/u.test(value)) {
    throw new Error(`${label} must be an X handle`);
  }
  return value.toLowerCase();
}

function optionalHandle(value: unknown, label: string): string | null {
  return value === undefined || value === null ? null : handle(value, label);
}

function count(value: unknown, label: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be an exact nonnegative safe integer`);
  }
  return value;
}

function flag(value: unknown, label: string): boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "boolean") throw new Error(`${label} must be boolean`);
  return value;
}

function agree<T>(first: T | null, second: T | null, label: string): T | null {
  if (first !== null && second !== null && first !== second) throw new Error(`${label} disagreed across fields`);
  return first ?? second;
}

function safeUrl(value: unknown, label: string, media = false): string {
  const input = text(value, label, 4_096, false);
  if (input.trim() !== input) throw new Error(`${label} must be a public HTTP URL`);
  let url: URL;
  try { url = new URL(input); } catch { throw new Error(`${label} must be a public HTTP URL`); }
  const host = url.hostname.toLowerCase();
  const address = /^\d+(?:\.\d+){3}$/u.test(host) ? host.split(".").map(Number) : null;
  const privateAddress = address !== null && (address[0] === 0 || address[0] === 10 || address[0] === 127
    || address[0]! >= 224 || address[0] === 169 && address[1] === 254
    || address[0] === 172 && address[1]! >= 16 && address[1]! <= 31
    || address[0] === 192 && address[1] === 168 || address[0] === 100 && address[1]! >= 64 && address[1]! <= 127);
  if (!/^https?:$/u.test(url.protocol) || url.username !== "" || url.password !== ""
    || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")
    || host.startsWith("[") || privateAddress
    || (media && (url.protocol !== "https:" || !["pbs.twimg.com", "video.twimg.com"].includes(host)))) {
    throw new Error(`${label} must be a public ${media ? "X media HTTPS" : "HTTP"} URL`);
  }
  return url.href;
}

function optionalUrl(value: unknown, label: string, media = false): string | null {
  return value === undefined || value === null ? null : safeUrl(value, label, media);
}

function array(value: unknown, label: string, max: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${label} exceeded its array bound`);
  return value;
}

function optionalArray(value: unknown, label: string, max: number): readonly unknown[] {
  return value === undefined ? [] : array(value, label, max);
}

function splitSurrogate(value: string, offset: number): boolean {
  return offset > 0 && offset < value.length
    && value.charCodeAt(offset - 1) >= 0xd800 && value.charCodeAt(offset - 1) <= 0xdbff
    && value.charCodeAt(offset) >= 0xdc00 && value.charCodeAt(offset) <= 0xdfff;
}

function range(entity: RecordValue, body: string, label: string): XSocialEntityRange {
  const indices = array(entity.indices, `${label}.indices`, 2);
  const [start, end] = indices;
  if (indices.length !== 2 || typeof start !== "number" || typeof end !== "number"
    || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)
    || start < 0 || end <= start || end > body.length
    || splitSurrogate(body, start) || splitSurrogate(body, end)) {
    throw new Error(`${label} must have an in-bounds UTF16 range`);
  }
  return { start, end };
}

function projectText(tweet: RecordValue, legacy: RecordValue | null): XSocialText {
  const note = optionalRecord(tweet.note_tweet, "X note_tweet");
  const results = note === null ? null : optionalRecord(note.note_tweet_results, "X note_tweet_results");
  const full = results === null ? null : optionalRecord(results.result, "X note result");
  const body = full === null ? text(legacy?.full_text, "X post text") : text(full.text, "X note text");
  // Never pair note text with ranges from the truncated legacy preview.
  const entities = optionalRecord(full === null ? legacy?.entities : full.entity_set, "X selected text entities");
  const ranges: XSocialEntityRange[] = [];
  const makeRange = (value: unknown, label: string): { entity: RecordValue; selected: XSocialEntityRange; slice: string } => {
    const entity = record(value, label);
    const selected = range(entity, body, label);
    ranges.push(selected);
    return { entity, selected, slice: body.slice(selected.start, selected.end) };
  };
  const mentions = optionalArray(entities?.user_mentions, "X mentions", 1_000).map((value): XSocialMention => {
    const { entity, selected, slice } = makeRange(value, "X mention");
    const username = handle(entity.screen_name, "X mention handle");
    if (slice.toLowerCase() !== `@${username}`) throw new Error("X mention range did not bind selected text");
    return Object.freeze({ ...selected, handle: username, userId: optionalId(entity.id_str, "X mention user id") });
  });
  const hashtags = optionalArray(entities?.hashtags, "X hashtags", 1_000).map((value): XSocialTag => {
    const { entity, selected, slice } = makeRange(value, "X hashtag");
    const tag = text(entity.text, "X hashtag text", 140, false);
    if (tag.length === 0 || /\s/u.test(tag) || ![ `#${tag}`, `＃${tag}` ].includes(slice)) {
      throw new Error("X hashtag range did not bind selected text");
    }
    return Object.freeze({ ...selected, tag });
  });
  const cashtags = optionalArray(entities?.symbols, "X cashtags", 1_000).map((value): XSocialCashtag => {
    const { entity, selected, slice } = makeRange(value, "X cashtag");
    const symbol = text(entity.text, "X cashtag symbol", 32, false);
    if (symbol.length === 0 || /\s/u.test(symbol) || slice !== `$${symbol}`) {
      throw new Error("X cashtag range did not bind selected text");
    }
    return Object.freeze({ ...selected, symbol });
  });
  const links = optionalArray(entities?.urls, "X links", 1_000).map((value): XSocialLink => {
    const { entity, selected, slice } = makeRange(value, "X link");
    // This is the exact selected token, not the normalized navigation URL.
    const url = text(entity.url, "X link URL", 4_096, false);
    safeUrl(url, "X link URL");
    if (slice !== url) throw new Error("X link range did not bind selected text");
    return Object.freeze({
      ...selected, url,
      expandedUrl: optionalUrl(entity.expanded_url, "X expanded link URL"),
      displayUrl: optionalText(entity.display_url, "X display link URL", 2_048),
    });
  });
  ranges.sort((left, right) => left.start - right.start);
  if (ranges.some((item, index) => index > 0 && item.start < ranges[index - 1]!.end)) {
    throw new Error("X selected text entity ranges overlapped");
  }
  return Object.freeze({
    text: body, source: full === null ? "legacy" : "note", offsetEncoding: "utf16",
    entities: Object.freeze({
      status: entities === null ? "unknown" : "available",
      mentions: Object.freeze(mentions), hashtags: Object.freeze(hashtags),
      cashtags: Object.freeze(cashtags), links: Object.freeze(links),
    }),
  });
}

function projectMedia(legacy: RecordValue | null): XSocialPostSnapshot["media"] {
  const extended = optionalRecord(legacy?.extended_entities, "X extended entities");
  const basic = optionalRecord(legacy?.entities, "X legacy entities");
  const raw = extended?.media ?? basic?.media;
  if (raw === undefined || raw === null) return Object.freeze({ status: "unknown", items: Object.freeze([]) });
  const items = array(raw, "X post media", 4).map((value): XSocialMedia => {
    const media = record(value, "X media");
    const type = media.type === "photo" ? "image" : media.type === "video" ? "video"
      : media.type === "animated_gif" ? "animated-gif" : null;
    if (type === null) throw new Error("X media type is unreviewed");
    const mediaId = optionalId(media.id_str, "X media id");
    const mediaKey = optionalText(media.media_key, "X media key", 64);
    if (mediaKey !== null && !/^[1-9][0-9]{0,2}_[1-9][0-9]{0,19}$/u.test(mediaKey)) throw new Error("X media key is malformed");
    if (mediaId === null && mediaKey === null) throw new Error("X media omitted its identity");
    if (mediaId !== null && mediaKey !== null && mediaKey.split("_")[1] !== mediaId) throw new Error("X media identity fields disagreed");
    const info = optionalRecord(media.video_info, "X video info");
    const dimensions = optionalRecord(media.original_info, "X media dimensions");
    const preview = optionalUrl(media.media_url_https, "X media preview", true);
    const variants = optionalArray(info?.variants, "X video variants", 16).map((item) => {
      const variant = record(item, "X video variant");
      const contentType = variant.content_type;
      if (contentType !== "video/mp4" && contentType !== "application/x-mpegURL") throw new Error("X video content type is unreviewed");
      return Object.freeze({ contentType, url: safeUrl(variant.url, "X video URL", true), bitrate: count(variant.bitrate, "X video bitrate") });
    });
    if (type === "image" && info !== null) throw new Error("X image unexpectedly included video metadata");
    return Object.freeze({
      id: mediaId, mediaKey, type, url: type === "image" ? preview : null, previewUrl: preview,
      altText: optionalText(media.ext_alt_text, "X media alt text", 10_000, true),
      width: count(dimensions?.width, "X media width"), height: count(dimensions?.height, "X media height"),
      durationMs: count(info?.duration_millis, "X video duration"), variants: Object.freeze(variants),
    });
  });
  const identities = items.map((item) => item.id ?? item.mediaKey);
  if (new Set(identities).size !== identities.length) throw new Error("X post duplicated media identity");
  return Object.freeze({ status: "available", items: Object.freeze(items) });
}

function unwrapTweet(value: unknown): { tweet: RecordValue; wrappers: readonly RecordValue[] } {
  let tweet = record(value, "X tweet");
  const wrappers: RecordValue[] = [];
  for (let depth = 0; depth < 3; depth += 1) {
    if (tweet.__typename === undefined || tweet.__typename === "Tweet") return { tweet, wrappers };
    if (tweet.__typename !== "TweetWithVisibilityResults" && tweet.__typename !== "TweetPreviewDisplay") {
      throw new Error("X tweet is unavailable or has an unreviewed typename");
    }
    wrappers.push(tweet);
    const result = optionalRecord(tweet.tweet_results, "X wrapped tweet_results");
    tweet = record(tweet.tweet ?? result?.result, "X wrapped tweet");
  }
  throw new Error("X tweet wrappers exceeded their bound");
}

function projectModeration(tweet: RecordValue, legacy: RecordValue | null, wrappers: readonly RecordValue[]): XSocialModeration {
  const labels: XSocialModerationLabel[] = [];
  if (flag(legacy?.possibly_sensitive, "X possibly_sensitive") === true) {
    labels.push(Object.freeze({ kind: "sensitive", source: "legacy.possibly_sensitive", text: null, reason: null }));
  }
  for (const [index, owner] of [tweet, ...wrappers].entries()) {
    const annotation = optionalRecord(owner.tweet_interstitial, "X tweet interstitial");
    if (annotation !== null) {
      const nestedText = optionalRecord(annotation.text, "X interstitial text");
      labels.push(Object.freeze({
        kind: "interstitial", source: index === 0 ? "tweet_interstitial" : "visibility.tweet_interstitial",
        text: optionalText(nestedText?.text, "X interstitial text", 10_000, true),
        reason: optionalText(annotation.display_type, "X interstitial display type", 256),
      }));
    }
    if (flag(owner.made_with_ai, "X made_with_ai") === true || flag(owner.ai_generated, "X ai_generated") === true) {
      labels.push(Object.freeze({ kind: "ai-disclosure", source: "tweet.ai_disclosure", text: null, reason: null }));
    }
    const disclosure = owner.content_disclosure;
    if (disclosure !== undefined && disclosure !== null) {
      const label = typeof disclosure === "string" ? disclosure : record(disclosure, "X content disclosure").label;
      labels.push(Object.freeze({ kind: "ai-disclosure", source: "content_disclosure", text: optionalText(label, "X disclosure label", 1_000), reason: null }));
    }
  }
  return Object.freeze({ status: labels.length === 0 ? "unknown" : "present", labels: Object.freeze(labels) });
}

function projectSnapshot(raw: unknown): XSocialPostSnapshot {
  const { tweet, wrappers } = unwrapTweet(raw);
  const legacy = optionalRecord(tweet.legacy, "X tweet legacy");
  const postId = id(tweet.rest_id, "X post id");
  agree(postId, optionalId(legacy?.id_str, "X legacy post id"), "X post id");
  const content = projectText(tweet, legacy);
  const core = optionalRecord(tweet.core, "X tweet core");
  const results = optionalRecord(core?.user_results, "X tweet user results");
  const user = optionalRecord(results?.result, "X tweet author");
  if (user?.__typename !== undefined && user.__typename !== "User" && user.__typename !== "UserUnavailable") {
    throw new Error("X tweet author has an unreviewed typename");
  }
  const userCore = optionalRecord(user?.core, "X author core");
  const userLegacy = optionalRecord(user?.legacy, "X author legacy");
  const authorId = agree(optionalId(legacy?.user_id_str, "X post author id"), optionalId(user?.rest_id, "X author id"), "X author id");
  return Object.freeze({
    kind: "post", id: postId, text: content.text, content,
    createdAt: optionalText(legacy?.created_at, "X post createdAt", 128),
    authorId,
    authorUsername: agree(optionalHandle(userCore?.screen_name, "X core handle"), optionalHandle(userLegacy?.screen_name, "X legacy handle"), "X author handle"),
    authorName: agree(optionalText(userCore?.name, "X core name"), optionalText(userLegacy?.name, "X legacy name"), "X author name"),
    replyToPostId: optionalId(legacy?.in_reply_to_status_id_str, "X reply target"),
    liked: flag(legacy?.favorited, "X liked"), reposted: flag(legacy?.retweeted, "X reposted"), saved: flag(legacy?.bookmarked, "X saved"),
    metrics: Object.freeze({
      replies: count(legacy?.reply_count, "X reply count"), reposts: count(legacy?.retweet_count, "X repost count"),
      likes: count(legacy?.favorite_count, "X like count"), bookmarks: count(legacy?.bookmark_count, "X bookmark count"),
    }),
    media: projectMedia(legacy), moderation: projectModeration(tweet, legacy, wrappers),
    url: `https://x.com/i/status/${postId}`,
  });
}

function reference(tweet: RecordValue, kind: "quote" | "repost"): XSocialPostReference {
  const legacy = optionalRecord(tweet.legacy, "X reference legacy");
  const quoteState = kind === "quote" ? flag(legacy?.is_quote_status, "X quote state") : null;
  const value = kind === "quote" ? tweet.quoted_status_result : tweet.retweeted_status_result ?? legacy?.retweeted_status_result;
  const result = optionalRecord(value, `X ${kind} result`);
  const raw = result?.result;
  const legacyId = optionalId(kind === "quote" ? legacy?.quoted_status_id_str : legacy?.retweeted_status_id_str, `X ${kind} id`);
  if (quoteState === false && (legacyId !== null || result !== null)) throw new Error("X quote state disagreed with its reference");
  if (raw !== undefined && raw !== null) {
    const nested = record(raw, `X ${kind} tweet`);
    const unavailable = nested.__typename !== undefined && !["Tweet", "TweetWithVisibilityResults", "TweetPreviewDisplay"].includes(String(nested.__typename));
    if (unavailable) return Object.freeze({ status: "present", postId: legacyId, post: null });
    const unwrapped = unwrapTweet(nested).tweet;
    const nestedId = id(unwrapped.rest_id, `X ${kind} nested id`);
    agree(legacyId, nestedId, `X ${kind} target`);
    // A response may expose only its nested reference id, without public content.
    const hasText = isRecord(unwrapped.legacy) && typeof unwrapped.legacy.full_text === "string"
      || isRecord(unwrapped.note_tweet);
    return Object.freeze({ status: "present", postId: nestedId, post: hasText ? projectSnapshot(nested) : null });
  }
  if (legacyId !== null || result !== null || quoteState === true) return Object.freeze({ status: "present", postId: legacyId, post: null });
  if (quoteState === false) {
    return Object.freeze({ status: "absent", postId: null, post: null });
  }
  return Object.freeze({ status: "unknown", postId: null, post: null });
}

function repostReference(tweet: RecordValue): XSocialRepostReference {
  const repost = reference(tweet, "repost");
  if (repost.post === null) return repost;
  const legacy = optionalRecord(tweet.legacy, "X repost legacy");
  const result = record(tweet.retweeted_status_result ?? legacy?.retweeted_status_result, "X repost result");
  const original = unwrapTweet(record(result.result, "X repost tweet")).tweet;
  return Object.freeze({ ...repost, quote: reference(original, "quote") });
}

/** Input is one Tweet result, including its optional visibility wrapper. */
export function projectXSocialPost(rawTweet: unknown, placement?: unknown): XSocialPost {
  const snapshot = projectSnapshot(rawTweet);
  const { tweet } = unwrapTweet(rawTweet);
  const item = optionalRecord(placement, "X item placement");
  const promoted = optionalRecord(item?.promotedMetadata, "X promoted metadata");
  return Object.freeze({
    ...snapshot, modelVersion: X_SOCIAL_MODEL_VERSION,
    quote: reference(tweet, "quote"), repost: repostReference(tweet),
    promotion: Object.freeze({ status: promoted === null ? "unknown" : "present", source: promoted === null ? null : "promotedMetadata" }),
  });
}

function joinedAt(value: unknown): string | null {
  const raw = optionalText(value, "X profile join date", 128);
  if (raw === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(raw)
    && !/^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{2} \d{2}:\d{2}:\d{2} \+0000 \d{4}$/u.test(raw)) {
    throw new Error("X profile join date has an unreviewed format");
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error("X profile join date is invalid");
  return new Date(parsed).toISOString();
}

/** Input is the target-bound User result; the transport must enforce that binding. */
export function projectXSocialProfile(rawUser: unknown): XSocialProfile {
  const user = record(rawUser, "X profile");
  if (user.__typename !== undefined && user.__typename !== "User") throw new Error("X profile is unavailable or has an unreviewed typename");
  const legacy = optionalRecord(user.legacy, "X profile legacy");
  const core = optionalRecord(user.core, "X profile core");
  const relationships = optionalRecord(user.relationship_counts, "X profile relationship counts");
  const perspectives = optionalRecord(user.relationship_perspectives, "X relationship perspectives");
  const profileBio = optionalRecord(user.profile_bio, "X profile bio");
  const website = optionalRecord(user.website, "X profile website");
  const entities = optionalRecord(legacy?.entities, "X profile entities");
  const urlEntity = optionalRecord(entities?.url, "X profile URL entities");
  const legacyWebsites = optionalArray(urlEntity?.urls, "X profile websites", 10).map((value) =>
    optionalUrl(record(value, "X profile website entity").expanded_url, "X expanded profile website")
  ).filter((value): value is string => value !== null);
  const uniqueWebsites = [...new Set(legacyWebsites)];
  if (uniqueWebsites.length > 1) throw new Error("X profile website is ambiguous");
  const username = agree(optionalHandle(core?.screen_name, "X profile core handle"), optionalHandle(legacy?.screen_name, "X profile legacy handle"), "X profile handle");
  if (username === null) throw new Error("X profile omitted its handle");
  const modernBio = optionalText(profileBio?.description, "X profile bio", 10_000, true);
  const bio = agree(modernBio, optionalText(legacy?.description, "X profile legacy bio", 10_000, true), "X profile bio");
  // Bind ranges to the selected description. Do not borrow legacy ranges for
  // a modern description whose own entity evidence was omitted.
  const bioEntities = modernBio !== null ? profileBio?.entities : entities?.description;
  const bioContent: XSocialText | null = bio === null ? null : Object.freeze({
    ...projectText({}, { full_text: bio, entities: bioEntities }), source: "profile",
  });
  return Object.freeze({
    modelVersion: X_SOCIAL_MODEL_VERSION,
    id: id(user.rest_id, "X profile id"), handle: username,
    displayName: agree(optionalText(core?.name, "X profile core name"), optionalText(legacy?.name, "X profile legacy name"), "X profile name"),
    bio, bioContent,
    websiteUrl: agree(optionalUrl(website?.url, "X profile website URL"), uniqueWebsites[0] ?? null, "X profile website"),
    joinedAt: agree(joinedAt(core?.created_at), joinedAt(legacy?.created_at), "X profile join date"),
    location: optionalText(legacy?.location, "X profile location", 1_000),
    verification: Object.freeze({
      verified: flag(legacy?.verified, "X profile verified"), blueVerified: flag(user.is_blue_verified, "X profile blue verified"),
      type: optionalText(legacy?.verified_type, "X profile verification type", 128),
    }),
    counts: Object.freeze({
      followers: agree(count(relationships?.followers, "X followers"), count(legacy?.followers_count, "X legacy followers"), "X followers"),
      following: agree(count(relationships?.following, "X following"), count(legacy?.friends_count, "X legacy following"), "X following"),
    }),
    relationship: Object.freeze({
      following: agree(flag(perspectives?.following, "X viewer following"), flag(legacy?.following, "X legacy following state"), "X viewer following"),
      followedBy: agree(flag(perspectives?.followed_by, "X viewer followed by"), flag(legacy?.followed_by, "X legacy followed by state"), "X viewer followed by"),
    }),
    url: `https://x.com/${username}`,
  });
}

function exactKeys(value: RecordValue, keys: readonly string[], label: string): void {
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new Error(`${label} must contain exactly the normalized DTO fields`);
  }
}

/** Strictly validate a serialized profile, without accepting provider/raw fields. */
export function parseXSocialProfile(value: unknown): XSocialProfile {
  const item = record(value, "X profile DTO");
  exactKeys(item, ["modelVersion", "id", "handle", "displayName", "bio", "bioContent", "websiteUrl", "joinedAt", "location", "verification", "counts", "relationship", "url"], "X profile DTO");
  if (item.modelVersion !== X_SOCIAL_MODEL_VERSION) throw new Error("X profile DTO modelVersion is unsupported");
  const username = handle(item.handle, "X profile DTO handle");
  if (item.url !== `https://x.com/${username}`) throw new Error("X profile DTO URL did not bind its handle");
  const date = joinedAt(item.joinedAt);
  if (item.joinedAt !== date) throw new Error("X profile DTO join date must be canonical ISO UTC or null");
  const verification = record(item.verification, "X profile DTO verification");
  exactKeys(verification, ["verified", "blueVerified", "type"], "X profile DTO verification");
  const counts = record(item.counts, "X profile DTO counts");
  exactKeys(counts, ["followers", "following"], "X profile DTO counts");
  const relationship = record(item.relationship, "X profile DTO relationship");
  exactKeys(relationship, ["following", "followedBy"], "X profile DTO relationship");
  const bio = optionalText(item.bio, "X profile DTO bio", 10_000, true);
  const bioContent = item.bioContent === null ? null : parseTextDto(item.bioContent, true);
  if ((bio === null) !== (bioContent === null) || bioContent !== null && bioContent.text !== bio) {
    throw new Error("X profile DTO bio content did not bind its description");
  }
  return Object.freeze({
    modelVersion: X_SOCIAL_MODEL_VERSION, id: id(item.id, "X profile DTO id"), handle: username,
    displayName: optionalText(item.displayName, "X profile DTO name"), bio, bioContent,
    websiteUrl: optionalUrl(item.websiteUrl, "X profile DTO website"), joinedAt: date, location: optionalText(item.location, "X profile DTO location", 1_000),
    verification: Object.freeze({ verified: flag(verification.verified, "X profile DTO verified"), blueVerified: flag(verification.blueVerified, "X profile DTO blue verified"), type: optionalText(verification.type, "X profile DTO verification type", 128) }),
    counts: Object.freeze({ followers: count(counts.followers, "X profile DTO followers"), following: count(counts.following, "X profile DTO following") }),
    relationship: Object.freeze({ following: flag(relationship.following, "X profile DTO following state"), followedBy: flag(relationship.followedBy, "X profile DTO followed by state") }),
    url: `https://x.com/${username}`,
  });
}

function opaqueId(value: unknown, label: string): string {
  const result = text(value, label, 256, false);
  if (result.length === 0) throw new Error(`${label} must be nonempty`);
  return result;
}

const SNAPSHOT_KEYS = ["kind", "id", "text", "content", "createdAt", "authorId", "authorUsername", "authorName", "replyToPostId", "liked", "reposted", "saved", "metrics", "media", "moderation", "url"] as const;

function parseTextDto(value: unknown, profile = false): XSocialText {
  const content = record(value, "X text DTO");
  exactKeys(content, ["text", "source", "offsetEncoding", "entities"], "X text DTO");
  if (content.offsetEncoding !== "utf16" || (profile
    ? content.source !== "profile"
    : content.source !== "legacy" && content.source !== "note")) throw new Error("X text DTO source/encoding is unreviewed");
  const entities = record(content.entities, "X entities DTO");
  exactKeys(entities, ["status", "mentions", "hashtags", "cashtags", "links"], "X entities DTO");
  if (entities.status !== "unknown" && entities.status !== "available") throw new Error("X entities DTO status is unreviewed");
  const raw: Record<string, unknown> = {};
  for (const [group, target, fields] of [
    ["mentions", "user_mentions", ["start", "end", "handle", "userId"]],
    ["hashtags", "hashtags", ["start", "end", "tag"]],
    ["cashtags", "symbols", ["start", "end", "symbol"]],
    ["links", "urls", ["start", "end", "url", "expandedUrl", "displayUrl"]],
  ] as const) {
    const values = array(entities[group], `X ${group} DTO`, 1_000);
    if (entities.status === "unknown" && values.length !== 0) throw new Error("X unknown entity evidence cannot contain entities");
    raw[target] = values.map((value) => {
      const item = record(value, `X ${group} entity DTO`);
      exactKeys(item, fields, `X ${group} entity DTO`);
      return {
        indices: [item.start, item.end],
        ...(group === "mentions" ? { screen_name: item.handle, id_str: item.userId }
          : group === "hashtags" ? { text: item.tag }
            : group === "cashtags" ? { text: item.symbol }
              : { url: item.url, expanded_url: item.expandedUrl, display_url: item.displayUrl }),
      };
    });
  }
  const selected = entities.status === "available" ? raw : undefined;
  if (profile) return Object.freeze({ ...projectText({}, { full_text: content.text, entities: selected }), source: "profile" });
  return content.source === "legacy"
    ? projectText({}, { full_text: content.text, entities: selected })
    : projectText({ note_tweet: { note_tweet_results: { result: { text: content.text, entity_set: selected } } } }, null);
}

function parseMediaDto(value: unknown): XSocialPostSnapshot["media"] {
  const media = record(value, "X media DTO");
  exactKeys(media, ["status", "items"], "X media DTO");
  if (media.status !== "available" && media.status !== "unknown") throw new Error("X media DTO status is unreviewed");
  const items = array(media.items, "X media DTO items", 4);
  if (media.status === "unknown") {
    if (items.length !== 0) throw new Error("X unknown media evidence cannot contain items");
    return Object.freeze({ status: "unknown", items: Object.freeze([]) });
  }
  const raw = items.map((value) => {
    const item = record(value, "X media item DTO");
    exactKeys(item, ["id", "mediaKey", "type", "url", "previewUrl", "altText", "width", "height", "durationMs", "variants"], "X media item DTO");
    const type = item.type === "image" ? "photo" : item.type === "video" ? "video" : item.type === "animated-gif" ? "animated_gif" : null;
    if (type === null || (type === "photo" ? item.url !== item.previewUrl : item.url !== null)) throw new Error("X media DTO type/asset URL is inconsistent");
    const variants = array(item.variants, "X media DTO variants", 16).map((value) => {
      const variant = record(value, "X variant DTO");
      exactKeys(variant, ["contentType", "url", "bitrate"], "X variant DTO");
      return { content_type: variant.contentType, url: variant.url, bitrate: variant.bitrate };
    });
    if (type === "photo" && (variants.length !== 0 || item.durationMs !== null)) throw new Error("X image DTO included video metadata");
    return {
      id_str: item.id, media_key: item.mediaKey, type, media_url_https: item.previewUrl, ext_alt_text: item.altText,
      original_info: { width: item.width, height: item.height },
      ...(type === "photo" ? {} : { video_info: { duration_millis: item.durationMs, variants } }),
    };
  });
  return projectMedia({ extended_entities: { media: raw } });
}

function parseModerationDto(value: unknown): XSocialModeration {
  const moderation = record(value, "X moderation DTO");
  exactKeys(moderation, ["status", "labels"], "X moderation DTO");
  if (moderation.status !== "unknown" && moderation.status !== "present") throw new Error("X moderation DTO status is unreviewed");
  const labels = array(moderation.labels, "X moderation labels", 32).map((value): XSocialModerationLabel => {
    const label = record(value, "X moderation label");
    exactKeys(label, ["kind", "source", "text", "reason"], "X moderation label");
    if (label.kind !== "sensitive" && label.kind !== "interstitial" && label.kind !== "ai-disclosure") throw new Error("X moderation label kind is unreviewed");
    return Object.freeze({ kind: label.kind, source: opaqueId(label.source, "X moderation source"), text: optionalText(label.text, "X moderation text", 10_000, true), reason: optionalText(label.reason, "X moderation reason", 256) });
  });
  if ((moderation.status === "unknown") !== (labels.length === 0)) throw new Error("X moderation DTO status disagreed with labels");
  return Object.freeze({ status: moderation.status, labels: Object.freeze(labels) });
}

function parseSnapshotDto(item: RecordValue): XSocialPostSnapshot {
  if (item.kind !== "post") throw new Error("X post DTO kind must be post");
  const postId = id(item.id, "X post DTO id");
  if (item.url !== `https://x.com/i/status/${postId}`) throw new Error("X post DTO URL did not bind its id");
  const content = parseTextDto(item.content);
  if (content.text !== item.text) throw new Error("X post DTO text disagreed with selected content");
  const metrics = record(item.metrics, "X post DTO metrics");
  exactKeys(metrics, ["replies", "reposts", "likes", "bookmarks"], "X post DTO metrics");
  return Object.freeze({
    kind: "post", id: postId, text: content.text, content,
    createdAt: optionalText(item.createdAt, "X post DTO createdAt", 128),
    authorId: optionalId(item.authorId, "X post DTO author id"), authorUsername: optionalHandle(item.authorUsername, "X post DTO author handle"),
    authorName: optionalText(item.authorName, "X post DTO author name"), replyToPostId: optionalId(item.replyToPostId, "X post DTO reply target"),
    liked: flag(item.liked, "X post DTO liked"), reposted: flag(item.reposted, "X post DTO reposted"), saved: flag(item.saved, "X post DTO saved"),
    metrics: Object.freeze({ replies: count(metrics.replies, "X DTO replies"), reposts: count(metrics.reposts, "X DTO reposts"), likes: count(metrics.likes, "X DTO likes"), bookmarks: count(metrics.bookmarks, "X DTO bookmarks") }),
    media: parseMediaDto(item.media), moderation: parseModerationDto(item.moderation), url: `https://x.com/i/status/${postId}`,
  });
}

function parseReferenceDto(value: unknown): XSocialPostReference {
  const reference = record(value, "X post reference DTO");
  exactKeys(reference, ["status", "postId", "post"], "X post reference DTO");
  if (reference.status !== "unknown" && reference.status !== "absent" && reference.status !== "present") throw new Error("X reference DTO status is unreviewed");
  if (reference.status !== "present" && (reference.postId !== null || reference.post !== null)) throw new Error("X reference DTO status disagreed with target");
  const postId = optionalId(reference.postId, "X reference DTO post id");
  const raw = optionalRecord(reference.post, "X nested post DTO");
  if (raw !== null) exactKeys(raw, SNAPSHOT_KEYS, "X nested post DTO");
  const post = raw === null ? null : parseSnapshotDto(raw);
  if (post !== null && postId !== post.id) throw new Error("X reference DTO target did not bind nested post");
  return Object.freeze({ status: reference.status, postId, post });
}

function parseRepostReferenceDto(value: unknown): XSocialRepostReference {
  const repost = record(value, "X repost reference DTO");
  if (!Object.hasOwn(repost, "quote")) return parseReferenceDto(repost);
  exactKeys(repost, ["status", "postId", "post", "quote"], "X repost reference DTO");
  const base = parseReferenceDto({ status: repost.status, postId: repost.postId, post: repost.post });
  if (base.post === null) throw new Error("X repost quote DTO requires its original post snapshot");
  return Object.freeze({ ...base, quote: parseReferenceDto(repost.quote) });
}

/** Strictly validate serialized rich posts, including the bounded nested snapshot. */
export function parseXSocialPost(value: unknown): XSocialPost {
  const item = record(value, "X post DTO");
  exactKeys(item, [...SNAPSHOT_KEYS, "modelVersion", "quote", "repost", "promotion"], "X post DTO");
  if (item.modelVersion !== X_SOCIAL_MODEL_VERSION) throw new Error("X post DTO modelVersion is unsupported");
  const promotion = record(item.promotion, "X promotion DTO");
  exactKeys(promotion, ["status", "source"], "X promotion DTO");
  if (!((promotion.status === "unknown" && promotion.source === null) || (promotion.status === "present" && promotion.source === "promotedMetadata"))) throw new Error("X promotion DTO evidence is inconsistent");
  return Object.freeze({
    ...parseSnapshotDto(item), modelVersion: X_SOCIAL_MODEL_VERSION,
    quote: parseReferenceDto(item.quote), repost: parseRepostReferenceDto(item.repost),
    promotion: Object.freeze({ status: promotion.status, source: promotion.source }) as XSocialPromotion,
  });
}

/** Validate a normalized DTO. This is not a projection of an unqualified provider response. */
export function parseXSocialNotification(value: unknown): XSocialNotification {
  const item = record(value, "X notification DTO");
  exactKeys(item, ["kind", "id", "eventType", "createdAt", "text", "actors", "postIds", "read", "url"], "X notification DTO");
  const eventType = item.eventType;
  if (item.kind !== "notification" || typeof eventType !== "string"
    || !["like", "repost", "follow", "reply", "mention", "quote", "recommendation", "other"].includes(eventType)) {
    throw new Error("X notification DTO kind/eventType is unreviewed");
  }
  const actors = array(item.actors, "X notification actors", 100).map((value): XSocialActor => {
    const actor = record(value, "X notification actor");
    exactKeys(actor, ["id", "handle", "displayName"], "X notification actor");
    return Object.freeze({ id: id(actor.id, "X notification actor id"), handle: optionalHandle(actor.handle, "X actor handle"), displayName: optionalText(actor.displayName, "X actor name") });
  });
  const postIds = array(item.postIds, "X notification posts", 100).map((value) => id(value, "X notification post id"));
  if (new Set(actors.map((actor) => actor.id)).size !== actors.length || new Set(postIds).size !== postIds.length) {
    throw new Error("X notification DTO duplicated an actor or post");
  }
  return Object.freeze({
    kind: "notification", id: opaqueId(item.id, "X notification id"), eventType: eventType as XSocialNotification["eventType"],
    createdAt: optionalText(item.createdAt, "X notification createdAt", 128), text: optionalText(item.text, "X notification text", 10_000, true),
    actors: Object.freeze(actors), postIds: Object.freeze(postIds), read: flag(item.read, "X notification read state"), url: optionalUrl(item.url, "X notification URL"),
  });
}

/** Trending and personalized news remain separate sources, even when they share a visual row. */
export function parseXSocialTrend(value: unknown): XSocialTrend {
  const item = record(value, "X trend DTO");
  exactKeys(item, ["kind", "id", "source", "title", "description", "category", "postCount", "query", "url"], "X trend DTO");
  if (item.kind !== "trend" || (item.source !== "trending" && item.source !== "todays-news")) throw new Error("X trend DTO kind/source is unreviewed");
  const title = text(item.title, "X trend title", 1_000, false);
  if (title.length === 0) throw new Error("X trend title must be nonempty");
  return Object.freeze({
    kind: "trend", id: opaqueId(item.id, "X trend id"), source: item.source, title,
    description: optionalText(item.description, "X trend description", 10_000, true), category: optionalText(item.category, "X trend category", 256),
    postCount: count(item.postCount, "X trend post count"), query: optionalText(item.query, "X trend query", 2_048), url: optionalUrl(item.url, "X trend URL"),
  });
}

import {
  linkedInPersonalProfilePublicIdentifier,
  type LinkedInWebJsonRecord,
} from "./linkedin-web";

export const LINKEDIN_SEARCH_CURSOR_PREFIX = "linkedin-search-v1";
export const LINKEDIN_SEARCH_MAX_ITEMS = 25;
export const LINKEDIN_SEARCH_MAX_EMITTED = 1_000;
export const LINKEDIN_SEARCH_MAX_KEYWORDS = 200;
export const LINKEDIN_SEARCH_PATH = "/search/results/content/";

const LINKEDIN_ORIGIN = "https://www.linkedin.com";
const ACTIVITY_URN = /^urn:li:activity:([0-9]{10,20})$/u;
const RELATIVE_TIME = /^(?:now|just now|[1-9][0-9]?[smhdw]|[1-9][0-9]?mo)$/iu;

export type LinkedInSearchTarget = {
  readonly keywords: string;
  readonly searchUrl: string;
};

export type LinkedInSearchCursor = {
  readonly keywords: string;
  readonly emitted: number;
};

export type LinkedInSearchPost = {
  readonly activityUrn: string;
  readonly url: string;
  readonly authorVanity: string | null;
  readonly authorName: string | null;
  readonly authorHeadline: string | null;
  readonly text: string;
  readonly relativeTime: string | null;
  readonly reactionCount: number | null;
  readonly commentCount: number | null;
};

export type LinkedInSearchPage = {
  readonly schemaVersion: 1;
  readonly provider: "linkedin";
  readonly feed: "search";
  readonly query: string;
  readonly observedAt: string;
  readonly posts: readonly LinkedInSearchPost[];
  readonly items: readonly {
    readonly activity_urn: string;
    readonly url: string;
  }[];
  readonly nextCursor: string | null;
  readonly complete: boolean;
};

export type LinkedInSearchCard = {
  readonly activityUrn: string | null;
  readonly url: string | null;
  readonly authorVanity: string | null;
  readonly authorName: string | null;
  readonly authorHeadline: string | null;
  readonly text: string | null;
  readonly relativeTime: string | null;
  readonly reactionCount: number | null;
  readonly commentCount: number | null;
};

export type LinkedInSearchSnapshot = {
  readonly cards: readonly LinkedInSearchCard[];
  readonly searchId: string | null;
  readonly nextPageRequest: boolean;
};

function isRecord(value: unknown): value is LinkedInWebJsonRecord {
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

function optionalBoundedText(
  value: unknown,
  label: string,
  maximum: number,
): string | null {
  if (value === null || value === undefined) return null;
  return boundedText(value, label, maximum);
}

function nonnegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return value as number;
}

export function linkedInSearchKeywords(value: unknown): string {
  const keywords = boundedText(value, "LinkedIn search query", LINKEDIN_SEARCH_MAX_KEYWORDS).trim();
  if (keywords.length < 1 || keywords.length > LINKEDIN_SEARCH_MAX_KEYWORDS) {
    throw new Error("LinkedIn search query must be a bounded non-empty string");
  }
  return keywords;
}

export function linkedInSearchTarget(keywords: string): LinkedInSearchTarget {
  const url = new URL(`${LINKEDIN_ORIGIN}${LINKEDIN_SEARCH_PATH}`);
  url.searchParams.set("keywords", keywords);
  return Object.freeze({ keywords, searchUrl: url.href });
}

export function encodeLinkedInSearchCursor(cursor: LinkedInSearchCursor): string {
  const keywords = linkedInSearchKeywords(cursor.keywords);
  const emitted = nonnegativeInteger(cursor.emitted, "LinkedIn search cursor emitted count");
  if (emitted > LINKEDIN_SEARCH_MAX_EMITTED) {
    throw new Error("LinkedIn search cursor exceeded its reviewed bound");
  }
  return `${LINKEDIN_SEARCH_CURSOR_PREFIX}:${encodeURIComponent(keywords)}:${emitted}`;
}

export function parseLinkedInSearchCursor(
  value: unknown,
  expectedKeywords: string,
): LinkedInSearchCursor {
  if (value === undefined) {
    return Object.freeze({ keywords: expectedKeywords, emitted: 0 });
  }
  const raw = boundedText(value, "LinkedIn search cursor", 4_096);
  const match = new RegExp(
    `^${LINKEDIN_SEARCH_CURSOR_PREFIX}:([^:]+):(0|[1-9][0-9]{0,4})$`,
    "u",
  ).exec(raw);
  if (match?.[1] === undefined || match[2] === undefined) {
    throw new Error("LinkedIn search cursor is invalid");
  }
  let keywords: string;
  try {
    keywords = linkedInSearchKeywords(decodeURIComponent(match[1]));
  } catch {
    throw new Error("LinkedIn search cursor is invalid");
  }
  if (keywords !== expectedKeywords) {
    throw new Error("LinkedIn search cursor does not match the requested query");
  }
  const emitted = nonnegativeInteger(Number(match[2]), "LinkedIn search cursor emitted count");
  if (emitted > LINKEDIN_SEARCH_MAX_EMITTED) {
    throw new Error("LinkedIn search cursor exceeded its reviewed bound");
  }
  return Object.freeze({ keywords, emitted });
}

export function linkedInSearchCard(value: unknown, label: string): LinkedInSearchCard {
  const card = ((): LinkedInWebJsonRecord => {
    if (!isRecord(value)) throw new Error(`${label} must be an object`);
    return value;
  })();
  const activityUrn = optionalBoundedText(card.activityUrn, `${label}.activityUrn`, 128);
  if (activityUrn !== null && !ACTIVITY_URN.test(activityUrn)) {
    throw new Error(`${label}.activityUrn is invalid`);
  }
  const url = optionalBoundedText(card.url, `${label}.url`, 2_048);
  if (url !== null) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`${label}.url is invalid`);
    }
    if (
      parsed.origin !== LINKEDIN_ORIGIN
      || !/^\/feed\/update\/urn:li:activity:[0-9]{10,20}\/?$/u.test(parsed.pathname)
      || parsed.search !== ""
      || parsed.hash !== ""
      || parsed.username !== ""
      || parsed.password !== ""
    ) throw new Error(`${label}.url escaped its exact reviewed route`);
  }
  const authorVanity = optionalBoundedText(card.authorVanity, `${label}.authorVanity`, 100);
  const relativeTime = optionalBoundedText(card.relativeTime, `${label}.relativeTime`, 16);
  if (relativeTime !== null && !RELATIVE_TIME.test(relativeTime)) {
    throw new Error(`${label}.relativeTime is invalid`);
  }
  for (const field of ["reactionCount", "commentCount"] as const) {
    const count = card[field];
    if (count !== null && count !== undefined) {
      nonnegativeInteger(count, `${label}.${field}`);
    }
  }
  return Object.freeze({
    activityUrn,
    url,
    authorVanity: authorVanity === null ? null : linkedInPersonalProfilePublicIdentifier(authorVanity),
    authorName: optionalBoundedText(card.authorName, `${label}.authorName`, 200),
    authorHeadline: optionalBoundedText(card.authorHeadline, `${label}.authorHeadline`, 300),
    text: optionalBoundedText(card.text, `${label}.text`, 12_000),
    relativeTime,
    reactionCount: card.reactionCount === undefined || card.reactionCount === null
      ? null
      : nonnegativeInteger(card.reactionCount, `${label}.reactionCount`),
    commentCount: card.commentCount === undefined || card.commentCount === null
      ? null
      : nonnegativeInteger(card.commentCount, `${label}.commentCount`),
  });
}

export function linkedInSearchSnapshot(value: unknown): LinkedInSearchSnapshot {
  if (!isRecord(value)) throw new Error("LinkedIn search snapshot must be an object");
  if (!Array.isArray(value.cards) || value.cards.length > 200) {
    throw new Error("LinkedIn search snapshot cards are malformed");
  }
  const cards = value.cards.map((card, index) =>
    linkedInSearchCard(card, `LinkedIn search card ${index}`));
  const searchId = optionalBoundedText(value.searchId, "LinkedIn search id", 64);
  if (searchId !== null && !/^[0-9a-f-]{36}$/u.test(searchId)) {
    throw new Error("LinkedIn search id is invalid");
  }
  if (typeof value.nextPageRequest !== "boolean") {
    throw new Error("LinkedIn search snapshot omitted its pager state");
  }
  return Object.freeze({
    cards: Object.freeze(cards),
    searchId,
    nextPageRequest: value.nextPageRequest,
  });
}

export function projectLinkedInSearchPage(input: {
  readonly snapshots: readonly LinkedInSearchSnapshot[];
  readonly target: LinkedInSearchTarget;
  readonly emitted: number;
  readonly limit: number;
  readonly observedAt: string;
  readonly pagerExhausted: boolean;
}): LinkedInSearchPage {
  const seen = new Set<string>();
  const deduped: LinkedInSearchCard[] = [];
  for (const snapshot of input.snapshots) {
    for (const card of snapshot.cards) {
      if (card.activityUrn === null) {
        throw new Error("LinkedIn search card omitted its activity URN");
      }
      if (seen.has(card.activityUrn)) continue;
      seen.add(card.activityUrn);
      deduped.push(card);
    }
  }
  if (deduped.length < input.emitted) {
    throw new Error("LinkedIn search resumed fewer results than its cursor emitted");
  }
  const fresh = deduped.slice(input.emitted, input.emitted + input.limit);
  const posts = fresh.map((card) => Object.freeze({
    activityUrn: card.activityUrn!,
    url: card.url ?? `${LINKEDIN_ORIGIN}/feed/update/${card.activityUrn}/`,
    authorVanity: card.authorVanity,
    authorName: card.authorName,
    authorHeadline: card.authorHeadline,
    text: card.text ?? "",
    relativeTime: card.relativeTime,
    reactionCount: card.reactionCount,
    commentCount: card.commentCount,
  }));
  const last = input.snapshots[input.snapshots.length - 1];
  const moreAvailable = last?.nextPageRequest === true && !input.pagerExhausted;
  const consumed = input.emitted + posts.length;
  const nextCursor = posts.length > 0 && (moreAvailable || deduped.length > consumed)
    ? encodeLinkedInSearchCursor({ keywords: input.target.keywords, emitted: consumed })
    : null;
  return Object.freeze({
    schemaVersion: 1,
    provider: "linkedin",
    feed: "search",
    query: input.target.keywords,
    observedAt: input.observedAt,
    posts: Object.freeze(posts),
    items: Object.freeze(posts.map((post) => Object.freeze({
      activity_urn: post.activityUrn,
      url: post.url,
    }))),
    nextCursor,
    complete: nextCursor === null,
  });
}

export function linkedInSearchInputIssues(
  input: Readonly<Record<string, unknown>>,
): readonly string[] {
  const issues: string[] = [];
  if (input.feed !== "search") return Object.freeze(issues);
  if (input.profile_url !== undefined) {
    issues.push("input.profile_url is not accepted for the search feed");
  }
  if (input.vanity !== undefined) {
    issues.push("input.vanity is not accepted for the search feed");
  }
  if (input.query === undefined) {
    issues.push("input.query is required for the search feed");
    return Object.freeze(issues);
  }
  try {
    linkedInSearchKeywords(input.query);
  } catch (error) {
    issues.push(error instanceof Error ? error.message : "LinkedIn search query is invalid");
  }
  if (input.cursor !== undefined) {
    try {
      parseLinkedInSearchCursor(input.cursor, linkedInSearchKeywords(input.query));
    } catch (error) {
      issues.push(error instanceof Error ? error.message : "LinkedIn search cursor is invalid");
    }
  }
  return Object.freeze(issues);
}

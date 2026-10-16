import type { XSocialNotification, XSocialPost, XSocialProfile, XSocialTrend } from "./providers/x-web-model";

export const APP_HOST_X_FEEDS = ["home", "following", "profile-posts", "profile-replies", "profile-highlights", "profile-reposts", "likes", "bookmarks", "followers", "following-accounts"] as const;
export type AppHostXFeed = typeof APP_HOST_X_FEEDS[number];
export const APP_HOST_X_ACTIONS = ["post", "reply", "quote", "delete", "like", "unlike", "repost", "unrepost", "bookmark", "unbookmark", "follow", "unfollow"] as const;
export type AppHostXIntent = {
  readonly action: typeof APP_HOST_X_ACTIONS[number];
  readonly text?: string;
  readonly postId?: string;
  readonly subject?: string;
  readonly media?: readonly string[];
  readonly expectedText?: string;
};
export type AppHostXBinding = { readonly accountId: string; readonly expectedAccountRevision: string };
export type AppHostXRequest = AppHostXBinding & (
  | { readonly action: "x.capabilities" }
  | { readonly action: "x.profile.get"; readonly profile: string | null }
  | { readonly action: "x.post.get"; readonly postId: string }
  | { readonly action: "x.feed.list"; readonly source: AppHostXFeed; readonly profile: string | null; readonly cursor: string | null; readonly limit: number }
  | { readonly action: "x.notifications.list"; readonly cursor: string | null; readonly limit: number }
  | { readonly action: "x.explore.list"; readonly source: "trending" | "today-news"; readonly target: string | null; readonly cursor: string | null; readonly limit: number }
  | { readonly action: "x.media.prepare"; readonly files: readonly { readonly path: string; readonly mediaType: "image/png" | "image/jpeg" | "video/mp4"; readonly altText?: string | null }[] }
  | { readonly action: "x.action.prepare"; readonly intent: AppHostXIntent }
  | { readonly action: "x.action.commit"; readonly preparationId: string; readonly digest: string }
  | { readonly action: "x.action.cancel"; readonly preparationId: string }
  | { readonly action: "x.action.status"; readonly runId: string }
);
export type AppHostXEntry =
  | { readonly kind: "post"; readonly id: string; readonly post: XSocialPost }
  | { readonly kind: "profile"; readonly id: string; readonly profile: XSocialProfile }
  | { readonly kind: "notification"; readonly id: string; readonly notification: XSocialNotification }
  | { readonly kind: "trend"; readonly id: string; readonly trend: XSocialTrend; readonly target?: string }
  | { readonly kind: "unavailable"; readonly id: string; readonly reason: string | null };
type Observation = { readonly modelVersion: 1; readonly accountId: string; readonly accountRevision: string; readonly fetchedAt: string };
export type AppHostXMedia = { readonly mediaId: string; readonly mediaType: "image/png" | "image/jpeg" | "video/mp4"; readonly filename: string | null; readonly byteLength: number | null; readonly sha256: string | null; readonly altText: string | null };
export type AppHostXData = Observation & (
  | { readonly kind: "x-capabilities"; readonly capabilities: readonly { readonly name: string; readonly supported: boolean; readonly reason: string | null }[] }
  | { readonly kind: "x-profile"; readonly profile: XSocialProfile }
  | { readonly kind: "x-page"; readonly source: string; readonly entries: readonly AppHostXEntry[]; readonly nextCursor: string | null; readonly completeness: "page" | "complete" | "filtered" }
  | { readonly kind: "x-media"; readonly media: readonly AppHostXMedia[] }
  | { readonly kind: "x-action"; readonly preparationId: string | null; readonly digest: string | null; readonly review: string | null; readonly state: "prepared" | "completed" | "denied" | "failed" | "uncertain"; readonly runId: string | null }
);

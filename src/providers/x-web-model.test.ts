import { describe, expect, test } from "bun:test";
import { assertProperty, fc } from "../test-support";
import {
  X_SOCIAL_MODEL_VERSION,
  parseXSocialNotification,
  parseXSocialPost,
  parseXSocialProfile,
  parseXSocialTrend,
  projectXSocialPost,
  projectXSocialProfile,
  projectXSocialTweetContent,
  type XSocialNotification,
} from "./x-web-model";

const time = "Tue Jul 22 12:00:00 +0000 2026";

function user(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    __typename: "User", rest_id: "42", core: { screen_name: "Hraness", name: "Hraness" },
    ...overrides,
  };
}

function tweet(legacy: Record<string, unknown> = {}, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    __typename: "Tweet", rest_id: "800",
    core: { user_results: { result: user() } },
    legacy: { full_text: "post", created_at: time, user_id_str: "42", ...legacy },
    ...overrides,
  };
}

function image(id = "11"): Record<string, unknown> {
  return {
    id_str: id, media_key: `3_${id}`, type: "photo", media_url_https: `https://pbs.twimg.com/media/image${id}.jpg`,
    ext_alt_text: "A useful image", original_info: { width: 1200, height: 800 },
  };
}

describe("X rich post model", () => {
  test("shared wire text projection needs no unrelated post fields and refuses incomplete notes", () => {
    expect(projectXSocialTweetContent({ legacy: { full_text: "wire -&gt; &amp;gt;" } }).text).toBe("wire -> &gt;");
    for (const note_tweet of [{}, { note_tweet_results: {} }, { note_tweet_results: { result: null } },
      { note_tweet_results: { result: { text: 123 } } }, { note_tweet_results: { result: { text: "bad @Fixture",
        entity_set: { user_mentions: [{ indices: [0, 8], screen_name: "Fixture" }] } } } }]) {
      expect(() => projectXSocialTweetContent({ legacy: { full_text: "preview" }, note_tweet })).toThrow();
    }
    expect(projectXSocialTweetContent({ legacy: { full_text: "preview" }, note_tweet: {
      note_tweet_results: { result: { text: "exact &gt; note" } },
    } }).text).toBe("exact &gt; note");
  });

  test("keeps exact identities, counts and explicit viewer states, with unknown omitted evidence", () => {
    const post = projectXSocialPost(tweet({
      id_str: "800", favorited: false, retweeted: true, bookmarked: false,
      reply_count: 0, favorite_count: 123, retweet_count: 4, bookmark_count: 5, in_reply_to_status_id_str: "799",
    }));
    expect(post).toMatchObject({
      modelVersion: X_SOCIAL_MODEL_VERSION, kind: "post", id: "800", authorId: "42", authorUsername: "hraness", authorName: "Hraness",
      replyToPostId: "799", liked: false, reposted: true, saved: false,
      metrics: { replies: 0, reposts: 4, likes: 123, bookmarks: 5 }, url: "https://x.com/i/status/800",
      promotion: { status: "unknown", source: null }, moderation: { status: "unknown", labels: [] },
      quote: { status: "unknown", postId: null, post: null }, repost: { status: "unknown", postId: null, post: null },
      media: { status: "unknown", items: [] },
    });
    expect(post.content.entities).toEqual({ status: "unknown", mentions: [], hashtags: [], cashtags: [], links: [] });
    expect(Object.isFrozen(post)).toBeTrue();
    expect(Object.isFrozen(post.metrics)).toBeTrue();
  });

  test("converts provider scalar mention, hashtag, cashtag and URL ranges to UTF16", () => {
    const body = "🦀 @Hraness #Rust $RUST https://t.co/a";
    const entity = (token: string) => [Array.from(body.slice(0, body.indexOf(token))).length, Array.from(body.slice(0, body.indexOf(token) + token.length)).length];
    const post = projectXSocialPost(tweet({ full_text: body, entities: {
      user_mentions: [{ indices: entity("@Hraness"), screen_name: "Hraness", id_str: "42" }],
      hashtags: [{ indices: entity("#Rust"), text: "Rust" }], symbols: [{ indices: entity("$RUST"), text: "RUST" }],
      urls: [{ indices: entity("https://t.co/a"), url: "https://t.co/a", expanded_url: "https://hraness.com", display_url: "hraness.com" }],
    } }));
    expect(post.text).toBe(body);
    expect(post.content.offsetEncoding).toBe("utf16");
    expect(post.content.entities).toEqual({
      status: "available", mentions: [{ start: 3, end: 11, handle: "hraness", userId: "42" }],
      hashtags: [{ start: 12, end: 17, tag: "Rust" }], cashtags: [{ start: 18, end: 23, symbol: "RUST" }],
      links: [{ start: 24, end: body.length, url: "https://t.co/a", expandedUrl: "https://hraness.com/", displayUrl: "hraness.com" }],
    });
  });

  test("decodes the legacy plain-text arrow once and remaps all later entity ranges", () => {
    const wire = "🦀 no doubt -&gt; bad for you &amp; @Fixture #Build $TEST https://t.co/a";
    const indices = (token: string) => {
      const start = wire.indexOf(token);
      return [Array.from(wire.slice(0, start)).length, Array.from(wire.slice(0, start + token.length)).length];
    };
    const post = projectXSocialPost(tweet({ full_text: wire, entities: {
      user_mentions: [{ indices: indices("@Fixture"), screen_name: "Fixture", id_str: "42" }],
      hashtags: [{ indices: indices("#Build"), text: "Build" }], symbols: [{ indices: indices("$TEST"), text: "TEST" }],
      urls: [{ indices: indices("https://t.co/a"), url: "https://t.co/a", expanded_url: "https://example.com/?x=1&y=2" }],
    } }));
    expect(post.text).toBe("🦀 no doubt -> bad for you & @Fixture #Build $TEST https://t.co/a");
    expect(post.content.text).toBe(post.text);
    expect(post.content.entities.mentions[0]).toMatchObject({ start: 29, end: 37, handle: "fixture" });
    expect(post.content.entities.hashtags[0]).toMatchObject({ start: 38, end: 44, tag: "Build" });
    expect(post.content.entities.cashtags[0]).toMatchObject({ start: 45, end: 50, symbol: "TEST" });
    expect(post.content.entities.links[0]).toMatchObject({ start: 51, end: 65, expandedUrl: "https://example.com/?x=1&y=2" });
    expect(parseXSocialPost(JSON.parse(JSON.stringify(post)))).toEqual(post);
  });

  test("legacy text decodes only the six first-party escapes once and admits DTOs without another decode", () => {
    const post = projectXSocialPost(tweet({ full_text: "&amp;&gt;&lt;&nbsp;&quot;&#39; &amp;gt; &amp;quot; &#x3E; &apos; &GT; &lt;script&gt;" }));
    expect(post.text).toBe("&><\u00a0\"' &gt; &quot; &#x3E; &apos; &GT; <script>");
    expect(post.content.entities.status).toBe("unknown");
    const admitted = parseXSocialPost(JSON.parse(JSON.stringify(post)));
    expect(admitted).toEqual(post);
    expect(parseXSocialPost(JSON.parse(JSON.stringify(admitted)))).toEqual(post);
  });

  test("adjacent legacy text gaps move ranges without decoding URL tokens or link metadata", () => {
    const url = "https://example.com/?literal=&amp;gt;";
    const wire = `&amp;@Fixture&gt;#Build&lt;$TEST&nbsp;${url}&quot;`;
    const index = (token: string) => [wire.indexOf(token), wire.indexOf(token) + token.length];
    const post = projectXSocialPost(tweet({ full_text: wire, entities: {
      user_mentions: [{ indices: index("@Fixture"), screen_name: "Fixture" }],
      hashtags: [{ indices: index("#Build"), text: "Build" }], symbols: [{ indices: index("$TEST"), text: "TEST" }],
      urls: [{ indices: index(url), url, expanded_url: url, display_url: "example.com/?literal=&amp;gt;" }],
    } }));
    expect(post.text).toBe(`&@Fixture>#Build<$TEST\u00a0${url}"`);
    expect(post.content.entities.mentions[0]).toMatchObject({ start: 1, end: 9 });
    expect(post.content.entities.hashtags[0]).toMatchObject({ start: 10, end: 16 });
    expect(post.content.entities.cashtags[0]).toMatchObject({ start: 17, end: 22 });
    expect(post.content.entities.links[0]).toEqual({ start: 23, end: 23 + url.length, url, expandedUrl: url,
      displayUrl: "example.com/?literal=&amp;gt;" });
    expect(parseXSocialPost(JSON.parse(JSON.stringify(post)))).toEqual(post);
  });

  test("legacy entity boundaries prevent an escape from being decoded across a hashtag token", () => {
    const post = projectXSocialPost(tweet({ full_text: "&#39;", entities: { hashtags: [{ indices: [1, 4], text: "39" }] } }));
    expect(post.text).toBe("&#39;");
    expect(post.content.entities.hashtags[0]).toEqual({ start: 1, end: 4, tag: "39" });
    expect(() => projectXSocialPost(tweet({ full_text: "&gt; @Fixture", entities: {
      user_mentions: [{ indices: [2, 10], screen_name: "Fixture" }],
    } }))).toThrow("did not bind selected text");
  });

  test("regression: seed -2130867000 path 0:0:1:0 decodes a trailing escape after adjacent entities", () => {
    const tokens = ["@Fixture", "#Build", "$TEST", "https://example.com/?literal=&amp;gt;"];
    const wire = tokens.join("") + "&gt;";
    const indices = (token: string) => [wire.indexOf(token), wire.indexOf(token) + token.length];
    const post = projectXSocialPost(tweet({ full_text: wire, entities: {
      user_mentions: [{ indices: indices(tokens[0]!), screen_name: "Fixture" }],
      hashtags: [{ indices: indices(tokens[1]!), text: "Build" }], symbols: [{ indices: indices(tokens[2]!), text: "TEST" }],
      urls: [{ indices: indices(tokens[3]!), url: tokens[3], expanded_url: tokens[3] }],
    } }));
    expect(post.text).toBe(tokens.join("") + ">");
    expect(parseXSocialPost(JSON.parse(JSON.stringify(post)))).toEqual(post);
  });

  test("legacy gap decoding does not change selected note text or modern and legacy profile descriptions", () => {
    const wire = "&amp;gt; &gt; @Fixture";
    const mentions = { user_mentions: [{ indices: [14, 22], screen_name: "Fixture" }] };
    const post = projectXSocialPost(tweet({ full_text: "legacy &gt; preview" }, {
      note_tweet: { note_tweet_results: { result: { text: wire, entity_set: mentions } } },
    }));
    expect(post.text).toBe(wire);
    expect(post.content.source).toBe("note");
    expect(parseXSocialPost(JSON.parse(JSON.stringify(post)))).toEqual(post);
    for (const raw of [user({ profile_bio: { description: wire, entities: mentions } }),
      user({ legacy: { description: wire, entities: { description: mentions } } })]) {
      const profile = projectXSocialProfile(raw);
      expect(profile.bio).toBe(wire); expect(profile.bioContent?.text).toBe(wire);
      expect(parseXSocialProfile(JSON.parse(JSON.stringify(profile)))).toEqual(profile);
    }
  });

  test("property: legacy escaping, astral prefixes and adjacent entities preserve semantic slices and DTO round trips", () => {
    const part = fc.constantFrom(["🦀", "🦀"], ["A", "A"], ["中", "中"], ["&gt;", ">"], ["&amp;", "&"],
      ["&lt;", "<"], ["&nbsp;", "\u00a0"], ["&quot;", '"'], ["&#39;", "'"], ["&amp;gt;", "&gt;"], ["&#x3E;", "&#x3E;"]);
    assertProperty(fc.property(fc.array(part, { maxLength: 30 }), fc.array(part, { maxLength: 30 }), (prefix, suffix) => {
      const url = "https://example.com/?literal=&amp;gt;";
      const tokens = ["@Fixture", "#Build", "$TEST", url];
      const wire = prefix.map(pair => pair[0]).join("") + tokens.join("") + suffix.map(pair => pair[0]).join("");
      const expected = prefix.map(pair => pair[1]).join("") + tokens.join("") + suffix.map(pair => pair[1]).join("");
      const indices = (token: string) => {
        const start = wire.indexOf(token);
        return [Array.from(wire.slice(0, start)).length, Array.from(wire.slice(0, start + token.length)).length];
      };
      const post = projectXSocialPost(tweet({ full_text: wire, entities: {
        user_mentions: [{ indices: indices(tokens[0]!), screen_name: "Fixture" }],
        hashtags: [{ indices: indices(tokens[1]!), text: "Build" }], symbols: [{ indices: indices(tokens[2]!), text: "TEST" }],
        urls: [{ indices: indices(url), url, expanded_url: url }],
      } }));
      expect(post.text).toBe(expected);
      const entities = [post.content.entities.mentions[0]!, post.content.entities.hashtags[0]!, post.content.entities.cashtags[0]!, post.content.entities.links[0]!];
      expect(entities.map(entity => post.text.slice(entity.start, entity.end))).toEqual(tokens);
      expect(entities[0]!.start).toBe(prefix.map(pair => pair[1]).join("").length);
      expect(parseXSocialPost(JSON.parse(JSON.stringify(post)))).toEqual(post);
    }), { numRuns: 100 });
  });

  test("note text scalar offsets convert once and serialized UTF16 offsets stay exact", () => {
    const post = projectXSocialPost(tweet({ full_text: "preview @wrong" }, {
      note_tweet: { note_tweet_results: { result: { text: "🦀🦀 @Fixture", entity_set: {
        user_mentions: [{ indices: [3, 11], screen_name: "Fixture", id_str: "42" }],
      } } } },
    }));
    expect(post.content).toMatchObject({ source: "note", offsetEncoding: "utf16", entities: { mentions: [{ start: 5, end: 13, handle: "fixture" }] } });
    expect(parseXSocialPost(JSON.parse(JSON.stringify(post)))).toEqual(post);
    const changed = JSON.parse(JSON.stringify(post));
    changed.content.entities.mentions[0].start = 1;
    expect(() => parseXSocialPost(changed)).toThrow("in-bounds UTF16");
  });

  test("link entity tokens round-trip exactly while navigation URLs may normalize", () => {
    for (const token of ["https://example.com", "https://example.com/", "https://Example.COM:443", "HTTPS://Example.COM:443/A?x=1#Part", "http://Example.COM:80/path"]) {
      const post = projectXSocialPost(tweet({ full_text: "🦀 " + token, entities: { urls: [
        { indices: [2, 2 + token.length], url: token, expanded_url: token },
      ] } }));
      expect(post.content.entities.links[0]?.url).toBe(token);
      expect(post.content.entities.links[0]?.expandedUrl).toBe(new URL(token).href);
      expect(parseXSocialPost(JSON.parse(JSON.stringify(post)))).toEqual(post);
      const profile = projectXSocialProfile(user({ legacy: { description: token, entities: { description: { urls: [
        { indices: [0, token.length], url: token },
      ] } } } }));
      expect(profile.bioContent?.entities.links[0]?.url).toBe(token);
      expect(parseXSocialProfile(JSON.parse(JSON.stringify(profile)))).toEqual(profile);
    }
  });

  test("property: link token spelling survives normalization and serialized admission", () => {
    assertProperty(fc.property(fc.stringMatching(/^[a-zA-Z0-9_-]{0,40}$/u), segment => {
      const token = `HTTPS://Example.COM:443/${segment}`;
      const post = projectXSocialPost(tweet({ full_text: token, entities: { urls: [
        { indices: [0, token.length], url: token, expanded_url: token },
      ] } }));
      expect(post.content.entities.links[0]?.url).toBe(token);
      expect(parseXSocialPost(JSON.parse(JSON.stringify(post)))).toEqual(post);
    }));
  });

  test("selects note text and its entity set together, never truncated legacy entity ranges", () => {
    const post = projectXSocialPost(tweet({ full_text: "@wrong…", entities: { user_mentions: [{ indices: [0, 6], screen_name: "wrong" }] } }, {
      note_tweet: { note_tweet_results: { result: { text: "Full note @Hraness", entity_set: { user_mentions: [{ indices: [10, 18], screen_name: "Hraness" }] } } } },
    }));
    expect(post.content).toMatchObject({ text: "Full note @Hraness", source: "note", entities: { mentions: [{ start: 10, end: 18, handle: "hraness", userId: null }] } });
    const noRanges = projectXSocialPost(tweet({ full_text: "@wrong", entities: { user_mentions: [{ indices: [0, 6], screen_name: "wrong" }] } }, {
      note_tweet: { note_tweet_results: { result: { text: "Complete note without a mention" } } },
    }));
    expect(noRanges.content.entities).toMatchObject({ status: "unknown", mentions: [] });
  });

  test("accepts explicit empty entity evidence and multiline public text", () => {
    const post = projectXSocialPost(tweet({ full_text: "line one\nline two\twith CR\r", entities: {} }));
    expect(post.content.entities.status).toBe("available");
    expect(post.text).toContain("\n");
  });

  test("rejects mismatched text, surrogate-splitting, invalid and overlapping ranges", () => {
    for (const indices of [[-1, 4], [0, 99], [1, 4], [0, 1], [3, 3], [3.1, 4]]) {
      expect(() => projectXSocialPost(tweet({ full_text: "🦀 #tag", entities: { hashtags: [{ indices, text: "tag" }] } }))).toThrow();
    }
    expect(() => projectXSocialPost(tweet({ full_text: "@wrong", entities: { user_mentions: [{ indices: [0, 6], screen_name: "other" }] } }))).toThrow("did not bind");
    expect(() => projectXSocialPost(tweet({ full_text: "#tag", entities: { hashtags: [{ indices: [0, 4], text: "tag" }, { indices: [0, 4], text: "tag" }] } }))).toThrow("overlapped");
    expect(() => projectXSocialPost(tweet({ full_text: "#tag", entities: { hashtags: [{ indices: [0, 4], text: "other" }] } }))).toThrow("did not bind");
  });

  test("rejects unsafe URLs and hidden control text before they reach consumers", () => {
    const body = "https://t.co/a";
    for (const expanded_url of ["javascript:alert(1)", "file:///tmp/a", "https://user:pass@example.com", "http://localhost/a", "http://127.1/a", "http://[::1]/a", " https://example.com", "https://example.com/\nattack"]) {
      expect(() => projectXSocialPost(tweet({ full_text: body, entities: { urls: [{ indices: [0, body.length], url: body, expanded_url }] } }))).toThrow("URL");
    }
    expect(() => projectXSocialPost(tweet({ full_text: "hidden\u0000body" }))).toThrow("public text");
    expect(() => projectXSocialPost(tweet({ full_text: "a".repeat(32_769) }))).toThrow("public text");
  });

  test("projects ordered images, retains alt text, and copies no raw metadata", () => {
    const first = image();
    const post = projectXSocialPost(tweet({ entities: { media: [first] }, extended_entities: { media: [first, image("12")] } }));
    expect(post.media.status).toBe("available");
    expect(post.media.items.map((item) => item.id)).toEqual(["11", "12"]);
    expect(post.media.items[0]).toEqual({
      id: "11", mediaKey: "3_11", type: "image", url: "https://pbs.twimg.com/media/image11.jpg", previewUrl: "https://pbs.twimg.com/media/image11.jpg",
      altText: "A useful image", width: 1200, height: 800, durationMs: null, variants: [],
    });
    first.ext_alt_text = "changed afterwards";
    expect(post.media.items[0]!.altText).toBe("A useful image");
    expect(Object.isFrozen(post.media.items)).toBeTrue();
    expect(projectXSocialPost(tweet({ extended_entities: { media: [] } })).media).toEqual({ status: "available", items: [] });
  });

  test("models video renditions and animated GIFs without pretending previews are video assets", () => {
    const video = { ...image(), type: "video", video_info: { duration_millis: 4_500, variants: [
      { content_type: "video/mp4", bitrate: 832_000, url: "https://video.twimg.com/vid/video.mp4" },
      { content_type: "application/x-mpegURL", url: "https://video.twimg.com/vid/video.m3u8" },
    ] } };
    const result = projectXSocialPost(tweet({ extended_entities: { media: [video] } })).media.items[0]!;
    expect(result).toMatchObject({ type: "video", url: null, previewUrl: "https://pbs.twimg.com/media/image11.jpg", durationMs: 4500 });
    expect(result.variants[1]).toEqual({ contentType: "application/x-mpegURL", url: "https://video.twimg.com/vid/video.m3u8", bitrate: null });
    expect(projectXSocialPost(tweet({ extended_entities: { media: [{ ...video, type: "animated_gif" }] } })).media.items[0]!.type).toBe("animated-gif");
  });

  test("bounds media and rejects duplicated identities, mismatched IDs and unsafe media origins", () => {
    for (const media of [
      [image(), image()], Array.from({ length: 5 }, (_, index) => image(String(index + 1))),
      [{ ...image(), media_key: "3_12" }], [{ ...image(), type: "future" }],
      [{ ...image(), media_url_https: "https://evil.example/image.jpg" }],
      [{ ...image(), video_info: { variants: [] } }],
      [{ ...image(), type: "video", video_info: { variants: [{ content_type: "video/mp4", url: "https://evil.example/video.mp4" }] } }],
    ]) expect(() => projectXSocialPost(tweet({ extended_entities: { media } }))).toThrow();
  });

  test("keeps quote/repost identity and one nested snapshot without recursive trees", () => {
    const nested = tweet({ full_text: "quoted" }, { rest_id: "799", quoted_status_result: { result: tweet({}, { rest_id: "798" }) } });
    const post = projectXSocialPost(tweet({ is_quote_status: true, quoted_status_id_str: "799", retweeted_status_result: { result: { rest_id: "777" } } }, {
      quoted_status_result: { result: nested },
    }));
    expect(post.quote).toMatchObject({ status: "present", postId: "799", post: { id: "799", text: "quoted" } });
    expect(post.quote.post).not.toHaveProperty("quote");
    expect(post.repost).toEqual({ status: "present", postId: "777", post: null });
    expect(projectXSocialPost(tweet({ is_quote_status: false })).quote.status).toBe("absent");
    expect(projectXSocialPost(tweet({ is_quote_status: true })).quote).toEqual({ status: "present", postId: null, post: null });
    expect(projectXSocialPost(tweet({ quoted_status_id_str: "799" }, { quoted_status_result: { result: { __typename: "TweetUnavailable", reason: "deleted" } } })).quote).toEqual({ status: "present", postId: "799", post: null });
  });

  test("a repost retains its original's quote without assigning it to the outer repost", () => {
    const target = tweet({ full_text: "Quoted target", possibly_sensitive: true }, {
      rest_id: "798", quoted_status_result: { result: tweet({}, { rest_id: "797" }) },
    });
    const original = tweet({ full_text: "Original quote", is_quote_status: true, quoted_status_id_str: "798" }, {
      rest_id: "799", quoted_status_result: { result: target },
    });
    const post = projectXSocialPost(tweet({ full_text: "RT Original quote", retweeted_status_id_str: "799", retweeted_status_result: { result: original } }));
    expect(post.quote).toEqual({ status: "unknown", postId: null, post: null });
    expect(post.repost).toMatchObject({ postId: "799", post: { id: "799", text: "Original quote" },
      quote: { status: "present", postId: "798", post: { id: "798", text: "Quoted target", moderation: { status: "present" } } } });
    expect(post.repost.post).not.toHaveProperty("quote");
    expect(post.repost.quote?.post).not.toHaveProperty("quote");
    expect(parseXSocialPost(JSON.parse(JSON.stringify(post)))).toEqual(post);
    // Older three-field repost references remain valid.
    const legacyRepost = { status: post.repost.status, postId: post.repost.postId, post: post.repost.post };
    expect(parseXSocialPost({ ...post, repost: legacyRepost }).repost).toEqual(legacyRepost);
  });

  test("reposted quote identity survives unavailable content and refuses recursive DTO extensions", () => {
    const original = tweet({ is_quote_status: true, quoted_status_id_str: "798" }, {
      rest_id: "799", quoted_status_result: { result: { __typename: "TweetUnavailable" } },
    });
    const post = projectXSocialPost(tweet({ retweeted_status_result: { result: original } }));
    expect(post.repost.quote).toEqual({ status: "present", postId: "798", post: null });
    expect(parseXSocialPost(JSON.parse(JSON.stringify(post)))).toEqual(post);
    expect(() => parseXSocialPost({ ...post, repost: { ...post.repost, quote: { ...post.repost.quote, quote: post.quote } } })).toThrow("exactly");
    expect(() => parseXSocialPost({ ...post, repost: { ...post.repost, post: null } })).toThrow("requires");
    expect(() => parseXSocialPost({ ...post, quote: { ...post.quote, quote: post.quote } })).toThrow("exactly");
  });

  test("property: reposted quote snapshots round-trip with bounded independent identities", () => {
    assertProperty(fc.property(fc.array(fc.constantFrom("a", "🦀", "中", " "), { maxLength: 40 }), parts => {
      const text = parts.join("");
      const original = tweet({ is_quote_status: true, quoted_status_id_str: "798" }, {
        rest_id: "799", quoted_status_result: { result: tweet({ full_text: text }, { rest_id: "798" }) },
      });
      const projected = projectXSocialPost(tweet({ retweeted_status_result: { result: original } }));
      expect(projected.repost.quote?.post?.text).toBe(text);
      expect(projected.repost.quote?.post).not.toHaveProperty("quote");
      expect(parseXSocialPost(JSON.parse(JSON.stringify(projected)))).toEqual(projected);
    }));
  });

  test("rejects switched quote, author and post identities and contradictory states", () => {
    expect(() => projectXSocialPost(tweet({ quoted_status_id_str: "799" }, { quoted_status_result: { result: { rest_id: "778" } } }))).toThrow("target");
    expect(() => projectXSocialPost(tweet({ is_quote_status: false, quoted_status_id_str: "799" }))).toThrow("disagreed");
    expect(() => projectXSocialPost(tweet({ user_id_str: "99" }))).toThrow("author id");
    expect(() => projectXSocialPost(tweet({ id_str: "799" }))).toThrow("post id");
    expect(() => projectXSocialPost(tweet({ favorite_count: "1.2K" }))).toThrow("safe integer");
    expect(() => projectXSocialPost(tweet({ bookmarked: "false" }))).toThrow("boolean");
  });

  test("preserves visible moderation details and per-occurrence promotion without false negative flags", () => {
    const raw = { __typename: "TweetWithVisibilityResults", tweet: tweet({ possibly_sensitive: true }), tweet_interstitial: { display_type: "AIGeneratedContent", text: { text: "Made with AI" } } };
    const promoted = projectXSocialPost(raw, { promotedMetadata: { private_unprojected_field: "not returned" } });
    expect(promoted.moderation).toEqual({ status: "present", labels: [
      { kind: "sensitive", source: "legacy.possibly_sensitive", text: null, reason: null },
      { kind: "interstitial", source: "visibility.tweet_interstitial", text: "Made with AI", reason: "AIGeneratedContent" },
    ] });
    expect(promoted.promotion).toEqual({ status: "present", source: "promotedMetadata" });
    expect(JSON.stringify(promoted)).not.toContain("private_unprojected_field");
    expect(projectXSocialPost(raw).promotion.status).toBe("unknown");
    expect(projectXSocialPost(tweet({ possibly_sensitive: false })).moderation.status).toBe("unknown");
    expect(projectXSocialPost(tweet({ full_text: "Made with AI is just my prose" })).moderation.status).toBe("unknown");
    expect(projectXSocialPost(tweet({}, { content_disclosure: { label: "Made with AI" } })).moderation.labels[0]).toEqual({ kind: "ai-disclosure", source: "content_disclosure", text: "Made with AI", reason: null });
  });

  test("refuses unavailable tweets and bounds visibility wrappers, even for cyclic input", () => {
    expect(() => projectXSocialPost({ __typename: "TweetTombstone", tombstone: { text: "Unavailable" } })).toThrow("unavailable");
    const wrapped: Record<string, unknown> = { __typename: "TweetWithVisibilityResults" };
    wrapped.tweet = wrapped;
    expect(() => projectXSocialPost(wrapped)).toThrow("bound");
  });

  test("preserves the current camelCase interstitial and its separate reveal text", () => {
    const raw = { __typename: "TweetWithVisibilityResults", tweet: tweet(), tweetInterstitial: {
      __typename: "ContextualTweetInterstitial", displayType: "NonCompliant", text: { text: "Post visibility is limited" },
      revealText: { text: "View post", entities: [{ never_return: "raw-rich-entity" }] }, unreviewed: "private-not-returned",
    } };
    const post = projectXSocialPost(raw);
    expect(post.moderation).toEqual({ status: "present", labels: [
      { kind: "interstitial", source: "visibility.tweetInterstitial", text: "Post visibility is limited", reason: "NonCompliant" },
      { kind: "interstitial", source: "visibility.tweetInterstitial.revealText", text: "View post", reason: "NonCompliant" },
    ] });
    expect(parseXSocialPost(JSON.parse(JSON.stringify(post)))).toEqual(post);
    expect(JSON.stringify(post)).not.toContain("private-not-returned");
    expect(JSON.stringify(post)).not.toContain("raw-rich-entity");
    expect(() => projectXSocialPost({ ...raw, tweetInterstitial: { ...raw.tweetInterstitial, display_type: "Different" } })).toThrow("disagreed");
  });

  test("omits nudges the provider does not render without a subheading", () => {
    for (const subheading of [undefined, null, ""]) {
      const value = projectXSocialPost(tweet({}, { tweetVisibilityNudge: { tweet_visibility_nudge_actions: [{ tweet_visibility_nudge_action_type: "ShowNudge", tweet_visibility_nudge_action_payload: {
        heading: "Hidden heading", post_cta_text: "Hidden action", ...(subheading === undefined ? {} : { subheading }),
      } }] } }));
      expect(value.moderation.status).toBe("unknown");
      expect(value.moderation.labels).toEqual([]);
    }
  });

  test("keeps only proven visible nudge, restriction, media and appeal details", () => {
    const raw = { __typename: "TweetWithVisibilityResults", tweet: tweet(),
      softInterventionPivot: { text: "Get context", url: { url: "not-a-provider-endpoint" } },
      tweetVisibilityNudge: { tweet_visibility_nudge_actions: [{ tweet_visibility_nudge_action_type: "ShowNudge", tweet_visibility_nudge_action_payload: {
        heading: "Read before sharing", subheading: { text: "This post needs context" }, post_cta_text: { text: "Learn more" }, cta_url: "private-unused-url",
      } }] },
      limitedActionResults: { limited_actions: [{ action: "Repost", prompt: { __typename: "BasicLimitedActionPrompt", headline: { text: "Sharing is limited" }, subtext: { text: "Learn why" } } }] },
      mediaVisibilityResults: { blurred_image_interstitial: { interstitial_action: "Show", title: "Sensitive media", text: "Media is blurred", opacity: 0.8 } },
      appealable: { policy: "AbusiveBehavior", violation_of_level: "Tweet", prompt: { report_source: "Provider", shorttext: { text: "Policy violation" } } },
    };
    const post = projectXSocialPost(raw);
    expect(post.moderation.labels.map(label => [label.kind, label.text, label.reason])).toEqual([
      ["interstitial", "Get context", "SoftIntervention"],
      ["visibility-nudge", "Read before sharing", "ShowNudge"], ["visibility-nudge", "This post needs context", "ShowNudge"], ["visibility-nudge", "Learn more", "ShowNudge"],
      ["limited-action", "Sharing is limited", "Repost"], ["limited-action", "Learn why", "Repost"],
      ["media-warning", "Media is blurred", "Show"], ["media-warning", "Sensitive media", "Show"],
      ["appeal", "Policy violation", "AbusiveBehavior"], ["appeal", null, "Tweet"], ["appeal", null, "Provider"],
    ]);
    expect(post.moderation.labels[5]?.source).toBe("visibility.limitedActionResults.limited_actions[0].prompt.subtext");
    expect(parseXSocialPost(JSON.parse(JSON.stringify(post)))).toEqual(post);
    expect(JSON.stringify(post)).not.toContain("private-unused-url");
    expect(JSON.stringify(post)).not.toContain("not-a-provider-endpoint");
    expect(projectXSocialPost(tweet({}, { has_birdwatch_notes: true })).moderation.status).toBe("unknown");
    expect(projectXSocialPost(tweet({}, { tweetVisibilityNudge: { tweet_visibility_nudge_actions: [] }, limitedActionResults: { limited_actions: [] } })).moderation.status).toBe("unknown");
    const preview = projectXSocialPost({ __typename: "TweetPreviewDisplay", tweet: tweet(), limited_action_results: { limited_actions: [{ action: "Reply" }] } });
    expect(preview.moderation.labels).toEqual([{ kind: "limited-action", source: "visibility.limited_action_results.limited_actions[0]", text: null, reason: "Reply" }]);
    expect(projectXSocialPost(tweet({}, { softIntervention: { text: "Additional context" } })).moderation.labels[0]).toEqual({ kind: "interstitial", source: "softIntervention", text: "Additional context", reason: "SoftIntervention" });
  });

  test("bounds visible flag text and the aggregate label count without dumping unknown prompts", () => {
    const unknown = projectXSocialPost(tweet({}, { limitedActionResults: { limited_actions: [{ action: "Reply", prompt: { __typename: "FuturePrompt", headline: { text: "not-reviewed" } } }] } }));
    expect(unknown.moderation.labels).toEqual([{ kind: "limited-action", source: "limitedActionResults.limited_actions[0]", text: null, reason: "Reply" }]);
    expect(() => projectXSocialPost(tweet({}, { tweetInterstitial: { text: { text: "x".repeat(10_001) } } }))).toThrow("bounded");
    expect(() => projectXSocialPost(tweet({}, { limitedActionResults: { limited_actions: Array.from({ length: 17 }, () => ({ action: "Reply", prompt: { __typename: "BasicLimitedActionPrompt", headline: { text: "Heading" }, subtext: { text: "Subtext" } } })) } }))).toThrow("labels exceeded");
    expect(() => projectXSocialPost(tweet({}, { tweetVisibilityNudge: { tweet_visibility_nudge_actions: Array.from({ length: 33 }, () => ({})) } }))).toThrow("array bound");
  });

  test("Community Notes require an actual pivot and preserve only reviewed visible text", () => {
    const post = projectXSocialPost(tweet({}, { birdwatch_pivot: {
      subtitle: { text: "Readers added context", entities: [{ raw_unused: "not-returned" }] }, footer: { text: "Learn more about Community Notes" },
      note: { rest_id: "711", language: "en", unreviewed: "private-unused" }, destinationUrl: "not-a-transport-endpoint",
    } }));
    expect(post.moderation).toEqual({ status: "present", labels: [
      { kind: "community-note", source: "birdwatch_pivot", text: "Readers added context", reason: null },
      { kind: "community-note", source: "birdwatch_pivot.footer", text: "Learn more about Community Notes", reason: null },
    ] });
    expect(parseXSocialPost(JSON.parse(JSON.stringify(post)))).toEqual(post);
    expect(JSON.stringify(post)).not.toContain("not-returned"); expect(JSON.stringify(post)).not.toContain("private-unused");
    expect(projectXSocialPost(tweet({}, { has_birdwatch_notes: true })).moderation.status).toBe("unknown");
  });

  test("serialized rich posts preserve notes, media, moderation, references and placement exactly", () => {
    const quoted = { ...tweet({ full_text: "quoted @Hraness", entities: { user_mentions: [{ indices: [7, 15], screen_name: "Hraness" }] } }), rest_id: "799" };
    const post = projectXSocialPost({
      __typename: "TweetWithVisibilityResults",
      tweet: tweet({ is_quote_status: true, quoted_status_id_str: "799", extended_entities: { media: [image()] }, possibly_sensitive: true }, {
        note_tweet: { note_tweet_results: { result: { text: "long @Hraness", entity_set: { user_mentions: [{ indices: [5, 13], screen_name: "Hraness", id_str: "42" }] } } } },
        quoted_status_result: { result: quoted },
      }),
      tweet_interstitial: { display_type: "Sensitive", text: { text: "Sensitive content" } },
    }, { promotedMetadata: {} });
    expect(parseXSocialPost(JSON.parse(JSON.stringify(post)))).toEqual(post);
    const video = projectXSocialPost(tweet({ extended_entities: { media: [{ ...image(), type: "video", video_info: { variants: [{ content_type: "video/mp4", url: "https://video.twimg.com/a.mp4" }] } }] } }));
    expect(parseXSocialPost(JSON.parse(JSON.stringify(video)))).toEqual(video);
  });

  test("serialized DTOs reject raw fields, inconsistent states and recursive nested post trees", () => {
    const post = projectXSocialPost(tweet());
    expect(() => parseXSocialPost({ ...post, raw: {} })).toThrow("exactly");
    expect(() => parseXSocialPost({ ...post, text: "changed" })).toThrow("disagreed");
    expect(() => parseXSocialPost({ ...post, promotion: { status: "present", source: null } })).toThrow("inconsistent");
    expect(() => parseXSocialPost({ ...post, media: { status: "unknown", items: [post] } })).toThrow("cannot contain");
    expect(() => parseXSocialPost({ ...post, moderation: { status: "unknown", labels: [{ kind: "sensitive", source: "legacy.possibly_sensitive", text: null, reason: null }] } })).toThrow("disagreed");
    expect(() => parseXSocialPost({ ...post, quote: { status: "absent", postId: post.id, post: null } })).toThrow("disagreed");
    expect(() => parseXSocialPost({ ...post, quote: { status: "present", postId: post.id, post } })).toThrow("exactly");
    expect(() => parseXSocialPost({ ...post, content: { ...post.content, entities: { ...post.content.entities, cookies: "never" } } })).toThrow("exactly");
  });

  test("property: scalar provider indices become exact UTF16 mention ranges and round-trip once", () => {
    assertProperty(fc.property(
      fc.array(fc.constantFrom("🦀", "A", "é", "中", " "), { maxLength: 40 }).map((parts) => parts.join("")),
      fc.stringMatching(/^[A-Za-z][A-Za-z0-9_]{0,14}$/u),
      (prefix, username) => {
        const body = `${prefix}@${username}`;
        const post = projectXSocialPost(tweet({ full_text: body, entities: { user_mentions: [{ indices: [Array.from(prefix).length, Array.from(body).length], screen_name: username, id_str: "42" }] } }));
        const mention = post.content.entities.mentions[0]!;
        expect(parseXSocialPost(JSON.parse(JSON.stringify(post)))).toEqual(post);
        expect(body.slice(mention.start, mention.end)).toBe(`@${username}`);
        expect(mention.handle).toBe(username.toLowerCase());
      },
    ));
  });
});

describe("X rich profile model", () => {
  test("projects join date, location, independent verification flags and exact counts", () => {
    const profile = projectXSocialProfile(user({
      is_blue_verified: true,
      legacy: { screen_name: "hraness", name: "Hraness", created_at: time, location: "Earth", verified: false, verified_type: "Business",
        followers_count: 1234, friends_count: 56, description: "Public bio", following: false, followed_by: true,
        entities: { url: { urls: [{ expanded_url: "https://hraness.com" }] } } },
    }));
    expect(profile).toEqual({
      modelVersion: 1, id: "42", handle: "hraness", displayName: "Hraness", bio: "Public bio", websiteUrl: "https://hraness.com/",
      bioContent: { text: "Public bio", source: "profile", offsetEncoding: "utf16", entities: { status: "unknown", mentions: [], hashtags: [], cashtags: [], links: [] } },
      joinedAt: "2026-07-22T12:00:00.000Z", location: "Earth", verification: { verified: false, blueVerified: true, type: "Business" },
      counts: { followers: 1234, following: 56 }, relationship: { following: false, followedBy: true }, url: "https://x.com/hraness",
    });
  });

  test("supports modern profile metadata without filling missing flags with false", () => {
    const profile = projectXSocialProfile(user({
      relationship_counts: { followers: 1234, following: 56 }, relationship_perspectives: { following: true, followed_by: false },
      profile_bio: { description: "Modern\nbio" }, website: { url: "https://hraness.com/about" },
    }));
    expect(profile).toMatchObject({ bio: "Modern\nbio", websiteUrl: "https://hraness.com/about", joinedAt: null, location: null,
      verification: { verified: null, blueVerified: null, type: null }, counts: { followers: 1234, following: 56 }, relationship: { following: true, followedBy: false } });
    expect(projectXSocialProfile(user()).counts).toEqual({ followers: null, following: null });
  });

  test("keeps profiles with unusable optional websites without emitting unsafe links", () => {
    const unusable = ["", " ", "not a URL", " https://example.com/", "file:///tmp/private", "javascript:alert(1)",
      "https://user:password@example.com/", "http://localhost/private", "http://127.0.0.1/", "http://10.0.0.1/", "http://[::1]/"];
    for (const url of unusable) {
      for (const raw of [user({ website: { url } }), user({ legacy: { entities: { url: { urls: [{ expanded_url: url }] } } } })]) {
        const profile = projectXSocialProfile(raw);
        expect(profile).toMatchObject({ id: "42", handle: "hraness", websiteUrl: null });
        expect(parseXSocialProfile(JSON.parse(JSON.stringify(profile)))).toEqual(profile);
        expect(() => parseXSocialProfile({ ...profile, websiteUrl: url })).toThrow();
      }
    }
    const valid = "https://example.com/";
    for (const raw of [
      user({ website: { url: valid }, legacy: { entities: { url: { urls: [{ expanded_url: "file:///tmp/private" }] } } } }),
      user({ website: { url: "not a URL" }, legacy: { entities: { url: { urls: [{ expanded_url: valid }] } } } }),
    ]) expect(projectXSocialProfile(raw).websiteUrl).toBe(valid);
    expect(() => projectXSocialProfile(user({ website: { url: valid }, legacy: { entities: { url: { urls: [{ expanded_url: "https://different.example/" }] } } } }))).toThrow("disagreed");
    expect(() => projectXSocialProfile(user({ legacy: { entities: { url: { urls: [{ expanded_url: valid }, { expanded_url: "https://different.example/" }] } } } }))).toThrow("ambiguous");
  });

  test("keeps website schema bounds strict for provider fields", () => {
    for (const url of [42, {}, [], "x".repeat(4_097), "https://example.com/\n"]) {
      expect(() => projectXSocialProfile(user({ website: { url } }))).toThrow("bounded public text");
      expect(() => projectXSocialProfile(user({ legacy: { entities: { url: { urls: [{ expanded_url: url }] } } } }))).toThrow("bounded public text");
    }
  });

  test("property: arbitrary bounded website text either yields an admitted public URL or unavailable metadata", () => {
    assertProperty(fc.property(fc.string({ maxLength: 512 }).filter(value => !/[\u0000-\u001f\u007f]/u.test(value)), url => {
      const profile = projectXSocialProfile(user({ website: { url } }));
      expect(parseXSocialProfile(JSON.parse(JSON.stringify(profile)))).toEqual(profile);
      expect(profile.id).toBe("42");
      expect(profile.handle).toBe("hraness");
    }));
  });

  test("binds modern and legacy bio entities to UTF16 description ranges", () => {
    const body = "😀 @somebody #Build $TEST https://t.co/example";
    const entity = (part: string) => [Array.from(body.slice(0, body.indexOf(part))).length, Array.from(body.slice(0, body.indexOf(part) + part.length)).length];
    const entities = {
      user_mentions: [{ indices: entity("@somebody"), screen_name: "Somebody", id_str: "99" }],
      hashtags: [{ indices: entity("#Build"), text: "Build" }],
      symbols: [{ indices: entity("$TEST"), text: "TEST" }],
      urls: [{ indices: entity("https://t.co/example"), url: "https://t.co/example", expanded_url: "https://example.com/bio", display_url: "example.com/bio" }],
    };
    for (const raw of [
      user({ profile_bio: { description: body, entities } }),
      user({ legacy: { description: body, entities: { description: entities } } }),
    ]) {
      const profile = projectXSocialProfile(raw);
      expect(profile.bioContent).toMatchObject({ text: body, source: "profile", offsetEncoding: "utf16", entities: { status: "available",
        mentions: [{ start: 3, end: 12, handle: "somebody", userId: "99" }], hashtags: [{ tag: "Build" }], cashtags: [{ symbol: "TEST" }], links: [{ expandedUrl: "https://example.com/bio" }] } });
      expect(parseXSocialProfile(JSON.parse(JSON.stringify(profile)))).toEqual(profile);
    }
    const selected = projectXSocialProfile(user({ profile_bio: { description: body }, legacy: { description: body, entities: { description: entities } } }));
    expect(selected.bioContent?.entities.status).toBe("unknown");
    const profile = projectXSocialProfile(user({ profile_bio: { description: body, entities } }));
    for (const value of [
      { ...profile, bioContent: null },
      { ...profile, bio: null },
      { ...profile, bio: "different" },
      { ...profile, bioContent: { ...profile.bioContent, source: "legacy" } },
      { ...profile, bioContent: { ...profile.bioContent, text: "different" } },
    ]) expect(() => parseXSocialProfile(value)).toThrow();
    expect(projectXSocialProfile(user()).bioContent).toBeNull();
  });

  test("serialized profiles round-trip strictly with unknown and observed metadata", () => {
    for (const raw of [user(), user({
      legacy: { created_at: time, location: "Earth", verified: false, verified_type: "Business", followers_count: 1234, friends_count: 56, description: "Public bio", following: true },
      is_blue_verified: true,
    })]) {
      const profile = projectXSocialProfile(raw);
      expect(parseXSocialProfile(JSON.parse(JSON.stringify(profile)))).toEqual(profile);
    }
    const profile = projectXSocialProfile(user());
    for (const invalid of [
      { ...profile, modelVersion: 2 }, { ...profile, raw: {} }, { ...profile, url: "https://x.com/someone_else" },
      { ...profile, counts: { ...profile.counts, followers: "1.2K" } },
      { ...profile, verification: { ...profile.verification, raw: {} } },
      { ...profile, relationship: { ...profile.relationship, following: "false" } },
      { ...profile, websiteUrl: "http://localhost/private" }, { ...profile, joinedAt: time },
      { ...profile, joinedAt: "2026-02-30T00:00:00.000Z" },
    ]) expect(() => parseXSocialProfile(invalid)).toThrow();
  });

  test("rejects inconsistent modern/legacy identity, metadata, relationship and rounded counts", () => {
    for (const raw of [
      user({ legacy: { screen_name: "other" } }),
      user({ legacy: { followers_count: 42 }, relationship_counts: { followers: 43 } }),
      user({ legacy: { description: "one" }, profile_bio: { description: "two" } }),
      user({ legacy: { following: true }, relationship_perspectives: { following: false } }),
      user({ legacy: { followers_count: "1.2K" } }), user({ legacy: { created_at: "July 2026" } }),
      user({ legacy: { created_at: "2026-19-99T00:00:00Z" } }),
      user({ __typename: "UserUnavailable" }),
    ]) expect(() => projectXSocialProfile(raw)).toThrow();
  });
});

describe("normalized X discovery/notification DTO admission", () => {
  const trend = { kind: "trend", id: "topic-1", source: "trending", title: "#Rust", description: "A trend", category: "Technology", postCount: 1234, query: "#Rust", url: "https://x.com/search?q=%23Rust" };
  const notification = { kind: "notification", id: "event-1", eventType: "like", createdAt: time, text: "liked your post", actors: [{ id: "42", handle: "Hraness", displayName: "Hraness" }], postIds: ["800"], read: null, url: "https://x.com/i/status/800" } satisfies XSocialNotification;

  test("keeps trending and personalized news distinct and exact counts nullable", () => {
    expect(parseXSocialTrend(trend)).toMatchObject({ source: "trending", postCount: 1234 });
    expect(parseXSocialTrend({ ...trend, source: "todays-news", postCount: null })).toMatchObject({ source: "todays-news", postCount: null });
    expect(() => parseXSocialTrend({ ...trend, postCount: "1.2K" })).toThrow();
    expect(() => parseXSocialTrend({ ...trend, source: "search" })).toThrow();
    expect(() => parseXSocialTrend({ ...trend, rawResponse: {} })).toThrow("exactly");
    expect(() => parseXSocialTrend({ ...trend, url: "javascript:alert(1)" })).toThrow();
  });

  test("models notifications as events with actors/targets, preserving unknown read state", () => {
    expect(parseXSocialNotification(notification)).toEqual({ ...notification, actors: [{ id: "42", handle: "hraness", displayName: "Hraness" }] });
    expect(() => parseXSocialNotification({ ...notification, actors: [...notification.actors, ...notification.actors] })).toThrow("duplicated");
    expect(() => parseXSocialNotification({ ...notification, postIds: ["800", "800"] })).toThrow("duplicated");
    expect(() => parseXSocialNotification({ ...notification, eventType: "unknown-provider-value" })).toThrow();
    expect(() => parseXSocialNotification({ ...notification, read: "false" })).toThrow();
    expect(() => parseXSocialNotification({ ...notification, actors: [{ ...notification.actors[0], cookies: "never" }] })).toThrow("exactly");
    expect(() => parseXSocialNotification({ ...notification, actors: Array.from({ length: 101 }, (_, index) => ({ id: String(index + 1), handle: null, displayName: null })) })).toThrow("bound");
    expect(() => parseXSocialNotification({ data: { notification_timeline: {} } })).toThrow("exactly");
  });
});

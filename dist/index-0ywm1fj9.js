// @bun
import {
  DOM_ACTION_TRANSPORT_DISABLED_MESSAGE
} from "./index-4bpemvnc.js";
import {
  isProviderPluginOperationName,
  isProviderPluginSurfaceId
} from "./index-26yq8q16.js";
import {
  canonicalJson,
  sha256
} from "./index-8sbt8qwx.js";

// src/model.ts
import { isIP } from "net";
import { isPrivateAddress, isPrivateHostname } from "@hraness/kb/clip/network";

// src/platform-catalog.ts
var semanticOperationNames = [
  "content.read",
  "content.clip",
  "profiles.read",
  "organizations.read",
  "contacts.list",
  "contacts.search",
  "contacts.read",
  "feeds.read",
  "messaging.list",
  "messaging.search",
  "messaging.read",
  "messaging.send",
  "comments.read",
  "comments.create",
  "replies.create",
  "posts.read",
  "posts.publish",
  "threads.publish",
  "reactions.set",
  "likes.set",
  "media.read",
  "media.publish",
  "articles.read",
  "articles.draft.save",
  "articles.publish",
  "listings.read",
  "listings.publish",
  "relationships.follow.set",
  "relationships.recommendations.read",
  "relationships.connect",
  "posts.repost",
  "posts.quote",
  "content.share",
  "content.save",
  "content.edit",
  "content.delete",
  "content.schedule",
  "content.audience.set",
  "communities.membership.set",
  "communities.membership.manage",
  "administration.manage",
  "commerce.purchase",
  "account.delete",
  "moderation.bulk"
];
var platformSurfaceIds = [
  "linkedin",
  "x",
  "reddit",
  "github",
  "hacker-news",
  "whatsapp",
  "substack",
  "instagram",
  "threads",
  "facebook",
  "facebook-page",
  "facebook-group",
  "facebook-marketplace",
  "tiktok",
  "twitch",
  "youtube",
  "bluesky"
];
var operationMeanings = {
  "content.read": "Read one bounded content target",
  "content.clip": "Capture one bounded content target locally",
  "profiles.read": "Read one explicitly selected member or account profile",
  "organizations.read": "Read one explicitly selected organization or page",
  "contacts.list": "List one bounded provider-defined contact collection with explicit metadata and statistics completeness",
  "contacts.search": "Search one bounded provider-defined contact candidate window",
  "contacts.read": "Read one exact account-bound contact identity",
  "feeds.read": "Read one explicitly selected bounded feed or timeline",
  "messaging.list": "List one bounded provider-visible inbox or message-event collection",
  "messaging.search": "Search one bounded provider-visible conversation candidate window",
  "messaging.read": "Read one explicitly targeted conversation",
  "messaging.send": "Send one message to an explicit conversation",
  "comments.read": "Read bounded comments and replies on one target",
  "comments.create": "Publish one comment on an explicit target",
  "replies.create": "Publish one reply to an explicit target",
  "posts.read": "Read one post or a bounded post collection",
  "posts.publish": "Publish one post",
  "threads.publish": "Publish one ordered bounded root-and-replies thread",
  "reactions.set": "Set or clear one reversible reaction",
  "likes.set": "Set or clear one reversible like",
  "media.read": "Read metadata for explicitly targeted media",
  "media.publish": "Publish one bounded media item",
  "articles.read": "Read one native long-form article",
  "articles.draft.save": "Save one private native long-form article draft",
  "articles.publish": "Publish one native long-form article",
  "listings.read": "Read one explicitly targeted marketplace listing",
  "listings.publish": "Publish one marketplace listing",
  "relationships.follow.set": "Follow or unfollow one explicit account or free publication",
  "relationships.recommendations.read": "Read one bounded page of provider-recommended connections",
  "relationships.connect": "Send one connection request to an explicit account",
  "posts.repost": "Repost or undo one explicit post without added commentary",
  "posts.quote": "Publish one quoted repost with explicit commentary",
  "content.share": "Share one explicit content item to one provider-visible target",
  "content.save": "Save, bookmark, star, or unsave one explicit content item privately",
  "content.edit": "Edit one explicitly targeted authored item",
  "content.delete": "Delete one explicitly targeted authored item",
  "content.schedule": "Schedule one explicit content draft for publication",
  "content.audience.set": "Change the audience or visibility of one existing content item",
  "communities.membership.set": "Join or leave one explicit community as the current user",
  "communities.membership.manage": "Approve, remove, invite, or change another community member",
  "administration.manage": "Change roles, permissions, business settings, or administrative configuration",
  "commerce.purchase": "Commit a purchase or financial obligation",
  "account.delete": "Delete an account or platform identity",
  "moderation.bulk": "Apply moderation to multiple targets"
};
function buildOperationMatrix(groups) {
  const policies = {};
  const add = (name, policy) => {
    if (policies[name] !== undefined) {
      throw new Error(`Duplicate platform-catalog operation classification: ${name}`);
    }
    policies[name] = policy;
  };
  for (const risk of ["R1", "R2", "R3"]) {
    for (const name of groups[risk]) {
      add(name, {
        state: "adapter-eligible",
        risk,
        meaning: `${operationMeanings[name]}; a reviewed adapter is still required`
      });
    }
  }
  for (const name of groups.unsupported) {
    add(name, {
      state: "unsupported",
      reason: `${operationMeanings[name]} has no reviewed policy on this surface`
    });
  }
  for (const name of groups.notApplicable) {
    add(name, {
      state: "not-applicable",
      reason: `${operationMeanings[name]} has no distinct native concept on this surface`
    });
  }
  for (const name of groups.R4) {
    add(name, {
      state: "R4",
      risk: "R4",
      reason: `${operationMeanings[name]} is outside wrench's executable safety boundary`
    });
  }
  if (policies["feeds.read"] === undefined) {
    const posts = policies["posts.read"];
    add("feeds.read", posts?.state === "adapter-eligible" ? {
      state: "adapter-eligible",
      risk: "R1",
      meaning: `${operationMeanings["feeds.read"]}; a reviewed adapter is still required`
    } : posts?.state === "not-applicable" ? {
      state: "not-applicable",
      reason: `${operationMeanings["feeds.read"]} has no distinct native concept on this surface`
    } : {
      state: "unsupported",
      reason: `${operationMeanings["feeds.read"]} has no reviewed policy on this surface`
    });
  }
  if (policies["messaging.list"] === undefined) {
    const messages = policies["messaging.read"];
    add("messaging.list", messages?.state === "adapter-eligible" ? {
      state: "adapter-eligible",
      risk: "R1",
      meaning: `${operationMeanings["messaging.list"]}; a reviewed adapter is still required`
    } : messages?.state === "not-applicable" ? {
      state: "not-applicable",
      reason: `${operationMeanings["messaging.list"]} has no distinct native concept on this surface`
    } : {
      state: "unsupported",
      reason: `${operationMeanings["messaging.list"]} has no reviewed policy on this surface`
    });
  }
  for (const name of [
    "profiles.read",
    "organizations.read",
    "contacts.list",
    "contacts.search",
    "contacts.read",
    "messaging.search",
    "relationships.recommendations.read"
  ]) {
    if (policies[name] === undefined) {
      add(name, {
        state: "unsupported",
        reason: `${operationMeanings[name]} has no reviewed policy on this surface`
      });
    }
  }
  const missing = semanticOperationNames.filter((name) => policies[name] === undefined);
  if (missing.length > 0) {
    throw new Error(`Missing platform-catalog operation classifications: ${missing.join(", ")}`);
  }
  const ordered = Object.fromEntries(semanticOperationNames.map((name) => [name, policies[name]]));
  return Object.freeze(ordered);
}
var textWeightPolicies = {
  "unicode-code-points": {
    defaultWeight: 1,
    ranges: []
  },
  "utf16-code-units": {
    defaultWeight: 1,
    ranges: [{ start: 65536, end: 1114111, weight: 2 }]
  },
  "x-conservative-weighted": {
    defaultWeight: 2,
    ranges: [
      { start: 0, end: 4351, weight: 1 },
      { start: 8192, end: 8205, weight: 1 },
      { start: 8208, end: 8223, weight: 1 },
      { start: 8242, end: 8247, weight: 1 }
    ],
    minimumUrlWeight: 23
  }
};
var exactOrigins = (...origins) => ({
  exactOrigins: origins,
  additionalExactOrigins: { state: "forbidden" }
});
var publicationOrigins = (...origins) => ({
  exactOrigins: origins,
  additionalExactOrigins: {
    state: "adapter-declared",
    kind: "publication-origin",
    maxOrigins: 1,
    note: "A custom publication host must be declared as one exact HTTPS origin in the reviewed adapter"
  }
});
var field = (name, safeMaxUnits, measurement, required = true, format = "plain-text") => ({ name, required, safeMaxUnits, measurement, format });
var noAttachments = (reason) => ({ state: "none", reason });
var attachments = (maxItems, kinds, note, minItems = 0) => ({ state: "allowed", minItems, maxItems, kinds, note });
var excludedFeature = (state, reason) => state === "R4" ? { state, risk: "R4", reason } : { state, reason };
var longForm = (operation, form, note) => ({ state: "adapter-eligible", operation, form, note });
var threadRead = (note) => ({
  state: "adapter-eligible",
  operation: "content.read",
  note
});
var threadPublish = (safeMaxItems, note) => ({
  state: "adapter-eligible",
  operation: "threads.publish",
  rootOperation: "posts.publish",
  continuationOperation: "replies.create",
  safeMaxItems,
  note
});
var NA_LONG_FORM = excludedFeature("not-applicable", "This surface has no distinct native long-form article model");
var UNSUPPORTED_LONG_FORM = excludedFeature("unsupported", "No native long-form workflow is catalogued for this surface");
var NA_THREADS = excludedFeature("not-applicable", "This surface has no ordered multi-post thread model");
var UNSUPPORTED_THREADS = excludedFeature("unsupported", "No ordered multi-post thread workflow is catalogued for this surface");
var socialPlatformCatalog = {
  linkedin: {
    id: "linkedin",
    platform: "linkedin",
    facet: "default",
    displayName: "LinkedIn",
    originPolicy: exactOrigins("https://www.linkedin.com"),
    operations: buildOperationMatrix({
      R1: [
        "content.read",
        "content.clip",
        "profiles.read",
        "organizations.read",
        "contacts.list",
        "contacts.read",
        "feeds.read",
        "messaging.list",
        "messaging.read",
        "comments.read",
        "posts.read",
        "media.read",
        "articles.read",
        "relationships.recommendations.read"
      ],
      R2: ["reactions.set", "relationships.follow.set", "content.save", "articles.draft.save", "communities.membership.set"],
      R3: [
        "comments.create",
        "replies.create",
        "messaging.send",
        "posts.publish",
        "media.publish",
        "articles.publish",
        "relationships.connect",
        "posts.repost",
        "posts.quote",
        "content.share",
        "content.edit",
        "content.schedule"
      ],
      unsupported: ["threads.publish"],
      notApplicable: ["likes.set", "listings.read", "listings.publish"],
      R4: [
        "content.delete",
        "content.audience.set",
        "communities.membership.manage",
        "administration.manage",
        "commerce.purchase",
        "account.delete",
        "moderation.bulk"
      ]
    }),
    compositions: {
      message: {
        text: [field("body", 8000, "utf16-code-units", false)],
        attachments: attachments(1, ["image", "video", "document", "link"], "One reviewed message attachment; message-request restrictions remain provider-enforced")
      },
      comment: {
        text: [field("body", 500, "utf16-code-units")],
        attachments: noAttachments("Comment attachments are not catalogued")
      },
      reply: {
        text: [field("body", 500, "utf16-code-units")],
        attachments: noAttachments("Reply attachments are not catalogued")
      },
      post: {
        text: [field("body", 3000, "utf16-code-units")],
        attachments: attachments(20, ["image", "video", "document", "link"], "Up to 20 images, or one reviewed video, document, or link card; adapters must enforce the media-kind union")
      },
      media: {
        text: [field("body", 3000, "utf16-code-units"), field("title", 200, "utf16-code-units", false)],
        attachments: attachments(1, ["video"], "Exactly one reviewed video upload", 1)
      },
      article: {
        text: [field("title", 150, "utf16-code-units"), field("body", 125000, "utf16-code-units")],
        attachments: attachments(1, ["image", "link"], "One reviewed cover image or source link")
      }
    },
    longForm: {
      read: longForm("articles.read", "native-article", "Read one LinkedIn article"),
      publish: longForm("articles.publish", "native-article", "Publish one LinkedIn article through a reviewed authenticated web-session contract")
    },
    threads: { read: UNSUPPORTED_THREADS, publish: UNSUPPORTED_THREADS }
  },
  x: {
    id: "x",
    platform: "x",
    facet: "default",
    displayName: "X",
    originPolicy: exactOrigins("https://x.com"),
    operations: buildOperationMatrix({
      R1: ["content.read", "content.clip", "profiles.read", "messaging.read", "comments.read", "posts.read", "media.read", "articles.read"],
      R2: ["likes.set", "relationships.follow.set", "content.save", "articles.draft.save", "communities.membership.set"],
      R3: [
        "messaging.send",
        "replies.create",
        "posts.publish",
        "threads.publish",
        "articles.publish",
        "posts.repost",
        "posts.quote",
        "content.share",
        "content.edit",
        "content.delete",
        "content.schedule"
      ],
      unsupported: ["media.publish"],
      notApplicable: ["comments.create", "reactions.set", "listings.read", "listings.publish", "relationships.connect"],
      R4: [
        "content.audience.set",
        "communities.membership.manage",
        "administration.manage",
        "commerce.purchase",
        "account.delete",
        "moderation.bulk"
      ]
    }),
    compositions: {
      message: {
        text: [field("body", 1000, "x-conservative-weighted", false)],
        attachments: attachments(1, ["image", "video", "gif", "link"], "One reviewed message attachment")
      },
      reply: {
        text: [field("body", 280, "x-conservative-weighted", false)],
        attachments: attachments(4, ["image", "video", "gif", "link"], "Up to four images, or one GIF/video; adapters must enforce the media-kind union")
      },
      post: {
        text: [field("body", 25000, "x-conservative-weighted", false)],
        attachments: attachments(4, ["image", "video", "gif", "link"], "Up to four images, or one GIF/video; adapters must enforce the media-kind union")
      },
      article: {
        text: [field("title", 100, "x-conservative-weighted"), field("body", 20000, "x-conservative-weighted")],
        attachments: attachments(1, ["image", "link"], "One reviewed native-article attachment")
      }
    },
    longForm: {
      read: longForm("articles.read", "native-article", "Read one native X article when entitled"),
      publish: longForm("articles.publish", "native-article", "Publish one native X article when entitled")
    },
    threads: {
      read: threadRead("Read one bounded X post thread"),
      publish: threadPublish(25, "Publish one root post optionally followed by bounded self-replies")
    }
  },
  reddit: {
    id: "reddit",
    platform: "reddit",
    facet: "default",
    displayName: "Reddit",
    originPolicy: exactOrigins("https://www.reddit.com"),
    operations: buildOperationMatrix({
      R1: ["content.read", "content.clip", "profiles.read", "messaging.read", "comments.read", "posts.read", "media.read"],
      R2: ["reactions.set", "relationships.follow.set", "content.save", "communities.membership.set"],
      R3: [
        "messaging.send",
        "comments.create",
        "replies.create",
        "posts.publish",
        "media.publish",
        "posts.repost",
        "content.share",
        "content.edit",
        "content.delete"
      ],
      unsupported: ["content.schedule"],
      notApplicable: [
        "likes.set",
        "articles.read",
        "articles.draft.save",
        "articles.publish",
        "listings.read",
        "listings.publish",
        "relationships.connect",
        "posts.quote",
        "threads.publish"
      ],
      R4: [
        "content.audience.set",
        "communities.membership.manage",
        "administration.manage",
        "commerce.purchase",
        "account.delete",
        "moderation.bulk"
      ]
    }),
    compositions: {
      message: {
        text: [field("body", 1000, "utf16-code-units")],
        attachments: noAttachments("Message attachments are not catalogued")
      },
      comment: {
        text: [field("body", 2000, "utf16-code-units")],
        attachments: noAttachments("Comment attachments are not catalogued")
      },
      reply: {
        text: [field("body", 2000, "utf16-code-units")],
        attachments: noAttachments("Reply attachments are not catalogued")
      },
      post: {
        text: [field("title", 280, "utf16-code-units"), field("body", 1e4, "utf16-code-units", false)],
        attachments: attachments(1, ["image", "video", "link"], "One reviewed post attachment")
      },
      media: {
        text: [field("title", 280, "utf16-code-units"), field("body", 1e4, "utf16-code-units", false)],
        attachments: attachments(1, ["video"], "Exactly one reviewed video upload", 1)
      }
    },
    longForm: {
      read: longForm("posts.read", "expanded-post", "Read one native long self-post"),
      publish: longForm("posts.publish", "expanded-post", "Publish one native long self-post")
    },
    threads: { read: NA_THREADS, publish: NA_THREADS }
  },
  github: {
    id: "github",
    platform: "github",
    facet: "default",
    displayName: "GitHub",
    originPolicy: exactOrigins("https://github.com"),
    operations: buildOperationMatrix({
      R1: ["content.read", "content.clip", "profiles.read", "organizations.read"],
      R2: [],
      R3: [],
      unsupported: [
        "messaging.read",
        "messaging.send",
        "comments.read",
        "comments.create",
        "replies.create",
        "posts.read",
        "posts.publish",
        "threads.publish",
        "likes.set",
        "reactions.set",
        "media.read",
        "media.publish",
        "articles.read",
        "articles.draft.save",
        "articles.publish",
        "listings.read",
        "listings.publish",
        "relationships.recommendations.read",
        "relationships.follow.set",
        "relationships.connect",
        "posts.repost",
        "posts.quote",
        "content.share",
        "content.save",
        "content.edit",
        "content.schedule",
        "content.audience.set",
        "communities.membership.set"
      ],
      notApplicable: [],
      R4: [
        "content.delete",
        "communities.membership.manage",
        "administration.manage",
        "commerce.purchase",
        "account.delete",
        "moderation.bulk"
      ]
    }),
    compositions: {},
    longForm: {
      read: UNSUPPORTED_LONG_FORM,
      publish: UNSUPPORTED_LONG_FORM
    },
    threads: {
      read: UNSUPPORTED_THREADS,
      publish: UNSUPPORTED_THREADS
    }
  },
  "hacker-news": {
    id: "hacker-news",
    platform: "hacker-news",
    facet: "default",
    displayName: "Hacker News",
    originPolicy: exactOrigins("https://news.ycombinator.com"),
    operations: buildOperationMatrix({
      R1: ["content.read", "content.clip", "comments.read", "posts.read"],
      R2: ["reactions.set", "content.save"],
      R3: ["comments.create", "replies.create", "posts.publish", "content.edit"],
      unsupported: [],
      notApplicable: [
        "messaging.read",
        "messaging.send",
        "likes.set",
        "media.read",
        "media.publish",
        "articles.read",
        "articles.draft.save",
        "articles.publish",
        "listings.read",
        "listings.publish",
        "relationships.follow.set",
        "relationships.connect",
        "posts.repost",
        "posts.quote",
        "threads.publish",
        "content.share",
        "content.schedule",
        "content.audience.set",
        "communities.membership.set",
        "communities.membership.manage",
        "commerce.purchase"
      ],
      R4: ["content.delete", "administration.manage", "account.delete", "moderation.bulk"]
    }),
    compositions: {
      comment: {
        text: [field("body", 2000, "utf16-code-units")],
        attachments: noAttachments("Comments are text-only in the catalog")
      },
      reply: {
        text: [field("body", 2000, "utf16-code-units")],
        attachments: noAttachments("Replies are text-only in the catalog")
      },
      post: {
        text: [field("title", 80, "utf16-code-units"), field("body", 2000, "utf16-code-units", false)],
        attachments: attachments(1, ["link"], "One explicitly supplied destination link")
      }
    },
    longForm: {
      read: longForm("posts.read", "expanded-post", "Read one Ask or Show text post"),
      publish: longForm("posts.publish", "expanded-post", "Publish one bounded text post")
    },
    threads: { read: NA_THREADS, publish: NA_THREADS }
  },
  whatsapp: {
    id: "whatsapp",
    platform: "whatsapp",
    facet: "default",
    displayName: "WhatsApp Web",
    originPolicy: exactOrigins("https://web.whatsapp.com"),
    operations: buildOperationMatrix({
      R1: ["content.read", "contacts.list", "messaging.read", "media.read"],
      R2: ["reactions.set", "content.save"],
      R3: ["messaging.send", "content.share", "content.edit"],
      unsupported: ["content.clip", "media.publish", "communities.membership.set"],
      notApplicable: [
        "comments.read",
        "comments.create",
        "replies.create",
        "posts.read",
        "posts.publish",
        "threads.publish",
        "likes.set",
        "articles.read",
        "articles.draft.save",
        "articles.publish",
        "listings.read",
        "listings.publish",
        "relationships.follow.set",
        "relationships.connect",
        "posts.repost",
        "posts.quote",
        "content.schedule",
        "content.audience.set"
      ],
      R4: [
        "content.delete",
        "communities.membership.manage",
        "administration.manage",
        "commerce.purchase",
        "account.delete",
        "moderation.bulk"
      ]
    }),
    compositions: {
      message: {
        text: [field("body", 2000, "utf16-code-units")],
        attachments: attachments(1, ["image", "video", "audio", "document", "link"], "One explicitly selected message attachment")
      }
    },
    longForm: { read: NA_LONG_FORM, publish: NA_LONG_FORM },
    threads: { read: NA_THREADS, publish: NA_THREADS }
  },
  substack: {
    id: "substack",
    platform: "substack",
    facet: "default",
    displayName: "Substack",
    originPolicy: publicationOrigins("https://substack.com", "https://www.substack.com"),
    operations: buildOperationMatrix({
      R1: ["content.read", "content.clip", "profiles.read", "organizations.read", "messaging.read", "comments.read", "posts.read", "media.read", "articles.read"],
      R2: ["likes.set", "relationships.follow.set", "content.save"],
      R3: [
        "messaging.send",
        "comments.create",
        "replies.create",
        "posts.publish",
        "media.publish",
        "articles.publish",
        "posts.repost",
        "posts.quote",
        "content.share",
        "content.edit",
        "content.delete",
        "content.schedule"
      ],
      unsupported: ["articles.draft.save", "threads.publish", "communities.membership.set"],
      notApplicable: ["reactions.set", "listings.read", "listings.publish", "relationships.connect"],
      R4: [
        "content.audience.set",
        "communities.membership.manage",
        "administration.manage",
        "commerce.purchase",
        "account.delete",
        "moderation.bulk"
      ]
    }),
    compositions: {
      message: {
        text: [field("body", 1000, "utf16-code-units")],
        attachments: noAttachments("Chat attachments are not catalogued")
      },
      comment: {
        text: [field("body", 1000, "utf16-code-units")],
        attachments: noAttachments("Comment attachments are not catalogued")
      },
      reply: {
        text: [field("body", 1000, "utf16-code-units")],
        attachments: noAttachments("Reply attachments are not catalogued")
      },
      post: {
        text: [field("body", 500, "utf16-code-units")],
        attachments: attachments(1, ["image", "video", "link"], "One reviewed Note attachment")
      },
      media: {
        text: [field("body", 500, "utf16-code-units")],
        attachments: attachments(1, ["video"], "Exactly one reviewed Note video upload", 1)
      },
      article: {
        text: [field("title", 160, "utf16-code-units"), field("body", 50000, "utf16-code-units")],
        attachments: attachments(1, ["image", "video", "audio", "link"], "One reviewed lead attachment; rich body media needs separate review")
      }
    },
    longForm: {
      read: longForm("articles.read", "native-article", "Read one entitled publication article"),
      publish: longForm("articles.publish", "native-article", "Publish one publication article")
    },
    threads: { read: UNSUPPORTED_THREADS, publish: UNSUPPORTED_THREADS }
  },
  instagram: {
    id: "instagram",
    platform: "instagram",
    facet: "default",
    displayName: "Instagram",
    originPolicy: exactOrigins("https://www.instagram.com"),
    operations: buildOperationMatrix({
      R1: ["content.read", "content.clip", "profiles.read", "contacts.list", "messaging.read", "comments.read", "posts.read", "media.read"],
      R2: ["reactions.set", "likes.set", "relationships.follow.set", "content.save"],
      R3: [
        "messaging.send",
        "comments.create",
        "replies.create",
        "media.publish",
        "content.delete",
        "posts.repost",
        "content.share",
        "content.edit"
      ],
      unsupported: ["content.schedule"],
      notApplicable: [
        "posts.publish",
        "threads.publish",
        "articles.read",
        "articles.draft.save",
        "articles.publish",
        "listings.read",
        "listings.publish",
        "relationships.connect",
        "posts.quote",
        "communities.membership.set",
        "communities.membership.manage"
      ],
      R4: [
        "content.audience.set",
        "administration.manage",
        "commerce.purchase",
        "account.delete",
        "moderation.bulk"
      ]
    }),
    compositions: {
      message: {
        text: [field("body", 1000, "utf16-code-units")],
        attachments: attachments(1, ["image", "video", "link"], "One explicitly selected message attachment")
      },
      comment: {
        text: [field("body", 500, "utf16-code-units")],
        attachments: noAttachments("Comment attachments are not catalogued")
      },
      reply: {
        text: [field("body", 500, "utf16-code-units")],
        attachments: noAttachments("Reply attachments are not catalogued")
      },
      media: {
        text: [field("caption", 1000, "utf16-code-units")],
        attachments: attachments(1, ["video"], "Exactly one plan-bound MP4 video", 1)
      }
    },
    longForm: { read: NA_LONG_FORM, publish: NA_LONG_FORM },
    threads: { read: NA_THREADS, publish: NA_THREADS }
  },
  threads: {
    id: "threads",
    platform: "threads",
    facet: "default",
    displayName: "Threads",
    originPolicy: exactOrigins("https://www.threads.com"),
    operations: buildOperationMatrix({
      R1: ["content.read", "content.clip", "profiles.read", "messaging.read", "comments.read", "posts.read", "media.read"],
      R2: ["likes.set", "relationships.follow.set", "content.save"],
      R3: [
        "messaging.send",
        "replies.create",
        "posts.publish",
        "media.publish",
        "threads.publish",
        "posts.repost",
        "posts.quote",
        "content.share",
        "content.edit"
      ],
      unsupported: ["articles.read", "articles.draft.save", "articles.publish", "content.schedule"],
      notApplicable: [
        "comments.create",
        "reactions.set",
        "listings.read",
        "listings.publish",
        "relationships.connect",
        "communities.membership.set",
        "communities.membership.manage",
        "commerce.purchase"
      ],
      R4: ["content.delete", "content.audience.set", "administration.manage", "account.delete", "moderation.bulk"]
    }),
    compositions: {
      message: {
        text: [field("body", 1000, "utf16-code-units")],
        attachments: attachments(1, ["image", "video", "link"], "One explicitly selected message attachment")
      },
      reply: {
        text: [field("body", 450, "unicode-code-points")],
        attachments: attachments(1, ["image", "video", "gif", "link"], "One reviewed reply attachment")
      },
      post: {
        text: [field("body", 450, "unicode-code-points")],
        attachments: attachments(1, ["image", "video", "gif", "link"], "One reviewed post attachment")
      },
      media: {
        text: [field("body", 450, "unicode-code-points")],
        attachments: attachments(1, ["video"], "Exactly one reviewed video upload", 1)
      }
    },
    longForm: { read: UNSUPPORTED_LONG_FORM, publish: UNSUPPORTED_LONG_FORM },
    threads: {
      read: threadRead("Read one bounded Threads post thread"),
      publish: threadPublish(25, "Publish one root post optionally followed by bounded self-replies")
    }
  },
  facebook: {
    id: "facebook",
    platform: "facebook",
    facet: "default",
    displayName: "Facebook",
    originPolicy: exactOrigins("https://www.facebook.com"),
    operations: buildOperationMatrix({
      R1: ["content.read", "content.clip", "contacts.list", "messaging.read", "comments.read", "posts.read", "media.read"],
      R2: ["reactions.set", "likes.set", "relationships.follow.set", "content.save"],
      R3: [
        "messaging.send",
        "comments.create",
        "replies.create",
        "posts.publish",
        "media.publish",
        "posts.repost",
        "posts.quote",
        "content.share",
        "content.edit"
      ],
      unsupported: ["content.schedule"],
      notApplicable: [
        "threads.publish",
        "articles.read",
        "articles.draft.save",
        "articles.publish",
        "listings.read",
        "listings.publish",
        "relationships.connect",
        "communities.membership.set",
        "communities.membership.manage"
      ],
      R4: [
        "content.delete",
        "content.audience.set",
        "administration.manage",
        "commerce.purchase",
        "account.delete",
        "moderation.bulk"
      ]
    }),
    compositions: {
      message: {
        text: [field("body", 1000, "utf16-code-units")],
        attachments: attachments(1, ["image", "video", "document", "link"], "One explicitly selected message attachment")
      },
      comment: {
        text: [field("body", 500, "utf16-code-units")],
        attachments: noAttachments("Comment attachments are not catalogued")
      },
      reply: {
        text: [field("body", 500, "utf16-code-units")],
        attachments: noAttachments("Reply attachments are not catalogued")
      },
      post: {
        text: [field("body", 1000, "utf16-code-units")],
        attachments: attachments(1, ["image", "video", "link"], "One reviewed personal-profile post attachment")
      },
      media: {
        text: [field("caption", 1000, "utf16-code-units", false)],
        attachments: attachments(1, ["image", "video"], "Exactly one reviewed personal-profile media item", 1)
      }
    },
    longForm: {
      read: longForm("posts.read", "expanded-post", "Read one expanded personal-profile post"),
      publish: longForm("posts.publish", "expanded-post", "Publish one expanded personal-profile post")
    },
    threads: { read: NA_THREADS, publish: NA_THREADS }
  },
  "facebook-page": {
    id: "facebook-page",
    platform: "facebook",
    facet: "page",
    displayName: "Facebook Page",
    originPolicy: exactOrigins("https://www.facebook.com"),
    operations: buildOperationMatrix({
      R1: ["content.read", "content.clip", "messaging.read", "comments.read", "posts.read", "media.read"],
      R2: ["reactions.set", "likes.set", "relationships.follow.set", "content.save"],
      R3: [
        "messaging.send",
        "comments.create",
        "replies.create",
        "posts.publish",
        "media.publish",
        "posts.repost",
        "posts.quote",
        "content.share",
        "content.edit",
        "content.schedule"
      ],
      unsupported: [],
      notApplicable: [
        "articles.read",
        "articles.draft.save",
        "articles.publish",
        "threads.publish",
        "listings.read",
        "listings.publish",
        "relationships.connect",
        "communities.membership.set",
        "communities.membership.manage"
      ],
      R4: [
        "content.delete",
        "content.audience.set",
        "administration.manage",
        "commerce.purchase",
        "account.delete",
        "moderation.bulk"
      ]
    }),
    compositions: {
      message: {
        text: [field("body", 1000, "utf16-code-units")],
        attachments: attachments(1, ["image", "video", "document", "link"], "One explicitly selected message attachment")
      },
      comment: {
        text: [field("body", 500, "utf16-code-units")],
        attachments: noAttachments("Comment attachments are not catalogued")
      },
      reply: {
        text: [field("body", 500, "utf16-code-units")],
        attachments: noAttachments("Reply attachments are not catalogued")
      },
      post: {
        text: [field("body", 1000, "utf16-code-units")],
        attachments: attachments(1, ["image", "video", "link"], "One reviewed Page post attachment")
      },
      media: {
        text: [field("caption", 1000, "utf16-code-units", false)],
        attachments: attachments(1, ["image", "video"], "Exactly one reviewed Page media item", 1)
      }
    },
    longForm: {
      read: longForm("posts.read", "expanded-post", "Read one expanded Page post"),
      publish: longForm("posts.publish", "expanded-post", "Publish one expanded Page post")
    },
    threads: { read: NA_THREADS, publish: NA_THREADS }
  },
  "facebook-group": {
    id: "facebook-group",
    platform: "facebook",
    facet: "group",
    displayName: "Facebook Group",
    originPolicy: exactOrigins("https://www.facebook.com"),
    operations: buildOperationMatrix({
      R1: [
        "content.read",
        "content.clip",
        "feeds.read",
        "comments.read",
        "posts.read",
        "media.read"
      ],
      R2: ["reactions.set", "likes.set", "content.save", "communities.membership.set"],
      R3: [
        "comments.create",
        "replies.create",
        "posts.publish",
        "media.publish",
        "posts.repost",
        "posts.quote",
        "content.share",
        "content.edit"
      ],
      unsupported: ["content.schedule"],
      notApplicable: [
        "messaging.read",
        "messaging.send",
        "threads.publish",
        "articles.read",
        "articles.draft.save",
        "articles.publish",
        "listings.read",
        "listings.publish",
        "relationships.follow.set",
        "relationships.connect",
        "commerce.purchase"
      ],
      R4: [
        "content.delete",
        "content.audience.set",
        "communities.membership.manage",
        "administration.manage",
        "account.delete",
        "moderation.bulk"
      ]
    }),
    compositions: {
      comment: {
        text: [field("body", 500, "utf16-code-units")],
        attachments: noAttachments("Comment attachments are not catalogued")
      },
      reply: {
        text: [field("body", 500, "utf16-code-units")],
        attachments: noAttachments("Reply attachments are not catalogued")
      },
      post: {
        text: [field("body", 1000, "utf16-code-units")],
        attachments: attachments(1, ["image", "video", "link"], "One reviewed Group post attachment")
      },
      media: {
        text: [field("caption", 1000, "utf16-code-units", false)],
        attachments: attachments(1, ["image", "video"], "Exactly one reviewed Group media item", 1)
      }
    },
    longForm: {
      read: longForm("posts.read", "expanded-post", "Read one expanded Group post"),
      publish: longForm("posts.publish", "expanded-post", "Publish one expanded Group post")
    },
    threads: { read: NA_THREADS, publish: NA_THREADS }
  },
  "facebook-marketplace": {
    id: "facebook-marketplace",
    platform: "facebook",
    facet: "marketplace",
    displayName: "Facebook Marketplace",
    originPolicy: exactOrigins("https://www.facebook.com"),
    operations: buildOperationMatrix({
      R1: [
        "content.read",
        "content.clip",
        "feeds.read",
        "messaging.read",
        "media.read",
        "listings.read"
      ],
      R2: ["content.save"],
      R3: ["messaging.send", "listings.publish", "content.share", "content.edit"],
      unsupported: ["media.publish"],
      notApplicable: [
        "comments.read",
        "comments.create",
        "replies.create",
        "posts.read",
        "posts.publish",
        "threads.publish",
        "reactions.set",
        "likes.set",
        "articles.read",
        "articles.draft.save",
        "articles.publish",
        "relationships.follow.set",
        "relationships.connect",
        "posts.repost",
        "posts.quote",
        "content.schedule",
        "content.audience.set",
        "communities.membership.set",
        "communities.membership.manage",
        "administration.manage"
      ],
      R4: ["content.delete", "commerce.purchase", "account.delete", "moderation.bulk"]
    }),
    compositions: {
      message: {
        text: [field("body", 1000, "utf16-code-units")],
        attachments: noAttachments("Marketplace message attachments are not catalogued")
      },
      listing: {
        text: [
          field("title", 80, "utf16-code-units"),
          field("body", 1000, "utf16-code-units"),
          field("price", 24, "unicode-code-points", true, "decimal-amount"),
          field("currency", 3, "unicode-code-points", true, "currency-code"),
          field("category", 120, "unicode-code-points", true, "provider-option"),
          field("condition", 80, "unicode-code-points", true, "provider-option"),
          field("location", 160, "unicode-code-points", true, "location-label"),
          field("delivery", 80, "unicode-code-points", true, "provider-option")
        ],
        attachments: attachments(4, ["image"], "One to four explicitly selected listing images", 1)
      }
    },
    longForm: { read: NA_LONG_FORM, publish: NA_LONG_FORM },
    threads: { read: NA_THREADS, publish: NA_THREADS }
  },
  tiktok: {
    id: "tiktok",
    platform: "tiktok",
    facet: "default",
    displayName: "TikTok",
    originPolicy: exactOrigins("https://www.tiktok.com"),
    operations: buildOperationMatrix({
      R1: ["content.read", "content.clip", "profiles.read", "messaging.read", "comments.read", "posts.read", "media.read"],
      R2: ["likes.set", "relationships.follow.set", "content.save"],
      R3: [
        "messaging.send",
        "comments.create",
        "replies.create",
        "posts.publish",
        "media.publish",
        "posts.repost",
        "content.share",
        "content.delete",
        "content.schedule"
      ],
      unsupported: ["content.edit"],
      notApplicable: [
        "reactions.set",
        "articles.read",
        "articles.draft.save",
        "articles.publish",
        "threads.publish",
        "listings.read",
        "listings.publish",
        "relationships.connect",
        "posts.quote",
        "communities.membership.set",
        "communities.membership.manage"
      ],
      R4: [
        "content.audience.set",
        "administration.manage",
        "commerce.purchase",
        "account.delete",
        "moderation.bulk"
      ]
    }),
    compositions: {
      message: {
        text: [field("body", 1000, "utf16-code-units")],
        attachments: attachments(1, ["video", "link"], "One explicitly selected message attachment")
      },
      comment: {
        text: [field("body", 100, "utf16-code-units")],
        attachments: noAttachments("Comment attachments are not catalogued")
      },
      reply: {
        text: [field("body", 100, "utf16-code-units")],
        attachments: noAttachments("Reply attachments are not catalogued")
      },
      post: {
        text: [field("body", 500, "utf16-code-units")],
        attachments: noAttachments("Text-post media is handled as media.publish")
      },
      media: {
        text: [field("caption", 500, "utf16-code-units", false)],
        attachments: attachments(1, ["image", "video"], "Exactly one reviewed media item", 1)
      }
    },
    longForm: { read: NA_LONG_FORM, publish: NA_LONG_FORM },
    threads: { read: NA_THREADS, publish: NA_THREADS }
  },
  twitch: {
    id: "twitch",
    platform: "twitch",
    facet: "default",
    displayName: "Twitch",
    originPolicy: exactOrigins("https://www.twitch.tv", "https://gql.twitch.tv"),
    operations: buildOperationMatrix({
      R1: ["profiles.read"],
      R2: [],
      R3: [],
      unsupported: [
        "content.read",
        "content.clip",
        "organizations.read",
        "contacts.list",
        "contacts.search",
        "feeds.read",
        "messaging.list",
        "messaging.search",
        "messaging.read",
        "messaging.send",
        "comments.read",
        "comments.create",
        "replies.create",
        "posts.read",
        "posts.publish",
        "threads.publish",
        "likes.set",
        "reactions.set",
        "media.read",
        "media.publish",
        "articles.read",
        "articles.draft.save",
        "articles.publish",
        "listings.read",
        "listings.publish",
        "relationships.recommendations.read",
        "relationships.follow.set",
        "relationships.connect",
        "posts.repost",
        "posts.quote",
        "content.share",
        "content.save",
        "content.edit",
        "content.schedule",
        "communities.membership.set"
      ],
      notApplicable: [],
      R4: [
        "content.delete",
        "content.audience.set",
        "communities.membership.manage",
        "administration.manage",
        "commerce.purchase",
        "account.delete",
        "moderation.bulk"
      ]
    }),
    compositions: {},
    longForm: {
      read: UNSUPPORTED_LONG_FORM,
      publish: UNSUPPORTED_LONG_FORM
    },
    threads: {
      read: UNSUPPORTED_THREADS,
      publish: UNSUPPORTED_THREADS
    }
  },
  youtube: {
    id: "youtube",
    platform: "youtube",
    facet: "default",
    displayName: "YouTube",
    originPolicy: exactOrigins("https://www.youtube.com", "https://studio.youtube.com"),
    operations: buildOperationMatrix({
      R1: ["content.read", "content.clip", "profiles.read", "comments.read", "posts.read", "media.read"],
      R2: ["likes.set", "relationships.follow.set", "content.save"],
      R3: ["comments.create", "replies.create", "posts.publish", "media.publish", "content.edit", "content.delete", "content.schedule"],
      unsupported: [],
      notApplicable: [
        "messaging.read",
        "messaging.send",
        "reactions.set",
        "threads.publish",
        "articles.read",
        "articles.draft.save",
        "articles.publish",
        "listings.read",
        "listings.publish",
        "relationships.connect",
        "posts.repost",
        "posts.quote",
        "content.share",
        "communities.membership.set",
        "communities.membership.manage"
      ],
      R4: [
        "content.audience.set",
        "administration.manage",
        "commerce.purchase",
        "account.delete",
        "moderation.bulk"
      ]
    }),
    compositions: {
      comment: {
        text: [field("body", 500, "utf16-code-units")],
        attachments: noAttachments("Comment attachments are not catalogued")
      },
      reply: {
        text: [field("body", 500, "utf16-code-units")],
        attachments: noAttachments("Reply attachments are not catalogued")
      },
      post: {
        text: [field("body", 500, "utf16-code-units")],
        attachments: attachments(1, ["image"], "One reviewed Community post image")
      },
      media: {
        text: [field("title", 90, "utf16-code-units"), field("caption", 1000, "utf16-code-units", false)],
        attachments: attachments(1, ["video"], "Exactly one reviewed video upload", 1)
      }
    },
    longForm: { read: NA_LONG_FORM, publish: NA_LONG_FORM },
    threads: { read: NA_THREADS, publish: NA_THREADS }
  },
  bluesky: {
    id: "bluesky",
    platform: "bluesky",
    facet: "default",
    displayName: "Bluesky",
    originPolicy: exactOrigins("https://bsky.app"),
    operations: buildOperationMatrix({
      R1: ["content.read", "content.clip", "profiles.read", "messaging.read", "comments.read", "posts.read", "media.read"],
      R2: ["likes.set", "relationships.follow.set", "content.save"],
      R3: [
        "messaging.send",
        "replies.create",
        "posts.publish",
        "media.publish",
        "threads.publish",
        "posts.repost",
        "posts.quote",
        "content.share",
        "content.delete"
      ],
      unsupported: ["articles.read", "articles.draft.save", "articles.publish", "content.edit", "content.schedule"],
      notApplicable: [
        "comments.create",
        "reactions.set",
        "listings.read",
        "listings.publish",
        "relationships.connect",
        "content.audience.set",
        "communities.membership.set",
        "communities.membership.manage",
        "commerce.purchase"
      ],
      R4: ["administration.manage", "account.delete", "moderation.bulk"]
    }),
    compositions: {
      message: {
        text: [field("body", 1000, "unicode-code-points")],
        attachments: noAttachments("Message attachments are not catalogued")
      },
      reply: {
        text: [field("body", 280, "unicode-code-points")],
        attachments: attachments(1, ["image", "video", "gif", "link"], "One reviewed reply attachment")
      },
      post: {
        text: [field("body", 280, "unicode-code-points")],
        attachments: attachments(1, ["image", "video", "gif", "link"], "One reviewed post attachment")
      },
      media: {
        text: [field("body", 280, "unicode-code-points")],
        attachments: attachments(1, ["video"], "Exactly one reviewed video upload", 1)
      }
    },
    longForm: { read: UNSUPPORTED_LONG_FORM, publish: UNSUPPORTED_LONG_FORM },
    threads: {
      read: threadRead("Read one bounded Bluesky post thread"),
      publish: threadPublish(25, "Publish one root post optionally followed by bounded self-replies")
    }
  }
};
function hasWellFormedUnicode(value) {
  for (let index = 0;index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 55296 && codeUnit <= 56319) {
      const following = value.charCodeAt(index + 1);
      if (!Number.isInteger(following) || following < 56320 || following > 57343)
        return false;
      index += 1;
    } else if (codeUnit >= 56320 && codeUnit <= 57343) {
      return false;
    }
  }
  return true;
}
function weightPolicyIssue(policy) {
  if (!Number.isSafeInteger(policy.defaultWeight) || policy.defaultWeight < 1) {
    return "Text weights must be positive safe integers";
  }
  if (policy.minimumUrlWeight !== undefined && (!Number.isSafeInteger(policy.minimumUrlWeight) || policy.minimumUrlWeight < 1)) {
    return "The minimum URL weight must be a positive safe integer";
  }
  let previousEnd = -1;
  for (const range of policy.ranges) {
    if (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) || !Number.isSafeInteger(range.weight) || range.start < 0 || range.end > 1114111 || range.start > range.end || range.start <= previousEnd || range.weight < 1) {
      return "Text weight ranges must be ordered, disjoint Unicode ranges with positive safe-integer weights";
    }
    previousEnd = range.end;
  }
  return null;
}
function assertWeightPolicy(policy) {
  const issue = weightPolicyIssue(policy);
  if (issue !== null)
    throw new RangeError(issue);
}
function weightCodePoint(codePoint, policy) {
  for (const range of policy.ranges) {
    if (codePoint < range.start)
      break;
    if (codePoint <= range.end)
      return range.weight;
  }
  return policy.defaultWeight;
}
function rawWeightedLength(text, policy) {
  let length = 0;
  for (const symbol of text) {
    const codePoint = symbol.codePointAt(0);
    if (codePoint === undefined)
      continue;
    length += weightCodePoint(codePoint, policy);
    if (!Number.isSafeInteger(length))
      throw new RangeError("Weighted text length exceeds the safe integer range");
  }
  return length;
}
var graphemeSegmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
var TRAILING_URL_PUNCTUATION = /[!'),.:;?\]}]+$/u;
function* graphemeUnits(text, policy) {
  for (const part of graphemeSegmenter.segment(text)) {
    yield { text: part.segment, weight: rawWeightedLength(part.segment, policy) };
  }
}
function* weightedUnits(text, policy) {
  let cursor = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/giu)) {
    const index = match.index;
    const matched = match[0];
    if (index > cursor)
      yield* graphemeUnits(text.slice(cursor, index), policy);
    const trailing = TRAILING_URL_PUNCTUATION.exec(matched)?.[0] ?? "";
    const core = trailing.length === 0 ? matched : matched.slice(0, -trailing.length);
    if (core.length === 0) {
      yield* graphemeUnits(matched, policy);
    } else {
      yield {
        text: core,
        weight: policy.minimumUrlWeight === undefined ? rawWeightedLength(core, policy) : Math.max(rawWeightedLength(core, policy), policy.minimumUrlWeight)
      };
      if (trailing.length > 0)
        yield* graphemeUnits(trailing, policy);
    }
    cursor = index + matched.length;
  }
  if (cursor < text.length)
    yield* graphemeUnits(text.slice(cursor), policy);
}
function weightedTextLength(text, policy) {
  if (!hasWellFormedUnicode(text))
    throw new TypeError("Text must contain well-formed Unicode");
  assertWeightPolicy(policy);
  let length = 0;
  for (const unit of weightedUnits(text, policy)) {
    length += unit.weight;
    if (!Number.isSafeInteger(length))
      throw new RangeError("Weighted text length exceeds the safe integer range");
  }
  return length;
}

// src/web-session-template.ts
var WEB_SESSION_TEMPLATE_SCHEMA_VERSION = 1;
var webSessionMethods = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"];
var webSessionInputValueTypes = [
  "string",
  "number",
  "boolean",
  "string[]",
  "number[]",
  "boolean[]"
];
var webSessionProjectionValueTypes = ["string", "number", "boolean", "null", "object", "array"];
var MAX_ISSUES = 100;
var MAX_VALUE_DEPTH = 12;
var MAX_VALUE_NODES = 512;
var MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
var dangerousObjectKeys = new Set(["__proto__", "constructor", "prototype"]);
var managedHeaderNames = new Set([
  "accept-encoding",
  "connection",
  "content-length",
  "content-type",
  "cookie",
  "forwarded",
  "host",
  "origin",
  "proxy-authorization",
  "referer",
  "set-cookie",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "user-agent"
]);
function addIssue(issues, issue) {
  if (issues.length < MAX_ISSUES)
    issues.push(issue);
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isUnknownArray(value) {
  return Array.isArray(value);
}
function exactKeys(value, allowedKeys, path, issues) {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key))
      addIssue(issues, `${path}.${key} is not supported`);
  }
}
function hasUnpairedSurrogate(value) {
  for (let index = 0;index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 55296 && code <= 56319) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 56320 && next <= 57343))
        return true;
      index += 1;
    } else if (code >= 56320 && code <= 57343)
      return true;
  }
  return false;
}
function controlFreeString(value, path, issues, minimum, maximum) {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum) {
    addIssue(issues, `${path} must be a ${minimum}-${maximum} character string without control characters`);
    return null;
  }
  for (let index = 0;index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) {
      addIssue(issues, `${path} must be a ${minimum}-${maximum} character string without control characters`);
      return null;
    }
  }
  if (hasUnpairedSurrogate(value)) {
    addIssue(issues, `${path} must contain well-formed Unicode`);
    return null;
  }
  return value;
}
function jsonString(value, path, issues) {
  if (typeof value !== "string" || value.length > 65536 || value.includes("\x00") || hasUnpairedSurrogate(value)) {
    addIssue(issues, `${path} must be a well-formed JSON string of at most 65536 characters without NUL`);
    return null;
  }
  return value;
}
function safeInteger(value, path, minimum, maximum, issues) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    addIssue(issues, `${path} must be an integer between ${minimum} and ${maximum}`);
    return null;
  }
  return value;
}
function boundedArray(value, path, maximum, issues) {
  if (!isUnknownArray(value) || value.length > maximum) {
    addIssue(issues, `${path} must be an array with at most ${maximum} entries`);
    return null;
  }
  return value;
}
function normalizedCredentialName(value) {
  return value.replaceAll("_", "-").replace(/([a-z0-9])([A-Z])/gu, "$1-$2").toLowerCase();
}
function isCredentialName(value) {
  const normalized = normalizedCredentialName(value);
  return /(?:^|-)(?:authorization|cookie|csrf|xsrf|password|secret|credential|access-token|refresh-token|id-token|auth-token|api-key|authenticity-token)(?:-|$)/u.test(normalized);
}
function isCsrfHeaderName(value) {
  const normalized = value.toLowerCase();
  return normalized.includes("csrf") || normalized.includes("xsrf");
}
function isManagedHeaderName(value) {
  return managedHeaderNames.has(value) || value.startsWith("sec-") || value.startsWith("proxy-") || value.startsWith("x-forwarded-") || value.startsWith("access-control-request-");
}
function canonicalHttpsOrigin(value, path, issues) {
  const origin = controlFreeString(value, path, issues, 1, 2048);
  if (origin === null)
    return null;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "" || parsed.hostname.includes("*") || parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "" || parsed.origin !== origin) {
      addIssue(issues, `${path} must be one exact canonical HTTPS origin without credentials, path, query, or fragment`);
      return null;
    }
    return origin;
  } catch {
    addIssue(issues, `${path} must be one exact canonical HTTPS origin without credentials, path, query, or fragment`);
    return null;
  }
}
function inputValueType(field2) {
  if (field2.type === "string" || field2.type === "number" || field2.type === "boolean")
    return field2.type;
  if (field2.type !== "array" || field2.items.type === "file")
    return null;
  if (field2.items.type === "string")
    return "string[]";
  if (field2.items.type === "number")
    return "number[]";
  return "boolean[]";
}
function isWebSessionMethod(value) {
  return webSessionMethods.some((candidate) => candidate === value);
}
function isProjectionValueType(value) {
  return webSessionProjectionValueTypes.some((candidate) => candidate === value);
}
function parseInputSource(value, path, context) {
  if (!isRecord(value)) {
    addIssue(context.issues, `${path} must be a typed input source object`);
    return null;
  }
  exactKeys(value, ["kind", "name", "valueType"], path, context.issues);
  if (value.kind !== "input") {
    addIssue(context.issues, `${path}.kind must be input`);
    return null;
  }
  const name = controlFreeString(value.name, `${path}.name`, context.issues, 1, 64);
  const declaredType = value.valueType;
  if (!webSessionInputValueTypes.some((candidate) => candidate === declaredType)) {
    addIssue(context.issues, `${path}.valueType must be ${webSessionInputValueTypes.join(", ")}`);
    return null;
  }
  if (name === null)
    return null;
  if (isCredentialName(name)) {
    addIssue(context.issues, `${path}.name cannot designate authentication material`);
    return null;
  }
  const field2 = Object.hasOwn(context.input.properties, name) ? context.input.properties[name] : undefined;
  if (field2 === undefined) {
    addIssue(context.issues, `${path}.name must name a declared input field`);
    return null;
  }
  const actualType = inputValueType(field2);
  if (actualType === null) {
    addIssue(context.issues, `${path}.name cannot expose file input bytes to a web-session request`);
    return null;
  }
  if (!context.requiredInputs.has(name)) {
    addIssue(context.issues, `${path}.name must name a required input field`);
    return null;
  }
  if (declaredType !== actualType) {
    addIssue(context.issues, `${path}.valueType must match input.${name} (${actualType})`);
    return null;
  }
  return { kind: "input", name, valueType: actualType };
}
function parseLiteral(value, path, context) {
  exactKeys(value, ["kind", "value"], path, context.issues);
  const literal = value.value;
  if (literal === null || typeof literal === "boolean")
    return { kind: "literal", value: literal };
  if (typeof literal === "number") {
    if (!Number.isFinite(literal)) {
      addIssue(context.issues, `${path}.value must be a finite JSON primitive`);
      return null;
    }
    return { kind: "literal", value: literal };
  }
  const text = jsonString(literal, `${path}.value`, context.issues);
  return text === null ? null : { kind: "literal", value: text };
}
function parseValueTemplate(value, path, context, depth = 0) {
  context.valueNodes += 1;
  if (context.valueNodes > MAX_VALUE_NODES) {
    addIssue(context.issues, `${path} exceeds the ${MAX_VALUE_NODES}-node value-template budget`);
    return null;
  }
  if (depth > MAX_VALUE_DEPTH) {
    addIssue(context.issues, `${path} exceeds the ${MAX_VALUE_DEPTH}-level value-template depth`);
    return null;
  }
  if (!isRecord(value)) {
    addIssue(context.issues, `${path} must be a declarative value-template object`);
    return null;
  }
  if (value.kind === "literal")
    return parseLiteral(value, path, context);
  if (value.kind === "input")
    return parseInputSource(value, path, context);
  if (value.kind === "array") {
    exactKeys(value, ["kind", "items"], path, context.issues);
    const items = boundedArray(value.items, `${path}.items`, 100, context.issues);
    if (items === null)
      return null;
    const parsed = [];
    for (const [index, item] of items.entries()) {
      const next = parseValueTemplate(item, `${path}.items[${index}]`, context, depth + 1);
      if (next !== null)
        parsed.push(next);
    }
    return { kind: "array", items: parsed };
  }
  if (value.kind === "object") {
    exactKeys(value, ["kind", "entries"], path, context.issues);
    const entries = boundedArray(value.entries, `${path}.entries`, 100, context.issues);
    if (entries === null)
      return null;
    const parsed = [];
    const names = new Set;
    for (const [index, entry] of entries.entries()) {
      const entryPath = `${path}.entries[${index}]`;
      if (!isRecord(entry)) {
        addIssue(context.issues, `${entryPath} must be an object`);
        continue;
      }
      exactKeys(entry, ["name", "value"], entryPath, context.issues);
      const name = controlFreeString(entry.name, `${entryPath}.name`, context.issues, 1, 128);
      const parsedValue = parseValueTemplate(entry.value, `${entryPath}.value`, context, depth + 1);
      if (name === null || parsedValue === null)
        continue;
      if (dangerousObjectKeys.has(name)) {
        addIssue(context.issues, `${entryPath}.name cannot be a prototype-mutating key`);
        continue;
      }
      if (isCredentialName(name)) {
        addIssue(context.issues, `${entryPath}.name cannot be a credential sink`);
        continue;
      }
      if (names.has(name)) {
        addIssue(context.issues, `${entryPath}.name duplicates ${name}`);
        continue;
      }
      names.add(name);
      parsed.push({ name, value: parsedValue });
    }
    return { kind: "object", entries: parsed };
  }
  addIssue(context.issues, `${path}.kind must be literal, input, object, or array`);
  return null;
}
function isScalarTemplate(value) {
  if (value.kind === "literal")
    return value.value !== null;
  return value.kind === "input" && !value.valueType.endsWith("[]");
}
function parsePath(value, path, context) {
  const segments = boundedArray(value, path, 64, context.issues);
  if (segments === null)
    return null;
  const parsed = [];
  for (const [index, segment] of segments.entries()) {
    const segmentPath = `${path}[${index}]`;
    if (!isRecord(segment)) {
      addIssue(context.issues, `${segmentPath} must be a literal or typed input segment`);
      continue;
    }
    if (segment.kind === "literal") {
      exactKeys(segment, ["kind", "value"], segmentPath, context.issues);
      const text = controlFreeString(segment.value, `${segmentPath}.value`, context.issues, 1, 256);
      if (text === null)
        continue;
      if (text === "." || text === ".." || /[/\\%?#]/u.test(text)) {
        addIssue(context.issues, `${segmentPath}.value must be one unescaped path segment`);
        continue;
      }
      parsed.push({ kind: "literal", value: text });
      continue;
    }
    const source = parseInputSource(segment, segmentPath, context);
    if (source === null)
      continue;
    const field2 = context.input.properties[source.name];
    if (source.valueType !== "string" || field2?.type !== "string" || field2.format !== "path-segment") {
      addIssue(context.issues, `${segmentPath} must reference a string input with format path-segment`);
      continue;
    }
    parsed.push({ kind: "input", name: source.name, valueType: "string" });
  }
  return parsed;
}
function parseQuery(value, path, context) {
  const entries = boundedArray(value, path, 50, context.issues);
  if (entries === null)
    return null;
  const parsed = [];
  const names = new Set;
  for (const [index, entry] of entries.entries()) {
    const entryPath = `${path}[${index}]`;
    if (!isRecord(entry)) {
      addIssue(context.issues, `${entryPath} must be an object`);
      continue;
    }
    exactKeys(entry, ["name", "encoding", "value"], entryPath, context.issues);
    const name = controlFreeString(entry.name, `${entryPath}.name`, context.issues, 1, 128);
    const encoding = entry.encoding;
    if (encoding !== "scalar" && encoding !== "json") {
      addIssue(context.issues, `${entryPath}.encoding must be scalar or json`);
    }
    const parsedValue = parseValueTemplate(entry.value, `${entryPath}.value`, context);
    if (name === null || parsedValue === null || encoding !== "scalar" && encoding !== "json")
      continue;
    if (/[&=#]/u.test(name) || isCredentialName(name)) {
      addIssue(context.issues, `${entryPath}.name must be a fixed non-credential query name`);
      continue;
    }
    if (names.has(name)) {
      addIssue(context.issues, `${entryPath}.name duplicates ${name}`);
      continue;
    }
    if (encoding === "scalar" && !isScalarTemplate(parsedValue)) {
      addIssue(context.issues, `${entryPath}.value must be one non-null scalar for scalar encoding`);
      continue;
    }
    names.add(name);
    parsed.push({ name, encoding, value: parsedValue });
  }
  return parsed;
}
function parseBrowserStorageSource(value, path, issues) {
  exactKeys(value, ["kind", "area", "key"], path, issues);
  if (value.kind !== "storage") {
    addIssue(issues, `${path}.kind must be storage`);
    return null;
  }
  if (value.area !== "local" && value.area !== "session") {
    addIssue(issues, `${path}.area must be local or session`);
    return null;
  }
  const key = controlFreeString(value.key, `${path}.key`, issues, 1, 256);
  return key === null ? null : { kind: "storage", area: value.area, key };
}
function parseCsrfSource(value, path, issues) {
  if (!isRecord(value)) {
    addIssue(issues, `${path} must be a browser-only CSRF source`);
    return null;
  }
  if (value.kind === "storage")
    return parseBrowserStorageSource(value, path, issues);
  if (value.kind === "cookie" || value.kind === "meta") {
    exactKeys(value, ["kind", "name"], path, issues);
    const name = controlFreeString(value.name, `${path}.name`, issues, 1, 256);
    return name === null ? null : { kind: value.kind, name };
  }
  addIssue(issues, `${path}.kind must be cookie, meta, or storage`);
  return null;
}
function parseAuthorizationSource(value, path, issues) {
  if (!isRecord(value)) {
    addIssue(issues, `${path} must be a browser-only authorization source`);
    return null;
  }
  if (value.kind === "storage")
    return parseBrowserStorageSource(value, path, issues);
  if (value.kind === "captured-header") {
    exactKeys(value, ["kind", "name"], path, issues);
    if (value.name !== "authorization") {
      addIssue(issues, `${path}.name must be authorization`);
      return null;
    }
    return { kind: "captured-header", name: "authorization" };
  }
  addIssue(issues, `${path}.kind must be captured-header or storage`);
  return null;
}
function parseHeaderValue(value, headerName, path, issues) {
  if (!isRecord(value)) {
    addIssue(issues, `${path} must be a fixed literal or browser-only credential source`);
    return null;
  }
  if (value.kind === "literal") {
    exactKeys(value, ["kind", "value"], path, issues);
    const literal = controlFreeString(value.value, `${path}.value`, issues, 0, 4096);
    if (literal === null)
      return null;
    if (headerName === "authorization" || isCsrfHeaderName(headerName) || isCredentialName(headerName)) {
      addIssue(issues, `${path} cannot put a literal into a credential-bearing header`);
      return null;
    }
    return { kind: "literal", value: literal };
  }
  if (value.kind === "browser-csrf") {
    exactKeys(value, ["kind", "source", "transform"], path, issues);
    if (!isCsrfHeaderName(headerName)) {
      addIssue(issues, `${path} may terminate only in a fixed CSRF/XSRF header`);
      return null;
    }
    const source = parseCsrfSource(value.source, `${path}.source`, issues);
    const transform = value.transform;
    if (transform !== "identity" && transform !== "strip-surrounding-quotes" && transform !== "url-decode") {
      addIssue(issues, `${path}.transform must be identity, strip-surrounding-quotes, or url-decode`);
      return null;
    }
    return source === null ? null : { kind: "browser-csrf", source, transform };
  }
  if (value.kind === "browser-authorization") {
    exactKeys(value, ["kind", "source", "transform"], path, issues);
    if (headerName !== "authorization") {
      addIssue(issues, `${path} may terminate only in the fixed authorization header`);
      return null;
    }
    const source = parseAuthorizationSource(value.source, `${path}.source`, issues);
    const transform = value.transform;
    if (transform !== "identity" && transform !== "bearer") {
      addIssue(issues, `${path}.transform must be identity or bearer`);
      return null;
    }
    if (source?.kind === "captured-header" && transform !== "identity") {
      addIssue(issues, `${path}.transform must be identity for a captured authorization header`);
      return null;
    }
    return source === null ? null : { kind: "browser-authorization", source, transform };
  }
  addIssue(issues, `${path}.kind must be literal, browser-csrf, or browser-authorization`);
  return null;
}
function parseHeaders(value, path, issues) {
  const entries = boundedArray(value, path, 50, issues);
  if (entries === null)
    return null;
  const parsed = [];
  const names = new Set;
  for (const [index, entry] of entries.entries()) {
    const entryPath = `${path}[${index}]`;
    if (!isRecord(entry)) {
      addIssue(issues, `${entryPath} must be an object`);
      continue;
    }
    exactKeys(entry, ["name", "value"], entryPath, issues);
    const name = controlFreeString(entry.name, `${entryPath}.name`, issues, 1, 128);
    if (name === null)
      continue;
    if (!/^[a-z0-9!#$%&'*+.^_`|~-]+$/u.test(name) || name !== name.toLowerCase()) {
      addIssue(issues, `${entryPath}.name must be one canonical lower-case HTTP field name`);
      continue;
    }
    if (isManagedHeaderName(name) && name !== "proxy-authorization") {
      addIssue(issues, `${entryPath}.name is browser-managed and cannot be supplied by a template`);
      continue;
    }
    if (name === "proxy-authorization") {
      addIssue(issues, `${entryPath}.name cannot designate proxy credentials`);
      continue;
    }
    if (names.has(name)) {
      addIssue(issues, `${entryPath}.name duplicates ${name}`);
      continue;
    }
    const headerValue = parseHeaderValue(entry.value, name, `${entryPath}.value`, issues);
    if (headerValue === null)
      continue;
    names.add(name);
    parsed.push({ name, value: headerValue });
  }
  return parsed;
}
function parseBody(value, path, context) {
  if (!isRecord(value)) {
    addIssue(context.issues, `${path} must be a declarative request body`);
    return null;
  }
  if (value.kind === "none") {
    exactKeys(value, ["kind"], path, context.issues);
    return { kind: "none" };
  }
  if (value.kind === "json") {
    exactKeys(value, ["kind", "value"], path, context.issues);
    const parsedValue = parseValueTemplate(value.value, `${path}.value`, context);
    return parsedValue === null ? null : { kind: "json", value: parsedValue };
  }
  if (value.kind === "form") {
    exactKeys(value, ["kind", "fields"], path, context.issues);
    const fields = boundedArray(value.fields, `${path}.fields`, 100, context.issues);
    if (fields === null)
      return null;
    const parsed = [];
    const names = new Set;
    for (const [index, field2] of fields.entries()) {
      const fieldPath = `${path}.fields[${index}]`;
      if (!isRecord(field2)) {
        addIssue(context.issues, `${fieldPath} must be an object`);
        continue;
      }
      exactKeys(field2, ["name", "value"], fieldPath, context.issues);
      const name = controlFreeString(field2.name, `${fieldPath}.name`, context.issues, 1, 128);
      const fieldValue = parseValueTemplate(field2.value, `${fieldPath}.value`, context);
      if (name === null || fieldValue === null)
        continue;
      if (/[&=]/u.test(name) || isCredentialName(name)) {
        addIssue(context.issues, `${fieldPath}.name must be a fixed non-credential form name`);
        continue;
      }
      if (!isScalarTemplate(fieldValue)) {
        addIssue(context.issues, `${fieldPath}.value must be one non-null scalar`);
        continue;
      }
      if (names.has(name)) {
        addIssue(context.issues, `${fieldPath}.name duplicates ${name}`);
        continue;
      }
      names.add(name);
      parsed.push({ name, value: fieldValue });
    }
    return { kind: "form", fields: parsed };
  }
  addIssue(context.issues, `${path}.kind must be none, json, or form`);
  return null;
}
function parseRequest(value, path, context) {
  if (!isRecord(value)) {
    addIssue(context.issues, `${path} must be an object`);
    return null;
  }
  exactKeys(value, ["method", "path", "query", "headers", "body"], path, context.issues);
  const method = value.method;
  if (!isWebSessionMethod(method)) {
    addIssue(context.issues, `${path}.method must be one fixed reviewed method: ${webSessionMethods.join(", ")}`);
  }
  const parsedPath = parsePath(value.path, `${path}.path`, context);
  const query = parseQuery(value.query, `${path}.query`, context);
  const headers = parseHeaders(value.headers, `${path}.headers`, context.issues);
  const body = parseBody(value.body, `${path}.body`, context);
  if ((method === "GET" || method === "HEAD") && body?.kind !== "none") {
    addIssue(context.issues, `${path}.body must be none for ${method}`);
  }
  if (!isWebSessionMethod(method) || parsedPath === null || query === null || headers === null || body === null)
    return null;
  return { method, path: parsedPath, query, headers, body };
}
function parseJsonPath(value, path, issues) {
  const segments = boundedArray(value, path, 16, issues);
  if (segments === null || segments.length === 0) {
    if (segments !== null)
      addIssue(issues, `${path} must contain at least one fixed segment`);
    return null;
  }
  const parsed = [];
  for (const [index, segment] of segments.entries()) {
    const segmentPath = `${path}[${index}]`;
    if (!isRecord(segment)) {
      addIssue(issues, `${segmentPath} must be a fixed key or index segment`);
      continue;
    }
    if (segment.kind === "key") {
      exactKeys(segment, ["kind", "key"], segmentPath, issues);
      const key = controlFreeString(segment.key, `${segmentPath}.key`, issues, 1, 128);
      if (key === null)
        continue;
      if (dangerousObjectKeys.has(key) || isCredentialName(key)) {
        addIssue(issues, `${segmentPath}.key cannot select a prototype or credential-bearing field`);
        continue;
      }
      parsed.push({ kind: "key", key });
      continue;
    }
    if (segment.kind === "index") {
      exactKeys(segment, ["kind", "index"], segmentPath, issues);
      const parsedIndex = safeInteger(segment.index, `${segmentPath}.index`, 0, 1e4, issues);
      if (parsedIndex !== null)
        parsed.push({ kind: "index", index: parsedIndex });
      continue;
    }
    addIssue(issues, `${segmentPath}.kind must be key or index`);
  }
  return parsed.length === segments.length ? parsed : null;
}
function parseProjections(value, path, issues) {
  const projections = boundedArray(value, path, 64, issues);
  if (projections === null)
    return null;
  const parsed = [];
  const names = new Set;
  for (const [index, projection] of projections.entries()) {
    const projectionPath = `${path}[${index}]`;
    if (!isRecord(projection)) {
      addIssue(issues, `${projectionPath} must be an object`);
      continue;
    }
    exactKeys(projection, ["name", "path", "valueType", "required"], projectionPath, issues);
    const name = controlFreeString(projection.name, `${projectionPath}.name`, issues, 1, 64);
    const jsonPath = parseJsonPath(projection.path, `${projectionPath}.path`, issues);
    const valueType = projection.valueType;
    if (!isProjectionValueType(valueType)) {
      addIssue(issues, `${projectionPath}.valueType must be ${webSessionProjectionValueTypes.join(", ")}`);
    }
    if (typeof projection.required !== "boolean")
      addIssue(issues, `${projectionPath}.required must be boolean`);
    if (name === null || jsonPath === null || typeof projection.required !== "boolean" || !isProjectionValueType(valueType))
      continue;
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(name) || isCredentialName(name)) {
      addIssue(issues, `${projectionPath}.name must be a safe non-credential output name`);
      continue;
    }
    if (names.has(name)) {
      addIssue(issues, `${projectionPath}.name duplicates ${name}`);
      continue;
    }
    names.add(name);
    parsed.push({ name, path: jsonPath, valueType, required: projection.required });
  }
  return parsed;
}
function parseBindings(value, path, context) {
  const bindings = boundedArray(value, path, 32, context.issues);
  if (bindings === null)
    return null;
  const parsed = [];
  const paths = new Set;
  for (const [index, binding] of bindings.entries()) {
    const bindingPath = `${path}[${index}]`;
    if (!isRecord(binding)) {
      addIssue(context.issues, `${bindingPath} must be an object`);
      continue;
    }
    exactKeys(binding, ["path", "expected"], bindingPath, context.issues);
    const jsonPath = parseJsonPath(binding.path, `${bindingPath}.path`, context.issues);
    const expected = parseValueTemplate(binding.expected, `${bindingPath}.expected`, context);
    if (jsonPath === null || expected === null)
      continue;
    if (!isScalarTemplate(expected)) {
      addIssue(context.issues, `${bindingPath}.expected must be one non-null scalar literal or scalar input`);
      continue;
    }
    const signature = JSON.stringify(jsonPath);
    if (paths.has(signature)) {
      addIssue(context.issues, `${bindingPath}.path duplicates another binding path`);
      continue;
    }
    paths.add(signature);
    parsed.push({ path: jsonPath, expected });
  }
  return parsed;
}
function isJsonContentType(value) {
  const subtype = value.slice(value.indexOf("/") + 1);
  return subtype === "json" || subtype.endsWith("+json");
}
function parseContentType(value, path, issues) {
  if (value === null)
    return null;
  const contentType = controlFreeString(value, path, issues, 3, 128);
  if (contentType === null || contentType !== contentType.toLowerCase() || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+*-]+$/u.test(contentType)) {
    if (contentType !== null)
      addIssue(issues, `${path} must be null or one lower-case media-type essence without parameters`);
    return;
  }
  return contentType;
}
function parseResponseBody(value, contentType, path, context) {
  if (!isRecord(value)) {
    addIssue(context.issues, `${path} must be an object`);
    return null;
  }
  if (value.kind === "empty") {
    exactKeys(value, ["kind"], path, context.issues);
    if (contentType !== null) {
      addIssue(context.issues, `${path}.kind empty requires a null contentType`);
      return null;
    }
    return { kind: "empty" };
  }
  if (value.kind === "discard") {
    exactKeys(value, ["kind"], path, context.issues);
    if (contentType === null) {
      addIssue(context.issues, `${path}.kind discard requires an exact contentType`);
      return null;
    }
    return { kind: "discard" };
  }
  if (value.kind === "json") {
    exactKeys(value, ["kind", "projections", "bindings"], path, context.issues);
    if (contentType === null || !isJsonContentType(contentType)) {
      addIssue(context.issues, `${path}.kind json requires an exact JSON contentType`);
      return null;
    }
    const projections = parseProjections(value.projections, `${path}.projections`, context.issues);
    const bindings = parseBindings(value.bindings, `${path}.bindings`, context);
    return projections === null || bindings === null ? null : { kind: "json", projections, bindings };
  }
  addIssue(context.issues, `${path}.kind must be empty, discard, or json`);
  return null;
}
function parseResponse(value, path, context) {
  if (!isRecord(value)) {
    addIssue(context.issues, `${path} must be an object`);
    return null;
  }
  exactKeys(value, ["maxBytes", "variants"], path, context.issues);
  const maxBytes = safeInteger(value.maxBytes, `${path}.maxBytes`, 1, MAX_RESPONSE_BYTES, context.issues);
  const variants = boundedArray(value.variants, `${path}.variants`, 16, context.issues);
  if (variants !== null && variants.length === 0)
    addIssue(context.issues, `${path}.variants must contain at least one exact response variant`);
  if (maxBytes === null || variants === null || variants.length === 0)
    return null;
  const parsed = [];
  const signatures = new Set;
  for (const [index, variant] of variants.entries()) {
    const variantPath = `${path}.variants[${index}]`;
    if (!isRecord(variant)) {
      addIssue(context.issues, `${variantPath} must be an object`);
      continue;
    }
    exactKeys(variant, ["status", "contentType", "body"], variantPath, context.issues);
    const status = safeInteger(variant.status, `${variantPath}.status`, 200, 299, context.issues);
    const contentType = parseContentType(variant.contentType, `${variantPath}.contentType`, context.issues);
    if (status === null || contentType === undefined)
      continue;
    const body = parseResponseBody(variant.body, contentType, `${variantPath}.body`, context);
    if (body === null)
      continue;
    const signature = `${status}\x00${contentType ?? "<missing>"}`;
    if (signatures.has(signature)) {
      addIssue(context.issues, `${variantPath} duplicates an exact status/contentType pair`);
      continue;
    }
    signatures.add(signature);
    parsed.push({ status, contentType, body });
  }
  return { maxBytes, variants: parsed };
}
function parseWebSessionTemplate(value, options) {
  const issues = [];
  if (options.allowedOrigins.length < 1 || options.allowedOrigins.length > 32) {
    addIssue(issues, "$policy.allowedOrigins must contain 1-32 exact reviewed origins");
  }
  const allowedOrigins = new Set;
  for (const [index, candidate] of options.allowedOrigins.entries()) {
    const origin2 = canonicalHttpsOrigin(candidate, `$policy.allowedOrigins[${index}]`, issues);
    if (origin2 !== null)
      allowedOrigins.add(origin2);
  }
  if (!isRecord(value))
    return { ok: false, issues: ["$ must be an object"] };
  exactKeys(value, ["schemaVersion", "origin", "request", "response"], "$", issues);
  if (value.schemaVersion !== WEB_SESSION_TEMPLATE_SCHEMA_VERSION) {
    addIssue(issues, `$.schemaVersion must be ${WEB_SESSION_TEMPLATE_SCHEMA_VERSION}`);
  }
  const origin = canonicalHttpsOrigin(value.origin, "$.origin", issues);
  if (origin !== null && !allowedOrigins.has(origin))
    addIssue(issues, "$.origin is not one of the exact reviewed origins");
  const context = {
    input: options.input,
    requiredInputs: new Set(options.input.required),
    issues,
    valueNodes: 0
  };
  const request = parseRequest(value.request, "$.request", context);
  const response = parseResponse(value.response, "$.response", context);
  if (request?.method === "HEAD" && response !== null && response.variants.some((variant) => variant.body.kind === "json")) {
    addIssue(issues, "$.response cannot project a JSON body for a HEAD request");
  }
  if (issues.length > 0 || value.schemaVersion !== WEB_SESSION_TEMPLATE_SCHEMA_VERSION || origin === null || request === null || response === null)
    return { ok: false, issues };
  return {
    ok: true,
    value: {
      schemaVersion: WEB_SESSION_TEMPLATE_SCHEMA_VERSION,
      origin,
      request,
      response
    }
  };
}

// src/model.ts
var GHOSTGET_MANIFEST_SCHEMA_VERSION = 2;
var GHOSTGET_PROVIDER_MANIFEST_SCHEMA_VERSION = 3;
var GHOSTGET_WEB_SESSION_MANIFEST_SCHEMA_VERSION = 4;
var GHOSTGET_REVIEWED_TEMPLATE_MANIFEST_SCHEMA_VERSION = 5;
var GHOSTGET_LOCAL_CLI_MANIFEST_SCHEMA_VERSION = 6;
var GHOSTGET_LEGACY_MANIFEST_SCHEMA_VERSION = 1;
var GHOSTGET_LEGACY_LINKEDIN_MANIFEST_HASH = "bbdd1f8c1a532d621a367776770c968fd06cb7cf3b343d64ccda4b53690bb42f";
var operationRisks = ["R1", "R2", "R3", "R4"];
var idempotencyKinds = ["none", "local-at-most-once"];
function isProviderOperation(operation) {
  return operation.provider !== undefined;
}
function isWebSessionOperation(operation) {
  return operation.webSession !== undefined;
}
function isReviewedTemplateOperation(operation) {
  return operation.reviewedTemplate !== undefined;
}
function isLocalCliOperation(operation) {
  return operation.localCli !== undefined;
}
function isBrowserOperation(operation) {
  return operation.browser !== undefined;
}
var operationCompositions = {
  "messaging.send": "message",
  "comments.create": "comment",
  "replies.create": "reply",
  "posts.publish": "post",
  "media.publish": "media",
  "articles.draft.save": "article",
  "articles.publish": "article",
  "listings.publish": "listing"
};
var genericSemanticRisks = {
  "content.read": "R1",
  "content.clip": "R1",
  "profiles.read": "R1",
  "organizations.read": "R1",
  "contacts.list": "R1",
  "contacts.search": "R1",
  "contacts.read": "R1",
  "feeds.read": "R1",
  "messaging.list": "R1",
  "messaging.search": "R1",
  "messaging.read": "R1",
  "messaging.send": "R3",
  "comments.read": "R1",
  "comments.create": "R3",
  "replies.create": "R3",
  "posts.read": "R1",
  "posts.publish": "R3",
  "threads.publish": "R3",
  "reactions.set": "R2",
  "likes.set": "R2",
  "media.read": "R1",
  "media.publish": "R3",
  "articles.read": "R1",
  "articles.draft.save": "R2",
  "articles.publish": "R3",
  "listings.read": "R1",
  "listings.publish": "R3",
  "relationships.follow.set": "R2",
  "relationships.recommendations.read": "R1",
  "relationships.connect": "R3",
  "posts.repost": "R3",
  "posts.quote": "R3",
  "content.share": "R3",
  "content.save": "R2",
  "content.edit": "R3",
  "content.delete": "R4",
  "content.schedule": "R3",
  "content.audience.set": "R4",
  "communities.membership.set": "R2",
  "communities.membership.manage": "R4",
  "administration.manage": "R4",
  "commerce.purchase": "R4",
  "account.delete": "R4",
  "moderation.bulk": "R4"
};
function isReviewedTemplateProtectedHostname(hostnameOrPattern, registry) {
  const normalized = hostnameOrPattern.toLowerCase().replace(/\.$/u, "");
  const wildcardSuffix = normalized.startsWith("*.") ? normalized.slice(2) : null;
  const registeredFamilies = registry.list().flatMap((plugin) => plugin.bindings.flatMap((binding) => binding.protectedHostnameFamilies));
  return registeredFamilies.some((family) => {
    if (wildcardSuffix === null) {
      return normalized === family || normalized.endsWith(`.${family}`);
    }
    return wildcardSuffix === family || wildcardSuffix.endsWith(`.${family}`) || family.endsWith(`.${wildcardSuffix}`);
  });
}
function hasCodeOwnedPluginSurface(surfaceId, registry) {
  return registry.resolveRoute("provider-api", surfaceId) !== undefined || registry.resolveRoute("local-cli", surfaceId) !== undefined || registry.resolveSessionRoute(surfaceId) !== undefined;
}
function mediaTypeKinds(mediaType) {
  if (mediaType === "image/gif")
    return ["image", "gif"];
  if (mediaType === "image/*" || mediaType.startsWith("image/"))
    return ["image"];
  if (mediaType === "video/*" || mediaType.startsWith("video/"))
    return ["video"];
  if (mediaType === "audio/*" || mediaType.startsWith("audio/"))
    return ["audio"];
  return ["document"];
}
function validatePlatformCompositionSchema(surfaceId, operationId, operation, path, issues) {
  const compositionName = operationCompositions[operationId];
  if (compositionName === undefined)
    return;
  const surface = socialPlatformCatalog[surfaceId];
  const policy = surface.compositions[compositionName];
  if (policy === undefined) {
    issues.push(`${path} has no reviewed ${compositionName} composition policy on ${surfaceId}`);
    return;
  }
  const required = new Set(operation.input.required);
  for (const text of policy.text) {
    const field2 = operation.input.properties[text.name];
    if (field2 === undefined) {
      if (text.required)
        issues.push(`${path}.input.properties.${text.name} is required by the reviewed ${surfaceId} ${compositionName} policy`);
      continue;
    }
    if (field2.type !== "string") {
      issues.push(`${path}.input.properties.${text.name} must be a string under the reviewed composition policy`);
      continue;
    }
    if (field2.maxLength === undefined || field2.maxLength > text.safeMaxUnits) {
      issues.push(`${path}.input.properties.${text.name}.maxLength must be at most ${text.safeMaxUnits}`);
    }
    if (text.format === "currency-code" && (field2.minLength !== 3 || field2.maxLength !== 3)) {
      issues.push(`${path}.input.properties.${text.name} must allow exactly one three-letter currency code`);
    }
    if (text.required && (field2.minLength === undefined || field2.minLength < 1)) {
      issues.push(`${path}.input.properties.${text.name}.minLength must be at least 1`);
    }
    if (text.format === "provider-option" && (field2.enum === undefined || field2.enum.length < 1 || field2.enum.some((value) => typeof value !== "string"))) {
      issues.push(`${path}.input.properties.${text.name}.enum must declare the adapter's reviewed provider options`);
    }
    if (text.required && !required.has(text.name)) {
      issues.push(`${path}.input.required must include ${text.name}`);
    }
  }
  const attachmentPolicy = policy.attachments;
  if (attachmentPolicy.state === "none") {
    if (Object.values(operation.input.properties).some((field2) => field2.type === "file" || field2.type === "array" && field2.items.type === "file")) {
      issues.push(`${path}.input cannot declare file attachments for ${surfaceId} ${compositionName}`);
    }
    return;
  }
  let maximumFiles = 0;
  let minimumRequiredFiles = 0;
  for (const [name, field2] of Object.entries(operation.input.properties)) {
    let file;
    if (field2.type === "file")
      file = field2;
    else if (field2.type === "array" && field2.items.type === "file")
      file = field2.items;
    else
      continue;
    maximumFiles += field2.type === "file" ? 1 : field2.maxItems;
    if (required.has(name))
      minimumRequiredFiles += field2.type === "file" ? 1 : field2.minItems;
    if (file.mediaTypes === undefined) {
      issues.push(`${path}.input.properties.${name} must declare mediaTypes under a platform attachment policy`);
      continue;
    }
    for (const mediaType of file.mediaTypes) {
      if (!mediaTypeKinds(mediaType).some((kind) => attachmentPolicy.kinds.includes(kind))) {
        issues.push(`${path}.input.properties.${name}.mediaTypes includes ${mediaType}, outside the reviewed attachment kinds`);
      }
    }
  }
  if (maximumFiles > attachmentPolicy.maxItems) {
    issues.push(`${path}.input can accept at most ${attachmentPolicy.maxItems} binary attachment(s)`);
  }
  if (minimumRequiredFiles < attachmentPolicy.minItems) {
    issues.push(`${path}.input must require at least ${attachmentPolicy.minItems} binary attachment(s)`);
  }
}
function threadTextPolicy(surfaceId) {
  const surface = socialPlatformCatalog[surfaceId];
  if (surface.threads.publish.state !== "adapter-eligible")
    return null;
  const root = surface.compositions.post?.text.find((field2) => field2.name === "body");
  const continuation = surface.compositions.reply?.text.find((field2) => field2.name === "body");
  if (root === undefined || continuation === undefined || root.measurement !== continuation.measurement)
    return null;
  return {
    maxItems: surface.threads.publish.safeMaxItems,
    maxWeightedLength: Math.min(root.safeMaxUnits, continuation.safeMaxUnits),
    measurement: root.measurement
  };
}
function validatePlatformThreadSchema(surfaceId, operation, path, issues) {
  const policy = threadTextPolicy(surfaceId);
  if (policy === null) {
    issues.push(`${path} has no internally consistent reviewed thread composition policy`);
    return;
  }
  const items = operation.input.properties.items;
  if (items?.type !== "array" || items.items.type !== "string") {
    issues.push(`${path}.input.properties.items must be an array of thread text strings`);
    return;
  }
  if (!operation.input.required.includes("items") || items.minItems < 1 || items.maxItems > policy.maxItems) {
    issues.push(`${path}.input.items must be required with 1-${policy.maxItems} items`);
  }
  if (items.items.minLength === undefined || items.items.minLength < 1 || items.items.maxLength === undefined || items.items.maxLength > policy.maxWeightedLength) {
    issues.push(`${path}.input.properties.items.items must use length bounds 1-${policy.maxWeightedLength}`);
  }
}
function validateGenericThreadSchema(operation, path, issues) {
  const items = operation.input.properties.items;
  if (items?.type !== "array" || items.items.type !== "string") {
    issues.push(`${path}.input.properties.items must be an array of thread text strings`);
    return;
  }
  if (!operation.input.required.includes("items") || items.minItems < 1 || items.maxItems > 25) {
    issues.push(`${path}.input.items must be required with 1-25 items`);
  }
  if (items.items.minLength === undefined || items.items.minLength < 1 || items.items.maxLength === undefined) {
    issues.push(`${path}.input.properties.items.items must declare non-empty bounded strings`);
  }
}
var isRecord2 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
function isPlatformSurfaceId(value) {
  return platformSurfaceIds.includes(value);
}
function hasUnpairedSurrogate2(value) {
  for (let index = 0;index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 55296 && code <= 56319) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 56320 && next <= 57343))
        return true;
      index += 1;
    } else if (code >= 56320 && code <= 57343)
      return true;
  }
  return false;
}
function exactKeys2(value, keys, path, issues) {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key))
      issues.push(`${path}.${key} is not supported`);
  }
}
function boundedString(value, path, issues, minimum = 1, maximum = 4096) {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum) {
    issues.push(`${path} must be a ${minimum}-${maximum} character string without control characters`);
    return null;
  }
  for (let index = 0;index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) {
      issues.push(`${path} must be a ${minimum}-${maximum} character string without control characters`);
      return null;
    }
  }
  if (hasUnpairedSurrogate2(value)) {
    issues.push(`${path} must contain well-formed Unicode`);
    return null;
  }
  return value;
}
function safeInteger2(value, path, minimum, maximum, issues) {
  if (!Number.isSafeInteger(value) || typeof value !== "number" || value < minimum || value > maximum) {
    issues.push(`${path} must be an integer between ${minimum} and ${maximum}`);
    return null;
  }
  return value;
}
function hasAmbiguousPathSyntax(value) {
  return value.includes("\\") || /%(?:25|2e|2f|5c)/iu.test(value) || value.split("/").some((segment) => segment === "." || segment === "..");
}
function matchesUrlPathPrefix(pathname, prefix) {
  return prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(`${prefix}/`);
}
function rawUrlPath(value) {
  const authority = value.indexOf("://");
  const start = authority < 0 ? 0 : value.indexOf("/", authority + 3);
  if (start < 0)
    return "/";
  const end = value.search(/[?#]/u);
  return value.slice(start, end >= start ? end : undefined);
}
function parseField(value, path, issues, maximumArrayItems, nested = false) {
  if (!isRecord2(value)) {
    issues.push(`${path} must be an object`);
    return null;
  }
  if (value.type === "file") {
    exactKeys2(value, ["type", "description", "maxBytes", "mediaTypes"], path, issues);
    const description2 = boundedString(value.description, `${path}.description`, issues, 1, 500);
    const maxBytes = safeInteger2(value.maxBytes, `${path}.maxBytes`, 1, 1024 * 1024 * 1024, issues);
    let mediaTypes;
    if (value.mediaTypes !== undefined) {
      if (!Array.isArray(value.mediaTypes) || value.mediaTypes.length < 1 || value.mediaTypes.length > 32 || value.mediaTypes.some((candidate) => typeof candidate !== "string" || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+*-]+$/u.test(candidate))) {
        issues.push(`${path}.mediaTypes must contain 1-32 valid media types`);
      } else
        mediaTypes = [...new Set(value.mediaTypes)];
    }
    if (description2 === null || maxBytes === null)
      return null;
    return { type: "file", description: description2, maxBytes, ...mediaTypes === undefined ? {} : { mediaTypes } };
  }
  if (value.type === "array") {
    exactKeys2(value, ["type", "description", "items", "minItems", "maxItems"], path, issues);
    const description2 = boundedString(value.description, `${path}.description`, issues, 1, 500);
    const minItems = safeInteger2(value.minItems, `${path}.minItems`, 0, maximumArrayItems, issues);
    const maxItems = safeInteger2(value.maxItems, `${path}.maxItems`, 1, maximumArrayItems, issues);
    if (nested)
      issues.push(`${path} cannot contain a nested array`);
    const items = nested ? null : parseField(value.items, `${path}.items`, issues, maximumArrayItems, true);
    if (items?.type === "array")
      issues.push(`${path}.items cannot be an array`);
    if (minItems !== null && maxItems !== null && minItems > maxItems) {
      issues.push(`${path}.minItems cannot exceed maxItems`);
    }
    if (description2 === null || minItems === null || maxItems === null || items === null || items.type === "array")
      return null;
    return { type: "array", description: description2, items, minItems, maxItems };
  }
  exactKeys2(value, ["type", "description", "minLength", "maxLength", "minimum", "maximum", "enum", "format", "urlPathPrefixes"], path, issues);
  const type = value.type;
  if (type !== "string" && type !== "boolean" && type !== "number") {
    issues.push(`${path}.type must be string, boolean, number, file, or array`);
    return null;
  }
  const description = boundedString(value.description, `${path}.description`, issues, 1, 500);
  if (description === null)
    return null;
  const minLength = value.minLength === undefined ? undefined : safeInteger2(value.minLength, `${path}.minLength`, 0, 1e6, issues) ?? undefined;
  const maxLength = value.maxLength === undefined ? undefined : safeInteger2(value.maxLength, `${path}.maxLength`, 1, 1e6, issues) ?? undefined;
  const minimum = value.minimum;
  const maximum = value.maximum;
  if (minimum !== undefined && (typeof minimum !== "number" || !Number.isFinite(minimum))) {
    issues.push(`${path}.minimum must be a finite number`);
  }
  if (maximum !== undefined && (typeof maximum !== "number" || !Number.isFinite(maximum))) {
    issues.push(`${path}.maximum must be a finite number`);
  }
  if (minLength !== undefined && maxLength !== undefined && minLength > maxLength) {
    issues.push(`${path}.minLength cannot exceed maxLength`);
  }
  if (typeof minimum === "number" && typeof maximum === "number" && minimum > maximum) {
    issues.push(`${path}.minimum cannot exceed maximum`);
  }
  let enumValues;
  if (value.enum !== undefined) {
    if (!Array.isArray(value.enum) || value.enum.length < 1 || value.enum.length > 256 || value.enum.some((candidate) => typeof candidate !== type)) {
      issues.push(`${path}.enum must contain 1-256 values matching the field type`);
    } else {
      enumValues = value.enum;
    }
  }
  const format = value.format;
  if (format !== undefined && (format !== "url" && format !== "path-segment" || type !== "string")) {
    issues.push(`${path}.format supports url or path-segment on string fields`);
  }
  let urlPathPrefixes;
  if (value.urlPathPrefixes !== undefined) {
    if (format !== "url" || type !== "string" || !Array.isArray(value.urlPathPrefixes) || value.urlPathPrefixes.length < 1 || value.urlPathPrefixes.length > 20) {
      issues.push(`${path}.urlPathPrefixes requires a url string field and 1-20 origin-relative prefixes`);
    } else {
      const parsed = [];
      for (const [index, candidate] of value.urlPathPrefixes.entries()) {
        const prefix = boundedString(candidate, `${path}.urlPathPrefixes[${index}]`, issues, 1, 2048);
        if (prefix === null || !prefix.startsWith("/") || prefix.startsWith("//") || hasAmbiguousPathSyntax(prefix) || prefix.includes("?") || prefix.includes("#")) {
          issues.push(`${path}.urlPathPrefixes[${index}] must be an origin-relative path prefix`);
        } else if (!parsed.includes(prefix))
          parsed.push(prefix);
      }
      if (parsed.length > 0)
        urlPathPrefixes = parsed;
    }
  }
  return {
    type,
    description,
    ...minLength === undefined ? {} : { minLength },
    ...maxLength === undefined ? {} : { maxLength },
    ...typeof minimum !== "number" ? {} : { minimum },
    ...typeof maximum !== "number" ? {} : { maximum },
    ...enumValues === undefined ? {} : { enum: enumValues },
    ...format !== "url" && format !== "path-segment" ? {} : { format },
    ...urlPathPrefixes === undefined ? {} : { urlPathPrefixes }
  };
}
function parseInputSchema(value, path, issues, maximumArrayItems) {
  if (!isRecord2(value)) {
    issues.push(`${path} must be an object`);
    return null;
  }
  exactKeys2(value, ["properties", "required"], path, issues);
  if (!isRecord2(value.properties) || Object.keys(value.properties).length > 100) {
    issues.push(`${path}.properties must be an object with at most 100 fields`);
    return null;
  }
  const properties = {};
  for (const [name, field2] of Object.entries(value.properties)) {
    if (!/^[a-z][a-z0-9_]{0,63}$/u.test(name)) {
      issues.push(`${path}.properties.${name} has an invalid field name`);
      continue;
    }
    const parsed = parseField(field2, `${path}.properties.${name}`, issues, maximumArrayItems);
    if (parsed !== null)
      properties[name] = parsed;
  }
  if (!Array.isArray(value.required) || value.required.length > 100 || value.required.some((name) => typeof name !== "string")) {
    issues.push(`${path}.required must be an array of at most 100 field names`);
    return null;
  }
  const required = [...new Set(value.required)];
  for (const name of required) {
    if (!(name in properties))
      issues.push(`${path}.required references unknown field ${name}`);
  }
  return { properties, required };
}
function parseLocator(value, path, issues) {
  if (!isRecord2(value)) {
    issues.push(`${path} must be an object`);
    return null;
  }
  exactKeys2(value, ["by", "value", "name", "exact"], path, issues);
  const by = value.by;
  const supported = ["role", "text", "label", "placeholder", "alt", "title", "testid"];
  if (typeof by !== "string" || !supported.includes(by)) {
    issues.push(`${path}.by must be a supported semantic locator`);
    return null;
  }
  const locatorValue = boundedString(value.value, `${path}.value`, issues, 1, 1000);
  if (locatorValue === null)
    return null;
  if (value.exact !== undefined && typeof value.exact !== "boolean")
    issues.push(`${path}.exact must be boolean`);
  if (by === "role") {
    const name = value.name === undefined ? undefined : boundedString(value.name, `${path}.name`, issues, 1, 1000) ?? undefined;
    return { by, value: locatorValue, ...name === undefined ? {} : { name }, ...value.exact === true ? { exact: true } : {} };
  }
  if (value.name !== undefined)
    issues.push(`${path}.name is valid only for role locators`);
  if (by === "text" || by === "label" || by === "placeholder" || by === "alt" || by === "title" || by === "testid") {
    return { by, value: locatorValue, ...value.exact === true ? { exact: true } : {} };
  }
  return null;
}
function exactReferenceLocator(value, path, issues, requiredRole) {
  const locator = parseLocator(value, path, issues);
  if (locator === null || locator.by !== "role" || locator.name === undefined || locator.exact !== true || requiredRole !== undefined && locator.value !== requiredRole) {
    issues.push(`${path} must be one exact named${requiredRole === undefined ? "" : ` ${requiredRole}`} role resolved from a semantic snapshot`);
    return null;
  }
  return { by: "role", value: locator.value, name: locator.name, exact: true };
}
function parseValueSource(value, path, fields, required, allowItem, issues) {
  if (!isRecord2(value)) {
    issues.push(`${path} must be { input: field }${allowItem ? " or { item: true }" : ""}`);
    return null;
  }
  if (Object.hasOwn(value, "input")) {
    exactKeys2(value, ["input"], path, issues);
    const input = boundedString(value.input, `${path}.input`, issues, 1, 64);
    if (input === null || !(input in fields)) {
      issues.push(`${path}.input must name a declared input field`);
      return null;
    }
    if (!required.has(input))
      issues.push(`${path}.input must name a required input field`);
    return { input };
  }
  exactKeys2(value, ["item"], path, issues);
  if (!allowItem || value.item !== true) {
    issues.push(`${path} may reference the current item only inside for-each`);
    return null;
  }
  return { item: true };
}
function parseEffect(value, path, issues) {
  if (!isRecord2(value)) {
    issues.push(`${path} must be an explicit prepare or dispatch effect`);
    return null;
  }
  if (value.kind === "prepare") {
    exactKeys2(value, ["kind", "description"], path, issues);
    const description = boundedString(value.description, `${path}.description`, issues, 1, 500);
    return description === null ? null : { kind: "prepare", description };
  }
  if (value.kind === "dispatch") {
    exactKeys2(value, ["kind", "id", "description"], path, issues);
    const id = boundedString(value.id, `${path}.id`, issues, 1, 64);
    if (id !== null && !/^[a-z][a-z0-9-]*$/u.test(id))
      issues.push(`${path}.id must be lowercase kebab-case`);
    const description = boundedString(value.description, `${path}.description`, issues, 1, 500);
    return id === null || description === null ? null : { kind: "dispatch", id, description };
  }
  issues.push(`${path}.kind must be prepare or dispatch`);
  return null;
}
function validateTemplate(value, path, fields, required, issues, allowItem = false) {
  const seen = new Set;
  for (const match of value.matchAll(/\$\{input\.([a-z][a-z0-9_]*)\}/gu)) {
    const key = match[1];
    if (key !== undefined)
      seen.add(key);
  }
  const stripped = value.replace(/\$\{input\.[a-z][a-z0-9_]*\}/gu, "").replace(/\$\{item\}/gu, "");
  if (stripped.includes("${"))
    issues.push(`${path} contains a malformed input placeholder`);
  const itemPlaceholder = "$" + "{item}";
  if (!allowItem && value.includes(itemPlaceholder))
    issues.push(`${path} may use ${itemPlaceholder} only inside for-each`);
  for (const key of seen) {
    if (!(key in fields))
      issues.push(`${path} references unknown input.${key}`);
    else if (!required.has(key))
      issues.push(`${path} references optional input.${key}; recipe-bound inputs must be required`);
    else if (fields[key]?.type === "file" || fields[key]?.type === "array") {
      issues.push(`${path} may interpolate only a scalar input.${key}`);
    }
  }
}
function parseStep(value, path, fields, required, issues, schemaVersion, allowItem = false, depth = 0, itemField) {
  if (!isRecord2(value)) {
    issues.push(`${path} must be an object`);
    return null;
  }
  const kind = value.kind;
  if (typeof kind !== "string") {
    issues.push(`${path}.kind must be a string`);
    return null;
  }
  if (kind === "navigate") {
    exactKeys2(value, ["kind", "path", "query"], path, issues);
    const targetPath = boundedString(value.path, `${path}.path`, issues, 1, 4096);
    if (targetPath === null || !targetPath.startsWith("/") || targetPath.startsWith("//") || hasAmbiguousPathSyntax(targetPath)) {
      issues.push(`${path}.path must be an origin-relative path`);
      return null;
    }
    validateTemplate(targetPath, `${path}.path`, fields, required, issues, allowItem && itemField?.type !== "file");
    for (const match of targetPath.matchAll(/\$\{input\.([a-z][a-z0-9_]*)\}/gu)) {
      const key = match[1];
      const field2 = key === undefined ? undefined : fields[key];
      if (key !== undefined && (field2?.type !== "string" || field2.format !== "path-segment")) {
        issues.push(`${path}.path input.${key} must declare format path-segment`);
      }
    }
    if (targetPath.includes("$" + "{item}") && (itemField?.type !== "string" || itemField.format !== "path-segment")) {
      issues.push(`${path}.path item must declare string format path-segment`);
    }
    let query;
    if (value.query !== undefined) {
      if (!isRecord2(value.query) || Object.keys(value.query).length > 50) {
        issues.push(`${path}.query must be an object with at most 50 entries`);
      } else {
        query = {};
        for (const [key, input] of Object.entries(value.query)) {
          if (!/^[A-Za-z0-9_.~-]{1,128}$/u.test(key) || typeof input !== "string" || !(input in fields)) {
            issues.push(`${path}.query.${key} must name a declared input field`);
          } else if (!required.has(input)) {
            issues.push(`${path}.query.${key} must name a required input field`);
          } else if (fields[input]?.type === "file" || fields[input]?.type === "array") {
            issues.push(`${path}.query.${key} must name a scalar input field`);
          } else
            query[key] = input;
        }
      }
    }
    return { kind, path: targetPath, ...query === undefined ? {} : { query } };
  }
  if (kind === "navigate-input") {
    exactKeys2(value, ["kind", "input"], path, issues);
    const input = boundedString(value.input, `${path}.input`, issues, 1, 64);
    const field2 = input === null ? undefined : fields[input];
    if (input === null || field2?.type !== "string" || field2.format !== "url" || !required.has(input)) {
      issues.push(`${path}.input must name a required declared url field`);
      return null;
    }
    return { kind, input };
  }
  if (kind === "find") {
    exactKeys2(value, schemaVersion === 1 ? ["kind", "locator", "action", "with", "dispatch"] : ["kind", "locator", "action", "with", "effect"], path, issues);
    const locator = parseLocator(value.locator, `${path}.locator`, issues);
    const action = value.action;
    const actions = schemaVersion === 1 ? ["click", "fill", "type", "hover"] : ["click", "fill", "type", "hover", "upload", "select", "check", "uncheck"];
    if (typeof action !== "string" || !actions.includes(action)) {
      issues.push(`${path}.action must be ${actions.join(", ")}`);
      return null;
    }
    const needsValue = action === "fill" || action === "type" || action === "upload" || action === "select";
    let withValue;
    if (needsValue) {
      if (schemaVersion === 1) {
        if (typeof value.with !== "string" || !(value.with in fields)) {
          issues.push(`${path}.with must name a declared input for ${action}`);
          return null;
        }
        if (!required.has(value.with))
          issues.push(`${path}.with must name a required input`);
        withValue = value.with;
      } else {
        const parsed = parseValueSource(value.with, `${path}.with`, fields, required, allowItem, issues);
        if (parsed === null)
          return null;
        withValue = parsed;
        const field2 = "input" in parsed ? fields[parsed.input] : itemField;
        const isFileSource = field2?.type === "file" || field2?.type === "array" && field2.items.type === "file";
        const isArraySource = field2?.type === "array";
        if (action === "upload" && !isFileSource) {
          issues.push(`${path}.with must reference a file or file array input for upload`);
        }
        if (action !== "upload" && isFileSource) {
          issues.push(`${path}.with cannot expose a file input to ${action}`);
        }
        if ((action === "fill" || action === "type") && isArraySource) {
          issues.push(`${path}.with must reference one scalar input for ${action}`);
        }
      }
    } else if (value.with !== undefined)
      issues.push(`${path}.with is valid only for fill, type, upload, or select`);
    let effect;
    if (schemaVersion === 2) {
      effect = parseEffect(value.effect, `${path}.effect`, issues) ?? undefined;
      if (value.dispatch !== undefined)
        issues.push(`${path}.dispatch is v1-only; use an explicit effect`);
      if (action === "upload" && effect?.kind !== "dispatch") {
        issues.push(`${path}.effect must mark upload as dispatch because selecting a file may transfer bytes immediately`);
      }
    } else {
      if (value.dispatch !== undefined && typeof value.dispatch !== "boolean")
        issues.push(`${path}.dispatch must be boolean`);
      if (value.dispatch === true && action !== "click")
        issues.push(`${path}.dispatch is valid only for click; use a marked press step for keyboard dispatch`);
    }
    if (action === "upload" || action === "select" || action === "check" || action === "uncheck") {
      const exact = exactReferenceLocator(value.locator, `${path}.locator`, issues);
      if (exact === null)
        return null;
    }
    if (locator === null)
      return null;
    validateTemplate(locator.value, `${path}.locator.value`, fields, required, issues, allowItem && itemField?.type !== "file");
    if (locator.by === "role" && locator.name !== undefined) {
      validateTemplate(locator.name, `${path}.locator.name`, fields, required, issues, allowItem && itemField?.type !== "file");
    }
    return {
      kind,
      locator,
      action,
      ...withValue === undefined ? {} : { with: withValue },
      ...effect === undefined ? {} : { effect },
      ...schemaVersion === 1 && value.dispatch === true ? { dispatch: true } : {}
    };
  }
  if (kind === "press") {
    exactKeys2(value, schemaVersion === 1 ? ["kind", "key", "dispatch"] : ["kind", "key", "effect"], path, issues);
    const key = boundedString(value.key, `${path}.key`, issues, 1, 100);
    if (schemaVersion === 1) {
      if (value.dispatch !== undefined && typeof value.dispatch !== "boolean")
        issues.push(`${path}.dispatch must be boolean`);
      return key === null ? null : { kind, key, ...value.dispatch === true ? { dispatch: true } : {} };
    }
    const effect = parseEffect(value.effect, `${path}.effect`, issues);
    return key === null || effect === null ? null : { kind, key, effect };
  }
  if (kind === "wait") {
    exactKeys2(value, ["kind", "milliseconds"], path, issues);
    const milliseconds = safeInteger2(value.milliseconds, `${path}.milliseconds`, 1, 30000, issues);
    return milliseconds === null ? null : { kind, milliseconds };
  }
  if (kind === "wait-text" || kind === "assert-text") {
    exactKeys2(value, ["kind", "text"], path, issues);
    const text = boundedString(value.text, `${path}.text`, issues, 1, 2000);
    if (text !== null)
      validateTemplate(text, `${path}.text`, fields, required, issues, allowItem && itemField?.type !== "file");
    return text === null ? null : { kind, text };
  }
  if (kind === "assert-url") {
    exactKeys2(value, ["kind", "pattern"], path, issues);
    const pattern = boundedString(value.pattern, `${path}.pattern`, issues, 1, 2000);
    if (pattern !== null)
      validateTemplate(pattern, `${path}.pattern`, fields, required, issues, allowItem && itemField?.type !== "file");
    return pattern === null ? null : { kind, pattern };
  }
  if (kind === "assert-input-empty") {
    exactKeys2(value, ["kind", "locator"], path, issues);
    const locator = exactReferenceLocator(value.locator, `${path}.locator`, issues, "textbox");
    if (locator === null)
      return null;
    validateTemplate(locator.name, `${path}.locator.name`, fields, required, issues, allowItem && itemField?.type !== "file");
    return { kind, locator: { ...locator, value: "textbox" } };
  }
  if (kind === "assert-value") {
    if (schemaVersion === 1) {
      issues.push(`${path}.kind is supported only in schemaVersion 2`);
      return null;
    }
    exactKeys2(value, ["kind", "locator", "equals"], path, issues);
    const locator = exactReferenceLocator(value.locator, `${path}.locator`, issues);
    const equals = parseValueSource(value.equals, `${path}.equals`, fields, required, allowItem, issues);
    if (locator === null || equals === null)
      return null;
    const expectedField = "input" in equals ? fields[equals.input] : itemField;
    if (expectedField?.type === "file" || expectedField?.type === "array") {
      issues.push(`${path}.equals must reference one scalar value`);
    }
    validateTemplate(locator.name, `${path}.locator.name`, fields, required, issues, allowItem && itemField?.type !== "file");
    return { kind, locator, equals };
  }
  if (kind === "assert-checked") {
    if (schemaVersion === 1) {
      issues.push(`${path}.kind is supported only in schemaVersion 2`);
      return null;
    }
    exactKeys2(value, ["kind", "locator", "checked"], path, issues);
    const locator = exactReferenceLocator(value.locator, `${path}.locator`, issues);
    if (typeof value.checked !== "boolean")
      issues.push(`${path}.checked must be boolean`);
    if (locator === null || typeof value.checked !== "boolean")
      return null;
    validateTemplate(locator.name, `${path}.locator.name`, fields, required, issues, allowItem && itemField?.type !== "file");
    return { kind, locator, checked: value.checked };
  }
  if (kind === "verify-dispatch") {
    if (schemaVersion === 1) {
      issues.push(`${path}.kind is supported only in schemaVersion 2`);
      return null;
    }
    exactKeys2(value, ["kind", "dispatch", "assertions"], path, issues);
    const dispatch = boundedString(value.dispatch, `${path}.dispatch`, issues, 1, 64);
    if (dispatch !== null && !/^[a-z][a-z0-9-]*$/u.test(dispatch))
      issues.push(`${path}.dispatch must be lowercase kebab-case`);
    const assertions = [];
    if (!Array.isArray(value.assertions) || value.assertions.length < 1 || value.assertions.length > 10) {
      issues.push(`${path}.assertions must contain 1-10 bounded observations`);
    } else {
      value.assertions.forEach((assertion, index) => {
        const parsed = parseStep(assertion, `${path}.assertions[${index}]`, fields, required, issues, 2, allowItem, depth + 1, itemField);
        if (parsed !== null && (parsed.kind === "assert-text" || parsed.kind === "assert-url" || parsed.kind === "assert-input-empty" || parsed.kind === "assert-value" || parsed.kind === "assert-checked"))
          assertions.push(parsed);
        else if (parsed !== null)
          issues.push(`${path}.assertions[${index}] must be an assertion`);
      });
    }
    return dispatch === null || assertions.length === 0 ? null : { kind, dispatch, assertions };
  }
  if (kind === "for-each") {
    if (schemaVersion === 1) {
      issues.push(`${path}.kind is supported only in schemaVersion 2`);
      return null;
    }
    exactKeys2(value, ["kind", "input", "steps", "between"], path, issues);
    const input = boundedString(value.input, `${path}.input`, issues, 1, 64);
    const field2 = input === null ? undefined : fields[input];
    if (input === null || field2?.type !== "array" || !required.has(input)) {
      issues.push(`${path}.input must name a required bounded array input`);
    }
    if (depth > 0)
      issues.push(`${path} cannot nest for-each`);
    const steps = [];
    if (!Array.isArray(value.steps) || value.steps.length < 1 || value.steps.length > 50) {
      issues.push(`${path}.steps must contain 1-50 steps`);
    } else {
      value.steps.forEach((step, index) => {
        const parsed = parseStep(step, `${path}.steps[${index}]`, fields, required, issues, 2, true, depth + 1, field2?.type === "array" ? field2.items : undefined);
        if (parsed !== null)
          steps.push(parsed);
      });
    }
    let between;
    if (value.between !== undefined) {
      if (!Array.isArray(value.between) || value.between.length > 20) {
        issues.push(`${path}.between must contain at most 20 steps`);
      } else {
        between = [];
        value.between.forEach((step, index) => {
          const parsed = parseStep(step, `${path}.between[${index}]`, fields, required, issues, 2, true, depth + 1, field2?.type === "array" ? field2.items : undefined);
          if (parsed !== null)
            between?.push(parsed);
        });
      }
    }
    if (input === null || field2?.type !== "array" || steps.length === 0)
      return null;
    return { kind, input, steps, ...between === undefined ? {} : { between } };
  }
  if (kind === "snapshot") {
    exactKeys2(value, ["kind", "interactive"], path, issues);
    if (value.interactive !== undefined && typeof value.interactive !== "boolean") {
      issues.push(`${path}.interactive must be boolean`);
    }
    return { kind, ...value.interactive === true ? { interactive: true } : {} };
  }
  if (kind === "read") {
    exactKeys2(value, ["kind"], path, issues);
    return { kind };
  }
  issues.push(`${path}.kind is not supported`);
  return null;
}
function dispatchEffect(step) {
  return (step.kind === "find" || step.kind === "press") && step.effect?.kind === "dispatch" ? step.effect : null;
}
function validateV2Flow(steps, path, fields, issues, seenIds) {
  let openDispatch = null;
  let maximumDispatches = 0;
  for (const [index, step] of steps.entries()) {
    const stepPath = `${path}[${index}]`;
    if (step.kind === "for-each") {
      if (openDispatch !== null)
        issues.push(`${stepPath} cannot begin before dispatch ${openDispatch} is verified`);
      const innerIds = new Set;
      const innerCount = validateV2Flow(step.steps, `${stepPath}.steps`, fields, issues, innerIds);
      const field2 = fields[step.input];
      const repetitions = field2?.type === "array" ? field2.maxItems : 0;
      maximumDispatches += innerCount * repetitions;
      for (const id of innerIds) {
        if (seenIds.has(id))
          issues.push(`${stepPath} reuses dispatch id ${id}`);
        seenIds.add(id);
      }
      if (step.between !== undefined) {
        const betweenIds = new Set;
        const betweenCount = validateV2Flow(step.between, `${stepPath}.between`, fields, issues, betweenIds);
        if (betweenCount > 0)
          issues.push(`${stepPath}.between cannot dispatch; place dispatches in the repeated steps`);
      }
      continue;
    }
    const dispatch = dispatchEffect(step);
    if (dispatch !== null) {
      if (openDispatch !== null)
        issues.push(`${stepPath} cannot start dispatch ${dispatch.id} before ${openDispatch} is verified`);
      if (seenIds.has(dispatch.id))
        issues.push(`${stepPath} reuses dispatch id ${dispatch.id}`);
      seenIds.add(dispatch.id);
      openDispatch = dispatch.id;
      maximumDispatches += 1;
      continue;
    }
    if (step.kind === "verify-dispatch") {
      if (openDispatch === null)
        issues.push(`${stepPath} verifies ${step.dispatch} without a started dispatch`);
      else if (step.dispatch !== openDispatch)
        issues.push(`${stepPath} must verify active dispatch ${openDispatch}`);
      else
        openDispatch = null;
      continue;
    }
    if (openDispatch !== null && (step.kind === "find" || step.kind === "press" || step.kind === "navigate" || step.kind === "navigate-input"))
      issues.push(`${stepPath} cannot interact before dispatch ${openDispatch} is verified`);
    if (openDispatch !== null && (step.kind === "assert-text" || step.kind === "assert-url" || step.kind === "assert-input-empty" || step.kind === "assert-value" || step.kind === "assert-checked"))
      issues.push(`${stepPath} must be nested in verify-dispatch in schemaVersion 2`);
  }
  if (openDispatch !== null)
    issues.push(`${path} leaves dispatch ${openDispatch} without a verify-dispatch group`);
  return maximumDispatches;
}
function maximumExpandedStepCount(steps, fields) {
  let total = 0;
  for (const step of steps) {
    if (step.kind !== "for-each") {
      total += 1;
      continue;
    }
    const field2 = fields[step.input];
    const repetitions = field2?.type === "array" ? field2.maxItems : 0;
    total += repetitions * maximumExpandedStepCount(step.steps, fields);
    total += Math.max(0, repetitions - 1) * maximumExpandedStepCount(step.between ?? [], fields);
  }
  return total;
}
function minimumExpandedDispatchCount(steps, fields) {
  let total = 0;
  for (const step of steps) {
    if (step.kind === "for-each") {
      const field2 = fields[step.input];
      const repetitions = field2?.type === "array" ? field2.minItems : 0;
      total += repetitions * minimumExpandedDispatchCount(step.steps, fields);
      continue;
    }
    if (dispatchEffect(step) !== null)
      total += 1;
  }
  return total;
}
function containsInteraction(steps) {
  return steps.some((step) => step.kind === "press" || step.kind === "find" || step.kind === "for-each" && (containsInteraction(step.steps) || containsInteraction(step.between ?? [])));
}
function parseOperation(value, path, issues, schemaVersion, allowedOrigins) {
  if (!isRecord2(value)) {
    issues.push(`${path} must be an object`);
    return null;
  }
  exactKeys2(value, [
    "description",
    "risk",
    "sideEffect",
    "idempotency",
    "dedupeWindowMs",
    "input",
    "browser",
    ...schemaVersion === 3 ? ["provider"] : [],
    ...schemaVersion === 4 ? ["webSession"] : [],
    ...schemaVersion === 5 ? ["reviewedTemplate"] : [],
    ...schemaVersion === 6 ? ["localCli"] : []
  ], path, issues);
  const description = boundedString(value.description, `${path}.description`, issues, 1, 500);
  const sideEffect = boundedString(value.sideEffect, `${path}.sideEffect`, issues, 1, 500);
  const risk = value.risk;
  if (typeof risk !== "string" || !operationRisks.includes(risk))
    issues.push(`${path}.risk must be R1, R2, R3, or R4`);
  const idempotency = value.idempotency;
  if (typeof idempotency !== "string" || !idempotencyKinds.includes(idempotency)) {
    issues.push(`${path}.idempotency is not supported`);
  }
  const dedupeWindowMs = safeInteger2(value.dedupeWindowMs, `${path}.dedupeWindowMs`, 0, 30 * 24 * 60 * 60000, issues);
  const input = parseInputSchema(value.input, `${path}.input`, issues, schemaVersion === GHOSTGET_PROVIDER_MANIFEST_SCHEMA_VERSION && value.provider !== undefined || schemaVersion === GHOSTGET_LOCAL_CLI_MANIFEST_SCHEMA_VERSION && value.localCli !== undefined ? 100 : 25);
  if (schemaVersion === 1 && input !== null && Object.values(input.properties).some((field2) => field2.type === "file" || field2.type === "array")) {
    issues.push(`${path}.input file and array fields require schemaVersion 2`);
  }
  if (risk === "R1" && input !== null && Object.values(input.properties).some((field2) => field2.type === "file" || field2.type === "array" && field2.items.type === "file")) {
    issues.push(`${path}.input file fields require a confirmed R2/R3 upload workflow`);
  }
  if ((risk === "R2" || risk === "R3") && idempotency === "none") {
    issues.push(`${path} mutates remote state and must declare local-at-most-once dispatch`);
  }
  if ((risk === "R2" || risk === "R3") && (dedupeWindowMs === null || dedupeWindowMs < 60000)) {
    issues.push(`${path} mutates remote state and needs a dedupeWindowMs of at least 60000`);
  }
  if (risk === "R1" && dedupeWindowMs !== 0)
    issues.push(`${path} is R1 and must use dedupeWindowMs 0`);
  if (risk === "R1" && sideEffect !== "none")
    issues.push(`${path} is R1 and must declare sideEffect as none`);
  if (schemaVersion === 3 && value.browser !== undefined && value.provider !== undefined) {
    issues.push(`${path} must declare exactly one of browser or provider`);
  }
  if (schemaVersion === 3 && value.browser === undefined && value.provider === undefined) {
    issues.push(`${path} must declare exactly one of browser or provider`);
    return null;
  }
  if (schemaVersion === 4) {
    const transports = [value.browser, value.provider, value.webSession].filter((candidate) => candidate !== undefined);
    if (transports.length !== 1 || value.webSession === undefined) {
      issues.push(`${path} must declare exactly one webSession transport in schemaVersion 4`);
      return null;
    }
  }
  if (schemaVersion === 5) {
    const transports = [value.browser, value.provider, value.webSession, value.reviewedTemplate].filter((candidate) => candidate !== undefined);
    if (transports.length !== 1 || value.reviewedTemplate === undefined) {
      issues.push(`${path} must declare exactly one reviewedTemplate transport in schemaVersion 5`);
      return null;
    }
  }
  if (schemaVersion === 6) {
    const transports = [
      value.browser,
      value.provider,
      value.webSession,
      value.reviewedTemplate,
      value.localCli
    ].filter((candidate) => candidate !== undefined);
    if (transports.length !== 1 || value.localCli === undefined) {
      issues.push(`${path} must declare exactly one localCli transport in schemaVersion 6`);
      return null;
    }
  }
  if (schemaVersion === 3 && value.provider !== undefined) {
    if (!isRecord2(value.provider)) {
      issues.push(`${path}.provider must be an object`);
      return null;
    }
    exactKeys2(value.provider, ["provider", "action", "contractVersion", "timeoutMs", "maxOutputBytes"], `${path}.provider`, issues);
    const provider = value.provider.provider;
    if (!isProviderPluginSurfaceId(provider)) {
      issues.push(`${path}.provider.provider must be a bounded lowercase kebab-case provider surface ID`);
    }
    const action = value.provider.action;
    if (!isProviderPluginOperationName(action)) {
      issues.push(`${path}.provider.action must name a bounded dotted provider operation`);
    }
    const contractVersion = safeInteger2(value.provider.contractVersion, `${path}.provider.contractVersion`, 1, 1e6, issues);
    const timeoutMs2 = safeInteger2(value.provider.timeoutMs, `${path}.provider.timeoutMs`, 1000, 10 * 60000, issues);
    const maxOutputBytes2 = safeInteger2(value.provider.maxOutputBytes, `${path}.provider.maxOutputBytes`, 1024, 10 * 1024 * 1024, issues);
    if (description === null || sideEffect === null || typeof risk !== "string" || !operationRisks.includes(risk) || typeof idempotency !== "string" || !idempotencyKinds.includes(idempotency) || input === null || dedupeWindowMs === null || !isProviderPluginSurfaceId(provider) || !isProviderPluginOperationName(action) || contractVersion === null || timeoutMs2 === null || maxOutputBytes2 === null)
      return null;
    return {
      description,
      risk,
      sideEffect,
      idempotency,
      dedupeWindowMs,
      input,
      provider: {
        provider,
        action,
        contractVersion,
        timeoutMs: timeoutMs2,
        maxOutputBytes: maxOutputBytes2
      }
    };
  }
  if (schemaVersion === 4 && value.webSession !== undefined) {
    if (!isRecord2(value.webSession)) {
      issues.push(`${path}.webSession must be an object`);
      return null;
    }
    exactKeys2(value.webSession, ["site", "action", "contractVersion", "timeoutMs", "maxOutputBytes"], `${path}.webSession`, issues);
    const site = value.webSession.site;
    if (!isProviderPluginSurfaceId(site)) {
      issues.push(`${path}.webSession.site must be a bounded lowercase kebab-case provider surface ID`);
    }
    const action = value.webSession.action;
    if (!isProviderPluginOperationName(action)) {
      issues.push(`${path}.webSession.action must name a bounded dotted provider operation`);
    }
    const contractVersion = safeInteger2(value.webSession.contractVersion, `${path}.webSession.contractVersion`, 1, 1e6, issues);
    const timeoutMs2 = safeInteger2(value.webSession.timeoutMs, `${path}.webSession.timeoutMs`, 1000, 10 * 60000, issues);
    const maxOutputBytes2 = safeInteger2(value.webSession.maxOutputBytes, `${path}.webSession.maxOutputBytes`, 1024, 10 * 1024 * 1024, issues);
    if (description === null || sideEffect === null || typeof risk !== "string" || !operationRisks.includes(risk) || typeof idempotency !== "string" || !idempotencyKinds.includes(idempotency) || input === null || dedupeWindowMs === null || !isProviderPluginSurfaceId(site) || !isProviderPluginOperationName(action) || contractVersion === null || timeoutMs2 === null || maxOutputBytes2 === null)
      return null;
    return {
      description,
      risk,
      sideEffect,
      idempotency,
      dedupeWindowMs,
      input,
      webSession: {
        site,
        action,
        contractVersion,
        timeoutMs: timeoutMs2,
        maxOutputBytes: maxOutputBytes2
      }
    };
  }
  if (schemaVersion === 6 && value.localCli !== undefined) {
    if (!isRecord2(value.localCli)) {
      issues.push(`${path}.localCli must be an object`);
      return null;
    }
    exactKeys2(value.localCli, ["surface", "action", "contractVersion", "timeoutMs", "maxOutputBytes"], `${path}.localCli`, issues);
    const surface = value.localCli.surface;
    if (!isProviderPluginSurfaceId(surface)) {
      issues.push(`${path}.localCli.surface must be a bounded lowercase kebab-case provider surface ID`);
    }
    const action = value.localCli.action;
    if (!isProviderPluginOperationName(action)) {
      issues.push(`${path}.localCli.action must name a bounded dotted provider operation`);
    }
    const contractVersion = safeInteger2(value.localCli.contractVersion, `${path}.localCli.contractVersion`, 1, 1e6, issues);
    const timeoutMs2 = safeInteger2(value.localCli.timeoutMs, `${path}.localCli.timeoutMs`, 1000, 10 * 60000, issues);
    const maxOutputBytes2 = safeInteger2(value.localCli.maxOutputBytes, `${path}.localCli.maxOutputBytes`, 1024, 10 * 1024 * 1024, issues);
    if (description === null || sideEffect === null || typeof risk !== "string" || !operationRisks.includes(risk) || typeof idempotency !== "string" || !idempotencyKinds.includes(idempotency) || input === null || dedupeWindowMs === null || !isProviderPluginSurfaceId(surface) || !isProviderPluginOperationName(action) || contractVersion === null || timeoutMs2 === null || maxOutputBytes2 === null)
      return null;
    return {
      description,
      risk,
      sideEffect,
      idempotency,
      dedupeWindowMs,
      input,
      localCli: {
        surface,
        action,
        contractVersion,
        timeoutMs: timeoutMs2,
        maxOutputBytes: maxOutputBytes2
      }
    };
  }
  if (schemaVersion === 5 && value.reviewedTemplate !== undefined) {
    if (!isRecord2(value.reviewedTemplate)) {
      issues.push(`${path}.reviewedTemplate must be an object`);
      return null;
    }
    const state = value.reviewedTemplate.state;
    const contractVersion = value.reviewedTemplate.contractVersion;
    if (contractVersion !== 1)
      issues.push(`${path}.reviewedTemplate.contractVersion must be 1`);
    if (state === "capture-required") {
      exactKeys2(value.reviewedTemplate, ["state", "contractVersion", "instructions"], `${path}.reviewedTemplate`, issues);
      const instructions = boundedString(value.reviewedTemplate.instructions, `${path}.reviewedTemplate.instructions`, issues, 1, 2000);
      if (description === null || sideEffect === null || typeof risk !== "string" || !operationRisks.includes(risk) || typeof idempotency !== "string" || !idempotencyKinds.includes(idempotency) || input === null || dedupeWindowMs === null || contractVersion !== 1 || instructions === null)
        return null;
      return {
        description,
        risk,
        sideEffect,
        idempotency,
        dedupeWindowMs,
        input,
        reviewedTemplate: { state: "capture-required", contractVersion: 1, instructions }
      };
    }
    if (state !== "reviewed") {
      issues.push(`${path}.reviewedTemplate.state must be capture-required or reviewed`);
      return null;
    }
    issues.push(`${path}.reviewedTemplate.state reviewed requires reviewed-template contractVersion 2 with a current-account identity preflight; keep schemaVersion 5 operations capture-required`);
    exactKeys2(value.reviewedTemplate, ["state", "contractVersion", "reviewedAt", "evidenceSha256", "timeoutMs", "template"], `${path}.reviewedTemplate`, issues);
    const reviewedAt = boundedString(value.reviewedTemplate.reviewedAt, `${path}.reviewedTemplate.reviewedAt`, issues, 20, 40);
    if (reviewedAt !== null && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(reviewedAt) || !Number.isFinite(Date.parse(reviewedAt))))
      issues.push(`${path}.reviewedTemplate.reviewedAt must be an exact UTC ISO-8601 instant`);
    const evidenceSha256 = value.reviewedTemplate.evidenceSha256;
    if (typeof evidenceSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(evidenceSha256)) {
      issues.push(`${path}.reviewedTemplate.evidenceSha256 must be one lowercase SHA-256 digest`);
    }
    const timeoutMs2 = safeInteger2(value.reviewedTemplate.timeoutMs, `${path}.reviewedTemplate.timeoutMs`, 1000, 10 * 60000, issues);
    const parsedTemplate = input === null ? null : parseWebSessionTemplate(value.reviewedTemplate.template, { input, allowedOrigins });
    if (parsedTemplate !== null && !parsedTemplate.ok) {
      for (const issue of parsedTemplate.issues) {
        issues.push(issue === "$" ? `${path}.reviewedTemplate.template is invalid` : `${path}.reviewedTemplate.template${issue.startsWith("$") ? issue.slice(1) : `: ${issue}`}`);
      }
    }
    const template = parsedTemplate?.ok === true ? parsedTemplate.value : null;
    if ((risk === "R2" || risk === "R3") && template !== null && template.response.variants.some((variant) => variant.body.kind === "discard" || variant.body.kind === "json" && variant.body.bindings.length < 1)) {
      issues.push(`${path}.reviewedTemplate.template write responses must be empty or include at least one exact target binding`);
    }
    if (description === null || sideEffect === null || typeof risk !== "string" || !operationRisks.includes(risk) || typeof idempotency !== "string" || !idempotencyKinds.includes(idempotency) || input === null || dedupeWindowMs === null || contractVersion !== 1 || reviewedAt === null || typeof evidenceSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(evidenceSha256) || timeoutMs2 === null || template === null)
      return null;
    return {
      description,
      risk,
      sideEffect,
      idempotency,
      dedupeWindowMs,
      input,
      reviewedTemplate: {
        state: "reviewed",
        contractVersion: 1,
        reviewedAt,
        evidenceSha256,
        timeoutMs: timeoutMs2,
        template
      }
    };
  }
  if (!isRecord2(value.browser)) {
    issues.push(`${path}.browser must be an object`);
    return null;
  }
  const browserSchemaVersion = schemaVersion === 1 ? 1 : 2;
  exactKeys2(value.browser, ["steps", "timeoutMs", "maxOutputBytes"], `${path}.browser`, issues);
  const timeoutMs = safeInteger2(value.browser.timeoutMs, `${path}.browser.timeoutMs`, 1000, 10 * 60000, issues);
  const maxOutputBytes = safeInteger2(value.browser.maxOutputBytes, `${path}.browser.maxOutputBytes`, 1024, 10 * 1024 * 1024, issues);
  const steps = [];
  if (!Array.isArray(value.browser.steps) || value.browser.steps.length < 1 || value.browser.steps.length > 100) {
    issues.push(`${path}.browser.steps must contain 1-100 steps`);
  } else if (input !== null) {
    const required = new Set(input.required);
    value.browser.steps.forEach((step, index) => {
      const parsed = parseStep(step, `${path}.browser.steps[${index}]`, input.properties, required, issues, browserSchemaVersion);
      if (parsed !== null)
        steps.push(parsed);
    });
  }
  if (steps[0]?.kind !== "navigate" && steps[0]?.kind !== "navigate-input") {
    issues.push(`${path}.browser.steps must begin with a declared-origin navigation`);
  }
  if (schemaVersion === 1) {
    const finalStep = steps.at(-1);
    if ((risk === "R2" || risk === "R3") && finalStep?.kind !== "assert-text" && finalStep?.kind !== "assert-url" && finalStep?.kind !== "assert-input-empty")
      issues.push(`${path} mutates remote state and must end with an observable postcondition`);
    const dispatchSteps = steps.filter((step) => (step.kind === "find" || step.kind === "press") && step.dispatch === true);
    if ((risk === "R2" || risk === "R3") && dispatchSteps.length !== 1) {
      issues.push(`${path} mutates remote state and must mark exactly one dispatch step`);
    }
    if (risk === "R1" && dispatchSteps.length > 0)
      issues.push(`${path} is R1 and cannot mark a dispatch step`);
    if (risk === "R2" || risk === "R3") {
      const dispatchIndex = steps.findIndex((step) => (step.kind === "find" || step.kind === "press") && step.dispatch === true);
      if (dispatchIndex >= steps.length - 1)
        issues.push(`${path} dispatch must precede its final postcondition`);
      if (dispatchIndex >= 0 && steps.slice(dispatchIndex + 1).some((step) => step.kind === "find" || step.kind === "press" || step.kind === "navigate" || step.kind === "navigate-input"))
        issues.push(`${path} cannot interact after dispatch; only observation and postcondition steps may follow it`);
    }
    if ((risk === "R2" || risk === "R3") && steps.some((step) => (step.kind === "press" || step.kind === "find" && step.action === "click") && step.dispatch !== true))
      issues.push(`${path} cannot click or press outside its single marked dispatch step`);
  } else if (input !== null) {
    const seenIds = new Set;
    const maximumDispatches = validateV2Flow(steps, `${path}.browser.steps`, input.properties, issues, seenIds);
    const minimumDispatches = minimumExpandedDispatchCount(steps, input.properties);
    const maximumSteps = maximumExpandedStepCount(steps, input.properties);
    if ((risk === "R2" || risk === "R3") && minimumDispatches < 1) {
      issues.push(`${path} mutates remote state and every valid input must schedule at least one named dispatch`);
    }
    if (maximumDispatches > 25)
      issues.push(`${path} can expand to at most 25 dispatches`);
    if (maximumSteps > 500)
      issues.push(`${path} can expand to at most 500 browser steps`);
    if (risk === "R1" && maximumDispatches > 0)
      issues.push(`${path} is R1 and cannot dispatch`);
  }
  if (risk === "R1" && containsInteraction(steps)) {
    issues.push(`${path} is R1 and cannot click, fill, type, hover, or press; upload, select, check, and uncheck are also forbidden; split interactive flows into an explicit write capability`);
  }
  if (description === null || sideEffect === null || typeof risk !== "string" || !operationRisks.includes(risk) || typeof idempotency !== "string" || !idempotencyKinds.includes(idempotency) || input === null || dedupeWindowMs === null || timeoutMs === null || maxOutputBytes === null)
    return null;
  return {
    description,
    risk,
    sideEffect,
    idempotency,
    dedupeWindowMs,
    input,
    browser: { steps, timeoutMs, maxOutputBytes }
  };
}
function resolveManifestPluginContract(registry, transport, surfaceId, operationName, contractVersion, requireCurrent) {
  const binding = transport === "session-api" ? registry.resolveSessionRoute(surfaceId) : registry.resolveRoute(transport, surfaceId);
  if (binding === undefined || (transport === "provider-api" ? binding.transport !== "provider-api" : transport === "local-cli" ? binding.transport !== "local-cli" : binding.transport === "provider-api" || binding.transport === "local-cli")) {
    return;
  }
  const exact = registry.resolveOperationDefinition(binding.transport, surfaceId, operationName, contractVersion);
  if (exact !== undefined) {
    return { binding: exact.binding, operation: exact.operation };
  }
  if (requireCurrent)
    return;
  const operation = binding.operations.find((candidate) => candidate.name === operationName);
  return operation === undefined ? undefined : { binding, operation };
}
function validateManifestPluginOrigins(binding, origins, browserDomains, issues) {
  const expectedOrigins = [...binding.manifestOrigins].sort();
  const actualOrigins = [...origins].sort();
  if (expectedOrigins.length !== actualOrigins.length || expectedOrigins.some((origin, index) => origin !== actualOrigins[index])) {
    issues.push(`manifest.origins must exactly match provider plugin surface ${binding.surfaceId}: ${expectedOrigins.join(", ")}`);
  }
  const expectedDomains = [
    ...new Set(expectedOrigins.map((origin) => new URL(origin).hostname.toLowerCase()))
  ].sort();
  const actualDomains = [...browserDomains].sort();
  if (expectedDomains.length !== actualDomains.length || expectedDomains.some((domain, index) => domain !== actualDomains[index])) {
    issues.push(`manifest.browserDomains must exactly match provider plugin surface ${binding.surfaceId}: ${expectedDomains.join(", ")}`);
  }
}
function validateManifestPluginSemantics(operationId, manifestOperation, descriptor, contractLabel, riskLabel, issues) {
  if (descriptor.risk !== manifestOperation.risk) {
    issues.push(`manifest.operations.${operationId}.risk must match ${riskLabel} risk ${descriptor.risk}`);
  }
  if (canonicalJson(descriptor.input) !== canonicalJson(manifestOperation.input)) {
    issues.push(`manifest.operations.${operationId}.input must exactly match ${contractLabel}`);
  }
  if (descriptor.sideEffect !== manifestOperation.sideEffect) {
    issues.push(`manifest.operations.${operationId}.sideEffect must exactly match ${contractLabel}`);
  }
  if (descriptor.idempotency !== manifestOperation.idempotency) {
    issues.push(`manifest.operations.${operationId}.idempotency must exactly match ${contractLabel}`);
  }
  if (descriptor.dedupeWindowMs !== manifestOperation.dedupeWindowMs) {
    issues.push(`manifest.operations.${operationId}.dedupeWindowMs must exactly match ${contractLabel}`);
  }
}
function parseManifestWithContractValidation(value, requireCurrentCodeOwnedContracts, registry) {
  const issues = [];
  if (!isRecord2(value))
    return { ok: false, issues: ["manifest must be an object"] };
  exactKeys2(value, ["schemaVersion", "id", "version", "displayName", "surfaceId", "origins", "browserDomains", "operations"], "manifest", issues);
  const schemaVersion = value.schemaVersion === GHOSTGET_LEGACY_MANIFEST_SCHEMA_VERSION ? GHOSTGET_LEGACY_MANIFEST_SCHEMA_VERSION : value.schemaVersion === GHOSTGET_LOCAL_CLI_MANIFEST_SCHEMA_VERSION ? GHOSTGET_LOCAL_CLI_MANIFEST_SCHEMA_VERSION : value.schemaVersion === GHOSTGET_REVIEWED_TEMPLATE_MANIFEST_SCHEMA_VERSION ? GHOSTGET_REVIEWED_TEMPLATE_MANIFEST_SCHEMA_VERSION : value.schemaVersion === GHOSTGET_WEB_SESSION_MANIFEST_SCHEMA_VERSION ? GHOSTGET_WEB_SESSION_MANIFEST_SCHEMA_VERSION : value.schemaVersion === GHOSTGET_PROVIDER_MANIFEST_SCHEMA_VERSION ? GHOSTGET_PROVIDER_MANIFEST_SCHEMA_VERSION : GHOSTGET_MANIFEST_SCHEMA_VERSION;
  if (value.schemaVersion !== GHOSTGET_LEGACY_MANIFEST_SCHEMA_VERSION && value.schemaVersion !== GHOSTGET_MANIFEST_SCHEMA_VERSION && value.schemaVersion !== GHOSTGET_PROVIDER_MANIFEST_SCHEMA_VERSION && value.schemaVersion !== GHOSTGET_WEB_SESSION_MANIFEST_SCHEMA_VERSION && value.schemaVersion !== GHOSTGET_REVIEWED_TEMPLATE_MANIFEST_SCHEMA_VERSION && value.schemaVersion !== GHOSTGET_LOCAL_CLI_MANIFEST_SCHEMA_VERSION) {
    issues.push("manifest.schemaVersion must be 1, 2, 3, 4, 5, or 6");
  }
  const id = boundedString(value.id, "manifest.id", issues, 1, 48);
  if (id !== null && !/^[a-z][a-z0-9-]*$/u.test(id))
    issues.push("manifest.id must be lowercase kebab-case");
  const version = boundedString(value.version, "manifest.version", issues, 1, 64);
  if (version !== null && !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version)) {
    issues.push("manifest.version must be a semantic version");
  }
  const displayName = boundedString(value.displayName, "manifest.displayName", issues, 1, 100);
  let surfaceId;
  if (value.surfaceId !== undefined) {
    if (schemaVersion === GHOSTGET_LEGACY_MANIFEST_SCHEMA_VERSION) {
      issues.push("manifest.surfaceId requires schemaVersion 2 or 3");
    } else if (schemaVersion === GHOSTGET_PROVIDER_MANIFEST_SCHEMA_VERSION || schemaVersion === GHOSTGET_WEB_SESSION_MANIFEST_SCHEMA_VERSION || schemaVersion === GHOSTGET_LOCAL_CLI_MANIFEST_SCHEMA_VERSION) {
      if (!isProviderPluginSurfaceId(value.surfaceId)) {
        issues.push("manifest.surfaceId must be a bounded lowercase kebab-case provider surface ID");
      } else {
        surfaceId = value.surfaceId;
      }
    } else if (typeof value.surfaceId !== "string" || !platformSurfaceIds.includes(value.surfaceId)) {
      issues.push("manifest.surfaceId must name a reviewed platform surface");
    } else {
      surfaceId = value.surfaceId;
    }
  }
  const origins = [];
  if (!Array.isArray(value.origins) || value.origins.length < 1 || value.origins.length > 20) {
    issues.push("manifest.origins must contain 1-20 exact HTTPS origins");
  } else {
    for (const [index, raw] of value.origins.entries()) {
      if (typeof raw !== "string") {
        issues.push(`manifest.origins[${index}] must be a string`);
        continue;
      }
      try {
        const url = new URL(raw);
        if (url.protocol !== "https:" || url.origin !== raw || url.username !== "" || url.password !== "") {
          issues.push(`manifest.origins[${index}] must be an exact HTTPS origin without credentials or a path`);
        } else if (isPrivateHostname(url.hostname) || isIP(url.hostname) !== 0 && isPrivateAddress(url.hostname)) {
          issues.push(`manifest.origins[${index}] cannot target a private network host`);
        } else if (!origins.includes(url.origin))
          origins.push(url.origin);
      } catch {
        issues.push(`manifest.origins[${index}] must be a valid origin`);
      }
    }
  }
  const browserDomains = [];
  if (!Array.isArray(value.browserDomains) || value.browserDomains.length < 1 || value.browserDomains.length > 100) {
    issues.push("manifest.browserDomains must contain 1-100 exact or wildcard hostnames");
  } else {
    for (const [index, raw] of value.browserDomains.entries()) {
      if (typeof raw !== "string" || !/^(?:\*\.)?[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/u.test(raw) || raw.includes("..")) {
        issues.push(`manifest.browserDomains[${index}] is invalid`);
      } else if (!browserDomains.includes(raw))
        browserDomains.push(raw);
    }
  }
  for (const origin of origins) {
    const hostname = new URL(origin).hostname.toLowerCase();
    if (!browserDomains.some((pattern) => pattern === hostname || pattern.startsWith("*.") && (hostname === pattern.slice(2) || hostname.endsWith(`.${pattern.slice(2)}`)))) {
      issues.push(`manifest.browserDomains must cover origin host ${hostname}`);
    }
  }
  const operations = {};
  if (!isRecord2(value.operations) || Object.keys(value.operations).length > 200) {
    issues.push("manifest.operations must be an object with at most 200 operations");
  } else {
    for (const [operationId, operation] of Object.entries(value.operations)) {
      if (!isProviderPluginOperationName(operationId)) {
        issues.push(`manifest.operations.${operationId} must be a dotted semantic capability ID`);
        continue;
      }
      const parsed = parseOperation(operation, `manifest.operations.${operationId}`, issues, schemaVersion, origins);
      if (parsed !== null)
        operations[operationId] = parsed;
    }
  }
  const retiredBeeperDiagnosticHash = !requireCurrentCodeOwnedContracts && schemaVersion === GHOSTGET_WEB_SESSION_MANIFEST_SCHEMA_VERSION && id !== null && version !== null && displayName !== null ? sha256(canonicalJson({
    schemaVersion,
    id,
    version,
    displayName,
    ...surfaceId === undefined ? {} : { surfaceId },
    origins,
    browserDomains,
    operations
  })) : null;
  const isExactRetiredBeeperDiagnostic = retiredBeeperDiagnosticHash === "2662d0b8f1580ce19085bc5f0b6b03e8f30e7a143f385a64ab6ecdea7fc0f3bd" || retiredBeeperDiagnosticHash === "7da2914ae8660108e31be2032c10678a5deee2129fd02186a2844329808754fa";
  const matchingKnownSurfaces = platformSurfaceIds.filter((candidate) => origins.some((origin) => socialPlatformCatalog[candidate].originPolicy.exactOrigins.includes(origin)));
  if (schemaVersion === GHOSTGET_LEGACY_MANIFEST_SCHEMA_VERSION && matchingKnownSurfaces.length > 0) {
    const legacyLinkedIn = id === "linkedin" && matchingKnownSurfaces.length === 1 && matchingKnownSurfaces[0] === "linkedin" && origins.every((origin) => origin === "https://www.linkedin.com") && Object.entries(operations).every(([operationId, operation]) => operationId === "profile.read" && operation.risk === "R1" || operationId === "messaging.send" && operation.risk === "R3");
    if (!legacyLinkedIn) {
      issues.push("schemaVersion 1 platform adapters are restricted to the bundled LinkedIn compatibility contract; migrate to schemaVersion 2 with surfaceId");
    }
  }
  if (schemaVersion === GHOSTGET_MANIFEST_SCHEMA_VERSION || schemaVersion === GHOSTGET_PROVIDER_MANIFEST_SCHEMA_VERSION || schemaVersion === GHOSTGET_REVIEWED_TEMPLATE_MANIFEST_SCHEMA_VERSION) {
    const policyOperations = Object.entries(operations).filter(([, operation]) => schemaVersion !== GHOSTGET_PROVIDER_MANIFEST_SCHEMA_VERSION || isBrowserOperation(operation));
    if (surfaceId === undefined && matchingKnownSurfaces.length > 0) {
      issues.push(`manifest.surfaceId is required for reviewed platform origins (${matchingKnownSurfaces.join(", ")})`);
    }
    if (surfaceId === undefined) {
      for (const [operationId, operation] of policyOperations) {
        if (!semanticOperationNames.includes(operationId)) {
          issues.push(`manifest.operations.${operationId} is not in wrench's reviewed generic semantic vocabulary`);
          continue;
        }
        const expectedRisk = genericSemanticRisks[operationId];
        if (operation.risk !== expectedRisk) {
          issues.push(`manifest.operations.${operationId}.risk must be ${expectedRisk} under the generic semantic policy`);
        }
        if (operationId === "threads.publish") {
          validateGenericThreadSchema(operation, `manifest.operations.${operationId}`, issues);
        }
      }
    }
    if (surfaceId !== undefined && isPlatformSurfaceId(surfaceId) && (schemaVersion !== GHOSTGET_PROVIDER_MANIFEST_SCHEMA_VERSION || policyOperations.length > 0)) {
      const surface = socialPlatformCatalog[surfaceId];
      const baseOrigins = new Set(surface.originPolicy.exactOrigins);
      if (!origins.some((origin) => baseOrigins.has(origin))) {
        issues.push(`manifest.origins must include a reviewed ${surfaceId} origin`);
      }
      const additionalOrigins = origins.filter((origin) => !baseOrigins.has(origin));
      if (surface.originPolicy.additionalExactOrigins.state === "forbidden" && additionalOrigins.length > 0) {
        issues.push(`manifest.origins contains an origin outside the reviewed ${surfaceId} policy`);
      } else if (surface.originPolicy.additionalExactOrigins.state === "adapter-declared" && additionalOrigins.length > surface.originPolicy.additionalExactOrigins.maxOrigins) {
        issues.push(`manifest.origins may add at most ${surface.originPolicy.additionalExactOrigins.maxOrigins} reviewed publication origin for ${surfaceId}`);
      }
      for (const [operationId, operation] of policyOperations) {
        if (!semanticOperationNames.includes(operationId)) {
          issues.push(`manifest.operations.${operationId} is not a reviewed semantic operation for ${surfaceId}`);
          continue;
        }
        const policy = surface.operations[operationId];
        if (policy.state === "unsupported" || policy.state === "not-applicable") {
          issues.push(`manifest.operations.${operationId} is ${policy.state} on ${surfaceId}`);
          continue;
        }
        const expectedRisk = policy.state === "R4" ? "R4" : policy.risk;
        if (operation.risk !== expectedRisk) {
          issues.push(`manifest.operations.${operationId}.risk must be ${expectedRisk} under the reviewed ${surfaceId} policy`);
        }
        if (policy.state === "adapter-eligible") {
          validatePlatformCompositionSchema(surfaceId, operationId, operation, `manifest.operations.${operationId}`, issues);
          if (operationId === "threads.publish") {
            validatePlatformThreadSchema(surfaceId, operation, `manifest.operations.${operationId}`, issues);
          }
        }
      }
    }
  }
  if (schemaVersion === GHOSTGET_PROVIDER_MANIFEST_SCHEMA_VERSION) {
    const hasProviderOperation = Object.values(operations).some(isProviderOperation);
    const hasBrowserOperation = Object.values(operations).some(isBrowserOperation);
    if (hasProviderOperation && surfaceId === undefined) {
      issues.push("manifest.surfaceId is required for schemaVersion 3 official-provider adapters");
    }
    if (requireCurrentCodeOwnedContracts && hasProviderOperation && surfaceId !== undefined) {
      const binding = registry.resolveRoute("provider-api", surfaceId);
      if (binding !== undefined) {
        validateManifestPluginOrigins(binding, origins, browserDomains, issues);
      }
    }
    if (hasBrowserOperation) {
      for (const domain of browserDomains) {
        if (isReviewedTemplateProtectedHostname(domain, registry)) {
          issues.push(`schemaVersion 3 browser actions are prohibited on protected signed-in site domain ${domain}; use a code-owned provider or schemaVersion 4 contract`);
        }
      }
      for (const origin of origins) {
        const hostname = new URL(origin).hostname;
        if (isReviewedTemplateProtectedHostname(hostname, registry)) {
          issues.push(`schemaVersion 3 browser actions are prohibited on protected signed-in site hostname ${hostname}; use a code-owned provider or schemaVersion 4 contract`);
        }
      }
    }
    for (const [operationId, operation] of Object.entries(operations)) {
      if (!isProviderOperation(operation)) {
        if (surfaceId !== undefined && hasCodeOwnedPluginSurface(surfaceId, registry)) {
          issues.push(`schemaVersion 3 browser actions are prohibited on registered provider plugin surface ${surfaceId}`);
        }
        continue;
      }
      if (surfaceId !== operation.provider.provider) {
        issues.push(`manifest.operations.${operationId}.provider.provider must match manifest.surfaceId`);
      }
      if (operation.provider.action !== operationId) {
        issues.push(`manifest.operations.${operationId}.provider.action must equal its canonical operation ID`);
      }
      const descriptor = resolveManifestPluginContract(registry, "provider-api", operation.provider.provider, operation.provider.action, operation.provider.contractVersion, requireCurrentCodeOwnedContracts);
      if (descriptor === undefined) {
        issues.push(`official provider contract ${operation.provider.provider}/${operation.provider.action}@${operation.provider.contractVersion} is not installed`);
        continue;
      }
      if (requireCurrentCodeOwnedContracts) {
        validateManifestPluginSemantics(operationId, operation, descriptor.operation, `provider contract ${operation.provider.provider}/${operationId}@${operation.provider.contractVersion}`, "provider contract", issues);
      }
    }
  }
  if (schemaVersion === GHOSTGET_WEB_SESSION_MANIFEST_SCHEMA_VERSION) {
    const hasWebSessionOperation = Object.values(operations).some(isWebSessionOperation);
    if (hasWebSessionOperation && surfaceId === undefined) {
      issues.push("manifest.surfaceId is required for schemaVersion 4 authenticated web-session adapters");
    }
    if (requireCurrentCodeOwnedContracts && hasWebSessionOperation && surfaceId !== undefined) {
      const binding = registry.resolveSessionRoute(surfaceId);
      if (binding !== undefined) {
        validateManifestPluginOrigins(binding, origins, browserDomains, issues);
      }
    }
    for (const [operationId, operation] of Object.entries(operations)) {
      if (!isWebSessionOperation(operation)) {
        issues.push(`manifest.operations.${operationId} must use a code-owned webSession contract in schemaVersion 4`);
        continue;
      }
      if (surfaceId !== operation.webSession.site) {
        issues.push(`manifest.operations.${operationId}.webSession.site must match manifest.surfaceId`);
      }
      if (operation.webSession.action !== operationId) {
        issues.push(`manifest.operations.${operationId}.webSession.action must equal its canonical operation ID`);
      }
      const descriptor = resolveManifestPluginContract(registry, "session-api", operation.webSession.site, operation.webSession.action, operation.webSession.contractVersion, requireCurrentCodeOwnedContracts);
      if (descriptor === undefined) {
        if (isExactRetiredBeeperDiagnostic)
          continue;
        issues.push(`authenticated web contract ${operation.webSession.site}/${operation.webSession.action}@${operation.webSession.contractVersion} is not installed`);
        continue;
      }
      if (requireCurrentCodeOwnedContracts) {
        validateManifestPluginSemantics(operationId, operation, descriptor.operation, `authenticated web contract ${operation.webSession.site}/${operationId}@${operation.webSession.contractVersion}`, "authenticated web contract", issues);
      }
    }
  }
  if (schemaVersion === GHOSTGET_LOCAL_CLI_MANIFEST_SCHEMA_VERSION) {
    const hasLocalCliOperation = Object.values(operations).some(isLocalCliOperation);
    if (hasLocalCliOperation && surfaceId === undefined) {
      issues.push("manifest.surfaceId is required for schemaVersion 6 local CLI adapters");
    }
    if (requireCurrentCodeOwnedContracts && hasLocalCliOperation && surfaceId !== undefined) {
      const binding = registry.resolveRoute("local-cli", surfaceId);
      if (binding !== undefined) {
        validateManifestPluginOrigins(binding, origins, browserDomains, issues);
      }
    }
    for (const [operationId, operation] of Object.entries(operations)) {
      if (!isLocalCliOperation(operation)) {
        issues.push(`manifest.operations.${operationId} must use a code-owned localCli contract in schemaVersion 6`);
        continue;
      }
      if (surfaceId !== operation.localCli.surface) {
        issues.push(`manifest.operations.${operationId}.localCli.surface must match manifest.surfaceId`);
      }
      if (operation.localCli.action !== operationId) {
        issues.push(`manifest.operations.${operationId}.localCli.action must equal its canonical operation ID`);
      }
      const descriptor = resolveManifestPluginContract(registry, "local-cli", operation.localCli.surface, operation.localCli.action, operation.localCli.contractVersion, requireCurrentCodeOwnedContracts);
      if (descriptor === undefined) {
        issues.push(`local CLI contract ${operation.localCli.surface}/${operation.localCli.action}@${operation.localCli.contractVersion} is not installed`);
        continue;
      }
      if (requireCurrentCodeOwnedContracts) {
        validateManifestPluginSemantics(operationId, operation, descriptor.operation, `local CLI contract ${operation.localCli.surface}/${operationId}@${operation.localCli.contractVersion}`, "local CLI contract", issues);
      }
    }
  }
  if (schemaVersion === GHOSTGET_REVIEWED_TEMPLATE_MANIFEST_SCHEMA_VERSION) {
    for (const origin of origins) {
      const url = new URL(origin);
      if (url.port !== "") {
        issues.push(`schemaVersion 5 reviewed-template reservations require the default HTTPS port; ${origin} is not allowed`);
      }
      if (isReviewedTemplateProtectedHostname(url.hostname, registry)) {
        issues.push(`schemaVersion 5 reviewed-template reservations are prohibited on protected signed-in site hostname ${url.hostname}; use a code-owned schemaVersion 4 contract`);
      }
    }
    if (surfaceId !== undefined && hasCodeOwnedPluginSurface(surfaceId, registry)) {
      issues.push(`schemaVersion 5 reviewed templates are prohibited on registered provider plugin surface ${surfaceId}`);
    }
    for (const [operationId, operation] of Object.entries(operations)) {
      if (!isReviewedTemplateOperation(operation)) {
        issues.push(`manifest.operations.${operationId} must use a reviewedTemplate contract in schemaVersion 5`);
      }
    }
  }
  if (schemaVersion === GHOSTGET_MANIFEST_SCHEMA_VERSION && Object.keys(operations).length > 0) {
    const hasBrowserOperation = Object.values(operations).some(isBrowserOperation);
    if (surfaceId !== undefined && hasCodeOwnedPluginSurface(surfaceId, registry)) {
      issues.push(`schemaVersion 2 browser actions are prohibited on registered provider plugin surface ${surfaceId}`);
    }
    if (hasBrowserOperation) {
      for (const domain of browserDomains) {
        if (isReviewedTemplateProtectedHostname(domain, registry)) {
          issues.push(`schemaVersion 2 browser actions are prohibited on protected signed-in site domain ${domain}; use a code-owned provider or schemaVersion 4 contract`);
        }
      }
      for (const origin of origins) {
        const hostname = new URL(origin).hostname;
        if (isReviewedTemplateProtectedHostname(hostname, registry)) {
          issues.push(`schemaVersion 2 browser actions are prohibited on protected signed-in site hostname ${hostname}; use a code-owned provider or schemaVersion 4 contract`);
        }
      }
    }
  }
  if (issues.length > 0 || id === null || version === null || displayName === null)
    return { ok: false, issues };
  const manifest = {
    schemaVersion,
    id,
    version,
    displayName,
    ...surfaceId === undefined ? {} : { surfaceId },
    origins,
    browserDomains,
    operations
  };
  if (schemaVersion === GHOSTGET_LEGACY_MANIFEST_SCHEMA_VERSION && id === "linkedin" && sha256(canonicalJson(value)) !== GHOSTGET_LEGACY_LINKEDIN_MANIFEST_HASH) {
    return {
      ok: false,
      issues: ["schemaVersion 1 LinkedIn compatibility is restricted to the exact archived v0.4.0 manifest"]
    };
  }
  return { ok: true, value: manifest };
}
function parseManifest(value, registry) {
  return parseManifestWithContractValidation(value, true, registry);
}
function parseRuntimeManifest(value, registry) {
  const parsed = parseManifest(value, registry);
  if (!parsed.ok)
    return parsed;
  const browserOperations = Object.entries(parsed.value.operations).filter(([, operation]) => isBrowserOperation(operation)).map(([operationId]) => operationId);
  if (browserOperations.length > 0) {
    return {
      ok: false,
      issues: browserOperations.map((operationId) => `manifest.operations.${operationId}.browser: ${DOM_ACTION_TRANSPORT_DISABLED_MESSAGE}`)
    };
  }
  return parsed;
}
function validateOperationInput(schema, value, origins) {
  const issues = [];
  if (!isRecord2(value))
    return { ok: false, issues: ["input must be a JSON object"] };
  const output = {};
  for (const key of Object.keys(value)) {
    if (!(key in schema.properties))
      issues.push(`input.${key} is not supported`);
  }
  for (const key of schema.required) {
    if (!(key in value))
      issues.push(`input.${key} is required`);
  }
  const validateValue = (field2, candidate, path) => {
    if (field2.type === "file") {
      if (typeof candidate !== "string" || candidate.length < 1 || candidate.length > 4096 || candidate.includes(String.fromCharCode(0)) || hasUnpairedSurrogate2(candidate)) {
        issues.push(`${path} must be a non-empty opaque file reference`);
        return null;
      }
      return { kind: "file", reference: candidate };
    }
    if (typeof candidate !== field2.type) {
      issues.push(`${path} must be ${field2.type}`);
      return null;
    }
    if (typeof candidate === "string") {
      if (candidate.length < (field2.minLength ?? 0) || candidate.length > (field2.maxLength ?? 64 * 1024)) {
        issues.push(`${path} has an invalid length`);
        return null;
      }
      if (candidate.includes(String.fromCharCode(0))) {
        issues.push(`${path} must not contain NUL`);
        return null;
      }
      if (hasUnpairedSurrogate2(candidate)) {
        issues.push(`${path} must contain well-formed Unicode`);
        return null;
      }
      if (field2.format === "url") {
        try {
          if (field2.urlPathPrefixes !== undefined && hasAmbiguousPathSyntax(rawUrlPath(candidate))) {
            issues.push(`${path} must use an unambiguous allowed URL path`);
            return null;
          }
          const url = new URL(candidate);
          if (!origins.includes(url.origin) || url.username !== "" || url.password !== "") {
            issues.push(`${path} must use an adapter origin and contain no credentials`);
            return null;
          }
          if (field2.urlPathPrefixes !== undefined && !field2.urlPathPrefixes.some((prefix) => matchesUrlPathPrefix(url.pathname, prefix))) {
            issues.push(`${path} must use an allowed URL path prefix`);
            return null;
          }
        } catch {
          issues.push(`${path} must be a valid URL`);
          return null;
        }
      }
      if (field2.format === "path-segment" && (candidate === "." || candidate === ".." || candidate.includes("/") || candidate.includes("\\") || candidate.includes("%"))) {
        issues.push(`${path} must be one unambiguous URL path segment`);
        return null;
      }
    }
    if (typeof candidate === "number" && (!Number.isFinite(candidate) || candidate < (field2.minimum ?? -Infinity) || candidate > (field2.maximum ?? Infinity))) {
      issues.push(`${path} is outside its numeric bounds`);
      return null;
    }
    if (field2.enum !== undefined && !field2.enum.some((enumValue) => Object.is(enumValue, candidate))) {
      issues.push(`${path} is not an allowed value`);
      return null;
    }
    return candidate;
  };
  for (const [key, field2] of Object.entries(schema.properties)) {
    const candidate = value[key];
    if (candidate === undefined)
      continue;
    if (field2.type === "array") {
      if (!Array.isArray(candidate)) {
        issues.push(`input.${key} must be array`);
        continue;
      }
      if (candidate.length < field2.minItems || candidate.length > field2.maxItems) {
        issues.push(`input.${key} must contain ${field2.minItems}-${field2.maxItems} items`);
        continue;
      }
      const parsed2 = [];
      candidate.forEach((item, index) => {
        const result = validateValue(field2.items, item, `input.${key}[${index}]`);
        if (result !== null)
          parsed2.push(result);
      });
      if (parsed2.length === candidate.length)
        output[key] = parsed2;
      continue;
    }
    const parsed = validateValue(field2, candidate, `input.${key}`);
    if (parsed !== null)
      output[key] = parsed;
  }
  return issues.length === 0 ? { ok: true, value: output } : { ok: false, issues };
}
function validatePlatformOperationInput(manifest, operationId, input) {
  if (manifest.surfaceId === undefined || !isPlatformSurfaceId(manifest.surfaceId) || !semanticOperationNames.includes(operationId)) {
    return { ok: true, value: input };
  }
  if (operationId === "threads.publish") {
    const policy = threadTextPolicy(manifest.surfaceId);
    const items = input.items;
    if (policy === null || !Array.isArray(items)) {
      return { ok: false, issues: [`threads.publish has no valid reviewed item policy on ${manifest.surfaceId}`] };
    }
    const issues2 = [];
    for (const [index, item] of items.entries()) {
      if (typeof item !== "string") {
        issues2.push(`input.items[${index}] must be thread text`);
        continue;
      }
      const length = weightedTextLength(item, textWeightPolicies[policy.measurement]);
      if (length > policy.maxWeightedLength) {
        issues2.push(`input.items[${index}] weighs ${length}, above the reviewed ${policy.maxWeightedLength}-unit ${manifest.surfaceId} limit`);
      }
    }
    return issues2.length === 0 ? { ok: true, value: input } : { ok: false, issues: issues2 };
  }
  const compositionName = operationCompositions[operationId];
  if (compositionName === undefined)
    return { ok: true, value: input };
  const surface = socialPlatformCatalog[manifest.surfaceId];
  const composition = surface.compositions[compositionName];
  if (composition === undefined)
    return { ok: false, issues: [`${operationId} has no reviewed composition policy on ${manifest.surfaceId}`] };
  const operation = manifest.operations[operationId];
  const structuredArticleDraft = operationId === "articles.draft.save" && operation !== undefined && isWebSessionOperation(operation) && operation.input.properties.document !== undefined;
  const issues = [];
  for (const field2 of composition.text) {
    if (structuredArticleDraft && field2.name === "body")
      continue;
    const value = input[field2.name];
    if (value === undefined) {
      if (field2.required)
        issues.push(`input.${field2.name} is required by the reviewed ${manifest.surfaceId} policy`);
      continue;
    }
    if (typeof value !== "string") {
      issues.push(`input.${field2.name} must be text under the reviewed ${manifest.surfaceId} policy`);
      continue;
    }
    const length = weightedTextLength(value, textWeightPolicies[field2.measurement]);
    if (length > field2.safeMaxUnits) {
      issues.push(`input.${field2.name} weighs ${length}, above the reviewed ${field2.safeMaxUnits}-unit ${manifest.surfaceId} limit`);
    }
    if (field2.format === "decimal-amount" && !/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/u.test(value)) {
      issues.push(`input.${field2.name} must be a non-negative decimal amount with at most two fractional digits`);
    }
    if (field2.format === "currency-code" && !/^[A-Z]{3}$/u.test(value)) {
      issues.push(`input.${field2.name} must be a three-letter uppercase currency code`);
    }
  }
  return issues.length === 0 ? { ok: true, value: input } : { ok: false, issues };
}
function bindRepeatedDispatch(step, suffix) {
  if ((step.kind === "find" || step.kind === "press") && step.effect?.kind === "dispatch") {
    return { ...step, effect: { ...step.effect, id: `${step.effect.id}${suffix}` } };
  }
  if (step.kind === "verify-dispatch")
    return { ...step, dispatch: `${step.dispatch}${suffix}` };
  return step;
}
function expandBrowserRecipe(recipe, input) {
  const steps = [];
  const dispatches = [];
  let legacyDispatches = 0;
  const append = (step, item) => {
    const effect = dispatchEffect(step);
    if (effect !== null)
      dispatches.push({ id: effect.id, description: effect.description });
    else if ((step.kind === "find" || step.kind === "press") && step.dispatch === true) {
      legacyDispatches += 1;
      dispatches.push({ id: legacyDispatches === 1 ? "dispatch" : `dispatch-${legacyDispatches}`, description: "Legacy manifest dispatch" });
    }
    steps.push({ step, ...item === undefined ? {} : { item } });
    if (steps.length > 500)
      throw new Error("browser recipe expands beyond 500 steps");
    if (dispatches.length > 25)
      throw new Error("browser recipe expands beyond 25 dispatches");
  };
  for (const step of recipe.steps) {
    if (step.kind !== "for-each") {
      append(step);
      continue;
    }
    const rawValues = input[step.input];
    if (!Array.isArray(rawValues))
      throw new Error(`for-each input.${step.input} must be a validated array`);
    const values = rawValues;
    if (values.length > 25)
      throw new Error(`for-each input.${step.input} exceeds 25 items`);
    for (const [index, item] of values.entries()) {
      const suffix = `[${index + 1}]`;
      for (const nested of step.steps) {
        if (nested.kind === "for-each")
          throw new Error("nested for-each is not supported");
        append(bindRepeatedDispatch(nested, suffix), item);
      }
      if (index < values.length - 1) {
        for (const nested of step.between ?? []) {
          if (nested.kind === "for-each")
            throw new Error("nested for-each is not supported");
          append(bindRepeatedDispatch(nested, suffix), item);
        }
      }
    }
  }
  const ids = new Set;
  for (const dispatch of dispatches) {
    if (ids.has(dispatch.id))
      throw new Error(`browser recipe has duplicate expanded dispatch id ${dispatch.id}`);
    ids.add(dispatch.id);
  }
  return { timeoutMs: recipe.timeoutMs, maxOutputBytes: recipe.maxOutputBytes, steps, dispatches };
}
function manifestHash(manifest) {
  return sha256(canonicalJson(manifest));
}

// src/storage.ts
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdtempSync,
  openSync,
  opendirSync,
  readSync,
  realpathSync,
  rmSync,
  writeFileSync
} from "fs";
import { spawnSync } from "child_process";
import { homedir, tmpdir } from "os";
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from "path";
import { fileURLToPath } from "url";
function requireManifestRegistry(registry) {
  if (registry === undefined) {
    throw new Error("manifest validation requires an explicit provider plugin registry");
  }
  return registry;
}
var MAX_WRENCH_JSON_BYTES = 1024 * 1024;
var MAX_PRIVATE_STATE_BATCH_FILES = 1000;
var MAX_PRIVATE_STATE_BATCH_FILE_BYTES = 2 * 1024 * 1024;
var MAX_PRIVATE_STATE_BATCH_TOTAL_BYTES = 64 * 1024 * 1024;
var DEFAULT_PRIVATE_STATE_EXPECTED_CONTENT_BYTES = 2 * 1024 * 1024;
var MAX_PRIVATE_STATE_EXPECTED_CONTENT_BYTES = 4 * 1024 * 1024;
var MAX_PRIVATE_STATE_BATCH_NAME_BYTES = 256 * 1024;
var MAX_PRIVATE_STATE_BATCH_STDOUT_BYTES = 96 * 1024 * 1024;
var TEST_STATE_HELPER_TIMEOUT_MS = 120000;
var knownStateRoots = new Map;
var stateDirectoryNames = [
  "adapter-generations",
  "adapters",
  "auth",
  "browser-snapshots",
  "captures",
  "control",
  "derivations",
  "idempotency",
  "linked-device-stores",
  "messaging",
  "omni-read-projections",
  "operation-permissions",
  "plan-assets",
  "plans",
  "provider-plugin-state",
  "provider-plugins",
  "read-projection-control",
  "read-projections",
  "recovery",
  "run-journals",
  "runs",
  "session-secrets",
  "tools"
];
var stateMarkerName = ".io-state.json";
var stateMarkerText = `{"kind":"io-state","schemaVersion":1}
`;
var stateHelperPath = join(dirname(fileURLToPath(import.meta.url)), "state-helper.ts");
var stateHelperConfigPath = join(dirname(fileURLToPath(import.meta.url)), "state-helper.bunfig.toml");
var pathHelperPath = join(dirname(fileURLToPath(import.meta.url)), "path-helper.ts");
var ghostgetSourcePackageRoot = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
function isWithinPath(root, candidate) {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === "" || pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot);
}
function hasCode(error, code) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
function readDescriptorBounded(descriptor, maximumBytes) {
  const chunks = [];
  const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, maximumBytes + 1));
  let total = 0;
  for (;; ) {
    const remaining = maximumBytes + 1 - total;
    const count = readSync(descriptor, buffer, 0, Math.min(buffer.byteLength, remaining), null);
    if (count === 0)
      return Buffer.concat(chunks, total);
    total += count;
    if (total > maximumBytes)
      throw new Error("file grew beyond its byte bound");
    chunks.push(Buffer.from(buffer.subarray(0, count)));
  }
}
function pathInside(root, target) {
  const child = relative(root, target);
  return child === "" || !isAbsolute(child) && child !== ".." && !child.startsWith(`..${sep}`);
}
function stateRootFor(path) {
  const lexicalTarget = resolve(path);
  let selected = null;
  for (const root of knownStateRoots.keys()) {
    if (pathInside(root, lexicalTarget) && (selected === null || root.length > selected.length))
      selected = root;
  }
  if (selected !== null)
    return selected;
  const target = canonicalNonStatePath(path);
  for (const root of knownStateRoots.keys()) {
    if (pathInside(root, target) && (selected === null || root.length > selected.length))
      selected = root;
  }
  return selected;
}
function isGhostgetStatePath(path, environment = process.env) {
  const root = ghostgetStateHome(environment);
  return stateRootFor(path) === root;
}
function sameIdentity(left, right) {
  return left === null || right === null ? left === right : left.device === right.device && left.inode === right.inode;
}
function exactObjectKeys(value, required, optional = []) {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => allowed.has(key));
}
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isSafeBatchFileName(value) {
  if (typeof value !== "string" || value === "" || value === "." || value === ".." || value.includes("/") || value.includes("\\") || value.includes("\uFFFD") || Buffer.byteLength(value, "utf8") > 255)
    return false;
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 31 || codePoint === 127)) {
      return false;
    }
  }
  return true;
}
function decodeCanonicalBase64(value, maximumBytes) {
  if (typeof value !== "string" || value.length > Math.ceil(maximumBytes / 3) * 4 + 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value))
    return null;
  const decoded = Buffer.from(value, "base64");
  return decoded.byteLength <= maximumBytes && decoded.toString("base64") === value ? decoded : null;
}
function parseStateHelperBatchFiles(value) {
  if (!Array.isArray(value) || value.length > MAX_PRIVATE_STATE_BATCH_FILES) {
    throw new Error("state helper returned a malformed response");
  }
  const names = new Set;
  const files = [];
  let contentBytes = 0;
  const invalidReasons = new Set([
    "unsafe-file",
    "unreadable",
    "file-byte-bound",
    "aggregate-byte-bound",
    "changed-during-read"
  ]);
  for (const candidate of value) {
    if (!isRecord3(candidate) || !isSafeBatchFileName(candidate.name)) {
      throw new Error("state helper returned a malformed response");
    }
    const name = candidate.name;
    if (names.has(name)) {
      throw new Error("state helper returned a malformed response");
    }
    names.add(name);
    if (candidate.status === "present" && exactObjectKeys(candidate, ["name", "status", "contentBase64"])) {
      const content = decodeCanonicalBase64(candidate.contentBase64, MAX_PRIVATE_STATE_BATCH_FILE_BYTES);
      if (content === null) {
        throw new Error("state helper returned a malformed response");
      }
      contentBytes += content.byteLength;
      if (contentBytes > MAX_PRIVATE_STATE_BATCH_TOTAL_BYTES) {
        throw new Error("state helper returned a malformed response");
      }
      files.push({
        name,
        status: "present",
        contentBase64: candidate.contentBase64
      });
      continue;
    }
    if (candidate.status === "absent" && exactObjectKeys(candidate, ["name", "status"])) {
      files.push({ name, status: "absent" });
      continue;
    }
    if (candidate.status === "invalid" && exactObjectKeys(candidate, ["name", "status", "reason"]) && invalidReasons.has(candidate.reason)) {
      files.push({
        name,
        status: "invalid",
        reason: candidate.reason
      });
      continue;
    }
    throw new Error("state helper returned a malformed response");
  }
  return files;
}
function parseStateHelperBatchChildFiles(value) {
  if (!Array.isArray(value) || value.length > MAX_PRIVATE_STATE_BATCH_FILES) {
    throw new Error("state helper returned a malformed response");
  }
  const keys = new Set;
  const files = [];
  let contentBytes = 0;
  const invalidReasons = new Set([
    "unsafe-file",
    "unreadable",
    "file-byte-bound",
    "aggregate-byte-bound",
    "changed-during-read"
  ]);
  for (const candidate of value) {
    if (!isRecord3(candidate) || !isSafeBatchFileName(candidate.directoryName) || !isSafeBatchFileName(candidate.fileName)) {
      throw new Error("state helper returned a malformed response");
    }
    const directoryName = candidate.directoryName;
    const fileName = candidate.fileName;
    const key = `${directoryName}\x00${fileName}`;
    if (keys.has(key)) {
      throw new Error("state helper returned a malformed response");
    }
    keys.add(key);
    if (candidate.status === "present" && exactObjectKeys(candidate, [
      "directoryName",
      "fileName",
      "status",
      "contentBase64"
    ])) {
      const content = decodeCanonicalBase64(candidate.contentBase64, MAX_PRIVATE_STATE_BATCH_FILE_BYTES);
      if (content === null) {
        throw new Error("state helper returned a malformed response");
      }
      contentBytes += content.byteLength;
      if (contentBytes > MAX_PRIVATE_STATE_BATCH_TOTAL_BYTES) {
        throw new Error("state helper returned a malformed response");
      }
      files.push({
        directoryName,
        fileName,
        status: "present",
        contentBase64: candidate.contentBase64
      });
      continue;
    }
    if (candidate.status === "absent" && exactObjectKeys(candidate, [
      "directoryName",
      "fileName",
      "status"
    ])) {
      files.push({ directoryName, fileName, status: "absent" });
      continue;
    }
    if (candidate.status === "invalid" && exactObjectKeys(candidate, [
      "directoryName",
      "fileName",
      "status",
      "reason"
    ]) && invalidReasons.has(candidate.reason)) {
      files.push({
        directoryName,
        fileName,
        status: "invalid",
        reason: candidate.reason
      });
      continue;
    }
    throw new Error("state helper returned a malformed response");
  }
  return files;
}
function parseResponseIdentity(value) {
  if (!isRecord3(value) || !exactObjectKeys(value, ["device", "inode"]) || typeof value.device !== "string" || !/^\d{1,40}$/u.test(value.device) || typeof value.inode !== "string" || !/^\d{1,40}$/u.test(value.inode))
    return null;
  return { device: value.device, inode: value.inode };
}
function parseStateHelperResponse(value) {
  if (!isRecord3(value) || !exactObjectKeys(value, ["ok", "identity"], ["created", "removed", "present", "contentBase64", "entries", "files", "childFiles", "targetIdentity"])) {
    throw new Error("state helper returned a malformed response");
  }
  const identityValue = value.identity;
  const parsedIdentity = parseResponseIdentity(identityValue);
  if (value.ok !== true || parsedIdentity === null)
    throw new Error("state helper returned a malformed response");
  const created = value.created;
  const removed = value.removed;
  const present = value.present;
  const contentBase64 = value.contentBase64;
  const entries = value.entries;
  const files = value.files;
  const childFiles = value.childFiles;
  const targetIdentityValue = value.targetIdentity;
  const targetIdentity = targetIdentityValue === undefined ? undefined : parseResponseIdentity(targetIdentityValue);
  if (created !== undefined && typeof created !== "boolean")
    throw new Error("state helper returned a malformed response");
  if (removed !== undefined && typeof removed !== "boolean")
    throw new Error("state helper returned a malformed response");
  if (present !== undefined && typeof present !== "boolean")
    throw new Error("state helper returned a malformed response");
  if (contentBase64 !== undefined && typeof contentBase64 !== "string")
    throw new Error("state helper returned a malformed response");
  if (targetIdentityValue !== undefined && targetIdentity === null) {
    throw new Error("state helper returned a malformed response");
  }
  const responseShape = Object.keys(value).filter((key) => key !== "ok" && key !== "identity").sort().join(",");
  if (!new Set([
    "",
    "contentBase64",
    "contentBase64,present",
    "created",
    "created,targetIdentity",
    "entries",
    "entries,targetIdentity",
    "childFiles,targetIdentity",
    "files,targetIdentity",
    "present",
    "removed",
    "targetIdentity"
  ]).has(responseShape))
    throw new Error("state helper returned a malformed response");
  if (present === true !== (responseShape === "contentBase64,present")) {
    if (present !== undefined)
      throw new Error("state helper returned a malformed response");
  }
  if (entries !== undefined && (!Array.isArray(entries) || entries.length > 1e4 || entries.some((entry) => !isRecord3(entry) || !exactObjectKeys(entry, ["name", "kind"], ["identity"]) || typeof entry.name !== "string" || entry.name === "" || entry.name === "." || entry.name === ".." || entry.name.includes("/") || entry.name.includes("\\") || entry.name.includes("\x00") || Buffer.byteLength(entry.name, "utf8") > 255 || entry.kind !== "file" && entry.kind !== "directory" && entry.kind !== "symbolic-link" && entry.kind !== "other" || entry.kind === "directory" !== (parseResponseIdentity(entry.identity) !== null))))
    throw new Error("state helper returned a malformed response");
  const parsedFiles = files === undefined ? undefined : parseStateHelperBatchFiles(files);
  const parsedChildFiles = childFiles === undefined ? undefined : parseStateHelperBatchChildFiles(childFiles);
  return {
    ok: true,
    identity: parsedIdentity,
    ...created === undefined ? {} : { created },
    ...removed === undefined ? {} : { removed },
    ...present === undefined ? {} : { present },
    ...contentBase64 === undefined ? {} : { contentBase64 },
    ...entries === undefined ? {} : { entries },
    ...parsedFiles === undefined ? {} : { files: parsedFiles },
    ...parsedChildFiles === undefined ? {} : { childFiles: parsedChildFiles },
    ...targetIdentity === undefined || targetIdentity === null ? {} : { targetIdentity }
  };
}
function runStateHelper(directory, expected, operation, expectCreatedIdentity = false, faultForTest) {
  const requestId = crypto.randomUUID();
  const child = spawnSync(process.execPath, [
    "--no-env-file",
    "--no-install",
    "--no-macros",
    "--no-addons",
    `--config=${stateHelperConfigPath}`,
    stateHelperPath
  ], {
    cwd: directory,
    encoding: "utf8",
    env: faultForTest === undefined ? { NODE_ENV: "production" } : {
      NODE_ENV: "test",
      ...faultForTest === "insert-after-quarantine" || faultForTest === "replace-target-after-validation" ? { GHOSTGET_TEST_EMPTY_DIRECTORY_REMOVAL_RACE: faultForTest } : faultForTest === "pause-after-cas-claim" || faultForTest === "pause-after-mutation-claim-read" || faultForTest === "fail-after-cas-commit" ? { GHOSTGET_TEST_CAS_FAULT: faultForTest } : { GHOSTGET_TEST_BATCH_READ_FAULT: faultForTest }
    },
    input: JSON.stringify({ schemaVersion: 1, requestId, expected, operation }),
    maxBuffer: operation.kind === "batch-read-files" || operation.kind === "batch-read-child-files" ? MAX_PRIVATE_STATE_BATCH_STDOUT_BYTES : 180 * 1024 * 1024,
    shell: false,
    timeout: faultForTest === "pause-after-cas-claim" || faultForTest === "pause-after-mutation-claim-read" ? TEST_STATE_HELPER_TIMEOUT_MS : 30000,
    windowsHide: true
  });
  const current = inspectRealDirectoryIdentity(directory);
  if (!sameIdentity(current, expected))
    throw new Error(`GHOSTGET_STATE_HOME changed identity after validation: ${directory}`);
  if (child.error !== undefined)
    throw new Error("bound state helper failed to start", { cause: child.error });
  if (child.status !== 0) {
    const detail = child.stderr.trim().slice(0, 512);
    throw new Error(detail === "" ? "bound state helper rejected the operation" : detail);
  }
  let parsed;
  try {
    parsed = JSON.parse(child.stdout);
  } catch (error) {
    throw new Error("state helper returned invalid JSON", { cause: error });
  }
  const response = parseStateHelperResponse(parsed);
  if (!expectCreatedIdentity && !sameIdentity(response.identity, expected)) {
    throw new Error("state helper response came from the wrong directory identity");
  }
  return response;
}
function runPathHelper(directory, expected, operation) {
  const requestId = crypto.randomUUID();
  const child = spawnSync(process.execPath, [
    "--no-env-file",
    "--no-install",
    "--no-macros",
    "--no-addons",
    `--config=${stateHelperConfigPath}`,
    pathHelperPath
  ], {
    cwd: directory,
    encoding: "utf8",
    env: { NODE_ENV: "production" },
    input: JSON.stringify({ schemaVersion: 1, requestId, expected, operation }),
    maxBuffer: 180 * 1024 * 1024,
    shell: false,
    timeout: 30000,
    windowsHide: true
  });
  const current = inspectRealDirectoryIdentity(directory);
  if (!sameIdentity(current, expected))
    throw new Error(`bound path root changed identity after validation: ${directory}`);
  if (child.error !== undefined)
    throw new Error("bound path helper failed to start", { cause: child.error });
  if (child.status !== 0) {
    const detail = child.stderr.trim().slice(0, 512);
    throw new Error(detail === "" ? "bound path helper rejected the operation" : detail);
  }
  let parsed;
  try {
    parsed = JSON.parse(child.stdout);
  } catch (error) {
    throw new Error("path helper returned invalid JSON", { cause: error });
  }
  const response = parseStateHelperResponse(parsed);
  if (!sameIdentity(response.identity, expected))
    throw new Error("path helper response came from the wrong directory identity");
  return response;
}
function stateSegments(root, path) {
  const child = relative(root, canonicalNonStatePath(path));
  if (child === "")
    return [];
  if (isAbsolute(child) || child === ".." || child.startsWith(`..${sep}`))
    throw new Error(`state path escapes its root: ${path}`);
  return child.split(sep);
}
function captureStateDirectoryExpectations(root, segments) {
  const expectations = [];
  let current = root;
  let missing = false;
  for (const segment of segments) {
    current = join(current, segment);
    if (missing) {
      expectations.push(null);
      continue;
    }
    let stats;
    try {
      stats = lstatSync(current, { bigint: true });
    } catch (error) {
      if (!hasCode(error, "ENOENT"))
        throw error;
      missing = true;
      expectations.push(null);
      continue;
    }
    if (!stats.isDirectory() || stats.isSymbolicLink() || !ownedByCurrentUser(stats) || (stats.mode & 0o777n) !== 0o700n) {
      throw new Error(`ghostget state directory must be an owned real directory with mode 0700: ${current}`);
    }
    expectations.push({ device: stats.dev.toString(), inode: stats.ino.toString() });
  }
  return expectations;
}
function inspectStateRootIdentity(root) {
  let stats;
  try {
    stats = lstatSync(root, { bigint: true });
  } catch (error) {
    if (hasCode(error, "ENOENT"))
      return null;
    throw error;
  }
  if (!stats.isDirectory() || stats.isSymbolicLink() || !ownedByCurrentUser(stats)) {
    throw new Error(`GHOSTGET_STATE_HOME must be an owned real directory: ${root}`);
  }
  return { device: stats.dev.toString(), inode: stats.ino.toString() };
}
function inspectRealDirectoryIdentity(path) {
  let stats;
  try {
    stats = lstatSync(path, { bigint: true });
  } catch (error) {
    if (hasCode(error, "ENOENT"))
      return null;
    throw error;
  }
  if (!stats.isDirectory() || stats.isSymbolicLink())
    throw new Error(`path must be a real directory: ${path}`);
  return { device: stats.dev.toString(), inode: stats.ino.toString() };
}
function findCreationAnchor(root) {
  const segments = [];
  let current = root;
  for (;; ) {
    let stats;
    try {
      stats = lstatSync(current, { bigint: true });
    } catch (error) {
      if (!hasCode(error, "ENOENT"))
        throw error;
      const parent = dirname(current);
      if (parent === current)
        throw new Error(`GHOSTGET_STATE_HOME has no real existing creation anchor: ${root}`);
      segments.unshift(basename(current));
      current = parent;
      continue;
    }
    if (!stats.isDirectory() || stats.isSymbolicLink() || !ownedByCurrentUser(stats) || (stats.mode & 0o022n) !== 0n) {
      throw new Error(`GHOSTGET_STATE_HOME creation path contains a non-owned real directory: ${current}`);
    }
    return {
      identity: { device: stats.dev.toString(), inode: stats.ino.toString() },
      path: current,
      segments
    };
  }
}
function assertStateRootIdentity(root) {
  const expected = knownStateRoots.get(root);
  if (expected === undefined)
    throw new Error(`ghostget state root has not been validated: ${root}`);
  const actual = inspectStateRootIdentity(root);
  if (!sameIdentity(actual, expected.identity)) {
    throw new Error(`GHOSTGET_STATE_HOME changed identity after validation: ${root}`);
  }
  if (expected.identity === null) {
    const anchor = findCreationAnchor(root);
    if (expected.creationAnchor === null || anchor.path !== expected.creationAnchor.path || !sameIdentity(anchor.identity, expected.creationAnchor.identity) || anchor.segments.join("\x00") !== expected.creationAnchor.segments.join("\x00"))
      throw new Error(`GHOSTGET_STATE_HOME creation path changed after validation: ${root}`);
  }
  if (expected.claimed) {
    if (actual === null)
      throw new Error(`GHOSTGET_STATE_HOME disappeared after validation: ${root}`);
    const stats = lstatSync(root);
    if ((stats.mode & 511) !== 448)
      throw new Error(`GHOSTGET_STATE_HOME must remain private (mode 0700): ${root}`);
    readStateMarker(join(root, stateMarkerName));
  }
  return expected;
}
function assertNoSymbolicLinks(root, target, includeTarget, requirePrivateDirectories = false) {
  const canonicalRoot = resolve(root);
  const absoluteTarget = resolve(target);
  if (!pathInside(canonicalRoot, absoluteTarget))
    throw new Error(`state path escapes its root: ${absoluteTarget}`);
  const checkedTarget = includeTarget ? absoluteTarget : dirname(absoluteTarget);
  const child = relative(canonicalRoot, checkedTarget);
  const components = child === "" ? [] : child.split(sep);
  let current = canonicalRoot;
  const paths = [current, ...components.map((component) => {
    current = join(current, component);
    return current;
  })];
  for (const [index, path] of paths.entries()) {
    let stats;
    try {
      stats = lstatSync(path);
    } catch (error) {
      if (hasCode(error, "ENOENT"))
        return;
      throw error;
    }
    if (stats.isSymbolicLink())
      throw new Error(`ghostget state path contains a symbolic link: ${path}`);
    if (stats.isDirectory() && requirePrivateDirectories && (!ownedByCurrentUser(stats) || (stats.mode & 511) !== 448)) {
      throw new Error(`ghostget state directory must be owned and private (mode 0700): ${path}`);
    }
    if (index < paths.length - 1 && !stats.isDirectory()) {
      throw new Error(`ghostget state ancestor is not a directory: ${path}`);
    }
  }
}
function assertKnownStatePath(path, includeTarget) {
  const root = stateRootFor(path);
  if (root !== null) {
    assertStateRootIdentity(root);
    assertNoSymbolicLinks(root, path, includeTarget, true);
    assertStateRootIdentity(root);
  }
}
function assertSafeStatePath(path, environment = process.env, includeTarget = true) {
  const root = ghostgetStateHome(environment);
  assertStateRootIdentity(root);
  assertNoSymbolicLinks(root, path, includeTarget, true);
  assertStateRootIdentity(root);
}
function canonicalPotentialPath(value) {
  const suffix = [];
  let ancestor = resolve(value);
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor);
    if (parent === ancestor)
      throw new Error(`path has no existing ancestor: ${value}`);
    suffix.unshift(ancestor.slice(parent.length + (parent.endsWith("/") ? 0 : 1)));
    ancestor = parent;
  }
  const stats = lstatSync(ancestor);
  if (stats.isSymbolicLink())
    return resolve(realpathSync(ancestor), ...suffix);
  return resolve(realpathSync(ancestor), ...suffix);
}
function ownedByCurrentUser(stats) {
  const currentUid = typeof process.getuid === "function" ? process.getuid() : undefined;
  return currentUid === undefined || stats.uid === (typeof stats.uid === "bigint" ? BigInt(currentUid) : currentUid);
}
function readStateMarker(path) {
  const noFollow = "O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0;
  const nonBlocking = "O_NONBLOCK" in constants ? constants.O_NONBLOCK : 0;
  const descriptor = openSync(path, constants.O_RDONLY | noFollow | nonBlocking);
  try {
    const stats = fstatSync(descriptor);
    if (!stats.isFile() || stats.size > 256 || !ownedByCurrentUser(stats) || (stats.mode & 63) !== 0) {
      throw new Error("ghostget state marker must be a private, owned regular file");
    }
    const content = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true
    }).decode(readDescriptorBounded(descriptor, 256));
    if (content !== stateMarkerText)
      throw new Error("ghostget state marker is malformed");
    const value = JSON.parse(content);
    if (typeof value !== "object" || value === null || Array.isArray(value) || Object.keys(value).sort().join(",") !== "kind,schemaVersion" || !("schemaVersion" in value) || value.schemaVersion !== 1 || !("kind" in value) || value.kind !== "io-state")
      throw new Error("ghostget state marker is malformed");
  } finally {
    closeSync(descriptor);
  }
}
function hasGhostgetPathIdentity(path) {
  return resolve(path).split(sep).filter((segment) => segment !== "").slice(-3).some((segment) => /(?:^|[^a-z0-9])(?:ghostget|wrench|oh|io)(?:[^a-z0-9]|$)/iu.test(segment));
}
function validateUnmarkedStateRoot(root) {
  if (!hasGhostgetPathIdentity(root)) {
    throw new Error(`GHOSTGET_STATE_HOME is not marked as wrench-owned and its path does not identify dedicated ghostget state: ${root}`);
  }
  const allowed = new Set([
    ...stateDirectoryNames,
    ".cursor-encryption-key",
    ".plan-encryption-key",
    ".projection-encryption-key",
    ".recovery-encryption-key",
    ".session-encryption-key"
  ]);
  const entries = [];
  const directory = opendirSync(root);
  try {
    for (;; ) {
      const entry = directory.readSync();
      if (entry === null)
        break;
      if (entries.length >= 1e4)
        throw new Error("GHOSTGET_STATE_HOME contains more than 10000 entries");
      if (entry.name.includes("\uFFFD") || Buffer.byteLength(entry.name, "utf8") > 255) {
        throw new Error("GHOSTGET_STATE_HOME contains an unsafe entry name");
      }
      entries.push(entry);
    }
  } finally {
    directory.closeSync();
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink())
      throw new Error(`GHOSTGET_STATE_HOME contains a symbolic link: ${join(root, entry.name)}`);
    if (/^\.io-state\.stage-\d+-[0-9a-f-]{36}\.json$/u.test(entry.name)) {
      const stats2 = lstatSync(join(root, entry.name));
      if (!stats2.isFile() || !ownedByCurrentUser(stats2) || (stats2.mode & 63) !== 0 || stats2.size > 256) {
        throw new Error(`GHOSTGET_STATE_HOME contains an invalid interrupted state-marker stage: ${entry.name}`);
      }
      continue;
    }
    if (!allowed.has(entry.name)) {
      throw new Error(`GHOSTGET_STATE_HOME is not an empty or recognizable dedicated ghostget state directory: ${root}`);
    }
    if (stateDirectoryNames.includes(entry.name) && !entry.isDirectory()) {
      throw new Error(`GHOSTGET_STATE_HOME contains an invalid state entry: ${entry.name}`);
    }
    if ((entry.name === ".plan-encryption-key" || entry.name === ".cursor-encryption-key" || entry.name === ".projection-encryption-key" || entry.name === ".recovery-encryption-key" || entry.name === ".session-encryption-key") && !entry.isFile()) {
      throw new Error("GHOSTGET_STATE_HOME contains an invalid encryption key entry");
    }
    const stats = lstatSync(join(root, entry.name));
    const hasPrivateMode = entry.isDirectory() ? (stats.mode & 511) === 448 : (stats.mode & 63) === 0;
    if (!ownedByCurrentUser(stats) || !hasPrivateMode) {
      throw new Error(`GHOSTGET_STATE_HOME contains a state entry that is not owned and private: ${entry.name}`);
    }
  }
  return entries.length > 0;
}
function validateStateRoot(root) {
  if (!existsSync(root))
    return { claimed: false, creationAnchor: findCreationAnchor(root), identity: null };
  const stats = lstatSync(root, { bigint: true });
  if (!stats.isDirectory() || stats.isSymbolicLink() || !ownedByCurrentUser(stats)) {
    throw new Error(`GHOSTGET_STATE_HOME must be an owned real directory: ${root}`);
  }
  const marker = join(root, stateMarkerName);
  const claimed = existsSync(marker);
  const hasUnmarkedState = claimed ? false : validateUnmarkedStateRoot(root);
  if (claimed)
    readStateMarker(marker);
  if (!claimed && !hasUnmarkedState && (stats.mode & 0o022n) !== 0n) {
    throw new Error(`an unclaimed GHOSTGET_STATE_HOME must not be group/world-writable: ${root}`);
  }
  if ((claimed || hasUnmarkedState) && (stats.mode & 0o777n) !== 0o700n) {
    throw new Error(`GHOSTGET_STATE_HOME must be private (mode 0700) before trusted state is read: ${root}`);
  }
  return { claimed, creationAnchor: null, identity: { device: stats.dev.toString(), inode: stats.ino.toString() } };
}
function selectStateHome(environment) {
  const configuredRoots = [
    ["GHOSTGET_STATE_HOME", environment.GHOSTGET_STATE_HOME],
    ["WRENCH_STATE_HOME", environment.WRENCH_STATE_HOME],
    ["OH_STATE_HOME", environment.OH_STATE_HOME],
    ["IO_HOME", environment.IO_HOME]
  ];
  const requestedRoots = configuredRoots.flatMap(([name, value]) => {
    const trimmed = value?.trim() ?? "";
    return trimmed === "" ? [] : [{ name, root: canonicalPotentialPath(trimmed) }];
  });
  const distinctRequestedRoots = new Set(requestedRoots.map(({ root: root2 }) => root2));
  if (distinctRequestedRoots.size > 1) {
    throw new Error(`${requestedRoots.map(({ name }) => name).join(", ")} select different state roots`);
  }
  const dataRoot = environment.XDG_DATA_HOME !== undefined && environment.XDG_DATA_HOME.trim() !== "" ? resolve(environment.XDG_DATA_HOME) : join(homedir(), ".local", "share");
  const currentDefault = canonicalPotentialPath(join(dataRoot, "ghostget"));
  const legacyDefaults = [
    canonicalPotentialPath(join(dataRoot, "wrench")),
    canonicalPotentialPath(join(dataRoot, "oh")),
    canonicalPotentialPath(join(dataRoot, "io"))
  ];
  let root = requestedRoots[0]?.root ?? null;
  if (root === null) {
    const existingDefaults = [currentDefault, ...legacyDefaults].filter((candidate) => existsSync(candidate));
    if (existingDefaults.length > 1) {
      throw new Error(`multiple Ghostget and legacy state roots exist; set GHOSTGET_STATE_HOME explicitly after reconciling ${existingDefaults.join(", ")}`);
    }
    root = existingDefaults[0] ?? currentDefault;
  }
  const home = canonicalPotentialPath(homedir());
  const forbiddenRoots = new Set([
    parse(root).root,
    home,
    dirname(home),
    canonicalPotentialPath(tmpdir()),
    canonicalPotentialPath(process.cwd()),
    ...["Desktop", "Documents", "Downloads", "Library", ".cache", ".config", ".local"].map((name) => canonicalPotentialPath(join(home, name))),
    ...environment.XDG_DATA_HOME === undefined || environment.XDG_DATA_HOME.trim() === "" ? [] : [canonicalPotentialPath(environment.XDG_DATA_HOME)]
  ]);
  if (forbiddenRoots.has(root) || isWithinPath(ghostgetSourcePackageRoot, root)) {
    throw new Error(`GHOSTGET_STATE_HOME must be a dedicated child directory, not a filesystem, home, temporary, repository, or shared data root: ${root}`);
  }
  return root;
}
function privateStateFilesMayExist(collection, fileNames, environment = process.env) {
  if (!stateDirectoryNames.includes(collection) || fileNames.length < 1 || fileNames.length > 8 || fileNames.some((name) => !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u.test(name))) {
    throw new Error("optional private state file selection is invalid");
  }
  const root = selectStateHome(environment);
  const inspect = (path) => {
    try {
      return lstatSync(path, { bigint: true });
    } catch (error) {
      if (hasCode(error, "ENOENT"))
        return null;
      throw error;
    }
  };
  const inspectDirectory = (path) => {
    const stats = inspect(path);
    if (stats !== null && (!stats.isDirectory() || stats.isSymbolicLink() || !ownedByCurrentUser(stats) || (stats.mode & 0o777n) !== 0o700n)) {
      throw new Error("optional private state directory is unsafe");
    }
    return stats;
  };
  const assertUnchanged = (path, before) => {
    const after = inspect(path);
    if (before === null ? after !== null : after === null || before.dev !== after.dev || before.ino !== after.ino || before.mode !== after.mode || before.uid !== after.uid || before.ctimeNs !== after.ctimeNs || before.mtimeNs !== after.mtimeNs) {
      throw new Error("optional private state changed during inspection");
    }
  };
  if (knownStateRoots.has(root))
    assertStateRootIdentity(root);
  const rootBefore = inspectDirectory(root);
  const anchor = rootBefore === null ? findCreationAnchor(root).path : null;
  const anchorBefore = anchor === null ? null : inspect(anchor);
  const markerPath = join(root, stateMarkerName);
  const markerBefore = inspect(markerPath);
  if (markerBefore !== null)
    readStateMarker(markerPath);
  else if (rootBefore !== null && !hasGhostgetPathIdentity(root)) {
    throw new Error("optional private state root does not identify dedicated Ghostget state");
  }
  const directory = join(root, collection);
  const directoryBefore = inspectDirectory(directory);
  let present = false;
  for (const name of fileNames) {
    if (inspect(join(directory, name)) !== null)
      present = true;
  }
  if (selectStateHome(environment) !== root)
    throw new Error("optional private state root selection changed");
  assertUnchanged(directory, directoryBefore);
  assertUnchanged(markerPath, markerBefore);
  assertUnchanged(root, rootBefore);
  if (anchor !== null)
    assertUnchanged(anchor, anchorBefore);
  if (knownStateRoots.has(root))
    assertStateRootIdentity(root);
  return present;
}
function ghostgetStateHome(environment = process.env) {
  const root = selectStateHome(environment);
  const inspected = validateStateRoot(root);
  const remembered = knownStateRoots.get(root);
  if (remembered !== undefined) {
    if (!sameIdentity(remembered.identity, inspected.identity)) {
      throw new Error(`GHOSTGET_STATE_HOME changed identity after validation: ${root}`);
    }
    if (remembered.identity === null && (remembered.creationAnchor === null || inspected.creationAnchor === null || remembered.creationAnchor.path !== inspected.creationAnchor.path || !sameIdentity(remembered.creationAnchor.identity, inspected.creationAnchor.identity) || remembered.creationAnchor.segments.join("\x00") !== inspected.creationAnchor.segments.join("\x00")))
      throw new Error(`GHOSTGET_STATE_HOME creation path changed after validation: ${root}`);
    if (remembered.claimed && !inspected.claimed) {
      throw new Error(`GHOSTGET_STATE_HOME lost its ownership marker after validation: ${root}`);
    }
    knownStateRoots.set(root, { ...inspected, claimed: remembered.claimed || inspected.claimed });
  } else {
    knownStateRoots.set(root, inspected);
  }
  for (const name of stateDirectoryNames)
    assertNoSymbolicLinks(root, join(root, name), true);
  return root;
}
function ensureClaimedStateRoot(root) {
  let remembered = assertStateRootIdentity(root);
  if (remembered.identity === null) {
    const anchor = remembered.creationAnchor;
    if (anchor === null)
      throw new Error(`GHOSTGET_STATE_HOME has no validated creation anchor: ${root}`);
    const response = runStateHelper(anchor.path, anchor.identity, { kind: "create-root", segments: anchor.segments }, true);
    const current = inspectStateRootIdentity(root);
    if (!sameIdentity(current, response.identity))
      throw new Error(`GHOSTGET_STATE_HOME changed identity while being created: ${root}`);
    remembered = { claimed: true, creationAnchor: null, identity: response.identity };
    knownStateRoots.set(root, remembered);
  } else if (!remembered.claimed) {
    validateUnmarkedStateRoot(root);
    const descriptor = openSync(root, constants.O_RDONLY | ("O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0) | ("O_DIRECTORY" in constants ? constants.O_DIRECTORY : 0));
    try {
      const stats = fstatSync(descriptor, { bigint: true });
      const actual = { device: stats.dev.toString(), inode: stats.ino.toString() };
      if (!sameIdentity(actual, remembered.identity) || !ownedByCurrentUser(stats)) {
        throw new Error(`GHOSTGET_STATE_HOME changed identity while being claimed: ${root}`);
      }
      fchmodSync(descriptor, 448);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    if (!sameIdentity(inspectStateRootIdentity(root), remembered.identity)) {
      throw new Error(`GHOSTGET_STATE_HOME changed identity while being claimed: ${root}`);
    }
    runStateHelper(root, remembered.identity, { kind: "claim" });
    if (!sameIdentity(inspectStateRootIdentity(root), remembered.identity)) {
      throw new Error(`GHOSTGET_STATE_HOME changed identity while being claimed: ${root}`);
    }
    remembered = { claimed: true, creationAnchor: null, identity: remembered.identity };
    knownStateRoots.set(root, remembered);
  }
  if (remembered.identity === null)
    throw new Error(`GHOSTGET_STATE_HOME is unavailable after being claimed: ${root}`);
  assertStateRootIdentity(root);
  return remembered.identity;
}
function canonicalNonStatePath(value) {
  const absolute = resolve(value);
  const filesystemRoot = parse(absolute).root;
  const child = relative(filesystemRoot, absolute);
  const segments = child === "" ? [] : child.split(sep);
  let current = filesystemRoot;
  for (const [index, segment] of segments.entries()) {
    const candidate = join(current, segment);
    let stats;
    try {
      stats = lstatSync(candidate);
    } catch (error) {
      if (!hasCode(error, "ENOENT"))
        throw error;
      return join(current, ...segments.slice(index));
    }
    if (stats.isSymbolicLink()) {
      if (process.platform === "win32" || Number(stats.uid) !== 0) {
        throw new Error(`private path is not a real directory (symbolic link): ${candidate}`);
      }
      current = realpathSync(candidate);
      continue;
    }
    current = candidate;
  }
  return current;
}
function genericPathParts(path) {
  const canonical = canonicalNonStatePath(path);
  const root = parse(canonical).root;
  const rootIdentity = inspectRealDirectoryIdentity(root);
  if (rootIdentity === null)
    throw new Error(`path filesystem root is unavailable: ${root}`);
  const child = relative(root, canonical);
  return {
    canonical,
    root,
    rootIdentity,
    segments: child === "" ? [] : child.split(sep)
  };
}
function captureGenericDirectoryExpectations(root, segments) {
  const expectations = [];
  let current = root;
  let missing = false;
  for (const segment of segments) {
    current = join(current, segment);
    if (missing) {
      expectations.push(null);
      continue;
    }
    let stats;
    try {
      stats = lstatSync(current, { bigint: true });
    } catch (error) {
      if (!hasCode(error, "ENOENT"))
        throw error;
      missing = true;
      expectations.push(null);
      continue;
    }
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new Error(`private path ancestor is not a real directory: ${current}`);
    }
    expectations.push({ device: stats.dev.toString(), inode: stats.ino.toString() });
  }
  return expectations;
}
function ensureBoundNonStateDirectory(path, requireFinalPrivate) {
  const parts = genericPathParts(path);
  runPathHelper(parts.root, parts.rootIdentity, {
    kind: "ensure-directories",
    segments: parts.segments,
    directoryExpectations: captureGenericDirectoryExpectations(parts.root, parts.segments),
    requireFinalPrivate
  });
  return genericPathParts(parts.canonical);
}
function removePrivateDirectoryTree(path, expectedTarget) {
  const parts = genericPathParts(path);
  if (parts.segments.length < 2)
    throw new Error("private recursive removal target is too broad");
  const captured = [...captureGenericDirectoryExpectations(parts.root, parts.segments)];
  if (expectedTarget !== undefined) {
    captured[captured.length - 1] = {
      device: expectedTarget.device,
      inode: expectedTarget.inode
    };
  }
  const response = runPathHelper(parts.root, parts.rootIdentity, {
    kind: "remove-directory-tree",
    segments: parts.segments,
    directoryExpectations: captured,
    expectedTargetBirthtimeNs: expectedTarget?.birthtimeNs ?? null
  });
  return response.removed === true;
}
function ensurePrivateDirectory(path) {
  const target = resolve(path);
  const root = stateRootFor(target);
  if (root !== null) {
    const identity = ensureClaimedStateRoot(root);
    const segments = stateSegments(root, target);
    if (segments.length > 0) {
      runStateHelper(root, identity, {
        kind: "ensure-directories",
        segments,
        directoryExpectations: captureStateDirectoryExpectations(root, segments)
      });
    }
    assertKnownStatePath(target, true);
    return;
  }
  ensureBoundNonStateDirectory(target, true);
}
function ensurePrivateStateDirectory(path, environment = process.env) {
  assertSafeStatePath(path, environment);
  const root = ghostgetStateHome(environment);
  const identity = ensureClaimedStateRoot(root);
  const segments = stateSegments(root, path);
  if (segments.length === 0)
    return identity;
  const response = runStateHelper(root, identity, {
    kind: "ensure-directories",
    segments,
    directoryExpectations: captureStateDirectoryExpectations(root, segments)
  });
  if (response.targetIdentity === undefined) {
    throw new Error("state helper omitted the ensured directory identity");
  }
  return response.targetIdentity;
}
function readPrivateStateFileBytesIfPresent(path, maximumBytes, label, environment = process.env, expectedStateDirectories) {
  assertSafeStatePath(path, environment);
  const root = ghostgetStateHome(environment);
  const identity = ensureClaimedStateRoot(root);
  const segments = stateSegments(root, path);
  if (segments.length < 2)
    throw new Error(`${label} must be nested inside an ghostget state directory`);
  const directoryExpectations = [...captureStateDirectoryExpectations(root, segments.slice(0, -1))];
  if (expectedStateDirectories !== undefined) {
    if (expectedStateDirectories.length !== directoryExpectations.length) {
      throw new Error(`optional ${label} directory identity count does not match its state path`);
    }
    directoryExpectations.splice(0, directoryExpectations.length, ...expectedStateDirectories);
  }
  let response;
  try {
    response = runStateHelper(root, identity, {
      kind: "read-file-if-present",
      segments,
      directoryExpectations,
      maximumBytes
    });
  } catch (error) {
    const detail = error instanceof Error ? ` (${error.message})` : "";
    throw new Error(`could not safely open optional ${label}: ${path}${detail}`, { cause: error });
  }
  if (response.present === false) {
    if (response.contentBase64 !== undefined)
      throw new Error(`optional ${label} returned content while absent`);
    return null;
  }
  if (response.present !== true)
    throw new Error(`optional ${label} omitted its presence state`);
  const encoded = response.contentBase64;
  if (encoded === undefined || encoded.length > Math.ceil(maximumBytes / 3) * 4 + 4 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(encoded))
    throw new Error(`optional ${label} returned malformed bounded content`);
  const content = Buffer.from(encoded, "base64");
  if (content.byteLength > maximumBytes)
    throw new Error(`optional ${label} grew beyond ${maximumBytes} bytes while being read`);
  return content;
}
function readPrivateStateFileIfPresent(path, maximumBytes, label, environment = process.env, expectedStateDirectories) {
  const content = readPrivateStateFileBytesIfPresent(path, maximumBytes, label, environment, expectedStateDirectories);
  if (content === null)
    return null;
  try {
    return new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true
    }).decode(content);
  } catch (error) {
    throw new Error(`optional ${label} is not valid UTF-8`, { cause: error });
  }
}
function readRegularFile(path, maximumBytes, label = "file", expectedStateParent) {
  let stateRoot;
  try {
    stateRoot = stateRootFor(path);
  } catch (error) {
    const reason = error instanceof Error && error.message.includes("symbolic link") ? " (state path contains a symbolic link)" : "";
    throw new Error(`could not safely open ${label}: ${path}${reason}`, { cause: error });
  }
  if (stateRoot !== null) {
    ensurePrivateDirectory(stateRoot);
    const record = assertStateRootIdentity(stateRoot);
    if (record.identity === null || !record.claimed)
      throw new Error("ghostget state root is not claimed");
    const segments = stateSegments(stateRoot, path);
    if (segments.length === 0) {
      throw new Error(`${label} must be a regular file no larger than ${maximumBytes} bytes`);
    }
    let response2;
    try {
      const directoryExpectations = [...captureStateDirectoryExpectations(stateRoot, segments.slice(0, -1))];
      if (expectedStateParent !== undefined && directoryExpectations.length > 0 && directoryExpectations.at(-1) !== null) {
        directoryExpectations[directoryExpectations.length - 1] = expectedStateParent;
      }
      response2 = runStateHelper(stateRoot, record.identity, {
        kind: "read-file",
        segments,
        directoryExpectations,
        maximumBytes
      });
    } catch (error) {
      const reason = error instanceof Error && error.message.includes("symbolic link") ? " (state path contains a symbolic link)" : "";
      throw new Error(`could not safely open ${label}: ${path}${reason}`, { cause: error });
    }
    const encoded2 = response2.contentBase64;
    if (encoded2 === undefined || encoded2.length > Math.ceil(maximumBytes / 3) * 4 + 4 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(encoded2))
      throw new Error(`${label} returned malformed bounded content`);
    const content2 = Buffer.from(encoded2, "base64");
    if (content2.byteLength > maximumBytes)
      throw new Error(`${label} grew beyond ${maximumBytes} bytes while being read`);
    try {
      return new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true
      }).decode(content2);
    } catch (error) {
      throw new Error(`${label} is not valid UTF-8`, { cause: error });
    }
  }
  const parts = genericPathParts(path);
  if (parts.segments.length === 0)
    throw new Error(`${label} must be a regular file`);
  let response;
  try {
    response = runPathHelper(parts.root, parts.rootIdentity, {
      kind: "read-file",
      segments: parts.segments,
      directoryExpectations: captureGenericDirectoryExpectations(parts.root, parts.segments.slice(0, -1)),
      maximumBytes
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes("bounded regular file") || error.message.includes("byte bound") || error.message.includes("no longer matches its validated file identity"))) {
      throw new Error(`${label} must be a regular file no larger than ${maximumBytes} bytes`, { cause: error });
    }
    throw new Error(`could not safely open ${label}: ${path}`, { cause: error });
  }
  const encoded = response.contentBase64;
  if (encoded === undefined || encoded.length > Math.ceil(maximumBytes / 3) * 4 + 4 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(encoded))
    throw new Error(`${label} returned malformed bounded content`);
  const content = Buffer.from(encoded, "base64");
  if (content.byteLength > maximumBytes)
    throw new Error(`${label} grew beyond ${maximumBytes} bytes while being read`);
  try {
    return new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true
    }).decode(content);
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8`, { cause: error });
  }
}
function readJsonFile(path) {
  return JSON.parse(readRegularFile(path, MAX_WRENCH_JSON_BYTES, "JSON file"));
}
function writePrivateJson(path, value, options = {}) {
  const parent = dirname(path);
  const stateRoot = stateRootFor(path);
  if (stateRoot !== null) {
    const identity = ensureClaimedStateRoot(stateRoot);
    const segments = stateSegments(stateRoot, path);
    runStateHelper(stateRoot, identity, {
      kind: "write-file",
      segments,
      directoryExpectations: captureStateDirectoryExpectations(stateRoot, segments.slice(0, -1)),
      content: `${canonicalJson(value)}
`,
      createOnly: false,
      expectedContentSha256: null,
      maximumExpectedContentBytes: DEFAULT_PRIVATE_STATE_EXPECTED_CONTENT_BYTES
    });
    return;
  }
  const parentParts = ensureBoundNonStateDirectory(parent, options.privateParent === true);
  const destination = genericPathParts(join(parentParts.canonical, basename(path)));
  runPathHelper(destination.root, destination.rootIdentity, {
    kind: "write-file",
    segments: destination.segments,
    directoryExpectations: captureGenericDirectoryExpectations(destination.root, destination.segments.slice(0, -1)),
    content: `${canonicalJson(value)}
`,
    createOnly: false
  });
}
function writePrivateJsonIfUnchanged(path, value, options) {
  if (!/^[0-9a-f]{64}$/u.test(options.expectedCurrentContentSha256)) {
    throw new Error("expected private state content hash is invalid");
  }
  const maximumExpectedCurrentBytes = options.maximumExpectedCurrentBytes ?? DEFAULT_PRIVATE_STATE_EXPECTED_CONTENT_BYTES;
  if (!Number.isSafeInteger(maximumExpectedCurrentBytes) || maximumExpectedCurrentBytes < 0 || maximumExpectedCurrentBytes > MAX_PRIVATE_STATE_EXPECTED_CONTENT_BYTES) {
    throw new Error("expected private state content byte bound is invalid");
  }
  if ((options.pauseAfterClaimForTest === true || options.pauseAfterMutationClaimReadForTest === true || options.failAfterCommitForTest === true) && true) {
    throw new Error("state CAS fault injection is available only in tests");
  }
  const stateRoot = stateRootFor(path);
  if (stateRoot === null) {
    if (options.pauseAfterClaimForTest === true || options.pauseAfterMutationClaimReadForTest === true || options.failAfterCommitForTest === true) {
      throw new Error("compare-and-swap fault injection requires a GHOSTGET_STATE_HOME path");
    }
    const parentParts = ensureBoundNonStateDirectory(dirname(path), options.privateParent === true);
    const destination = genericPathParts(join(parentParts.canonical, basename(path)));
    try {
      runPathHelper(destination.root, destination.rootIdentity, {
        kind: "write-file",
        segments: destination.segments,
        directoryExpectations: captureGenericDirectoryExpectations(destination.root, destination.segments.slice(0, -1)),
        content: `${canonicalJson(value)}
`,
        createOnly: false,
        expectedContentSha256: options.expectedCurrentContentSha256,
        maximumExpectedContentBytes: maximumExpectedCurrentBytes
      });
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes("file content no longer matches the expected hash"))
        return false;
      throw error;
    }
  }
  const identity = ensureClaimedStateRoot(stateRoot);
  const segments = stateSegments(stateRoot, path);
  const replacementContent = `${canonicalJson(value)}
`;
  try {
    runStateHelper(stateRoot, identity, {
      kind: "write-file",
      segments,
      directoryExpectations: captureStateDirectoryExpectations(stateRoot, segments.slice(0, -1)),
      content: replacementContent,
      createOnly: false,
      expectedContentSha256: options.expectedCurrentContentSha256,
      maximumExpectedContentBytes: maximumExpectedCurrentBytes
    }, false, options.pauseAfterClaimForTest === true ? "pause-after-cas-claim" : options.pauseAfterMutationClaimReadForTest === true ? "pause-after-mutation-claim-read" : options.failAfterCommitForTest === true ? "fail-after-cas-commit" : undefined);
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes("state file content no longer matches the expected hash")) {
      return false;
    }
    throw error;
  }
}
function createPrivateJsonIfAbsent(path, value, options = {}) {
  const parent = dirname(path);
  if (options.environment !== undefined)
    ghostgetStateHome(options.environment);
  const stateRoot = stateRootFor(path);
  if (stateRoot !== null) {
    const identity = ensureClaimedStateRoot(stateRoot);
    if (options.beforePublish !== undefined) {
      const previewDirectory = mkdtempSync(join(tmpdir(), "wrench-create-preview-"));
      const previewPath = join(previewDirectory, "value.json");
      try {
        const directoryDescriptor = openSync(previewDirectory, constants.O_RDONLY | ("O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0) | ("O_DIRECTORY" in constants ? constants.O_DIRECTORY : 0));
        try {
          fchmodSync(directoryDescriptor, 448);
        } finally {
          closeSync(directoryDescriptor);
        }
        writeFileSync(previewPath, `${canonicalJson(value)}
`, { encoding: "utf8", flag: "wx", mode: 384 });
        options.beforePublish(previewPath);
      } finally {
        rmSync(previewDirectory, { recursive: true, force: true });
      }
    }
    const segments = stateSegments(stateRoot, path);
    const directoryExpectations = [...captureStateDirectoryExpectations(stateRoot, segments.slice(0, -1))];
    if (options.expectedStateParent !== undefined && options.expectedStateDirectories !== undefined) {
      throw new Error("expected state parent cannot be combined with expected state directories");
    }
    if (options.expectedStateDirectories !== undefined) {
      if (options.expectedStateDirectories.length !== directoryExpectations.length) {
        throw new Error("expected state-directory identity count does not match the JSON path");
      }
      directoryExpectations.splice(0, directoryExpectations.length, ...options.expectedStateDirectories);
    }
    if (options.expectedStateParent !== undefined) {
      if (directoryExpectations.length === 0)
        throw new Error("expected state parent requires a nested JSON path");
      directoryExpectations[directoryExpectations.length - 1] = options.expectedStateParent;
    }
    const response2 = runStateHelper(stateRoot, identity, {
      kind: "write-file",
      segments,
      directoryExpectations,
      content: `${canonicalJson(value)}
`,
      createOnly: true,
      expectedContentSha256: null,
      maximumExpectedContentBytes: DEFAULT_PRIVATE_STATE_EXPECTED_CONTENT_BYTES
    });
    return { created: response2.created === true };
  }
  if (options.expectedStateParent !== undefined || options.expectedStateDirectories !== undefined) {
    throw new Error("state-directory identity expectations require an ghostget state path");
  }
  if (options.environment !== undefined)
    assertSafeStatePath(path, options.environment);
  if (options.beforePublish !== undefined) {
    const previewDirectory = mkdtempSync(join(tmpdir(), "wrench-create-preview-"));
    const previewPath = join(previewDirectory, "value.json");
    try {
      chmodSync(previewDirectory, 448);
      writeFileSync(previewPath, `${canonicalJson(value)}
`, { encoding: "utf8", flag: "wx", mode: 384 });
      options.beforePublish(previewPath);
    } finally {
      rmSync(previewDirectory, { recursive: true, force: true });
    }
  }
  const parentParts = ensureBoundNonStateDirectory(parent, options.privateParent === true);
  const destination = genericPathParts(join(parentParts.canonical, basename(path)));
  const response = runPathHelper(destination.root, destination.rootIdentity, {
    kind: "write-file",
    segments: destination.segments,
    directoryExpectations: captureGenericDirectoryExpectations(destination.root, destination.segments.slice(0, -1)),
    content: `${canonicalJson(value)}
`,
    createOnly: true
  });
  return { created: response.created === true };
}
function removePrivateStateFile(path, environment = process.env, expectedStateParent) {
  assertSafeStatePath(path, environment);
  const root = ghostgetStateHome(environment);
  ensurePrivateDirectory(root);
  const record = assertStateRootIdentity(root);
  if (record.identity === null || !record.claimed)
    throw new Error("ghostget state root is not claimed");
  const segments = stateSegments(root, path);
  const directoryExpectations = [...captureStateDirectoryExpectations(root, segments.slice(0, -1))];
  if (expectedStateParent !== undefined && directoryExpectations.length > 0 && directoryExpectations.at(-1) !== null) {
    directoryExpectations[directoryExpectations.length - 1] = expectedStateParent;
  }
  const response = runStateHelper(root, record.identity, {
    kind: "remove-file",
    segments,
    directoryExpectations
  });
  return response.removed === true;
}
function removePrivateStateFileIfUnchanged(path, options, environment = process.env) {
  if (!/^[0-9a-f]{64}$/u.test(options.expectedCurrentContentSha256)) {
    throw new Error("expected private state content hash is invalid");
  }
  assertSafeStatePath(path, environment);
  const root = ghostgetStateHome(environment);
  const identity = ensureClaimedStateRoot(root);
  const segments = stateSegments(root, path);
  if (segments.length < 2) {
    throw new Error("conditional state-file removal requires a nested state path");
  }
  const response = runStateHelper(root, identity, {
    kind: "remove-file-if-unchanged",
    segments,
    directoryExpectations: captureStateDirectoryExpectations(root, segments.slice(0, -1)),
    expectedContentSha256: options.expectedCurrentContentSha256
  });
  return response.removed === true;
}
function listPrivateStateDirectory(path, environment = process.env, expectedTarget, options = {}) {
  return snapshotPrivateStateDirectory(path, environment, expectedTarget, options).entries;
}
function snapshotPrivateStateDirectory(path, environment = process.env, expectedTarget, options = {}) {
  const root = ghostgetStateHome(environment);
  const identity = ensureClaimedStateRoot(root);
  const segments = stateSegments(root, path);
  if (segments.length === 0)
    throw new Error("the ghostget state root cannot be listed as a state collection");
  const directoryExpectations = [...captureStateDirectoryExpectations(root, segments)];
  if (expectedTarget !== undefined && directoryExpectations.at(-1) !== null) {
    directoryExpectations[directoryExpectations.length - 1] = expectedTarget;
  }
  const response = runStateHelper(root, identity, {
    kind: "list-directory",
    segments,
    directoryExpectations,
    recoverOrphanedMutationClaims: options.recoverOrphanedMutationClaims === true
  });
  if (response.entries === undefined)
    throw new Error("state helper omitted its directory entries");
  return Object.freeze({
    identity: response.targetIdentity ?? null,
    entries: response.entries
  });
}
function readPrivateStateFilesBatch(path, names, options) {
  if (!Number.isSafeInteger(options.maximumBytesPerFile) || options.maximumBytesPerFile < 0 || options.maximumBytesPerFile > MAX_PRIVATE_STATE_BATCH_FILE_BYTES) {
    throw new Error("private state batch per-file byte bound is invalid");
  }
  if (!Number.isSafeInteger(options.maximumTotalBytes) || options.maximumTotalBytes < 0 || options.maximumTotalBytes > MAX_PRIVATE_STATE_BATCH_TOTAL_BYTES) {
    throw new Error("private state batch aggregate byte bound is invalid");
  }
  if (!Array.isArray(names) || names.length > MAX_PRIVATE_STATE_BATCH_FILES) {
    throw new Error("private state batch file count is invalid");
  }
  let nameBytes = 0;
  const validatedNames = [];
  for (const name of names) {
    if (!isSafeBatchFileName(name)) {
      throw new Error("private state batch contains an invalid file name");
    }
    nameBytes += Buffer.byteLength(name, "utf8");
    if (nameBytes > MAX_PRIVATE_STATE_BATCH_NAME_BYTES) {
      throw new Error("private state batch file names exceed their byte bound");
    }
    validatedNames.push(name);
  }
  if (new Set(validatedNames).size !== validatedNames.length) {
    throw new Error("private state batch file names must be unique");
  }
  if (options.faultForTest !== undefined && true) {
    throw new Error("private state batch fault injection is available only under the test runtime");
  }
  const environment = options.environment ?? process.env;
  let root;
  let identity;
  let segments;
  let directoryExpectations;
  try {
    assertSafeStatePath(path, environment);
    root = ghostgetStateHome(environment);
    identity = ensureClaimedStateRoot(root);
    segments = stateSegments(root, path);
    if (segments.length === 0) {
      throw new Error("root is not a state collection");
    }
    directoryExpectations = [
      ...captureStateDirectoryExpectations(root, segments)
    ];
  } catch {
    throw new Error("private state batch directory is unsafe");
  }
  const capturedTarget = directoryExpectations.at(-1);
  if (capturedTarget === undefined || capturedTarget === null) {
    throw new Error("private state batch directory is absent");
  }
  const expectedTarget = options.expectedDirectoryIdentity ?? capturedTarget;
  if (!sameIdentity(capturedTarget, expectedTarget)) {
    throw new Error("private state batch directory changed identity");
  }
  directoryExpectations[directoryExpectations.length - 1] = expectedTarget;
  let response;
  try {
    response = runStateHelper(root, identity, {
      kind: "batch-read-files",
      segments,
      directoryExpectations,
      names: validatedNames,
      maximumBytesPerFile: options.maximumBytesPerFile,
      maximumTotalBytes: options.maximumTotalBytes
    }, false, options.faultForTest);
  } catch (error) {
    if (error instanceof Error && (error.message.includes("malformed response") || error.message.includes("invalid JSON"))) {
      throw new Error("state helper returned a malformed batch response");
    }
    throw new Error("private state batch helper rejected the snapshot");
  }
  if (response.targetIdentity === undefined || !sameIdentity(response.targetIdentity, expectedTarget)) {
    throw new Error("private state batch directory changed identity");
  }
  let currentTarget;
  try {
    currentTarget = inspectRealDirectoryIdentity(path);
  } catch {
    throw new Error("private state batch directory changed identity");
  }
  if (!sameIdentity(currentTarget, expectedTarget)) {
    throw new Error("private state batch directory changed identity");
  }
  const files = response.files;
  if (files === undefined || files.length !== validatedNames.length || files.some((file, index) => file.name !== validatedNames[index])) {
    throw new Error("state helper returned a malformed batch response");
  }
  const results = [];
  let totalBytes = 0;
  for (const file of files) {
    if (file.status === "absent") {
      results.push(Object.freeze({ name: file.name, status: "absent" }));
      continue;
    }
    if (file.status === "invalid") {
      results.push(Object.freeze({
        name: file.name,
        status: "invalid",
        reason: file.reason
      }));
      continue;
    }
    const content = decodeCanonicalBase64(file.contentBase64, options.maximumBytesPerFile);
    if (content === null) {
      throw new Error("state helper returned a malformed batch response");
    }
    totalBytes += content.byteLength;
    if (totalBytes > options.maximumTotalBytes) {
      throw new Error("state helper returned a malformed batch response");
    }
    try {
      results.push(Object.freeze({
        name: file.name,
        status: "present",
        content: new TextDecoder("utf-8", {
          fatal: true,
          ignoreBOM: true
        }).decode(content)
      }));
    } catch {
      results.push(Object.freeze({
        name: file.name,
        status: "invalid",
        reason: "invalid-utf8"
      }));
    }
  }
  return Object.freeze(results);
}
function readPrivateStateFilesBatched(path, names, options) {
  if (!Array.isArray(names) || names.length > 1e4) {
    throw new Error("private state collection file count is invalid");
  }
  if (names.some((name) => !isSafeBatchFileName(name))) {
    throw new Error("private state collection contains an invalid file name");
  }
  if (new Set(names).size !== names.length) {
    throw new Error("private state collection file names must be unique");
  }
  if (!Number.isSafeInteger(options.maximumBytesPerFile) || options.maximumBytesPerFile < 0 || options.maximumBytesPerFile > MAX_PRIVATE_STATE_BATCH_FILE_BYTES) {
    throw new Error("private state collection per-file byte bound is invalid");
  }
  const filesPerBatch = options.maximumBytesPerFile === 0 ? MAX_PRIVATE_STATE_BATCH_FILES : Math.min(MAX_PRIVATE_STATE_BATCH_FILES, Math.floor(MAX_PRIVATE_STATE_BATCH_TOTAL_BYTES / options.maximumBytesPerFile));
  const results = [];
  for (let index = 0;index < names.length; index += filesPerBatch) {
    const batchNames = names.slice(index, index + filesPerBatch);
    results.push(...readPrivateStateFilesBatch(path, batchNames, {
      maximumBytesPerFile: options.maximumBytesPerFile,
      maximumTotalBytes: options.maximumBytesPerFile * batchNames.length,
      ...options.environment === undefined ? {} : { environment: options.environment },
      expectedDirectoryIdentity: options.expectedDirectoryIdentity
    }));
  }
  return Object.freeze(results);
}
function removePrivateStateDirectoryTree(path, environment = process.env, expectedTarget, expectedParent) {
  const root = ghostgetStateHome(environment);
  const identity = ensureClaimedStateRoot(root);
  const segments = stateSegments(root, path);
  if (segments.length < 2)
    throw new Error("only a nested ghostget state directory can be recursively removed");
  const captured = [...captureStateDirectoryExpectations(root, segments)];
  if (expectedTarget !== undefined && captured.at(-1) !== null)
    captured[captured.length - 1] = expectedTarget;
  if (expectedParent !== undefined && captured.length > 1 && captured.at(-2) !== null) {
    captured[captured.length - 2] = expectedParent;
  }
  const response = runStateHelper(root, identity, {
    kind: "remove-directory-tree",
    segments,
    directoryExpectations: captured
  });
  return response.removed === true;
}
function adapterDirectory(environment = process.env) {
  return join(ghostgetStateHome(environment), "adapters");
}
function adapterManifestPath(id, environment = process.env) {
  if (!/^[a-z][a-z0-9-]{0,47}$/u.test(id))
    throw new Error("adapter ID must be lowercase kebab-case");
  return join(adapterDirectory(environment), id, "io-adapter.json");
}
var adapterGenerationKind = "io-adapter-generation";
var adapterGenerationSchemaVersion = 1;
var adapterGenerationMaximumEntries = 1000;
var adapterGenerationMaximumIndexBytes = 1024 * 1024;
var adapterGenerationIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
var contentSha256Pattern = /^[0-9a-f]{64}$/u;
var activeAdapterGenerationTransactions = new Map;
function isAdapterId(value) {
  return typeof value === "string" && /^[a-z][a-z0-9-]{0,47}$/u.test(value);
}
function adapterGenerationDirectory(environment) {
  return join(ghostgetStateHome(environment), "adapter-generations");
}
function adapterGenerationIndexPath(environment) {
  return join(adapterGenerationDirectory(environment), "current.json");
}
function adapterGenerationObjectsDirectory(environment) {
  return join(adapterGenerationDirectory(environment), "objects");
}
function adapterGenerationObjectPath(contentSha256, environment) {
  if (!contentSha256Pattern.test(contentSha256)) {
    throw new Error("adapter generation object hash is invalid");
  }
  return join(adapterGenerationObjectsDirectory(environment), `${contentSha256}.json`);
}
function parseAdapterGenerationEntry(value) {
  if (!isRecord3(value)) {
    throw new Error("adapter generation entry must be an object");
  }
  if (!("state" in value) || value.state === "absent") {
    if (!exactObjectKeys(value, ["id", "state"]) || !isAdapterId(value.id) || value.state !== "absent") {
      throw new Error("adapter generation absent entry is malformed");
    }
    return Object.freeze({ id: value.id, state: "absent" });
  }
  if (!exactObjectKeys(value, [
    "id",
    "manifestHash",
    "objectContentSha256",
    "sourceContentSha256",
    "state"
  ]) || !isAdapterId(value.id) || value.state !== "present" || typeof value.objectContentSha256 !== "string" || !contentSha256Pattern.test(value.objectContentSha256) || typeof value.manifestHash !== "string" || !contentSha256Pattern.test(value.manifestHash) || typeof value.sourceContentSha256 !== "string" || !contentSha256Pattern.test(value.sourceContentSha256)) {
    throw new Error("adapter generation present entry is malformed");
  }
  return Object.freeze({
    id: value.id,
    state: "present",
    objectContentSha256: value.objectContentSha256,
    manifestHash: value.manifestHash,
    sourceContentSha256: value.sourceContentSha256
  });
}
function parseAdapterGenerationIndex(value) {
  if (!isRecord3(value) || !exactObjectKeys(value, ["commitId", "entries", "kind", "schemaVersion"]) || value.kind !== adapterGenerationKind || value.schemaVersion !== adapterGenerationSchemaVersion || typeof value.commitId !== "string" || !adapterGenerationIdPattern.test(value.commitId) || !Array.isArray(value.entries) || value.entries.length > adapterGenerationMaximumEntries) {
    throw new Error("adapter generation index is malformed");
  }
  const entries = value.entries.map(parseAdapterGenerationEntry);
  const ids = entries.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length || ids.some((id, index) => index > 0 && id <= ids[index - 1])) {
    throw new Error("adapter generation entries must have unique sorted IDs");
  }
  return Object.freeze({
    kind: adapterGenerationKind,
    schemaVersion: adapterGenerationSchemaVersion,
    commitId: value.commitId,
    entries: Object.freeze(entries)
  });
}
function readOptionalAdapterGenerationJson(path, label, environment) {
  const content = readPrivateStateFileIfPresent(path, adapterGenerationMaximumIndexBytes, label, environment);
  if (content === null)
    return null;
  let value;
  try {
    value = JSON.parse(content);
  } catch (error) {
    throw new Error(`${label} is not valid JSON`, { cause: error });
  }
  return Object.freeze({
    content,
    contentSha256: sha256(content),
    value
  });
}
function readAdapterGenerationIndex(environment) {
  const record = readOptionalAdapterGenerationJson(adapterGenerationIndexPath(environment), "adapter generation index", environment);
  if (record === null)
    return null;
  if (`${canonicalJson(record.value)}
` !== record.content) {
    throw new Error("adapter generation index is not canonical JSON");
  }
  return parseAdapterGenerationIndex(record.value);
}
function readAdapterGenerationObject(entry, environment, parseInstalled) {
  let content;
  try {
    content = readPrivateStateFileIfPresent(adapterGenerationObjectPath(entry.objectContentSha256, environment), MAX_WRENCH_JSON_BYTES, "adapter generation object", environment);
  } catch (error) {
    return {
      result: {
        ok: false,
        issues: [error instanceof Error ? error.message : String(error)]
      },
      availability: "unsafe",
      contentSha256: entry.objectContentSha256
    };
  }
  return parseAdapterGenerationObjectContent(entry, content, parseInstalled);
}
function parseAdapterGenerationObjectContent(entry, content, parseInstalled) {
  if (content === null || sha256(content) !== entry.objectContentSha256) {
    return {
      result: {
        ok: false,
        issues: ["adapter generation object is missing or hash-mismatched"]
      },
      availability: "unsafe",
      contentSha256: entry.objectContentSha256
    };
  }
  try {
    const value = JSON.parse(content);
    if (`${canonicalJson(value)}
` !== content) {
      throw new Error("adapter generation object is not canonical JSON");
    }
    const result = parseInstalled(value);
    if (result.ok && (result.value.id !== entry.id || manifestHash(result.value) !== entry.manifestHash)) {
      return {
        result: {
          ok: false,
          issues: ["adapter generation object identity does not match its index"]
        },
        availability: "unsafe",
        contentSha256: entry.objectContentSha256
      };
    }
    return {
      result,
      availability: "present",
      contentSha256: entry.objectContentSha256
    };
  } catch (error) {
    return {
      result: {
        ok: false,
        issues: [error instanceof Error ? error.message : String(error)]
      },
      availability: "unsafe",
      contentSha256: entry.objectContentSha256
    };
  }
}
function generationEntryById(index, id) {
  return index?.entries.find((entry) => entry.id === id);
}
function loadInstalledManifestSnapshotWith(id, environment, parseInstalled) {
  let index;
  try {
    index = readAdapterGenerationIndex(environment);
  } catch (error) {
    return {
      result: {
        ok: false,
        issues: [error instanceof Error ? error.message : String(error)]
      },
      availability: "unsafe",
      contentSha256: null
    };
  }
  const generationEntry = generationEntryById(index, id);
  if (generationEntry?.state === "absent") {
    return {
      result: {
        ok: false,
        issues: [`adapter ${id} is not installed`]
      },
      availability: "absent",
      contentSha256: null
    };
  }
  if (generationEntry?.state === "present") {
    return readAdapterGenerationObject(generationEntry, environment, parseInstalled);
  }
  const path = adapterManifestPath(id, environment);
  let content;
  try {
    content = readPrivateStateFileIfPresent(path, MAX_WRENCH_JSON_BYTES, "installed adapter manifest", environment);
  } catch (error) {
    return {
      result: { ok: false, issues: [error instanceof Error ? error.message : String(error)] },
      availability: "unsafe",
      contentSha256: null
    };
  }
  if (content === null) {
    return {
      result: { ok: false, issues: [`adapter ${id} is not installed`] },
      availability: "absent",
      contentSha256: null
    };
  }
  try {
    return {
      result: parseInstalled(JSON.parse(content)),
      availability: "present",
      contentSha256: sha256(content)
    };
  } catch (error) {
    return {
      result: { ok: false, issues: [error instanceof Error ? error.message : String(error)] },
      availability: "present",
      contentSha256: sha256(content)
    };
  }
}
function loadInstalledManifestSnapshot(id, environment = process.env, registry) {
  return loadInstalledManifestSnapshotWith(id, environment, (value) => parseRuntimeManifest(value, requireManifestRegistry(registry)));
}
function loadInstalledManifest(id, environment = process.env, registry) {
  return loadInstalledManifestSnapshot(id, environment, registry).result;
}

export { operationRisks, isProviderOperation, isWebSessionOperation, isReviewedTemplateOperation, isLocalCliOperation, parseRuntimeManifest, validateOperationInput, validatePlatformOperationInput, expandBrowserRecipe, manifestHash, MAX_WRENCH_JSON_BYTES, isGhostgetStatePath, assertSafeStatePath, privateStateFilesMayExist, ghostgetStateHome, removePrivateDirectoryTree, ensurePrivateDirectory, ensurePrivateStateDirectory, readPrivateStateFileIfPresent, readRegularFile, readJsonFile, writePrivateJson, writePrivateJsonIfUnchanged, createPrivateJsonIfAbsent, removePrivateStateFile, removePrivateStateFileIfUnchanged, listPrivateStateDirectory, snapshotPrivateStateDirectory, readPrivateStateFilesBatched, removePrivateStateDirectoryTree, loadInstalledManifestSnapshot, loadInstalledManifest };

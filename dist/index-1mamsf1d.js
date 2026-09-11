// @bun
import {
  isProviderPluginOperationName
} from "./index-26yq8q16.js";
import {
  sha256
} from "./index-8sbt8qwx.js";

// src/providers/beeper-local.ts
import { isAbsolute } from "path";
import { types as nodeTypes2 } from "util";
// src/assets/adapters/beeper/wrench-web-adapter.json
var wrench_web_adapter_default = {
  schemaVersion: 6,
  id: "beeper-local",
  version: "2.4.0",
  displayName: "Beeper (Pinned Local CLI)",
  surfaceId: "beeper",
  origins: [
    "https://www.beeper.com"
  ],
  browserDomains: [
    "www.beeper.com"
  ],
  operations: {
    "accounts.list": {
      description: "List the exact account realm bound to the fixed local Beeper Desktop target.",
      risk: "R1",
      sideEffect: "none",
      idempotency: "none",
      dedupeWindowMs: 0,
      input: {
        properties: {},
        required: []
      },
      localCli: {
        surface: "beeper",
        action: "accounts.list",
        contractVersion: 2,
        timeoutMs: 120000,
        maxOutputBytes: 10485760
      }
    },
    "accounts.read": {
      description: "Read one exact connected Beeper account.",
      risk: "R1",
      sideEffect: "none",
      idempotency: "none",
      dedupeWindowMs: 0,
      input: {
        properties: {
          account_id: {
            type: "string",
            description: "Exact Beeper account ID returned by this adapter",
            minLength: 1,
            maxLength: 512
          }
        },
        required: [
          "account_id"
        ]
      },
      localCli: {
        surface: "beeper",
        action: "accounts.read",
        contractVersion: 1,
        timeoutMs: 120000,
        maxOutputBytes: 10485760
      }
    },
    "bridges.list": {
      description: "List one bounded, secret-free bridge capability catalog.",
      risk: "R1",
      sideEffect: "none",
      idempotency: "none",
      dedupeWindowMs: 0,
      input: {
        properties: {
          provider: {
            type: "string",
            description: "Optional exact bridge provider class",
            minLength: 1,
            maxLength: 32,
            enum: [
              "local",
              "cloud",
              "self-hosted",
              "platform-sdk"
            ]
          },
          available: {
            type: "boolean",
            description: "Optionally require current availability"
          },
          limit: {
            type: "number",
            description: "Maximum projected bridges",
            minimum: 1,
            maximum: 128
          }
        },
        required: []
      },
      localCli: {
        surface: "beeper",
        action: "bridges.list",
        contractVersion: 2,
        timeoutMs: 120000,
        maxOutputBytes: 10485760
      }
    },
    "bridges.read": {
      description: "Read one exact bridge and its secret-free capabilities.",
      risk: "R1",
      sideEffect: "none",
      idempotency: "none",
      dedupeWindowMs: 0,
      input: {
        properties: {
          bridge_id: {
            type: "string",
            description: "Exact bridge ID returned by this adapter",
            minLength: 1,
            maxLength: 512
          }
        },
        required: [
          "bridge_id"
        ]
      },
      localCli: {
        surface: "beeper",
        action: "bridges.read",
        contractVersion: 1,
        timeoutMs: 120000,
        maxOutputBytes: 10485760
      }
    },
    "contacts.list": {
      description: "List one bounded account-aware contact projection through Desktop contact pages.",
      risk: "R1",
      sideEffect: "none",
      idempotency: "none",
      dedupeWindowMs: 0,
      input: {
        properties: {
          account_id: {
            type: "string",
            description: "Exact Beeper account ID returned by this adapter",
            minLength: 1,
            maxLength: 512
          },
          query: {
            type: "string",
            description: "Optional normalized provider contact-lookup query of at most 256 UTF-8 bytes",
            minLength: 1,
            maxLength: 256
          },
          before_cursor: {
            type: "string",
            description: "Exact opaque provider cursor returned by a prior older-results page",
            minLength: 1,
            maxLength: 2048
          },
          after_cursor: {
            type: "string",
            description: "Exact opaque provider cursor returned by a prior newer-results page",
            minLength: 1,
            maxLength: 2048
          },
          limit: {
            type: "number",
            description: "Maximum projected contacts",
            minimum: 1,
            maximum: 200
          }
        },
        required: []
      },
      localCli: {
        surface: "beeper",
        action: "contacts.list",
        contractVersion: 3,
        timeoutMs: 120000,
        maxOutputBytes: 10485760
      }
    },
    "contacts.search": {
      description: "Search one bounded contact candidate window.",
      risk: "R1",
      sideEffect: "none",
      idempotency: "none",
      dedupeWindowMs: 0,
      input: {
        properties: {
          query: {
            type: "string",
            description: "Normalized bounded contact lookup text",
            minLength: 1,
            maxLength: 256
          },
          account_id: {
            type: "string",
            description: "Exact Beeper account ID returned by this adapter",
            minLength: 1,
            maxLength: 512
          },
          limit: {
            type: "number",
            description: "Maximum candidate contacts",
            minimum: 1,
            maximum: 20
          }
        },
        required: [
          "query"
        ]
      },
      localCli: {
        surface: "beeper",
        action: "contacts.search",
        contractVersion: 1,
        timeoutMs: 120000,
        maxOutputBytes: 10485760
      }
    },
    "contacts.read": {
      description: "Read one exact account-bound contact identity.",
      risk: "R1",
      sideEffect: "none",
      idempotency: "none",
      dedupeWindowMs: 0,
      input: {
        properties: {
          account_id: {
            type: "string",
            description: "Exact Beeper account ID returned by this adapter",
            minLength: 1,
            maxLength: 512
          },
          contact_id: {
            type: "string",
            description: "Exact contact ID returned by this adapter",
            minLength: 1,
            maxLength: 2048
          }
        },
        required: [
          "account_id",
          "contact_id"
        ]
      },
      localCli: {
        surface: "beeper",
        action: "contacts.read",
        contractVersion: 1,
        timeoutMs: 120000,
        maxOutputBytes: 10485760
      }
    },
    "messaging.list": {
      description: "List one bounded account-aware conversation projection.",
      risk: "R1",
      sideEffect: "none",
      idempotency: "none",
      dedupeWindowMs: 0,
      input: {
        properties: {
          account_id: {
            type: "string",
            description: "Exact Beeper account ID returned by this adapter",
            minLength: 1,
            maxLength: 512
          },
          limit: {
            type: "number",
            description: "Maximum projected conversations",
            minimum: 1,
            maximum: 200
          },
          archived: {
            type: "boolean",
            description: "Filter by archived state"
          },
          pinned: {
            type: "boolean",
            description: "Filter by pinned state"
          },
          muted: {
            type: "boolean",
            description: "Filter by muted state"
          },
          unread: {
            type: "boolean",
            description: "Filter by unread state"
          },
          low_priority: {
            type: "boolean",
            description: "Filter by low-priority state"
          }
        },
        required: []
      },
      localCli: {
        surface: "beeper",
        action: "messaging.list",
        contractVersion: 1,
        timeoutMs: 120000,
        maxOutputBytes: 10485760
      }
    },
    "messaging.search": {
      description: "Search one bounded conversation candidate window.",
      risk: "R1",
      sideEffect: "none",
      idempotency: "none",
      dedupeWindowMs: 0,
      input: {
        properties: {
          query: {
            type: "string",
            description: "Normalized bounded conversation lookup text",
            minLength: 1,
            maxLength: 256
          },
          account_id: {
            type: "string",
            description: "Exact Beeper account ID returned by this adapter",
            minLength: 1,
            maxLength: 512
          },
          limit: {
            type: "number",
            description: "Maximum candidate conversations",
            minimum: 1,
            maximum: 20
          }
        },
        required: [
          "query"
        ]
      },
      localCli: {
        surface: "beeper",
        action: "messaging.search",
        contractVersion: 2,
        timeoutMs: 120000,
        maxOutputBytes: 10485760
      }
    },
    "conversations.read": {
      description: "Read one exact account-bound conversation.",
      risk: "R1",
      sideEffect: "none",
      idempotency: "none",
      dedupeWindowMs: 0,
      input: {
        properties: {
          account_id: {
            type: "string",
            description: "Exact Beeper account ID returned by this adapter",
            minLength: 1,
            maxLength: 512
          },
          conversation_id: {
            type: "string",
            description: "Canonical full Beeper/Matrix chat ID returned by this adapter",
            minLength: 3,
            maxLength: 2048
          },
          max_participants: {
            type: "number",
            description: "Maximum projected participants",
            minimum: 1,
            maximum: 500
          }
        },
        required: [
          "account_id",
          "conversation_id"
        ]
      },
      localCli: {
        surface: "beeper",
        action: "conversations.read",
        contractVersion: 2,
        timeoutMs: 120000,
        maxOutputBytes: 10485760
      }
    },
    "messaging.read": {
      description: "Read one bounded page from one exact conversation.",
      risk: "R1",
      sideEffect: "none",
      idempotency: "none",
      dedupeWindowMs: 0,
      input: {
        properties: {
          account_id: {
            type: "string",
            description: "Exact Beeper account ID returned by this adapter",
            minLength: 1,
            maxLength: 512
          },
          conversation_id: {
            type: "string",
            description: "Canonical full Beeper/Matrix chat ID returned by this adapter",
            minLength: 3,
            maxLength: 2048
          },
          before_cursor: {
            type: "string",
            description: "Exact opaque provider cursor returned by a prior page",
            minLength: 1,
            maxLength: 2048
          },
          after_cursor: {
            type: "string",
            description: "Exact opaque provider cursor returned by a prior page",
            minLength: 1,
            maxLength: 2048
          },
          sender: {
            type: "string",
            description: "Exact sender filter: me, others, or one bounded opaque provider user ID",
            minLength: 1,
            maxLength: 2048
          },
          limit: {
            type: "number",
            description: "Maximum projected messages",
            minimum: 1,
            maximum: 200
          }
        },
        required: [
          "account_id",
          "conversation_id"
        ]
      },
      localCli: {
        surface: "beeper",
        action: "messaging.read",
        contractVersion: 3,
        timeoutMs: 120000,
        maxOutputBytes: 10485760
      }
    },
    "messaging.content.search": {
      description: "Search and paginate one bounded message-content candidate window through the exact local provider index.",
      risk: "R1",
      sideEffect: "none",
      idempotency: "none",
      dedupeWindowMs: 0,
      input: {
        properties: {
          query: {
            type: "string",
            description: "Normalized bounded message lookup text",
            minLength: 1,
            maxLength: 256
          },
          account_id: {
            type: "string",
            description: "Exact Beeper account ID returned by this adapter",
            minLength: 1,
            maxLength: 512
          },
          conversation_id: {
            type: "string",
            description: "Canonical full Beeper/Matrix chat ID returned by this adapter",
            minLength: 3,
            maxLength: 2048
          },
          chat_type: {
            type: "string",
            description: "Exact chat type filter",
            minLength: 1,
            maxLength: 16,
            enum: [
              "group",
              "single"
            ]
          },
          after: {
            type: "string",
            description: "Canonical UTC ISO timestamp",
            minLength: 20,
            maxLength: 64
          },
          before: {
            type: "string",
            description: "Canonical UTC ISO timestamp",
            minLength: 20,
            maxLength: 64
          },
          before_cursor: {
            type: "string",
            description: "Exact opaque provider cursor returned by a prior older-results page",
            minLength: 1,
            maxLength: 2048
          },
          after_cursor: {
            type: "string",
            description: "Exact opaque provider cursor returned by a prior newer-results page",
            minLength: 1,
            maxLength: 2048
          },
          exclude_low_priority: {
            type: "boolean",
            description: "Exclude low-priority chats"
          },
          include_muted: {
            type: "boolean",
            description: "Include muted chats"
          },
          media: {
            type: "array",
            description: "Exact media-kind filters",
            items: {
              type: "string",
              description: "One exact media kind",
              minLength: 1,
              maxLength: 16,
              enum: [
                "any",
                "video",
                "image",
                "link",
                "file"
              ]
            },
            minItems: 0,
            maxItems: 5
          },
          sender: {
            type: "string",
            description: "Exact sender selector returned by this adapter",
            minLength: 1,
            maxLength: 2048
          },
          limit: {
            type: "number",
            description: "Maximum projected message candidates",
            minimum: 1,
            maximum: 200
          }
        },
        required: []
      },
      localCli: {
        surface: "beeper",
        action: "messaging.content.search",
        contractVersion: 2,
        timeoutMs: 120000,
        maxOutputBytes: 10485760
      }
    },
    "messaging.message.read": {
      description: "Read one exact message from one exact conversation.",
      risk: "R1",
      sideEffect: "none",
      idempotency: "none",
      dedupeWindowMs: 0,
      input: {
        properties: {
          account_id: {
            type: "string",
            description: "Exact Beeper account ID returned by this adapter",
            minLength: 1,
            maxLength: 512
          },
          conversation_id: {
            type: "string",
            description: "Canonical full Beeper/Matrix chat ID returned by this adapter",
            minLength: 3,
            maxLength: 2048
          },
          message_id: {
            type: "string",
            description: "Exact message ID returned by this adapter",
            minLength: 1,
            maxLength: 2048
          }
        },
        required: [
          "account_id",
          "conversation_id",
          "message_id"
        ]
      },
      localCli: {
        surface: "beeper",
        action: "messaging.message.read",
        contractVersion: 1,
        timeoutMs: 120000,
        maxOutputBytes: 10485760
      }
    },
    "messaging.context.read": {
      description: "Read bounded context around one exact message.",
      risk: "R1",
      sideEffect: "none",
      idempotency: "none",
      dedupeWindowMs: 0,
      input: {
        properties: {
          account_id: {
            type: "string",
            description: "Exact Beeper account ID returned by this adapter",
            minLength: 1,
            maxLength: 512
          },
          conversation_id: {
            type: "string",
            description: "Canonical full Beeper/Matrix chat ID returned by this adapter",
            minLength: 3,
            maxLength: 2048
          },
          message_id: {
            type: "string",
            description: "Exact message ID returned by this adapter",
            minLength: 1,
            maxLength: 2048
          },
          before: {
            type: "number",
            description: "Messages before the exact target",
            minimum: 0,
            maximum: 100
          },
          after: {
            type: "number",
            description: "Messages after the exact target",
            minimum: 0,
            maximum: 100
          }
        },
        required: [
          "account_id",
          "conversation_id",
          "message_id"
        ]
      },
      localCli: {
        surface: "beeper",
        action: "messaging.context.read",
        contractVersion: 1,
        timeoutMs: 120000,
        maxOutputBytes: 10485760
      }
    },
    "messaging.send": {
      description: "Submit one confirmed text, file, sticker, or voice request to Beeper Desktop; network delivery is not asserted.",
      risk: "R3",
      sideEffect: "externally visible provider or Desktop mutation",
      idempotency: "local-at-most-once",
      dedupeWindowMs: 86400000,
      input: {
        properties: {
          account_id: {
            type: "string",
            description: "Exact Beeper account ID returned by this adapter",
            minLength: 1,
            maxLength: 512
          },
          conversation_id: {
            type: "string",
            description: "Canonical full Beeper/Matrix chat ID returned by this adapter",
            minLength: 3,
            maxLength: 2048
          },
          kind: {
            type: "string",
            description: "Exact bounded send kind",
            minLength: 1,
            maxLength: 16,
            enum: [
              "text",
              "file",
              "sticker",
              "voice"
            ]
          },
          text: {
            type: "string",
            description: "Message text or optional file caption",
            minLength: 0,
            maxLength: 65536
          },
          file: {
            type: "file",
            description: "Plan-bound file, sticker, or voice-note bytes",
            maxBytes: 524288000
          },
          filename: {
            type: "string",
            description: "Provider-visible filename",
            minLength: 1,
            maxLength: 512
          },
          mime_type: {
            type: "string",
            description: "Exact media type",
            minLength: 1,
            maxLength: 128
          },
          duration_seconds: {
            type: "number",
            description: "Voice-note duration in seconds",
            minimum: 1,
            maximum: 86400
          },
          reply_to: {
            type: "string",
            description: "Exact message ID returned by this adapter",
            minLength: 1,
            maxLength: 2048
          },
          mentions: {
            type: "array",
            description: "Canonical Matrix/Beeper participant IDs",
            items: {
              type: "string",
              description: "Canonical Matrix/Beeper user ID",
              minLength: 3,
              maxLength: 2048
            },
            minItems: 0,
            maxItems: 25
          },
          no_preview: {
            type: "boolean",
            description: "Disable link previews for text"
          }
        },
        required: [
          "account_id",
          "conversation_id",
          "kind"
        ]
      },
      localCli: {
        surface: "beeper",
        action: "messaging.send",
        contractVersion: 1,
        timeoutMs: 300000,
        maxOutputBytes: 10485760
      }
    },
    "reactions.set": {
      description: "Set one exact reaction desired state.",
      risk: "R2",
      sideEffect: "reversible provider or private desired-state mutation",
      idempotency: "local-at-most-once",
      dedupeWindowMs: 86400000,
      input: {
        properties: {
          account_id: {
            type: "string",
            description: "Exact Beeper account ID returned by this adapter",
            minLength: 1,
            maxLength: 512
          },
          conversation_id: {
            type: "string",
            description: "Canonical full Beeper/Matrix chat ID returned by this adapter",
            minLength: 3,
            maxLength: 2048
          },
          message_id: {
            type: "string",
            description: "Exact message ID returned by this adapter",
            minLength: 1,
            maxLength: 2048
          },
          reaction: {
            type: "string",
            description: "Exact reaction text",
            minLength: 1,
            maxLength: 256
          },
          enabled: {
            type: "boolean",
            description: "Desired reaction presence"
          }
        },
        required: [
          "account_id",
          "conversation_id",
          "message_id",
          "reaction",
          "enabled"
        ]
      },
      localCli: {
        surface: "beeper",
        action: "reactions.set",
        contractVersion: 1,
        timeoutMs: 120000,
        maxOutputBytes: 10485760
      }
    },
    "messaging.edit": {
      description: "Edit one exact message authored by the bound account.",
      risk: "R3",
      sideEffect: "externally visible provider or Desktop mutation",
      idempotency: "local-at-most-once",
      dedupeWindowMs: 86400000,
      input: {
        properties: {
          account_id: {
            type: "string",
            description: "Exact Beeper account ID returned by this adapter",
            minLength: 1,
            maxLength: 512
          },
          conversation_id: {
            type: "string",
            description: "Canonical full Beeper/Matrix chat ID returned by this adapter",
            minLength: 3,
            maxLength: 2048
          },
          message_id: {
            type: "string",
            description: "Exact message ID returned by this adapter",
            minLength: 1,
            maxLength: 2048
          },
          text: {
            type: "string",
            description: "Replacement message text",
            minLength: 1,
            maxLength: 65536
          }
        },
        required: [
          "account_id",
          "conversation_id",
          "message_id",
          "text"
        ]
      },
      localCli: {
        surface: "beeper",
        action: "messaging.edit",
        contractVersion: 1,
        timeoutMs: 120000,
        maxOutputBytes: 10485760
      }
    },
    "conversations.start": {
      description: "Start one conversation with one exact account-bound user.",
      risk: "R3",
      sideEffect: "externally visible provider or Desktop mutation",
      idempotency: "local-at-most-once",
      dedupeWindowMs: 86400000,
      input: {
        properties: {
          account_id: {
            type: "string",
            description: "Exact Beeper account ID returned by this adapter",
            minLength: 1,
            maxLength: 512
          },
          user_id: {
            type: "string",
            description: "Canonical Matrix/Beeper user ID",
            minLength: 3,
            maxLength: 2048
          }
        },
        required: [
          "account_id",
          "user_id"
        ]
      },
      localCli: {
        surface: "beeper",
        action: "conversations.start",
        contractVersion: 1,
        timeoutMs: 120000,
        maxOutputBytes: 10485760
      }
    },
    "conversations.archive.set": {
      description: "Set one conversation archive desired state.",
      risk: "R2",
      sideEffect: "reversible provider or private desired-state mutation",
      idempotency: "local-at-most-once",
      dedupeWindowMs: 86400000,
      input: {
        properties: {
          account_id: {
            type: "string",
            description: "Exact Beeper account ID returned by this adapter",
            minLength: 1,
            maxLength: 512
          },
          conversation_id: {
            type: "string",
            description: "Canonical full Beeper/Matrix chat ID returned by this adapter",
            minLength: 3,
            maxLength: 2048
          },
          enabled: {
            type: "boolean",
            description: "Desired archived state"
          }
        },
        required: [
          "account_id",
          "conversation_id",
          "enabled"
        ]
      },
      localCli: {
        surface: "beeper",
        action: "conversations.archive.set",
        contractVersion: 1,
        timeoutMs: 120000,
        maxOutputBytes: 10485760
      }
    },
    "conversations.pin.set": {
      description: "Set one conversation pin desired state.",
      risk: "R2",
      sideEffect: "reversible provider or private desired-state mutation",
      idempotency: "local-at-most-once",
      dedupeWindowMs: 86400000,
      input: {
        properties: {
          account_id: {
            type: "string",
            description: "Exact Beeper account ID returned by this adapter",
            minLength: 1,
            maxLength: 512
          },
          conversation_id: {
            type: "string",
            description: "Canonical full Beeper/Matrix chat ID returned by this adapter",
            minLength: 3,
            maxLength: 2048
          },
          enabled: {
            type: "boolean",
            description: "Desired pinned state"
          }
        },
        required: [
          "account_id",
          "conversation_id",
          "enabled"
        ]
      },
      localCli: {
        surface: "beeper",
        action: "conversations.pin.set",
        contractVersion: 1,
        timeoutMs: 120000,
        maxOutputBytes: 10485760
      }
    },
    "conversations.mute.set": {
      description: "Set one conversation mute desired state.",
      risk: "R2",
      sideEffect: "reversible provider or private desired-state mutation",
      idempotency: "local-at-most-once",
      dedupeWindowMs: 86400000,
      input: {
        properties: {
          account_id: {
            type: "string",
            description: "Exact Beeper account ID returned by this adapter",
            minLength: 1,
            maxLength: 512
          },
          conversation_id: {
            type: "string",
            description: "Canonical full Beeper/Matrix chat ID returned by this adapter",
            minLength: 3,
            maxLength: 2048
          },
          enabled: {
            type: "boolean",
            description: "Desired muted state"
          }
        },
        required: [
          "account_id",
          "conversation_id",
          "enabled"
        ]
      },
      localCli: {
        surface: "beeper",
        action: "conversations.mute.set",
        contractVersion: 1,
        timeoutMs: 120000,
        maxOutputBytes: 10485760
      }
    },
    "conversations.read-state.set": {
      description: "Set one conversation read marker, potentially emitting a network receipt.",
      risk: "R3",
      sideEffect: "externally visible provider or Desktop mutation",
      idempotency: "local-at-most-once",
      dedupeWindowMs: 86400000,
      input: {
        properties: {
          account_id: {
            type: "string",
            description: "Exact Beeper account ID returned by this adapter",
            minLength: 1,
            maxLength: 512
          },
          conversation_id: {
            type: "string",
            description: "Canonical full Beeper/Matrix chat ID returned by this adapter",
            minLength: 3,
            maxLength: 2048
          },
          unread: {
            type: "boolean",
            description: "Desired marked-unread state"
          },
          message_id: {
            type: "string",
            description: "Exact message ID returned by this adapter",
            minLength: 1,
            maxLength: 2048
          }
        },
        required: [
          "account_id",
          "conversation_id",
          "unread"
        ]
      },
      localCli: {
        surface: "beeper",
        action: "conversations.read-state.set",
        contractVersion: 1,
        timeoutMs: 120000,
        maxOutputBytes: 10485760
      }
    },
    "conversations.priority.set": {
      description: "Set one conversation inbox priority desired state.",
      risk: "R2",
      sideEffect: "reversible provider or private desired-state mutation",
      idempotency: "local-at-most-once",
      dedupeWindowMs: 86400000,
      input: {
        properties: {
          account_id: {
            type: "string",
            description: "Exact Beeper account ID returned by this adapter",
            minLength: 1,
            maxLength: 512
          },
          conversation_id: {
            type: "string",
            description: "Canonical full Beeper/Matrix chat ID returned by this adapter",
            minLength: 3,
            maxLength: 2048
          },
          level: {
            type: "string",
            description: "Desired inbox priority",
            minLength: 1,
            maxLength: 16,
            enum: [
              "inbox",
              "low"
            ]
          }
        },
        required: [
          "account_id",
          "conversation_id",
          "level"
        ]
      },
      localCli: {
        surface: "beeper",
        action: "conversations.priority.set",
        contractVersion: 1,
        timeoutMs: 120000,
        maxOutputBytes: 10485760
      }
    },
    "conversations.notify": {
      description: "Send one explicit iMessage Notify Anyway alert.",
      risk: "R3",
      sideEffect: "externally visible provider or Desktop mutation",
      idempotency: "local-at-most-once",
      dedupeWindowMs: 86400000,
      input: {
        properties: {
          account_id: {
            type: "string",
            description: "Exact Beeper account ID returned by this adapter",
            minLength: 1,
            maxLength: 512
          },
          conversation_id: {
            type: "string",
            description: "Canonical full Beeper/Matrix chat ID returned by this adapter",
            minLength: 3,
            maxLength: 2048
          }
        },
        required: [
          "account_id",
          "conversation_id"
        ]
      },
      localCli: {
        surface: "beeper",
        action: "conversations.notify",
        contractVersion: 1,
        timeoutMs: 120000,
        maxOutputBytes: 10485760
      }
    },
    "conversations.title.set": {
      description: "Set one exact group-conversation title.",
      risk: "R3",
      sideEffect: "externally visible provider or Desktop mutation",
      idempotency: "local-at-most-once",
      dedupeWindowMs: 86400000,
      input: {
        properties: {
          account_id: {
            type: "string",
            description: "Exact Beeper account ID returned by this adapter",
            minLength: 1,
            maxLength: 512
          },
          conversation_id: {
            type: "string",
            description: "Canonical full Beeper/Matrix chat ID returned by this adapter",
            minLength: 3,
            maxLength: 2048
          },
          title: {
            type: "string",
            description: "Replacement group title",
            minLength: 1,
            maxLength: 1024
          }
        },
        required: [
          "account_id",
          "conversation_id",
          "title"
        ]
      },
      localCli: {
        surface: "beeper",
        action: "conversations.title.set",
        contractVersion: 1,
        timeoutMs: 120000,
        maxOutputBytes: 10485760
      }
    },
    "conversations.description.set": {
      description: "Set or clear one exact group-conversation description.",
      risk: "R3",
      sideEffect: "externally visible provider or Desktop mutation",
      idempotency: "local-at-most-once",
      dedupeWindowMs: 86400000,
      input: {
        properties: {
          account_id: {
            type: "string",
            description: "Exact Beeper account ID returned by this adapter",
            minLength: 1,
            maxLength: 512
          },
          conversation_id: {
            type: "string",
            description: "Canonical full Beeper/Matrix chat ID returned by this adapter",
            minLength: 3,
            maxLength: 2048
          },
          clear: {
            type: "boolean",
            description: "Clear the description"
          },
          description: {
            type: "string",
            description: "Replacement group description",
            minLength: 1,
            maxLength: 65536
          }
        },
        required: [
          "account_id",
          "conversation_id",
          "clear"
        ]
      },
      localCli: {
        surface: "beeper",
        action: "conversations.description.set",
        contractVersion: 1,
        timeoutMs: 120000,
        maxOutputBytes: 10485760
      }
    },
    "conversations.avatar.set": {
      description: "Set or clear one exact group-conversation avatar.",
      risk: "R3",
      sideEffect: "externally visible provider or Desktop mutation",
      idempotency: "local-at-most-once",
      dedupeWindowMs: 86400000,
      input: {
        properties: {
          account_id: {
            type: "string",
            description: "Exact Beeper account ID returned by this adapter",
            minLength: 1,
            maxLength: 512
          },
          conversation_id: {
            type: "string",
            description: "Canonical full Beeper/Matrix chat ID returned by this adapter",
            minLength: 3,
            maxLength: 2048
          },
          clear: {
            type: "boolean",
            description: "Clear the avatar"
          },
          avatar: {
            type: "file",
            description: "Plan-bound replacement avatar bytes",
            maxBytes: 16777216
          }
        },
        required: [
          "account_id",
          "conversation_id",
          "clear"
        ]
      },
      localCli: {
        surface: "beeper",
        action: "conversations.avatar.set",
        contractVersion: 1,
        timeoutMs: 120000,
        maxOutputBytes: 10485760
      }
    },
    "conversations.draft.set": {
      description: "Set or clear one private Desktop draft.",
      risk: "R2",
      sideEffect: "reversible provider or private desired-state mutation",
      idempotency: "local-at-most-once",
      dedupeWindowMs: 86400000,
      input: {
        properties: {
          account_id: {
            type: "string",
            description: "Exact Beeper account ID returned by this adapter",
            minLength: 1,
            maxLength: 512
          },
          conversation_id: {
            type: "string",
            description: "Canonical full Beeper/Matrix chat ID returned by this adapter",
            minLength: 3,
            maxLength: 2048
          },
          clear: {
            type: "boolean",
            description: "Clear the draft"
          },
          text: {
            type: "string",
            description: "Replacement private draft text",
            minLength: 0,
            maxLength: 65536
          },
          attachment: {
            type: "file",
            description: "Plan-bound private draft attachment",
            maxBytes: 524288000
          },
          filename: {
            type: "string",
            description: "Attachment filename",
            minLength: 1,
            maxLength: 512
          },
          mime_type: {
            type: "string",
            description: "Attachment media type",
            minLength: 1,
            maxLength: 128
          }
        },
        required: [
          "account_id",
          "conversation_id",
          "clear"
        ]
      },
      localCli: {
        surface: "beeper",
        action: "conversations.draft.set",
        contractVersion: 1,
        timeoutMs: 120000,
        maxOutputBytes: 10485760
      }
    },
    "conversations.disappearing.set": {
      description: "Set one disappearing-message retention interval.",
      risk: "R3",
      sideEffect: "externally visible provider or Desktop mutation",
      idempotency: "local-at-most-once",
      dedupeWindowMs: 86400000,
      input: {
        properties: {
          account_id: {
            type: "string",
            description: "Exact Beeper account ID returned by this adapter",
            minLength: 1,
            maxLength: 512
          },
          conversation_id: {
            type: "string",
            description: "Canonical full Beeper/Matrix chat ID returned by this adapter",
            minLength: 3,
            maxLength: 2048
          },
          seconds: {
            type: "number",
            description: "Desired disappearing-message interval; zero disables",
            minimum: 0,
            maximum: 31536000
          }
        },
        required: [
          "account_id",
          "conversation_id",
          "seconds"
        ]
      },
      localCli: {
        surface: "beeper",
        action: "conversations.disappearing.set",
        contractVersion: 1,
        timeoutMs: 120000,
        maxOutputBytes: 10485760
      }
    },
    "conversations.reminder.set": {
      description: "Set or clear one private Desktop reminder.",
      risk: "R2",
      sideEffect: "reversible provider or private desired-state mutation",
      idempotency: "local-at-most-once",
      dedupeWindowMs: 86400000,
      input: {
        properties: {
          account_id: {
            type: "string",
            description: "Exact Beeper account ID returned by this adapter",
            minLength: 1,
            maxLength: 512
          },
          conversation_id: {
            type: "string",
            description: "Canonical full Beeper/Matrix chat ID returned by this adapter",
            minLength: 3,
            maxLength: 2048
          },
          clear: {
            type: "boolean",
            description: "Clear the reminder"
          },
          when: {
            type: "string",
            description: "Canonical UTC ISO timestamp",
            minLength: 20,
            maxLength: 64
          },
          dismiss_on_message: {
            type: "boolean",
            description: "Dismiss when a message arrives"
          }
        },
        required: [
          "account_id",
          "conversation_id",
          "clear"
        ]
      },
      localCli: {
        surface: "beeper",
        action: "conversations.reminder.set",
        contractVersion: 1,
        timeoutMs: 120000,
        maxOutputBytes: 10485760
      }
    },
    "conversations.focus": {
      description: "Focus one exact Desktop conversation with optional plan-bound draft state.",
      risk: "R2",
      sideEffect: "reversible provider or private desired-state mutation",
      idempotency: "local-at-most-once",
      dedupeWindowMs: 86400000,
      input: {
        properties: {
          account_id: {
            type: "string",
            description: "Exact Beeper account ID returned by this adapter",
            minLength: 1,
            maxLength: 512
          },
          conversation_id: {
            type: "string",
            description: "Canonical full Beeper/Matrix chat ID returned by this adapter",
            minLength: 3,
            maxLength: 2048
          },
          message_id: {
            type: "string",
            description: "Exact message ID returned by this adapter",
            minLength: 1,
            maxLength: 2048
          },
          draft: {
            type: "string",
            description: "Plan-bound Desktop draft text",
            minLength: 0,
            maxLength: 65536
          },
          attachment: {
            type: "file",
            description: "Plan-bound Desktop draft attachment",
            maxBytes: 524288000
          }
        },
        required: [
          "account_id",
          "conversation_id"
        ]
      },
      localCli: {
        surface: "beeper",
        action: "conversations.focus",
        contractVersion: 1,
        timeoutMs: 120000,
        maxOutputBytes: 10485760
      }
    },
    "presence.set": {
      description: "Send one bounded typing or paused presence indication.",
      risk: "R3",
      sideEffect: "externally visible provider or Desktop mutation",
      idempotency: "local-at-most-once",
      dedupeWindowMs: 86400000,
      input: {
        properties: {
          account_id: {
            type: "string",
            description: "Exact Beeper account ID returned by this adapter",
            minLength: 1,
            maxLength: 512
          },
          conversation_id: {
            type: "string",
            description: "Canonical full Beeper/Matrix chat ID returned by this adapter",
            minLength: 3,
            maxLength: 2048
          },
          state: {
            type: "string",
            description: "Exact presence state",
            minLength: 1,
            maxLength: 16,
            enum: [
              "typing",
              "paused"
            ]
          },
          duration_seconds: {
            type: "number",
            description: "Bounded typing duration before a separately journaled paused dispatch",
            minimum: 1,
            maximum: 30
          }
        },
        required: [
          "account_id",
          "conversation_id",
          "state"
        ]
      },
      localCli: {
        surface: "beeper",
        action: "presence.set",
        contractVersion: 1,
        timeoutMs: 120000,
        maxOutputBytes: 10485760
      }
    }
  }
};

// src/local-cli-surface-contract.ts
import { types as nodeTypes } from "util";
var LOCAL_CLI_SURFACE_DISPOSITIONS = Object.freeze([
  "supported",
  "fixed",
  "absorbed",
  "replaced",
  "internal",
  "R4",
  "unsupported"
]);
var LOCAL_CLI_SURFACE_PROVENANCE_KINDS = Object.freeze([
  "built-in-canonical",
  "built-in-hidden",
  "built-in-alias",
  "source-only-private",
  "jit-plugin",
  "dynamic-plugin",
  "documented-only"
]);
function hasWellFormedUnicode(value) {
  for (let index = 0;index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 55296 && code <= 56319) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 56320 && next <= 57343))
        return false;
      index += 1;
    } else if (code >= 56320 && code <= 57343)
      return false;
  }
  return true;
}
function record(value, label) {
  if (nodeTypes.isProxy(value) || typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    throw new Error(`${label} must be a plain data object`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const result = Object.create(null);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string")
      throw new Error(`${label} must not contain symbols`);
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable || !hasWellFormedUnicode(key))
      throw new Error(`${label} must contain only enumerable Unicode data fields`);
    result[key] = descriptor.value;
  }
  return Object.freeze(result);
}
function exactKeys(value, required, optional, label) {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key))
      throw new Error(`${label} contains unsupported field ${key}`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key))
      throw new Error(`${label}.${key} is required`);
  }
}
function array(value, label, maximum) {
  if (nodeTypes.isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum || Reflect.ownKeys(value).length !== value.length + 1)
    throw new Error(`${label} must be a dense array of at most ${maximum} items`);
  const result = [];
  for (let index = 0;index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
      throw new Error(`${label} must contain only enumerable data items`);
    }
    result.push(descriptor.value);
  }
  return Object.freeze(result);
}
function string(value, label, maximum = 1024) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || !hasWellFormedUnicode(value) || /[\u0000-\u001f\u007f-\u009f]/u.test(value))
    throw new Error(`${label} must be bounded Unicode text`);
  return value;
}
function nullableString(value, label) {
  return value === null ? null : string(value, label);
}
function parseVersionKind(value, versionValue, label) {
  if (versionValue === null) {
    if (value !== null)
      throw new Error(`${label} requires a package version`);
    return null;
  }
  return exactEnum(value, label, ["exact", "range"]);
}
function boolean(value, label) {
  if (typeof value !== "boolean")
    throw new Error(`${label} must be boolean`);
  return value;
}
function integer(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be a bounded integer`);
  }
  return value;
}
function exactEnum(value, label, values) {
  if (typeof value !== "string" || !values.includes(value)) {
    throw new Error(`${label} is unsupported`);
  }
  return value;
}
function sha(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error(`${label} must be one SHA-256 digest`);
  }
  return value;
}
function commitSha(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{40}$/u.test(value)) {
    throw new Error(`${label} must be one full Git commit ID`);
  }
  return value;
}
function canonicalDate(value, label) {
  if (typeof value !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u.test(value)) {
    throw new Error(`${label} must be a canonical YYYY-MM-DD date`);
  }
  const milliseconds = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString().slice(0, 10) !== value)
    throw new Error(`${label} must be a canonical YYYY-MM-DD date`);
  return value;
}
function scalar(value, label) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    if (typeof value === "string")
      string(value, label, 4096);
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0))
    return value;
  throw new Error(`${label} must be a finite JSON scalar`);
}
function stringList(value, label, maximum) {
  const result = array(value, label, maximum).map((item, index) => string(item, `${label}[${index}]`, 512));
  if (new Set(result).size !== result.length)
    throw new Error(`${label} repeats a value`);
  return Object.freeze(result);
}
function commandPath(value, label) {
  const path = stringList(value, label, 16);
  if (path.length < 1 || path.some((segment) => /\s/u.test(segment))) {
    throw new Error(`${label} must contain nonempty whitespace-free command segments`);
  }
  return path;
}
function codePointCompare(left, right) {
  const leftCodePoints = [...left];
  const rightCodePoints = [...right];
  const length = Math.min(leftCodePoints.length, rightCodePoints.length);
  for (let index = 0;index < length; index += 1) {
    const leftCodePoint = leftCodePoints[index].codePointAt(0);
    const rightCodePoint = rightCodePoints[index].codePointAt(0);
    if (leftCodePoint !== rightCodePoint)
      return leftCodePoint < rightCodePoint ? -1 : 1;
  }
  return leftCodePoints.length < rightCodePoints.length ? -1 : leftCodePoints.length > rightCodePoints.length ? 1 : 0;
}
function surfaceCanonicalJson(value) {
  if (value === null)
    return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new Error("local CLI surface canonical JSON contains an invalid number");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => surfaceCanonicalJson(item)).join(",")}]`;
  }
  if (typeof value !== "object" || value === null) {
    throw new Error("local CLI surface canonical JSON contains a non-JSON value");
  }
  const entries = Object.entries(value).sort(([left], [right]) => codePointCompare(left, right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${surfaceCanonicalJson(item)}`).join(",")}}`;
}
function parseDefault(value, label) {
  const source = record(value, label);
  const kind = exactEnum(source.kind, `${label}.kind`, [
    "none",
    "literal",
    "derived",
    "environment"
  ]);
  if (kind === "none") {
    exactKeys(source, ["kind"], [], label);
    return Object.freeze({ kind });
  }
  if (kind === "literal") {
    exactKeys(source, ["kind", "value", "authority"], [], label);
    const value2 = scalar(source.value, `${label}.value`);
    if (value2 === null)
      throw new Error(`${label}.literal null is ambiguous with kind none`);
    return Object.freeze({
      kind,
      value: value2,
      authority: exactEnum(source.authority, `${label}.authority`, [
        "tagged-source",
        "jit-plugin-source",
        "sdk-openapi"
      ])
    });
  }
  if (kind === "derived") {
    exactKeys(source, ["kind", "description"], [], label);
    return Object.freeze({ kind, description: string(source.description, `${label}.description`, 500) });
  }
  exactKeys(source, ["kind", "name"], [], label);
  const name = string(source.name, `${label}.name`, 128);
  if (!/^[A-Z][A-Z0-9_]*$/u.test(name))
    throw new Error(`${label}.name must be an environment variable`);
  return Object.freeze({ kind, name });
}
function parseDecision(value, label) {
  const source = record(value, label);
  exactKeys(source, [
    "disposition",
    "rationale",
    "operation",
    "replacement",
    "fixedValue"
  ], [], label);
  const disposition = exactEnum(source.disposition, `${label}.disposition`, LOCAL_CLI_SURFACE_DISPOSITIONS);
  const operation = nullableString(source.operation, `${label}.operation`);
  const replacement = nullableString(source.replacement, `${label}.replacement`);
  const fixedValue = scalar(source.fixedValue, `${label}.fixedValue`);
  if (operation !== null && !isProviderPluginOperationName(operation))
    throw new Error(`${label}.operation must be a semantic operation name`);
  if (disposition === "supported" && operation === null) {
    throw new Error(`${label} supported disposition requires an operation`);
  }
  if (disposition === "fixed" && fixedValue === null) {
    throw new Error(`${label}.fixedValue is required for fixed disposition`);
  }
  if (disposition !== "fixed" && fixedValue !== null) {
    throw new Error(`${label}.fixedValue requires fixed disposition`);
  }
  return Object.freeze({
    disposition,
    rationale: string(source.rationale, `${label}.rationale`, 1000),
    operation,
    replacement,
    fixedValue
  });
}
function parsePathSemanticInputs(value, label) {
  const source = record(value, label);
  const entries = Object.entries(source);
  if (entries.length > 128) {
    throw new Error(`${label} exceeds its semantic input bound`);
  }
  const parsed = Object.create(null);
  for (const [field, fieldValue] of entries) {
    if (!/^[a-z][a-z0-9_]{0,127}$/u.test(field)) {
      throw new Error(`${label} contains an invalid semantic input field ${field}`);
    }
    parsed[field] = scalar(fieldValue, `${label}.${field}`);
  }
  return Object.freeze(parsed);
}
function parsePredicate(value, label, traversal, depth = 0) {
  if (depth > 8)
    throw new Error(`${label} exceeds the predicate depth bound`);
  if (typeof value !== "object" || value === null) {
    throw new Error(`${label} must be a predicate data object`);
  }
  if (traversal.seen.has(value)) {
    throw new Error(`${label} repeats a predicate object identity`);
  }
  traversal.seen.add(value);
  traversal.nodes += 1;
  if (traversal.nodes > 1e4) {
    throw new Error("local CLI surface predicates exceed the whole-contract node bound");
  }
  const source = record(value, label);
  const op = exactEnum(source.op, `${label}.op`, [
    "true",
    "present",
    "eq",
    "not",
    "and",
    "or"
  ]);
  if (op === "true") {
    exactKeys(source, ["op"], [], label);
    return Object.freeze({ op });
  }
  if (op === "present") {
    exactKeys(source, ["op", "field"], [], label);
    return Object.freeze({ op, field: string(source.field, `${label}.field`, 128) });
  }
  if (op === "eq") {
    exactKeys(source, ["op", "field", "value"], [], label);
    return Object.freeze({
      op,
      field: string(source.field, `${label}.field`, 128),
      value: scalar(source.value, `${label}.value`)
    });
  }
  if (op === "not") {
    exactKeys(source, ["op", "predicate"], [], label);
    return Object.freeze({
      op,
      predicate: parsePredicate(source.predicate, `${label}.predicate`, traversal, depth + 1)
    });
  }
  exactKeys(source, ["op", "predicates"], [], label);
  const predicates = array(source.predicates, `${label}.predicates`, 32).map((item, index) => parsePredicate(item, `${label}.predicates[${index}]`, traversal, depth + 1));
  if (predicates.length < 1)
    throw new Error(`${label}.predicates must not be empty`);
  return Object.freeze({ op, predicates: Object.freeze(predicates) });
}
function parseRule(value, label, predicateTraversal) {
  const source = record(value, label);
  exactKeys(source, [
    "namespace",
    "when",
    "require",
    "requireAny",
    "exactlyOne",
    "forbid",
    "rationale"
  ], [], label);
  const requiredFields = stringList(source.require, `${label}.require`, 64);
  const requireAny = stringList(source.requireAny, `${label}.requireAny`, 64);
  const exactlyOne = stringList(source.exactlyOne, `${label}.exactlyOne`, 64);
  const forbid = stringList(source.forbid, `${label}.forbid`, 64);
  if ([...requiredFields, ...requireAny, ...exactlyOne].some((field) => forbid.includes(field))) {
    throw new Error(`${label} cannot require and forbid the same field`);
  }
  return Object.freeze({
    namespace: exactEnum(source.namespace, `${label}.namespace`, [
      "semantic-operation",
      "upstream-command"
    ]),
    when: parsePredicate(source.when, `${label}.when`, predicateTraversal),
    require: requiredFields,
    requireAny,
    exactlyOne,
    forbid,
    rationale: string(source.rationale, `${label}.rationale`, 1000)
  });
}
function parseArgument(value, label) {
  const source = record(value, label);
  exactKeys(source, [
    "name",
    "position",
    "required",
    "multiple",
    "valueType",
    "enum",
    "default",
    "decision"
  ], [], label);
  const valueType = exactEnum(source.valueType, `${label}.valueType`, ["string", "number", "boolean"]);
  const enumValues = stringList(source.enum, `${label}.enum`, 128);
  const defaultValue = parseDefault(source.default, `${label}.default`);
  const decision = parseDecision(source.decision, `${label}.decision`);
  if (enumValues.length > 0 && valueType !== "string") {
    throw new Error(`${label}.enum requires a string argument`);
  }
  if (defaultValue.kind === "literal" && enumValues.length > 0 && !enumValues.includes(defaultValue.value))
    throw new Error(`${label}.default must belong to the declared enum`);
  if (defaultValue.kind === "literal" && defaultValue.value !== null && typeof defaultValue.value !== valueType)
    throw new Error(`${label}.default must match the argument value type`);
  if (decision.disposition === "fixed" && typeof decision.fixedValue !== valueType)
    throw new Error(`${label}.fixedValue must match the argument value type`);
  if (decision.disposition === "fixed" && enumValues.length > 0 && !enumValues.includes(decision.fixedValue))
    throw new Error(`${label}.fixedValue must belong to the declared enum`);
  return Object.freeze({
    name: string(source.name, `${label}.name`, 128),
    position: integer(source.position, `${label}.position`, 0, 255),
    required: boolean(source.required, `${label}.required`),
    multiple: boolean(source.multiple, `${label}.multiple`),
    valueType,
    enum: enumValues,
    default: defaultValue,
    decision
  });
}
function parseFlag(value, label) {
  const source = record(value, label);
  exactKeys(source, [
    "name",
    "aliases",
    "source",
    "valueType",
    "allowNo",
    "required",
    "multiple",
    "enum",
    "default",
    "decision"
  ], [], label);
  const name = string(source.name, `${label}.name`, 128);
  if (!/^--[a-z0-9][a-z0-9-]*$/u.test(name))
    throw new Error(`${label}.name must be a long flag`);
  const aliases = stringList(source.aliases, `${label}.aliases`, 8);
  if (aliases.some((alias) => !/^-[a-zA-Z]$/u.test(alias))) {
    throw new Error(`${label}.aliases must be one-character flags`);
  }
  const valueType = exactEnum(source.valueType, `${label}.valueType`, ["string", "number", "boolean"]);
  const allowNo = boolean(source.allowNo, `${label}.allowNo`);
  const defaultValue = parseDefault(source.default, `${label}.default`);
  const enumValues = stringList(source.enum, `${label}.enum`, 128);
  const decision = parseDecision(source.decision, `${label}.decision`);
  if (allowNo && valueType !== "boolean") {
    throw new Error(`${label}.allowNo requires a boolean flag`);
  }
  if (enumValues.length > 0 && valueType !== "string") {
    throw new Error(`${label}.enum requires a string flag`);
  }
  if (defaultValue.kind === "literal" && enumValues.length > 0 && !enumValues.includes(defaultValue.value))
    throw new Error(`${label}.default must belong to the declared enum`);
  if (defaultValue.kind === "literal" && defaultValue.value !== null && typeof defaultValue.value !== valueType)
    throw new Error(`${label}.default must match the flag value type`);
  if (decision.disposition === "fixed" && typeof decision.fixedValue !== valueType)
    throw new Error(`${label}.fixedValue must match the flag value type`);
  if (decision.disposition === "fixed" && enumValues.length > 0 && !enumValues.includes(decision.fixedValue))
    throw new Error(`${label}.fixedValue must belong to the declared enum`);
  return Object.freeze({
    name,
    aliases,
    source: exactEnum(source.source, `${label}.source`, ["command", "global"]),
    valueType,
    allowNo,
    required: boolean(source.required, `${label}.required`),
    multiple: boolean(source.multiple, `${label}.multiple`),
    enum: enumValues,
    default: defaultValue,
    decision
  });
}
function parseOutput(value, label) {
  const source = record(value, label);
  exactKeys(source, [
    "shape",
    "completeness",
    "maxBytes",
    "privateArtifact",
    "truncation"
  ], [], label);
  const maxBytes = source.maxBytes === null ? null : integer(source.maxBytes, `${label}.maxBytes`, 1, 4 * 1024 * 1024 * 1024);
  return Object.freeze({
    shape: string(source.shape, `${label}.shape`, 1000),
    completeness: exactEnum(source.completeness, `${label}.completeness`, [
      "complete",
      "bounded",
      "candidate-window",
      "input-dependent",
      "internal",
      "unavailable"
    ]),
    maxBytes,
    privateArtifact: boolean(source.privateArtifact, `${label}.privateArtifact`),
    truncation: nullableString(source.truncation, `${label}.truncation`)
  });
}
function parseReconciliation(value, label, predicateTraversal) {
  const source = record(value, label);
  exactKeys(source, ["availability", "namespace", "predicate", "rationale"], [], label);
  const availability = exactEnum(source.availability, `${label}.availability`, [
    "none",
    "always",
    "input-dependent"
  ]);
  const predicate = source.predicate === null ? null : parsePredicate(source.predicate, `${label}.predicate`, predicateTraversal);
  if (availability === "input-dependent" !== (predicate !== null)) {
    throw new Error(`${label}.predicate must exactly match input-dependent availability`);
  }
  const namespace = source.namespace === null ? null : exactEnum(source.namespace, `${label}.namespace`, ["semantic-operation"]);
  if (availability === "input-dependent" !== (namespace !== null)) {
    throw new Error(`${label}.namespace must exactly match input-dependent availability`);
  }
  return Object.freeze({
    availability,
    namespace,
    predicate,
    rationale: string(source.rationale, `${label}.rationale`, 1000)
  });
}
function parseCommand(value, label, predicateTraversal) {
  const source = record(value, label);
  exactKeys(source, [
    "path",
    "provenance",
    "profileAuthority",
    "package",
    "version",
    "versionKind",
    "registered",
    "publicManual",
    "generatedCanonical",
    "upstreamReportedMutates",
    "reviewedEffect",
    "arguments",
    "flags",
    "decision",
    "pathSemanticInputs",
    "output",
    "conditionalInputs",
    "reconciliation"
  ], ["semanticProfileSha256"], label);
  const path = commandPath(source.path, `${label}.path`);
  const args = array(source.arguments, `${label}.arguments`, 32).map((item, index) => parseArgument(item, `${label}.arguments[${index}]`));
  const normalizedArgumentNames = args.map((argument) => argument.name.replaceAll("-", "_"));
  if (new Set(normalizedArgumentNames).size !== normalizedArgumentNames.length) {
    throw new Error(`${label}.arguments repeat a normalized name`);
  }
  const positions = args.map((argument) => argument.position);
  if (positions.some((position, index) => position !== index)) {
    throw new Error(`${label}.arguments positions must be contiguous from zero`);
  }
  const flags = array(source.flags, `${label}.flags`, 128).map((item, index) => parseFlag(item, `${label}.flags[${index}]`));
  if (new Set(flags.map((flag) => flag.name)).size !== flags.length) {
    throw new Error(`${label}.flags repeat a long name`);
  }
  if (flags.some((flag) => flag.source !== "command")) {
    throw new Error(`${label}.flags must be command flags`);
  }
  const normalizedFlagNames = flags.map((flag) => flag.name.slice(2).replaceAll("-", "_"));
  if (normalizedFlagNames.some((name) => normalizedArgumentNames.includes(name))) {
    throw new Error(`${label} repeats a normalized argument/flag field`);
  }
  const conditionalInputs = array(source.conditionalInputs, `${label}.conditionalInputs`, 64).map((item, index) => parseRule(item, `${label}.conditionalInputs[${index}]`, predicateTraversal));
  const upstreamReportedMutates = source.upstreamReportedMutates === null ? null : boolean(source.upstreamReportedMutates, `${label}.upstreamReportedMutates`);
  return Object.freeze({
    path,
    provenance: exactEnum(source.provenance, `${label}.provenance`, LOCAL_CLI_SURFACE_PROVENANCE_KINDS),
    profileAuthority: exactEnum(source.profileAuthority, `${label}.profileAuthority`, [
      "tagged-source",
      "jit-plugin-source"
    ]),
    package: nullableString(source.package, `${label}.package`),
    version: nullableString(source.version, `${label}.version`),
    versionKind: parseVersionKind(source.versionKind, source.version, `${label}.versionKind`),
    registered: boolean(source.registered, `${label}.registered`),
    publicManual: boolean(source.publicManual, `${label}.publicManual`),
    generatedCanonical: boolean(source.generatedCanonical, `${label}.generatedCanonical`),
    upstreamReportedMutates,
    reviewedEffect: exactEnum(source.reviewedEffect, `${label}.reviewedEffect`, [
      "read",
      "write",
      "input-dependent"
    ]),
    arguments: Object.freeze(args),
    flags: Object.freeze(flags),
    decision: parseDecision(source.decision, `${label}.decision`),
    pathSemanticInputs: parsePathSemanticInputs(source.pathSemanticInputs, `${label}.pathSemanticInputs`),
    output: parseOutput(source.output, `${label}.output`),
    conditionalInputs: Object.freeze(conditionalInputs),
    reconciliation: parseReconciliation(source.reconciliation, `${label}.reconciliation`, predicateTraversal)
  });
}
function parseAdditionalEntry(value, label) {
  const source = record(value, label);
  exactKeys(source, [
    "path",
    "provenance",
    "profileAuthority",
    "canonicalTarget",
    "package",
    "version",
    "versionKind",
    "registered",
    "publicManual",
    "rationale",
    "decision"
  ], [], label);
  const path = commandPath(source.path, `${label}.path`);
  const canonicalTarget = source.canonicalTarget === null ? null : commandPath(source.canonicalTarget, `${label}.canonicalTarget`);
  return Object.freeze({
    path,
    provenance: exactEnum(source.provenance, `${label}.provenance`, LOCAL_CLI_SURFACE_PROVENANCE_KINDS),
    profileAuthority: exactEnum(source.profileAuthority, `${label}.profileAuthority`, [
      "tagged-source",
      "framework-runtime",
      "documentation"
    ]),
    canonicalTarget,
    package: nullableString(source.package, `${label}.package`),
    version: nullableString(source.version, `${label}.version`),
    versionKind: parseVersionKind(source.versionKind, source.version, `${label}.versionKind`),
    registered: boolean(source.registered, `${label}.registered`),
    publicManual: boolean(source.publicManual, `${label}.publicManual`),
    rationale: string(source.rationale, `${label}.rationale`, 1000),
    decision: parseDecision(source.decision, `${label}.decision`)
  });
}
function flagSpellings(flag) {
  return Object.freeze([
    flag.name,
    ...flag.allowNo ? [`--no-${flag.name.slice(2)}`] : [],
    ...flag.aliases
  ]);
}
function predicateFieldNames(predicate) {
  if (predicate.op === "true")
    return Object.freeze([]);
  if (predicate.op === "present" || predicate.op === "eq") {
    return Object.freeze([predicate.field]);
  }
  if (predicate.op === "not")
    return predicateFieldNames(predicate.predicate);
  return Object.freeze(predicate.predicates.flatMap(predicateFieldNames));
}
function validatePredicateTypes(predicate, fieldTypes, label) {
  if (predicate.op === "true" || predicate.op === "present")
    return;
  if (predicate.op === "eq") {
    const expected = fieldTypes[predicate.field];
    if (expected === undefined || predicate.value !== null && expected !== "file" && expected !== "array" && typeof predicate.value !== expected || (expected === "file" || expected === "array") && predicate.value !== null)
      throw new Error(`${label} equality value does not match field ${predicate.field}`);
    return;
  }
  if (predicate.op === "not") {
    validatePredicateTypes(predicate.predicate, fieldTypes, `${label}.predicate`);
    return;
  }
  predicate.predicates.forEach((item, index) => validatePredicateTypes(item, fieldTypes, `${label}.predicates[${index}]`));
}
function ruleFieldNames(rule) {
  return Object.freeze([
    ...predicateFieldNames(rule.when),
    ...rule.require,
    ...rule.requireAny,
    ...rule.exactlyOne,
    ...rule.forbid
  ]);
}
function parseArtifact(value, label) {
  const source = record(value, label);
  exactKeys(source, ["platform", "arch", "archiveSha256", "executableSha256"], [], label);
  return Object.freeze({
    platform: string(source.platform, `${label}.platform`, 32),
    arch: string(source.arch, `${label}.arch`, 32),
    archiveSha256: sha(source.archiveSha256, `${label}.archiveSha256`),
    executableSha256: sha(source.executableSha256, `${label}.executableSha256`)
  });
}
function parseDefinition(value) {
  const source = record(value, "local CLI surface contract");
  exactKeys(source, [
    "schemaVersion",
    "format",
    "surface",
    "executable",
    "source",
    "sdk",
    "runtime",
    "globalFlags",
    "commands",
    "additionalEntries"
  ], ["digests"], "local CLI surface contract");
  if (source.schemaVersion !== 1 || source.format !== "wrench.local-cli-surface") {
    throw new Error("local CLI surface contract version is unsupported");
  }
  const executable = record(source.executable, "local CLI surface executable");
  exactKeys(executable, [
    "id",
    "implementation",
    "releaseVersion",
    "releaseDate",
    "releaseTag",
    "releaseCommit",
    "releaseManifestSha256",
    "runtimeReportedName",
    "runtimeReportedVersion",
    "artifacts"
  ], [], "local CLI surface executable");
  const sourceIdentity = record(source.source, "local CLI surface source");
  exactKeys(sourceIdentity, [
    "package",
    "packagePath",
    "packageDeclaredVersion",
    "versionDiscrepancy",
    "generatedManualSha256",
    "generatedManualIncludesFlagsAndDefaults",
    "generatedManualEntries",
    "generatedCanonicalEntries",
    "registeredKeys"
  ], [], "local CLI surface source");
  const sdk = record(source.sdk, "local CLI surface SDK");
  exactKeys(sdk, ["package", "version", "commit"], [], "local CLI surface SDK");
  const runtime = record(source.runtime, "local CLI surface runtime");
  exactKeys(runtime, [
    "providerPluginId",
    "providerPluginVersion",
    "adapterId",
    "adapterVersion",
    "operationContractVersions",
    "operationInputTypes",
    "target",
    "realm",
    "compatibility"
  ], [], "local CLI surface runtime");
  const rawOperationContractVersions = record(runtime.operationContractVersions, "local CLI surface runtime.operationContractVersions");
  const operationContractVersionKeys = Object.keys(rawOperationContractVersions).sort(codePointCompare);
  if (operationContractVersionKeys.length < 1 || operationContractVersionKeys.length > 1000) {
    throw new Error("local CLI surface runtime.operationContractVersions must contain 1 to 1000 operations");
  }
  const operationContractVersions = Object.freeze(Object.fromEntries(operationContractVersionKeys.map((operation) => {
    if (!isProviderPluginOperationName(operation)) {
      throw new Error(`local CLI surface runtime operation ${operation} is not a bounded semantic name`);
    }
    return [
      operation,
      integer(rawOperationContractVersions[operation], `local CLI surface runtime.operationContractVersions.${operation}`, 1, 1e6)
    ];
  })));
  const rawOperationInputTypes = record(runtime.operationInputTypes, "local CLI surface runtime.operationInputTypes");
  const operationInputTypeKeys = Object.keys(rawOperationInputTypes).sort(codePointCompare);
  if (operationInputTypeKeys.length !== operationContractVersionKeys.length || operationInputTypeKeys.some((operation, index) => operation !== operationContractVersionKeys[index]))
    throw new Error("local CLI surface runtime input fields must exactly cover operation versions");
  const operationInputTypes = Object.freeze(Object.fromEntries(operationInputTypeKeys.map((operation) => {
    const rawFields = record(rawOperationInputTypes[operation], `local CLI surface runtime.operationInputTypes.${operation}`);
    const fields = Object.keys(rawFields).sort(codePointCompare);
    if (fields.length > 256 || fields.some((field) => !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/u.test(field)))
      throw new Error("local CLI surface runtime contains invalid semantic input fields");
    return [operation, Object.freeze(Object.fromEntries(fields.map((field) => [
      field,
      exactEnum(rawFields[field], `local CLI surface runtime.operationInputTypes.${operation}.${field}`, ["string", "number", "boolean", "array", "file"])
    ])))];
  })));
  const predicateTraversal = {
    seen: new WeakSet,
    nodes: 0
  };
  const commands = array(source.commands, "local CLI surface commands", 1000).map((item, index) => parseCommand(item, `local CLI surface commands[${index}]`, predicateTraversal));
  const commandPaths = commands.map((command) => command.path.join(" "));
  if (new Set(commandPaths).size !== commandPaths.length) {
    throw new Error("local CLI surface commands repeat a normalized path");
  }
  const globalFlags = array(source.globalFlags, "local CLI surface globalFlags", 128).map((item, index) => parseFlag(item, `local CLI surface globalFlags[${index}]`));
  if (globalFlags.some((flag) => flag.source !== "global") || new Set(globalFlags.map((flag) => flag.name)).size !== globalFlags.length)
    throw new Error("local CLI surface globalFlags must be unique global flags");
  if (globalFlags.some((flag) => flag.default.kind === "literal" && flag.default.authority === "jit-plugin-source")) {
    throw new Error("local CLI surface global flags cannot use JIT plugin default authority");
  }
  const globalSpellings = new Set;
  for (const flag of globalFlags) {
    for (const spelling of flagSpellings(flag)) {
      if (globalSpellings.has(spelling)) {
        throw new Error("local CLI surface globalFlags repeat a flag spelling");
      }
      globalSpellings.add(spelling);
    }
  }
  for (const command of commands) {
    const commandSpellings = new Set;
    for (const flag of command.flags) {
      for (const spelling of flagSpellings(flag)) {
        if (commandSpellings.has(spelling)) {
          throw new Error(`local CLI surface command ${command.path.join(" ")} repeats a flag spelling`);
        }
        if (spelling.startsWith("-") && !spelling.startsWith("--") && globalSpellings.has(spelling)) {
          throw new Error(`local CLI surface command ${command.path.join(" ")} shadows a global short alias`);
        }
        commandSpellings.add(spelling);
      }
    }
  }
  const additionalEntries = array(source.additionalEntries, "local CLI surface additionalEntries", 1000).map((item, index) => parseAdditionalEntry(item, `local CLI surface additionalEntries[${index}]`));
  const allPaths = [...commandPaths, ...additionalEntries.map((entry) => entry.path.join(" "))];
  if (new Set(allPaths).size !== allPaths.length) {
    throw new Error("local CLI surface entries repeat a normalized path");
  }
  const allPathSet = new Set(allPaths);
  for (const entry of additionalEntries) {
    if (entry.canonicalTarget !== null && !allPathSet.has(entry.canonicalTarget.join(" ")))
      throw new Error("local CLI surface entry has a dangling canonical target");
  }
  const additionalByPath = new Map(additionalEntries.map((entry) => [
    entry.path.join(" "),
    entry
  ]));
  const aliasVisitState = new Map;
  for (const entry of additionalEntries) {
    const chain = [];
    let path = entry.path.join(" ");
    while (true) {
      const state = aliasVisitState.get(path);
      if (state === "visiting") {
        throw new Error("local CLI surface canonical target graph contains an alias cycle");
      }
      if (state === "visited")
        break;
      aliasVisitState.set(path, "visiting");
      chain.push(path);
      const target = additionalByPath.get(path)?.canonicalTarget?.join(" ") ?? null;
      if (target === null || !additionalByPath.has(target))
        break;
      path = target;
    }
    for (const visited of chain)
      aliasVisitState.set(visited, "visited");
  }
  for (const command of commands) {
    if (command.profileAuthority === "tagged-source" && (!["built-in-canonical", "source-only-private"].includes(command.provenance) || command.package !== sourceIdentity.package || command.version !== sourceIdentity.packageDeclaredVersion || command.versionKind !== "exact"))
      throw new Error("local CLI surface tagged command profile has inconsistent source authority");
    if (command.profileAuthority === "jit-plugin-source" && (command.provenance !== "jit-plugin" || command.package === null || command.version === null || command.versionKind !== "range"))
      throw new Error("local CLI surface JIT command profile has inconsistent package authority");
    for (const item of [...command.arguments, ...command.flags]) {
      if (item.default.kind !== "literal")
        continue;
      if (command.profileAuthority === "jit-plugin-source" && item.default.authority !== "jit-plugin-source")
        throw new Error("local CLI surface JIT command literal default has inconsistent authority");
      if (command.profileAuthority === "tagged-source" && item.default.authority === "jit-plugin-source")
        throw new Error("local CLI surface tagged command literal default has inconsistent authority");
    }
  }
  for (const entry of additionalEntries) {
    if (entry.profileAuthority === "tagged-source" && (entry.package !== sourceIdentity.package || entry.version !== sourceIdentity.packageDeclaredVersion || entry.versionKind !== "exact"))
      throw new Error("local CLI surface tagged additional entry has inconsistent source authority");
    if (entry.profileAuthority === "documentation" && (entry.provenance !== "documented-only" || entry.package !== null || entry.version !== null))
      throw new Error("local CLI surface documented entry has inconsistent authority");
  }
  const artifacts = array(executable.artifacts, "local CLI surface executable.artifacts", 32).map((item, index) => parseArtifact(item, `local CLI surface executable.artifacts[${index}]`));
  const artifactCoordinates = artifacts.map((artifact) => `${artifact.platform}/${artifact.arch}`);
  if (artifacts.length < 1 || new Set(artifactCoordinates).size !== artifacts.length) {
    throw new Error("local CLI surface executable artifacts must be unique and nonempty");
  }
  const surface = string(source.surface, "local CLI surface contract.surface", 63);
  if (!/^[a-z][a-z0-9-]{0,62}$/u.test(surface)) {
    throw new Error("local CLI surface contract.surface must be a normalized surface ID");
  }
  const generatedManualEntries = integer(sourceIdentity.generatedManualEntries, "local CLI surface source.generatedManualEntries", 1, 1e4);
  const generatedCanonicalEntries = integer(sourceIdentity.generatedCanonicalEntries, "local CLI surface source.generatedCanonicalEntries", 1, 1e4);
  const registeredKeys = integer(sourceIdentity.registeredKeys, "local CLI surface source.registeredKeys", 1, 1e5);
  if (commands.filter((command) => command.publicManual).length !== generatedManualEntries || commands.filter((command) => command.generatedCanonical).length + additionalEntries.filter((entry) => entry.provenance === "built-in-hidden" && entry.profileAuthority === "tagged-source").length !== generatedCanonicalEntries || [
    ...commands,
    ...additionalEntries
  ].filter((entry) => entry.registered && entry.package === sourceIdentity.package).length !== registeredKeys)
    throw new Error("local CLI surface source counts do not match normalized entries");
  const installedOperations = new Set(operationContractVersionKeys);
  for (const decision of [
    ...globalFlags.map((flag) => flag.decision),
    ...commands.flatMap((command) => [
      command.decision,
      ...command.arguments.map((argument) => argument.decision),
      ...command.flags.map((flag) => flag.decision)
    ]),
    ...additionalEntries.map((entry) => entry.decision)
  ]) {
    if (decision.operation !== null && !installedOperations.has(decision.operation)) {
      throw new Error(`local CLI surface decision references uninstalled operation ${decision.operation}`);
    }
  }
  for (const command of commands) {
    if (command.decision.disposition === "supported" !== (command.decision.operation !== null)) {
      throw new Error(`local CLI surface command ${command.path.join(" ")} must bind an operation exactly when supported`);
    }
    for (const item of [...command.arguments, ...command.flags]) {
      if (item.decision.operation !== null && item.decision.operation !== command.decision.operation) {
        throw new Error(`local CLI surface command ${command.path.join(" ")} item operation differs from its command`);
      }
    }
    const upstreamFieldTypes = Object.freeze(Object.fromEntries([
      ...command.arguments.map((argument) => [
        argument.name.replaceAll("-", "_"),
        argument.valueType
      ]),
      ...command.flags.map((flag) => [
        flag.name.slice(2).replaceAll("-", "_"),
        flag.valueType
      ])
    ]));
    const semanticFieldTypes = command.decision.operation === null ? null : operationInputTypes[command.decision.operation] ?? null;
    for (const [field, value2] of Object.entries(command.pathSemanticInputs)) {
      if (semanticFieldTypes === null || !Object.hasOwn(semanticFieldTypes, field)) {
        throw new Error(`local CLI surface command ${command.path.join(" ")} path semantic input references unknown field ${field}`);
      }
      const expected = semanticFieldTypes[field];
      if (value2 !== null && (expected === "file" || expected === "array" || typeof value2 !== expected)) {
        throw new Error(`local CLI surface command ${command.path.join(" ")} path semantic input ${field} has the wrong type`);
      }
    }
    for (const [index, rule] of command.conditionalInputs.entries()) {
      const allowed = rule.namespace === "semantic-operation" ? semanticFieldTypes : upstreamFieldTypes;
      if (allowed === null) {
        throw new Error(`local CLI surface command ${command.path.join(" ")} has no semantic input namespace`);
      }
      for (const field of ruleFieldNames(rule)) {
        if (!Object.hasOwn(allowed, field)) {
          throw new Error(`local CLI surface command ${command.path.join(" ")} rule references unknown ${rule.namespace} field ${field}`);
        }
      }
      validatePredicateTypes(rule.when, allowed, `local CLI surface command ${command.path.join(" ")} conditionalInputs[${index}].when`);
    }
    if (command.reconciliation.predicate !== null) {
      if (semanticFieldTypes === null) {
        throw new Error(`local CLI surface command ${command.path.join(" ")} has no reconciliation input namespace`);
      }
      for (const field of predicateFieldNames(command.reconciliation.predicate)) {
        if (!Object.hasOwn(semanticFieldTypes, field)) {
          throw new Error(`local CLI surface command ${command.path.join(" ")} reconciliation references unknown semantic field ${field}`);
        }
      }
      validatePredicateTypes(command.reconciliation.predicate, semanticFieldTypes, `local CLI surface command ${command.path.join(" ")} reconciliation.predicate`);
    }
  }
  const releaseVersion = string(executable.releaseVersion, "local CLI surface executable.releaseVersion", 128);
  const runtimeReportedVersion = string(executable.runtimeReportedVersion, "local CLI surface executable.runtimeReportedVersion", 128);
  if (releaseVersion !== runtimeReportedVersion) {
    throw new Error("local CLI surface pinned release and runtime-reported versions must match");
  }
  const packageDeclaredVersion = string(sourceIdentity.packageDeclaredVersion, "local CLI surface source.packageDeclaredVersion", 128);
  const versionDiscrepancy = nullableString(sourceIdentity.versionDiscrepancy, "local CLI surface source.versionDiscrepancy");
  if (packageDeclaredVersion !== releaseVersion !== (versionDiscrepancy !== null)) {
    throw new Error("local CLI surface source version discrepancy must exactly match version divergence");
  }
  return Object.freeze({
    schemaVersion: 1,
    format: "wrench.local-cli-surface",
    surface,
    executable: Object.freeze({
      id: string(executable.id, "local CLI surface executable.id", 128),
      implementation: string(executable.implementation, "local CLI surface executable.implementation", 512),
      releaseVersion,
      releaseDate: canonicalDate(executable.releaseDate, "local CLI surface executable.releaseDate"),
      releaseTag: string(executable.releaseTag, "local CLI surface executable.releaseTag", 128),
      releaseCommit: commitSha(executable.releaseCommit, "local CLI surface executable.releaseCommit"),
      releaseManifestSha256: sha(executable.releaseManifestSha256, "local CLI surface executable.releaseManifestSha256"),
      runtimeReportedName: string(executable.runtimeReportedName, "local CLI surface executable.runtimeReportedName", 128),
      runtimeReportedVersion,
      artifacts: Object.freeze(artifacts)
    }),
    source: Object.freeze({
      package: string(sourceIdentity.package, "local CLI surface source.package", 128),
      packagePath: string(sourceIdentity.packagePath, "local CLI surface source.packagePath", 512),
      packageDeclaredVersion,
      versionDiscrepancy,
      generatedManualSha256: sha(sourceIdentity.generatedManualSha256, "local CLI surface source.generatedManualSha256"),
      generatedManualIncludesFlagsAndDefaults: boolean(sourceIdentity.generatedManualIncludesFlagsAndDefaults, "local CLI surface source.generatedManualIncludesFlagsAndDefaults"),
      generatedManualEntries,
      generatedCanonicalEntries,
      registeredKeys
    }),
    sdk: Object.freeze({
      package: string(sdk.package, "local CLI surface SDK.package", 128),
      version: string(sdk.version, "local CLI surface SDK.version", 128),
      commit: commitSha(sdk.commit, "local CLI surface SDK.commit")
    }),
    runtime: Object.freeze({
      providerPluginId: string(runtime.providerPluginId, "local CLI surface runtime.providerPluginId", 128),
      providerPluginVersion: string(runtime.providerPluginVersion, "local CLI surface runtime.providerPluginVersion", 128),
      adapterId: string(runtime.adapterId, "local CLI surface runtime.adapterId", 128),
      adapterVersion: string(runtime.adapterVersion, "local CLI surface runtime.adapterVersion", 128),
      operationContractVersions,
      operationInputTypes,
      target: string(runtime.target, "local CLI surface runtime.target", 128),
      realm: string(runtime.realm, "local CLI surface runtime.realm", 1000),
      compatibility: string(runtime.compatibility, "local CLI surface runtime.compatibility", 1000)
    }),
    globalFlags: Object.freeze(globalFlags),
    commands: Object.freeze(commands),
    additionalEntries: Object.freeze(additionalEntries)
  });
}
function upstreamProjection(definition) {
  return {
    executable: definition.executable,
    source: {
      package: definition.source.package,
      packagePath: definition.source.packagePath,
      packageDeclaredVersion: definition.source.packageDeclaredVersion,
      generatedManualSha256: definition.source.generatedManualSha256,
      generatedManualIncludesFlagsAndDefaults: definition.source.generatedManualIncludesFlagsAndDefaults,
      generatedManualEntries: definition.source.generatedManualEntries,
      generatedCanonicalEntries: definition.source.generatedCanonicalEntries,
      registeredKeys: definition.source.registeredKeys
    },
    sdk: definition.sdk,
    globalFlags: definition.globalFlags.map(({ decision: _decision, ...flag }) => flag),
    commands: definition.commands.map((command) => ({
      path: command.path,
      provenance: command.provenance,
      profileAuthority: command.profileAuthority,
      package: command.package,
      version: command.version,
      versionKind: command.versionKind,
      registered: command.registered,
      publicManual: command.publicManual,
      generatedCanonical: command.generatedCanonical,
      upstreamReportedMutates: command.upstreamReportedMutates,
      arguments: command.arguments.map(({ decision: _decision, ...argument }) => argument),
      flags: command.flags.map(({ decision: _decision, ...flag }) => flag)
    })),
    additionalEntries: definition.additionalEntries.map((entry) => ({
      path: entry.path,
      provenance: entry.provenance,
      profileAuthority: entry.profileAuthority,
      canonicalTarget: entry.canonicalTarget,
      package: entry.package,
      version: entry.version,
      versionKind: entry.versionKind,
      registered: entry.registered,
      publicManual: entry.publicManual
    }))
  };
}
function classificationProjection(definition) {
  return {
    runtime: {
      operationContractVersions: definition.runtime.operationContractVersions,
      operationInputTypes: definition.runtime.operationInputTypes
    },
    globalFlags: definition.globalFlags.map((flag) => ({
      name: flag.name,
      source: flag.source,
      decision: flag.decision
    })),
    commands: definition.commands.map((command) => ({
      path: command.path,
      provenance: command.provenance,
      reviewedEffect: command.reviewedEffect,
      decision: command.decision,
      pathSemanticInputs: command.pathSemanticInputs,
      arguments: command.arguments.map((argument) => ({ name: argument.name, decision: argument.decision })),
      flags: command.flags.map((flag) => ({ name: flag.name, source: flag.source, decision: flag.decision }))
    })),
    additionalEntries: definition.additionalEntries.map((entry) => ({
      path: entry.path,
      provenance: entry.provenance,
      decision: entry.decision
    }))
  };
}
function semanticProfile(command) {
  return {
    path: command.path,
    provenance: command.provenance,
    profileAuthority: command.profileAuthority,
    package: command.package,
    version: command.version,
    versionKind: command.versionKind,
    registered: command.registered,
    upstreamReportedMutates: command.upstreamReportedMutates,
    reviewedEffect: command.reviewedEffect,
    arguments: command.arguments,
    flags: command.flags,
    decision: command.decision,
    pathSemanticInputs: command.pathSemanticInputs,
    output: command.output,
    conditionalInputs: command.conditionalInputs,
    reconciliation: command.reconciliation
  };
}
function buildContract(definitionValue) {
  const definition = parseDefinition(definitionValue);
  const commands = definition.commands.map((command) => Object.freeze({
    ...command,
    semanticProfileSha256: sha256(surfaceCanonicalJson(semanticProfile(command)))
  }));
  const semanticProfileMap = commands.map((command) => ({
    path: command.path,
    semanticProfileSha256: command.semanticProfileSha256
  }));
  return Object.freeze({
    ...definition,
    commands: Object.freeze(commands),
    digests: Object.freeze({
      upstreamSurfaceSha256: sha256(surfaceCanonicalJson(upstreamProjection(definition))),
      classificationSha256: sha256(surfaceCanonicalJson(classificationProjection(definition))),
      semanticProfilesSha256: sha256(surfaceCanonicalJson(semanticProfileMap)),
      wholeSurfaceSha256: sha256(surfaceCanonicalJson(definition))
    })
  });
}
function defineLocalCliSurfaceContractV1(definition) {
  return buildContract(definition);
}

// src/providers/beeper-local.ts
var BEEPER_CLI_DARWIN_ARM64_ARTIFACT_PIN = Object.freeze({
  platform: "darwin",
  arch: "arm64",
  archiveSha256: "688ccde7e7d044d33980cd06474bf1ae7215ccf8ca79967262fa3bfb85a2589a",
  executableSha256: "48aa895449129c793a212ea19f69a534adc34a8adc4037ca1d7da9e648716425",
  downloadUrl: "https://github.com/beeper/cli/releases/download/v0.6.2/beeper-cli-0.6.2-macos-arm64.zip"
});
var BEEPER_CLI_PIN = Object.freeze({
  id: "beeper-cli",
  implementation: "github.com/beeper/cli",
  version: "0.6.2",
  commit: "a416af06023449a87312dc11e54643fd9dc94b8c",
  releaseManifestSha256: "5c52b533180151b97e26138ef687b6b819170687b34a478184e5648335356950",
  releaseManifestUrl: "https://github.com/beeper/cli/releases/download/v0.6.2/binaries.json",
  releaseUrl: "https://github.com/beeper/cli/releases/tag/v0.6.2",
  sourceUrl: "https://github.com/beeper/cli/tree/a416af06023449a87312dc11e54643fd9dc94b8c",
  darwinArm64ArchiveSha256: BEEPER_CLI_DARWIN_ARM64_ARTIFACT_PIN.archiveSha256,
  darwinArm64BinarySha256: BEEPER_CLI_DARWIN_ARM64_ARTIFACT_PIN.executableSha256,
  downloadUrl: BEEPER_CLI_DARWIN_ARM64_ARTIFACT_PIN.downloadUrl,
  artifacts: Object.freeze([
    BEEPER_CLI_DARWIN_ARM64_ARTIFACT_PIN,
    Object.freeze({
      platform: "darwin",
      arch: "x64",
      archiveSha256: "4113a1979cfbd7839f14743158e70c12efa941313afb77ab2b11a08309196186",
      executableSha256: "83bb89edb6eeb9c61ebdb6ec940e0db30c90ecbca61d60a7408fe336e255f22e",
      downloadUrl: "https://github.com/beeper/cli/releases/download/v0.6.2/beeper-cli-0.6.2-macos-x64.zip"
    }),
    Object.freeze({
      platform: "linux",
      arch: "arm64",
      archiveSha256: "2bd37043a4ed863621edc59e28aaa652e8193e55abca0e9477f5aeae1c65d629",
      executableSha256: "102b8725bd99b03905dcff9fff645f3742e1697ce8d43ab9d8656896aafd12a8",
      downloadUrl: "https://github.com/beeper/cli/releases/download/v0.6.2/beeper-cli-0.6.2-linux-arm64.tar.gz"
    }),
    Object.freeze({
      platform: "linux",
      arch: "x64",
      archiveSha256: "a881e1d2bc91e31218b251716644ec5f8d161d5ccb30e7eab66cf2ba6410511d",
      executableSha256: "723cc3a6c556fa21b6ba11db8377d6a29776aca1660da48f0072883d6452ae3d",
      downloadUrl: "https://github.com/beeper/cli/releases/download/v0.6.2/beeper-cli-0.6.2-linux-x64.tar.gz"
    })
  ])
});
var BEEPER_DESKTOP_API_PIN = Object.freeze({
  package: "@beeper/desktop-api",
  version: "5.0.0",
  commit: "b9c1714410139c2139b597338cd002d785653e85"
});
function beeperCliArtifactForRuntime(platform = process.platform, arch = process.arch) {
  const artifact = BEEPER_CLI_PIN.artifacts.find((candidate) => candidate.platform === platform && candidate.arch === arch);
  if (artifact === undefined) {
    throw new Error(`Beeper CLI ${BEEPER_CLI_PIN.version} has no pinned artifact for this runtime`);
  }
  return artifact;
}
var BEEPER_ORIGIN = "https://www.beeper.com";
var BEEPER_DESKTOP_TARGET = "desktop";
var BEEPER_MAX_FILE_BYTES = 500 * 1024 * 1024;
var BEEPER_DESKTOP_BUNDLE_IDS = Object.freeze([
  "com.automattic.beeper.desktop",
  "com.automattic.beeper.desktop.nightly"
]);
var BEEPER_LOCAL_OPERATION_NAMES = Object.freeze([
  "accounts.list",
  "accounts.read",
  "bridges.list",
  "bridges.read",
  "contacts.list",
  "contacts.search",
  "contacts.read",
  "messaging.list",
  "messaging.search",
  "conversations.read",
  "messaging.read",
  "messaging.content.search",
  "messaging.message.read",
  "messaging.context.read",
  "messaging.send",
  "reactions.set",
  "messaging.edit",
  "conversations.start",
  "conversations.archive.set",
  "conversations.pin.set",
  "conversations.mute.set",
  "conversations.read-state.set",
  "conversations.priority.set",
  "conversations.notify",
  "conversations.title.set",
  "conversations.description.set",
  "conversations.avatar.set",
  "conversations.draft.set",
  "conversations.disappearing.set",
  "conversations.reminder.set",
  "conversations.focus",
  "presence.set"
]);
var BEEPER_LOCAL_OPERATION_CONTRACT_VERSIONS = Object.freeze({
  "accounts.list": 2,
  "accounts.read": 1,
  "bridges.list": 2,
  "bridges.read": 1,
  "contacts.list": 3,
  "contacts.search": 1,
  "contacts.read": 1,
  "messaging.list": 1,
  "messaging.search": 2,
  "conversations.read": 2,
  "messaging.read": 3,
  "messaging.content.search": 2,
  "messaging.message.read": 1,
  "messaging.context.read": 1,
  "messaging.send": 1,
  "reactions.set": 1,
  "messaging.edit": 1,
  "conversations.start": 1,
  "conversations.archive.set": 1,
  "conversations.pin.set": 1,
  "conversations.mute.set": 1,
  "conversations.read-state.set": 1,
  "conversations.priority.set": 1,
  "conversations.notify": 1,
  "conversations.title.set": 1,
  "conversations.description.set": 1,
  "conversations.avatar.set": 1,
  "conversations.draft.set": 1,
  "conversations.disappearing.set": 1,
  "conversations.reminder.set": 1,
  "conversations.focus": 1,
  "presence.set": 1
});
var BEEPER_LOCAL_CONTRACT_V2_OPERATIONS = Object.freeze([
  "accounts.list",
  "bridges.list",
  "contacts.list",
  "messaging.search",
  "conversations.read",
  "messaging.read",
  "messaging.content.search"
]);
var BEEPER_LOCAL_CONTRACT_V3_OPERATIONS = Object.freeze([
  "contacts.list",
  "messaging.read"
]);
function isBeeperLocalOperationContractVersion(action, contractVersion) {
  return contractVersion === 1 || contractVersion === 2 && BEEPER_LOCAL_CONTRACT_V2_OPERATIONS.includes(action) || contractVersion === 3 && BEEPER_LOCAL_CONTRACT_V3_OPERATIONS.includes(action);
}
var BEEPER_DESKTOP_LOOPBACK_V2_OPERATIONS = Object.freeze([
  "accounts.list",
  "messaging.search",
  "conversations.read",
  "messaging.read",
  "messaging.content.search"
]);
function isBeeperDesktopLoopbackOperationContract(action, contractVersion) {
  return contractVersion === 2 && BEEPER_DESKTOP_LOOPBACK_V2_OPERATIONS.includes(action) || contractVersion === 3 && BEEPER_LOCAL_CONTRACT_V3_OPERATIONS.includes(action);
}
var BEEPER_LOCAL_OPERATION_RUNTIME_TRANSPORTS = Object.freeze(Object.fromEntries(BEEPER_LOCAL_OPERATION_NAMES.map((operation) => [
  operation,
  isBeeperDesktopLoopbackOperationContract(operation, BEEPER_LOCAL_OPERATION_CONTRACT_VERSIONS[operation]) ? "desktop-loopback" : "official-cli"
])));
function beeperLocalSurfaceInputType(value) {
  if (value !== "string" && value !== "number" && value !== "boolean" && value !== "array" && value !== "file")
    throw new Error("Beeper adapter contains an unsupported operation input type");
  return value;
}
var adapterOperations = wrench_web_adapter_default.operations;
var BEEPER_LOCAL_OPERATION_INPUT_TYPES = Object.freeze(Object.fromEntries(Object.keys(adapterOperations).sort().map((operation) => [
  operation,
  Object.freeze(Object.fromEntries(Object.keys(adapterOperations[operation].input.properties).sort().map((field) => [
    field,
    beeperLocalSurfaceInputType(adapterOperations[operation].input.properties[field].type)
  ])))
])));
var readPolicy = (reason) => Object.freeze({
  effect: "read",
  risk: "R1",
  state: "observed",
  reason
});
var reversiblePolicy = (reason) => Object.freeze({
  effect: "write",
  risk: "R2",
  state: "desired",
  reason
});
var visiblePolicy = (reason) => Object.freeze({
  effect: "write",
  risk: "R3",
  state: "desired",
  reason
});
var BEEPER_LOCAL_OPERATIONS = Object.freeze({
  "accounts.list": readPolicy("list the exact account realm bound to local Beeper Desktop"),
  "accounts.read": readPolicy("read one exact connected-account projection"),
  "bridges.list": readPolicy("list a bounded bridge capability catalog"),
  "bridges.read": readPolicy("read one exact bridge and its non-secret capabilities"),
  "contacts.list": readPolicy("list one bounded account-aware contact projection"),
  "contacts.search": readPolicy("search one bounded account-aware contact candidate window"),
  "contacts.read": readPolicy("read one exact account-bound contact identity"),
  "messaging.list": readPolicy("list one bounded account-aware conversation projection"),
  "messaging.search": readPolicy("search one bounded conversation candidate window"),
  "conversations.read": readPolicy("read one exact account-bound conversation"),
  "messaging.read": readPolicy("read one bounded page from an exact conversation"),
  "messaging.content.search": readPolicy("search one bounded message-content candidate window"),
  "messaging.message.read": readPolicy("read one exact message from an exact conversation"),
  "messaging.context.read": readPolicy("read bounded context around one exact message"),
  "messaging.send": visiblePolicy("submit one confirmed text, file, sticker, or voice request to Beeper Desktop; network delivery is not asserted"),
  "reactions.set": reversiblePolicy("set or clear one exact reaction desired state"),
  "messaging.edit": visiblePolicy("edit one exact message authored by the current account"),
  "conversations.start": visiblePolicy("start one conversation with an exact account-bound user"),
  "conversations.archive.set": reversiblePolicy("set one conversation archive desired state"),
  "conversations.pin.set": reversiblePolicy("set one conversation pin desired state"),
  "conversations.mute.set": reversiblePolicy("set one conversation mute desired state"),
  "conversations.read-state.set": visiblePolicy("set one conversation read marker, which may emit a network read receipt"),
  "conversations.priority.set": reversiblePolicy("set one conversation inbox priority desired state"),
  "conversations.notify": visiblePolicy("send one explicit iMessage Notify Anyway alert"),
  "conversations.title.set": visiblePolicy("set one group-conversation title"),
  "conversations.description.set": visiblePolicy("set or clear one group-conversation description"),
  "conversations.avatar.set": visiblePolicy("set or clear one group-conversation avatar"),
  "conversations.draft.set": reversiblePolicy("set or clear one private conversation draft"),
  "conversations.disappearing.set": visiblePolicy("set a retention timer whose effects cannot be undone after messages expire"),
  "conversations.reminder.set": reversiblePolicy("set or clear one private conversation reminder"),
  "conversations.focus": reversiblePolicy("focus local Beeper Desktop on one exact conversation"),
  "presence.set": visiblePolicy("send one bounded typing or paused indicator")
});
function record2(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value) || nodeTypes2.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    throw new Error(`${label} must be a plain data object`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) {
    throw new Error(`${label} must not contain symbol fields`);
  }
  const result = Object.create(null);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!descriptor.enumerable || !("value" in descriptor)) {
      throw new Error(`${label} must contain only enumerable data fields`);
    }
    result[key] = descriptor.value;
  }
  return Object.freeze(result);
}
function exactKeys2(value, required, optional, label) {
  const keys = new Set(Object.keys(value));
  for (const key of required)
    if (!keys.delete(key))
      throw new Error(`${label} omitted ${key}`);
  for (const key of optional)
    keys.delete(key);
  if (keys.size > 0)
    throw new Error(`${label} contained unsupported fields`);
}
function integer2(value, label, minimum, maximum) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw new Error(`${label} must be an integer from ${minimum} through ${maximum}`);
  return value;
}
function bool(value, label) {
  if (typeof value !== "boolean")
    throw new Error(`${label} must be boolean`);
  return value;
}
function optionalBool(value, label) {
  return value === undefined ? null : bool(value, label);
}
function boundedOpaque(value, label, maximum) {
  if (typeof value !== "string" || value.length < 1 || Buffer.byteLength(value, "utf8") > maximum || /[\0\r\n]/u.test(value) || !hasWellFormedUnicode2(value))
    throw new Error(`${label} must be bounded well-formed opaque text`);
  return value;
}
function optionalOpaque(value, label, maximum) {
  return value === undefined ? null : boundedOpaque(value, label, maximum);
}
function boundedControlFreeOpaque(value, label, maximum) {
  const opaque = boundedOpaque(value, label, maximum);
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(opaque)) {
    throw new Error(`${label} must be bounded well-formed control-free opaque text`);
  }
  return opaque;
}
function optionalControlFreeOpaque(value, label, maximum) {
  return value === undefined ? null : boundedControlFreeOpaque(value, label, maximum);
}
function hasWellFormedUnicode2(value) {
  for (let index = 0;index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 55296 && code <= 56319) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 56320 && next <= 57343))
        return false;
      index += 1;
    } else if (code >= 56320 && code <= 57343)
      return false;
  }
  return true;
}
function boundedText(value, label, maximum, allowEmpty = false) {
  if (typeof value !== "string" || !allowEmpty && value.length === 0 || Buffer.byteLength(value, "utf8") > maximum || value.includes("\x00") || !hasWellFormedUnicode2(value))
    throw new Error(`${label} must be bounded well-formed Unicode text`);
  return value;
}
function optionalText(value, label, maximum) {
  return value === undefined ? null : boundedText(value, label, maximum, true);
}
function normalizedSearchQuery(value, label) {
  if (typeof value !== "string")
    throw new Error(`${label} must be text`);
  const normalized = value.normalize("NFKC").trim();
  if (normalized.length < 1 || normalized.startsWith("-") || !hasWellFormedUnicode2(normalized) || Buffer.byteLength(normalized, "utf8") > 256 || /[\u0000-\u001f\u007f-\u009f]/u.test(normalized))
    throw new Error(`${label} must be nonempty normalized non-flag text of at most 256 UTF-8 bytes`);
  return normalized;
}
function exactEnum2(value, label, values) {
  if (typeof value !== "string" || !values.includes(value))
    throw new Error(`${label} must be one of ${values.join(", ")}`);
  return value;
}
function optionalEnum(value, label, values) {
  return value === undefined ? null : exactEnum2(value, label, values);
}
function isoTimestamp(value, label) {
  const text = boundedOpaque(value, label, 64);
  const milliseconds = Date.parse(text);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== text)
    throw new Error(`${label} must be a canonical UTC ISO timestamp`);
  return text;
}
function optionalTimestamp(value, label) {
  return value === undefined ? null : isoTimestamp(value, label);
}
function fileInput(value, label) {
  const source = record2(value, label);
  exactKeys2(source, ["kind", "reference"], [], label);
  if (source.kind !== "file")
    throw new Error(`${label}.kind must be file`);
  return Object.freeze({ kind: "file", reference: boundedOpaque(source.reference, `${label}.reference`, 1024) });
}
function optionalFile(value, label) {
  return value === undefined ? null : fileInput(value, label);
}
function stringArray(value, label, maximumItems, itemMaximum) {
  if (!Array.isArray(value) || nodeTypes2.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximumItems || Reflect.ownKeys(value).length !== value.length + 1)
    throw new Error(`${label} must be a dense plain array of at most ${maximumItems} items`);
  const items = [];
  for (let index = 0;index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw new Error(`${label} must contain only dense data items`);
    }
    items.push(boundedOpaque(descriptor.value, `${label}[${index}]`, itemMaximum));
  }
  if (new Set(items).size !== items.length)
    throw new Error(`${label} must not repeat items`);
  return Object.freeze(items);
}
function accountId(source, label) {
  return boundedOpaque(source.account_id, `${label}.account_id`, 512);
}
function isCanonicalBeeperConversationId(value) {
  return Buffer.byteLength(value, "utf8") <= 2048 && hasWellFormedUnicode2(value) && !/[\u0000-\u001f\u007f-\u009f]/u.test(value) && /^![^:\s]{1,255}:[^:\s]{1,255}(?::[0-9]{1,5})?$/u.test(value);
}
function conversationId(source, label) {
  const id = boundedControlFreeOpaque(source.conversation_id, `${label}.conversation_id`, 2048);
  if (!isCanonicalBeeperConversationId(id)) {
    throw new Error(`${label}.conversation_id must be one exact full Beeper/Matrix chat ID`);
  }
  return id;
}
function messageId(source, label) {
  return boundedOpaque(source.message_id, `${label}.message_id`, 2048);
}
function canonicalMatrixUserId(value, label) {
  const id = boundedOpaque(value, label, 2048);
  if (!/^@[^:\s]{1,255}:[^:\s]{1,255}(?::[0-9]{1,5})?$/u.test(id)) {
    throw new Error(`${label} must be one exact Matrix/Beeper user ID`);
  }
  return id;
}
function canonicalMessageSender(value, label) {
  const sender = boundedOpaque(value, label, 2048);
  if (sender === "me" || sender === "others")
    return sender;
  if (sender.startsWith("-")) {
    throw new Error(`${label} must be one bounded opaque non-flag user ID`);
  }
  return sender;
}
function canonicalMessageSenderV3(value, label) {
  const sender = boundedControlFreeOpaque(value, label, 2048);
  if (sender === "me" || sender === "others")
    return sender;
  if (sender.startsWith("-")) {
    throw new Error(`${label} must be one bounded opaque non-flag user ID`);
  }
  return sender;
}
function conversationInput(source, label) {
  return Object.freeze({ accountId: accountId(source, label), conversationId: conversationId(source, label) });
}
function parseBeeperContactsListInputV1(input) {
  const source = record2(input, "contacts.list input");
  exactKeys2(source, [], ["account_id", "limit"], "contacts.list input");
  return Object.freeze({
    accountId: optionalOpaque(source.account_id, "contacts.list input.account_id", 512),
    limit: source.limit === undefined ? 200 : integer2(source.limit, "contacts.list input.limit", 1, 200)
  });
}
function parseBeeperContactsListInput(input) {
  const source = record2(input, "contacts.list input");
  exactKeys2(source, [], ["account_id", "query", "limit"], "contacts.list input");
  return Object.freeze({
    accountId: optionalOpaque(source.account_id, "contacts.list input.account_id", 512),
    query: source.query === undefined ? null : normalizedSearchQuery(source.query, "contacts.list input.query"),
    limit: source.limit === undefined ? 200 : integer2(source.limit, "contacts.list input.limit", 1, 200)
  });
}
function parseBeeperContactsListInputV3(input) {
  const source = record2(input, "contacts.list input");
  exactKeys2(source, [], ["account_id", "query", "before_cursor", "after_cursor", "limit"], "contacts.list input");
  const beforeCursor = optionalOpaque(source.before_cursor, "contacts.list input.before_cursor", 2048);
  const afterCursor = optionalOpaque(source.after_cursor, "contacts.list input.after_cursor", 2048);
  if (beforeCursor !== null && afterCursor !== null) {
    throw new Error("contacts.list input accepts only one cursor direction");
  }
  if ((beforeCursor !== null || afterCursor !== null) && source.account_id === undefined) {
    throw new Error("contacts.list cursor input requires one exact account_id");
  }
  return Object.freeze({
    accountId: optionalOpaque(source.account_id, "contacts.list input.account_id", 512),
    query: source.query === undefined ? null : normalizedSearchQuery(source.query, "contacts.list input.query"),
    beforeCursor,
    afterCursor,
    limit: source.limit === undefined ? 200 : integer2(source.limit, "contacts.list input.limit", 1, 200)
  });
}
function parseBeeperContactsSearchInput(input) {
  const source = record2(input, "contacts.search input");
  exactKeys2(source, ["query"], ["account_id", "limit"], "contacts.search input");
  return Object.freeze({ accountId: optionalOpaque(source.account_id, "contacts.search input.account_id", 512), query: normalizedSearchQuery(source.query, "contacts.search input.query"), limit: source.limit === undefined ? 20 : integer2(source.limit, "contacts.search input.limit", 1, 20) });
}
function parseBeeperMessagingListInput(input) {
  const source = record2(input, "messaging.list input");
  exactKeys2(source, [], ["account_id", "limit", "archived", "pinned", "muted", "unread", "low_priority"], "messaging.list input");
  return Object.freeze({
    accountId: optionalOpaque(source.account_id, "messaging.list input.account_id", 512),
    limit: source.limit === undefined ? 200 : integer2(source.limit, "messaging.list input.limit", 1, 200),
    archived: optionalBool(source.archived, "messaging.list input.archived"),
    pinned: optionalBool(source.pinned, "messaging.list input.pinned"),
    muted: optionalBool(source.muted, "messaging.list input.muted"),
    unread: optionalBool(source.unread, "messaging.list input.unread"),
    lowPriority: optionalBool(source.low_priority, "messaging.list input.low_priority")
  });
}
function parseBeeperMessagingSearchInput(input) {
  const source = record2(input, "messaging.search input");
  exactKeys2(source, ["query"], ["account_id", "limit"], "messaging.search input");
  return Object.freeze({ accountId: optionalOpaque(source.account_id, "messaging.search input.account_id", 512), query: normalizedSearchQuery(source.query, "messaging.search input.query"), limit: source.limit === undefined ? 20 : integer2(source.limit, "messaging.search input.limit", 1, 20) });
}
function parseBeeperMessagingReadInputV2(input) {
  const source = record2(input, "messaging.read input");
  exactKeys2(source, ["account_id", "conversation_id"], ["before_cursor", "after_cursor", "limit"], "messaging.read input");
  const beforeCursor = optionalOpaque(source.before_cursor, "messaging.read input.before_cursor", 2048);
  const afterCursor = optionalOpaque(source.after_cursor, "messaging.read input.after_cursor", 2048);
  if (beforeCursor !== null && afterCursor !== null)
    throw new Error("messaging.read input accepts only one cursor direction");
  return Object.freeze({
    accountId: accountId(source, "messaging.read input"),
    conversationId: conversationId(source, "messaging.read input"),
    beforeCursor,
    afterCursor,
    limit: source.limit === undefined ? 200 : integer2(source.limit, "messaging.read input.limit", 1, 200)
  });
}
function parseBeeperMessagingReadInput(input) {
  const source = record2(input, "messaging.read input");
  exactKeys2(source, ["account_id", "conversation_id"], ["before_cursor", "after_cursor", "sender", "limit"], "messaging.read input");
  const beforeCursor = optionalControlFreeOpaque(source.before_cursor, "messaging.read input.before_cursor", 2048);
  const afterCursor = optionalControlFreeOpaque(source.after_cursor, "messaging.read input.after_cursor", 2048);
  if (beforeCursor !== null && afterCursor !== null)
    throw new Error("messaging.read input accepts only one cursor direction");
  return Object.freeze({
    accountId: accountId(source, "messaging.read input"),
    conversationId: conversationId(source, "messaging.read input"),
    beforeCursor,
    afterCursor,
    sender: source.sender === undefined ? null : canonicalMessageSenderV3(source.sender, "messaging.read input.sender"),
    limit: source.limit === undefined ? 200 : integer2(source.limit, "messaging.read input.limit", 1, 200)
  });
}
function parseMessageSearchInput(input) {
  const label = "messaging.content.search input";
  const source = record2(input, label);
  exactKeys2(source, [], ["query", "account_id", "conversation_id", "chat_type", "after", "before", "before_cursor", "after_cursor", "exclude_low_priority", "include_muted", "media", "sender", "limit"], label);
  const query = source.query === undefined ? null : normalizedSearchQuery(source.query, `${label}.query`);
  const account = optionalOpaque(source.account_id, `${label}.account_id`, 512);
  const conversation = source.conversation_id === undefined ? null : conversationId(source, label);
  const chatType = optionalEnum(source.chat_type, `${label}.chat_type`, ["group", "single"]);
  const after = optionalTimestamp(source.after, `${label}.after`);
  const before = optionalTimestamp(source.before, `${label}.before`);
  if (after !== null && before !== null && Date.parse(after) > Date.parse(before))
    throw new Error(`${label}.after must not follow before`);
  const beforeCursor = optionalOpaque(source.before_cursor, `${label}.before_cursor`, 2048);
  const afterCursor = optionalOpaque(source.after_cursor, `${label}.after_cursor`, 2048);
  if (beforeCursor !== null && afterCursor !== null)
    throw new Error(`${label} accepts only one cursor direction`);
  const media = source.media === undefined ? Object.freeze([]) : stringArray(source.media, `${label}.media`, 5, 16).map((item) => exactEnum2(item, `${label}.media item`, ["any", "video", "image", "link", "file"]));
  if (media.includes("any") && media.length > 1)
    throw new Error(`${label}.media any must be the only filter`);
  const sender = source.sender === undefined ? null : canonicalMessageSender(source.sender, `${label}.sender`);
  if (query === null && account === null && conversation === null && chatType === null && after === null && before === null && media.length === 0 && sender === null)
    throw new Error(`${label} requires a query or an exact filter`);
  return Object.freeze({
    query,
    accountId: account,
    conversationId: conversation,
    chatType,
    after,
    before,
    beforeCursor,
    afterCursor,
    excludeLowPriority: source.exclude_low_priority === undefined ? true : bool(source.exclude_low_priority, `${label}.exclude_low_priority`),
    includeMuted: source.include_muted === undefined ? true : bool(source.include_muted, `${label}.include_muted`),
    media: Object.freeze(media),
    sender,
    limit: source.limit === undefined ? 50 : integer2(source.limit, `${label}.limit`, 1, 200)
  });
}
function parseSendInput(input) {
  const label = "messaging.send input";
  const source = record2(input, label);
  exactKeys2(source, ["account_id", "conversation_id", "kind"], ["text", "file", "filename", "mime_type", "duration_seconds", "reply_to", "mentions", "no_preview"], label);
  const kind = exactEnum2(source.kind, `${label}.kind`, ["text", "file", "sticker", "voice"]);
  const text = optionalText(source.text, `${label}.text`, 65536);
  const file = optionalFile(source.file, `${label}.file`);
  const filename = optionalOpaque(source.filename, `${label}.filename`, 512);
  const mimeType = optionalOpaque(source.mime_type, `${label}.mime_type`, 128);
  const durationSeconds = source.duration_seconds === undefined ? null : integer2(source.duration_seconds, `${label}.duration_seconds`, 1, 86400);
  const replyTo = optionalOpaque(source.reply_to, `${label}.reply_to`, 2048);
  const mentions = source.mentions === undefined ? Object.freeze([]) : Object.freeze(stringArray(source.mentions, `${label}.mentions`, 25, 2048).map((item, index) => canonicalMatrixUserId(item, `${label}.mentions[${index}]`)));
  const noPreview = source.no_preview === undefined ? false : bool(source.no_preview, `${label}.no_preview`);
  if (kind === "text") {
    if (text === null || text.length === 0)
      throw new Error(`${label}.text is required for text sends`);
    if (file !== null || filename !== null || mimeType !== null || durationSeconds !== null)
      throw new Error(`${label} file fields are unsupported for text sends`);
  } else {
    if (file === null)
      throw new Error(`${label}.file is required for ${kind} sends`);
    if (mentions.length > 0 || noPreview)
      throw new Error(`${label} mentions and no_preview are text-only`);
    if (kind !== "file" && text !== null)
      throw new Error(`${label}.text is supported only for text and file sends`);
    if (kind !== "voice" && durationSeconds !== null)
      throw new Error(`${label}.duration_seconds is voice-only`);
    if (kind === "sticker" && mimeType !== null && mimeType !== "image/webp")
      throw new Error(`${label}.mime_type must be image/webp for stickers`);
    if (kind === "voice" && mimeType !== null && !["audio/ogg", "audio/opus"].includes(mimeType))
      throw new Error(`${label}.mime_type must be audio/ogg or audio/opus for voice notes`);
  }
  return Object.freeze({ ...conversationInput(source, label), kind, text, file, filename, mimeType, durationSeconds, replyTo, mentions, noPreview });
}
function parseBeeperOperationInputForContract(action, contractVersion, input) {
  if (!isBeeperLocalOperationContractVersion(action, contractVersion)) {
    throw new Error(`${action}@${String(contractVersion)} is not an installed Beeper contract`);
  }
  if (action === "contacts.list") {
    return contractVersion === 1 ? parseBeeperContactsListInputV1(input) : contractVersion === 2 ? parseBeeperContactsListInput(input) : parseBeeperContactsListInputV3(input);
  }
  if (action === "contacts.search")
    return parseBeeperContactsSearchInput(input);
  if (action === "messaging.list")
    return parseBeeperMessagingListInput(input);
  if (action === "messaging.search")
    return parseBeeperMessagingSearchInput(input);
  if (action === "messaging.read") {
    return contractVersion === 3 ? parseBeeperMessagingReadInput(input) : parseBeeperMessagingReadInputV2(input);
  }
  if (action === "messaging.content.search") {
    const parsed = parseMessageSearchInput(input);
    if (contractVersion === 1 && (parsed.beforeCursor !== null || parsed.afterCursor !== null))
      throw new Error("Beeper message search cursor input requires direct-read contract v2");
    return parsed;
  }
  const label = `${action} input`;
  const source = record2(input, label);
  if (action === "accounts.list") {
    exactKeys2(source, [], [], label);
    return Object.freeze({});
  }
  if (action === "accounts.read") {
    exactKeys2(source, ["account_id"], [], label);
    return Object.freeze({ accountId: accountId(source, label) });
  }
  if (action === "bridges.list") {
    exactKeys2(source, [], ["provider", "available", "limit"], label);
    return Object.freeze({
      provider: contractVersion === 1 ? optionalEnum(source.provider, `${label}.provider`, [
        "local",
        "cloud",
        "self-hosted"
      ]) : optionalEnum(source.provider, `${label}.provider`, [
        "local",
        "cloud",
        "self-hosted",
        "platform-sdk"
      ]),
      available: optionalBool(source.available, `${label}.available`),
      limit: source.limit === undefined ? 128 : integer2(source.limit, `${label}.limit`, 1, 128)
    });
  }
  if (action === "bridges.read") {
    exactKeys2(source, ["bridge_id"], [], label);
    const bridgeId = boundedOpaque(source.bridge_id, `${label}.bridge_id`, 512);
    if (!/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(bridgeId)) {
      throw new Error(`${label}.bridge_id must be one canonical bridge ID`);
    }
    return Object.freeze({ bridgeId });
  }
  if (action === "contacts.read") {
    exactKeys2(source, ["account_id", "contact_id"], [], label);
    return Object.freeze({
      accountId: accountId(source, label),
      contactId: boundedOpaque(source.contact_id, `${label}.contact_id`, 2048)
    });
  }
  if (action === "conversations.read") {
    exactKeys2(source, ["account_id", "conversation_id"], ["max_participants"], label);
    return Object.freeze({
      ...conversationInput(source, label),
      maxParticipants: source.max_participants === undefined ? 200 : integer2(source.max_participants, `${label}.max_participants`, 1, 500)
    });
  }
  if (action === "messaging.message.read") {
    exactKeys2(source, ["account_id", "conversation_id", "message_id"], [], label);
    return Object.freeze({ ...conversationInput(source, label), messageId: messageId(source, label) });
  }
  if (action === "messaging.context.read") {
    exactKeys2(source, ["account_id", "conversation_id", "message_id"], ["before", "after"], label);
    return Object.freeze({
      ...conversationInput(source, label),
      messageId: messageId(source, label),
      before: source.before === undefined ? 10 : integer2(source.before, `${label}.before`, 0, 100),
      after: source.after === undefined ? 10 : integer2(source.after, `${label}.after`, 0, 100)
    });
  }
  if (action === "messaging.send")
    return parseSendInput(input);
  if (action === "reactions.set") {
    exactKeys2(source, ["account_id", "conversation_id", "message_id", "reaction", "enabled"], [], label);
    return Object.freeze({
      ...conversationInput(source, label),
      messageId: messageId(source, label),
      reaction: boundedText(source.reaction, `${label}.reaction`, 256),
      enabled: bool(source.enabled, `${label}.enabled`)
    });
  }
  if (action === "messaging.edit") {
    exactKeys2(source, ["account_id", "conversation_id", "message_id", "text"], [], label);
    return Object.freeze({
      ...conversationInput(source, label),
      messageId: messageId(source, label),
      text: boundedText(source.text, `${label}.text`, 65536)
    });
  }
  if (action === "conversations.start") {
    exactKeys2(source, ["account_id", "user_id"], [], label);
    return Object.freeze({
      accountId: accountId(source, label),
      userId: canonicalMatrixUserId(source.user_id, `${label}.user_id`)
    });
  }
  if (["conversations.archive.set", "conversations.pin.set", "conversations.mute.set"].includes(action)) {
    exactKeys2(source, ["account_id", "conversation_id", "enabled"], [], label);
    return Object.freeze({
      ...conversationInput(source, label),
      enabled: bool(source.enabled, `${label}.enabled`)
    });
  }
  if (action === "conversations.read-state.set") {
    exactKeys2(source, ["account_id", "conversation_id", "unread"], ["message_id"], label);
    return Object.freeze({
      ...conversationInput(source, label),
      unread: bool(source.unread, `${label}.unread`),
      messageId: optionalOpaque(source.message_id, `${label}.message_id`, 2048)
    });
  }
  if (action === "conversations.priority.set") {
    exactKeys2(source, ["account_id", "conversation_id", "level"], [], label);
    return Object.freeze({
      ...conversationInput(source, label),
      level: exactEnum2(source.level, `${label}.level`, ["inbox", "low"])
    });
  }
  if (action === "conversations.notify") {
    exactKeys2(source, ["account_id", "conversation_id"], [], label);
    return conversationInput(source, label);
  }
  if (action === "conversations.title.set") {
    exactKeys2(source, ["account_id", "conversation_id", "title"], [], label);
    return Object.freeze({
      ...conversationInput(source, label),
      value: boundedText(source.title, `${label}.title`, 1024)
    });
  }
  if (action === "conversations.description.set") {
    exactKeys2(source, ["account_id", "conversation_id", "clear"], ["description"], label);
    const clear = bool(source.clear, `${label}.clear`);
    const value = optionalText(source.description, `${label}.description`, 65536);
    if (clear === (value !== null))
      throw new Error(`${label} requires exactly one of clear or description`);
    if (value !== null && value.length === 0) {
      throw new Error(`${label}.description must be nonempty bounded text`);
    }
    return Object.freeze({ ...conversationInput(source, label), value });
  }
  if (action === "conversations.avatar.set") {
    exactKeys2(source, ["account_id", "conversation_id", "clear"], ["avatar"], label);
    const clear = bool(source.clear, `${label}.clear`);
    const file = optionalFile(source.avatar, `${label}.avatar`);
    if (clear === (file !== null))
      throw new Error(`${label} requires exactly one of clear or avatar`);
    return Object.freeze({ ...conversationInput(source, label), file });
  }
  if (action === "conversations.draft.set") {
    exactKeys2(source, ["account_id", "conversation_id", "clear"], ["text", "attachment", "filename", "mime_type"], label);
    const clear = bool(source.clear, `${label}.clear`);
    const text = optionalText(source.text, `${label}.text`, 65536);
    const file = optionalFile(source.attachment, `${label}.attachment`);
    const filename = optionalOpaque(source.filename, `${label}.filename`, 512);
    const mimeType = optionalOpaque(source.mime_type, `${label}.mime_type`, 128);
    if (clear && (text !== null || file !== null || filename !== null || mimeType !== null))
      throw new Error(`${label}.clear cannot include draft content`);
    if (!clear && text === null)
      throw new Error(`${label} requires text when setting a draft`);
    if (file === null && (filename !== null || mimeType !== null))
      throw new Error(`${label} attachment metadata requires attachment`);
    return Object.freeze({ ...conversationInput(source, label), text, file, filename, mimeType, clear });
  }
  if (action === "conversations.disappearing.set") {
    exactKeys2(source, ["account_id", "conversation_id", "seconds"], [], label);
    return Object.freeze({
      ...conversationInput(source, label),
      seconds: integer2(source.seconds, `${label}.seconds`, 0, 31536000)
    });
  }
  if (action === "conversations.reminder.set") {
    exactKeys2(source, ["account_id", "conversation_id", "clear"], ["when", "dismiss_on_message"], label);
    const clear = bool(source.clear, `${label}.clear`);
    const when = optionalTimestamp(source.when, `${label}.when`);
    if (clear === (when !== null))
      throw new Error(`${label} requires exactly one of clear or when`);
    const dismissOnMessage = source.dismiss_on_message === undefined ? false : bool(source.dismiss_on_message, `${label}.dismiss_on_message`);
    if (clear && dismissOnMessage)
      throw new Error(`${label}.dismiss_on_message requires when`);
    return Object.freeze({ ...conversationInput(source, label), when, dismissOnMessage });
  }
  if (action === "conversations.focus") {
    exactKeys2(source, ["account_id", "conversation_id"], ["message_id", "draft", "attachment"], label);
    return Object.freeze({
      ...conversationInput(source, label),
      messageId: optionalOpaque(source.message_id, `${label}.message_id`, 2048),
      draft: optionalText(source.draft, `${label}.draft`, 65536),
      attachment: optionalFile(source.attachment, `${label}.attachment`)
    });
  }
  exactKeys2(source, ["account_id", "conversation_id", "state"], ["duration_seconds"], label);
  const state = exactEnum2(source.state, `${label}.state`, ["typing", "paused"]);
  const durationSeconds = source.duration_seconds === undefined ? null : integer2(source.duration_seconds, `${label}.duration_seconds`, 1, 30);
  if (state === "paused" && durationSeconds !== null)
    throw new Error(`${label}.duration_seconds applies only to typing`);
  return Object.freeze({ ...conversationInput(source, label), state, durationSeconds });
}
function parseBeeperOperationInput(action, input) {
  return parseBeeperOperationInputForContract(action, BEEPER_LOCAL_OPERATION_CONTRACT_VERSIONS[action], input);
}
function timeoutArgument(timeoutMs) {
  return `${Math.max(1, Math.min(3600, Math.ceil(timeoutMs / 1000)))}s`;
}
function readArguments(timeoutMs) {
  return Object.freeze(["--read-only", "--json", "--full", "--quiet", "--target", BEEPER_DESKTOP_TARGET, "--timeout", timeoutArgument(timeoutMs)]);
}
function writeArguments(timeoutMs) {
  return Object.freeze(["--json", "--full", "--quiet", "--yes", "--target", BEEPER_DESKTOP_TARGET, "--timeout", timeoutArgument(timeoutMs)]);
}
function booleanFlag(name, value) {
  return value === null ? [] : [value ? `--${name}` : `--no-${name}`];
}
function command(action, argv, mutation) {
  return Object.freeze({ action, argv: Object.freeze(argv), mutation });
}
function planBeeperAccountsListCommand(timeoutMs) {
  return command("accounts.list", ["accounts", "list", ...readArguments(timeoutMs)], false);
}
function planBeeperVersionCommand() {
  return command("version", ["version", "--read-only", "--json", "--quiet"], false);
}
function planBeeperTargetStatusCommand(timeoutMs) {
  return command("target-status", ["targets", "status", BEEPER_DESKTOP_TARGET, ...readArguments(timeoutMs)], false);
}
function planBeeperOperationCommand(action, input, timeoutMs, resolvedFilePath) {
  const read = readArguments(timeoutMs);
  const write = writeArguments(timeoutMs);
  if (action === "accounts.list")
    return command(action, ["accounts", "list", ...read], false);
  if (action === "accounts.read")
    return command(action, ["accounts", "show", input.accountId, ...read], false);
  if (action === "bridges.list") {
    const value2 = input;
    return command(action, [
      "bridges",
      "list",
      ...value2.provider === null || value2.provider === "platform-sdk" ? [] : ["--provider", value2.provider],
      ...booleanFlag("available", value2.available),
      ...read
    ], false);
  }
  if (action === "bridges.read")
    return command(action, ["bridges", "show", input.bridgeId, ...read], false);
  if (action === "contacts.list") {
    const value2 = input;
    return command(action, [
      "contacts",
      "list",
      "--limit",
      String(value2.limit),
      ...value2.accountId === null ? [] : ["--account", value2.accountId],
      ...!("query" in value2) || value2.query === null ? [] : ["--query", value2.query],
      ...read
    ], false);
  }
  if (action === "contacts.search") {
    const value2 = input;
    return command(action, [
      "contacts",
      "search",
      value2.query,
      ...value2.accountId === null ? [] : ["--account", value2.accountId],
      ...read
    ], false);
  }
  if (action === "contacts.read") {
    const value2 = input;
    return command(action, ["contacts", "show", value2.contactId, "--account", value2.accountId, ...read], false);
  }
  if (action === "messaging.list") {
    const value2 = input;
    return command(action, [
      "chats",
      "list",
      "--limit",
      String(value2.limit),
      ...value2.accountId === null ? [] : ["--account", value2.accountId],
      ...booleanFlag("archived", value2.archived),
      ...booleanFlag("pinned", value2.pinned),
      ...booleanFlag("muted", value2.muted),
      ...booleanFlag("unread", value2.unread),
      ...booleanFlag("low-priority", value2.lowPriority),
      ...read
    ], false);
  }
  if (action === "messaging.search") {
    const value2 = input;
    return command(action, [
      "chats",
      "search",
      value2.query,
      "--limit",
      String(value2.limit),
      ...value2.accountId === null ? [] : ["--account", value2.accountId],
      ...read
    ], false);
  }
  if (action === "conversations.read") {
    const value2 = input;
    return command(action, [
      "chats",
      "show",
      "--chat",
      value2.conversationId,
      "--max-participants",
      String(value2.maxParticipants),
      ...read
    ], false);
  }
  if (action === "messaging.read") {
    const value2 = input;
    if ("sender" in value2) {
      throw new Error("messaging.read contract v3 is direct-only and cannot be planned through the Beeper CLI");
    }
    return command(action, [
      "messages",
      "list",
      "--chat",
      value2.conversationId,
      "--limit",
      String(value2.limit),
      ...value2.beforeCursor === null ? [] : ["--before-cursor", value2.beforeCursor],
      ...value2.afterCursor === null ? [] : ["--after-cursor", value2.afterCursor],
      ...read
    ], false);
  }
  if (action === "messaging.content.search") {
    const value2 = input;
    return command(action, [
      "messages",
      "search",
      ...value2.query === null ? [] : [value2.query],
      ...value2.accountId === null ? [] : ["--account", value2.accountId],
      ...value2.conversationId === null ? [] : ["--chat", value2.conversationId],
      ...value2.chatType === null ? [] : ["--chat-type", value2.chatType],
      ...value2.after === null ? [] : ["--after", value2.after],
      ...value2.before === null ? [] : ["--before", value2.before],
      ...booleanFlag("exclude-low-priority", value2.excludeLowPriority),
      ...booleanFlag("include-muted", value2.includeMuted),
      ...value2.media.flatMap((item) => ["--media", item]),
      ...value2.sender === null ? [] : ["--sender", value2.sender],
      "--limit",
      String(value2.limit),
      ...read
    ], false);
  }
  if (action === "messaging.message.read") {
    const value2 = input;
    return command(action, [
      "messages",
      "show",
      "--chat",
      value2.conversationId,
      "--id",
      value2.messageId,
      ...read
    ], false);
  }
  if (action === "messaging.context.read") {
    const value2 = input;
    return command(action, [
      "messages",
      "context",
      "--chat",
      value2.conversationId,
      "--id",
      value2.messageId,
      "--before",
      String(value2.before),
      "--after",
      String(value2.after),
      ...read
    ], false);
  }
  if (action === "messaging.send") {
    const value2 = input;
    const base = ["send", value2.kind, "--to", value2.conversationId];
    if (value2.kind === "text")
      base.push("--message", value2.text);
    else {
      if (resolvedFilePath === undefined || !isAbsolute(resolvedFilePath)) {
        throw new Error(`${action} requires one resolved absolute plan-bound file`);
      }
      base.push("--file", resolvedFilePath);
      if (value2.kind === "file" && value2.text !== null)
        base.push("--caption", value2.text);
      if (value2.filename !== null)
        base.push("--filename", value2.filename);
      if (value2.mimeType !== null)
        base.push("--mime", value2.mimeType);
      if (value2.durationSeconds !== null)
        base.push("--duration", String(value2.durationSeconds));
    }
    if (value2.replyTo !== null)
      base.push("--reply-to", value2.replyTo);
    for (const mention of value2.mentions)
      base.push("--mention", mention);
    if (value2.noPreview)
      base.push("--no-preview");
    base.push(...write);
    return command(action, base, true);
  }
  if (action === "reactions.set") {
    const value2 = input;
    return command(action, [
      "send",
      value2.enabled ? "react" : "unreact",
      "--to",
      value2.conversationId,
      "--id",
      value2.messageId,
      "--reaction",
      value2.reaction,
      ...write
    ], true);
  }
  if (action === "messaging.edit") {
    const value2 = input;
    return command(action, [
      "messages",
      "edit",
      "--chat",
      value2.conversationId,
      "--id",
      value2.messageId,
      "--message",
      value2.text,
      ...write
    ], true);
  }
  if (action === "conversations.start") {
    const value2 = input;
    return command(action, [
      "chats",
      "start",
      value2.userId,
      "--account",
      value2.accountId,
      ...write
    ], true);
  }
  const conversation = input;
  if (action === "conversations.archive.set" || action === "conversations.pin.set" || action === "conversations.mute.set") {
    const verb = action === "conversations.archive.set" ? "archive" : action === "conversations.pin.set" ? "pin" : "mute";
    const enabled = input.enabled;
    return command(action, [
      "chats",
      enabled ? verb : `un${verb}`,
      "--chat",
      conversation.conversationId,
      ...write
    ], true);
  }
  if (action === "conversations.read-state.set") {
    const value2 = input;
    return command(action, [
      "chats",
      value2.unread ? "mark-unread" : "mark-read",
      "--chat",
      value2.conversationId,
      ...value2.messageId === null ? [] : ["--message", value2.messageId],
      ...write
    ], true);
  }
  if (action === "conversations.priority.set") {
    const value2 = input;
    return command(action, [
      "chats",
      "priority",
      "--chat",
      value2.conversationId,
      "--level",
      value2.level,
      ...write
    ], true);
  }
  if (action === "conversations.notify") {
    return command(action, [
      "chats",
      "notify-anyway",
      "--chat",
      conversation.conversationId,
      ...write
    ], true);
  }
  if (action === "conversations.title.set") {
    return command(action, [
      "chats",
      "rename",
      "--chat",
      conversation.conversationId,
      "--title",
      input.value,
      ...write
    ], true);
  }
  if (action === "conversations.description.set") {
    const value2 = input;
    return command(action, [
      "chats",
      "description",
      "--chat",
      value2.conversationId,
      ...value2.value === null ? ["--clear"] : ["--description", value2.value],
      ...write
    ], true);
  }
  if (action === "conversations.avatar.set") {
    const value2 = input;
    if (value2.file !== null && (resolvedFilePath === undefined || !isAbsolute(resolvedFilePath))) {
      throw new Error(`${action} requires one resolved absolute plan-bound file`);
    }
    return command(action, [
      "chats",
      "avatar",
      "--chat",
      value2.conversationId,
      ...value2.file === null ? ["--clear"] : ["--file", resolvedFilePath],
      ...write
    ], true);
  }
  if (action === "conversations.draft.set") {
    const value2 = input;
    if (value2.file !== null && (resolvedFilePath === undefined || !isAbsolute(resolvedFilePath))) {
      throw new Error(`${action} requires one resolved absolute plan-bound file`);
    }
    return command(action, [
      "chats",
      "draft",
      "--chat",
      value2.conversationId,
      ...value2.clear ? ["--clear"] : [],
      ...value2.text === null ? [] : ["--text", value2.text],
      ...value2.file === null ? [] : ["--file", resolvedFilePath],
      ...value2.filename === null ? [] : ["--filename", value2.filename],
      ...value2.mimeType === null ? [] : ["--mime", value2.mimeType],
      ...write
    ], true);
  }
  if (action === "conversations.disappearing.set") {
    const value2 = input;
    return command(action, [
      "chats",
      "disappear",
      "--chat",
      value2.conversationId,
      "--seconds",
      value2.seconds === 0 ? "off" : String(value2.seconds),
      ...write
    ], true);
  }
  if (action === "conversations.reminder.set") {
    const value2 = input;
    return command(action, [
      "chats",
      value2.when === null ? "unremind" : "remind",
      "--chat",
      value2.conversationId,
      ...value2.when === null ? [] : ["--when", value2.when],
      ...value2.dismissOnMessage ? ["--dismiss-on-message"] : [],
      ...write
    ], true);
  }
  if (action === "conversations.focus") {
    const value2 = input;
    if (value2.attachment !== null && (resolvedFilePath === undefined || !isAbsolute(resolvedFilePath))) {
      throw new Error(`${action} requires one resolved absolute plan-bound file`);
    }
    return command(action, [
      "chats",
      "focus",
      "--chat",
      value2.conversationId,
      ...value2.messageId === null ? [] : ["--message", value2.messageId],
      ...value2.draft === null ? [] : ["--draft", value2.draft],
      ...value2.attachment === null ? [] : ["--attachment", resolvedFilePath],
      ...write
    ], true);
  }
  const value = input;
  return command(action, [
    "presence",
    "--chat",
    value.conversationId,
    "--state",
    value.state,
    ...write
  ], true);
}
function planBeeperPresenceCommands(input, timeoutMs) {
  const value = input;
  const first = planBeeperOperationCommand("presence.set", value, timeoutMs);
  if (value.durationSeconds === null)
    return Object.freeze([first]);
  const paused = Object.freeze({ ...value, state: "paused", durationSeconds: null });
  return Object.freeze([
    first,
    planBeeperOperationCommand("presence.set", paused, timeoutMs)
  ]);
}
function planBeeperReadCommand(action, input, timeoutMs) {
  const planned = planBeeperOperationCommand(action, input, timeoutMs);
  if (planned.mutation)
    throw new Error(`${action} is not a Beeper read operation`);
  return planned;
}
function isBeeperLocalOperation(value) {
  return BEEPER_LOCAL_OPERATION_NAMES.includes(value);
}
var supported = (operation) => Object.freeze({ state: "supported", operation });
var internalPreflight = (purpose) => Object.freeze({
  state: "internal-preflight",
  purpose
});
var unavailable = (reason) => Object.freeze({ state: "unavailable", reason });
var BEEPER_CLI_COMMAND_COVERAGE = Object.freeze({
  setup: unavailable("installation-lifecycle"),
  "install desktop": unavailable("installation-lifecycle"),
  "install server": unavailable("installation-lifecycle"),
  "targets list": unavailable("target-lifecycle"),
  "bridges list": supported("bridges.list"),
  "bridges show": supported("bridges.read"),
  "targets add desktop": unavailable("target-lifecycle"),
  "targets add server": unavailable("target-lifecycle"),
  "targets add remote": unavailable("target-lifecycle"),
  "targets use": unavailable("target-lifecycle"),
  "targets show": unavailable("target-lifecycle"),
  "targets status": internalPreflight("desktop-target-realm-proof"),
  "targets start": unavailable("target-lifecycle"),
  "targets stop": unavailable("target-lifecycle"),
  "targets restart": unavailable("target-lifecycle"),
  "targets logs": unavailable("target-lifecycle"),
  "targets enable": unavailable("target-lifecycle"),
  "targets disable": unavailable("target-lifecycle"),
  "targets remove": unavailable("target-lifecycle"),
  "targets tunnel": unavailable("target-lifecycle"),
  "auth status": unavailable("authentication-and-verification"),
  "auth logout": unavailable("authentication-and-verification"),
  "auth email start": unavailable("authentication-and-verification"),
  "auth email response": unavailable("authentication-and-verification"),
  verify: unavailable("authentication-and-verification"),
  "verify status": unavailable("authentication-and-verification"),
  "verify approve": unavailable("authentication-and-verification"),
  "verify recovery-key": unavailable("authentication-and-verification"),
  "verify reset-recovery-key": unavailable("authentication-and-verification"),
  "verify cancel": unavailable("authentication-and-verification"),
  "verify list": unavailable("authentication-and-verification"),
  "verify start": unavailable("authentication-and-verification"),
  "verify show": unavailable("authentication-and-verification"),
  "verify sas": unavailable("authentication-and-verification"),
  "verify sas-confirm": unavailable("authentication-and-verification"),
  "verify qr-scan": unavailable("authentication-and-verification"),
  "verify qr-confirm": unavailable("authentication-and-verification"),
  "accounts list": supported("accounts.list"),
  "accounts add": unavailable("account-lifecycle-r4"),
  "accounts show": supported("accounts.read"),
  "accounts remove": unavailable("account-lifecycle-r4"),
  "accounts use": unavailable("account-lifecycle-r4"),
  "chats list": supported("messaging.list"),
  "chats search": supported("messaging.search"),
  "chats show": supported("conversations.read"),
  "chats start": supported("conversations.start"),
  "chats archive": supported("conversations.archive.set"),
  "chats unarchive": supported("conversations.archive.set"),
  "chats pin": supported("conversations.pin.set"),
  "chats unpin": supported("conversations.pin.set"),
  "chats mute": supported("conversations.mute.set"),
  "chats unmute": supported("conversations.mute.set"),
  "chats mark-read": supported("conversations.read-state.set"),
  "chats mark-unread": supported("conversations.read-state.set"),
  "chats priority": supported("conversations.priority.set"),
  "chats notify-anyway": supported("conversations.notify"),
  "chats rename": supported("conversations.title.set"),
  "chats description": supported("conversations.description.set"),
  "chats avatar": supported("conversations.avatar.set"),
  "chats draft": supported("conversations.draft.set"),
  "chats disappear": supported("conversations.disappearing.set"),
  "chats remind": supported("conversations.reminder.set"),
  "chats unremind": supported("conversations.reminder.set"),
  "chats focus": supported("conversations.focus"),
  "messages list": supported("messaging.read"),
  "messages search": supported("messaging.content.search"),
  "messages show": supported("messaging.message.read"),
  "messages context": supported("messaging.context.read"),
  "messages edit": supported("messaging.edit"),
  "messages delete": unavailable("destructive-message-deletion-r4"),
  "messages export": unavailable("caller-path-media-or-export"),
  "send text": supported("messaging.send"),
  "send file": supported("messaging.send"),
  "send react": supported("reactions.set"),
  "send sticker": supported("messaging.send"),
  "send unreact": supported("reactions.set"),
  "send voice": supported("messaging.send"),
  presence: supported("presence.set"),
  "contacts list": supported("contacts.list"),
  "contacts search": supported("contacts.search"),
  "contacts show": supported("contacts.read"),
  "media download": unavailable("caller-path-media-or-export"),
  export: unavailable("caller-path-media-or-export"),
  watch: unavailable("unbounded-event-stream"),
  rpc: unavailable("raw-api-or-rpc"),
  man: unavailable("cli-maintenance-or-documentation"),
  doctor: unavailable("target-lifecycle"),
  status: unavailable("target-lifecycle"),
  docs: unavailable("cli-maintenance-or-documentation"),
  version: internalPreflight("pinned-tool-version-proof"),
  completion: unavailable("cli-maintenance-or-documentation"),
  plugins: unavailable("cli-extension-or-configuration"),
  "plugins available": unavailable("cli-extension-or-configuration"),
  update: unavailable("cli-extension-or-configuration"),
  "config get": unavailable("cli-extension-or-configuration"),
  "config set": unavailable("cli-extension-or-configuration"),
  "config path": unavailable("cli-extension-or-configuration"),
  "config reset": unavailable("cli-extension-or-configuration"),
  "api get": unavailable("raw-api-or-rpc"),
  "api post": unavailable("raw-api-or-rpc"),
  "api request": unavailable("raw-api-or-rpc")
});
var BEEPER_CLI_V062_COMMAND_PROFILES = Object.freeze([
  ["setup", true, "success", [], [["--channel", [], "string", false, false, ["stable", "nightly"], "stable"], ["--desktop", [], "boolean", false, false, [], null], ["--email", [], "string", false, false, [], null], ["--install", [], "boolean", false, false, [], null], ["--local", [], "boolean", false, false, [], null], ["--oauth", [], "boolean", false, false, [], null], ["--remote", [], "string", false, false, [], null], ["--server", [], "boolean", false, false, [], null], ["--server-env", [], "string", false, false, ["production", "staging"], "production"], ["--username", [], "string", false, false, [], null]]],
  ["install desktop", true, "success", [], [["--channel", [], "string", false, false, ["stable", "nightly"], "stable"]]],
  ["install server", true, "success", [], [["--channel", [], "string", false, false, ["stable", "nightly"], "stable"], ["--server-env", [], "string", false, false, ["production", "staging"], "production"]]],
  ["targets list", false, "list", [], []],
  ["bridges list", false, "list", [], [["--available", [], "boolean", false, false, [], null], ["--provider", [], "string", false, false, ["local", "cloud", "self-hosted"], null]]],
  ["bridges show", false, "data", [["bridge", true]], []],
  ["targets add desktop", true, "success", [["name", false]], [["--default", [], "boolean", false, false, [], null], ["--port", [], "number", false, false, [], null], ["--server-env", [], "string", false, false, ["production", "staging"], "production"]]],
  ["targets add server", true, "success", [["name", false]], [["--default", [], "boolean", false, false, [], null], ["--port", [], "number", false, false, [], null], ["--server-env", [], "string", false, false, ["production", "staging"], "production"]]],
  ["targets add remote", true, "success", [["name", true], ["url", true]], [["--default", [], "boolean", false, false, [], null]]],
  ["targets use", true, "success", [["name", true]], []],
  ["targets show", false, "data", [["name", false]], []],
  ["targets status", false, "data", [["name", false]], []],
  ["targets start", true, "success", [["name", false]], []],
  ["targets stop", true, "success", [["name", false]], []],
  ["targets restart", true, "success", [["name", false]], []],
  ["targets logs", false, "data", [["name", false]], [["--all", [], "boolean", false, false, [], null], ["--files", [], "number", false, false, [], 5], ["--lines", [], "number", false, false, [], 200]]],
  ["targets enable", true, "success", [["name", false]], []],
  ["targets disable", true, "success", [["name", false]], []],
  ["targets remove", true, "success", [["name", true]], []],
  ["targets tunnel", false, "data", [["name", false]], [["--install", [], "boolean", false, false, [], false], ["--cloudflared-path", [], "string", false, false, [], null], ["--retries", [], "number", false, false, [], 5], ["--url-only", [], "boolean", false, false, [], false]]],
  ["auth status", false, "data", [], []],
  ["auth logout", true, "success", [], []],
  ["auth email start", true, "success", [], [["--email", [], "string", true, false, [], null]]],
  ["auth email response", false, "data", [], [["--code", [], "string", true, false, [], null], ["--setup-request-id", [], "string", true, false, [], null], ["--username", [], "string", false, false, [], null], ["--yes", [], "boolean", false, false, [], false]]],
  ["verify", false, "data", [], [["--user", [], "string", false, false, [], null]]],
  ["verify status", false, "data", [], []],
  ["verify approve", true, "success", [], [["--id", [], "string", false, false, [], null]]],
  ["verify recovery-key", true, "success", [], [["--key", [], "string", true, false, [], null]]],
  ["verify reset-recovery-key", true, "success", [], []],
  ["verify cancel", true, "success", [], [["--id", [], "string", false, false, [], null]]],
  ["verify list", false, "list", [], []],
  ["verify start", true, "success", [], [["--user", [], "string", false, false, [], null]]],
  ["verify show", false, "data", [], []],
  ["verify sas", true, "success", [], [["--id", [], "string", false, false, [], null]]],
  ["verify sas-confirm", true, "success", [], [["--id", [], "string", false, false, [], null]]],
  ["verify qr-scan", true, "success", [], [["--id", [], "string", false, false, [], null], ["--payload", [], "string", true, false, [], null]]],
  ["verify qr-confirm", true, "success", [], [["--id", [], "string", false, false, [], null]]],
  ["accounts list", false, "list", [], [["--account", [], "string", false, true, [], null], ["--ids", [], "boolean", false, false, [], null]]],
  ["accounts add", true, "success", [["bridge", false]], [["--cookie", [], "string", false, true, [], null], ["--field", [], "string", false, true, [], null], ["--flow", [], "string", false, false, [], null], ["--guided", [], "boolean", false, false, [], true], ["--login-id", [], "string", false, false, [], null], ["--non-interactive", [], "boolean", false, false, [], null], ["--webview", [], "boolean", false, false, [], null], ["--webview-backend", [], "string", false, false, ["auto", "chrome", "webkit"], "chrome"], ["--webview-timeout", [], "number", false, false, [], 120]]],
  ["accounts show", false, "data", [["account", true]], []],
  ["accounts remove", true, "success", [["account", true]], []],
  ["accounts use", true, "success", [["account", true]], []],
  ["chats list", false, "list", [], [["--account", [], "string", false, true, [], null], ["--archived", [], "boolean", false, false, [], null], ["--ids", [], "boolean", false, false, [], null], ["--limit", [], "number", false, false, [], 20], ["--low-priority", [], "boolean", false, false, [], null], ["--muted", [], "boolean", false, false, [], null], ["--pinned", [], "boolean", false, false, [], null], ["--unread", [], "boolean", false, false, [], null]]],
  ["chats search", false, "list", [["query", true]], [["--account", [], "string", false, true, [], null], ["--ids", [], "boolean", false, false, [], null], ["--limit", [], "number", false, false, [], 20]]],
  ["chats show", false, "data", [], [["--chat", [], "string", true, false, [], null], ["--max-participants", [], "number", false, false, [], null], ["--pick", [], "number", false, false, [], null]]],
  ["chats start", true, "success", [["user", true]], [["--account", [], "string", false, false, [], null], ["--title", [], "string", false, false, [], null]]],
  ["chats archive", true, "success", [], [["--chat", [], "string", true, false, [], null], ["--pick", [], "number", false, false, [], null]]],
  ["chats unarchive", true, "success", [], [["--chat", [], "string", true, false, [], null], ["--pick", [], "number", false, false, [], null]]],
  ["chats pin", true, "success", [], [["--chat", [], "string", true, false, [], null], ["--pick", [], "number", false, false, [], null]]],
  ["chats unpin", true, "success", [], [["--chat", [], "string", true, false, [], null], ["--pick", [], "number", false, false, [], null]]],
  ["chats mute", true, "success", [], [["--chat", [], "string", true, false, [], null], ["--pick", [], "number", false, false, [], null]]],
  ["chats unmute", true, "success", [], [["--chat", [], "string", true, false, [], null], ["--pick", [], "number", false, false, [], null]]],
  ["chats mark-read", true, "success", [], [["--chat", [], "string", true, false, [], null], ["--message", [], "string", false, false, [], null], ["--pick", [], "number", false, false, [], null]]],
  ["chats mark-unread", true, "success", [], [["--chat", [], "string", true, false, [], null], ["--message", [], "string", false, false, [], null], ["--pick", [], "number", false, false, [], null]]],
  ["chats priority", true, "success", [], [["--chat", [], "string", true, false, [], null], ["--level", [], "string", true, false, ["inbox", "low"], null], ["--pick", [], "number", false, false, [], null]]],
  ["chats notify-anyway", true, "success", [], [["--chat", [], "string", true, false, [], null], ["--pick", [], "number", false, false, [], null]]],
  ["chats rename", true, "success", [], [["--chat", [], "string", true, false, [], null], ["--pick", [], "number", false, false, [], null], ["--title", [], "string", true, false, [], null]]],
  ["chats description", true, "success", [], [["--chat", [], "string", true, false, [], null], ["--clear", [], "boolean", false, false, [], null], ["--description", [], "string", false, false, [], null], ["--pick", [], "number", false, false, [], null]]],
  ["chats avatar", true, "success", [], [["--chat", [], "string", true, false, [], null], ["--clear", [], "boolean", false, false, [], null], ["--file", [], "string", false, false, [], null], ["--pick", [], "number", false, false, [], null]]],
  ["chats draft", true, "success", [], [["--chat", [], "string", true, false, [], null], ["--clear", [], "boolean", false, false, [], null], ["--file", [], "string", false, false, [], null], ["--filename", [], "string", false, false, [], null], ["--mime", [], "string", false, false, [], null], ["--pick", [], "number", false, false, [], null], ["--text", [], "string", false, false, [], null]]],
  ["chats disappear", true, "success", [], [["--chat", [], "string", true, false, [], null], ["--pick", [], "number", false, false, [], null], ["--seconds", [], "string", true, false, [], null]]],
  ["chats remind", true, "success", [], [["--chat", [], "string", true, false, [], null], ["--dismiss-on-message", [], "boolean", false, false, [], null], ["--pick", [], "number", false, false, [], null], ["--when", [], "string", true, false, [], null]]],
  ["chats unremind", true, "success", [], [["--chat", [], "string", true, false, [], null], ["--pick", [], "number", false, false, [], null]]],
  ["chats focus", true, "success", [], [["--attachment", [], "string", false, false, [], null], ["--chat", [], "string", true, false, [], null], ["--draft", [], "string", false, false, [], null], ["--message", [], "string", false, false, [], null], ["--pick", [], "number", false, false, [], null]]],
  ["messages list", false, "list", [], [["--after-cursor", [], "string", false, false, [], null], ["--asc", [], "boolean", false, false, [], null], ["--before-cursor", [], "string", false, false, [], null], ["--chat", [], "string", true, false, [], null], ["--ids", [], "boolean", false, false, [], null], ["--limit", [], "number", false, false, [], 50], ["--pick", [], "number", false, false, [], null], ["--sender", [], "string", false, false, [], null]]],
  ["messages search", false, "list", [["query", false]], [["--account", [], "string", false, true, [], null], ["--after", [], "string", false, false, [], null], ["--before", [], "string", false, false, [], null], ["--chat", [], "string", false, true, [], null], ["--chat-type", [], "string", false, false, ["group", "single"], null], ["--exclude-low-priority", [], "boolean", false, false, [], true], ["--ids", [], "boolean", false, false, [], null], ["--include-muted", [], "boolean", false, false, [], true], ["--limit", [], "number", false, false, [], 50], ["--media", [], "string", false, true, ["any", "video", "image", "link", "file"], null], ["--sender", [], "string", false, false, [], null]]],
  ["messages show", false, "data", [], [["--chat", [], "string", true, false, [], null], ["--id", [], "string", true, false, [], null], ["--pick", [], "number", false, false, [], null]]],
  ["messages context", false, "data", [], [["--after", [], "number", false, false, [], 10], ["--before", [], "number", false, false, [], 10], ["--chat", [], "string", true, false, [], null], ["--id", [], "string", true, false, [], null], ["--pick", [], "number", false, false, [], null]]],
  ["messages edit", true, "success", [], [["--chat", [], "string", true, false, [], null], ["--id", [], "string", true, false, [], null], ["--message", [], "string", true, false, [], null], ["--pick", [], "number", false, false, [], null]]],
  ["messages delete", true, "success", [], [["--chat", [], "string", true, false, [], null], ["--for-everyone", [], "boolean", false, false, [], null], ["--id", [], "string", true, false, [], null], ["--pick", [], "number", false, false, [], null]]],
  ["messages export", false, "data", [], [["--after", [], "string", false, false, [], null], ["--after-cursor", [], "string", false, false, [], null], ["--asc", [], "boolean", false, false, [], null], ["--before", [], "string", false, false, [], null], ["--before-cursor", [], "string", false, false, [], null], ["--chat", [], "string", true, false, [], null], ["--limit", [], "number", false, false, [], null], ["--output", ["-o"], "string", false, false, [], "-"], ["--pick", [], "number", false, false, [], null]]],
  ["send text", true, "send-result", [], [["--mention", [], "string", false, true, [], null], ["--message", [], "string", true, false, [], null], ["--no-preview", [], "boolean", false, false, [], null], ["--pick", [], "number", false, false, [], null], ["--reply-to", [], "string", false, false, [], null], ["--to", [], "string", true, false, [], null], ["--wait", [], "boolean", false, false, [], null], ["--wait-timeout", [], "number", false, false, [], 30000]]],
  ["send file", true, "send-result", [], [["--caption", [], "string", false, false, [], null], ["--file", [], "string", true, false, [], null], ["--filename", [], "string", false, false, [], null], ["--mime", [], "string", false, false, [], null], ["--pick", [], "number", false, false, [], null], ["--reply-to", [], "string", false, false, [], null], ["--to", [], "string", true, false, [], null], ["--wait", [], "boolean", false, false, [], null], ["--wait-timeout", [], "number", false, false, [], 30000]]],
  ["send react", true, "send-result", [], [["--id", [], "string", true, false, [], null], ["--pick", [], "number", false, false, [], null], ["--reaction", [], "string", true, false, [], null], ["--to", [], "string", true, false, [], null], ["--transaction", [], "string", false, false, [], null]]],
  ["send sticker", true, "send-result", [], [["--file", [], "string", true, false, [], null], ["--filename", [], "string", false, false, [], null], ["--mime", [], "string", false, false, [], "image/webp"], ["--pick", [], "number", false, false, [], null], ["--reply-to", [], "string", false, false, [], null], ["--to", [], "string", true, false, [], null], ["--wait", [], "boolean", false, false, [], null], ["--wait-timeout", [], "number", false, false, [], 30000]]],
  ["send unreact", true, "send-result", [], [["--id", [], "string", true, false, [], null], ["--pick", [], "number", false, false, [], null], ["--reaction", [], "string", true, false, [], null], ["--to", [], "string", true, false, [], null], ["--transaction", [], "string", false, false, [], null]]],
  ["send voice", true, "send-result", [], [["--duration", [], "number", false, false, [], null], ["--file", [], "string", true, false, [], null], ["--filename", [], "string", false, false, [], null], ["--mime", [], "string", false, false, [], "audio/ogg"], ["--pick", [], "number", false, false, [], null], ["--reply-to", [], "string", false, false, [], null], ["--to", [], "string", true, false, [], null], ["--wait", [], "boolean", false, false, [], null], ["--wait-timeout", [], "number", false, false, [], 30000]]],
  ["presence", false, "data", [], [["--chat", [], "string", true, false, [], null], ["--duration", [], "number", false, false, [], null], ["--pick", [], "number", false, false, [], null], ["--state", [], "string", false, false, ["typing", "paused"], "typing"]]],
  ["contacts list", false, "list", [], [["--account", [], "string", false, true, [], null], ["--ids", [], "boolean", false, false, [], null], ["--limit", [], "number", false, false, [], 50], ["--query", [], "string", false, false, [], null]]],
  ["contacts search", false, "list", [["query", true]], [["--account", [], "string", false, true, [], null]]],
  ["contacts show", false, "data", [["id", true]], [["--account", [], "string", false, true, [], null]]],
  ["media download", false, "data", [["url", true]], [["--out", ["-o"], "string", false, false, [], "."]]],
  ["export", false, "data", [], [["--account", [], "string", false, true, [], null], ["--chat", [], "string", false, true, [], null], ["--force", [], "boolean", false, false, [], null], ["--limit-chats", [], "number", false, false, [], null], ["--limit-messages", [], "number", false, false, [], null], ["--max-participants", [], "number", false, false, [], 500], ["--no-attachments", [], "boolean", false, false, [], null], ["--out", ["-o"], "string", false, false, [], "beeper-export"], ["--pick", [], "number", false, false, [], null], ["--quiet", [], "boolean", false, false, [], false]]],
  ["watch", false, "stream", [], [["--chat", ["-c"], "string", false, true, [], null], ["--exclude-type", [], "string", false, true, ["chat.upserted", "chat.deleted", "message.upserted", "message.deleted"], null], ["--include-type", [], "string", false, true, ["chat.upserted", "chat.deleted", "message.upserted", "message.deleted"], null], ["--json", [], "boolean", false, false, [], false], ["--webhook", [], "string", false, false, [], null], ["--webhook-queue", [], "number", false, false, [], 64], ["--webhook-secret", [], "string", false, false, [], null]]],
  ["rpc", false, "stream", [], []],
  ["man", false, "manual", [], []],
  ["doctor", false, "data", [], []],
  ["status", false, "data", [], []],
  ["docs", false, "data", [], []],
  ["version", false, "data", [], []],
  ["completion", false, "data", [["shell", false]], [["--refresh-cache", ["-r"], "boolean", false, false, [], null], ["--semantic", [], "boolean", false, false, [], null]]],
  ["plugins", false, "data", [], []],
  ["plugins available", false, "data", [], []],
  ["update", true, "success", [], [["--check", [], "boolean", false, false, [], null], ["--cli", [], "boolean", false, false, [], null], ["--desktop", [], "boolean", false, false, [], null], ["--server", [], "boolean", false, false, [], null]]],
  ["config get", false, "data", [["key", false, ["baseURL", "auth", "defaultTarget", "defaultAccount"]]], []],
  ["config set", true, "success", [["key", true, ["defaultTarget", "defaultAccount"]], ["value", true]], []],
  ["config path", false, "data", [], []],
  ["config reset", true, "success", [], []],
  ["api get", false, "data", [["path", true]], [["--json", [], "boolean", false, false, [], true], ["--no-auth", [], "boolean", false, false, [], false]]],
  ["api post", false, "data", [["path", true]], [["--body", [], "string", false, false, [], "{}"], ["--json", [], "boolean", false, false, [], true], ["--no-auth", [], "boolean", false, false, [], false]]],
  ["api request", false, "data", [["method", true, ["GET", "POST", "PUT", "PATCH", "DELETE"]], ["path", true]], [["--body", [], "string", false, false, [], null], ["--json", [], "boolean", false, false, [], true], ["--no-auth", [], "boolean", false, false, [], false]]]
]);
var BEEPER_CLI_V062_PRIVATE_COMMAND_PROFILE = Object.freeze([
  "_complete",
  false,
  "list",
  [["kind", true, ["chat", "account", "contact", "target"]]],
  [
    ["--query", [], "string", false, false, [], null],
    ["--target", [], "string", false, false, [], null],
    ["--limit", [], "number", false, false, [], 25],
    ["--timeout-ms", [], "number", false, false, [], 1500]
  ]
]);
var commandFlagCoordinate = (command2, flag) => `${command2}\x00${flag}`;
var BEEPER_CLI_V062_ALLOW_NO_FLAGS = new Set([
  commandFlagCoordinate("accounts add", "--guided"),
  commandFlagCoordinate("api get", "--json"),
  commandFlagCoordinate("api post", "--json"),
  commandFlagCoordinate("api request", "--json"),
  commandFlagCoordinate("bridges list", "--available"),
  ...["--archived", "--low-priority", "--muted", "--pinned", "--unread"].map((flag) => commandFlagCoordinate("chats list", flag)),
  commandFlagCoordinate("messages search", "--exclude-low-priority"),
  commandFlagCoordinate("messages search", "--include-muted")
]);
var BEEPER_CLI_V062_EXPLICIT_FALSE_BOOLEAN_FLAGS = new Set([
  ...["--desktop", "--install", "--local", "--oauth", "--server"].map((flag) => commandFlagCoordinate("setup", flag)),
  ...["targets add desktop", "targets add remote", "targets add server"].map((command2) => commandFlagCoordinate(command2, "--default")),
  commandFlagCoordinate("targets logs", "--all"),
  commandFlagCoordinate("accounts list", "--ids"),
  commandFlagCoordinate("accounts add", "--non-interactive"),
  commandFlagCoordinate("accounts add", "--webview"),
  commandFlagCoordinate("chats list", "--ids"),
  commandFlagCoordinate("chats search", "--ids"),
  commandFlagCoordinate("chats description", "--clear"),
  commandFlagCoordinate("chats avatar", "--clear"),
  commandFlagCoordinate("chats draft", "--clear"),
  commandFlagCoordinate("chats remind", "--dismiss-on-message"),
  commandFlagCoordinate("messages list", "--asc"),
  commandFlagCoordinate("messages list", "--ids"),
  commandFlagCoordinate("messages search", "--ids"),
  commandFlagCoordinate("messages delete", "--for-everyone"),
  commandFlagCoordinate("messages export", "--asc"),
  commandFlagCoordinate("send text", "--no-preview"),
  ...["send text", "send file", "send sticker", "send voice"].map((command2) => commandFlagCoordinate(command2, "--wait")),
  commandFlagCoordinate("contacts list", "--ids"),
  commandFlagCoordinate("export", "--force"),
  commandFlagCoordinate("export", "--no-attachments"),
  ...["--refresh-cache", "--semantic"].map((flag) => commandFlagCoordinate("completion", flag)),
  ...["--check", "--cli", "--desktop", "--server"].map((flag) => commandFlagCoordinate("update", flag))
]);
function surfaceDecision(disposition, rationale, operation = null, replacement = null, fixedValue = null) {
  return Object.freeze({ disposition, rationale, operation, replacement, fixedValue });
}
var BEEPER_CLI_V062_GLOBAL_FLAGS = Object.freeze([
  Object.freeze({
    name: "--base-url",
    aliases: Object.freeze([]),
    source: "global",
    valueType: "string",
    allowNo: false,
    required: false,
    multiple: false,
    enum: Object.freeze([]),
    default: Object.freeze({ kind: "none" }),
    decision: surfaceDecision("fixed", "Wrench resolves and verifies the fixed Desktop loopback endpoint; callers cannot supply an endpoint.", null, null, "verified-desktop-loopback-endpoint")
  }),
  Object.freeze({
    name: "--target",
    aliases: Object.freeze(["-t"]),
    source: "global",
    valueType: "string",
    allowNo: false,
    required: false,
    multiple: false,
    enum: Object.freeze([]),
    default: Object.freeze({ kind: "derived", description: "configured CLI target" }),
    decision: surfaceDecision("fixed", "The provider is permanently bound to the Desktop target.", null, null, "desktop")
  }),
  Object.freeze({
    name: "--debug",
    aliases: Object.freeze([]),
    source: "global",
    valueType: "boolean",
    allowNo: false,
    required: false,
    multiple: false,
    enum: Object.freeze([]),
    default: Object.freeze({ kind: "literal", value: false, authority: "tagged-source" }),
    decision: surfaceDecision("unsupported", "Raw SDK debug output can contain provider internals and is never returned.")
  }),
  Object.freeze({
    name: "--events",
    aliases: Object.freeze([]),
    source: "global",
    valueType: "boolean",
    allowNo: false,
    required: false,
    multiple: false,
    enum: Object.freeze([]),
    default: Object.freeze({ kind: "literal", value: false, authority: "tagged-source" }),
    decision: surfaceDecision("replaced", "Wrench emits its own bounded operation lifecycle instead of raw CLI NDJSON.", null, "Wrench operation events")
  }),
  Object.freeze({
    name: "--full",
    aliases: Object.freeze([]),
    source: "global",
    valueType: "boolean",
    allowNo: false,
    required: false,
    multiple: false,
    enum: Object.freeze([]),
    default: Object.freeze({ kind: "literal", value: false, authority: "tagged-source" }),
    decision: surfaceDecision("fixed", "Wrench fixes --full true and independently enforces its output bound; the upstream core currently ignores the parsed value.", null, null, true)
  }),
  Object.freeze({
    name: "--json",
    aliases: Object.freeze([]),
    source: "global",
    valueType: "boolean",
    allowNo: false,
    required: false,
    multiple: false,
    enum: Object.freeze([]),
    default: Object.freeze({ kind: "literal", value: false, authority: "tagged-source" }),
    decision: surfaceDecision("fixed", "The provider always requests machine-readable output.", null, null, true)
  }),
  Object.freeze({
    name: "--quiet",
    aliases: Object.freeze(["-q"]),
    source: "global",
    valueType: "boolean",
    allowNo: false,
    required: false,
    multiple: false,
    enum: Object.freeze([]),
    default: Object.freeze({ kind: "literal", value: false, authority: "tagged-source" }),
    decision: surfaceDecision("fixed", "The provider always suppresses interactive presentation.", null, null, true)
  }),
  Object.freeze({
    name: "--read-only",
    aliases: Object.freeze([]),
    source: "global",
    valueType: "boolean",
    allowNo: false,
    required: false,
    multiple: false,
    enum: Object.freeze([]),
    default: Object.freeze({ kind: "literal", value: false, authority: "tagged-source" }),
    decision: surfaceDecision("absorbed", "Wrench fixes this flag for reads and uses kernel preview and confirmation for writes.")
  }),
  Object.freeze({
    name: "--timeout",
    aliases: Object.freeze([]),
    source: "global",
    valueType: "string",
    allowNo: false,
    required: false,
    multiple: false,
    enum: Object.freeze([]),
    default: Object.freeze({ kind: "none" }),
    decision: surfaceDecision("fixed", "The upstream core currently ignores --timeout; Wrench's outer process deadline is authoritative and callers cannot inject duration syntax.", null, null, "outer-process-deadline")
  }),
  Object.freeze({
    name: "--yes",
    aliases: Object.freeze(["-y"]),
    source: "global",
    valueType: "boolean",
    allowNo: false,
    required: false,
    multiple: false,
    enum: Object.freeze([]),
    default: Object.freeze({ kind: "literal", value: false, authority: "tagged-source" }),
    decision: surfaceDecision("absorbed", "The kernel owns explicit preview and confirmation before fixed noninteractive dispatch.")
  })
]);
var INPUT_DEPENDENT_EFFECT_COMMANDS = new Set([
  "api request",
  "completion",
  "messages export",
  "media download",
  "plugins",
  "rpc",
  "update",
  "watch"
]);
var REPORTED_READS_WITH_REVIEWED_WRITES = new Set([
  "auth email response",
  "api post",
  "export",
  "presence",
  "targets tunnel",
  "verify"
]);
function reviewedEffect(command2, upstreamReportedMutates) {
  if (INPUT_DEPENDENT_EFFECT_COMMANDS.has(command2))
    return "input-dependent";
  return upstreamReportedMutates || REPORTED_READS_WITH_REVIEWED_WRITES.has(command2) ? "write" : "read";
}
function surfaceCommandDecision(command2) {
  if (command2 === "_complete") {
    return surfaceDecision("unsupported", "Private source completion internals can resolve fuzzy live identities and are outside provider authority.", null, "Wrench capability metadata and exact semantic IDs");
  }
  if (command2 === "accounts add" || command2 === "accounts remove") {
    return surfaceDecision("R4", "Account lifecycle is operator-only administration and has no routine provider operation.");
  }
  if (command2 === "messages delete") {
    return surfaceDecision("R4", "Deletion stays inert: upstream can silently fall back from delete-for-everyone to local deletion and only returns success/void with no provable effect.", null, "No dispatch without exact external confirmation and effect proof");
  }
  if (command2 === "accounts use") {
    return surfaceDecision("absorbed", "Mutable default-account selection is replaced by an exact account_id on every account-aware operation.", null, "Explicit account_id");
  }
  if (command2 === "export") {
    return surfaceDecision("internal", "Only the existing bounded private archive path may invoke top-level export with Wrench-owned output, limits, and no attachments.", null, "Internal bounded private export");
  }
  const legacy = BEEPER_CLI_COMMAND_COVERAGE[command2];
  if (legacy === undefined)
    throw new Error(`Beeper surface command ${command2} lacks a disposition`);
  if (legacy.state === "supported") {
    return surfaceDecision("supported", `A bounded semantic ${legacy.operation} operation covers this command without raw argv authority.`, legacy.operation);
  }
  if (legacy.state === "internal-preflight") {
    return surfaceDecision("internal", `This command is restricted to the ${legacy.purpose} runtime preflight.`);
  }
  const special = command2 === "messages export" ? "A bounded private messages artifact is not yet exposed; caller paths and buffered stdout remain forbidden." : command2 === "media download" ? "No media operation exists until an opaque prior-message handle can be consumed by a genuinely bounded worker." : command2 === "watch" ? "No event operation exists until finite supervision proves count, duration, byte, and termination bounds; webhooks remain forbidden." : command2 === "targets tunnel" ? "The floating Cloudflare JIT plugin and public tunnel are permanently outside provider authority." : `This ${legacy.reason} command group remains outside the semantic provider authority.`;
  return surfaceDecision("unsupported", special);
}
function surfaceItemDecision(command2, item, commandDecision) {
  if (command2 === "export" && commandDecision.disposition === "internal") {
    if (item === "--no-attachments") {
      return surfaceDecision("fixed", "The internal private export always disables attachments.", null, "Wrench-owned bounded private export", true);
    }
    if (item === "--force") {
      return surfaceDecision("fixed", "The internal private export never overwrites an existing caller path.", null, "Fresh Wrench-owned export root", false);
    }
    if (item === "--out") {
      return surfaceDecision("fixed", "The output root is allocated and owned by Wrench; callers cannot inject a path.", null, "Wrench-owned private export root", "wrench-owned-private-export-root");
    }
    if (item === "--quiet") {
      return surfaceDecision("fixed", "The internal export suppresses interactive presentation.", null, "Bounded canonical manifest", true);
    }
    if (["--limit-chats", "--limit-messages", "--max-participants"].includes(item)) {
      return surfaceDecision("absorbed", `${item} is supplied only by the bounded private export planner.`, null, "Validated Wrench capture bound");
    }
    return surfaceDecision("internal", `${item} is unavailable to provider callers and omitted by the fixed private export plan.`, null, "Internal bounded private export");
  }
  if (commandDecision.disposition !== "supported") {
    return surfaceDecision(commandDecision.disposition, `${item} inherits the command disposition: ${commandDecision.rationale}`, commandDecision.operation, commandDecision.replacement);
  }
  const operation = commandDecision.operation;
  if (item === "--pick") {
    return surfaceDecision("replaced", "Fuzzy selection and result picking are forbidden.", operation, "Exact provider ID input");
  }
  if (item === "--ids") {
    return surfaceDecision("absorbed", "Normalized results always include stable provider IDs.", operation);
  }
  if (item === "--asc") {
    return surfaceDecision("absorbed", "The operation uses one canonical page order and never passes --asc before deriving continuation.", operation, "Canonical operation order");
  }
  if (item === "--wait" || item === "--wait-timeout") {
    return surfaceDecision("replaced", "Mutation dispatch never waits inside the send command.", operation, "Future read-only messaging.delivery.await over an accepted pending send");
  }
  if (item === "--transaction") {
    return surfaceDecision("absorbed", "Wrench owns the reaction transaction identity through the confirmed plan and dispatch fence.", operation);
  }
  if (command2 === "chats start" && item === "--title") {
    return surfaceDecision("replaced", "Conversation creation first returns an exact ID; title mutation is separate.", operation, "conversations.title.set");
  }
  if (command2 === "presence" && item === "--duration") {
    return surfaceDecision("absorbed", "Duration becomes two explicit bounded Wrench dispatches instead of a hidden child-process write.", operation);
  }
  if (item === "--file" || item === "--attachment") {
    return surfaceDecision("replaced", "Caller filesystem paths are forbidden.", operation, "Wrench plan-bound file capability");
  }
  if (item === "--account" && command2 === "accounts list") {
    return surfaceDecision("replaced", "The list returns the fixed account realm; exact lookup is separate.", operation, "accounts.read with account_id");
  }
  if (item === "--account") {
    return surfaceDecision("replaced", "Fuzzy and multi-account selectors are forbidden.", operation, "One exact account_id");
  }
  if (item === "--chat" || item === "--to") {
    return surfaceDecision("replaced", "Numeric, title, fuzzy, and multi-chat selectors are forbidden.", operation, "One exact full conversation_id");
  }
  if (["bridge", "account", "user", "id"].includes(item)) {
    return surfaceDecision("replaced", "Selector shorthand is replaced by an exact provider identity.", operation, "Exact semantic ID input");
  }
  if (command2 === "messages search" && item === "--exclude-low-priority") {
    return surfaceDecision("supported", "The semantic default is true, matching the generated Desktop API/OpenAPI server default used when the CLI omits the flag.", operation);
  }
  if (command2 === "bridges list" && item === "--provider") {
    return surfaceDecision("supported", "The three upstream values pass exactly; platform-sdk is a Wrench-local filter over an unfiltered bridge catalog and is never passed upstream.", operation);
  }
  return surfaceDecision("supported", `${item} is exposed through bounded typed input for ${operation}.`, operation);
}
function surfaceDefault(command2, name, value) {
  const sourceAuthority = command2 === "targets tunnel" ? "jit-plugin-source" : "tagged-source";
  if (BEEPER_CLI_V062_EXPLICIT_FALSE_BOOLEAN_FLAGS.has(commandFlagCoordinate(command2, name)))
    return Object.freeze({
      kind: "literal",
      value: false,
      authority: sourceAuthority
    });
  return value === null ? Object.freeze({ kind: "none" }) : Object.freeze({
    kind: "literal",
    value,
    authority: command2 === "messages search" && name === "--exclude-low-priority" ? "sdk-openapi" : sourceAuthority
  });
}
function commandReconciliation(command2, decision) {
  if (decision.disposition !== "supported" || decision.operation === null) {
    return Object.freeze({
      availability: "none",
      namespace: null,
      predicate: null,
      rationale: "No provider mutation dispatch is authorized by this disposition."
    });
  }
  const policy = BEEPER_LOCAL_OPERATIONS[decision.operation];
  if (policy.effect === "read") {
    return Object.freeze({
      availability: "none",
      namespace: null,
      predicate: null,
      rationale: "Read operations do not require mutation reconciliation."
    });
  }
  if (["presence.set", "conversations.notify", "conversations.focus"].includes(decision.operation)) {
    return Object.freeze({
      availability: "none",
      namespace: null,
      predicate: null,
      rationale: "This visible effect has no exact provider readback and is never blindly retried after dispatch uncertainty."
    });
  }
  if (command2 === "chats avatar") {
    return Object.freeze({
      availability: "input-dependent",
      namespace: "semantic-operation",
      predicate: Object.freeze({
        op: "not",
        predicate: Object.freeze({ op: "present", field: "avatar" })
      }),
      rationale: "Only clear/no-file avatar state has an exact readback; uploaded file identity is irreconcilable."
    });
  }
  if (command2 === "chats draft") {
    return Object.freeze({
      availability: "input-dependent",
      namespace: "semantic-operation",
      predicate: Object.freeze({
        op: "not",
        predicate: Object.freeze({ op: "present", field: "attachment" })
      }),
      rationale: "Only drafts without an attachment have an exact readback; attachment identity is irreconcilable."
    });
  }
  if (command2 === "chats mark-read" || command2 === "chats mark-unread") {
    return Object.freeze({
      availability: "input-dependent",
      namespace: "semantic-operation",
      predicate: Object.freeze({
        op: "not",
        predicate: Object.freeze({ op: "present", field: "message_id" })
      }),
      rationale: "Only the conversation-level marker has an exact readback; a caller-selected message boundary is irreconcilable."
    });
  }
  return Object.freeze({
    availability: "always",
    namespace: null,
    predicate: null,
    rationale: "The operation contract defines an exact accepted target or desired-state readback and forbids blind retry."
  });
}
function commandOutput(command2, output, decision) {
  if (command2 === "export") {
    return Object.freeze({
      shape: "Private canonical archive shards under a Wrench-owned root.",
      completeness: "internal",
      maxBytes: 4 * 1024 * 1024 * 1024,
      privateArtifact: true,
      truncation: "The internal caller fixes chat, message, participant, timeout, and no-attachment bounds."
    });
  }
  if (decision.disposition !== "supported") {
    return Object.freeze({
      shape: `Upstream ${output} output is not returned through a provider operation.`,
      completeness: "unavailable",
      maxBytes: null,
      privateArtifact: false,
      truncation: null
    });
  }
  const policy = BEEPER_LOCAL_OPERATIONS[decision.operation];
  const search = decision.operation?.endsWith("search") === true;
  const blendedContactQuery = command2 === "contacts list";
  return Object.freeze({
    shape: policy.effect === "read" ? "Bounded normalized provider projection with explicit completeness metadata." : "Bounded normalized mutation receipt and exact reconciliation evidence when available.",
    completeness: policy.effect === "write" ? "input-dependent" : search ? "candidate-window" : blendedContactQuery ? "input-dependent" : "bounded",
    maxBytes: 10 * 1024 * 1024,
    privateArtifact: false,
    truncation: policy.effect === "read" ? blendedContactQuery ? "Desktop loopback contact pages include continuation metadata. Official CLI v0.6.2 contracts remain a first-page window with no continuation." : "Provider limits and continuation availability are explicit in the normalized output." : "No upstream body, path, token, or unbounded diagnostic output is exposed."
  });
}
function commandInputRules(command2) {
  if (command2 === "messages list" || command2 === "messages export") {
    const namespace = command2 === "messages list" ? "semantic-operation" : "upstream-command";
    return Object.freeze([
      Object.freeze({
        namespace,
        when: Object.freeze({ op: "present", field: "before_cursor" }),
        require: Object.freeze([]),
        requireAny: Object.freeze([]),
        exactlyOne: Object.freeze([]),
        forbid: Object.freeze(["after_cursor"]),
        rationale: "A page has only one continuation direction."
      }),
      Object.freeze({
        namespace,
        when: Object.freeze({ op: "present", field: "after_cursor" }),
        require: Object.freeze([]),
        requireAny: Object.freeze([]),
        exactlyOne: Object.freeze([]),
        forbid: Object.freeze(["before_cursor"]),
        rationale: "A page has only one continuation direction."
      })
    ]);
  }
  if (command2 === "chats description")
    return Object.freeze([
      Object.freeze({
        namespace: "semantic-operation",
        when: Object.freeze({ op: "eq", field: "clear", value: true }),
        require: Object.freeze([]),
        requireAny: Object.freeze([]),
        exactlyOne: Object.freeze([]),
        forbid: Object.freeze(["description"]),
        rationale: "Clear description cannot also provide replacement text."
      }),
      Object.freeze({
        namespace: "semantic-operation",
        when: Object.freeze({ op: "eq", field: "clear", value: false }),
        require: Object.freeze(["description"]),
        requireAny: Object.freeze([]),
        exactlyOne: Object.freeze([]),
        forbid: Object.freeze([]),
        rationale: "A non-clear description mutation requires replacement text."
      })
    ]);
  if (command2 === "chats avatar")
    return Object.freeze([
      Object.freeze({
        namespace: "semantic-operation",
        when: Object.freeze({ op: "eq", field: "clear", value: true }),
        require: Object.freeze([]),
        requireAny: Object.freeze([]),
        exactlyOne: Object.freeze([]),
        forbid: Object.freeze(["avatar"]),
        rationale: "Clear avatar cannot also provide an upload capability."
      }),
      Object.freeze({
        namespace: "semantic-operation",
        when: Object.freeze({ op: "eq", field: "clear", value: false }),
        require: Object.freeze(["avatar"]),
        requireAny: Object.freeze([]),
        exactlyOne: Object.freeze([]),
        forbid: Object.freeze([]),
        rationale: "A non-clear avatar mutation requires one plan-bound upload capability."
      })
    ]);
  if (command2 === "chats draft")
    return Object.freeze([
      Object.freeze({
        namespace: "semantic-operation",
        when: Object.freeze({ op: "eq", field: "clear", value: true }),
        require: Object.freeze([]),
        requireAny: Object.freeze([]),
        exactlyOne: Object.freeze([]),
        forbid: Object.freeze(["text", "attachment", "filename", "mime_type"]),
        rationale: "Clear draft cannot carry replacement content or attachment metadata."
      }),
      Object.freeze({
        namespace: "semantic-operation",
        when: Object.freeze({ op: "eq", field: "clear", value: false }),
        require: Object.freeze(["text"]),
        requireAny: Object.freeze([]),
        exactlyOne: Object.freeze([]),
        forbid: Object.freeze([]),
        rationale: "A non-clear draft requires text; one plan-bound attachment is optional."
      }),
      ...["filename", "mime_type"].map((field) => Object.freeze({
        namespace: "semantic-operation",
        when: Object.freeze({ op: "present", field }),
        require: Object.freeze(["attachment"]),
        requireAny: Object.freeze([]),
        exactlyOne: Object.freeze([]),
        forbid: Object.freeze([]),
        rationale: `${field} is meaningful only with one attachment.`
      }))
    ]);
  if (command2 === "messages search")
    return Object.freeze([
      Object.freeze({
        namespace: "semantic-operation",
        when: Object.freeze({ op: "true" }),
        require: Object.freeze([]),
        requireAny: Object.freeze(["query", "account_id", "conversation_id", "chat_type", "after", "before", "media", "sender"]),
        exactlyOne: Object.freeze([]),
        forbid: Object.freeze([]),
        rationale: "Search requires text or a substantive bounded filter; presentation booleans alone are insufficient."
      })
    ]);
  return Object.freeze([]);
}
function commandPathSemanticInputs(command2) {
  const fixed = {
    "chats archive": Object.freeze({ enabled: true }),
    "chats unarchive": Object.freeze({ enabled: false }),
    "chats pin": Object.freeze({ enabled: true }),
    "chats unpin": Object.freeze({ enabled: false }),
    "chats mute": Object.freeze({ enabled: true }),
    "chats unmute": Object.freeze({ enabled: false }),
    "chats mark-read": Object.freeze({ unread: false }),
    "chats mark-unread": Object.freeze({ unread: true }),
    "chats remind": Object.freeze({ clear: false }),
    "chats unremind": Object.freeze({ clear: true }),
    "send text": Object.freeze({ kind: "text" }),
    "send file": Object.freeze({ kind: "file" }),
    "send react": Object.freeze({ enabled: true }),
    "send sticker": Object.freeze({ kind: "sticker" }),
    "send unreact": Object.freeze({ enabled: false }),
    "send voice": Object.freeze({ kind: "voice" })
  };
  return fixed[command2] ?? Object.freeze({});
}
function commandDefinition(profile, exposure = "public-manual") {
  const [command2, upstreamReportedMutates, output, argumentProfiles, flagProfiles] = profile;
  const decision = surfaceCommandDecision(command2);
  const provenance = exposure === "source-only-private" ? "source-only-private" : command2 === "targets tunnel" ? "jit-plugin" : "built-in-canonical";
  const arguments_ = Object.freeze(argumentProfiles.map(([name, required, enumValues = []], position) => Object.freeze({
    name,
    position,
    required,
    multiple: false,
    valueType: "string",
    enum: Object.freeze([...enumValues]),
    default: Object.freeze({ kind: "none" }),
    decision: surfaceItemDecision(command2, name, decision)
  })));
  const flags = Object.freeze(flagProfiles.map(([
    name,
    aliases,
    valueType,
    required,
    multiple,
    enumValues,
    defaultValue
  ]) => Object.freeze({
    name,
    aliases: Object.freeze([...aliases]),
    source: "command",
    valueType,
    allowNo: BEEPER_CLI_V062_ALLOW_NO_FLAGS.has(commandFlagCoordinate(command2, name)),
    required,
    multiple,
    enum: Object.freeze([...enumValues]),
    default: surfaceDefault(command2, name, defaultValue),
    decision: surfaceItemDecision(command2, name, decision)
  })));
  return Object.freeze({
    path: Object.freeze(command2.split(" ")),
    provenance,
    profileAuthority: command2 === "targets tunnel" ? "jit-plugin-source" : "tagged-source",
    package: command2 === "targets tunnel" ? "@beeper/cli-plugin-cloudflare" : "@beeper/cli",
    version: command2 === "targets tunnel" ? "^0.6.0" : "0.6.1",
    versionKind: command2 === "targets tunnel" ? "range" : "exact",
    registered: exposure === "public-manual" && command2 !== "targets tunnel",
    publicManual: exposure === "public-manual",
    generatedCanonical: exposure === "public-manual" && command2 !== "targets tunnel",
    upstreamReportedMutates,
    reviewedEffect: reviewedEffect(command2, upstreamReportedMutates),
    arguments: arguments_,
    flags,
    decision,
    pathSemanticInputs: commandPathSemanticInputs(command2),
    output: commandOutput(command2, output, decision),
    conditionalInputs: commandInputRules(command2),
    reconciliation: commandReconciliation(command2, decision)
  });
}
var additionalDecision = (disposition, rationale, replacement = null) => surfaceDecision(disposition, rationale, null, replacement);
function oclifPluginEntry(path, canonicalTarget = null) {
  return Object.freeze({
    path: Object.freeze(path.split(" ")),
    provenance: "dynamic-plugin",
    profileAuthority: "framework-runtime",
    canonicalTarget: canonicalTarget === null ? null : Object.freeze(canonicalTarget.split(" ")),
    package: "@oclif/plugin-plugins",
    version: null,
    versionKind: null,
    registered: true,
    publicManual: false,
    rationale: canonicalTarget === null ? "Callable oclif plugin-management command omitted from the generated command map." : "Callable oclif plugin-management alias omitted from the generated command map.",
    decision: additionalDecision("unsupported", "Plugin inspection and lifecycle authority are permanently outside the provider.")
  });
}
var BEEPER_CLI_V062_ADDITIONAL_ENTRIES = Object.freeze([
  ...[
    ["accounts", "accounts list", "accounts.list"],
    ["accounts chats", "chats list", "messaging.list"],
    ["bridges", "bridges list", "bridges.list"],
    ["chats", "chats list", "messaging.list"],
    ["contacts", "contacts list", "contacts.list"],
    ["targets", "targets list", null]
  ].map(([path, target, operation]) => Object.freeze({
    path: Object.freeze(path.split(" ")),
    provenance: "built-in-alias",
    profileAuthority: "tagged-source",
    canonicalTarget: Object.freeze(target.split(" ")),
    package: "@beeper/cli",
    version: "0.6.1",
    versionKind: "exact",
    registered: true,
    publicManual: false,
    rationale: "Generated registration alias; never accepted as raw caller syntax.",
    decision: operation === null ? additionalDecision("unsupported", "Target lifecycle aliases remain outside provider authority.") : surfaceDecision("absorbed", "The canonical semantic operation absorbs this generated alias.", operation)
  })),
  Object.freeze({
    path: Object.freeze(["autocomplete"]),
    provenance: "built-in-hidden",
    profileAuthority: "tagged-source",
    canonicalTarget: null,
    package: "@beeper/cli",
    version: "0.6.1",
    versionKind: "exact",
    registered: true,
    publicManual: false,
    rationale: "Hidden generated canonical command omitted from the public manual.",
    decision: additionalDecision("internal", "Wrench capability metadata replaces CLI autocomplete.")
  }),
  Object.freeze({
    path: Object.freeze(["help"]),
    provenance: "built-in-hidden",
    profileAuthority: "framework-runtime",
    canonicalTarget: null,
    package: "@oclif/core",
    version: null,
    versionKind: null,
    registered: true,
    publicManual: false,
    rationale: "Callable framework help behavior is outside the generated source command map.",
    decision: additionalDecision("internal", "Wrench capability metadata replaces CLI help.")
  }),
  oclifPluginEntry("plugins inspect"),
  oclifPluginEntry("plugins install"),
  oclifPluginEntry("plugins add", "plugins install"),
  oclifPluginEntry("plugins link"),
  oclifPluginEntry("plugins reset"),
  oclifPluginEntry("plugins uninstall"),
  oclifPluginEntry("plugins unlink", "plugins uninstall"),
  oclifPluginEntry("plugins remove", "plugins uninstall"),
  oclifPluginEntry("plugins update"),
  Object.freeze({
    path: Object.freeze(["<dynamic-plugin-command>"]),
    provenance: "dynamic-plugin",
    profileAuthority: "framework-runtime",
    canonicalTarget: null,
    package: null,
    version: null,
    versionKind: null,
    registered: false,
    publicManual: false,
    rationale: "Installed oclif plugins may add unpinned commands dynamically.",
    decision: additionalDecision("unsupported", "Dynamic plugin commands are permanently outside provider authority.")
  }),
  Object.freeze({
    path: Object.freeze(["messages", "react"]),
    provenance: "documented-only",
    profileAuthority: "documentation",
    canonicalTarget: null,
    package: null,
    version: null,
    versionKind: null,
    registered: false,
    publicManual: false,
    rationale: "A stale documentation alias is absent from the tagged source registration.",
    decision: additionalDecision("replaced", "Use reactions.set through the canonical send react mapping.", "reactions.set")
  }),
  Object.freeze({
    path: Object.freeze(["messages", "unreact"]),
    provenance: "documented-only",
    profileAuthority: "documentation",
    canonicalTarget: null,
    package: null,
    version: null,
    versionKind: null,
    registered: false,
    publicManual: false,
    rationale: "A stale documentation alias is absent from the tagged source registration.",
    decision: additionalDecision("replaced", "Use reactions.set through the canonical send unreact mapping.", "reactions.set")
  })
]);
var BEEPER_CLI_V062_COMMANDS = Object.freeze([
  ...BEEPER_CLI_V062_COMMAND_PROFILES.map((profile) => commandDefinition(profile)),
  commandDefinition(BEEPER_CLI_V062_PRIVATE_COMMAND_PROFILE, "source-only-private")
]);
if (BEEPER_CLI_V062_COMMANDS.length !== 102 || BEEPER_CLI_V062_COMMANDS.filter((command2) => command2.publicManual).length !== 101 || BEEPER_CLI_V062_COMMANDS.filter((command2) => command2.generatedCanonical).length !== 100 || BEEPER_CLI_V062_COMMANDS.filter((command2) => command2.registered).length + 7 !== 107)
  throw new Error("Beeper v0.6.2 surface cardinality drifted from reviewed provenance");
var BEEPER_CLI_V062_SURFACE_CONTRACT = defineLocalCliSurfaceContractV1({
  schemaVersion: 1,
  format: "wrench.local-cli-surface",
  surface: "beeper",
  executable: {
    id: BEEPER_CLI_PIN.id,
    implementation: BEEPER_CLI_PIN.implementation,
    releaseVersion: BEEPER_CLI_PIN.version,
    releaseDate: "2026-05-18",
    releaseTag: "v0.6.2",
    releaseCommit: BEEPER_CLI_PIN.commit,
    releaseManifestSha256: BEEPER_CLI_PIN.releaseManifestSha256,
    runtimeReportedName: "@beeper/cli",
    runtimeReportedVersion: "0.6.2",
    artifacts: Object.freeze(BEEPER_CLI_PIN.artifacts.map((artifact) => Object.freeze({
      platform: artifact.platform,
      arch: artifact.arch,
      archiveSha256: artifact.archiveSha256,
      executableSha256: artifact.executableSha256
    })))
  },
  source: {
    package: "@beeper/cli",
    packagePath: "packages/cli/package.json",
    packageDeclaredVersion: "0.6.1",
    versionDiscrepancy: "Official v0.6.2 binaries.json and the exact executable report 0.6.2, while package.json at tag a416af06023449a87312dc11e54643fd9dc94b8c declares 0.6.1; executable runtime identity remains authoritative.",
    generatedManualSha256: "18a11300ae7fe321ace0c9c5bbdfd062f114c91add7d64e256b78c2e89e328a9",
    generatedManualIncludesFlagsAndDefaults: false,
    generatedManualEntries: 101,
    generatedCanonicalEntries: 101,
    registeredKeys: 107
  },
  sdk: BEEPER_DESKTOP_API_PIN,
  runtime: {
    providerPluginId: "beeper-linked-device",
    providerPluginVersion: "2.4.0",
    adapterId: "beeper-local",
    adapterVersion: "2.4.0",
    operationContractVersions: BEEPER_LOCAL_OPERATION_CONTRACT_VERSIONS,
    operationInputTypes: BEEPER_LOCAL_OPERATION_INPUT_TYPES,
    target: BEEPER_DESKTOP_TARGET,
    realm: "Fixed local Beeper Desktop realm with a verified loopback endpoint, exact account subject, isolated config/cache/plugins, and no caller endpoint, target, path, or environment.",
    compatibility: "The exact CLI executable identity is enforced and its reviewed API schema is @beeper/desktop-api 5.0.0 at b9c1714410139c2139b597338cd002d785653e85; callers cannot select a Desktop channel or protocol."
  },
  globalFlags: BEEPER_CLI_V062_GLOBAL_FLAGS,
  commands: BEEPER_CLI_V062_COMMANDS,
  additionalEntries: BEEPER_CLI_V062_ADDITIONAL_ENTRIES
});
var BEEPER_CLI_V062_UPSTREAM_SURFACE_SHA256 = "74297df1af30fe89cf1596a0670983e79cf85c0768c2f68e9bc3d386be640836";
var BEEPER_CLI_V062_CLASSIFICATION_SHA256 = "bcd411af1544e5cd618cd3c04f2852a797bd804d92b7fe4cd226374b61c57d08";
var BEEPER_CLI_V062_SEMANTIC_PROFILES_SHA256 = "fb7ea5f70f004dd8090c3e6e0996bfa00b0bab8ea5639203e2d1027602450ffe";
var BEEPER_CLI_V062_WHOLE_SURFACE_SHA256 = "72201ac5eb3532f7c159583f19009f547d7d313e86388466b57c135bd2dc4944";
var BEEPER_CLI_V062_PUBLIC_MANUAL_SEMANTIC_PROFILE_SHA256 = Object.freeze({
  setup: "cd432e2649e5724d70398e739a2d1c0c21557a23820aaa14562575a5fe689406",
  "install desktop": "478f4cc022b1d51d4016a319efea17e4523c55e3168560c99fdf7779347ae78a",
  "install server": "999b4aa7576c772ef4f2fa21076064885d67ab53354ab2446399562e1ad8af89",
  "targets list": "b1db92e025f67dda8d6bcfc642fa591ae7a2e4d3555c5aee7af5a0b94cfe94f2",
  "bridges list": "52c8c245a2088a781f0021232c0baaf6bf14fa9246dbfb192c6c57ef3f5d11af",
  "bridges show": "e23a6027d7536389501d008da503320d58b421c1f132c9a7d402b1d7b031658e",
  "targets add desktop": "fbfa2c790848792b519b11d45285c5ebf42abe3f46fc6b0a7bca231b9d7408e0",
  "targets add server": "488d26c83f2261dbe04195fb429d04019977c5cb21d092db8a4765afe68812bf",
  "targets add remote": "db56749d593d43b78922aab5ff1456f617d6dbdbf7f06d44761c2a5133c80da3",
  "targets use": "4617f7e87a68149c5a96624567ce9dc1501d4e31c86920eb64e3f9c536553eeb",
  "targets show": "a48dacbc13afc37f1a58c5b2178d22c5ae049bff1f2701e1e3e72a9e4088259b",
  "targets status": "a70e6eef1793a561914c49a8bcfa118be22b23244a24e622360ad205c9232cc2",
  "targets start": "4bb79ca30f3564cab02a1c5ec173ee016a04bafe263e38ddbf7aa778747d5f48",
  "targets stop": "65ebf81b3855a7fe5585f94b0cd6dc042ae6e5d92eb3e299c5076e9f84ee24f6",
  "targets restart": "dd1281aad6369e7d68185d6a949449d0b0ce8ff395f9d01570a8bf5ed78387e7",
  "targets logs": "808f0e13386372ef9580575b7a2c9110d540209407cb14dc778faba538a51b41",
  "targets enable": "20baea46e6d8b5f5f8ebc5dc0a8bfe9ff7836ba7b1991c8be2af8ee373cbbe1b",
  "targets disable": "0d5695503942f090b118cb445b64556713536d6deeb32ba582e8a1f6f48135fb",
  "targets remove": "0ba9940afc0ead36641b1539dea4f97dd920d8064067839ddb59b5bda874a2e0",
  "targets tunnel": "a96cdc41c42ea64777782ca96b81cbe630928df35067cdcdd903c506e7bdb5a8",
  "auth status": "e08a0176cdc9d9dd06c75a6082b64c8e9b5f68075b58e9c2e61fe2f99bbb6044",
  "auth logout": "25a8d13779a8fc86c13cf8dbd9c1cfc8d68694fed1a7ab9f872cb648dee366ad",
  "auth email start": "d6d355b494860b57a8ae00d3562c9bd1054c6c70b8f0bf478abff88497ef2334",
  "auth email response": "0842a657dbfbeeeb7744332a60ec04064e991dab501fd47f92bc5596cfd7fbfb",
  verify: "b16da79fe75c014faf681d36eff05c4e81e274c8ca29d576592d45f35078503a",
  "verify status": "abd89afdf112ac6aeaa97b9843bc2f81e1a52f6e92e4c42ad8e7a035ae73198b",
  "verify approve": "f724a957287b638b9f27a6b02897260c4ece685113448ebd69e6ff793038b2a0",
  "verify recovery-key": "db9d69676807ba959731125bc95ffb6bef735bddb8cd5b5401cb96d8678e4dfb",
  "verify reset-recovery-key": "e59d2b06f2feaa8008f0e285ac4ec7d7a75a18fd66ca39ddce6d9914c28b6c98",
  "verify cancel": "40197355731efde46280b13a2b227f13fb9ebc33cb80712087380d8d805944f0",
  "verify list": "85de0df592d523d3c127f8c33adb2855fc49f43d470d2675d7854401c975ec9e",
  "verify start": "3c0ef55faaf49552315322b4b521290185c36774a8d87a0e2f2614392407e2b7",
  "verify show": "08a4a85bdfc3a900c8d9f49564fdaa3d4d37046eace6ed665c8b767867b83afc",
  "verify sas": "d6fd6130fd9eee6d51c193989184d2115b171993a304cf4707c0aaecafd2c3e0",
  "verify sas-confirm": "0bc55ff8df6068cb6e3fae1ed136dba94442bae00fc4a95c56a9f206fa3a9d38",
  "verify qr-scan": "d618900cb8548d4abf09d29cd577c7aedbaa660dc6978e28fababe7ea520bf25",
  "verify qr-confirm": "4dc005579ee36737d6c03f0f9fdba18274fbf257bc0921bf2592421ec11b3464",
  "accounts list": "325bb478a9fc344a1982c130c6fddecd0c34371052409df6ba05ba59248e3d38",
  "accounts add": "fa8b9c9e695bf6bb3bf6b122773cc633e8fa6c817760314ecd44a848a384eb17",
  "accounts show": "234fef2ec2a24ca7254e3d2b77f0e7179f71bcc67b4e9fc387ae82122a5d6c7a",
  "accounts remove": "6188c67a6ded6d6b7d2662295ead8fab65c6509614c3d39ebc301f7e7cf5eaf0",
  "accounts use": "bd8dc05db1633966700bf488c56ca6710be4766ea7576c11dd0fe7431d576275",
  "chats list": "cc71df6c537ae4878cffc5c3de743481b2daabf47459ab1a52fabcae14d65a92",
  "chats search": "055097bbd9b156f02a5c5177d566a1ed611477032b0f279dbfaabc5830afc56b",
  "chats show": "b090de1ce0486fc8217264baf46d6b312af7d0b063a457037eb14201ef4d77e7",
  "chats start": "7691cf0d6ac68081ce574edbc9ab2c9e5bd2ad6f82902d04d82590bc54cfc91a",
  "chats archive": "fcfe1fb838c27a65a27b116394911bee2bc2f641e7ae2f7c5904388efcafede1",
  "chats unarchive": "d371d735e983d85ae235a955e06cb0542ccb6bcd7e00155919938b948985f30f",
  "chats pin": "5f037961e20915f06ede7fd02b809591ff81ca139d1c5213170f8a14fb032d12",
  "chats unpin": "02bda6e96362e9037931fb53733ce6901a61f6025aaf01de81fc10d103995e58",
  "chats mute": "e56e2b2e43a037765db6bb7ad031a6e927bee1d6e4dd23ec4068488dbb7a4ba5",
  "chats unmute": "f39c1f039777c9771bc97897b0542f95e626c0f34c3c9c854b4da4c740e455d4",
  "chats mark-read": "a3b738d7aba9737d892a62b37d922a7f2023c5bf0929f9283f2de4c3fb4cdfe4",
  "chats mark-unread": "28520f6500ae501537822360ad25b58ff1d48df6adaddd65d9e5b56d557f9e0f",
  "chats priority": "759b966b88e8d1b5236a77405568ff3b659cccbbacf1dbf9dfcdd64e46817c56",
  "chats notify-anyway": "b527d36467f10fbad9913742846605acbb6e1024e8a07c45ba19658a49bd6ab2",
  "chats rename": "5e45d6f1bb18fcc0e8f13097e6b2e286ae6bc2cf925f4dba90c2e60002968e48",
  "chats description": "158fd28b2573c3da43160e04b8749ace7ad552d80aef5a61c912ed33931a69c7",
  "chats avatar": "8e16f4edfd5b780ce0ee3968416864d43f19603f17999bb4e2dd99a6b873440f",
  "chats draft": "bb245a9e50012cca9dbcd65dc2197b1babc6461ce1f0ab61ed53b6322fea02c6",
  "chats disappear": "9d2b7b70d11cb1c749007d2f1c6a2b2298a525ba88fe1790e9dacc97490996b6",
  "chats remind": "b5133c8f6a103234344c2203637ceea98c65c3b97f805e97e169f475bd0e35fd",
  "chats unremind": "0dd3dbfe98dba426c286ca08a73753a4c0a5dfff1ed1ac397e964b336d46b4db",
  "chats focus": "a53f3dc9bbd93e05adfee9f9f6540e417f8fd5030b1c9d1789fc495e5f625931",
  "messages list": "e691ea9f57b65cdfb9e2576ded7a502e24e61d9522122d9440fea386c9c22e6b",
  "messages search": "a19a5290708c3c43aa1e1f84fb5d3ba2664575aa32afc2784042bab2314e72a9",
  "messages show": "b8436a8e46bf761062850f6cc8bf5777a3ae00166631cb77e1cd21ea122be67f",
  "messages context": "68f0a77a8b98435c8aee0dccd603f9ee8d21c83c97b5face47ec582cd525c711",
  "messages edit": "95380f389feaac7cb93f27be89eed617d997ce98f9a3bc1972306d2ccf353339",
  "messages delete": "305e8826df70ebde061dd7099af33b5eec203453560a50a5a1c008ba175a0ecc",
  "messages export": "7a0c90728af3b602726d59fd2f8ac9352db4fae8ccb440515daab5b37955d2ce",
  "send text": "05ef4e97a2611f3e350f54fe34ec31c7f34873de1da060450c7bc7ae9308f32f",
  "send file": "770a6ff88d6e28d1431d2435bac54c2a76a344611e7be5a442f5d1657a005ebf",
  "send react": "b46e199df693cb824bf109dbd1aa5e847445549096c75e6e04c81ea75f1895b6",
  "send sticker": "3da1e6a17df385f098a4a9b6d7e86ab7dd1c7c6d2c0ca5bee9f5de1f38b0b741",
  "send unreact": "f2fe46e5854571eecbde82fc59663f99b44b4484bffda7c92b12614de709b2d3",
  "send voice": "966b39e192073fc581b8efece9fa744f169b51361e9a8223a84d3c9251e08c24",
  presence: "2d6e067b5d572f7d2524c3e4fdf41300ee82b9af03116f17b098a6afcb9fc9b7",
  "contacts list": "77b752f6e0a37b68cf31cd85c554a5bdec51c20b0239a8a13ef111f7d30b9c6c",
  "contacts search": "8b33f02bb3011f2dd304be5f9f5ccec2303833ae739dc4e96dc3691d6354032b",
  "contacts show": "724c25f80b5f58bbfb4b858187d5f785e946853e6a2f355bd14f8b8bc2052c92",
  "media download": "47f7e05839640b88c42e719b44f3d8f9632ddb7f5abbb1ae2f4eee32341d4f88",
  export: "3a8e13c94c79c7352fc204e7f73c103a55e871befe6dcf943023c832b7119d52",
  watch: "7839bc4e2a9e905f883a372895fbe40aecfb055f3ed642c4e800dcf4fffb9c03",
  rpc: "2399aaaab78a0129bcac2fd0e39c26be1e2fb97ce3ed0c40b631474ca1bd4d9d",
  man: "5f9eb21048ecf86926e64751865c28aa76f3673fc29b41ef5f8273801377cb2a",
  doctor: "18b285f3054ac9f1ee445827540cc26d1a5e367b230d2015d502233d1c5946aa",
  status: "73db0a7f0fd5a33620589d8b6f6e2f9a86310371cbc265a28af6e0901373d8a7",
  docs: "1d44df3d2ad09e8986ec7937c312c3ca06e90ca02693846b64a001b65edaa3bf",
  version: "706d4759642840fa4cc99a80cb4e73f3020cdcf71aee8d0537341bd3f6746c79",
  completion: "707719d9c820895ad1cdb0590501bc4656e966c54edb22d9bcba02358395c2d0",
  plugins: "788ea2111f878f710c8e7c9ed5ac163a58d30831e5a9a67f2c1c1aa88f767f46",
  "plugins available": "b579adca88123da1be0da8c3df02269b629c7f287086ae072e858d79c1e49198",
  update: "c7f6cf4ef3a19e4161a428b993a1527836c864adb4e812f8392c7cfbada76228",
  "config get": "4568bc28c22e82ed02429a59b38a47d68635a3e599570ad9a4b16d5d1bc4f9bc",
  "config set": "3708ca19869aa056d30c43b2c7368d13168255f73474d7ecea6a38d5d6f748ae",
  "config path": "7c45a2996a9d8b8da6ccc7691ec98c378d7cc3494f2929a0930b98e5e037ebbe",
  "config reset": "4f8f09e26043c8d7770dda894ab17289abdb41ab4881b90d3a287ca548a15374",
  "api get": "677eaba3c3008fd86da6920d6086a166de702c6a650b7499c54b5264300a65e5",
  "api post": "79a8826a3386036d10d2be46ef7eb87a0be769214e032ca909b3758916aecc5a",
  "api request": "9158437c08a2504cd1e7df43aa21c253052ea5f2afbefa7b7e0a01c0ce55746e"
});
var BEEPER_CLI_V062_SOURCE_ONLY_COMPLETE_SEMANTIC_PROFILE_SHA256 = "917b94060ef7f99a07843c15d1eee58bdeb4f53797a14157ebf5e54fb72350b2";
if (BEEPER_CLI_V062_SURFACE_CONTRACT.digests.upstreamSurfaceSha256 !== BEEPER_CLI_V062_UPSTREAM_SURFACE_SHA256 || BEEPER_CLI_V062_SURFACE_CONTRACT.digests.classificationSha256 !== BEEPER_CLI_V062_CLASSIFICATION_SHA256 || BEEPER_CLI_V062_SURFACE_CONTRACT.digests.semanticProfilesSha256 !== BEEPER_CLI_V062_SEMANTIC_PROFILES_SHA256 || BEEPER_CLI_V062_SURFACE_CONTRACT.digests.wholeSurfaceSha256 !== BEEPER_CLI_V062_WHOLE_SURFACE_SHA256)
  throw new Error(`Beeper v0.6.2 reviewed surface digest drifted: ${JSON.stringify(BEEPER_CLI_V062_SURFACE_CONTRACT.digests)}`);
for (const command2 of BEEPER_CLI_V062_SURFACE_CONTRACT.commands) {
  const path = command2.path.join(" ");
  const reviewed = command2.publicManual ? BEEPER_CLI_V062_PUBLIC_MANUAL_SEMANTIC_PROFILE_SHA256[path] : path === "_complete" ? BEEPER_CLI_V062_SOURCE_ONLY_COMPLETE_SEMANTIC_PROFILE_SHA256 : undefined;
  if (reviewed !== command2.semanticProfileSha256) {
    throw new Error(`Beeper v0.6.2 semantic profile digest drifted for ${path}: ${command2.semanticProfileSha256}`);
  }
}

export { wrench_web_adapter_default, BEEPER_CLI_PIN, BEEPER_DESKTOP_API_PIN, beeperCliArtifactForRuntime, BEEPER_ORIGIN, BEEPER_DESKTOP_TARGET, BEEPER_MAX_FILE_BYTES, BEEPER_DESKTOP_BUNDLE_IDS, BEEPER_LOCAL_OPERATION_NAMES, isBeeperLocalOperationContractVersion, isBeeperDesktopLoopbackOperationContract, BEEPER_LOCAL_OPERATIONS, isCanonicalBeeperConversationId, parseBeeperOperationInputForContract, parseBeeperOperationInput, planBeeperAccountsListCommand, planBeeperVersionCommand, planBeeperTargetStatusCommand, planBeeperOperationCommand, planBeeperPresenceCommands, planBeeperReadCommand, isBeeperLocalOperation };

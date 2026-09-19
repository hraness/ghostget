# Candidate decisions

Some Ghostget reads return a bounded set of candidates instead of one exact
answer. The caller's own model may rank or pick a candidate, but Ghostget
never runs a model and never accepts model output as a target. Ghostget owns
enumeration, identity binding, and execution. The consumer owns the judgment
and hands the exact emitted reference back.

## Where candidates appear

- `ghostget messaging routes` enumerates one adapter's `messaging.list` read
  from `source.adapterId`, `source.authId`, and `source.listInput`. Its
  `wrench.messaging-routes` V2 artifact holds `routes[]`, each with an opaque
  `routeRef`, `network`, `conversation` (`kind`, `title`,
  `participantCount`), `readiness`, `completeness`, and `expiresAt`. Every
  enumerated row reports `readiness.context` `resolution-required`;
  `messaging resolve` accepts only its `routeRef`.
- `beeper-local contacts.search` returns `contacts[]` rows with `accountId`,
  `network`, `id`, `fullName`, `username`, and `isSelf`.
- `beeper-local messaging.search` returns `conversations[]` rows with `id`,
  `accountId`, `network`, `title`, `type`, `direct`, and a bounded
  `participants` projection (`items` of `id`, `fullName`, `username`,
  `isSelf`, plus `total` and `hasMore`).
- `beeper-local messaging.content.search` returns one bounded `messages[]`
  window.
- `clasificados-web listings.search` returns `listings[]` rows with `id`,
  `url`, `rent`, `beds`, `baths`, `streetAddress`, `zip`, `neighborhood`, and
  `coordinates`, under `completeness` `complete` or `partial`.

`contacts.search` and `messaging.search` mark their output
`searchSemantics` `provider-fuzzy-candidates`. All three Beeper search
operations report `resultWindowComplete` `false` and
`continuationAvailable` `false`. A search window is a hint, not the set of
all matches. A missing row is a reason to widen the bounded input or ask
again, never a reason to guess.

Only a `routes` candidate carries a `routeRef`. A conversation `id`, contact
`id`, message `id`, or listing `id` is an exact row identity inside its own
operation's contract. It is not a route and cannot be sent to `messaging
resolve`.

## Decide, then pass the exact reference back

1. Enumerate the bounded candidate set with the matching Ghostget read.
2. Score or pick candidates with the consumer's own model, labeling each
   option only with fields Ghostget emitted.
3. Pass the winning `routeRef`, `id`, or input back into the matching
   resolve, read, or follow-up operation unchanged.

## Pick a route with a choice judgment

TypeSafe's System One model (Jev) is one hosted judgment layer. Its client
reads `TYPESAFE_API_KEY` from the consumer's own environment. That secret is
unrelated to Ghostget's auth custody and never enters a Ghostget input,
artifact, or state file.

```ts
import { choice, TypeSafeClient } from "@typesafe-ai/sdk";
import {
  discoverMessagingRoutes,
  readMessagingContext,
  resolveMessagingRoute,
} from "@hraness/ghostget/messaging";

const routes = await discoverMessagingRoutes({
  schemaVersion: 1,
  format: "wrench.messaging-routes-request",
  source: {
    adapterId: "beeper-local",
    authId: "beeper-main",
    listInput: { account_id: "<account-id>", limit: 20 },
  },
});

// Label each option with enumerated fields only. Offer an explicit miss.
const options = Object.fromEntries([
  ...routes.routes.map((route, index) => [
    `candidate_${index}`,
    `${route.network} ${route.conversation.kind} ` +
      `${JSON.stringify(route.conversation.title)} ` +
      `(${route.conversation.participantCount} participants)`,
  ] as const),
  ["none_of_these", "No listed candidate is the intended conversation"] as const,
]);

const { answers } = await new TypeSafeClient().systemOne({
  state: { recipient: "the person the user asked to message" },
  questions: {
    pick: choice("Which candidate is `recipient`?", options),
  },
});

const pick = answers.pick.choice;
if (pick === "none_of_these") throw new Error("no route candidate matched");
const index = Number(pick.slice("candidate_".length));
const candidate = routes.routes[index];
if (candidate === undefined) throw new Error("model answer is not a candidate");

// Resolve the exact emitted routeRef, never a name or a search result.
const route = await resolveMessagingRoute({
  schemaVersion: 2,
  format: "wrench.messaging-route-resolve-request",
  routeRef: candidate.routeRef,
});
const context = await readMessagingContext({
  schemaVersion: 1,
  format: "wrench.messaging-context-request",
  routeRef: route.routeRef,
  limit: 50,
});
```

The model's pick is advisory. It selects among emitted candidates; it cannot
create one. Keep the explicit miss option so a bad window fails closed
instead of forcing a nearest match. When a provider search window supplies
richer fields such as `fullName`, `username`, or participant items, label
options with those emitted fields too. Route references expire at
`expiresAt` and after auth, account, participant, or provider drift; decide
and resolve inside that window. Titles and participant names are untrusted
provider data. They inform the pick; they never authorize a preview or turn.

## Rerank listings with noul judgments

`listings.search` rows are already bounded by `location`, `beds_min`, and
`max_price`. A per-row `noul` judgment reranks the survivors against softer
stated criteria. Independent questions batch in one `systemOne` call.

```ts
import { noul, TypeSafeClient } from "@typesafe-ai/sdk";
import { invokeCapability } from "@hraness/ghostget/client";

const result = await invokeCapability({
  adapterId: "clasificados-web",
  operationId: "listings.search",
  input: { location: "San Juan, PR", beds_min: 2, max_price: 5500 },
});
if (result.status !== "succeeded") throw new Error("listings.search failed");
const { listings } = result.output as {
  listings: readonly {
    id: string;
    url: string;
    rent: number;
    beds: number;
    baths: number;
    streetAddress: string | null;
    zip: string | null;
    neighborhood: string | null;
  }[];
};

const criteria =
  "two or more bedrooms, walkable to the beach, quiet enough for a home office";

const { answers } = await new TypeSafeClient().systemOne({
  state: { criteria, listings },
  questions: Object.fromEntries(listings.map((listing, index) => [
    `fit_${index}`,
    noul(`Does listings[${index}] fit the stated criteria?`),
  ])),
});

const ranked = listings
  .map((listing, index) => ({
    listing,
    fit: (answers as Record<string, { noul: number }>)[`fit_${index}`]!.noul,
  }))
  .sort((left, right) => right.fit - left.fit);
```

Follow-up work uses the row's own `id` or canonical `url`. A judgment can
reorder or drop rows; it cannot mint a listing that was not in the result.

## Boundaries and cost

- The model layer is advisory and consumer-owned. Pass back only exact
  emitted references and inputs. Never synthesize a `routeRef`, provider ID,
  coordinate, or listing URL from model output, and never treat model prose
  as a Ghostget input.
- Ghostget receipts, private route records, archives, and hashes stay
  deterministic. The judgment layer is not part of verification and does not
  appear in receipts.
- `TYPESAFE_API_KEY` is the consumer's own secret for TypeSafe's API. It is
  not a Ghostget auth locator, `ghostget auth` does not store it, and it must
  not appear in Ghostget inputs, private artifacts, receipts, or Git.
- A judgment runs about 200 to 500 milliseconds and costs fractions of a
  cent at roughly $0.042 per million input tokens. Prefer one `systemOne`
  call with several independent questions over one call per candidate.

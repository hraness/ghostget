// @bun
import {
  buildGmailThreadUrl,
  createGmailApiClient,
  extractGmailEmailAddresses,
  fetchGmailContacts,
  fetchGmailMessageInteractionMetadata,
  fetchGmailMessageList,
  fetchGmailMessageMetadata,
  fetchGmailThread,
  fetchGmailThreadList,
  fetchGmailThreadMetadata,
  getAuthenticatedGmailProfile,
  listGmailSendAsAliases,
  parseGmailId,
  parseGmailThread,
  resolveGmailThreadBodies
} from "./index-vdxk3xwx.js";
import"./index-74t2k197.js";
import"./index-3sdtfztq.js";
import {
  parseContactDirectionStats,
  projectContactDirectionStats
} from "./index-f30rdtbs.js";
import"./index-vtj5zdgf.js";
import"./index-z1w83f81.js";

// src/providers/gmail.ts
import { createHash } from "crypto";
import { types as nodeTypes } from "util";
var CONTACTS_DEFAULT_LIMIT = 20;
var CONTACTS_MAX_LIMIT = 100;
var CONTACTS_DEFAULT_STATS_SCAN_LIMIT = 100;
var CONTACTS_MAX_STATS_SCAN_LIMIT = 2000;
var CONTACT_STATS_MAX_DIRECTION_PRODUCT = 2000;
var INTERACTIONS_DEFAULT_LIMIT = 100;
var INTERACTIONS_MAX_LIMIT = 100;
var INTERACTIONS_MAX_ADDRESSES = 1e4;
var MESSAGING_DEFAULT_LIMIT = 50;
var MESSAGING_MAX_LIMIT = 100;
var GMAIL_LIST_PAGE_MAXIMUM = 500;
var CONTACT_STATS_QUERY_MAX_BYTES = 4096;
var MAX_CONCURRENT_GMAIL_READS = 4;
var GMAIL_MESSAGING_READ_BODY_BYTES = 7 * 1024 * 1024;
function fail(label, message) {
  throw new Error(`official Gmail ${label} ${message}`);
}
function record(value, label) {
  if (nodeTypes.isProxy(value) || typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    return fail(label, "must be a plain object");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string")
      return fail(label, "must not contain symbol properties");
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable)
      return fail(`${label}.${key}`, "must be an enumerable data property");
  }
  return value;
}
function exactKeys(value, required, optional, label) {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key))
      return fail(label, `contains unreviewed property ${key}`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key))
      return fail(`${label}.${key}`, "is required");
  }
}
function hasUnsafeControl(value) {
  for (let index = 0;index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127 || code >= 128 && code <= 159 || code === 1564 || code === 8206 || code === 8207 || code >= 8232 && code <= 8238 || code >= 8294 && code <= 8297)
      return true;
  }
  return false;
}
function isWellFormedText(value) {
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
function boundedInputText(value, label, maximum) {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || !isWellFormedText(value) || hasUnsafeControl(value))
    return fail(label, `must be non-empty text of at most ${maximum} code units without unsafe controls`);
  return value;
}
function optionalInputText(value, label, maximum) {
  return value === undefined ? null : boundedInputText(value, label, maximum);
}
function inputInteger(value, label, fallback, minimum, maximum) {
  const candidate = value === undefined ? fallback : value;
  if (typeof candidate !== "number" || !Number.isSafeInteger(candidate) || candidate < minimum || candidate > maximum)
    return fail(label, `must be an integer from ${minimum} through ${maximum}`);
  return candidate;
}
function parseContactsInput(input, contractVersion) {
  const source = record(input, "contacts.list input");
  if (contractVersion !== 4 && contractVersion !== 5) {
    return fail("contacts.list contract", "must be version 4 or 5");
  }
  if (contractVersion === 4 && source.include_dates !== undefined) {
    return fail("contacts.list input.include_dates", "is available only in contract v5");
  }
  exactKeys(source, [], [
    "collection",
    "cursor",
    ...contractVersion === 5 ? ["include_dates"] : [],
    "include_stats",
    "limit",
    "stats_scan_limit"
  ], "contacts.list input");
  const collection = source.collection === undefined ? "contacts" : source.collection;
  if (collection !== "contacts" && collection !== "other-contacts") {
    return fail("contacts.list input.collection", "must be contacts or other-contacts");
  }
  const includeDates = contractVersion === 5 && source.include_dates !== undefined ? source.include_dates : false;
  if (typeof includeDates !== "boolean") {
    return fail("contacts.list input.include_dates", "must be boolean");
  }
  if (includeDates && collection !== "contacts") {
    return fail("contacts.list input.include_dates", "is supported only for saved contacts");
  }
  const includeStats = source.include_stats === undefined ? true : source.include_stats;
  if (typeof includeStats !== "boolean") {
    return fail("contacts.list input.include_stats", "must be boolean");
  }
  if (!includeStats && source.stats_scan_limit !== undefined) {
    return fail("contacts.list input.stats_scan_limit", "is accepted only when include_stats is true");
  }
  const limit = inputInteger(source.limit, "contacts.list input.limit", CONTACTS_DEFAULT_LIMIT, 1, CONTACTS_MAX_LIMIT);
  const statsScanLimit = inputInteger(source.stats_scan_limit, "contacts.list input.stats_scan_limit", CONTACTS_DEFAULT_STATS_SCAN_LIMIT, 1, CONTACTS_MAX_STATS_SCAN_LIMIT);
  if (includeStats && limit * statsScanLimit > CONTACT_STATS_MAX_DIRECTION_PRODUCT) {
    return fail("contacts.list input", `limit multiplied by stats_scan_limit must not exceed the ${CONTACT_STATS_MAX_DIRECTION_PRODUCT}-entry per-direction work budget`);
  }
  return Object.freeze({
    collection,
    cursor: optionalInputText(source.cursor, "contacts.list input.cursor", 4096),
    projection: includeDates ? "dates" : "core",
    includeStats,
    limit,
    statsScanLimit
  });
}
function parseInteractionsInput(input) {
  const source = record(input, "contacts.list interactions input");
  exactKeys(source, ["collection", "before"], ["after", "cursor", "limit"], "contacts.list interactions input");
  if (source.collection !== "interactions") {
    return fail("contacts.list interactions input.collection", "must be interactions");
  }
  const before = boundedInputText(source.before, "contacts.list interactions input.before", 24);
  const parsed = new Date(before);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/u.test(before) || !Number.isFinite(parsed.getTime()) || parsed.toISOString() !== before) {
    return fail("contacts.list interactions input.before", "must be a canonical whole-second UTC timestamp");
  }
  const after = source.after === undefined ? null : boundedInputText(source.after, "contacts.list interactions input.after", 24);
  const parsedAfter = after === null ? null : new Date(after);
  if (after !== null && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/u.test(after) || parsedAfter === null || !Number.isFinite(parsedAfter.getTime()) || parsedAfter.toISOString() !== after || parsedAfter.getTime() >= parsed.getTime())) {
    return fail("contacts.list interactions input.after", "must be a canonical whole-second UTC timestamp before input.before");
  }
  return Object.freeze({
    after,
    afterMilliseconds: parsedAfter?.getTime() ?? null,
    before,
    beforeMilliseconds: parsed.getTime(),
    cursor: optionalInputText(source.cursor, "contacts.list interactions input.cursor", 4096),
    limit: inputInteger(source.limit, "contacts.list interactions input.limit", INTERACTIONS_DEFAULT_LIMIT, 1, INTERACTIONS_MAX_LIMIT)
  });
}
function parseMessagingListInput(input) {
  const source = record(input, "messaging.list input");
  exactKeys(source, ["view"], [
    "query",
    "cursor",
    "limit",
    "include_spam_trash"
  ], "messaging.list input");
  if (source.view !== "inbox" && source.view !== "search") {
    return fail("messaging.list input.view", "must be inbox or search");
  }
  const query = optionalInputText(source.query, "messaging.list input.query", 512);
  if (source.view === "search" && query === null) {
    return fail("messaging.list input.query", "is required when view is search");
  }
  if (source.view === "inbox" && query !== null) {
    return fail("messaging.list input.query", "is not accepted when view is inbox");
  }
  if (query !== null && query.trim().length === 0) {
    return fail("messaging.list input.query", "must contain a non-whitespace expression");
  }
  const includeSpamTrash = source.include_spam_trash === undefined ? false : source.include_spam_trash;
  if (typeof includeSpamTrash !== "boolean") {
    return fail("messaging.list input.include_spam_trash", "must be boolean");
  }
  if (source.view === "inbox" && source.include_spam_trash !== undefined) {
    return fail("messaging.list input.include_spam_trash", "is accepted only when view is search");
  }
  return Object.freeze({
    view: source.view,
    query,
    cursor: optionalInputText(source.cursor, "messaging.list input.cursor", 4096),
    limit: inputInteger(source.limit, "messaging.list input.limit", MESSAGING_DEFAULT_LIMIT, 1, MESSAGING_MAX_LIMIT),
    includeSpamTrash
  });
}
function parseMessagingReadInput(input) {
  const source = record(input, "messaging.read input");
  exactKeys(source, ["thread_id"], [], "messaging.read input");
  return parseGmailId(source.thread_id, "messaging.read input.thread_id");
}
async function authenticatedClient(context) {
  if (context.auth.subject === undefined) {
    throw new Error("official Gmail reads require an OAuth locator with an exact email subject");
  }
  const client = createGmailApiClient({
    http: context.http,
    accessToken: context.token.accessToken,
    subject: context.auth.subject
  });
  const profile = await getAuthenticatedGmailProfile(client);
  return Object.freeze({ client, profile });
}
async function mapConcurrent(values, maximum, worker) {
  if (!Number.isSafeInteger(maximum) || maximum < 1) {
    throw new Error("Gmail concurrent mapping requires a positive worker bound");
  }
  const results = new Array(values.length);
  let nextIndex = 0;
  const noFailure = Symbol("no Gmail concurrent failure");
  let firstFailure = noFailure;
  const rememberFailure = (error) => {
    if (firstFailure === noFailure)
      firstFailure = error;
  };
  const admit = async (action) => {
    if (firstFailure !== noFailure)
      throw firstFailure;
    try {
      return await action();
    } catch (error) {
      rememberFailure(error);
      throw error;
    }
  };
  const run = async () => {
    while (firstFailure === noFailure && nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      const value = values[index];
      if (value === undefined) {
        rememberFailure(new Error("Gmail concurrent mapping lost a dense input item"));
        return;
      }
      try {
        results[index] = await worker(value, index, admit);
      } catch (error) {
        rememberFailure(error);
        return;
      }
    }
  };
  const settlements = await Promise.allSettled(Array.from({ length: Math.min(maximum, values.length) }, () => run()));
  for (const settlement of settlements) {
    if (settlement.status === "rejected")
      rememberFailure(settlement.reason);
  }
  if (firstFailure !== noFailure)
    throw firstFailure;
  return Object.freeze(results);
}
function contactEmailCoverage(contact) {
  const emails = Object.freeze([...new Set(contact.emailAddresses.flatMap((email) => email.canonicalValue === null ? [] : [email.canonicalValue]))]);
  const unsupportedAddressCount = contact.emailAddresses.reduce((count, email) => count + (email.canonicalValue === null ? 1 : 0), 0);
  return Object.freeze({
    emails,
    kind: contact.emailAddresses.length === 0 ? "unavailable" : emails.length === 0 ? "unsupported" : unsupportedAddressCount === 0 ? "complete" : "partial",
    unsupportedAddressCount
  });
}
function contactQuery(direction, emails) {
  const terms = direction === "received" ? emails.map((email) => `from:"${email}"`) : emails.flatMap((email) => [`to:"${email}"`, `cc:"${email}"`, `bcc:"${email}"`]);
  const prefix = direction === "received" ? "-in:sent " : "in:sent ";
  return `${prefix}{${terms.join(" ")}}`;
}
function contactQueryChunks(direction, emails) {
  const chunks = [];
  let current = [];
  for (const email of emails) {
    const candidate = [...current, email];
    if (current.length > 0 && Buffer.byteLength(contactQuery(direction, candidate), "utf8") > CONTACT_STATS_QUERY_MAX_BYTES) {
      chunks.push(current);
      current = [email];
    } else
      current = candidate;
    if (Buffer.byteLength(contactQuery(direction, current), "utf8") > CONTACT_STATS_QUERY_MAX_BYTES) {
      return fail("contacts.list stats query", "cannot represent one validated contact address within the query bound");
    }
  }
  if (current.length > 0)
    chunks.push(current);
  return Object.freeze(chunks.map((chunk) => contactQuery(direction, chunk)));
}
async function scanContactDirection(client, addressCoverage, direction, scanLimit, admit) {
  const queries = contactQueryChunks(direction, addressCoverage.emails);
  if (queries.length === 0) {
    const addressCoverageComplete2 = addressCoverage.kind === "complete";
    const incompleteReasons2 = addressCoverageComplete2 ? Object.freeze([]) : addressCoverage.kind === "unavailable" ? Object.freeze(["no-contact-addresses"]) : Object.freeze(["unsupported-contact-addresses"]);
    return parseContactDirectionStats({
      count: 0,
      complete: addressCoverageComplete2,
      lowerBound: !addressCoverageComplete2,
      truncated: false,
      lastAt: null,
      lastAtComplete: addressCoverageComplete2,
      lastAtBasis: "unavailable",
      incompleteReasons: incompleteReasons2
    }, "official Gmail contacts.list direction stats");
  }
  const messageIds = new Set;
  let scannedEntries = 0;
  let complete = true;
  for (const [queryIndex, query] of queries.entries()) {
    let cursor = null;
    const seenCursors = new Set;
    while (scannedEntries < scanLimit) {
      const pageLimit = Math.min(GMAIL_LIST_PAGE_MAXIMUM, scanLimit - scannedEntries);
      const page = await admit(() => fetchGmailMessageList(client, {
        limit: pageLimit,
        pageToken: cursor,
        query,
        includeSpamTrash: false
      }));
      if (page.messages.length === 0 && page.nextPageToken !== null) {
        return fail("contacts.list stats pagination", "returned an empty non-terminal page");
      }
      scannedEntries += page.messages.length;
      for (const message of page.messages)
        messageIds.add(message.id);
      if (page.nextPageToken === null)
        break;
      if (seenCursors.has(page.nextPageToken)) {
        return fail("contacts.list stats pagination", "repeated a page token");
      }
      seenCursors.add(page.nextPageToken);
      cursor = page.nextPageToken;
      if (scannedEntries >= scanLimit) {
        complete = false;
        break;
      }
    }
    if (scannedEntries >= scanLimit && queryIndex < queries.length - 1)
      complete = false;
    if (!complete)
      break;
  }
  let lastAt = null;
  let metadataDatesComplete = true;
  for (const messageId of messageIds) {
    const message = await admit(() => fetchGmailMessageMetadata(client, messageId));
    if (message.id !== messageId) {
      return fail("contacts.list stats metadata", "returned a message other than the requested ID");
    }
    if (message.internalDate === null)
      metadataDatesComplete = false;
    else if (lastAt === null || message.internalDate > lastAt) {
      lastAt = message.internalDate;
    }
  }
  const addressCoverageComplete = addressCoverage.kind === "complete";
  const countComplete = complete && addressCoverageComplete;
  const lastAtComplete = countComplete && metadataDatesComplete;
  const incompleteReasons = Object.freeze([
    ...addressCoverageComplete ? [] : ["unsupported-contact-addresses"],
    ...complete ? [] : ["scan-limit-reached"],
    ...metadataDatesComplete ? [] : ["message-internal-date-unavailable"]
  ]);
  return parseContactDirectionStats({
    count: messageIds.size,
    complete: countComplete,
    lowerBound: !countComplete,
    truncated: !complete,
    lastAt,
    lastAtComplete,
    lastAtBasis: lastAt === null ? "unavailable" : "bounded-matched-message-internal-date",
    incompleteReasons
  }, "official Gmail contacts.list direction stats");
}
async function executeContactsList(context) {
  const input = parseContactsInput(context.input, context.recipe.contractVersion);
  const { client, profile } = await authenticatedClient(context);
  const page = await fetchGmailContacts(client, {
    collection: input.collection,
    projection: input.projection,
    limit: input.limit,
    pageToken: input.cursor
  });
  const tasks = input.includeStats ? page.contacts.flatMap((contact) => {
    const addressCoverage = contactEmailCoverage(contact);
    return ["sent", "received"].map((direction) => Object.freeze({
      addressCoverage,
      resourceName: contact.resourceName,
      direction
    }));
  }) : [];
  const stats = await mapConcurrent(tasks, MAX_CONCURRENT_GMAIL_READS, async (task, _index, admit) => Object.freeze({
    resourceName: task.resourceName,
    direction: task.direction,
    stats: await scanContactDirection(client, task.addressCoverage, task.direction, input.statsScanLimit, admit)
  }));
  const byContact = new Map;
  for (const entry of stats) {
    const current = byContact.get(entry.resourceName) ?? {};
    current[entry.direction] = entry.stats;
    byContact.set(entry.resourceName, current);
  }
  const contacts = page.contacts.map((contact) => {
    if (!input.includeStats)
      return contact;
    const values = byContact.get(contact.resourceName);
    if (values?.sent === undefined || values.received === undefined) {
      return fail("contacts.list stats", "did not settle both directions for one contact");
    }
    const addressCoverage = contactEmailCoverage(contact);
    return Object.freeze({
      ...contact,
      ...projectContactDirectionStats(values.sent, values.received),
      statsAddressCoverage: addressCoverage.kind,
      statsSupportedAddressCount: addressCoverage.emails.length,
      statsUnsupportedAddressCount: addressCoverage.unsupportedAddressCount
    });
  });
  context.setOutput(Object.freeze({
    provider: "gmail",
    operation: "contacts.list",
    accountSubject: profile.emailAddress,
    contactCollection: input.collection,
    statsIncluded: input.includeStats,
    contacts: Object.freeze(contacts),
    nextCursor: page.nextPageToken,
    totalItems: page.totalItems,
    statsScanLimit: input.includeStats ? input.statsScanLimit : null,
    statsScope: input.includeStats ? "per-contact-gmail-search-excluding-spam-trash" : "not-requested"
  }));
}
function newInteractionDirection() {
  return {
    count: 0,
    complete: true,
    firstAt: null,
    lastAt: null,
    count30d: 0,
    count90d: 0,
    count365d: 0
  };
}
function interactionFor(interactions, email) {
  const present = interactions.get(email);
  if (present !== undefined)
    return present;
  if (interactions.size >= INTERACTIONS_MAX_ADDRESSES) {
    return fail("contacts.list interactions response", `contains more than ${INTERACTIONS_MAX_ADDRESSES} external addresses in one page`);
  }
  const created = {
    sent: newInteractionDirection(),
    received: newInteractionDirection()
  };
  interactions.set(email, created);
  return created;
}
function messageInteractionAddresses(message, accountAddresses, direction) {
  const headers = direction === "sent" ? [message.to, message.cc, message.bcc] : [message.from];
  return Object.freeze([...new Set(headers.flatMap((header) => extractGmailEmailAddresses(header)))].filter((email) => !accountAddresses.has(email)));
}
function recordDatedInteraction(direction, timestamp, beforeMilliseconds) {
  const milliseconds = new Date(timestamp).getTime();
  direction.count += 1;
  if (direction.firstAt === null || timestamp < direction.firstAt)
    direction.firstAt = timestamp;
  if (direction.lastAt === null || timestamp > direction.lastAt)
    direction.lastAt = timestamp;
  const age = beforeMilliseconds - milliseconds;
  if (age <= 30 * 86400000)
    direction.count30d += 1;
  if (age <= 90 * 86400000)
    direction.count90d += 1;
  if (age <= 365 * 86400000)
    direction.count365d += 1;
}
function opaqueGmailKey(kind, id) {
  return createHash("sha256").update(`gmail-${kind}\x00${id}`, "utf8").digest("hex");
}
function projectInteraction(email, interaction) {
  return Object.freeze({
    email,
    sentCount: interaction.sent.count,
    receivedCount: interaction.received.count,
    sentCountComplete: interaction.sent.complete,
    receivedCountComplete: interaction.received.complete,
    firstSentAt: interaction.sent.firstAt,
    lastSentAt: interaction.sent.lastAt,
    firstReceivedAt: interaction.received.firstAt,
    lastReceivedAt: interaction.received.lastAt,
    sent30d: interaction.sent.count30d,
    sent90d: interaction.sent.count90d,
    sent365d: interaction.sent.count365d,
    received30d: interaction.received.count30d,
    received90d: interaction.received.count90d,
    received365d: interaction.received.count365d
  });
}
async function executeContactInteractionsList(context) {
  const input = parseInteractionsInput(context.input);
  const { client, profile } = await authenticatedClient(context);
  const accountAddresses = input.cursor === null ? await listGmailSendAsAliases(client) : Object.freeze([]);
  const page = await fetchGmailMessageList(client, {
    limit: input.limit,
    pageToken: input.cursor,
    query: input.afterMilliseconds === null ? `before:${String(input.beforeMilliseconds / 1000)}` : `after:${String(input.afterMilliseconds / 1000 - 1)} before:${String(input.beforeMilliseconds / 1000)}`,
    includeSpamTrash: false
  });
  const messages = await mapConcurrent(page.messages, MAX_CONCURRENT_GMAIL_READS, async (stub, _index, admit) => {
    const message = await admit(() => fetchGmailMessageInteractionMetadata(client, stub.id));
    if (message.id !== stub.id) {
      return fail("contacts.list interactions metadata", "returned a message other than the requested ID");
    }
    if (stub.threadId !== null && message.threadId !== null && stub.threadId !== message.threadId) {
      return fail("contacts.list interactions metadata", "returned a message bound to a different thread");
    }
    return message;
  });
  const accountSubject = profile.emailAddress.toLowerCase();
  const selfAddresses = new Set([accountSubject, ...accountAddresses]);
  const interactions = new Map;
  const threadKeys = new Set;
  let messagesIncluded = 0;
  let draftOrChat = 0;
  let missingInternalDate = 0;
  let noExternalAddress = 0;
  let outsideWindow = 0;
  for (const message of messages) {
    if (message.threadId !== null) {
      threadKeys.add(opaqueGmailKey("thread", message.threadId));
    }
    if (message.labelIds.includes("DRAFT") || message.labelIds.includes("CHAT")) {
      draftOrChat += 1;
      continue;
    }
    const direction = message.labelIds.includes("SENT") ? "sent" : "received";
    const addresses = messageInteractionAddresses(message, selfAddresses, direction);
    if (addresses.length === 0) {
      noExternalAddress += 1;
      continue;
    }
    if (message.internalDate === null) {
      missingInternalDate += 1;
      for (const email of addresses) {
        interactionFor(interactions, email)[direction].complete = false;
      }
      continue;
    }
    if (input.afterMilliseconds !== null && new Date(message.internalDate).getTime() < input.afterMilliseconds) {
      outsideWindow += 1;
      continue;
    }
    if (new Date(message.internalDate).getTime() >= input.beforeMilliseconds) {
      return fail("contacts.list interactions metadata", "returned a message outside the requested before cutoff");
    }
    messagesIncluded += 1;
    for (const email of addresses) {
      recordDatedInteraction(interactionFor(interactions, email)[direction], message.internalDate, input.beforeMilliseconds);
    }
  }
  const output = Object.freeze({
    provider: "gmail",
    operation: "contacts.list",
    contactCollection: "interactions",
    accountSubject,
    accountAddresses,
    after: input.after,
    before: input.before,
    interactions: Object.freeze([...interactions.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([email, interaction]) => projectInteraction(email, interaction))),
    messageKeys: Object.freeze(page.messages.map((message) => opaqueGmailKey("message", message.id))),
    threadKeys: Object.freeze([...threadKeys].sort()),
    messagesScanned: messages.length,
    messagesIncluded,
    messagesSkipped: Object.freeze({
      draftOrChat,
      missingInternalDate,
      noExternalAddress,
      outsideWindow
    }),
    nextCursor: page.nextPageToken,
    resultSizeEstimate: page.resultSizeEstimate,
    scanScope: "messages-in-half-open-window-excluding-spam-trash-drafts-chats"
  });
  context.setOutput(output);
}
function threadOrderedAt(thread) {
  let result = null;
  for (const message of thread.messages) {
    if (message.internalDate !== null && (result === null || message.internalDate > result)) {
      result = message.internalDate;
    }
  }
  return result;
}
function threadParticipants(thread, accountSubject) {
  const account = accountSubject.toLowerCase();
  const emails = new Set;
  for (const message of thread.messages) {
    for (const header of [message.from, message.to, message.cc, message.bcc]) {
      for (const email of extractGmailEmailAddresses(header)) {
        if (email !== account)
          emails.add(email);
      }
    }
  }
  return Object.freeze([...emails].sort().map((email) => Object.freeze({
    email,
    displayName: null
  })));
}
function summarizeThread(thread, accountSubject, view) {
  const labels = new Set(thread.messages.flatMap((message) => message.labelIds));
  const archived = labels.has("INBOX") ? false : labels.has("SPAM") || labels.has("TRASH") ? null : true;
  return Object.freeze({
    id: thread.id,
    historyId: thread.historyId,
    snippet: thread.snippet,
    subject: thread.messages.find((message) => message.subject !== null)?.subject ?? null,
    orderedAt: threadOrderedAt(thread),
    messageCount: thread.messages.length,
    participants: threadParticipants(thread, accountSubject),
    unread: labels.has("UNREAD"),
    archived,
    threadUrl: buildGmailThreadUrl(accountSubject, thread.id, view === "inbox" ? "inbox" : "all"),
    readInput: Object.freeze({ thread_id: thread.id })
  });
}
async function executeMessagingList(context) {
  const input = parseMessagingListInput(context.input);
  const { client, profile } = await authenticatedClient(context);
  const page = await fetchGmailThreadList(client, {
    limit: input.limit,
    pageToken: input.cursor,
    query: input.query,
    labelIds: input.view === "inbox" ? ["INBOX"] : [],
    includeSpamTrash: input.includeSpamTrash
  });
  const threads = await mapConcurrent(page.threads, MAX_CONCURRENT_GMAIL_READS, async (stub, _index, admit) => {
    const thread = parseGmailThread(await admit(() => fetchGmailThreadMetadata(client, stub.id)), { deadlineCheckpoint: () => client.http.throwIfUnavailable() });
    if (thread.id !== stub.id) {
      return fail("messaging.list metadata", "returned a thread other than the requested ID");
    }
    return summarizeThread(thread, profile.emailAddress, input.view);
  });
  const output = Object.freeze({
    provider: "gmail",
    operation: "messaging.list",
    accountSubject: profile.emailAddress,
    view: input.view,
    query: input.query,
    includeSpamTrash: input.includeSpamTrash,
    threads,
    nextCursor: page.nextPageToken,
    resultSizeEstimate: page.resultSizeEstimate
  });
  context.setOutput(output);
}
async function executeMessagingRead(context) {
  const threadId = parseMessagingReadInput(context.input);
  const { client, profile } = await authenticatedClient(context);
  const parsedThread = parseGmailThread(await fetchGmailThread(client, threadId), {
    maxBodyBytes: GMAIL_MESSAGING_READ_BODY_BYTES,
    deadlineCheckpoint: () => client.http.throwIfUnavailable()
  });
  const thread = await resolveGmailThreadBodies(client, parsedThread);
  if (thread.id !== threadId) {
    return fail("messaging.read response", "returned a thread other than the requested ID");
  }
  if (thread.messages.length === 0) {
    return fail("messaging.read response.messages", "must contain at least one message");
  }
  const threadUrl = buildGmailThreadUrl(profile.emailAddress, thread.id);
  const output = Object.freeze({
    provider: "gmail",
    operation: "messaging.read",
    accountSubject: profile.emailAddress,
    thread,
    threadUrl
  });
  context.setOutput(output);
  context.setFinalUrl(threadUrl);
}
async function executeGmailProvider(context) {
  const action = context.recipe.action;
  if (action === "contacts.list") {
    const source = record(context.input, "contacts.list input");
    if (source.collection === "interactions")
      await executeContactInteractionsList(context);
    else
      await executeContactsList(context);
  } else if (action === "messaging.list")
    await executeMessagingList(context);
  else if (action === "messaging.read")
    await executeMessagingRead(context);
  else
    throw new Error(`official Gmail provider does not implement ${action}`);
}
export {
  executeGmailProvider
};

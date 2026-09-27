import type { ProviderActionContext } from "../provider-context";
import { bearerHeaders, type ProviderHttpClient } from "../provider-http";
import { microsoftGraphContracts } from "../provider-contract-definitions-microsoft-graph";
import {
  MICROSOFT_GRAPH_MAX_BYTES, MICROSOFT_GRAPH_ORIGIN,
  graphComparableTimestamp, graphFailure, graphRecord, graphText, graphTimestamp,
  microsoftGraphContinuationKey, microsoftGraphNextCursor, microsoftGraphPageRequest, parseMicrosoftGraphInput,
  type MicrosoftGraphInput, type MicrosoftGraphOperation,
} from "./microsoft-graph-policy";

type GraphClient = Readonly<{
  http: ProviderHttpClient;
  accessToken: string;
  subject: string;
  scopes: readonly string[];
  maximumBytes: number;
}>;

const CONTACT_KEYS = ["id", "displayName", "givenName", "surname", "emailAddresses", "businessPhones", "homePhones", "mobilePhone", "companyName", "jobTitle"] as const;
const EVENT_KEYS = ["id", "iCalUId", "type", "seriesMasterId", "start", "end", "isCancelled", "isOrganizer", "hideAttendees", "organizer", "attendees"] as const;
const RESPONSE_STATES = ["none", "organizer", "tentativelyAccepted", "accepted", "declined", "notResponded"] as const;
const ANNOTATIONS = ["@odata.etag"] as const;

function nullableText(value: unknown, max: number): string | null {
  return value === null ? null : graphText(value, max, true);
}

function graphArray(value: unknown, max: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length > max) return graphFailure("invalid collection bound");
  return value;
}

function graphBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") return graphFailure("invalid boolean");
  return value;
}

function emailAddress(value: unknown): Readonly<{ address: string; name: string | null }> {
  const item = graphRecord(value, ["address", "name"]);
  const address = graphText(item.address, 254);
  // Preserve the supplied address. Matching and case policy belong to consumers.
  if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/u.test(address)
    || address.includes("..") || address.startsWith(".") || address.includes(".@")) {
    return graphFailure("invalid SMTP address");
  }
  return Object.freeze({ address, name: nullableText(item.name, 512) });
}

function annotations(row: Record<string, unknown>): void {
  if (Object.hasOwn(row, "@odata.etag")) graphText(row["@odata.etag"], 512);
}

function contact(value: unknown) {
  const row = graphRecord(value, [...CONTACT_KEYS, ...ANNOTATIONS], CONTACT_KEYS);
  annotations(row);
  return Object.freeze({
    id: graphText(row.id, 2_048),
    displayName: nullableText(row.displayName, 512),
    givenName: nullableText(row.givenName, 512),
    surname: nullableText(row.surname, 512),
    emailAddresses: Object.freeze(graphArray(row.emailAddresses, 16).map(emailAddress)),
    businessPhones: Object.freeze(graphArray(row.businessPhones, 16).map((value) => graphText(value, 128))),
    homePhones: Object.freeze(graphArray(row.homePhones, 16).map((value) => graphText(value, 128))),
    mobilePhone: nullableText(row.mobilePhone, 128),
    companyName: nullableText(row.companyName, 512),
    jobTitle: nullableText(row.jobTitle, 512),
  });
}

function dateTimeTimeZone(value: unknown): string {
  const row = graphRecord(value, ["dateTime", "timeZone"]);
  if (row.timeZone !== "UTC") return graphFailure("event time is not UTC");
  const time = graphText(row.dateTime, 27);
  if (time.endsWith("Z")) return graphFailure("unexpected event dateTime suffix");
  return graphTimestamp(`${time}Z`);
}

function responseStatus(value: unknown): string {
  const row = graphRecord(value, ["response", "time"]);
  const status = graphText(row.response, 32);
  if (!(RESPONSE_STATES as readonly string[]).includes(status)) return graphFailure("unknown attendee response");
  graphTimestamp(row.time);
  return status;
}

function attendee(value: unknown) {
  const row = graphRecord(value, ["emailAddress", "type", "status", "proposedNewTime"], ["emailAddress", "type", "status"]);
  const type = graphText(row.type, 16);
  if (type !== "required" && type !== "optional" && type !== "resource") return graphFailure("unknown attendee type");
  // Proposed times are documented optional response data. Validate then discard.
  if (Object.hasOwn(row, "proposedNewTime")) {
    const times = graphRecord(row.proposedNewTime, ["start", "end"]);
    if (graphComparableTimestamp(dateTimeTimeZone(times.start)) >= graphComparableTimestamp(dateTimeTimeZone(times.end))) {
      return graphFailure("invalid proposed time range");
    }
  }
  return Object.freeze({ ...emailAddress(row.emailAddress), type, response: responseStatus(row.status) });
}

function event(value: unknown, input: MicrosoftGraphInput) {
  const row = graphRecord(value, [...EVENT_KEYS, ...ANNOTATIONS], EVENT_KEYS);
  annotations(row);
  const type = graphText(row.type, 16);
  if (type !== "singleInstance" && type !== "occurrence" && type !== "exception") {
    return graphFailure("calendar view returned an unsupported event type");
  }
  const seriesMasterId = row.seriesMasterId === null ? null : graphText(row.seriesMasterId, 2_048);
  if ((type === "singleInstance") !== (seriesMasterId === null)) return graphFailure("event series identity is inconsistent");
  const start = dateTimeTimeZone(row.start);
  const end = dateTimeTimeZone(row.end);
  const exactStart = graphComparableTimestamp(start);
  const exactEnd = graphComparableTimestamp(end);
  const windowStart = graphComparableTimestamp(input.start);
  const windowEnd = graphComparableTimestamp(input.end);
  if (exactEnd < exactStart || exactStart >= windowEnd
    || (exactEnd === exactStart ? exactStart < windowStart : exactEnd <= windowStart)) {
    return graphFailure("event lies outside the requested half-open window");
  }
  const organizer = graphRecord(row.organizer, ["emailAddress"]);
  const attendees = graphArray(row.attendees, 500).map(attendee);
  if (new Set(attendees.map((person) => person.address.toLowerCase())).size !== attendees.length) {
    return graphFailure("duplicate event attendee");
  }
  return Object.freeze({
    id: graphText(row.id, 2_048),
    iCalUId: graphText(row.iCalUId, 2_048),
    type, seriesMasterId, start, end,
    isCancelled: graphBoolean(row.isCancelled),
    isOrganizer: graphBoolean(row.isOrganizer),
    hideAttendees: graphBoolean(row.hideAttendees),
    organizer: emailAddress(organizer.emailAddress),
    attendees: Object.freeze(attendees),
  });
}

function uniqueIds(rows: readonly Readonly<{ id: string }>[]): void {
  if (new Set(rows.map((row) => row.id)).size !== rows.length) return graphFailure("duplicate page resource ID");
}

async function get(client: GraphClient, url: URL, maximumBytes: number): Promise<unknown> {
  const response = await client.http.request(url, {
    method: "GET",
    headers: bearerHeaders(client.accessToken, {
      accept: "application/json",
      prefer: 'IdType="ImmutableId", outlook.timezone="UTC"',
    }),
  }, [200], ["graph.microsoft.com"], maximumBytes, "application/json");
  return response.body;
}

function contextAnnotation(row: Record<string, unknown>): void {
  if (!Object.hasOwn(row, "@odata.context")) return;
  const value = graphText(row["@odata.context"], 4_096);
  if (!value.startsWith(`${MICROSOFT_GRAPH_ORIGIN}/v1.0/$metadata#`)) {
    return graphFailure("unexpected metadata context");
  }
}

/** Internal candidate implementation, exercised with synthetic HTTP only.
 * No CLI, SDK export, option, or environment variable bypasses contract state. */
export async function executeMicrosoftGraphRead(operation: MicrosoftGraphOperation, rawInput: unknown, client: GraphClient) {
  const contract = microsoftGraphContracts.find((candidate) => candidate.operation === operation);
  if (contract === undefined) return graphFailure("unsupported operation");
  const input = parseMicrosoftGraphInput(operation, rawInput);
  const continuationKey = microsoftGraphContinuationKey(client.accessToken);
  const request = microsoftGraphPageRequest(operation, client.subject, input, continuationKey);
  if (!Array.isArray(client.scopes) || !contract.requiredScopeSets.some((set) => set.every((scope) => client.scopes.includes(scope)))) {
    return graphFailure("missing delegated read scopes");
  }
  if (!Number.isSafeInteger(client.maximumBytes) || client.maximumBytes < 1 || client.maximumBytes > MICROSOFT_GRAPH_MAX_BYTES) {
    return graphFailure("invalid response byte bound");
  }
  graphText(client.accessToken, 16_384);
  const identityUrl = new URL("/v1.0/me", MICROSOFT_GRAPH_ORIGIN);
  identityUrl.searchParams.set("$select", "id");
  const identity = graphRecord(await get(client, identityUrl, Math.min(client.maximumBytes, 16_384)), ["id", "@odata.context"], ["id"]);
  contextAnnotation(identity);
  if (`microsoft-graph:${graphText(identity.id, 128)}` !== client.subject) return graphFailure("authenticated account mismatch");
  const page = graphRecord(await get(client, request.url, client.maximumBytes), ["value", "@odata.context", "@odata.nextLink"], ["value"]);
  contextAnnotation(page);
  const values = graphArray(page.value, input.limit);
  client.http.throwIfUnavailable();
  const contacts = operation === "contacts.list" ? values.map(contact) : null;
  const events = operation === "calendar.attendees.list" ? values.map((value) => event(value, input)) : null;
  uniqueIds(contacts ?? events ?? []);
  if (events !== null && events.reduce((count, row) => count + row.attendees.length, 0) > 5_000) {
    return graphFailure("calendar page exceeds 5000 attendees");
  }
  const nextCursor = microsoftGraphNextCursor(page["@odata.nextLink"], request, values.length, continuationKey);
  const output = Object.freeze({
    schemaVersion: 1,
    account: client.subject,
    collection: operation === "contacts.list" ? "default-contacts" : "default-calendar",
    ...(contacts === null ? { window: Object.freeze({ start: input.start, end: input.end }), events } : { contacts }),
    page: Object.freeze({ count: values.length, limit: input.limit, terminal: nextCursor === null, nextCursor, snapshotComplete: false }),
  });
  if (Buffer.byteLength(JSON.stringify(output), "utf8") > client.maximumBytes) return graphFailure("output exceeds byte bound");
  client.http.throwIfUnavailable();
  return output;
}

export async function executeMicrosoftGraphProvider(context: ProviderActionContext): Promise<void> {
  const contract = microsoftGraphContracts.find((candidate) => candidate.operation === context.recipe.action
    && candidate.contractVersion === context.recipe.contractVersion);
  if (contract === undefined) return graphFailure("unsupported operation contract");
  // Source-owned policy, not caller context.contract.state, controls activation.
  const state: string = contract.state;
  if (state !== "observed") {
    throw new Error("Microsoft Graph operation is capture-required; authorized account verification is required before execution");
  }
  if (context.recipe.provider !== "microsoft-graph" || context.auth.provider !== "microsoft-graph"
    || context.auth.kind !== "oauth-token-file" || context.auth.subject === undefined) {
    return graphFailure("invalid official-provider account binding");
  }
  const output = await executeMicrosoftGraphRead(contract.operation, context.input, {
    http: context.http, accessToken: context.token.accessToken,
    subject: context.auth.subject, scopes: context.auth.scopes,
    maximumBytes: Math.min(context.recipe.maxOutputBytes, MICROSOFT_GRAPH_MAX_BYTES),
  });
  context.setOutput(output);
  context.setFinalUrl(MICROSOFT_GRAPH_ORIGIN);
}

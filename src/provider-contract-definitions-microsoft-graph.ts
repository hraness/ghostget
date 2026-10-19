import type { ProviderContract } from "./provider-contract-definitions";
import { MICROSOFT_GRAPH_MAX_CURSOR } from "./providers/microsoft-graph-policy";

const pageProperties = {
  limit: { type: "number", description: "Page size, from 1 to 100; defaults to 100", minimum: 1, maximum: 100 },
  cursor: { type: "string", description: "Continuation returned for this exact account and request", minLength: 1, maxLength: MICROSOFT_GRAPH_MAX_CURSOR },
} as const;

const shared = {
  provider: "microsoft-graph",
  contractVersion: 1,
  risk: "R1",
  sideEffect: "none",
  idempotency: "none",
  dedupeWindowMs: 0,
  state: "capture-required",
  dispatch: "none",
} as const;

export const microsoftGraphContracts = Object.freeze([
  {
    ...shared,
    operation: "contacts.list",
    input: { properties: pageProperties, required: [] },
    requiredScopeSets: [["User.Read", "Contacts.Read"]],
    coverage: ["default-contact-folder", "names-and-contact-methods", "company-and-job-title", "one-bounded-page", "no-snapshot-completeness"],
    implementation: "Candidate documented Microsoft Graph GET /v1.0/me identity and GET /v1.0/me/contacts with fixed selected fields; requires authorized account, ID, nullable-field, and continuation verification before execution",
  },
  {
    ...shared,
    operation: "calendar.attendees.list",
    input: {
      properties: {
        ...pageProperties,
        start: { type: "string", description: "Inclusive window start in whole-second UTC YYYY-MM-DDTHH:mm:ss.000Z", minLength: 24, maxLength: 24 },
        end: { type: "string", description: "Exclusive window end in whole-second UTC, at most 90 days after start", minLength: 24, maxLength: 24 },
      },
      required: ["start", "end"],
    },
    requiredScopeSets: [["User.Read", "Calendars.ReadBasic"]],
    coverage: ["default-calendar", "fixed-90-day-maximum-window", "occurrence-and-exception-identity", "cancellation-and-attendee-visibility", "organizer-and-invitee-addresses", "one-bounded-page", "invitations-do-not-prove-attendance"],
    implementation: "Candidate documented Microsoft Graph GET /v1.0/me identity and GET /v1.0/me/calendar/calendarView; fixed minimal fields exclude subject, body, location, and attachments; requires authorized recurrence, UTC, visibility, and continuation verification before execution",
  },
] as const satisfies readonly ProviderContract[]);

/** Browser-safe setup metadata. A suggestion is never a verified account or grant. */
export const setupServices = [
  { id: "gmail", title: "Gmail", connection: "instructions" },
  { id: "github", title: "GitHub", connection: "instructions" },
  { id: "linkedin-web", title: "LinkedIn", connection: "browser" },
  { id: "x-web", title: "X", connection: "browser" },
  { id: "instagram", title: "Instagram", connection: "instructions" },
  { id: "reddit-web", title: "Reddit", connection: "browser" },
  { id: "whatsapp", title: "WhatsApp", connection: "instructions" },
] as const;
export type SetupServiceId = typeof setupServices[number]["id"];
export type BrowserCandidate = "x-web" | "linkedin-web" | "reddit-web";
export interface BrowserProfileView {
  readonly id: string; readonly browser: "chrome"; readonly profile: string;
  readonly label: string; readonly candidates: readonly BrowserCandidate[];
}
export interface BrowserDiscoveryView {
  readonly revision: number; readonly enabled: boolean;
  readonly status: "not-scanned" | "ready" | "unavailable";
  readonly scannedAt: string | null; readonly profiles: readonly BrowserProfileView[];
}
export interface SetupRequestView {
  readonly id: string; readonly serviceId: SetupServiceId;
  readonly requestedAt: string; readonly expiresAt: string;
}
export type AgentSetupRequest =
  | { readonly protocol: "ghostget.setup/1"; readonly action: "status" }
  | { readonly protocol: "ghostget.setup/1"; readonly action: "request"; readonly serviceId: SetupServiceId }
  | { readonly protocol: "ghostget.setup/1"; readonly action: "cancel"; readonly requestId: string };
export interface AgentSetupResponse {
  readonly protocol: "ghostget.setup/1"; readonly ok: true; readonly version: string;
  readonly configuredAccountCount: number; readonly setupRequests: readonly SetupRequestView[];
  readonly requestId: string | null;
}
export function setupInstructions(serviceId: string): string {
  const service = setupServices.find(item => item.id === serviceId);
  if (!service) return "Inspect ghostget capabilities --json and follow the bundled Ghostget skill for this service. Never paste credentials into chat.";
  if (service.connection === "browser") return `Connect ${service.title} in Ghostget’s Accounts screen. Choose the browser profile, complete sign-in, verify the current account, and review its operation permissions. A saved-session hint does not prove a current login. Never paste cookies or credentials into chat.`;
  const route = serviceId === "gmail" ? "Use the managed Google OAuth instructions in the bundled Ghostget skill; Google requires a Desktop OAuth client file."
    : serviceId === "whatsapp" ? "Follow skills/ghostget/references/whatsapp-adapter.md for the reviewed linked-device workflow."
    : "Inspect the installed capabilities and follow the bundled Ghostget skill for the supported account setup and transport.";
  return `Help me connect ${service.title} with Ghostget. ${route} This service does not have one-click native connection yet. Keep the exact account and transport explicit; never paste credentials into chat or change permissions without my review.`;
}
function invalid(): never { throw new Error("Invalid setup metadata"); }
function object(value: unknown, expected: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).length !== expected.length || expected.some(key => { const descriptor = descriptors[key]; return !descriptor || !descriptor.enumerable || !("value" in descriptor); })) return invalid();
  return value as Record<string, unknown>;
}
function integer(value: unknown, max = Number.MAX_SAFE_INTEGER): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > max) return invalid(); return value; }
function date(value: unknown): string { if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) return invalid(); return value; }
export function setupRequestId(value: unknown): string { if (typeof value !== "string" || value.length !== 36 || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value)) return invalid(); return value; }
export function setupServiceId(value: unknown): SetupServiceId { const service = setupServices.find(item => item.id === value); if (!service) return invalid(); return service.id; }
export function parseSetupRequestViews(value: unknown): readonly SetupRequestView[] {
  if (!Array.isArray(value) || value.length > 8) return invalid();
  const result = value.map(raw => { const item = object(raw, ["id", "serviceId", "requestedAt", "expiresAt"]); const requestedAt = date(item.requestedAt); const expiresAt = date(item.expiresAt); if (Date.parse(expiresAt) <= Date.parse(requestedAt) || Date.parse(expiresAt) - Date.parse(requestedAt) !== 600_000) return invalid(); return { id: setupRequestId(item.id), serviceId: setupServiceId(item.serviceId), requestedAt, expiresAt }; });
  if (new Set(result.map(item => item.id)).size !== result.length || new Set(result.map(item => item.serviceId)).size !== result.length) return invalid();
  return result;
}
export function parseBrowserProfiles(value: unknown): readonly BrowserProfileView[] {
  if (!Array.isArray(value) || value.length > 16) return invalid();
  const result = value.map(raw => {
    const item = object(raw, ["id", "browser", "profile", "label", "candidates"]);
    if (item.browser !== "chrome" || typeof item.profile !== "string" || /^(?:Default|Profile [1-9][0-9]{0,2})$/u.exec(item.profile)?.[0] !== item.profile) return invalid();
    const id = `chrome-${item.profile.toLowerCase().replace(" ", "-")}`;
    if (item.id !== id || item.label !== `Chrome · ${item.profile}` || !Array.isArray(item.candidates) || item.candidates.length > 3) return invalid();
    const candidates = item.candidates.map(candidate => { if (candidate !== "x-web" && candidate !== "linkedin-web" && candidate !== "reddit-web") return invalid(); return candidate; });
    if (new Set(candidates).size !== candidates.length) return invalid();
    return { id, browser: "chrome" as const, profile: item.profile, label: item.label as string, candidates };
  });
  if (new Set(result.map(item => item.id)).size !== result.length) return invalid();
  return result;
}
export function parseBrowserDiscoveryView(value: unknown): BrowserDiscoveryView {
  const item = object(value, ["revision", "enabled", "status", "scannedAt", "profiles"]);
  if (typeof item.enabled !== "boolean" || !["not-scanned", "ready", "unavailable"].includes(item.status as string)) return invalid();
  const revision = integer(item.revision);
  if (revision === 0 && item.enabled) return invalid();
  const profiles = parseBrowserProfiles(item.profiles); const scannedAt = item.scannedAt === null ? null : date(item.scannedAt);
  if ((!item.enabled || item.status === "not-scanned") && (profiles.length !== 0 || scannedAt !== null) || item.status !== "not-scanned" && scannedAt === null) return invalid();
  return { revision, enabled: item.enabled, status: item.status as BrowserDiscoveryView["status"], scannedAt, profiles };
}
export function parseAgentSetupRequest(value: unknown): AgentSetupRequest {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return invalid();
  const action = Object.getOwnPropertyDescriptor(value, "action")?.value;
  const item = object(value, action === "request" ? ["protocol", "action", "serviceId"] : action === "cancel" ? ["protocol", "action", "requestId"] : ["protocol", "action"]);
  if (item.protocol !== "ghostget.setup/1") return invalid();
  if (action === "status") return { protocol: "ghostget.setup/1", action };
  if (action === "request") return { protocol: "ghostget.setup/1", action, serviceId: setupServiceId(item.serviceId) };
  if (action === "cancel") return { protocol: "ghostget.setup/1", action, requestId: setupRequestId(item.requestId) };
  return invalid();
}
export function parseAgentSetupResponse(value: unknown): AgentSetupResponse {
  const item = object(value, ["protocol", "ok", "version", "configuredAccountCount", "setupRequests", "requestId"]);
  if (item.protocol !== "ghostget.setup/1" || item.ok !== true || typeof item.version !== "string" || /^\d{1,6}\.\d{1,6}\.\d{1,6}$/u.exec(item.version)?.[0] !== item.version) return invalid();
  const setupRequests = parseSetupRequestViews(item.setupRequests); const requestId = item.requestId === null ? null : setupRequestId(item.requestId);
  if (requestId !== null && !setupRequests.some(request => request.id === requestId)) return invalid();
  return { protocol: "ghostget.setup/1", ok: true, version: item.version, configuredAccountCount: integer(item.configuredAccountCount, 1024), setupRequests, requestId };
}

export function parseSetupArguments(args: readonly string[]): { readonly json: boolean; readonly request: AgentSetupRequest | null } {
  if (args[0] !== "setup") throw new Error("Invalid setup command");
  const json = args.at(-1) === "--json"; const parts = json ? args.slice(0, -1) : args;
  if (!json && parts.length === 2 && parts[1] === "--help") return { json, request: null };
  if (parts.length === 1 || parts.length === 2 && parts[1] === "status") return { json, request: { protocol: "ghostget.setup/1", action: "status" } };
  if (parts.length === 3 && parts[1] === "request") return { json, request: { protocol: "ghostget.setup/1", action: "request", serviceId: setupServiceId(parts[2]) } };
  if (parts.length === 3 && parts[1] === "cancel") return { json, request: { protocol: "ghostget.setup/1", action: "cancel", requestId: setupRequestId(parts[2]) } };
  throw new Error("Invalid setup command");
}

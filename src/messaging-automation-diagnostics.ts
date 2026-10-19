import { OperationDeadlineError } from "./operation-deadline";

/** Closed, body-free discovery diagnostics. Never serialize caught text or fields. */
export const DISCOVERY_DIAGNOSTIC_PHASES = ["admission", "native-preflight", "native-status", "native-chats", "native-projection", "reauthorization", "native-finalization", "host-status", "host-identity", "host-response"] as const;
export const DISCOVERY_DIAGNOSTIC_CODES = ["failed", "cancelled", "deadline", "cleanup-unverified", "process-failed", "streams-failed", "response-invalid", "rpc-rejected", "schema-invalid", "identity-changed", "process-stderr", "database-unreadable", "rpc-invalid-params", "rpc-method-unavailable", "coordinate-invalid"] as const;
export type DiscoveryDiagnosticPhase = typeof DISCOVERY_DIAGNOSTIC_PHASES[number];
export type DiscoveryDiagnosticCode = typeof DISCOVERY_DIAGNOSTIC_CODES[number];
export type DiscoveryDiagnostic = Readonly<{ phase: DiscoveryDiagnosticPhase; code: DiscoveryDiagnosticCode }>;

const nativeCodes = new WeakMap<Error, DiscoveryDiagnosticCode>();
const discoveries = new WeakMap<Error, DiscoveryDiagnostic>();

/** Keep the original error identity: cleanup and send-settlement catches rely on it. */
export function nativeDiagnostic<T extends Error>(error: T, code: DiscoveryDiagnosticCode): T {
  if (!nativeCodes.has(error)) nativeCodes.set(error, code);
  return error;
}

export function discoveryDiagnostic(error: unknown, phase: DiscoveryDiagnosticPhase, fallback: DiscoveryDiagnosticCode = "failed"): unknown {
  if (error instanceof Error && !discoveries.has(error)) {
    const nativeCode = nativeCodes.get(error);
    const code = nativeCode === "cancelled" && fallback === "deadline" ? "deadline" : nativeCode
      ?? (error instanceof OperationDeadlineError ? error.failure === "cancelled" ? "cancelled" : error.failure === "timed-out" ? "deadline" : fallback : fallback);
    discoveries.set(error, Object.freeze({ phase, code }));
  }
  return error;
}

export function discoveryDiagnosticMessage(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  const diagnostic = discoveries.get(error);
  if (!diagnostic || !DISCOVERY_DIAGNOSTIC_PHASES.includes(diagnostic.phase) || !DISCOVERY_DIAGNOSTIC_CODES.includes(diagnostic.code)) return null;
  return `ghostget.discovery.v1:${diagnostic.phase}:${diagnostic.code}`;
}

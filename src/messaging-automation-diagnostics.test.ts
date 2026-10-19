import { expect, test } from "bun:test";
import { DISCOVERY_DIAGNOSTIC_CODES, DISCOVERY_DIAGNOSTIC_PHASES, discoveryDiagnostic, discoveryDiagnosticMessage, nativeDiagnostic } from "./messaging-automation-diagnostics";
import { OperationDeadlineError } from "./operation-deadline";

test("closed diagnostics preserve original errors and the innermost authored boundary", () => {
  for (const phase of DISCOVERY_DIAGNOSTIC_PHASES) for (const code of DISCOVERY_DIAGNOSTIC_CODES) {
    const error = nativeDiagnostic(new Error("Sensitive fixture path, row and body"), code);
    expect(discoveryDiagnostic(error, phase)).toBe(error);
    expect(discoveryDiagnostic(error, "host-response", "failed")).toBe(error);
    expect(discoveryDiagnosticMessage(error)).toBe(`ghostget.discovery.v1:${phase}:${code}`);
    expect(discoveryDiagnosticMessage(error)).not.toContain("Sensitive");
  }
  for (const failure of ["cancelled", "timed-out"] as const) {
    const error = new OperationDeadlineError("Sensitive fixture", failure);
    discoveryDiagnostic(error, "native-chats");
    expect(discoveryDiagnosticMessage(error)).toBe(`ghostget.discovery.v1:native-chats:${failure === "cancelled" ? "cancelled" : "deadline"}`);
  }
});

test("untrusted message text and lookalike fields cannot create a diagnostic marker", () => {
  for (const value of [null, "Sensitive fixture", new Error("ghostget.discovery.v1:native-chats:process-failed"), { phase: "native-chats", code: "process-failed" }]) {
    expect(discoveryDiagnosticMessage(value)).toBeNull();
  }
});

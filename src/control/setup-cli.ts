import { GHOSTGET_VERSION } from "../version";
import { privateStateFilesMayExist } from "../storage";
import { agentRequest } from "./approval-client";
import { ControlError } from "./validation";
import { parseAgentSetupResponse, parseSetupArguments, setupServices } from "./setup-model";
import type { ControlEnvironment } from "./web-policy";

type Output = { readonly stdout: (value: string) => unknown; readonly stderr: (value: string) => unknown };
const usage = "Usage: ghostget setup [--json]\n       ghostget setup status [--json]\n       ghostget setup request <service> [--json]\n       ghostget setup cancel <request-id> [--json]\nStage a service suggestion for native review. Setup never opens a browser, scans profiles, connects an account, or changes permissions.\n";
export async function runSetupCommand(args: readonly string[], environment: ControlEnvironment, output: Output, signal?: AbortSignal): Promise<number> {
  let parsed: ReturnType<typeof parseSetupArguments>;
  try { parsed = parseSetupArguments(args); } catch { output.stderr(`${usage}Services: ${setupServices.map(service => service.id).join(", ")}\n`); return 2; }
  if (!parsed.request) { output.stdout(usage); return 0; }
  const open = { action: "open-app", command: null, message: "Open the Ghostget native app, then run ghostget setup status. Installation guidance is in the bundled Ghostget skill." };
  try {
    // A status command must not adopt a fresh state root merely to discover no app.
    if (!privateStateFilesMayExist("control", ["owner.json"], environment)) throw new ControlError("CONTROL_APP_REQUIRED", open.message);
    const response = parseAgentSetupResponse(await agentRequest(parsed.request, { environment, ...(signal ? { signal } : {}) }));
    const nextActions = response.setupRequests.length > 0
      ? [{ action: "review-in-app", command: "ghostget setup status --json", message: "Ask the user to review the pending service in Ghostget’s Accounts screen. Browser discovery, sign-in and permission decisions stay in the app." }]
      : response.configuredAccountCount > 0
        ? [{ action: "inspect-capabilities", command: "ghostget capabilities --json", message: "Inspect available operations and use an explicit configured account. Configured does not mean its login was just verified." }]
        : [{ action: "request-service", command: null, message: "Choose a service below, then run ghostget setup request <service> --json. The user reviews the suggestion in the native app." }];
    const result = { schema: "ghostget.setup-status/1", app: "open", version: response.version, configuredAccountCount: response.configuredAccountCount, services: setupServices, setupRequests: response.setupRequests, requestId: response.requestId, nextActions };
    if (parsed.json) output.stdout(`${JSON.stringify(result)}\n`);
    else output.stdout(`Ghostget ${response.version} is open. ${response.configuredAccountCount} account(s) configured; current sign-in is not inferred.\n${response.setupRequests.map(request => `Pending: ${setupServices.find(service => service.id === request.serviceId)!.title} (${request.id})\n`).join("")}${nextActions.map(action => action.message).join("\n")}\nServices: ${setupServices.map(service => `${service.id} (${service.title})`).join(", ")}\n`);
    return 0;
  } catch (error) {
    const expected = error instanceof ControlError && ["CONTROL_APP_REQUIRED", "CONTROL_DISCONNECTED", "CONTROL_TIMEOUT"].includes(error.code);
    if (expected) {
      const result = { schema: "ghostget.setup-status/1", app: "unavailable", version: GHOSTGET_VERSION, configuredAccountCount: null, services: setupServices, setupRequests: [], requestId: null, nextActions: [open] };
      if (parsed.json) output.stdout(`${JSON.stringify(result)}\n`); else output.stdout(`${open.message}\nServices: ${setupServices.map(service => service.id).join(", ")}\n`);
      return parsed.request.action === "status" ? 0 : 1;
    }
    output.stderr(`${JSON.stringify({ ok: false, code: "SETUP_UNAVAILABLE", message: "Setup status or the requested change could not be confirmed. Review the native app before retrying." })}\n`); return 1;
  }
}

import { ControlError } from "./control/validation";

export type AppHostDecision = {
  readonly action: "connect" | "disconnect";
  readonly appId: string;
  readonly id: string;
  readonly subject: string;
  readonly displayName: string | null;
  readonly browser: "chrome" | "safari";
  readonly profile: string | null;
};

// User-controlled data arrives only through stdin. The caller cannot supply
// code, prompt text, button labels, or an affirmative result.
const CONFIRMATION_SCRIPT = `
ObjC.import('Foundation');
const data = $.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile;
const input = JSON.parse(ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding)));
const app = Application.currentApplication();
app.includeStandardAdditions = true;
const verb = input.action === 'connect' ? 'Connect' : 'Disconnect';
const account = input.displayName === null ? input.subject : input.displayName + ' (' + input.subject + ')';
const browser = input.browser === 'chrome' ? 'Chrome · ' + input.profile : 'Safari';
const purpose = input.action === 'connect'
  ? 'Save this browser connection for the app. Posting permissions remain separate.'
  : 'Remove this app’s saved connection. This does not sign you out of the browser.';
try {
  const result = app.displayDialog(verb + ' X account ' + account + '?\\n\\nApp: ' + input.appId + '\\nBrowser: ' + browser + '\\n\\n' + purpose, {
    withTitle: 'GhostGet · X connection', buttons: ['Cancel', verb], defaultButton: 'Cancel', cancelButton: 'Cancel', givingUpAfter: 120
  });
  result.buttonReturned === verb && !result.gaveUp ? 'confirmed' : 'denied';
} catch (_) { 'denied'; }
`;

/** Fixed provider-owned UI; this is not a hostile same-user process boundary. */
export async function confirmAppHostDecision(decision: AppHostDecision, signal: AbortSignal): Promise<boolean> {
  if (process.platform !== "darwin") throw new ControlError("NATIVE_CONFIRMATION_UNAVAILABLE", "X connection decisions require the GhostGet macOS confirmation dialog.");
  if (signal.aborted) return false;
  const child = Bun.spawn(["/usr/bin/osascript", "-l", "JavaScript", "-e", CONFIRMATION_SCRIPT], {
    stdin: new Blob([JSON.stringify(decision)]), stdout: "pipe", stderr: "ignore",
    env: { PATH: "/usr/bin:/bin", HOME: process.env.HOME ?? "" },
  });
  const abort = (): void => { child.kill(); };
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 125_000);
  try {
    const [status, output] = await Promise.all([child.exited, new Response(child.stdout).text()]);
    return !signal.aborted && status === 0 && output.trim() === "confirmed";
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}

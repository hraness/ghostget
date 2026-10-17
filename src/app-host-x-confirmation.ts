/** This provider-owned dialog is never satisfiable by a protocol approval flag. */
const SCRIPT = `
ObjC.import('Foundation');
const data = $.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile;
const review = JSON.parse(ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding)));
const app = Application.currentApplication(); app.includeStandardAdditions = true;
try { const choice = app.displayDialog(review, {withTitle:'GhostGet · X action', buttons:['Cancel','Confirm'], defaultButton:'Cancel', cancelButton:'Cancel', givingUpAfter:300});
JSON.stringify({confirmed:choice.buttonReturned==='Confirm' && !choice.gaveUp}); } catch (_) { JSON.stringify({confirmed:false}); }
`;
export async function confirmAppHostXAction(review: string, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return false;
  if (process.platform !== "darwin") return false;
  const child = Bun.spawn(["/usr/bin/osascript", "-l", "JavaScript", "-e", SCRIPT], {
    stdin: "pipe", stdout: "pipe", stderr: "ignore",
    env: { PATH: "/usr/bin:/bin", HOME: process.env.HOME },
  });
  child.stdin.write(JSON.stringify(review));
  void child.stdin.end();
  const abort = (): void => { child.kill(); };
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      new Response(child.stdout).text(),
      new Promise<string>(resolve => { timeout = setTimeout(() => { child.kill(); resolve(""); }, 305_000); }),
    ]);
    const status = await child.exited;
    return !signal.aborted && status === 0 && result.length < 1024 && JSON.parse(result).confirmed === true;
  } catch { return false; }
  finally { if (timeout !== undefined) clearTimeout(timeout); signal.removeEventListener("abort", abort); if (child.exitCode === null) { child.kill(); await child.exited; } }
}

export type AppHostXDeleteGrantDecision = { readonly subject: string; readonly displayName: string | null };

// Only the account handle and ID arrive through stdin. The wording, buttons,
// default and timeout are fixed here; no caller value can grant the change.
const DELETE_GRANT_SCRIPT = `
ObjC.import('Foundation');
const data = $.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile;
const input = JSON.parse(ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding)));
const app = Application.currentApplication(); app.includeStandardAdditions = true;
const account = input.displayName === null ? input.subject : input.displayName + ' (' + input.subject + ')';
try {
  const choice = app.displayDialog('Allow deleting posts from X account ' + account + ' without asking?\\n\\nAgents and Yaprack will be able to delete this account\\u2019s own posts without asking each time. They cannot delete other accounts\\u2019 posts, and every other action still asks.\\n\\nTurn this off at any time in Yaprack or GhostGet.', {
    withTitle: 'GhostGet · X unattended deletion', buttons: ['Cancel', 'Allow'], defaultButton: 'Cancel', cancelButton: 'Cancel', givingUpAfter: 120
  });
  choice.buttonReturned === 'Allow' && !choice.gaveUp ? 'allowed' : 'denied';
} catch (_) { 'denied'; }
`;

/** Fixed provider-owned dialog for the standing own-post deletion grant. Cancel, timeout and abort deny. */
export async function confirmAppHostXDeleteGrant(decision: AppHostXDeleteGrantDecision, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted || process.platform !== "darwin") return false;
  const child = Bun.spawn(["/usr/bin/osascript", "-l", "JavaScript", "-e", DELETE_GRANT_SCRIPT], {
    stdin: new Blob([JSON.stringify({ subject: decision.subject, displayName: decision.displayName })]), stdout: "pipe", stderr: "ignore",
    env: { PATH: "/usr/bin:/bin", HOME: process.env.HOME ?? "" },
  });
  const abort = (): void => { child.kill(); };
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  const timer = setTimeout(abort, 125_000);
  try {
    const [status, output] = await Promise.all([child.exited, new Response(child.stdout).text()]);
    return !signal.aborted && status === 0 && output.trim() === "allowed";
  } catch { return false; }
  finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}

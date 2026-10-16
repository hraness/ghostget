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

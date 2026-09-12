import { afterEach, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const credential = "/Applications/Ghostget.app/Contents/Resources/ghostget-runtime/ghostget-credential-bun";
const secureEntry = "/Applications/Ghostget.app/Contents/Helpers/Ghostget Secure Entry.app/Contents/MacOS/ghostget-desktop";

/** Process globals and spawn are replaced only inside this isolated synthetic child. */
async function inspectInvocation(platform: string, executable: string) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ghostget-vault-command-"))); chmodSync(root, 0o700); roots.push(root);
  const script = join(root, "inspect.ts");
  writeFileSync(script, `
const { nativeSecretStore } = await import(process.argv[2]);
Object.defineProperty(process, "platform", { value: process.argv[3] });
Object.defineProperty(process, "execPath", { value: process.argv[4] });
const calls = [];
Bun.spawn = (argv, options) => {
  const call = { argv, options, frames: [], ended: false };
  calls.push(call);
  return {
    stdin: { write(value) { call.frames.push(JSON.parse(value)); }, end() { call.ended = true; } },
    stdout: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"ok":false,"code":"CANCELLED"}')); controller.close(); } }),
    exited: Promise.resolve(1),
    kill() { throw new Error("A joined cancellation must not require a kill"); },
  };
};
const environment = {
  HOME: process.cwd(), TMPDIR: process.cwd(), USER: "fixture", LOGNAME: "fixture",
  GHOSTGET_STATE_HOME: process.cwd(), PATH: "/untrusted/search/path",
  GHOSTGET_NATIVE_EXECUTABLE: "/untrusted/native", BUN_OPTIONS: "--preload=untrusted",
  DYLD_INSERT_LIBRARIES: "/untrusted/library", OP_SERVICE_ACCOUNT_TOKEN: "synthetic-must-not-propagate",
};
const store = nativeSecretStore(environment);
const codes = [];
for (const action of ["read", "delete"]) {
  try { await store[action]("a1234567-1234-4123-8123-123456789abc", "credential"); codes.push("UNEXPECTED_SUCCESS"); }
  catch (error) { codes.push(error.code); }
}
process.stdout.write(JSON.stringify({ calls, codes }));
`, { mode: 0o600 });
  const child = Bun.spawn([process.execPath, "--no-env-file", "--no-install", script, fileURLToPath(new URL("./vault-process.ts", import.meta.url)), platform, executable], {
    cwd: root, env: { HOME: root, TMPDIR: root, PATH: "/usr/bin:/bin" }, stdin: "ignore", stdout: "pipe", stderr: "pipe",
  });
  const deadline = setTimeout(() => child.kill("SIGKILL"), 15000);
  try {
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    expect(code).toBe(0); expect(stderr).toBe("");
    return { root, value: JSON.parse(stdout) as unknown };
  } finally { clearTimeout(deadline); try { child.kill("SIGKILL"); } catch { /* Already joined. */ } await child.exited; }
}

test("native vault invokes the nested secure entry with fixed argv and an isolated environment", async () => {
  const { root, value } = await inspectInvocation("darwin", credential);
  expect(value).toEqual({
    codes: ["VAULT_CANCELLED", "VAULT_CANCELLED"],
    calls: ["read", "delete"].map(action => ({
      argv: [secureEntry, "--vault-stdio"],
      options: {
        env: { HOME: root, TMPDIR: root, USER: "fixture", LOGNAME: "fixture", PATH: "/usr/bin:/bin:/usr/sbin:/sbin", GHOSTGET_STATE_HOME: root },
        stdin: "pipe", stdout: "pipe", stderr: "ignore",
      },
      frames: [{ protocol: "ghostget.secret-store/1", action, purpose: "credential", id: "a1234567-1234-4123-8123-123456789abc" }],
      ended: true,
    })),
  });
});

test("native vault rejects unsupported hosts and ordinary Bun before spawning secure entry", async () => {
  for (const [platform, executable] of [["linux", credential], ["darwin", "/usr/local/bin/bun"], ["darwin", credential.replace("credential-", "")]] as const) {
    expect((await inspectInvocation(platform, executable)).value).toEqual({ calls: [], codes: ["VAULT_UNAVAILABLE", "VAULT_UNAVAILABLE"] });
  }
});

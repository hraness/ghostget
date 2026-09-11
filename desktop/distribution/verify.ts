import { appendFileSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { authorize, command, environmentAuthority, githubReader } from "./authority.ts";
import { archiveName, desktopTag, digest, object, parseManifest, requireValue, sha256, VERIFICATIONS, verifyDirectory, version, WORKFLOW, REPOSITORY, REPOSITORY_ID } from "./contract.ts";
import { admitHandoff, matchSignedManifest, temporaryDirectory } from "./handoff.ts";
import { inventory, verifyNativeBundle } from "./native.ts";

export class HelperCustodyUncertain extends Error { constructor() { super("Signed helper custody could not be confirmed; disposable evidence was retained."); } }
interface HelperChild { readonly exited: Promise<number>; kill(signal: "SIGTERM" | "SIGKILL"): unknown }
/** The operation deadline and both exit joins are bounded independently. */
export async function verifyHelperLifecycle(child: HelperChild, operation: () => Promise<void>, bounds = { operation: 75_000, term: 1500, kill: 2500 }): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined; let exited = false;
  const joined = child.exited.then(code => { exited = true; return code; });
  const wait = async (milliseconds: number): Promise<boolean> => {
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([joined.then(() => true), new Promise<false>(resolve => { deadline = setTimeout(() => resolve(false), milliseconds); })]); }
    finally { if (deadline) clearTimeout(deadline); }
  };
  try {
    const [, code] = await Promise.race([Promise.all([Promise.resolve().then(operation), joined]), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Signed helper operation exceeded its deadline")), bounds.operation); })]);
    requireValue(code === 0, "signed helper did not shut down cleanly");
  } finally {
    if (timer) clearTimeout(timer);
    if (!exited) {
      try { child.kill("SIGTERM"); } catch { /* An already exited child is joined below. */ }
      if (!await wait(bounds.term)) {
        try { child.kill("SIGKILL"); } catch { /* An already exited child is joined below. */ }
        if (!await wait(bounds.kill)) throw new HelperCustodyUncertain();
      }
    }
  }
}

async function smoke(app: string): Promise<void> {
  const scratch = realpathSync(mkdtempSync("/private/tmp/ghostget-distribution-smoke-"));
  const state = join(scratch, "state"); mkdirSync(state, { mode: 0o700 });
  const runtime = join(app, "Contents/Resources/ghostget-runtime"), packageRoot = join(runtime, "package");
  const environment = { HOME: scratch, TMPDIR: scratch, PATH: "/usr/bin:/bin:/usr/sbin:/sbin", GHOSTGET_STATE_HOME: state };
  let cleanupSafe = true;
  // Exercise JIT, SQLite, WebAssembly and the FFI mechanism under each final signature.
  const probe = 'import {Database} from "bun:sqlite"; import {dlopen,FFIType} from "bun:ffi"; const db=new Database(":memory:");if(db.query("select 1 as n").get().n!==1)throw Error();db.close();new WebAssembly.Module(new Uint8Array([0,97,115,109,1,0,0,0]));const lib=dlopen("/usr/lib/libSystem.B.dylib",{getpid:{args:[],returns:FFIType.i32}});if(lib.symbols.getpid()<=0)throw Error();lib.close();let n=0;for(let i=0;i<1000000;i++)n+=i;if(n!==499999500000)throw Error();console.log("qualified");';
  try {
    for (const executable of ["ghostget-bun", "ghostget-credential-bun"]) requireValue(command(join(runtime, executable), ["--no-env-file", "--no-install", "-e", probe], { environment, timeout: 60_000 }).toString("utf8") === "qualified\n", "signed runtime mechanism probe failed");
    const child = Bun.spawn([join(runtime, "ghostget-bun"), "--no-env-file", "--no-install", "src/control/helper.ts"], { cwd: packageRoot, env: environment, stdin: "pipe", stdout: "pipe", stderr: "ignore" });
    await verifyHelperLifecycle(child, async () => {
      child.stdin.write(`${JSON.stringify({ id: "distribution-smoke", protocol: "ghostget.control/1", request: { action: "snapshot", accountId: null } })}\n`);
      const reader = child.stdout.getReader(); let bytes = Buffer.alloc(0);
      while (!bytes.includes(10)) {
        const next = await reader.read(); requireValue(!next.done, "signed packaged helper exited before snapshot");
        bytes = Buffer.concat([bytes, next.value]); requireValue(bytes.length < 4 * 1024 * 1024, "signed packaged helper exceeded frame bound");
      }
      requireValue(bytes.indexOf(10) === bytes.length - 1, "signed packaged helper emitted extra frames");
      const frame = object(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
      const data = object(frame.data), snapshot = object(data.snapshot);
      requireValue(frame.id === "distribution-smoke" && frame.protocol === "ghostget.control/1" && frame.ok === true && data.kind === "snapshot"
        && Array.isArray(snapshot.accounts) && snapshot.accounts.length === 0, "signed packaged helper snapshot differs");
      child.stdin.end();
      const tail = await reader.read(); requireValue(tail.done, "signed packaged helper emitted output after its response"); reader.releaseLock();
    });
    const control = join(state, "control"); requireValue(!readdirSync(control).some(name => ["owner.json", "agent.sock"].includes(name)), "signed helper retained control custody");
  } catch (error) { if (error instanceof HelperCustodyUncertain) cleanupSafe = false; throw error; }
  finally { if (cleanupSafe) rmSync(scratch, { recursive: true, force: true }); }
}

if (import.meta.main) {
  requireValue(process.argv.length === 2, "verification accepts no caller-selected paths");
  const a = environmentAuthority(); authorize(a, githubReader());
  const input = temporaryDirectory("input"), handoff = admitHandoff(input, a, "signed", process.env.DESKTOP_INPUT_RECEIPT_SHA256);
  const receipt = handoff.signing; requireValue(receipt !== null, "signed receipt is missing");
  const identity = digest(receipt.signingIdentitySha1, 40), team = receipt.teamId;
  const assets = temporaryDirectory("verified"); mkdirSync(assets, { mode: 0o700 });
  const archive = join(assets, handoff.archive.name); copyFileSync(join(input, handoff.archive.name), archive);
  command("python3", ["-I", "desktop/distribution/archive.py", "signed", archive], { timeout: 300_000 });
  const extracted = realpathSync(mkdtempSync("/private/tmp/ghostget-distribution-extract-")), app = join(extracted, "Ghostget.app");
  let extractionCleanupSafe = true;
  try {
  command("/usr/bin/ditto", ["-x", "-k", archive, extracted], { timeout: 180_000 });
  requireValue(readdirSync(extracted).join(",") === "Ghostget.app", "download archive has unexpected roots");
  verifyNativeBundle(app, team, identity);
  const runtime = join(app, "Contents/Resources/ghostget-runtime"), runtimeManifest = readFileSync(join(runtime, "runtime-manifest.json"));
  const resources = object(JSON.parse(runtimeManifest.toString("utf8")));
  requireValue(resources.schema === "ghostget.native-resources/1" && resources.bunVersion === "1.3.14"
    && isDeepStrictEqual(resources.files, inventory(runtime).filter(file => file.path !== "runtime-manifest.json").map(({ path, bytes, sha256 }) => ({ path, size: bytes, sha256 }))), "final signed runtime inventory differs");
  await smoke(app);
  const archiveBytes = readFileSync(archive);
  const manifest = parseManifest({ schema: "ghostget.desktop-release/1", repository: REPOSITORY, repositoryId: REPOSITORY_ID,
    canonicalTag: a.tag, desktopTag: desktopTag(a.tag), version: version(a.tag), sourceSha: a.source, sourceTree: digest(command("git", ["rev-parse", `${a.source}^{tree}`]).toString("utf8").trim(), 40),
    workflow: WORKFLOW, workflowSha: a.source, workflowId: a.workflowId, runId: a.runId, runAttempt: a.runAttempt, architecture: "arm64", minimumMacOS: "14.5", teamId: team, signingIdentitySha1: receipt.signingIdentitySha1,
    archive: { name: archiveName(a.tag), bytes: archiveBytes.length, sha256: sha256(archiveBytes) },
    notarization: receipt.notarization, runtimeInventorySha256: sha256(runtimeManifest),
    signingInventorySha256: sha256(readFileSync(join(app, "Contents/Resources/desktop-signing-inventory.json"))), verification: VERIFICATIONS });
  matchSignedManifest(manifest, handoff);
  const encoded = `${JSON.stringify(manifest)}\n`; writeFileSync(join(assets, "desktop-manifest.json"), encoded, { flag: "wx", mode: 0o600 });
  writeFileSync(join(assets, "SHA256SUMS"), `${manifest.archive.sha256}  ${manifest.archive.name}\n${sha256(encoded)}  desktop-manifest.json\n`, { flag: "wx", mode: 0o600 });
  const { hashes } = verifyDirectory(assets, a.tag, false); authorize(a, githubReader());
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `hashes=${JSON.stringify(hashes)}\narchive=${manifest.archive.name}\n`);
  console.log("Final extracted Developer ID app, notarization, Gatekeeper and isolated packaged-helper gates passed.");
  } catch (error) { if (error instanceof HelperCustodyUncertain) extractionCleanupSafe = false; throw error; }
  finally { if (extractionCleanupSafe) rmSync(extracted, { recursive: true, force: true }); }
}

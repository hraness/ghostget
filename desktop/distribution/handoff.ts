import { appendFileSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { authorize, command, environmentAuthority, githubReader, type Authority } from "./authority.ts";
import { inventory } from "./native.ts";
import { stageSecureEntry, validateSecureEntry } from "./secure-entry.ts";
import { archiveName, digest, keys, MAX_ARCHIVE_BYTES, object, positive, REPOSITORY, REPOSITORY_ID, requireValue, sha256, version, WORKFLOW, type DesktopManifest } from "./contract.ts";

export type SigningReceipt = Readonly<Pick<DesktopManifest, "teamId" | "signingIdentitySha1" | "notarization" | "runtimeInventorySha256" | "signingInventorySha256">>;
export type Handoff = Readonly<{
  schema: "ghostget.desktop-handoff/1"; stage: "unsigned" | "signed";
  repository: typeof REPOSITORY; repositoryId: typeof REPOSITORY_ID; canonicalTag: string;
  sourceSha: string; sourceTree: string; workflow: typeof WORKFLOW; workflowSha256: string; lockSha256: string;
  workflowId: number; runId: number; runAttempt: number;
  archive: Readonly<{ name: string; bytes: number; sha256: string }>; signing: SigningReceipt | null;
}>;
export function parseHandoff(value: unknown): Handoff {
  const h = keys(value, ["schema", "stage", "repository", "repositoryId", "canonicalTag", "sourceSha", "sourceTree", "workflow", "workflowSha256", "lockSha256", "workflowId", "runId", "runAttempt", "archive", "signing"]);
  requireValue(h.schema === "ghostget.desktop-handoff/1" && ["unsigned", "signed"].includes(String(h.stage)) && h.repository === REPOSITORY && h.repositoryId === REPOSITORY_ID && h.workflow === WORKFLOW, "handoff authority differs");
  version(h.canonicalTag); digest(h.sourceSha, 40); digest(h.sourceTree, 40); digest(h.workflowSha256); digest(h.lockSha256);
  positive(h.workflowId); positive(h.runId); positive(h.runAttempt);
  const archive = keys(h.archive, ["name", "bytes", "sha256"]);
  requireValue(archive.name === (h.stage === "unsigned" ? "unsigned.zip" : archiveName(String(h.canonicalTag))) && positive(archive.bytes) <= MAX_ARCHIVE_BYTES, "handoff archive differs"); digest(archive.sha256);
  if (h.stage === "unsigned") requireValue(h.signing === null, "unsigned handoff has signing claims");
  else {
    const signing = keys(h.signing, ["teamId", "signingIdentitySha1", "notarization", "runtimeInventorySha256", "signingInventorySha256"]);
    requireValue(typeof signing.teamId === "string" && /^[A-Z0-9]{10}$/u.test(signing.teamId), "handoff team differs");
    digest(signing.signingIdentitySha1, 40); digest(signing.runtimeInventorySha256); digest(signing.signingInventorySha256);
    const n = keys(signing.notarization, ["id", "status", "stapled"]);
    requireValue(typeof n.id === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(n.id) && n.status === "Accepted" && n.stapled === true, "handoff notarization differs");
  }
  return h as Handoff;
}
export function sourceCoordinates(a: Authority): Pick<Handoff, "repository" | "repositoryId" | "canonicalTag" | "sourceSha" | "sourceTree" | "workflow" | "workflowSha256" | "lockSha256" | "workflowId" | "runId" | "runAttempt"> {
  requireValue(command("git", ["rev-parse", "HEAD"]).toString("utf8").trim() === a.source && object(JSON.parse(readFileSync("package.json", "utf8"))).version === version(a.tag), "handoff checkout differs");
  return { repository: REPOSITORY, repositoryId: REPOSITORY_ID, canonicalTag: a.tag, sourceSha: a.source,
    sourceTree: digest(command("git", ["rev-parse", "HEAD^{tree}"]).toString("utf8").trim(), 40), workflow: WORKFLOW,
    workflowSha256: sha256(readFileSync(WORKFLOW)), lockSha256: sha256(readFileSync("bun.lock")), workflowId: a.workflowId, runId: a.runId, runAttempt: a.runAttempt };
}
export function temporaryDirectory(name: "input" | "unsigned" | "signed" | "verified" | "tree"): string {
  requireValue(typeof process.env.RUNNER_TEMP === "string" && process.env.RUNNER_TEMP.length > 0, "runner scratch is missing");
  const root = realpathSync(process.env.RUNNER_TEMP), checkout = realpathSync(process.cwd());
  requireValue(root !== checkout && !root.startsWith(`${checkout}/`), "runner scratch overlaps checkout");
  return join(root, `ghostget-desktop-${name}`);
}
function fileBytes(path: string, maximum: number): Buffer {
  const s = lstatSync(path); requireValue(s.isFile() && !s.isSymbolicLink() && s.nlink === 1 && s.size > 0 && s.size <= maximum, "handoff file is unsafe");
  const bytes = readFileSync(path); requireValue(bytes.length === s.size, "handoff file changed"); return bytes;
}
export function sealHandoff(directory: string, a: Authority, stage: Handoff["stage"], signing: SigningReceipt | null): Handoff {
  const name = stage === "unsigned" ? "unsigned.zip" : archiveName(a.tag), bytes = fileBytes(join(directory, name), MAX_ARCHIVE_BYTES);
  const h = parseHandoff({ schema: "ghostget.desktop-handoff/1", stage, ...sourceCoordinates(a), archive: { name, bytes: bytes.length, sha256: sha256(bytes) }, signing });
  const encoded = `${JSON.stringify(h)}\n`; writeFileSync(join(directory, "handoff.json"), encoded, { mode: 0o600, flag: "wx" });
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `receipt_sha256=${sha256(encoded)}\nhandoff=${JSON.stringify(h)}\n`);
  return h;
}
export function admitHandoff(directory: string, a: Authority, stage: Handoff["stage"], expectedDigest: unknown): Handoff {
  const root = lstatSync(directory); requireValue(root.isDirectory() && !root.isSymbolicLink(), "handoff root is unsafe");
  const encoded = fileBytes(join(directory, "handoff.json"), 8192); requireValue(sha256(encoded) === digest(expectedDigest), "handoff receipt digest differs");
  const h = parseHandoff(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(encoded)));
  requireValue(h.stage === stage && Object.entries(sourceCoordinates(a)).every(([key, value]) => h[key as keyof Handoff] === value), "handoff source or attempt differs");
  requireValue(readdirSync(directory).sort().join(",") === [h.archive.name, "handoff.json"].sort().join(","), "handoff contains extra files");
  const bytes = fileBytes(join(directory, h.archive.name), MAX_ARCHIVE_BYTES);
  requireValue(bytes.length === h.archive.bytes && sha256(bytes) === h.archive.sha256, "handoff archive bytes differ");
  return h;
}
/** The runner that executes the app cannot choose a replacement signed archive. */
export function matchSignedManifest(manifest: DesktopManifest, handoff: Handoff): void {
  requireValue(handoff.stage === "signed" && handoff.signing !== null && isDeepStrictEqual(handoff.archive, manifest.archive), "verified archive differs from clean signer");
  for (const key of ["sourceSha", "sourceTree", "canonicalTag", "repository", "repositoryId", "workflow", "workflowId", "runId", "runAttempt"] as const) requireValue(handoff[key] === manifest[key], "verified source differs from clean signer");
  for (const key of ["teamId", "signingIdentitySha1", "notarization", "runtimeInventorySha256", "signingInventorySha256"] as const) requireValue(isDeepStrictEqual(handoff.signing[key], manifest[key]), "verified signing receipt differs from clean signer");
}

if (import.meta.main) {
  requireValue(process.argv.length === 3 && ["pack", "prepare"].includes(process.argv[2] ?? ""), "expected pack or prepare");
  const a = environmentAuthority(); authorize(a, githubReader());
  if (process.argv[2] === "prepare") {
    const input = temporaryDirectory("input"), h = admitHandoff(input, a, "unsigned", process.env.DESKTOP_INPUT_RECEIPT_SHA256);
    const tree = temporaryDirectory("tree"); mkdirSync(tree, { mode: 0o700 });
    command("python3", ["-I", "desktop/distribution/archive.py", "unsigned", join(input, h.archive.name), tree], { timeout: 300_000 });
    validateSecureEntry(join(tree, "Ghostget.app"), version(a.tag), true);
    const hash = sha256(JSON.stringify(inventory(join(tree, "Ghostget.app"))));
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `tree_sha256=${hash}\n`);
    authorize(a, githubReader());
  } else {
  const directory = temporaryDirectory("unsigned"); mkdirSync(directory, { mode: 0o700 });
  const app = resolve("desktop/src-tauri/target/release/bundle/macos/Ghostget.app");
  stageSecureEntry(app, version(a.tag));
  command("python3", ["-I", "desktop/distribution/archive.py", "pack", app, join(directory, "unsigned.zip")], { timeout: 300_000 });
  sealHandoff(directory, a, "unsigned", null); authorize(a, githubReader());
  }
}

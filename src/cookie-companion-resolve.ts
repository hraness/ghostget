/**
 * Resolve the reviewed `hraness-companion` binary through
 * `@hraness/desktop-foundation`'s pinned-release installer and print its
 * verified path as one JSON line on stdout.
 *
 * This runs as its own `bun` process (spawned by `cookie-safe-storage.ts`)
 * because the local-app path is opt-in only: a static or literal dynamic
 * import edge here would pull the whole desktop-foundation package into the
 * provider-plugin evaluation closure and tax every ordinary command.
 */
import { ensureBinary, packagedManifest } from "@hraness/desktop-foundation";

const installed = await ensureBinary({ manifest: await packagedManifest() });
process.stdout.write(`${JSON.stringify({ type: "runner-result", path: installed.path })}\n`);

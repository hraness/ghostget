/**
 * Resolve the reviewed desktop-foundation helper binary through
 * `@hraness/desktop-foundation/helper` and print its verified path as one
 * JSON line on stdout. `resolveHelper` prefers the release's `hraness-helper`
 * asset and falls back to the byte-identical `hraness-companion` alias; both
 * are installed from the pinned release manifest and digest-checked.
 *
 * This runs as its own `bun` process (spawned by `cookie-safe-storage.ts`)
 * because the local-app path is opt-in only: a static or literal dynamic
 * import edge here would pull the whole desktop-foundation package into the
 * provider-plugin evaluation closure and tax every ordinary command.
 */
import { packagedManifest } from "@hraness/desktop-foundation";
import { resolveHelper } from "@hraness/desktop-foundation/helper";

const resolved = await resolveHelper({ manifest: await packagedManifest() });
process.stdout.write(`${JSON.stringify({ type: "runner-result", path: resolved.path, source: resolved.source })}\n`);

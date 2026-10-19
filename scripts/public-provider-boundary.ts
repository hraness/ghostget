import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

// Deny-only retired hostnames in src/model.ts preserve the old browser-action
// fence. They grant no route and are the only deliberate provider-domain residue.
const retiredPath = /(?:^|\/)(?:x(?:\/|[-.])|webmcp(?:\/|[-.])|app-host(?:[-.]|\/)|oauth-x\.|provider-contract-(?:definitions|input)-x\.|article-draft-embeds\.)/u;
const retiredImplementation = /https:\/\/(?:api\.x\.com|api\.twitter\.com|(?:www\.)?wmcp\.ai)(?:\/|["'`])|x\.com\/i\/api\/|\b(?:CreateTweet|TweetDetail|TweetResultByRestId|CreateRetweet|DeleteRetweet|XSocialPost|XPublicClientRefresh|isXAccountSubject|assertExactHistoricalXSchedule)\b|["'`](?:x-web|x-official|webmcp|x-oauth2-public-client)["'`]|\bx\.action\./u;

/** Inspect the actual published bytes, including split JavaScript bundles. */
export function assertPublicProviderBoundary(packageRoot: string): number {
  const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
    files: string[];
    bin: Record<string, string>;
    exports: Record<string, unknown>;
    dependencies: Record<string, string>;
  };
  if (manifest.bin["ghostget-app-host"] !== undefined || manifest.exports["./app-host-protocol"] !== undefined
    || manifest.dependencies["@1password/sdk"] !== undefined) {
    throw new Error("Public package metadata exposes a removed private provider entrypoint or dependency.");
  }
  let checked = 0;
  const inspect = (path: string): void => {
    const local = relative(packageRoot, path).split("\\").join("/");
    if (retiredPath.test(local)) throw new Error(`Public package contains a removed private provider path: ${local}`);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error(`Public package entry is a symlink: ${local}`);
    if (stat.isDirectory()) {
      for (const name of readdirSync(path).sort()) inspect(join(path, name));
      return;
    }
    if (!stat.isFile()) throw new Error(`Public package entry is not a regular file: ${local}`);
    if (!/\.(?:ts|js|json|md|mjs|cjs|txt)$/u.test(local)) return;
    const source = readFileSync(path, "utf8");
    if (retiredImplementation.test(source)) throw new Error(`Public package retains a removed private provider implementation: ${local}`);
    checked++;
  };
  for (const entry of manifest.files) inspect(join(packageRoot, entry));
  return checked;
}

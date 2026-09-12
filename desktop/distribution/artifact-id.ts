import { appendFileSync } from "node:fs";

/** Keep the downloader on its fixed-directory, single-artifact branch. */
export function admitArtifactId(value: unknown): string {
  if (typeof value !== "string" || value.length > 16 || !/^[1-9][0-9]*$/u.test(value)
    || !Number.isSafeInteger(Number(value)) || String(Number(value)) !== value) {
    throw new Error("Artifact download requires one canonical positive safe-integer ID");
  }
  return value;
}

if (import.meta.main) {
  if (process.argv.length !== 2 || !process.env.GITHUB_OUTPUT) throw new Error("Artifact ID admission requires its workflow output file");
  const id = admitArtifactId(process.env.DESKTOP_BUILD_ARTIFACT_ID);
  appendFileSync(process.env.GITHUB_OUTPUT, `artifact_id=${id}\n`);
}

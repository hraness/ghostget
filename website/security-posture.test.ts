import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

test("security.txt names the private reporting route and an unexpired date", async () => {
  const text = await readFile(join(root, "website/public/.well-known/security.txt"), "utf8");
  expect(text).toContain("Contact: https://github.com/hraness/ghostget/security/advisories/new");
  expect(text).toContain("Canonical: https://ghostget.com/.well-known/security.txt");
  const expires = /^Expires: (.+)$/mu.exec(text)?.[1];
  expect(expires).toBeDefined();
  expect(Date.parse(expires ?? "")).toBeGreaterThan(Date.now());
});

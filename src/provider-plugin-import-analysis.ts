import { createHash } from "node:crypto";

type LiteralModuleImport = {
  readonly kind: string;
  readonly path: string;
};

const scanners = Object.freeze({
  js: new Bun.Transpiler({ loader: "js" }),
  ts: new Bun.Transpiler({ loader: "ts" }),
});
const MAX_MEMO_ENTRIES = 2_048;
const MAX_MEMO_TEXT_BYTES = 4 * 1024 * 1024;
const importsMemo = new Map<string, {
  readonly imports: readonly LiteralModuleImport[];
  readonly textBytes: number;
}>();
let memoTextBytes = 0;

/**
 * Pure syntax only: callers still read current bytes, enforce their bounds,
 * resolve every edge from its current importer, and revalidate the filesystem.
 * Keep only immutable scanner output; never retain source text or an AST.
 */
export function scanProviderPluginValueImports(
  source: string,
  loader: "js" | "ts",
): readonly LiteralModuleImport[] {
  const key = `${loader}\0${createHash("sha256").update(source).digest("hex")}`;
  const cached = importsMemo.get(key);
  if (cached !== undefined) return cached.imports;
  const imports = Object.freeze(scanners[loader].scanImports(source).map(
    ({ kind, path }) => Object.freeze({ kind, path }),
  ));
  const textBytes = key.length + imports.reduce(
    (total, entry) => total + Buffer.byteLength(entry.kind) + Buffer.byteLength(entry.path),
    0,
  );
  // Count entries as well as returned text so empty modules stay bounded too.
  // Oversized foreign input is still rejected by the caller's own import bound.
  if (imports.length > 4_096 || textBytes > MAX_MEMO_TEXT_BYTES) return imports;
  while (importsMemo.size >= MAX_MEMO_ENTRIES
    || memoTextBytes + textBytes > MAX_MEMO_TEXT_BYTES) {
    const oldest = importsMemo.entries().next().value;
    if (oldest === undefined) break;
    importsMemo.delete(oldest[0]);
    memoTextBytes -= oldest[1].textBytes;
  }
  importsMemo.set(key, { imports, textBytes });
  memoTextBytes += textBytes;
  return imports;
}

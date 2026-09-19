import { createHash } from "node:crypto";

import { canonicalJsonWithDefinedMembers } from "./canonical-json";

/**
 * Hash an exact provider-owned contract projection. Functions are deliberately
 * excluded: shared planners are implementation sources, while provider-local
 * validators are declared as provider-specific implementation sources.
 *
 * The contract ordering uses UTF-16 code-unit comparison, not locale-aware
 * collation: a pinned reviewed identity must not depend on the host's ICU
 * locale data. Verified byte-identical to the previous localeCompare ordering
 * for every pinned built-in contract set.
 */
export function contractSemanticIdentity(
  contracts: readonly object[],
): string {
  const ordered = [...contracts].sort((left, right) => {
    const leftRecord = left as Readonly<Record<string, unknown>>;
    const rightRecord = right as Readonly<Record<string, unknown>>;
    const leftKey = `${String(leftRecord.provider ?? leftRecord.site)}/${String(leftRecord.operation)}@${String(leftRecord.contractVersion)}`;
    const rightKey = `${String(rightRecord.provider ?? rightRecord.site)}/${String(rightRecord.operation)}@${String(rightRecord.contractVersion)}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  return createHash("sha256").update(
    canonicalJsonWithDefinedMembers(ordered, "provider plugin semantic identity"),
  ).digest("hex");
}

export function assertContractSemanticIdentity(
  owner: string,
  contracts: readonly object[],
  expected: string,
): void {
  if (!/^[a-f0-9]{64}$/u.test(expected)) {
    throw new Error(`${owner} contract semantic identity must be a lowercase SHA-256 digest`);
  }
  const actual = contractSemanticIdentity(contracts);
  if (actual !== expected) {
    throw new Error(
      `${owner} contract semantics changed: expected ${expected}, received ${actual}`,
    );
  }
}

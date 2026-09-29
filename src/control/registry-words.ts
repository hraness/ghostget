/**
 * The first words the control registry owns. Kept apart from `registry.ts`
 * so help routing and the gateway policy can ask without loading the
 * registry or desktop-foundation.
 */
export const REGISTRY_WORDS: ReadonlySet<string> = new Set([
  "commands", "status", "approvals", "permissions", "activity", "prompt", "outputs", "connections", "control",
]);

/** Whether `args` names a registry verb; everything else keeps its existing dispatcher. */
export function registryOwns(args: readonly string[]): boolean {
  const first = args[0] ?? "";
  if (REGISTRY_WORDS.has(first)) return true;
  return (first === "web" && args[1] === "rules") || (first === "interface" && args[1] === "activate");
}

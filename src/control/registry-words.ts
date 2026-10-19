/**
 * The first words the control registry owns. The list lives in `usage.ts`,
 * which must stay import-free for the static-help performance gate; this
 * module lets the gateway policy and the registry ask without loading
 * desktop-foundation.
 */
export { REGISTRY_WORDS, registryOwns } from "../usage";

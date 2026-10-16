import type { ProviderPluginRegistry } from "./provider-plugin-registry";

/** Defer one trusted registry without changing its synchronous method surface. */
export function createLazyProviderPluginRegistry(
  createRegistry: () => ProviderPluginRegistry,
): ProviderPluginRegistry {
  let registry: ProviderPluginRegistry | undefined;
  let initializing = false;
  let failed = false;
  let failure: unknown;
  const materialize = (): ProviderPluginRegistry => {
    if (failed) throw failure;
    if (registry !== undefined) return registry;
    if (initializing) {
      failed = true;
      failure = new Error("provider plugin registry initialization reentered");
      throw failure;
    }
    initializing = true;
    try {
      const created = createRegistry();
      // Reentry stays terminal even when the trusted factory catches it.
      if (failed) throw failure;
      registry = created;
      return created;
    } catch (error) {
      failed = true;
      failure = error;
      throw error;
    } finally {
      initializing = false;
    }
  };
  const facade: ProviderPluginRegistry = {
    list: (...args) => materialize().list(...args),
    get: (...args) => materialize().get(...args),
    resolveRoute: (...args) => materialize().resolveRoute(...args),
    requireRoute: (...args) => materialize().requireRoute(...args),
    resolveSessionRoute: (...args) => materialize().resolveSessionRoute(...args),
    requireSessionRoute: (...args) => materialize().requireSessionRoute(...args),
    resolveAccountRoute: (...args) => materialize().resolveAccountRoute(...args),
    requireAccountRoute: (...args) => materialize().requireAccountRoute(...args),
    resolveOperation: (...args) => materialize().resolveOperation(...args),
    requireOperation: (...args) => materialize().requireOperation(...args),
    resolveOperationDefinition: (...args) => materialize().resolveOperationDefinition(...args),
    requireOperationDefinition: (...args) => materialize().requireOperationDefinition(...args),
    implementationHash: (...args) => materialize().implementationHash(...args),
    contractImplementationHash: (...args) => materialize().contractImplementationHash(...args),
    legacyContractImplementationHashes: (...args) => materialize().legacyContractImplementationHashes(...args),
    implementationClosureHash: (...args) => materialize().implementationClosureHash(...args),
    artifactSha256: (...args) => materialize().artifactSha256(...args),
    listOwnedManifests: (...args) => materialize().listOwnedManifests(...args),
    resolveOwnedManifest: (...args) => materialize().resolveOwnedManifest(...args),
  };
  return Object.freeze(facade);
}

import { createRequire } from "node:module";
import { createLazyProviderPluginRegistry } from "./provider-plugin-lazy-registry";
import { createProviderPluginRegistry } from "./provider-plugin-registry";

const require = createRequire(import.meta.url);

/** The process default validates its fixed trusted catalog only when used. */
export const providerPluginRegistry = createLazyProviderPluginRegistry(() => {
  const { generatedProviderPlugins } = require("./provider-plugins.generated") as typeof import("./provider-plugins.generated");
  return createProviderPluginRegistry(generatedProviderPlugins);
});

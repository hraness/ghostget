import {
  defineProviderPlugin,
  lazyWebSessionRuntime,
} from "../../provider-plugin";
import {
  webImplementationSources,
  webSessionContractOperations,
} from "../../provider-plugin-builtins";
import {
  WEBMCP_CONTRACTS,
} from "../../providers/webmcp";

const operations = webSessionContractOperations(
  WEBMCP_CONTRACTS,
  "835d5fb51985c8094dd9429dc2a775c36d0f8b78b945d94af3c76f6a8d4287eb",
).map((operation) => Object.freeze({
  ...operation,
  access: "public" as const,
}));

export const webmcpPlugin = defineProviderPlugin({
  apiVersion: 1,
  id: "webmcp",
  version: "1.0.0",
  displayName: "WebMCP Registry",
  sourceKind: "built-in",
  implementationSources: webImplementationSources(import.meta.url, [
    ["providers/read-failure.ts", "../../providers/read-failure.ts"],
    ["providers/webmcp.ts", "../../providers/webmcp.ts"],
    ["providers/webmcp-runtime.ts", "../../providers/webmcp-runtime.ts"],
  ]),
  bindings: [{
    transport: "web-session-api",
    surfaceId: "webmcp",
    origin: "https://www.wmcp.ai",
    manifestOrigins: ["https://www.wmcp.ai", "https://wmcp.ai"],
    protectedHostnameFamilies: ["wmcp.ai", "www.wmcp.ai"],
    authKinds: ["browser-profile"],
    operations,
    subject: {
      format: "webmcp:public",
      matches: (value) => value === "webmcp:public",
    },
    runtime: lazyWebSessionRuntime(async () => {
      const runtime = await import("../../providers/webmcp-runtime");
      return {
        probe: runtime.probeWebmcpSubject,
        execute: runtime.executeWebmcpAuthenticatedOperation,
        executePublic: (_manifest, recipe, input, options) =>
          runtime.executeWebmcpPublicOperation(
            recipe,
            input,
            undefined,
            options.operationDeadline,
          ),
      };
    }),
  }],
});

export default webmcpPlugin;

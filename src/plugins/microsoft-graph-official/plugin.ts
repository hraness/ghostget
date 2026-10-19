import { microsoftGraphContracts } from "../../provider-contract-definitions-microsoft-graph";
import { defineProviderPlugin, lazyProviderApiRuntime } from "../../provider-plugin";
import { oauthTokenAuthKinds, officialContractOperations } from "../../provider-plugin-builtins";
import { isMicrosoftGraphSubject, microsoftGraphInputIssues } from "../../providers/microsoft-graph-policy";

export const microsoftGraphOfficialPlugin = defineProviderPlugin({
  apiVersion: 1,
  id: "microsoft-graph-official",
  version: "1.0.0",
  displayName: "Microsoft Graph Official API (verification required)",
  sourceKind: "built-in",
  implementationSources: [
    { label: "plugin.ts", url: new URL("./plugin.ts", import.meta.url) },
    { label: "providers/microsoft-graph.ts", url: new URL("../../providers/microsoft-graph.ts", import.meta.url) },
    { label: "providers/microsoft-graph-policy.ts", url: new URL("../../providers/microsoft-graph-policy.ts", import.meta.url) },
    { label: "provider-contract-definitions-microsoft-graph.ts", url: new URL("../../provider-contract-definitions-microsoft-graph.ts", import.meta.url) },
  ],
  bindings: [{
    transport: "provider-api",
    surfaceId: "microsoft-graph",
    origin: "https://graph.microsoft.com",
    runtimeOrigins: ["https://graph.microsoft.com"],
    manifestOrigins: ["https://graph.microsoft.com"],
    protectedHostnameFamilies: ["graph.microsoft.com"],
    authKinds: oauthTokenAuthKinds,
    operations: officialContractOperations(microsoftGraphContracts, {
      semanticIdentity: "17326c44a8cfd796e6da472bfe1e2e3a3fc8c84e23714a5068b128c1a5d00494",
      validateInput: (contract, input) => microsoftGraphInputIssues(contract.operation, input),
    }),
    subject: { format: "microsoft-graph:<exact Graph user ID>", matches: isMicrosoftGraphSubject },
    runtime: lazyProviderApiRuntime(async () => {
      const runtime = await import("../../providers/microsoft-graph");
      return { execute: runtime.executeMicrosoftGraphProvider };
    }),
  }],
});

export default microsoftGraphOfficialPlugin;

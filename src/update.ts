import { fileURLToPath } from "node:url";
import { runCliUpdate, type CliUpdateOptions, type StartupResult } from "@hraness/cli-update";
import { assertGatewayCommandAllowed, readWebPolicy } from "./control/web-policy";
import { GHOSTGET_VERSION } from "./version";

/** Executable-only policy; importing GhostGet's SDK never reaches this module. */
export function ghostgetUpdateOptions(
  argv: readonly string[], depth: number | null,
  environment: NodeJS.ProcessEnv = process.env,
): CliUpdateOptions {
  assertGatewayCommandAllowed(argv, environment);
  const separator = argv.indexOf("--");
  const possibleHelp = (separator === -1 ? argv : argv.slice(0, separator)).some(argument => argument === "--help" || argument === "-h");
  const inspecting = ["status", "capabilities", "doctor", "commands", "control", "support"].includes(argv[0] ?? "")
    || (argv[0] === "operator" && argv[1] === "doctor")
    || (["plugin", "plugins"].includes(argv[0] ?? "") && ["list", "show"].includes(argv[1] ?? ""))
    || argv.includes("--cache-only") || argv.includes("--projection-identity-only");
  return {
    packageName: "@hraness/ghostget", version: GHOSTGET_VERSION, binName: "ghostget",
    entrypoint: fileURLToPath(new URL("./cli.ts", import.meta.url)), argv,
    provider: { kind: "github", repository: "hraness/ghostget", assetName: "hraness-ghostget-{version}.tgz" },
    nested: depth !== 0, suppressAutomatic: inspecting || possibleHelp || readWebPolicy(environment).gatewayOnly, effectFree: false,
    runtime: { env: environment },
  };
}

export async function startGhostgetUpdate(argv: readonly string[], depth: number | null): Promise<StartupResult> {
  try { return await runCliUpdate(ghostgetUpdateOptions(argv, depth)); }
  catch {
    process.stderr.write("GhostGet could not check its update policy, or its policy state is unavailable. Review ghostget status and ghostget web rules set.\n");
    return { handled: true, exitCode: 1, release: async () => {} };
  }
}

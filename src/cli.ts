#!/usr/bin/env bun

import { ghostgetUsage } from "./usage";
import { GHOSTGET_VERSION } from "./version";
import type {
  GhostgetCatalogCommand,
  GhostgetCatalogOutput,
} from "./catalog-cli";

type CliOutput = {
  readonly stdout: GhostgetCatalogOutput["stdout"];
  readonly stderr?: GhostgetCatalogOutput["stderr"];
};

type GhostgetProcessModule = {
  readonly runGhostgetProcess: (overrides?: {
    readonly rawArguments?: readonly string[];
    readonly output?: Required<CliOutput>;
  }) => Promise<void>;
};

type GhostgetCatalogModule = {
  readonly runGhostgetCatalogCommand: (
    command: GhostgetCatalogCommand,
    environment: Readonly<Record<string, string | undefined>>,
    output: GhostgetCatalogOutput,
  ) => Promise<number>;
};

type PublicKbCliModule = {
  readonly main: (
    rawArguments?: readonly string[],
    output?: Required<CliOutput>,
  ) => Promise<number>;
};

const defaultOutput: GhostgetCatalogOutput = {
  stdout: (value) => process.stdout.write(value),
  stderr: (value) => process.stderr.write(value),
};

const loadGhostgetProcess = (): Promise<GhostgetProcessModule> => import("./ghostget");
const loadGhostgetCatalog = (): Promise<GhostgetCatalogModule> => import("./catalog-cli");
const loadPublicKbCli = (): Promise<PublicKbCliModule> => import("@hraness/kb/cli");

const publicGhostgetCommands = new Set([
  "adapters",
  "agents",
  "backlinks",
  "check",
  "context",
  "graph",
  "index",
  "init",
  "links",
  "list",
  "notes",
  "pdf",
  "refresh",
  "search",
  "url-metadata",
]);

export function isPublicGhostgetCommand(rawArguments: readonly string[]): boolean {
  const command = rawArguments[0];
  return command !== undefined && publicGhostgetCommands.has(command);
}

export function isImmediateGhostgetHelpRequest(
  rawArguments: readonly string[],
): boolean {
  return rawArguments.length === 0
    || (
      rawArguments.length === 1
      && (
        rawArguments[0] === "help"
        || rawArguments[0] === "--help"
        || rawArguments[0] === "-h"
      )
    );
}

export function isImmediateGhostgetVersionRequest(
  rawArguments: readonly string[],
): boolean {
  return rawArguments.length === 1 && rawArguments[0] === "--version";
}

function hasOnlyOptionalJson(
  values: readonly string[],
): boolean {
  return values.length <= 1
    && (values.length === 0 || values[0] === "--json");
}

function isProviderPluginId(value: string): boolean {
  return value.length <= 63
    && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(value);
}

/**
 * Recognize only complete catalog command shapes. Malformed or broader plugin
 * commands retain the canonical parser and process boundary in ghostget.ts.
 */
export function routedGhostgetCatalogCommand(
  rawArguments: readonly string[],
): GhostgetCatalogCommand | null {
  const first = rawArguments[0];
  if (first === "capabilities") {
    const positional = rawArguments.slice(1).filter(
      (argument) => !argument.startsWith("--"),
    );
    const options = rawArguments.slice(1).filter(
      (argument) => argument.startsWith("--"),
    );
    if (positional.length > 1 || !hasOnlyOptionalJson(options)) return null;
    return {
      command: "capabilities",
      ...(positional[0] === undefined
        ? {}
        : { adapterId: positional[0] }),
      json: options.includes("--json"),
    };
  }
  if (first !== "plugin" && first !== "plugins") return null;
  const subcommand = rawArguments[1];
  if (
    subcommand === "list"
    && hasOnlyOptionalJson(rawArguments.slice(2))
  ) {
    return {
      command: "plugin-list",
      json: rawArguments.includes("--json"),
    };
  }
  const id = rawArguments[2];
  if (
    subcommand === "show"
    && id !== undefined
    && isProviderPluginId(id)
    && hasOnlyOptionalJson(rawArguments.slice(3))
  ) {
    return {
      command: "plugin-show",
      id,
      json: rawArguments.includes("--json"),
    };
  }
  return null;
}

/**
 * Render help, release identity, and catalog inspection without evaluating the
 * full command graph.
 *
 * Every other invocation delegates to the existing process boundary, which
 * retains its signal, exit-code, parsing, dependency, and error behavior.
 */
export async function runGhostgetCliProcess(
  rawArguments: readonly string[] = process.argv.slice(2),
  output: CliOutput = defaultOutput,
  loadProcess: () => Promise<GhostgetProcessModule> = loadGhostgetProcess,
  loadCatalog: () => Promise<GhostgetCatalogModule> = loadGhostgetCatalog,
  loadKnowledgeCli: () => Promise<PublicKbCliModule> = loadPublicKbCli,
): Promise<void> {
  if (isImmediateGhostgetHelpRequest(rawArguments)) {
    output.stdout(ghostgetUsage);
    process.exitCode = 0;
    return;
  }
  if (isImmediateGhostgetVersionRequest(rawArguments)) {
    output.stdout(`${GHOSTGET_VERSION}\n`);
    process.exitCode = 0;
    return;
  }
  const providerArguments = rawArguments[0] === "operator"
      && rawArguments[1] === "doctor"
    ? ["doctor", ...rawArguments.slice(2)]
    : rawArguments;
  const resolvedOutput: Required<CliOutput> = {
    stdout: output.stdout,
    stderr: output.stderr ?? defaultOutput.stderr,
  };
  if (isPublicGhostgetCommand(rawArguments)) {
    const knowledge = await loadKnowledgeCli();
    process.exitCode = await knowledge.main(rawArguments, resolvedOutput);
    return;
  }
  const catalogCommand = routedGhostgetCatalogCommand(providerArguments);
  if (catalogCommand !== null) {
    const catalog = await loadCatalog();
    process.exitCode = await catalog.runGhostgetCatalogCommand(
      catalogCommand,
      process.env,
      resolvedOutput,
    );
    return;
  }
  const runtime = await loadProcess();
  await runtime.runGhostgetProcess({
    rawArguments: providerArguments,
    output: resolvedOutput,
  });
}

if (import.meta.main) {
  await runGhostgetCliProcess();
}

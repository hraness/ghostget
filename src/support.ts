import {
  maybeShowSupportInvitation,
  runSupportCommand,
} from "@hraness/support-foundation/node";

const profile = {
  id: "wrench",
  name: "Ghostget",
  valueProposition: "Support ongoing development of precise web tools for agents.",
  updates: true,
} as const;

type SupportOutput = {
  readonly stdout: (text: string) => unknown;
  readonly stderr: (text: string) => unknown;
};

export async function runGhostgetSupportCommand(
  args: readonly string[],
  output: SupportOutput,
): Promise<number> {
  const result = await runSupportCommand(profile, args, { command: ["ghostget"] });
  if (result.stdout !== "") output.stdout(result.stdout);
  if (result.stderr !== "") output.stderr(result.stderr);
  return result.exitCode;
}

export async function showGhostgetSupportInvitation(): Promise<void> {
  await maybeShowSupportInvitation(profile, { usefulResult: true, command: ["ghostget"] });
}

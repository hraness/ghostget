import {
  maybeShowSupportInvitation,
  runSupportCommand,
  supportAdvancedHelp,
} from "@hraness/support-foundation/node";
import { ghostgetSupportProfile as profile } from "./support-profile";

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

/** The shared "Support for agents" block appended to `ghostget help advanced`. */
export function ghostgetSupportAdvancedHelp(): string {
  return supportAdvancedHelp({ command: ["ghostget"], env: process.env });
}

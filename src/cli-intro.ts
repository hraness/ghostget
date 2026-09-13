/** Compact ASCII identity for interactive root help; never command output. */
export function terminalIntro(terminal: Readonly<{ isTTY: boolean | undefined; columns: number | undefined; term: string | undefined }>): string {
  if (terminal.isTTY !== true || terminal.term === "dumb" || (terminal.columns ?? 80) < 48) return "";
  return "  .---.\n / o o \\   ghostget\n |     |   Get useful context for your agents.\n |/|/|/\n\n";
}

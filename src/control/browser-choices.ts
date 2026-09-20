import { discoverChromeProfileChoices } from "../browser-profiles";

/** One browser sign-in target the menu bar and TUI can offer. */
export type BrowserChoice = {
  /** Stable action-id fragment; never derived from unbounded text. */
  readonly key: string;
  readonly label: string;
  readonly browser: "chrome" | "safari";
  /** The Chromium profile directory, or null for the browser default. */
  readonly profile: string | null;
};

/** A control menu stays readable and bounded, however many profiles exist. */
export const MAX_BROWSER_CHOICES = 9;

/**
 * The deterministic fallback list. Discovery replaces it on a real machine;
 * it keeps rendering stable where no browser profile can be inspected.
 */
export const DEFAULT_BROWSER_CHOICES: readonly BrowserChoice[] = [
  { key: "safari", label: "Safari", browser: "safari", profile: null },
  { key: "chrome-default", label: "Chrome \u00b7 Default", browser: "chrome", profile: "Default" },
];

function profileKey(directory: string): string {
  return `chrome-${directory.toLowerCase().replaceAll(" ", "-")}`;
}

/**
 * Offer the Chrome profiles this machine actually has. The previous fixed list
 * named `Default`, `Profile 1` and `Profile 2`, so a machine whose only
 * profile is, for example, `Profile 9` could not sign in from the controls at
 * all, while absent profiles were still offered.
 */
export function browserChoices(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  platform: NodeJS.Platform = process.platform,
): readonly BrowserChoice[] {
  const discovered = discoverChromeProfileChoices(environment, platform);
  const chrome = (discovered.length > 0
    ? discovered
    : [{ directory: "Default", label: "Default" }]
  ).slice(0, MAX_BROWSER_CHOICES - 1).map((choice) => ({
    key: profileKey(choice.directory),
    label: `Chrome · ${choice.label}`,
    browser: "chrome" as const,
    profile: choice.directory,
  }));
  return [{ key: "safari", label: "Safari", browser: "safari" as const, profile: null }, ...chrome];
}

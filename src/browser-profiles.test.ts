import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  discoverBrowserProfiles,
  isChromiumProfileDirectory,
  isDisplayableProfileName,
  parseFirefoxProfileNames,
  MAX_DISCOVERED_PROFILES_PER_BROWSER,
} from "./browser-profiles";
import { browserProfilesJson, cookieSourceFlags, renderBrowserProfiles, shellQuote } from "./browser-profiles-cli";
import { browserChoices, DEFAULT_BROWSER_CHOICES, MAX_BROWSER_CHOICES } from "./control/browser-choices";

const homes: string[] = [];

function home(): string {
  const root = mkdtempSync("/tmp/ghostget-profiles-");
  chmodSync(root, 0o700);
  homes.push(root);
  return root;
}

function chromeProfile(root: string, directory: string, name: string | null, cookies = true): void {
  const userData = join(root, "Library", "Application Support", "Google", "Chrome");
  mkdirSync(join(userData, directory), { recursive: true });
  if (cookies) writeFileSync(join(userData, directory, "Cookies"), "");
  if (name === null) return;
  const statePath = join(userData, "Local State");
  let state: { profile: { info_cache: Record<string, { name: string }> } } = { profile: { info_cache: {} } };
  try {
    state = JSON.parse(readFileSync(statePath, "utf8")) as typeof state;
  } catch { /* first profile writes a new file */ }
  state.profile.info_cache[directory] = { name };
  writeFileSync(statePath, JSON.stringify(state));
}

function cleanup(): void {
  for (const root of homes.splice(0)) rmSync(root, { recursive: true, force: true });
}

describe("browser profile discovery", () => {
  test("reports the Chrome profiles that exist with the name the browser shows", () => {
    const root = home();
    chromeProfile(root, "Profile 9", "Your Chrome");
    const chrome = discoverBrowserProfiles({ HOME: root }).find((entry) => entry.source === "chrome");
    expect(chrome?.installed).toBe(true);
    expect(chrome?.profiles).toEqual([
      { source: "chrome", profile: "Your Chrome", directory: "Profile 9", cookies: true },
    ]);
    cleanup();
  });

  test("a profile without metadata keeps its directory name and a missing cookie store is reported", () => {
    const root = home();
    chromeProfile(root, "Default", null, false);
    const chrome = discoverBrowserProfiles({ HOME: root }).find((entry) => entry.source === "chrome");
    expect(chrome?.profiles).toEqual([
      { source: "chrome", profile: "Default", directory: "Default", cookies: false },
    ]);
    cleanup();
  });

  test("an application-support folder without profiles is not an installed browser", () => {
    const root = home();
    mkdirSync(join(root, "Library", "Application Support", "BraveSoftware", "Brave-Browser", "NativeMessagingHosts"), { recursive: true });
    const brave = discoverBrowserProfiles({ HOME: root }).find((entry) => entry.source === "brave");
    expect(brave).toEqual({ source: "brave", installed: false, profiles: [] });
    cleanup();
  });

  test("profiles are ordered Default first, then by profile number", () => {
    const root = home();
    chromeProfile(root, "Profile 10", "Ten");
    chromeProfile(root, "Profile 2", "Two");
    chromeProfile(root, "Default", "First");
    const chrome = discoverBrowserProfiles({ HOME: root }).find((entry) => entry.source === "chrome");
    expect(chrome?.profiles.map((profile) => profile.directory)).toEqual(["Default", "Profile 2", "Profile 10"]);
    cleanup();
  });

  test("a hostile profile name falls back to the directory name", () => {
    const root = home();
    chromeProfile(root, "Profile 1", "Work‮exe");
    const chrome = discoverBrowserProfiles({ HOME: root }).find((entry) => entry.source === "chrome");
    expect(chrome?.profiles[0]?.profile).toBe("Profile 1");
    cleanup();
  });

  test("an unreadable or absent home discovers nothing", () => {
    expect(discoverBrowserProfiles({ HOME: "/tmp/ghostget-absent-home-does-not-exist" })).toEqual([]);
    expect(discoverBrowserProfiles({ HOME: "" })).toEqual([]);
  });

  test("Arc profiles come from its nested user-data root", () => {
    const root = home();
    const arc = join(root, "Library", "Application Support", "Arc", "User Data");
    mkdirSync(join(arc, "Profile 1"), { recursive: true });
    writeFileSync(join(arc, "Profile 1", "Cookies"), "");
    writeFileSync(join(arc, "Local State"), JSON.stringify({ profile: { info_cache: { "Profile 1": { name: "Life" } } } }));
    const found = discoverBrowserProfiles({ HOME: root }).find((entry) => entry.source === "arc");
    expect(found?.profiles).toEqual([{ source: "arc", profile: "Life", directory: "Profile 1", cookies: true }]);
    cleanup();
  });

  test("Firefox profiles come from profiles.ini and reject escaping paths", () => {
    const root = home();
    const firefox = join(root, "Library", "Application Support", "Firefox");
    mkdirSync(join(firefox, "Profiles", "abc.default"), { recursive: true });
    writeFileSync(join(firefox, "Profiles", "abc.default", "cookies.sqlite"), "");
    writeFileSync(join(firefox, "profiles.ini"), [
      "[Profile0]", "Name=default", "IsRelative=1", "Path=Profiles/abc.default", "",
      "[Profile1]", "Name=escape", "IsRelative=1", "Path=../../../etc", "",
    ].join("\n"));
    const found = discoverBrowserProfiles({ HOME: root }).find((entry) => entry.source === "firefox");
    expect(found?.profiles).toEqual([{ source: "firefox", profile: "default", directory: null, cookies: true }]);
    cleanup();
  });

  test("discovery never returns more than its per-browser bound", () => {
    const root = home();
    for (let index = 1; index <= MAX_DISCOVERED_PROFILES_PER_BROWSER + 5; index += 1) {
      chromeProfile(root, `Profile ${index}`, `Name ${index}`);
    }
    const chrome = discoverBrowserProfiles({ HOME: root }).find((entry) => entry.source === "chrome");
    expect(chrome?.profiles.length).toBe(MAX_DISCOVERED_PROFILES_PER_BROWSER);
    cleanup();
  });
});

describe("profile name and directory validation", () => {
  test("only Chromium's own directory shapes are accepted", () => {
    expect(isChromiumProfileDirectory("Default")).toBe(true);
    expect(isChromiumProfileDirectory("Profile 9")).toBe(true);
    expect(isChromiumProfileDirectory("Profile 0")).toBe(false);
    expect(isChromiumProfileDirectory("../etc")).toBe(false);
    expect(isChromiumProfileDirectory("System Profile")).toBe(false);
  });

  test("a displayable name carries no control, bidi, or path characters", () => {
    expect(isDisplayableProfileName("Your Chrome")).toBe(true);
    expect(isDisplayableProfileName(" padded")).toBe(false);
    expect(isDisplayableProfileName("a/b")).toBe(false);
    expect(isDisplayableProfileName("tab\there")).toBe(false);
    expect(isDisplayableProfileName("rtl‮override")).toBe(false);
    expect(isDisplayableProfileName("")).toBe(false);
  });

  test("profiles.ini parsing keeps only complete profile sections", () => {
    expect(parseFirefoxProfileNames("[General]\nName=ignored\n\n[Profile0]\nName=a\nPath=p\n")).toEqual([
      { name: "a", path: "p", relative: true },
    ]);
    expect(parseFirefoxProfileNames("[Profile0]\nName=only-a-name\n")).toEqual([]);
  });
});

describe("browsers command output", () => {
  test("every listed profile carries the exact flags that select it", () => {
    const root = home();
    chromeProfile(root, "Profile 9", "Your Chrome");
    const discovery = discoverBrowserProfiles({ HOME: root });
    const json = browserProfilesJson(discovery) as { browsers: { source: string; profiles: { flags: string }[] }[] };
    const chrome = json.browsers.find((entry) => entry.source === "chrome");
    expect(chrome?.profiles[0]?.flags).toBe("--cookie-source chrome --cookie-profile 'Your Chrome'");
    cleanup();
  });

  test("a quote in a profile name stays one shell argument", () => {
    expect(shellQuote("Ben's Chrome")).toBe(`'Ben'\\''s Chrome'`);
    expect(cookieSourceFlags("safari", null)).toBe("--cookie-source safari");
  });

  test("the rendered list names the browsers that are absent", () => {
    const root = home();
    chromeProfile(root, "Default", "Personal");
    const text = renderBrowserProfiles(discoverBrowserProfiles({ HOME: root }));
    expect(text).toContain("--cookie-source chrome --cookie-profile 'Personal'");
    expect(text).toContain("Not installed:");
    expect(text).toContain("ghostget auth bind");
    cleanup();
  });

  test("a profile with no cookie store is listed without selectable flags", () => {
    const root = home();
    chromeProfile(root, "Default", "Fresh", false);
    const text = renderBrowserProfiles(discoverBrowserProfiles({ HOME: root }));
    expect(text).toContain("no cookie store yet");
    expect(text).not.toContain("--cookie-profile 'Fresh'");
    cleanup();
  });
});

describe("control browser choices", () => {
  test("controls offer the profiles this machine has, not a fixed list", () => {
    const root = home();
    chromeProfile(root, "Profile 9", "Your Chrome");
    expect(browserChoices({ HOME: root })).toEqual([
      { key: "safari", label: "Safari", browser: "safari", profile: null },
      { key: "chrome-profile-9", label: "Chrome · Your Chrome (Profile 9)", browser: "chrome", profile: "Profile 9" },
    ]);
    cleanup();
  });

  test("a machine with no discoverable Chrome profile still offers the browser default", () => {
    const root = home();
    expect(browserChoices({ HOME: root })).toEqual(DEFAULT_BROWSER_CHOICES);
    cleanup();
  });

  test("the offered list stays bounded and every key is unique", () => {
    const root = home();
    for (let index = 1; index <= 20; index += 1) chromeProfile(root, `Profile ${index}`, `Name ${index}`);
    const choices = browserChoices({ HOME: root });
    expect(choices.length).toBe(MAX_BROWSER_CHOICES);
    expect(new Set(choices.map((choice) => choice.key)).size).toBe(choices.length);
    cleanup();
  });

  test("every offered Chrome profile is a directory the connection validator accepts", () => {
    const root = home();
    chromeProfile(root, "Profile 9", "Your Chrome");
    chromeProfile(root, "Default", "Personal");
    for (const choice of browserChoices({ HOME: root })) {
      if (choice.browser !== "chrome" || choice.profile === null) continue;
      expect(/^(?:Default|Profile [1-9][0-9]{0,2})$/u.test(choice.profile)).toBe(true);
    }
    cleanup();
  });
});

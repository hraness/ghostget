import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createAuth, saveAuth } from "./auth";
import {
  adapterInstalledLines,
  authBoundLines,
  authListText,
  authSavedLines,
  describeAuthSource,
  writeAuthLines,
  type AuthSummary,
} from "./auth-output";
import { cliStyle } from "./cli-style";
import { main } from "./ghostget";

const plain = cliStyle({ LANG: "en_US.UTF-8" }, false);
const ascii = cliStyle({ TERM: "dumb" }, false);

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    output: { stdout: (value: string) => { out.push(value); }, stderr: (value: string) => { err.push(value); } },
    stdout: () => out.join(""),
    stderr: () => err.join(""),
  };
}

describe("auth output copy", () => {
  test("names the browser and profile, never the locator kind or a path", () => {
    expect(describeAuthSource({ kind: "cookie-source", id: "x-main", source: "chrome", profile: "Profile 1" })).toBe("Chrome · Profile 1");
    expect(describeAuthSource({ kind: "cookie-source", id: "x-main", source: "edge" })).toBe("Microsoft Edge");
    expect(describeAuthSource({ kind: "cookies-file", id: "file" })).toBe("Cookies file");
    expect(describeAuthSource({ kind: "browser-profile", id: "li", cookieSource: "arc" })).toBe("Dedicated browser profile · Arc cookies");
    expect(describeAuthSource({ kind: "oauth-token-file", id: "g", provider: "google" })).toBe("google (OAuth token)");
  });

  test("auth add for a Chromium browser warns about the keychain prompt", () => {
    expect(authSavedLines({ kind: "cookie-source", id: "x-main", source: "chrome", profile: "Profile 1" }, plain)).toEqual({
      result: "✓ Saved x-main (Chrome · Profile 1).",
      next: "ghostget auth bind x-main --site <site>",
      note: "macOS will ask to let security use \"Chrome Safe Storage\" from your keychain.",
    });
    expect(authSavedLines({ kind: "cookie-source", id: "s", source: "safari" }, ascii)).toEqual({
      result: "OK Saved s (Safari).",
      next: "ghostget auth bind s --site <site>",
      note: "Safari cookies need Full Disk Access for this terminal app.",
    });
    expect(authSavedLines({ kind: "cookie-source", id: "ff", source: "firefox" }, plain).note).toBeNull();
  });

  test("auth add for a linked device keeps its own next step", () => {
    expect(authSavedLines({ kind: "linked-device-store", id: "wa", provider: "whatsapp" }, plain, "ghostget auth pair wa")).toEqual({
      result: "✓ Saved wa (whatsapp (linked device)).",
      next: "ghostget auth pair wa",
      note: null,
    });
  });

  test("auth bind says which account it found", () => {
    expect(authBoundLines({ id: "x-main", site: "x", subject: "2244994945" }, plain)).toEqual({
      result: "✓ x-main is signed in to x as 2244994945.",
      next: "ghostget capabilities",
      note: null,
    });
  });

  test("auth list is aligned rows and a count", () => {
    const auths: AuthSummary[] = [
      { kind: "cookie-source", id: "x-main", source: "chrome", profile: "Profile 1", subject: "2244994945" },
      { kind: "cookie-source", id: "bsky", source: "arc" },
    ];
    expect(authListText(auths, plain)).toEqual({
      result: [
        "x-main  Chrome · Profile 1  ● 2244994945",
        "bsky    Arc                 ○ not checked yet",
        "",
        "2 saved sign-ins, 1 not checked yet.",
      ].join("\n"),
      next: "ghostget auth bind bsky --site <site>",
      note: null,
    });
    expect(authListText([], plain)).toEqual({
      result: "No saved sign-ins.",
      next: "ghostget auth add <id> --cookie-source chrome",
      note: null,
    });
    expect(authListText([auths[0]!], ascii).result).toBe("x-main  Chrome · Profile 1  * 2244994945\n\n1 saved sign-in.");
  });

  test("adapter install names the adapter, not the path", () => {
    expect(adapterInstalledLines("wrench", plain).result).toBe("✓ Installed the wrench adapter.");
  });

  test("hints go to stderr for people only", () => {
    const lines = authSavedLines({ kind: "cookie-source", id: "x-main", source: "chrome" }, plain);
    const human = capture();
    writeAuthLines(lines, "human", human.output);
    expect(human.stdout()).toBe("✓ Saved x-main (Chrome).\n");
    expect(human.stderr()).toBe("macOS will ask to let security use \"Chrome Safe Storage\" from your keychain.\nNext: ghostget auth bind x-main --site <site>\n");
    for (const audience of ["quiet", "agent"] as const) {
      const other = capture();
      writeAuthLines(lines, audience, other.output);
      expect(other.stdout()).toBe("✓ Saved x-main (Chrome).\n");
      expect(other.stderr()).toBe("");
    }
  });
});

describe("auth commands through main", () => {
  function withState<T>(body: (environment: Record<string, string>) => Promise<T>): Promise<T> {
    const directory = mkdtempSync(join(tmpdir(), "ghostget-auth-output-"));
    const environment = { HOME: directory, GHOSTGET_STATE_HOME: join(directory, "state"), LANG: "en_US.UTF-8" };
    return body(environment).finally(() => rmSync(directory, { recursive: true, force: true }));
  }

  test("auth add prints the saved line without the state path", async () => {
    await withState(async (environment) => {
      const result = capture();
      expect(await main(["auth", "add", "x-main", "--cookie-source", "chrome", "--cookie-profile", "Profile 1"], environment, result.output)).toBe(0);
      expect(result.stdout()).toBe("✓ Saved x-main (Chrome · Profile 1).\n");
      expect(result.stdout()).not.toContain(environment.HOME);
      expect(result.stderr()).toBe("");
      const human = capture();
      expect(await main(["auth", "add", "y-main", "--cookie-source", "arc"], { ...environment, HRANESS_AUDIENCE: "human" }, human.output)).toBe(0);
      expect(human.stderr()).toBe("macOS will ask to let security use \"Arc Safe Storage\" from your keychain.\nNext: ghostget auth bind y-main --site <site>\n");
    });
  }, 60_000);

  test("auth list is text by default, JSON for --json or an agent", async () => {
    await withState(async (environment) => {
      saveAuth(createAuth("x-main", { source: "chrome", profile: "Profile 1" }), environment);
      const text = capture();
      expect(await main(["auth", "list"], environment, text.output)).toBe(0);
      expect(text.stdout()).toBe("x-main  Chrome · Profile 1  ○ not checked yet\n\n1 saved sign-in, 1 not checked yet.\n");
      const json = capture();
      expect(await main(["auth", "list", "--json"], environment, json.output)).toBe(0);
      expect(JSON.parse(json.stdout())).toMatchObject({ ok: true, auth: [{ id: "x-main", kind: "cookie-source" }] });
      const agent = capture();
      expect(await main(["auth", "list"], { ...environment, CLAUDECODE: "1" }, agent.output)).toBe(0);
      expect(JSON.parse(agent.stdout())).toMatchObject([{ id: "x-main" }]);
    });
  }, 60_000);

  test("auth bind prints the account for people and JSON for agents", async () => {
    await withState(async (environment) => {
      saveAuth(createAuth("arc-main", { source: "arc" }), environment);
      const text = capture();
      expect(await main(["auth", "bind", "arc-main", "--site", "x"], environment, text.output, {
        probePluginSubject: () => Promise.resolve("2244994945"),
      })).toBe(0);
      expect(text.stdout()).toBe("✓ arc-main is signed in to x as 2244994945.\n");
      const agent = capture();
      expect(await main(["auth", "bind", "arc-main", "--site", "x"], { ...environment, AI_AGENT: "1" }, agent.output, {
        probePluginSubject: () => Promise.resolve("2244994945"),
      })).toBe(0);
      expect(JSON.parse(agent.stdout())).toMatchObject({ ok: true, id: "arc-main", site: "x", subject: "2244994945" });
    });
  }, 60_000);
});

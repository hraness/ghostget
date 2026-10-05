import { describe, expect, test } from "bun:test";
import { join } from "node:path";

describe("public Beeper client process boundary", () => {
  test("bundles SDK parsing without loading the provider command contract", async () => {
    const providerModules: string[] = [];
    const bundle = await Bun.build({
      entrypoints: [join(import.meta.dir, "beeper-client.ts")],
      target: "bun",
      plugins: [{
        name: "observe-beeper-sdk-provider-dependencies",
        setup(build) {
          build.onLoad({ filter: /[/\\]providers[/\\].*\.ts$/u }, ({ path }) => {
            providerModules.push(path);
            return undefined;
          });
        },
      }],
    });
    expect(bundle.success).toBe(true);
    expect(providerModules.map((path) => path.split(/[/\\]/u).at(-1))).toEqual([
      "beeper-cli-pin.ts",
    ]);
  });

  test("binds child auth and exact bounds back to the request", async () => {
    const child = Bun.spawn([
      process.execPath,
      join(import.meta.dir, "beeper-client-boundary.fixture.ts"),
    ], {
      cwd: import.meta.dir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await child.exited;
    const [stdout, stderr] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect({ exitCode, stdout, stderr }).toEqual({
      exitCode: 0,
      stdout: "",
      stderr: "",
    });
  });
});

import { expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { nativeVaultProofCommand } from "./vault-native-smoke";

test("native proof probes secure entry directly while real cancellation starts the outer GUI", () => {
  const gui = nativeVaultProofCommand("cancel-entry");
  expect(gui.executable.endsWith("/Ghostget.app/Contents/MacOS/ghostget-desktop")).toBe(true);
  expect(gui.args).toEqual([]);
  const app = dirname(dirname(dirname(gui.executable)));
  expect(nativeVaultProofCommand("direct-parent")).toEqual({
    executable: join(app, "Contents/Helpers/Ghostget Secure Entry.app/Contents/MacOS/ghostget-desktop"),
    args: ["--vault-stdio"],
  });
});

test("native proof preserves wrong-ancestor and interpreter-trampoline rejection chains", () => {
  const gui = nativeVaultProofCommand("cancel-entry");
  const app = dirname(dirname(dirname(gui.executable)));
  const script = fileURLToPath(new URL("./vault-native-smoke.ts", import.meta.url));
  expect(nativeVaultProofCommand("wrong-ancestor")).toEqual({
    executable: join(app, "Contents/Resources/ghostget-runtime/ghostget-credential-bun"),
    args: ["--no-env-file", "--no-install", script, "--credential-role", "wrong-ancestor"],
  });
  expect(nativeVaultProofCommand("bun-trampoline")).toEqual({
    executable: join(app, "Contents/Resources/ghostget-runtime/ghostget-bun"),
    args: ["--no-env-file", "--no-install", script, "--control-role", "bun-trampoline"],
  });
});

test("native proof rejects helper launch without its protocol and protocol launch on the outer GUI", () => {
  const gui = nativeVaultProofCommand("cancel-entry");
  const helper = nativeVaultProofCommand("direct-parent");
  expect(nativeVaultProofCommand("helper-no-flag")).toEqual({ executable: helper.executable, args: [] });
  expect(nativeVaultProofCommand("outer-vault-stdio")).toEqual({ executable: gui.executable, args: ["--vault-stdio"] });
});

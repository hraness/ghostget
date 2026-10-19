import assert from "node:assert/strict";
import * as childProcess from "node:child_process";
import { mock } from "bun:test";

// Stop at the real public client's child boundary: no CLI, provider, or user
// state is accessed by these calls, and mocks stay in this isolated process.
const stopped = new Error("fixture stopped before CLI execution");
let launches = 0;
function observeChild(
  _command: string,
  arguments_: readonly string[],
  options: { readonly env?: NodeJS.ProcessEnv },
): never {
  assert.ok(arguments_[0]?.endsWith("/cli.ts"));
  assert.equal(options.env?.GHOSTGET_CLI_DEPTH, "1");
  assert.equal(process.env.GHOSTGET_CLI_DEPTH, "0");
  launches += 1;
  throw stopped;
}

await mock.module("node:child_process", () => ({
  ...childProcess,
  spawn: observeChild as unknown as typeof childProcess.spawn,
  spawnSync: observeChild as unknown as typeof childProcess.spawnSync,
}));

const { readCachedCapability } = await import("./client");
const { readCachedOmniView } = await import("./omni-client");
const { exportApplePhotosContactEvidenceSync } = await import("./apple-photos-client");
const { exportBeeperContactInteractionsSync } = await import("./beeper-client");
const { exportWhatsAppMessageLikeMeSync } = await import("./whatsapp-client");
const { discoverMessagingRoutes } = await import("./messaging");
assert.equal(launches, 0, "importing SDK modules must not launch a CLI");

process.env.GHOSTGET_CLI_DEPTH = "0";
const clients: ReadonlyArray<(environment?: Readonly<Record<string, string | undefined>>) => unknown> = [
  (environment) => readCachedCapability({
    adapterId: "x", operationId: "messaging.list", authId: "x-fixture", input: {},
  }, environment === undefined ? {} : { environment }),
  (environment) => readCachedOmniView({
    schemaVersion: 1,
    sources: [{ adapterId: "reddit-web", operationId: "messaging.list", authId: "reddit-fixture" }],
  }, environment === undefined ? {} : { environment }),
  (environment) => exportApplePhotosContactEvidenceSync({}, environment === undefined ? {} : { environment }),
  (environment) => exportBeeperContactInteractionsSync({ authId: "beeper-fixture" }, environment === undefined ? {} : { environment }),
  (environment) => exportWhatsAppMessageLikeMeSync({
    authId: "whatsapp-fixture", output: "/private/tmp/ghostget-sdk-synthetic-output",
  }, environment === undefined ? {} : { environment }),
  (environment) => discoverMessagingRoutes({
    schemaVersion: 1,
    format: "wrench.messaging-routes-request",
    source: { adapterId: "imessage-direct", authId: "device-default", listInput: { limit: 1 } },
  }, environment === undefined ? undefined : { environment }),
];

for (const client of clients) {
  for (const environment of [undefined, {}, { GHOSTGET_CLI_DEPTH: undefined }, { GHOSTGET_CLI_DEPTH: "0" }, { GHOSTGET_CLI_DEPTH: "7" }]) {
    const before: number = launches;
    let failure: unknown;
    try { await client(environment); } catch (error) { failure = error; }
    assert.equal(failure, stopped, "the public client must reach the intercepted child boundary");
    assert.equal(launches, before + 1);
    assert.equal(process.env.GHOSTGET_CLI_DEPTH, "0", "SDK calls must preserve the parent environment");
  }
}
assert.equal(launches, 30);

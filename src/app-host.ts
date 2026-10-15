#!/usr/bin/env bun
import { AppHostService } from "./app-host-service";
import { admitAppHostState, appHostEnvironment } from "./app-host-state";
import { appHostFailure, serveAppHost } from "./app-host-transport";
import { commitControlOwner, inspectControlOwner } from "./control/owner";
import { ControlError } from "./control/validation";
import type { ControlEnvironment } from "./control/web-policy";

/** Explicit launch only. Importing this entrypoint starts nothing. */
export async function runAppHost(args: readonly string[], source: ControlEnvironment = process.env): Promise<void> {
  if (args.length !== 2 || args[0] !== "--app-id" || args[1] === undefined) throw new ControlError("INVALID_ARGUMENTS", "Launch ghostget-app-host with --app-id and a reverse-DNS app ID.");
  if (process.platform !== "darwin") throw new ControlError("PLATFORM_UNSUPPORTED", "This app host currently supports macOS only.");
  const appId = args[1];
  const environment = appHostEnvironment(appId, source);
  admitAppHostState(appId, environment);
  const release = commitControlOwner(environment, inspectControlOwner(environment));
  const controller = new AbortController();
  let outputOpen = true;
  const stop = (): void => { controller.abort(); };
  const outputClosed = (): void => { outputOpen = false; stop(); };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  // Pipe failures arrive as stream events, outside the write() call. The host
  // must cancel and drain work before releasing its state owner in this case.
  process.stdout.on("error", outputClosed);
  try {
    const service = new AppHostService(appId, environment);
    await serveAppHost(process.stdin, line => { if (outputOpen) process.stdout.write(line); }, service, controller.signal);
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    process.stdout.removeListener("error", outputClosed);
    release();
  }
}

if (import.meta.main) {
  try { await runAppHost(process.argv.slice(2)); }
  catch (error) {
    process.stdout.write(`${JSON.stringify(appHostFailure("startup", error))}\n`);
    process.exitCode = 1;
  }
}

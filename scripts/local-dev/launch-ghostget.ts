#!/usr/bin/env bun

import { isAbsolute } from "node:path";

const callerWorkingDirectory = process.env.GHOSTGET_LOCAL_DEV_CALLER_CWD;
if (
  callerWorkingDirectory === undefined
  || !isAbsolute(callerWorkingDirectory)
  || callerWorkingDirectory.includes("\0")
) {
  throw new Error("GHOSTGET_LOCAL_DEV_CALLER_CWD must be an absolute physical path");
}

process.chdir(callerWorkingDirectory);
const { runGhostgetCliProcess } = await import("../../src/cli");
await runGhostgetCliProcess(process.argv.slice(2));

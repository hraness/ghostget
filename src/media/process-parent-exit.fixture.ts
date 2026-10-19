// Parent process for process-parent-exit.test.ts. It starts one grouped tool
// whose shell leader keeps a `sleep` child, standing in for yt-dlp and its
// FFmpeg helper, and then ends the way the test selects.
import { existsSync, writeFileSync } from "node:fs";
import { runProcess } from "./process";

const [mode, pidFile, readyFile] = process.argv.slice(2);
if (mode === undefined || pidFile === undefined || readyFile === undefined) {
  throw new Error("usage: process-parent-exit.fixture.ts MODE PID_FILE READY_FILE");
}

if (mode === "owned-signal") {
  // Models the Ghostget process boundary: its once-listener owns the first
  // signal and starts a graceful cancellation. The fixture does not cancel,
  // so the group must still be running after the first signal.
  process.once("SIGINT", () => {
    writeFileSync(`${readyFile}.first-signal`, "handled\n");
  });
}

const pending = runProcess(
  ["/bin/sh", "-c", `sleep 60 & echo "$$ $!" > '${pidFile}'; wait`],
  { processGroup: true, timeoutMs: 120_000 },
);

const deadline = Date.now() + 10_000;
while (!existsSync(pidFile) && Date.now() < deadline) await Bun.sleep(10);
writeFileSync(readyFile, "ready\n");

if (mode === "exit") process.exit(7);
if (mode === "throw") throw new Error("fixture failed while a media tool was running");

await pending;

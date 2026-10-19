import { createRequire, syncBuiltinESMExports } from "node:module";

import { crashInjectingStatePort } from "./state-crash-port.test-support";

// Test-only Bun preload for the state and path helpers. Storage passes it with
// `--preload` only under NODE_ENV=test with a crash plan, so the shipped
// helpers keep their plain `node:fs` imports. It swaps each durable effect on
// the `node:fs` module for the crash port's before the helper loads, and
// `syncBuiltinESMExports` carries the swap into the helper's named imports.
const planPath = process.env.GHOSTGET_TEST_STATE_CRASH_PLAN;
if (process.env.NODE_ENV !== "test" || planPath === undefined || planPath === "") {
  throw new Error("the state crash preload runs only under a test crash plan");
}
const nodeFs = createRequire(import.meta.url)("node:fs") as typeof import("node:fs");
const port = crashInjectingStatePort({ ...nodeFs }, planPath);
Object.assign(nodeFs, port);
syncBuiltinESMExports();

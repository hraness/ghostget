/**
 * The Lean model as a test oracle for the differential tests in
 * `scripts/verification-lean-*.test.ts`.
 *
 * `bun run verify:lean` builds the Lean project, then runs those tests with
 * `GHOSTGET_LEAN_LAKE` set to the pinned `lake` and `GHOSTGET_LEAN_PROJECT` set
 * to the built project. The oracle starts one `lake env lean --run
 * Differential.lean` process and exchanges one line per query with it: the
 * test sends the encoded input and reads the model's answer. Without both
 * variables the tests fail instead of skipping, so a differential test never
 * passes without the Lean side.
 */
import { stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

export const LEAN_LAKE_VARIABLE = "GHOSTGET_LEAN_LAKE";
export const LEAN_PROJECT_VARIABLE = "GHOSTGET_LEAN_PROJECT";

/** A query that takes longer than this fails the test instead of hanging it. */
const QUERY_TIMEOUT_MS = 60_000;
const MAX_LINE_BYTES = 64 * 1024;

export type LeanOracle = Readonly<{
  /** Send one input line and return the runner's answer line. */
  query(line: string): Promise<string>;
  close(): Promise<void>;
}>;

/** The pinned `lake` and built project from the environment, or an error naming what is missing. */
export async function leanOracleLocation(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Promise<Readonly<{ lake: string; project: string }>> {
  const lake = environment[LEAN_LAKE_VARIABLE];
  const project = environment[LEAN_PROJECT_VARIABLE];
  if (lake === undefined || lake === "" || project === undefined || project === "") {
    throw new Error(
      `The Lean differential tests need ${LEAN_LAKE_VARIABLE} and ${LEAN_PROJECT_VARIABLE}; run them through bun run verify:lean`,
    );
  }
  if (!isAbsolute(lake) || !isAbsolute(project)) {
    throw new Error(`${LEAN_LAKE_VARIABLE} and ${LEAN_PROJECT_VARIABLE} must be absolute paths`);
  }
  if (!(await stat(lake)).isFile() || !(await stat(join(project, "Differential.lean"))).isFile()) {
    throw new Error("The Lean differential runner or its lake executable is missing");
  }
  return { lake, project };
}

/** Start the Lean differential runner. The caller must close it. */
export async function startLeanOracle(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Promise<LeanOracle> {
  const { lake, project } = await leanOracleLocation(environment);
  const child = Bun.spawn([lake, "env", "lean", "--run", "Differential.lean"], {
    cwd: project,
    env: { ...environment },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  const decoder = new TextDecoder();
  const reader = child.stdout.getReader();
  const stderr = new Response(child.stderr).text();
  let buffered = "";
  let pending = Promise.resolve();

  const readLine = async (): Promise<string> => {
    for (;;) {
      const newline = buffered.indexOf("\n");
      if (newline >= 0) {
        const line = buffered.slice(0, newline);
        buffered = buffered.slice(newline + 1);
        return line;
      }
      if (buffered.length > MAX_LINE_BYTES) throw new Error("The Lean runner answered with an oversized line");
      const chunk = await reader.read();
      if (chunk.done) {
        const detail = (await stderr).trim().slice(-2_000);
        throw new Error(`The Lean runner exited before answering${detail === "" ? "" : `:\n${detail}`}`);
      }
      buffered += decoder.decode(chunk.value, { stream: true });
    }
  };

  const ask = async (line: string): Promise<string> => {
    if (line.includes("\n")) throw new Error("A Lean oracle query must be one line");
    await child.stdin.write(`${line}\n`);
    await child.stdin.flush();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`The Lean runner did not answer within ${String(QUERY_TIMEOUT_MS)} ms`)), QUERY_TIMEOUT_MS);
    });
    try {
      const answer = await Promise.race([readLine(), deadline]);
      if (answer === "error") throw new Error(`The Lean runner could not parse the query: ${line}`);
      return answer;
    } finally {
      clearTimeout(timer);
    }
  };

  return Object.freeze({
    query(line: string): Promise<string> {
      // Serialize queries so each answer pairs with its own line.
      const answer = pending.then(() => ask(line));
      pending = answer.then(() => undefined, () => undefined);
      return answer;
    },
    async close(): Promise<void> {
      await child.stdin.end();
      const exitCode = await child.exited;
      const detail = (await stderr).trim();
      if (exitCode !== 0 || detail !== "") {
        throw new Error(`The Lean runner did not finish cleanly (exit ${String(exitCode)})${detail === "" ? "" : `:\n${detail.slice(-2_000)}`}`);
      }
    },
  });
}

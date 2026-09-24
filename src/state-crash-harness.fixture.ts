import * as fs from "node:fs";

import type { ProviderExecution } from "./provider";
import { readStateCrashPlan } from "./state-crash-port.test-support";

// One crash-injected operation in its own process. The helper that reaches
// the planned boundary kills this process with SIGKILL, so no `finally`
// block, exit handler, or later write runs: the durable state is exactly what
// a crash at that boundary leaves.

type Environment = Readonly<Record<string, string | undefined>>;

export type CrashHarnessRequest =
  | {
    readonly scenario: "confirm";
    readonly environment: Environment;
    readonly digest: string;
    readonly now: string;
    readonly outcome: "succeeded" | "indeterminate" | "failed";
    readonly effectsLog: string;
  }
  | {
    readonly scenario: "repair";
    readonly environment: Environment;
    readonly now: string;
  }
  | {
    readonly scenario: "reconcile";
    readonly environment: Environment;
    readonly runId: string;
    readonly now: string;
  }
  | {
    readonly scenario: "session-write";
    readonly environment: Environment;
    readonly authHash: string;
    readonly value: unknown;
    readonly compareAndSwap: boolean;
  }
  | {
    readonly scenario: "session-remove";
    readonly environment: Environment;
  }
  | {
    readonly scenario: "path-write";
    readonly path: string;
    readonly value: unknown;
    readonly expectedContentSha256: string | null;
    readonly createOnly: boolean;
  };

const planPath = process.env.GHOSTGET_TEST_STATE_CRASH_PLAN ?? "";
if (process.env.NODE_ENV !== "test" || planPath === "") {
  throw new Error("the crash harness fixture runs only under a test crash plan");
}

export const SESSION_NAMESPACE = "bluesky";
export const SESSION_AUTH_ID = "bluesky-crash";

function providerResult(
  outcome: "succeeded" | "indeterminate" | "failed",
): ProviderExecution {
  const started = outcome === "failed" ? 0 : 1;
  return {
    status: outcome,
    output: outcome === "failed" ? null : { observed: true },
    finalUrl: "https://example.com/crash-harness",
    dispatchStarted: started === 1,
    dispatch: {
      planned: 1,
      started,
      verified: outcome === "succeeded" ? 1 : 0,
    },
    ...(outcome === "succeeded" ? {} : { error: "synthetic crash-harness outcome" }),
  };
}

/**
 * The provider's ground truth: one appended and fsynced line per request
 * that crossed the durable dispatch boundary, naming the last state boundary
 * before it. The provider is outside the machine, so power loss keeps it.
 */
function recordCrossing(effectsLog: string): void {
  const seen = readStateCrashPlan(fs, planPath).seen;
  const descriptor = fs.openSync(effectsLog, "a", 0o600);
  try {
    fs.writeFileSync(descriptor, `crossed after boundary ${String(seen)}\n`);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

async function run(request: CrashHarnessRequest): Promise<unknown> {
  switch (request.scenario) {
    case "confirm": {
      const { confirmInvocation } = await import("./runtime");
      const outcome = request.outcome;
      const result = await confirmInvocation(request.digest, {
        headed: false,
        environment: request.environment,
        now: new Date(request.now),
        executeProvider: async (_manifest, _recipe, _input, _auth, options) => {
          const execution = providerResult(outcome);
          if (execution.dispatch.started === 1) {
            await options?.beforeDispatch?.({
              id: "posts-publish",
              index: 1,
              progress: { planned: 1, started: 0, verified: 0 },
            });
            recordCrossing(request.effectsLog);
            if (execution.dispatch.verified === 1) {
              await options?.afterDispatchVerified?.({
                id: "posts-publish",
                index: 1,
                progress: { planned: 1, started: 1, verified: 1 },
              });
            }
          }
          return execution;
        },
      });
      return { runId: result.receipt.runId, status: result.receipt.status, replayed: result.replayed };
    }
    case "repair": {
      const { repairInterruptedConfirmationClaims, repairInterruptedRunJournals } = await import("./runtime");
      const now = new Date(request.now);
      const claims = repairInterruptedConfirmationClaims(request.environment);
      const journals = repairInterruptedRunJournals(request.environment, now);
      return { claims, journals };
    }
    case "reconcile": {
      const { readRunReceipt, releaseReconciledRunRecovery } = await import("./runtime");
      const { canonicalJson, sha256 } = await import("./model");
      return releaseReconciledRunRecovery(
        request.runId,
        sha256(canonicalJson(readRunReceipt(request.runId, request.environment))),
        request.environment,
        new Date(request.now),
      );
    }
    case "session-write": {
      const { readSessionSecretSnapshot, writeSessionSecret, writeSessionSecretIfUnchanged } =
        await import("./session-secrets");
      if (!request.compareAndSwap) {
        writeSessionSecret(
          SESSION_NAMESPACE,
          SESSION_AUTH_ID,
          request.authHash,
          request.value,
          request.environment,
        );
        return { written: true };
      }
      const snapshot = readSessionSecretSnapshot(
        SESSION_NAMESPACE,
        SESSION_AUTH_ID,
        request.authHash,
        request.environment,
      );
      return writeSessionSecretIfUnchanged(
        SESSION_NAMESPACE,
        SESSION_AUTH_ID,
        request.authHash,
        request.value,
        snapshot.contentSha256,
        request.environment,
      );
    }
    case "session-remove": {
      const { removeSessionSecret } = await import("./session-secrets");
      return removeSessionSecret(SESSION_NAMESPACE, SESSION_AUTH_ID, request.environment);
    }
    case "path-write": {
      const { createPrivateJsonIfAbsent, writePrivateJson, writePrivateJsonIfUnchanged } =
        await import("./storage");
      if (request.createOnly) {
        return createPrivateJsonIfAbsent(request.path, request.value, { privateParent: true });
      }
      if (request.expectedContentSha256 === null) {
        writePrivateJson(request.path, request.value, { privateParent: true });
        return { written: true };
      }
      return writePrivateJsonIfUnchanged(request.path, request.value, {
        expectedCurrentContentSha256: request.expectedContentSha256,
        privateParent: true,
      });
    }
  }
}

const plan = readStateCrashPlan(fs, planPath);
plan.victim = process.pid;
fs.writeFileSync(planPath, `${JSON.stringify(plan)}\n`, { mode: 0o600 });

const request = JSON.parse(await Bun.stdin.text()) as CrashHarnessRequest;
try {
  const value = await run(request);
  process.stdout.write(`${JSON.stringify({ ok: true, value })}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({
    ok: false,
    message: error instanceof Error ? error.message : String(error),
  })}\n`);
}

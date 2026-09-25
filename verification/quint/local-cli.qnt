// One confirmed local-CLI mutation: the fixed sequence of child invocations
// that src/providers/imessage-direct-runtime.ts (executeImsgDirectOperation)
// and src/providers/beeper-local-runtime.ts (executeMutation) run for one
// dispatch. A sequence plans one or two children; Beeper's bounded
// `presence.set` plans two, typing then paused.
//
// Before each child starts, the runtime calls the kernel's dispatch boundary
// (`beforeDispatch`). A refusal there, or any failure before it, is a
// categorical failure before that child: the run is `failed` when no child was
// verified and `partial` when an exact verified prefix exists. Once the
// boundary returns, the child counts as started. From then on every failure is
// post-dispatch uncertainty: a deadline timeout, a signal, a nonzero exit, a
// malformed or lost response, a child that reports it did not start, or a
// failure while recording the acceptance. The run ends `indeterminate`
// and no child is started again. Only an exact acceptance verifies the child.
//
// `spawns` is a ghost count of child starts per child index.
//
// The mutants are the two ways the law has failed in similar code:
// - stepRetryTimeout starts the same child again after a deadline timeout;
// - stepTrustNotStarted believes a child that reports it did not start and
//   ends the run as a categorical failure that would permit a retry.
//
// Not modelled: the preflight reads that precede the sequence (they start no
// mutation child), the kernel's durable journal behind `beforeDispatch`
// (fence.qnt models it), and reconciliation from separately obtained evidence.
module localCli {
  pure val CHILDREN: Set[int] = Set(1, 2)
  pure val FAULTS: Set[str] = Set(
    "timeout",
    "signal",
    "exit",
    "malformed",
    "lost",
    "not-started",
    "record",
  )
  pure val TERMINAL: Set[str] = Set("succeeded", "failed", "partial", "indeterminate")

  var planned: int
  // "running" or a terminal status of `LocalCliExecution`.
  var runState: str
  var started: int
  var verified: int
  // The failure that ended the run: "gate", a fault in FAULTS, or "".
  var failure: str
  // Ghost: how many times each child started.
  var spawns: int -> int

  action init = {
    nondet n = CHILDREN.oneOf()
    all {
      planned' = n,
      runState' = "running",
      started' = 0,
      verified' = 0,
      failure' = "",
      spawns' = CHILDREN.mapBy(_ => 0),
    }
  }

  // The next child passes the dispatch boundary and starts.
  action spawn: bool = all {
    runState == "running",
    started == verified,
    started < planned,
    started' = started + 1,
    spawns' = spawns.setBy(started + 1, s => s + 1),
    planned' = planned,
    runState' = runState,
    verified' = verified,
    failure' = failure,
  }

  // The dispatch boundary refuses, or preparation fails, before the next child.
  action gate: bool = all {
    runState == "running",
    started == verified,
    started < planned,
    runState' = if (verified > 0) "partial" else "failed",
    failure' = "gate",
    planned' = planned,
    started' = started,
    verified' = verified,
    spawns' = spawns,
  }

  // The started child returns an exact acceptance.
  action accept: bool = all {
    runState == "running",
    started > verified,
    verified' = started,
    runState' = if (started == planned) "succeeded" else "running",
    planned' = planned,
    started' = started,
    failure' = failure,
    spawns' = spawns,
  }

  // Any failure after the child started.
  action fault(kind: str): bool = all {
    runState == "running",
    started > verified,
    runState' = "indeterminate",
    failure' = kind,
    planned' = planned,
    started' = started,
    verified' = verified,
    spawns' = spawns,
  }

  action done: bool = all {
    runState != "running",
    planned' = planned,
    runState' = runState,
    started' = started,
    verified' = verified,
    failure' = failure,
    spawns' = spawns,
  }

  // Seeded defect: a deadline timeout starts the same child again.
  action retryTimeout: bool = all {
    runState == "running",
    started > verified,
    spawns' = spawns.setBy(started, s => s + 1),
    failure' = "timeout",
    planned' = planned,
    runState' = runState,
    started' = started,
    verified' = verified,
  }

  // Seeded defect: a child's own "not started" report ends the run as a
  // categorical failure.
  action trustNotStarted: bool = all {
    runState == "running",
    started > verified,
    runState' = if (verified > 0) "partial" else "failed",
    failure' = "not-started",
    planned' = planned,
    started' = started,
    verified' = verified,
    spawns' = spawns,
  }

  action step = {
    nondet kind = FAULTS.oneOf()
    any { spawn, gate, accept, fault(kind), done }
  }

  action stepRetryTimeout = {
    nondet kind = FAULTS.oneOf()
    any { spawn, gate, accept, fault(kind), done, retryTimeout }
  }

  action stepTrustNotStarted = {
    nondet kind = FAULTS.oneOf()
    any { spawn, gate, accept, fault(kind), done, trustNotStarted }
  }

  // A run that ends with a started but unverified child is indeterminate; a
  // categorical failure or an exact partial result has no such child.
  val postSpawnIndeterminate: bool = and {
    0 <= verified,
    verified <= started,
    started <= planned,
    (runState != "running" and started > verified) implies runState == "indeterminate",
    runState == "failed" implies started == 0,
    runState == "partial" implies (started == verified and 0 < verified and verified < planned),
    runState == "succeeded" implies verified == planned,
    runState == "indeterminate" implies started > verified,
    TERMINAL.contains(runState) or runState == "running",
  }

  // Every started child started exactly once, and no child past the started
  // prefix started at all.
  val noRespawn: bool = CHILDREN.forall(i => spawns.get(i) == (if (i <= started) 1 else 0))
}

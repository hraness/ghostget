// Composite messaging run lifecycle: one run sends N ordered parts through
// the durable journal that `transitionMessagingRun` in
// src/messaging-action-store.ts maintains. Only the part at the proven prefix
// boundary may move; a part crosses dispatch at most once; recovery after a
// crash terminalizes the run without dispatching again.
module messaging {
  pure val N: int = 3
  pure val PARTS: Set[int] = 0.to(N - 1)
  pure val IDS: Set[str] = Set("m1", "m2", "m3")
  pure val STOP_STATES: Set[str] = Set("failed-before-dispatch", "failed-permanent")
  pure val STOP_REASONS: Set[str] = Set(
    "context-drift",
    "prefix-freshness-unproven",
    "provider-failed-before-dispatch",
    "journal-recovery-required",
  )
  pure val INDETERMINATE_REASONS: Set[str] = Set("provider-result-indeterminate", "journal-recovery-required")
  pure val ACTIVE: Set[str] = Set("claimed", "dispatching", "indeterminate")
  pure val CROSSED: Set[str] = Set("dispatching", "accepted", "indeterminate")

  // "pending", "submitted", "failed", "partial", or "indeterminate".
  var runState: str
  var parts: int -> str
  // The accepted provider message ID of each part, or "".
  var messageIds: int -> str
  var proven: int
  var observed: int
  // The index of a part that may have reached the provider, or -1.
  var possible: int
  // The terminal reason, or "".
  var reason: str
  // Whether the run retains a private provider outcome.
  var outcome: bool
  // Ghost: how many times each part entered dispatching.
  var dispatches: int -> int

  action init = all {
    runState' = "pending",
    parts' = PARTS.mapBy(_ => "unattempted"),
    messageIds' = PARTS.mapBy(_ => ""),
    proven' = 0,
    observed' = 0,
    possible' = -1,
    reason' = "",
    outcome' = false,
    dispatches' = PARTS.mapBy(_ => 0),
  }

  val active: str = if (proven < N) parts.get(proven) else "none"

  action keepTerminal = all {
    possible' = possible,
    reason' = reason,
    outcome' = outcome,
  }

  action claim(obs: int): bool = all {
    runState == "pending",
    active == "unattempted",
    observed <= obs,
    obs <= proven,
    parts' = parts.set(proven, "claimed"),
    observed' = obs,
    runState' = runState,
    messageIds' = messageIds,
    proven' = proven,
    dispatches' = dispatches,
    keepTerminal,
  }

  action dispatch: bool = all {
    runState == "pending",
    active == "claimed",
    parts' = parts.set(proven, "dispatching"),
    dispatches' = dispatches.setBy(proven, d => d + 1),
    runState' = runState,
    messageIds' = messageIds,
    proven' = proven,
    observed' = observed,
    keepTerminal,
  }

  action accept(id: str): bool = all {
    runState == "pending",
    active == "dispatching",
    PARTS.forall(i => messageIds.get(i) != id),
    parts' = parts.set(proven, "accepted"),
    messageIds' = messageIds.set(proven, id),
    proven' = proven + 1,
    runState' = if (proven + 1 == N) "submitted" else "pending",
    observed' = observed,
    dispatches' = dispatches,
    keepTerminal,
  }

  // A categorical stop is legal only before the part crosses dispatch.
  action stop(partState: str, stopReason: str): bool = all {
    runState == "pending",
    active == "unattempted" or active == "claimed",
    parts' = parts.set(proven, partState),
    runState' = if (proven == 0) "failed" else "partial",
    reason' = stopReason,
    possible' = possible,
    outcome' = outcome,
    messageIds' = messageIds,
    proven' = proven,
    observed' = observed,
    dispatches' = dispatches,
  }

  // A private provider outcome is retained only after the part crossed dispatch.
  action indeterminate(indReason: str, withOutcome: bool): bool = all {
    runState == "pending",
    active == "claimed" or active == "dispatching",
    not(indReason == "provider-result-indeterminate" and withOutcome) or active == "dispatching",
    parts' = parts.set(proven, "indeterminate"),
    runState' = "indeterminate",
    possible' = proven,
    reason' = indReason,
    outcome' = (indReason == "provider-result-indeterminate" and withOutcome),
    messageIds' = messageIds,
    proven' = proven,
    observed' = observed,
    dispatches' = dispatches,
  }

  // Crash recovery reads the journal and terminalizes the run. A part that
  // crossed dispatch may have reached the provider, so it becomes
  // indeterminate.
  action recoverDispatching: bool = all {
    runState == "pending",
    active == "dispatching",
    parts' = parts.set(proven, "indeterminate"),
    runState' = "indeterminate",
    possible' = proven,
    reason' = "journal-recovery-required",
    outcome' = false,
    messageIds' = messageIds,
    proven' = proven,
    observed' = observed,
    dispatches' = dispatches,
  }

  // A part that never crossed dispatch stops categorically at recovery.
  action recoverBeforeDispatch: bool = all {
    runState == "pending",
    active == "unattempted" or active == "claimed",
    parts' = parts.set(proven, if (proven == 0) "failed-before-dispatch" else "failed-permanent"),
    runState' = if (proven == 0) "failed" else "partial",
    reason' = "journal-recovery-required",
    possible' = possible,
    outcome' = outcome,
    messageIds' = messageIds,
    proven' = proven,
    observed' = observed,
    dispatches' = dispatches,
  }

  // A terminal run stays terminal; recovery has nothing left to do.
  action done: bool = all {
    runState != "pending",
    runState' = runState,
    parts' = parts,
    messageIds' = messageIds,
    proven' = proven,
    observed' = observed,
    dispatches' = dispatches,
    keepTerminal,
  }

  // Seeded defect: dispatch again a part that already crossed dispatch.
  action redispatch: bool = all {
    proven < N,
    active == "dispatching" or active == "indeterminate",
    dispatches.get(proven) >= 1,
    parts' = parts.set(proven, "dispatching"),
    dispatches' = dispatches.setBy(proven, d => d + 1),
    runState' = "pending",
    possible' = -1,
    reason' = "",
    outcome' = false,
    messageIds' = messageIds,
    proven' = proven,
    observed' = observed,
  }

  // Seeded defect: claim the part after the active one.
  action claimAhead: bool = all {
    runState == "pending",
    proven + 1 < N,
    parts.get(proven + 1) == "unattempted",
    parts' = parts.set(proven + 1, "claimed"),
    runState' = runState,
    messageIds' = messageIds,
    proven' = proven,
    observed' = observed,
    dispatches' = dispatches,
    keepTerminal,
  }

  action progress(obs: int, id: str): bool = any {
    claim(obs),
    dispatch,
    accept(id),
  }

  // Faults are enabled on one roll in four. The roll only biases seeded
  // simulation toward longer runs; every fault stays reachable at every step.
  action faults(faultRoll: int, partState: str, stopReason: str, indReason: str, withOutcome: bool): bool = all {
    faultRoll == 0,
    any {
      stop(partState, stopReason),
      indeterminate(indReason, withOutcome),
      recoverDispatching,
      recoverBeforeDispatch,
    },
  }

  action step = {
    nondet obs = 0.to(N).filter(o => observed <= o and o <= proven).oneOf()
    nondet id = IDS.oneOf()
    nondet partState = STOP_STATES.oneOf()
    nondet stopReason = STOP_REASONS.oneOf()
    nondet indReason = INDETERMINATE_REASONS.oneOf()
    nondet withOutcome = Bool.oneOf()
    nondet faultRoll = 0.to(3).oneOf()
    any {
      progress(obs, id),
      faults(faultRoll, partState, stopReason, indReason, withOutcome),
      done,
    }
  }

  action stepRedispatch = {
    nondet obs = 0.to(N).filter(o => observed <= o and o <= proven).oneOf()
    nondet id = IDS.oneOf()
    nondet partState = STOP_STATES.oneOf()
    nondet stopReason = STOP_REASONS.oneOf()
    nondet indReason = INDETERMINATE_REASONS.oneOf()
    nondet withOutcome = Bool.oneOf()
    nondet faultRoll = 0.to(3).oneOf()
    any {
      progress(obs, id),
      faults(faultRoll, partState, stopReason, indReason, withOutcome),
      done,
      redispatch,
    }
  }

  action stepSkip = {
    nondet obs = 0.to(N).filter(o => observed <= o and o <= proven).oneOf()
    nondet id = IDS.oneOf()
    nondet partState = STOP_STATES.oneOf()
    nondet stopReason = STOP_REASONS.oneOf()
    nondet indReason = INDETERMINATE_REASONS.oneOf()
    nondet withOutcome = Bool.oneOf()
    nondet faultRoll = 0.to(3).oneOf()
    any {
      progress(obs, id),
      faults(faultRoll, partState, stopReason, indReason, withOutcome),
      done,
      claimAhead,
    }
  }

  // Accepted parts form a prefix of distinct provider messages, and every
  // part after the active one is untouched.
  val orderedPrefix: bool = and {
    0 <= observed,
    observed <= proven,
    proven <= N,
    PARTS.forall(i => (i < proven) iff (parts.get(i) == "accepted")),
    PARTS.forall(i => (parts.get(i) == "accepted") iff (messageIds.get(i) != "")),
    PARTS.forall(i => PARTS.forall(j => i == j or messageIds.get(i) == "" or messageIds.get(i) != messageIds.get(j))),
    PARTS.forall(i => i <= proven or parts.get(i) == "unattempted"),
  }

  // At most one part is claimed, dispatching, or indeterminate.
  val singleActive: bool = PARTS.filter(i => ACTIVE.contains(parts.get(i))).size() <= 1

  // No part enters dispatching twice, and a part that crossed dispatch never
  // becomes a categorical failure that would permit a retry.
  val noRedispatch: bool = PARTS.forall(i => and {
    dispatches.get(i) <= 1,
    dispatches.get(i) == 1 implies CROSSED.contains(parts.get(i)),
    Set("dispatching", "accepted").contains(parts.get(i)) implies dispatches.get(i) == 1,
  })
}

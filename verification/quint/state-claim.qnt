// The state helper's three-phase mutation claim (src/state-helper.ts:
// acquireStateMutationClaim, listLiveStateMutationClaims, and
// decideStateMutationClaimStage).
//
// Two helper processes claim one target. Each publishes a `waiting` claim
// and lists the target's claims. It gives up when another claim is past
// `waiting` or has a smaller claim ID; otherwise it renames its claim to
// `candidate` and lists again. It then gives up when another claim is `held`
// or has a smaller claim ID; otherwise it renames its claim to `held` and
// lists a third time. A second `held` claim in that last listing is an
// arbitration failure: the helper releases its claim and throws. The claim ID
// is a random UUID, so the fixed order a < b stands for both orders.
//
// A listing is not atomic. `readdir` may or may not return an entry that was
// created, renamed, or removed after the listing began, and a claim read
// early can be renamed before the listing ends. So a listing reports, for
// the other process, either nothing or one of the phases its claim had since
// the listing began; after a change it may also report nothing. `observed`
// holds those reports per listing process. An atomic snapshot is one of
// these reports, so the model covers both.
//
// A listing that reports a claim whose owner is dead removes it and lists
// again. The removal is itself a change that the other listing may or may
// not see.
//
// Only the last listing keeps two processes out of the critical section: the
// second process to rename its claim to `held` lists while the first one's
// claim holds still, so it reports that claim. The two earlier listings keep
// a loser from reaching `held` when the listings are atomic. When they are
// not, both claims can reach `held`, and the later one fails closed with
// "state mutation arbitration admitted two owners".
//
// The mutants remove one of those listings or checks, and kill no process so
// that their random traces reach the race more often:
// - stepNoHeldListing enters the critical section on the `candidate`
//   listing, without listing again after the rename to `held`;
// - stepNoHeldCheck lists after the rename to `held` but ignores another
//   `held` claim.
//
// Two processes suffice for mutual exclusion, a property of pairs: a third
// live process can only make another one give up, and a third dead one only
// makes a listing remove its claim and start again. Three processes put
// Apalache's length-8 check, the shortest that reaches stepNoHeldCheck's
// violation, outside the CI budget.
//
// Not modelled: an owner whose liveness cannot be inspected (the helper
// throws), the eight-listing retry bound, the stage file before a claim is
// published, and a claim ID that repeats.
module stateClaim {
  pure val ACTORS: Set[str] = Set("a", "b")
  pure val RANK: str -> int = Map("a" -> 0, "b" -> 1)
  pure val MAX_KILLS: int = 1
  pure val LISTING: Set[str] = Set("list-waiting", "list-candidate", "list-held")
  pure val EXITED: Set[str] = Set("exited-ok", "exited-busy", "exited-failed", "killed")

  // Each process's position, or how it ended.
  var pc: str -> str
  // The phase of each process's claim file, or "absent".
  var phase: str -> str
  // For each listing process, what its listing may report for each other
  // process. A process's own entry is always {"self"}.
  var observed: str -> (str -> Set[str])
  // What the last action decided.
  var result: str
  var kills: int

  action init = all {
    pc' = ACTORS.mapBy(a => "start"),
    phase' = ACTORS.mapBy(a => "absent"),
    observed' = ACTORS.mapBy(a => ACTORS.mapBy(x => if (x == a) Set("self") else Set("absent"))),
    result' = "none",
    kills' = 0,
  }

  def alive(a: str): bool = not(EXITED.contains(pc.get(a)))

  // A new listing by `a` starts from the current phases.
  def fresh(a: str, phases: str -> str): str -> Set[str] =
    ACTORS.mapBy(x => if (x == a) Set("self") else Set(phases.get(x)))

  // Record changed phases for the listings of every other process, and restart
  // `a`'s own listing when `restart` holds.
  def observe(a: str, phases: str -> str, restart: bool): str -> (str -> Set[str]) =
    ACTORS.mapBy(y =>
      if (y == a) (if (restart) fresh(a, phases) else observed.get(a))
      else ACTORS.mapBy(x =>
        if (x == y) Set("self")
        else if (phases.get(x) == phase.get(x)) observed.get(y).get(x)
        // A rename removes one name and adds another, and the listing may
        // return neither.
        else observed.get(y).get(x).union(Set(phases.get(x), "absent"))))

  action move(a: str, nextPc: str, phases: str -> str, restart: bool, outcome: str): bool = all {
    pc' = pc.set(a, nextPc),
    phase' = phases,
    observed' = observe(a, phases, restart),
    result' = outcome,
    kills' = kills,
  }

  // Publish the `waiting` claim and begin the first listing.
  action publish(a: str): bool = all {
    pc.get(a) == "start",
    move(a, "list-waiting", phase.set(a, "waiting"), true, "published"),
  }

  // The stage decision on a listing that holds only live claims.
  def busyAt(stage: str, a: str, seen: str -> str, visible: Set[str]): bool =
    if (stage == "list-waiting")
      visible.exists(x => seen.get(x) != "waiting" or RANK.get(x) < RANK.get(a))
    else if (stage == "list-candidate")
      visible.exists(x => seen.get(x) == "held" or RANK.get(x) < RANK.get(a))
    else
      visible.exists(x => seen.get(x) == "held")

  // End a listing. `seen` is what it reported for each process.
  action list(a: str, seen: str -> str, listHeld: bool, checkHeld: bool): bool = {
    val stage = pc.get(a)
    val visible = ACTORS.exclude(Set(a)).filter(x => seen.get(x) != "absent")
    val dead = visible.filter(x => pc.get(x) == "killed")
    val reap = dead != Set()
    val enter = stage == "list-held" and not(checkHeld and busyAt(stage, a, seen, visible))
    val busy = not(enter) and busyAt(stage, a, seen, visible)
    val skipHeld = stage == "list-candidate" and not(listHeld)
    val nextPc =
      if (reap) stage
      else if (enter or (skipHeld and not(busy))) "critical"
      else if (busy and stage == "list-held") "exited-failed"
      else if (busy) "exited-busy"
      else if (stage == "list-waiting") "list-candidate"
      else "list-held"
    val nextPhase =
      if (busy) "absent"
      else if (stage == "list-waiting") "candidate"
      else "held"
    all {
      LISTING.contains(stage),
      ACTORS.forall(x => observed.get(a).get(x).contains(seen.get(x))),
      move(
        a,
        nextPc,
        // Reaping removes every dead claim it reported.
        if (reap) ACTORS.mapBy(x => if (dead.contains(x)) "absent" else phase.get(x)) else phase.set(a, nextPhase),
        reap or nextPc == "list-candidate" or nextPc == "list-held",
        if (reap) "reaped" else if (busy and stage == "list-held") "two-owners" else if (busy) "busy" else "proceed",
      ),
    }
  }

  // Leave the critical section and remove the claim.
  action release(a: str): bool = all {
    pc.get(a) == "critical",
    move(a, "exited-ok", phase.set(a, "absent"), false, "released"),
  }

  // SIGKILL. The process's claim stays.
  action kill(a: str, limit: int): bool = all {
    alive(a),
    kills < limit,
    pc' = pc.set(a, "killed"),
    phase' = phase,
    observed' = observed,
    result' = "killed",
    kills' = kills + 1,
  }

  action stepWith(listHeld: bool, checkHeld: bool, killLimit: int): bool = {
    nondet a = ACTORS.oneOf()
    nondet seeA = observed.get(a).get("a").oneOf()
    nondet seeB = observed.get(a).get("b").oneOf()
    any {
      publish(a),
      list(a, Map("a" -> seeA, "b" -> seeB), listHeld, checkHeld),
      release(a),
      kill(a, killLimit),
    }
  }

  action step = stepWith(true, true, MAX_KILLS)

  // The same protocol without a kill. A kill ends most random traces before
  // the rarer races, so the replay also draws traces from this step, and so
  // do the mutants.
  action stepNoKill = stepWith(true, true, 0)

  action stepNoHeldListing = stepWith(false, true, 0)

  action stepNoHeldCheck = stepWith(true, false, 0)

  // At most one process is inside the critical section.
  val mutualExclusion: bool =
    ACTORS.filter(a => pc.get(a) == "critical").size() <= 1

  // A process inside the critical section has a `held` claim.
  val criticalHoldsClaim: bool =
    ACTORS.forall(a => pc.get(a) == "critical" implies phase.get(a) == "held")

  val claimSafety: bool = mutualExclusion and criticalHoldsClaim
}

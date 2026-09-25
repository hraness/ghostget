// The confirmed-write intent fence (src/runtime.ts, src/run-journal.ts,
// src/confirmed-write-program.ts, src/portable-run-recovery.ts).
//
// Three runs confirm one write intent: one adapter ID, auth locator,
// operation, and input. A reconnect changes the auth record's bytes and a
// manifest upgrade changes the adapter's bytes; neither changes the intent.
// A run starts its journal and scans the other journals for a fence, claims
// the intent ledger with one exclusive create, crosses its dispatch
// boundary, and finishes. The scan and the claim are separate steps, as
// they are in acquireIntentLedger, so another run can scan or claim in
// between.
//
// A dispatched run finishes succeeded, indeterminate with the provider
// effect applied, or indeterminate with the effect lost: the provider's
// ground truth is a nondeterministic oracle. A crash during dispatch repairs
// to the same indeterminate journal, so it is not a separate action.
// Reconciliation needs the run's own auth record and manifest revision
// (assertRunStillBound). Applied evidence settles the run and keeps its
// ledger. A caller's not-applied claim is recorded and releases nothing.
//
// An owner who accepts the duplicate risk of an indeterminate run may start
// one duplicate-risk successor of it (resolveInvocationDuplicateRisk). The
// successor is its own intent, narrowed to that source run, so successors of
// one source fence each other and not the source. The source must be a
// terminal, unsettled, indeterminate dispatch that still binds the current
// auth record and manifest and has elected no successor. The successor
// elects its source permanently just before its own dispatch boundary
// (claimDuplicateRiskSource), and a source that elected a successor keeps its
// recovery material (releaseReconciledRunRecovery), so it is never
// reconciled. A successor can itself become the source of a later successor.
//
// Each run confirms under one of two auth locators and records the provider
// subject its auth record named, or none. The locator is the account realm:
// runs of one locator share one intent ledger. Two locators that record the
// same subject name one provider account, so an unsettled run of that
// subject also fences the other locator (journalFencesSubject). Each locator
// claims its own intent ledger, so the fence is a scan before the claim and
// a recheck after the claim is on record, just before the dispatch boundary
// (recheckConfirmedWriteSubjectFence). A run of either locator with no
// subject keeps the per-locator fence. Subjects can be typed by the
// operator, so matching subjects over-approximate one account: the fence
// may refuse more, never less.
//
// Pre-fix variants:
// - D1 (stepHashKeyed): the fence and the ledger key include the auth and
//   adapter hashes, so a reconnect or an upgrade opens a fresh fence.
// - D2 (stepCallerRelease): a caller's not-applied claim releases the
//   ledger, so the same intent dispatches again.
// Seeded successor defects:
// - stepUnelected: a successor dispatches without electing its source, so
//   one accepted risk can cover any number of duplicates.
// - stepElectInFlight: a successor may name a source that is still in
//   flight, so a run that later succeeds is duplicated.
// - stepSubjectBlind: the fence ignores the recorded subject, as it did
//   before journals recorded one, so one account connected under two
//   locators dispatches the same intent twice.
//
// Not modelled: a fulfilled run of the same subject under another locator
// (it does not fence, by design), one auth generation per locator (one
// counter serves both), the dedupe window's expiry, the hash-keyed ledger that is
// claimed after the intent ledger, a successor whose election fails at its
// dispatch boundary (the model disables that dispatch; production fails the
// run before any request), partial multi-dispatch runs, and journals from
// before the intent fence.
module fence {
  pure val RUNS: Set[str] = Set("r1", "r2", "r3")
  pure val OUTCOMES: Set[str] = Set("succeeded", "applied", "lost")
  pure val MAX_GENERATION: int = 1
  pure val LOCATORS: Set[str] = Set("a", "b")
  // "" is a run whose auth record named no provider subject.
  pure val SUBJECTS: Set[str] = Set("", "s")

  // Each run's journal: phase "none" means no journal exists yet.
  var phase: str -> str
  var status: str -> str
  var ledgerState: str -> str
  // The auth generation and manifest revision each run was bound to.
  var runAuth: str -> int
  var runRev: str -> int
  // The auth locator each run confirmed under, and the provider subject its
  // journal recorded: "" for none (or for a run without a journal).
  var runLoc: str -> str
  var runSubj: str -> str
  // The duplicate-risk source each run names: "" for the base intent.
  var source: str -> str
  // The successor each run elected as a source: "" for none.
  var elected: str -> str
  var authGen: int
  var rev: int
  // Runs that scanned without finding a fence and may now claim.
  var scanned: Set[str]
  // Intent ledger files: (auth key, revision key, locator, source key,
  // holder run).
  var ledger: Set[(int, int, str, str, str)]
  // Runs that crossed their dispatch boundary, and the provider's truth.
  var dispatched: Set[str]
  var applied: Set[str]
  var reconciled: Set[str]
  var claimed: Set[str]
  // What the last action reported.
  var result: str

  action init = all {
    phase' = RUNS.mapBy(r => "none"),
    status' = RUNS.mapBy(r => "none"),
    ledgerState' = RUNS.mapBy(r => "none"),
    runAuth' = RUNS.mapBy(r => 0),
    runRev' = RUNS.mapBy(r => 0),
    runLoc' = RUNS.mapBy(r => ""),
    runSubj' = RUNS.mapBy(r => ""),
    source' = RUNS.mapBy(r => ""),
    elected' = RUNS.mapBy(r => ""),
    authGen' = 0,
    rev' = 0,
    scanned' = Set(),
    ledger' = Set(),
    dispatched' = Set(),
    applied' = Set(),
    reconciled' = Set(),
    claimed' = Set(),
    result' = "none",
  }

  // Whether journal `s` is the same intent as run `r`, which confirms under
  // locator `l`, names source `src`, and is bound to auth generation `a` and
  // revision `v`. The fixed fence compares IDs and the successor source only;
  // the D1 variant also compares the hashed bytes.
  def sameIntent(s: str, r: str, src: str, l: str, a: int, v: int, hashKeyed: bool): bool =
    s != r and source.get(s) == src and runLoc.get(s) == l
      and (not(hashKeyed) or (runAuth.get(s) == a and runRev.get(s) == v))

  def unsettledLedger(s: str): bool =
    ledgerState.get(s) == "pending" or ledgerState.get(s) == "indeterminate"

  // journalFencesSubject: journal `s` is an unsettled run of the same source
  // under another locator that recorded subject `j`, the subject of run `r`.
  // The stepSubjectBlind variant never matches.
  def subjectFences(s: str, r: str, src: str, l: str, j: str, subjectBlind: bool): bool =
    not(subjectBlind) and s != r and j != "" and runSubj.get(s) == j and runLoc.get(s) != l
      and source.get(s) == src and unsettledLedger(s)

  // journalFencesIntent and journalFencesSubject: "unsettled", "fulfilled",
  // or "none".
  def fenceOf(s: str, r: str, src: str, l: str, j: str, a: int, v: int, hashKeyed: bool, subjectBlind: bool): str =
    if (subjectFences(s, r, src, l, j, subjectBlind)) "unsettled"
    else if (not(sameIntent(s, r, src, l, a, v, hashKeyed))) "none"
    else if (unsettledLedger(s)) "unsettled"
    else if (ledgerState.get(s) == "succeeded") "fulfilled"
    else "none"

  // A fulfilled prior run replays only under the same auth record.
  def fulfilledResult(s: str, a: int): str =
    if (runAuth.get(s) == a) "replayed" else "withheld"

  def ledgerKey(r: str, hashKeyed: bool): (int, int, str, str) =
    if (hashKeyed) (runAuth.get(r), runRev.get(r), runLoc.get(r), source.get(r))
    else (0, 0, runLoc.get(r), source.get(r))

  def bound(r: str): bool = runAuth.get(r) == authGen and runRev.get(r) == rev

  // Whether run `s` may be the source of a new duplicate-risk successor. The
  // fixed check wants a terminal, unsettled indeterminate dispatch; the
  // stepElectInFlight variant accepts any dispatched run.
  def electable(s: str, inFlight: bool): bool = all {
    if (inFlight) dispatched.contains(s)
    else phase.get(s) == "terminal" and status.get(s) == "indeterminate" and ledgerState.get(s) == "indeterminate",
    not(reconciled.contains(s)),
    elected.get(s) == "",
    bound(s),
  }

  // A refused confirm finishes its own run failed before any dispatch. A
  // run refused at its scan is bound here; a run refused at its claim keeps
  // the binding it took at its scan.
  // A run refused at its subject recheck already holds its intent ledger,
  // which the release removes.
  action refuse(r: str, src: str, l: str, j: str, reported: str): bool = all {
    phase' = phase.set(r, "terminal"),
    status' = status.set(r, "failed"),
    ledgerState' = ledgerState.set(r, "released"),
    runAuth' = if (phase.get(r) == "none") runAuth.set(r, authGen) else runAuth,
    runRev' = if (phase.get(r) == "none") runRev.set(r, rev) else runRev,
    runLoc' = if (phase.get(r) == "none") runLoc.set(r, l) else runLoc,
    runSubj' = if (phase.get(r) == "none") runSubj.set(r, j) else runSubj,
    source' = if (phase.get(r) == "none") source.set(r, src) else source,
    elected' = elected,
    authGen' = authGen,
    rev' = rev,
    scanned' = scanned.exclude(Set(r)),
    ledger' = ledger.filter(e => e._5 != r),
    dispatched' = dispatched,
    applied' = applied,
    reconciled' = reconciled,
    claimed' = claimed,
    result' = reported,
  }

  // A confirm starts its run journal under locator `l` with subject `j`,
  // bound to the current auth record and manifest revision and naming its
  // successor source `src` ("" for none), and scans the other journals for a
  // fence.
  action scanFor(r: str, src: str, l: str, j: str, hashKeyed: bool, subjectBlind: bool): bool = {
    val fulfilledBy = RUNS.filter(s => fenceOf(s, r, src, l, j, authGen, rev, hashKeyed, subjectBlind) == "fulfilled")
    all {
      phase.get(r) == "none",
      if (RUNS.exists(s => fenceOf(s, r, src, l, j, authGen, rev, hashKeyed, subjectBlind) == "unsettled"))
        refuse(r, src, l, j, "refused")
      else if (fulfilledBy != Set())
        refuse(r, src, l, j, if (fulfilledBy.exists(s => fulfilledResult(s, authGen) == "replayed")) "replayed" else "withheld")
      else all {
        phase' = phase.set(r, "prepared"),
        status' = status.set(r, "pending"),
        ledgerState' = ledgerState.set(r, "unclaimed"),
        runAuth' = runAuth.set(r, authGen),
        runRev' = runRev.set(r, rev),
        runLoc' = runLoc.set(r, l),
        runSubj' = runSubj.set(r, j),
        source' = source.set(r, src),
        elected' = elected,
        authGen' = authGen,
        rev' = rev,
        scanned' = scanned.union(Set(r)),
        ledger' = ledger,
        dispatched' = dispatched,
        applied' = applied,
        reconciled' = reconciled,
        claimed' = claimed,
        result' = "clear",
      },
    }
  }

  action scan(r: str, l: str, j: str, hashKeyed: bool, subjectBlind: bool): bool =
    scanFor(r, "", l, j, hashKeyed, subjectBlind)

  // A confirm of a duplicate-risk successor of `s`. Preview and confirmation
  // both refuse unless `s` is electable, so no journal starts otherwise. The
  // source binds the current auth record, so the successor runs under its
  // locator and subject.
  action scanSuccessor(r: str, s: str, hashKeyed: bool, inFlight: bool, subjectBlind: bool): bool = all {
    s != r,
    electable(s, inFlight),
    scanFor(r, s, runLoc.get(s), runSubj.get(s), hashKeyed, subjectBlind),
  }

  action claim(r: str, hashKeyed: bool): bool = {
    val key = ledgerKey(r, hashKeyed)
    val holders = ledger.filter(e => (e._1, e._2, e._3, e._4) == key).map(e => e._5)
    all {
      phase.get(r) == "prepared",
      scanned.contains(r),
      if (holders != Set())
        refuse(r, source.get(r), runLoc.get(r), runSubj.get(r),
          if (holders.exists(s => ledgerState.get(s) == "succeeded"))
            if (holders.exists(s => fulfilledResult(s, runAuth.get(r)) == "replayed")) "replayed" else "withheld"
          else "refused")
      else all {
        phase' = phase.set(r, "claimed"),
        status' = status,
        ledgerState' = ledgerState.set(r, "pending"),
        runAuth' = runAuth,
        runRev' = runRev,
        runLoc' = runLoc,
        runSubj' = runSubj,
        source' = source,
        elected' = elected,
        authGen' = authGen,
        rev' = rev,
        scanned' = scanned.exclude(Set(r)),
        ledger' = ledger.union(Set((key._1, key._2, key._3, key._4, r))),
        dispatched' = dispatched,
        applied' = applied,
        reconciled' = reconciled,
        claimed' = claimed,
        result' = "claimed",
      },
    }
  }

  // The run crosses its dispatch boundary; a successor elects its source.
  action crossBoundary(r: str, src: str, elects: bool): bool = all {
    phase' = phase.set(r, "dispatching"),
    status' = status,
    ledgerState' = ledgerState,
    runAuth' = runAuth,
    runRev' = runRev,
    runLoc' = runLoc,
    runSubj' = runSubj,
    source' = source,
    elected' = if (src != "" and elects) elected.set(src, r) else elected,
    authGen' = authGen,
    rev' = rev,
    scanned' = scanned,
    ledger' = ledger,
    dispatched' = dispatched.union(Set(r)),
    applied' = applied,
    reconciled' = reconciled,
    claimed' = claimed,
    result' = if (src == "") "dispatched" else "elected",
  }

  // A claimed run rechecks the subject fence, then crosses its dispatch
  // boundary. A successor first elects its source, which must still be
  // unsettled and unelected; the stepUnelected variant skips the election.
  action dispatch(r: str, elects: bool, subjectBlind: bool): bool = {
    val src = source.get(r)
    all {
      phase.get(r) == "claimed",
      src == "" or (not(reconciled.contains(src)) and elected.get(src) == ""),
      if (RUNS.exists(s => subjectFences(s, r, src, runLoc.get(r), runSubj.get(r), subjectBlind)))
        refuse(r, src, runLoc.get(r), runSubj.get(r), "subject-refused")
      else crossBoundary(r, src, elects),
    }
  }

  action finish(r: str, outcome: str): bool = {
    val final = if (outcome == "succeeded") "succeeded" else "indeterminate"
    all {
      phase.get(r) == "dispatching",
      phase' = phase.set(r, "terminal"),
      status' = status.set(r, final),
      ledgerState' = ledgerState.set(r, final),
      runAuth' = runAuth,
      runRev' = runRev,
      runLoc' = runLoc,
      runSubj' = runSubj,
      source' = source,
      elected' = elected,
      authGen' = authGen,
      rev' = rev,
      scanned' = scanned,
      ledger' = ledger,
      dispatched' = dispatched,
      applied' = if (outcome == "lost") applied else applied.union(Set(r)),
      // A settled elected successor supersedes its source: the source's
      // recovery material releases and its outcome is durably known. An
      // unelected successor's settle supersedes nothing.
      reconciled' = if (outcome == "succeeded" and source.get(r) != "" and elected.get(source.get(r)) == r) reconciled.union(Set(source.get(r))) else reconciled,
      claimed' = claimed,
      result' = outcome,
    }
  }

  action rotate(nextAuth: int, nextRev: int, reported: str): bool = all {
    phase' = phase,
    status' = status,
    ledgerState' = ledgerState,
    runAuth' = runAuth,
    runRev' = runRev,
    runLoc' = runLoc,
    runSubj' = runSubj,
    source' = source,
    elected' = elected,
    authGen' = nextAuth,
    rev' = nextRev,
    scanned' = scanned,
    ledger' = ledger,
    dispatched' = dispatched,
    applied' = applied,
    reconciled' = reconciled,
    claimed' = claimed,
    result' = reported,
  }

  // A forced reconnect writes a new auth record for the same locator.
  action reconnect: bool = all {
    authGen < MAX_GENERATION,
    rotate(authGen + 1, rev, "reconnected"),
  }

  // A manifest revision installs new adapter bytes for the same adapter ID.
  action upgrade: bool = all {
    rev < MAX_GENERATION,
    rotate(authGen, rev + 1, "upgraded"),
  }

  def unsettled(r: str): bool =
    phase.get(r) == "terminal" and status.get(r) == "indeterminate" and not(reconciled.contains(r)) and bound(r)

  // Applied evidence settles the run and keeps its ledger. A source that
  // elected a successor keeps its recovery material instead.
  action reconcile(r: str): bool = all {
    unsettled(r),
    elected.get(r) == "",
    phase' = phase,
    status' = status,
    ledgerState' = ledgerState,
    runAuth' = runAuth,
    runRev' = runRev,
    runLoc' = runLoc,
    runSubj' = runSubj,
    source' = source,
    elected' = elected,
    authGen' = authGen,
    rev' = rev,
    scanned' = scanned,
    ledger' = ledger,
    dispatched' = dispatched,
    applied' = applied,
    // Settling an elected successor supersedes its source the same way a
    // succeeded finish does; an unelected successor's settle does not.
    reconciled' = if (source.get(r) != "" and elected.get(source.get(r)) == r)
      reconciled.union(Set(r)).union(Set(source.get(r)))
    else
      reconciled.union(Set(r)),
    claimed' = claimed,
    result' = "settled",
  }

  // A caller asserts that the write never applied. Ghostget cannot observe
  // that, so the fixed reconciler records the claim and releases nothing.
  // The D2 variant released the ledger on the caller's word.
  action claimNotApplied(r: str, callerRelease: bool): bool = all {
    unsettled(r),
    not(claimed.contains(r)),
    phase' = phase,
    status' = status,
    ledgerState' = if (callerRelease) ledgerState.set(r, "released") else ledgerState,
    runAuth' = runAuth,
    runRev' = runRev,
    runLoc' = runLoc,
    runSubj' = runSubj,
    source' = source,
    elected' = elected,
    authGen' = authGen,
    rev' = rev,
    scanned' = scanned,
    ledger' = if (callerRelease) ledger.filter(e => e._5 != r) else ledger,
    dispatched' = dispatched,
    applied' = applied,
    reconciled' = if (callerRelease) reconciled.union(Set(r)) else reconciled,
    claimed' = claimed.union(Set(r)),
    result' = if (callerRelease) "released" else "fence-retained",
  }

  action stepWith(hashKeyed: bool, callerRelease: bool, elects: bool, inFlight: bool, subjectBlind: bool): bool = {
    nondet r = RUNS.oneOf()
    nondet o = OUTCOMES.oneOf()
    nondet s = RUNS.oneOf()
    nondet l = LOCATORS.oneOf()
    nondet j = SUBJECTS.oneOf()
    any {
      scan(r, l, j, hashKeyed, subjectBlind),
      scanSuccessor(r, s, hashKeyed, inFlight, subjectBlind),
      claim(r, hashKeyed),
      dispatch(r, elects, subjectBlind),
      finish(r, o),
      reconnect,
      upgrade,
      reconcile(r),
      claimNotApplied(r, callerRelease),
    }
  }

  action step = stepWith(false, false, true, false, false)

  // D1: the fence is keyed by the auth and adapter bytes.
  action stepHashKeyed = stepWith(true, false, true, false, false)

  // D2: a caller's not-applied claim releases the ledger.
  action stepCallerRelease = stepWith(false, true, true, false, false)

  // A successor dispatches without electing its source.
  action stepUnelected = stepWith(false, false, false, false, false)

  // A successor may name a source that is still in flight.
  action stepElectInFlight = stepWith(false, false, true, true, false)

  // The fence ignores the recorded subject, so one account under two
  // locators is two intents.
  action stepSubjectBlind = stepWith(false, false, true, false, true)

  // A restriction of step for replay coverage: every transition it takes is
  // a step transition, but only r1 starts as a base intent and nobody
  // reconnects or upgrades, so the other runs mostly race as duplicate-risk
  // successors and meet each other's fence.
  action stepSuccessors = {
    nondet r = RUNS.oneOf()
    nondet o = OUTCOMES.oneOf()
    nondet s = RUNS.oneOf()
    nondet l = LOCATORS.oneOf()
    nondet j = SUBJECTS.oneOf()
    any {
      all { r == "r1", scan(r, l, j, false, false) },
      scanSuccessor(r, s, false, false, false),
      claim(r, false),
      dispatch(r, true, false),
      finish(r, o),
      reconcile(r),
    }
  }

  // A restriction of step for replay coverage: every transition it takes is
  // a step transition, but every base intent records the one subject and
  // nobody elects a successor, reconnects, or upgrades, so runs under the two
  // locators race through the subject fence and its recheck.
  action stepSubjects = {
    nondet r = RUNS.oneOf()
    nondet o = OUTCOMES.oneOf()
    nondet s = RUNS.oneOf()
    nondet l = LOCATORS.oneOf()
    nondet j = Set("s").oneOf()
    any {
      scan(r, l, j, false, false),
      claim(r, false),
      dispatch(r, true, false),
      finish(r, o),
      reconcile(r),
    }
  }

  // The plan's bound, |effects(intent)| <= 1 + |duplicateSuccessors(intent)|,
  // for each locator's intent: at most one dispatch beyond the elected
  // successors, and the provider applies only what was dispatched. A
  // successor runs under its source's locator.
  val successorBound: bool = and {
    LOCATORS.forall(l =>
      dispatched.filter(r => runLoc.get(r) == l).size()
        <= 1 + RUNS.filter(s => elected.get(s) != "" and runLoc.get(s) == l).size()),
    applied.subseteq(dispatched),
  }

  // No intent is dispatched twice under one locator. A retry of a run is
  // another dispatch of its intent, so an indeterminate run is never
  // retried; a later dispatch is only a successor, which is a different
  // intent.
  val noRetry: bool =
    Set("").union(RUNS).forall(k => LOCATORS.forall(l =>
      dispatched.filter(r => source.get(r) == k and runLoc.get(r) == l).size() <= 1))

  // One recorded subject under two locators never has two dispatches of one
  // intent unless one of them succeeded: a run dispatches only when no run of
  // the same subject under another locator is in flight or unsettled.
  val subjectExclusive: bool =
    dispatched.forall(r => dispatched.forall(q =>
      r == q or source.get(r) != source.get(q) or runLoc.get(r) == runLoc.get(q)
        or runSubj.get(r) == "" or runSubj.get(r) != runSubj.get(q)
        or status.get(r) == "succeeded" or status.get(q) == "succeeded"))

  // Only an indeterminate run elects a successor: a duplicate is risked only
  // when the first outcome is unknown.
  val electedFromIndeterminate: bool =
    RUNS.forall(s => elected.get(s) != "" implies status.get(s) == "indeterminate")

  // An indeterminate run keeps its ledger. Only applied reconciliation
  // settles it, and that keeps the ledger too.
  val indeterminateStaysFenced: bool =
    RUNS.forall(r => status.get(r) == "indeterminate" implies ledgerState.get(r) == "indeterminate")

  // All five, checked as one invariant so that Apalache runs once per step.
  val fenceSafety: bool = and {
    successorBound,
    noRetry,
    electedFromIndeterminate,
    indeterminateStaysFenced,
    subjectExclusive,
  }
}

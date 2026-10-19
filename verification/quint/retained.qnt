// How an unsettled portable write leaves the intent fence and its plugin
// bundle (src/portable-run-recovery.ts, src/runtime.ts, src/run-journal.ts,
// src/provider-plugin-lifecycle-kernel.ts).
//
// One portable posts.publish intent has a source run, at most one elected
// duplicate-risk successor of it, and a later retry of the base intent. The
// source dispatches once and finishes succeeded, indeterminate with its
// effect applied, or indeterminate with its effect lost: the provider's
// ground truth is a nondeterministic oracle.
//
// Two decisions release retained state:
// - Observed readback (reconcilePortableProviderPluginRunFromReadback). Only
//   when the plugin declared a readback does Ghostget invoke it. An observed
//   `applied` settles the source and keeps its ledger; an observed
//   `not-applied` releases the recovery material and the ledger
//   (observedNotAppliedRelease); `unknown` changes nothing. A source that
//   elected a successor never reads back.
// - Supersession (duplicateSourceSupersession). Once the elected successor
//   settles after its dispatch, the source's recovery material is released
//   and its indeterminate ledger stays.
//
// The retry is fenced by the source's ledger (journalFencesIntent). The
// bundle may be removed only when no run still holds recovery material or
// is in flight (inspectPortableProviderPluginQuiescence).
//
// Seeded defects:
// - stepUntruthfulReadback: a readback reports not-applied whatever the
//   provider did, as a caller-typed hash would, so the ledger opens after an
//   applied effect.
// - stepSupersedeReleasesLedger: supersession releases the source's ledger
//   too, so the base intent dispatches again beside the successor.
//
// Not modelled: auth rotation and manifest upgrades (fence.qnt), chains of
// successors, successor readback, and assets.
module retained {
  pure val OUTCOMES: Set[str] = Set("succeeded", "applied", "lost")
  pure val OBSERVATIONS: Set[str] = Set("truth", "unknown")

  // Whether the installed plugin's write declares a readback.
  var declared: bool
  var srcPhase: str
  var srcStatus: str
  var srcLedger: str
  var srcRecovery: str
  var srcApplied: bool
  // The recorded readback observation: "none", "applied", or "not-applied".
  var observed: str
  var elected: bool
  var superseded: bool
  var succPhase: str
  var succStatus: str
  var succRecovery: str
  var succApplied: bool
  var retried: bool
  var retryApplied: bool
  var removed: bool
  var result: str

  action init = {
    nondet d = Set(true, false).oneOf()
    all {
      declared' = d,
      srcPhase' = "none",
      srcStatus' = "none",
      srcLedger' = "none",
      srcRecovery' = "none",
      srcApplied' = false,
      observed' = "none",
      elected' = false,
      superseded' = false,
      succPhase' = "none",
      succStatus' = "none",
      succRecovery' = "none",
      succApplied' = false,
      retried' = false,
      retryApplied' = false,
      removed' = false,
      result' = "none",
    }
  }

  action keepSuccessor: bool = all {
    succPhase' = succPhase,
    succStatus' = succStatus,
    succRecovery' = succRecovery,
    succApplied' = succApplied,
  }

  action keepRetry: bool = all {
    retried' = retried,
    retryApplied' = retryApplied,
  }

  action dispatchSource: bool = all {
    srcPhase == "none",
    not(removed),
    declared' = declared,
    srcPhase' = "dispatching",
    srcStatus' = "pending",
    srcLedger' = "pending",
    srcRecovery' = "present",
    srcApplied' = srcApplied,
    observed' = observed,
    elected' = elected,
    superseded' = superseded,
    keepSuccessor,
    keepRetry,
    removed' = removed,
    result' = "dispatched",
  }

  action finishSource(o: str): bool = {
    val final = if (o == "succeeded") "succeeded" else "indeterminate"
    all {
      srcPhase == "dispatching",
      declared' = declared,
      srcPhase' = "terminal",
      srcStatus' = final,
      srcLedger' = final,
      srcRecovery' = if (o == "succeeded") "released" else "retained",
      srcApplied' = o != "lost",
      observed' = observed,
      elected' = elected,
      superseded' = superseded,
      keepSuccessor,
      keepRetry,
      removed' = removed,
      result' = o,
    }
  }

  // Ghostget invokes the declared readback of an unsettled, unelected
  // source. The fixed readback reports the provider's truth or unknown; the
  // untruthful variant may report not-applied after an applied effect.
  action readback(obs: str, untruthful: bool): bool = {
    val notApplied = obs == "truth" and (untruthful or not(srcApplied))
    val applied = obs == "truth" and not(notApplied)
    all {
      declared,
      not(removed),
      srcStatus == "indeterminate",
      srcRecovery == "retained",
      not(elected),
      observed == "none",
      declared' = declared,
      srcPhase' = srcPhase,
      srcStatus' = srcStatus,
      srcLedger' = if (notApplied) "released" else srcLedger,
      srcRecovery' = if (obs == "truth") "released" else srcRecovery,
      srcApplied' = srcApplied,
      observed' = if (notApplied) "not-applied" else if (applied) "applied" else observed,
      elected' = elected,
      superseded' = superseded,
      keepSuccessor,
      keepRetry,
      removed' = removed,
      result' = if (notApplied) "released" else if (applied) "settled" else "fence-retained",
    }
  }

  // An owner who accepts the duplicate risk starts one successor, which
  // elects the source permanently at its dispatch boundary.
  action electSuccessor: bool = all {
    not(removed),
    srcStatus == "indeterminate",
    srcRecovery == "retained",
    not(elected),
    declared' = declared,
    srcPhase' = srcPhase,
    srcStatus' = srcStatus,
    srcLedger' = srcLedger,
    srcRecovery' = srcRecovery,
    srcApplied' = srcApplied,
    observed' = observed,
    elected' = true,
    superseded' = superseded,
    succPhase' = "dispatching",
    succStatus' = "pending",
    succRecovery' = "present",
    succApplied' = succApplied,
    keepRetry,
    removed' = removed,
    result' = "elected",
  }

  action finishSuccessor(o: str): bool = all {
    succPhase == "dispatching",
    declared' = declared,
    srcPhase' = srcPhase,
    srcStatus' = srcStatus,
    srcLedger' = srcLedger,
    srcRecovery' = srcRecovery,
    srcApplied' = srcApplied,
    observed' = observed,
    elected' = elected,
    superseded' = superseded,
    succPhase' = "terminal",
    succStatus' = if (o == "succeeded") "succeeded" else "indeterminate",
    succRecovery' = if (o == "succeeded") "released" else "retained",
    succApplied' = o != "lost",
    keepRetry,
    removed' = removed,
    result' = o,
  }

  // Applied evidence settles an indeterminate successor.
  action reconcileSuccessor: bool = all {
    not(removed),
    succStatus == "indeterminate",
    succRecovery == "retained",
    succApplied,
    declared' = declared,
    srcPhase' = srcPhase,
    srcStatus' = srcStatus,
    srcLedger' = srcLedger,
    srcRecovery' = srcRecovery,
    srcApplied' = srcApplied,
    observed' = observed,
    elected' = elected,
    superseded' = superseded,
    succPhase' = succPhase,
    succStatus' = succStatus,
    succRecovery' = "released",
    succApplied' = succApplied,
    keepRetry,
    removed' = removed,
    result' = "settled",
  }

  def succSettled: bool =
    succPhase == "terminal" and succRecovery == "released"

  // The settled successor supersedes its source: recovery goes, the ledger
  // stays. The defect variant releases the ledger too.
  action supersede(releasesLedger: bool): bool = all {
    elected,
    not(superseded),
    succSettled,
    declared' = declared,
    srcPhase' = srcPhase,
    srcStatus' = srcStatus,
    srcLedger' = if (releasesLedger) "released" else srcLedger,
    srcRecovery' = "released",
    srcApplied' = srcApplied,
    observed' = observed,
    elected' = elected,
    superseded' = true,
    keepSuccessor,
    keepRetry,
    removed' = removed,
    result' = "superseded",
  }

  // A later confirm of the base intent. The source's ledger fences it while
  // pending, indeterminate, or succeeded. A retry that passes applies.
  action retry: bool = all {
    srcPhase == "terminal",
    not(retried),
    not(removed),
    srcLedger == "released",
    declared' = declared,
    srcPhase' = srcPhase,
    srcStatus' = srcStatus,
    srcLedger' = srcLedger,
    srcRecovery' = srcRecovery,
    srcApplied' = srcApplied,
    observed' = observed,
    elected' = elected,
    superseded' = superseded,
    keepSuccessor,
    retried' = true,
    retryApplied' = true,
    removed' = removed,
    result' = "retried",
  }

  def holds(phase: str, recovery: str): bool =
    phase == "dispatching" or recovery == "present" or recovery == "retained"

  // What bundle quiescence checks for these runs.
  def quiescent: bool = not(holds(srcPhase, srcRecovery)) and not(holds(succPhase, succRecovery))

  action remove: bool = all {
    not(removed),
    quiescent,
    declared' = declared,
    srcPhase' = srcPhase,
    srcStatus' = srcStatus,
    srcLedger' = srcLedger,
    srcRecovery' = srcRecovery,
    srcApplied' = srcApplied,
    observed' = observed,
    elected' = elected,
    superseded' = superseded,
    keepSuccessor,
    keepRetry,
    removed' = true,
    result' = "removed",
  }

  action stepWith(untruthful: bool, releasesLedger: bool): bool = {
    nondet o = OUTCOMES.oneOf()
    nondet b = OBSERVATIONS.oneOf()
    any {
      dispatchSource,
      finishSource(o),
      readback(b, untruthful),
      electSuccessor,
      finishSuccessor(o),
      reconcileSuccessor,
      supersede(releasesLedger),
      retry,
      remove,
    }
  }

  action step = stepWith(false, false)

  action stepUntruthfulReadback = stepWith(true, false)

  action stepSupersedeReleasesLedger = stepWith(false, true)

  def count(b: bool): int = if (b) 1 else 0

  // |effects(intent)| <= 1 + |elected successors|.
  val effectBound: bool =
    count(srcApplied) + count(succApplied) + count(retryApplied) <= 1 + count(elected)

  // An indeterminate source keeps its ledger unless Ghostget observed that
  // it did not apply; supersession never releases it.
  val fenceKept: bool =
    (srcStatus == "indeterminate" and observed != "not-applied") implies srcLedger == "indeterminate"

  // Only a settled elected successor supersedes, and only an unelected
  // source reads back.
  val supersededSettled: bool =
    (superseded implies (elected and succSettled)) and (observed != "none" implies not(elected))

  val retainedSafety: bool = effectBound and fenceKept and supersededSettled
}

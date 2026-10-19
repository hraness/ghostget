// One media lineage under its item lock (src/media/archive.ts and
// src/media/lock.ts).
//
// Processes "p" and "q" capture the same source. A run reads the lineage head
// without the lock, takes the lock, repairs a torn head, resets the shared
// staging item, and waits for its capture. After the capture it checks that
// it still owns the lock, then waits for the flush before promotion. The
// promotion fence checks the lock's token and inode, and its guard checks for
// cancellation, immediately before the rename. So a run is split into start,
// captureDone and promote, and other actions may run between them.
//
// The environment may stop a heartbeat (the lock turns stale), kill a process
// (its lock names a dead PID), cancel a run, tear a revision as a power loss
// would, or drop a stray file such as Finder's .DS_Store into the head.
//
// A capture may also produce content "X": files that fail the closed
// integrity verification of the staged item, such as an unrecorded file that
// FFmpeg left beside its derivative. Production verifies the staged item
// after the manifest is written and before the flush and the promotion fence.
//
// A power loss can tear only what was never flushed. Promotion flushes the
// staged tree before the rename and both parents after it, so a promoted
// revision is durable, and the head can still be torn only by a drive that
// acknowledged a flush it did not keep or by a revision an older release
// wrote before D10. The model therefore lets `tear` hit the head at any time
// and an older revision only when it was promoted without the flush.
module media {
  type Revision = { content: str, state: str, durable: bool }

  pure val PROCS: Set[str] = Set("p", "q")
  // "X" is a capture whose staged item fails closed verification.
  pure val CONTENTS: Set[str] = Set("A", "B", "X")
  // Which revision a power loss tears; an index past the head means the head.
  pure val TEAR_INDICES: Set[int] = 0.to(3)

  // "fixed" is the code as merged in #354. The other variants reproduce
  // defects: "unfenced" promotes without checking the lock at the rename
  // (before D11), "lateCancel" promotes after a cancellation that arrived
  // during the flush (before D9), and "quarantineAny" treats a head that
  // fails verification for any reason as torn, so it moves a verified head
  // that only gained a stray file (the first repair in #354). "unverified"
  // promotes a staged item without its closed verification, and "noSync"
  // promotes without flushing the staged tree and the parents (before D10).
  // "noRepair" answers invalid for a torn head instead of moving it to the
  // quarantine, as discovery did before D10.
  type Variant = str

  // none, held (a fresh heartbeat from a live PID), or stale (an old
  // heartbeat or a dead PID, so any run may reclaim it).
  var lock: str
  // The acquisition that the lock file names, and the next one to hand out.
  var lockId: int
  var nextLockId: int
  // idle, capturing (waiting for yt-dlp), or flushing (waiting for fsync
  // before the promotion fence).
  var phase: str -> str
  // The acquisition each run made, the head content it read under the lock
  // ("" when there was no head), and the content its capture produced.
  var myLock: str -> int
  var base: str -> str
  var content: str -> str
  var cancelled: str -> bool
  // The run whose files the shared staging item holds, or "" when it is
  // absent. A later run's reset replaces an earlier run's staging.
  var staging: str
  // The lineage in sequence order. state is ok, torn, stray, foreign or
  // unverified (promoted without passing closed verification). durable says
  // whether the promotion flushed the revision before and after the rename.
  var revisions: List[Revision]
  var quarantined: int
  // The result the last action returned to its caller, or "" for none.
  var response: str
  // Ghost variables for the invariants.
  var promotedWithoutLock: bool
  var cancelledCreated: bool
  var removedVerified: bool
  // Set when discovery answers invalid for a lineage whose only damage is a
  // torn revision, so that crash or power-loss damage stopped the lineage.
  var crashInvalid: bool

  def owns(x: str): bool = lock != "none" and lockId == myLock.get(x)
  def headState: str = if (revisions.length() == 0) "" else revisions[revisions.length() - 1].state
  def headContent: str = if (revisions.length() == 0) "" else revisions[revisions.length() - 1].content
  // Discovery stops at an unverifiable revision below the head.
  def olderBad: bool = revisions.indices().exists(i => i < revisions.length() - 1 and revisions[i].state != "ok")
  // The lineage holds a torn revision and no other damage.
  def onlyTorn: bool = and {
    revisions.indices().exists(i => revisions[i].state == "torn"),
    revisions.indices().forall(i => revisions[i].state == "ok" or revisions[i].state == "torn"),
  }

  action init = all {
    lock' = "none",
    lockId' = 0,
    nextLockId' = 1,
    phase' = PROCS.mapBy(_ => "idle"),
    myLock' = PROCS.mapBy(_ => 0),
    base' = PROCS.mapBy(_ => ""),
    content' = PROCS.mapBy(_ => ""),
    cancelled' = PROCS.mapBy(_ => false),
    staging' = "",
    revisions' = List(),
    quarantined' = 0,
    response' = "",
    promotedWithoutLock' = false,
    cancelledCreated' = false,
    removedVerified' = false,
    crashInvalid' = false,
  }

  action keepRuns = all {
    phase' = phase, myLock' = myLock, base' = base, content' = content, cancelled' = cancelled, staging' = staging,
  }
  action keepLineage = all { revisions' = revisions, quarantined' = quarantined }
  action keepLock = all { lock' = lock, lockId' = lockId, nextLockId' = nextLockId }
  action keepGhosts = all {
    promotedWithoutLock' = promotedWithoutLock, cancelledCreated' = cancelledCreated, removedVerified' = removedVerified,
    crashInvalid' = crashInvalid,
  }

  // A run that returns without capturing leaves everything else as it was.
  action answer(result: str): bool = all {
    response' = result, keepRuns, keepLineage, keepLock, keepGhosts,
  }

  // mediaUrl up to the capture: the unlocked read, the lock, the repair of a
  // torn head, and the staging reset. Two locked reads race nothing here,
  // because the model runs this whole prefix as one step.
  action start(v: Variant, x: str, refresh: bool): bool = all {
    phase.get(x) == "idle",
    val state = headState
    val tornLike = (state == "torn" and v != "noRepair") or (v == "quarantineAny" and state == "stray")
    if (olderBad or (state != "" and state != "ok" and not(tornLike))) all {
      response' = "invalid", keepRuns, keepLineage, keepLock,
      promotedWithoutLock' = promotedWithoutLock, cancelledCreated' = cancelledCreated, removedVerified' = removedVerified,
      crashInvalid' = (crashInvalid or onlyTorn),
    }
    else if (state == "ok" and not(refresh)) answer("existing")
    else if (lock == "held") answer("busy")
    else {
      val kept = if (tornLike) revisions.slice(0, revisions.length() - 1) else revisions
      all {
        lock' = "held",
        lockId' = nextLockId,
        nextLockId' = nextLockId + 1,
        myLock' = myLock.set(x, nextLockId),
        // resetStagingItem removes whatever an earlier owner left in staging.
        phase' = phase.set(x, "capturing"),
        staging' = x,
        base' = base.set(x, if (kept.length() == 0) "" else kept[kept.length() - 1].content),
        content' = content,
        cancelled' = cancelled.set(x, false),
        revisions' = kept,
        quarantined' = if (tornLike) quarantined + 1 else quarantined,
        removedVerified' = (removedVerified or (tornLike and state != "torn")),
        promotedWithoutLock' = promotedWithoutLock,
        cancelledCreated' = cancelledCreated,
        crashInvalid' = crashInvalid,
        response' = "",
      }
    },
  }

  // A run that ends after it took the lock discards its staging and releases
  // the lock only while it still owns the lock. A run that lost the lock
  // leaves the new owner's staging and lock file alone.
  action finish(x: str, result: str): bool = all {
    phase' = phase.set(x, "idle"),
    lock' = if (owns(x)) "none" else lock,
    lockId' = lockId,
    nextLockId' = nextLockId,
    staging' = if (owns(x)) "" else staging,
    myLock' = myLock, base' = base, content' = content, cancelled' = cancelled,
    response' = result,
  }

  // yt-dlp returns with content c. A reset staging item fails the capture,
  // a cancellation wins, an unchanged capture answers the existing head, and
  // a run whose lock was taken stops before the flush.
  //
  // The staged item is verified after the unchanged-capture check and
  // before the ownership check, as in production, and a capture that fails
  // closed verification answers invalid. The "unverified" variant skips it.
  action captureDone(v: Variant, x: str, c: str): bool = all {
    phase.get(x) == "capturing",
    if (staging != x) all { finish(x, if (cancelled.get(x)) "cancelled" else "failed"), keepLineage, keepGhosts }
    else if (cancelled.get(x)) all { finish(x, "cancelled"), keepLineage, keepGhosts }
    else if (c == base.get(x)) all { finish(x, "existing"), keepLineage, keepGhosts }
    else if (c == "X" and v != "unverified") all { finish(x, "invalid"), keepLineage, keepGhosts }
    else if (not(owns(x))) all { finish(x, "busy"), keepLineage, keepGhosts }
    else all {
      phase' = phase.set(x, "flushing"),
      content' = content.set(x, c),
      myLock' = myLock, base' = base, cancelled' = cancelled, staging' = staging,
      keepLock, keepLineage, keepGhosts,
      response' = "",
    },
  }

  // The flush ends and promoteDurably runs the fenced rename. The rename
  // moves whatever the staging path holds. Only a variant without the fence
  // can reach it while another run's reset owns that path, and then it moves
  // that run's unfinished files into the lineage ("foreign"). Discovery
  // rejects such a head, but the invariant is already broken by then.
  action promote(v: Variant, x: str): bool = all {
    phase.get(x) == "flushing",
    val fenced = v == "unfenced" or owns(x)
    val guarded = v != "lateCancel" and cancelled.get(x)
    if (not(fenced)) all { finish(x, "busy"), keepLineage, keepGhosts }
    else if (guarded) all { finish(x, "cancelled"), keepLineage, keepGhosts }
    else if (staging == "") all { finish(x, "failed"), keepLineage, keepGhosts }
    else all {
      phase' = phase.set(x, "idle"),
      lock' = if (owns(x)) "none" else lock,
      lockId' = lockId,
      nextLockId' = nextLockId,
      staging' = "",
      myLock' = myLock, base' = base, content' = content, cancelled' = cancelled,
      response' = "created",
      revisions' = revisions.append(
        if (staging != x) { content: "", state: "foreign", durable: v != "noSync" }
        else {
          content: content.get(x),
          state: if (content.get(x) == "X") "unverified" else "ok",
          durable: v != "noSync",
        }
      ),
      quarantined' = quarantined,
      promotedWithoutLock' = (promotedWithoutLock or not(owns(x))),
      cancelledCreated' = (cancelledCreated or cancelled.get(x)),
      removedVerified' = removedVerified,
      crashInvalid' = crashInvalid,
    },
  }

  action cancel(x: str): bool = all {
    phase.get(x) != "idle",
    not(cancelled.get(x)),
    cancelled' = cancelled.set(x, true),
    phase' = phase, myLock' = myLock, base' = base, content' = content, staging' = staging,
    keepLock, keepLineage, keepGhosts,
    response' = "",
  }

  // The process dies mid-run. Its lock file now names a dead PID.
  action crash(x: str): bool = all {
    phase.get(x) != "idle",
    phase' = phase.set(x, "idle"),
    lock' = if (owns(x)) "stale" else lock,
    lockId' = lockId, nextLockId' = nextLockId,
    myLock' = myLock, base' = base, content' = content, cancelled' = cancelled, staging' = staging,
    keepLineage, keepGhosts,
    response' = "",
  }

  // The owner stops refreshing its heartbeat for longer than the stale limit.
  action stale: bool = all {
    lock == "held",
    lock' = "stale",
    lockId' = lockId, nextLockId' = nextLockId,
    keepRuns, keepLineage, keepGhosts,
    response' = "",
  }

  // Power loss leaves a revision's capture short. A power loss ends every
  // run, so it happens only once every process has crashed (each crash
  // leaves the lock it owned stale). It can reach the head, and an older
  // revision only when that revision was never flushed. An index past the
  // head picks the head.
  action tear(i: int): bool = {
    val t = if (i < revisions.length()) i else revisions.length() - 1
    all {
      PROCS.forall(p => phase.get(p) == "idle"),
      revisions.length() > 0,
      revisions[t].state == "ok",
      t == revisions.length() - 1 or not(revisions[t].durable),
      revisions' = revisions.replaceAt(t, { content: revisions[t].content, state: "torn", durable: revisions[t].durable }),
      quarantined' = quarantined,
      keepRuns, keepLock, keepGhosts,
      response' = "",
    }
  }

  // A stray file lands in the head.
  action stray: bool = all {
    headState == "ok",
    revisions' = revisions.replaceAt(revisions.length() - 1, {
      content: headContent, state: "stray", durable: revisions[revisions.length() - 1].durable,
    }),
    quarantined' = quarantined,
    keepRuns, keepLock, keepGhosts,
    response' = "",
  }

  action stepWith(v: Variant): bool = {
    nondet x = PROCS.oneOf()
    nondet c = CONTENTS.oneOf()
    nondet refresh = Set(true, false).oneOf()
    nondet i = TEAR_INDICES.oneOf()
    any {
      start(v, x, refresh),
      captureDone(v, x, c),
      promote(v, x),
      any { cancel(x), crash(x) },
      any { stale, tear(i), stray },
    }
  }

  action step = stepWith("fixed")
  action stepUnfenced = stepWith("unfenced")
  action stepLateCancel = stepWith("lateCancel")
  action stepQuarantineAny = stepWith("quarantineAny")
  action stepUnverified = stepWith("unverified")
  action stepNoSync = stepWith("noSync")
  action stepNoRepair = stepWith("noRepair")

  // The three ghost invariants below restate the guards that the fixed step
  // takes at the rename and at the repair, so on their own they only show
  // that each pre-fix variant breaks its guard. What binds them to the code
  // is the replay: production answers and leaves the disk as the model does
  // after every step, and refuses each variant's violating trace.
  //
  // A promotion happens only while its run owns the current lock.
  val noPromotionWithoutLock: bool = not(promotedWithoutLock)
  // A run that was cancelled before its promotion never answers created.
  val cancelledNeverCreated: bool = not(cancelledCreated)
  // Only a torn head is ever moved out of the lineage.
  val verifiedNeverRemoved: bool = not(removedVerified)

  // Every revision holds the files its own run captured. This one is not a
  // guard restated: it holds only because a run that owns the lock always
  // holds the staging item, since a start takes both and a run that lost the
  // lock leaves the new owner's staging alone.
  val noForeignRevision: bool = revisions.foldl(true, (ok, r) => ok and r.state != "foreign")

  // Every promoted revision passed closed verification of its staged item.
  // Damage after promotion (torn, stray) is the environment's, not a
  // promotion's; an "unverified" revision is one that was promoted without
  // passing verification. The replay also runs production verification on
  // every revision the model calls ok after every step.
  val promotedVerified: bool = revisions.foldl(true, (ok, r) => ok and r.state != "unverified")

  // Every promoted revision is durable: production flushed the staged tree
  // and the revision parent chain before the rename, and the revision parent
  // and the staging parent after it. The replay derives each revision's
  // durable flag from the flushes production actually made, so a production
  // change that drops one diverges here.
  val promotedDurable: bool = revisions.foldl(true, (ok, r) => ok and r.durable)

  // A crash or power loss never leaves the lineage permanently invalid.
  // Discovery stops for good at an unverifiable revision below the head, and
  // repairs only a torn head: the next locked start moves it to the
  // quarantine and recaptures, which the replay drives through production.
  // Crashes and power loss damage the lineage only by tearing, so the lineage
  // stays recoverable from them while no torn revision sits below the head.
  // A stray file is owner damage, not a crash, and is left in place on
  // purpose; foreign and unverified revisions are excluded by the invariants
  // above.
  // The ghost crashInvalid also records any discovery that answered invalid
  // while the lineage's only damage was a torn revision, so a start that
  // refuses to repair a torn head breaks this invariant as well.
  val lineageRecoverable: bool = and {
    revisions.indices().forall(i => i == revisions.length() - 1 or revisions[i].state != "torn"),
    not(crashInvalid),
  }
}

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
// (its lock names a dead PID), cancel a run, tear the head revision as a power
// loss would, or drop a stray file such as Finder's .DS_Store into the head.
module media {
  type Revision = { content: str, state: str }

  pure val PROCS: Set[str] = Set("p", "q")
  pure val CONTENTS: Set[str] = Set("A", "B")

  // "fixed" is the code as merged in #354. The other variants reproduce
  // defects: "unfenced" promotes without checking the lock at the rename
  // (before D11), "lateCancel" promotes after a cancellation that arrived
  // during the flush (before D9), and "quarantineAny" treats a head that
  // fails verification for any reason as torn, so it moves a verified head
  // that only gained a stray file (the first repair in #354).
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
  // The lineage in sequence order. state is ok, torn, stray or foreign.
  var revisions: List[Revision]
  var quarantined: int
  // The result the last action returned to its caller, or "" for none.
  var response: str
  // Ghost variables for the invariants.
  var promotedWithoutLock: bool
  var cancelledCreated: bool
  var removedVerified: bool

  def owns(x: str): bool = lock != "none" and lockId == myLock.get(x)
  def headState: str = if (revisions.length() == 0) "" else revisions[revisions.length() - 1].state
  def headContent: str = if (revisions.length() == 0) "" else revisions[revisions.length() - 1].content
  // Discovery stops at an unverifiable revision below the head.
  def olderBad: bool = revisions.indices().exists(i => i < revisions.length() - 1 and revisions[i].state != "ok")

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
  }

  action keepRuns = all {
    phase' = phase, myLock' = myLock, base' = base, content' = content, cancelled' = cancelled, staging' = staging,
  }
  action keepLineage = all { revisions' = revisions, quarantined' = quarantined }
  action keepLock = all { lock' = lock, lockId' = lockId, nextLockId' = nextLockId }
  action keepGhosts = all {
    promotedWithoutLock' = promotedWithoutLock, cancelledCreated' = cancelledCreated, removedVerified' = removedVerified,
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
    val tornLike = state == "torn" or (v == "quarantineAny" and state == "stray")
    if (olderBad or (state != "" and state != "ok" and not(tornLike))) answer("invalid")
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
  action captureDone(x: str, c: str): bool = all {
    phase.get(x) == "capturing",
    if (staging != x) all { finish(x, if (cancelled.get(x)) "cancelled" else "failed"), keepLineage, keepGhosts }
    else if (cancelled.get(x)) all { finish(x, "cancelled"), keepLineage, keepGhosts }
    else if (c == base.get(x)) all { finish(x, "existing"), keepLineage, keepGhosts }
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
        if (staging == x) { content: content.get(x), state: "ok" } else { content: "", state: "foreign" }
      ),
      quarantined' = quarantined,
      promotedWithoutLock' = (promotedWithoutLock or not(owns(x))),
      cancelledCreated' = (cancelledCreated or cancelled.get(x)),
      removedVerified' = removedVerified,
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

  // Power loss leaves the head's capture short, or a stray file lands in it.
  action damage(state: str): bool = all {
    headState == "ok",
    revisions' = revisions.replaceAt(revisions.length() - 1, { content: headContent, state: state }),
    quarantined' = quarantined,
    keepRuns, keepLock, keepGhosts,
    response' = "",
  }
  action tear: bool = damage("torn")
  action stray: bool = damage("stray")

  action stepWith(v: Variant): bool = {
    nondet x = PROCS.oneOf()
    nondet c = CONTENTS.oneOf()
    nondet refresh = Set(true, false).oneOf()
    any {
      start(v, x, refresh),
      captureDone(x, c),
      promote(v, x),
      any { cancel(x), crash(x) },
      any { stale, tear, stray },
    }
  }

  action step = stepWith("fixed")
  action stepUnfenced = stepWith("unfenced")
  action stepLateCancel = stepWith("lateCancel")
  action stepQuarantineAny = stepWith("quarantineAny")

  // A promotion happens only while its run owns the current lock.
  val noPromotionWithoutLock: bool = not(promotedWithoutLock)
  // A run that was cancelled before its promotion never answers created.
  val cancelledNeverCreated: bool = not(cancelledCreated)
  // Only a torn head is ever moved out of the lineage.
  val verifiedNeverRemoved: bool = not(removedVerified)
}

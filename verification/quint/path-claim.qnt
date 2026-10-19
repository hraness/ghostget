// The path helper's per-leaf mutation claim and its dead-claim reaper
// election (src/path-helper.ts: acquirePathMutationClaim,
// recoverDefinitelyOrphanedPathMutationClaim, acquirePathMutationReaper).
//
// Three helper processes write one leaf. Each action moves one process from
// one of the helper's test pause points to its next one, as the
// `pause-at-every-step` fault does: claim-link, reaper-link,
// claim-quarantine, claim-held, and claim-release. The code between two
// pause points runs atomically with respect to the other processes, because
// the test scheduler lets only one process run at a time.
//
// The lock name holds no claim, the claim of a process, or a claim whose
// owner is dead: either the claim left behind before the run starts, or the
// claim of a process that was killed. A claim's fingerprint never recurs, so
// each claim has a fresh ID. Reaper files are named by the dead claim they
// reap and their generation; generation g+1 is contended only after the
// holder of generation g died.
//
// Pre-fix variant (D3, stepPreFix): recovery elects no reaper and does not
// restore a claim it moved by mistake. Two processes that both saw the same
// dead claim can each rename the lock name; the slower one moves a live
// claim away, and a third process claims beside the live owner.
//
// Not modelled: a process killed between two pause points, stage and
// quarantine temporaries, the residue sweep of stage files, and write
// operations other than one leaf.
module pathClaim {
  pure val ACTORS: Set[str] = Set("a", "b", "c")
  pure val MAX_KILLS: int = 1
  // PATH_MUTATION_REAPER_GENERATION_MAXIMUM.
  pure val MAX_GENERATION: int = 8
  pure val HOLDING: Set[str] = Set("claim-held", "claim-release")
  pure val EXITED: Set[str] = Set("exited-ok", "exited-busy", "exited-failed", "killed")

  // Each process's pause point, or how it ended.
  var pc: str -> str
  // Which acquisition attempt (0 or 1) each process is in.
  var attempt: str -> int
  // The dead claim each process is reaping, and the reaper generation it
  // contends for next.
  var seen: str -> int
  var generation: str -> int
  // The file at the lock name: its owner ("none", "ghost" for the claim a
  // process left before the run, or a process) and its claim ID.
  var lockOwner: str
  var lockId: int
  var nextId: int
  // Reaper files: (claim ID, generation, holder).
  var reapers: Set[(int, int, str)]
  var kills: int

  action init = {
    nondet deadClaim = Set(true, false).oneOf()
    all {
      pc' = ACTORS.mapBy(a => "claim-link"),
      attempt' = ACTORS.mapBy(a => 0),
      seen' = ACTORS.mapBy(a => 0),
      generation' = ACTORS.mapBy(a => 0),
      lockOwner' = if (deadClaim) "ghost" else "none",
      lockId' = 0,
      nextId' = 1,
      reapers' = Set(),
      kills' = 0,
    }
  }

  def alive(a: str): bool = not(EXITED.contains(pc.get(a)))

  // A claim's owner is dead once its process exited without releasing it.
  def ownerDead(owner: str): bool = owner == "ghost" or (ACTORS.contains(owner) and pc.get(owner) == "killed")

  // releasePathMutationReapers: a process removes every reaper file it
  // walked for its dead claim, including the dead predecessors it passed.
  def releaseReapers(a: str): Set[(int, int, str)] =
    reapers.filter(r => not(r._1 == seen.get(a) and r._2 <= generation.get(a)))

  // After a recovery returns true, the claim loop tries again or gives up.
  def retry(a: str): str = if (attempt.get(a) == 0) "claim-link" else "exited-busy"

  action move(a: str, nextPc: str, nextAttempt: int, nextSeen: int, nextGeneration: int,
              owner: str, id: int, files: Set[(int, int, str)]): bool = all {
    pc' = pc.set(a, nextPc),
    attempt' = attempt.set(a, nextAttempt),
    seen' = seen.set(a, nextSeen),
    generation' = generation.set(a, nextGeneration),
    lockOwner' = owner,
    lockId' = id,
    nextId' = if (owner == a and id == nextId) nextId + 1 else nextId,
    reapers' = files,
    kills' = kills,
  }

  // claim-link: publish the claim, or read the claim that holds the name.
  action link(a: str, elect: bool): bool = all {
    pc.get(a) == "claim-link",
    if (lockOwner == "none")
      move(a, "claim-held", attempt.get(a), seen.get(a), generation.get(a), a, nextId, reapers)
    else if (not(ownerDead(lockOwner)))
      move(a, "exited-busy", attempt.get(a), seen.get(a), generation.get(a), lockOwner, lockId, reapers)
    else
      move(a, if (elect) "reaper-link" else "claim-quarantine", attempt.get(a), lockId, 0, lockOwner, lockId, reapers),
  }

  // reaper-link: contend for this generation's reaper name.
  action reap(a: str): bool = {
    val s = seen.get(a)
    val g = generation.get(a)
    val holders = reapers.filter(r => r._1 == s and r._2 == g).map(r => r._3)
    all {
      pc.get(a) == "reaper-link",
      if (holders == Set()) {
        // Elected: re-read the lock name before moving anything.
        val files = reapers.union(Set((s, g, a)))
        if (lockOwner != "none" and lockId == s)
          move(a, "claim-quarantine", attempt.get(a), s, g, lockOwner, lockId, files)
        else if (lockOwner == "none")
          move(a, retry(a), attempt.get(a) + 1, s, g, lockOwner, lockId,
            files.filter(r => not(r._1 == s and r._2 <= g)))
        else
          move(a, "exited-busy", attempt.get(a), s, g, lockOwner, lockId,
            files.filter(r => not(r._1 == s and r._2 <= g)))
      }
      else if (holders.exists(h => not(ownerDead(h))))
        move(a, "exited-busy", attempt.get(a), s, g, lockOwner, lockId, reapers)
      else if (g + 1 >= MAX_GENERATION)
        move(a, "exited-failed", attempt.get(a), s, g, lockOwner, lockId, reapers)
      else
        // The holder died: contend for its successor's name.
        move(a, "reaper-link", attempt.get(a), s, g + 1, lockOwner, lockId, reapers),
    }
  }

  // claim-quarantine: rename whatever holds the lock name, then check that
  // it was the dead claim.
  action quarantine(a: str, restore: bool): bool = all {
    pc.get(a) == "claim-quarantine",
    if (lockOwner == "none")
      move(a, retry(a), attempt.get(a) + 1, seen.get(a), generation.get(a), "none", lockId, releaseReapers(a))
    else if (lockId == seen.get(a))
      // The residue sweep removes every dead reaper once its claim is gone.
      move(a, retry(a), attempt.get(a) + 1, seen.get(a), generation.get(a), "none", lockId,
        releaseReapers(a).filter(r => not(ownerDead(r._3))))
    else if (restore)
      move(a, "exited-failed", attempt.get(a), seen.get(a), generation.get(a), lockOwner, lockId, reapers)
    else
      move(a, "exited-failed", attempt.get(a), seen.get(a), generation.get(a), "none", lockId, reapers),
  }

  action hold(a: str): bool = all {
    pc.get(a) == "claim-held",
    move(a, "claim-release", attempt.get(a), seen.get(a), generation.get(a), lockOwner, lockId, reapers),
  }

  // claim-release: the claim must still be this process's own.
  action release(a: str): bool = all {
    pc.get(a) == "claim-release",
    if (lockOwner == a)
      move(a, "exited-ok", attempt.get(a), seen.get(a), generation.get(a), "none", lockId, reapers)
    else
      move(a, "exited-failed", attempt.get(a), seen.get(a), generation.get(a), lockOwner, lockId, reapers),
  }

  // SIGKILL at a pause point. The process's claim and reaper files stay.
  action kill(a: str, limit: int): bool = all {
    alive(a),
    kills < limit,
    pc' = pc.set(a, "killed"),
    attempt' = attempt,
    seen' = seen,
    generation' = generation,
    lockOwner' = lockOwner,
    lockId' = lockId,
    nextId' = nextId,
    reapers' = reapers,
    kills' = kills + 1,
  }

  action stepWith(fixed: bool, killLimit: int): bool = {
    nondet a = ACTORS.oneOf()
    any {
      link(a, fixed),
      reap(a),
      quarantine(a, fixed),
      hold(a),
      release(a),
      kill(a, killLimit),
    }
  }

  action step = stepWith(true, MAX_KILLS)

  // D3: no reaper election and no restore. The race needs no kill, so the
  // variant leaves kills out and its traces reach the race more often.
  action stepPreFix = stepWith(false, 0)

  // At most one live process is inside the claim.
  val mutualExclusion: bool =
    ACTORS.filter(a => HOLDING.contains(pc.get(a))).size() <= 1

  // A live process inside the claim owns the lock name.
  val holderOwnsLock: bool =
    ACTORS.forall(a => HOLDING.contains(pc.get(a)) implies lockOwner == a)

  // Both, checked as one invariant so that Apalache runs once per step.
  val claimSafety: bool = mutualExclusion and holderOwnsLock
}

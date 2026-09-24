// Release and promotion: one tag push starts Release run R, whose attempts
// build, attest, publish the immutable GitHub Release, and publish npm. The
// owner may re-run the failed jobs of the latest attempt, carrying its
// successful jobs and their attested artifact, or re-run all jobs, which
// rebuilds and re-signs under the new attempt. The publisher's handoff
// (`verifyPublicationHandoff`), website promotion (`resolveReleaseAuthority`),
// and the canonical download (`verifyCanonicalReleaseRun`) read the provider
// state this module keeps. The draft, resume, and Latest convergence of
// `publishCanonicalRelease` are modeled here but not replayed.
module release {
  pure val MAX: int = 3
  pure val R: int = 88001
  // Another run of the same workflow; its attestation is genuine.
  pure val F: int = 88002
  pure val ATTEMPTS: Set[int] = 0.to(MAX)
  // 0 authorize, 1 verify, 2 attest, 3 publish the GitHub Release, 4 npm.
  pure val JOBS: Set[int] = 0.to(4)
  pure val KINDS: Set[str] = Set("first", "rerunFailed", "rerunAll")
  pure val FAULTS: Set[str] = Set("none", "auth", "verify", "attest", "publishBeforePatch", "publishAfterPatch", "npm")
  // The directory a publish job is handed: its carried artifact, another
  // run's attested files, files naming a later attempt, or files naming the
  // current attempt whether or not it attested them.
  pure val SOURCES: Set[str] = Set("carried", "foreign", "future", "unsigned")
  pure val MODES: Set[str] = Set("automatic", "manual")
  // Recovery reads at most this many attempts strictly between a receipt
  // attempt that attested but did not publish and the latest attempt
  // (`MAX_INTERMEDIATE_RELEASE_ATTEMPTS`). With MAX attempts the gap is at
  // most MAX - 2, so the bound never refuses here; unit tests cover it.
  pure val MAX_INTERMEDIATE: int = 3

  var latest: int
  // Each attempt's job conclusions: "none" before it runs, then "success",
  // "failure", or "skipped".
  var jobs: int -> (int -> str)
  // The attempt whose build each attempt's attest and publish jobs carry.
  var artifactOf: int -> int
  // Signed attestations that exist, by (run, attempt).
  var attested: Set[(int, int)]
  // "none", "draft", or "published".
  var relState: str
  // The attempt a draft body names, or 0.
  var draftAttempt: int
  // The attempt the published body and manifest name, or 0.
  var relAttempt: int
  // The last publisher handoff: "none", "admitted", or "refused", and the
  // (run, attempt) its manifest and bundle name.
  var handoff: str
  var handoffRun: int
  var handoffAttempt: int
  // The last promotion or download verdict: "none", "admitted", or "refused".
  var verdict: str
  // "", "automatic", "manual", or "download".
  var verdictPath: str
  // Ghost: the publisher refused the exact attested artifact its run carried.
  var refusedExact: bool
  // Ghost: manual recovery or the canonical download refused a Release that
  // some attempt of its run proved by all four canonical jobs.
  var promotionBlocked: bool

  action init = all {
    latest' = 0,
    jobs' = ATTEMPTS.mapBy(_ => JOBS.mapBy(_ => "none")),
    artifactOf' = ATTEMPTS.mapBy(_ => 0),
    attested' = Set((F, 1)),
    relState' = "none",
    draftAttempt' = 0,
    relAttempt' = 0,
    handoff' = "none",
    handoffRun' = 0,
    handoffAttempt' = 0,
    verdict' = "none",
    verdictPath' = "",
    refusedExact' = false,
    promotionBlocked' = false,
  }

  def conclusion(a: int, j: int): str = jobs.get(a).get(j)
  def first3(a: int): bool = a >= 1 and 0.to(2).forall(j => conclusion(a, j) == "success")
  def all4(a: int): bool = a >= 1 and 0.to(3).forall(j => conclusion(a, j) == "success")
  def succeeded(a: int): bool = a >= 1 and JOBS.forall(j => conclusion(a, j) == "success")
  // Some attempt proved all four canonical jobs, so it published the Release.
  def anyPublished: bool = ATTEMPTS.exists(a => all4(a))
  // An attempt strictly between a receipt attempt `m` and the latest attempt
  // `n` proved all four, within the bounded number of intermediate reads.
  def publishedBetween(m: int, n: int): bool =
    n - m - 1 <= MAX_INTERMEDIATE and ATTEMPTS.exists(a => a > m and a < n and all4(a))

  // The first job a re-run of the failed jobs of attempt `a` runs again.
  def firstRerun(a: int): int =
    if (conclusion(a, 0) != "success") 0
    else if (conclusion(a, 1) != "success") 1
    else if (conclusion(a, 2) != "success") 2
    else if (conclusion(a, 3) != "success") 3
    else 4

  // The publisher admits files whose manifest names this run and an attempt
  // no later than the current one, and whose bundle is a genuine attestation
  // of exactly those files. Pre-fix D7 required the current attempt; the
  // unbound defect checks only the manifest coordinates.
  pure def handoffAdmits(rule: str, runId: int, attempt: int, current: int, signatures: Set[(int, int)]): bool =
    if (rule == "d7") runId == R and attempt == current and signatures.contains((runId, attempt))
    else if (rule == "unbound") runId == R and attempt <= current
    else runId == R and attempt <= current and signatures.contains((runId, attempt))

  action startAttempt(kind: str, failAt: str, source: str, rule: str): bool = {
    val current = latest + 1
    val k = if (kind == "rerunFailed") firstRerun(latest) else 0
    val auth = if (k > 0) "success" else if (failAt == "auth") "failure" else "success"
    val verify = if (k > 1) "success" else if (auth != "success") "skipped" else if (failAt == "verify") "failure" else "success"
    val artifact = if (k > 1) artifactOf.get(latest) else current
    // Attestation downloads the build of its own attempt, so re-running it
    // over a carried build fails.
    val attest = if (k > 2) "success" else if (verify != "success") "skipped" else if (k == 2) "failure" else if (failAt == "attest") "failure" else "success"
    val signatures = if (k <= 2 and attest == "success") attested.union(Set((R, current))) else attested
    val publishRuns = k <= 3 and attest == "success"
    val runId = if (source == "foreign") F else R
    val attempt = if (source == "carried") artifact else if (source == "foreign") 1 else if (source == "future") current + 1 else current
    val admitted = publishRuns and handoffAdmits(rule, runId, attempt, current, signatures)
    // Creating the Release writes a draft whose body names the manifest
    // attempt, then publishes it; resuming requires the exact body.
    val resumable = relState == "none" or (relState == "draft" and draftAttempt == attempt)
    val stopsBeforePatch = admitted and resumable and failAt == "publishBeforePatch"
    val publishes = admitted and resumable and not(stopsBeforePatch)
    val publish =
      if (k > 3) "success"
      else if (not(publishRuns)) "skipped"
      else if (not(admitted)) "failure"
      else if (relState == "published") (if (relAttempt == attempt) "success" else "failure")
      else if (not(resumable) or stopsBeforePatch) "failure"
      else if (failAt == "publishAfterPatch") "failure"
      else "success"
    val npm = if (publish != "success") "skipped" else if (failAt == "npm") "failure" else "success"
    all {
      latest < MAX,
      if (kind == "first") latest == 0
      else if (kind == "rerunFailed") latest >= 1 and not(succeeded(latest))
      else latest >= 1,
      latest' = current,
      jobs' = jobs.set(current, JOBS.mapBy(j =>
        if (j == 0) auth else if (j == 1) verify else if (j == 2) attest else if (j == 3) publish else npm)),
      artifactOf' = artifactOf.set(current, artifact),
      attested' = signatures,
      relState' = if (publishes) "published" else if (stopsBeforePatch) "draft" else relState,
      draftAttempt' = if (stopsBeforePatch) attempt else if (publishes) 0 else draftAttempt,
      relAttempt' = if (publishes) attempt else relAttempt,
      handoff' = if (not(publishRuns)) "none" else if (admitted) "admitted" else "refused",
      handoffRun' = if (publishRuns) runId else 0,
      handoffAttempt' = if (publishRuns) attempt else 0,
      verdict' = "none",
      verdictPath' = "",
      refusedExact' = (refusedExact or (publishRuns and source == "carried" and not(admitted))),
      promotionBlocked' = promotionBlocked,
    }
  }

  action keepRelease = all {
    latest' = latest,
    jobs' = jobs,
    artifactOf' = artifactOf,
    attested' = attested,
    relState' = relState,
    draftAttempt' = draftAttempt,
    relAttempt' = relAttempt,
    handoff' = "none",
    handoffRun' = 0,
    handoffAttempt' = 0,
    refusedExact' = refusedExact,
  }

  // Automatic promotion follows the completion of the latest attempt and
  // requires its success. Manual recovery admits a latest attempt that proved
  // all four canonical jobs, or the earlier receipt attempt the body names
  // when that attempt proved all four, or, when that receipt attempt attested
  // but did not publish, a bounded intermediate attempt that proved all four.
  // Pre-fix D8 required success; pre-fix D15 read no intermediate attempt.
  action promote(mode: str, rule: str): bool = {
    val m = relAttempt
    val admit =
      if (mode == "automatic" or rule == "d8") succeeded(latest)
      else if (rule == "d15") (all4(latest) or (m < latest and all4(m)))
      else (all4(latest) or (m < latest and (all4(m) or (first3(m) and publishedBetween(m, latest)))))
    all {
      relState == "published",
      keepRelease,
      verdict' = if (admit) "admitted" else "refused",
      verdictPath' = mode,
      promotionBlocked' = (promotionBlocked or (mode == "manual" and not(admit) and anyPublished)),
    }
  }

  // The canonical download admits the attesting attempt the manifest names
  // when it succeeded or published, or when a strictly later completed
  // attempt proved all four canonical jobs: the current attempt, or a bounded
  // intermediate attempt. The early defect admits it once it attested; the
  // pre-fix D15 form reads only the current attempt.
  action download(rule: str): bool = {
    val m = relAttempt
    val later =
      if (rule == "d15") all4(latest)
      else (all4(latest) or publishedBetween(m, latest))
    val admit = succeeded(m) or (first3(m) and (
      rule == "early" or conclusion(m, 3) == "success" or (latest > m and later)))
    all {
      relState == "published",
      keepRelease,
      verdict' = if (admit) "admitted" else "refused",
      verdictPath' = "download",
      promotionBlocked' = (promotionBlocked or (not(admit) and anyPublished)),
    }
  }

  // Every attempt ran; the provider state no longer changes.
  action done: bool = all {
    latest == MAX,
    keepRelease,
    verdict' = "none",
    verdictPath' = "",
    promotionBlocked' = promotionBlocked,
  }

  // Adversarial handoffs arrive on one roll in four so that seeded
  // simulation mostly follows the carried artifact; every source stays
  // reachable at every step.
  action step = {
    nondet kind = KINDS.oneOf()
    nondet failAt = FAULTS.oneOf()
    nondet source = SOURCES.oneOf()
    nondet sourceRoll = 0.to(3).oneOf()
    nondet mode = MODES.oneOf()
    any {
      startAttempt(kind, failAt, if (sourceRoll == 0) source else "carried", "fixed"),
      promote(mode, "fixed"),
      download("fixed"),
      done,
    }
  }

  // Seeded defect D7: the publisher requires the current attempt.
  action stepD7 = {
    nondet kind = KINDS.oneOf()
    nondet failAt = FAULTS.oneOf()
    nondet source = SOURCES.oneOf()
    nondet sourceRoll = 0.to(3).oneOf()
    nondet mode = MODES.oneOf()
    any {
      startAttempt(kind, failAt, if (sourceRoll == 0) source else "carried", "d7"),
      promote(mode, "fixed"),
      download("fixed"),
      done,
    }
  }

  // Seeded defect D8: manual recovery requires a successful latest attempt.
  action stepD8 = {
    nondet kind = KINDS.oneOf()
    nondet failAt = FAULTS.oneOf()
    nondet source = SOURCES.oneOf()
    nondet sourceRoll = 0.to(3).oneOf()
    nondet mode = MODES.oneOf()
    any {
      startAttempt(kind, failAt, if (sourceRoll == 0) source else "carried", "fixed"),
      promote(mode, "d8"),
      download("fixed"),
      done,
    }
  }

  // Seeded defect: the publisher trusts the manifest without its attestation.
  action stepUnbound = {
    nondet kind = KINDS.oneOf()
    nondet failAt = FAULTS.oneOf()
    nondet source = SOURCES.oneOf()
    nondet sourceRoll = 0.to(3).oneOf()
    nondet mode = MODES.oneOf()
    any {
      startAttempt(kind, failAt, if (sourceRoll == 0) source else "carried", "unbound"),
      promote(mode, "fixed"),
      download("fixed"),
      done,
    }
  }

  // Seeded defect D15: manual recovery and the canonical download read no
  // attempt between the receipt attempt and the latest attempt.
  action stepD15 = {
    nondet kind = KINDS.oneOf()
    nondet failAt = FAULTS.oneOf()
    nondet source = SOURCES.oneOf()
    nondet sourceRoll = 0.to(3).oneOf()
    nondet mode = MODES.oneOf()
    any {
      startAttempt(kind, failAt, if (sourceRoll == 0) source else "carried", "fixed"),
      promote(mode, "d15"),
      download("d15"),
      done,
    }
  }

  // Seeded defect: the canonical download admits an attesting attempt whose
  // publication no attempt completed.
  action stepEarlyDownload = {
    nondet kind = KINDS.oneOf()
    nondet failAt = FAULTS.oneOf()
    nondet source = SOURCES.oneOf()
    nondet sourceRoll = 0.to(3).oneOf()
    nondet mode = MODES.oneOf()
    any {
      startAttempt(kind, failAt, if (sourceRoll == 0) source else "carried", "fixed"),
      promote(mode, "fixed"),
      download("early"),
      done,
    }
  }

  // Only files this run genuinely attested pass the publisher, and only they
  // become the published Release.
  val publishedBytesAttested: bool = and {
    handoff == "admitted" implies (handoffRun == R and attested.contains((handoffRun, handoffAttempt))),
    relState == "published" implies (relAttempt >= 1 and relAttempt <= latest and attested.contains((R, relAttempt))),
  }

  // Promotion and the canonical download admit a published Release only when
  // its receipt attempt, or a later attempt of its run up to the latest,
  // proved all four canonical jobs.
  val promotionSound: bool =
    verdict == "admitted" implies (relState == "published"
      and ATTEMPTS.exists(a => a >= relAttempt and a <= latest and all4(a)))

  // The publisher never refuses the exact attested artifact its run carries.
  val exactHandoffPublishes: bool = not(refusedExact)

  // A failed npm job never blocks manual promotion or the canonical download
  // of a Release that any attempt of its run published by proving all four
  // canonical jobs, including an intermediate failed-jobs rerun followed by a
  // rerun of all jobs whose publish failed (plan D15). The ghost does not
  // restate the admission rule: it names any publishing attempt. The D8 and
  // D15 mutants violate it.
  val promotionNotBlocked: bool = not(promotionBlocked)
}

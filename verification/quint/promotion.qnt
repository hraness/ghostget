// Website promotion: the jobs of `.github/workflows/website-production.yml`
// after the verify job, against an adversarial GitHub, Vercel, and public
// site. One run of the workflow executes, in order:
//
// - `authority`: `revalidateReleaseAuthority` in the provider-baseline job
//   (auth1), in the writer job before promotion (auth2), and after it (auth3);
// - `baseline`: `createProviderBaseline`;
// - `promote`: the checks of `promoteWebsiteProduction` before its write;
// - `write`: `advanceRef`, the leased Git push of the production writer
//   `scripts/release-ref-writer.mjs`, and the readbacks after it;
// - `poll`: one observation of `waitForProviderOutcome`, the first with its
//   prelude (pc "wait") and each with its confirmation when it sees success.
//
// Between any two of these steps the environment may move protected main,
// move the production ref, move the tag, replace Latest, deploy or fail on
// Vercel, change the public marker, or arm a change that lands between the
// two terminal readbacks of the confirmation. The verify job's C <= W check
// (`scripts/release-ref-authority.ts`) is a precondition: W is fixed here.
//
// The progress law is bounded, not temporal: every run reaches a verdict
// within BOUND production steps, and every stuck verdict names a reason that
// an environment fault or the Vercel liveness assumption (success and the
// exact marker inside the observation window) explains. Fair scheduling of
// the Actions jobs and the owner's manual recovery across runs are outside it.
module promotion {
  // Abstract commits: 1 the usual production ref, 2 the release commit C,
  // 3 the reviewed workflow source W, 4 and 5 later main commits, 6 a commit
  // that forks from C before W, and 7 a commit unrelated to C.
  pure val C: int = 2
  pure val W: int = 3
  pure val ANC: int -> Set[int] = Map(
    1 -> Set(1),
    2 -> Set(1, 2),
    3 -> Set(1, 2, 3),
    4 -> Set(1, 2, 3, 4),
    5 -> Set(1, 2, 3, 4, 5),
    6 -> Set(1, 2, 6),
    7 -> Set(7),
  )
  pure def anc(a: int, b: int): bool = ANC.get(b).contains(a)
  pure def strictAnc(a: int, b: int): bool = a != b and anc(a, b)

  // The replay runs `waitForProviderOutcome` with this poll budget.
  pure val MAXP: int = 3
  // auth1, baseline, auth2, promote, write, auth3, then MAXP polls.
  pure val BOUND: int = 6 + MAXP
  pure val REASONS: Set[str] = Set(
    "authority", "moved", "fastForward", "peel", "lease", "ref", "provider", "marker", "drift", "exhausted",
  )
  pure val FAULTS: Set[str] = Set("main", "ref", "tag", "latest", "marker", "drift", "failure")
  pure val PROGRESS: Set[str] = Set("build", "expose")

  type Env = {
    main: int,
    prodRef: int,
    tagAt: int,
    latestOk: bool,
    // "none", "pending", "success", or "failure": the one Vercel Production
    // deployment of C that the write triggers.
    deploy: str,
    // The apex marker: "base" (the baseline identity), "target" (C at the
    // pinned deployment URL), "targetAlt" (C at another deployment URL), or
    // "third" (any other identity).
    marker: str,
    // "none", or the readback that changes between the confirmation's two
    // terminal readbacks: "ref", "status", "marker", "latest", or "route".
    drift: str,
  }

  type Job = {
    pc: str,
    baseRef: int,
    lease: int,
    polls: int,
    // "" until the first target marker, then "target" or "targetAlt".
    targetSeen: str,
    verdict: str,
    reason: str,
    steps: int,
  }

  type Ghost = {
    wrote: bool,
    // The production ref's value when the write replaced it.
    writeFrom: int,
    // C <= W <= M, the tag, and Latest held at the check before the write.
    writeAuth: bool,
    // Main at every source check that passed.
    passedMains: Set[int],
    // The marker observations left baseline-then-target.
    obsBad: bool,
    // The stuck verdict's reason holds in the environment.
    witness: bool,
  }

  var env: Env
  var job: Job
  var ghost: Ghost

  action init = {
    nondet main0 = Set(3, 4).oneOf()
    nondet refRoll = 0.to(7).oneOf()
    all {
      env' = {
        main: main0,
        prodRef: if (refRoll == 0) 7 else 1,
        tagAt: C,
        latestOk: true,
        deploy: "none",
        marker: "base",
        drift: "none",
      },
      job' = { pc: "auth1", baseRef: 0, lease: 0, polls: 0, targetSeen: "", verdict: "none", reason: "", steps: 0 },
      ghost' = { wrote: false, writeFrom: 0, writeAuth: false, passedMains: Set(), obsBad: false, witness: false },
    }
  }

  def releaseOk(e: Env): bool = e.tagAt == C and e.latestOk
  def authorityOk(e: Env): bool = anc(W, e.main) and releaseOk(e)
  // The noSource variant skips every C <= W <= M source check.
  def sourceOk(v: str, e: Env): bool = v == "noSource" or anc(W, e.main)
  def withMain(g: Ghost, m: int): Ghost = { ...g, passedMains: g.passedMains.union(Set(m)) }

  action advance(r: Job, g: Ghost): bool = all {
    env' = env,
    job' = { ...r, steps: job.steps + 1 },
    ghost' = g,
  }

  action halt(verdict: str, reason: str, witness: bool, g: Ghost): bool = all {
    env' = env,
    job' = { ...job, pc: "done", verdict: verdict, reason: reason, steps: job.steps + 1 },
    ghost' = { ...g, witness: witness },
  }

  pure def afterAuthority(pc: str): str =
    if (pc == "auth1") "baseline" else if (pc == "auth2") "promote" else "wait"

  // `revalidateReleaseAuthority`: workflow source, tag, Release, and Latest.
  action authority(v: str): bool = all {
    job.verdict == "none",
    Set("auth1", "auth2", "auth3").contains(job.pc),
    if (sourceOk(v, env) and releaseOk(env))
      advance({ ...job, pc: afterAuthority(job.pc) }, withMain(ghost, env.main))
    else halt("stuck", "authority", not(authorityOk(env)), ghost),
  }

  // `createProviderBaseline` records the production ref it observed.
  action baseline: bool = all {
    job.verdict == "none",
    job.pc == "baseline",
    advance({ ...job, pc: "auth2", baseRef: env.prodRef }, ghost),
  }

  // `promoteWebsiteProduction` up to `advanceRef`: tag, Release, Latest, the
  // ref against the baseline, the fast-forward comparison, and the workflow
  // source. The noRecheck variant trusts the admission checks instead; the
  // noFastForward variant skips the comparison.
  action promote(v: str): bool = {
    val recheck = v != "noRecheck"
    all {
      job.verdict == "none",
      job.pc == "promote",
      if (recheck and not(releaseOk(env))) halt("stuck", "authority", not(authorityOk(env)), ghost)
      else if (env.prodRef != job.baseRef) halt("stuck", "moved", true, ghost)
      else if (v != "noFastForward" and not(strictAnc(env.prodRef, C))) halt("stuck", "fastForward", true, ghost)
      else if (recheck and not(sourceOk(v, env))) halt("stuck", "authority", not(authorityOk(env)), ghost)
      else advance(
        { ...job, pc: "write", lease: env.prodRef },
        { ...(if (recheck) withMain(ghost, env.main) else ghost), writeAuth: authorityOk(env) },
      ),
    }
  }

  // `advanceRef`: fetch the tag and peel it to C, push C with
  // --force-with-lease=<lease>, then read the ref back and check the source.
  // The noLease variant pushes whatever the ref holds.
  action write(v: str): bool = {
    val wrote = { ...ghost, wrote: true, writeFrom: env.prodRef }
    all {
      job.verdict == "none",
      job.pc == "write",
      if (env.tagAt != C) halt("stuck", "peel", true, ghost)
      else if (v != "noLease" and env.prodRef != job.lease) halt("stuck", "lease", true, ghost)
      else all {
        env' = { ...env, prodRef: C },
        if (sourceOk(v, env)) all {
          job' = { ...job, pc: "auth3", steps: job.steps + 1 },
          ghost' = withMain(wrote, env.main),
        } else all {
          job' = { ...job, pc: "done", verdict: "stuck", reason: "authority", steps: job.steps + 1 },
          ghost' = { ...wrote, witness: not(anc(W, env.main)) },
        },
      },
    }
  }

  // One observation of `waitForProviderOutcome`. The singleReadback variant
  // confirms from one terminal readback, lenientMarker accepts any marker
  // sequence, pendingIsFailure treats a pending deployment as failed, and
  // unboundedPoll never spends its poll budget.
  action poll(v: str): bool = {
    val e = env
    val first = job.pc == "wait"
    val candidate = e.deploy != "none"
    val isTarget = e.marker == "target" or e.marker == "targetAlt"
    val badObs = e.marker == "third"
      or (e.marker == "base" and job.targetSeen != "")
      or (isTarget and candidate and e.marker == "targetAlt")
      or (isTarget and job.targetSeen != "" and job.targetSeen != e.marker)
    val markerFails = v != "lenientMarker" and badObs
    val observed = { ...(if (first) withMain(ghost, e.main) else ghost), obsBad: ghost.obsBad or badObs }
    val seen = if (isTarget and job.targetSeen == "") e.marker else job.targetSeen
    val confirms = e.deploy == "success" and isTarget
    val nextPolls = if (v == "unboundedPoll") job.polls else job.polls + 1
    all {
      job.verdict == "none",
      job.pc == "wait" or job.pc == "poll",
      if (first and not(releaseOk(e) and sourceOk(v, e))) halt("stuck", "authority", not(authorityOk(e)), ghost)
      else if (e.prodRef != C) halt("stuck", "ref", true, observed)
      else if (e.deploy == "failure" or (v == "pendingIsFailure" and e.deploy == "pending"))
        halt("stuck", "provider", e.deploy == "failure", observed)
      else if (markerFails) halt("stuck", "marker", true, observed)
      else if (confirms and not(releaseOk(e) and sourceOk(v, e))) halt("stuck", "authority", not(authorityOk(e)), observed)
      else if (confirms and v != "singleReadback" and e.drift != "none") halt("stuck", "drift", true, withMain(observed, e.main))
      else if (confirms) halt("promoted", "", false, withMain(observed, e.main))
      else if (nextPolls == MAXP)
        halt("stuck", "exhausted", not(e.deploy == "success" and e.marker == "target"), observed)
      else advance({ ...job, pc: "poll", polls: nextPolls, targetSeen: seen }, observed),
    }
  }

  // Vercel builds the pushed commit, succeeds, and aliases the apex to it.
  // The pick orders the alias against the build: "expose" aliases first when
  // it still can, "build" advances the build first.
  action vercel(pick: str): bool = {
    val build = env.deploy == "none" or env.deploy == "pending"
    val expose = env.marker == "base"
    val advanced = if (env.deploy == "none") "pending" else "success"
    all {
      job.verdict == "none",
      ghost.wrote,
      build or expose,
      env' = if ((pick == "expose" and expose) or not(build)) { ...env, marker: "target" }
        else { ...env, deploy: advanced },
      job' = job,
      ghost' = ghost,
    }
  }

  action fault(kind: str, m: int, r: int, mk: str, d: str): bool = all {
    job.verdict == "none",
    if (kind == "main") all { m != env.main, env' = { ...env, main: m } }
    else if (kind == "ref") all { job.baseRef != 0, r != env.prodRef, env' = { ...env, prodRef: r } }
    else if (kind == "tag") all { env.tagAt == C, env' = { ...env, tagAt: 6 } }
    else if (kind == "latest") all { env.latestOk, env' = { ...env, latestOk: false } }
    else if (kind == "marker") all { ghost.wrote, mk != env.marker, env' = { ...env, marker: mk } }
    else if (kind == "drift") all { ghost.wrote, env.drift == "none", env' = { ...env, drift: d } }
    else all { env.deploy == "pending", env' = { ...env, deploy: "failure" } },
    job' = job,
    ghost' = ghost,
  }

  action done: bool = all {
    job.verdict != "none",
    env' = env,
    job' = job,
    ghost' = ghost,
  }

  // Faults are rarer than progress so that seeded traces also reach success.
  action stepWith(v: str): bool = {
    nondet roll = 0.to(3).oneOf()
    nondet kind = FAULTS.oneOf()
    nondet m = Set(3, 4, 5, 6).oneOf()
    nondet r = Set(2, 5).oneOf()
    nondet mk = Set("base", "targetAlt", "third").oneOf()
    nondet d = Set("ref", "status", "marker", "latest", "route").oneOf()
    nondet pick = PROGRESS.oneOf()
    any {
      authority(v),
      baseline,
      promote(v),
      write(v),
      poll(v),
      vercel(pick),
      all { roll == 0, fault(kind, m, r, mk, d) },
      done,
    }
  }

  action step = stepWith("fixed")
  action stepNoSource = stepWith("noSource")
  action stepNoFastForward = stepWith("noFastForward")
  action stepNoLease = stepWith("noLease")
  action stepNoRecheck = stepWith("noRecheck")
  action stepSingleReadback = stepWith("singleReadback")
  action stepLenientMarker = stepWith("lenientMarker")
  action stepPendingIsFailure = stepWith("pendingIsFailure")
  action stepUnboundedPoll = stepWith("unboundedPoll")

  // promotion-leased-fast-forward-only: the only write moves the ref from
  // the baseline value it leased, a strict ancestor of C, to C.
  val leasedFastForward: bool =
    ghost.wrote implies (ghost.writeFrom == job.baseRef and strictAnc(ghost.writeFrom, C))

  // promotion-c-le-w-le-m: every source check that passed saw W <= M, and
  // C <= W is the verify job's precondition.
  val authorityChain: bool = anc(C, W) and ghost.passedMains.forall(m => anc(W, m))

  // promotion-revalidate-after-admission: the write follows the baseline and
  // a check of C <= W <= M, the tag, and Latest against the state after it.
  val revalidatedBeforeWrite: bool = ghost.wrote implies (job.baseRef != 0 and ghost.writeAuth)

  // promotion-success-requires-stable-readbacks.
  val promotedStable: bool = job.verdict == "promoted" implies and {
    env.drift == "none",
    env.deploy == "success",
    env.marker == "target",
    env.prodRef == C,
    authorityOk(env),
  }

  // website-outcome-baseline-to-target-only.
  val markerBaselineToTarget: bool = job.verdict == "promoted" implies not(ghost.obsBad)

  // promotion-eventual-promotion-or-stuck-evidence, bounded: a verdict within
  // BOUND production steps, and every stuck verdict explained.
  val boundedVerdict: bool = job.steps <= BOUND and (job.steps == BOUND implies job.verdict != "none")
  val stuckHasEvidence: bool = job.verdict == "stuck" implies (REASONS.contains(job.reason) and ghost.witness)
}

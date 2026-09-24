// One allow-once grant in the approval broker (src/control/approval-broker.ts).
//
// Callers "a" and "b" are same-user processes that send their own use secret.
// "a" makes the request. "anon" is a caller that sends no secret, so each of
// its checks is a new identity. A check reads the grant, awaits the policy
// recheck, and then claims the grant, so it is split into checkBegin and
// checkEnd, and other actions may run while it waits. A crash gives the
// process a new secret. The owner decides, the holder releases, time passes,
// and the policy may change under any of them.
module approvals {
  type Id = { who: str, gen: int }

  pure val CALLERS: Set[str] = Set("a", "b", "anon")
  pure val PROCESSES: Set[str] = Set("a", "b")
  pure val NOBODY: Id = { who: "", gen: 0 }

  // "fixed" is the broker as merged. The other variants reproduce defects:
  // "shared" is the broker before D13, whose allowed lease any caller could
  // check again; "firstCheck" is the first D13 fix, which ignored the
  // request's secret and bound the grant at its first allowed check, so a
  // caller that learned the id could take it; "admitBeforeAwait" claims
  // without admitting the caller again after the recheck, so two racing
  // checks can both claim.
  type Variant = str

  type Flight = { active: bool, id: Id, awaiting: bool, immediate: str }
  pure val IDLE: Flight = { active: false, id: NOBODY, awaiting: false, immediate: "" }

  // pending, allowed, denied, invalid, or gone (cancelled or expired).
  var status: str
  // The request carried the requester's use secret.
  var bound: bool
  var requester: Id
  var holder: Id
  // An allowed check bound the grant to its caller.
  var claimed: bool
  // How often the policy changed. It drifts away and back at most once.
  var drift: int
  var gen: str -> int
  var anonSeq: int
  var flight: str -> Flight
  // The response of the last action, or "" when it delivered none.
  var response: str
  // Every identity that ever received an allowed response for this grant.
  var allowedTo: Set[Id]

  def policyOk: bool = drift % 2 == 0

  pure def admits(h: Id, caller: Id): bool = h == NOBODY or h == caller

  // The requester "a" asks for the grant, with or without its use secret.
  action init = {
    nondet withSecret = Set(true, false).oneOf()
    val caller = { who: "a", gen: 0 }
    all {
      status' = "pending",
      bound' = withSecret,
      requester' = caller,
      holder' = if (withSecret) caller else NOBODY,
      claimed' = false,
      drift' = 0,
      gen' = PROCESSES.mapBy(_ => 0),
      anonSeq' = 0,
      flight' = CALLERS.mapBy(_ => IDLE),
      response' = "pending",
      allowedTo' = Set(),
    }
  }

  // The holder that admission compares against. The broker before D13 kept
  // none, and the first-check variant ignores a binding made at request time.
  def effectiveHolder(v: Variant): Id =
    if (v == "shared") NOBODY
    else if (v == "firstCheck" and not(claimed)) NOBODY
    else holder

  action unchangedGrant = all {
    status' = status, bound' = bound, requester' = requester, holder' = holder, claimed' = claimed,
  }

  // The owner decides. Only a listed request takes the decision; one that is
  // answered or gone refuses it as stale.
  action decide(allow: bool): bool = all {
    if (status == "pending" and not(allow)) all {
      status' = "denied", bound' = bound, requester' = requester, holder' = holder, claimed' = claimed,
      response' = "decided",
    } else if (status == "pending" and policyOk) all {
      status' = "allowed", bound' = bound, requester' = requester, holder' = holder, claimed' = claimed,
      response' = "decided",
    } else all {
      unchangedGrant,
      response' = "stale",
    },
    drift' = drift, gen' = gen, anonSeq' = anonSeq, flight' = flight, allowedTo' = allowedTo,
  }

  // The synchronous part of check(): look the grant up, admit the caller, and
  // start the policy recheck when the grant is pending or allowed.
  action checkBegin(v: Variant, c: str): bool = all {
    not(flight.get(c).active),
    val caller = if (c == "anon") { who: "anon", gen: anonSeq } else { who: c, gen: gen.get(c) }
    val admitted = admits(effectiveHolder(v), caller)
    val live = status == "pending" or status == "allowed"
    val immediate =
      if (status == "gone" or not(admitted)) "expired"
      else if (live) ""
      else status
    flight' = flight.set(c, { active: true, id: caller, awaiting: admitted and live, immediate: immediate }),
    anonSeq' = if (c == "anon") anonSeq + 1 else anonSeq,
    unchangedGrant,
    response' = "",
    drift' = drift, gen' = gen, allowedTo' = allowedTo,
  }

  // The rest of check() after the recheck resolves with the current policy.
  action checkEnd(v: Variant, c: str): bool = all {
    flight.get(c).active,
    val f = flight.get(c)
    val current = effectiveHolder(v)
    val admittedNow = v == "admitBeforeAwait" or admits(current, f.id)
    val claims = v != "shared" and current == NOBODY
    if (not(f.awaiting)) all {
      unchangedGrant, response' = f.immediate, allowedTo' = allowedTo,
    } else if (status == "gone") all {
      unchangedGrant, response' = "expired", allowedTo' = allowedTo,
    } else if (not(policyOk)) all {
      status' = "invalid", bound' = bound, requester' = requester, holder' = holder, claimed' = claimed,
      response' = "invalid", allowedTo' = allowedTo,
    } else if (status == "allowed" and not(admittedNow)) all {
      unchangedGrant, response' = "expired", allowedTo' = allowedTo,
    } else if (status == "allowed") all {
      status' = status, bound' = bound, requester' = requester,
      holder' = if (claims) f.id else holder,
      claimed' = (claimed or claims),
      response' = "allowed",
      allowedTo' = allowedTo.union(Set(f.id)),
    } else all {
      unchangedGrant, response' = status, allowedTo' = allowedTo,
    },
    flight' = flight.set(c, IDLE),
    drift' = drift, gen' = gen, anonSeq' = anonSeq,
  }

  // The process restarts with a new use secret, at most twice per trace. A
  // check it left in flight still completes inside the broker.
  action crash(p: str): bool = all {
    gen.get(p) < 2,
    gen' = gen.set(p, gen.get(p) + 1),
    unchangedGrant,
    response' = "",
    drift' = drift, anonSeq' = anonSeq, flight' = flight, allowedTo' = allowedTo,
  }

  // releaseApproval cancels the id and digest. It is idempotent, and the
  // model releases a live grant only, so traces spend their steps on checks.
  action cancel: bool = all {
    status != "gone",
    status' = "gone", bound' = bound, requester' = requester, holder' = holder, claimed' = claimed,
    response' = "cancelled",
    drift' = drift, gen' = gen, anonSeq' = anonSeq, flight' = flight, allowedTo' = allowedTo,
  }

  // The monotonic clock passes both the pending and the allowed deadline.
  action expire: bool = all {
    status != "gone",
    status' = "gone", bound' = bound, requester' = requester, holder' = holder, claimed' = claimed,
    response' = "",
    drift' = drift, gen' = gen, anonSeq' = anonSeq, flight' = flight, allowedTo' = allowedTo,
  }

  // The digest or decision that the policy recomputes changes, or changes back.
  action policyChange: bool = all {
    drift < 2,
    drift' = drift + 1,
    unchangedGrant,
    response' = "",
    gen' = gen, anonSeq' = anonSeq, flight' = flight, allowedTo' = allowedTo,
  }

  action stepWith(v: Variant): bool = {
    nondet c = CALLERS.oneOf()
    nondet p = PROCESSES.oneOf()
    nondet flag = Set(true, false).oneOf()
    // Grouping the disruptions keeps traces long enough for checks to race.
    any {
      decide(flag),
      checkBegin(v, c),
      checkEnd(v, c),
      any { crash(p), policyChange },
      any { cancel, expire },
    }
  }

  action step = stepWith("fixed")
  action stepShared = stepWith("shared")
  action stepFirstCheck = stepWith("firstCheck")
  action stepAdmitBeforeAwait = stepWith("admitBeforeAwait")

  // At most one identity is ever allowed to use one allow-once grant.
  val atMostOneUse: bool = allowedTo.size() <= 1

  // A grant requested with a use secret allows only that requester.
  val onlyHolderAllowed: bool = bound implies allowedTo.forall(id => id == requester)
}

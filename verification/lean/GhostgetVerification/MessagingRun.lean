/-!
The multipart messaging run journal in `src/messaging-action-store.ts`:
`assertRun` together with the structural checks of `parseRun`, and the
guarded transition `transitionMessagingRun`.

A run sends its parts in order. The accepted prefix grows by one part at a
time, the part after it is the active part, and every later part is still
unattempted. Provider message IDs are opaque numbers compared only for
equality, and `hasRevision` records whether a part carries a provider revision.
`privateOutcome` records whether a private provider outcome is present.
Timestamps are milliseconds since the epoch. Part text, digests, reply
references, delivery and read fields, and the context evidence are outside the
model because no transition changes them.

`step` is the transition with its own guards only. `transition` is the
production shape: `assertRun` of a parsed run, then `step`, then `parseRun` of
the result.
-/
namespace GhostgetVerification.MessagingRun

inductive PartState where
  | unattempted
  | claimed
  | dispatching
  | accepted
  | failedBeforeDispatch
  | failedPermanent
  | indeterminate
  deriving DecidableEq, Repr

structure Part where
  state : PartState
  msgId : Option Nat
  hasRevision : Bool
  deriving DecidableEq, Repr

inductive RunState where
  | pending
  | submitted
  | failed
  | «partial»
  | indeterminate
  deriving DecidableEq, Repr

inductive Reason where
  | contextDrift
  | prefixFreshnessUnproven
  | providerFailedBeforeDispatch
  | providerResultIndeterminate
  | journalRecoveryRequired
  deriving DecidableEq, Repr

structure Run where
  state : RunState
  proven : Nat
  observed : Nat
  possibleSubmitted : Option Nat
  privateOutcome : Bool
  terminalReason : Option Reason
  parts : List Part
  startedAt : Nat
  recordedAt : Nat
  deriving DecidableEq, Repr

/-- The reasons a `categorical-stop` event may carry. -/
inductive StopReason where
  | contextDrift
  | prefixFreshnessUnproven
  | providerFailedBeforeDispatch
  | journalRecoveryRequired
  deriving DecidableEq, Repr

def StopReason.reason : StopReason → Reason
  | .contextDrift => .contextDrift
  | .prefixFreshnessUnproven => .prefixFreshnessUnproven
  | .providerFailedBeforeDispatch => .providerFailedBeforeDispatch
  | .journalRecoveryRequired => .journalRecoveryRequired

/--
The events of `MessagingRunEventV1`. A `categoricalStop` with `permanent` set
records `failed-permanent`. An `indeterminate` with `recovery` set is the
`journal-recovery-required` variant, which carries no private outcome.
-/
inductive Event where
  | claimed (index observed time : Nat)
  | dispatching (index time : Nat)
  | accepted (index msgId : Nat) (hasRevision : Bool) (time : Nat)
  | categoricalStop (index : Nat) (permanent : Bool) (reason : StopReason) (time : Nat)
  | indeterminate (index : Nat) (recovery privateOutcome : Bool) (time : Nat)
  deriving DecidableEq, Repr

def Event.index : Event → Nat
  | .claimed index _ _ => index
  | .dispatching index _ => index
  | .accepted index _ _ _ => index
  | .categoricalStop index _ _ _ => index
  | .indeterminate index _ _ _ => index

def Event.time : Event → Nat
  | .claimed _ _ time => time
  | .dispatching _ time => time
  | .accepted _ _ _ time => time
  | .categoricalStop _ _ _ time => time
  | .indeterminate _ _ _ time => time

/-- The part-level checks of `parseRun`: only accepted parts carry provider evidence. -/
def partOk (part : Part) : Bool :=
  (part.state == .accepted) == part.msgId.isSome && (part.state == .accepted || !part.hasRevision)

/-- The provider message IDs of the accepted prefix. -/
def acceptedIds (parts : List Part) (proven : Nat) : List Nat :=
  (parts.take proven).filterMap (·.msgId)

/-- The state of the active part, the one after the accepted prefix. -/
def activeState (r : Run) : Option PartState :=
  (r.parts[r.proven]?).map (·.state)

/-- The ordered-prefix clauses of `assertRun`. -/
def prefixInvariant (r : Run) : Bool :=
  decide (1 ≤ r.parts.length) && decide (r.parts.length ≤ 8) && decide (r.proven ≤ r.parts.length)
    && decide (r.observed ≤ r.proven)
    && r.parts.all partOk
    && (r.parts.take r.proven).all (·.state == .accepted)
    && decide (acceptedIds r.parts r.proven).Nodup
    && ((r.parts.drop r.proven).drop 1).all (·.state == .unattempted)
    && (match r.possibleSubmitted with
        | .none => true
        | .some index => decide (index < r.parts.length))
    && decide (r.startedAt ≤ r.recordedAt)

/--
The private provider outcome and run-state clauses of `assertRun`, over the run
state, the accepted prefix length, the part count, and the active part's state.
-/
def stateOk (state : RunState) (proven count : Nat) (possibleSubmitted : Option Nat)
    (terminalReason : Option Reason) (privateOutcome : Bool) (active : Option PartState) : Bool :=
  (!privateOutcome
      || (state == .indeterminate && terminalReason == .some .providerResultIndeterminate
        && possibleSubmitted == .some proven && active == .some .indeterminate))
    && match state with
      | .pending =>
        decide (proven < count) && possibleSubmitted.isNone && terminalReason.isNone
          && (active == .some .unattempted || active == .some .claimed || active == .some .dispatching)
      | .submitted => proven == count && possibleSubmitted.isNone && terminalReason.isNone
      | .failed =>
        proven == 0 && possibleSubmitted.isNone
          && terminalReason != .none && terminalReason != .some .providerResultIndeterminate
          && (active == .some .failedBeforeDispatch || active == .some .failedPermanent)
      | .partial =>
        decide (1 ≤ proven) && decide (proven < count) && possibleSubmitted.isNone
          && terminalReason != .none && terminalReason != .some .providerResultIndeterminate
          && (active == .some .failedBeforeDispatch || active == .some .failedPermanent)
      | .indeterminate =>
        decide (proven < count) && possibleSubmitted == .some proven
          && (terminalReason == .some .providerResultIndeterminate
            || terminalReason == .some .journalRecoveryRequired)
          && active == .some .indeterminate

def stateInvariant (r : Run) : Bool :=
  stateOk r.state r.proven r.parts.length r.possibleSubmitted r.terminalReason r.privateOutcome (activeState r)

/-- `parseRun`'s structural checks followed by `assertRun`. -/
def invariant (r : Run) : Bool :=
  prefixInvariant r && stateInvariant r

/-- The part and run fields an event produces from the active part, or `none` when a guard throws. -/
def effect (r : Run) (current : Part) : Event → Option (Part × Run)
  | .claimed _ observed _ =>
    if current.state != .unattempted then .none
    else if observed < r.observed || r.proven < observed then .none
    else .some ({ current with state := .claimed }, { r with observed })
  | .dispatching _ _ =>
    if current.state != .claimed then .none
    else .some ({ current with state := .dispatching }, r)
  | .accepted _ msgId hasRevision _ =>
    if current.state != .dispatching then .none
    else
      let proven := r.proven + 1
      .some ({ current with state := .accepted, msgId := .some msgId, hasRevision },
        { r with proven, state := if proven == r.parts.length then .submitted else r.state })
  | .categoricalStop _ permanent reason _ =>
    if current.state != .unattempted && current.state != .claimed then .none
    else .some ({ current with state := if permanent then .failedPermanent else .failedBeforeDispatch },
      { r with
        state := if r.proven == 0 then .failed else .partial
        terminalReason := .some reason.reason })
  | .indeterminate index recovery privateOutcome _ =>
    if current.state != .dispatching && current.state != .claimed then .none
    else if !recovery && privateOutcome && current.state != .dispatching then .none
    else .some ({ current with state := .indeterminate },
      { r with
        state := .indeterminate
        possibleSubmitted := .some index
        terminalReason := .some (if recovery then .journalRecoveryRequired else .providerResultIndeterminate)
        privateOutcome := !recovery && privateOutcome })

/-- The guards and update of `transitionMessagingRun`, without its two parses. -/
def step (r : Run) (e : Event) : Option Run :=
  if r.state != .pending || e.index != r.proven then .none else
  match r.parts[e.index]? with
  | .none => .none
  | .some current =>
    match effect r current e with
    | .none => .none
    | .some (part, next) =>
      if e.time < r.recordedAt then .none
      else .some { next with parts := r.parts.set e.index part, recordedAt := e.time }

/-- `transitionMessagingRun`: check the current run, apply the guarded step, parse the result. -/
def transition (r : Run) (e : Event) : Option Run :=
  if invariant r then
    match step r e with
    | .some next => if invariant next then .some next else .none
    | .none => .none
  else .none

/--
The one guarded step whose result the final `parseRun` rejects: an accepted
part whose provider message ID repeats an ID already in the accepted prefix.
-/
def recheckRejects (r : Run) : Event → Bool
  | .accepted _ msgId _ _ => (acceptedIds r.parts r.proven).contains msgId
  | _ => false

/-! ## Inductiveness of the guarded step -/

/-- `invariant` of a run whose parts split after the accepted prefix. -/
theorem invariant_view (r : Run) (pre post : List Part) (hparts : r.parts = pre ++ post)
    (hproven : r.proven = pre.length) :
    invariant r = true ↔
      (1 ≤ pre.length + post.length ∧ pre.length + post.length ≤ 8 ∧ r.observed ≤ pre.length
        ∧ (∀ p ∈ pre, partOk p = true) ∧ (∀ p ∈ post, partOk p = true)
        ∧ (∀ p ∈ pre, p.state = .accepted) ∧ (pre.filterMap (·.msgId)).Nodup
        ∧ (∀ p ∈ post.tail, p.state = .unattempted)
        ∧ (∀ i, r.possibleSubmitted = some i → i < pre.length + post.length)
        ∧ r.startedAt ≤ r.recordedAt)
      ∧ stateOk r.state pre.length (pre.length + post.length) r.possibleSubmitted r.terminalReason
          r.privateOutcome (post.head?.map (·.state)) = true := by
  obtain ⟨state, proven, observed, possible, priv, reason, parts, startedAt, recordedAt⟩ := r
  simp only at hparts hproven
  subst hparts hproven
  have hhead : (pre ++ post)[pre.length]? = post.head? := by
    cases post <;> simp
  have hdrop : ((pre ++ post).drop pre.length).drop 1 = post.tail := by
    simp
  simp only [invariant, prefixInvariant, stateInvariant, activeState, acceptedIds, hhead, hdrop,
    List.take_left', List.length_append, Bool.and_eq_true, decide_eq_true_eq, List.all_eq_true,
    List.mem_append, beq_iff_eq]
  cases possible <;> simp [or_imp, forall_and, and_assoc]

theorem set_middle {α : Type} (pre post : List α) (x y : α) :
    (pre ++ x :: post).set pre.length y = pre ++ y :: post := by
  simp

theorem split_at_active (parts : List Part) (proven : Nat) (current : Part)
    (hget : parts[proven]? = some current) :
    ∃ pre post, parts = pre ++ current :: post ∧ proven = pre.length := by
  have hlt : proven < parts.length := by
    rcases Nat.lt_or_ge proven parts.length with h | h
    · exact h
    · simp [List.getElem?_eq_none h] at hget
  refine ⟨parts.take proven, parts.drop (proven + 1), ?_, ?_⟩
  · have hc : parts[proven] = current := by simp_all
    rw [← hc, ← List.drop_eq_getElem_cons hlt, List.take_append_drop]
  · simp; omega

/-- Unpack a guarded step into the split parts, the active part, and the effect. -/
theorem step_some (r next : Run) (e : Event) (hs : step r e = some next) :
    ∃ pre post current part next', r.state = .pending ∧ r.parts = pre ++ current :: post
      ∧ r.proven = pre.length ∧ e.index = pre.length ∧ r.recordedAt ≤ e.time
      ∧ effect r current e = some (part, next')
      ∧ next = { next' with parts := pre ++ part :: post, recordedAt := e.time } := by
  unfold step at hs
  split at hs
  · cases hs
  rename_i hguard
  simp only [Bool.or_eq_true, bne_iff_ne, ne_eq, not_or, Decidable.not_not] at hguard
  obtain ⟨hpend, hidx⟩ := hguard
  split at hs
  · cases hs
  rename_i current hget
  split at hs
  · cases hs
  rename_i part next' heff
  split at hs
  · cases hs
  rename_i htime
  cases hs
  rw [hidx] at hget ⊢
  obtain ⟨pre, post, hparts, hproven⟩ := split_at_active r.parts r.proven current hget
  refine ⟨pre, post, current, part, next', hpend, hparts, hproven, by omega, by omega, heff, ?_⟩
  rw [hparts, hproven, set_middle]

theorem step_preserves_invariant (r next : Run) (e : Event) (inv : invariant r = true)
    (hr : recheckRejects r e = false) (hs : step r e = some next) : invariant next = true := by
  obtain ⟨pre, post, current, part, next', hpend, hparts, hproven, hidx, htime, heff, rfl⟩ :=
    step_some r next e hs
  have hv := (invariant_view r pre (current :: post) hparts hproven).1 inv
  obtain ⟨⟨_, hlen8, hobs, hpre, hpost, hacc, hnodup, hun, _, htimes⟩, hstate⟩ := hv
  simp only [List.forall_mem_cons, List.head?_cons, Option.map_some] at hpost hstate
  obtain ⟨hcur, hpost⟩ := hpost
  rw [hpend] at hstate
  simp only [stateOk, Bool.and_eq_true, Bool.or_eq_true, Bool.not_eq_true', beq_iff_eq,
    Option.isNone_iff_eq_none, decide_eq_true_eq, Option.some.injEq, reduceCtorEq,
    false_and, or_false] at hstate
  obtain ⟨hpriv, ⟨⟨_, hposs⟩, hreason⟩, hcs⟩ := hstate
  have hmsg : current.msgId = none ∧ current.hasRevision = false := by
    rcases hcs with (h | h) | h <;> simp [partOk, h] at hcur <;> cases hm : current.msgId <;> simp_all
  obtain ⟨hmsg, hrev⟩ := hmsg
  simp only [List.tail_cons] at hun
  simp only [List.length_cons] at hlen8
  cases e with
  | claimed index obs time =>
    simp only [effect, Option.ite_none_left_eq_some, Option.some.injEq, Prod.mk.injEq] at heff
    obtain ⟨hs1, hs2, rfl, rfl⟩ := heff
    simp only [Event.index] at hidx
    apply (invariant_view _ pre _ rfl (by simpa using hproven)).2
    simp only [List.forall_mem_cons, List.tail_cons, List.head?_cons, Option.map_some, List.length_cons]
    refine ⟨⟨?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_⟩, ?_⟩
    all_goals first
      | assumption
      | omega
      | (refine ⟨?_, hpost⟩; simp [partOk, hmsg, hrev]; done)
      | (simp only [Event.time] at htime ⊢; omega)
      | (simp_all [stateOk]; done)
  | dispatching index time =>
    simp only [effect, Option.ite_none_left_eq_some, Option.some.injEq, Prod.mk.injEq] at heff
    obtain ⟨hs1, rfl, rfl⟩ := heff
    simp only [Event.index] at hidx
    apply (invariant_view _ pre _ rfl (by simpa using hproven)).2
    simp only [List.forall_mem_cons, List.tail_cons, List.head?_cons, Option.map_some, List.length_cons]
    refine ⟨⟨?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_⟩, ?_⟩
    all_goals first
      | assumption
      | omega
      | (refine ⟨?_, hpost⟩; simp [partOk, hmsg, hrev]; done)
      | (simp only [Event.time] at htime ⊢; omega)
      | (simp_all [stateOk]; done)
  | categoricalStop index permanent reason time =>
    simp only [effect, Option.ite_none_left_eq_some, Option.some.injEq, Prod.mk.injEq] at heff
    obtain ⟨hs1, rfl, rfl⟩ := heff
    simp only [Event.index] at hidx
    apply (invariant_view _ pre _ rfl (by simpa using hproven)).2
    simp only [List.forall_mem_cons, List.tail_cons, List.head?_cons, Option.map_some, List.length_cons]
    refine ⟨⟨?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_⟩, ?_⟩
    all_goals first
      | assumption
      | omega
      | (refine ⟨?_, hpost⟩; simp [partOk, hmsg, hrev]; done)
      | (simp only [Event.time] at htime ⊢; omega)
      | (refine ⟨?_, hpost⟩; cases permanent <;> simp [partOk, hmsg, hrev]; done)
      | (cases permanent <;> cases reason <;> cases hp : pre <;> simp_all [stateOk, StopReason.reason]; done)
  | indeterminate index recovery privateOutcome time =>
    simp only [effect, Option.ite_none_left_eq_some, Option.some.injEq, Prod.mk.injEq] at heff
    obtain ⟨hs1, hs2, rfl, rfl⟩ := heff
    simp only [Event.index] at hidx
    apply (invariant_view _ pre _ rfl (by simpa using hproven)).2
    simp only [List.forall_mem_cons, List.tail_cons, List.head?_cons, Option.map_some, List.length_cons]
    refine ⟨⟨?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_⟩, ?_⟩
    all_goals first
      | assumption
      | omega
      | (refine ⟨?_, hpost⟩; simp [partOk, hmsg, hrev]; done)
      | (simp only [Event.time] at htime ⊢; omega)
      | (cases recovery <;> cases privateOutcome <;> simp_all [stateOk]; done)
  | accepted index msgId hasRevision time =>
    simp only [effect, Option.ite_none_left_eq_some, Option.some.injEq, Prod.mk.injEq] at heff
    obtain ⟨hs1, rfl, rfl⟩ := heff
    simp only [Event.index, Event.time] at hidx htime ⊢
    simp only [recheckRejects, acceptedIds, hparts, hproven, List.take_left'] at hr
    have hfresh : ∀ x ∈ pre, x.msgId ≠ some msgId := by
      intro x hx hm
      have : msgId ∈ pre.filterMap (·.msgId) := List.mem_filterMap.2 ⟨x, hx, hm⟩
      simp_all
    have hnd : ((pre ++ [{ current with state := .accepted, msgId := some msgId, hasRevision }]).filterMap
        (fun p : Part => p.msgId)).Nodup := by
      simp only [List.filterMap_append]
      rw [List.nodup_append]
      refine ⟨hnodup, by simp, ?_⟩
      intro a ha b hb
      have hb' : b = msgId := by simpa using hb
      subst hb'
      intro hab
      subst hab
      obtain ⟨x, hx, hm⟩ := List.mem_filterMap.1 ha
      exact hfresh x hx hm
    apply (invariant_view _ (pre ++ [{ current with state := .accepted, msgId := some msgId, hasRevision }])
      post (by simp) (by simp [hproven])).2
    simp only [List.length_append, List.length_singleton, List.mem_append, List.mem_singleton]
    refine ⟨⟨by omega, by omega, by omega, ?_, hpost, ?_, hnd, ?_, by simp [hposs], Nat.le_trans htimes htime⟩, ?_⟩
    · intro p hp
      rcases hp with hp | rfl
      · exact hpre p hp
      · simp [partOk]
    · intro p hp
      rcases hp with hp | rfl
      · exact hacc p hp
      · rfl
    · intro p hp
      exact hun p (List.mem_of_mem_tail hp)
    · cases post with
      | nil => simp [stateOk, hpriv, hposs, hreason, hproven, hparts]
      | cons head tail =>
        have hh := hun head (by simp)
        simp [stateOk, hpriv, hposs, hreason, hproven, hpend, hh, hparts]

/-- A repeated provider message ID does break the invariant, so the final parse is load-bearing. -/
theorem step_rechecked_breaks (r next : Run) (e : Event)
    (hr : recheckRejects r e = true) (hs : step r e = some next) : invariant next = false := by
  obtain ⟨pre, post, current, part, next', _, hparts, hproven, _, _, heff, rfl⟩ := step_some r next e hs
  cases e with
  | accepted index msgId hasRevision time =>
    simp only [effect, Option.ite_none_left_eq_some, Option.some.injEq, Prod.mk.injEq] at heff
    obtain ⟨_, rfl, rfl⟩ := heff
    simp only [recheckRejects, acceptedIds, hparts, hproven, List.take_left', List.contains_iff_mem,
      List.mem_filterMap] at hr
    obtain ⟨x, hx, hm⟩ := hr
    cases hn : invariant _
    · rfl
    · have hv := (invariant_view _ (pre ++ [{ current with state := .accepted, msgId := some msgId, hasRevision }])
        post (by simp) (by simp [hproven])).1 hn
      have hnd := hv.1.2.2.2.2.2.2.1
      simp only [List.filterMap_append, List.nodup_append] at hnd
      exact absurd (hnd.2.2 msgId (List.mem_filterMap.2 ⟨x, hx, hm⟩) msgId (by simp)) (by simp)
  | _ => simp [recheckRejects] at hr

/-- On a checked run the final `parseRun` rejects a guarded step exactly when `recheckRejects` holds. -/
theorem step_invariant_iff (r next : Run) (e : Event) (inv : invariant r = true)
    (hs : step r e = some next) : invariant next = true ↔ recheckRejects r e = false := by
  constructor
  · intro hn
    cases hr : recheckRejects r e
    · rfl
    · simp [step_rechecked_breaks r next e hr hs] at hn
  · intro hr
    exact step_preserves_invariant r next e inv hr hs

/-- Every run `transitionMessagingRun` returns satisfies `assertRun` and the checks of `parseRun`. -/
theorem transition_preserves_invariant (r next : Run) (e : Event)
    (hs : transition r e = some next) : invariant next = true := by
  unfold transition at hs
  split at hs
  · split at hs
    · split at hs
      · cases hs; assumption
      · cases hs
    · cases hs
  · cases hs

/-- Outside a repeated provider message ID, the final parse never rejects: `transition` is `step`. -/
theorem transition_eq_step (r : Run) (e : Event) (inv : invariant r = true)
    (hr : recheckRejects r e = false) : transition r e = step r e := by
  unfold transition
  simp only [inv, ite_true]
  cases hs : step r e with
  | none => rfl
  | some next => simp [step_preserves_invariant r next e inv hr hs]

/--
Only a pending run moves. The part count is fixed, the accepted prefix grows by
at most one part and never changes, the observed prefix count never falls, and
time never runs backward.
-/
theorem step_prefix_monotone (r next : Run) (e : Event) (hs : step r e = some next) :
    r.state = .pending ∧ next.parts.length = r.parts.length ∧ r.proven ≤ next.proven
      ∧ next.proven ≤ r.proven + 1 ∧ r.observed ≤ next.observed
      ∧ next.parts.take r.proven = r.parts.take r.proven ∧ r.recordedAt ≤ next.recordedAt := by
  obtain ⟨pre, post, current, part, next', hpend, hparts, hproven, _, htime, heff, rfl⟩ :=
    step_some r next e hs
  cases e <;> simp only [effect, Option.ite_none_left_eq_some, Option.some.injEq, Prod.mk.injEq] at heff
  all_goals first
    | obtain ⟨_, hs2, rfl, rfl⟩ := heff
    | obtain ⟨_, rfl, rfl⟩ := heff
  all_goals
    simp only [Event.time] at htime ⊢
    simp_all
  all_goals omega

/-! ## Seeded defects -/

/-- Seeded defect: record an accepted part without advancing the accepted prefix. -/
def stepAcceptNoAdvance (r : Run) (e : Event) : Option Run :=
  match e with
  | .accepted .. =>
    match step r e with
    | .some next => .some { next with proven := r.proven, state := r.state }
    | .none => .none
  | _ => step r e

/-- Seeded defect: drop the lower bound on a claim's observed accepted prefix. -/
def stepObservedRegress (r : Run) (e : Event) : Option Run :=
  match e with
  | .claimed .. => step { r with observed := 0 } e
  | _ => step r e

/-- A two-part run whose first part crossed dispatch. -/
def sampleDispatching : Run :=
  { state := .pending, proven := 0, observed := 0, possibleSubmitted := .none, privateOutcome := false,
    terminalReason := .none,
    parts := [{ state := .dispatching, msgId := .none, hasRevision := false },
      { state := .unattempted, msgId := .none, hasRevision := false }],
    startedAt := 0, recordedAt := 0 }

/-- A two-part run whose first part was accepted and observed. -/
def sampleOneAccepted : Run :=
  { sampleDispatching with
    proven := 1, observed := 1,
    parts := [{ state := .accepted, msgId := .some 1, hasRevision := false },
      { state := .unattempted, msgId := .none, hasRevision := false }] }

/-- `step_preserves_invariant` rejects an accepted part that leaves the prefix where it was. -/
theorem stepAcceptNoAdvance_violates_step_preserves_invariant :
    ¬ ∀ (r next : Run) (e : Event), invariant r = true → recheckRejects r e = false →
      stepAcceptNoAdvance r e = some next → invariant next = true := by
  intro h
  have := h sampleDispatching _ (.accepted 0 7 false 0) (by decide) (by decide) rfl
  exact absurd this (by decide)

/-- `step_prefix_monotone` rejects a claim whose observed prefix falls. -/
theorem stepObservedRegress_violates_step_prefix_monotone :
    ¬ ∀ (r next : Run) (e : Event), stepObservedRegress r e = some next →
      r.state = .pending ∧ next.parts.length = r.parts.length ∧ r.proven ≤ next.proven
        ∧ next.proven ≤ r.proven + 1 ∧ r.observed ≤ next.observed
        ∧ next.parts.take r.proven = r.parts.take r.proven ∧ r.recordedAt ≤ next.recordedAt := by
  intro h
  have := h sampleOneAccepted _ (.claimed 1 0 0) rfl
  exact absurd this.2.2.2.2.1 (by decide)

end GhostgetVerification.MessagingRun

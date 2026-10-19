/-!
The confirmed-write run journal in `src/run-journal.ts`: `assertJournalInvariants`
together with the dispatch bounds of `parseDispatch`, and the guarded
transition `transitionRunJournal` that `src/runtime.ts` drives through
`updateRunJournal`.

The model keeps every field that the invariant or a transition guard reads.
Timestamps are milliseconds since the epoch. Run IDs and intent hashes are
opaque numbers compared only for equality. `publishR3Web` stands for the
conjunction `operation = "posts.publish"`, `risk = "R3"`, and
`contract.transport = "web-session-api"`, which the invariant and the
successor guard only ever read together. `ledgerPath` records whether the
ledger path is set. Adapter, auth, owner identity, digests, the final origin,
the error text, and the 64 KiB byte bound are outside the model.

`step` is the transition with its own guards only. `transition` is the
production shape: `parseRunJournal` of the current value, then `step`, then
`parseRunJournal` of the result.
-/
namespace GhostgetVerification.RunJournal

inductive Phase where
  | prepared
  | claimed
  | ready
  | dispatching
  | terminal
  deriving DecidableEq, Repr

inductive Status where
  | pending
  | succeeded
  | submitted
  | failed
  | «partial»
  | indeterminate
  deriving DecidableEq, Repr

inductive PlanState where
  | available
  | consumed
  deriving DecidableEq, Repr

inductive LedgerState where
  | unclaimed
  | pending
  | succeeded
  | «partial»
  | indeterminate
  | released
  deriving DecidableEq, Repr

inductive RecoveryState where
  | absent
  | present
  | retained
  | released
  deriving DecidableEq, Repr

/-- `assetState`; `noAssets` is the TypeScript `"none"`. -/
inductive AssetState where
  | noAssets
  | bound
  | retained
  | released
  deriving DecidableEq, Repr

structure Successor where
  intentHash : Nat
  sourceRunId : Nat
  runId : Nat
  claimedAt : Nat
  deriving DecidableEq, Repr

structure Journal where
  revision : Nat
  runId : Nat
  publishR3Web : Bool
  /-- The source run ID of `duplicateIntent`, when present. -/
  duplicateIntent : Option Nat
  successor : Option Successor
  planHasAssets : Bool
  planState : PlanState
  phase : Phase
  status : Status
  planned : Nat
  started : Nat
  verified : Nat
  ledgerPath : Bool
  ledgerState : LedgerState
  recoveryState : RecoveryState
  assetState : AssetState
  startedAt : Nat
  updatedAt : Nat
  dedupeExpiresAt : Nat
  leaseUntil : Nat
  deriving DecidableEq, Repr

/-- The statuses a `finished` event may carry. -/
inductive Outcome where
  | succeeded
  | submitted
  | failed
  | «partial»
  | indeterminate
  deriving DecidableEq, Repr

def Outcome.status : Outcome → Status
  | .succeeded => .succeeded
  | .submitted => .submitted
  | .failed => .failed
  | .partial => .partial
  | .indeterminate => .indeterminate

/-- The `outcome` of a `recovery-released` event; `unstated` is an omitted field. -/
inductive Reconciled where
  | unstated
  | applied
  | notApplied
  deriving DecidableEq, Repr

inductive Event where
  | confirmationConsumed (time : Nat)
  | ledgerClaimed (time : Nat)
  | recoveryStored (time : Nat)
  | dispatchStarted (index time : Nat)
  | dispatchVerified (index time : Nat)
  | finished (outcome : Outcome) (noOp : Bool) (time : Nat)
  | recoveryReleased (outcome : Reconciled) (time : Nat)
  | leaseRenewed (leaseUntil time : Nat)
  | successorClaimed (intentHash runId time : Nat)
  deriving DecidableEq, Repr

def Event.time : Event → Nat
  | .confirmationConsumed time => time
  | .ledgerClaimed time => time
  | .recoveryStored time => time
  | .dispatchStarted _ time => time
  | .dispatchVerified _ time => time
  | .finished _ _ time => time
  | .recoveryReleased _ time => time
  | .leaseRenewed _ time => time
  | .successorClaimed _ _ time => time

/-- Recovery and assets after release: `retained` recovery keeps retained assets. -/
def settledAssets (j : Journal) (asset : AssetState) : Bool :=
  if j.planHasAssets then j.assetState == asset else j.assetState == .noAssets

/-- The terminal clauses of `assertJournalInvariants`. -/
def terminalInvariant (j : Journal) : Bool :=
  match j.status with
  | .pending => false
  | .failed =>
    j.started == 0 && j.verified == 0 && j.ledgerState == .released && j.recoveryState == .released
      && (if j.planState == .available then j.assetState == .noAssets else settledAssets j .released)
  | .succeeded | .submitted =>
    ((j.started == j.planned && j.verified == j.planned)
        || (j.status == .succeeded && j.started == 0 && j.verified == 0))
      && j.planState == .consumed && j.ledgerState == .succeeded && j.recoveryState == .released
      && settledAssets j .released
  | .partial =>
    decide (1 ≤ j.verified) && j.planState == .consumed && j.started == j.verified
      && decide (j.verified < j.planned)
      && (j.ledgerState == .partial || (j.ledgerState == .released && j.recoveryState == .released))
      && (j.recoveryState == .retained || j.recoveryState == .released)
      && settledAssets j (if j.recoveryState == .retained then .retained else .released)
  | .indeterminate =>
    decide (1 ≤ j.started) && j.planState == .consumed
      && (j.ledgerState == .indeterminate || (j.ledgerState == .released && j.recoveryState == .released))
      && (j.recoveryState == .retained || j.recoveryState == .released)
      && settledAssets j (if j.recoveryState == .retained then .retained else .released)

/-- The phase clauses of `assertJournalInvariants`. -/
def phaseInvariant (j : Journal) : Bool :=
  match j.phase with
  | .prepared =>
    j.status == .pending && !j.ledgerPath && j.ledgerState == .unclaimed && j.recoveryState == .absent
      && (if j.planState == .available then j.assetState == .noAssets
          else j.assetState == .noAssets || j.assetState == .bound)
      && j.started == 0 && j.verified == 0
  | .claimed =>
    j.status == .pending && j.planState == .consumed && j.ledgerPath && j.ledgerState == .pending
      && j.recoveryState == .absent && j.started == 0 && j.verified == 0
  | .ready =>
    j.status == .pending && j.planState == .consumed && j.ledgerPath && j.ledgerState == .pending
      && j.recoveryState == .present && j.started == 0 && j.verified == 0
  | .dispatching =>
    j.status == .pending && j.planState == .consumed && j.ledgerPath && j.ledgerState == .pending
      && j.recoveryState == .present && decide (1 ≤ j.started)
  | .terminal => terminalInvariant j

/-- The `duplicateIntent` clause: a duplicate names another run of a single-item R3 web publish. -/
def duplicateOk (duplicateIntent : Option Nat) (runId : Nat) (publishR3Web : Bool) (planned : Nat) : Bool :=
  match duplicateIntent with
  | .none => true
  | .some source => source != runId && publishR3Web && planned == 1

/-- `assertJournalInvariants` with the dispatch bounds of `parseDispatch`. -/
def invariant (j : Journal) : Bool :=
  decide (1 ≤ j.planned) && decide (j.planned ≤ 25) && decide (j.started ≤ j.planned)
    && decide (j.verified ≤ j.started)
    && duplicateOk j.duplicateIntent j.runId j.publishR3Web j.planned
    && (match j.successor with
        | .none => true
        | .some s =>
          s.sourceRunId == j.runId && s.runId != j.runId && decide (j.updatedAt ≤ s.claimedAt)
            && j.publishR3Web && j.phase == .terminal && j.status == .indeterminate
            && j.planned == 1 && j.started == 1 && j.ledgerState == .indeterminate
            && j.recoveryState == .retained)
    && decide (j.startedAt ≤ j.updatedAt) && decide (j.startedAt ≤ j.dedupeExpiresAt)
    && decide (j.startedAt ≤ j.leaseUntil)
    && (j.planHasAssets || j.assetState == .noAssets)
    && !(j.planHasAssets && j.planState == .available && j.assetState != .noAssets)
    && !(j.planHasAssets && j.planState == .consumed && j.phase != .terminal && j.assetState != .bound)
    && phaseInvariant j

/-- `terminalTransition`'s guards and update. -/
def finish (j : Journal) (outcome : Outcome) (noOp : Bool) (time : Nat) : Option Journal :=
  if j.phase == .terminal then .none
  else if outcome == .failed && j.started != 0 then .none
  else if (outcome == .succeeded || outcome == .submitted)
      && !((outcome == .succeeded && noOp && j.started == 0 && j.verified == 0)
        || (!noOp && j.started == j.planned && j.verified == j.planned)) then .none
  else if outcome == .partial
      && !(decide (0 < j.verified) && j.started == j.verified && decide (j.verified < j.planned)) then .none
  else if outcome == .indeterminate && j.started == 0 then .none
  else
    let retains := outcome == .partial || outcome == .indeterminate
    .some { j with
      revision := j.revision + 1
      phase := .terminal
      status := outcome.status
      ledgerState := match outcome with
        | .succeeded | .submitted => .succeeded
        | .partial => .partial
        | .indeterminate => .indeterminate
        | .failed => .released
      recoveryState := if retains then .retained else .released
      assetState := if j.assetState == .noAssets then .noAssets else if retains then .retained else .released
      updatedAt := time }

/-- The guards and update of `transitionRunJournal`, without its two `parseRunJournal` calls. -/
def step (j : Journal) (e : Event) : Option Journal :=
  if e.time < j.updatedAt then .none else
  match e with
  | .finished outcome noOp time => finish j outcome noOp time
  | .successorClaimed intentHash runId time =>
    match j.successor with
    | .some s => if s.intentHash == intentHash && s.runId == runId then .some j else .none
    | .none =>
      if !(j.publishR3Web && j.phase == .terminal && j.status == .indeterminate && j.planned == 1
          && j.started == 1 && j.ledgerState == .indeterminate && j.recoveryState == .retained) then .none
      else .some { j with
        revision := j.revision + 1
        successor := .some { intentHash, sourceRunId := j.runId, runId, claimedAt := time } }
  | .recoveryReleased outcome _ =>
    if j.successor.isSome then .none
    else if !(j.phase == .terminal && (j.status == .partial || j.status == .indeterminate)) then .none
    else
      let releaseLedger := outcome == .notApplied
      if releaseLedger && j.verified != 0 then .none
      else if j.recoveryState == .released then
        if releaseLedger == (j.ledgerState == .released) then .some j else .none
      else .some { j with
        revision := j.revision + 1
        ledgerState := if releaseLedger then .released else j.ledgerState
        recoveryState := .released
        assetState := if j.assetState == .retained then .released else .noAssets }
  | .confirmationConsumed time =>
    if j.phase == .terminal then .none
    else if !(j.phase == .prepared && j.planState == .available) then .none
    else .some { j with
      revision := j.revision + 1
      planState := .consumed
      assetState := if j.planHasAssets then .bound else .noAssets
      updatedAt := time }
  | .ledgerClaimed time =>
    if j.phase == .terminal then .none
    else if !(j.phase == .prepared && j.planState == .consumed) then .none
    else .some { j with
      revision := j.revision + 1
      phase := .claimed
      ledgerPath := true
      ledgerState := .pending
      updatedAt := time }
  | .recoveryStored time =>
    if j.phase == .terminal then .none
    else if j.phase != .claimed then .none
    else .some { j with
      revision := j.revision + 1
      phase := .ready
      recoveryState := .present
      updatedAt := time }
  | .dispatchStarted index time =>
    if j.phase == .terminal then .none
    else if !((j.phase == .ready || j.phase == .dispatching) && index == j.started + 1
        && j.started == j.verified && decide (index ≤ j.planned)) then .none
    else .some { j with
      revision := j.revision + 1
      phase := .dispatching
      started := index
      updatedAt := time }
  | .dispatchVerified index time =>
    if j.phase == .terminal then .none
    else if !(j.phase == .dispatching && index == j.verified + 1 && index == j.started) then .none
    else .some { j with
      revision := j.revision + 1
      verified := index
      updatedAt := time }
  | .leaseRenewed leaseUntil time =>
    if j.phase == .terminal then .none
    else if leaseUntil < time then .none
    else .some { j with
      revision := j.revision + 1
      leaseUntil
      updatedAt := time }

/-- `transitionRunJournal`: parse the current journal, apply the guarded step, parse the result. -/
def transition (j : Journal) (e : Event) : Option Journal :=
  if invariant j then
    match step j e with
    | .some next => if invariant next then .some next else .none
    | .none => .none
  else .none

/--
The two guarded steps whose result the final `parseRunJournal` rejects: an
explicit no-op success before the confirmation was consumed, and a duplicate
successor that names the journal's own run.
-/
def recheckRejects (j : Journal) : Event → Bool
  | .finished .succeeded true _ => j.planState == .available
  | .successorClaimed _ runId _ => j.successor.isNone && runId == j.runId
  | _ => false

/-! ## Inductiveness of the guarded step -/

theorem invariant_startedAt (j : Journal) (inv : invariant j = true) : j.startedAt ≤ j.updatedAt := by
  simp only [invariant, Bool.and_eq_true, decide_eq_true_eq] at inv
  exact inv.1.1.1.1.1.1.2

theorem invariant_successor (j : Journal) (inv : invariant j = true) (hterm : ¬j.phase = .terminal) :
    j.successor = none := by
  cases h : j.successor with
  | none => rfl
  | some s =>
    simp only [invariant, Bool.and_eq_true, h] at inv
    have := inv.1.1.1.1.1.1.1.2
    simp_all

theorem invariant_assets (j : Journal) (inv : invariant j = true) :
    (j.planHasAssets = false → j.assetState = .noAssets)
      ∧ (j.planHasAssets = true → j.planState = .available → j.assetState = .noAssets)
      ∧ (j.planHasAssets = true → j.planState = .consumed → j.phase ≠ .terminal → j.assetState = .bound) := by
  simp only [invariant, Bool.and_eq_true] at inv
  have ha := inv.1.1.1.1.1.1.1.1.1.1.2
  have hb := inv.1.1.1.1.1.1.1.1.1.2
  have hc := inv.1.1.1.1.1.1.1.1.2
  refine ⟨fun h => ?_, fun h h' => ?_, fun h h' h'' => ?_⟩ <;> simp_all

theorem invariant_counts (j : Journal) (inv : invariant j = true) :
    1 ≤ j.planned ∧ j.planned ≤ 25 ∧ j.started ≤ j.planned ∧ j.verified ≤ j.started := by
  simp only [invariant, Bool.and_eq_true, decide_eq_true_eq] at inv
  exact ⟨inv.1.1.1.1.1.1.1.1.1.1.1.1, inv.1.1.1.1.1.1.1.1.1.1.1.2, inv.1.1.1.1.1.1.1.1.1.1.2,
    inv.1.1.1.1.1.1.1.1.1.2⟩

theorem invariant_tail (j : Journal) (inv : invariant j = true) :
    duplicateOk j.duplicateIntent j.runId j.publishR3Web j.planned = true
      ∧ j.startedAt ≤ j.dedupeExpiresAt ∧ j.startedAt ≤ j.leaseUntil := by
  simp only [invariant, Bool.and_eq_true, decide_eq_true_eq] at inv
  exact ⟨inv.1.1.1.1.1.1.1.1.2, inv.1.1.1.1.1.2, inv.1.1.1.1.2⟩

theorem finished_preserves (j next : Journal) (outcome : Outcome) (noOp : Bool) (time : Nat)
    (inv : invariant j = true) (hr : recheckRejects j (.finished outcome noOp time) = false)
    (hs : step j (.finished outcome noOp time) = some next) : invariant next = true := by
  have h0 := invariant_startedAt j inv
  have h7 := invariant_counts j inv
  have h8 := invariant_assets j inv
  have h9 := invariant_tail j inv
  unfold step at hs
  rw [Option.ite_none_left_eq_some] at hs
  obtain ⟨htime, hs⟩ := hs
  simp only [Event.time] at htime hs
  unfold finish at hs
  simp only [Option.ite_none_left_eq_some, Option.some.injEq] at hs
  obtain ⟨hterm, h3, h4, h5, h6, rfl⟩ := hs
  have h1 : j.startedAt ≤ time := by omega
  have h2 := invariant_successor j inv (by simpa using hterm)
  have h10 : j.phase ≠ .dispatching → j.started = 0 := by
    intro hd
    cases j with
    | mk _ _ _ _ _ _ _ phase => cases phase <;> simp_all [invariant, phaseInvariant]
  have h11 : j.phase ≠ .prepared → j.planState = .consumed := by
    intro hd
    cases j with
    | mk _ _ _ _ _ _ _ phase => cases phase <;> simp_all [invariant, phaseInvariant]
  clear inv
  obtain ⟨hp1, hp25, hsp, hvs⟩ := h7
  cases j with
  | mk _ _ _ _ _ hasAssets planState phase =>
    cases outcome <;> cases noOp <;> cases phase <;> cases hasAssets <;> cases planState <;>
      simp_all [invariant, phaseInvariant, terminalInvariant, settledAssets, recheckRejects, Outcome.status]
    all_goals omega

theorem successor_preserves (j next : Journal) (intentHash runId time : Nat)
    (inv : invariant j = true) (hr : recheckRejects j (.successorClaimed intentHash runId time) = false)
    (hs : step j (.successorClaimed intentHash runId time) = some next) : invariant next = true := by
  unfold step at hs
  rw [Option.ite_none_left_eq_some] at hs
  obtain ⟨htime, hs⟩ := hs
  simp only [Event.time] at htime hs
  cases hsucc : j.successor with
  | some s =>
    simp only [hsucc] at hs
    split at hs
    · cases hs; exact inv
    · cases hs
  | none =>
    simp only [hsucc, Option.ite_none_left_eq_some, Option.some.injEq] at hs
    obtain ⟨hguard, rfl⟩ := hs
    simp only [recheckRejects, hsucc, Option.isNone_none, Bool.true_and, beq_eq_false_iff_ne] at hr
    cases j
    simp_all [invariant, phaseInvariant, terminalInvariant, settledAssets]
    all_goals omega

theorem released_preserves (j next : Journal) (outcome : Reconciled) (time : Nat)
    (inv : invariant j = true)
    (hs : step j (.recoveryReleased outcome time) = some next) : invariant next = true := by
  unfold step at hs
  rw [Option.ite_none_left_eq_some] at hs
  obtain ⟨htime, hs⟩ := hs
  simp only [Event.time] at htime hs
  have h8 := invariant_assets j inv
  split at hs
  · cases hs
  split at hs
  · cases hs
  split at hs
  · cases hs
  split at hs
  · split at hs
    · cases hs; exact inv
    · cases hs
  cases hs
  cases j with
  | mk _ _ _ _ _ hasAssets planState phase status =>
    cases outcome <;> cases status <;> cases hasAssets <;> simp_all [invariant, phaseInvariant, terminalInvariant, settledAssets]
    all_goals omega

theorem consumed_preserves (j next : Journal) (time : Nat) (inv : invariant j = true)
    (hs : step j (.confirmationConsumed time) = some next) : invariant next = true := by
  have h0 := invariant_startedAt j inv
  unfold step at hs
  rw [Option.ite_none_left_eq_some] at hs
  obtain ⟨htime, hs⟩ := hs
  simp only [Event.time, Option.ite_none_left_eq_some, Option.some.injEq] at htime hs
  obtain ⟨hterm, hguard, rfl⟩ := hs
  have h1 : j.startedAt ≤ time := by omega
  have h2 := invariant_successor j inv (by simpa using hterm)
  cases j
  simp_all [invariant, phaseInvariant, terminalInvariant, settledAssets]
  all_goals omega


theorem ledger_preserves (j next : Journal) (time : Nat) (inv : invariant j = true)
    (hs : step j (.ledgerClaimed time) = some next) : invariant next = true := by
  have h0 := invariant_startedAt j inv
  unfold step at hs
  rw [Option.ite_none_left_eq_some] at hs
  obtain ⟨htime, hs⟩ := hs
  simp only [Event.time, Option.ite_none_left_eq_some, Option.some.injEq] at htime hs
  obtain ⟨hterm, hguard, rfl⟩ := hs
  have h1 : j.startedAt ≤ time := by omega
  have h2 := invariant_successor j inv (by simpa using hterm)
  cases j
  simp_all [invariant, phaseInvariant, terminalInvariant, settledAssets]
  all_goals omega

theorem stored_preserves (j next : Journal) (time : Nat) (inv : invariant j = true)
    (hs : step j (.recoveryStored time) = some next) : invariant next = true := by
  have h0 := invariant_startedAt j inv
  unfold step at hs
  rw [Option.ite_none_left_eq_some] at hs
  obtain ⟨htime, hs⟩ := hs
  simp only [Event.time, Option.ite_none_left_eq_some, Option.some.injEq] at htime hs
  obtain ⟨hterm, hguard, rfl⟩ := hs
  have h1 : j.startedAt ≤ time := by omega
  have h2 := invariant_successor j inv (by simpa using hterm)
  cases j
  simp_all [invariant, phaseInvariant, terminalInvariant, settledAssets]
  all_goals omega

theorem started_preserves (j next : Journal) (index time : Nat) (inv : invariant j = true)
    (hs : step j (.dispatchStarted index time) = some next) : invariant next = true := by
  have h0 := invariant_startedAt j inv
  unfold step at hs
  rw [Option.ite_none_left_eq_some] at hs
  obtain ⟨htime, hs⟩ := hs
  simp only [Event.time, Option.ite_none_left_eq_some, Option.some.injEq] at htime hs
  obtain ⟨hterm, hguard, rfl⟩ := hs
  have h1 : j.startedAt ≤ time := by omega
  have h2 := invariant_successor j inv (by simpa using hterm)
  cases j with
  | mk _ _ _ _ _ _ _ phase =>
    cases phase <;> simp_all [invariant, phaseInvariant, terminalInvariant, settledAssets] <;> omega

theorem verified_preserves (j next : Journal) (index time : Nat) (inv : invariant j = true)
    (hs : step j (.dispatchVerified index time) = some next) : invariant next = true := by
  have h0 := invariant_startedAt j inv
  unfold step at hs
  rw [Option.ite_none_left_eq_some] at hs
  obtain ⟨htime, hs⟩ := hs
  simp only [Event.time, Option.ite_none_left_eq_some, Option.some.injEq] at htime hs
  obtain ⟨hterm, hguard, rfl⟩ := hs
  have h1 : j.startedAt ≤ time := by omega
  have h2 := invariant_successor j inv (by simpa using hterm)
  cases j
  simp_all [invariant, phaseInvariant, terminalInvariant, settledAssets]
  all_goals omega

theorem lease_preserves (j next : Journal) (leaseUntil time : Nat) (inv : invariant j = true)
    (hs : step j (.leaseRenewed leaseUntil time) = some next) : invariant next = true := by
  have h0 := invariant_startedAt j inv
  unfold step at hs
  rw [Option.ite_none_left_eq_some] at hs
  obtain ⟨htime, hs⟩ := hs
  simp only [Event.time, Option.ite_none_left_eq_some, Option.some.injEq] at htime hs
  obtain ⟨hterm, hguard, rfl⟩ := hs
  have h1 : j.startedAt ≤ time := by omega
  have h2 := invariant_successor j inv (by simpa using hterm)
  cases j
  simp_all [invariant, phaseInvariant, terminalInvariant, settledAssets]
  all_goals omega

/--
The guarded step keeps `assertJournalInvariants` for every event except the two
that `recheckRejects` names.
-/
theorem step_preserves_invariant (j next : Journal) (e : Event) (inv : invariant j = true)
    (hr : recheckRejects j e = false) (hs : step j e = some next) : invariant next = true := by
  cases e with
  | confirmationConsumed time => exact consumed_preserves j next time inv hs
  | ledgerClaimed time => exact ledger_preserves j next time inv hs
  | recoveryStored time => exact stored_preserves j next time inv hs
  | dispatchStarted index time => exact started_preserves j next index time inv hs
  | dispatchVerified index time => exact verified_preserves j next index time inv hs
  | finished outcome noOp time => exact finished_preserves j next outcome noOp time inv hr hs
  | recoveryReleased outcome time => exact released_preserves j next outcome time inv hs
  | leaseRenewed leaseUntil time => exact lease_preserves j next leaseUntil time inv hs
  | successorClaimed intentHash runId time => exact successor_preserves j next intentHash runId time inv hr hs

/-- The two steps `recheckRejects` names do break the invariant, so the final parse is load-bearing. -/
theorem step_rechecked_breaks (j next : Journal) (e : Event) (inv : invariant j = true)
    (hr : recheckRejects j e = true) (hs : step j e = some next) : invariant next = false := by
  cases e with
  | finished outcome noOp time =>
    cases outcome <;> cases noOp <;> simp only [recheckRejects, reduceCtorEq] at hr
    have h2 := invariant_successor j inv
    unfold step at hs
    rw [Option.ite_none_left_eq_some] at hs
    obtain ⟨_, hs⟩ := hs
    unfold finish at hs
    simp only [Option.ite_none_left_eq_some, Option.some.injEq] at hs
    obtain ⟨_, _, _, _, _, rfl⟩ := hs
    cases j
    simp_all [invariant, phaseInvariant, terminalInvariant, Outcome.status]
  | successorClaimed intentHash runId time =>
    simp only [recheckRejects, Bool.and_eq_true, Option.isNone_iff_eq_none, beq_iff_eq] at hr
    obtain ⟨hnone, rfl⟩ := hr
    unfold step at hs
    rw [Option.ite_none_left_eq_some] at hs
    obtain ⟨_, hs⟩ := hs
    simp only [hnone, Option.ite_none_left_eq_some, Option.some.injEq] at hs
    obtain ⟨_, rfl⟩ := hs
    cases j
    simp_all [invariant]
  | _ => simp [recheckRejects] at hr

/-- On a valid journal the final `parseRunJournal` rejects a guarded step exactly when `recheckRejects` holds. -/
theorem step_invariant_iff (j next : Journal) (e : Event) (inv : invariant j = true)
    (hs : step j e = some next) : invariant next = true ↔ recheckRejects j e = false := by
  constructor
  · intro hn
    cases hr : recheckRejects j e
    · rfl
    · simp [step_rechecked_breaks j next e inv hr hs] at hn
  · intro hr
    exact step_preserves_invariant j next e inv hr hs

/-- Every journal `transitionRunJournal` returns satisfies `assertJournalInvariants`. -/
theorem transition_preserves_invariant (j next : Journal) (e : Event)
    (hs : transition j e = some next) : invariant next = true := by
  unfold transition at hs
  split at hs
  · split at hs
    · split at hs
      · cases hs; assumption
      · cases hs
    · cases hs
  · cases hs

/-- Outside the two `recheckRejects` steps, the final parse never rejects: `transition` is `step`. -/
theorem transition_eq_step (j : Journal) (e : Event) (inv : invariant j = true)
    (hr : recheckRejects j e = false) : transition j e = step j e := by
  unfold transition
  simp only [inv, ite_true]
  cases hs : step j e with
  | none => rfl
  | some next => simp [step_preserves_invariant j next e inv hr hs]

theorem step_frame (j next : Journal) (e : Event) (hs : step j e = some next) :
    j.updatedAt ≤ e.time ∧ j.planned = next.planned ∧ j.started ≤ next.started ∧ next.started ≤ j.started + 1
      ∧ j.verified ≤ next.verified ∧ next.verified ≤ j.verified + 1
      ∧ (next.revision = j.revision ∨ next.revision = j.revision + 1)
      ∧ j.updatedAt ≤ next.updatedAt
      ∧ (j.phase = .terminal → next.phase = .terminal ∧ next.status = j.status) := by
  unfold step at hs
  rw [Option.ite_none_left_eq_some] at hs
  obtain ⟨htime, hs⟩ := hs
  refine ⟨by omega, ?_⟩
  cases e <;> simp only [Event.time] at htime hs <;> (try unfold finish at hs) <;> (repeat' split at hs) <;>
    simp only [Option.some.injEq, reduceCtorEq] at hs <;> subst hs <;> simp_all <;> omega

/-- Dispatch counters: `planned` is fixed, and `started` and `verified` never decrease and rise by at most one. -/
theorem step_counters_monotone (j next : Journal) (e : Event) (hs : step j e = some next) :
    next.planned = j.planned ∧ j.started ≤ next.started ∧ next.started ≤ j.started + 1
      ∧ j.verified ≤ next.verified ∧ next.verified ≤ j.verified + 1 := by
  have h := step_frame j next e hs
  omega

/-- Each step bumps `revision` by one or leaves the journal's revision alone, and time never runs backward. -/
theorem step_revision_bumps (j next : Journal) (e : Event) (hs : step j e = some next) :
    (next.revision = j.revision ∨ next.revision = j.revision + 1) ∧ j.updatedAt ≤ next.updatedAt := by
  have h := step_frame j next e hs
  exact ⟨h.2.2.2.2.2.2.1, h.2.2.2.2.2.2.2.1⟩

/-- A terminal journal stays terminal with the same status. -/
theorem step_terminal_stable (j next : Journal) (e : Event) (hs : step j e = some next)
    (hterm : j.phase = .terminal) : next.phase = .terminal ∧ next.status = j.status :=
  (step_frame j next e hs).2.2.2.2.2.2.2.2 hterm

/-! ## Seeded defects -/

/-- Seeded defect: allow a `failed` finish after a dispatch started, dropping the at-most-once guard. -/
def stepFailedAfterStart (j : Journal) (e : Event) : Option Journal :=
  match e with
  | .finished .failed _ time =>
    if time < j.updatedAt || j.phase == .terminal then .none
    else .some { j with
      revision := j.revision + 1
      phase := .terminal
      status := .failed
      ledgerState := .released
      recoveryState := .released
      assetState := if j.assetState == .noAssets then .noAssets else .released
      updatedAt := time }
  | _ => step j e

/-- Seeded defect: accept any dispatch index up to `planned`, not only the next one. -/
def stepSkipIndex (j : Journal) (e : Event) : Option Journal :=
  match e with
  | .dispatchStarted index time =>
    if time < j.updatedAt || j.phase == .terminal then .none
    else if !((j.phase == .ready || j.phase == .dispatching) && j.started == j.verified
        && decide (index ≤ j.planned)) then .none
    else .some { j with revision := j.revision + 1, phase := .dispatching, started := index, updatedAt := time }
  | _ => step j e

/-- A single-item journal after its recovery record was stored. -/
def sampleReady (planned : Nat) : Journal :=
  { revision := 3, runId := 1, publishR3Web := false, duplicateIntent := .none, successor := .none,
    planHasAssets := false, planState := .consumed, phase := .ready, status := .pending, planned,
    started := 0, verified := 0, ledgerPath := true, ledgerState := .pending, recoveryState := .present,
    assetState := .noAssets, startedAt := 0, updatedAt := 0, dedupeExpiresAt := 0, leaseUntil := 0 }

/-- `step_preserves_invariant` rejects a failed finish after the first dispatch started. -/
theorem stepFailedAfterStart_violates_step_preserves_invariant :
    ¬ ∀ (j next : Journal) (e : Event), invariant j = true → recheckRejects j e = false →
      stepFailedAfterStart j e = some next → invariant next = true := by
  intro h
  let started : Journal := { sampleReady 1 with phase := .dispatching, started := 1, revision := 4 }
  have := h started _ (.finished .failed false 0) (by decide) (by decide) rfl
  exact absurd this (by decide)

/-- `step_counters_monotone` rejects a dispatch that skips an index. -/
theorem stepSkipIndex_violates_step_counters_monotone :
    ¬ ∀ (j next : Journal) (e : Event), stepSkipIndex j e = some next →
      next.planned = j.planned ∧ j.started ≤ next.started ∧ next.started ≤ j.started + 1
        ∧ j.verified ≤ next.verified ∧ next.verified ≤ j.verified + 1 := by
  intro h
  have := h (sampleReady 2) _ (.dispatchStarted 2 0) rfl
  exact absurd this.2.2.1 (by decide)

end GhostgetVerification.RunJournal

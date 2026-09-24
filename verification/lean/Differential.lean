import GhostgetVerification

/-!
The Lean side of the differential tests in `scripts/verification-lean-*.test.ts`.

The tests generate inputs, evaluate them with the production TypeScript, and
send each one here as a line of space-separated tokens. This runner parses the
line into the proved model, evaluates the model definitions that the theorems
are about, and prints one result line. A line it cannot parse prints `error`.
Strings are single tokens: the tests only generate origins, paths, and query
keys without spaces.
-/
open GhostgetVerification

abbrev Parser := StateT (List String) Option

def token : Parser String := do
  match (← get) with
  | head :: tail => set tail; pure head
  | [] => failure

def nat : Parser Nat := do
  match (← token).toNat? with
  | .some value => pure value
  | .none => failure

def flag : Parser Bool := do
  match (← token) with
  | "0" => pure false
  | "1" => pure true
  | _ => failure

def optionNat : Parser (Option Nat) := do
  match (← token) with
  | "-" => pure .none
  | text => match text.toNat? with
    | .some value => pure (.some value)
    | .none => failure

def count (limit : Nat) : Parser Nat := do
  let value ← nat
  if value ≤ limit then pure value else failure

def many {α : Type} (item : Parser α) : Nat → Parser (List α)
  | 0 => pure []
  | n + 1 => do
    let head ← item
    let tail ← many item n
    pure (head :: tail)

def choose {α : Type} (options : List (String × α)) : Parser α := do
  let text ← token
  match options.find? (·.1 == text) with
  | .some (_, value) => pure value
  | .none => failure

def natText (value : Nat) : String := toString value

def boolText (value : Bool) : String := if value then "1" else "0"

def optionText (value : Option Nat) : String :=
  match value with
  | .some n => toString n
  | .none => "-"

def nameOf {α : Type} [BEq α] (options : List (String × α)) (value : α) : String :=
  match options.find? (·.2 == value) with
  | .some (name, _) => name
  | .none => "?"

/-! ## Web policy -/

namespace WebPolicyDiff
open WebPolicy

def methods : List (String × Method) := [("GET", .get), ("HEAD", .head)]
def decisions : List (String × Decision) := [("allow", .allow), ("ask", .ask), ("deny", .deny)]
def kinds : List (String × PathKind) := [("exact", .exact), ("prefix", .pref)]

def chars : Parser (List Char) := do pure (← token).toList

def rule : Parser Rule := do
  let origin ← chars
  let kind ← choose kinds
  let path ← chars
  let methodCount ← count 2
  let ruleMethods ← many (choose methods) methodCount
  let keyCount ← count 32
  let queryKeys ← many chars keyCount
  let decision ← choose decisions
  let maxResponseBytes ← nat
  let timeoutMs ← nat
  pure ({ origin, kind, path, methods := ruleMethods, queryKeys, decision, maxResponseBytes, timeoutMs } : Rule)

def request : Parser Request := do
  let method ← choose methods
  let origin ← chars
  let path ← chars
  let keyCount ← count 32
  let queryKeys ← many chars keyCount
  pure ({ method, origin, path, queryKeys } : Request)

/-- `decision maxResponseBytes timeoutMs matchCount index... endpoint`. -/
def evaluate : Parser String := do
  let ruleCount ← count 128
  let rules ← many rule ruleCount
  let req ← request
  let indexes := matchingIndexes rules req
  let endpointText := match endpoint rules req with
    | .some path => String.ofList path
    | .none => "-"
  pure (" ".intercalate ([nameOf decisions (decideRequest rules req),
    natText (maxResponseBytes rules req), natText (timeoutMs rules req), natText indexes.length]
    ++ indexes.map natText ++ [endpointText]))

end WebPolicyDiff

/-! ## Run journal -/

namespace RunJournalDiff
open RunJournal

def phases : List (String × Phase) :=
  [("prepared", .prepared), ("claimed", .claimed), ("ready", .ready), ("dispatching", .dispatching),
    ("terminal", .terminal)]
def statuses : List (String × Status) :=
  [("pending", .pending), ("succeeded", .succeeded), ("submitted", .submitted), ("failed", .failed),
    ("partial", .partial), ("indeterminate", .indeterminate)]
def planStates : List (String × PlanState) := [("available", .available), ("consumed", .consumed)]
def ledgerStates : List (String × LedgerState) :=
  [("unclaimed", .unclaimed), ("pending", .pending), ("succeeded", .succeeded), ("partial", .partial),
    ("indeterminate", .indeterminate), ("released", .released)]
def recoveryStates : List (String × RecoveryState) :=
  [("absent", .absent), ("present", .present), ("retained", .retained), ("released", .released)]
def assetStates : List (String × AssetState) :=
  [("none", .noAssets), ("bound", .bound), ("retained", .retained), ("released", .released)]
def outcomes : List (String × Outcome) :=
  [("succeeded", .succeeded), ("submitted", .submitted), ("failed", .failed), ("partial", .partial),
    ("indeterminate", .indeterminate)]
def reconciled : List (String × Reconciled) :=
  [("unstated", .unstated), ("applied", .applied), ("not-applied", .notApplied)]

def successor : Parser (Option Successor) := do
  match (← token) with
  | "-" => pure .none
  | "s" =>
    let intentHash ← nat
    let sourceRunId ← nat
    let runId ← nat
    let claimedAt ← nat
    pure (.some ({ intentHash, sourceRunId, runId, claimedAt } : Successor))
  | _ => failure

def journal : Parser Journal := do
  let revision ← nat
  let runId ← nat
  let publishR3Web ← flag
  let duplicateIntent ← optionNat
  let successor ← successor
  let planHasAssets ← flag
  let planState ← choose planStates
  let phase ← choose phases
  let status ← choose statuses
  let planned ← nat
  let started ← nat
  let verified ← nat
  let ledgerPath ← flag
  let ledgerState ← choose ledgerStates
  let recoveryState ← choose recoveryStates
  let assetState ← choose assetStates
  let startedAt ← nat
  let updatedAt ← nat
  let dedupeExpiresAt ← nat
  let leaseUntil ← nat
  pure (Journal.mk revision runId publishR3Web duplicateIntent successor planHasAssets planState phase
    status planned started verified ledgerPath ledgerState recoveryState assetState startedAt updatedAt
    dedupeExpiresAt leaseUntil)

def event : Parser Event := do
  match (← token) with
  | "confirmation-consumed" => return .confirmationConsumed (← nat)
  | "ledger-claimed" => return .ledgerClaimed (← nat)
  | "recovery-stored" => return .recoveryStored (← nat)
  | "dispatch-started" =>
    let index ← nat
    return .dispatchStarted index (← nat)
  | "dispatch-verified" =>
    let index ← nat
    return .dispatchVerified index (← nat)
  | "finished" =>
    let outcome ← choose outcomes
    let noOp ← flag
    return .finished outcome noOp (← nat)
  | "recovery-released" =>
    let outcome ← choose reconciled
    return .recoveryReleased outcome (← nat)
  | "lease-renewed" =>
    let leaseUntil ← nat
    return .leaseRenewed leaseUntil (← nat)
  | "duplicate-successor-claimed" =>
    let intentHash ← nat
    let runId ← nat
    return .successorClaimed intentHash runId (← nat)
  | _ => failure

def journalText (j : Journal) : String :=
  let successorText := match j.successor with
    | .some s => s!"s {s.intentHash} {s.sourceRunId} {s.runId} {s.claimedAt}"
    | .none => "-"
  " ".intercalate [natText j.revision, natText j.runId, boolText j.publishR3Web,
    optionText j.duplicateIntent, successorText, boolText j.planHasAssets, nameOf planStates j.planState,
    nameOf phases j.phase, nameOf statuses j.status, natText j.planned, natText j.started,
    natText j.verified, boolText j.ledgerPath, nameOf ledgerStates j.ledgerState,
    nameOf recoveryStates j.recoveryState, nameOf assetStates j.assetState, natText j.startedAt,
    natText j.updatedAt, natText j.dedupeExpiresAt, natText j.leaseUntil]

/-- `invariant rejected|accepted journal...`. -/
def evaluate : Parser String := do
  let j ← journal
  let e ← event
  let result := match transition j e with
    | .some next => s!"accepted {journalText next}"
    | .none => "rejected"
  pure s!"{boolText (invariant j)} {result}"

end RunJournalDiff

/-! ## Messaging run -/

namespace MessagingRunDiff
open MessagingRun

def partStates : List (String × PartState) :=
  [("unattempted", .unattempted), ("claimed", .claimed), ("dispatching", .dispatching),
    ("accepted", .accepted), ("failed-before-dispatch", .failedBeforeDispatch),
    ("failed-permanent", .failedPermanent), ("indeterminate", .indeterminate)]
def runStates : List (String × RunState) :=
  [("pending", .pending), ("submitted", .submitted), ("failed", .failed), ("partial", .partial),
    ("indeterminate", .indeterminate)]
def reasons : List (String × Reason) :=
  [("context-drift", .contextDrift), ("prefix-freshness-unproven", .prefixFreshnessUnproven),
    ("provider-failed-before-dispatch", .providerFailedBeforeDispatch),
    ("provider-result-indeterminate", .providerResultIndeterminate),
    ("journal-recovery-required", .journalRecoveryRequired)]
def stopReasons : List (String × StopReason) :=
  [("context-drift", .contextDrift), ("prefix-freshness-unproven", .prefixFreshnessUnproven),
    ("provider-failed-before-dispatch", .providerFailedBeforeDispatch),
    ("journal-recovery-required", .journalRecoveryRequired)]

def part : Parser Part := do
  let state ← choose partStates
  let msgId ← optionNat
  let hasRevision ← flag
  pure ({ state, msgId, hasRevision } : Part)

def run : Parser Run := do
  let state ← choose runStates
  let proven ← nat
  let observed ← nat
  let possibleSubmitted ← optionNat
  let privateOutcome ← flag
  let terminalReason : Option Reason ← match (← token) with
    | "-" => pure .none
    | text => match reasons.find? (·.1 == text) with
      | .some (_, reason) => pure (.some reason)
      | .none => failure
  let partCount ← count 8
  let parts ← many part partCount
  let startedAt ← nat
  let recordedAt ← nat
  pure (Run.mk state proven observed possibleSubmitted privateOutcome terminalReason parts startedAt
    recordedAt)

def event : Parser Event := do
  match (← token) with
  | "claimed" =>
    let index ← nat
    let observed ← nat
    return .claimed index observed (← nat)
  | "dispatching" =>
    let index ← nat
    return .dispatching index (← nat)
  | "accepted" =>
    let index ← nat
    let msgId ← nat
    let hasRevision ← flag
    return .accepted index msgId hasRevision (← nat)
  | "categorical-stop" =>
    let index ← nat
    let permanent ← flag
    let reason ← choose stopReasons
    return .categoricalStop index permanent reason (← nat)
  | "indeterminate" =>
    let index ← nat
    let recovery ← flag
    let privateOutcome ← flag
    return .indeterminate index recovery privateOutcome (← nat)
  | _ => failure

def runText (r : Run) : String :=
  let reasonText := match r.terminalReason with
    | .some reason => nameOf reasons reason
    | .none => "-"
  " ".intercalate ([nameOf runStates r.state, natText r.proven, natText r.observed,
    optionText r.possibleSubmitted, boolText r.privateOutcome, reasonText, natText r.parts.length]
    ++ r.parts.map (fun p => s!"{nameOf partStates p.state} {optionText p.msgId} {boolText p.hasRevision}")
    ++ [natText r.startedAt, natText r.recordedAt])

/-- `invariant rejected|accepted run...`. -/
def evaluate : Parser String := do
  let r ← run
  let e ← event
  let result := match transition r e with
    | .some next => s!"accepted {runText next}"
    | .none => "rejected"
  pure s!"{boolText (invariant r)} {result}"

end MessagingRunDiff

def evaluateLine (line : String) : String :=
  let tokens := ((String.ofList (line.toList.filter (· ≠ '\n'))).splitOn " ").filter (· ≠ "")
  let parsed : Parser String := do
    let result ← match (← token) with
      | "policy" => WebPolicyDiff.evaluate
      | "journal" => RunJournalDiff.evaluate
      | "messaging" => MessagingRunDiff.evaluate
      | _ => failure
    if (← get).isEmpty then pure result else failure
  match parsed.run' tokens with
  | .some result => result
  | .none => "error"

/-- Answer one line per input line until end of input, flushing after each answer. -/
partial def serve (input : IO.FS.Stream) (output : IO.FS.Stream) : IO Unit := do
  let line ← input.getLine
  if line.isEmpty then return
  output.putStrLn (evaluateLine line)
  output.flush
  serve input output

def main : IO Unit := do
  serve (← IO.getStdin) (← IO.getStdout)

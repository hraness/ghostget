import GhostgetVerification.Encodings.CanonicalJsonProofs
import GhostgetVerification.Encodings.HashFraming
import GhostgetVerification.Encodings.SessionSecret
import GhostgetVerification.Encodings.RouteKey
import GhostgetVerification.Edge.Negotiation

/-!
The Lean side of `scripts/verification-lean-encodings.test.ts`. The test runs
`lake env lean --run GhostgetVerification/Differential.lean`, writes one query
per line, and compares each reply line with what the TypeScript computes for
the same input.

The library root does not import this module, so the axiom audit and the
theorem list never see it; it only evaluates the definitions the theorems are
about. A query is a mode word followed by natural numbers; a string is its
length followed by its code units (or bytes).

* `cj <json>`: `canonicalJson`, as UTF-16 code units.
* `cpre <json> <bytes>`: `contractHashPreimage`, as bytes.
* `frames <n> (<label bytes> <payload bytes>)*`: `frames`, as bytes.
* `intent <adapter> <auth> <operation> <input> 0` or `... 1 <duplicate>`:
  `intentKeyPreimage joinNul`, as bytes.
* `ssname <ns> <aid>`: `fileName`, or `none`.
* `ssparse <name>`: `parse`, as `null`, `c <ns> <aid>`, or `a <n> (<ns> <aid>)*`.
* `rsurf <s>` and `rop <o>`: `validSurface` and `validOperation`, as 0 or 1.
* `rkey <transport> <surface>`: `routeKey`.
* `okey <transport> <surface> <operation> <version>`: `operationKey`.
* `neg <n> (<index> <q> <specificity> <type> <subtype>)* <m> <rep>*`:
  `negotiate`, as 0 (HTML), 1 (markdown), or 2 (406). A rep is 0 (HTML) or 1 (markdown).

A JSON value is a tag: 0 null, 1 false, 2 true, 3 `<sign> <magnitude>`,
4 `<string>`, 5 `<n> <value>*`, 6 `<n> (<string> <value>)*`.
-/
namespace GhostgetVerification.Differential

open GhostgetVerification.Encodings
open GhostgetVerification.Encodings.CanonicalJson
open GhostgetVerification.Encodings.HashFraming
open GhostgetVerification.Encodings.SessionSecret
open GhostgetVerification.Encodings.RouteKey (validSurface validOperation routeKey operationKey)
open GhostgetVerification.Edge.Negotiation

abbrev Parser := StateT (List Nat) Option

def nat : Parser Nat := do
  match ← get with
  | x :: rest => set rest; pure x
  | [] => failure

def units : Parser Units := do
  let n ← nat
  (List.range n).mapM fun _ => nat

def json : Nat → Parser Json
  | 0 => failure
  | fuel + 1 => do
    match ← nat with
    | 0 => pure .null
    | 1 => pure (.bool false)
    | 2 => pure (.bool true)
    | 3 =>
      let sign ← nat
      let magnitude ← nat
      pure (.num (if sign = 0 then (magnitude : Int) else -(magnitude : Int)))
    | 4 => return .str (← units)
    | 5 =>
      let n ← nat
      return .arr (← (List.range n).mapM fun _ => json fuel)
    | 6 =>
      let n ← nat
      return .obj (← (List.range n).mapM fun _ => do
        let key ← units
        let value ← json fuel
        pure (key, value))
    | _ => failure

def rep : Parser Rep := do
  match ← nat with
  | 0 => pure .html
  | 1 => pure .markdown
  | _ => failure

def range : Parser Range := do
  let index ← nat
  let q ← nat
  let specificity ← nat
  let type ← units
  let subtype ← units
  pure { index, q, specificity, type, subtype }

def many (item : Parser α) : Parser (List α) := do
  let n ← nat
  (List.range n).mapM fun _ => item

def render (xs : List Nat) : String := " ".intercalate (xs.map toString)

def showUnits (xs : Units) : String := render (xs.length :: xs)

def showParsed : Option Parsed → String
  | none => "null"
  | some (.coordinate ns aid) => s!"c {showUnits ns} {showUnits aid}"
  | some (.ambiguous candidates) =>
    " ".intercalate (s!"a {candidates.length}" :: candidates.map fun (ns, aid) => s!"{showUnits ns} {showUnits aid}")

def showDecision : Decision → String
  | .html => "0"
  | .markdown => "1"
  | .notAcceptable => "2"

/-- Run a whole query: the parser must consume every number. -/
def run (numbers : List Nat) (query : Parser String) : String :=
  match query.run numbers with
  | some (reply, []) => reply
  | _ => "error"

def respond (mode : String) (numbers : List Nat) : String :=
  let fuel := numbers.length + 1
  match mode with
  | "cj" => run numbers do return render (canonicalJson (← json fuel))
  | "cpre" => run numbers do
      let contract ← json fuel
      let implementation ← units
      return render (contractHashPreimage contract implementation)
  | "frames" => run numbers do
      let sections ← many do
        let label ← units
        let payload ← units
        pure (label, payload)
      return render (frames sections)
  | "intent" => run numbers do
      let adapter ← units
      let auth ← units
      let operation ← units
      let input ← units
      let duplicate ← match ← nat with
        | 0 => pure none
        | 1 => some <$> units
        | _ => failure
      return render (intentKeyPreimage joinNul { adapter, auth, operation, input, duplicate })
  | "ssname" => run numbers do
      let ns ← units
      let aid ← units
      return match fileName ns aid with
        | none => "none"
        | some name => showUnits name
  | "ssparse" => run numbers do return showParsed (parse (← units))
  | "rsurf" => run numbers do return if validSurface (← units) then "1" else "0"
  | "rop" => run numbers do return if validOperation (← units) then "1" else "0"
  | "rkey" => run numbers do
      let transport ← units
      let surface ← units
      return showUnits (routeKey transport surface)
  | "okey" => run numbers do
      let transport ← units
      let surface ← units
      let operation ← units
      let version ← nat
      return showUnits (operationKey transport surface operation version)
  | "neg" => run numbers do
      let ranges ← many range
      let reps ← many rep
      return showDecision (negotiate ranges reps)
  | _ => "error"

def parseLine (line : String) : Option (String × List Nat) :=
  match (line.trimAscii.toString.splitOn " ").filter (· ≠ "") with
  | [] => none
  | mode :: rest => (rest.mapM String.toNat?).map fun numbers => (mode, numbers)

end GhostgetVerification.Differential

open GhostgetVerification.Differential in
def main : IO Unit := do
  let stdin ← IO.getStdin
  let stdout ← IO.getStdout
  for _ in [0:100000000] do
    let line ← stdin.getLine
    if line.isEmpty then break
    let reply := match parseLine line with
      | some (mode, numbers) => respond mode numbers
      | none => "error"
    stdout.putStrLn reply
    stdout.flush

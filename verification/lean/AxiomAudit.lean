import Lean
open Lean

/-- The declaration kind the audit reports for one kernel constant. -/
def constantKind : ConstantInfo → String
  | .axiomInfo _ => "axiom"
  | .defnInfo _ => "definition"
  | .thmInfo _ => "theorem"
  | .opaqueInfo _ => "opaque"
  | .quotInfo _ => "quotient"
  | .inductInfo _ => "inductive"
  | .ctorInfo _ => "constructor"
  | .recInfo _ => "recursor"

/-- One seeded defect to check: the theorem, the definition it guards, the defect, and the refutation. -/
structure MutantCheck where
  guardedTheorem : Name
  guarded : Name
  defect : Name
  refutation : Name

/-- Group the arguments after the root module into mutant checks of four names each. -/
def mutantChecks : List String → Option (List MutantCheck)
  | [] => some []
  | t :: g :: d :: r :: rest =>
    (mutantChecks rest).map ({ guardedTheorem := t.toName, guarded := g.toName, defect := d.toName, refutation := r.toName } :: ·)
  | _ => none

/--
Checks one seeded defect at the kernel-term level. `negates` holds when the
theorem's statement uses the guarded definition and the refutation's
statement is exactly `¬` of that statement with every use of the guarded
definition replaced by the defect. `sameSignature` holds when the defect has
the guarded definition's type and universe parameters.
-/
def checkMutant (env : Environment) (check : MutantCheck) : Json :=
  let result (found sameSignature negates : Bool) : Json := Json.mkObj [
    ("mutant", toJson check.guardedTheorem.toString),
    ("guarded", toJson check.guarded.toString),
    ("defect", toJson check.defect.toString),
    ("refutation", toJson check.refutation.toString),
    ("found", toJson found),
    ("sameSignature", toJson sameSignature),
    ("negates", toJson negates)]
  match env.find? check.guardedTheorem, env.find? check.guarded, env.find? check.defect, env.find? check.refutation with
  | some statement, some guarded, some defect, some refutation =>
    let replaced := statement.type.replace fun e =>
      if e.isConstOf check.guarded then some (mkConst check.defect e.constLevels!) else none
    let negated := mkApp (mkConst ``Not) replaced
    let negates := statement.type.getUsedConstants.contains check.guarded && refutation.type == negated
    let sameSignature := guarded.type == defect.type && guarded.levelParams == defect.levelParams
    result true sameSignature negates
  | _, _, _, _ => result false false false

/--
Prints one JSON line per kernel declaration in the audited library, sorted by
name, with its kind, its type, the axioms it depends on, and the constants its
type uses; then one line per seeded-defect check; then one summary line.

Usage: `AxiomAudit <root module> [<theorem> <guarded> <defect> <refutation>]...`
-/
def main (args : List String) : IO UInt32 := do
  let root :: rest := args | do
    IO.eprintln "usage: AxiomAudit <root module> [<theorem> <guarded> <defect> <refutation>]..."
    return 2
  let some checks := mutantChecks rest | do
    IO.eprintln "usage: AxiomAudit <root module> [<theorem> <guarded> <defect> <refutation>]..."
    return 2
  let rootName := root.toName
  initSearchPath (← findSysroot)
  let env ← importModules #[{ module := rootName }] {} (trustLevel := 0)
  let modules := env.header.moduleNames
  let ctx : Core.Context := { fileName := "<axiom-audit>", fileMap := default }
  let state : Core.State := { env }
  let mut lines : Array (String × String) := #[]
  for (name, info) in env.constants.map₁.toList do
    let some index := env.getModuleIdxFor? name | continue
    let some moduleName := modules[index.toNat]? | continue
    unless moduleName.getRoot == rootName.getRoot do continue
    let (axioms, _) ← (collectAxioms name : CoreM (Array Name)).toIO ctx state
    let axiomNames := (axioms.map (·.toString)).qsort (· < ·)
    let uses := (info.type.getUsedConstants.map (·.toString)).qsort (· < ·)
    let line := Json.compress (Json.mkObj [
      ("declaration", toJson name.toString),
      ("kind", toJson (constantKind info)),
      ("module", toJson moduleName.toString),
      ("type", toJson info.type.dbgToString),
      ("axioms", toJson axiomNames),
      ("uses", toJson uses)])
    lines := lines.push (name.toString, line)
  for (_, line) in lines.qsort (fun left right => left.1 < right.1) do
    IO.println line
  for check in checks do
    IO.println (Json.compress (checkMutant env check))
  IO.println (Json.compress (Json.mkObj [("declarations", toJson lines.size), ("mutants", toJson checks.length)]))
  return 0

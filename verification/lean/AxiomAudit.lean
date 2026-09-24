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

/--
Prints one JSON line per kernel declaration in the audited library, sorted by
name, with its kind, the axioms it depends on, and the constants its type
uses, then one summary line.
-/
def main (args : List String) : IO UInt32 := do
  let [root] := args | do
    IO.eprintln "usage: AxiomAudit <root module>"
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
      ("axioms", toJson axiomNames),
      ("uses", toJson uses)])
    lines := lines.push (name.toString, line)
  for (_, line) in lines.qsort (fun left right => left.1 < right.1) do
    IO.println line
  IO.println (Json.compress (Json.mkObj [("declarations", toJson lines.size)]))
  return 0

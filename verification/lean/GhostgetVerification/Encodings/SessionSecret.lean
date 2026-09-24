import GhostgetVerification.Encodings.Units

/-!
A model of session-secret file naming in `src/session-secrets.ts`.

A coordinate is a namespace and an auth ID, each matching
`^[a-z][a-z0-9-]{0,47}$`. Its file is `<namespace>--<authId>.json` when that
stem has exactly one valid split at a `--`, which keeps every unambiguous name
that writers before injective naming used. Any other coordinate is written
`<namespace>.<authId>.json`; neither part admits `.`, so the two forms share no
names. The parser reads every name the writer produces back to its coordinate,
so no two coordinates share a file.
-/
namespace GhostgetVerification.Encodings.SessionSecret

open GhostgetVerification.Encodings

def isLower (c : Nat) : Bool := 97 ≤ c && c ≤ 122

def isNameTail (c : Nat) : Bool := isLower c || (48 ≤ c && c ≤ 57) || c == 45

/-- `^[a-z][a-z0-9-]{0,47}$` -/
def validPart : Units → Bool
  | [] => false
  | c :: rest => isLower c && rest.length ≤ 47 && rest.all isNameTail

/-- `.json` -/
def json : Units := [46, 106, 115, 111, 110]

/--
Every split of `stem` at an occurrence of `--`, from left to right,
overlapping occurrences included, as the `indexOf` loop finds them.
-/
def splits : Units → List (Units × Units)
  | [] => []
  | c :: rest =>
    (if c = 45 ∧ rest.head? = some 45 then [([], rest.drop 1)] else []) ++
      (splits rest).map (fun p => (c :: p.1, p.2))

/-- `historicalStemCoordinates`: the splits whose two parts are both valid. -/
def historicalCandidates (stem : Units) : List (Units × Units) :=
  (splits stem).filter (fun p => validPart p.1 && validPart p.2)

def historicalStem (ns aid : Units) : Units := ns ++ 45 :: 45 :: aid

/-- `sessionSecretFileName`, with `none` where the TypeScript throws. -/
def fileName (ns aid : Units) : Option Units :=
  if validPart ns && validPart aid then
    if (historicalCandidates (historicalStem ns aid)).length = 1 then some (historicalStem ns aid ++ json)
    else some (ns ++ 46 :: aid ++ json)
  else none

/-- Seeded defect: the historical name for every coordinate, as writers before #340 did. -/
def fileNameHistorical (ns aid : Units) : Option Units :=
  if validPart ns && validPart aid then some (historicalStem ns aid ++ json) else none

/-- What `parseSessionSecretFileName` returns for a name it accepts. -/
inductive Parsed where
  | coordinate (ns aid : Units)
  | ambiguous (candidates : List (Units × Units))
  deriving DecidableEq

/-- The stem of a `.json` name. -/
def stripJson (name : Units) : Option Units :=
  if 5 ≤ name.length ∧ name.drop (name.length - 5) = json then some (name.take (name.length - 5)) else none

/-- Split at the first `.`. -/
def splitFirstDot : Units → Option (Units × Units)
  | [] => none
  | c :: rest =>
    if c = 46 then some ([], rest)
    else (splitFirstDot rest).map (fun p => (c :: p.1, p.2))

/-- `parseSessionSecretFileName`, with `none` for `null`. -/
def parse (name : Units) : Option Parsed :=
  match stripJson name with
  | none => none
  | some stem =>
    match splitFirstDot stem with
    | some (ns, aid) =>
      if validPart ns && validPart aid && fileName ns aid == some name then some (.coordinate ns aid) else none
    | none =>
      match historicalCandidates stem with
      | [] => none
      | [(ns, aid)] => some (.coordinate ns aid)
      | candidates => some (.ambiguous candidates)

/-! ## Lemmas -/

theorem stripJson_append (s : Units) : stripJson (s ++ json) = some s := by
  simp [stripJson, json]

theorem mem_splits : ∀ (ns aid : Units), (ns, aid) ∈ splits (ns ++ 45 :: 45 :: aid)
  | [], aid => by simp [splits]
  | c :: ns, aid => by
    simp only [List.cons_append, splits, List.mem_append, List.mem_map]
    exact Or.inr ⟨(ns, aid), mem_splits ns aid, rfl⟩

theorem validPart_no_dot : ∀ (s : Units), validPart s = true → 46 ∉ s
  | [], h => by simp [validPart] at h
  | c :: rest, h => by
    simp only [validPart, Bool.and_eq_true, decide_eq_true_eq, List.all_eq_true] at h
    intro m
    rcases List.mem_cons.mp m with e | m
    · subst e; simp [isLower] at h
    · have := h.2 46 m; simp [isNameTail, isLower] at this

theorem splitFirstDot_no_dot : ∀ (s : Units), 46 ∉ s → splitFirstDot s = none
  | [], _ => rfl
  | c :: rest, h => by
    have hc : c ≠ 46 := fun e => h (by simp [e])
    have hr : 46 ∉ rest := fun m => h (List.mem_cons_of_mem _ m)
    simp [splitFirstDot, hc, splitFirstDot_no_dot rest hr]

theorem splitFirstDot_dot : ∀ (ns aid : Units), 46 ∉ ns → splitFirstDot (ns ++ 46 :: aid) = some (ns, aid)
  | [], aid, _ => by simp [splitFirstDot]
  | c :: ns, aid, h => by
    have hc : c ≠ 46 := fun e => h (by simp [e])
    have hr : 46 ∉ ns := fun m => h (List.mem_cons_of_mem _ m)
    simp [splitFirstDot, hc, splitFirstDot_dot ns aid hr]

theorem historicalStem_no_dot (ns aid : Units) (hn : 46 ∉ ns) (ha : 46 ∉ aid) : 46 ∉ historicalStem ns aid := by
  simp [historicalStem, hn, ha]

/-! ## Theorems -/

/-- The parser reads every name the writer produces back to its coordinate. -/
theorem parse_fileName :
    ∀ (ns aid f : Units), fileName ns aid = some f → parse f = some (.coordinate ns aid) := by
  intro ns aid f h
  unfold fileName at h
  by_cases hv : (validPart ns && validPart aid) = true
  · simp only [hv, ↓reduceIte] at h
    have hvs : validPart ns = true ∧ validPart aid = true := by simpa using hv
    have hn := validPart_no_dot ns hvs.1
    have ha := validPart_no_dot aid hvs.2
    by_cases hone : (historicalCandidates (historicalStem ns aid)).length = 1
    · simp only [hone, ↓reduceIte] at h
      cases h
      have hmem : (ns, aid) ∈ historicalCandidates (historicalStem ns aid) := by
        simp only [historicalCandidates, List.mem_filter]
        exact ⟨mem_splits ns aid, by simp [hvs.1, hvs.2]⟩
      have hsingle : historicalCandidates (historicalStem ns aid) = [(ns, aid)] := by
        obtain ⟨x, hx⟩ := List.length_eq_one_iff.mp hone
        rw [hx] at hmem ⊢
        rw [List.mem_singleton.mp hmem]
      have hd : splitFirstDot (historicalStem ns aid) = none :=
        splitFirstDot_no_dot _ (historicalStem_no_dot ns aid hn ha)
      simp only [parse, stripJson_append]
      rw [hd]
      simp only [hsingle]
    · simp only [hone, ↓reduceIte] at h
      cases h
      simp only [parse, stripJson_append, splitFirstDot_dot ns aid hn, hvs.1, hvs.2, Bool.true_and]
      simp [fileName, hvs.1, hvs.2, hone]
  · simp only [hv, Bool.false_eq_true, ↓reduceIte] at h
    cases h

/-- No two coordinates share a file. -/
theorem fileName_injective :
    ∀ (n₁ a₁ n₂ a₂ f : Units), fileName n₁ a₁ = some f → fileName n₂ a₂ = some f → n₁ = n₂ ∧ a₁ = a₂ := by
  intro n₁ a₁ n₂ a₂ f h₁ h₂
  have e := (parse_fileName _ _ _ h₁).symm.trans (parse_fileName _ _ _ h₂)
  simpa using e

/-- Historical naming alone names `a` + `b--c` and `a--b` + `c` the same file. -/
theorem fileNameHistorical_collides :
    ¬ ∀ (n₁ a₁ n₂ a₂ f : Units), fileNameHistorical n₁ a₁ = some f → fileNameHistorical n₂ a₂ = some f →
      n₁ = n₂ ∧ a₁ = a₂ := by
  intro h
  have := h [97] [98, 45, 45, 99] [97, 45, 45, 98] [99] ([97, 45, 45, 98, 45, 45, 99] ++ json) (by decide) (by decide)
  simp at this

/-- Historical naming alone writes a name the parser reads as ambiguous. -/
theorem fileNameHistorical_unparsed :
    ¬ ∀ (ns aid f : Units), fileNameHistorical ns aid = some f → parse f = some (.coordinate ns aid) := by
  intro h
  have := h [97] [98, 45, 45, 99] ([97, 45, 45, 98, 45, 45, 99] ++ json) (by decide)
  revert this
  decide

end GhostgetVerification.Encodings.SessionSecret

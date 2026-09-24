import GhostgetVerification.Encodings.Units

/-!
A model of `negotiateDocumentRepresentation` in `edge/negotiation.ts` over
parsed Accept media ranges. The header parser (`parseAcceptMediaRanges`) is not
modelled: the differential test parses each header with the TypeScript and
hands the ranges to this model.

For each representation the edge keeps its best matching range (more specific
first, then higher q, then earlier), drops it when that range has q = 0, and
selects among the rest by higher q, then more specific range, then earlier
range, then HTML before markdown. No ranges means HTML; no survivor means 406.
-/
namespace GhostgetVerification.Edge.Negotiation

open GhostgetVerification.Encodings

/-- One parsed media range. `q` is thousandths, so 0 to 1000. -/
structure Range where
  index : Nat
  q : Nat
  specificity : Nat
  type : Units
  subtype : Units
  deriving DecidableEq

inductive Rep where
  | html
  | markdown
  deriving DecidableEq

inductive Decision where
  | html
  | markdown
  | notAcceptable
  deriving DecidableEq

/-- `*` -/
def star : Units := [42]

/-- `text` -/
def text : Units := [116, 101, 120, 116]

def Rep.subtype : Rep → Units
  | .html => [104, 116, 109, 108]
  | .markdown => [109, 97, 114, 107, 100, 111, 119, 110]

def Rep.preference : Rep → Nat
  | .html => 0
  | .markdown => 1

def Rep.decision : Rep → Decision
  | .html => .html
  | .markdown => .markdown

def matchesRep (r : Range) (rep : Rep) : Bool :=
  (r.type == star || r.type == text) && (r.subtype == star || r.subtype == rep.subtype)

/-- `bestRangeFor`'s replacement rule: does `r` beat the current best `b`? -/
def beats (r b : Range) : Bool :=
  if r.specificity ≠ b.specificity then b.specificity < r.specificity
  else if r.q ≠ b.q then b.q < r.q
  else r.index < b.index

def bestStep (rep : Rep) (best : Option Range) (r : Range) : Option Range :=
  if matchesRep r rep then
    match best with
    | none => some r
    | some b => if beats r b then some r else some b
  else best

/-- `bestRangeFor` -/
def bestRange (ranges : List Range) (rep : Rep) : Option Range := ranges.foldl (bestStep rep) none

/-- A representation's claim on the selection. -/
structure Cand where
  rep : Rep
  q : Nat
  specificity : Nat
  rangeIndex : Nat
  deriving DecidableEq

def Cand.ofRange (rep : Rep) (r : Range) : Cand :=
  { rep, q := r.q, specificity := r.specificity, rangeIndex := r.index }

/-- A representation's candidate: its best range, unless that range refuses it with q = 0. -/
def candidate (ranges : List Range) (rep : Rep) : Option Cand :=
  match bestRange ranges rep with
  | none => none
  | some r => if r.q = 0 then none else some (Cand.ofRange rep r)

/-- The selection's replacement rule: does `n` beat the current selection `s`? -/
def prefers (n s : Cand) : Bool :=
  if n.q ≠ s.q then s.q < n.q
  else if n.specificity ≠ s.specificity then s.specificity < n.specificity
  else if n.rangeIndex ≠ s.rangeIndex then n.rangeIndex < s.rangeIndex
  else n.rep.preference < s.rep.preference

def selectStep (cand : Rep → Option Cand) (sel : Option Cand) (rep : Rep) : Option Cand :=
  match cand rep with
  | none => sel
  | some n =>
    match sel with
    | none => some n
    | some s => if prefers n s then some n else some s

def select (cand : Rep → Option Cand) (reps : List Rep) : Option Cand := reps.foldl (selectStep cand) none

def negotiateWith (cand : Rep → Option Cand) (ranges : List Range) (reps : List Rep) : Decision :=
  if ranges.isEmpty then .html
  else
    match select cand reps with
    | none => .notAcceptable
    | some c => c.rep.decision

/-- `negotiateDocumentRepresentation` over parsed ranges. -/
def negotiate (ranges : List Range) (reps : List Rep) : Decision := negotiateWith (candidate ranges) ranges reps

/-- Seeded defect: a best range with q = 0 still admits its representation. -/
def candidateAnyQ (ranges : List Range) (rep : Rep) : Option Cand := (bestRange ranges rep).map (Cand.ofRange rep)

/-- Seeded defect: negotiation that ignores `q=0` refusals. -/
def negotiateIgnoringQZero (ranges : List Range) (reps : List Rep) : Decision :=
  negotiateWith (candidateAnyQ ranges) ranges reps

/-- Seeded defect: the first acceptable representation in server order, whatever its q. -/
def negotiateFirstMatch (ranges : List Range) (reps : List Rep) : Decision :=
  if ranges.isEmpty then .html
  else
    match reps.find? (fun rep => (candidate ranges rep).isSome) with
    | none => .notAcceptable
    | some rep => rep.decision

/-! ## The selection fold -/

theorem selectStep_cases (cand : Rep → Option Cand) (sel : Option Cand) (rep : Rep) :
    selectStep cand sel rep = sel ∨ selectStep cand sel rep = cand rep := by
  unfold selectStep
  split
  · exact Or.inl rfl
  · rename_i n hn
    split
    · exact Or.inr hn.symm
    · split
      · exact Or.inr hn.symm
      · exact Or.inl rfl

theorem foldl_none_iff (cand : Rep → Option Cand) :
    ∀ (reps : List Rep) (init : Option Cand),
      reps.foldl (selectStep cand) init = none ↔ init = none ∧ ∀ rep ∈ reps, cand rep = none
  | [], init => by simp
  | rep :: rest, init => by
    simp only [List.foldl_cons, List.mem_cons, forall_eq_or_imp]
    rw [foldl_none_iff cand rest]
    unfold selectStep
    cases hc : cand rep with
    | none => simp
    | some n =>
      cases init with
      | none => simp
      | some s => by_cases hp : prefers n s = true <;> simp [hp]

/-- The selection is the initial value or some representation's candidate. -/
theorem foldl_source (cand : Rep → Option Cand) :
    ∀ (reps : List Rep) (init : Option Cand) (c : Cand),
      reps.foldl (selectStep cand) init = some c → init = some c ∨ ∃ rep ∈ reps, cand rep = some c
  | [], init, c, h => Or.inl (by simpa using h)
  | rep :: rest, init, c, h => by
    simp only [List.foldl_cons] at h
    rcases foldl_source cand rest _ c h with e | ⟨r, m, hr⟩
    · rcases selectStep_cases cand init rep with s | s
      · exact Or.inl (s ▸ e)
      · exact Or.inr ⟨rep, List.mem_cons_self, s ▸ e⟩
    · exact Or.inr ⟨r, List.mem_cons_of_mem _ m, hr⟩

theorem prefers_q (n s : Cand) (h : prefers n s = true) : s.q ≤ n.q := by
  unfold prefers at h
  split at h
  · simp at h; omega
  · omega

theorem prefers_q_not (n s : Cand) (h : ¬ prefers n s = true) : n.q ≤ s.q := by
  unfold prefers at h
  split at h
  · simp at h; omega
  · omega

/-- The value a step keeps has q at least the old selection's and the new candidate's. -/
theorem selectStep_q (cand : Rep → Option Cand) (sel : Option Cand) (rep : Rep) :
    (∃ c, selectStep cand sel rep = some c ∧ (∀ s, sel = some s → s.q ≤ c.q) ∧ (∀ n, cand rep = some n → n.q ≤ c.q))
    ∨ (selectStep cand sel rep = none ∧ sel = none ∧ cand rep = none) := by
  unfold selectStep
  cases hc : cand rep with
  | none =>
    cases sel with
    | none => exact Or.inr ⟨rfl, rfl, rfl⟩
    | some s => exact Or.inl ⟨s, rfl, fun s' e => (by cases e; exact Nat.le_refl _), fun n e => (by cases e)⟩
  | some n =>
    cases sel with
    | none => exact Or.inl ⟨n, rfl, fun s e => (by cases e), fun n' e => (by cases e; exact Nat.le_refl _)⟩
    | some s =>
      by_cases hp : prefers n s = true
      · simp only [hp, ↓reduceIte]
        exact Or.inl ⟨n, rfl, fun s' e => (by cases e; exact prefers_q n s hp),
          fun n' e => (by cases e; exact Nat.le_refl _)⟩
      · simp only [hp, Bool.false_eq_true, ↓reduceIte]
        exact Or.inl ⟨s, rfl, fun s' e => (by cases e; exact Nat.le_refl _),
          fun n' e => (by cases e; exact prefers_q_not n s hp)⟩

/-- The selection has q at least every candidate's and the initial value's. -/
theorem foldl_max (cand : Rep → Option Cand) :
    ∀ (reps : List Rep) (init : Option Cand) (c : Cand),
      reps.foldl (selectStep cand) init = some c →
        (∀ s, init = some s → s.q ≤ c.q) ∧ ∀ rep ∈ reps, ∀ n, cand rep = some n → n.q ≤ c.q
  | [], init, c, h => by
    simp only [List.foldl_nil] at h
    exact ⟨fun s e => (by rw [h] at e; cases e; exact Nat.le_refl _), by simp⟩
  | rep :: rest, init, c, h => by
    simp only [List.foldl_cons] at h
    have ih := foldl_max cand rest _ c h
    rcases selectStep_q cand init rep with ⟨c', e, hs, hn⟩ | ⟨e, hi, hc⟩
    · rw [e] at ih
      refine ⟨fun s es => Nat.le_trans (hs s es) (ih.1 c' rfl), ?_⟩
      intro r m n hr
      rcases List.mem_cons.mp m with er | m
      · subst er; exact Nat.le_trans (hn n hr) (ih.1 c' rfl)
      · exact ih.2 r m n hr
    · rw [e] at ih
      refine ⟨fun s es => (by rw [hi] at es; cases es), ?_⟩
      intro r m n hr
      rcases List.mem_cons.mp m with er | m
      · subst er; rw [hc] at hr; cases hr
      · exact ih.2 r m n hr

theorem candidate_rep (ranges : List Range) (rep : Rep) (c : Cand) (h : candidate ranges rep = some c) :
    c.rep = rep ∧ 0 < c.q := by
  unfold candidate at h
  split at h
  · cases h
  · rename_i r _
    split at h
    · cases h
    · cases h
      exact ⟨rfl, by simp [Cand.ofRange]; omega⟩

theorem decision_injective (a b : Rep) (h : a.decision = b.decision) : a = b := by
  cases a <;> cases b <;> simp_all [Rep.decision]

theorem decision_ne (rep : Rep) : rep.decision ≠ .notAcceptable := by
  cases rep <;> simp [Rep.decision]

/-! ## Theorems -/

/-- 406 exactly when the header has ranges and every representation lacks a candidate. -/
theorem negotiate_notAcceptable_iff :
    ∀ (ranges : List Range) (reps : List Rep),
      negotiate ranges reps = .notAcceptable ↔ ranges ≠ [] ∧ ∀ rep ∈ reps, candidate ranges rep = none := by
  intro ranges reps
  unfold negotiate negotiateWith select
  cases ranges with
  | nil => simp
  | cons r rest =>
    simp only [List.isEmpty_cons, Bool.false_eq_true, ↓reduceIte, ne_eq, reduceCtorEq, not_false_eq_true,
      true_and]
    have hi := foldl_none_iff (candidate (r :: rest)) reps none
    cases hs : reps.foldl (selectStep (candidate (r :: rest))) none with
    | none => rw [hs] at hi; simpa using hi
    | some c => rw [hs] at hi; simp only [reduceCtorEq, true_and, false_iff] at hi; simp [decision_ne, hi]

/-- A negotiated representation is one the server offers and the header accepts with q > 0. -/
theorem negotiate_selected_acceptable :
    ∀ (ranges : List Range) (reps : List Rep) (rep : Rep),
      ranges ≠ [] → negotiate ranges reps = rep.decision →
        rep ∈ reps ∧ ∃ c, candidate ranges rep = some c ∧ 0 < c.q := by
  intro ranges reps rep hr h
  unfold negotiate negotiateWith select at h
  cases ranges with
  | nil => exact absurd rfl hr
  | cons r rest =>
    simp only [List.isEmpty_cons, Bool.false_eq_true, ↓reduceIte] at h
    cases hs : reps.foldl (selectStep (candidate (r :: rest))) none with
    | none => rw [hs] at h; exact absurd h.symm (decision_ne rep)
    | some c =>
      rw [hs] at h
      have he := decision_injective _ _ h
      rcases foldl_source _ reps none c hs with e | ⟨rep', m, hc⟩
      · cases e
      · have ⟨er, hq⟩ := candidate_rep _ _ _ hc
        rw [he] at er
        subst er
        exact ⟨m, c, hc, hq⟩

/-- A negotiated representation has the highest q among the acceptable ones. -/
theorem negotiate_selected_max_q :
    ∀ (ranges : List Range) (reps : List Rep) (rep : Rep) (c : Cand),
      ranges ≠ [] → negotiate ranges reps = rep.decision → candidate ranges rep = some c →
        ∀ rep' ∈ reps, ∀ c', candidate ranges rep' = some c' → c'.q ≤ c.q := by
  intro ranges reps rep c hr h hc
  unfold negotiate negotiateWith select at h
  cases ranges with
  | nil => exact absurd rfl hr
  | cons r rest =>
    simp only [List.isEmpty_cons, Bool.false_eq_true, ↓reduceIte] at h
    cases hs : reps.foldl (selectStep (candidate (r :: rest))) none with
    | none => rw [hs] at h; exact absurd h.symm (decision_ne rep)
    | some s =>
      rw [hs] at h
      have he := decision_injective _ _ h
      rcases foldl_source _ reps none s hs with e | ⟨rep', _, hs'⟩
      · cases e
      · have er := (candidate_rep _ _ _ hs').1
        rw [he] at er
        subst er
        rw [hc] at hs'
        cases hs'
        exact (foldl_max _ reps none c hs).2

/-! ## Seeded defects -/

/-- `text/html;q=0` refuses HTML, but the defect serves it. -/
def refusingHtml : List Range := [⟨0, 0, 3, text, Rep.subtype .html⟩]

theorem negotiateIgnoringQZero_serves_refused :
    ¬ ∀ (ranges : List Range) (reps : List Rep),
      negotiateIgnoringQZero ranges reps = .notAcceptable ↔ ranges ≠ [] ∧ ∀ rep ∈ reps, candidate ranges rep = none := by
  intro h
  have := (h refusingHtml [.html]).mpr ⟨by simp [refusingHtml], by decide⟩
  revert this
  decide

theorem negotiateIgnoringQZero_selects_refused :
    ¬ ∀ (ranges : List Range) (reps : List Rep) (rep : Rep),
      ranges ≠ [] → negotiateIgnoringQZero ranges reps = rep.decision →
        rep ∈ reps ∧ ∃ c, candidate ranges rep = some c ∧ 0 < c.q := by
  intro h
  obtain ⟨_, c, hc, _⟩ := h refusingHtml [.html] .html (by simp [refusingHtml]) (by decide)
  have hn : candidate refusingHtml .html = none := by decide
  rw [hn] at hc
  cases hc

/-- `text/html;q=0.5, text/markdown` prefers markdown, but the defect takes HTML first. -/
def preferringMarkdown : List Range :=
  [⟨0, 500, 3, text, Rep.subtype .html⟩, ⟨1, 1000, 3, text, Rep.subtype .markdown⟩]

theorem negotiateFirstMatch_ignores_q :
    ¬ ∀ (ranges : List Range) (reps : List Rep) (rep : Rep) (c : Cand),
      ranges ≠ [] → negotiateFirstMatch ranges reps = rep.decision → candidate ranges rep = some c →
        ∀ rep' ∈ reps, ∀ c', candidate ranges rep' = some c' → c'.q ≤ c.q := by
  intro h
  have := h preferringMarkdown [.html, .markdown] .html ⟨.html, 500, 3, 0⟩ (by simp [preferringMarkdown])
    (by decide) (by decide) .markdown (by simp) ⟨.markdown, 1000, 3, 1⟩ (by decide)
  simp at this

end GhostgetVerification.Edge.Negotiation

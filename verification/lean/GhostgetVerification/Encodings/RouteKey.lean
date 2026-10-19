import GhostgetVerification.Encodings.Units

/-!
A model of the provider plugin registry keys in
`src/provider-plugin-registry.ts` and the identifier grammars in
`src/provider-plugin-identifiers.ts` that bound their parts.

A route key is `<transport>:<surfaceId>` and an operation key is
`<transport>:<surfaceId>/<operation>@<contractVersion>`. The transport is one
of four fixed names, a surface ID matches `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`
with at most 63 code units, an operation name is two to four such segments of
at most 40 code units each joined by `.`, at most 163 in all, and the contract
version is written in decimal by a template literal. No transport contains
`:`, no surface ID contains `/`, and no operation name contains `@`, so
splitting a key at its first `:`, then its first `/`, then its first `@` reads
back every part, and no two coordinates share a key.
-/
namespace GhostgetVerification.Encodings.RouteKey

open GhostgetVerification.Encodings

def colon : Nat := 58
def slash : Nat := 47
def atSign : Nat := 64
def dot : Nat := 46
def hyphen : Nat := 45

def isLower (c : Nat) : Bool := 97 ≤ c && c ≤ 122

def isDigit (c : Nat) : Bool := 48 ≤ c && c ≤ 57

def isKebabUnit (c : Nat) : Bool := isLower c || isDigit c || c == hyphen

/-- `providerPluginTransports`, as code units. -/
def transports : List Units :=
  [ "provider-api".toList.map Char.toNat,
    "web-session-api".toList.map Char.toNat,
    "linked-device".toList.map Char.toNat,
    "local-cli".toList.map Char.toNat ]

/-- No two hyphens in a row and no trailing hyphen. -/
def hyphensSeparate : Units → Bool
  | [] => true
  | [c] => c != hyphen
  | c :: d :: rest => !(c == hyphen && d == hyphen) && hyphensSeparate (d :: rest)

/-- `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$` -/
def kebab : Units → Bool
  | [] => false
  | c :: rest => isLower c && (c :: rest).all isKebabUnit && hyphensSeparate (c :: rest)

/-- `isProviderPluginSurfaceId` -/
def validSurface (s : Units) : Bool := s.length ≤ 63 && kebab s

/-- `value.split(".")` -/
def splitDots : Units → List Units
  | [] => [[]]
  | c :: rest =>
    if c = dot then [] :: splitDots rest
    else match splitDots rest with
      | [] => [[c]]
      | seg :: segs => (c :: seg) :: segs

/-- `isProviderPluginOperationName` -/
def validOperation (o : Units) : Bool :=
  o.length ≤ 163 &&
    2 ≤ (splitDots o).length && (splitDots o).length ≤ 4 &&
    (splitDots o).all (fun seg => seg.length ≤ 40 && kebab seg)

/-- A template literal's decimal rendering of a natural number. -/
def decimal (n : Nat) : Units :=
  if n < 10 then [48 + n] else decimal (n / 10) ++ [48 + n % 10]
termination_by n
decreasing_by omega

/-- `routeKey` -/
def routeKey (t s : Units) : Units := t ++ colon :: s

/-- `operationKey` -/
def operationKey (t s o : Units) (v : Nat) : Units :=
  routeKey t s ++ slash :: (o ++ atSign :: decimal v)

/-- Seeded defect: an operation key with no `/` between the surface and the operation. -/
def operationKeyUnseparated (t s o : Units) (v : Nat) : Units :=
  routeKey t s ++ (o ++ atSign :: decimal v)

/-- Split at the first occurrence of `c`. -/
def splitFirst (c : Nat) : Units → Option (Units × Units)
  | [] => none
  | x :: rest => if x = c then some ([], rest) else (splitFirst c rest).map (fun p => (x :: p.1, p.2))

def digitsValue (ds : Units) : Nat := ds.foldl (fun acc d => acc * 10 + (d - 48)) 0

def parseRouteKey (k : Units) : Option (Units × Units) := splitFirst colon k

structure OperationCoordinate where
  transport : Units
  surface : Units
  operation : Units
  version : Nat
  deriving DecidableEq

def parseOperationKey (k : Units) : Option OperationCoordinate :=
  match splitFirst colon k with
  | none => none
  | some (t, rest) =>
    match splitFirst slash rest with
    | none => none
    | some (s, rest) =>
      match splitFirst atSign rest with
      | none => none
      | some (o, ds) => if !ds.isEmpty && ds.all isDigit then some ⟨t, s, o, digitsValue ds⟩ else none

/-! ## Lemmas -/

theorem splitFirst_append (c : Nat) : ∀ (a b : Units), c ∉ a → splitFirst c (a ++ c :: b) = some (a, b)
  | [], b, _ => by simp [splitFirst]
  | x :: a, b, h => by
    have hx : x ≠ c := fun e => h (by simp [e])
    have hr : c ∉ a := fun m => h (List.mem_cons_of_mem _ m)
    simp [splitFirst, hx, splitFirst_append c a b hr]

theorem decimal_digits : ∀ (n : Nat), ∀ d ∈ decimal n, isDigit d = true := by
  intro n
  induction n using Nat.strongRecOn with
  | _ n ih =>
    intro d hd
    rw [decimal] at hd
    split at hd
    · simp at hd; subst hd; simp only [isDigit, Bool.and_eq_true, decide_eq_true_eq]; omega
    · simp only [List.mem_append, List.mem_singleton] at hd
      rcases hd with hd | hd
      · exact ih (n / 10) (by omega) d hd
      · subst hd; simp only [isDigit, Bool.and_eq_true, decide_eq_true_eq]; omega

theorem decimal_ne_nil (n : Nat) : decimal n ≠ [] := by
  rw [decimal]; split <;> simp

theorem digitsValue_snoc (ds : Units) (d : Nat) : digitsValue (ds ++ [d]) = digitsValue ds * 10 + (d - 48) := by
  simp [digitsValue, List.foldl_append]

theorem digitsValue_decimal : ∀ (n : Nat), digitsValue (decimal n) = n := by
  intro n
  induction n using Nat.strongRecOn with
  | _ n ih =>
    rw [decimal]
    split
    · simp [digitsValue] <;> omega
    · rw [digitsValue_snoc, ih (n / 10) (by omega)]; omega

theorem atSign_not_mem_decimal (n : Nat) : atSign ∉ decimal n := by
  intro m
  have := decimal_digits n atSign m
  simp [isDigit, atSign] at this

theorem kebab_units : ∀ (s : Units), kebab s = true → ∀ c ∈ s, isKebabUnit c = true
  | [], h => by simp [kebab] at h
  | c :: rest, h => by
    simp only [kebab, Bool.and_eq_true] at h
    exact List.all_eq_true.mp h.1.2

theorem kebab_excludes (s : Units) (h : kebab s = true) (c : Nat) (hc : isKebabUnit c = false) : c ∉ s := by
  intro m
  have := kebab_units s h c m
  simp [hc] at this

theorem validSurface_no_slash (s : Units) (h : validSurface s = true) : slash ∉ s := by
  simp only [validSurface, Bool.and_eq_true] at h
  exact kebab_excludes s h.2 slash (by decide)

/-- Every unit of a name is a dot or sits in one of its dot-separated segments. -/
theorem mem_splitDots : ∀ (o : Units), ∀ c ∈ o, c ≠ dot → ∃ seg ∈ splitDots o, c ∈ seg
  | [], c, m, _ => by simp at m
  | x :: rest, c, m, hc => by
    by_cases hx : x = dot
    · have hm : c ∈ rest := by
        rcases List.mem_cons.mp m with e | m
        · exact absurd (e ▸ hx) hc
        · exact m
      obtain ⟨seg, hs, hm⟩ := mem_splitDots rest c hm hc
      exact ⟨seg, by simp [splitDots, hx, hs], hm⟩
    · cases hsd : splitDots rest with
      | nil =>
        have hr : rest = [] := by
          cases rest with
          | nil => rfl
          | cons y ys =>
            simp only [splitDots] at hsd
            split at hsd
            · simp at hsd
            · split at hsd <;> simp at hsd
        subst hr
        have e : c = x := by simpa using m
        subst e
        exact ⟨[c], by simp [splitDots, hx], by simp⟩
      | cons seg segs =>
        rcases List.mem_cons.mp m with e | m
        · subst e
          exact ⟨c :: seg, by simp [splitDots, hx, hsd], by simp⟩
        · obtain ⟨seg', hs, hm⟩ := mem_splitDots rest c m hc
          rw [hsd] at hs
          rcases List.mem_cons.mp hs with e | hs
          · subst e; exact ⟨x :: seg', by simp [splitDots, hx, hsd], List.mem_cons_of_mem _ hm⟩
          · exact ⟨seg', by simp [splitDots, hx, hsd, hs], hm⟩

theorem validOperation_no_atSign (o : Units) (h : validOperation o = true) : atSign ∉ o := by
  intro m
  unfold validOperation at h
  have hall : (splitDots o).all (fun seg => seg.length ≤ 40 && kebab seg) = true := by
    simp only [Bool.and_eq_true] at h
    exact h.2
  obtain ⟨seg, hs, hm⟩ := mem_splitDots o atSign m (by decide)
  have hk := List.all_eq_true.mp hall seg hs
  simp only [Bool.and_eq_true] at hk
  exact kebab_excludes seg hk.2 atSign (by decide) hm

theorem transports_no_colon : ∀ t ∈ transports, colon ∉ t := by decide

/-! ## Theorems -/

/-- A route key reads back to its transport and surface. -/
theorem parse_routeKey :
    ∀ (t s : Units), t ∈ transports → validSurface s = true → parseRouteKey (routeKey t s) = some (t, s) := by
  intro t s ht _
  simp [parseRouteKey, routeKey, splitFirst_append colon t s (transports_no_colon t ht)]

/-- No two routes share a key. -/
theorem routeKey_injective :
    ∀ (t₁ s₁ t₂ s₂ : Units), t₁ ∈ transports → validSurface s₁ = true → t₂ ∈ transports → validSurface s₂ = true →
      routeKey t₁ s₁ = routeKey t₂ s₂ → t₁ = t₂ ∧ s₁ = s₂ := by
  intro t₁ s₁ t₂ s₂ ht₁ hs₁ ht₂ hs₂ h
  have e := (parse_routeKey t₁ s₁ ht₁ hs₁).symm.trans (h ▸ parse_routeKey t₂ s₂ ht₂ hs₂)
  simpa using e

/-- An operation key reads back to its transport, surface, operation, and contract version. -/
theorem parse_operationKey :
    ∀ (t s o : Units) (v : Nat), t ∈ transports → validSurface s = true → validOperation o = true →
      parseOperationKey (operationKey t s o v) = some ⟨t, s, o, v⟩ := by
  intro t s o v ht hs ho
  have hdigits : (decimal v).all isDigit = true := List.all_eq_true.mpr (decimal_digits v)
  have hne : (decimal v).isEmpty = false := by
    cases h : decimal v with
    | nil => exact absurd h (decimal_ne_nil v)
    | cons _ _ => rfl
  simp only [parseOperationKey, operationKey, routeKey, List.append_assoc, List.cons_append,
    splitFirst_append colon t _ (transports_no_colon t ht),
    splitFirst_append slash s _ (validSurface_no_slash s hs),
    splitFirst_append atSign o _ (validOperation_no_atSign o ho),
    hne, hdigits, digitsValue_decimal]
  rfl

/-- No two exact contracts share a key. -/
theorem operationKey_injective :
    ∀ (t₁ s₁ o₁ t₂ s₂ o₂ : Units) (v₁ v₂ : Nat),
      t₁ ∈ transports → validSurface s₁ = true → validOperation o₁ = true →
      t₂ ∈ transports → validSurface s₂ = true → validOperation o₂ = true →
      operationKey t₁ s₁ o₁ v₁ = operationKey t₂ s₂ o₂ v₂ → t₁ = t₂ ∧ s₁ = s₂ ∧ o₁ = o₂ ∧ v₁ = v₂ := by
  intro t₁ s₁ o₁ t₂ s₂ o₂ v₁ v₂ ht₁ hs₁ ho₁ ht₂ hs₂ ho₂ h
  have e := (parse_operationKey t₁ s₁ o₁ v₁ ht₁ hs₁ ho₁).symm.trans (h ▸ parse_operationKey t₂ s₂ o₂ v₂ ht₂ hs₂ ho₂)
  simpa using e

/-- Without the `/`, surface `a` with operation `bx.c` and surface `ab` with operation `x.c` share a key. -/
theorem operationKeyUnseparated_collides :
    ¬ ∀ (t₁ s₁ o₁ t₂ s₂ o₂ : Units) (v₁ v₂ : Nat),
      t₁ ∈ transports → validSurface s₁ = true → validOperation o₁ = true →
      t₂ ∈ transports → validSurface s₂ = true → validOperation o₂ = true →
      operationKeyUnseparated t₁ s₁ o₁ v₁ = operationKeyUnseparated t₂ s₂ o₂ v₂ →
        t₁ = t₂ ∧ s₁ = s₂ ∧ o₁ = o₂ ∧ v₁ = v₂ := by
  intro h
  have ht : "local-cli".toList.map Char.toNat ∈ transports := by decide
  have := h ("local-cli".toList.map Char.toNat) [97] [98, 120, 46, 99]
    ("local-cli".toList.map Char.toNat) [97, 98] [120, 46, 99] 1 1
    ht (by decide) (by decide) ht (by decide) (by decide)
    (by simp [operationKeyUnseparated, routeKey])
  simp at this

end GhostgetVerification.Encodings.RouteKey

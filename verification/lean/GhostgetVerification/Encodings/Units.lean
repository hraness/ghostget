/-!
UTF-16 code units, UTF-8 bytes, and the few list facts the encoding proofs
share. A JavaScript string is modelled as its list of UTF-16 code units, and a
byte string as a list of byte values.
-/
namespace GhostgetVerification.Encodings

/-- A JavaScript string as its UTF-16 code units. -/
abbrev Units := List Nat

/-- A byte string. -/
abbrev Bytes := List Nat

def isHighSurrogate (c : Nat) : Bool := 0xD800 ≤ c && c ≤ 0xDBFF

def isLowSurrogate (c : Nat) : Bool := 0xDC00 ≤ c && c ≤ 0xDFFF

def isSurrogate (c : Nat) : Bool := 0xD800 ≤ c && c ≤ 0xDFFF

/-- The UTF-8 bytes of one code point. -/
def utf8Point (p : Nat) : Bytes :=
  if p < 0x80 then [p]
  else if p < 0x800 then [0xC0 + p / 64, 0x80 + p % 64]
  else if p < 0x10000 then [0xE0 + p / 4096, 0x80 + p / 64 % 64, 0x80 + p % 64]
  else [0xF0 + p / 262144, 0x80 + p / 4096 % 64, 0x80 + p / 64 % 64, 0x80 + p % 64]

/-- The code point one unpaired code unit stands for: a lone surrogate becomes U+FFFD. -/
def unpairedPoint (c : Nat) : Nat := if isSurrogate c then 0xFFFD else c

/--
UTF-8 as `Buffer.from(string, "utf8")` and `Hash.update(string)` write a
JavaScript string: a high surrogate followed by a low surrogate is one
supplementary code point, and every other surrogate becomes U+FFFD.
-/
def utf8 : Units → Bytes
  | [] => []
  | [c] => utf8Point (unpairedPoint c)
  | c :: d :: rest =>
    if isHighSurrogate c && isLowSurrogate d then
      utf8Point (0x10000 + (c - 0xD800) * 1024 + (d - 0xDC00)) ++ utf8 rest
    else utf8Point (unpairedPoint c) ++ utf8 (d :: rest)

theorem utf8Point_no_nul (p : Nat) (h : p ≠ 0) : 0 ∉ utf8Point p := by
  unfold utf8Point
  split <;> (try split) <;> (try split) <;> simp <;> omega

theorem unpairedPoint_ne_zero (c : Nat) (h : c ≠ 0) : unpairedPoint c ≠ 0 := by
  unfold unpairedPoint
  split <;> omega

/-- UTF-8 writes a NUL byte only for a NUL code unit. -/
theorem utf8_no_nul : ∀ (s : Units), 0 ∉ s → 0 ∉ utf8 s
  | [], _ => by simp [utf8]
  | [c], h => by
    simp only [utf8]
    exact utf8Point_no_nul _ (unpairedPoint_ne_zero c (by simpa [eq_comm] using h))
  | c :: d :: rest, h => by
    have hc : c ≠ 0 := by intro e; exact h (by simp [e])
    have hd : 0 ∉ d :: rest := by intro m; exact h (List.mem_cons_of_mem _ m)
    have hr : 0 ∉ rest := by intro m; exact hd (List.mem_cons_of_mem _ m)
    simp only [utf8]
    split
    · simp only [List.mem_append, not_or]
      exact ⟨utf8Point_no_nul _ (by omega), utf8_no_nul rest hr⟩
    · simp only [List.mem_append, not_or]
      exact ⟨utf8Point_no_nul _ (unpairedPoint_ne_zero c hc), utf8_no_nul (d :: rest) hd⟩

/-- Every code unit is ASCII. -/
def Ascii (s : Units) : Prop := ∀ c ∈ s, c < 0x80

/-- UTF-8 leaves an ASCII string unchanged. -/
theorem utf8_ascii : ∀ (s : Units), Ascii s → utf8 s = s
  | [], _ => rfl
  | [c], h => by
    have hc : c < 0x80 := h c (by simp)
    have hs : isSurrogate c = false := by simp [isSurrogate]; omega
    simp [utf8, unpairedPoint, hs, utf8Point, hc]
  | c :: d :: rest, h => by
    have hc : c < 0x80 := h c (by simp)
    have hd : Ascii (d :: rest) := fun x m => h x (List.mem_cons_of_mem _ m)
    have hhigh : isHighSurrogate c = false := by simp [isHighSurrogate]; omega
    simp only [utf8, hhigh, Bool.false_and, Bool.false_eq_true, ↓reduceIte, utf8_ascii (d :: rest) hd]
    have : isSurrogate c = false := by simp [isSurrogate]; omega
    simp [unpairedPoint, this, utf8Point, hc]

/--
Splitting at the first NUL: a NUL-free prefix, the NUL, and anything after it
determine each other.
-/
theorem nul_split_injective :
    ∀ (a₁ a₂ t₁ t₂ : List Nat), 0 ∉ a₁ → 0 ∉ a₂ → a₁ ++ 0 :: t₁ = a₂ ++ 0 :: t₂ → a₁ = a₂ ∧ t₁ = t₂
  | [], [], _, _, _, _, h => by simpa using h
  | [], b :: _, _, _, _, h₂, h => by
    simp at h
    exact absurd (by simp [← h.1]) h₂
  | a :: _, [], _, _, h₁, _, h => by
    simp at h
    exact absurd (by simp [h.1]) h₁
  | a :: as, b :: bs, t₁, t₂, h₁, h₂, h => by
    simp only [List.cons_append, List.cons.injEq] at h
    have ih := nul_split_injective as bs t₁ t₂
      (fun m => h₁ (List.mem_cons_of_mem _ m)) (fun m => h₂ (List.mem_cons_of_mem _ m)) h.2
    exact ⟨by rw [h.1, ih.1], ih.2⟩

end GhostgetVerification.Encodings

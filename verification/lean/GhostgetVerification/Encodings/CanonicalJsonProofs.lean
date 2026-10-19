import GhostgetVerification.Encodings.CanonicalJson

/-!
Canonical JSON is injective up to member order, member order does not change
the encoding of an object with distinct keys, and the encoding never contains
a NUL code unit. The two seeded defects fail the first two properties.
-/
namespace GhostgetVerification.Encodings.CanonicalJson

open GhostgetVerification.Encodings

/-! ## Decoding a string body -/

/-- The value of one lowercase hexadecimal digit. -/
def hexValue (c : Nat) : Option Nat :=
  if 48 ≤ c ∧ c ≤ 57 then some (c - 48) else if 97 ≤ c ∧ c ≤ 102 then some (c - 87) else none

/-- The code unit a two-character escape stands for. -/
def simpleEscape (e : Nat) : Option Nat :=
  if e = 34 then some 34
  else if e = 92 then some 92
  else if e = 98 then some 8
  else if e = 102 then some 12
  else if e = 110 then some 10
  else if e = 114 then some 13
  else if e = 116 then some 9
  else none

def consUnit (u : Nat) : Option (Units × Units) → Option (Units × Units)
  | some (s, r) => some (u :: s, r)
  | none => none

/-- Read a string body up to its closing quote, returning the code units and what follows. -/
def decodeString : Units → Option (Units × Units)
  | [] => none
  | c :: rest =>
    if c = 34 then some ([], rest)
    else if c = 92 then
      match rest with
      | [] => none
      | e :: rest' =>
        match simpleEscape e with
        | some u => consUnit u (decodeString rest')
        | none =>
          if e = 117 then
            match rest' with
            | a :: b :: x :: y :: rest'' =>
              match hexValue a, hexValue b, hexValue x, hexValue y with
              | some va, some vb, some vx, some vy =>
                consUnit (((va * 16 + vb) * 16 + vx) * 16 + vy) (decodeString rest'')
              | _, _, _, _ => none
            | _ => none
          else none
    else consUnit c (decodeString rest)

theorem hexValue_hexDigit (d : Nat) (h : d < 16) : hexValue (hexDigit d) = some d := by
  unfold hexValue hexDigit
  by_cases h10 : d < 10
  · simp only [h10, ↓reduceIte]
    split
    · simp only [Option.some.injEq]; omega
    · omega
  · simp only [h10, ↓reduceIte]
    split
    · omega
    · split
      · simp only [Option.some.injEq]; omega
      · omega

theorem decodeString_literal (c : Nat) (t : Units) (h34 : c ≠ 34) (h92 : c ≠ 92) :
    decodeString (c :: t) = consUnit c (decodeString t) := by
  rw [decodeString.eq_def]; simp [h34, h92]

theorem decodeString_hex (c : Nat) (t : Units) (hc : c < 65536) :
    decodeString (92 :: 117 :: hex4 c ++ t) = consUnit c (decodeString t) := by
  have ha := hexValue_hexDigit (c / 4096 % 16) (by omega)
  have hb := hexValue_hexDigit (c / 256 % 16) (by omega)
  have hx := hexValue_hexDigit (c / 16 % 16) (by omega)
  have hy := hexValue_hexDigit (c % 16) (by omega)
  have hv : ((c / 4096 % 16 * 16 + c / 256 % 16) * 16 + c / 16 % 16) * 16 + c % 16 = c := by omega
  simp only [hex4, List.cons_append, List.nil_append]
  rw [decodeString.eq_def]
  simp [simpleEscape, ha, hb, hx, hy, hv]

theorem decodeString_escapeUnit (c : Nat) (t : Units) :
    decodeString (escapeUnit c ++ t) = consUnit c (decodeString t) := by
  unfold escapeUnit
  split
  · subst_vars; rw [decodeString.eq_def]; rfl
  split
  · subst_vars; rw [decodeString.eq_def]; rfl
  split
  · subst_vars; rw [decodeString.eq_def]; rfl
  split
  · subst_vars; rw [decodeString.eq_def]; rfl
  split
  · subst_vars; rw [decodeString.eq_def]; rfl
  split
  · subst_vars; rw [decodeString.eq_def]; rfl
  split
  · subst_vars; rw [decodeString.eq_def]; rfl
  split
  · rename_i h
    have hc : c < 65536 := by
      simp only [Bool.or_eq_true, decide_eq_true_eq, isSurrogate, Bool.and_eq_true] at h
      omega
    exact decodeString_hex c t hc
  · rename_i h34 h92 _ _ _ _ _ _
    exact decodeString_literal c t h34 h92

theorem decodeString_quote (t : Units) : decodeString (34 :: t) = some ([], t) := by
  rw [decodeString.eq_def]; rfl

theorem decodeString_escapeUnits (s t : Units) : decodeString (escapeUnits s ++ 34 :: t) = some (s, t) := by
  induction s using escapeUnits.induct with
  | case1 => simp only [escapeUnits, List.nil_append]; exact decodeString_quote t
  | case2 c =>
    simp only [escapeUnits]
    rw [decodeString_escapeUnit, decodeString_quote]
    rfl
  | case3 c d rest hpair ih =>
    simp only [escapeUnits, hpair, ↓reduceIte, List.cons_append]
    simp only [Bool.and_eq_true, isHighSurrogate, isLowSurrogate, decide_eq_true_eq] at hpair
    rw [decodeString_literal c _ (by omega) (by omega), decodeString_literal d _ (by omega) (by omega), ih]
    rfl
  | case4 c d rest hpair ih =>
    simp only [escapeUnits, hpair, Bool.false_eq_true, ↓reduceIte, List.append_assoc]
    rw [decodeString_escapeUnit, ih]
    rfl

/-- A quoted string and whatever follows it determine each other. -/
theorem quoteString_prefix (s₁ s₂ t₁ t₂ : Units) (h : quoteString s₁ ++ t₁ = quoteString s₂ ++ t₂) :
    s₁ = s₂ ∧ t₁ = t₂ := by
  simp only [quoteString, List.cons_append, List.append_assoc, List.cons.injEq, true_and] at h
  have := congrArg decodeString h
  rw [decodeString_escapeUnits, decodeString_escapeUnits] at this
  simpa using this

/-! ## Numbers -/

def isDigit (c : Nat) : Prop := 48 ≤ c ∧ c ≤ 57

instance (c : Nat) : Decidable (isDigit c) := inferInstanceAs (Decidable (48 ≤ c ∧ c ≤ 57))

/-- No digit starts the list, so a digit run before it cannot continue into it. -/
def Safe : Units → Prop
  | [] => True
  | c :: _ => ¬ isDigit c

theorem decimal_eq (n : Nat) : decimal n = if n < 10 then [48 + n] else decimal (n / 10) ++ [48 + n % 10] := by
  rw [decimal]

theorem decimal_digits (n : Nat) : ∀ c ∈ decimal n, isDigit c := by
  induction n using Nat.strongRecOn with
  | ind n ih =>
    rw [decimal_eq]
    split
    · simp [isDigit]; omega
    · intro c hc
      simp only [List.mem_append, List.mem_singleton] at hc
      rcases hc with hc | hc
      · exact ih (n / 10) (by omega) c hc
      · simp [isDigit]; omega

theorem decimal_ne_nil (n : Nat) : decimal n ≠ [] := by
  rw [decimal_eq]; split <;> simp

/-- Read decimal digits back. -/
def ofDigits (ds : Units) : Nat := ds.foldl (fun a d => a * 10 + (d - 48)) 0

theorem ofDigits_decimal (n : Nat) : ofDigits (decimal n) = n := by
  induction n using Nat.strongRecOn with
  | ind n ih =>
    rw [decimal_eq]
    split
    · simp [ofDigits]
    · have := ih (n / 10) (by omega)
      simp only [ofDigits, List.foldl_append, List.foldl_cons, List.foldl_nil] at this ⊢
      rw [this]
      omega

theorem digits_prefix :
    ∀ (d₁ d₂ r₁ r₂ : Units), (∀ c ∈ d₁, isDigit c) → (∀ c ∈ d₂, isDigit c) → Safe r₁ → Safe r₂ →
      d₁ ++ r₁ = d₂ ++ r₂ → d₁ = d₂ ∧ r₁ = r₂
  | [], [], _, _, _, _, _, _, h => by simpa using h
  | [], c :: _, r₁, _, _, h₂, s₁, _, h => by
    subst h
    exact absurd (h₂ c (by simp)) s₁
  | c :: _, [], _, r₂, h₁, _, _, s₂, h => by
    subst h
    exact absurd (h₁ c (by simp)) s₂
  | a :: as, b :: bs, r₁, r₂, h₁, h₂, s₁, s₂, h => by
    simp only [List.cons_append, List.cons.injEq] at h
    have ih := digits_prefix as bs r₁ r₂ (fun c m => h₁ c (by simp [m])) (fun c m => h₂ c (by simp [m])) s₁ s₂ h.2
    exact ⟨by rw [h.1, ih.1], ih.2⟩

theorem decimal_prefix (n₁ n₂ : Nat) (r₁ r₂ : Units) (s₁ : Safe r₁) (s₂ : Safe r₂)
    (h : decimal n₁ ++ r₁ = decimal n₂ ++ r₂) : n₁ = n₂ ∧ r₁ = r₂ := by
  have := digits_prefix _ _ _ _ (decimal_digits n₁) (decimal_digits n₂) s₁ s₂ h
  refine ⟨?_, this.2⟩
  rw [← ofDigits_decimal n₁, ← ofDigits_decimal n₂, this.1]

theorem decimal_head (n : Nat) : ∃ c t, decimal n = c :: t ∧ isDigit c := by
  match h : decimal n with
  | [] => exact absurd h (decimal_ne_nil n)
  | c :: t => exact ⟨c, t, rfl, decimal_digits n c (by simp [h])⟩

theorem number_prefix (n₁ n₂ : Int) (r₁ r₂ : Units) (s₁ : Safe r₁) (s₂ : Safe r₂)
    (h : number n₁ ++ r₁ = number n₂ ++ r₂) : n₁ = n₂ ∧ r₁ = r₂ := by
  cases n₁ with
  | ofNat a =>
    cases n₂ with
    | ofNat b =>
      have := decimal_prefix a b r₁ r₂ s₁ s₂ h
      exact ⟨by rw [this.1], this.2⟩
    | negSucc b =>
      obtain ⟨c, t, hc, hd⟩ := decimal_head a
      simp only [number, hc, List.cons_append, List.cons.injEq] at h
      exact absurd (h.1 ▸ hd) (by simp [isDigit])
  | negSucc a =>
    cases n₂ with
    | ofNat b =>
      obtain ⟨c, t, hc, hd⟩ := decimal_head b
      simp only [number, hc, List.cons_append, List.cons.injEq] at h
      exact absurd (h.1 ▸ hd) (by simp [isDigit])
    | negSucc b =>
      simp only [number, List.cons_append, List.cons.injEq, true_and] at h
      have := decimal_prefix _ _ r₁ r₂ s₁ s₂ h
      exact ⟨by rw [show a = b by omega], this.2⟩

/-! ## Values -/

/-- The class of a value's first code unit: one per value kind, and 7 for delimiters. -/
def kind (c : Nat) : Nat :=
  if c = 110 then 0 else if c = 116 then 1 else if c = 102 then 2
  else if c = 34 then 4 else if c = 91 then 5 else if c = 123 then 6
  else if isDigit c ∨ c = 45 then 3 else 7

def Json.kind : Json → Nat
  | .null => 0
  | .bool true => 1
  | .bool false => 2
  | .num _ => 3
  | .str _ => 4
  | .arr _ => 5
  | .obj _ => 6

theorem emit_head (j : Json) : ∃ c t, emit quoteString j = c :: t ∧ kind c = j.kind := by
  cases j with
  | null => exact ⟨_, _, rfl, rfl⟩
  | bool b => cases b <;> exact ⟨_, _, rfl, rfl⟩
  | num n =>
    cases n with
    | ofNat a =>
      obtain ⟨c, t, hc, hd⟩ := decimal_head a
      refine ⟨c, t, by simp [emit, number, hc], ?_⟩
      simp only [isDigit] at hd
      have h₁ : c ≠ 110 := by omega
      have h₂ : c ≠ 116 := by omega
      have h₃ : c ≠ 102 := by omega
      have h₄ : c ≠ 34 := by omega
      have h₅ : c ≠ 91 := by omega
      have h₆ : c ≠ 123 := by omega
      simp [kind, Json.kind, isDigit, h₁, h₂, h₃, h₄, h₅, h₆, hd]
    | negSucc a => exact ⟨_, _, rfl, by simp [kind, Json.kind, isDigit]⟩
  | str s => exact ⟨_, _, rfl, rfl⟩
  | arr items => exact ⟨_, _, rfl, rfl⟩
  | obj members => exact ⟨_, _, rfl, rfl⟩

/-- A value never starts with a delimiter. -/
theorem emit_append_ne (j : Json) (r t : Units) (d : Nat) (hd : kind d = 7) :
    emit quoteString j ++ r ≠ d :: t := by
  obtain ⟨c, u, hc, hk⟩ := emit_head j
  rw [hc]
  intro h
  simp only [List.cons_append, List.cons.injEq] at h
  rw [h.1] at hk
  cases j <;> (try rename_i b; cases b) <;> simp [Json.kind] at hk <;> omega

theorem safe_of_delimiter (d : Nat) (t : Units) (hd : kind d = 7) : Safe (d :: t) := by
  simp only [Safe]
  intro h
  simp only [kind] at hd
  split at hd <;> (try split at hd) <;> (try split at hd) <;> (try split at hd) <;> (try split at hd) <;>
    (try split at hd) <;> (try split at hd) <;> simp_all

/-- Two values of different kinds cannot start the same text. -/
theorem kind_eq_of_append (j₁ j₂ : Json) (r₁ r₂ : Units)
    (h : emit quoteString j₁ ++ r₁ = emit quoteString j₂ ++ r₂) : j₁.kind = j₂.kind := by
  obtain ⟨c₁, t₁, h₁, k₁⟩ := emit_head j₁
  obtain ⟨c₂, t₂, h₂, k₂⟩ := emit_head j₂
  rw [h₁, h₂] at h
  simp only [List.cons_append, List.cons.injEq] at h
  rw [← k₁, ← k₂, h.1]

mutual
theorem emit_prefix :
    ∀ (j₁ j₂ : Json) (r₁ r₂ : Units), Safe r₁ → Safe r₂ →
      emit quoteString j₁ ++ r₁ = emit quoteString j₂ ++ r₂ → j₁ = j₂ ∧ r₁ = r₂
  | .null, j₂, r₁, r₂, _, _, h => by
    have hk := kind_eq_of_append _ _ _ _ h
    cases j₂ with
    | null => simpa [emit] using h
    | bool b => cases b <;> simp [Json.kind] at hk
    | _ => simp [Json.kind] at hk
  | .bool a, j₂, r₁, r₂, _, _, h => by
    have hk := kind_eq_of_append _ _ _ _ h
    cases j₂ with
    | bool b => cases a <;> cases b <;> simp_all [Json.kind, emit]
    | _ => cases a <;> simp [Json.kind] at hk
  | .num a, j₂, r₁, r₂, s₁, s₂, h => by
    have hk := kind_eq_of_append _ _ _ _ h
    cases j₂ with
    | num b =>
      have := number_prefix a b r₁ r₂ s₁ s₂ (by simpa [emit] using h)
      exact ⟨by rw [this.1], this.2⟩
    | bool b => cases b <;> simp [Json.kind] at hk
    | _ => simp [Json.kind] at hk
  | .str a, j₂, r₁, r₂, _, _, h => by
    have hk := kind_eq_of_append _ _ _ _ h
    cases j₂ with
    | str b =>
      have := quoteString_prefix a b r₁ r₂ (by simpa [emit] using h)
      exact ⟨by rw [this.1], this.2⟩
    | bool b => cases b <;> simp [Json.kind] at hk
    | _ => simp [Json.kind] at hk
  | .arr xs, j₂, r₁, r₂, _, _, h => by
    have hk := kind_eq_of_append _ _ _ _ h
    cases j₂ with
    | arr ys =>
      simp only [emit, List.cons_append, List.append_assoc, List.cons.injEq, true_and] at h
      have := items_prefix xs ys r₁ r₂ h
      exact ⟨by rw [this.1], this.2⟩
    | bool b => cases b <;> simp [Json.kind] at hk
    | _ => simp [Json.kind] at hk
  | .obj ms, j₂, r₁, r₂, _, _, h => by
    have hk := kind_eq_of_append _ _ _ _ h
    cases j₂ with
    | obj ns =>
      simp only [emit, List.cons_append, List.append_assoc, List.cons.injEq, true_and] at h
      have := members_prefix ms ns r₁ r₂ h
      exact ⟨by rw [this.1], this.2⟩
    | bool b => cases b <;> simp [Json.kind] at hk
    | _ => simp [Json.kind] at hk

theorem items_prefix :
    ∀ (xs ys : List Json) (r₁ r₂ : Units),
      emitItems quoteString xs ++ 93 :: r₁ = emitItems quoteString ys ++ 93 :: r₂ → xs = ys ∧ r₁ = r₂
  | [], [], _, _, h => by simpa [emitItems] using h
  | [], [y], _, _, h => by
    simp only [emitItems, List.nil_append] at h
    exact absurd h.symm (emit_append_ne y _ _ 93 (by decide))
  | [], y :: z :: rest, _, _, h => by
    simp only [emitItems, List.nil_append, List.append_assoc, List.cons_append] at h
    exact absurd h.symm (emit_append_ne y _ _ 93 (by decide))
  | [x], [], _, _, h => by
    simp only [emitItems, List.nil_append] at h
    exact absurd h (emit_append_ne x _ _ 93 (by decide))
  | x :: z :: rest, [], _, _, h => by
    simp only [emitItems, List.nil_append, List.append_assoc, List.cons_append] at h
    exact absurd h (emit_append_ne x _ _ 93 (by decide))
  | [x], [y], r₁, r₂, h => by
    simp only [emitItems] at h
    have := emit_prefix x y _ _ (safe_of_delimiter 93 r₁ (by decide)) (safe_of_delimiter 93 r₂ (by decide)) h
    simp only [List.cons.injEq, true_and] at this
    exact ⟨by rw [this.1], this.2⟩
  | [x], y :: z :: rest, r₁, _, h => by
    simp only [emitItems, List.append_assoc, List.cons_append] at h
    have := emit_prefix x y _ _ (safe_of_delimiter 93 r₁ (by decide)) (safe_of_delimiter 44 _ (by decide)) h
    simp at this
  | x :: z :: rest, [y], _, r₂, h => by
    simp only [emitItems, List.append_assoc, List.cons_append] at h
    have := emit_prefix x y _ _ (safe_of_delimiter 44 _ (by decide)) (safe_of_delimiter 93 r₂ (by decide)) h
    simp at this
  | x :: z :: rest, y :: w :: rest', r₁, r₂, h => by
    simp only [emitItems, List.append_assoc, List.cons_append] at h
    have hx := emit_prefix x y _ _ (safe_of_delimiter 44 _ (by decide)) (safe_of_delimiter 44 _ (by decide)) h
    simp only [List.cons.injEq, true_and] at hx
    have ht := items_prefix (z :: rest) (w :: rest') r₁ r₂ (by simpa [List.append_assoc] using hx.2)
    exact ⟨by rw [hx.1, ht.1], ht.2⟩

theorem members_prefix :
    ∀ (ms ns : List (Units × Json)) (r₁ r₂ : Units),
      emitMembers quoteString ms ++ 125 :: r₁ = emitMembers quoteString ns ++ 125 :: r₂ → ms = ns ∧ r₁ = r₂
  | [], [], _, _, h => by simpa [emitMembers] using h
  | [], (k, v) :: rest, _, _, h => by
    cases rest <;> simp [emitMembers, quoteString] at h
  | (k, v) :: rest, [], _, _, h => by
    cases rest <;> simp [emitMembers, quoteString] at h
  | [(k, v)], [(k', v')], r₁, r₂, h => by
    simp only [emitMembers, List.append_assoc, List.cons_append] at h
    have hk := quoteString_prefix k k' _ _ h
    simp only [List.cons.injEq, true_and] at hk
    have hv := emit_prefix v v' _ _ (safe_of_delimiter 125 r₁ (by decide))
      (safe_of_delimiter 125 r₂ (by decide)) hk.2
    simp only [List.cons.injEq, true_and] at hv
    exact ⟨by rw [hk.1, hv.1], hv.2⟩
  | [(k, v)], (k', v') :: m :: rest, r₁, _, h => by
    simp only [emitMembers, List.append_assoc, List.cons_append] at h
    have hk := quoteString_prefix k k' _ _ h
    simp only [List.cons.injEq, true_and] at hk
    have hv := emit_prefix v v' _ _ (safe_of_delimiter 125 r₁ (by decide))
      (safe_of_delimiter 44 _ (by decide)) hk.2
    simp at hv
  | (k, v) :: m :: rest, [(k', v')], _, r₂, h => by
    simp only [emitMembers, List.append_assoc, List.cons_append] at h
    have hk := quoteString_prefix k k' _ _ h
    simp only [List.cons.injEq, true_and] at hk
    have hv := emit_prefix v v' _ _ (safe_of_delimiter 44 _ (by decide))
      (safe_of_delimiter 125 r₂ (by decide)) hk.2
    simp at hv
  | (k, v) :: m :: rest, (k', v') :: m' :: rest', r₁, r₂, h => by
    simp only [emitMembers, List.append_assoc, List.cons_append] at h
    have hk := quoteString_prefix k k' _ _ h
    simp only [List.cons.injEq, true_and] at hk
    have hv := emit_prefix v v' _ _ (safe_of_delimiter 44 _ (by decide))
      (safe_of_delimiter 44 _ (by decide)) hk.2
    simp only [List.cons.injEq, true_and] at hv
    have ht := members_prefix (m :: rest) (m' :: rest') r₁ r₂ (by simpa [List.append_assoc] using hv.2)
    exact ⟨by rw [hk.1, hv.1, ht.1], ht.2⟩
end

/-! ## Injectivity -/

theorem safe_nil : Safe [] := trivial

/--
Canonical JSON is injective up to member order: two values with the same
canonical text have the same sorted form.
-/
theorem canonicalJson_injective :
    ∀ (a b : Json), canonicalJson a = canonicalJson b → normalize a = normalize b := by
  intro a b h
  have := emit_prefix (normalize a) (normalize b) [] [] safe_nil safe_nil (by simpa [canonicalJson] using h)
  exact this.1

/-- The seeded defect writes the string `\n` (backslash, n) and a newline the same way. -/
theorem canonicalJsonKeepingBackslash_collides :
    ¬ ∀ (a b : Json), canonicalJsonKeepingBackslash a = canonicalJsonKeepingBackslash b → normalize a = normalize b := by
  intro h
  have := h (.str [92, 110]) (.str [10]) (by decide)
  simp [normalize, normalizeBy] at this

/-! ## Member order -/

theorem normalizeMembersBy_eq_map (le : Units × Json → Units × Json → Bool) :
    ∀ (m : List (Units × Json)), normalizeMembersBy le m = m.map (fun p => (p.1, normalizeBy le p.2))
  | [] => by simp [normalizeMembersBy]
  | (k, v) :: rest => by simp [normalizeMembersBy, normalizeMembersBy_eq_map le rest]

/-- Two lists in strictly increasing key order that hold the same members are equal. -/
theorem eq_of_perm_of_strict :
    ∀ (l₁ l₂ : List (Units × Json)), l₁.Perm l₂ →
      l₁.Pairwise (fun a b => a.1 < b.1) → l₂.Pairwise (fun a b => a.1 < b.1) → l₁ = l₂
  | [], l₂, hp, _, _ => List.Perm.nil_eq hp
  | a :: t₁, [], hp, _, _ => by simpa using hp.length_eq
  | a :: t₁, b :: t₂, hp, h₁, h₂ => by
    rw [List.pairwise_cons] at h₁ h₂
    by_cases hab : a = b
    · subst hab
      rw [eq_of_perm_of_strict t₁ t₂ (List.Perm.cons_inv hp) h₁.2 h₂.2]
    · have ha : a ∈ t₂ := by
        have := hp.mem_iff.mp (List.mem_cons_self)
        rcases List.mem_cons.mp this with e | m
        · exact absurd e hab
        · exact m
      have hb : b ∈ t₁ := by
        have := hp.mem_iff.mpr (List.mem_cons_self)
        rcases List.mem_cons.mp this with e | m
        · exact absurd e.symm hab
        · exact m
      exact absurd (h₂.1 a ha) (List.lt_asymm (h₁.1 b hb))

theorem lt_of_le_of_ne' (a b : Units) (hle : a ≤ b) (hne : a ≠ b) : a < b := by
  apply Decidable.by_contra
  intro hlt
  exact hne (List.le_antisymm hle (List.not_lt.mp hlt))

theorem keyLe_trans (a b c : Units × Json) (h₁ : keyLe a b = true) (h₂ : keyLe b c = true) : keyLe a c = true := by
  simp only [keyLe, decide_eq_true_eq] at *
  exact List.le_trans h₁ h₂

theorem keyLe_total (a b : Units × Json) : (keyLe a b || keyLe b a) = true := by
  simp only [keyLe, Bool.or_eq_true, decide_eq_true_eq]
  exact List.le_total a.1 b.1

/-- Sorting members with distinct keys leaves them in strictly increasing key order. -/
theorem sorted_strict (m : List (Units × Json)) (hn : (m.map Prod.fst).Nodup) :
    (m.mergeSort keyLe).Pairwise (fun a b => a.1 < b.1) := by
  have hs := List.pairwise_mergeSort keyLe_trans keyLe_total m
  have hn' : ((m.mergeSort keyLe).map Prod.fst).Nodup :=
    ((List.mergeSort_perm m keyLe).map Prod.fst).nodup_iff.mpr hn
  rw [List.nodup_iff_pairwise_ne, List.pairwise_map] at hn'
  refine (hs.and hn').imp ?_
  intro a b h
  simp only [keyLe, decide_eq_true_eq] at h
  exact lt_of_le_of_ne' _ _ h.1 h.2

/--
Member order does not change the canonical text of an object whose keys are
distinct, which a JavaScript object's keys always are.
-/
theorem canonicalJson_member_order :
    ∀ (m₁ m₂ : List (Units × Json)), m₁.Perm m₂ → (m₁.map Prod.fst).Nodup →
      canonicalJson (.obj m₁) = canonicalJson (.obj m₂) := by
  intro m₁ m₂ hp hn
  simp only [canonicalJson, normalize, normalizeBy, normalizeMembersBy_eq_map]
  have hp' := hp.map (fun p => (p.1, normalizeBy keyLe p.2))
  have hkeys : ∀ m : List (Units × Json),
      ((m.map (fun p => (p.1, normalizeBy keyLe p.2))).map Prod.fst) = m.map Prod.fst := by
    intro m; simp
  have hn₂ : (m₂.map Prod.fst).Nodup := (hp.map Prod.fst).nodup_iff.mp hn
  rw [eq_of_perm_of_strict _ _
    (((List.mergeSort_perm _ keyLe).trans hp').trans (List.mergeSort_perm _ keyLe).symm)
    (sorted_strict _ (by rw [hkeys]; exact hn)) (sorted_strict _ (by rw [hkeys]; exact hn₂))]

/-- Under the seeded defect's ordering, swapping two members changes the text. -/
theorem canonicalJsonInsertionOrder_depends_on_order :
    ¬ ∀ (m₁ m₂ : List (Units × Json)), m₁.Perm m₂ → (m₁.map Prod.fst).Nodup →
      canonicalJsonInsertionOrder (.obj m₁) = canonicalJsonInsertionOrder (.obj m₂) := by
  intro h
  have := h [([97], .null), ([98], .null)] [([98], .null), ([97], .null)] (List.Perm.swap _ _ _) (by decide)
  simp only [canonicalJsonInsertionOrder, normalizeBy, normalizeMembersBy_eq_map] at this
  rw [List.mergeSort_of_pairwise (by simp), List.mergeSort_of_pairwise (by simp)] at this
  revert this
  decide

/-! ## No NUL -/

theorem hexDigit_pos (d : Nat) : hexDigit d ≠ 0 := by
  unfold hexDigit; split <;> omega

theorem escapeUnit_no_nul (c : Nat) : 0 ∉ escapeUnit c := by
  unfold escapeUnit
  repeat' split
  all_goals simp only [hex4, List.mem_cons, List.not_mem_nil, or_false, not_or]
  all_goals first
    | omega
    | exact ⟨by omega, by omega, fun e => hexDigit_pos _ e.symm, fun e => hexDigit_pos _ e.symm,
        fun e => hexDigit_pos _ e.symm, fun e => hexDigit_pos _ e.symm⟩
    | (rename_i h; simp only [Bool.or_eq_true, decide_eq_true_eq, isSurrogate, Bool.and_eq_true] at h; omega)
    | skip

theorem escapeUnits_no_nul : ∀ (s : Units), 0 ∉ escapeUnits s
  | [] => by simp [escapeUnits]
  | [c] => by simpa [escapeUnits] using escapeUnit_no_nul c
  | c :: d :: rest => by
    unfold escapeUnits
    split
    · rename_i h
      simp only [Bool.and_eq_true, isHighSurrogate, isLowSurrogate, decide_eq_true_eq] at h
      simp only [List.mem_cons, not_or]
      exact ⟨by omega, by omega, escapeUnits_no_nul rest⟩
    · simp only [List.mem_append, not_or]
      exact ⟨escapeUnit_no_nul c, escapeUnits_no_nul (d :: rest)⟩

theorem number_no_nul (n : Int) : 0 ∉ number n := by
  intro m
  cases n with
  | ofNat a => have := decimal_digits a 0 m; simp [isDigit] at this
  | negSucc a =>
    simp only [number, List.mem_cons] at m
    rcases m with e | m
    · omega
    · have := decimal_digits _ 0 m; simp [isDigit] at this

mutual
theorem emit_no_nul : ∀ (j : Json), 0 ∉ emit quoteString j
  | .null => by simp [emit]
  | .bool true => by simp [emit]
  | .bool false => by simp [emit]
  | .num n => by simpa [emit] using number_no_nul n
  | .str s => by simpa [emit, quoteString] using escapeUnits_no_nul s
  | .arr xs => by simpa [emit] using items_no_nul xs
  | .obj ms => by simpa [emit] using members_no_nul ms

theorem items_no_nul : ∀ (xs : List Json), 0 ∉ emitItems quoteString xs
  | [] => by simp [emitItems]
  | [j] => by simpa [emitItems] using emit_no_nul j
  | j :: k :: rest => by
    simp only [emitItems, List.mem_append, List.mem_cons, not_or]
    exact ⟨emit_no_nul j, by omega, items_no_nul (k :: rest)⟩

theorem members_no_nul : ∀ (ms : List (Units × Json)), 0 ∉ emitMembers quoteString ms
  | [] => by simp [emitMembers]
  | [(k, v)] => by
    have hk := escapeUnits_no_nul k
    have hv := emit_no_nul v
    simp [emitMembers, quoteString, hk, hv]
  | (k, v) :: m :: rest => by
    have hk := escapeUnits_no_nul k
    have hv := emit_no_nul v
    have hr := members_no_nul (m :: rest)
    simp [emitMembers, quoteString, hk, hv, hr]
end

/-- Canonical JSON never contains a NUL code unit: a NUL in a string is written `\u0000`. -/
theorem canonicalJson_no_nul (j : Json) : 0 ∉ canonicalJson j := emit_no_nul (normalize j)

/-- The seeded defect writes a NUL in a string as a raw NUL. -/
theorem canonicalJsonRawNul_writes_nul : ¬ ∀ (j : Json), 0 ∉ canonicalJsonRawNul j := by
  intro h
  exact h (.str [0]) (by decide)

end GhostgetVerification.Encodings.CanonicalJson

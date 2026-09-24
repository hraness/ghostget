import GhostgetVerification.Encodings.CanonicalJsonProofs

/-!
The byte streams that durable hashes read. Three framings are modelled:

* a contract hash reads canonical JSON as UTF-8, a NUL, then the 32-byte
  implementation hash (`providerContractHash` and `localCliContractHash`);
* a provider-plugin implementation hash reads a sequence of length-framed
  sections (`updateLengthFramedHash` in `src/provider-plugin-registry.ts`);
* a confirmed-write intent key reads its fields joined by NUL
  (`intentLedgerPath` in `src/runtime.ts`).

Each theorem says the stream determines its parts, so a hash collision between
different parts needs a SHA-256 collision. SHA-256 itself is not modelled.
-/
namespace GhostgetVerification.Encodings.HashFraming

open GhostgetVerification.Encodings
open GhostgetVerification.Encodings.CanonicalJson

/-! ## Contract hash -/

/-- The bytes a contract hash reads: canonical JSON as UTF-8, a NUL, the implementation hash. -/
def contractHashPreimage (contract : Json) (implementation : Bytes) : Bytes :=
  utf8 (canonicalJson contract) ++ 0 :: implementation

/-- Seeded defect: the same stream without the NUL separator. -/
def contractHashPreimageUnseparated (contract : Json) (implementation : Bytes) : Bytes :=
  utf8 (canonicalJson contract) ++ implementation

/--
The contract-hash stream determines the contract's canonical UTF-8 bytes and
the implementation hash, whatever the implementation hash's length.
-/
theorem contractHashPreimage_injective :
    ∀ (c₁ c₂ : Json) (h₁ h₂ : Bytes), contractHashPreimage c₁ h₁ = contractHashPreimage c₂ h₂ →
      utf8 (canonicalJson c₁) = utf8 (canonicalJson c₂) ∧ h₁ = h₂ := by
  intro c₁ c₂ h₁ h₂ h
  exact nul_split_injective _ _ _ _ (utf8_no_nul _ (canonicalJson_no_nul c₁))
    (utf8_no_nul _ (canonicalJson_no_nul c₂)) h

/-- Without the separator, contract `1` with hash byte `2` reads the same as contract `12`. -/
theorem contractHashPreimageUnseparated_collides :
    ¬ ∀ (c₁ c₂ : Json) (h₁ h₂ : Bytes), contractHashPreimageUnseparated c₁ h₁ = contractHashPreimageUnseparated c₂ h₂ →
      utf8 (canonicalJson c₁) = utf8 (canonicalJson c₂) ∧ h₁ = h₂ := by
  intro h
  have h₁ : decimal 1 = [49] := by rw [decimal_eq]; rfl
  have h₁₂ : decimal 12 = [49, 50] := by rw [decimal_eq]; simp only [h₁]; rfl
  have := h (.num 1) (.num 12) [50] []
    (by simp only [contractHashPreimageUnseparated, canonicalJson, normalize, normalizeBy, emit, number]
        rw [h₁, h₁₂]
        decide)
  simp at this

/-! ## Length-framed sections -/

/-- `n` as `k` big-endian bytes, as `writeUInt32BE` (k = 4) and `writeBigUInt64BE` (k = 8) write it. -/
def be : Nat → Nat → Bytes
  | 0, _ => []
  | k + 1, n => be k (n / 256) ++ [n % 256]

/-- Read big-endian bytes back. -/
def ofBE (bs : Bytes) : Nat := bs.foldl (fun a b => a * 256 + b) 0

theorem be_length : ∀ (k n : Nat), (be k n).length = k
  | 0, _ => rfl
  | k + 1, n => by simp [be, be_length k]

theorem ofBE_be : ∀ (k n : Nat), ofBE (be k n) = n % 256 ^ k
  | 0, n => by simp [be, ofBE]; omega
  | k + 1, n => by
    have ih := ofBE_be k (n / 256)
    simp only [ofBE, be, List.foldl_append, List.foldl_cons, List.foldl_nil] at ih ⊢
    rw [ih, Nat.pow_succ', Nat.mod_mul]
    omega

/-- One section: label length (4 bytes), payload length (8 bytes), label, payload. -/
def frame (label payload : Bytes) : Bytes :=
  be 4 label.length ++ be 8 payload.length ++ label ++ payload

/-- The stream a sequence of `updateLengthFramedHash` calls writes. -/
def frames : List (Bytes × Bytes) → Bytes
  | [] => []
  | (label, payload) :: rest => frame label payload ++ frames rest

/-- Seeded defect: sections written without their length header. -/
def framesUnprefixed : List (Bytes × Bytes) → Bytes
  | [] => []
  | (label, payload) :: rest => label ++ payload ++ framesUnprefixed rest

/-- Every label fits in 32 bits of length and every payload in 64. -/
def Bounded (sections : List (Bytes × Bytes)) : Prop :=
  ∀ s ∈ sections, s.1.length < 2 ^ 32 ∧ s.2.length < 2 ^ 64

theorem be_inj (k a b : Nat) (ha : a < 256 ^ k) (hb : b < 256 ^ k) (h : be k a = be k b) : a = b := by
  have := congrArg ofBE h
  rw [ofBE_be, ofBE_be, Nat.mod_eq_of_lt ha, Nat.mod_eq_of_lt hb] at this
  exact this

theorem frame_prefix (l₁ p₁ l₂ p₂ r₁ r₂ : Bytes)
    (b₁ : l₁.length < 2 ^ 32 ∧ p₁.length < 2 ^ 64) (b₂ : l₂.length < 2 ^ 32 ∧ p₂.length < 2 ^ 64)
    (h : frame l₁ p₁ ++ r₁ = frame l₂ p₂ ++ r₂) : l₁ = l₂ ∧ p₁ = p₂ ∧ r₁ = r₂ := by
  simp only [frame, List.append_assoc] at h
  obtain ⟨hl, h⟩ := List.append_inj h (by simp [be_length])
  obtain ⟨hp, h⟩ := List.append_inj h (by simp [be_length])
  have hl' := be_inj 4 _ _ (by omega) (by omega) hl
  have hp' := be_inj 8 _ _ (by omega) (by omega) hp
  obtain ⟨el, h⟩ := List.append_inj h hl'
  obtain ⟨ep, er⟩ := List.append_inj h hp'
  exact ⟨el, ep, er⟩

/-- A length-framed stream determines its sections. -/
theorem frames_injective :
    ∀ (s₁ s₂ : List (Bytes × Bytes)), Bounded s₁ → Bounded s₂ → frames s₁ = frames s₂ → s₁ = s₂
  | [], [], _, _, _ => rfl
  | [], (l, p) :: rest, _, _, h => by
    have := congrArg List.length h
    simp [frames, frame, be_length] at this
    omega
  | (l, p) :: rest, [], _, _, h => by
    have := congrArg List.length h
    simp [frames, frame, be_length] at this
  | (l₁, p₁) :: rest₁, (l₂, p₂) :: rest₂, b₁, b₂, h => by
    simp only [frames] at h
    obtain ⟨el, ep, er⟩ := frame_prefix l₁ p₁ l₂ p₂ _ _ (b₁ _ List.mem_cons_self) (b₂ _ List.mem_cons_self) h
    have := frames_injective rest₁ rest₂ (fun s m => b₁ s (by simp [m])) (fun s m => b₂ s (by simp [m])) er
    rw [el, ep, this]

/-- Without headers, label `ab` with an empty payload reads the same as label `a` with payload `b`. -/
theorem framesUnprefixed_collides :
    ¬ ∀ (s₁ s₂ : List (Bytes × Bytes)), Bounded s₁ → Bounded s₂ → framesUnprefixed s₁ = framesUnprefixed s₂ → s₁ = s₂ := by
  intro h
  have := h [([97, 98], [])] [([97], [98])] (by simp [Bounded]) (by simp [Bounded]) (by decide)
  simp at this

/-! ## Confirmed-write intent key -/

/-- JavaScript `Array.prototype.join("\0")`. -/
def joinNul : List Units → Units
  | [] => []
  | [x] => x
  | x :: y :: rest => x ++ 0 :: joinNul (y :: rest)

/-- Seeded defect: the fields joined with no separator. -/
def joinPlain : List Units → Units
  | [] => []
  | x :: rest => x ++ joinPlain rest

/-- The fields of one confirmed-write intent. -/
structure Intent where
  adapter : Units
  auth : Units
  operation : Units
  input : Units
  duplicate : Option Units
  deriving DecidableEq

/-- `ghostget-confirmed-write-intent-v1` -/
def intentDomain : Units :=
  [103, 104, 111, 115, 116, 103, 101, 116, 45, 99, 111, 110, 102, 105, 114, 109, 101, 100, 45,
   119, 114, 105, 116, 101, 45, 105, 110, 116, 101, 110, 116, 45, 118, 49]

/-- `duplicate-intent-v1` -/
def duplicateTag : Units :=
  [100, 117, 112, 108, 105, 99, 97, 116, 101, 45, 105, 110, 116, 101, 110, 116, 45, 118, 49]

/-- The parts `intentLedgerPath` joins, in order. -/
def intentParts (i : Intent) : List Units :=
  [intentDomain, i.adapter, i.auth, i.operation, i.input] ++
    match i.duplicate with
    | none => []
    | some d => [duplicateTag, d]

/-- The bytes an intent key hashes. -/
def intentKeyPreimage (join : List Units → Units) (i : Intent) : Bytes := utf8 (join (intentParts i))

/-- Every field is ASCII and NUL-free, as the validated identifiers and hex hashes are. -/
def Admissible (i : Intent) : Prop := ∀ s ∈ intentParts i, Ascii s ∧ 0 ∉ s

theorem joinNul_injective :
    ∀ (xs ys : List Units), xs ≠ [] → ys ≠ [] → (∀ x ∈ xs, 0 ∉ x) → (∀ y ∈ ys, 0 ∉ y) →
      joinNul xs = joinNul ys → xs = ys
  | [], _, hx, _, _, _, _ => absurd rfl hx
  | _, [], _, hy, _, _, _ => absurd rfl hy
  | [x], [y], _, _, _, _, h => by simpa [joinNul] using h
  | [x], y :: y' :: rest, _, _, nx, _, h => by
    simp only [joinNul] at h
    exact absurd (by simp [h]) (nx x (by simp))
  | x :: x' :: rest, [y], _, _, _, ny, h => by
    simp only [joinNul] at h
    exact absurd (by simp [← h]) (ny y (by simp))
  | x :: x' :: rest, y :: y' :: rest', _, _, nx, ny, h => by
    simp only [joinNul] at h
    obtain ⟨e, t⟩ := nul_split_injective _ _ _ _ (nx x (by simp)) (ny y (by simp)) h
    have := joinNul_injective (x' :: rest) (y' :: rest') (by simp) (by simp)
      (fun z m => nx z (by simp [m])) (fun z m => ny z (by simp [m])) t
    rw [e, this]

theorem joinNul_ascii : ∀ (xs : List Units), (∀ x ∈ xs, Ascii x) → Ascii (joinNul xs)
  | [], _ => by simp [joinNul, Ascii]
  | [x], h => by simpa [joinNul] using h x (by simp)
  | x :: y :: rest, h => by
    have hx := h x (by simp)
    have hr := joinNul_ascii (y :: rest) (fun z m => h z (by simp [m]))
    intro c m
    simp only [joinNul, List.mem_append, List.mem_cons] at m
    rcases m with m | m | m
    · exact hx c m
    · omega
    · exact hr c m

theorem intentParts_ne_nil (i : Intent) : intentParts i ≠ [] := by
  simp [intentParts]

theorem intentParts_injective (i₁ i₂ : Intent) (h : intentParts i₁ = intentParts i₂) : i₁ = i₂ := by
  cases i₁ with
  | mk a₁ b₁ c₁ d₁ e₁ =>
    cases i₂ with
    | mk a₂ b₂ c₂ d₂ e₂ =>
      cases e₁ <;> cases e₂ <;> simp_all [intentParts]

/-- An intent key's preimage determines the intent. -/
theorem intentKeyPreimage_injective :
    ∀ (i₁ i₂ : Intent), Admissible i₁ → Admissible i₂ →
      intentKeyPreimage joinNul i₁ = intentKeyPreimage joinNul i₂ → i₁ = i₂ := by
  intro i₁ i₂ a₁ a₂ h
  simp only [intentKeyPreimage] at h
  rw [utf8_ascii _ (joinNul_ascii _ (fun s m => (a₁ s m).1)),
    utf8_ascii _ (joinNul_ascii _ (fun s m => (a₂ s m).1))] at h
  exact intentParts_injective _ _ (joinNul_injective _ _ (intentParts_ne_nil i₁) (intentParts_ne_nil i₂)
    (fun s m => (a₁ s m).2) (fun s m => (a₂ s m).2) h)

/-- Without the separator, adapter `ab` with auth `c` reads the same as adapter `a` with auth `bc`. -/
theorem intentKeyPreimagePlain_collides :
    ¬ ∀ (i₁ i₂ : Intent), Admissible i₁ → Admissible i₂ →
      intentKeyPreimage joinPlain i₁ = intentKeyPreimage joinPlain i₂ → i₁ = i₂ := by
  intro h
  have := h ⟨[97, 98], [99], [100], [101], none⟩ ⟨[97], [98, 99], [100], [101], none⟩
    (by simp [Admissible, intentParts, intentDomain, Ascii])
    (by simp [Admissible, intentParts, intentDomain, Ascii])
    (by decide)
  simp at this

end GhostgetVerification.Encodings.HashFraming

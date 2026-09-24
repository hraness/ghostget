import GhostgetVerification.Encodings.Units

/-!
A model of `canonicalJson` in `src/canonical-json.ts` over JSON values whose
numbers are integers. Strings are UTF-16 code units, string escaping follows
`JSON.stringify`, and object members are sorted by UTF-16 code-unit order.

The differential test `scripts/verification-lean-encodings.test.ts` feeds the
same generated values to `canonicalJson` and to `canonicalJson` here.
-/
namespace GhostgetVerification.Encodings.CanonicalJson

open GhostgetVerification.Encodings

/-- A JSON value. Numbers are integers; a JavaScript object is its member list. -/
inductive Json where
  | null
  | bool (b : Bool)
  | num (n : Int)
  | str (s : Units)
  | arr (items : List Json)
  | obj (members : List (Units × Json))

/-! ## Strings -/

/-- A lowercase hexadecimal digit, as `JSON.stringify` writes one. -/
def hexDigit (d : Nat) : Nat := if d < 10 then 48 + d else 87 + d

/-- Four lowercase hexadecimal digits of a code unit. -/
def hex4 (c : Nat) : Units :=
  [hexDigit (c / 4096 % 16), hexDigit (c / 256 % 16), hexDigit (c / 16 % 16), hexDigit (c % 16)]

/-- How `JSON.stringify` writes one code unit that is not half of a surrogate pair. -/
def escapeUnit (c : Nat) : Units :=
  if c = 34 then [92, 34]
  else if c = 92 then [92, 92]
  else if c = 8 then [92, 98]
  else if c = 12 then [92, 102]
  else if c = 10 then [92, 110]
  else if c = 13 then [92, 114]
  else if c = 9 then [92, 116]
  else if c < 32 || isSurrogate c then 92 :: 117 :: hex4 c
  else [c]

/-- The body of a `JSON.stringify` string: a surrogate pair stays literal, a lone surrogate is escaped. -/
def escapeUnits : Units → Units
  | [] => []
  | [c] => escapeUnit c
  | c :: d :: rest =>
    if isHighSurrogate c && isLowSurrogate d then c :: d :: escapeUnits rest
    else escapeUnit c ++ escapeUnits (d :: rest)

/-- `JSON.stringify` of a string. -/
def quoteString (s : Units) : Units := 34 :: escapeUnits s ++ [34]

/-- Seeded defect: a string writer that leaves backslash unescaped. -/
def escapeUnitKeepingBackslash (c : Nat) : Units := if c = 92 then [92] else escapeUnit c

/-- Seeded defect: the string body with backslash left unescaped. -/
def escapeUnitsKeepingBackslash : Units → Units
  | [] => []
  | [c] => escapeUnitKeepingBackslash c
  | c :: d :: rest =>
    if isHighSurrogate c && isLowSurrogate d then c :: d :: escapeUnitsKeepingBackslash rest
    else escapeUnitKeepingBackslash c ++ escapeUnitsKeepingBackslash (d :: rest)

/-- Seeded defect: a string writer that leaves backslash unescaped. -/
def quoteStringKeepingBackslash (s : Units) : Units := 34 :: escapeUnitsKeepingBackslash s ++ [34]

/-- Seeded defect: a string writer that leaves NUL unescaped. -/
def escapeUnitRawNul (c : Nat) : Units := if c = 0 then [0] else escapeUnit c

/-- Seeded defect: the string body with NUL left unescaped. -/
def escapeUnitsRawNul : Units → Units
  | [] => []
  | [c] => escapeUnitRawNul c
  | c :: d :: rest =>
    if isHighSurrogate c && isLowSurrogate d then c :: d :: escapeUnitsRawNul rest
    else escapeUnitRawNul c ++ escapeUnitsRawNul (d :: rest)

/-- Seeded defect: a string writer that leaves NUL unescaped. -/
def quoteStringRawNul (s : Units) : Units := 34 :: escapeUnitsRawNul s ++ [34]

/-! ## Numbers -/

/-- The decimal digits of a natural number. -/
def decimal (n : Nat) : Units := if n < 10 then [48 + n] else decimal (n / 10) ++ [48 + n % 10]
termination_by n
decreasing_by omega

/-- `JSON.stringify` of an integer inside the safe-integer range. -/
def number : Int → Units
  | .ofNat n => decimal n
  | .negSucc n => 45 :: decimal (n + 1)

/-! ## Values -/

mutual
/-- Write a value with its members in list order, quoting strings with `quote`. -/
def emit (quote : Units → Units) : Json → Units
  | .null => [110, 117, 108, 108]
  | .bool true => [116, 114, 117, 101]
  | .bool false => [102, 97, 108, 115, 101]
  | .num n => number n
  | .str s => quote s
  | .arr items => 91 :: emitItems quote items ++ [93]
  | .obj members => 123 :: emitMembers quote members ++ [125]

/-- Comma-separated array items. -/
def emitItems (quote : Units → Units) : List Json → Units
  | [] => []
  | [j] => emit quote j
  | j :: k :: rest => emit quote j ++ 44 :: emitItems quote (k :: rest)

/-- Comma-separated `"key":value` members. -/
def emitMembers (quote : Units → Units) : List (Units × Json) → Units
  | [] => []
  | [(key, value)] => quote key ++ 58 :: emit quote value
  | (key, value) :: m :: rest => quote key ++ 58 :: emit quote value ++ 44 :: emitMembers quote (m :: rest)
end

/-- UTF-16 code-unit order on member keys, which is JavaScript's `<` on strings. -/
def keyLe (a b : Units × Json) : Bool := decide (a.1 ≤ b.1)

mutual
/-- Sort every object's members with `le`, recursively. -/
def normalizeBy (le : Units × Json → Units × Json → Bool) : Json → Json
  | .arr items => .arr (normalizeItemsBy le items)
  | .obj members => .obj ((normalizeMembersBy le members).mergeSort le)
  | j => j

def normalizeItemsBy (le : Units × Json → Units × Json → Bool) : List Json → List Json
  | [] => []
  | j :: rest => normalizeBy le j :: normalizeItemsBy le rest

def normalizeMembersBy (le : Units × Json → Units × Json → Bool) : List (Units × Json) → List (Units × Json)
  | [] => []
  | (key, value) :: rest => (key, normalizeBy le value) :: normalizeMembersBy le rest
end

/-- A value with every object's members in UTF-16 code-unit key order. -/
def normalize (j : Json) : Json := normalizeBy keyLe j

/-- The model of `canonicalJson`: sort members by UTF-16 code units, then write. -/
def canonicalJson (j : Json) : Units := emit quoteString (normalize j)

/-- Seeded defect: canonical JSON whose string writer leaves backslash unescaped. -/
def canonicalJsonKeepingBackslash (j : Json) : Units := emit quoteStringKeepingBackslash (normalize j)

/-- Seeded defect: canonical JSON whose string writer leaves NUL unescaped. -/
def canonicalJsonRawNul (j : Json) : Units := emit quoteStringRawNul (normalize j)

/--
Seeded defect: canonical JSON under an ordering that finds every pair of keys
equal, so members keep their insertion order. Locale collation that reports
distinct keys equal did this before the RFC 8785 migration.
-/
def canonicalJsonInsertionOrder (j : Json) : Units := emit quoteString (normalizeBy (fun _ _ => true) j)

end GhostgetVerification.Encodings.CanonicalJson

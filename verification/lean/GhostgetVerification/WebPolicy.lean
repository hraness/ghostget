/-!
The web-gateway policy decision in `checkWebRequest` (`src/control/web-policy.ts`).

A rule matches a request when its origin equals the request origin, it lists
the request method, its path ruleMatches (an exact rule by equality, a prefix
rule by `startsWith`), and, unless it denies, it lists every query key of the
request. No match denies; any matching deny denies; otherwise any matching ask
asks; otherwise the request is allowed. The response-size and timeout limits
are the minimum over the matching rules and the gateway ceilings.

Strings are modelled as `List Char`. `parseWebRule` and `publicUrl` admit
only ASCII origins, paths, and query keys, where a `List Char` prefix is the
same as a UTF-16 `startsWith`.
-/
namespace GhostgetVerification.WebPolicy

inductive Method where
  | get
  | head
  deriving DecidableEq, Repr

inductive Decision where
  | allow
  | ask
  | deny
  deriving DecidableEq, Repr

/-- How much a decision restricts: allow < ask < deny. -/
def Decision.rank : Decision → Nat
  | .allow => 0
  | .ask => 1
  | .deny => 2

inductive PathKind where
  | exact
  | pref
  deriving DecidableEq, Repr

structure Rule where
  origin : List Char
  kind : PathKind
  path : List Char
  methods : List Method
  queryKeys : List (List Char)
  decision : Decision
  maxResponseBytes : Nat
  timeoutMs : Nat
  deriving DecidableEq, Repr

structure Request where
  method : Method
  origin : List Char
  path : List Char
  queryKeys : List (List Char)
  deriving DecidableEq, Repr

/-- `url.pathname === rule.path.value` or `url.pathname.startsWith(rule.path.value)`. -/
def pathMatches (rule : Rule) (path : List Char) : Bool :=
  match rule.kind with
  | .exact => path == rule.path
  | .pref => rule.path.isPrefixOf path

/-- A deny rule matches whatever the query; another rule must list every query key. -/
def queryAdmits (rule : Rule) (keys : List (List Char)) : Bool :=
  rule.decision == .deny || keys.all (fun key => rule.queryKeys.contains key)

/-- The `policy.rules.filter` predicate in `checkWebRequest`. -/
def ruleMatches (rule : Rule) (request : Request) : Bool :=
  rule.origin == request.origin
    && rule.methods.contains request.method
    && pathMatches rule request.path
    && queryAdmits rule request.queryKeys

/-- The decision over the matching rules. -/
def decideMatches (matching : List Rule) : Decision :=
  if matching.isEmpty || matching.any (fun rule => rule.decision == .deny) then .deny
  else if matching.any (fun rule => rule.decision == .ask) then .ask
  else .allow

/-- The gateway decision for one request under one rule list. -/
def decideRequest (rules : List Rule) (request : Request) : Decision :=
  decideMatches (rules.filter (ruleMatches · request))

/-- `Math.min(2_000_000, ...matches.map(rule => rule.maxResponseBytes))`. -/
def maxResponseBytes (rules : List Rule) (request : Request) : Nat :=
  ((rules.filter (ruleMatches · request)).map (·.maxResponseBytes)).foldl min 2000000

/-- `Math.min(30_000, ...matches.map(rule => rule.timeoutMs))`. -/
def timeoutMs (rules : List Rule) (request : Request) : Nat :=
  ((rules.filter (ruleMatches · request)).map (·.timeoutMs)).foldl min 30000

/-- The positions of the matching rules, for the differential test. -/
def matchingIndexes (rules : List Rule) (request : Request) : List Nat :=
  ((List.range rules.length).zip rules).filterMap fun (index, rule) =>
    if ruleMatches rule request then some index else none

/-- `matches.length === 1 ? matches[0].path.value : null`. -/
def endpoint (rules : List Rule) (request : Request) : Option (List Char) :=
  match rules.filter (ruleMatches · request) with
  | [rule] => some rule.path
  | _ => none

/-! ## The lattice -/

theorem decideMatches_nil : decideMatches [] = .deny := rfl

/-- Default deny: a request that no rule matches is denied. -/
theorem decide_default_deny (rules : List Rule) (request : Request)
    (none : ∀ rule ∈ rules, ruleMatches rule request = false) :
    decideRequest rules request = .deny := by
  have : rules.filter (ruleMatches · request) = [] := by
    rw [List.filter_eq_nil_iff]
    intro rule mem
    simp [none rule mem]
  simp [decideRequest, this, decideMatches]

/-- Deny beats ask and allow: one matching deny rule denies the request. -/
theorem decide_deny_dominates (rules : List Rule) (request : Request) (rule : Rule)
    (mem : rule ∈ rules) (hit : ruleMatches rule request = true) (deny : rule.decision = .deny) :
    decideRequest rules request = .deny := by
  have : (rules.filter (ruleMatches · request)).any (fun rule => rule.decision == .deny) = true := by
    rw [List.any_eq_true]
    exact ⟨rule, List.mem_filter.mpr ⟨mem, hit⟩, by simp [deny]⟩
  simp [decideRequest, decideMatches, this]

/-- Ask beats allow: one matching ask rule means the request is never allowed. -/
theorem decide_ask_beats_allow (rules : List Rule) (request : Request) (rule : Rule)
    (mem : rule ∈ rules) (hit : ruleMatches rule request = true) (ask : rule.decision = .ask) :
    decideRequest rules request ≠ .allow := by
  have : (rules.filter (ruleMatches · request)).any (fun rule => rule.decision == .ask) = true := by
    rw [List.any_eq_true]
    exact ⟨rule, List.mem_filter.mpr ⟨mem, hit⟩, by simp [ask]⟩
  unfold decideRequest decideMatches
  split
  · simp
  · decide

/-- An allowed request has a matching allow rule and every matching rule allows. -/
theorem decide_allow_iff (rules : List Rule) (request : Request) :
    decideRequest rules request = .allow ↔
      (∃ rule ∈ rules, ruleMatches rule request = true)
        ∧ ∀ rule ∈ rules, ruleMatches rule request = true → rule.decision = .allow := by
  unfold decideRequest decideMatches
  constructor
  · intro h
    split at h
    · cases h
    · rename_i hne
      split at h
      · cases h
      · rename_i hask
        simp only [Bool.or_eq_true, not_or, List.isEmpty_iff, List.any_eq_true, not_exists,
          not_and, List.mem_filter, beq_iff_eq] at hne hask
        refine ⟨?_, ?_⟩
        · cases hmatch : rules.filter (ruleMatches · request) with
          | nil => exact absurd hmatch hne.1
          | cons first rest =>
            have : first ∈ rules.filter (ruleMatches · request) := by simp [hmatch]
            exact ⟨first, (List.mem_filter.mp this).1, (List.mem_filter.mp this).2⟩
        · intro rule mem hit
          have hd := hne.2 rule ⟨mem, hit⟩
          have ha := hask rule ⟨mem, hit⟩
          cases hdec : rule.decision <;> simp_all
  · rintro ⟨⟨first, mem, hit⟩, all⟩
    have nonempty : (rules.filter (ruleMatches · request)).isEmpty = false := by
      cases hmatch : rules.filter (ruleMatches · request) with
      | nil =>
        have : first ∈ rules.filter (ruleMatches · request) := List.mem_filter.mpr ⟨mem, hit⟩
        simp [hmatch] at this
      | cons _ _ => rfl
    have noDeny : (rules.filter (ruleMatches · request)).any (fun rule => rule.decision == .deny) = false := by
      rw [List.any_eq_false]
      intro rule inFilter
      have ⟨m, h⟩ := List.mem_filter.mp inFilter
      simp [all rule m h]
    have noAsk : (rules.filter (ruleMatches · request)).any (fun rule => rule.decision == .ask) = false := by
      rw [List.any_eq_false]
      intro rule inFilter
      have ⟨m, h⟩ := List.mem_filter.mp inFilter
      simp [all rule m h]
    simp [nonempty, noDeny, noAsk]

theorem decideMatches_rank_cons_deny (matching : List Rule) (rule : Rule) (deny : rule.decision = .deny) :
    decideMatches (rule :: matching) = .deny := by
  simp [decideMatches, deny]

/-- Adding a deny rule anywhere in the list never widens the decision. -/
theorem decide_add_deny_never_widens (before after : List Rule) (rule : Rule) (request : Request)
    (deny : rule.decision = .deny) :
    (decideRequest (before ++ after) request).rank ≤ (decideRequest (before ++ rule :: after) request).rank := by
  by_cases hit : ruleMatches rule request = true
  · have : decideRequest (before ++ rule :: after) request = .deny :=
      decide_deny_dominates _ _ rule (by simp) hit deny
    rw [this]
    cases decideRequest (before ++ after) request <;> decide
  · have : (before ++ rule :: after).filter (ruleMatches · request) = (before ++ after).filter (ruleMatches · request) := by
      simp [List.filter_append, hit]
    simp [decideRequest, this]

theorem foldl_min_le_init (values : List Nat) (init : Nat) : values.foldl min init ≤ init := by
  induction values generalizing init with
  | nil => simp
  | cons head tail ih => exact Nat.le_trans (ih _) (Nat.min_le_left _ _)

theorem foldl_min_append (left right : List Nat) (init : Nat) :
    (left ++ right).foldl min init = right.foldl min (left.foldl min init) := by
  simp [List.foldl_append]

theorem foldl_min_mono (values : List Nat) {a b : Nat} (h : a ≤ b) : values.foldl min a ≤ values.foldl min b := by
  induction values generalizing a b with
  | nil => simpa using h
  | cons head tail ih => exact ih ((by omega))

/-- Adding any rule never raises the response-size limit: the most restrictive limit wins. -/
theorem maxResponseBytes_add_never_widens (before after : List Rule) (rule : Rule) (request : Request) :
    maxResponseBytes (before ++ rule :: after) request ≤ maxResponseBytes (before ++ after) request := by
  unfold maxResponseBytes
  simp only [List.filter_append, List.map_append, foldl_min_append, List.filter_cons]
  split
  · simp only [List.map_cons, List.foldl_cons]
    exact foldl_min_mono _ (Nat.min_le_left _ _)
  · exact Nat.le_refl _

/-- Adding any rule never raises the timeout: the most restrictive limit wins. -/
theorem timeoutMs_add_never_widens (before after : List Rule) (rule : Rule) (request : Request) :
    timeoutMs (before ++ rule :: after) request ≤ timeoutMs (before ++ after) request := by
  unfold timeoutMs
  simp only [List.filter_append, List.map_append, foldl_min_append, List.filter_cons]
  split
  · simp only [List.map_cons, List.foldl_cons]
    exact foldl_min_mono _ (Nat.min_le_left _ _)
  · exact Nat.le_refl _

/-- The gateway ceilings bound every limit. -/
theorem limits_within_ceilings (rules : List Rule) (request : Request) :
    maxResponseBytes rules request ≤ 2000000 ∧ timeoutMs rules request ≤ 30000 :=
  ⟨foldl_min_le_init _ _, foldl_min_le_init _ _⟩

/-! ## Exact matching -/

/-- A matching rule names exactly the request origin: no prefix, suffix, or subdomain match. -/
theorem matches_origin_exact (rule : Rule) (request : Request) :
    ruleMatches rule request = true → rule.origin = request.origin := by
  intro h
  simp only [ruleMatches, Bool.and_eq_true, beq_iff_eq] at h
  exact h.1.1.1

/-- A matching rule lists the request method. -/
theorem matches_method_listed (rule : Rule) (request : Request) :
    ruleMatches rule request = true → request.method ∈ rule.methods := by
  intro h
  simp only [ruleMatches, Bool.and_eq_true, List.contains_iff_mem] at h
  exact h.1.1.2

/-- An exact rule matches only its own path. -/
theorem matches_exact_path (rule : Rule) (request : Request) (exact : rule.kind = .exact) :
    ruleMatches rule request = true → request.path = rule.path := by
  intro h
  simp only [ruleMatches, pathMatches, exact, Bool.and_eq_true, beq_iff_eq] at h
  exact h.1.2

/-- A prefix rule matches only paths that begin with its whole value. -/
theorem matches_prefix_path (rule : Rule) (request : Request) (pref : rule.kind = .pref) :
    ruleMatches rule request = true → ∃ rest, request.path = rule.path ++ rest := by
  intro h
  simp only [ruleMatches, pathMatches, pref, Bool.and_eq_true] at h
  have ⟨rest, eq⟩ := List.isPrefixOf_iff_prefix.mp h.1.2
  exact ⟨rest, eq.symm⟩

/--
A prefix rule whose value ends in `/`, as `parseWebRule` requires, matches only
paths that continue past a segment boundary: `/docs/` never matches `/docsx`.
-/
theorem matches_prefix_segment (rule : Rule) (request : Request) (segment : List Char)
    (pref : rule.kind = .pref) (slash : rule.path = segment ++ ['/']) :
    ruleMatches rule request = true → ∃ rest, request.path = segment ++ '/' :: rest := by
  intro h
  have ⟨rest, eq⟩ := matches_prefix_path rule request pref h
  exact ⟨rest, by simp [eq, slash]⟩

/-- A matching allow or ask rule lists every query key of the request. -/
theorem matches_query_keys_listed (rule : Rule) (request : Request) (notDeny : rule.decision ≠ .deny) :
    ruleMatches rule request = true → ∀ key ∈ request.queryKeys, key ∈ rule.queryKeys := by
  intro h key mem
  have hq : queryAdmits rule request.queryKeys = true := by
    simp only [ruleMatches, Bool.and_eq_true] at h
    exact h.2
  have : (request.queryKeys.all fun key => rule.queryKeys.contains key) = true := by
    simpa [queryAdmits, notDeny] using hq
  rw [List.all_eq_true] at this
  simpa using this key mem

/-- A deny rule matches whatever query keys the request carries, so an added query key cannot evade it. -/
theorem deny_match_ignores_query (rule : Rule) (request : Request) (keys : List (List Char))
    (deny : rule.decision = .deny) :
    ruleMatches rule { request with queryKeys := keys } = ruleMatches rule request := by
  simp [ruleMatches, queryAdmits, deny]

/-! ## Seeded defects -/

/-- Seeded defect: consult ask rules before deny rules. -/
def decideAskFirst (rules : List Rule) (request : Request) : Decision :=
  let matching := rules.filter (ruleMatches · request)
  if matching.isEmpty then .deny
  else if matching.any (fun rule => rule.decision == .ask) then .ask
  else if matching.any (fun rule => rule.decision == .deny) then .deny
  else .allow

/-- Seeded defect: match an origin by prefix, so `https://a.co` also covers `https://a.com`. -/
def matchesOriginPrefix (rule : Rule) (request : Request) : Bool :=
  rule.origin.isPrefixOf request.origin
    && rule.methods.contains request.method
    && pathMatches rule request.path
    && queryAdmits rule request.queryKeys

/-- Seeded defect: make deny rules list query keys too, so an extra key evades them. -/
def matchesDenyNeedsQuery (rule : Rule) (request : Request) : Bool :=
  rule.origin == request.origin
    && rule.methods.contains request.method
    && pathMatches rule request.path
    && request.queryKeys.all (fun key => rule.queryKeys.contains key)

/-- A rule used by the refutations. -/
def sampleRule (decision : Decision) : Rule :=
  { origin := ['a'], kind := .pref, path := ['/'], methods := [.get], queryKeys := [],
    decision, maxResponseBytes := 1, timeoutMs := 1000 }

/-- A request used by the refutations. -/
def sampleRequest : Request :=
  { method := .get, origin := ['a'], path := ['/'], queryKeys := [] }

/-- `decide_deny_dominates` rejects consulting ask before deny. -/
theorem decideAskFirst_violates_deny_dominates :
    ¬ ∀ (rules : List Rule) (request : Request) (rule : Rule),
      rule ∈ rules → ruleMatches rule request = true → rule.decision = .deny →
        decideAskFirst rules request = .deny := by
  intro h
  have := h [sampleRule .ask, sampleRule .deny] sampleRequest (sampleRule .deny) (by simp) (by decide) rfl
  exact absurd this (by decide)

/-- `matches_origin_exact` rejects matching an origin by prefix. -/
theorem matchesOriginPrefix_violates_origin_exact :
    ¬ ∀ (rule : Rule) (request : Request),
      matchesOriginPrefix rule request = true → rule.origin = request.origin := by
  intro h
  have := h (sampleRule .allow) { sampleRequest with origin := ['a', 'b'] } (by decide)
  exact absurd this (by decide)

/-- `deny_match_ignores_query` rejects deny rules that must list query keys. -/
theorem matchesDenyNeedsQuery_violates_deny_ignores_query :
    ¬ ∀ (rule : Rule) (request : Request) (keys : List (List Char)),
      rule.decision = .deny →
        matchesDenyNeedsQuery rule { request with queryKeys := keys } = matchesDenyNeedsQuery rule request := by
  intro h
  have := h (sampleRule .deny) sampleRequest [['q']] rfl
  exact absurd this (by decide)

end GhostgetVerification.WebPolicy

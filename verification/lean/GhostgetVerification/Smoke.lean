/-!
Toolchain smoke proof. It proves a property of this toy lock only.
-/
namespace GhostgetVerification.Smoke

inductive Proc where
  | a
  | b
  deriving DecidableEq

structure Lock where
  holder : Option Proc

def acquire (s : Lock) (p : Proc) : Lock :=
  match s.holder with
  | none => { holder := some p }
  | some _ => s

def release (s : Lock) (p : Proc) : Lock :=
  if s.holder = some p then { holder := none } else s

/-- Acquiring a free lock makes the caller the holder. -/
theorem acquire_free (p : Proc) : (acquire { holder := none } p).holder = some p := rfl

/-- Acquiring a held lock never replaces the holder. -/
theorem acquire_held (q p : Proc) : (acquire { holder := some q } p).holder = some q := rfl

/-- Seeded defect: acquire without checking that the lock is free. -/
def acquireUnguarded (_ : Lock) (p : Proc) : Lock := { holder := some p }

/-- The `acquire_held` property rejects the seeded defect. -/
theorem acquireUnguarded_violates_held :
    ¬ ∀ q p : Proc, (acquireUnguarded { holder := some q } p).holder = some q := by
  intro h
  exact absurd (h .a .b) (by decide)

end GhostgetVerification.Smoke

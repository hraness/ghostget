// Toolchain smoke model: two processes share one lock.
module lock {
  pure val PROCS: Set[str] = Set("a", "b")

  var holder: str
  var critical: Set[str]

  action init = all {
    holder' = "",
    critical' = Set(),
  }

  action acquire(p: str): bool = all {
    holder == "",
    holder' = p,
    critical' = critical.union(Set(p)),
  }

  // Seeded defect: acquire without checking that the lock is free.
  action acquireUnguarded(p: str): bool = all {
    not(critical.contains(p)),
    holder' = p,
    critical' = critical.union(Set(p)),
  }

  action release(p: str): bool = all {
    critical.contains(p),
    holder' = if (holder == p) "" else holder,
    critical' = critical.exclude(Set(p)),
  }

  action step = {
    nondet p = PROCS.oneOf()
    any { acquire(p), release(p) }
  }

  action stepMutant = {
    nondet p = PROCS.oneOf()
    any { acquireUnguarded(p), release(p) }
  }

  val mutualExclusion: bool = critical.size() <= 1
}

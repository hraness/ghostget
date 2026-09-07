# Read runtime ownership

R1 execution uses Effect 3.22.1 for receipt sequencing, bounded result admission,
cleanup admission and the selected statistics pipelines. Public SDK and provider
hooks keep their Promise interfaces. R2/R3 confirmation, dispatch and journal
transitions remain in the write interpreter.

`ReadInvocationPlatform` supplies receipt persistence, the selected native
executor, strict foreign-result parsing, redaction and observation time.
`readInvocationProgram` stores the provisional receipt before starting execution.
It accepts only zero-dispatch success or failure, removes failed output and
stores the final receipt before returning output. A final receipt failure returns
the existing failed projection and preserves any private-artifact recovery handle.

The native operation deadline remains the common monotonic budget for lazy
loading, provider work and guarded callbacks. The read runtime scopes its owned
deadline and records execution separately from cleanup. It closes cleanup
registration, waits for the bounded native barrier join and only then returns the
operation result. Native cancellation does not accept the caller's private abort
reason as a diagnostic.

Authenticated cleanup admission retains the exact account, implementation and
execution identities. Its Effect program joins every registered barrier before
marking cleanup complete and releasing the content-bound controller. An unsafe
barrier retains durable admission. Portable host registration still uses its
native asynchronous context so descendant cleanup remains associated with the
exact invocation lease. No Effect finalizer replaces process-group, inode,
content-hash or private-root proof.

Contained-browser cleanup may independently prove quiescence after its single
close acknowledgement is lost. The transport accepts that native proof before
its Effect finalizer completes. The outer cleanup join retains its existing
30-second bound: once it marks a barrier unsafe, later native proof cannot
reverse that settlement or release the durable admission. Native recovery owns
any later reconciliation.

GitHub organization reads use a local HTTP layer and sequential pagination
program. The original pure organization, repository, continuation and metric
validators remain authoritative. Every page must complete the declared bounded
repository set exactly once. Scoped readers release their lock, and rejected
responses request bounded cancellation. Headers, origin, byte bounds and request
routes remain fixed by the provider contract. Failed or timed-out cancellation
projects cleanup-required with no automatic retry. Cleanup failure is recorded
independently of its rejection value, including an undefined rejection reason.

LinkedIn self-profile reads use a local service for direct and contained-browser
operations. The program owns the selected transport, exact current-member and
profile-slug checks, sequential profile and optional connections reads, and metric
projection. Browser cleanup settles before its outcome leaves the scope. A failed
transport finalizer keeps the previous Promise-finally precedence. Typed direct HTTP response
metadata permits only the reviewed identity fallback statuses; message text cannot
grant a transport switch or retry classification. Unrecognized foreign failures
remain contract drift. Pure profile and metric parsers remain unchanged.

LinkedIn company reads have a separate service and complete acquisition, identity,
company-page, projection and cleanup program. The signed-in member must match the
authorized account before company access; the company target is independently
bound to its exact universal name and company identity by the existing projector.
It need not match the member's personal profile slug. The personal and company
programs share only the typed failure and identity-fallback rules. Company reads
no longer accept an error message resembling an HTTP status as evidence to
switch transports or permit a retry. Both programs preserve the original close
error at the Promise boundary and retain an earlier operation Cause privately.

The package pins the runtime dependency and includes each new source module in
its explicit publication inventory. Root imports remain inert, and pure provider
contract and serialization modules do not construct a runtime. Provider startup
still derives and checks the complete current source/dependency closure; there is
no new hand-maintained implementation hash or dependency allowlist.

The module scanner distinguishes global `eval` from a proven local callback
record. It permits the latter only for private top-level const arrow factories whose
callers supply local literal records or forward another proven factory parameter.
Unknown inputs, factory/record escapes, mutation, computed/spread fields,
record accessors and prototype overrides fail closed. The exception permits
callback-property reads; direct, constructed and tagged member calls remain
rejected. Transparent parentheses and type wrappers do not hide writes. Actual global and indirect loaders are still
rejected throughout callback bodies. This bounded source proof does not sandbox
obfuscated JavaScript or mutated JavaScript intrinsics.

`bun run check:effect` uses the repository's unchanged TypeScript 6.0.3 compiler
and copied architecture checker 1.3.0. Exact modules have declared program,
adapter and interpreter roles. Paired fixtures reject ignored Effects, unowned
runners, broad error/requirement channels, unsafe assertions, suppression and
JavaScript catch around a fallible direct Effect generator yield. This is a
source constraint, not a proof of purity, security or linear resource use.
Separately declared or parenthesized generator functions are outside the new
catch rule's current recognition. Domain tests remain necessary.

The complete `bun run check` and applicable native gates remain required on the
reviewed tree. Release staging and public promotion follow the unchanged
[publishing workflow](publishing.md).

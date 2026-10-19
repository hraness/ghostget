# Capture failure classification

`ghostget clip`, `ghostget read` and `ghostget pdf` add `captureError` to failed
JSON results. Existing fields, exit codes and recovery handles remain available.
Successful and useful partial results retain their existing shape. Request
`--json`; raw article output is passed through unchanged.

```json
{"ok":false,"error":{"code":"failed","message":"...","next":"ghostget doctor"},"captureError":{"schemaVersion":1,"code":"unknown","retryable":false}}
```

Version 1 contains exactly `schemaVersion`, `code` and `retryable`. Clients must
reject unsupported schema versions and must never infer a category from human
messages. Missing classification in older releases means unknown, nonretryable.

| Code | Evidence and retry policy |
| --- | --- |
| `unknown` | Unclassified failure; never automatically retry. |
| `permission-required` | Typed cookie permission denial or skipped prompt; user action required. |
| `auth-required` | Typed PDF missing sign-in; user action required. |
| `invalid-input` | Argument parser or typed PDF usage failure; correct the input. |
| `cancelled` | Explicit aborted signal or typed AbortError; no automatic retry. |
| `timeout` | Typed TimeoutError; retryable after owned cleanup is proven settled. |
| `cleanup-pending` | Preserved browser artifacts; settle recovery before any retry. |
| `transient` | Reserved for a future typed transient failure; retryable. |
| `rate-limited` | Reserved for a future typed rate limit; retryable. |
| `unsupported` | Reserved for a future typed unsupported capability; no retry. |

Only timeout, transient and rate-limited carry `retryable: true`. This permits
retry policy evaluation; it does not prove browser or media cleanup. Explicit
cleanup-pending evidence takes precedence over an inner retryable result.
Permission and cleanup JSON also honor `--json` nested in capture arguments.

Wordcell currently exposes some errors only as text. Those remain unknown,
including generic HTTP/authentication/download messages. Successful partial
capture is not a failure and must be evaluated through its capture manifest.
The JSON adapter bounds inspection to one MiB per emitted result. Larger or
non-JSON output passes through without classification; clients fail closed when
classification is absent. The adapter does not buffer streamed content.

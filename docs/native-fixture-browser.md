# Native derivation fixture browser

The two native derivation custody tests use a verified Chrome-for-Testing 152.0.7977.64 payload. System browser discovery is not an accepted test toolchain. The package's pinned agent-browser 0.32.3 resolver finds exactly one verified cache candidate in each fixture child's private home. The user's home and browser state are never copied or changed.

Provisioning is separate from native startup and never counts toward its deadline. After the frozen, script-disabled dependency install, run the provisioner under the host and repository schedulers:

```sh
fixture_browser_root="$(bun run ./scripts/provision-derive-browser.ts)"
GHOSTGET_DERIVE_BROWSER_ROOT="$fixture_browser_root" bun run check
```

The same environment applies to a focused native test command. A later provisioner invocation may reuse the root only after rechecking its exact archive, executable, complete payload, and private receipt. It never repairs or replaces an invalid retained root automatically. Each native test still creates fresh sessions and browser profiles. No test-time download, warm-up, action retry, configuration exception, or timeout increase is permitted.

The pinned [official version inventory](https://googlechromelabs.github.io/chrome-for-testing/152.0.7977.64.json) names revision `1669021`. Initial acquisition verified each GCS object digest before recording the SHA-256 pins in `src/derive-browser-toolchain.test-support.ts`:

| Platform | Archive bytes | Extracted bytes | Payload entries |
| --- | ---: | ---: | ---: |
| Linux x64 | 194,030,544 | 408,234,446 | 315 |
| macOS arm64 | 187,855,482 | 372,103,223 | 650 |
| macOS x64 | 198,064,169 | 383,100,879 | 650 |

Reserve at least 1 GiB above the repository floor for one platform's archive and extraction. These are initial acquisition sizes, not permission to skip a fresh capacity check. macOS arm64 also passed the version-only check as `Google Chrome for Testing 152.0.7977.64`; the other platform binaries were hashed but not executed on that host.

PR CI provisions only the shard that contains `src/derive.test.ts`. The canonical release check provisions before its unchanged aggregate command. An optional npm mirror first enters the exact tagged source worktree, installs its frozen dependencies, and uses that source’s provisioner and pins for its full check; a later workflow’s toolchain does not replace the release source’s contract. All provisioning steps are read-only with respect to package publication and providers.

This pins an uncontrolled input discovered after PR195: green candidate CI used Ubuntu image 20260831.293.1, which listed Chrome 152.0.7977.64, while the red main run used 20260907.300.1, listing Chrome 152.0.7977.82. The logs did not establish whether Chrome startup, CDP initialization, IPC, or command completion caused the 40-second timeout. Pinning removes browser drift; it does not by itself prove that drift caused the failure. Failure receipts retain bounded, path-free toolchain and readiness evidence without suppressing the original error or relaxing cleanup custody.

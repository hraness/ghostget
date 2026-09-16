# Menu-bar companion

Ghostget's menu-bar companion is a TypeScript adapter over the shared
`hraness/desktop-foundation` runner. `ghostget menubar` delegates to the shared
lifecycle — `start`, `stop`, `status`, `doctor`, `install`, `uninstall`, and a
`--foreground` re-entry — instead of launching a product-built executable.

The shared runner is `hraness-companion`, a pinned `desktop-foundation` release
artifact bound to an exact tag, byte size, and SHA-256 digest in its release
manifest. `ghostget menubar doctor` reports the resolved artifact, its
verification state, and the unsigned-binary installation guidance for the
current platform. The binaries are unsigned by design; there is no app bundle,
no notarization, and no automatic OS trust-policy change. `install` registers
the shared runner's per-user login startup; it writes no product LaunchAgent.

The menu companion owns the control helper's private stdio channel as its
parent process. Agent requests stay on the owner-only agent socket. Menu rows
are bounded and sanitized, and every administrative action is a revision-checked
control request dispatched by the product adapter; the shared runner only
renders state and forwards action identifiers. A failed or indeterminate
mutation is never retried.

The menu lists connected accounts and reconnect or disconnect actions, pending
approvals, connection providers and in-flight sign-in attempts, operation
permissions, capabilities, web rules, interfaces, recent activity, and vault
availability. It also lists up to 12 files from a bounded scan of the selected
state home's `outputs` directory, each with size and modification time.
Supported documents can be opened; every admitted file can be revealed in the
file manager or have its path copied. A further submenu copies CLI help
commands, and the menu opens documentation.

The adapter selects the state home through the existing private-state validator.
The output directory must already exist, belong to the current user, and have
mode `0700`. The adapter does not create or adopt it. An unavailable directory
is shown as unavailable, separately from an empty directory. Snapshots inspect
at most 512 entries and never descend into subdirectories or follow symbolic
links. File actions recheck the directory and file identity before the
operating-system handoff. That readback does not eliminate races with the same
user's processes.

## Run

```sh
ghostget menubar          # start the companion
ghostget menubar status   # shared lifecycle state as JSON
ghostget menubar doctor   # artifact, verification, and platform guidance
ghostget menubar install  # per-user login startup
```

For local testing, set `GHOSTGET_MENUBAR` to the absolute path of a reviewed
companion executable; the runner reports it as a maintainer override rather than
release-verified.

## Release contract

The companion executable is the shared foundation's architecture-specific
release artifact, resolved through the pinned manifest packaged with
`@hraness/desktop-foundation`. Ghostget ships only the adapter in its CLI
archive; it publishes no platform sidecar of its own. There is no app bundle or
notarization gate. Adapter, manifest, artifact, and evidence stay bound to
exact versions end to end.

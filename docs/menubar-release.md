# Menu-bar companion

Ghostget provides a standalone macOS menu-bar executable. `ghostget menubar`
starts an existing prebuilt companion in the foreground; it never compiles
source, downloads a runtime, or assembles a desktop app.

The menu lists up to 12 files from a bounded scan of the selected state home's
`outputs` directory. Each file shows its size and modification time. Supported
documents can be opened; every admitted file can be revealed in Finder or have
its path copied. The menu also opens documentation and copies CLI help commands.
Account, approval, and interface administration are not exposed in this companion.
It does not start a control helper or run copied commands.

The CLI selects the state home through the existing private-state validator and
passes the exact output directory to the native process. The state and output
directories must already exist, belong to the current user, and have mode `0700`.
The companion does not create or adopt them. An unavailable directory is shown
as unavailable, separately from an empty directory. Snapshots inspect at most
512 entries and never descend into subdirectories or follow symbolic links.
File actions recheck the directory and file identity before the operating-system
handoff. That readback does not eliminate races with the same user's processes.

## Build and run

Build the standalone companion explicitly on macOS:

```sh
bun run menubar:check
```

This runs the native output-model regressions and writes
`build/menubar/ghostget-menubar`, a Mach-O executable. `bun run menubar:build`
builds the executable without running the model checks. For local testing, set
`GHOSTGET_MENUBAR` to the absolute executable path before running
`ghostget menubar`. Direct invocation without `--outputs-directory` shows outputs
as unavailable; it does not guess a state home.

The root Swift package lets security analysis discover these same two runtime
sources through `swift build` on macOS. It has no external dependencies or app
resources, and excludes the synthetic test entry point. The direct build above
remains the companion build; the analysis build is not a published sidecar and
does not set a new supported macOS version. Neither build enters the CLI archive.

`ghostget menubar --background` detaches the companion. `ghostget menubar install`
records its exact executable and output-directory arguments in a per-user
LaunchAgent with `RunAtLoad` enabled and `KeepAlive` disabled.
`ghostget menubar status` reports that file's installation state, not process
liveness. `ghostget menubar uninstall` removes only the exact matching agent.

## Release contract

The native executable is a separate sidecar, excluded from the CLI npm archive.
There is no app bundle or notarization gate. A future published sidecar must be
an immutable architecture-specific companion archive:

```
ghostget-menubar-darwin-arm64
ghostget-menubar-darwin-x64
```

Its manifest must bind the exact tag and source commit to the architecture,
archive byte length, SHA-256 digest, and complete resource inventory. An installer
may extract only that verified inventory before creating the per-user
LaunchAgent. This source integration does not publish those sidecar archives.
The current CLI accepts an existing qualified binary or the explicit
`GHOSTGET_MENUBAR` override and fails closed otherwise.

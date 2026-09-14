# Menu-bar companion release contract

The `ghostget menubar` command is a foreground process over a prebuilt
companion. It does not compile or assemble a desktop app at launch.

Ghostget's existing native release is a Tauri application whose executable
depends on the adjacent `ghostget-runtime/` resource tree. A bare
`target/release/ghostget-desktop` copied out of that bundle is not a valid
release artifact. A future menu-bar sidecar must therefore publish either a
standalone companion with no bundle-relative resources, or an immutable
architecture-specific bundle/resource archive:

```
ghostget-menubar-darwin-arm64
ghostget-menubar-darwin-x64
```

The release manifest must bind the exact tag and source commit to the
architecture, archive byte length, SHA-256 digest, and complete resource
inventory. The installer may extract only that verified inventory and then
create the per-user LaunchAgent.

The current CLI accepts an existing qualified binary (or the explicit
`GHOSTGET_DESKTOP` override) and fails closed otherwise. It intentionally does
not select a debug target or silently strip the Tauri resource tree.

# Menu-bar companion release contract

The `ghostget menubar` command is a foreground process over a prebuilt
companion. It does not compile or assemble a desktop app at launch.

The former Tauri control panel is a local development surface and is not a
product release. Its bundle is disabled in the checked-in configuration. The
menu-bar command consumes a standalone companion plus its explicitly staged
runtime directory; neither is nested in an `.app`. Publish an immutable
architecture-specific sidecar archive:

```
ghostget-menubar-darwin-arm64
ghostget-menubar-darwin-x64
```

The release manifest must bind the exact tag and source commit to the
architecture, archive byte length, SHA-256 digest, and complete resource
inventory. The installer may extract only that verified inventory and then
create the per-user LaunchAgent.

The current CLI accepts an existing qualified binary (or the explicit
`GHOSTGET_MENUBAR` override; `GHOSTGET_DESKTOP` remains a compatibility alias)
and fails closed otherwise. It never selects a debug target, compiles source,
or silently strips a Tauri resource tree.

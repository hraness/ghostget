# Menu-bar companion release contract

The `ghostget menubar` command is a foreground process over a prebuilt
companion. It does not compile or assemble a desktop app at launch.

Ghostget is distributed as a CLI with a standalone menu-bar companion. There is no desktop app or app bundle. Publish an immutable architecture-specific companion archive:

```
ghostget-menubar-darwin-arm64
ghostget-menubar-darwin-x64
```

The release manifest must bind the exact tag and source commit to the
architecture, archive byte length, SHA-256 digest, and complete resource
inventory. The installer may extract only that verified inventory and then
create the per-user LaunchAgent.

The current CLI accepts an existing qualified binary (or the explicit `GHOSTGET_MENUBAR` override) and fails closed otherwise. It never selects a debug target or compiles source.

# Upgrade from Wrench to Ghostget

Ghostget 0.17.4 continues Wrench with a new project name, package, command, and
website. Its provider, authorization, encrypted-state, and recovery boundaries
continue to apply.

| Surface | Current name |
| --- | --- |
| CLI | `ghostget` |
| npm package and SDK root | `@hraness/ghostget` |
| GitHub repository | `hraness/ghostget` |
| Public Agent Skill | `skills/ghostget/` |
| Website | `https://ghostget.com/` |
| Explicit state root | `GHOSTGET_STATE_HOME` |

## Update the installation

Use the exact archive and commands in the matching release's
[installation instructions](../README.md#install). Install the Agent Skill from
the same release tag. Replace SDK imports with `@hraness/ghostget` and retain
their exported subpaths, such as `@hraness/ghostget/client`.

Update scripts to invoke `ghostget`. When a script selects an explicit state
root, keep that exact path and use `GHOSTGET_STATE_HOME` for the variable name.
Run `ghostget doctor --json` and inspect the selected state root before using a
connected provider. Run `ghostget adapter sync-bundled --json` to reconcile this
release's bundled adapter manifests through the normal guarded upgrade path.

## Keep existing state in place

An existing installation's state stays in its current directory. Ghostget
recognizes the prior default roots under `~/.local/share/wrench`,
`~/.local/share/oh`, and `~/.local/share/io`. A new installation uses
`~/.local/share/ghostget`. The earlier `WRENCH_STATE_HOME`, `OH_STATE_HOME`, and
`IO_HOME` variables remain compatibility aliases. Conflicting roots are rejected
instead of selecting another account's state.

Fresh installations use `~/.local/share/ghostget/media` for media archives, with
`GHOSTGET_MEDIA_HOME` as the explicit override. A first archive on an existing
installation uses that installation's unambiguous default state parent, so it
does not create a competing state root. Existing archive roots remain selected
in place, and `WRENCH_MEDIA_HOME` remains an alias; conflicting
overrides are rejected. New transcriber configuration lives at
`~/.config/ghostget/media/transcriber.json`, while an existing Wrench
configuration stays in its current location.

Do not rename, copy, merge, or delete state directories as part of this upgrade.
Preserve auth realms, encrypted snapshots, media archives, plugin trust,
confirmation plans, dispatch journals, and recovery records. An indeterminate
operation still requires separately obtained exact reconciliation evidence;
renaming the CLI never authorizes a retry.

## Recognize retained format names

Some stored strings are versioned protocol identities. Keeping their bytes
preserves installed adapters, archive verification, encryption, and durable
records created by earlier versions:

- Adapter manifests retain `wrench-adapter.json` and
  `wrench-web-adapter.json`.
- Existing media archives retain `wrench-media.json` and the `wrenchVersion`
  field.
- Existing portable plugin archives may use the `.wrenchplugin` extension.
  New portable plugin projects use `ghostget-plugin.json`; older `wrench-plugin.json`
  manifests remain readable through the compatibility path.
- Serialized formats such as `wrench.messaging-route-resolve-request` and
  `wrench.apple-photos-contact-evidence` retain their existing schema identity.
  Encryption and digest domain strings likewise remain unchanged.

These names describe durable data formats. Continue using the Ghostget command
and package to read them; do not edit stored JSON or encrypted data to replace
the old product name.

## Historical publications

Previously published Wrench packages, version tags, release archives, checksums,
and provenance keep their original identities. A repository redirect does not
rename an immutable archive or its package manifest. Use the exact historical
coordinate when reproducing an earlier release.

The getting-started video records Wrench 0.13.5 from August 25, 2026. Its original
screens, transcript, captions, and asset filenames remain intact and are labeled
historical. Current instructions use Ghostget.

The central Hraness mailing-list audience remains `wrench` internally so that
existing subscriptions stay attached to the same audience. Ghostget is the
public display name and `ghostget.com` is the public website.

# Changelog

## 0.19.0

GhostGet continues as a public CLI and TypeScript SDK for named web actions,
page capture, media archiving, local messaging, and the remaining reviewed
provider integrations.

X and WebMCP adapters and the `ghostget-app-host` executable are unavailable
in this release. Existing local state is preserved; commands that reference
a removed provider cannot execute through a public GhostGet route.
Synchronize the remaining bundled adapters with `ghostget adapter sync-bundled`.

Native Article draft helpers remain available for the supported providers.
The X-only article-embed helper and app-host protocol export are removed.

- Remove X official and authenticated web integrations, their bundled adapters,
  the X app host, and the associated credential-vault interface.
- Remove the WebMCP provider, registry directory, and registry website pages.
- Keep the reviewed contracts and compatibility identities for all remaining
  providers, including LinkedIn, Bluesky, Beeper, Gmail, and local messaging.
- Check source files, split bundles, package metadata, and installed package
  contents for removed provider implementations before release.

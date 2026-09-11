# Contents

- `src/` – shared React screens, state, and the production native port.
- `src-tauri/` – the narrow Rust host and bundle configuration.
- `direct/` – deterministic development scenarios and the fixture entry.
- `scripts/` – build, packaging, browser, native and marketing verification.
- `README.md`, `PRODUCT.md`, and `DESIGN.md` – usage and design decisions.

# Guidelines

The root task explicitly admits this native companion. The CLI and kernel remain
primary. Keep renderer authority behind the single typed ControlPanelPort and
Tauri's explicit control_request capability. Never add generic shell, filesystem,
network, credential-read or agent approval commands.

Production, Direct and marketing have separate entry graphs. Shared React screens
and state stay real. Direct is a development dependency, never a production
runtime or a query-selected production mode. Marketing documents contain inert
rendered UI, fictional data and no executable script. Keep request and response
parsers strict, snapshot changes conditional, and failure messages categorical.

Native/package checks use the root-owned mac-native scheduler. Fixture browser
checks require an owned isolated browser, pre-navigation host allowlisting,
quiescence, semantic assertions and successful final cleanup. Screenshots cannot
qualify replaced native, credential, filesystem or provider behavior.

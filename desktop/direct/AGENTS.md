# Contents

- `definition.ts` – strict scenario definitions, stateful fixture port and coverage.
- `main.tsx` – the development-only renderer entry and browser contract.

# Guidelines

The 12 worlds are public synthetic seeds. Keep all UI and product state in
../src; replace only ControlPanelPort IO. Use canonical Direct manifest/probe
contracts and session activity. No live provider, native IPC, browser credential,
filesystem or network imports. Add no product discovery global. Treat fixture
behavior as evidence for the UI only, not backend parsing or authorization.

import { expect, test } from "bun:test";
import fc from "fast-check";
import { renderToStaticMarkup } from "react-dom/server";
import type { AccountView, ControlSection } from "../../src/control/protocol.ts";
import { makeSnapshot } from "../direct/definition.ts";
import { Accounts, connectionName } from "./accounts.tsx";
import { PanelModel } from "./model.ts";
import { ControlPanel } from "./panel.tsx";

test("service and discovery hints do not start connections or disclose a profile path", () => {
  const snapshot = makeSnapshot("accounts.discovery");
  let requests = 0;
  const model = new PanelModel({ request: async () => { requests++; throw new Error("Rendering has no effects"); } }, { snapshot });
  try {
    const html = renderToStaticMarkup(<Accounts model={model} state={model.getSnapshot()} snapshot={snapshot} />);
    expect(html).toContain("Connect a service"); expect(html).toContain("Sign-in not verified");
    expect(html).toContain("Chrome · Default"); expect(html).not.toContain("/Library/");
    expect(html).not.toContain('class="connect-form"'); expect(html).not.toContain('class="account-row"');
    expect(requests).toBe(0);
  } finally { model.dispose(); }
});

test("six visible navigation choices retain every Access route and a single current destination", () => {
  for (const section of ["accounts", "activity", "approvals", "capabilities", "web", "integrations", "vault", "setup"] as const satisfies readonly ControlSection[]) {
    const model = new PanelModel({ request: async () => { throw new Error("Static render"); } }, { snapshot: makeSnapshot("activity.history"), section });
    try {
      const html = renderToStaticMarkup(<ControlPanel model={model} />);
      const nav = html.match(/<nav aria-label="Control panel">([\s\S]*?)<\/nav>/u)![1]!;
      expect(nav.match(/<button /gu)).toHaveLength(6);
      expect(nav.match(/aria-current="page"/gu)).toHaveLength(1);
      if (["capabilities", "web", "integrations"].includes(section)) {
        expect(nav).toContain('aria-label="Access"'); expect(html).toContain('aria-label="Access settings"');
        expect(html).toContain(">Operations</button>"); expect(html).toContain(">Web rules</button>"); expect(html).toContain(">Integrations</button>");
      }
    } finally { model.dispose(); }
  }
});

test("generated names preserve existing accounts and remain within the protocol limit", () => {
  const account = makeSnapshot("activity.history").accounts[0]!;
  fc.assert(fc.property(fc.integer({ min: 0, max: 100 }), fc.constantFrom("Default", "Profile 1", "Profile 999"), (count, profile) => {
    const accounts: AccountView[] = [];
    for (let index = 0; index < count; index++) accounts.push({ ...account, id: connectionName("linkedin-web", profile, accounts) });
    const next = connectionName("linkedin-web", profile, accounts);
    expect(new Set(accounts.map(item => item.id)).has(next)).toBe(false);
    expect(next.length).toBeLessThanOrEqual(96); expect(next).toMatch(/^[a-z0-9-]+$/u);
  }), { numRuns: 100 });
  expect(connectionName("x".repeat(96), "Profile 999", [account]).length).toBeLessThanOrEqual(96);
});

test("agent setup requests remain reviewable suggestions without automatic selection", () => {
  const snapshot = makeSnapshot("accounts.requested");
  const model = new PanelModel({ request: async () => { throw new Error("No automatic setup"); } }, { snapshot });
  try {
    const html = renderToStaticMarkup(<Accounts model={model} state={model.getSnapshot()} snapshot={snapshot} />);
    expect(html).toContain("Your agent requested setup"); expect(html).toContain("Review setup"); expect(html).toContain("Dismiss");
    expect(html).not.toContain('class="connect-form"'); expect(html).not.toContain('class="account-row"');
  } finally { model.dispose(); }
});

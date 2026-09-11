import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { VaultItem, VaultView } from "../../src/control/vault-model.ts";
import { PanelModel } from "./model.ts";
import { Vault, grantFromFields } from "./vault.tsx";

const now = Date.parse("2026-09-11T12:00:00.000Z");
const item: VaultItem = { id: "11111111-1111-4111-8111-111111111111", title: "Example profile", kind: "token", username: null, source: { kind: "local", keyId: "22222222-2222-4222-8222-222222222222" }, createdAt: "2026-09-11T12:00:00.000Z" };
const grantId = "33333333-3333-4333-8333-333333333333";
const fields = { title: "Read profile", url: "https://api.example.com/profile", fields: "/profile/name\n/profile/status", expiresAt: "2026-09-12T12:00:00.000Z", decision: "ask", reviewed: true };
const vault: VaultView = { schema: 1, revision: 7, locked: false, available: true, storage: "macos-keychain", items: [item], connections: [], grants: [], pending: [] };
function markup(value: VaultView, formatting = { locale: "en-US", timeZone: "UTC" }): string {
  const model = new PanelModel({ request: async () => { throw new Error("Static metadata rendering must never perform IO"); } }, { now: () => now, ...formatting });
  try { return renderToStaticMarkup(<Vault model={model} vault={value} />); } finally { model.dispose(); }
}

test("vault item rendering exposes metadata and native-entry actions without secret inputs", () => {
  const connectionId = "44444444-4444-4444-8444-444444444444";
  const html = markup({ ...vault, connections: [{ id: connectionId, title: "Dedicated example", vaultId: "a".repeat(26), keyId: "55555555-5555-4555-8555-555555555555", access: "dedicated-vault-read-only", createdAt: item.createdAt }], items: [item, { ...item, id: "66666666-6666-4666-8666-666666666666", source: { kind: "1password", connectionId, vaultId: "a".repeat(26), itemId: "b".repeat(26), fieldId: "credential" } }], pending: [{ id: "77777777-7777-4777-8777-777777777777", purpose: "credential" }] });
  expect(html).toContain("Search vault items"); expect(html).toContain("Vault item source");
  expect(html).toContain("Continue to secure entry"); expect(html).toContain("Continue to service-account entry");
  expect(html).toContain("Delete local item…"); expect(html).toContain("Remove link…"); expect(html).toContain("Disconnect…");
  expect(html).toContain("Retry vault cleanup"); expect(html).toContain("These unfinished changes grant no access");
  expect(html).toContain("does not revoke service-account access"); expect(html).toContain("matching Web access rule");
  expect(html).not.toContain('type="password"'); expect(html).not.toContain('name="secret"'); expect(html).not.toContain('name="token"');
  expect(html).not.toContain('name="reference"'); expect(html).not.toContain(item.source.kind === "local" ? item.source.keyId : "unexpected");
});

test("locked and unavailable vaults keep metadata visible and disable secret-entry actions", () => {
  const locked = markup({ ...vault, locked: true });
  expect(locked).toContain("Vault locked"); expect(locked).toContain("Unlock vault"); expect(locked).toContain("Example profile");
  expect(locked).toMatch(/<button[^>]*disabled=""[^>]*>Continue to secure entry<\/button>/u);
  const unavailable = markup({ ...vault, locked: true, available: false, storage: "unavailable" });
  expect(unavailable).toContain("Vault unavailable"); expect(unavailable).toMatch(/<button[^>]*disabled=""[^>]*>Unlock vault<\/button>/u);
});

test("vault expiry rendering honors the model locale and timezone used by inert scenes", () => {
  const grant = grantFromFields(item, fields, now, grantId);
  const value = { ...vault, grants: [grant] };
  expect(markup(value)).toContain("Expires 9/12/2026, 12:00:00 PM");
  expect(markup(value, { locale: "en-US", timeZone: "America/Puerto_Rico" })).toContain("Expires 9/12/2026, 8:00:00 AM");
  expect(markup(value, { locale: "en-GB", timeZone: "UTC" })).toContain("Expires 12/09/2026, 12:00:00");
  const expired = markup({ ...vault, grants: [{ ...grant, expiresAt: new Date(now).toISOString() }] });
  expect(expired).toContain("Expired");
  expect(expired).not.toContain("Expires ");
});

test("grant editor emits only the fixed retrieval contract and item-appropriate authentication", () => {
  expect(grantFromFields(item, fields, now, grantId)).toEqual({ id: grantId, title: fields.title, itemId: item.id, decision: "ask", expiresAt: fields.expiresAt, use: { kind: "https-json", url: fields.url, authentication: "bearer", fields: ["/profile/name", "/profile/status"] } });
  const password = { ...item, kind: "password" as const, username: "example-user" };
  expect(grantFromFields(password, fields, now, grantId).use.authentication).toBe("basic");
  expect(() => grantFromFields({ ...password, username: null }, fields, now, grantId)).toThrow("needs a username");
  for (const patch of [
    { reviewed: false }, { url: "http://api.example.com/profile" }, { url: "https://api.example.com/profile?token=example" },
    { url: "https://example:password@api.example.com/profile" }, { url: "https://api.example.com:8443/profile" },
    { url: "https://api.example.com/profile#part" }, { fields: "" }, { fields: "/token" }, { fields: "/profile/name\n/profile/name" },
    { url: "https://localhost/profile" }, { url: "https://127.0.0.1/profile" }, { url: "https://api.example.com/%2e%2e/profile" },
    { fields: Array.from({ length: 17 }, (_, index) => `/field${index}`).join("\n") }, { fields: "/profile/*" },
    { expiresAt: "2026-09-11T12:00:00.000Z" }, { expiresAt: "2026-10-12T12:00:00.000Z" }, { decision: "unknown" },
  ]) expect(() => grantFromFields(item, { ...fields, ...patch }, now, grantId)).toThrow();
});

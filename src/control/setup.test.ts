import { expect, test } from "bun:test";
import fc from "fast-check";
import { SetupRequests } from "./setup";
import { ControlError } from "./validation";
import { parseAgentSetupRequest, parseAgentSetupResponse, parseBrowserDiscoveryView, parseSetupArguments, parseSetupRequestViews, setupServices, type BrowserDiscoveryView } from "./setup-model";

const protocol = "ghostget.setup/1" as const;
test("setup suggestions are service-only, idempotent and cannot act as administrative commands", () => {
  const queue = new SetupRequests();
  const first = queue.handle({ protocol, action: "request", serviceId: "x-web" }, 2);
  expect(parseAgentSetupResponse(first)).toEqual(first);
  expect(queue.handle({ protocol, action: "request", serviceId: "x-web" }, 2).requestId).toBe(first.requestId);
  expect(queue.list()).toHaveLength(1);
  for (const value of [
    { protocol, action: "request", serviceId: "x-web", browser: "chrome" },
    { protocol, action: "request", serviceId: "x-web", profile: "Default" },
    { protocol, action: "request", serviceId: "x-web", path: "/private" },
    { protocol, action: "request", serviceId: "x-web", approval: "allow" },
    { protocol, action: "discovery.configure", enabled: true },
    { protocol, action: "permission.enable", expectedRevision: 0 },
    { protocol, action: "request", serviceId: "unknown" },
    { protocol, action: "cancel", requestId: "../owner.json" },
  ]) expect(() => queue.handle(value, 2)).toThrow();
  expect(queue.list()).toHaveLength(1);
  queue.dismiss(first.requestId!); queue.dismiss(first.requestId!);
  expect(queue.list()).toEqual([]);
  expect(() => queue.dismiss("00000000-0000-4000-8000-000000000000")).toThrow("expired");
  const replacement = queue.handle({ protocol, action: "request", serviceId: "x-web" }, 2);
  expect(replacement.requestId).not.toBe(first.requestId);
  queue.dismiss(first.requestId!); expect(queue.list()[0]!.id).toBe(replacement.requestId!);
  queue.close(); expect(queue.list()).toEqual([]);
  expect(() => queue.handle({ protocol, action: "status" }, 2)).toThrow("Reopen");
});
test("wall clock jumps and repeated requests cannot extend setup intent lifetime", () => {
  let now = 0; let wall = Date.parse("2026-09-11T12:00:00.000Z");
  const queue = new SetupRequests(() => now, () => wall);
  const initial = queue.handle({ protocol, action: "request", serviceId: "gmail" }, 0);
  wall -= 86400000; now = 599999;
  expect(queue.handle({ protocol, action: "request", serviceId: "gmail" }, 0).setupRequests).toEqual(initial.setupRequests);
  wall += 172800000; now = 600000; expect(queue.list()).toEqual([]);
  expect(() => queue.dismiss(initial.requestId!)).toThrow("expired");
  expect(queue.handle({ protocol, action: "request", serviceId: "gmail" }, 0).requestId).not.toBe(initial.requestId);
});
test("setup request sequences preserve one bounded pending suggestion per service", () => {
  fc.assert(fc.property(fc.array(fc.record({ service: fc.constantFrom(...setupServices.map(service => service.id)), dismiss: fc.boolean(), advance: fc.integer({ min: 0, max: 610000 }) }), { maxLength: 80 }), actions => {
    let now = 0; const queue = new SetupRequests(() => now, () => 1789128000000);
    for (const action of actions) {
      now += action.advance; let response;
      try { response = queue.handle({ protocol, action: "request", serviceId: action.service }, 0); }
      catch (error) { expect(error).toBeInstanceOf(ControlError); expect((error as ControlError).code).toBe("SETUP_LIMIT"); expect(queue.list().length).toBeLessThanOrEqual(7); continue; }
      expect(parseSetupRequestViews(response.setupRequests)).toEqual(response.setupRequests);
      expect(response.setupRequests.length).toBeLessThanOrEqual(7);
      if (action.dismiss) queue.dismiss(response.requestId!);
    }
    queue.close(); expect(queue.list()).toEqual([]);
  }), { numRuns: 40 });
});
test("discovery revision zero cannot represent enabled consent", () => {
  const initial: BrowserDiscoveryView = { revision: 0, enabled: false, status: "not-scanned", scannedAt: null, profiles: [] };
  expect(parseBrowserDiscoveryView(initial)).toEqual(initial);
  expect(() => parseBrowserDiscoveryView({ ...initial, enabled: true })).toThrow("Invalid setup metadata");
  expect(parseBrowserDiscoveryView({ ...initial, revision: 1, enabled: true }).enabled).toBe(true);
});
test("setup identifiers, versions and profile labels reject trailing newline ambiguity", () => {
  const queue = new SetupRequests(); const response = queue.handle({ protocol, action: "request", serviceId: "x-web" }, 0);
  expect(() => parseAgentSetupRequest({ protocol, action: "cancel", requestId: `${response.requestId}\n` })).toThrow();
  expect(() => parseAgentSetupResponse({ ...response, version: `${response.version}\n` })).toThrow();
  expect(() => parseBrowserDiscoveryView({ revision: 1, enabled: true, status: "ready", scannedAt: "2026-09-11T12:00:00.000Z", profiles: [{ id: "chrome-default\n", browser: "chrome", profile: "Default\n", label: "Chrome · Default\n", candidates: [] }] })).toThrow();
});
test("setup and discovery parsers reject accessors, extra fields and forged login claims", () => {
  const accessor = { protocol }; Object.defineProperty(accessor, "action", { enumerable: true, get() { throw new Error("must not execute"); } });
  expect(() => parseAgentSetupRequest(accessor)).toThrow("Invalid setup metadata");
  const discovery: BrowserDiscoveryView = { revision: 1, enabled: true, status: "ready", scannedAt: "2026-09-11T12:00:00.000Z", profiles: [{ id: "chrome-default", browser: "chrome", profile: "Default", label: "Chrome · Default", candidates: ["x-web"] }] };
  expect(parseBrowserDiscoveryView(discovery)).toEqual(discovery);
  for (const patch of [{ enabled: false }, { status: "verified" }, { secret: "no" }, { profiles: [{ ...discovery.profiles[0], status: "signed-in" }] }, { profiles: [{ ...discovery.profiles[0], profile: "/private/data" }] }, { profiles: [{ ...discovery.profiles[0], candidates: ["x-web", "x-web"] }] }]) expect(() => parseBrowserDiscoveryView({ ...discovery, ...patch })).toThrow();
  for (const args of [["setup", "status", "--approve"], ["setup", "request", "x-web", "--scan"], ["setup", "request", "x-web", "--json", "--json"], ["setup", "--help", "--json"], ["setup", "request", "https://example.com"], ["setup", "cancel", "../state"]]) expect(() => parseSetupArguments(args)).toThrow();
  expect(parseSetupArguments(["setup", "--json"]).request?.action).toBe("status");
});

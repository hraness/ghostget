import { describe, expect, test } from "bun:test";
import { assertProperty, fc } from "../test-support";
import {
  parseXWebDiscoveryTarget,
  X_WEB_DISCOVERY_TARGET_BOUNDS,
  XWebDiscoveryTargetStore,
  XWebDiscoveryTargetUnavailableError,
} from "./x-web-captured-reads";

const account = { accountId: "account-fixture", subject: "123", revision: "revision-fixture" } as const;
const trend = { source: "trending", kind: "timeline", value: "provider-timeline-fixture" } as const;

describe("X provider-issued discovery targets", () => {
  test("retains opaque target data only in the issuing host and returns an immutable copy", () => {
    const store = new XWebDiscoveryTargetStore(() => 1_000);
    const mutable = { ...trend, value: String(trend.value) };
    const token = store.issue(account, mutable);
    mutable.value = "changed-after-issuance";
    expect(token).toMatch(/^xdt1_[0-9a-f-]{36}$/u);
    expect(token).not.toContain(trend.value);
    const result = store.resolve(token, account, "trending");
    expect(result).toEqual(trend);
    expect(Object.isFrozen(result)).toBeTrue();
    expect(() => new XWebDiscoveryTargetStore(() => 1_000).resolve(token, account, "trending"))
      .toThrow(XWebDiscoveryTargetUnavailableError);
  });

  test("binds the token to account namespace, exact subject, revision and source", () => {
    const store = new XWebDiscoveryTargetStore(() => 1_000);
    const token = store.issue(account, trend);
    for (const changed of [{ ...account, accountId: "other" }, { ...account, subject: "456" }, { ...account, revision: "other" }]) {
      expect(() => store.resolve(token, changed, "trending")).toThrow(XWebDiscoveryTargetUnavailableError);
    }
    expect(() => store.resolve(token, account, "today-news")).toThrow(XWebDiscoveryTargetUnavailableError);
    expect(store.resolve(token, account, "trending")).toEqual(trend);
  });

  test("uses fixed expiry and never renews lifetime on resolution", () => {
    let now = 1_000;
    const store = new XWebDiscoveryTargetStore(() => now);
    const token = store.issue(account, trend);
    now += X_WEB_DISCOVERY_TARGET_BOUNDS.ttlMs - 1;
    expect(store.resolve(token, account, "trending")).toEqual(trend);
    now += 1;
    expect(() => store.resolve(token, account, "trending")).toThrow(XWebDiscoveryTargetUnavailableError);
  });

  test("bounds owner memory and evicts only the oldest derived selection", () => {
    const store = new XWebDiscoveryTargetStore(() => 1_000);
    const oldest = store.issue(account, trend);
    let newest = oldest;
    for (let i = 0; i < X_WEB_DISCOVERY_TARGET_BOUNDS.maxEntries; i += 1) newest = store.issue(account, trend);
    expect(() => store.resolve(oldest, account, "trending")).toThrow(XWebDiscoveryTargetUnavailableError);
    expect(store.resolve(newest, account, "trending")).toEqual(trend);
  });

  test("account disconnect and host close revoke selections without affecting another account", () => {
    const store = new XWebDiscoveryTargetStore(() => 1_000);
    const otherAccount = { ...account, accountId: "other-account" };
    const selected = store.issue(account, trend);
    const other = store.issue(otherAccount, trend);
    store.revokeAccount(account.accountId);
    expect(() => store.resolve(selected, account, "trending")).toThrow(XWebDiscoveryTargetUnavailableError);
    expect(store.resolve(other, otherAccount, "trending")).toEqual(trend);
    store.clear();
    expect(() => store.resolve(other, otherAccount, "trending")).toThrow(XWebDiscoveryTargetUnavailableError);
  });

  test("rejects malformed tokens without reflecting provider IDs or input", () => {
    const store = new XWebDiscoveryTargetStore(() => 1_000);
    for (const value of [null, undefined, "", "https://x.com/i/news/private-target", "xdt1_not-a-uuid", { ...trend }]) {
      try { store.resolve(value, account, "trending"); throw new Error("unexpected resolution"); }
      catch (error) {
        expect(error).toBeInstanceOf(XWebDiscoveryTargetUnavailableError);
        expect((error as Error).message).not.toContain("private-target");
      }
    }
  });

  test("closes internal descriptors and account bindings before accepting a target", () => {
    for (const value of [null, [], {}, { ...trend, endpoint: "https://x.com" }, { ...trend, kind: "url" }, { ...trend, source: "all" }, { ...trend, value: "" }, { ...trend, value: "bad\nvalue" }, { ...trend, value: "x".repeat(4_097) }]) {
      expect(() => parseXWebDiscoveryTarget(value)).toThrow();
    }
    const store = new XWebDiscoveryTargetStore(() => 1_000);
    for (const changed of [{ ...account, subject: "@fixture" }, { ...account, revision: "" }, { ...account, extra: true }]) {
      expect(() => store.issue(changed, trend)).toThrow();
    }
    expect(() => new XWebDiscoveryTargetStore(() => Number.NaN).issue(account, trend)).toThrow("clock");
    expect(() => new XWebDiscoveryTargetStore(() => -1).issue(account, trend)).toThrow("clock");
  });

  test("target strings roundtrip as opaque values, never as caller request fields", () => {
    assertProperty(fc.property(fc.stringMatching(/^[A-Za-z0-9_:/?=&-]{1,100}$/u), value => {
      const store = new XWebDiscoveryTargetStore(() => 1_000);
      const target = { source: "today-news", kind: "story", value } as const;
      const token = store.issue(account, target);
      expect(store.resolve(token, account, "today-news")).toEqual(target);
      expect(() => store.resolve(value, account, "today-news")).toThrow(XWebDiscoveryTargetUnavailableError);
    }));
  });
});

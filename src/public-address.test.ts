import { describe, expect, test } from "bun:test";

import { isPublicUnicastAddress, parseIpv4, parseIpv6 } from "./public-address";
import { assertProperty, fc } from "./test-support";

const ipv4Value = fc.bigInt({ min: 0n, max: (1n << 32n) - 1n });
const ipv6Value = fc.bigInt({ min: 0n, max: (1n << 128n) - 1n });
const globalIpv6Value = fc.bigInt({ min: 0n, max: (1n << 125n) - 1n }).map((low) => (1n << 125n) | low);

function ipv4Text(value: bigint): string {
  return [24n, 16n, 8n, 0n].map((shift) => String((value >> shift) & 0xffn)).join(".");
}

function words(value: bigint): bigint[] {
  return Array.from({ length: 8 }, (_, index) => (value >> BigInt(112 - 16 * index)) & 0xffffn);
}

/** Every valid text form of one IPv6 value: each zero run compressed or not, any case, dotted tail or not. */
const ipv6Text = (value: bigint) => fc.record({
  upper: fc.boolean(),
  pad: fc.boolean(),
  dotted: fc.boolean(),
  compress: fc.option(fc.tuple(fc.nat(7), fc.nat(7)), { nil: undefined }),
}).map(({ upper, pad, dotted, compress }) => {
  const all = words(value);
  const hex = (word: bigint): string => (pad ? word.toString(16).padStart(4, "0") : word.toString(16));
  const parts = dotted ? [...all.slice(0, 6).map(hex), ipv4Text(value & 0xffffffffn)] : all.map(hex);
  const limit = dotted ? 6 : 8;
  let text = parts.join(":");
  if (compress !== undefined) {
    const start = Math.min(compress[0], compress[1]) % limit;
    let end = start;
    while (end < limit && all[end] === 0n && end - start < 1 + compress[1]) end += 1;
    if (end - start >= 1) {
      const left = parts.slice(0, start).join(":");
      const right = parts.slice(end).join(":");
      text = `${left}::${right}`;
    }
  }
  return upper ? text.toUpperCase() : text;
});

function inside(value: bigint, base: bigint, length: number): boolean {
  const shift = BigInt(128 - length);
  return value >> shift === base >> shift;
}

describe("public unicast address classifier", () => {
  test("every IPv4 value reads back from its dotted quad", () => {
    assertProperty(fc.property(ipv4Value, (value) => {
      expect(parseIpv4(ipv4Text(value))).toBe(value);
    }));
  });

  test("every text form of one IPv6 value parses to it and has one verdict", () => {
    assertProperty(fc.property(
      fc.oneof(ipv6Value, globalIpv6Value).chain((value) => fc.tuple(fc.constant(value), ipv6Text(value), ipv6Text(value))),
      ([value, left, right]) => {
        expect(parseIpv6(left)).toBe(value);
        expect(parseIpv6(right)).toBe(value);
        expect(isPublicUnicastAddress(left)).toBe(isPublicUnicastAddress(right));
      },
    ));
  });

  test("IPv6 outside 2000::/3 is never public", () => {
    assertProperty(fc.property(ipv6Value.filter((value) => value >> 125n !== 1n), (value) => {
      expect(isPublicUnicastAddress(words(value).map((word) => word.toString(16)).join(":"))).toBeFalse();
    }));
  });

  test("an IPv6 form that embeds an IPv4 address is never public, whatever the IPv4 address", () => {
    assertProperty(fc.property(ipv4Value, fc.bigInt({ min: 0n, max: (1n << 32n) - 1n }), (embedded, other) => {
      const forms = [
        (0xffffn << 32n) | embedded, // mapped
        (0xffffn << 48n) | embedded, // translated
        embedded, // compatible
        (0x64ff9bn << 96n) | embedded, // NAT64
        (0x64ff9b0001n << 80n) | embedded, // local NAT64
        (0x2002n << 112n) | (embedded << 80n) | other, // 6to4
        (0x20010000n << 96n) | (other << 64n) | embedded, // Teredo
      ];
      for (const value of forms) {
        const text = [...words(value).slice(0, 6).map((word) => word.toString(16)), ipv4Text(value & 0xffffffffn)].join(":");
        expect({ text, verdict: isPublicUnicastAddress(text) }).toEqual({ text, verdict: false });
      }
    }));
  });

  test("a global IPv6 value is public exactly outside the refused rows", () => {
    const refused: readonly (readonly [bigint, number])[] = [
      [0x2001n << 112n, 23],
      [0x20010db8n << 96n, 32],
      [0x2002n << 112n, 16],
      [0x2620004f8000n << 80n, 48],
      [0x3fffn << 112n, 20],
    ];
    assertProperty(fc.property(globalIpv6Value, (value) => {
      const expected = !refused.some(([base, length]) => inside(value, base, length));
      expect(isPublicUnicastAddress(words(value).map((word) => word.toString(16)).join(":"))).toBe(expected);
    }));
  });

  test("a zone, brackets, whitespace, or a prefix length refuses an otherwise public address", () => {
    assertProperty(fc.property(
      globalIpv6Value.filter((value) => isPublicUnicastAddress(words(value).map((word) => word.toString(16)).join(":"))),
      fc.constantFrom((text: string) => `${text}%1`, (text: string) => `[${text}]`, (text: string) => ` ${text}`,
        (text: string) => `${text}/128`, (text: string) => `${text}\n`),
      (value, decorate) => {
        const text = words(value).map((word) => word.toString(16)).join(":");
        expect(isPublicUnicastAddress(decorate(text))).toBeFalse();
      },
    ));
  });

  test("named examples", () => {
    expect(isPublicUnicastAddress("93.184.216.34")).toBeTrue();
    expect(isPublicUnicastAddress("2606:4700:4700::1111")).toBeTrue();
    for (const address of ["127.0.0.1", "::ffff:0:7f00:1", "::ffff:127.0.0.1", "::1", "4000::1", "192.88.99.1", "fe80::1",
      "fc00::1", "2001:db8::1", "3fff::1", "0177.0.0.1", "example.com"]) {
      expect({ address, verdict: isPublicUnicastAddress(address) }).toEqual({ address, verdict: false });
    }
  });
});

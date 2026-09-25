/**
 * Ghostget's own check that a resolved address is public unicast space.
 *
 * `@hraness/kb` refuses private and reserved addresses during resolution, but
 * its classifier admits some non-public IPv6 forms, such as the IPv4-translated
 * `::ffff:0:0:0/96` form of a loopback address and space outside `2000::/3`
 * (`kb/plans/kb-ip-classifier-proposal.md`). The pinned transport therefore
 * checks every resolved address again with this allowlist before it opens a
 * socket.
 *
 * The table restates the IANA IPv4 and IPv6 special-purpose address registries
 * as the proposal lists them. IPv6 is admitted only inside `2000::/3`, so every
 * form that embeds an IPv4 address (mapped, translated, compatible, NAT64,
 * 6to4, Teredo) is refused rather than classified by its embedded address.
 * Text must be one canonical dotted quad or one RFC 4291 IPv6 address with no
 * zone; anything else is refused.
 */

type Row = Readonly<{ base: bigint; length: number }>;

const DECIMAL_OCTET = /^(?:0|[1-9][0-9]{0,2})$/u;
const HEX_GROUP = /^[0-9A-Fa-f]{1,4}$/u;

function v4(text: string): bigint {
  const value = parseIpv4(text);
  if (value === null) throw new Error(`invalid table address ${text}`);
  return value;
}

function v6(text: string): bigint {
  const value = parseIpv6(text);
  if (value === null) throw new Error(`invalid table address ${text}`);
  return value;
}

function row(bits: 32 | 128, base: bigint, length: number): Row {
  const host = (1n << BigInt(bits - length)) - 1n;
  if ((base & host) !== 0n) throw new Error("table rows must have zero host bits");
  return Object.freeze({ base, length });
}

/** Special-purpose IPv4 blocks, plus multicast and the reserved and broadcast space. */
export const REFUSED_IPV4_BLOCKS: readonly string[] = Object.freeze([
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24",
  "192.31.196.0/24",
  "192.52.193.0/24",
  "192.88.99.0/24",
  "192.168.0.0/16",
  "192.175.48.0/24",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/4",
  "240.0.0.0/4",
]);

/** The only IPv6 space admitted at all. */
export const ADMITTED_IPV6_BLOCK = "2000::/3";

/** Special-purpose IPv6 blocks inside `2000::/3`. */
export const REFUSED_IPV6_BLOCKS: readonly string[] = Object.freeze([
  "2001::/23",
  "2001:db8::/32",
  "2002::/16",
  "2620:4f:8000::/48",
  "3fff::/20",
]);

function parseBlock(text: string, bits: 32 | 128): Row {
  const [address, length, ...rest] = text.split("/");
  const prefix = Number(length);
  if (address === undefined || rest.length !== 0 || !Number.isInteger(prefix) || prefix < 0 || prefix > bits) {
    throw new Error(`invalid table block ${text}`);
  }
  return row(bits, bits === 32 ? v4(address) : v6(address), prefix);
}

function contains(bits: 32 | 128, block: Row, value: bigint): boolean {
  const shift = BigInt(bits - block.length);
  return value >> shift === block.base >> shift;
}

/** One canonical dotted quad: four decimal octets without leading zeros. */
export function parseIpv4(text: string): bigint | null {
  const parts = text.split(".");
  if (parts.length !== 4) return null;
  let value = 0n;
  for (const part of parts) {
    if (!DECIMAL_OCTET.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = (value << 8n) | BigInt(octet);
  }
  return value;
}

function groups(text: string): bigint[] | null {
  if (text === "") return [];
  const parts = text.split(":");
  const result: bigint[] = [];
  for (const [index, part] of parts.entries()) {
    if (index === parts.length - 1 && part.includes(".")) {
      const embedded = parseIpv4(part);
      if (embedded === null) return null;
      result.push(embedded >> 16n, embedded & 0xffffn);
      continue;
    }
    if (!HEX_GROUP.test(part)) return null;
    result.push(BigInt(Number.parseInt(part, 16)));
  }
  return result;
}

/** One RFC 4291 IPv6 address with no zone identifier, as a 128-bit value. */
export function parseIpv6(text: string): bigint | null {
  if (text.length > 45 || !/^[0-9A-Fa-f:.]+$/u.test(text)) return null;
  const compression = text.indexOf("::");
  let words: bigint[];
  if (compression === -1) {
    const all = groups(text);
    if (all === null || all.length !== 8) return null;
    words = all;
  } else {
    if (text.indexOf("::", compression + 1) !== -1) return null;
    const left = groups(text.slice(0, compression));
    const right = groups(text.slice(compression + 2));
    if (left === null || right === null) return null;
    // The embedded dotted quad may only end the address.
    if (text.slice(0, compression).includes(".")) return null;
    const missing = 8 - left.length - right.length;
    if (missing < 1) return null;
    words = [...left, ...Array.from({ length: missing }, () => 0n), ...right];
  }
  let value = 0n;
  for (const word of words) value = (value << 16n) | word;
  return value;
}

export type AddressTable = Readonly<{
  refusedIpv4: readonly string[];
  admittedIpv6: string;
  refusedIpv6: readonly string[];
}>;

/** The production table. */
export const PUBLIC_ADDRESS_TABLE: AddressTable = Object.freeze({
  refusedIpv4: REFUSED_IPV4_BLOCKS,
  admittedIpv6: ADMITTED_IPV6_BLOCK,
  refusedIpv6: REFUSED_IPV6_BLOCKS,
});

/**
 * Build a classifier over one table. Tests build classifiers over altered
 * tables to show that the golden vectors notice each missing row.
 */
export function publicUnicastClassifier(table: AddressTable): (address: string) => boolean {
  const ipv4Rows = Object.freeze(table.refusedIpv4.map((block) => parseBlock(block, 32)));
  const ipv6Admitted = parseBlock(table.admittedIpv6, 128);
  const ipv6Rows = Object.freeze(table.refusedIpv6.map((block) => parseBlock(block, 128)));
  return (address: string): boolean => {
    if (typeof address !== "string") return false;
    if (address.includes(":")) {
      const value = parseIpv6(address);
      if (value === null || !contains(128, ipv6Admitted, value)) return false;
      return !ipv6Rows.some((block) => contains(128, block, value));
    }
    const value = parseIpv4(address);
    if (value === null) return false;
    return !ipv4Rows.some((block) => contains(32, block, value));
  };
}

/**
 * Whether one resolved address is public unicast space that the pinned
 * transport may connect to. Every other text, including a scoped IPv6
 * address, a non-canonical dotted quad, and a host name, is refused.
 */
export const isPublicUnicastAddress: (address: string) => boolean = publicUnicastClassifier(PUBLIC_ADDRESS_TABLE);

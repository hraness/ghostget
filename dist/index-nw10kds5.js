// @bun
// src/public-address.ts
var DECIMAL_OCTET = /^(?:0|[1-9][0-9]{0,2})$/u;
var HEX_GROUP = /^[0-9A-Fa-f]{1,4}$/u;
function v4(text) {
  const value = parseIpv4(text);
  if (value === null)
    throw new Error(`invalid table address ${text}`);
  return value;
}
function v6(text) {
  const value = parseIpv6(text);
  if (value === null)
    throw new Error(`invalid table address ${text}`);
  return value;
}
function row(bits, base, length) {
  const host = (1n << BigInt(bits - length)) - 1n;
  if ((base & host) !== 0n)
    throw new Error("table rows must have zero host bits");
  return Object.freeze({ base, length });
}
var REFUSED_IPV4_BLOCKS = Object.freeze([
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
  "240.0.0.0/4"
]);
var ADMITTED_IPV6_BLOCK = "2000::/3";
var REFUSED_IPV6_BLOCKS = Object.freeze([
  "2001::/23",
  "2001:db8::/32",
  "2002::/16",
  "2620:4f:8000::/48",
  "3fff::/20"
]);
function parseBlock(text, bits) {
  const [address, length, ...rest] = text.split("/");
  const prefix = Number(length);
  if (address === undefined || rest.length !== 0 || !Number.isInteger(prefix) || prefix < 0 || prefix > bits) {
    throw new Error(`invalid table block ${text}`);
  }
  return row(bits, bits === 32 ? v4(address) : v6(address), prefix);
}
function contains(bits, block, value) {
  const shift = BigInt(bits - block.length);
  return value >> shift === block.base >> shift;
}
function parseIpv4(text) {
  const parts = text.split(".");
  if (parts.length !== 4)
    return null;
  let value = 0n;
  for (const part of parts) {
    if (!DECIMAL_OCTET.test(part))
      return null;
    const octet = Number(part);
    if (octet > 255)
      return null;
    value = value << 8n | BigInt(octet);
  }
  return value;
}
function groups(text) {
  if (text === "")
    return [];
  const parts = text.split(":");
  const result = [];
  for (const [index, part] of parts.entries()) {
    if (index === parts.length - 1 && part.includes(".")) {
      const embedded = parseIpv4(part);
      if (embedded === null)
        return null;
      result.push(embedded >> 16n, embedded & 0xffffn);
      continue;
    }
    if (!HEX_GROUP.test(part))
      return null;
    result.push(BigInt(Number.parseInt(part, 16)));
  }
  return result;
}
function parseIpv6(text) {
  if (text.length > 45 || !/^[0-9A-Fa-f:.]+$/u.test(text))
    return null;
  const compression = text.indexOf("::");
  let words;
  if (compression === -1) {
    const all = groups(text);
    if (all === null || all.length !== 8)
      return null;
    words = all;
  } else {
    if (text.indexOf("::", compression + 1) !== -1)
      return null;
    const left = groups(text.slice(0, compression));
    const right = groups(text.slice(compression + 2));
    if (left === null || right === null)
      return null;
    if (text.slice(0, compression).includes("."))
      return null;
    const missing = 8 - left.length - right.length;
    if (missing < 1)
      return null;
    words = [...left, ...Array.from({ length: missing }, () => 0n), ...right];
  }
  let value = 0n;
  for (const word of words)
    value = value << 16n | word;
  return value;
}
var PUBLIC_ADDRESS_TABLE = Object.freeze({
  refusedIpv4: REFUSED_IPV4_BLOCKS,
  admittedIpv6: ADMITTED_IPV6_BLOCK,
  refusedIpv6: REFUSED_IPV6_BLOCKS
});
function publicUnicastClassifier(table) {
  const ipv4Rows = Object.freeze(table.refusedIpv4.map((block) => parseBlock(block, 32)));
  const ipv6Admitted = parseBlock(table.admittedIpv6, 128);
  const ipv6Rows = Object.freeze(table.refusedIpv6.map((block) => parseBlock(block, 128)));
  return (address) => {
    if (typeof address !== "string")
      return false;
    if (address.includes(":")) {
      const value2 = parseIpv6(address);
      if (value2 === null || !contains(128, ipv6Admitted, value2))
        return false;
      return !ipv6Rows.some((block) => contains(128, block, value2));
    }
    const value = parseIpv4(address);
    if (value === null)
      return false;
    return !ipv4Rows.some((block) => contains(32, block, value));
  };
}
var isPublicUnicastAddress = publicUnicastClassifier(PUBLIC_ADDRESS_TABLE);

export { parseIpv4, parseIpv6, isPublicUnicastAddress };

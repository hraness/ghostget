import { createHash, createPublicKey } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const registry = "https://registry.npmjs.org/";
const rootName = "@hraness/ghostget";
const maximumPackages = 10_000;
const rootLocation = `node_modules/${rootName}`;

function record(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function text(value, label, maximum = 4_096) {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || /[\0-\x1f\x7f]/u.test(value)) {
    throw new Error(`${label} must be bounded text`);
  }
  return value;
}

function location(value) {
  const result = text(value, "Installed package location");
  if (!/^node_modules\/(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+(?:\/node_modules\/(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+)*$/u.test(result)
    || result.split("/").some(part => part === "." || part === "..")) throw new Error("Installed package location is not canonical");
  return result;
}

function integrity(value, label) {
  const result = text(value, label, 1_024);
  if (!/^(?:sha512-[A-Za-z0-9+/]{86}==|sha384-[A-Za-z0-9+/]{64}|sha256-[A-Za-z0-9+/]{43}=|sha1-[A-Za-z0-9+/]{27}=)$/u.test(result)) {
    throw new Error(`${label} must be one exact registry integrity`);
  }
  const encoded = result.slice(result.indexOf("-") + 1);
  if (Buffer.from(encoded, "base64").toString("base64") !== encoded) throw new Error(`${label} is not canonical base64`);
  return result;
}

function origin(resolved, name, version) {
  if (typeof resolved !== "string") throw new Error("Installed package has no resolved origin");
  text(resolved, "Installed package resolved origin");
  if (resolved.startsWith(registry)) {
    const expected = `${registry}${name}/-/${name.split("/").at(-1)}-${version}.tgz`;
    if (resolved !== expected) throw new Error("Installed registry tarball is not the exact package coordinate");
    return "registry";
  }
  if (/^git\+(?:ssh:\/\/git@|https:\/\/)github\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+(?:\.git)?#[a-f0-9]{40}$/u.test(resolved)
    || /^https:\/\/github\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\/releases\/download\/v[0-9][A-Za-z0-9._+-]*\/[A-Za-z0-9._+-]+\.tgz$/u.test(resolved)
    || /^https:\/\/codeload\.github\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\/tar\.gz\/[a-f0-9]{40}$/u.test(resolved)) return "non-registry";
  throw new Error("Installed package resolved origin is unsupported or ambiguous");
}

/** Classify each actual physical package by its own lock-bound origin, never an incoming peer requirement. */
export function installedSignatureInventory(rowsValue, lockValue, expectedVersion, expectedIntegrity) {
  if (!/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u.test(expectedVersion)) throw new Error("Expected root version is not stable semver");
  integrity(expectedIntegrity, "Canonical root integrity");
  if (!expectedIntegrity.startsWith("sha512-")) throw new Error("Canonical root integrity must be SHA-512");
  if (!Array.isArray(rowsValue) || rowsValue.length === 0 || rowsValue.length > maximumPackages) throw new Error("Installed package inventory is unbounded or empty");
  const lock = record(lockValue, "Consumer lockfile");
  if (lock.lockfileVersion !== 3) throw new Error("Consumer lockfile must be version three");
  const packages = record(lock.packages, "Consumer lockfile packages");
  if (Object.keys(packages).length > maximumPackages + 1) throw new Error("Consumer lockfile exceeds the package bound");
  const seen = new Set();
  const registryPackages = [];
  const nonRegistryPackages = [];
  const bundled = [];
  for (const value of rowsValue) {
    const row = record(value, "Installed package");
    const target = location(row.location);
    if (seen.has(target)) throw new Error("Installed package location is duplicated");
    seen.add(target);
    if (row.link !== false || row.workspace !== false) throw new Error("Consumer admission refuses linked or workspace packages");
    if (typeof row.dev !== "boolean" || typeof row.inBundle !== "boolean") throw new Error("Installed package flags are malformed");
    const locked = record(packages[target], "Installed package lock entry");
    const name = text(row.name, "Installed package name", 214);
    const version = text(row.version, "Installed package version", 256);
    if (!/^(?:@[A-Za-z0-9][A-Za-z0-9._-]*\/)?[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(name)
      || !/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(version)) throw new Error("Installed package coordinate is malformed");
    if (locked.version !== version || locked.name !== undefined && locked.name !== name) throw new Error("Installed package coordinate disagrees with its lockfile");
    if ((locked.resolved ?? null) !== row.resolved || (locked.integrity ?? null) !== row.integrity) throw new Error("Installed package provenance disagrees with its lockfile");
    if (row.dev) continue; // Preserve the previous audit's --omit=dev scope.
    const base = { name, version, location: target };
    if (row.resolved === null && row.inBundle && locked.inBundle === true) {
      bundled.push(Object.freeze({ ...base, kind: "bundled", bundler: location(row.bundler) }));
      continue;
    }
    const kind = origin(row.resolved, name, version);
    if (kind === "registry") registryPackages.push(Object.freeze({ ...base, resolved: row.resolved, integrity: integrity(row.integrity, "Installed registry integrity") }));
    else nonRegistryPackages.push(Object.freeze({ ...base, kind, resolved: row.resolved,
      integrity: row.integrity === null ? null : integrity(row.integrity, "Installed source integrity") }));
  }
  const admittedLocations = new Set([...registryPackages, ...nonRegistryPackages].map(row => row.location));
  const unresolved = [...bundled];
  while (unresolved.length > 0) {
    const index = unresolved.findIndex(row => admittedLocations.has(row.bundler) && row.location.startsWith(`${row.bundler}/node_modules/`));
    if (index === -1) throw new Error("Bundled package has no admitted enclosing source");
    const [row] = unresolved.splice(index, 1);
    admittedLocations.add(row.location);
    nonRegistryPackages.push(row);
  }
  const roots = registryPackages.filter(row => row.name === rootName);
  if (roots.length !== 1 || roots[0].location !== rootLocation || roots[0].version !== expectedVersion || roots[0].integrity !== expectedIntegrity) {
    throw new Error("Installed root does not match the exact canonical Ghostget archive");
  }
  return Object.freeze({ registryPackages: Object.freeze(registryPackages), nonRegistryPackages: Object.freeze(nonRegistryPackages) });
}

export function trustedNpmRegistryKeys(value) {
  const document = record(value, "Trusted registry keys");
  if (!Array.isArray(document.keys) || document.keys.length === 0 || document.keys.length > 32) throw new Error("Trusted registry keys are missing or unbounded");
  const seen = new Map();
  for (const value of document.keys) {
    const key = record(value, "Trusted registry key");
    const keyid = text(key.keyId, "Trusted registry key ID", 256);
    const publicKey = record(key.publicKey, "Trusted registry public key");
    const bytes = text(publicKey.rawBytes, "Trusted registry public key bytes", 8_192);
    if (Buffer.from(bytes, "base64").toString("base64") !== bytes) throw new Error("Trusted registry public key is not canonical base64");
    const pemkey = `-----BEGIN PUBLIC KEY-----\n${bytes}\n-----END PUBLIC KEY-----`;
    createPublicKey(pemkey);
    const expires = publicKey.validFor === undefined ? null : record(publicKey.validFor, "Trusted registry key validity").end ?? null;
    if (expires !== null && (typeof expires !== "string" || !Number.isFinite(Date.parse(expires)))) throw new Error("Trusted registry key expiry is malformed");
    const previous = seen.get(keyid);
    if (previous !== undefined && (previous.pemkey !== pemkey || previous.expires !== expires)) {
      throw new Error("Trusted registry key ID has conflicting verification material");
    }
    seen.set(keyid, Object.freeze({ keyid, pemkey, expires }));
  }
  return Object.freeze([...seen.values()]);
}

/** Pacote performs cryptographic signature and present-attestation verification for every registry-origin node. */
export async function verifyInstalledRegistrySignatures(inventory, dependencies, tufCache) {
  const tuf = await dependencies.initTUF({ cachePath: tufCache, retry: { retries: 2 }, timeout: 30_000 });
  const keys = trustedNpmRegistryKeys(JSON.parse(await tuf.getTarget("registry.npmjs.org/keys.json")));
  const verified = [];
  for (let offset = 0; offset < inventory.registryPackages.length; offset += 20) {
    const batch = await Promise.allSettled(inventory.registryPackages.slice(offset, offset + 20).map(async target => {
      const manifest = record(await dependencies.manifest(`${target.name}@${target.version}`, {
        registry, cache: join(tufCache, "npm-cache"), tufCache,
        verifySignatures: true, verifyAttestations: true, before: null,
        "//registry.npmjs.org/:_keys": keys, integrity: target.integrity,
        retry: { retries: 2 }, timeout: 30_000,
      }), "Verified registry manifest");
      if (manifest.name !== target.name || manifest.version !== target.version || manifest._id !== `${target.name}@${target.version}`
        || manifest._resolved !== target.resolved || manifest._integrity !== target.integrity) throw new Error("Verified registry manifest changed the installed package identity or bytes");
      if (!Array.isArray(manifest._signatures) || manifest._signatures.length === 0) throw new Error("Registry package has no verified signature");
      if (manifest.dist?.attestations !== undefined && (manifest._attestations === undefined || !Array.isArray(manifest._attestationBundles)
        || manifest._attestationBundles.length === 0)) throw new Error("Registry package did not verify its present attestations");
      return manifest._attestations === undefined ? null : Object.freeze({ name: target.name, version: target.version,
        location: target.location, registry, attestations: manifest._attestations, attestationBundles: manifest._attestationBundles });
    }));
    for (const result of batch) {
      if (result.status === "rejected") throw new Error("Installed registry signature or attestation verification failed", { cause: result.reason });
      if (result.value !== null) verified.push(result.value);
    }
  }
  if (verified.filter(row => row.location === rootLocation).length !== 1) throw new Error("Canonical Ghostget root has no verified attestations");
  return Object.freeze({ invalid: [], missing: [], verified,
    inventory: { registryPackages: inventory.registryPackages, nonRegistryPackages: inventory.nonRegistryPackages } });
}

async function boundedJson(path, maximum) {
  const bytes = await readFile(path);
  if (bytes.length > maximum) throw new Error("Admission JSON exceeds its byte bound");
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

async function main(args) {
  const flags = ["--consumer-directory", "--expected-name", "--expected-version", "--registry-archive", "--npm-root", "--tuf-cache"];
  if (args.length !== flags.length * 2) throw new Error("Installed signature arguments are incomplete");
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    if (!flags.includes(args[index]) || values.has(args[index]) || typeof args[index + 1] !== "string") throw new Error("Installed signature arguments are unknown or duplicated");
    values.set(args[index], args[index + 1]);
  }
  if (values.get("--expected-name") !== rootName || process.version !== "v24.20.0") throw new Error("Installed signature admission requires the pinned root and Node toolchain");
  for (const flag of ["--consumer-directory", "--registry-archive", "--npm-root", "--tuf-cache"]) {
    if (!isAbsolute(values.get(flag))) throw new Error("Installed signature admission paths must be absolute");
  }
  const npmRoot = await realpath(values.get("--npm-root"));
  const npm = await boundedJson(join(npmRoot, "package.json"), 256 * 1_024);
  if (npm.name !== "npm" || npm.version !== "11.19.0") throw new Error("Installed signature admission requires npm 11.19.0");
  const require = createRequire(join(npmRoot, "package.json"));
  for (const [name, version] of [["pacote", "21.5.1"], ["@npmcli/arborist", "9.9.1"], ["@sigstore/tuf", "4.0.2"]]) {
    const dependency = await boundedJson(join(npmRoot, "node_modules", name, "package.json"), 256 * 1_024);
    if (dependency.name !== name || dependency.version !== version) throw new Error("Pinned npm verification dependency drifted");
  }
  const consumer = await realpath(values.get("--consumer-directory"));
  const Arborist = require("@npmcli/arborist");
  const tree = await new Arborist({ path: consumer, registry }).loadActual();
  const rows = [...tree.inventory.values()].filter(node => node !== tree).map(node => ({
    location: node.location, name: node.package.name, version: node.package.version,
    resolved: node.resolved ?? null, integrity: node.integrity ?? null,
    link: node.isLink, workspace: node.isWorkspace, dev: node.dev, inBundle: node.inBundle,
    bundler: node.getBundler()?.location ?? null,
  }));
  const archive = await readFile(values.get("--registry-archive"));
  if (archive.length === 0 || archive.length > 32 * 1_024 * 1_024) throw new Error("Canonical registry archive exceeds its byte bound");
  const expectedIntegrity = `sha512-${createHash("sha512").update(archive).digest("base64")}`;
  const inventory = installedSignatureInventory(rows, await boundedJson(join(consumer, "package-lock.json"), 16 * 1_024 * 1_024),
    values.get("--expected-version"), expectedIntegrity);
  const pacote = require("pacote");
  const tuf = require("@sigstore/tuf");
  const receipt = await verifyInstalledRegistrySignatures(inventory, { manifest: pacote.manifest, initTUF: tuf.initTUF }, values.get("--tuf-cache"));
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}

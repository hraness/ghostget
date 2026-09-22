import { join } from "node:path";

import { canonicalJson, sha256 } from "./canonical-json";
import { contractRepairSignalShape, parseContractRepairSignal, type ContractRepairSignal } from "./contracts-repair";
import { parseShape, type Shape } from "./contracts-shape";
import {
  createPrivateJsonIfAbsent,
  ensurePrivateStateDirectory,
  ghostgetStateHome,
  privateStateFilesMayExist,
  readPrivateStateFileIfPresent,
  writePrivateJsonIfUnchanged,
} from "./storage";

export const MAX_REPAIR_SIGNALS = 128;
export const REPAIR_SIGNAL_TTL_MS = 30 * 24 * 60 * 60_000;
const MAX_INBOX_BYTES = 256 * 1024;
const MAX_SIGNAL_BYTES = 2048;
const FILE_NAME = "inbox.json";
type Environment = Readonly<Record<string, string | undefined>>;
export type ContractRepairInboxEntry = { readonly signal: ContractRepairSignal; readonly recordedAt: string };
type Inbox = { readonly schemaVersion: 1; readonly entries: readonly ContractRepairInboxEntry[] };
export type RepairSignalCacheStatus = "stored" | "duplicate" | "full" | "disabled" | "unavailable";
export type ContractRepairInbox = {
  readonly status: "ready" | "disabled" | "unavailable";
  readonly entries: readonly ContractRepairInboxEntry[];
  readonly capacityReached: boolean;
};

const inboxShape: Shape = {
  kind: "object",
  properties: {
    schemaVersion: { kind: "literal", value: 1 },
    entries: {
      kind: "array",
      maxItems: MAX_REPAIR_SIGNALS,
      items: {
        kind: "object",
        properties: {
          signal: contractRepairSignalShape,
          recordedAt: { kind: "string", minLength: 24, maxLength: 24, format: "date-time" },
        },
      },
    },
  },
};

function parseInbox(value: unknown): Inbox {
  const inbox = parseShape<Inbox>(inboxShape, value, "repair.inbox");
  const ids = new Set<string>();
  for (const entry of inbox.entries) {
    const signal = parseContractRepairSignal(entry.signal);
    if (ids.has(signal.id) || Buffer.byteLength(canonicalJson(signal)) > MAX_SIGNAL_BYTES) {
      throw new Error("repair inbox has duplicate or oversized signals");
    }
    ids.add(signal.id);
  }
  return inbox;
}

function activeEntries(entries: readonly ContractRepairInboxEntry[], now: Date): readonly ContractRepairInboxEntry[] {
  if (!Number.isFinite(now.getTime())) throw new Error("repair inbox clock is invalid");
  return entries.filter(entry => Date.parse(entry.recordedAt) + REPAIR_SIGNAL_TTL_MS > now.getTime());
}

export function reduceContractRepairInbox(
  entriesValue: readonly ContractRepairInboxEntry[],
  signalValue: unknown,
  now: Date,
): { readonly status: "stored" | "duplicate" | "full"; readonly entries: readonly ContractRepairInboxEntry[] } {
  const entries = activeEntries(parseInbox({ schemaVersion: 1, entries: entriesValue }).entries, now);
  const signal = parseContractRepairSignal(signalValue);
  if (Buffer.byteLength(canonicalJson(signal)) > MAX_SIGNAL_BYTES) throw new Error("repair signal exceeds its byte bound");
  if (entries.some(entry => entry.signal.id === signal.id)) return { status: "duplicate", entries };
  if (entries.length === MAX_REPAIR_SIGNALS) return { status: "full", entries };
  const next = [...entries, { signal, recordedAt: now.toISOString() }]
    .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt) || left.signal.id.localeCompare(right.signal.id));
  return { status: "stored", entries: parseInbox({ schemaVersion: 1, entries: next }).entries };
}

function snapshot(environment: Environment): { readonly text: string | null; readonly inbox: Inbox } {
  const text = privateStateFilesMayExist("repair-signals", [FILE_NAME], environment)
    ? readPrivateStateFileIfPresent(join(ghostgetStateHome(environment), "repair-signals", FILE_NAME), MAX_INBOX_BYTES, "repair inbox", environment)
    : null;
  return { text, inbox: text === null ? { schemaVersion: 1, entries: [] } : parseInbox(JSON.parse(text)) };
}

export function readContractRepairInbox(environment: Environment = process.env, now = new Date()): ContractRepairInbox {
  if (environment.GHOSTGET_REPAIR_SIGNALS === "off") return { status: "disabled", entries: [], capacityReached: false };
  try {
    const entries = activeEntries(snapshot(environment).inbox.entries, now);
    return { status: "ready", entries, capacityReached: entries.length === MAX_REPAIR_SIGNALS };
  } catch {
    return { status: "unavailable", entries: [], capacityReached: false };
  }
}

export function cacheContractRepairSignals(
  signalValues: readonly unknown[],
  environment: Environment = process.env,
  now = new Date(),
): readonly RepairSignalCacheStatus[] {
  if (signalValues.length > MAX_REPAIR_SIGNALS) throw new Error("repair signal batch exceeds its bound");
  if (environment.GHOSTGET_REPAIR_SIGNALS === "off") return signalValues.map(() => "disabled");
  try {
    const signals = signalValues.map(parseContractRepairSignal);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const previous = snapshot(environment);
      let entries = previous.inbox.entries;
      const statuses = signals.map(signal => {
        const next = reduceContractRepairInbox(entries, signal, now);
        entries = next.entries;
        return next.status;
      });
      if (!statuses.includes("stored")) return statuses;
      const inbox: Inbox = { schemaVersion: 1, entries };
      if (Buffer.byteLength(`${canonicalJson(inbox)}\n`) > MAX_INBOX_BYTES) return signals.map(() => "full");
      const directory = join(ghostgetStateHome(environment), "repair-signals");
      ensurePrivateStateDirectory(directory, environment);
      const path = join(directory, FILE_NAME);
      const committed = previous.text === null
        ? createPrivateJsonIfAbsent(path, inbox, { environment }).created
        : writePrivateJsonIfUnchanged(path, inbox, { expectedCurrentContentSha256: sha256(previous.text), maximumExpectedCurrentBytes: MAX_INBOX_BYTES });
      if (committed) return statuses;
    }
  } catch {
    return signalValues.map(() => "unavailable");
  }
  return signalValues.map(() => "unavailable");
}

export function cacheContractRepairSignal(
  signalValue: unknown,
  environment: Environment = process.env,
  now = new Date(),
): RepairSignalCacheStatus {
  return cacheContractRepairSignals([signalValue], environment, now)[0]!;
}

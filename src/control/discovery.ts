import { join } from "node:path";
import { sha256 } from "../canonical-json";
import { createPrivateJsonIfAbsent, ensurePrivateStateDirectory, ghostgetStateHome, privateStateFilesMayExist, readPrivateStateFileIfPresent, writePrivateJsonIfUnchanged } from "../storage";
import { ControlError, boolean, integer, keys, record } from "./validation";
import { readInterfaceJson } from "./interface-json";
import { parseBrowserProfiles, type BrowserDiscoveryView } from "./setup-model";
import { runDiscovery } from "./discovery-process";
import type { DiscoveryScan } from "./discovery-reader";
import type { ControlEnvironment } from "./web-policy";

interface Consent { readonly schema: 1; readonly revision: number; readonly enabled: boolean }
const empty: Consent = { schema: 1, revision: 0, enabled: false };
const unavailable = () => new ControlError("DISCOVERY_STATE_UNAVAILABLE", "Browser discovery settings are unavailable. No browser scan was started.");
function consent(environment: ControlEnvironment): { readonly value: Consent; readonly text: string | null } {
  try {
    if (!privateStateFilesMayExist("control", ["browser-discovery.json"], environment)) return { value: empty, text: null };
    const text = readPrivateStateFileIfPresent(join(ghostgetStateHome(environment), "control", "browser-discovery.json"), 1024, "browser discovery setting", environment);
    if (text === null) return { value: empty, text: null };
    const value = record(readInterfaceJson(text, 1024)); keys(value, ["schema", "revision", "enabled"]); if (value.schema !== 1) throw unavailable();
    return { value: { schema: 1, revision: integer(value.revision, 1, Number.MAX_SAFE_INTEGER), enabled: boolean(value.enabled) }, text };
  } catch { throw unavailable(); }
}
/** Persistent opt-in; profile/session hints are transient and confer no execution authority. */
export class BrowserDiscovery {
  private cache: { readonly revision: number; readonly expires: number; readonly result: DiscoveryScan; readonly scannedAt: string } | null = null;
  private generation = 0;
  private active: { readonly controller: AbortController; readonly work: Promise<DiscoveryScan> } | null = null;
  private poisoned = false;
  private closed = false;
  constructor(private readonly environment: ControlEnvironment, private readonly scanner: (environment: ControlEnvironment, signal: AbortSignal) => Promise<DiscoveryScan> = runDiscovery, private readonly now: () => number = () => performance.now(), private readonly wallNow: () => number = Date.now) {}
  view(): BrowserDiscoveryView {
    const state = consent(this.environment).value;
    if (!state.enabled || this.cache?.revision !== state.revision || this.now() >= this.cache.expires) this.cache = null;
    return { revision: state.revision, enabled: state.enabled, status: this.cache?.result.status ?? "not-scanned", scannedAt: this.cache?.scannedAt ?? null, profiles: this.cache?.result.profiles.map(profile => ({ ...profile, candidates: [...profile.candidates] })) ?? [] };
  }
  async configure(enabled: boolean, expectedRevision: number): Promise<void> {
    if (this.closed) throw unavailable();
    const previous = consent(this.environment); if (previous.value.revision !== expectedRevision || expectedRevision === Number.MAX_SAFE_INTEGER) throw new ControlError("DISCOVERY_CHANGED", "Browser discovery changed. Refresh before saving.");
    if (enabled && this.poisoned) throw new ControlError("DISCOVERY_CUSTODY_UNCERTAIN", "Restart Ghostget before enabling browser discovery again.");
    const value: Consent = { schema: 1, revision: expectedRevision + 1, enabled };
    const directory = join(ghostgetStateHome(this.environment), "control"); ensurePrivateStateDirectory(directory, this.environment);
    const path = join(directory, "browser-discovery.json");
    const saved = previous.text === null ? createPrivateJsonIfAbsent(path, value, { environment: this.environment }).created : writePrivateJsonIfUnchanged(path, value, { expectedCurrentContentSha256: sha256(previous.text) });
    if (!saved) throw new ControlError("DISCOVERY_CHANGED", "Browser discovery changed. Refresh before saving.");
    ++this.generation; this.cache = null;
    const active = this.active; active?.controller.abort();
    if (active) { try { await active.work; } catch (error) { if (error instanceof ControlError && error.code === "DISCOVERY_CUSTODY_UNCERTAIN") { this.poisoned = true; throw error; } } }
    if (enabled) await this.refresh(value.revision);
  }
  async refresh(expectedRevision: number): Promise<void> {
    const state = consent(this.environment).value;
    if (this.closed || this.poisoned) throw new ControlError("DISCOVERY_CUSTODY_UNCERTAIN", "Restart Ghostget before scanning browsers again.");
    if (!state.enabled || state.revision !== expectedRevision) throw new ControlError("DISCOVERY_CHANGED", "Enable browser discovery in Ghostget before scanning.");
    if (this.active) throw new ControlError("DISCOVERY_BUSY", "Browser discovery is already running.");
    const generation = ++this.generation; const controller = new AbortController(); this.cache = null;
    const work = Promise.resolve().then(() => { controller.signal.throwIfAborted(); return this.scanner(this.environment, controller.signal); });
    const active = { controller, work }; this.active = active;
    try {
      const result = await work; const profiles = parseBrowserProfiles(result.profiles);
      if (result.status !== "ready" && result.status !== "unavailable") throw unavailable();
      const current = consent(this.environment).value;
      if (this.closed || controller.signal.aborted || generation !== this.generation || !current.enabled || current.revision !== expectedRevision) throw new ControlError("DISCOVERY_CHANGED", "Browser discovery changed while scanning. No hints were kept.");
      this.cache = { revision: expectedRevision, expires: this.now() + 300_000, result: { status: result.status, profiles }, scannedAt: new Date(this.wallNow()).toISOString() };
    } catch (error) {
      if (error instanceof ControlError && error.code === "DISCOVERY_CUSTODY_UNCERTAIN") this.poisoned = true;
      if (!this.closed && !controller.signal.aborted && generation === this.generation) this.cache = { revision: expectedRevision, expires: this.now() + 300_000, result: { status: "unavailable", profiles: [] }, scannedAt: new Date(this.wallNow()).toISOString() };
      throw error;
    } finally { if (this.active === active && !this.poisoned) this.active = null; }
  }
  close(): void { this.closed = true; ++this.generation; this.cache = null; this.active?.controller.abort(); }
  assertStopped(): void { if (this.active || this.poisoned) throw new ControlError("DISCOVERY_CUSTODY_UNCERTAIN", "Browser discovery completion is unconfirmed. The previous control owner is retained."); }
}

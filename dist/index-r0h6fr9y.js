// @bun
import {
  AUTOMATION_ACTION_KINDS,
  automationArray,
  automationDate,
  automationDigest,
  automationId,
  automationInteger,
  automationRecord,
  automationText,
  parseAutomationAction,
  parseAutomationActionKind,
  parseAutomationCoordinate,
  parseAutomationIdentity,
  parseAutomationMessage
} from "./index-2ymnp8xv.js";
import {
  ensurePrivateStateDirectory,
  ghostgetStateHome,
  snapshotPrivateStateDirectory
} from "./index-0ywm1fj9.js";
import {
  canonicalJson,
  sha256
} from "./index-8sbt8qwx.js";

// src/messaging-automation.ts
import { Database, constants as sqlite } from "bun:sqlite";
import { closeSync, constants, fstatSync, lstatSync, openSync } from "fs";
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { join } from "path";
var RUN_COLUMNS = "id,plan_id,intent_id,enrollment_id,state,accepted,total,reason";
var same = (a, b) => canonicalJson(a) === canonicalJson(b);
var authority = (identity, selected) => ({ identity, conversation: { ...selected, title: null } });
var sameConversation = (a, b) => same({ ...a, title: null }, { ...b, title: null });
var stopped = (signal) => {
  if (signal?.aborted)
    throw new Error("Messaging automation operation was cancelled.");
};
var CAPACITY = Object.freeze({ enrollments: 1000, grants: 1e4, plans: 20000, runs: 20000, messages: 50000, events: 50000 });
function grantData(value) {
  const r = automationRecord(value, ["enrollmentId", "expectedBindingDigest", "actions", "expiresAt", "maximumActions", "minimumIntervalMs"]);
  const actions = automationArray(r.actions, AUTOMATION_ACTION_KINDS.length).map(parseAutomationActionKind);
  if (actions.length === 0 || new Set(actions).size !== actions.length)
    throw new Error("Messaging grant action list is invalid.");
  return Object.freeze({ enrollmentId: automationId(r.enrollmentId), expectedBindingDigest: automationDigest(r.expectedBindingDigest), actions: Object.freeze(actions), expiresAt: automationDate(r.expiresAt), maximumActions: automationInteger(r.maximumActions, 1, 1e5), minimumIntervalMs: automationInteger(r.minimumIntervalMs, 0, 86400000) });
}
function planData(value) {
  const r = automationRecord(value, ["enrollmentId", "expectedRevision", "intentId", "actions", "bindingDigest", "expiresAt", "id", "digest"]);
  const actions = automationArray(r.actions, 8).map(parseAutomationAction);
  if (actions.length === 0 || Buffer.byteLength(canonicalJson(actions)) > 256 * 1024)
    throw new Error("Messaging plan exceeds its bound.");
  const binding = { enrollmentId: automationId(r.enrollmentId), expectedRevision: automationInteger(r.expectedRevision, 0, Number.MAX_SAFE_INTEGER), intentId: automationId(r.intentId), actions: Object.freeze(actions), bindingDigest: automationDigest(r.bindingDigest), expiresAt: automationDate(r.expiresAt) };
  const digest = automationDigest(r.digest);
  const id = automationId(r.id);
  if (sha256(canonicalJson(binding)) !== digest || id !== `plan:${digest}`)
    throw new Error("Messaging plan binding is invalid.");
  return Object.freeze({ ...binding, id, digest });
}
function conversation(value) {
  const r = automationRecord(value, ["coordinate", "title", "kind", "participants"]);
  const coordinate = parseAutomationCoordinate(r.coordinate);
  const participants = automationArray(r.participants, 2).map((value2) => automationText(value2, 512));
  if (r.kind !== "single" || participants.length < 1 || new Set(participants).size !== participants.length)
    throw new Error("Messaging automation requires one verified individual conversation.");
  return Object.freeze({ coordinate, title: r.title === null ? null : automationText(r.title, 512), kind: "single", participants: Object.freeze([...participants].sort()) });
}
function checkedPage(value, expected, coordinate) {
  const r = automationRecord(value, ["identity", "messages", "nextCursor", "caughtUp", "gap"]);
  const identity = parseAutomationIdentity(r.identity);
  if (!same(identity, expected) || typeof r.caughtUp !== "boolean" || typeof r.gap !== "boolean")
    throw new Error("Messaging provider identity or cursor state changed.");
  const messages = automationArray(r.messages, 500).map(parseAutomationMessage);
  if (messages.some((message) => !same(message.coordinate, coordinate)))
    throw new Error("Messaging provider returned another conversation.");
  return Object.freeze({ identity, messages: Object.freeze(messages), nextCursor: automationText(r.nextCursor, 4096), caughtUp: r.caughtUp, gap: r.gap });
}
function checkedResult(value) {
  if (typeof value !== "object" || value === null)
    throw new Error("Messaging provider result is invalid.");
  const state = Object.getOwnPropertyDescriptor(value, "state")?.value;
  if (state === "accepted") {
    const r2 = automationRecord(value, ["state", "messageId", "providerReceiptId", "delivery"]);
    if (r2.delivery !== "unknown")
      throw new Error("Messaging provider delivery claim is unsupported.");
    return { state, messageId: r2.messageId === null ? null : automationId(r2.messageId), providerReceiptId: r2.providerReceiptId === null ? null : automationId(r2.providerReceiptId), delivery: "unknown" };
  }
  const r = automationRecord(value, ["state", "reason"]);
  if (state !== "not-started" && state !== "indeterminate")
    throw new Error("Messaging provider result is invalid.");
  return { state, reason: automationText(r.reason, 1024) };
}

class MessagingAutomationHost {
  environment;
  now;
  db;
  directory;
  directoryIdentity;
  fileIdentity;
  providers = new Map;
  cursorKey;
  controllers = new Set;
  planControllers = new Map;
  pending = new Set;
  closing = false;
  closed = false;
  constructor(providers, environment = process.env, now = Date.now) {
    this.environment = environment;
    this.now = now;
    if (providers.length > 16)
      throw new Error("Too many messaging providers.");
    for (const provider of providers) {
      if (this.providers.has(provider.provider))
        throw new Error("Duplicate messaging provider.");
      this.providers.set(provider.provider, provider);
    }
    this.directory = join(ghostgetStateHome(environment), "messaging", "automation");
    this.directoryIdentity = ensurePrivateStateDirectory(this.directory, environment);
    const path = join(this.directory, "host.sqlite");
    const fd = openSync(path, constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW, 384);
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 511) !== 384 || stat.nlink !== 1)
        throw new Error("Unsafe messaging journal.");
      this.fileIdentity = { dev: stat.dev, ino: stat.ino };
    } finally {
      closeSync(fd);
    }
    this.checkFiles();
    this.db = new Database(path, sqlite.SQLITE_OPEN_READWRITE | sqlite.SQLITE_OPEN_NOFOLLOW);
    try {
      this.db.exec("PRAGMA busy_timeout=250; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA trusted_schema=OFF; PRAGMA secure_delete=ON; PRAGMA max_page_count=65536;");
      const version = this.db.query("PRAGMA user_version").get()?.user_version;
      if (version !== 0 && version !== 1 && version !== 2)
        throw new Error("Unsupported messaging journal schema.");
      this.db.exec("CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS enrollments (id TEXT PRIMARY KEY,data TEXT NOT NULL,cursor TEXT NOT NULL,revision INTEGER NOT NULL,ready INTEGER NOT NULL,reason TEXT); CREATE TABLE IF NOT EXISTS grants (id TEXT PRIMARY KEY,data TEXT NOT NULL,revoked INTEGER NOT NULL,consumed INTEGER NOT NULL,last_dispatch INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY,data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY,plan_id TEXT NOT NULL,intent_id TEXT NOT NULL UNIQUE,enrollment_id TEXT NOT NULL,state TEXT NOT NULL,accepted TEXT NOT NULL,total INTEGER NOT NULL,reason TEXT); CREATE INDEX IF NOT EXISTS runs_contact ON runs(enrollment_id,state); CREATE TABLE IF NOT EXISTS messages (enrollment_id TEXT NOT NULL,event_key TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(enrollment_id,event_key)); CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT,enrollment_id TEXT NOT NULL,revision INTEGER NOT NULL,data TEXT NOT NULL);");
      if (version !== 2)
        this.db.transaction(() => {
          this.db.exec("ALTER TABLE enrollments ADD COLUMN baselining INTEGER NOT NULL DEFAULT 1; ALTER TABLE enrollments ADD COLUMN gap INTEGER NOT NULL DEFAULT 0; UPDATE enrollments SET gap=CASE WHEN reason LIKE '%unresolved gap%' THEN 1 ELSE 0 END,ready=0; PRAGMA user_version=2;");
        }).immediate();
      else
        this.db.exec("PRAGMA user_version=2;");
      this.db.exec("CREATE TABLE IF NOT EXISTS grant_intents (id TEXT PRIMARY KEY,request_digest TEXT NOT NULL,grant_id TEXT NOT NULL UNIQUE REFERENCES grants(id));");
      this.db.query("INSERT OR IGNORE INTO metadata(key,value) VALUES('cursor-key',?)").run(randomBytes(32).toString("hex"));
      this.cursorKey = Buffer.from(automationDigest(this.db.query("SELECT value FROM metadata WHERE key='cursor-key'").get()?.value), "hex");
      this.checkFiles();
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  checkFiles() {
    snapshotPrivateStateDirectory(this.directory, this.environment, this.directoryIdentity);
    for (const name of ["host.sqlite", "host.sqlite-journal", "host.sqlite-wal", "host.sqlite-shm"]) {
      let stat;
      try {
        stat = lstatSync(join(this.directory, name));
      } catch (error) {
        if (error.code === "ENOENT" && name !== "host.sqlite")
          continue;
        throw error;
      }
      if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 511) !== 384 || stat.nlink !== 1 || name.endsWith("-wal") || name.endsWith("-shm") || name === "host.sqlite" && (stat.dev !== this.fileIdentity.dev || stat.ino !== this.fileIdentity.ino))
        throw new Error("Messaging journal filesystem identity changed.");
    }
  }
  ready() {
    if (this.closing || this.closed)
      throw new Error("Messaging automation host is closed.");
    this.checkFiles();
  }
  capacity(table, additional = 1) {
    const count = this.db.query(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
    const pages = this.db.query("PRAGMA page_count").get().page_count;
    const size = this.db.query("PRAGMA page_size").get().page_size;
    if (count + additional > CAPACITY[table] || pages * size >= 192 * 1024 * 1024)
      throw new Error("Messaging journal capacity reached; owner maintenance is required before further dispatch.");
  }
  provider(id) {
    const provider = this.providers.get(id);
    if (provider === undefined)
      throw new Error("Messaging provider is unavailable.");
    return provider;
  }
  row(id) {
    this.ready();
    const row = this.db.query("SELECT * FROM enrollments WHERE id=?").get(automationId(id));
    if (row === null)
      throw new Error("Messaging enrollment does not exist.");
    return row;
  }
  enrollment(row) {
    const r = automationRecord(JSON.parse(row.data), ["identity", "conversation", "bindingDigest"]);
    const identity = parseAutomationIdentity(r.identity);
    const selected = conversation(r.conversation);
    const bindingDigest = automationDigest(r.bindingDigest);
    if (sha256(canonicalJson(authority(identity, selected))) !== bindingDigest)
      throw new Error("Messaging enrollment binding is invalid.");
    const ready = automationInteger(row.ready, 0, 1);
    const baselining = automationInteger(row.baselining, 0, 1);
    const gap = automationInteger(row.gap, 0, 1);
    if (ready && (baselining || gap))
      throw new Error("Messaging enrollment readiness is inconsistent.");
    return Object.freeze({ id: automationId(row.id), identity, conversation: selected, bindingDigest, revision: automationInteger(row.revision, 0, Number.MAX_SAFE_INTEGER), ready: ready === 1, reason: row.reason === null ? null : automationText(row.reason, 1024) });
  }
  enrollments() {
    this.ready();
    return this.db.query("SELECT * FROM enrollments ORDER BY id LIMIT 1001").all().map((row) => this.enrollment(row));
  }
  async status(provider, signal) {
    stopped(signal);
    const value = await provider.inspect(signal);
    stopped(signal);
    const r = automationRecord(value, ["identity", "connected", "events", "actions"]);
    const identity = parseAutomationIdentity(r.identity);
    if (identity.provider !== provider.provider || typeof r.connected !== "boolean")
      throw new Error("Messaging provider identity is invalid.");
    const actions = automationRecord(r.actions, AUTOMATION_ACTION_KINDS);
    for (const capability of [r.events, ...Object.values(actions)]) {
      const c = automationRecord(capability, ["available", "reason"]);
      if (typeof c.available !== "boolean")
        throw new Error("Messaging capability is invalid.");
      if (c.reason !== null)
        automationText(c.reason, 1024);
    }
    return value;
  }
  async providerStatus(id, signal) {
    this.ready();
    return this.status(this.provider(automationId(id)), signal);
  }
  async conversations(raw, signal) {
    this.ready();
    const r = automationRecord(raw, ["provider", "limit"]);
    const provider = this.provider(automationId(r.provider)), limit = automationInteger(r.limit, 1, 200);
    const status = await this.status(provider, signal);
    const result = automationRecord(await provider.conversations({ limit }, signal), ["identity", "conversations", "complete"]);
    stopped(signal);
    const identity = parseAutomationIdentity(result.identity);
    if (!same(identity, status.identity) || typeof result.complete !== "boolean")
      throw new Error("Messaging discovery identity changed.");
    const rows = automationArray(result.conversations, limit).filter((value) => automationRecord(value, ["coordinate", "title", "kind", "participants"]).kind === "single").map(conversation);
    if (rows.some((row) => row.coordinate.provider !== identity.provider) || new Set(rows.map((row) => canonicalJson(row.coordinate))).size !== rows.length)
      throw new Error("Messaging discovery contains conflicting conversations.");
    return Object.freeze({ identity, conversations: Object.freeze(rows), complete: result.complete });
  }
  history(raw) {
    this.ready();
    const r = automationRecord(raw, ["enrollmentId", "limit"]), limit = automationInteger(r.limit, 1, 200);
    const enrollment = this.enrollment(this.row(automationId(r.enrollmentId)));
    const rows = this.db.query("SELECT data FROM messages WHERE rowid IN (SELECT MAX(rowid) FROM messages WHERE enrollment_id=? GROUP BY json_extract(data,'$.id')) ORDER BY json_extract(data,'$.occurredAt') DESC,rowid DESC LIMIT ?").all(enrollment.id, limit);
    const messages = rows.map((row) => parseAutomationMessage(JSON.parse(row.data))).reverse();
    if (messages.some((message) => !same(message.coordinate, enrollment.conversation.coordinate)))
      throw new Error("Messaging stored history has another conversation.");
    return Object.freeze({ enrollment, messages: Object.freeze(messages) });
  }
  async enroll(raw, signal) {
    this.ready();
    const request = automationRecord(raw, ["provider", "coordinate"]);
    const coordinate = parseAutomationCoordinate(request.coordinate);
    if (request.provider !== coordinate.provider)
      throw new Error("Messaging provider and coordinate disagree.");
    const provider = this.provider(coordinate.provider);
    const status = await this.status(provider, signal);
    const resolved = await provider.resolve(coordinate, signal);
    stopped(signal);
    if (!same(parseAutomationIdentity(resolved.identity), status.identity))
      throw new Error("Messaging identity changed during enrollment.");
    const selected = conversation(resolved.conversation);
    if (!same(selected.coordinate, coordinate))
      throw new Error("Messaging route resolution changed target.");
    const history = checkedPage(await provider.history({ coordinate, limit: 200 }, signal), status.identity, coordinate);
    stopped(signal);
    const binding = { identity: status.identity, conversation: selected };
    const bindingDigest = sha256(canonicalJson(authority(status.identity, selected)));
    const id = `enrollment:${randomUUID()}`;
    this.ready();
    this.db.transaction(() => {
      this.capacity("enrollments");
      this.capacity("messages", history.messages.length);
      if (this.enrollments().some((enrollment) => same(enrollment.identity, status.identity) && same(enrollment.conversation.coordinate, coordinate)))
        throw new Error("Conversation is already enrolled.");
      this.db.query("INSERT INTO enrollments(id,data,cursor,revision,ready,reason,baselining,gap) VALUES(?,?,?,0,?,?,?,?)").run(id, canonicalJson({ ...binding, bindingDigest }), history.nextCursor, !history.gap && history.caughtUp ? 1 : 0, history.gap ? "Provider history has an unresolved gap." : history.caughtUp ? null : "Initial history catchup is incomplete.", history.caughtUp ? 0 : 1, history.gap ? 1 : 0);
      for (const message of history.messages)
        this.db.query("INSERT OR IGNORE INTO messages VALUES(?,?,?)").run(id, sha256(canonicalJson(message)), canonicalJson(message));
    }).immediate();
    this.checkFiles();
    return this.enrollment(this.row(id));
  }
  grant(raw, intent) {
    this.ready();
    const r = automationRecord(raw, ["enrollmentId", "expectedBindingDigest", "actions", "expiresAt", "maximumActions", "minimumIntervalMs"]);
    const enrollment = this.enrollment(this.row(automationId(r.enrollmentId)));
    const expectedBindingDigest = automationDigest(r.expectedBindingDigest);
    if (enrollment.bindingDigest !== expectedBindingDigest)
      throw new Error("Messaging enrollment changed before grant issuance.");
    const actions = automationArray(r.actions, AUTOMATION_ACTION_KINDS.length).map(parseAutomationActionKind);
    if (actions.length === 0 || new Set(actions).size !== actions.length)
      throw new Error("Messaging grant action list is invalid.");
    const expiresAt = automationDate(r.expiresAt);
    const grant = { enrollmentId: enrollment.id, expectedBindingDigest, actions: [...actions].sort(), expiresAt, maximumActions: automationInteger(r.maximumActions, 1, 1e5), minimumIntervalMs: automationInteger(r.minimumIntervalMs, 0, 86400000) };
    const intentId = intent === undefined ? null : automationId(intent), digest = sha256(canonicalJson(grant));
    const result = this.db.transaction(() => {
      if (intentId !== null) {
        const previous = this.db.query("SELECT request_digest,grant_id FROM grant_intents WHERE id=?").get(intentId);
        if (previous) {
          if (automationDigest(previous.request_digest) !== digest)
            throw new Error("Messaging grant intent changed its request.");
          return this.grantStatus(previous.grant_id);
        }
      }
      if (Date.parse(expiresAt) <= this.now() || Date.parse(expiresAt) > this.now() + 30 * 86400000)
        throw new Error("Messaging grant must expire within 30 days.");
      const id = `grant:${randomUUID()}`;
      this.capacity("grants");
      this.db.query("INSERT INTO grants VALUES(?,?,0,0,0)").run(id, canonicalJson(grant));
      if (intentId !== null)
        this.db.query("INSERT INTO grant_intents VALUES(?,?,?)").run(intentId, digest, id);
      return Object.freeze({ ...grant, id, revoked: false, consumedActions: 0 });
    }).immediate();
    this.checkFiles();
    return result;
  }
  grantByIntent(intentId) {
    this.ready();
    const row = this.db.query("SELECT grant_id FROM grant_intents WHERE id=?").get(automationId(intentId));
    return row === null ? null : this.grantStatus(row.grant_id);
  }
  revoke(id) {
    this.ready();
    if (this.db.query("UPDATE grants SET revoked=1 WHERE id=?").run(automationId(id)).changes !== 1)
      throw new Error("Messaging grant does not exist.");
    this.checkFiles();
  }
  grantStatus(id) {
    this.ready();
    const row = this.db.query("SELECT * FROM grants WHERE id=?").get(automationId(id));
    if (row === null)
      throw new Error("Messaging grant does not exist.");
    const grant = grantData(JSON.parse(row.data));
    return Object.freeze({ ...grant, id: automationId(row.id), revoked: automationInteger(row.revoked, 0, 1) === 1, consumedActions: automationInteger(row.consumed, 0, grant.maximumActions) });
  }
  activeRun(enrollmentId) {
    return this.db.query("SELECT COUNT(*) AS n FROM runs WHERE enrollment_id=? AND state IN ('started','partial','indeterminate')").get(enrollmentId).n > 0;
  }
  async poll(enrollmentId, signal) {
    const initial = this.row(enrollmentId);
    const enrollment = this.enrollment(initial);
    if (this.activeRun(enrollmentId))
      return enrollment;
    const provider = this.provider(enrollment.identity.provider);
    const status = await this.status(provider, signal);
    if (!same(status.identity, enrollment.identity)) {
      this.db.query("UPDATE enrollments SET ready=0,reason=? WHERE id=?").run("Provider identity changed; enroll the conversation again.", enrollmentId);
      throw new Error("Messaging provider identity changed.");
    }
    if (!status.connected || !status.events.available) {
      this.db.query("UPDATE enrollments SET ready=0,reason=? WHERE id=?").run(status.events.reason ?? "Provider events are unavailable.", enrollmentId);
      return this.enrollment(this.row(enrollmentId));
    }
    const page = checkedPage(await provider.events({ coordinates: [enrollment.conversation.coordinate], cursor: initial.cursor, limit: 200 }, signal), enrollment.identity, enrollment.conversation.coordinate);
    stopped(signal);
    this.ready();
    this.db.transaction(() => {
      const current = this.row(enrollmentId);
      if (current.cursor !== initial.cursor || current.revision !== initial.revision || current.baselining !== initial.baselining || current.gap !== initial.gap || this.activeRun(enrollmentId))
        throw new Error("Messaging poll lost its concurrent cursor claim.");
      this.capacity("messages", page.messages.length);
      if (!initial.baselining)
        this.capacity("events", page.messages.length);
      let revision = initial.revision;
      for (const [index, message] of page.messages.entries()) {
        const data = canonicalJson(message);
        const previous = this.db.query("SELECT data FROM messages WHERE enrollment_id=? AND json_extract(data,'$.id')=? ORDER BY rowid DESC LIMIT 1").get(enrollmentId, message.id);
        if (previous?.data === data)
          continue;
        this.db.query("INSERT INTO messages VALUES(?,?,?)").run(enrollmentId, sha256(canonicalJson({ cursor: page.nextCursor, index, message })), data);
        if (initial.baselining === 1)
          continue;
        revision = automationInteger(revision + 1, 1, Number.MAX_SAFE_INTEGER);
        this.db.query("INSERT INTO events(enrollment_id,revision,data) VALUES(?,?,?)").run(enrollmentId, revision, data);
      }
      const gap = initial.gap === 1 || page.gap;
      this.db.query("UPDATE enrollments SET cursor=?,revision=?,ready=?,reason=?,baselining=?,gap=? WHERE id=?").run(page.nextCursor, revision, !gap && page.caughtUp ? 1 : 0, gap ? "Provider event stream has an unresolved gap." : page.caughtUp ? null : "Provider catchup is incomplete.", initial.baselining && !page.caughtUp ? 1 : 0, gap ? 1 : 0, enrollmentId);
    }).immediate();
    this.checkFiles();
    return this.enrollment(this.row(enrollmentId));
  }
  events(raw) {
    this.ready();
    const r = automationRecord(raw, ["enrollmentIds", "cursor", "limit"]);
    const ids = automationArray(r.enrollmentIds, 100).map(automationId).sort();
    if (ids.length === 0 || new Set(ids).size !== ids.length)
      throw new Error("Messaging event selection is invalid.");
    for (const id of ids)
      this.row(id);
    const limit = automationInteger(r.limit, 1, 500);
    const fingerprint = sha256(canonicalJson(ids));
    let after = 0;
    if (r.cursor !== null) {
      const cursor = automationText(r.cursor, 4096);
      const [payload2, signature, extra] = cursor.split(".");
      if (payload2 === undefined || signature === undefined || extra !== undefined || !/^[a-f0-9]{64}$/u.test(signature))
        throw new Error("Messaging cursor is invalid.");
      const mac = createHmac("sha256", this.cursorKey).update(payload2).digest();
      if (!timingSafeEqual(Buffer.from(signature, "hex"), mac))
        throw new Error("Messaging cursor is invalid.");
      const decoded = automationRecord(JSON.parse(Buffer.from(payload2, "base64url").toString()), ["fingerprint", "after"]);
      if (decoded.fingerprint !== fingerprint)
        throw new Error("Messaging cursor belongs to a different contact selection.");
      after = automationInteger(decoded.after, 0, Number.MAX_SAFE_INTEGER);
    }
    const rows = this.db.query(`SELECT seq,enrollment_id,revision,data FROM events WHERE seq>? AND enrollment_id IN (${ids.map(() => "?").join(",")}) ORDER BY seq LIMIT ?`).all(after, ...ids, limit + 1);
    const selected = rows.slice(0, limit);
    const payload = Buffer.from(canonicalJson({ fingerprint, after: selected.at(-1)?.seq ?? after })).toString("base64url");
    return Object.freeze({ events: Object.freeze(selected.map((row) => Object.freeze({ sequence: row.seq, enrollmentId: row.enrollment_id, revision: row.revision, message: parseAutomationMessage(JSON.parse(row.data)) }))), nextCursor: `${payload}.${createHmac("sha256", this.cursorKey).update(payload).digest("hex")}`, caughtUp: rows.length <= limit });
  }
  prepare(raw) {
    this.ready();
    const r = automationRecord(raw, ["enrollmentId", "expectedRevision", "intentId", "actions"]);
    const enrollment = this.enrollment(this.row(automationId(r.enrollmentId)));
    const expectedRevision = automationInteger(r.expectedRevision, 0, Number.MAX_SAFE_INTEGER);
    if (!enrollment.ready || enrollment.revision !== expectedRevision)
      throw new Error("Messaging context is stale or unavailable.");
    const actions = automationArray(r.actions, 8).map(parseAutomationAction);
    if (actions.length === 0)
      throw new Error("Messaging plan is empty.");
    if (Buffer.byteLength(canonicalJson(actions)) > 256 * 1024)
      throw new Error("Messaging plan exceeds its byte bound.");
    const intentId = automationId(r.intentId);
    const binding = { enrollmentId: enrollment.id, expectedRevision, intentId, actions, bindingDigest: enrollment.bindingDigest, expiresAt: new Date(this.now() + 120000).toISOString() };
    const digest = sha256(canonicalJson(binding));
    const plan = Object.freeze({ ...binding, id: `plan:${digest}`, digest });
    this.db.transaction(() => {
      this.capacity("plans");
      this.db.query("INSERT OR IGNORE INTO plans VALUES(?,?)").run(plan.id, canonicalJson(plan));
    }).immediate();
    this.checkFiles();
    return plan;
  }
  runProjection(row) {
    const accepted = automationArray(JSON.parse(row.accepted), 8).map((value) => {
      const r = automationRecord(value, ["messageId", "providerReceiptId"]);
      return Object.freeze({ messageId: r.messageId === null ? null : automationId(r.messageId), providerReceiptId: r.providerReceiptId === null ? null : automationId(r.providerReceiptId) });
    });
    const totalActions = automationInteger(row.total, 1, 8);
    if (!["started", "accepted", "failed", "partial", "indeterminate"].includes(row.state) || accepted.length > totalActions || row.state === "accepted" && accepted.length !== totalActions || row.state === "failed" && accepted.length !== 0)
      throw new Error("Messaging run state is inconsistent.");
    return Object.freeze({ id: automationId(row.id), planId: automationId(row.plan_id), intentId: automationId(row.intent_id), enrollmentId: automationId(row.enrollment_id), state: row.state, accepted: Object.freeze(accepted), totalActions, reason: row.reason === null ? null : automationText(row.reason, 1024), retryable: false });
  }
  run(id) {
    this.ready();
    const row = this.db.query(`SELECT ${RUN_COLUMNS} FROM runs WHERE id=?`).get(automationId(id));
    if (row === null)
      throw new Error("Messaging run does not exist.");
    return this.runProjection(row);
  }
  cancel(planId) {
    this.ready();
    const controllers = this.planControllers.get(automationId(planId));
    if (controllers === undefined)
      return false;
    for (const controller of controllers)
      controller.abort();
    return true;
  }
  submit(raw, signal) {
    this.ready();
    const r = automationRecord(raw, ["planId", "grantId"]);
    const controller = new AbortController;
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted)
      controller.abort();
    this.controllers.add(controller);
    const planId = automationId(r.planId), grantId = automationId(r.grantId);
    const owned = this.planControllers.get(planId) ?? new Set;
    owned.add(controller);
    this.planControllers.set(planId, owned);
    const operation = this.dispatch(planId, grantId, controller.signal);
    this.pending.add(operation);
    operation.finally(() => {
      signal?.removeEventListener("abort", abort);
      this.controllers.delete(controller);
      owned.delete(controller);
      if (!owned.size)
        this.planControllers.delete(planId);
      this.pending.delete(operation);
    }).catch(() => {
      return;
    });
    return operation;
  }
  async dispatch(planId, grantId, signal) {
    stopped(signal);
    const record = this.db.query("SELECT data FROM plans WHERE id=?").get(planId);
    if (record === null)
      throw new Error("Messaging plan does not exist.");
    const plan = planData(JSON.parse(record.data));
    if (plan.id !== planId)
      throw new Error("Messaging plan binding is invalid.");
    const existing = this.db.query(`SELECT ${RUN_COLUMNS} FROM runs WHERE intent_id=?`).get(plan.intentId);
    if (existing !== null) {
      if (existing.plan_id !== plan.id)
        throw new Error("Messaging intent already belongs to another plan.");
      return this.runProjection(existing);
    }
    const enrollment = await this.poll(plan.enrollmentId, signal);
    const provider = this.provider(enrollment.identity.provider);
    const status = await this.status(provider, signal);
    const route = await provider.resolve(enrollment.conversation.coordinate, signal);
    stopped(signal);
    if (!same(parseAutomationIdentity(route.identity), enrollment.identity) || !sameConversation(conversation(route.conversation), enrollment.conversation) || !same(status.identity, enrollment.identity) || !status.connected)
      throw new Error("Messaging route or identity changed before dispatch.");
    for (const action of plan.actions)
      if (!status.actions[parseAutomationAction(action).kind].available)
        throw new Error("Messaging action is unavailable for this provider.");
    const runId = `run:${randomUUID()}`;
    this.ready();
    this.db.transaction(() => {
      stopped(signal);
      const current = this.enrollment(this.row(plan.enrollmentId));
      const now = this.now();
      this.capacity("runs");
      this.capacity("messages", 0);
      this.capacity("events", 0);
      if (!current.ready || current.revision !== plan.expectedRevision || current.bindingDigest !== plan.bindingDigest || Date.parse(plan.expiresAt) <= now || this.activeRun(current.id))
        throw new Error("Messaging context expired, changed, or has an unresolved run.");
      const grantRow = this.db.query("SELECT * FROM grants WHERE id=?").get(grantId);
      if (grantRow === null)
        throw new Error("Messaging grant does not exist.");
      const grant = grantData(JSON.parse(grantRow.data));
      automationInteger(grantRow.revoked, 0, 1);
      automationInteger(grantRow.consumed, 0, grant.maximumActions);
      automationInteger(grantRow.last_dispatch, 0, Number.MAX_SAFE_INTEGER);
      if (grantRow.revoked !== 0 || grant.enrollmentId !== current.id || grant.expectedBindingDigest !== current.bindingDigest || Date.parse(grant.expiresAt) <= now || grantRow.consumed + plan.actions.length > grant.maximumActions || grantRow.last_dispatch !== 0 && now - grantRow.last_dispatch < grant.minimumIntervalMs || plan.actions.some((action) => !grant.actions.includes(action.kind)))
        throw new Error("Messaging grant does not authorize this dispatch.");
      this.db.query("INSERT INTO runs VALUES(?,?,?,?, 'started','[]',?,NULL)").run(runId, plan.id, plan.intentId, current.id, plan.actions.length);
      this.db.query("UPDATE grants SET consumed=consumed+?,last_dispatch=? WHERE id=?").run(plan.actions.length, now, grantId);
    }).immediate();
    this.checkFiles();
    const accepted = [];
    let state = "accepted";
    let reason = null;
    for (const [index, action] of plan.actions.entries()) {
      try {
        this.checkFiles();
        const observed = checkedPage(await provider.events({ coordinates: [enrollment.conversation.coordinate], cursor: this.row(enrollment.id).cursor, limit: 200 }, signal), enrollment.identity, enrollment.conversation.coordinate);
        const ownMessages = new Set(accepted.flatMap((receipt) => receipt.messageId === null ? [] : [receipt.messageId]));
        if (observed.gap || !observed.caughtUp || observed.messages.some((message) => message.direction !== "outgoing" || message.kind !== "message" || !ownMessages.has(message.id))) {
          state = accepted.length ? "partial" : "failed";
          reason = "Conversation changed before the next action.";
          break;
        }
        const grantRow = this.db.query("SELECT * FROM grants WHERE id=?").get(grantId);
        const grant = grantRow === null ? null : grantData(JSON.parse(grantRow.data));
        const current = this.enrollment(this.row(plan.enrollmentId));
        if (signal.aborted || grantRow?.revoked !== 0 || grant === null || Date.parse(grant.expiresAt) <= this.now() || Date.parse(plan.expiresAt) <= this.now() || grant.enrollmentId !== current.id || grant.expectedBindingDigest !== current.bindingDigest || current.bindingDigest !== plan.bindingDigest || !grant.actions.includes(action.kind)) {
          state = accepted.length ? "partial" : "failed";
          reason = "Dispatch permission expired or changed before the next action.";
          break;
        }
        const result = checkedResult(await provider.send({ identity: enrollment.identity, coordinate: enrollment.conversation.coordinate, action, intentId: `${plan.intentId}:${index}` }, signal));
        if (result.state !== "accepted") {
          state = result.state === "indeterminate" ? "indeterminate" : accepted.length ? "partial" : "failed";
          reason = result.reason;
          break;
        }
        accepted.push({ messageId: result.messageId, providerReceiptId: result.providerReceiptId });
        this.checkFiles();
        if (this.db.query("UPDATE runs SET accepted=? WHERE id=? AND state='started'").run(canonicalJson(accepted), runId).changes !== 1)
          throw new Error("Messaging result journal lost its claim.");
      } catch {
        state = "indeterminate";
        reason = "Provider dispatch or result recording did not settle conclusively.";
        break;
      }
    }
    this.checkFiles();
    if (this.db.query("UPDATE runs SET state=?,accepted=?,reason=? WHERE id=? AND state='started'").run(state, canonicalJson(accepted), reason, runId).changes !== 1)
      throw new Error("Messaging terminal result could not be recorded.");
    const row = this.db.query(`SELECT ${RUN_COLUMNS} FROM runs WHERE id=?`).get(runId);
    return this.runProjection(row);
  }
  async close() {
    if (this.closed)
      return;
    if (this.closing)
      throw new Error("Messaging automation shutdown is already in progress.");
    this.closing = true;
    for (const controller of this.controllers)
      controller.abort();
    const settled = await Promise.allSettled([...this.pending]);
    const providers = await Promise.allSettled([...this.providers.values()].map((provider) => provider.close()));
    this.db.close();
    this.closed = true;
    if (settled.some((result) => result.status === "rejected") || providers.some((result) => result.status === "rejected"))
      throw new Error("Messaging automation shutdown did not establish complete cleanup.");
  }
}

export { MessagingAutomationHost };

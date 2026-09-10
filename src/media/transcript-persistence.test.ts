import { describe, expect, test } from "bun:test";
import { assertAsyncProperty, fc } from "../test-support";
import {
  GHOSTGET_MEDIA_PCM_NORMALIZATION_PROFILE,
  GHOSTGET_MEDIA_RUNTIME_CLOSURE_PROFILE,
  GHOSTGET_MEDIA_WHISPER_CPP_PROFILE,
  type MediaArtifact,
} from "./manifest";
import type { LocalTranscriptToPersist } from "./transcript-persistence-model";
import type { TranscriptPersistenceNative } from "./transcript-persistence-platform";
import { persistLocalTranscript } from "./transcript-persistence-runtime";

function deferred<A>() {
  let resolve!: (value: A) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<A>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const turn = () => new Promise<void>(resolve => { setImmediate(resolve); });
const input: LocalTranscriptToPersist = {
  status: "transcribed", language: "en",
  transcript: { vtt: "WEBVTT\n", text: "words\n", json: "[]\n", cues: [] },
  provenance: {
    adapter: "whisper-cpp", profile: GHOSTGET_MEDIA_WHISPER_CPP_PROFILE,
    executableSha256: "a".repeat(64), runtimeProfile: GHOSTGET_MEDIA_RUNTIME_CLOSURE_PROFILE,
    runtimeSha256: "b".repeat(64), runtimeDependencyCount: 1,
    modelSha256: "c".repeat(64), requestedLanguage: "en",
    input: { path: "audio.mka", bytes: 1, sha256: "d".repeat(64), normalized: {
      profile: GHOSTGET_MEDIA_PCM_NORMALIZATION_PROFILE, bytes: 2, sha256: "e".repeat(64),
    } },
  },
};
const names = ["vtt", "txt", "json"] as const;
const defaults: TranscriptPersistenceNative = {
  paths: () => ({ timed: "vtt", text: "txt", cues: "json" }),
  relativePath: (_root, path) => path,
  write: () => Promise.resolve(),
  artifact: (_root, path, role) => Promise.resolve({ path, role, bytes: 1, sha256: path, mediaType: path }),
};

type Phase = "write" | "hash";
type Outcome<A> = { readonly ok: true; readonly value: A } | { readonly ok: false; readonly cause: unknown };
const observed = <A>(promise: Promise<A>): Promise<Outcome<A>> => promise.then(
  value => ({ ok: true as const, value }), cause => ({ ok: false as const, cause }),
);

function controlled(phase: Phase) {
  const slots = names.map(() => deferred<void>());
  const admitted = deferred<void>();
  let active = 0;
  let calls = 0;
  let hashes = 0;
  let terminalActive: number | undefined;
  const tasks: Promise<void>[] = [];
  const enter = () => {
    const index = calls++;
    const slot = slots[index];
    if (slot === undefined) throw new Error("Unexpected fourth native admission");
    active += 1;
    const task = slot.promise.finally(() => { active -= 1; });
    tasks.push(task);
    if (calls === 3) admitted.resolve();
    return task;
  };
  const ports: TranscriptPersistenceNative = {
    ...defaults,
    write: () => phase === "write" ? enter() : Promise.resolve(),
    artifact: (_root, path, role) => {
      hashes += 1;
      const result: MediaArtifact = { path, role, bytes: 1, sha256: path, mediaType: path };
      return phase === "hash" ? enter().then(() => result) : Promise.resolve(result);
    },
  };
  const outcome = observed(persistLocalTranscript("root", input, ports)).then(value => {
    terminalActive = active; return value;
  });
  return {
    slots, tasks, outcome,
    entered: Promise.race([admitted.promise, outcome.then(() => { throw new Error("Terminal before all three admissions"); })]),
    get calls() { return calls; }, get hashes() { return hashes; },
    get terminalActive() { return terminalActive; },
    async close() { slots.forEach(slot => slot.resolve()); await outcome; await Promise.allSettled(tasks); },
  };
}

function rejectAt(control: ReturnType<typeof controlled>, index: number, cause: unknown) {
  const slot = control.slots[index];
  if (slot === undefined) throw new Error("Missing native slot");
  slot.reject(cause);
}

for (const phase of ["write", "hash"] as const) {
  describe(`${phase} phase through the persistence Promise bridge`, () => {
    for (const [index, cause] of [undefined, null, false, 0, "", new Error("native failure")].entries()) {
      test(`retains raw failure ${index} until every native sibling settles`, async () => {
        const c = controlled(phase);
        try {
          await c.entered;
          rejectAt(c, 1, cause);
          await turn();
          expect(c.terminalActive).toBeUndefined();
          rejectAt(c, 0, new Error("later sibling failure"));
          c.slots[2]?.resolve();
          const result = await c.outcome;
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.cause).toBe(cause);
          expect(c.terminalActive).toBe(0);
          if (phase === "write") expect(c.hashes).toBe(0);
        } finally { await c.close(); }
      });
    }

    test("selects the first observed rejection rather than array position", async () => {
      const c = controlled(phase);
      const first = new Error("third call settles first");
      try {
        await c.entered;
        rejectAt(c, 2, first);
        await turn();
        rejectAt(c, 0, new Error("first call settles later"));
        c.slots[1]?.resolve();
        const result = await c.outcome;
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.cause).toBe(first);
        expect(c.terminalActive).toBe(0);
      } finally { await c.close(); }
    });

    for (const earlierRejected of [false, true]) {
      test(`a later synchronous throw stops admission and wins; earlierRejected=${earlierRejected}`, async () => {
        const first = deferred<void>();
        const second = deferred<void>();
        const synchronous = undefined;
        let calls = 0; let active = 0; let terminalActive: number | undefined;
        const tasks: Promise<void>[] = [];
        const enter = () => {
          calls += 1;
          if (calls === 2) { second.resolve(); throw synchronous; }
          if (calls !== 1) throw new Error("Third call admitted after synchronous throw");
          active += 1;
          const task = (earlierRejected ? Promise.reject(new Error("earlier asynchronous rejection")) : first.promise)
            .finally(() => { active -= 1; });
          tasks.push(task); return task;
        };
        const ports: TranscriptPersistenceNative = {
          ...defaults,
          write: () => phase === "write" ? enter() : Promise.resolve(),
          artifact: (_root, path, role) => phase === "hash"
            ? enter().then(() => ({ path, role, bytes: 1, sha256: path, mediaType: path }))
            : defaults.artifact("root", path, role),
        };
        const outcome = observed(persistLocalTranscript("root", input, ports)).then(result => { terminalActive = active; return result; });
        try {
          await Promise.race([second.promise, outcome.then(() => { throw new Error("Terminal before second native admission"); })]);
          await turn();
          expect(calls).toBe(2);
          if (!earlierRejected) expect(terminalActive).toBeUndefined();
          first.resolve();
          const result = await outcome;
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.cause).toBe(synchronous);
          expect(terminalActive).toBe(0);
        } finally { first.resolve(); await outcome; await Promise.allSettled(tasks); }
      });
    }
  });
}

test("composed bridge preserves eager native admission and repeated getter order", async () => {
  const trace: string[] = [];
  let read = 0;
  const value: LocalTranscriptToPersist = {
    status: "transcribed",
    get transcript() { trace.push(`transcript:${++read}`); return {
      get vtt() { trace.push("vtt"); return input.transcript.vtt; },
      get text() { trace.push("text"); return input.transcript.text; },
      get json() { trace.push("json"); return input.transcript.json; }, cues: [],
    }; },
    get language() { trace.push("language"); return input.language; },
    get provenance() { trace.push("provenance"); return input.provenance; },
  };
  const writes: string[] = [];
  const running = persistLocalTranscript("root", value, {
    ...defaults,
    write: (path, contents) => {
      trace.push(`write:${path}`); writes.push(contents);
      if (path === "vtt") queueMicrotask(() => { trace.push("write-microtask"); });
      return Promise.resolve();
    },
    relativePath: (_root, path) => { trace.push(`relative:${path}`); return path; },
    artifact: (_root, path, role) => {
      trace.push(`hash:${path}`);
      if (path === "vtt") queueMicrotask(() => { trace.push("hash-microtask"); });
      return defaults.artifact("root", path, role);
    },
  });
  trace.push("returned");
  const result = await running;
  expect(trace).toEqual([
    "transcript:1", "vtt", "write:vtt", "transcript:2", "text", "write:txt", "transcript:3", "json", "write:json",
    "returned", "write-microtask", "relative:vtt", "relative:txt", "relative:json", "language", "provenance",
    "hash:vtt", "hash:txt", "hash:json", "hash-microtask",
  ]);
  expect(writes).toEqual([input.transcript.vtt, input.transcript.text, input.transcript.json]);
  expect(result.transcript).toEqual({ status: "available", source: "local", language: "en", timedPath: "vtt", textPath: "txt", cuesPath: "json", provenance: input.provenance });
  expect(result.artifacts.map(a => [a.path, a.role])).toEqual([["vtt", "transcript_vtt"], ["txt", "transcript_text"], ["json", "transcript_json"]]);
});

test("second payload getter failure drains the earlier write and prevents later admission", async () => {
  const held = deferred<void>(); const failed = deferred<void>(); const cause = false;
  let reads = 0; let writes = 0; let hashes = 0; let pending = true; let terminalPending: boolean | undefined;
  const task = held.promise.finally(() => { pending = false; });
  const value: LocalTranscriptToPersist = { ...input, get transcript() {
    if (++reads === 2) { failed.resolve(); throw cause; }
    return input.transcript;
  } };
  const outcome = observed(persistLocalTranscript("root", value, {
    ...defaults, write: () => { writes += 1; return task; },
    artifact: (_root, path, role) => { hashes += 1; return defaults.artifact("root", path, role); },
  })).then(result => { terminalPending = pending; return result; });
  try {
    await Promise.race([failed.promise, outcome.then(() => { throw new Error("Terminal before second payload getter"); })]); await turn();
    expect(terminalPending).toBeUndefined(); expect(writes).toBe(1); expect(reads).toBe(2);
    held.resolve(); const result = await outcome;
    expect(result.ok).toBe(false); if (!result.ok) expect(result.cause).toBe(cause);
    expect(terminalPending).toBe(false); expect(hashes).toBe(0);
  } finally { held.resolve(); await outcome; await task; }
});

for (const field of ["language", "provenance"] as const) {
  test(`${field} projection failure remains raw after writes and before hashes`, async () => {
    let writes = 0; let hashes = 0; const cause = null;
    const value = Object.defineProperty({ ...input }, field, { get: () => { expect(writes).toBe(3); throw cause; } });
    const result = await observed(persistLocalTranscript("root", value, {
      ...defaults, write: () => { writes += 1; return Promise.resolve(); },
      artifact: (_root, path, role) => { hashes += 1; return defaults.artifact("root", path, role); },
    }));
    expect(result.ok).toBe(false); if (!result.ok) expect(result.cause).toBe(cause);
    expect(hashes).toBe(0);
  });
}

test("already-rejected native Promise wins over a later queued rejection", async () => {
  const first = new Error("already rejected"); const later = new Error("queued rejection");
  let calls = 0;
  const result = await observed(persistLocalTranscript("root", input, {
    ...defaults,
    write: () => {
      calls += 1;
      if (calls === 1) return Promise.reject(first);
      if (calls === 2) return new Promise((_resolve, reject) => { queueMicrotask(() => { reject(later); }); });
      return Promise.resolve();
    },
  }));
  expect(calls).toBe(3); expect(result.ok).toBe(false);
  if (!result.ok) expect(result.cause).toBe(first);
});

for (const phase of ["write", "hash"] as const) {
  test(`${phase} already-rejected native ties retain array registration order`, async () => {
    const first = new Error("first registered rejection");
    const second = new Error("second registered rejection");
    let calls = 0;
    const admit = <A>(value: A): Promise<A> => {
      calls += 1;
      if (calls === 1) return Promise.reject(first);
      if (calls === 2) return Promise.reject(second);
      return Promise.resolve(value);
    };
    const result = await observed(persistLocalTranscript("root", input, {
      ...defaults,
      write: () => phase === "write" ? admit(undefined) : Promise.resolve(),
      artifact: (_root, path, role) => phase === "hash"
        ? admit({ path, role, bytes: 1, sha256: path, mediaType: path })
        : defaults.artifact("root", path, role),
    }));
    expect(calls).toBe(3); expect(result.ok).toBe(false);
    if (!result.ok) expect(result.cause).toBe(first);
  });
}

test("property: ordered native schedules preserve selection and join every admitted callback", async () => {
  await assertAsyncProperty(fc.asyncProperty(
    fc.constantFrom<Phase>("write", "hash"),
    fc.shuffledSubarray([0, 1, 2], { minLength: 3, maxLength: 3 }),
    fc.tuple(fc.boolean(), fc.boolean(), fc.boolean()),
    fc.tuple(fc.constantFrom(undefined, null, false, 0, ""), fc.string({ maxLength: 8 }), fc.integer()),
    async (phase, order, failures, causes) => {
      const c = controlled(phase);
      try {
        await c.entered;
        for (const index of order) {
          const slot = c.slots[index]; const task = c.tasks[index];
          if (slot === undefined || task === undefined) throw new Error("Native admission omitted a scheduled slot");
          if (failures[index]) slot.reject(causes[index]); else slot.resolve();
          await task.then(() => undefined, () => undefined);
          await turn();
          if (index !== order[2]) expect(c.terminalActive).toBeUndefined();
        }
        const result = await c.outcome;
        const firstFailure = order.find(index => failures[index]);
        expect(c.terminalActive).toBe(0); expect(c.calls).toBe(3);
        if (firstFailure === undefined) {
          expect(result.ok).toBe(true);
          if (result.ok) expect(result.value.artifacts.map(a => a.path)).toEqual([...names]);
        } else {
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.cause).toBe(causes[firstFailure]);
          if (phase === "write") expect(c.hashes).toBe(0);
        }
      } finally { await c.close(); }
    },
  ), { numRuns: 100 });
});

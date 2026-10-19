import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { quintPositiveChecks, readQuintModels, requireQuintProofSource } from "./verification-tools.js";

const models = await readQuintModels();
const model = models.find((entry) => entry.file === "approvals.qnt")!;
const source = await readFile(new URL("../verification/quint/approvals.qnt", import.meta.url), "utf8");
const declaration = "  val approvalsSafety: bool = and { atMostOneUse, onlyHolderAllowed }";

test("approvals explores its positive prefix once while preserving both registered members", () => {
  expect(quintPositiveChecks(model, source)).toEqual([
    { invariant: "approvalsSafety", members: ["atMostOneUse", "onlyHolderAllowed"] },
  ]);
});

test("positive membership source must equal the source of cached shared IR", () => {
  expect(() => requireQuintProofSource(model.file, source, source)).not.toThrow();
  expect(() => requireQuintProofSource(model.file, source, source.replace(declaration, "  val approvalsSafety: bool = atMostOneUse"))).toThrow();
  expect(() => requireQuintProofSource(model.file, source, source + "\n")).toThrow();
});

test("other models retain every individual positive check", () => {
  for (const entry of models.filter((entry) => entry.file !== model.file)) {
    expect(quintPositiveChecks(entry, "unparsed source")).toEqual(entry.invariants.map((invariant) => ({ invariant, members: [invariant] })));
  }
});

test("closed approvals registry rejects changed membership or transition identity", () => {
  for (const changed of [
    { ...model, invariants: ["atMostOneUse"] },
    { ...model, invariants: [...model.invariants, "anotherInvariant"] },
    { ...model, invariants: ["atMostOneUse", "atMostOneUse"] },
    { ...model, module: "other" },
    { ...model, init: "other" },
    { ...model, step: "stepShared" },
  ]) expect(() => quintPositiveChecks(changed, source)).toThrow();
});

test("parser rejects incomplete, duplicate, disguised, temporal, and malformed conjunctions", () => {
  for (const replacement of [
    "  val approvalsSafety: bool = atMostOneUse",
    "  val approvalsSafety: bool = and { atMostOneUse, atMostOneUse }",
    "  val approvalsSafety: bool = or { atMostOneUse, onlyHolderAllowed }",
    "  val approvalsSafety: bool = and { atMostOneUse, true }",
    "  val approvalsSafety: bool = and { atMostOneUse, onlyHolderAllowed or true }",
    "  temporal approvalsSafety: bool = and { atMostOneUse, onlyHolderAllowed }",
    "  val approvalsSafety: bool = and { atMostOneUse, onlyHolderAllowed, true }",
    "  // val approvalsSafety: bool = and { atMostOneUse, onlyHolderAllowed }",
    "  val approvalsSafety: bool = and {",
  ]) expect(() => quintPositiveChecks(model, source.replace(declaration, replacement))).toThrow();
  expect(() => quintPositiveChecks(model, source.replace("val onlyHolderAllowed", "temporal onlyHolderAllowed"))).toThrow();
  expect(() => quintPositiveChecks(model, source + "\nmodule other {}\n")).toThrow();
  expect(() => quintPositiveChecks(model, source.replace(declaration, declaration + "\n  val atMostOneUse: bool = true"))).toThrow();
  expect(() => quintPositiveChecks(model, source.replace(declaration, declaration.replace(": bool", "")))).toThrow();
  expect(() => quintPositiveChecks(model, source.replace("val onlyHolderAllowed: bool", "val onlyHolderAllowed"))).toThrow();
});

test("all three mutants and original simulation registrations stay independent", () => {
  expect(model.invariants).toEqual(["atMostOneUse", "onlyHolderAllowed"]);
  expect(model.mutants).toEqual([
    { step: "stepShared", invariant: "atMostOneUse" },
    { step: "stepFirstCheck", invariant: "onlyHolderAllowed" },
    { step: "stepAdmitBeforeAwait", invariant: "atMostOneUse" },
  ]);
  expect(model.apalache.length).toBe(10);
  expect(model.simulation).toEqual({ seed: "20260925", maxSamples: 3000, maxSteps: 20 });
});

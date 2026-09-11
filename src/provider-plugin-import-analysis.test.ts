import { expect, test } from "bun:test";
import fc from "fast-check";
import { scanProviderPluginValueImports } from "./provider-plugin-import-analysis";

test("reuses immutable syntax results but distinguishes fresh source and parser mode", () => {
  const source = 'import value from "./memo-original"; export default value;';
  const original = scanProviderPluginValueImports(source, "ts");
  expect(scanProviderPluginValueImports(source, "ts")).toBe(original);
  expect(Object.isFrozen(original)).toBe(true);
  expect(Object.isFrozen(original[0])).toBe(true);
  expect(() => Reflect.set(original[0]!, "path", "./forged")).not.toThrow();
  expect(original[0]?.path).toBe("./memo-original");
  expect(scanProviderPluginValueImports(source, "js")).not.toBe(original);
  expect(scanProviderPluginValueImports(source.replace("memo-original", "memo-changed"), "ts"))
    .toEqual([{ kind: "import-statement", path: "./memo-changed" }]);
  expect(scanProviderPluginValueImports(source, "ts")).toBe(original);
});

test("evicts old syntax results after its entry bound without changing their value", () => {
  const source = 'import "./memo-evicted";';
  const before = scanProviderPluginValueImports(source, "js");
  for (let index = 0; index < 2_048; index++) {
    scanProviderPluginValueImports(`export const memoEviction = ${index};`, "js");
  }
  const after = scanProviderPluginValueImports(source, "js");
  expect(after).not.toBe(before);
  expect(after).toEqual(before);
});

test("bounds retained import text independently from module count", () => {
  const source = 'import "./memo-text-evicted";';
  const before = scanProviderPluginValueImports(source, "js");
  // Five individually admissible one-edge modules exceed the 4 MiB text budget.
  for (let index = 0; index < 5; index++) {
    scanProviderPluginValueImports(`import "./${index}${"a".repeat(900_000)}";`, "js");
  }
  const after = scanProviderPluginValueImports(source, "js");
  expect(after).not.toBe(before);
  expect(after).toEqual(before);
});

test("never loses a literal edge when fresh module bytes change", () => {
  fc.assert(fc.property(
    fc.array(fc.integer({ min: 97, max: 122 }), { minLength: 1, maxLength: 60 }),
    (characters) => {
      const path = `./${String.fromCharCode(...characters)}`;
      const source = `export const value = import(${JSON.stringify(path)});`;
      expect(scanProviderPluginValueImports(source, "ts"))
        .toEqual([{ kind: "dynamic-import", path }]);
      expect(scanProviderPluginValueImports(`${source}\nrequire("./extra");`, "ts"))
        .toEqual([{ kind: "dynamic-import", path }, { kind: "require-call", path: "./extra" }]);
    },
  ), { numRuns: 100 });
});

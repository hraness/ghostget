import { expect, test } from "bun:test";
import { hasNonLiteralModuleLoad } from "./provider-plugin-module-analysis";

const analyze = (source: string): boolean => hasNonLiteralModuleLoad(source, "/fixture.js");
const factory = "const factory = options => options.eval;";

test("admits proven private literal callback records and their factory forwarding", () => {
  for (const source of [
    `${factory} export const x = factory({eval(){return 1}});`,
    `${factory} export const x = factory({eval: () => 1});`,
    `${factory} export const x = factory({eval: function(){return 1}});`,
    `${factory} export const x = factory({op: "NoCallback"});`,
    `${factory} const wrap = options => factory(options); export const x = wrap({eval(){return 1}});`,
    `const factory = options => (options["eval"]); export const x = factory({eval(){return 1}});`,
    `${factory} const wrap = options => { const proto = factory(options); return () => [proto, options.op]; }; export const x = wrap({op: "Callback", eval(){return 1}});`,
  ]) expect(analyze(source), source).toBe(false);
});

test("keeps unknown, escaping, shadowed, and mutable callback records fail closed", () => {
  for (const source of [
    `${factory} export const x = factory(globalThis);`,
    `${factory} const host = globalThis; export const x = factory(host);`,
    `${factory} export {factory};`,
    `export ${factory} export const x = factory({eval(){return 1}});`,
    `${factory} export const escape = factory; escape({eval(){return 1}});`,
    `${factory} export const escape = {factory}; factory({eval(){return 1}});`,
    `${factory} export {factory as publicFactory}; factory({eval(){return 1}});`,
    `${factory} export const x = factory(...input);`,
    `${factory} export const x = factory({ ...input, eval(){return 1}});`,
    `${factory} export const x = factory({eval(){return 1}, ...input});`,
    `${factory} export const x = factory({[key]: input, eval(){return 1}});`,
    `${factory} export const x = factory({eval(){return 1}, eval: input});`,
    `${factory} export const x = factory({__proto__: input});`,
    `${factory} export const x = factory({get eval(){return input}});`,
    `${factory} export const x = factory({get other(){this.eval = input}, eval(){return 1}});`,
    `const factory = function named(options) { if (input) return named(input); return options.eval; }; factory({eval(){return 1}});`,
    `const factory = function(options) { arguments[0].eval = input; return options.eval; }; factory({eval(){return 1}});`,
    `const factory = options => options["eval"](); factory({eval(){return 1}});`,
    `const factory = options => (options.eval)(); factory({eval(){return 1}});`,
    `const factory = options => new (options.eval)(); factory({eval(){return 1}});`,
    `const factory = options => options.eval\`input\`; factory({eval(){return 1}});`,
    `${factory} export const x = factory({eval: input});`,
    `const factory = options => { options.eval = input; return options.eval; }; factory({eval(){return 1}});`,
    `const factory = options => { options["eval"] = input; return options.eval; }; factory({eval(){return 1}});`,
    `const factory = options => { (options.eval) = input; return options.eval; }; factory({eval(){return 1}});`,
    `const factory = options => { (options.eval as any) = input; return options.eval; }; factory({eval(){return 1}});`,
    `const factory = options => { (<any>options.eval) = input; return options.eval; }; factory({eval(){return 1}});`,
    `const factory = options => { options.eval! = input; return options.eval; }; factory({eval(){return 1}});`,
    `const factory = options => { (options.eval satisfies any) = input; return options.eval; }; factory({eval(){return 1}});`,
    `const factory = options => { ({method: options.eval} = input); return options.eval; }; factory({eval(){return 1}});`,
    `const factory = options => { [options.eval] = input; return options.eval; }; factory({eval(){return 1}});`,
    `const factory = options => { for (options.eval of input) {} return options.eval; }; factory({eval(){return 1}});`,
    `const factory = options => { delete options.eval; return options.eval; }; factory({eval(){return 1}});`,
    `const factory = options => { options.eval++; return options.eval; }; factory({eval(){return 1}});`,
    `const factory = options => { Object.assign(options, input); return options.eval; }; factory({eval(){return 1}});`,
    `const factory = options => { const alias = options; return options.eval; }; factory({eval(){return 1}});`,
    `const factory = options => { return [options, options.eval]; }; factory({eval(){return 1}});`,
    `const factory = options => { options.mutate(); return options.eval; }; factory({eval(){return 1}});`,
    `const factory = (options = globalThis) => options.eval; factory();`,
    `${factory} const wrap = options => factory(options); export {wrap}; wrap({eval(){return 1}});`,
    `${factory} const wrap = options => factory(options); wrap(globalThis);`,
    `${factory} const wrap = options => { const mutate = options => options.eval; return [factory(options), mutate(input)]; }; wrap({eval(){return 1}});`,
    `${factory} function shadow(factory) { return factory(input); } factory({eval(){return 1}}); const other = options => options.eval; shadow(other);`,
    `${factory} const wrap = options => factory(options); wrap(wrap(input));`,
  ]) expect(analyze(source), source).toBe(true);
});

test("still rejects actual global, indirect, and aliased loaders inside admitted callbacks", () => {
  for (const expression of [
    `eval(source)`, `(0, eval)(source)`, `globalThis.eval(source)`,
    `globalThis["eval"](source)`, `global.eval(source)`,
    `Function(source)`, `new Function(source)`, `globalThis.Function(source)`,
    `require(source)`, `module.require(source)`, `import(source)`,
    `(() => { const run = eval; return run(source); })()`,
    `(() => { const host = globalThis; return host.eval(source); })()`,
    `(() => { const {eval: run} = globalThis; return run(source); })()`,
    `(() => { const run = Function; return run(source); })()`,
    `(() => { const {Function: run} = globalThis; return run(source); })()`,
    `(() => { const load = require; return load(source); })()`,
    `createRequire(import.meta.url)(source)`,
    `process.getBuiltinModule(source)`,
  ]) expect(analyze(`${factory} export const x = factory({eval(){return ${expression}}});`)).toBe(true);
});

test("retains literal module edges for the ordinary dependency scanner", () => {
  expect(analyze('import value from "./value.js"; export {value};')).toBe(false);
  expect(analyze('export const value = import("./value.js");')).toBe(false);
  expect(analyze('export const value = require("./value.js");')).toBe(false);
});

test("never carries a prior syntax verdict across changed source at the same path", () => {
  const path = "/memo-fresh-source.ts";
  const literal = 'export const value = import("./value.js");';
  const dynamic = 'export const value = import(moduleName);';
  expect(hasNonLiteralModuleLoad(literal, path)).toBe(false);
  expect(hasNonLiteralModuleLoad(dynamic, path)).toBe(true);
  expect(hasNonLiteralModuleLoad(literal, path)).toBe(false);
  expect(hasNonLiteralModuleLoad(dynamic, path)).toBe(true);
  // Source-local callback proofs are recomputed for changed call-site ownership.
  const admitted = `${factory} factory({eval(){return 1}});`;
  expect(hasNonLiteralModuleLoad(admitted, path)).toBe(false);
  expect(hasNonLiteralModuleLoad(`${admitted} export { factory };`, path)).toBe(true);
});

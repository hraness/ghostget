import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

function controlActions(source: string): string[] {
  const file = ts.createSourceFile("protocol.ts", source, ts.ScriptTarget.ESNext, false, ts.ScriptKind.TS);
  const declarations = file.statements.filter(ts.isTypeAliasDeclaration).filter(node => node.name.text === "ControlRequest");
  const declaration = declarations[0];
  if (declarations.length !== 1 || !declaration || !ts.isUnionTypeNode(declaration.type)) throw new Error("Expected one explicit control request union");
  return declaration.type.types.map(member => {
    if (!ts.isTypeLiteralNode(member)) throw new Error("Every control request must declare its literal action inline");
    const actions = member.members.filter(ts.isPropertySignature).filter(property => ts.isIdentifier(property.name) && property.name.text === "action");
    const action = actions[0];
    if (actions.length !== 1 || !action || action.questionToken || !action.type || !ts.isLiteralTypeNode(action.type) || !ts.isStringLiteral(action.type.literal)) throw new Error("Every control request must have one required literal action");
    return action.type.literal.text;
  });
}

test("native admission covers exactly the shared administrative request protocol", () => {
  const protocol = readFileSync(new URL("../../src/control/protocol.ts", import.meta.url), "utf8");
  const shared = controlActions(protocol);
  const host = readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");
  const admitted = host.match(/const ACTIONS: &\[&str\] = &(\[[^\]]+\]);/u)?.[1];
  if (!admitted) throw new Error("Native control admission declaration could not be inspected");
  const native: unknown = JSON.parse(admitted);
  expect(shared.length).toBeGreaterThan(0);
  expect(new Set(shared).size).toBe(shared.length);
  expect(Array.isArray(native)).toBe(true);
  if (!Array.isArray(native) || !native.every(value => typeof value === "string")) throw new Error("Native actions must be literal names");
  expect([...native].sort()).toEqual([...shared].sort());
});

test("protocol inspection fails closed when an action could be omitted", () => {
  for (const member of ["AliasRequest", '{ action: string }', '{ action?: "hidden" }', '{ action: "one" | "two" }']) {
    expect(() => controlActions(`type ControlRequest = { action: "snapshot" } | ${member};`)).toThrow();
  }
});

import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

function controlActions(source: string, vaultSource?: string): string[] {
  const members = (source: string, name: string): readonly ts.TypeNode[] => {
    const file = ts.createSourceFile("protocol.ts", source, ts.ScriptTarget.ESNext, false, ts.ScriptKind.TS);
    const declarations = file.statements.filter(ts.isTypeAliasDeclaration).filter(node => node.name.text === name);
    const declaration = declarations[0];
    if (declarations.length !== 1 || !declaration || !ts.isUnionTypeNode(declaration.type)) throw new Error("Expected one explicit control request union");
    return declaration.type.types;
  };
  return members(source, "ControlRequest").flatMap(member => {
    if (ts.isTypeReferenceNode(member) && ts.isIdentifier(member.typeName) && member.typeName.text === "VaultControlRequest" && member.typeArguments === undefined && vaultSource !== undefined) return members(vaultSource, "VaultControlRequest");
    return [member];
  }).map(member => {
    if (!ts.isTypeLiteralNode(member)) throw new Error("Every control request must declare its literal action inline");
    const actions = member.members.filter(ts.isPropertySignature).filter(property => ts.isIdentifier(property.name) && property.name.text === "action");
    const action = actions[0];
    if (actions.length !== 1 || !action || action.questionToken || !action.type || !ts.isLiteralTypeNode(action.type) || !ts.isStringLiteral(action.type.literal)) throw new Error("Every control request must have one required literal action");
    return action.type.literal.text;
  });
}

test("native admission covers exactly the active shared administrative request protocol", () => {
  const protocol = readFileSync(new URL("../../src/control/protocol.ts", import.meta.url), "utf8");
  const vault = readFileSync(new URL("../../src/control/vault-model.ts", import.meta.url), "utf8");
  const shared = controlActions(protocol, vault);
  const host = readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");
  const admitted = host.match(/const ACTIONS: &\[&str\] = &(\[[^\]]+\]);/u)?.[1];
  if (!admitted) throw new Error("Native control admission declaration could not be inspected");
  const native: unknown = JSON.parse(admitted);
  expect(shared.length).toBeGreaterThan(0);
  expect(new Set(shared).size).toBe(shared.length);
  expect(Array.isArray(native)).toBe(true);
  if (!Array.isArray(native) || !native.every(value => typeof value === "string")) throw new Error("Native actions must be literal names");
  // Retained only for legacy credential-helper migration tests. The service
  // rejects this action, so the native host must not admit it.
  expect(shared.filter(action => action === "vault.import")).toEqual(["vault.import"]);
  expect(native).not.toContain("vault.import");
  expect([...native].sort()).toEqual(shared.filter(action => action !== "vault.import").sort());
});

test("the only deprecated native exclusion fails closed in the control service", () => {
  const source = readFileSync(new URL("../../src/control/service.ts", import.meta.url), "utf8");
  const file = ts.createSourceFile("service.ts", source, ts.ScriptTarget.ESNext, false, ts.ScriptKind.TS);
  const cases: ts.CaseClause[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCaseClause(node) && ts.isStringLiteral(node.expression) && node.expression.text === "vault.import") cases.push(node);
    ts.forEachChild(node, visit);
  };
  visit(file);
  expect(cases).toHaveLength(1);
  const statements = cases[0]?.statements;
  expect(statements).toHaveLength(1);
  const statement = statements?.[0];
  if (!statement || !ts.isThrowStatement(statement) || !ts.isNewExpression(statement.expression)) throw new Error("Deprecated import must unconditionally reject");
  const error = statement.expression;
  expect(ts.isIdentifier(error.expression) && error.expression.text).toBe("ControlError");
  const code = error.arguments?.[0];
  expect(code && ts.isStringLiteral(code) && code.text).toBe("VAULT_IMPORT_REPLACED");
});

test("protocol inspection fails closed when an action could be omitted", () => {
  for (const member of ["AliasRequest", '{ action: string }', '{ action?: "hidden" }', '{ action: "one" | "two" }']) {
    expect(() => controlActions(`type ControlRequest = { action: "snapshot" } | ${member};`)).toThrow();
  }
  expect(() => controlActions('type ControlRequest = { action: "snapshot" } | VaultControlRequest;')).toThrow();
  expect(() => controlActions('type ControlRequest = { action: "snapshot" } | VaultControlRequest;', 'type VaultControlRequest = { action: "vault.lock" } | Hidden;')).toThrow();
  expect(controlActions('type ControlRequest = { action: "snapshot" } | VaultControlRequest;', 'type VaultControlRequest = { action: "vault.lock" } | { action: "vault.grant" };')).toEqual(["snapshot", "vault.lock", "vault.grant"]);
});

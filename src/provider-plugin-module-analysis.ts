import { extname } from "node:path";
import ts from "typescript";

const opaqueModuleLoaderNames = new Set([
  "createRequire",
  "eval",
  "Function",
  "getBuiltinModule",
]);

function hasOneLiteralModuleArgument(node: ts.CallExpression): boolean {
  const [argument] = node.arguments;
  return node.arguments.length === 1
    && argument !== undefined
    && ts.isStringLiteralLike(argument);
}

function propertyLoaderName(
  node: ts.PropertyAccessExpression | ts.ElementAccessExpression,
): string | undefined {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  const argument = node.argumentExpression;
  return argument !== undefined && ts.isStringLiteralLike(argument)
    ? argument.text
    : undefined;
}

function propertyLoaderReference(
  node: ts.PropertyAccessExpression | ts.ElementAccessExpression,
): boolean {
  const name = propertyLoaderName(node);
  if (name === undefined) return false;
  if (opaqueModuleLoaderNames.has(name)) return true;
  if (name !== "require") return false;
  const owner = node.expression;
  return ts.isIdentifier(owner)
    && (
      owner.text === "global"
      || owner.text === "globalThis"
      || owner.text === "mod"
      || owner.text === "module"
    );
}

function isPropertyNameIdentifier(
  node: ts.Identifier,
  parent: ts.Node | undefined,
): boolean {
  if (parent === undefined) return false;
  return (
    ts.isPropertyAccessExpression(parent)
    && parent.name === node
  ) || (
    (
      ts.isPropertyAssignment(parent)
      || ts.isMethodDeclaration(parent)
      || ts.isPropertyDeclaration(parent)
      || ts.isPropertySignature(parent)
      || ts.isMethodSignature(parent)
    )
    && parent.name === node
  );
}

export function providerPluginScriptKind(path: string): ts.ScriptKind {
  const extension = extname(path);
  if (extension === ".tsx") return ts.ScriptKind.TSX;
  if (extension === ".jsx") return ts.ScriptKind.JSX;
  if (extension === ".ts" || extension === ".mts" || extension === ".cts") {
    return ts.ScriptKind.TS;
  }
  return ts.ScriptKind.JS;
}

/**
 * Prove one deliberately small callback-record shape. A private const arrow factory
 * may read an `eval` method supplied by local object literals, possibly through
 * other private factories. It must not accept unknown records, escape as a
 * value, mutate or expose a record, or use a computed/spread callback definition.
 * This is a source-local binding proof, not a package or callback-name exemption.
 */
function localEvalCallbackProof(sourceFile: ts.SourceFile): (node: ts.Node) => boolean {
  const options: ts.CompilerOptions = {
    allowJs: true, noLib: true, noResolve: true,
    target: ts.ScriptTarget.ESNext,
  };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = (file) => file === sourceFile.fileName ? sourceFile : undefined;
  const checker = ts.createProgram([sourceFile.fileName], options, host).getTypeChecker();
  const references = new Map<ts.Symbol, ts.Identifier[]>();
  const collect = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) {
      const symbol = ts.isExportSpecifier(node.parent)
        ? checker.getExportSpecifierLocalTargetSymbol(node.parent)
        : ts.isShorthandPropertyAssignment(node.parent)
          ? checker.getShorthandAssignmentValueSymbol(node.parent)
          : checker.getSymbolAtLocation(node);
      if (symbol !== undefined) {
        const nodes = references.get(symbol) ?? [];
        nodes.push(node);
        references.set(symbol, nodes);
      }
    }
    node.forEachChild(collect);
  };
  collect(sourceFile);

  const parameterOf = (node: ts.Identifier): ts.ParameterDeclaration | undefined => {
    const declarations = checker.getSymbolAtLocation(node)?.declarations;
    return declarations?.length === 1 && ts.isParameter(declarations[0]!)
      ? declarations[0] : undefined;
  };
  const factoryOf = (parameter: ts.ParameterDeclaration): ts.VariableDeclaration | undefined => {
    const factory = parameter.parent;
    // Named function expressions have a second entry binding; ordinary functions
    // also expose the record through arguments. Neither is in this proof shape.
    if (!ts.isArrowFunction(factory)) return undefined;
    const declaration = factory.parent;
    if (!ts.isVariableDeclaration(declaration) || !ts.isIdentifier(declaration.name)
      || declaration.initializer !== factory) return undefined;
    const list = declaration.parent;
    if (!ts.isVariableDeclarationList(list) || (list.flags & ts.NodeFlags.Const) === 0) return undefined;
    const statement = list.parent;
    return ts.isVariableStatement(statement) && statement.parent === sourceFile
      && !statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
      ? declaration : undefined;
  };
  const localRecord = (argument: ts.Expression): boolean => {
    if (!ts.isObjectLiteralExpression(argument)) return false;
    let callbacks = 0;
    for (const property of argument.properties) {
      if (ts.isSpreadAssignment(property) || ts.isGetAccessorDeclaration(property)
        || ts.isSetAccessorDeclaration(property) || property.name === undefined
        || ts.isComputedPropertyName(property.name)) return false;
      if (!ts.isIdentifier(property.name) && !ts.isStringLiteralLike(property.name)) return false;
      if (property.name.text === "__proto__") return false;
      if (property.name.text !== "eval") continue;
      callbacks += 1;
      if (!ts.isMethodDeclaration(property) && !(ts.isPropertyAssignment(property)
        && (ts.isArrowFunction(property.initializer) || ts.isFunctionExpression(property.initializer)))) return false;
    }
    // Missing callbacks are permitted under ordinary Object.prototype semantics.
    // This policy does not sandbox mutated intrinsics or obfuscated JavaScript.
    return callbacks <= 1;
  };
  const cache = new Map<ts.ParameterDeclaration, boolean>();
  const prove = (parameter: ts.ParameterDeclaration): boolean => {
    const cached = cache.get(parameter);
    if (cached !== undefined) return cached;
    const admitted = new Set<ts.ParameterDeclaration>();
    const visiting = new Set<ts.ParameterDeclaration>();
    const inputs = (current: ts.ParameterDeclaration): boolean => {
      if (admitted.has(current)) return true;
      if (visiting.has(current) || admitted.size + visiting.size >= 64
        || !ts.isIdentifier(current.name) || current.initializer !== undefined
        || current.dotDotDotToken !== undefined) return false;
      const declaration = factoryOf(current);
      if (declaration === undefined) return false;
      const factory = current.parent;
      if (!ts.isArrowFunction(factory)) return false;
      const index = factory.parameters.indexOf(current);
      const symbol = checker.getSymbolAtLocation(declaration.name);
      if (symbol === undefined) return false;
      visiting.add(current);
      let calls = 0;
      for (const reference of references.get(symbol) ?? []) {
        if (reference === declaration.name) continue;
        const call = reference.parent;
        if (!ts.isCallExpression(call) || call.expression !== reference
          || call.arguments.some(ts.isSpreadElement)) return false;
        const argument = call.arguments[index];
        if (argument === undefined) return false;
        calls += 1;
        if (localRecord(argument)) continue;
        const forwarded = ts.isIdentifier(argument) ? parameterOf(argument) : undefined;
        if (forwarded === undefined || !inputs(forwarded)) return false;
      }
      visiting.delete(current);
      if (calls === 0) return false;
      admitted.add(current);
      return true;
    };
    let valid = inputs(parameter);
    // Whole-record references may only forward into the proven factory chain.
    // Member reads cannot write, delete, increment, or invoke a foreign method.
    for (const current of admitted) {
      const symbol = checker.getSymbolAtLocation(current.name);
      if (symbol === undefined) { valid = false; break; }
      for (const reference of references.get(symbol) ?? []) {
        if (reference === current.name) continue;
        const parent = reference.parent;
        if ((ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent))
          && parent.expression === reference) {
          let outer: ts.Node = parent;
          while ((ts.isPropertyAccessExpression(outer.parent) || ts.isElementAccessExpression(outer.parent)
            || ts.isParenthesizedExpression(outer.parent) || ts.isAsExpression(outer.parent)
            || ts.isTypeAssertionExpression(outer.parent) || ts.isNonNullExpression(outer.parent)
            || ts.isSatisfiesExpression(outer.parent)) && outer.parent.expression === outer) outer = outer.parent;
          let target = outer;
          while ((ts.isPropertyAssignment(target.parent) && target.parent.initializer === target)
            || ts.isObjectLiteralExpression(target.parent) || ts.isArrayLiteralExpression(target.parent)
            || ts.isSpreadAssignment(target.parent) || ts.isSpreadElement(target.parent)
            || ((ts.isParenthesizedExpression(target.parent) || ts.isAsExpression(target.parent)
              || ts.isTypeAssertionExpression(target.parent) || ts.isNonNullExpression(target.parent)
              || ts.isSatisfiesExpression(target.parent)) && target.parent.expression === target)) target = target.parent;
          const use = target.parent;
          if ((ts.isBinaryExpression(use) && use.left === target
            && use.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
            && use.operatorToken.kind <= ts.SyntaxKind.LastAssignment)
            || ts.isDeleteExpression(use) || ts.isPostfixUnaryExpression(use)
            || ts.isPrefixUnaryExpression(use)
            || ((ts.isForInStatement(use) || ts.isForOfStatement(use)) && use.initializer === target)
            || ((ts.isCallExpression(use) || ts.isNewExpression(use)) && use.expression === target)
            || (ts.isTaggedTemplateExpression(use) && use.tag === target)) valid = false;
          continue;
        }
        if (ts.isCallExpression(parent) && ts.isIdentifier(parent.expression)) {
          const declaration = checker.getSymbolAtLocation(parent.expression)?.valueDeclaration;
          if (declaration !== undefined && ts.isVariableDeclaration(declaration)
            && declaration.initializer !== undefined
            && ts.isArrowFunction(declaration.initializer)) {
            const target = declaration.initializer.parameters[parent.arguments.indexOf(reference)];
            if (target !== undefined && admitted.has(target)) continue;
          }
        }
        valid = false;
      }
    }
    cache.set(parameter, valid);
    return valid;
  };
  return (node) => {
    if ((!ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node))
      || propertyLoaderName(node) !== "eval" || !ts.isIdentifier(node.expression)) return false;
    const parameter = parameterOf(node.expression);
    return parameter !== undefined && prove(parameter);
  };
}

/**
 * Conservatively rejects runtime loading that Bun's literal import scanner
 * cannot bind to an exact dependency edge. Source plugins remain trusted code;
 * this AST policy prevents accidental identity omissions and common aliases,
 * rather than attempting to sandbox deliberately obfuscated JavaScript.
 */
export function hasNonLiteralModuleLoad(source: string, path: string): boolean {
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.ESNext,
    false,
    providerPluginScriptKind(path),
  );
  let callbackProof: ((node: ts.Node) => boolean) | undefined;
  const isLocalCallback = (node: ts.Node): boolean => {
    if ((!ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node))
      || propertyLoaderName(node) !== "eval") return false;
    callbackProof ??= localEvalCallbackProof(sourceFile);
    return callbackProof(node);
  };
  let found = false;
  const visit = (node: ts.Node, parent?: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        found = !hasOneLiteralModuleArgument(node);
        return;
      }
      if (
        ts.isIdentifier(node.expression)
        && node.expression.text === "require"
      ) {
        found = !hasOneLiteralModuleArgument(node);
        return;
      }
      if (
        ts.isIdentifier(node.expression)
        && (
          opaqueModuleLoaderNames.has(node.expression.text)
          || node.expression.text === "Function"
        )
      ) {
        found = true;
        return;
      }
      if (
        (
          ts.isPropertyAccessExpression(node.expression)
          || ts.isElementAccessExpression(node.expression)
        )
        && (
          propertyLoaderName(node.expression) === "require"
          || opaqueModuleLoaderNames.has(
            propertyLoaderName(node.expression) ?? "",
          )
        )
      ) {
        found = true;
        return;
      }
    }
    if (
      ts.isNewExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === "Function"
    ) {
      found = true;
      return;
    }
    if (
      (
        ts.isPropertyAccessExpression(node)
        || ts.isElementAccessExpression(node)
      )
      && propertyLoaderReference(node)
      && !isLocalCallback(node)
    ) {
      found = true;
      return;
    }
    if (
      ts.isIdentifier(node)
      && !isPropertyNameIdentifier(node, parent)
      && (
        node.text === "require"
        || opaqueModuleLoaderNames.has(node.text)
      )
    ) {
      found = true;
      return;
    }
    node.forEachChild((child) => visit(child, node));
  };
  visit(sourceFile);
  return found;
}

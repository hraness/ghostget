/** A bounded JSON reader that also rejects duplicate keys before they can disappear. */
export function readInterfaceJson(text: string, maximumBytes: number): unknown {
  if (typeof text !== "string" || Buffer.byteLength(text) > maximumBytes) {
    throw new Error("interface JSON exceeds its byte limit");
  }
  let cursor = 0;
  let nodes = 0;
  const whitespace = () => { while (/^[\t\n\r ]$/u.test(text[cursor] ?? "")) cursor++; };
  const fail = (): never => { throw new Error("interface JSON is malformed"); };
  const string = (): string => {
    if (text[cursor++] !== '"') return fail();
    const start = cursor - 1;
    while (cursor < text.length) {
      const character = text[cursor++];
      if (character === "\\") { cursor++; continue; }
      if (character === '"') {
        try { return JSON.parse(text.slice(start, cursor)) as string; } catch { return fail(); }
      }
    }
    return fail();
  };
  const value = (depth: number): unknown => {
    if (++nodes > 50_000 || depth > 24) throw new Error("interface JSON exceeds its structural limit");
    whitespace();
    if (text[cursor] === '"') return string();
    if (text[cursor] === "{") {
      cursor++;
      const result: Record<string, unknown> = {};
      const keys = new Set<string>();
      whitespace();
      if (text[cursor] === "}") { cursor++; return result; }
      for (;;) {
        whitespace();
        const key = string();
        if (keys.has(key)) throw new Error("interface JSON repeats an object key");
        if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error("interface JSON contains a reserved object key");
        if (["$ref", "$dynamicRef", "$id", "$schema"].includes(key)) throw new Error("interface JSON references and schema dialect overrides are unsupported");
        keys.add(key);
        whitespace();
        if (text[cursor++] !== ":") return fail();
        result[key] = value(depth + 1);
        whitespace();
        if (text[cursor] === "}") { cursor++; return result; }
        if (text[cursor++] !== ",") return fail();
      }
    }
    if (text[cursor] === "[") {
      cursor++;
      const result: unknown[] = [];
      whitespace();
      if (text[cursor] === "]") { cursor++; return result; }
      for (;;) {
        result.push(value(depth + 1));
        whitespace();
        if (text[cursor] === "]") { cursor++; return result; }
        if (text[cursor++] !== ",") return fail();
      }
    }
    const token = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/u.exec(text.slice(cursor))?.[0];
    if (token === undefined) return fail();
    cursor += token.length;
    const parsed: unknown = JSON.parse(token);
    if (typeof parsed === "number" && !Number.isFinite(parsed)) return fail();
    return parsed;
  };
  const parsed = value(0);
  whitespace();
  if (cursor !== text.length) return fail();
  return parsed;
}

export function interfaceRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

export function interfaceKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[], label: string): void {
  if (required.some((key) => !Object.hasOwn(value, key)) || Object.keys(value).some((key) => !required.includes(key) && !optional.includes(key))) {
    throw new Error(`${label} contains missing or unsupported fields`);
  }
}

export function interfaceText(value: unknown, label: string, maximum = 512): string {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
    throw new Error(`${label} must be bounded text`);
  }
  return value;
}

export function interfaceId(value: unknown): string {
  const id = interfaceText(value, "interface identifier", 48);
  if (!/^[a-z][a-z0-9-]*$/u.test(id)) throw new Error("interface identifier must be lowercase kebab-case");
  return id;
}

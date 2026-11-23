// A2UI data-binding helpers: literals and {"@path": "/json/pointer"}
// bindings resolved against a surface's data model (RFC 6901 pointers).

/** Resolves an RFC 6901 JSON Pointer ("" or "/a/0/b") against the data model. */
export function resolvePath(model: unknown, pointer: string): unknown {
  if (!pointer || pointer === '/') return model;
  let current: unknown = model;
  for (const raw of pointer.replace(/^\//, '').split('/')) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (Array.isArray(current)) current = current[Number(key)];
    else if (current && typeof current === 'object') current = (current as Record<string, unknown>)[key];
    else return undefined;
    if (current === undefined) return undefined;
  }
  return current;
}

/** Resolves literals and {"@path": ...} bindings (recursively, for action contexts). */
export function resolveValue(value: unknown, model: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => resolveValue(item, model));
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record['@path'] === 'string') return resolvePath(model, record['@path']);
    return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, resolveValue(item, model)]));
  }
  return value;
}

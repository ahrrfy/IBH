/**
 * Contract / policy template renderer (T52).
 *
 * Resolves `{{path.to.field}}` placeholders against a provided context object
 * by walking dot-paths. Strict by default — an unknown path throws so we never
 * ship a contract containing a literal `{{employee.name}}` to an employee.
 *
 * Pure / deterministic / no I/O — safe to call inside a Prisma transaction
 * and easy to unit-test.
 */

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

export interface RenderResult {
  body: string;
  /** All placeholder paths actually present in the template. */
  fields: string[];
}

/**
 * Render `body` by replacing every `{{path}}` with the resolved value from
 * `ctx`. Throws on unknown paths; values are coerced via `String()`.
 */
export function renderTemplate(body: string, ctx: Record<string, unknown>): RenderResult {
  const fields: string[] = [];
  const seen = new Set<string>();

  const out = body.replace(PLACEHOLDER_RE, (_match, path: string) => {
    if (!seen.has(path)) {
      seen.add(path);
      fields.push(path);
    }
    const value = resolvePath(ctx, path);
    if (value === undefined || value === null) {
      throw new Error(`MERGE_FIELD_MISSING: ${path}`);
    }
    return String(value);
  });

  return { body: out, fields };
}

/** Resolve `a.b.c` by walking the object graph. Returns `undefined` if missing. */
export function resolvePath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/** Extract every `{{path}}` placeholder declared in `body` (deduped, ordered). */
export function extractFields(body: string): string[] {
  const fields: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  PLACEHOLDER_RE.lastIndex = 0;
  while ((m = PLACEHOLDER_RE.exec(body)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      fields.push(m[1]);
    }
  }
  return fields;
}

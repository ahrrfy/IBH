import { renderTemplate, extractFields, resolvePath } from '../template-renderer';

/**
 * Merge-field rendering — proves no `{{}}` placeholders survive in output and
 * that strict mode rejects unknown paths (we never want a half-rendered
 * contract going to an employee).
 */
describe('renderTemplate (T52)', () => {
  const ctx = {
    employee: { name: 'Ali', nationalId: '1990' },
    salary: { amount: '750000.000', currency: 'IQD' },
    contract: { no: 'C-001', startDate: '2026-05-01' },
  };

  it('replaces all placeholders and reports the field list', () => {
    const tpl = 'Hello {{employee.name}}, salary {{salary.amount}} {{salary.currency}}';
    const r = renderTemplate(tpl, ctx);
    expect(r.body).toBe('Hello Ali, salary 750000.000 IQD');
    expect(r.fields).toEqual(['employee.name', 'salary.amount', 'salary.currency']);
  });

  it('throws on missing path (no half-rendered contract)', () => {
    expect(() => renderTemplate('Hi {{employee.unknown}}', ctx)).toThrow(/MERGE_FIELD_MISSING/);
  });

  it('extractFields dedupes and preserves order', () => {
    const fields = extractFields('A {{x.y}} B {{x.y}} C {{a.b}}');
    expect(fields).toEqual(['x.y', 'a.b']);
  });

  it('resolvePath walks dot-paths and stops on missing intermediate', () => {
    expect(resolvePath({ a: { b: 1 } }, 'a.b')).toBe(1);
    expect(resolvePath({ a: { b: 1 } }, 'a.b.c')).toBeUndefined();
    expect(resolvePath({}, 'a.b')).toBeUndefined();
  });
});

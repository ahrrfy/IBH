import { ArabicTextTransformer } from '../transformers/arabic-text.transformer';
import { DateTransformer } from '../transformers/date.transformer';
import { PhoneTransformer } from '../transformers/phone.transformer';

describe('ArabicTextTransformer', () => {
  const t = new ArabicTextTransformer();

  it('removes tatweel', () => {
    expect(t.transform('محـــمد')).toBe('محمد');
  });

  it('normalizes hamza variants to plain alef', () => {
    expect(t.transform('إلكترونيات')).toBe('الكترونيات');
    expect(t.transform('أحمد')).toBe('احمد');
    expect(t.transform('آذار')).toBe('اذار');
  });

  it('converts Arabic-Indic numerals to Western', () => {
    expect(t.transform('٢٠٢٦')).toBe('2026');
    expect(t.transform('السعر ٥٠٠٠')).toBe('السعر 5000');
  });

  it('collapses multiple whitespace', () => {
    expect(t.transform('hello   world')).toBe('hello world');
  });

  it('handles non-string input gracefully', () => {
    expect(t.transform(null as unknown as string)).toBe(null);
    expect(t.transform(undefined as unknown as string)).toBe(undefined);
  });
});

describe('DateTransformer', () => {
  const t = new DateTransformer();

  it('parses YYYY-MM-DD ISO', () => {
    const d = t.transform('2026-04-30', 'YYYY-MM-DD');
    expect(d).toBeInstanceOf(Date);
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(3); // April = 3
    expect(d?.getDate()).toBe(30);
  });

  it('parses DD/MM/YYYY (Iraqi convention)', () => {
    const d = t.transform('30/04/2026', 'DD/MM/YYYY');
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(3);
    expect(d?.getDate()).toBe(30);
  });

  it('auto-detects DD/MM/YYYY when day > 12', () => {
    const d = t.transform('15/04/2026', 'auto');
    expect(d?.getDate()).toBe(15);
    expect(d?.getMonth()).toBe(3);
  });

  it('auto-detects MM/DD/YYYY when month > 12', () => {
    const d = t.transform('04/15/2026', 'auto');
    expect(d?.getDate()).toBe(15);
    expect(d?.getMonth()).toBe(3);
  });

  it('returns null for invalid dates', () => {
    expect(t.transform('not-a-date', 'auto')).toBeNull();
    expect(t.transform('', 'auto')).toBeNull();
    expect(t.transform(null, 'auto')).toBeNull();
  });

  it('passes through Date objects unchanged', () => {
    const d = new Date(2026, 3, 30);
    expect(t.transform(d)).toBe(d);
  });
});

describe('PhoneTransformer', () => {
  const t = new PhoneTransformer();

  it('converts Iraqi 07xx to +964 format', () => {
    expect(t.transform('07701234567')).toBe('+9647701234567');
    expect(t.transform('07801234567')).toBe('+9647801234567');
  });

  it('strips formatting characters', () => {
    expect(t.transform('077-0123-4567')).toBe('+9647701234567');
    expect(t.transform('(077) 0123 4567')).toBe('+9647701234567');
  });

  it('converts Arabic-Indic digits in phone numbers', () => {
    expect(t.transform('٠٧٧٠١٢٣٤٥٦٧')).toBe('+9647701234567');
  });

  it('handles already-formatted +964 numbers', () => {
    expect(t.transform('+9647701234567')).toBe('+9647701234567');
  });

  it('returns null for empty input', () => {
    expect(t.transform('')).toBeNull();
    expect(t.transform(null)).toBeNull();
    expect(t.transform(undefined)).toBeNull();
  });
});

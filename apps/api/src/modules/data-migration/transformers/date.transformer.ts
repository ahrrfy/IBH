import { Injectable } from '@nestjs/common';

export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD' | 'auto';

@Injectable()
export class DateTransformer {
  transform(value: unknown, format: DateFormat = 'auto'): Date | null {
    if (value instanceof Date) return value;
    if (!value) return null;

    const str = String(value).trim();
    if (!str) return null;

    if (format === 'auto') return this.autoDetect(str);
    return this.parseWithFormat(str, format);
  }

  private autoDetect(str: string): Date | null {
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      return this.parseWithFormat(str, 'YYYY-MM-DD');
    }

    const parts = str.split(/[/\-.]/).map(Number);
    if (parts.length >= 3) {
      const [a, b, c] = parts;
      if (a > 12 && b <= 12) return this.buildDate(c, b, a);
      if (b > 12 && a <= 12) return this.buildDate(c, a, b);
      // Iraqi convention: DD/MM/YYYY
      return this.buildDate(c, b, a);
    }

    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  private parseWithFormat(str: string, format: DateFormat): Date | null {
    const parts = str.split(/[/\-.T\s]/).map(Number);
    if (parts.length < 3) return null;

    switch (format) {
      case 'DD/MM/YYYY': return this.buildDate(parts[2], parts[1], parts[0]);
      case 'MM/DD/YYYY': return this.buildDate(parts[2], parts[0], parts[1]);
      case 'YYYY-MM-DD': return this.buildDate(parts[0], parts[1], parts[2]);
      default: return null;
    }
  }

  private buildDate(year: number, month: number, day: number): Date | null {
    if (year < 100) year += 2000;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const d = new Date(year, month - 1, day);
    return isNaN(d.getTime()) ? null : d;
  }
}

/**
 * Formatting helpers for the Iraqi storefront (IQD + Arabic dates).
 */

export function formatIqd(n: number | string | null | undefined): string {
  const num = typeof n === 'string' ? Number(n) : n;
  if (num == null || Number.isNaN(num)) return '0 د.ع';
  const rounded = Math.round(num);
  const withSep = rounded.toLocaleString('en-US'); // 15,000
  return `${withSep} د.ع`;
}

export function formatDate(d: string | number | Date | null | undefined): string {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('ar-IQ', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function formatDateTime(d: string | number | Date | null | undefined): string {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('ar-IQ', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

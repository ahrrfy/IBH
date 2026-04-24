// Arabic-localized formatting helpers.

const IQD_FORMATTER = new Intl.NumberFormat('ar-IQ', {
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

const DATE_FORMATTER = new Intl.DateTimeFormat('ar-IQ', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const DATETIME_FORMATTER = new Intl.DateTimeFormat('ar-IQ', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const PCT_FORMATTER = new Intl.NumberFormat('ar-IQ', {
  style: 'percent',
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});

export function formatIqd(n: number | string | null | undefined): string {
  const num = typeof n === 'string' ? Number(n) : n;
  if (num === null || num === undefined || Number.isNaN(num)) return '—';
  return `${IQD_FORMATTER.format(num as number)} د.ع`;
}

export function formatNumber(n: number | string | null | undefined): string {
  const num = typeof n === 'string' ? Number(n) : n;
  if (num === null || num === undefined || Number.isNaN(num)) return '—';
  return IQD_FORMATTER.format(num as number);
}

export function formatDate(d: Date | string | null | undefined, withTime = false): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '—';
  return (withTime ? DATETIME_FORMATTER : DATE_FORMATTER).format(date);
}

export function formatPct(n: number | null | undefined, fractional = false): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return PCT_FORMATTER.format(fractional ? n : n / 100);
}

export type StatusKey =
  | 'draft'
  | 'approved'
  | 'posted'
  | 'cancelled'
  | 'paid'
  | 'partial'
  | 'unpaid'
  | 'open'
  | 'closed'
  | 'confirmed'
  | 'pending'
  | 'rejected'
  | 'matched'
  | 'unmatched'
  | 'partial_match'
  | 'active'
  | 'inactive'
  | 'new'
  | 'qualified'
  | 'won'
  | 'lost'
  | (string & {});

const STATUS_LABELS_AR: Record<string, string> = {
  draft: 'مسودة',
  approved: 'معتمد',
  posted: 'مُرحَّل',
  cancelled: 'ملغى',
  paid: 'مدفوع',
  partial: 'جزئي',
  unpaid: 'غير مدفوع',
  open: 'مفتوح',
  closed: 'مغلق',
  confirmed: 'مؤكد',
  pending: 'قيد الانتظار',
  rejected: 'مرفوض',
  matched: 'مطابق',
  unmatched: 'غير مطابق',
  partial_match: 'مطابقة جزئية',
  active: 'نشط',
  inactive: 'غير نشط',
  new: 'جديد',
  qualified: 'مؤهل',
  won: 'مكسوب',
  lost: 'مفقود',
};

export function formatStatus(status: string | null | undefined): string {
  if (!status) return '—';
  return STATUS_LABELS_AR[status.toLowerCase()] ?? status;
}

export function toCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = columns.map(escape).join(',');
  const body = rows.map((r) => columns.map((c) => escape(r[c])).join(',')).join('\n');
  return `${header}\n${body}`;
}

export function downloadCsv(filename: string, csv: string) {
  if (typeof window === 'undefined') return;
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

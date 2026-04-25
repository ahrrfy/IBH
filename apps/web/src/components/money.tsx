/**
 * Money — display monetary amount with Iraqi accounting semantics.
 *
 * Direction conventions:
 *   - "debit"   = مدين  = له علينا  = AR (asset, they owe us)        → green
 *   - "credit"  = دائن  = لنا عليه  = AP (liability, we owe them)    → red
 *   - "neutral" = no direction (sales total, KPI, etc.)              → default
 *   - "auto"    = pick by sign: positive=debit, negative=credit
 *
 * All numbers render with:
 *   - Latin digits ("lnum")
 *   - tabular spacing ("tnum") so columns align
 *   - thousand separators (1,234,567)
 *   - dir="ltr" so multi-digit reads left-to-right
 */
import { cn } from '@/lib/cn';

export type MoneyDirection = 'debit' | 'credit' | 'neutral' | 'auto';

export interface MoneyProps {
  amount: number | string | null | undefined;
  currency?: string;          // default: د.ع
  direction?: MoneyDirection; // default: 'neutral'
  decimals?: number;          // default: 0
  showSign?: boolean;         // show +/- prefix (default false)
  showLabel?: boolean;        // show "مدين"/"دائن" tag next to amount
  size?: 'xs' | 'sm' | 'base' | 'lg' | 'xl';
  className?: string;
}

export function Money({
  amount,
  currency = 'د.ع',
  direction = 'neutral',
  decimals = 0,
  showSign = false,
  showLabel = false,
  size = 'sm',
  className,
}: MoneyProps) {
  const num = typeof amount === 'string' ? Number(amount) : amount;
  if (num === null || num === undefined || Number.isNaN(num)) {
    return <span className={cn('text-slate-400', className)}>—</span>;
  }

  // Resolve auto-direction
  const resolved: MoneyDirection =
    direction === 'auto'
      ? num > 0 ? 'debit' : num < 0 ? 'credit' : 'neutral'
      : direction;

  const formatted = Math.abs(num).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  const sign = showSign ? (num > 0 ? '+' : num < 0 ? '−' : '') : '';

  const sizeClass = {
    xs:   'text-xs',
    sm:   'text-sm',
    base: 'text-base',
    lg:   'text-lg',
    xl:   'text-2xl font-bold',
  }[size];

  const colorClass = {
    debit:   'text-emerald-700',
    credit:  'text-rose-700',
    neutral: 'text-slate-900',
    auto:    'text-slate-900',
  }[resolved];

  const tag = resolved === 'debit'
    ? { lab: 'له علينا', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    : resolved === 'credit'
    ? { lab: 'لنا عليه',  cls: 'bg-rose-50 text-rose-700 border-rose-200' }
    : null;

  return (
    <span className={cn('inline-flex items-center gap-1.5 num-latin font-mono', sizeClass, className)}>
      <span className={cn('font-semibold', colorClass)}>
        {sign}{formatted}
      </span>
      <span className="text-[0.7em] text-slate-500 font-normal">{currency}</span>
      {showLabel && tag && (
        <span className={cn('text-[10px] px-1.5 py-0 rounded border font-sans font-medium', tag.cls)}>
          {tag.lab}
        </span>
      )}
    </span>
  );
}

/**
 * Formats a number with thousand separators and Latin digits.
 * Use directly when you can't use the <Money /> component.
 */
export function fmtAmount(n: number | string | null | undefined, decimals = 0): string {
  const num = typeof n === 'string' ? Number(n) : n;
  if (num === null || num === undefined || Number.isNaN(num)) return '—';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

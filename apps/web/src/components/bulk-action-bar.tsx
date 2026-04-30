'use client';

import { type ReactNode } from 'react';
import { X } from 'lucide-react';

interface BulkActionBarProps {
  count: number;
  onClear: () => void;
  children: ReactNode;
}

export function BulkActionBar({ count, onClear, children }: BulkActionBarProps) {
  if (count === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 left-6 z-40 mx-auto max-w-2xl animate-slide-up" dir="rtl">
      <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-5 py-3 shadow-lifted">
        <span className="text-sm font-medium text-brand-800">
          تم تحديد <span className="num-latin font-bold">{count}</span> سجل
        </span>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          {children}
        </div>

        <button
          onClick={onClear}
          className="rounded-lg p-1.5 text-brand-600 hover:bg-brand-100"
          title="إلغاء التحديد"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

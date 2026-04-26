'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

export default function NewPeriodPage() {
  const router = useRouter();
  // Avoid useSearchParams — requires <Suspense> in Next.js 15, breaks prerender
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search);
    if (p.get('year'))  setYear(Number(p.get('year')));
    if (p.get('month')) setMonth(Number(p.get('month')));
  }, []);

  const start = useMutation({
    mutationFn: () =>
      api<any>('/finance/periods/close/start', {
        method: 'POST',
        body: { year, month },
      }),
    onSuccess: (status: any) => {
      if (status?.periodId) {
        router.replace(`/finance/periods/${status.periodId}/close`);
      } else {
        router.replace('/finance/periods');
      }
    },
  });

  useEffect(() => {
    if (start.isIdle) start.mutate();
  }, [start]);

  return (
    <div className="p-6 max-w-md text-center">
      <p className="text-sm text-slate-600">جاري إنشاء فترة الإقفال…</p>
      {start.error && (
        <p className="mt-3 text-sm text-rose-600">
          {(start.error as any)?.messageAr ?? 'تعذَّر بدء الإقفال'}
        </p>
      )}
    </div>
  );
}

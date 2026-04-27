/**
 * T63 — Audit log page (super-admin).
 *
 * Paginated list of LicenseEvent rows across all tenants. Each row includes
 * the event type, target subscription, and timestamp. Event payload is
 * shown collapsed; click to expand.
 */
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';

interface LicenseEvent {
  id: string;
  subscriptionId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
  createdBy: string | null;
}

const PAGE_SIZE = 50;

export default function AuditLogPage() {
  const [page, setPage] = useState(0);
  const skip = page * PAGE_SIZE;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-licensing', 'audit', page],
    queryFn: () =>
      api<{ items: LicenseEvent[]; total: number }>('/admin/licensing/audit', {
        method: 'GET',
        query: { skip, take: PAGE_SIZE },
      }),
  });

  const total = data?.total ?? 0;
  const items = data?.items ?? [];
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  return (
    <div className="p-6 space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">سجل أحداث الترخيص</h1>
        <p className="text-sm text-slate-500 mt-1">{total} حدث</p>
      </header>

      {isLoading ? (
        <div className="text-slate-500">جارٍ التحميل…</div>
      ) : error ? (
        <div className="space-y-2">
          <p className="text-red-600">تعذّر تحميل السجل.</p>
          <button onClick={() => refetch()} className="btn-secondary btn-sm">
            إعادة المحاولة
          </button>
        </div>
      ) : (
        <>
          <div className="border border-slate-200 rounded-lg bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="text-start px-4 py-2 font-semibold">الحدث</th>
                  <th className="text-start px-4 py-2 font-semibold">الاشتراك</th>
                  <th className="text-start px-4 py-2 font-semibold">التاريخ</th>
                  <th className="text-start px-4 py-2 font-semibold">التفاصيل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((ev) => (
                  <tr key={ev.id}>
                    <td className="px-4 py-2 font-medium text-slate-800">{ev.eventType}</td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/super-admin/licensing/tenants/${ev.subscriptionId}`}
                        className="text-sky-700 hover:underline"
                      >
                        {ev.subscriptionId.slice(-8)}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-slate-600">{formatDate(ev.createdAt, true)}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      <details>
                        <summary className="cursor-pointer">عرض</summary>
                        <pre className="mt-1 p-2 bg-slate-50 rounded overflow-x-auto">
                          {JSON.stringify(ev.payload, null, 2)}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))}
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      لا توجد أحداث.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm">
            <button
              className="btn-secondary btn-sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              السابق
            </button>
            <span className="text-slate-600">
              صفحة {page + 1} من {lastPage + 1}
            </span>
            <button
              className="btn-secondary btn-sm"
              disabled={page >= lastPage}
              onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
            >
              التالي
            </button>
          </div>
        </>
      )}
    </div>
  );
}

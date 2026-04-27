'use client';

/**
 * POS Sync Conflict Review — I003
 *
 * Manager screen to review and resolve POS offline sync conflicts.
 * The receipt is ALWAYS posted (business continuity); this UI is for documentation.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

type Resolution =
  | 'pending_review'
  | 'auto_accepted'
  | 'manager_accepted'
  | 'manager_rejected';

type ConflictType = 'price_mismatch' | 'insufficient_stock' | 'product_inactive';

interface PosConflict {
  id: string;
  receiptId: string;
  conflictType: ConflictType;
  variantId: string | null;
  posValue: string;
  serverValue: string;
  resolution: Resolution;
  notes: string | null;
  createdAt: string;
  receipt: { number: string; totalIqd: string; createdAt: string };
}

interface ConflictsResponse {
  items: PosConflict[];
  total: number;
  page: number;
  pageSize: number;
}

const CONFLICT_TYPE_LABELS: Record<ConflictType, string> = {
  price_mismatch: 'تغيير السعر',
  insufficient_stock: 'نقص المخزون',
  product_inactive: 'منتج غير نشط',
};

const RESOLUTION_LABELS: Record<Resolution, string> = {
  pending_review: 'قيد المراجعة',
  auto_accepted: 'مقبول تلقائياً',
  manager_accepted: 'مقبول من المدير',
  manager_rejected: 'مرفوض من المدير',
};

const TYPE_BADGE_CLASS: Record<ConflictType, string> = {
  price_mismatch: 'bg-amber-100 text-amber-800',
  insufficient_stock: 'bg-red-100 text-red-800',
  product_inactive: 'bg-gray-100 text-gray-800',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ar-IQ', { dateStyle: 'short', timeStyle: 'short' });
}

function formatIqd(raw: string) {
  const n = Number(raw);
  return isNaN(n) ? raw : `${n.toLocaleString('ar-IQ')} د.ع`;
}

interface ResolveDialogProps {
  conflict: PosConflict | null;
  onClose: () => void;
  onResolve: (id: string, resolution: 'manager_accepted' | 'manager_rejected', notes: string) => void;
  isLoading: boolean;
}

function ResolveDialog({ conflict, onClose, onResolve, isLoading }: ResolveDialogProps) {
  const [notes, setNotes] = useState('');
  if (!conflict) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold">مراجعة تعارض الفاتورة {conflict.receipt.number}</h2>
        <p className="mt-1 text-sm text-gray-600">
          نوع التعارض: {CONFLICT_TYPE_LABELS[conflict.conflictType]}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-4 rounded border p-3 text-sm">
          <div>
            <span className="font-medium text-gray-600">قيمة الكاشير (POS):</span>
            <p className="mt-1 font-mono">{conflict.posValue}</p>
          </div>
          <div>
            <span className="font-medium text-gray-600">قيمة الخادم:</span>
            <p className="mt-1 font-mono">{conflict.serverValue}</p>
          </div>
        </div>

        <div className="mt-4 rounded bg-amber-50 p-3 text-sm text-amber-800">
          ⚠️ الفاتورة تم ترحيلها بالفعل. قبولك أو رفضك هنا للتوثيق فقط — لا يلغي الفاتورة.
        </div>

        <div className="mt-4">
          <label htmlFor="resolve-notes" className="block text-sm font-medium">
            ملاحظات المدير (اختياري)
          </label>
          <textarea
            id="resolve-notes"
            className="mt-1 w-full rounded border border-gray-300 p-2 text-sm"
            placeholder="أضف أي ملاحظة للتوضيح..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="rounded border px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
            onClick={onClose}
            disabled={isLoading}
          >
            إلغاء
          </button>
          <button
            type="button"
            className="rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
            onClick={() => onResolve(conflict.id, 'manager_rejected', notes)}
            disabled={isLoading}
          >
            رفض
          </button>
          <button
            type="button"
            className="rounded bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50"
            onClick={() => onResolve(conflict.id, 'manager_accepted', notes)}
            disabled={isLoading}
          >
            قبول
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PosConflictsPage() {
  const queryClient = useQueryClient();
  const [resolutionFilter, setResolutionFilter] = useState<string>('pending_review');
  const [page, setPage] = useState(1);
  const [selectedConflict, setSelectedConflict] = useState<PosConflict | null>(null);

  const { data, isLoading, isError } = useQuery<ConflictsResponse>({
    queryKey: ['pos-conflicts', resolutionFilter, page],
    queryFn: () =>
      api<ConflictsResponse>(
        `/pos/conflicts?resolution=${resolutionFilter}&page=${page}&pageSize=25`,
      ),
  });

  const resolveMutation = useMutation({
    mutationFn: ({
      id,
      resolution,
      notes,
    }: {
      id: string;
      resolution: 'manager_accepted' | 'manager_rejected';
      notes: string;
    }) =>
      api(`/pos/conflicts/${id}/resolve`, {
        method: 'POST',
        body: { resolution, notes: notes || undefined },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-conflicts'] });
      setSelectedConflict(null);
    },
  });

  const pendingCount = resolutionFilter === 'pending_review' ? (data?.total ?? 0) : undefined;

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">تعارضات المزامنة — POS</h1>
          <p className="text-sm text-gray-600">
            فواتير الكاشير المتعارضة مع بيانات الخادم أثناء المزامنة
          </p>
        </div>
        {pendingCount !== undefined && pendingCount > 0 && (
          <span className="rounded bg-red-600 px-3 py-1 text-sm font-medium text-white">
            {pendingCount} قيد المراجعة
          </span>
        )}
      </div>

      <div className="rounded-lg border bg-white p-4">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium">حالة المراجعة:</label>
          <select
            className="rounded border border-gray-300 px-3 py-1.5 text-sm"
            value={resolutionFilter}
            onChange={(e) => {
              setResolutionFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="pending_review">قيد المراجعة</option>
            <option value="auto_accepted">مقبول تلقائياً</option>
            <option value="manager_accepted">مقبول من المدير</option>
            <option value="manager_rejected">مرفوض</option>
          </select>
        </div>
      </div>

      <div className="rounded-lg border bg-white">
        {isLoading ? (
          <div className="py-12 text-center text-gray-500">جاري التحميل...</div>
        ) : isError ? (
          <div className="py-12 text-center text-red-600">فشل تحميل البيانات</div>
        ) : !data?.items.length ? (
          <div className="py-12 text-center text-gray-500">لا توجد تعارضات في هذه الفئة</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-right">
              <tr>
                <th className="p-3">الفاتورة</th>
                <th className="p-3">نوع التعارض</th>
                <th className="p-3">قيمة الكاشير</th>
                <th className="p-3">قيمة الخادم</th>
                <th className="p-3">الحالة</th>
                <th className="p-3">التاريخ</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.items.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="p-3">
                    <div className="font-medium">{c.receipt.number}</div>
                    <div className="text-xs text-gray-500">{formatIqd(c.receipt.totalIqd)}</div>
                  </td>
                  <td className="p-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${TYPE_BADGE_CLASS[c.conflictType]}`}
                    >
                      {CONFLICT_TYPE_LABELS[c.conflictType]}
                    </span>
                  </td>
                  <td className="max-w-[160px] truncate p-3 font-mono text-xs">{c.posValue}</td>
                  <td className="max-w-[160px] truncate p-3 font-mono text-xs">{c.serverValue}</td>
                  <td className="p-3 text-xs">{RESOLUTION_LABELS[c.resolution]}</td>
                  <td className="p-3 text-xs text-gray-500">{formatDate(c.createdAt)}</td>
                  <td className="p-3">
                    {c.resolution === 'pending_review' && (
                      <button
                        type="button"
                        className="rounded border px-3 py-1 text-xs hover:bg-gray-100"
                        onClick={() => setSelectedConflict(c)}
                      >
                        مراجعة
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>
            يعرض {(page - 1) * data.pageSize + 1}–
            {Math.min(page * data.pageSize, data.total)} من {data.total}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded border px-3 py-1 hover:bg-gray-50 disabled:opacity-50"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              السابق
            </button>
            <button
              type="button"
              className="rounded border px-3 py-1 hover:bg-gray-50 disabled:opacity-50"
              onClick={() => setPage((p) => p + 1)}
              disabled={page * data.pageSize >= data.total}
            >
              التالي
            </button>
          </div>
        </div>
      )}

      <ResolveDialog
        conflict={selectedConflict}
        onClose={() => setSelectedConflict(null)}
        onResolve={(id, resolution, notes) => resolveMutation.mutate({ id, resolution, notes })}
        isLoading={resolveMutation.isPending}
      />
    </div>
  );
}

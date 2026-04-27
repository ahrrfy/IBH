'use client';

/**
 * Contract detail (T52) — shows the rendered body and a button to download
 * the server-generated PDF (`/hr/contracts/:id/pdf`).
 */
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api, getToken } from '@/lib/api';

type Contract = {
  id: string;
  contractNo: string;
  status: string;
  startDate: string;
  endDate: string | null;
  salaryIqd: string;
  renderedBody: string;
  bodyHash: string;
  signedAt: string | null;
};

export default function ContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({
    queryKey: ['hr', 'contract', id],
    queryFn: () => api<Contract>(`/hr/contracts/${id}`),
    enabled: !!id,
  });

  if (q.isLoading) return <div className="p-6">جاري التحميل…</div>;
  if (q.isError || !q.data) return <div className="p-6 text-rose-700">تعذّر تحميل العقد.</div>;

  const c = q.data;
  const pdfUrl = `/api/v1/hr/contracts/${c.id}/pdf`;

  const downloadPdf = async () => {
    const token = getToken();
    const r = await fetch(pdfUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!r.ok) {
      alert('تعذّر توليد الـ PDF');
      return;
    }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contract-${c.contractNo}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">عقد {c.contractNo}</h1>
          <p className="text-sm text-slate-500">الحالة: {c.status}</p>
        </div>
        <button
          className="rounded bg-blue-600 px-4 py-2 text-white"
          onClick={downloadPdf}
        >
          تحميل PDF
        </button>
      </header>

      <div className="rounded border bg-white p-4 text-sm">
        <div className="mb-2 grid grid-cols-3 gap-2 text-xs text-slate-600">
          <span>البداية: {c.startDate?.slice(0, 10)}</span>
          <span>النهاية: {c.endDate?.slice(0, 10) ?? '—'}</span>
          <span>الراتب: {c.salaryIqd} IQD</span>
        </div>
        <pre dir="rtl" className="whitespace-pre-wrap font-sans">
          {c.renderedBody}
        </pre>
        <div className="mt-3 break-all font-mono text-[10px] text-slate-400">
          hash: {c.bodyHash}
        </div>
      </div>
    </div>
  );
}

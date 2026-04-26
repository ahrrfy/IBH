'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { formatDate } from '@/lib/format';
import { Clock, UserCheck, Calendar, ArrowLeftRight } from 'lucide-react';

const SOURCE_LABELS_AR: Record<string, string> = {
  zkteco:           'جهاز بصمة',
  mobile_geofence:  'موبايل (جغرافي)',
  manual:           'يدوي',
  face_recognition: 'تعرّف وجه',
};

function formatHHmm(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

export default function AttendancePage() {
  const today = new Date();
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [employeeId, setEmployeeId] = useState('');

  const { data: employees } = useQuery({ queryKey: ['employees'], queryFn: () => api<any>('/hr/employees') });
  const empList: any[] = Array.isArray(employees) ? employees : employees?.items ?? [];

  const { data: report, isLoading, error, refetch } = useQuery({
    queryKey: ['attendance-monthly', year, month, employeeId],
    queryFn: () =>
      api<any>(
        `/hr/attendance/report/monthly?year=${year}&month=${month}${employeeId ? `&employeeId=${employeeId}` : ''}`,
      ),
  });

  const isSingle = !!employeeId;
  const records: any[] = useMemo(() => {
    if (!report) return [];
    if (isSingle) return report.records ?? [];
    if (Array.isArray(report)) return report.flatMap((r: any) => r.records ?? []);
    return [];
  }, [report, isSingle]);

  const summary = isSingle && report ? report : null;

  return (
    <div className="p-6 space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <UserCheck className="h-6 w-6 text-sky-700" />
            الحضور والانصراف
          </h1>
          <p className="text-sm text-slate-500 mt-1">{records.length} سجل لشهر {year}/{String(month).padStart(2, '0')}</p>
        </div>
        <Link href="/hr/attendance/check-in" className="btn-primary btn-sm">
          <Clock className="h-3.5 w-3.5" />
          تسجيل حضور / انصراف
        </Link>
      </header>

      <div className="bg-white border border-slate-200 rounded-lg p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="الموظف">
          <select className="input" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">— كل الموظفين —</option>
            {empList.map((e: any) => (
              <option key={e.id} value={e.id}>
                {e.nameAr ?? e.fullNameAr ?? e.firstName} {e.code ? `(${e.code})` : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="السنة">
          <input
            type="number"
            className="input num-latin"
            min={2020}
            max={2100}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            dir="ltr"
          />
        </Field>
        <Field label="الشهر">
          <select className="input num-latin" value={month} onChange={(e) => setMonth(Number(e.target.value))} dir="ltr">
            {Array.from({ length: 12 }).map((_, i) => (
              <option key={i + 1} value={i + 1}>
                {String(i + 1).padStart(2, '0')}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="أيام الحضور" value={summary.daysPresent} />
          <Stat label="أيام الغياب" value={summary.daysAbsent} kind="warn" />
          <Stat label="أيام الإجازة" value={summary.daysLeave} />
          <Stat label="إجمالي الساعات" value={Number(summary.totalHours).toFixed(1)} />
          <Stat label="دقائق التأخير" value={summary.totalLateMinutes} kind="warn" />
        </div>
      )}

      <DataTable
        columns={[
          { key: 'date',     header: 'التاريخ',  accessor: (r: any) => <span className="num-latin font-mono text-xs">{formatDate(r.date)}</span> },
          { key: 'employee', header: 'الموظف',   accessor: (r: any) => r.employee?.nameAr ?? r.employee?.fullNameAr ?? r.employeeId },
          { key: 'in',       header: 'دخول',     accessor: (r: any) => <span className="num-latin font-mono">{formatHHmm(r.checkInAt)}</span> },
          { key: 'out',      header: 'خروج',     accessor: (r: any) => <span className="num-latin font-mono">{formatHHmm(r.checkOutAt)}</span> },
          { key: 'hours',    header: 'ساعات',    accessor: (r: any) => <span className="num-latin">{r.hoursWorked != null ? Number(r.hoursWorked).toFixed(2) : '—'}</span>, align: 'end' },
          { key: 'late',     header: 'تأخير',    accessor: (r: any) => <span className="num-latin">{r.lateMinutes ? `${r.lateMinutes} د` : '—'}</span>, align: 'end' },
          { key: 'source',   header: 'المصدر',   accessor: (r: any) => SOURCE_LABELS_AR[r.checkInSource] ?? r.checkInSource ?? '—' },
          {
            key: 'state', header: 'الحالة',
            accessor: (r: any) => {
              if (r.isAbsent) return <span className="text-rose-600 text-xs flex items-center gap-1"><Calendar className="h-3 w-3" />غائب</span>;
              if (r.isLeave)  return <span className="text-amber-600 text-xs flex items-center gap-1"><Calendar className="h-3 w-3" />إجازة</span>;
              if (r.checkInAt && !r.checkOutAt) return <span className="text-emerald-600 text-xs flex items-center gap-1"><Clock className="h-3 w-3" />موجود</span>;
              if (r.checkInAt && r.checkOutAt)  return <span className="text-slate-600 text-xs flex items-center gap-1"><ArrowLeftRight className="h-3 w-3" />انصرف</span>;
              return '—';
            },
          },
        ]}
        rows={records}
        loading={isLoading}
        error={error ? 'تعذَّر تحميل السجلات' : null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد سجلات حضور لهذه الفترة"
        exportFilename={`attendance-${year}-${String(month).padStart(2, '0')}`}
        getRowKey={(r: any) => r.id}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value, kind }: { label: string; value: React.ReactNode; kind?: 'warn' }) {
  return (
    <div className={'rounded-md border px-3 py-2 ' + (kind === 'warn' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white')}>
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-lg font-bold num-latin">{value}</div>
    </div>
  );
}

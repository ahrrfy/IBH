'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ArrowRight, Clock, MapPin, AlertTriangle, CheckCircle2, LogOut } from 'lucide-react';

type Source = 'mobile_geofence' | 'manual';
type GeoStatus = 'idle' | 'asking' | 'ok' | 'denied' | 'unsupported';

export default function AttendanceCheckInPage() {
  const qc = useQueryClient();

  const { data: employees, isLoading: loadingEmps } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api<any>('/hr/employees'),
  });
  const empList: any[] = Array.isArray(employees) ? employees : employees?.items ?? [];

  const [employeeId, setEmployeeId] = useState('');
  const [source, setSource] = useState<Source>('mobile_geofence');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<GeoStatus>('idle');
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [tick, setTick] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  function requestGeo() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoStatus('unsupported');
      setGeoMsg('المتصفح لا يدعم تحديد الموقع — استخدم "يدوي"');
      return;
    }
    setGeoStatus('asking');
    setGeoMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoStatus('ok');
        setGeoMsg(null);
      },
      (err) => {
        setGeoStatus('denied');
        setGeoMsg(err.message || 'تعذَّر الحصول على الموقع');
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  useEffect(() => {
    if (source === 'mobile_geofence' && geoStatus === 'idle') requestGeo();
  }, [source, geoStatus]);

  const checkIn = useMutation({
    mutationFn: (payload: any) => api('/hr/attendance/check-in', { method: 'POST', body: payload }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attendance-monthly'] }); setActionError(null); },
    onError: (e: any) => setActionError(e?.message ?? 'فشل تسجيل الحضور'),
  });

  const checkOut = useMutation({
    mutationFn: (payload: any) => api('/hr/attendance/check-out', { method: 'POST', body: payload }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attendance-monthly'] }); setActionError(null); },
    onError: (e: any) => setActionError(e?.message ?? 'فشل تسجيل الانصراف'),
  });

  function buildPayload() {
    const p: any = { employeeId, source };
    if (source === 'mobile_geofence' && coords) { p.lat = coords.lat; p.lng = coords.lng; }
    return p;
  }

  function doCheckIn() {
    setActionError(null);
    if (!employeeId) { setActionError('اختر موظفاً'); return; }
    if (source === 'mobile_geofence' && !coords) { setActionError('في انتظار الموقع — أو حوِّل لـ "يدوي"'); return; }
    checkIn.mutate(buildPayload());
  }

  function doCheckOut() {
    setActionError(null);
    if (!employeeId) { setActionError('اختر موظفاً'); return; }
    checkOut.mutate({ employeeId });
  }

  const ranAction = checkIn.isSuccess || checkOut.isSuccess;
  const lastKind: 'in' | 'out' | null = checkIn.isSuccess ? 'in' : checkOut.isSuccess ? 'out' : null;

  const now = new Date(tick);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');

  return (
    <div className="p-6 max-w-2xl space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Clock className="h-6 w-6 text-sky-700" />
            تسجيل حضور / انصراف
          </h1>
          <p className="text-sm text-slate-500 mt-1">سجِّل دخولك أو خروجك لليوم الحالي</p>
        </div>
        <Link href="/hr/attendance" className="text-sm text-slate-500 hover:text-sky-700 flex items-center gap-1">
          <ArrowRight className="h-4 w-4" />
          سجلات الحضور
        </Link>
      </header>

      <section className="bg-white border border-slate-200 rounded-lg p-6 text-center">
        <div className="text-5xl font-bold tracking-tight num-latin font-mono">
          {hh}:{mm}<span className="text-slate-400 text-3xl">:{ss}</span>
        </div>
        <div className="mt-1 text-sm text-slate-500 num-latin">
          {new Intl.DateTimeFormat('en-CA', { weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)}
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
        <Field label="الموظف" required>
          <select
            className="input"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            required
            disabled={loadingEmps}
          >
            <option value="">— اختر موظفاً —</option>
            {empList.map((e: any) => (
              <option key={e.id} value={e.id}>
                {e.nameAr ?? e.fullNameAr ?? e.firstName} {e.code ? `(${e.code})` : ''}
              </option>
            ))}
          </select>
        </Field>

        <Field label="مصدر التسجيل">
          <div className="flex gap-2">
            {([
              { v: 'mobile_geofence', label: 'موبايل (موقع جغرافي)', icon: MapPin },
              { v: 'manual',          label: 'يدوي', icon: Clock },
            ] as const).map((s) => (
              <button
                key={s.v}
                type="button"
                onClick={() => { setSource(s.v); setActionError(null); }}
                className={
                  'flex-1 flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm ' +
                  (source === s.v
                    ? 'bg-sky-700 text-white border-sky-700'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50')
                }
              >
                <s.icon className="h-4 w-4" />
                {s.label}
              </button>
            ))}
          </div>
        </Field>

        {source === 'mobile_geofence' && (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm flex items-start gap-2">
            <MapPin className="h-4 w-4 text-sky-700 mt-0.5 shrink-0" />
            <div className="flex-1">
              {geoStatus === 'asking' && <span className="text-slate-600">جاري قراءة الموقع…</span>}
              {geoStatus === 'ok' && coords && (
                <span className="text-emerald-700 num-latin font-mono text-xs">
                  {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                </span>
              )}
              {(geoStatus === 'denied' || geoStatus === 'unsupported') && (
                <span className="text-rose-700">{geoMsg}</span>
              )}
              {geoStatus === 'idle' && <span className="text-slate-600">سيُطلب الإذن…</span>}
            </div>
            {(geoStatus === 'denied' || geoStatus === 'unsupported') && (
              <button type="button" onClick={requestGeo} className="text-xs text-sky-700 hover:underline">
                إعادة المحاولة
              </button>
            )}
          </div>
        )}

        {actionError && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}

        {ranAction && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{lastKind === 'in' ? 'تم تسجيل الحضور' : 'تم تسجيل الانصراف'} للموظف بنجاح.</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 pt-2 border-t">
          <button
            type="button"
            onClick={doCheckIn}
            disabled={checkIn.isPending || checkOut.isPending}
            className="btn-primary gap-1.5 justify-center"
          >
            <Clock className="h-4 w-4" />
            {checkIn.isPending ? 'جاري…' : 'تسجيل دخول'}
          </button>
          <button
            type="button"
            onClick={doCheckOut}
            disabled={checkIn.isPending || checkOut.isPending}
            className="btn-ghost gap-1.5 justify-center border border-slate-200"
          >
            <LogOut className="h-4 w-4" />
            {checkOut.isPending ? 'جاري…' : 'تسجيل خروج'}
          </button>
        </div>
      </section>

      <p className="text-[11px] text-slate-500 text-center">
        إذا اخترت «موبايل»، يجب أن تكون داخل نطاق 500م من الفرع. غير ذلك استخدم «يدوي» (يحتاج صلاحية).
      </p>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}

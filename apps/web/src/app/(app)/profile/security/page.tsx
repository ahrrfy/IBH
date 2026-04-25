'use client';

/**
 * 2FA / TOTP Setup Wizard
 *  Step 1 — Intro: explain MFA + show "Enable" button
 *  Step 2 — Scan: QR code + secret + entry to confirm
 *  Step 3 — Backup: 8 recovery codes (download + acknowledge)
 *  Step 4 — Done
 */

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { setupTotp, confirmTotp, disableTotp } from '@/lib/api';
import {
  Shield, ShieldCheck, ShieldAlert, Smartphone, Copy, Download,
  Check, AlertTriangle, ArrowLeft, Loader2, Eye, EyeOff, KeyRound,
} from 'lucide-react';
import Link from 'next/link';

type Step = 'intro' | 'scan' | 'backup' | 'done' | 'disable';

export default function SecurityPage() {
  const { user } = useAuth();
  const enabled = (user as any)?.requires2FA === true;
  const [step, setStep] = useState<Step>(enabled ? 'done' : 'intro');
  const [secret, setSecret] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revealSecret, setRevealSecret] = useState(false);

  // Disable flow
  const [disablePwd, setDisablePwd] = useState('');
  const [disableCode, setDisableCode] = useState('');

  async function startSetup() {
    setBusy(true); setError(null);
    try {
      const res = await setupTotp();
      setSecret(res.secret);
      setQrDataUrl(res.qrDataUrl);
      setStep('scan');
    } catch (e: any) {
      setError(e?.messageAr ?? 'تعذَّر إنشاء سرّ المصادقة');
    } finally { setBusy(false); }
  }

  async function confirmCode() {
    if (!/^\d{6}$/.test(code)) {
      setError('الرمز يجب أن يكون 6 أرقام'); return;
    }
    setBusy(true); setError(null);
    try {
      const res = await confirmTotp(code);
      setBackupCodes(res.backupCodes);
      setStep('backup');
    } catch (e: any) {
      setError(e?.messageAr ?? 'الرمز غير صحيح، تأكد من التطبيق');
    } finally { setBusy(false); }
  }

  async function handleDisable() {
    setBusy(true); setError(null);
    try {
      await disableTotp(disablePwd, disableCode || undefined);
      setStep('intro');
      setDisablePwd(''); setDisableCode('');
    } catch (e: any) {
      setError(e?.messageAr ?? 'تعذَّر إيقاف المصادقة الثنائية');
    } finally { setBusy(false); }
  }

  function downloadBackupCodes() {
    const blob = new Blob(
      ['الرؤية العربية ERP — رموز احتياطية للمصادقة الثنائية\n\n' +
       'احتفظ بهذه الرموز في مكان آمن. كل رمز يُستخدم مرة واحدة فقط.\n\n' +
       backupCodes.join('\n') + '\n'],
      { type: 'text/plain;charset=utf-8' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `al-ruya-2fa-backup-codes-${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <Link href="/profile" className="text-xs text-sky-700 hover:underline flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> الملف الشخصي
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">الأمان والخصوصية</h1>
          <p className="text-sm text-slate-500 mt-1">
            احمِ حسابك بطبقة إضافية من المصادقة باستخدام تطبيق Google Authenticator
          </p>
        </div>
      </header>

      {/* Status card */}
      <section className={`rounded-2xl border p-5 flex items-start gap-4
        ${enabled
          ? 'bg-emerald-50 border-emerald-200'
          : 'bg-amber-50 border-amber-200'}`}
      >
        <div className={`h-12 w-12 rounded-xl grid place-items-center shrink-0
          ${enabled ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}`}>
          {enabled ? <ShieldCheck className="h-6 w-6" /> : <ShieldAlert className="h-6 w-6" />}
        </div>
        <div className="flex-1">
          <h2 className={`text-lg font-bold ${enabled ? 'text-emerald-900' : 'text-amber-900'}`}>
            {enabled ? 'المصادقة الثنائية مفعّلة' : 'المصادقة الثنائية غير مفعّلة'}
          </h2>
          <p className={`text-sm mt-1 ${enabled ? 'text-emerald-800' : 'text-amber-800'}`}>
            {enabled
              ? 'حسابك محمي بمصادقة ثنائية. ستحتاج رمزاً مكوناً من 6 أرقام عند كل دخول.'
              : 'يُنصح بشدة بتفعيلها — خاصة لحسابات المالك والإدارة والمحاسبة.'}
          </p>
        </div>
        {!enabled && step === 'intro' && (
          <button onClick={startSetup} disabled={busy} className="btn btn-primary btn-sm">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <Shield className="h-3.5 w-3.5" />
            تفعيل
          </button>
        )}
        {enabled && step === 'done' && (
          <button onClick={() => setStep('disable')} className="btn-sm bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100">
            إيقاف
          </button>
        )}
      </section>

      {/* Step 2 — Scan QR */}
      {step === 'scan' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-6 space-y-5">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-sky-700" />
            خطوة 1 — افتح تطبيق المصادقة وامسح الرمز
          </h2>

          <div className="grid sm:grid-cols-[280px_1fr] gap-5 items-start">
            <div className="bg-slate-100 rounded-xl p-3 border border-slate-200">
              {qrDataUrl
                ? <img src={qrDataUrl} alt="QR Code" className="w-full" />
                : <div className="aspect-square skeleton rounded-lg" />}
            </div>

            <div className="space-y-3 text-sm">
              <p className="text-slate-700">
                <strong>التطبيقات المدعومة:</strong>
                <br />
                • Google Authenticator
                <br />
                • Microsoft Authenticator
                <br />
                • Authy
                <br />
                • 1Password (مدمج)
              </p>

              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                <div className="text-xs text-slate-500 mb-1">إذا تعذّر مسح الرمز، أدخله يدوياً:</div>
                <div className="flex items-center gap-2">
                  <input
                    type={revealSecret ? 'text' : 'password'}
                    value={secret}
                    readOnly
                    dir="ltr"
                    className="flex-1 h-9 px-2 bg-white border border-slate-300 rounded text-xs font-mono num-latin text-slate-800"
                  />
                  <button
                    onClick={() => setRevealSecret(!revealSecret)}
                    className="h-9 w-9 grid place-items-center rounded hover:bg-slate-200 text-slate-600"
                  >
                    {revealSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => navigator.clipboard.writeText(secret)}
                    className="h-9 w-9 grid place-items-center rounded hover:bg-slate-200 text-slate-600"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-5 space-y-3">
            <h3 className="font-semibold text-slate-900">خطوة 2 — أدخل الرمز المعروض في التطبيق</h3>
            <div className="flex items-center gap-3">
              <KeyRound className="h-5 w-5 text-slate-400" />
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                dir="ltr"
                className="h-12 w-40 rounded-lg border border-slate-300 bg-white px-3 text-center text-xl font-mono tracking-widest num-latin focus:outline-none focus:border-sky-500"
                autoFocus
              />
              <button
                onClick={confirmCode}
                disabled={busy || code.length !== 6}
                className="btn btn-primary"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                تأكيد
              </button>
            </div>
            {error && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-800 flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5" />
                {error}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 3 — Backup codes */}
      {step === 'backup' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-500 text-white grid place-items-center shrink-0">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">احفظ رموزك الاحتياطية</h2>
              <p className="text-sm text-slate-600 mt-1">
                احتفظ بهذه الرموز في مكان آمن. ستحتاج إليها إذا فقدت هاتفك. <strong>كل رمز يستخدم مرة واحدة فقط.</strong>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-4 bg-slate-50 rounded-lg border border-slate-200 font-mono num-latin">
            {backupCodes.map((c, i) => (
              <div key={i} className="bg-white px-3 py-2 rounded border border-slate-200 text-center text-sm font-bold text-slate-900">
                {c}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button onClick={downloadBackupCodes} className="btn btn-secondary btn-sm">
              <Download className="h-3.5 w-3.5" />
              تنزيل كملف نصي
            </button>
            <button
              onClick={() => navigator.clipboard.writeText(backupCodes.join('\n'))}
              className="btn btn-secondary btn-sm"
            >
              <Copy className="h-3.5 w-3.5" />
              نسخ
            </button>
            <div className="flex-1" />
            <button onClick={() => setStep('done')} className="btn btn-primary">
              <Check className="h-3.5 w-3.5" />
              حفظتها — متابعة
            </button>
          </div>

          <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <strong>تحذير:</strong> هذه آخر مرة ستظهر فيها الرموز. إذا فقدتها، عليك إعادة إعداد المصادقة من البداية.
            </div>
          </div>
        </div>
      )}

      {/* Disable flow */}
      {step === 'disable' && (
        <div className="bg-white rounded-2xl border border-rose-200 shadow-card p-6 space-y-4">
          <h2 className="text-lg font-bold text-rose-900 flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            إيقاف المصادقة الثنائية
          </h2>
          <p className="text-sm text-slate-600">
            سيُصبح حسابك أقل أماناً. أدخل كلمة المرور للتأكيد، ويُفضّل إدخال رمز Authenticator حالي أيضاً.
          </p>

          <label className="block">
            <span className="text-xs text-slate-600">كلمة المرور</span>
            <input
              type="password"
              value={disablePwd}
              onChange={(e) => setDisablePwd(e.target.value)}
              dir="ltr"
              className="mt-1 input"
            />
          </label>

          <label className="block">
            <span className="text-xs text-slate-600">رمز Authenticator (اختياري)</span>
            <input
              type="text"
              inputMode="numeric"
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              dir="ltr"
              className="mt-1 input num-latin font-mono"
              placeholder="123456"
            />
          </label>

          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-800">
              {error}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button onClick={() => { setStep('done'); setError(null); }} className="btn btn-secondary btn-sm">
              إلغاء
            </button>
            <div className="flex-1" />
            <button
              onClick={handleDisable}
              disabled={busy || !disablePwd}
              className="btn btn-danger btn-sm"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              إيقاف 2FA
            </button>
          </div>
        </div>
      )}

      {/* Done */}
      {step === 'done' && enabled && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-6 space-y-3">
          <h2 className="text-lg font-bold text-slate-900">إعدادات إضافية</h2>
          <div className="text-sm text-slate-600 space-y-2">
            <p>• ستحتاج رمز 6-أرقام من Authenticator عند كل دخول جديد.</p>
            <p>• الرموز الاحتياطية صالحة في حال فقدان الهاتف.</p>
            <p>• إذا غيّرت هاتفك، أوقف 2FA من هنا ثم أعد إعداده.</p>
          </div>
        </div>
      )}
    </div>
  );
}

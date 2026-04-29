'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, User as UserIcon, Lock, Eye, EyeOff, Shield, KeyRound } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';

type Step = 'credentials' | 'mfa';

/**
 * Login page — minimal implementation to avoid hydration/Suspense edge cases.
 * No <form> element (everything is button-driven) so native form submission
 * cannot race with React event handlers.
 */
export default function LoginPage() {
  const router = useRouter();
  const { login, verifyMfa, token, initialized } = useAuth();

  const [step, setStep] = useState<Step>('credentials');
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // MFA state
  const [mfaToken, setMfaToken] = useState('');
  const [code, setCode] = useState('');
  const codeRef = useRef<HTMLInputElement>(null);

  // Read ?next=... from URL on mount (no useSearchParams to avoid Suspense)
  const [nextPath, setNextPath] = useState('/dashboard');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const n = params.get('next');
    if (n && n.startsWith('/')) setNextPath(n);
  }, []);

  useEffect(() => {
    if (initialized && token) {
      router.replace(nextPath);
    }
  }, [initialized, token, nextPath, router]);

  useEffect(() => {
    if (step === 'mfa') codeRef.current?.focus();
  }, [step]);

  async function doCredentialsLogin() {
    if (submitting) return;
    if (!emailOrUsername.trim() || !password) {
      setError('يرجى إدخال اسم المستخدم/البريد وكلمة المرور');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await login(emailOrUsername.trim(), password);
      if (res.mfaRequired) {
        setMfaToken(res.mfaToken);
        setStep('mfa');
      } else {
        router.replace(nextPath);
      }
    } catch (err) {
      console.error('Login failed:', err);
      if (err instanceof ApiError) setError(err.messageAr);
      else if (err instanceof Error) setError(err.message);
      else setError('حدث خطأ غير متوقع، يرجى المحاولة مجدداً');
    } finally {
      setSubmitting(false);
    }
  }

  async function doMfaVerify() {
    if (submitting) return;
    const c = code.trim();
    if (!/^\d{6}$/.test(c) && !/^[A-Z2-9]{8}$/i.test(c)) {
      setError('الرمز يجب أن يكون 6 أرقام (Authenticator) أو 8 أحرف (رمز احتياطي)');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await verifyMfa(mfaToken, c);
      router.replace(nextPath);
    } catch (err) {
      console.error('MFA verify failed:', err);
      if (err instanceof ApiError) setError(err.messageAr);
      else setError('الرمز غير صحيح، حاول مجدداً');
      setCode('');
      codeRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  }

  // Submit on Enter inside any input
  function handleEnter(action: () => void) {
    return (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        action();
      }
    };
  }

  return (
    <div className="w-full max-w-md">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-700 text-white text-2xl font-bold shadow-lg">
          ر
        </div>
        <h1 className="text-2xl font-bold text-slate-900">الرؤية العربية</h1>
        <p className="mt-1 text-sm text-slate-600">
          {step === 'credentials' ? 'تسجيل الدخول إلى لوحة الإدارة' : 'التحقّق بخطوتين'}
        </p>
      </div>

      {/* ─── Step 1: credentials ─────────────────────────────────────── */}
      {step === 'credentials' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {error && (
            <div
              role="alert"
              aria-live="assertive"
              aria-atomic="true"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              {error}
            </div>
          )}

          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">البريد الإلكتروني أو اسم المستخدم</span>
            <div className="relative">
              <UserIcon className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                autoComplete="username"
                placeholder="name@company.iq"
                value={emailOrUsername}
                onChange={(e) => setEmailOrUsername(e.target.value)}
                onKeyDown={handleEnter(doCredentialsLogin)}
                className="h-11 w-full rounded-lg border border-slate-200 bg-white pr-10 pl-3 text-sm outline-none focus:border-sky-500"
                dir="ltr"
              />
            </div>
          </label>

          <label className="mb-2 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">كلمة المرور</span>
            <div className="relative">
              <Lock className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type={showPwd ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleEnter(doCredentialsLogin)}
                className="h-11 w-full rounded-lg border border-slate-200 bg-white pr-10 pl-10 text-sm outline-none focus:border-sky-500"
                dir="ltr"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label="إظهار كلمة المرور"
              >
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>

          <div className="mb-4 flex items-center justify-between text-xs">
            <a href="/forgot-password" className="text-sky-700 hover:underline">
              نسيت كلمة المرور؟
            </a>
          </div>

          <button
            type="button"
            onClick={doCredentialsLogin}
            disabled={submitting}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-sky-700 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            تسجيل الدخول
          </button>
        </div>
      )}

      {/* ─── Step 2: MFA ─────────────────────────────────────────────── */}
      {step === 'mfa' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 rounded-lg bg-sky-50 border border-sky-200 px-4 py-3 flex items-start gap-3">
            <Shield className="h-5 w-5 text-sky-700 mt-0.5 shrink-0" />
            <div className="text-xs text-sky-900">
              <strong>التحقّق بخطوتين مفعّل لحسابك.</strong>
              <br />
              افتح تطبيق Google Authenticator وأدخل الرمز المكوّن من 6 أرقام.
            </div>
          </div>

          {error && (
            <div
              role="alert"
              aria-live="assertive"
              aria-atomic="true"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              {error}
            </div>
          )}

          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">الرمز</span>
            <div className="relative">
              <KeyRound className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={codeRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={handleEnter(doMfaVerify)}
                maxLength={8}
                className="h-12 w-full rounded-lg border border-slate-200 bg-white pr-10 pl-3 text-lg text-center font-mono tracking-widest outline-none focus:border-sky-500 num-latin"
                dir="ltr"
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              أو أدخل رمزاً احتياطياً (8 أحرف) إذا فقدت الوصول لتطبيق المصادقة
            </p>
          </label>

          <button
            type="button"
            onClick={doMfaVerify}
            disabled={submitting || (!/^\d{6}$/.test(code) && !/^[A-Z2-9]{8}$/i.test(code))}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-sky-700 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            تأكيد الرمز
          </button>

          <button
            type="button"
            onClick={() => { setStep('credentials'); setCode(''); setError(null); }}
            className="mt-3 w-full text-center text-xs text-slate-500 hover:text-slate-700"
          >
            ← الرجوع لتسجيل الدخول
          </button>
        </div>
      )}

      <p className="mt-6 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} الرؤية العربية · جميع الحقوق محفوظة
      </p>
    </div>
  );
}

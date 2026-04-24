'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { Loader2, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';

interface LoginForm {
  email: string;
  password: string;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: LoginForm) {
    setError(null);
    setSubmitting(true);
    try {
      await login(values.email, values.password);
      const next = searchParams.get('next') || '/dashboard';
      router.replace(next);
    } catch (err) {
      if (err instanceof ApiError) setError(err.messageAr);
      else setError('حدث خطأ غير متوقع، يرجى المحاولة مجدداً');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-700 text-white text-2xl font-bold shadow-lg">
          ر
        </div>
        <h1 className="text-2xl font-bold text-slate-900">الرؤية العربية</h1>
        <p className="mt-1 text-sm text-slate-600">تسجيل الدخول إلى لوحة الإدارة</p>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit) as (e: FormEvent<HTMLFormElement>) => void}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <label className="mb-4 block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">البريد الإلكتروني</span>
          <div className="relative">
            <Mail className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="email"
              autoComplete="email"
              placeholder="name@company.iq"
              className="h-11 w-full rounded-lg border border-slate-200 bg-white pr-10 pl-3 text-sm outline-none focus:border-sky-500"
              {...register('email', {
                required: 'البريد الإلكتروني مطلوب',
                pattern: { value: /^\S+@\S+\.\S+$/, message: 'صيغة البريد غير صحيحة' },
              })}
            />
          </div>
          {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
        </label>

        <label className="mb-2 block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">كلمة المرور</span>
          <div className="relative">
            <Lock className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type={showPwd ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              className="h-11 w-full rounded-lg border border-slate-200 bg-white pr-10 pl-10 text-sm outline-none focus:border-sky-500"
              {...register('password', {
                required: 'كلمة المرور مطلوبة',
                minLength: { value: 6, message: 'يجب ألا تقل عن 6 أحرف' },
              })}
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
          {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
        </label>

        <div className="mb-4 flex items-center justify-between text-xs">
          <Link href="/forgot-password" className="text-sky-700 hover:underline">
            نسيت كلمة المرور؟
          </Link>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-sky-700 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          تسجيل الدخول
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} الرؤية العربية · جميع الحقوق محفوظة
      </p>
    </div>
  );
}

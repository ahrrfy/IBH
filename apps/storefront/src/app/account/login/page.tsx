'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { requestOtp, verifyOtp, ApiError } from '@/lib/api';
import { setCustomerToken } from '@/lib/customer-auth';

interface PhoneForm {
  phone: string;
}
interface OtpForm {
  code: string;
}

/**
 * Customer-portal OTP login (T56). Mounted at /account/login so the auth
 * surface lives next to the protected portal pages.
 */
function LoginFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/account';

  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);

  const phoneForm = useForm<PhoneForm>();
  const otpForm = useForm<OtpForm>();

  async function onPhoneSubmit(values: PhoneForm) {
    setError(null);
    setDevCode(null);
    try {
      const resp = await requestOtp(values.phone);
      if (resp?.devCode) setDevCode(resp.devCode);
      setPhone(values.phone);
      setStep('otp');
    } catch (err) {
      setError(err instanceof ApiError ? err.messageAr : 'تعذر إرسال الرمز');
    }
  }

  async function onOtpSubmit(values: OtpForm) {
    setError(null);
    try {
      const resp = await verifyOtp(phone, values.code);
      setCustomerToken(resp.token, phone);
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.messageAr : 'رمز التحقق غير صحيح');
    }
  }

  return (
    <div className="mx-auto max-w-md bg-white rounded-lg shadow-sm border border-gray-100 p-6 text-right">
      <h1 className="text-xl font-bold text-gray-900 mb-1">تسجيل الدخول</h1>
      <p className="text-sm text-gray-600 mb-5">
        {step === 'phone' ? 'أدخل رقم هاتفك لإرسال رمز التحقق' : `أدخل الرمز المرسل إلى ${phone}`}
      </p>

      {error && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
          {error}
        </p>
      )}
      {devCode && step === 'otp' && (
        <p className="mb-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
          [وضع التطوير] الرمز: <span className="font-mono font-bold">{devCode}</span>
        </p>
      )}

      {step === 'phone' ? (
        <form onSubmit={phoneForm.handleSubmit(onPhoneSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm mb-1">رقم الهاتف</label>
            <input
              type="tel"
              inputMode="tel"
              placeholder="07XX XXX XXXX"
              {...phoneForm.register('phone', {
                required: 'مطلوب',
                pattern: { value: /^07\d{9}$/, message: 'صيغة رقم غير صحيحة' },
              })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-600 focus:outline-none"
            />
            {phoneForm.formState.errors.phone && (
              <p className="text-xs text-red-600 mt-1">{phoneForm.formState.errors.phone.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={phoneForm.formState.isSubmitting}
            className="w-full bg-sky-700 hover:bg-sky-800 disabled:bg-gray-400 text-white py-2.5 rounded-lg font-semibold"
          >
            {phoneForm.formState.isSubmitting ? 'جارٍ الإرسال…' : 'إرسال الرمز'}
          </button>
        </form>
      ) : (
        <form onSubmit={otpForm.handleSubmit(onOtpSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm mb-1">رمز التحقق</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="______"
              {...otpForm.register('code', {
                required: 'مطلوب',
                pattern: { value: /^\d{4,8}$/, message: 'رمز غير صحيح' },
              })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-center tracking-[0.5em] text-lg focus:border-sky-600 focus:outline-none"
            />
            {otpForm.formState.errors.code && (
              <p className="text-xs text-red-600 mt-1">{otpForm.formState.errors.code.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={otpForm.formState.isSubmitting}
            className="w-full bg-sky-700 hover:bg-sky-800 disabled:bg-gray-400 text-white py-2.5 rounded-lg font-semibold"
          >
            {otpForm.formState.isSubmitting ? 'جارٍ التحقق…' : 'تأكيد'}
          </button>

          <button
            type="button"
            onClick={() => { setStep('phone'); setError(null); setDevCode(null); }}
            className="w-full text-sm text-gray-600 hover:text-sky-700"
          >
            تغيير رقم الهاتف
          </button>
        </form>
      )}
    </div>
  );
}

export default function CustomerLoginPage() {
  return (
    <>
      <Header />
      <main className="px-4 py-10">
        <Suspense
          fallback={<div className="mx-auto max-w-md h-64 bg-gray-200 animate-pulse rounded-lg" />}
        >
          <LoginFlow />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiError, getMe, updateMe, type PortalCustomer } from '@/lib/api';
import { getCustomerToken } from '@/lib/customer-auth';

interface ProfileForm {
  nameAr: string;
  email: string;
  address: string;
  city: string;
}

/**
 * Profile / dashboard view. The protected shell is provided by `account/layout.tsx`
 * which redirects to /account/login if no customer token is present.
 */
export default function ProfilePage() {
  const [me, setMe] = useState<PortalCustomer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const form = useForm<ProfileForm>();

  useEffect(() => {
    const token = getCustomerToken();
    if (!token) return;
    (async () => {
      try {
        const data = await getMe(token);
        setMe(data);
        form.reset({
          nameAr: data.nameAr ?? '',
          email: data.email ?? '',
          address: data.address ?? '',
          city: data.city ?? '',
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'تعذر تحميل البيانات');
      } finally {
        setLoading(false);
      }
    })();
  }, [form]);

  async function onSubmit(values: ProfileForm) {
    setError(null);
    const token = getCustomerToken();
    if (!token) return;
    try {
      const updated = await updateMe(token, {
        nameAr: values.nameAr,
        email: values.email || undefined,
        address: values.address || undefined,
        city: values.city || undefined,
      });
      setMe((prev) => (prev ? { ...prev, ...updated } : prev));
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof ApiError ? err.messageAr : 'تعذر حفظ البيانات');
    }
  }

  if (loading) {
    return <div className="h-40 bg-gray-100 rounded-lg animate-pulse" />;
  }

  return (
    <div className="grid md:grid-cols-3 gap-4 mb-6">
      <section className="md:col-span-2 bg-white rounded-lg shadow-sm border border-gray-100 p-5">
        <h2 className="text-lg font-semibold mb-4">الملف الشخصي</h2>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm mb-1">الاسم *</label>
            <input
              {...form.register('nameAr', { required: 'مطلوب', minLength: { value: 2, message: 'قصير جداً' } })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-600 focus:outline-none"
            />
            {form.formState.errors.nameAr && (
              <p className="text-xs text-red-600 mt-1">{form.formState.errors.nameAr.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm mb-1">رقم الهاتف</label>
            <input
              type="tel"
              value={me?.phone ?? ''}
              disabled
              className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600"
            />
            <p className="text-xs text-gray-500 mt-1">لا يمكن تغيير الرقم — يلزم تسجيل دخول جديد</p>
          </div>

          <div>
            <label className="block text-sm mb-1">البريد الإلكتروني</label>
            <input
              type="email"
              {...form.register('email', {
                pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'بريد غير صالح' },
              })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-600 focus:outline-none"
            />
            {form.formState.errors.email && (
              <p className="text-xs text-red-600 mt-1">{form.formState.errors.email.message}</p>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm mb-1">المدينة</label>
              <input
                {...form.register('city')}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-600 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm mb-1">العنوان</label>
            <textarea
              rows={3}
              {...form.register('address')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-600 focus:outline-none resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-2">{error}</p>
          )}
          {savedAt && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md p-2">
              تم حفظ البيانات
            </p>
          )}

          <button
            type="submit"
            disabled={form.formState.isSubmitting}
            className="bg-sky-700 hover:bg-sky-800 disabled:bg-gray-400 text-white px-5 py-2.5 rounded-lg font-semibold text-sm"
          >
            {form.formState.isSubmitting ? 'جارٍ الحفظ…' : 'حفظ التغييرات'}
          </button>
        </form>
      </section>

      <aside className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-lg p-5 h-fit">
        <div className="text-sm text-amber-800">نقاط الولاء</div>
        <div className="mt-1 text-3xl font-bold text-amber-600">{me?.loyaltyPoints ?? 0}</div>
        {me?.loyaltyTier && (
          <div className="mt-2 inline-block px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 text-xs font-semibold">
            {me.loyaltyTier}
          </div>
        )}
      </aside>
    </div>
  );
}

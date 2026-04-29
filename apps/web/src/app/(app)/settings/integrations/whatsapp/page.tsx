'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, MessageCircle, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

interface WhatsAppView {
  isEnabled: boolean;
  tokenMasked: string | null;
  phoneNumberId: string | null;
  businessAccountId: string | null;
  apiVersion: string | null;
  lastTestedAt: string | null;
  lastTestStatus: 'success' | 'failed' | null;
  lastTestError: string | null;
}

export default function WhatsAppIntegrationPage() {
  const [view, setView] = useState<WhatsAppView | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form state
  const [isEnabled, setIsEnabled] = useState(false);
  const [token, setToken] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [businessAccountId, setBusinessAccountId] = useState('');
  const [webhookVerifyToken, setWebhookVerifyToken] = useState('');
  const [apiVersion, setApiVersion] = useState('v22.0');

  async function load() {
    setLoading(true);
    try {
      const data = await api<WhatsAppView>('/admin/integrations/whatsapp');
      setView(data);
      setIsEnabled(data.isEnabled);
      setPhoneNumberId(data.phoneNumberId ?? '');
      setBusinessAccountId(data.businessAccountId ?? '');
      setApiVersion(data.apiVersion ?? 'v22.0');
    } catch (err: any) {
      setError(err?.message ?? 'فشل التحميل');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      // The token field is required only on first save / when rotating it.
      // If the user leaves it blank, we keep the existing one — but the
      // backend requires a non-empty value, so we re-send the masked one.
      // For safety, require at least one non-empty save with a real token.
      if (!token && !view?.tokenMasked) {
        setError('Token مطلوب عند الحفظ لأول مرة');
        setSaving(false);
        return;
      }
      // If token field is empty AND we already have a saved one, the user
      // is presumably just toggling enabled or updating other fields.
      // We need to re-supply some token; require user to re-enter it.
      if (!token) {
        setError('للأمان: أعد إدخال الـ Token عند تحديث الإعدادات');
        setSaving(false);
        return;
      }
      await api('/admin/integrations/whatsapp', {
        method: 'PUT',
        body: JSON.stringify({
          isEnabled,
          config: {
            token,
            phoneNumberId,
            businessAccountId,
            webhookVerifyToken: webhookVerifyToken || 'verify-' + Date.now().toString(36),
            apiVersion,
          },
        }),
      });
      setSuccessMsg('تم حفظ الإعدادات بنجاح');
      setToken(''); // clear the plaintext from memory
      await load();
    } catch (err: any) {
      setError(err?.message ?? 'فشل الحفظ');
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const result = await api<{ success: boolean; error?: string }>(
        '/admin/integrations/whatsapp/test',
        { method: 'POST' },
      );
      if (result.success) {
        setSuccessMsg('✓ الاتصال بـ WhatsApp ناجح');
      } else {
        setError(`فشل الاختبار: ${result.error ?? 'سبب غير معروف'}`);
      }
      await load();
    } catch (err: any) {
      setError(err?.message ?? 'فشل الاختبار');
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return <div className="p-6 flex items-center gap-2 text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> تحميل...</div>;
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/settings" className="hover:text-slate-900">الإعدادات</Link>
        <ArrowRight className="h-3 w-3 rotate-180" />
        <span>التكاملات</span>
        <ArrowRight className="h-3 w-3 rotate-180" />
        <span className="text-slate-900">واتساب الأعمال</span>
      </div>

      <header className="flex items-start gap-3">
        <div className="h-12 w-12 rounded-xl bg-emerald-50 text-emerald-700 grid place-items-center">
          <MessageCircle className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">واتساب الأعمال</h1>
          <p className="text-sm text-slate-500 mt-1">
            ربط النظام بحساب WhatsApp Business الخاص بشركتك لإرسال الفواتير والإشعارات تلقائياً.
            كل شركة تستخدم بياناتها المستقلة.
          </p>
        </div>
      </header>

      {/* Status banner */}
      {view && (
        <div className={
          'rounded-xl p-4 border ' +
          (view.isEnabled
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
            : 'bg-amber-50 border-amber-200 text-amber-900')
        }>
          <div className="flex items-center gap-2 font-semibold">
            {view.isEnabled ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {view.isEnabled ? 'مُفعَّل' : 'غير مُفعَّل'}
          </div>
          {view.lastTestedAt && (
            <div className="text-xs mt-1 opacity-80">
              آخر اختبار: {new Date(view.lastTestedAt).toLocaleString('ar-IQ')} —
              النتيجة: {view.lastTestStatus === 'success' ? '✓ ناجح' : '✗ فشل'}
              {view.lastTestError && ` (${view.lastTestError})`}
            </div>
          )}
        </div>
      )}

      {/* Form */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="font-semibold text-slate-900">الإعدادات</h2>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => setIsEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          <span className="text-sm font-medium text-slate-900">تفعيل التكامل مع WhatsApp</span>
        </label>

        <div className="grid gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Access Token {view?.tokenMasked && <span className="text-xs text-slate-500 font-normal">(الحالي: {view.tokenMasked})</span>}
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={view?.tokenMasked ? 'أعد إدخال Token جديد للتحديث' : 'EAA...'}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              autoComplete="off"
            />
            <p className="text-xs text-slate-500 mt-1">من Meta Business Suite → System Users → Generate Token (long-lived)</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number ID</label>
            <input
              type="text"
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              placeholder="123456789012345"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Business Account ID</label>
            <input
              type="text"
              value={businessAccountId}
              onChange={(e) => setBusinessAccountId(e.target.value)}
              placeholder="987654321098765"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Webhook Verify Token <span className="text-xs text-slate-500 font-normal">(اختياري — سيتم توليده تلقائياً إذا تركته فارغاً)</span></label>
            <input
              type="text"
              value={webhookVerifyToken}
              onChange={(e) => setWebhookVerifyToken(e.target.value)}
              placeholder="my-secret-verify-token"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">إصدار API</label>
            <select
              value={apiVersion}
              onChange={(e) => setApiVersion(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="v22.0">v22.0 (الأحدث)</option>
              <option value="v21.0">v21.0</option>
              <option value="v20.0">v20.0</option>
            </select>
          </div>
        </div>

        {error && <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</div>}
        {successMsg && <div className="text-sm text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg">{successMsg}</div>}

        <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
          <button
            onClick={save}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg flex items-center gap-2"
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            حفظ
          </button>
          <button
            onClick={testConnection}
            disabled={testing || !view?.tokenMasked}
            className="bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 text-slate-900 text-sm font-medium px-4 py-2 rounded-lg flex items-center gap-2"
          >
            {testing && <Loader2 className="h-3 w-3 animate-spin" />}
            اختبار الاتصال
          </button>
        </div>
      </div>

      {/* Help */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-700 space-y-2">
        <p className="font-semibold">كيف تحصل على البيانات؟</p>
        <ol className="list-decimal list-inside space-y-1 text-xs">
          <li>سجّل دخول إلى <a href="https://business.facebook.com" target="_blank" rel="noopener noreferrer" className="text-emerald-700 underline">business.facebook.com</a></li>
          <li>اذهب إلى <strong>WhatsApp Manager</strong> → اختر رقم الهاتف</li>
          <li>انسخ <strong>Phone Number ID</strong> و <strong>Business Account ID</strong></li>
          <li>من <strong>System Users</strong> أنشئ مستخدم نظام وأنشئ <strong>Long-Lived Access Token</strong></li>
          <li>الصق القيم هنا واضغط <strong>حفظ</strong></li>
          <li>اضغط <strong>اختبار الاتصال</strong> للتأكد</li>
        </ol>
      </div>
    </div>
  );
}

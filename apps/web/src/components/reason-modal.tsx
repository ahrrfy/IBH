'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

/**
 * Generic confirm-with-reason modal for irreversible/destructive actions
 * (invoice reverse, GRN reject, payment void, etc).
 *
 * The reason is required and is forwarded to the caller's `onConfirm`.
 * Useful for any backend endpoint that takes `{ reason: string }` and
 * writes an audit-logged side effect.
 */
export function ReasonModal({
  open,
  title,
  description,
  confirmLabel = 'تأكيد',
  cancelLabel  = 'إلغاء',
  minLength    = 3,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  minLength?: number;
  pending?: boolean;
  error?: string | null;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');

  // Reset on open/close so reopen starts clean.
  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  if (!open) return null;

  const canSubmit = reason.trim().length >= minLength && !pending;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !pending) onCancel(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reason-modal-title"
    >
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between border-b px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-rose-100 text-rose-600">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <h2 id="reason-modal-title" className="text-lg font-semibold text-slate-900">{title}</h2>
              {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
            aria-label="إغلاق"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) onConfirm(reason.trim());
          }}
          className="space-y-3 px-5 py-4"
        >
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              السبب <span className="text-rose-500">*</span>
            </span>
            <textarea
              className="input min-h-[88px] resize-y"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={minLength}
              required
              autoFocus
              disabled={pending}
              placeholder={`أدخل السبب (لا يقل عن ${minLength} أحرف)`}
            />
          </label>

          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onCancel} disabled={pending} className="btn-ghost">
              {cancelLabel}
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="btn-primary bg-rose-600 hover:bg-rose-700 disabled:opacity-50"
            >
              {pending ? 'جاري التنفيذ…' : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

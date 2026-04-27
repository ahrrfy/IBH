'use client';
/**
 * T45 — Omnichannel Order Inbox.
 *
 * Lists inbound messages from WhatsApp/Facebook/Instagram, grouped by status.
 * Click a row to open a side panel: full body, draft items (editable), and
 * approve/reject actions. Subscribes to omnichannel.message.* realtime events
 * (T31) and invalidates the React Query cache when they fire.
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, Facebook, Instagram, X } from 'lucide-react';
import { api } from '@/lib/api';
import { CustomerCombobox, type CustomerOption } from '@/components/customer-combobox';
import { ProductCombobox, type VariantOption } from '@/components/product-combobox';
import { ReasonModal } from '@/components/reason-modal';
import { useLiveResource } from '@/lib/realtime/use-live-resource';
import { formatIqd } from '@/lib/format';

type InboxStatus = 'new' | 'drafted' | 'approved' | 'rejected';
type Channel = 'whatsapp' | 'facebook' | 'instagram';

interface DraftItem {
  productId: string;
  qty: number;
  unitPrice?: number;
  confidence?: number;
  matchedText?: string;
}

interface DraftOrder {
  id: string;
  customerId: string | null;
  items: DraftItem[];
  confidence: number;
  approvedAt: string | null;
  rejectedReason: string | null;
}

interface InboxMessage {
  id: string;
  channel: Channel;
  externalId: string;
  fromHandle: string;
  body: string;
  receivedAt: string;
  status: InboxStatus | 'spam';
  draftOrder: DraftOrder | null;
}

interface DraftLine {
  variantId: string;
  templateNameAr: string;
  qty: number;
  unitPriceIqd: number;
}

const STATUS_TABS: Array<{ key: InboxStatus; label: string }> = [
  { key: 'new',      label: 'جديد' },
  { key: 'drafted',  label: 'مسودات' },
  { key: 'approved', label: 'موافق عليها' },
  { key: 'rejected', label: 'مرفوضة' },
];

function ChannelIcon({ channel }: { channel: Channel }) {
  const cls = 'h-4 w-4';
  if (channel === 'whatsapp')  return <MessageCircle className={cls + ' text-emerald-600'} />;
  if (channel === 'facebook')  return <Facebook className={cls + ' text-sky-600'} />;
  return <Instagram className={cls + ' text-pink-600'} />;
}

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone =
    value >= 0.8 ? 'bg-emerald-100 text-emerald-700' :
    value >= 0.6 ? 'bg-amber-100 text-amber-700' :
                   'bg-slate-100 text-slate-600';
  return <span className={`px-2 py-0.5 rounded text-xs font-mono ${tone}`}>{pct}%</span>;
}

export default function OmnichannelInboxPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<InboxStatus>('new');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);

  // Live: any new/updated message → invalidate.
  useLiveResource(['omnichannel-inbox'], ['omnichannel.message.received', 'omnichannel.message.updated']);

  const { data, isLoading, error } = useQuery({
    queryKey: ['omnichannel-inbox', tab],
    queryFn:  () => api<{ items: InboxMessage[]; total: number }>(`/sales/omnichannel/inbox?status=${tab}&limit=100`),
  });

  const items: InboxMessage[] = data?.items ?? [];
  const selected = useMemo(
    () => items.find((m) => m.id === selectedId) ?? null,
    [items, selectedId],
  );

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">صندوق الطلبات الموحّد</h1>

      <div className="flex gap-2 border-b border-slate-200">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setSelectedId(null); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              tab === t.key
                ? 'border-sky-600 text-sky-700'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-white">
          {isLoading && <div className="p-6 text-sm text-slate-500">جارٍ التحميل…</div>}
          {error && <div className="p-6 text-sm text-rose-600">فشل تحميل الصندوق</div>}
          {!isLoading && items.length === 0 && (
            <div className="p-6 text-sm text-slate-500">لا توجد رسائل في هذه الحالة</div>
          )}
          <ul className="divide-y divide-slate-100">
            {items.map((m) => {
              const active = m.id === selectedId;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(m.id)}
                    className={`w-full text-start px-4 py-3 hover:bg-slate-50 transition ${
                      active ? 'bg-sky-50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <ChannelIcon channel={m.channel} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{m.fromHandle}</span>
                          {m.draftOrder && <ConfidenceBadge value={m.draftOrder.confidence} />}
                        </div>
                        <div className="text-xs text-slate-500 truncate">{m.body}</div>
                      </div>
                      <span className="text-[10px] uppercase font-mono text-slate-400">
                        {m.status}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          {selected ? (
            <DetailPanel
              key={selected.id}
              message={selected}
              onClose={() => setSelectedId(null)}
              onApproved={() => {
                setSelectedId(null);
                qc.invalidateQueries({ queryKey: ['omnichannel-inbox'] });
              }}
              onAskReject={() => setRejectOpen(true)}
            />
          ) : (
            <div className="text-sm text-slate-500">اختر رسالة للعرض</div>
          )}
        </div>
      </div>

      {selected && (
        <RejectDialog
          open={rejectOpen}
          messageId={selected.id}
          onClose={() => setRejectOpen(false)}
          onDone={() => {
            setRejectOpen(false);
            setSelectedId(null);
            qc.invalidateQueries({ queryKey: ['omnichannel-inbox'] });
          }}
        />
      )}
    </div>
  );
}

function DetailPanel({
  message,
  onClose,
  onApproved,
  onAskReject,
}: {
  message: InboxMessage;
  onClose: () => void;
  onApproved: () => void;
  onAskReject: () => void;
}) {
  const [customer, setCustomer] = useState<CustomerOption | null>(null);
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [lines, setLines] = useState<DraftLine[]>([]);

  const { data: warehousesResp } = useQuery({
    queryKey: ['warehouses'],
    queryFn:  () => api<{ items?: Array<{ id: string; nameAr: string }> }>('/inventory/warehouses'),
  });
  const warehouses = Array.isArray(warehousesResp)
    ? (warehousesResp as Array<{ id: string; nameAr: string }>)
    : warehousesResp?.items ?? [];

  const approveMut = useMutation({
    mutationFn: () =>
      api<{ salesOrder: { id: string } }>(`/sales/omnichannel/messages/${message.id}/approve`, {
        method: 'POST',
        body: {
          customerId:  customer?.id,
          warehouseId,
          items: lines.map((l) => ({
            variantId:    l.variantId,
            qty:          l.qty,
            unitPriceIqd: l.unitPriceIqd,
          })),
        },
      }),
    onSuccess: onApproved,
  });

  const isFinal = message.status === 'approved' || message.status === 'rejected';
  const canApprove =
    !!customer && !!warehouseId && lines.length > 0 && lines.every((l) => l.qty > 0) && !isFinal;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm">
            <ChannelIcon channel={message.channel} />
            <span className="font-medium">{message.fromHandle}</span>
            {message.draftOrder && <ConfidenceBadge value={message.draftOrder.confidence} />}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {new Date(message.receivedAt).toLocaleString('ar-IQ')}
          </div>
        </div>
        <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="إغلاق">
          <X size={16} />
        </button>
      </div>

      <div className="rounded-md bg-slate-50 p-3 text-sm whitespace-pre-wrap">
        {message.body}
      </div>

      {!isFinal && (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">العميل</label>
            <CustomerCombobox value={customer} onChange={setCustomer} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">المخزن</label>
            <select
              className="input"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
            >
              <option value="">— اختر المخزن —</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.nameAr}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">البنود</label>
            <ProductCombobox
              warehouseId={warehouseId || null}
              onPick={(v: VariantOption) => {
                setLines((prev) => {
                  if (prev.some((l) => l.variantId === v.variantId)) return prev;
                  return [
                    ...prev,
                    {
                      variantId:      v.variantId,
                      templateNameAr: v.templateNameAr,
                      qty:            1,
                      unitPriceIqd:   Number(v.defaultPriceIqd ?? 0),
                    },
                  ];
                });
              }}
            />
            {lines.length > 0 && (
              <table className="mt-2 w-full text-sm">
                <thead className="text-xs text-slate-500">
                  <tr>
                    <th className="text-start font-normal py-1">الصنف</th>
                    <th className="text-end font-normal py-1">الكمية</th>
                    <th className="text-end font-normal py-1">السعر</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={l.variantId} className="border-t border-slate-100">
                      <td className="py-1">{l.templateNameAr}</td>
                      <td className="py-1">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={l.qty}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setLines((prev) => prev.map((x, j) => (j === i ? { ...x, qty: v } : x)));
                          }}
                          className="input text-end w-20"
                        />
                      </td>
                      <td className="py-1">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={l.unitPriceIqd}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setLines((prev) => prev.map((x, j) => (j === i ? { ...x, unitPriceIqd: v } : x)));
                          }}
                          className="input text-end w-28"
                        />
                      </td>
                      <td className="py-1 text-end">
                        <button
                          onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
                          className="text-rose-500 hover:text-rose-700"
                          aria-label="حذف"
                        >
                          <X size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-200 font-medium">
                    <td colSpan={2} className="py-1 text-end">الإجمالي</td>
                    <td className="py-1 text-end">
                      {formatIqd(lines.reduce((a, l) => a + l.qty * l.unitPriceIqd, 0))}
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            )}
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={() => approveMut.mutate()}
              disabled={!canApprove || approveMut.isPending}
              className="btn-primary disabled:opacity-50"
            >
              {approveMut.isPending ? 'جاري…' : 'موافقة وإنشاء طلب بيع'}
            </button>
            <button onClick={onAskReject} className="btn-ghost text-rose-600 hover:bg-rose-50">
              رفض
            </button>
          </div>
          {approveMut.error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              فشل الإنشاء — تحقق من البيانات
            </div>
          )}
        </>
      )}

      {isFinal && (
        <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
          الحالة: {message.status === 'approved' ? 'تمت الموافقة' : 'مرفوضة'}
          {message.draftOrder?.rejectedReason && (
            <div className="mt-1 text-xs">السبب: {message.draftOrder.rejectedReason}</div>
          )}
        </div>
      )}
    </div>
  );
}

function RejectDialog({
  open,
  messageId,
  onClose,
  onDone,
}: {
  open: boolean;
  messageId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const mut = useMutation({
    mutationFn: (reason: string) =>
      api(`/sales/omnichannel/messages/${messageId}/reject`, {
        method: 'POST',
        body: { reason },
      }),
    onSuccess: onDone,
  });
  return (
    <ReasonModal
      open={open}
      title="رفض الرسالة"
      description="سيتم تسجيل سبب الرفض في سجل المراجعة"
      confirmLabel="رفض"
      pending={mut.isPending}
      error={mut.error ? 'تعذّر الحفظ' : null}
      onCancel={onClose}
      onConfirm={(reason) => mut.mutate(reason)}
    />
  );
}

import { useState, useRef, useEffect } from 'react';
import { useCartStore } from '../stores/cart-store';
import { useShiftStore } from '../stores/shift-store';

export function PosSale() {
  const { shift } = useShiftStore();
  const { lines, addByVariant, setQty, setDiscount, remove, subtotal, discount, total, clear } = useCartStore();
  const [barcode, setBarcode] = useState('');
  const barcodeInput = useRef<HTMLInputElement>(null);

  // Auto-focus barcode input for scanners
  useEffect(() => {
    barcodeInput.current?.focus();
  }, [lines.length]);

  const onBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcode.trim()) return;
    // TODO: call API or lookup in local cache
    // For demo: add a mock item
    addByVariant({
      variantId: `v-${barcode}`,
      sku: barcode,
      nameAr: `منتج ${barcode}`,
      priceIqd: 2500,
    });
    setBarcode('');
  };

  const onPay = async (method: 'cash' | 'card' | 'zaincash') => {
    if (lines.length === 0) return;
    // TODO: queue receipt → save to SQLite → sync to cloud
    alert(`تمت معاملة الدفع بـ ${method} — المجموع ${total().toLocaleString()} د.ع`);
    clear();
  };

  return (
    <div className="flex h-full">
      {/* Left: Cart */}
      <div className="flex w-2/3 flex-col border-l">
        <form onSubmit={onBarcodeSubmit} className="flex gap-2 border-b bg-white p-3">
          <input
            ref={barcodeInput}
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="امسح الباركود أو أدخل SKU..."
            className="flex-1 rounded border px-4 py-3 text-lg"
            autoFocus
          />
          <button type="submit" className="rounded bg-sky-700 px-6 py-3 text-white">
            أضف
          </button>
        </form>

        <div className="flex-1 overflow-auto p-3">
          {lines.length === 0 ? (
            <div className="flex h-full items-center justify-center text-slate-400">
              <div className="text-center">
                <div className="mb-2 text-5xl">🛒</div>
                <div>السلة فارغة — امسح باركود منتج للبدء</div>
              </div>
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 bg-slate-100 text-sm">
                <tr>
                  <th className="p-2 text-right">المنتج</th>
                  <th className="p-2 w-20">الكمية</th>
                  <th className="p-2 w-24">السعر</th>
                  <th className="p-2 w-16">خصم %</th>
                  <th className="p-2 w-28">الإجمالي</th>
                  <th className="p-2 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.lineId} className="border-b hover:bg-slate-50">
                    <td className="p-2">
                      <div className="font-medium">{l.nameAr}</div>
                      <div className="text-xs text-slate-500">{l.sku}</div>
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        min={0}
                        className="w-full rounded border px-2 py-1 text-center"
                        value={l.qty}
                        onChange={(e) => setQty(l.lineId, parseFloat(e.target.value) || 0)}
                      />
                    </td>
                    <td className="p-2 text-center">{l.unitPriceIqd.toLocaleString()}</td>
                    <td className="p-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className="w-full rounded border px-2 py-1 text-center"
                        value={l.discountPct}
                        onChange={(e) => setDiscount(l.lineId, parseFloat(e.target.value) || 0)}
                      />
                    </td>
                    <td className="p-2 text-left font-semibold">
                      {(l.qty * l.unitPriceIqd * (1 - l.discountPct / 100)).toLocaleString()}
                    </td>
                    <td className="p-2">
                      <button
                        onClick={() => remove(l.lineId)}
                        className="rounded bg-rose-100 px-2 py-1 text-rose-700 hover:bg-rose-200"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Right: Totals + Payment */}
      <div className="flex w-1/3 flex-col bg-white p-6">
        <div className="mb-6 rounded-lg bg-slate-50 p-4">
          <Row label="الإجمالي قبل الخصم" value={subtotal()} />
          <Row label="الخصم" value={-discount()} />
          <hr className="my-2" />
          <div className="flex justify-between text-2xl font-bold">
            <span>المجموع</span>
            <span className="text-sky-800">{total().toLocaleString()} د.ع</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <PayBtn label="نقدي (F9)" icon="💵" onClick={() => onPay('cash')} color="bg-emerald-600" />
          <PayBtn label="بطاقة" icon="💳" onClick={() => onPay('card')} color="bg-sky-700" />
          <PayBtn label="ZainCash" icon="📱" onClick={() => onPay('zaincash')} color="bg-amber-500" />
          <PayBtn label="تعليق" icon="⏸️" onClick={() => alert('TODO: hold')} color="bg-slate-500" />
        </div>

        <button
          onClick={clear}
          className="mt-auto rounded border border-slate-300 py-2 text-slate-600 hover:bg-slate-100"
        >
          إلغاء السلة
        </button>

        <div className="mt-4 text-center text-xs text-slate-400">
          الكاشير: {shift?.cashierId}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-slate-600">{label}</span>
      <span>{value.toLocaleString()} د.ع</span>
    </div>
  );
}

function PayBtn({
  label,
  icon,
  onClick,
  color,
}: {
  label: string;
  icon: string;
  onClick: () => void;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`${color} flex flex-col items-center justify-center rounded-lg py-6 text-white shadow hover:opacity-90`}
    >
      <span className="text-3xl">{icon}</span>
      <span className="mt-1 text-sm font-semibold">{label}</span>
    </button>
  );
}

import { useState } from 'react';
import { useShiftStore } from '../stores/shift-store';
import { ulid } from 'ulid';

const DENOMINATIONS = [50000, 25000, 10000, 5000, 1000, 500, 250];

export function ShiftOpen() {
  const { open } = useShiftStore();
  const [cashierId] = useState('cashier-demo');  // TODO: from login
  const [counts, setCounts] = useState<Record<number, number>>({});

  const openingCash = DENOMINATIONS.reduce(
    (sum, d) => sum + d * (counts[d] ?? 0),
    0,
  );

  const onOpen = async () => {
    // TODO: call API /pos/shifts/open; for now create local
    const shift = {
      id: ulid(),
      shiftNumber: `SHIFT-LOCAL-${Date.now()}`,
      cashierId,
      posDeviceId: 'POS-001',
      openingCashIqd: openingCash,
      openedAt: new Date().toISOString(),
    };
    open(shift);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <div className="w-full max-w-2xl rounded-xl bg-white p-8 shadow-lg">
        <h1 className="mb-2 text-3xl font-bold text-sky-800">افتح وردية جديدة</h1>
        <p className="mb-6 text-slate-600">
          عدّ النقد الافتتاحي بالفئات قبل البدء
        </p>

        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {DENOMINATIONS.map((d) => (
            <div key={d} className="rounded-lg border p-3">
              <label className="block text-sm text-slate-500">{d.toLocaleString()} د.ع</label>
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded border px-3 py-2 text-lg font-semibold"
                value={counts[d] ?? ''}
                onChange={(e) =>
                  setCounts((c) => ({ ...c, [d]: parseInt(e.target.value || '0') }))
                }
              />
              <div className="mt-1 text-xs text-slate-400">
                = {(d * (counts[d] ?? 0)).toLocaleString()} د.ع
              </div>
            </div>
          ))}
        </div>

        <div className="mb-6 rounded-lg bg-sky-50 p-4 text-center">
          <div className="text-sm text-slate-600">إجمالي النقد الافتتاحي</div>
          <div className="text-3xl font-bold text-sky-800">
            {openingCash.toLocaleString()} د.ع
          </div>
        </div>

        <button
          onClick={onOpen}
          disabled={openingCash <= 0}
          className="w-full rounded-lg bg-sky-700 py-4 text-lg font-bold text-white hover:bg-sky-800 disabled:bg-slate-300"
        >
          افتح الوردية
        </button>
      </div>
    </div>
  );
}

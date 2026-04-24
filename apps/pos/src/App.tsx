import { useState } from 'react';
import { ShiftOpen } from './screens/ShiftOpen';
import { PosSale } from './screens/PosSale';
import { ShiftClose } from './screens/ShiftClose';
import { useShiftStore } from './stores/shift-store';

export function App() {
  const { shift, reset } = useShiftStore();
  const [screen, setScreen] = useState<'sale' | 'close'>('sale');

  if (!shift) {
    return <ShiftOpen />;
  }

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <header className="flex items-center justify-between border-b bg-white px-6 py-3">
        <div className="flex items-center gap-4">
          <div className="text-xl font-bold text-sky-700">الرؤية العربية · POS</div>
          <div className="text-sm text-slate-500">
            وردية: <span className="font-mono">{shift.shiftNumber}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            className={`rounded px-4 py-2 text-sm font-medium ${
              screen === 'sale' ? 'bg-sky-700 text-white' : 'bg-slate-200 text-slate-700'
            }`}
            onClick={() => setScreen('sale')}
          >
            بيع (F1)
          </button>
          <button
            className={`rounded px-4 py-2 text-sm font-medium ${
              screen === 'close' ? 'bg-rose-600 text-white' : 'bg-slate-200 text-slate-700'
            }`}
            onClick={() => setScreen('close')}
          >
            إغلاق الوردية
          </button>
          <button
            className="rounded bg-slate-300 px-3 py-2 text-sm"
            onClick={() => {
              if (confirm('خروج بدون حفظ؟')) reset();
            }}
          >
            خروج
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        {screen === 'sale' ? <PosSale /> : <ShiftClose onClosed={() => reset()} />}
      </main>
    </div>
  );
}

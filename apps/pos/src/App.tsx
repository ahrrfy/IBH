import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ShiftOpen } from './screens/ShiftOpen';
import { PosSale } from './screens/PosSale';
import { ShiftClose } from './screens/ShiftClose';
import { LicenseBlocked } from './screens/LicenseBlocked';
import { useShiftStore } from './stores/shift-store';

interface OfflineLicenseStatus {
  status: string;
  allowed: boolean;
  expiresAt: string | null;
  daysRemaining: number | null;
  offlineGraceDaysRemaining: number | null;
  fingerprintHash: string | null;
  planCode: string | null;
  reason: string | null;
}

export function App() {
  const { shift, reset } = useShiftStore();
  const [screen, setScreen] = useState<'sale' | 'close'>('sale');

  // T66 — defense-in-depth offline license gate. POS refuses to run
  // when the cached activation token is missing, tampered, or past
  // its 7-day offline grace window. The check is purely local: it
  // verifies the RSA-2048 signature against the bundled public key
  // and inspects the validUntil claim.
  const [license, setLicense] = useState<OfflineLicenseStatus | null>(null);
  const [licenseChecked, setLicenseChecked] = useState(false);

  const runLicenseCheck = async () => {
    try {
      const status = await invoke<OfflineLicenseStatus>('check_offline_license');
      setLicense(status);
    } catch (e) {
      // Treat any error as a hard block — fail closed.
      setLicense({
        status: 'invalid',
        allowed: false,
        expiresAt: null,
        daysRemaining: null,
        offlineGraceDaysRemaining: null,
        fingerprintHash: null,
        planCode: null,
        reason: String(e),
      });
    } finally {
      setLicenseChecked(true);
    }
  };

  useEffect(() => {
    void runLicenseCheck();
  }, []);

  if (!licenseChecked) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        جارٍ التحقق من الترخيص...
      </div>
    );
  }

  if (license && !license.allowed) {
    return (
      <LicenseBlocked
        status={license.status}
        reason={license.reason}
        expiresAt={license.expiresAt}
        onRetry={() => {
          setLicenseChecked(false);
          void runLicenseCheck();
        }}
      />
    );
  }

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

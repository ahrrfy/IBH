'use client';

import { useEffect } from 'react';
import { useRealtimeStatus } from '@/lib/realtime/use-live-resource';
import { connect } from '@/lib/realtime/socket-client';

/**
 * Tiny live-connection indicator for the topbar (T31).
 *
 * Green dot = realtime websocket connected (data is live).
 * Amber dot = disconnected — pages still work but won't auto-refresh.
 *
 * Triggers an initial connect() on mount so the socket comes up as soon
 * as the authenticated shell renders.
 */
export function ConnectionStatus() {
  const connected = useRealtimeStatus();

  useEffect(() => {
    connect();
  }, []);

  return (
    <div
      className="flex items-center gap-1.5 text-xs text-muted-foreground"
      title={connected ? 'متصل لحظياً' : 'غير متصل — البيانات قد تكون قديمة'}
      aria-label={connected ? 'realtime connected' : 'realtime disconnected'}
    >
      <span
        className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-amber-500'}`}
      />
      <span className="hidden sm:inline">{connected ? 'مباشر' : 'غير متصل'}</span>
    </div>
  );
}

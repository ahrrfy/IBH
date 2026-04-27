'use client';

import { useEffect, useState } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { onRealtime, onRealtimeStatus } from './socket-client';

/**
 * Subscribe to one or more realtime events and invalidate the given React
 * Query key whenever any of them fire. This is the primary integration point
 * for "live" pages.
 *
 * Example:
 *   useLiveResource(['inventory', branchId], ['inventory.changed', 'stock.adjusted']);
 *
 * Optional `match` filter: only invalidate when the event payload satisfies
 * the predicate (e.g. matches the current branchId).
 */
export function useLiveResource<TPayload = unknown>(
  queryKey: QueryKey,
  events: string | string[],
  match?: (payload: TPayload) => boolean,
): void {
  const qc = useQueryClient();

  useEffect(() => {
    const list = Array.isArray(events) ? events : [events];
    const offs = list.map((evt) =>
      onRealtime(evt, (raw) => {
        const payload = (raw as { payload?: TPayload })?.payload as TPayload;
        if (match && !match(payload)) return;
        qc.invalidateQueries({ queryKey });
      }),
    );
    return () => {
      offs.forEach((off) => off());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, JSON.stringify(queryKey), Array.isArray(events) ? events.join('|') : events]);
}

/**
 * Subscribe a callback to one realtime event. Cleans up on unmount.
 */
export function useRealtimeEvent<TPayload = unknown>(
  event: string,
  handler: (payload: TPayload) => void,
): void {
  useEffect(() => {
    const off = onRealtime(event, (raw) => {
      const payload = (raw as { payload?: TPayload })?.payload as TPayload;
      handler(payload);
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);
}

/**
 * Reactive connection status — true when the websocket is connected.
 */
export function useRealtimeStatus(): boolean {
  const [connected, setConnected] = useState(false);
  useEffect(() => onRealtimeStatus(setConnected), []);
  return connected;
}

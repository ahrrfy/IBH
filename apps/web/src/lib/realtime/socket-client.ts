'use client';

import { io, Socket } from 'socket.io-client';
import { getToken } from '@/lib/api';

/**
 * Real-time client (T31).
 *
 * - Singleton Socket.io client connected to <API>/realtime.
 * - Auth token is read from `auth.ts` storage at connect time and refreshed
 *   on reconnect. If the token is missing the client stays disconnected.
 * - Exposes a tiny pub/sub on top of socket.io so React hooks can
 *   subscribe by event name without leaking listener counts.
 */

type Listener = (payload: unknown) => void;

interface ConnectedMeta {
  userId: string;
  companyId: string | null;
  branchId: string | null;
  rooms: string[];
  serverTime: string;
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

let socket: Socket | null = null;
let connectedMeta: ConnectedMeta | null = null;
const listeners = new Map<string, Set<Listener>>();
const statusListeners = new Set<(connected: boolean) => void>();

function readToken(): string | null {
  return getToken();
}

function notifyStatus(connected: boolean): void {
  statusListeners.forEach((fn) => {
    try {
      fn(connected);
    } catch {
      /* ignore listener errors */
    }
  });
}

function ensureSocket(): Socket | null {
  if (typeof window === 'undefined') return null;
  if (socket) return socket;

  const token = readToken();
  if (!token) return null;

  socket = io(`${API_BASE}/realtime`, {
    transports: ['websocket'],
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
  });

  socket.on('connect', () => notifyStatus(true));
  socket.on('disconnect', () => notifyStatus(false));
  socket.on('connect_error', () => notifyStatus(false));
  socket.on('connected', (meta: ConnectedMeta) => {
    connectedMeta = meta;
  });
  socket.on('auth_error', () => {
    // Token rejected — drop the socket so the next subscriber retries
    // with a (presumably refreshed) token.
    disconnect();
  });

  // Refresh token on each reconnect attempt.
  socket.io.on('reconnect_attempt', () => {
    const fresh = readToken();
    if (fresh && socket) {
      socket.auth = { token: fresh };
    }
  });

  return socket;
}

/**
 * Subscribe to a named realtime event. Returns an unsubscribe function.
 * Multiple subscribers per event share a single underlying socket listener.
 */
export function onRealtime(event: string, fn: Listener): () => void {
  let bucket = listeners.get(event);
  if (!bucket) {
    bucket = new Set();
    listeners.set(event, bucket);
    const sock = ensureSocket();
    if (sock) {
      sock.on(event, (payload: unknown) => {
        listeners.get(event)?.forEach((listener) => {
          try {
            listener(payload);
          } catch {
            /* swallow */
          }
        });
      });
    }
  }
  bucket.add(fn);

  // Best-effort: if socket wasn't ready before, try again now.
  ensureSocket();

  return () => {
    const set = listeners.get(event);
    if (!set) return;
    set.delete(fn);
    if (set.size === 0) {
      listeners.delete(event);
      socket?.off(event);
    }
  };
}

/**
 * Subscribe to connection status changes. Fires immediately with current state.
 */
export function onRealtimeStatus(fn: (connected: boolean) => void): () => void {
  statusListeners.add(fn);
  fn(socket?.connected ?? false);
  return () => {
    statusListeners.delete(fn);
  };
}

/** Force a connection attempt — useful right after login. */
export function connect(): void {
  ensureSocket();
}

/** Disconnect and clear the singleton (e.g. on logout). */
export function disconnect(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  connectedMeta = null;
  listeners.clear();
  notifyStatus(false);
}

export function getConnectionMeta(): ConnectedMeta | null {
  return connectedMeta;
}

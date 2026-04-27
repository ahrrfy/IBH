'use client';

/**
 * Notification bell (T46).
 *
 * - Shows unread count badge.
 * - On click, opens a dropdown with the latest 10 unread notifications.
 * - Subscribes to the realtime `notification.new` event (T31) and
 *   invalidates the React Query cache so badge + list refresh instantly.
 */

import { Bell, Check, CheckCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { onRealtime } from '@/lib/realtime/socket-client';

interface NotificationItem {
  id: string;
  eventType: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

interface NotificationListResponse {
  items: NotificationItem[];
  total: number;
  unreadCount: number;
}

const QUERY_KEY = ['notifications', 'bell'];

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<NotificationListResponse>({
    queryKey: QUERY_KEY,
    queryFn: () =>
      api<NotificationListResponse>('/notifications', {
        query: { unread: 'true', limit: 10, offset: 0 },
      }),
    staleTime: 30_000,
  });

  // ── Realtime: invalidate on new notification ──────────────────────────
  useEffect(() => {
    const off = onRealtime('notification.new', () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });
    return off;
  }, [queryClient]);

  // ── Click outside to close ────────────────────────────────────────────
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  const markRead = useMutation({
    mutationFn: (id: string) =>
      api(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () =>
      api('/notifications/mark-all-read', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const unreadCount = data?.unreadCount ?? 0;
  const items = data?.items ?? [];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
        aria-label="الإشعارات"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -left-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold grid place-items-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 mt-2 w-96 rounded-lg border border-slate-200 bg-white shadow-panel z-50">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <span className="font-semibold text-slate-900">
              الإشعارات{unreadCount > 0 ? ` (${unreadCount})` : ''}
            </span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="flex items-center gap-1 text-xs text-sky-700 hover:text-sky-900 disabled:opacity-50"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                تعليم الكل كمقروء
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="px-4 py-6 text-center text-sm text-slate-500">
                جاري التحميل...
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-slate-500">
                لا توجد إشعارات جديدة
              </div>
            ) : (
              items.map((n) => (
                <div
                  key={n.id}
                  className="flex items-start gap-2 border-b border-slate-100 px-4 py-3 hover:bg-slate-50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">
                      {n.title}
                    </div>
                    <div className="text-xs text-slate-600 line-clamp-2 mt-0.5">
                      {n.body}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      {new Date(n.createdAt).toLocaleString('ar-IQ')}
                    </div>
                  </div>
                  <button
                    onClick={() => markRead.mutate(n.id)}
                    disabled={markRead.isPending}
                    className="p-1 rounded hover:bg-slate-200 text-slate-500"
                    title="تعليم كمقروء"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-slate-200 px-4 py-2 text-center">
            <Link
              href="/notifications"
              className="text-xs text-sky-700 hover:text-sky-900 font-medium"
              onClick={() => setOpen(false)}
            >
              عرض كل الإشعارات
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

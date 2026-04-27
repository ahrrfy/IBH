'use client';

/**
 * Full notifications list page (T46).
 *
 * Lets a user browse every notification they've received with:
 *   - Filter: all / unread / by event type
 *   - Mark a single row as read, or mark all read
 *   - Link to the preferences screen (settings page)
 *
 * Realtime updates from the bell already invalidate the shared
 * `['notifications']` query family, so this page also live-refreshes
 * when a new notification lands.
 */

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { Check, CheckCheck, Settings as SettingsIcon } from 'lucide-react';
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

type FilterMode = 'all' | 'unread';

const PAGE_SIZE = 20;

export default function NotificationsPage() {
  const [mode, setMode] = useState<FilterMode>('all');
  const [eventType, setEventType] = useState<string>('');
  const [page, setPage] = useState(0);
  const queryClient = useQueryClient();

  const queryKey = useMemo(
    () => ['notifications', 'page', { mode, eventType, page }],
    [mode, eventType, page],
  );

  const { data, isLoading } = useQuery<NotificationListResponse>({
    queryKey,
    queryFn: () =>
      api<NotificationListResponse>('/notifications', {
        query: {
          unread: mode === 'unread' ? 'true' : undefined,
          eventType: eventType || undefined,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        },
      }),
  });

  // Live-refresh on new notification.
  useEffect(() => {
    const off = onRealtime('notification.new', () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });
    return off;
  }, [queryClient]);

  const markRead = useMutation({
    mutationFn: (id: string) =>
      api(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllRead = useMutation({
    mutationFn: () =>
      api('/notifications/mark-all-read', { method: 'POST' }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const unreadCount = data?.unreadCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Build event-type filter chips from the visible page.
  const eventTypes = useMemo(
    () => Array.from(new Set(items.map((i) => i.eventType))).sort(),
    [items],
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">الإشعارات</h1>
          <p className="text-sm text-slate-500 mt-1">
            {unreadCount > 0
              ? `${unreadCount} إشعار غير مقروء`
              : 'كل الإشعارات مقروءة'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100 disabled:opacity-50"
            >
              <CheckCheck className="h-4 w-4" />
              تعليم الكل كمقروء
            </button>
          )}
          <Link
            href="/settings"
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50"
          >
            <SettingsIcon className="h-4 w-4" />
            تفضيلات الإشعارات
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          onClick={() => {
            setMode('all');
            setPage(0);
          }}
          className={`px-3 py-1.5 text-sm rounded-lg border ${
            mode === 'all'
              ? 'bg-sky-700 text-white border-sky-700'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          الكل
        </button>
        <button
          onClick={() => {
            setMode('unread');
            setPage(0);
          }}
          className={`px-3 py-1.5 text-sm rounded-lg border ${
            mode === 'unread'
              ? 'bg-sky-700 text-white border-sky-700'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          غير المقروءة
        </button>
        <div className="h-5 w-px bg-slate-200 mx-1" />
        <button
          onClick={() => {
            setEventType('');
            setPage(0);
          }}
          className={`px-2 py-1 text-xs rounded ${
            eventType === ''
              ? 'bg-slate-200 text-slate-900'
              : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          كل الأنواع
        </button>
        {eventTypes.map((et) => (
          <button
            key={et}
            onClick={() => {
              setEventType(et);
              setPage(0);
            }}
            className={`px-2 py-1 text-xs rounded font-mono ${
              eventType === et
                ? 'bg-slate-200 text-slate-900'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            {et}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">
            جاري التحميل...
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            لا توجد إشعارات
          </div>
        ) : (
          items.map((n) => (
            <div
              key={n.id}
              className={`flex items-start gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 ${
                n.readAt ? '' : 'bg-sky-50/40'
              }`}
            >
              <div
                className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${
                  n.readAt ? 'bg-slate-300' : 'bg-rose-500'
                }`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-slate-900">
                    {n.title}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {n.eventType}
                  </span>
                </div>
                <div className="text-sm text-slate-600 mt-0.5">{n.body}</div>
                <div className="text-[10px] text-slate-400 mt-1">
                  {new Date(n.createdAt).toLocaleString('ar-IQ')}
                </div>
              </div>
              {!n.readAt && (
                <button
                  onClick={() => markRead.mutate(n.id)}
                  disabled={markRead.isPending}
                  className="p-1.5 rounded hover:bg-slate-200 text-slate-500 shrink-0"
                  title="تعليم كمقروء"
                >
                  <Check className="h-4 w-4" />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <span className="text-slate-500">
            صفحة {page + 1} من {totalPages} — {total} إشعار
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
            >
              السابق
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page + 1 >= totalPages}
              className="px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
            >
              التالي
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

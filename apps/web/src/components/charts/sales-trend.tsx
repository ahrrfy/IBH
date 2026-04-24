'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatIqd } from '@/lib/format';

export interface SalesTrendPoint {
  date: string;  // ISO or display string
  total: number;
}

export function SalesTrendChart({
  data,
  height = 280,
}: {
  data: SalesTrendPoint[];
  height?: number;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-bold text-slate-900">اتجاه المبيعات · آخر 30 يوم</h3>
      </div>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="date"
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#e2e8f0' }}
              reversed
            />
            <YAxis
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#e2e8f0' }}
              orientation="right"
              tickFormatter={(v: number) => new Intl.NumberFormat('ar-IQ', { notation: 'compact' }).format(v)}
            />
            <Tooltip
              contentStyle={{ direction: 'rtl', borderRadius: 8, border: '1px solid #e2e8f0' }}
              formatter={(v: number) => [formatIqd(v), 'الإجمالي']}
              labelStyle={{ color: '#0f172a', fontWeight: 600 }}
            />
            <Line
              type="monotone"
              dataKey="total"
              stroke="#0369a1"
              strokeWidth={2.5}
              dot={{ r: 2, fill: '#0369a1' }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

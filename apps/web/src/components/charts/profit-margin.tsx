'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { formatPct } from '@/lib/format';

export interface BranchMargin {
  branch: string;
  margin: number;  // percent, e.g. 18.4
}

const PALETTE = ['#0369a1', '#0284c7', '#0ea5e9', '#38bdf8', '#f59e0b', '#fb923c', '#10b981'];

export function ProfitMarginChart({
  data,
  height = 280,
}: {
  data: BranchMargin[];
  height?: number;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-bold text-slate-900">هامش الربح حسب الفرع</h3>
      </div>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="branch" stroke="#64748b" fontSize={11} reversed />
            <YAxis
              stroke="#64748b"
              fontSize={11}
              orientation="right"
              tickFormatter={(v: number) => `${v}%`}
            />
            <Tooltip
              contentStyle={{ direction: 'rtl', borderRadius: 8, border: '1px solid #e2e8f0' }}
              formatter={(v: number) => [formatPct(v), 'هامش الربح']}
            />
            <Bar dataKey="margin" radius={[6, 6, 0, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

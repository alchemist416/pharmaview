'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Recall } from '@/lib/types';
import { useMemo } from 'react';

interface RecallTrendLineProps {
  recalls: Recall[];
}

export default function RecallTrendLine({ recalls }: RecallTrendLineProps) {
  const monthlyData = useMemo(() => {
    const months = new Map<string, number>();

    // Build last 12 months
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.set(key, 0);
    }

    for (const r of recalls) {
      if (!r.report_date) continue;
      // FDA dates are YYYYMMDD format
      const dateStr = r.report_date.replace(/-/g, '');
      const year = dateStr.slice(0, 4);
      const month = dateStr.slice(4, 6);
      const key = `${year}-${month}`;
      if (months.has(key)) {
        months.set(key, (months.get(key) || 0) + 1);
      }
    }

    return Array.from(months.entries()).map(([month, count]) => ({
      month: month.slice(5), // Show just MM
      count,
    }));
  }, [recalls]);

  if (monthlyData.length === 0) {
    return <p className="font-mono text-xs text-muted text-center py-4">No data</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={120}>
      <LineChart data={monthlyData}>
        <XAxis
          dataKey="month"
          tick={{ fontSize: 9, fontFamily: 'JetBrains Mono', fill: '#64748b' }}
          axisLine={{ stroke: '#1e2d4a' }}
          tickLine={false}
        />
        <YAxis hide />
        <Tooltip
          contentStyle={{
            backgroundColor: '#0f1629',
            border: '1px solid #1e2d4a',
            borderRadius: '8px',
            fontSize: '11px',
            fontFamily: 'JetBrains Mono',
          }}
        />
        <Line
          type="monotone"
          dataKey="count"
          stroke="#f59e0b"
          strokeWidth={2}
          dot={{ fill: '#f59e0b', r: 2 }}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

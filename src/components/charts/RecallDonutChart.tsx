'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const CLASS_COLORS: Record<string, string> = {
  'Class I': '#ef4444',
  'Class II': '#f59e0b',
  'Class III': '#3b82f6',
};

interface RecallDonutChartProps {
  data: { name: string; value: number }[];
}

export default function RecallDonutChart({ data }: RecallDonutChartProps) {
  if (data.length === 0) {
    return <p className="text-muted font-mono text-xs text-center py-8">No data</p>;
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={160}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={40}
            outerRadius={65}
            dataKey="value"
            stroke="#0f1629"
            strokeWidth={2}
          >
            {data.map((entry) => (
              <Cell
                key={entry.name}
                fill={CLASS_COLORS[entry.name] || '#64748b'}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: '#0f1629',
              border: '1px solid #1e2d4a',
              borderRadius: '8px',
              fontSize: '11px',
              fontFamily: 'JetBrains Mono',
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap justify-center gap-3 mt-2">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: CLASS_COLORS[d.name] || '#64748b' }}
            />
            <span className="font-mono text-[10px] text-muted">
              {d.name} ({d.value})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

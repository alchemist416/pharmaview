'use client';

interface CountryWithPct {
  country: string;
  country_code: string;
  manufacturer_count: number;
  pct: number;
}

interface ConcentrationBarProps {
  countries: CountryWithPct[];
}

const BAR_COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#7c3aed', '#00ff88', '#64748b'];

export default function ConcentrationBar({ countries }: ConcentrationBarProps) {
  const top = countries.slice(0, 6);

  return (
    <div>
      {/* Stacked bar */}
      <div className="flex h-4 rounded overflow-hidden mb-3">
        {top.map((c, i) => (
          <div
            key={c.country_code}
            className="h-full transition-all"
            style={{
              width: `${Math.max(c.pct, 2)}%`,
              backgroundColor: BAR_COLORS[i % BAR_COLORS.length],
            }}
            title={`${c.country}: ${c.pct}%`}
          />
        ))}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {top.map((c, i) => (
          <div key={c.country_code} className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-sm"
              style={{ backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }}
            />
            <span className="font-mono text-[10px] text-muted">
              {c.country_code} {c.pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

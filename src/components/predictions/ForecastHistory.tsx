'use client';

import { Forecast } from '@/lib/signals';

interface HistoryEntry {
  id: string;
  title: string;
  probability: number;
  severity: string;
  created_at: string;
  status: 'monitoring' | 'confirmed' | 'did_not_materialize';
}

interface Props {
  forecasts: Forecast[];
  generatedAt: string;
}

function statusBadge(status: string) {
  switch (status) {
    case 'confirmed':
      return 'bg-red-500/15 text-red-400 border-red-500/30';
    case 'did_not_materialize':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    default:
      return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
  }
}

function statusLabel(status: string) {
  switch (status) {
    case 'confirmed': return 'Confirmed';
    case 'did_not_materialize': return 'Did not materialize';
    default: return 'Monitoring';
  }
}

export default function ForecastHistory({ forecasts, generatedAt }: Props) {
  // Convert current forecasts to history entries (all monitoring since they're current)
  const entries: HistoryEntry[] = forecasts.map((f) => ({
    id: f.id,
    title: f.title,
    probability: f.probability,
    severity: f.severity,
    created_at: generatedAt,
    status: 'monitoring' as const,
  }));

  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-xs font-mono text-muted">
        No forecast history available
      </div>
    );
  }

  return (
    <div className="border border-terminal-border rounded-lg bg-terminal-panel overflow-hidden">
      <div className="px-4 py-3 border-b border-terminal-border">
        <h3 className="text-xs font-mono font-semibold text-primary">FORECAST HISTORY</h3>
        <p className="text-[9px] font-mono text-muted mt-0.5">Track forecast accuracy over time</p>
      </div>

      <div className="divide-y divide-terminal-border/30">
        {/* Header */}
        <div className="grid grid-cols-[1fr_80px_80px_100px] gap-2 px-4 py-2 text-[9px] font-mono text-muted">
          <div>FORECAST</div>
          <div>PROBABILITY</div>
          <div>SEVERITY</div>
          <div className="text-right">STATUS</div>
        </div>

        {entries.map((entry) => (
          <div
            key={entry.id}
            className="grid grid-cols-[1fr_80px_80px_100px] gap-2 px-4 py-2.5 hover:bg-white/[0.02] transition-colors"
          >
            <div className="min-w-0">
              <div className="text-[10px] font-mono text-primary truncate">{entry.title}</div>
              <div className="text-[8px] font-mono text-slate-600 mt-0.5">
                {new Date(entry.created_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </div>
            </div>
            <div className="flex items-center">
              <span className={`text-xs font-mono font-bold ${
                entry.probability >= 70 ? 'text-red-400' :
                entry.probability >= 50 ? 'text-amber-400' : 'text-primary'
              }`}>
                {entry.probability}%
              </span>
            </div>
            <div className="flex items-center">
              <span className={`text-[9px] font-mono ${
                entry.severity === 'CRITICAL' ? 'text-red-400' :
                entry.severity === 'HIGH' ? 'text-amber-400' :
                entry.severity === 'MEDIUM' ? 'text-yellow-400' : 'text-emerald-400'
              }`}>
                {entry.severity}
              </span>
            </div>
            <div className="flex items-center justify-end">
              <span className={`text-[9px] font-mono px-2 py-0.5 rounded border ${statusBadge(entry.status)}`}>
                {statusLabel(entry.status)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

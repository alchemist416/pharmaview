'use client';

import { Signal, SignalSnapshot } from '@/lib/signals';

interface Props {
  snapshot: SignalSnapshot;
}

const TYPE_CONFIG: Record<Signal['type'], { label: string }> = {
  geopolitical: { label: 'Geopolitical' },
  shipping: { label: 'Shipping' },
  currency: { label: 'Currency' },
  enforcement: { label: 'FDA Enforcement' },
  shortage: { label: 'Shortage Trend' },
};

function severityColor(severity: string): string {
  switch (severity) {
    case 'CRITICAL': return 'text-red-400';
    case 'HIGH': return 'text-amber-400';
    case 'MEDIUM': return 'text-yellow-400';
    default: return 'text-emerald-400';
  }
}

function severityDot(severity: string): string {
  switch (severity) {
    case 'CRITICAL': return 'bg-red-500';
    case 'HIGH': return 'bg-amber-500';
    case 'MEDIUM': return 'bg-yellow-500';
    default: return 'bg-emerald-500';
  }
}

function stressBarColor(score: number): string {
  if (score >= 75) return 'bg-red-500';
  if (score >= 50) return 'bg-amber-500';
  if (score >= 25) return 'bg-yellow-500';
  return 'bg-emerald-500';
}

export default function SignalDashboard({ snapshot }: Props) {
  // Find Iran crisis signal specifically
  const iranSignal = snapshot.signals.find((s) => s.id === 'iran-hormuz-2026');

  // Group remaining signals by type, picking highest-score per type
  const byType = new Map<string, Signal>();
  for (const signal of snapshot.signals) {
    if (signal.id === 'iran-hormuz-2026') continue; // handled separately
    const existing = byType.get(signal.type);
    if (!existing || signal.score > existing.score) {
      byType.set(signal.type, signal);
    }
  }

  const allTypes: Signal['type'][] = ['geopolitical', 'shipping', 'currency', 'enforcement', 'shortage'];
  const feedStatus = snapshot.feed_status;

  return (
    <div className="border border-terminal-border rounded-lg bg-terminal-panel">
      <div className="px-4 py-3 border-b border-terminal-border">
        <h3 className="text-xs font-mono font-semibold text-primary">SIGNAL DASHBOARD</h3>
        <p className="text-[9px] font-mono text-muted mt-0.5">
          {feedStatus?.feeds_unavailable
            ? 'Live feeds offline — showing cached data'
            : `${feedStatus?.live_feeds ?? 0}/${feedStatus?.total_feeds ?? snapshot.signals.length} feeds active`
          }
        </p>
      </div>

      {/* Active Geopolitical Event — always visible */}
      {iranSignal && (
        <div className="px-4 py-3 border-b border-red-500/30 bg-red-500/5">
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-2 h-2 rounded-full ${severityDot(iranSignal.severity)} animate-pulse`} />
            <span className="text-[9px] font-mono font-bold text-red-400">ACTIVE GEOPOLITICAL EVENT</span>
          </div>
          <div className="text-[10px] font-mono text-primary leading-tight pl-4">
            Strait of Hormuz Conflict
          </div>
          <div className="flex items-center justify-between mt-1 pl-4">
            <span className="text-[8px] font-mono text-red-400/70">Active since Feb 28, 2026</span>
            <span className="text-[9px] font-mono font-bold text-red-400">{iranSignal.severity}</span>
          </div>
        </div>
      )}

      {/* Overall stress meter */}
      <div className="px-4 py-3 border-b border-terminal-border/50">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[9px] font-mono text-muted">OVERALL STRESS</span>
          <span className={`text-sm font-mono font-bold ${
            snapshot.overall_stress >= 75 ? 'text-red-400' :
            snapshot.overall_stress >= 50 ? 'text-amber-400' :
            snapshot.overall_stress >= 25 ? 'text-yellow-400' : 'text-emerald-400'
          }`}>
            {snapshot.overall_stress}/100
          </span>
        </div>
        <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${stressBarColor(snapshot.overall_stress)}`}
            style={{ width: `${snapshot.overall_stress}%` }}
          />
        </div>
      </div>

      {/* Signal indicators by type */}
      <div className="divide-y divide-terminal-border/30">
        {allTypes.map((type) => {
          const signal = byType.get(type);
          const config = TYPE_CONFIG[type];
          const score = signal?.score ?? 0;
          const severity = signal?.severity ?? 'LOW';
          const isActive = !!signal;

          return (
            <div key={type} className="px-4 py-2.5">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${isActive ? severityDot(severity) : 'bg-slate-700'}`} />
                  <span className="text-[10px] font-mono text-primary">{config.label}</span>
                </div>
                <span className={`text-[9px] font-mono font-semibold ${isActive ? severityColor(severity) : 'text-slate-600'}`}>
                  {isActive ? score : '—'}
                </span>
              </div>
              {signal ? (
                <p className="text-[9px] font-mono text-muted leading-relaxed pl-4 truncate">
                  {signal.title}
                </p>
              ) : (
                <p className="text-[9px] font-mono text-slate-600 pl-4">
                  {feedStatus?.feeds_unavailable ? 'Feed offline' : 'No active signal'}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Feed status footer */}
      <div className="px-4 py-2 border-t border-terminal-border/50">
        {feedStatus?.feeds_unavailable ? (
          <div className="text-[8px] font-mono text-amber-400/70">
            Live feeds temporarily unavailable — showing cached signals
          </div>
        ) : (
          <div className="text-[8px] font-mono text-slate-600">
            SOURCES: {snapshot.sources.slice(0, 3).join(' · ')}
            {snapshot.sources.length > 3 && ` +${snapshot.sources.length - 3} more`}
          </div>
        )}
      </div>
    </div>
  );
}

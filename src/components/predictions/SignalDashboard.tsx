'use client';

import { Signal, SignalSnapshot } from '@/lib/signals';

interface Props {
  snapshot: SignalSnapshot;
}

const TYPE_CONFIG: Record<Signal['type'], { label: string; icon: string }> = {
  geopolitical: { label: 'Geopolitical', icon: '\u{1F534}' },
  shipping: { label: 'Shipping', icon: '\u{1F7E1}' },
  currency: { label: 'Currency', icon: '\u{1F7E1}' },
  enforcement: { label: 'FDA Enforcement', icon: '\u{1F7E2}' },
  shortage: { label: 'Shortage Trend', icon: '\u{1F7E1}' },
};

function severityColor(severity: string): string {
  switch (severity) {
    case 'CRITICAL': return 'text-red-400';
    case 'HIGH': return 'text-amber-400';
    case 'MEDIUM': return 'text-yellow-400';
    default: return 'text-emerald-400';
  }
}

function stressBarColor(score: number): string {
  if (score >= 75) return 'bg-red-500';
  if (score >= 50) return 'bg-amber-500';
  if (score >= 25) return 'bg-yellow-500';
  return 'bg-emerald-500';
}

function signalIcon(signal: Signal): string {
  if (signal.severity === 'CRITICAL') return '\u{1F534}';
  if (signal.severity === 'HIGH') return '\u{1F7E0}';
  if (signal.severity === 'MEDIUM') return '\u{1F7E1}';
  return '\u{1F7E2}';
}

export default function SignalDashboard({ snapshot }: Props) {
  // Group signals by type, picking the highest-severity one per type
  const byType = new Map<string, Signal>();
  for (const signal of snapshot.signals) {
    const existing = byType.get(signal.type);
    if (!existing || signal.score > existing.score) {
      byType.set(signal.type, signal);
    }
  }

  const allTypes: Signal['type'][] = ['geopolitical', 'shipping', 'currency', 'enforcement', 'shortage'];

  return (
    <div className="border border-terminal-border rounded-lg bg-terminal-panel">
      <div className="px-4 py-3 border-b border-terminal-border">
        <h3 className="text-xs font-mono font-semibold text-primary">SIGNAL DASHBOARD</h3>
        <p className="text-[9px] font-mono text-muted mt-0.5">Live data feeding forecast model</p>
      </div>

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

      {/* Signal indicators */}
      <div className="divide-y divide-terminal-border/30">
        {allTypes.map((type) => {
          const signal = byType.get(type);
          const config = TYPE_CONFIG[type];
          const icon = signal ? signalIcon(signal) : '\u{26AA}';
          const score = signal?.score ?? 0;
          const severity = signal?.severity ?? 'LOW';

          return (
            <div key={type} className="px-4 py-2.5">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs">{icon}</span>
                  <span className="text-[10px] font-mono text-primary">{config.label}</span>
                </div>
                <span className={`text-[9px] font-mono font-semibold ${severityColor(severity)}`}>
                  {score}
                </span>
              </div>
              {signal && (
                <p className="text-[9px] font-mono text-muted leading-relaxed pl-5 truncate">
                  {signal.title}
                </p>
              )}
              {!signal && (
                <p className="text-[9px] font-mono text-slate-600 pl-5">No active signal</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Sources */}
      <div className="px-4 py-2 border-t border-terminal-border/50">
        <div className="text-[8px] font-mono text-slate-600">
          SOURCES: {snapshot.sources.slice(0, 3).join(' · ')}
          {snapshot.sources.length > 3 && ` +${snapshot.sources.length - 3} more`}
        </div>
      </div>
    </div>
  );
}

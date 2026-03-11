'use client';

import Link from 'next/link';

interface Prediction {
  drug: string;
  category: string;
  disruption_score: number;
  primary_risk_driver: string;
  trend: 'improving' | 'worsening' | 'stable';
  historical_analogue: string;
  days_since_last_shortage: number;
  prediction: {
    probability: number;
    risk_tier: string;
    predicted_next_window: string | null;
  };
}

interface Props {
  top10: Prediction[];
}

function tierBadge(tier: string) {
  const styles: Record<string, string> = {
    VERY_HIGH: 'bg-red-500/20 text-red-400 border-red-500/30',
    HIGH: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    MODERATE: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
    LOW: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  };
  return styles[tier] || styles.LOW;
}

function trendArrow(trend: string) {
  if (trend === 'worsening') return { icon: '↗', color: 'text-red-400', label: 'Worsening' };
  if (trend === 'improving') return { icon: '↘', color: 'text-emerald-400', label: 'Improving' };
  return { icon: '→', color: 'text-slate-400', label: 'Stable' };
}

function scoreBar(score: number) {
  const color = score >= 70 ? 'bg-red-500' : score >= 45 ? 'bg-amber-500' : score >= 25 ? 'bg-yellow-500' : 'bg-emerald-500';
  return (
    <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${score}%` }} />
    </div>
  );
}

export default function ShortageLeaderboard({ top10 }: Props) {
  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="grid grid-cols-[28px_1fr_80px_90px_64px_80px] gap-2 px-3 py-2 text-[9px] font-mono text-muted border-b border-terminal-border">
        <div>#</div>
        <div>DRUG / CATEGORY</div>
        <div>SCORE</div>
        <div>RISK TIER</div>
        <div>TREND</div>
        <div className="text-right">NEXT WINDOW</div>
      </div>

      {top10.map((drug, idx) => {
        const trend = trendArrow(drug.trend);
        return (
          <Link
            key={drug.drug}
            href={`/predictions/${encodeURIComponent(drug.drug)}`}
            className="grid grid-cols-[28px_1fr_80px_90px_64px_80px] gap-2 px-3 py-2.5 border-b border-terminal-border/50 hover:bg-white/[0.03] transition-colors group"
          >
            {/* Rank */}
            <div className="flex items-center">
              <span className={`font-mono font-bold text-sm ${idx < 3 ? 'text-red-400' : 'text-muted'}`}>
                {idx + 1}
              </span>
            </div>

            {/* Drug name + category + driver */}
            <div className="flex flex-col justify-center min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-semibold text-primary capitalize group-hover:text-accent-green transition-colors">
                  {drug.drug}
                </span>
                <span className="text-[9px] font-mono text-muted px-1.5 py-0.5 bg-white/5 rounded">
                  {drug.category}
                </span>
              </div>
              <span className="text-[9px] font-mono text-muted truncate mt-0.5">
                {drug.primary_risk_driver}
              </span>
            </div>

            {/* Score */}
            <div className="flex flex-col justify-center gap-1">
              <span className={`font-mono text-sm font-bold ${
                drug.disruption_score >= 70 ? 'text-red-400' : drug.disruption_score >= 45 ? 'text-amber-400' : 'text-primary'
              }`}>
                {drug.disruption_score}
              </span>
              {scoreBar(drug.disruption_score)}
            </div>

            {/* Risk Tier */}
            <div className="flex items-center">
              <span className={`text-[9px] font-mono font-semibold px-2 py-0.5 rounded border ${tierBadge(drug.prediction.risk_tier)}`}>
                {drug.prediction.risk_tier.replace('_', ' ')}
              </span>
            </div>

            {/* Trend */}
            <div className="flex items-center gap-1">
              <span className={`text-sm ${trend.color}`}>{trend.icon}</span>
              <span className={`text-[9px] font-mono ${trend.color}`}>{trend.label}</span>
            </div>

            {/* Next Window */}
            <div className="flex items-center justify-end">
              <span className="text-[10px] font-mono text-muted">
                {drug.prediction.predicted_next_window || '—'}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

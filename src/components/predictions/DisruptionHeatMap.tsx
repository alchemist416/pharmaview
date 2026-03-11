'use client';

import { useMemo } from 'react';
import Link from 'next/link';

interface Prediction {
  drug: string;
  category: string;
  disruption_score: number;
  primary_risk_driver: string;
  trend: 'improving' | 'worsening' | 'stable';
}

interface CategorySummary {
  category: string;
  drug_count: number;
  avg_disruption_score: number;
  max_disruption_score: number;
  risk_label: string;
}

interface Props {
  predictions: Prediction[];
  categories: CategorySummary[];
  onSelectCategory?: (category: string) => void;
  selectedCategory?: string | null;
}

function scoreColor(score: number): string {
  if (score >= 70) return 'bg-red-500/80';
  if (score >= 55) return 'bg-red-500/50';
  if (score >= 45) return 'bg-amber-500/60';
  if (score >= 30) return 'bg-amber-500/35';
  if (score >= 20) return 'bg-emerald-500/30';
  return 'bg-emerald-500/15';
}

function scoreBorder(score: number): string {
  if (score >= 70) return 'border-red-500/60';
  if (score >= 45) return 'border-amber-500/40';
  return 'border-emerald-500/20';
}

function trendIcon(trend: string): string {
  if (trend === 'worsening') return '▲';
  if (trend === 'improving') return '▼';
  return '—';
}

function trendColor(trend: string): string {
  if (trend === 'worsening') return 'text-red-400';
  if (trend === 'improving') return 'text-emerald-400';
  return 'text-slate-500';
}

export default function DisruptionHeatMap({ predictions, categories, onSelectCategory, selectedCategory }: Props) {
  // Group predictions by category
  const grouped = useMemo(() => {
    const map = new Map<string, Prediction[]>();
    for (const p of predictions) {
      const arr = map.get(p.category) || [];
      arr.push(p);
      map.set(p.category, arr);
    }
    // Sort categories by avg score desc
    const sorted = Array.from(map.entries()).sort((a, b) => {
      const avgA = a[1].reduce((s, d) => s + d.disruption_score, 0) / a[1].length;
      const avgB = b[1].reduce((s, d) => s + d.disruption_score, 0) / b[1].length;
      return avgB - avgA;
    });
    return sorted;
  }, [predictions]);

  return (
    <div className="space-y-1">
      {/* Category header row */}
      <div className="grid grid-cols-[140px_1fr] gap-2 text-[9px] font-mono text-muted px-1 mb-2">
        <div>CATEGORY</div>
        <div className="flex items-center gap-4">
          <span>DRUG DISRUPTION SCORES</span>
          <span className="ml-auto flex items-center gap-3">
            <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-emerald-500/30 inline-block" /> LOW</span>
            <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-amber-500/50 inline-block" /> MED</span>
            <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-red-500/70 inline-block" /> HIGH</span>
            <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-red-500/90 inline-block" /> CRIT</span>
          </span>
        </div>
      </div>

      {grouped.map(([category, drugs]) => {
        const catSummary = categories.find((c) => c.category === category);
        const isSelected = selectedCategory === category;
        const sortedDrugs = [...drugs].sort((a, b) => b.disruption_score - a.disruption_score);

        return (
          <div
            key={category}
            className={`grid grid-cols-[140px_1fr] gap-2 rounded transition-colors ${
              isSelected ? 'bg-white/5 ring-1 ring-accent-green/30' : 'hover:bg-white/[0.02]'
            }`}
          >
            {/* Category label */}
            <button
              onClick={() => onSelectCategory?.(category)}
              className="text-left px-2 py-2 flex flex-col justify-center"
            >
              <span className="text-xs font-mono font-semibold text-primary truncate">{category}</span>
              <span className="text-[9px] font-mono text-muted">
                {catSummary?.drug_count ?? drugs.length} drugs · avg {catSummary?.avg_disruption_score ?? 0}
              </span>
            </button>

            {/* Drug cells */}
            <div className="flex flex-wrap gap-1 py-1.5 pr-2">
              {sortedDrugs.map((drug) => (
                <Link
                  key={drug.drug}
                  href={`/predictions/${encodeURIComponent(drug.drug)}`}
                  className={`group relative flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-mono transition-all hover:scale-105 hover:z-10 ${scoreColor(drug.disruption_score)} ${scoreBorder(drug.disruption_score)}`}
                  title={`${drug.drug}: ${drug.disruption_score}/100 — ${drug.primary_risk_driver}`}
                >
                  <span className="text-primary font-medium capitalize">{drug.drug}</span>
                  <span className="text-white/70 font-bold">{drug.disruption_score}</span>
                  <span className={`text-[8px] ${trendColor(drug.trend)}`}>{trendIcon(drug.trend)}</span>

                  {/* Hover tooltip */}
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-terminal-panel border border-terminal-border rounded text-[9px] text-muted whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 shadow-lg">
                    {drug.primary_risk_driver}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

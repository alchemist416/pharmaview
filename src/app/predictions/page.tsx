'use client';

import { useEffect, useState, useCallback } from 'react';
import { TrendingUp, TrendingDown, Minus, RefreshCw, DollarSign, AlertTriangle } from 'lucide-react';
import DisruptionHeatMap from '@/components/predictions/DisruptionHeatMap';
import ShortageLeaderboard from '@/components/predictions/ShortageLeaderboard';

interface Prediction {
  drug: string;
  category: string;
  disruption_score: number;
  primary_risk_driver: string;
  trend: 'improving' | 'worsening' | 'stable';
  historical_analogue: string;
  days_since_last_shortage: number;
  active_class_shortages: number;
  prediction: {
    probability: number;
    risk_tier: string;
    predicted_next_window: string | null;
    factors: string[];
  };
  currency_pressure: {
    usd_inr_trend: string;
    usd_cny_trend: string;
    fx_risk_contribution: number;
  };
  concentration_score: number;
  warning_letter_frequency: number;
}

interface CategorySummary {
  category: string;
  drug_count: number;
  avg_disruption_score: number;
  max_disruption_score: number;
  risk_label: string;
  primary_driver: string;
}

interface PredictionData {
  predictions: Prediction[];
  categories: CategorySummary[];
  top_10: Prediction[];
  generated_at: string;
  fx_data: {
    usd_inr: number;
    usd_cny: number;
    usd_inr_6mo_change: number;
    usd_cny_6mo_change: number;
  };
}

function TrendIcon({ trend }: { trend: string }) {
  if (trend === 'weakening') return <TrendingUp size={12} className="text-red-400" />;
  if (trend === 'strengthening') return <TrendingDown size={12} className="text-emerald-400" />;
  return <Minus size={12} className="text-slate-400" />;
}

export default function PredictionsPage() {
  const [data, setData] = useState<PredictionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [view, setView] = useState<'heatmap' | 'leaderboard'>('leaderboard');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/predictions');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load predictions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-accent-green font-mono animate-pulse">COMPUTING DISRUPTION PREDICTIONS...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-red-400 font-mono">ERROR: {error || 'No data'}</div>
      </div>
    );
  }

  const critical = data.predictions.filter((p) => p.disruption_score >= 70).length;
  const high = data.predictions.filter((p) => p.disruption_score >= 45 && p.disruption_score < 70).length;
  const worsening = data.predictions.filter((p) => p.trend === 'worsening').length;

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-mono font-bold text-primary tracking-wider">DISRUPTION PREDICTION ENGINE</h1>
          <p className="text-xs text-muted font-mono mt-1">
            Multi-factor shortage risk scoring across {data.predictions.length} drugs · {data.categories.length} categories
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-terminal-border rounded text-xs font-mono text-muted hover:text-primary hover:bg-white/10 transition-colors"
          >
            <RefreshCw size={12} />
            REFRESH
          </button>
          <span className="text-[9px] font-mono text-muted">
            Updated {new Date(data.generated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="border border-terminal-border rounded-lg bg-terminal-panel p-3">
          <div className="text-[9px] font-mono text-muted mb-1">CRITICAL RISK</div>
          <div className="text-2xl font-mono font-bold text-red-400">{critical}</div>
          <div className="text-[9px] font-mono text-muted">drugs score ≥70</div>
        </div>
        <div className="border border-terminal-border rounded-lg bg-terminal-panel p-3">
          <div className="text-[9px] font-mono text-muted mb-1">HIGH RISK</div>
          <div className="text-2xl font-mono font-bold text-amber-400">{high}</div>
          <div className="text-[9px] font-mono text-muted">drugs score 45-69</div>
        </div>
        <div className="border border-terminal-border rounded-lg bg-terminal-panel p-3">
          <div className="text-[9px] font-mono text-muted mb-1">WORSENING TREND</div>
          <div className="text-2xl font-mono font-bold text-red-400 flex items-center gap-1">
            {worsening}
            <AlertTriangle size={16} className="text-red-400/60" />
          </div>
          <div className="text-[9px] font-mono text-muted">deteriorating outlook</div>
        </div>
        <div className="border border-terminal-border rounded-lg bg-terminal-panel p-3">
          <div className="text-[9px] font-mono text-muted mb-1 flex items-center gap-1">
            <DollarSign size={10} />USD/INR
          </div>
          <div className="text-lg font-mono font-bold text-primary flex items-center gap-1">
            {data.fx_data.usd_inr.toFixed(1)}
            <TrendIcon trend={data.fx_data.usd_inr_6mo_change > 1 ? 'weakening' : data.fx_data.usd_inr_6mo_change < -1 ? 'strengthening' : 'stable'} />
          </div>
          <div className={`text-[9px] font-mono ${data.fx_data.usd_inr_6mo_change > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {data.fx_data.usd_inr_6mo_change > 0 ? '+' : ''}{data.fx_data.usd_inr_6mo_change.toFixed(1)}% 6mo
          </div>
        </div>
        <div className="border border-terminal-border rounded-lg bg-terminal-panel p-3">
          <div className="text-[9px] font-mono text-muted mb-1 flex items-center gap-1">
            <DollarSign size={10} />USD/CNY
          </div>
          <div className="text-lg font-mono font-bold text-primary flex items-center gap-1">
            {data.fx_data.usd_cny.toFixed(2)}
            <TrendIcon trend={data.fx_data.usd_cny_6mo_change > 1 ? 'weakening' : data.fx_data.usd_cny_6mo_change < -1 ? 'strengthening' : 'stable'} />
          </div>
          <div className={`text-[9px] font-mono ${data.fx_data.usd_cny_6mo_change > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {data.fx_data.usd_cny_6mo_change > 0 ? '+' : ''}{data.fx_data.usd_cny_6mo_change.toFixed(1)}% 6mo
          </div>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-1 border border-terminal-border rounded-lg bg-terminal-panel p-0.5 w-fit">
        <button
          onClick={() => setView('leaderboard')}
          className={`px-3 py-1.5 text-xs font-mono rounded transition-colors ${
            view === 'leaderboard' ? 'bg-accent-green/10 text-accent-green' : 'text-muted hover:text-primary'
          }`}
        >
          TOP 10 LEADERBOARD
        </button>
        <button
          onClick={() => setView('heatmap')}
          className={`px-3 py-1.5 text-xs font-mono rounded transition-colors ${
            view === 'heatmap' ? 'bg-accent-green/10 text-accent-green' : 'text-muted hover:text-primary'
          }`}
        >
          CATEGORY HEAT MAP
        </button>
      </div>

      {/* Main content */}
      <div className="border border-terminal-border rounded-lg bg-terminal-panel overflow-hidden">
        {view === 'leaderboard' ? (
          <div>
            <div className="px-4 py-3 border-b border-terminal-border">
              <h2 className="text-sm font-mono font-semibold text-primary">TOP 10 DRUGS MOST LIKELY TO ENTER SHORTAGE</h2>
              <p className="text-[9px] font-mono text-muted mt-0.5">Ranked by composite disruption probability score · Updated monthly</p>
            </div>
            <ShortageLeaderboard top10={data.top_10} />
          </div>
        ) : (
          <div>
            <div className="px-4 py-3 border-b border-terminal-border">
              <h2 className="text-sm font-mono font-semibold text-primary">DRUG CATEGORY DISRUPTION HEAT MAP</h2>
              <p className="text-[9px] font-mono text-muted mt-0.5">
                {data.categories.length} categories · Click category to filter · Click drug for deep-dive
              </p>
            </div>
            <div className="p-3">
              <DisruptionHeatMap
                predictions={data.predictions}
                categories={data.categories}
                onSelectCategory={(cat) => setSelectedCategory(selectedCategory === cat ? null : cat)}
                selectedCategory={selectedCategory}
              />
            </div>
          </div>
        )}
      </div>

      {/* Selected category detail */}
      {selectedCategory && view === 'heatmap' && (
        <div className="border border-terminal-border rounded-lg bg-terminal-panel p-4">
          <h3 className="text-sm font-mono font-semibold text-accent-green mb-3">{selectedCategory.toUpperCase()} — CATEGORY DETAIL</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.predictions
              .filter((p) => p.category === selectedCategory)
              .sort((a, b) => b.disruption_score - a.disruption_score)
              .map((drug) => (
                <a
                  key={drug.drug}
                  href={`/predictions/${encodeURIComponent(drug.drug)}`}
                  className="border border-terminal-border/50 rounded p-3 hover:bg-white/[0.03] transition-colors block"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs font-semibold text-primary capitalize">{drug.drug}</span>
                    <span className={`font-mono text-sm font-bold ${
                      drug.disruption_score >= 70 ? 'text-red-400' : drug.disruption_score >= 45 ? 'text-amber-400' : 'text-emerald-400'
                    }`}>
                      {drug.disruption_score}
                    </span>
                  </div>
                  <div className="space-y-1 text-[9px] font-mono text-muted">
                    <div className="flex justify-between">
                      <span>Primary driver</span>
                      <span className="text-primary truncate ml-2">{drug.primary_risk_driver}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Trend</span>
                      <span className={drug.trend === 'worsening' ? 'text-red-400' : drug.trend === 'improving' ? 'text-emerald-400' : 'text-slate-400'}>
                        {drug.trend}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Historical analogue</span>
                      <span className="text-primary truncate ml-2">{drug.historical_analogue}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Warning letters (12mo)</span>
                      <span className="text-primary">{drug.warning_letter_frequency}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Days since last shortage</span>
                      <span className="text-primary">{drug.days_since_last_shortage > 9000 ? '—' : drug.days_since_last_shortage}</span>
                    </div>
                  </div>
                </a>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

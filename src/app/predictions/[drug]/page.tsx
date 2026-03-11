'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Clock, Shield, Factory, FileWarning, History, type LucideIcon } from 'lucide-react';

interface Prediction {
  drug: string;
  category: string;
  disruption_score: number;
  primary_risk_driver: string;
  trend: 'improving' | 'worsening' | 'stable';
  historical_analogue: string;
  days_since_last_shortage: number;
  active_class_shortages: number;
  composite_risk: {
    overall: number;
    label: string;
    components: {
      shortage_status: number;
      concentration: number;
      country_risk: number;
      inspection_risk: number;
      patent_cliff: number;
      history_risk: number;
    };
    flags: string[];
  };
  prediction: {
    probability: number;
    risk_tier: string;
    factors: string[];
    seasonal_alert: string | null;
    months_since_last: number;
    predicted_next_window: string | null;
  };
  currency_pressure: {
    usd_inr_trend: string;
    usd_cny_trend: string;
    fx_risk_contribution: number;
  };
  concentration_score: number;
  warning_letter_frequency: number;
}

interface PredictionResponse {
  predictions: Prediction[];
  fx_data: {
    usd_inr: number;
    usd_cny: number;
    usd_inr_6mo_change: number;
    usd_cny_6mo_change: number;
  };
}

function TrendBadge({ trend }: { trend: string }) {
  if (trend === 'worsening') return <span className="flex items-center gap-1 text-red-400"><TrendingUp size={14} /> Worsening</span>;
  if (trend === 'improving') return <span className="flex items-center gap-1 text-emerald-400"><TrendingDown size={14} /> Improving</span>;
  return <span className="flex items-center gap-1 text-slate-400"><Minus size={14} /> Stable</span>;
}

function ComponentBar({ label, value, max, icon: Icon }: { label: string; value: number; max: number; icon: LucideIcon }) {
  const pct = (value / max) * 100;
  const color = pct >= 70 ? 'bg-red-500' : pct >= 45 ? 'bg-amber-500' : pct >= 25 ? 'bg-yellow-500' : 'bg-emerald-500';

  return (
    <div className="flex items-center gap-3">
      <Icon size={14} className="text-muted shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-mono text-muted">{label}</span>
          <span className="text-xs font-mono font-bold text-primary">{value}/{max}</span>
        </div>
        <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
          <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

export default function DrugDeepDive({ params }: { params: Promise<{ drug: string }> }) {
  const resolvedParams = use(params);
  const drugName = decodeURIComponent(resolvedParams.drug);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [classDrugs, setClassDrugs] = useState<Prediction[]>([]);
  const [fxData, setFxData] = useState<PredictionResponse['fx_data'] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/predictions');
        if (!res.ok) return;
        const data: PredictionResponse = await res.json();
        const match = data.predictions.find((p) => p.drug.toLowerCase() === drugName.toLowerCase());
        if (match) {
          setPrediction(match);
          setClassDrugs(data.predictions.filter((p) => p.category === match.category && p.drug !== match.drug));
        }
        setFxData(data.fx_data);
      } catch (e) {
        console.error('Failed to load prediction', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [drugName]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-accent-green font-mono animate-pulse">LOADING PREDICTION DATA...</div>
      </div>
    );
  }

  if (!prediction) {
    return (
      <div className="p-6">
        <Link href="/predictions" className="flex items-center gap-1 text-xs font-mono text-muted hover:text-primary mb-4">
          <ArrowLeft size={14} /> Back to Predictions
        </Link>
        <div className="text-red-400 font-mono">Drug &quot;{drugName}&quot; not found in prediction model.</div>
      </div>
    );
  }

  const { composite_risk: risk, prediction: pred } = prediction;
  const scoreColor = prediction.disruption_score >= 70 ? 'text-red-400' : prediction.disruption_score >= 45 ? 'text-amber-400' : 'text-emerald-400';
  const scoreBg = prediction.disruption_score >= 70 ? 'border-red-500/40 bg-red-500/10' : prediction.disruption_score >= 45 ? 'border-amber-500/40 bg-amber-500/10' : 'border-emerald-500/40 bg-emerald-500/10';

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <Link href="/predictions" className="flex items-center gap-1 text-xs font-mono text-muted hover:text-accent-green transition-colors">
        <ArrowLeft size={14} /> Back to Predictions
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-mono font-bold text-primary capitalize">{prediction.drug}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-mono text-muted px-2 py-0.5 bg-white/5 rounded">{prediction.category}</span>
            <TrendBadge trend={prediction.trend} />
          </div>
        </div>
        <div className={`border rounded-lg p-4 text-center ${scoreBg}`}>
          <div className="text-[9px] font-mono text-muted mb-0.5">DISRUPTION SCORE</div>
          <div className={`text-4xl font-mono font-black ${scoreColor}`}>{prediction.disruption_score}</div>
          <div className={`text-xs font-mono font-semibold ${scoreColor}`}>{risk.label}</div>
        </div>
      </div>

      {/* Key metrics row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="border border-terminal-border rounded-lg bg-terminal-panel p-3">
          <div className="text-[9px] font-mono text-muted mb-1">SHORTAGE PROBABILITY</div>
          <div className="text-lg font-mono font-bold text-primary">{(pred.probability * 100).toFixed(0)}%</div>
          <div className={`text-[9px] font-mono ${
            pred.risk_tier === 'VERY_HIGH' ? 'text-red-400' : pred.risk_tier === 'HIGH' ? 'text-amber-400' : 'text-muted'
          }`}>
            {pred.risk_tier.replace('_', ' ')} tier
          </div>
        </div>
        <div className="border border-terminal-border rounded-lg bg-terminal-panel p-3">
          <div className="text-[9px] font-mono text-muted mb-1">DAYS SINCE LAST SHORTAGE</div>
          <div className="text-lg font-mono font-bold text-primary">
            {prediction.days_since_last_shortage > 9000 ? '—' : prediction.days_since_last_shortage}
          </div>
          <div className="text-[9px] font-mono text-muted">
            {pred.predicted_next_window ? `Next window: ${pred.predicted_next_window}` : 'No predicted window'}
          </div>
        </div>
        <div className="border border-terminal-border rounded-lg bg-terminal-panel p-3">
          <div className="text-[9px] font-mono text-muted mb-1">WARNING LETTERS (12MO)</div>
          <div className="text-lg font-mono font-bold text-primary">{prediction.warning_letter_frequency}</div>
          <div className="text-[9px] font-mono text-muted">FDA facility warnings</div>
        </div>
        <div className="border border-terminal-border rounded-lg bg-terminal-panel p-3">
          <div className="text-[9px] font-mono text-muted mb-1">CLASS SHORTAGES</div>
          <div className="text-lg font-mono font-bold text-primary">{prediction.active_class_shortages}</div>
          <div className="text-[9px] font-mono text-muted">active in {prediction.category}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Risk Component Breakdown */}
        <div className="border border-terminal-border rounded-lg bg-terminal-panel p-4">
          <h2 className="text-sm font-mono font-semibold text-accent-green mb-4">RISK COMPONENT BREAKDOWN</h2>
          <div className="space-y-3">
            <ComponentBar label="Shortage Status" value={risk.components.shortage_status} max={20} icon={Shield} />
            <ComponentBar label="Manufacturer Concentration" value={risk.components.concentration} max={20} icon={Factory} />
            <ComponentBar label="Country / Geopolitical Risk" value={risk.components.country_risk} max={15} icon={Shield} />
            <ComponentBar label="FDA Inspection Risk" value={risk.components.inspection_risk} max={15} icon={FileWarning} />
            <ComponentBar label="Patent Cliff" value={risk.components.patent_cliff} max={15} icon={Clock} />
            <ComponentBar label="Historical Recurrence" value={risk.components.history_risk} max={15} icon={History} />
          </div>
          <div className="mt-4 pt-3 border-t border-terminal-border/50">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-muted">FX Pressure Contribution</span>
              <span className="text-primary">{prediction.currency_pressure.fx_risk_contribution}/10</span>
            </div>
            <div className="flex items-center gap-4 mt-1 text-[9px] font-mono text-muted">
              <span>INR: {prediction.currency_pressure.usd_inr_trend}</span>
              <span>CNY: {prediction.currency_pressure.usd_cny_trend}</span>
              {fxData && <span className="ml-auto">INR {fxData.usd_inr.toFixed(1)} · CNY {fxData.usd_cny.toFixed(2)}</span>}
            </div>
          </div>
        </div>

        {/* Prediction Details */}
        <div className="space-y-4">
          {/* Primary driver */}
          <div className="border border-terminal-border rounded-lg bg-terminal-panel p-4">
            <h2 className="text-sm font-mono font-semibold text-accent-green mb-2">PRIMARY RISK DRIVER</h2>
            <p className="text-sm font-mono text-primary">{prediction.primary_risk_driver}</p>
          </div>

          {/* Historical analogue */}
          <div className="border border-terminal-border rounded-lg bg-terminal-panel p-4">
            <h2 className="text-sm font-mono font-semibold text-accent-green mb-2">HISTORICAL ANALOGUE</h2>
            <p className="text-sm font-mono text-primary">{prediction.historical_analogue}</p>
            <p className="text-[9px] font-mono text-muted mt-1">
              Closest matching historical disruption period based on current risk factor profile
            </p>
          </div>

          {/* Prediction factors */}
          <div className="border border-terminal-border rounded-lg bg-terminal-panel p-4">
            <h2 className="text-sm font-mono font-semibold text-accent-green mb-2">PREDICTION FACTORS</h2>
            <ul className="space-y-1.5">
              {pred.factors.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-[10px] font-mono text-muted">
                  <span className="text-accent-green mt-0.5">▸</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            {pred.seasonal_alert && (
              <div className="mt-3 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded text-[10px] font-mono text-amber-400">
                ⚠ {pred.seasonal_alert}
              </div>
            )}
          </div>

          {/* Risk flags */}
          {risk.flags.length > 0 && (
            <div className="border border-terminal-border rounded-lg bg-terminal-panel p-4">
              <h2 className="text-sm font-mono font-semibold text-accent-green mb-2">ACTIVE FLAGS</h2>
              <div className="flex flex-wrap gap-1.5">
                {risk.flags.map((flag, i) => (
                  <span key={i} className="text-[9px] font-mono px-2 py-1 rounded border border-red-500/20 bg-red-500/10 text-red-400">
                    {flag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Same-class drugs */}
      {classDrugs.length > 0 && (
        <div className="border border-terminal-border rounded-lg bg-terminal-panel p-4">
          <h2 className="text-sm font-mono font-semibold text-accent-green mb-3">
            OTHER {prediction.category.toUpperCase()} DRUGS
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {classDrugs.sort((a, b) => b.disruption_score - a.disruption_score).map((d) => (
              <Link
                key={d.drug}
                href={`/predictions/${encodeURIComponent(d.drug)}`}
                className="border border-terminal-border/50 rounded p-2 hover:bg-white/[0.03] transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-primary capitalize">{d.drug}</span>
                  <span className={`text-xs font-mono font-bold ${
                    d.disruption_score >= 70 ? 'text-red-400' : d.disruption_score >= 45 ? 'text-amber-400' : 'text-emerald-400'
                  }`}>
                    {d.disruption_score}
                  </span>
                </div>
                <div className="text-[8px] font-mono text-muted mt-0.5 truncate">{d.primary_risk_driver}</div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

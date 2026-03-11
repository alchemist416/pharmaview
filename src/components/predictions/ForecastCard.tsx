'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Forecast } from '@/lib/signals';

interface Props {
  forecast: Forecast;
}

function severityBadge(severity: string) {
  const styles: Record<string, string> = {
    CRITICAL: 'bg-red-500/20 text-red-400 border-red-500/40',
    HIGH: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    MEDIUM: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    LOW: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  };
  return styles[severity] || styles.LOW;
}

function confidenceDots(confidence: string) {
  const filled = confidence === 'HIGH' ? 3 : confidence === 'MEDIUM' ? 2 : 1;
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${
            i <= filled ? 'bg-accent-green' : 'bg-white/10'
          }`}
        />
      ))}
    </div>
  );
}

function ProbabilityArc({ probability }: { probability: number }) {
  const angle = (probability / 100) * 180;
  const rad = (angle * Math.PI) / 180;
  const r = 36;
  const cx = 40;
  const cy = 40;
  const x = cx + r * Math.cos(Math.PI - rad);
  const y = cy - r * Math.sin(Math.PI - rad);
  const largeArc = angle > 90 ? 1 : 0;

  const color =
    probability >= 75
      ? '#ef4444'
      : probability >= 50
        ? '#f59e0b'
        : probability >= 25
          ? '#eab308'
          : '#00ff88';

  return (
    <div className="relative w-20 h-11 flex-shrink-0">
      <svg viewBox="0 0 80 44" className="w-full h-full">
        {/* Background arc */}
        <path
          d={`M 4 40 A 36 36 0 0 1 76 40`}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="5"
          strokeLinecap="round"
        />
        {/* Filled arc */}
        {probability > 0 && (
          <path
            d={`M 4 40 A 36 36 0 ${largeArc} 1 ${x.toFixed(1)} ${y.toFixed(1)}`}
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeLinecap="round"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex items-end justify-center pb-0">
        <span
          className="font-mono text-sm font-bold"
          style={{ color }}
        >
          {probability}%
        </span>
      </div>
    </div>
  );
}

export default function ForecastCard({ forecast }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-terminal-border rounded-lg bg-terminal-panel overflow-hidden">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Probability arc */}
          <ProbabilityArc probability={forecast.probability} />

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span
                className={`text-[9px] font-mono font-semibold px-2 py-0.5 rounded border ${severityBadge(forecast.severity)}`}
              >
                {forecast.severity}
              </span>
              <span className="text-[9px] font-mono text-muted px-1.5 py-0.5 bg-white/5 rounded">
                {forecast.category}
              </span>
              <span className="text-[9px] font-mono text-muted">
                {forecast.timeframe}
              </span>
              <div className="flex items-center gap-1 ml-auto">
                <span className="text-[8px] font-mono text-muted">CONF</span>
                {confidenceDots(forecast.confidence)}
              </div>
            </div>

            <h3 className="text-sm font-mono font-semibold text-primary leading-tight mb-2">
              {forecast.title}
            </h3>

            <p className="text-[11px] font-mono text-muted leading-relaxed mb-2">
              {forecast.primary_driver}
            </p>

            {/* Affected drugs */}
            <div className="flex flex-wrap gap-1 mb-2">
              {forecast.affected_drugs.map((drug) => (
                <span
                  key={drug}
                  className="text-[9px] font-mono px-1.5 py-0.5 bg-red-500/10 text-red-300 border border-red-500/20 rounded"
                >
                  {drug}
                </span>
              ))}
            </div>

            {/* Historical analogue */}
            <div className="text-[9px] font-mono text-muted">
              <span className="text-slate-500">ANALOGUE:</span>{' '}
              <span className="text-primary/70">{forecast.historical_analogue}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Expandable actions */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2 border-t border-terminal-border/50 text-[10px] font-mono text-muted hover:text-primary hover:bg-white/[0.02] transition-colors"
      >
        <span>RECOMMENDED ACTIONS & SIGNALS</span>
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-terminal-border/30">
          {/* Supporting signals */}
          <div>
            <div className="text-[9px] font-mono text-slate-500 mb-1.5 mt-3">SUPPORTING SIGNALS</div>
            <ul className="space-y-1">
              {forecast.supporting_signals.map((signal, i) => (
                <li key={i} className="text-[10px] font-mono text-muted flex items-start gap-1.5">
                  <span className="text-accent-green mt-0.5">▸</span>
                  <span>{signal}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Recommended actions */}
          <div>
            <div className="text-[9px] font-mono text-slate-500 mb-1.5">RECOMMENDED ACTIONS</div>
            <ul className="space-y-1">
              {forecast.recommended_actions.map((action, i) => (
                <li key={i} className="text-[10px] font-mono text-muted flex items-start gap-1.5">
                  <span className="text-amber-400 mt-0.5">{i + 1}.</span>
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Affected countries */}
          <div>
            <div className="text-[9px] font-mono text-slate-500 mb-1">AFFECTED REGIONS</div>
            <div className="flex flex-wrap gap-1">
              {forecast.affected_countries.map((code) => (
                <span
                  key={code}
                  className="text-[9px] font-mono px-1.5 py-0.5 bg-white/5 border border-terminal-border rounded text-muted"
                >
                  {code}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

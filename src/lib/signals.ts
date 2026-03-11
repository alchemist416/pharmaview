// ---------------------------------------------------------------------------
// Signal Detection Engine — shared types & Iran crisis seed data
// ---------------------------------------------------------------------------

export interface Signal {
  id: string;
  type: 'geopolitical' | 'shipping' | 'currency' | 'enforcement' | 'shortage';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  score: number; // 0-100
  title: string;
  summary: string;
  data_points: string[];
  source: string;
  detected_at: string;
}

export interface SignalSnapshot {
  signals: Signal[];
  overall_stress: number; // 0-100
  generated_at: string;
  sources: string[];
  feed_status: {
    total_feeds: number;
    live_feeds: number;
    failed_feeds: number;
    elevated_signals: number;
    feeds_unavailable: boolean;
  };
}

export interface Forecast {
  id: string;
  title: string;
  category: 'Shipping' | 'Geopolitical' | 'Regulatory' | 'Manufacturing' | 'Demand';
  probability: number;
  timeframe: '30 days' | '60 days' | '90 days' | '6 months';
  affected_drugs: string[];
  affected_countries: string[];
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  primary_driver: string;
  supporting_signals: string[];
  historical_analogue: string;
  recommended_actions: string[];
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface ForecastSnapshot {
  forecasts: Forecast[];
  signals: SignalSnapshot;
  generated_at: string;
  critical_alert: string | null;
}

export interface ForecastHistoryEntry {
  id: string;
  forecast_title: string;
  probability: number;
  severity: string;
  created_at: string;
  status: 'monitoring' | 'confirmed' | 'did_not_materialize';
}

// ---------------------------------------------------------------------------
// Iran/Strait of Hormuz hardcoded CRITICAL signal (Feb 28, 2026+)
// ---------------------------------------------------------------------------

export const IRAN_CRISIS_SIGNAL: Signal = {
  id: 'iran-hormuz-2026',
  type: 'geopolitical',
  severity: 'CRITICAL',
  score: 95,
  title: 'US-Iran Military Conflict — Strait of Hormuz Closure',
  summary:
    'Active military conflict since Feb 28, 2026 has effectively closed the Strait of Hormuz. ' +
    'Air cargo capacity reduced 18%. Maersk rerouting via Cape of Good Hope. ' +
    'Freight surcharge $2,000/TEU. India API prices up 20-30%.',
  data_points: [
    'Strait of Hormuz effectively closed since 2026-02-28',
    'Air cargo capacity reduction: 18% (Emirates SkyCargo, Qatar Airways Cargo, FedEx ME affected)',
    'Affected hubs: UAE, Qatar, Bahrain, Kuwait, Iraq',
    'India route disruption: active — API export delays 2-4 weeks',
    'Maersk rerouting all vessels via Cape of Good Hope (+10 days transit)',
    'Freight rate surcharge: $2,000 per TEU',
    'API price increase: 20-30% reported across antibiotics, generics',
    'Most at-risk categories: antibiotics, vitamins, generics, painkillers',
  ],
  source: 'Hardcoded active signal — confirmed geopolitical event',
  detected_at: '2026-02-28T00:00:00Z',
};

// Helper to calculate overall stress from signals
export function calculateOverallStress(signals: Signal[]): number {
  if (signals.length === 0) return 0;
  const weights: Record<Signal['severity'], number> = {
    CRITICAL: 1.0,
    HIGH: 0.7,
    MEDIUM: 0.4,
    LOW: 0.15,
  };
  let weighted = 0;
  let totalWeight = 0;
  for (const s of signals) {
    const w = weights[s.severity];
    weighted += s.score * w;
    totalWeight += w;
  }
  const avg = totalWeight > 0 ? weighted / totalWeight : 0;
  // Boost if any CRITICAL signal exists
  const hasCritical = signals.some((s) => s.severity === 'CRITICAL');
  return Math.min(100, Math.round(hasCritical ? Math.max(avg, 75) : avg));
}

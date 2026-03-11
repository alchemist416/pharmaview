import { NextResponse } from 'next/server';
import { fetchJSON, cachedFetch, cacheHeader } from '@/lib/liveData';
import { Signal, SignalSnapshot, IRAN_CRISIS_SIGNAL, calculateOverallStress } from '@/lib/signals';

export const revalidate = 3600; // 1 hour

// ---------------------------------------------------------------------------
// SIGNAL 1 — Geopolitical Events (ReliefWeb + FDA RSS)
// ---------------------------------------------------------------------------

async function fetchGeopoliticalSignal(): Promise<Signal | null> {
  try {
    const data = await fetchJSON<{
      totalCount?: number;
      data?: { fields?: { name?: string; status?: string; type?: { name: string }[] } }[];
    }>(
      'https://api.reliefweb.int/v1/disasters?appname=pharmaview&filter[field]=status&filter[value]=ongoing&limit=20&fields[include][]=name&fields[include][]=status&fields[include][]=type',
      { timeoutMs: 10000 },
    );

    const disasters = data.data ?? [];
    const count = disasters.length;

    if (count === 0) return null;

    const pharmaRelevant = disasters.filter((d) => {
      const types = (d.fields?.type ?? []).map((t) => t.name.toLowerCase());
      return types.some((t) =>
        ['earthquake', 'flood', 'cyclone', 'tsunami', 'epidemic', 'volcanic eruption', 'storm'].includes(t),
      );
    });

    const score = Math.min(100, pharmaRelevant.length * 12 + count * 3);
    const severity: Signal['severity'] =
      score >= 70 ? 'CRITICAL' : score >= 45 ? 'HIGH' : score >= 20 ? 'MEDIUM' : 'LOW';

    return {
      id: 'geo-reliefweb',
      type: 'geopolitical',
      severity,
      score,
      title: `${count} ongoing disasters worldwide`,
      summary: `${pharmaRelevant.length} pharma-relevant events detected from ${count} total active disasters.`,
      data_points: disasters.slice(0, 5).map((d) => d.fields?.name ?? 'Unknown event'),
      source: 'ReliefWeb Disasters API',
      detected_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[signals] Geopolitical fetch failed:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// SIGNAL 2 — Shipping Stress (FRED PPI Freight proxy)
// ---------------------------------------------------------------------------

async function fetchShippingSignal(): Promise<Signal | null> {
  try {
    const csvText = await fetch(
      'https://fred.stlouisfed.org/graph/fredgraph.csv?id=WPUSI012011',
      { signal: AbortSignal.timeout(10000) },
    ).then((r) => r.text());

    const lines = csvText.trim().split('\n').slice(1); // skip header
    const values = lines
      .map((line) => {
        const [, val] = line.split(',');
        return parseFloat(val);
      })
      .filter((v) => !isNaN(v));

    if (values.length < 4) return null;

    const recent = values.slice(-3);
    const baseline = values.slice(-15, -3);
    const currentAvg = recent.reduce((s, v) => s + v, 0) / recent.length;
    const baselineAvg = baseline.reduce((s, v) => s + v, 0) / baseline.length;
    const pctChange = ((currentAvg - baselineAvg) / baselineAvg) * 100;

    const score = Math.min(100, Math.max(0, Math.round(Math.abs(pctChange) * 3)));
    const severity: Signal['severity'] =
      score >= 70 ? 'CRITICAL' : score >= 45 ? 'HIGH' : score >= 20 ? 'MEDIUM' : 'LOW';

    return {
      id: 'shipping-fred',
      type: 'shipping',
      severity,
      score,
      title: `Freight index ${pctChange > 0 ? '+' : ''}${pctChange.toFixed(1)}% vs 90-day avg`,
      summary: `PPI Freight index at ${currentAvg.toFixed(1)} (baseline ${baselineAvg.toFixed(1)}). ${
        pctChange > 10 ? 'Significant spike detected.' : pctChange > 5 ? 'Moderate elevation.' : 'Within normal range.'
      }`,
      data_points: [
        `Current: ${currentAvg.toFixed(1)}`,
        `90-day baseline: ${baselineAvg.toFixed(1)}`,
        `Change: ${pctChange > 0 ? '+' : ''}${pctChange.toFixed(1)}%`,
      ],
      source: 'FRED WPUSI012011',
      detected_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[signals] Shipping fetch failed:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// SIGNAL 3 — Currency Stress (USD/INR, USD/CNY from FRED)
// ---------------------------------------------------------------------------

async function fetchCurrencySignal(): Promise<Signal | null> {
  try {
    const [inrCsv, cnyCsv] = await Promise.all([
      fetch('https://fred.stlouisfed.org/graph/fredgraph.csv?id=DEXINUS', {
        signal: AbortSignal.timeout(10000),
      }).then((r) => r.text()),
      fetch('https://fred.stlouisfed.org/graph/fredgraph.csv?id=DEXCHUS', {
        signal: AbortSignal.timeout(10000),
      }).then((r) => r.text()),
    ]);

    const parseCSV = (csv: string): number[] =>
      csv
        .trim()
        .split('\n')
        .slice(1)
        .map((line) => parseFloat(line.split(',')[1]))
        .filter((v) => !isNaN(v));

    const inrVals = parseCSV(inrCsv);
    const cnyVals = parseCSV(cnyCsv);

    const calcChange = (vals: number[]): number => {
      if (vals.length < 22) return 0;
      const recent = vals[vals.length - 1];
      const old = vals[vals.length - 22]; // ~30 trading days
      return ((recent - old) / old) * 100;
    };

    const inrChange = calcChange(inrVals);
    const cnyChange = calcChange(cnyVals);
    const flagged = Math.abs(inrChange) > 3 || Math.abs(cnyChange) > 3;

    const maxChange = Math.max(Math.abs(inrChange), Math.abs(cnyChange));
    const score = Math.min(100, Math.round(maxChange * 10));
    const severity: Signal['severity'] =
      score >= 70 ? 'CRITICAL' : score >= 45 ? 'HIGH' : score >= 20 ? 'MEDIUM' : 'LOW';

    return {
      id: 'currency-fred',
      type: 'currency',
      severity,
      score,
      title: `Currency stress: INR ${inrChange > 0 ? '+' : ''}${inrChange.toFixed(1)}%, CNY ${cnyChange > 0 ? '+' : ''}${cnyChange.toFixed(1)}%`,
      summary: flagged
        ? `Significant currency movement detected. ${Math.abs(inrChange) > 3 ? 'USD/INR ' : ''}${Math.abs(cnyChange) > 3 ? 'USD/CNY ' : ''}moved >3% in 30 days.`
        : 'Currency movements within normal range.',
      data_points: [
        `USD/INR 30d change: ${inrChange > 0 ? '+' : ''}${inrChange.toFixed(2)}%`,
        `USD/CNY 30d change: ${cnyChange > 0 ? '+' : ''}${cnyChange.toFixed(2)}%`,
        `Current INR: ${inrVals[inrVals.length - 1]?.toFixed(2) ?? 'N/A'}`,
        `Current CNY: ${cnyVals[cnyVals.length - 1]?.toFixed(2) ?? 'N/A'}`,
      ],
      source: 'FRED DEXINUS + DEXCHUS',
      detected_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[signals] Currency fetch failed:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// SIGNAL 4 — FDA Enforcement Spike
// ---------------------------------------------------------------------------

async function fetchEnforcementSignal(): Promise<Signal | null> {
  try {
    const data = await fetchJSON<{
      meta?: { results?: { total: number } };
      results?: { report_date?: string; classification?: string }[];
    }>(
      'https://api.fda.gov/drug/enforcement.json?limit=50&sort=report_date:desc',
      { timeoutMs: 10000 },
    );

    const results = data.results ?? [];
    const total = data.meta?.results?.total ?? results.length;

    const classI = results.filter((r) => r.classification === 'Class I').length;
    const classII = results.filter((r) => r.classification === 'Class II').length;

    // Heuristic: >20 enforcement actions in last page = elevated
    const score = Math.min(100, Math.round((total / 200) * 40 + classI * 15 + classII * 5));
    const severity: Signal['severity'] =
      score >= 70 ? 'CRITICAL' : score >= 45 ? 'HIGH' : score >= 20 ? 'MEDIUM' : 'LOW';

    return {
      id: 'fda-enforcement',
      type: 'enforcement',
      severity,
      score,
      title: `${total} recent FDA enforcement actions`,
      summary: `${classI} Class I, ${classII} Class II recalls in recent batch. ${
        classI >= 3 ? 'Elevated Class I recall volume.' : 'Normal enforcement pace.'
      }`,
      data_points: [
        `Total enforcement actions: ${total}`,
        `Class I (most serious): ${classI}`,
        `Class II: ${classII}`,
      ],
      source: 'openFDA Drug Enforcement',
      detected_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[signals] FDA enforcement fetch failed:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// SIGNAL 5 — Active Drug Shortages Trend
// ---------------------------------------------------------------------------

async function fetchShortageTrendSignal(): Promise<Signal | null> {
  try {
    const data = await fetchJSON<{
      meta?: { results?: { total: number } };
      results?: { status?: string }[];
    }>(
      'https://api.fda.gov/drug/shortages.json?limit=100',
      { timeoutMs: 10000 },
    );

    const results = data.results ?? [];
    const total = data.meta?.results?.total ?? results.length;
    const active = results.filter((r) => (r.status ?? '').toLowerCase().includes('active')).length;

    // Baseline: ~100 active shortages is normal; >150 = elevated
    const score = Math.min(100, Math.max(0, Math.round((active - 80) * 1.5)));
    const severity: Signal['severity'] =
      score >= 70 ? 'CRITICAL' : score >= 45 ? 'HIGH' : score >= 20 ? 'MEDIUM' : 'LOW';

    return {
      id: 'shortage-trend',
      type: 'shortage',
      severity,
      score,
      title: `${active} active shortages (${total} total tracked)`,
      summary: `${active} drugs currently in active shortage. ${
        active > 150 ? 'Significantly above historical baseline.' : active > 120 ? 'Above baseline.' : 'Near baseline levels.'
      }`,
      data_points: [
        `Active shortages: ${active}`,
        `Total tracked: ${total}`,
        `Historical baseline: ~100`,
      ],
      source: 'openFDA Drug Shortages',
      detected_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[signals] Shortage trend fetch failed:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

async function collectSignals(): Promise<SignalSnapshot> {
  const [geo, shipping, currency, enforcement, shortage] = await Promise.allSettled([
    fetchGeopoliticalSignal(),
    fetchShippingSignal(),
    fetchCurrencySignal(),
    fetchEnforcementSignal(),
    fetchShortageTrendSignal(),
  ]);

  const signals: Signal[] = [
    // Always include the Iran crisis signal
    IRAN_CRISIS_SIGNAL,
  ];

  const sources: string[] = ['Hardcoded: Iran/Hormuz Crisis'];

  for (const result of [geo, shipping, currency, enforcement, shortage]) {
    if (result.status === 'fulfilled' && result.value) {
      signals.push(result.value);
      sources.push(result.value.source);
    }
  }

  return {
    signals,
    overall_stress: calculateOverallStress(signals),
    generated_at: new Date().toISOString(),
    sources,
  };
}

export async function GET() {
  try {
    const result = await cachedFetch<SignalSnapshot>(
      'prediction-signals',
      3600, // 1 hour cache
      collectSignals,
      'prediction-signals.json',
    );

    return NextResponse.json(result.data, {
      headers: cacheHeader(3600),
    });
  } catch (err) {
    console.error('[signals] Failed:', err);
    return NextResponse.json(
      { error: 'Signal detection failed', signals: [IRAN_CRISIS_SIGNAL], overall_stress: 95, generated_at: new Date().toISOString(), sources: [] },
      { status: 500 },
    );
  }
}

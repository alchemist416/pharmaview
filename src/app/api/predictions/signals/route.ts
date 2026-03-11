import { NextResponse } from 'next/server';
import { fetchJSON, cacheHeader } from '@/lib/liveData';
import { Signal, SignalSnapshot, IRAN_CRISIS_SIGNAL, calculateOverallStress } from '@/lib/signals';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Feed result type — tracks success/failure per feed
// ---------------------------------------------------------------------------

interface FeedResult {
  signal: Signal | null;
  source: string;
  ok: boolean;
  error?: string;
}

const TOTAL_LIVE_FEEDS = 5;

// ---------------------------------------------------------------------------
// SIGNAL 1 — Geopolitical Events (ReliefWeb)
// ---------------------------------------------------------------------------

async function fetchGeopoliticalSignal(): Promise<FeedResult> {
  const source = 'ReliefWeb Disasters API';
  try {
    const data = await fetchJSON<{
      totalCount?: number;
      count?: number;
      data?: { fields?: { name?: string; status?: string; type?: { name: string }[] } }[];
    }>(
      'https://api.reliefweb.int/v1/disasters?appname=pharmaview&filter[field]=status&filter[value]=ongoing&limit=20&fields[include][]=name&fields[include][]=status&fields[include][]=type',
      { timeoutMs: 10000 },
    );

    const disasters = data.data ?? [];
    const count = disasters.length;

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
      signal: {
        id: 'geo-reliefweb',
        type: 'geopolitical',
        severity,
        score,
        title: count > 0 ? `${count} ongoing disasters worldwide` : 'No active disasters tracked',
        summary:
          count > 0
            ? `${pharmaRelevant.length} pharma-relevant events from ${count} active disasters.`
            : 'No ongoing disasters detected by ReliefWeb.',
        data_points: count > 0
          ? disasters.slice(0, 5).map((d) => d.fields?.name ?? 'Unknown event')
          : ['No active disasters'],
        source,
        detected_at: new Date().toISOString(),
      },
      source,
      ok: true,
    };
  } catch (err) {
    console.error('[signals] Geopolitical fetch failed:', err instanceof Error ? err.message : err);
    return { signal: null, source, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// SIGNAL 2 — Shipping Stress (FRED PPI Freight proxy)
// ---------------------------------------------------------------------------

async function fetchShippingSignal(): Promise<FeedResult> {
  const source = 'FRED WPUSI012011';
  try {
    const res = await fetch(
      'https://fred.stlouisfed.org/graph/fredgraph.csv?id=WPUSI012011',
      { signal: AbortSignal.timeout(10000) },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const csvText = await res.text();

    const lines = csvText.trim().split('\n').slice(1);
    const values = lines
      .map((line) => {
        const val = line.split(',')[1]?.trim();
        return val === '.' ? NaN : parseFloat(val);
      })
      .filter((v) => !isNaN(v));

    if (values.length < 4) {
      return {
        signal: {
          id: 'shipping-fred',
          type: 'shipping',
          severity: 'LOW',
          score: 5,
          title: 'Freight data: insufficient history',
          summary: `Only ${values.length} data points from FRED. Unable to compute trend.`,
          data_points: [`Data points: ${values.length}`],
          source,
          detected_at: new Date().toISOString(),
        },
        source,
        ok: true,
      };
    }

    const recent = values.slice(-3);
    const baseline = values.slice(-15, -3);
    const currentAvg = recent.reduce((s, v) => s + v, 0) / recent.length;
    const baselineAvg = baseline.length > 0 ? baseline.reduce((s, v) => s + v, 0) / baseline.length : currentAvg;
    const pctChange = baselineAvg !== 0 ? ((currentAvg - baselineAvg) / baselineAvg) * 100 : 0;

    const score = Math.min(100, Math.max(0, Math.round(Math.abs(pctChange) * 3)));
    const severity: Signal['severity'] =
      score >= 70 ? 'CRITICAL' : score >= 45 ? 'HIGH' : score >= 20 ? 'MEDIUM' : 'LOW';

    return {
      signal: {
        id: 'shipping-fred',
        type: 'shipping',
        severity,
        score,
        title: `Freight index ${pctChange > 0 ? '+' : ''}${pctChange.toFixed(1)}% vs baseline`,
        summary: `PPI Freight at ${currentAvg.toFixed(1)} (baseline ${baselineAvg.toFixed(1)}). ${
          pctChange > 10 ? 'Significant spike.' : pctChange > 5 ? 'Moderate elevation.' : 'Within normal range.'
        }`,
        data_points: [
          `Current: ${currentAvg.toFixed(1)}`,
          `Baseline: ${baselineAvg.toFixed(1)}`,
          `Change: ${pctChange > 0 ? '+' : ''}${pctChange.toFixed(1)}%`,
        ],
        source,
        detected_at: new Date().toISOString(),
      },
      source,
      ok: true,
    };
  } catch (err) {
    console.error('[signals] Shipping fetch failed:', err instanceof Error ? err.message : err);
    return { signal: null, source, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// SIGNAL 3 — Currency Stress (USD/INR, USD/CNY from FRED)
// ---------------------------------------------------------------------------

async function fetchCurrencySignal(): Promise<FeedResult> {
  const source = 'FRED DEXINUS + DEXCHUS';
  try {
    const [inrRes, cnyRes] = await Promise.all([
      fetch('https://fred.stlouisfed.org/graph/fredgraph.csv?id=DEXINUS', {
        signal: AbortSignal.timeout(10000),
      }),
      fetch('https://fred.stlouisfed.org/graph/fredgraph.csv?id=DEXCHUS', {
        signal: AbortSignal.timeout(10000),
      }),
    ]);

    if (!inrRes.ok) throw new Error(`INR HTTP ${inrRes.status}`);
    if (!cnyRes.ok) throw new Error(`CNY HTTP ${cnyRes.status}`);

    const [inrCsv, cnyCsv] = await Promise.all([inrRes.text(), cnyRes.text()]);

    const parseCSV = (csv: string): number[] =>
      csv
        .trim()
        .split('\n')
        .slice(1)
        .map((line) => {
          const val = line.split(',')[1]?.trim();
          return val === '.' ? NaN : parseFloat(val);
        })
        .filter((v) => !isNaN(v));

    const inrVals = parseCSV(inrCsv);
    const cnyVals = parseCSV(cnyCsv);

    const calcChange = (vals: number[]): number => {
      if (vals.length < 22) return 0;
      const recent = vals[vals.length - 1];
      const old = vals[vals.length - 22];
      return old !== 0 ? ((recent - old) / old) * 100 : 0;
    };

    const inrChange = calcChange(inrVals);
    const cnyChange = calcChange(cnyVals);
    const flagged = Math.abs(inrChange) > 3 || Math.abs(cnyChange) > 3;

    const maxChange = Math.max(Math.abs(inrChange), Math.abs(cnyChange));
    const score = Math.min(100, Math.round(maxChange * 10));
    const severity: Signal['severity'] =
      score >= 70 ? 'CRITICAL' : score >= 45 ? 'HIGH' : score >= 20 ? 'MEDIUM' : 'LOW';

    return {
      signal: {
        id: 'currency-fred',
        type: 'currency',
        severity,
        score,
        title: `Currency: INR ${inrChange > 0 ? '+' : ''}${inrChange.toFixed(1)}%, CNY ${cnyChange > 0 ? '+' : ''}${cnyChange.toFixed(1)}%`,
        summary: flagged
          ? `Significant currency movement. ${Math.abs(inrChange) > 3 ? 'USD/INR ' : ''}${Math.abs(cnyChange) > 3 ? 'USD/CNY ' : ''}moved >3% in 30d.`
          : 'Currency movements within normal range.',
        data_points: [
          `USD/INR 30d: ${inrChange > 0 ? '+' : ''}${inrChange.toFixed(2)}%`,
          `USD/CNY 30d: ${cnyChange > 0 ? '+' : ''}${cnyChange.toFixed(2)}%`,
          `INR: ${inrVals[inrVals.length - 1]?.toFixed(2) ?? 'N/A'}`,
          `CNY: ${cnyVals[cnyVals.length - 1]?.toFixed(2) ?? 'N/A'}`,
        ],
        source,
        detected_at: new Date().toISOString(),
      },
      source,
      ok: true,
    };
  } catch (err) {
    console.error('[signals] Currency fetch failed:', err instanceof Error ? err.message : err);
    return { signal: null, source, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// SIGNAL 4 — FDA Enforcement Spike
// ---------------------------------------------------------------------------

async function fetchEnforcementSignal(): Promise<FeedResult> {
  const source = 'openFDA Drug Enforcement';
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

    const score = Math.min(100, Math.round((total / 200) * 40 + classI * 15 + classII * 5));
    const severity: Signal['severity'] =
      score >= 70 ? 'CRITICAL' : score >= 45 ? 'HIGH' : score >= 20 ? 'MEDIUM' : 'LOW';

    return {
      signal: {
        id: 'fda-enforcement',
        type: 'enforcement',
        severity,
        score,
        title: `${total} recent FDA enforcement actions`,
        summary: `${classI} Class I, ${classII} Class II recalls. ${
          classI >= 3 ? 'Elevated Class I volume.' : 'Normal enforcement pace.'
        }`,
        data_points: [
          `Total: ${total}`,
          `Class I: ${classI}`,
          `Class II: ${classII}`,
        ],
        source,
        detected_at: new Date().toISOString(),
      },
      source,
      ok: true,
    };
  } catch (err) {
    console.error('[signals] FDA enforcement fetch failed:', err instanceof Error ? err.message : err);
    return { signal: null, source, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// SIGNAL 5 — Active Drug Shortages Trend
// ---------------------------------------------------------------------------

async function fetchShortageTrendSignal(): Promise<FeedResult> {
  const source = 'FDA Drug Shortages';
  try {
    const data = await fetchJSON<{
      meta?: { results?: { total: number } };
      results?: { generic_name?: string; status?: string }[];
    }>(
      'https://api.fda.gov/drug/drugshortages.json?limit=100',
      { timeoutMs: 10000 },
    );

    const results = data.results ?? [];
    const total = data.meta?.results?.total ?? results.length;
    // FDA shortages API may use "Currently in Shortage" or "Active" as status
    const active = results.filter(
      (r) => {
        const s = (r.status ?? '').toLowerCase();
        return s.includes('current') || s.includes('active') || s.includes('shortage');
      },
    ).length;

    const effectiveActive = active > 0 ? active : results.length;
    const score = Math.min(100, Math.max(5, Math.round((effectiveActive / 150) * 60)));
    const severity: Signal['severity'] =
      score >= 70 ? 'CRITICAL' : score >= 45 ? 'HIGH' : score >= 20 ? 'MEDIUM' : 'LOW';

    return {
      signal: {
        id: 'shortage-trend',
        type: 'shortage',
        severity,
        score,
        title: `${effectiveActive} active shortages (${total} total)`,
        summary: `${effectiveActive} drugs in shortage. ${
          effectiveActive > 150 ? 'Significantly above baseline.' : effectiveActive > 120 ? 'Above baseline.' : 'Near baseline.'
        }`,
        data_points: [
          `Active: ${effectiveActive}`,
          `Total tracked: ${total}`,
          `Baseline: ~100`,
        ],
        source,
        detected_at: new Date().toISOString(),
      },
      source,
      ok: true,
    };
  } catch (err) {
    console.error('[signals] Shortage fetch failed:', err instanceof Error ? err.message : err);
    return { signal: null, source, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Main collector — ALWAYS returns a valid snapshot, NEVER throws
// ---------------------------------------------------------------------------

async function collectSignals(): Promise<SignalSnapshot> {
  const results = await Promise.allSettled([
    fetchGeopoliticalSignal(),
    fetchShippingSignal(),
    fetchCurrencySignal(),
    fetchEnforcementSignal(),
    fetchShortageTrendSignal(),
  ]);

  // Iran crisis is ALWAYS present as a visible named signal
  const signals: Signal[] = [IRAN_CRISIS_SIGNAL];
  const sources: string[] = ['ACTIVE GEOPOLITICAL EVENT: Strait of Hormuz Conflict'];

  let liveFeedsOk = 0;
  let failedFeeds = 0;

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const feed = result.value;
      if (feed.ok && feed.signal) {
        signals.push(feed.signal);
        sources.push(feed.source);
        liveFeedsOk++;
      } else if (!feed.ok) {
        failedFeeds++;
        console.warn(`[signals] Feed failed: ${feed.source} — ${feed.error}`);
      }
    } else {
      failedFeeds++;
      console.warn(`[signals] Feed rejected:`, result.reason);
    }
  }

  // Count elevated signals (CRITICAL, HIGH, or score >= 40)
  const elevatedSignals = signals.filter(
    (s) => s.severity === 'CRITICAL' || s.severity === 'HIGH' || s.score >= 40,
  ).length;

  return {
    signals,
    overall_stress: calculateOverallStress(signals),
    generated_at: new Date().toISOString(),
    sources,
    feed_status: {
      total_feeds: TOTAL_LIVE_FEEDS + 1, // +1 for Iran signal
      live_feeds: liveFeedsOk,
      failed_feeds: failedFeeds,
      elevated_signals: elevatedSignals,
      feeds_unavailable: liveFeedsOk === 0,
    },
  };
}

// ---------------------------------------------------------------------------
// GET handler — NEVER returns 500, NEVER returns 0 signals
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const snapshot = await collectSignals();
    return NextResponse.json(snapshot, { headers: cacheHeader(3600) });
  } catch (err) {
    console.error('[signals] Critical failure:', err);

    // Even on total catastrophic failure, return the Iran crisis signal
    const fallback: SignalSnapshot = {
      signals: [IRAN_CRISIS_SIGNAL],
      overall_stress: calculateOverallStress([IRAN_CRISIS_SIGNAL]),
      generated_at: new Date().toISOString(),
      sources: ['ACTIVE GEOPOLITICAL EVENT: Strait of Hormuz Conflict'],
      feed_status: {
        total_feeds: TOTAL_LIVE_FEEDS + 1,
        live_feeds: 0,
        failed_feeds: TOTAL_LIVE_FEEDS,
        elevated_signals: 1,
        feeds_unavailable: true,
      },
    };

    return NextResponse.json(fallback, { headers: cacheHeader(300) });
  }
}

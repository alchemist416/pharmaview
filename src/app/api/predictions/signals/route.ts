import { NextResponse } from 'next/server';
import { cacheHeader } from '@/lib/liveData';
import { Signal, SignalSnapshot, IRAN_CRISIS_SIGNAL, calculateOverallStress } from '@/lib/signals';

export const dynamic = 'force-dynamic';
export const maxDuration = 30; // Allow up to 30s on Vercel Pro, 10s on Free

const FEED_TIMEOUT = 6000; // 6s per feed — all run in parallel, must finish within function timeout

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
// Safe fetch helpers with logging
// ---------------------------------------------------------------------------

async function safeFetchJSON<T>(url: string, source: string): Promise<T> {
  console.log(`[signals] Fetching ${source}...`);
  const start = Date.now();
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FEED_TIMEOUT),
  });
  const body = await res.text();
  const elapsed = Date.now() - start;
  console.log(`[signals] ${source} — status=${res.status} elapsed=${elapsed}ms body=${body.slice(0, 200)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 100)}`);
  return JSON.parse(body) as T;
}

async function safeFetchCSV(url: string, source: string): Promise<string> {
  console.log(`[signals] Fetching ${source}...`);
  const start = Date.now();
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FEED_TIMEOUT),
  });
  const body = await res.text();
  const elapsed = Date.now() - start;
  console.log(`[signals] ${source} — status=${res.status} elapsed=${elapsed}ms lines=${body.split('\n').length} preview=${body.slice(0, 200)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 100)}`);
  return body;
}

function parseCSVValues(csv: string): number[] {
  return csv
    .trim()
    .split('\n')
    .slice(1) // skip header
    .map((line) => {
      const val = line.split(',')[1]?.trim();
      if (!val || val === '.' || val === '') return NaN;
      return parseFloat(val);
    })
    .filter((v) => !isNaN(v));
}

// ---------------------------------------------------------------------------
// SIGNAL 1 — Geopolitical Events (ReliefWeb)
// ---------------------------------------------------------------------------

async function fetchGeopoliticalSignal(): Promise<FeedResult> {
  const source = 'ReliefWeb Disasters API';
  try {
    const data = await safeFetchJSON<{
      totalCount?: number;
      count?: number;
      data?: { fields?: { name?: string; status?: string; type?: { name: string }[] } }[];
    }>(
      'https://api.reliefweb.int/v1/disasters?appname=pharmaview&filter[field]=status&filter[value]=ongoing&limit=20&fields[include][]=name&fields[include][]=status&fields[include][]=type',
      source,
    );

    const disasters = data.data ?? [];
    const count = disasters.length;
    console.log(`[signals] ${source} — parsed ${count} disasters`);

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
    console.error(`[signals] ${source} — FAILED:`, err instanceof Error ? err.message : err);
    return { signal: null, source, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// SIGNAL 2 — Shipping Stress (FRED PPI Freight proxy)
// ---------------------------------------------------------------------------

async function fetchShippingSignal(): Promise<FeedResult> {
  const source = 'FRED Freight (WPUSI012011)';
  try {
    const csvText = await safeFetchCSV(
      'https://fred.stlouisfed.org/graph/fredgraph.csv?id=WPUSI012011',
      source,
    );

    const values = parseCSVValues(csvText);
    console.log(`[signals] ${source} — parsed ${values.length} numeric values`);

    if (values.length < 4) {
      return {
        signal: {
          id: 'shipping-fred',
          type: 'shipping',
          severity: 'LOW',
          score: 5,
          title: 'Freight data: insufficient history',
          summary: `Only ${values.length} data points from FRED.`,
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
    console.error(`[signals] ${source} — FAILED:`, err instanceof Error ? err.message : err);
    return { signal: null, source, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// SIGNAL 3 — Currency Stress (USD/INR, USD/CNY from FRED)
// ---------------------------------------------------------------------------

async function fetchCurrencySignal(): Promise<FeedResult> {
  const source = 'FRED Currency (DEXINUS + DEXCHUS)';
  try {
    // Fetch both in parallel within this feed
    const [inrCsv, cnyCsv] = await Promise.all([
      safeFetchCSV('https://fred.stlouisfed.org/graph/fredgraph.csv?id=DEXINUS', 'FRED USD/INR'),
      safeFetchCSV('https://fred.stlouisfed.org/graph/fredgraph.csv?id=DEXCHUS', 'FRED USD/CNY'),
    ]);

    const inrVals = parseCSVValues(inrCsv);
    const cnyVals = parseCSVValues(cnyCsv);
    console.log(`[signals] ${source} — parsed INR=${inrVals.length} vals, CNY=${cnyVals.length} vals`);

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
    console.error(`[signals] ${source} — FAILED:`, err instanceof Error ? err.message : err);
    return { signal: null, source, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// SIGNAL 4 — FDA Enforcement Spike
// ---------------------------------------------------------------------------

async function fetchEnforcementSignal(): Promise<FeedResult> {
  const source = 'openFDA Enforcement';
  try {
    const data = await safeFetchJSON<{
      meta?: { results?: { total: number } };
      results?: { report_date?: string; classification?: string }[];
    }>(
      'https://api.fda.gov/drug/enforcement.json?limit=50&sort=report_date:desc',
      source,
    );

    const results = data.results ?? [];
    const total = data.meta?.results?.total ?? results.length;
    console.log(`[signals] ${source} — ${results.length} results, total=${total}`);

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
    console.error(`[signals] ${source} — FAILED:`, err instanceof Error ? err.message : err);
    return { signal: null, source, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// SIGNAL 5 — Active Drug Shortages Trend
// openFDA shortages endpoint: https://api.fda.gov/drug/drugshortages.json
// ---------------------------------------------------------------------------

async function fetchShortageTrendSignal(): Promise<FeedResult> {
  const source = 'FDA Drug Shortages';
  try {
    const data = await safeFetchJSON<{
      meta?: { results?: { total: number } };
      results?: { generic_name?: string; status?: string }[];
    }>(
      'https://api.fda.gov/drug/drugshortages.json?limit=100',
      source,
    );

    const results = data.results ?? [];
    const total = data.meta?.results?.total ?? results.length;
    console.log(`[signals] ${source} — ${results.length} results, total=${total}`);

    // FDA shortages may use "Currently in Shortage", "Active", etc.
    const active = results.filter((r) => {
      const s = (r.status ?? '').toLowerCase();
      return s.includes('current') || s.includes('active') || s.includes('shortage');
    }).length;

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
    console.error(`[signals] ${source} — FAILED:`, err instanceof Error ? err.message : err);
    return { signal: null, source, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Main collector — ALWAYS returns a valid snapshot, NEVER throws
// ---------------------------------------------------------------------------

async function collectSignals(): Promise<SignalSnapshot> {
  console.log('[signals] Starting signal collection...');
  const start = Date.now();

  // ALL feeds run in PARALLEL via Promise.allSettled
  const results = await Promise.allSettled([
    fetchGeopoliticalSignal(),
    fetchShippingSignal(),
    fetchCurrencySignal(),
    fetchEnforcementSignal(),
    fetchShortageTrendSignal(),
  ]);

  const elapsed = Date.now() - start;
  console.log(`[signals] All feeds completed in ${elapsed}ms`);

  // Iran crisis is ALWAYS present as a visible named signal
  const signals: Signal[] = [IRAN_CRISIS_SIGNAL];
  const sources: string[] = ['ACTIVE GEOPOLITICAL EVENT: Strait of Hormuz Conflict'];

  let liveFeedsOk = 0;
  let failedFeeds = 0;
  const failedNames: string[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const feed = result.value;
      if (feed.ok && feed.signal) {
        signals.push(feed.signal);
        sources.push(feed.source);
        liveFeedsOk++;
        console.log(`[signals] OK: ${feed.source} — score=${feed.signal.score} severity=${feed.signal.severity}`);
      } else if (!feed.ok) {
        failedFeeds++;
        failedNames.push(feed.source);
        console.warn(`[signals] FEED FAILED: ${feed.source} — ${feed.error}`);
      }
    } else {
      failedFeeds++;
      failedNames.push('unknown');
      console.warn(`[signals] FEED REJECTED:`, result.reason);
    }
  }

  // Count elevated signals (CRITICAL, HIGH, or score >= 40)
  const elevatedSignals = signals.filter(
    (s) => s.severity === 'CRITICAL' || s.severity === 'HIGH' || s.score >= 40,
  ).length;

  console.log(`[signals] SUMMARY: ${signals.length} signals total, ${liveFeedsOk}/${TOTAL_LIVE_FEEDS} live feeds OK, ${failedFeeds} failed [${failedNames.join(', ')}], ${elevatedSignals} elevated`);

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
    console.error('[signals] CRITICAL FAILURE:', err);

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

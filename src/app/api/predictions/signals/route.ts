import { NextResponse } from 'next/server';
import { cacheHeader } from '@/lib/liveData';
import { Signal, SignalSnapshot, IRAN_CRISIS_SIGNAL, calculateOverallStress } from '@/lib/signals';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const FEED_TIMEOUT = 4000; // 4s per feed — all parallel, must fit within function timeout

// ---------------------------------------------------------------------------
// Feed result type
// ---------------------------------------------------------------------------

interface FeedResult {
  signal: Signal | null;
  source: string;
  ok: boolean;
  error?: string;
}

const TOTAL_LIVE_FEEDS = 5;

// FRED API key from environment
const FRED_API_KEY = process.env.FRED_API_KEY || '';

// Pharma-relevant countries for disaster filtering
const PHARMA_COUNTRIES = new Set([
  'india', 'china', 'germany', 'ireland', 'switzerland',
  'united kingdom', 'united states', 'japan', 'south korea', 'singapore',
  'usa', 'uk', 'in', 'cn', 'de', 'ie', 'ch', 'gb', 'jp', 'kr', 'sg',
]);

// ---------------------------------------------------------------------------
// Safe fetch with logging
// ---------------------------------------------------------------------------

async function safeFetch(url: string, source: string): Promise<{ text: string; status: number }> {
  console.log(`[signals] Fetching ${source}...`);
  const start = Date.now();
  const res = await fetch(url, {
    headers: { Accept: 'application/json, application/xml, text/xml, */*' },
    signal: AbortSignal.timeout(FEED_TIMEOUT),
  });
  const text = await res.text();
  const elapsed = Date.now() - start;
  console.log(`[signals] ${source} — status=${res.status} elapsed=${elapsed}ms body=${text.slice(0, 200)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 100)}`);
  return { text, status: res.status };
}

// ---------------------------------------------------------------------------
// FRED JSON API helper
// Replaces broken CSV endpoint with official JSON API
// ---------------------------------------------------------------------------

interface FredObservation {
  date: string;
  value: string;
}

async function fetchFredSeries(seriesId: string, limit = 36): Promise<number[]> {
  if (!FRED_API_KEY) {
    throw new Error('FRED_API_KEY not configured');
  }
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json&limit=${limit}&sort_order=desc`;
  const { text } = await safeFetch(url, `FRED ${seriesId}`);
  const data = JSON.parse(text) as { observations?: FredObservation[] };
  const obs = data.observations ?? [];
  // Filter out missing values (FRED uses '.' for missing)
  const values = obs
    .map((o) => (o.value === '.' ? NaN : parseFloat(o.value)))
    .filter((v) => !isNaN(v));
  console.log(`[signals] FRED ${seriesId} — ${obs.length} observations, ${values.length} valid`);
  // Reverse so oldest is first (API returns desc order)
  return values.reverse();
}

// ---------------------------------------------------------------------------
// SIGNAL 1 — Geopolitical Events (GDACS RSS — no registration required)
// ---------------------------------------------------------------------------

function parseGDACSXml(xml: string): { title: string; type: string; country: string; level: string; date: string }[] {
  const items: { title: string; type: string; country: string; level: string; date: string }[] = [];

  // Simple regex XML parsing — no DOMParser in Node serverless
  const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
  for (const itemXml of itemMatches) {
    const title = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
      ?? itemXml.match(/<title>(.*?)<\/title>/)?.[1]
      ?? '';
    const description = itemXml.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1]
      ?? itemXml.match(/<description>(.*?)<\/description>/)?.[1]
      ?? '';
    const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? '';
    const alertLevel = itemXml.match(/<gdacs:alertlevel>(.*?)<\/gdacs:alertlevel>/)?.[1]
      ?? '';

    // Extract event type from title (e.g., "Green earthquake ...", "Orange flood ...")
    const typeMatch = title.toLowerCase().match(/(earthquake|flood|storm|cyclone|tsunami|volcano|drought|wildfire)/);
    const type = typeMatch ? typeMatch[1] : 'unknown';

    // Extract country from description or title
    const country = description.toLowerCase() || title.toLowerCase();

    items.push({
      title: title.replace(/<[^>]*>/g, '').trim(),
      type,
      country,
      level: alertLevel.toLowerCase() || (title.match(/^(red|orange|green)/i)?.[1]?.toLowerCase() ?? 'green'),
      date: pubDate,
    });
  }

  return items;
}

async function fetchGeopoliticalSignal(): Promise<FeedResult> {
  const source = 'GDACS Disaster Alerts';
  try {
    const { text: xml } = await safeFetch('https://www.gdacs.org/xml/rss.xml', source);
    const allAlerts = parseGDACSXml(xml);
    console.log(`[signals] ${source} — parsed ${allAlerts.length} total alerts`);

    // Filter: red and orange alerts only
    const significant = allAlerts.filter((a) => a.level === 'red' || a.level === 'orange');
    console.log(`[signals] ${source} — ${significant.length} red/orange alerts`);

    // Check if any affect pharma manufacturing countries
    const pharmaAffected = significant.filter((a) =>
      Array.from(PHARMA_COUNTRIES).some((c) => a.country.includes(c)),
    );

    const count = significant.length;
    const score = Math.min(100, pharmaAffected.length * 15 + count * 5);
    const severity: Signal['severity'] =
      score >= 70 ? 'CRITICAL' : score >= 45 ? 'HIGH' : score >= 20 ? 'MEDIUM' : 'LOW';

    return {
      signal: {
        id: 'geo-gdacs',
        type: 'geopolitical',
        severity,
        score,
        title: count > 0 ? `${count} significant disaster alerts` : 'No significant disaster alerts',
        summary: count > 0
          ? `${pharmaAffected.length} alerts in pharma-critical countries from ${count} red/orange GDACS alerts.`
          : 'No red/orange disaster alerts from GDACS.',
        data_points: significant.slice(0, 5).map((a) => `[${a.level.toUpperCase()}] ${a.title}`),
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
// SIGNAL 2 — Shipping Stress (FRED JSON API: WPUSI012011)
// ---------------------------------------------------------------------------

async function fetchShippingSignal(): Promise<FeedResult> {
  const source = 'FRED Freight (WPUSI012011)';
  try {
    const values = await fetchFredSeries('WPUSI012011', 36);

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
// SIGNAL 3 — Currency Stress (FRED JSON API: DEXINUS + DEXCHUS)
// ---------------------------------------------------------------------------

async function fetchCurrencySignal(): Promise<FeedResult> {
  const source = 'FRED Currency (DEXINUS + DEXCHUS)';
  try {
    const [inrVals, cnyVals] = await Promise.all([
      fetchFredSeries('DEXINUS', 60),
      fetchFredSeries('DEXCHUS', 60),
    ]);

    console.log(`[signals] ${source} — INR=${inrVals.length} vals, CNY=${cnyVals.length} vals`);

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
    const { text } = await safeFetch(
      'https://api.fda.gov/drug/enforcement.json?limit=50&sort=report_date:desc',
      source,
    );
    const data = JSON.parse(text) as {
      meta?: { results?: { total: number } };
      results?: { report_date?: string; classification?: string; status?: string }[];
    };

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
// SIGNAL 5 — Shortage Pressure (uses openFDA enforcement as proxy)
// The /drug/drugshortages.json endpoint does NOT exist on openFDA.
// Instead, use enforcement actions with status:"Ongoing" as a proxy
// for shortage pressure — high enforcement correlates with shortages.
// ---------------------------------------------------------------------------

async function fetchShortageTrendSignal(): Promise<FeedResult> {
  const source = 'FDA Shortage Pressure (enforcement proxy)';
  try {
    const { text } = await safeFetch(
      'https://api.fda.gov/drug/enforcement.json?limit=100&search=status:%22Ongoing%22',
      source,
    );
    const data = JSON.parse(text) as {
      meta?: { results?: { total: number } };
      results?: { product_description?: string; classification?: string; reason_for_recall?: string }[];
    };

    const results = data.results ?? [];
    const total = data.meta?.results?.total ?? results.length;
    console.log(`[signals] ${source} — ${results.length} ongoing actions, total=${total}`);

    // Use ongoing enforcement count as shortage pressure indicator
    // Baseline: ~50 ongoing is normal; >100 = elevated
    const score = Math.min(100, Math.max(5, Math.round((total / 150) * 60)));
    const severity: Signal['severity'] =
      score >= 70 ? 'CRITICAL' : score >= 45 ? 'HIGH' : score >= 20 ? 'MEDIUM' : 'LOW';

    // Count quality-related recalls (strong shortage predictor)
    const qualityRelated = results.filter((r) =>
      (r.reason_for_recall ?? '').toLowerCase().match(/cgmp|quality|contamination|sterility|potency|dissolution/),
    ).length;

    return {
      signal: {
        id: 'shortage-trend',
        type: 'shortage',
        severity,
        score,
        title: `${total} ongoing enforcement actions (shortage proxy)`,
        summary: `${total} ongoing FDA enforcement actions. ${qualityRelated} quality-related. ${
          total > 100 ? 'Elevated shortage pressure.' : total > 70 ? 'Above baseline.' : 'Near baseline.'
        }`,
        data_points: [
          `Ongoing actions: ${total}`,
          `Quality-related: ${qualityRelated}`,
          `Baseline: ~50 ongoing`,
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

  const elevatedSignals = signals.filter(
    (s) => s.severity === 'CRITICAL' || s.severity === 'HIGH' || s.score >= 40,
  ).length;

  console.log(`[signals] SUMMARY: ${signals.length} signals, ${liveFeedsOk}/${TOTAL_LIVE_FEEDS} live OK, ${failedFeeds} failed [${failedNames.join(', ')}], ${elevatedSignals} elevated`);

  return {
    signals,
    overall_stress: calculateOverallStress(signals),
    generated_at: new Date().toISOString(),
    sources,
    feed_status: {
      total_feeds: TOTAL_LIVE_FEEDS + 1,
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

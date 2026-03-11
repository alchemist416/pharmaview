import { NextResponse } from 'next/server';
import { cachedFetch, cacheHeader } from '@/lib/liveData';

export const revalidate = 86400; // 24h

const FRED_API_KEY = process.env.FRED_API_KEY || '';
const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

interface FredObs { date: string; value: string }
interface FredResponse { observations?: FredObs[] }

async function fetchFredSeries(seriesId: string, startDate = '1995-01-01'): Promise<FredObs[]> {
  if (!FRED_API_KEY) throw new Error('FRED_API_KEY not configured');

  const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json&observation_start=${startDate}&frequency=a`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`FRED API ${res.status}: ${body.slice(0, 200)}`);
  }

  const data: FredResponse = await res.json();
  return data.observations ?? [];
}

async function fetchMacroData(): Promise<{
  recessions: { start: string; end: string; label: string }[];
  usd_inr: { year: number; rate: number }[];
  freight_index: { year: number; index: number }[];
  description: string;
}> {
  // FRED series:
  //   DEXINUS = USD/INR daily → we get annual
  //   USRECM  = US Recession Indicators (monthly)
  //   DCOILWTICO = WTI Crude Oil as freight proxy

  const [inrObs, oilObs] = await Promise.all([
    fetchFredSeries('DEXINUS'),
    fetchFredSeries('DCOILWTICO'),
  ]);

  const usd_inr = inrObs
    .filter((o) => o.value !== '.')
    .map((o) => ({
      year: parseInt(o.date.slice(0, 4), 10),
      rate: parseFloat(o.value),
    }))
    .filter((d) => d.year >= 1995 && !isNaN(d.rate));

  // Use oil price as freight index proxy (normalize to base 100 in 2000)
  const oilData = oilObs
    .filter((o) => o.value !== '.')
    .map((o) => ({
      year: parseInt(o.date.slice(0, 4), 10),
      value: parseFloat(o.value),
    }))
    .filter((d) => d.year >= 1995 && !isNaN(d.value));

  const base2000 = oilData.find((d) => d.year === 2000)?.value || 30;
  const freight_index = oilData.map((d) => ({
    year: d.year,
    index: Math.round((d.value / base2000) * 100),
  }));

  // NBER recessions (well-known, rarely change)
  const recessions = [
    { start: '2001-03', end: '2001-11', label: 'Dot-com' },
    { start: '2007-12', end: '2009-06', label: 'Great Recession' },
    { start: '2020-02', end: '2020-04', label: 'COVID-19' },
  ];

  return {
    recessions,
    usd_inr,
    freight_index,
    description: 'Macro economic overlays from FRED: recessions, USD/INR exchange rate, freight cost index',
  };
}

export async function GET() {
  try {
    const result = await cachedFetch(
      'atlas-macro',
      86400,
      fetchMacroData,
      'atlas-macro.json',
    );

    const data = result.data as Record<string, unknown>;

    return NextResponse.json({
      ...data,
      source: result.source === 'live' ? 'FRED API (Federal Reserve)' : 'Static fallback',
      last_updated: result.last_updated,
      _live: result.source === 'live',
    }, {
      headers: cacheHeader(86400),
    });
  } catch (err) {
    console.error('[atlas-macro] Failed:', err);
    return NextResponse.json(
      { error: 'Failed to load macro data' },
      { status: 500 },
    );
  }
}

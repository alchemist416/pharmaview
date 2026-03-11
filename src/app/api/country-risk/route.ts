import { NextResponse } from 'next/server';
import { cachedFetch, cacheHeader, fetchJSON } from '@/lib/liveData';
import { CountryRisk } from '@/lib/types';

export const revalidate = 21600; // 6h

const FDA_ENFORCEMENT_URL = 'https://api.fda.gov/drug/enforcement.json';
const RELIEFWEB_API = 'https://api.reliefweb.int/v1/disasters';
const FRED_API_KEY = process.env.FRED_API_KEY || '';

// Countries we track for pharma supply chain
const TRACKED_COUNTRIES: Record<string, { label: string; baseRisk: number }> = {
  US: { label: 'United States', baseRisk: 15 },
  IN: { label: 'India', baseRisk: 45 },
  CN: { label: 'China', baseRisk: 55 },
  DE: { label: 'Germany', baseRisk: 12 },
  GB: { label: 'United Kingdom', baseRisk: 14 },
  CA: { label: 'Canada', baseRisk: 10 },
  CH: { label: 'Switzerland', baseRisk: 8 },
  FR: { label: 'France', baseRisk: 16 },
  IT: { label: 'Italy', baseRisk: 20 },
  JP: { label: 'Japan', baseRisk: 12 },
  KR: { label: 'South Korea', baseRisk: 18 },
  IL: { label: 'Israel', baseRisk: 40 },
  BR: { label: 'Brazil', baseRisk: 35 },
  MX: { label: 'Mexico', baseRisk: 30 },
  IE: { label: 'Ireland', baseRisk: 10 },
  DK: { label: 'Denmark', baseRisk: 8 },
  SE: { label: 'Sweden', baseRisk: 9 },
  FI: { label: 'Finland', baseRisk: 9 },
  ZA: { label: 'South Africa', baseRisk: 42 },
  AU: { label: 'Australia', baseRisk: 11 },
};

async function fetchEnforcementCounts(): Promise<Record<string, number>> {
  try {
    const data = await fetchJSON<{
      results?: { term: string; count: number }[];
    }>(`${FDA_ENFORCEMENT_URL}?count=country_code&limit=100`);
    const counts: Record<string, number> = {};
    for (const r of data.results ?? []) {
      counts[r.term] = r.count;
    }
    return counts;
  } catch {
    return {};
  }
}

async function fetchDisasterCounts(): Promise<Record<string, number>> {
  try {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const dateFilter = oneYearAgo.toISOString().slice(0, 10);

    const data = await fetchJSON<{
      data?: { fields?: { country?: { iso3: string; name: string }[] } }[];
    }>(`${RELIEFWEB_API}?appname=pharmaview&limit=500&filter[field]=date.created&filter[value][from]=${dateFilter}&fields[include][]=country`);

    const counts: Record<string, number> = {};
    // Map ISO3 → ISO2 for countries we track
    const iso3to2: Record<string, string> = {
      USA: 'US', IND: 'IN', CHN: 'CN', DEU: 'DE', GBR: 'GB',
      CAN: 'CA', CHE: 'CH', FRA: 'FR', ITA: 'IT', JPN: 'JP',
      KOR: 'KR', ISR: 'IL', BRA: 'BR', MEX: 'MX', IRL: 'IE',
      DNK: 'DK', SWE: 'SE', FIN: 'FI', ZAF: 'ZA', AUS: 'AU',
    };

    for (const item of data.data ?? []) {
      for (const country of item.fields?.country ?? []) {
        const iso2 = iso3to2[country.iso3];
        if (iso2) {
          counts[iso2] = (counts[iso2] || 0) + 1;
        }
      }
    }
    return counts;
  } catch {
    return {};
  }
}

async function fetchFredCurrency(): Promise<{ inr: number; trend: string }> {
  if (!FRED_API_KEY) return { inr: 0, trend: 'unknown' };
  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=DEXINUS&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=60&frequency=m`;
    const data = await fetchJSON<{ observations?: { value: string }[] }>(url);
    const obs = (data.observations ?? []).filter((o) => o.value !== '.');
    if (obs.length < 2) return { inr: 0, trend: 'unknown' };
    const current = parseFloat(obs[0].value);
    const sixMonthAgo = parseFloat(obs[Math.min(5, obs.length - 1)].value);
    const change = ((current - sixMonthAgo) / sixMonthAgo) * 100;
    return { inr: current, trend: change > 2 ? 'weakening' : change < -2 ? 'strengthening' : 'stable' };
  } catch {
    return { inr: 0, trend: 'unknown' };
  }
}

function riskLabel(score: number): CountryRisk['label'] {
  if (score >= 70) return 'Critical';
  if (score >= 45) return 'High';
  if (score >= 25) return 'Medium';
  return 'Low';
}

async function fetchCountryRisk(): Promise<Record<string, CountryRisk>> {
  const [enforcement, disasters, currency] = await Promise.all([
    fetchEnforcementCounts(),
    fetchDisasterCounts(),
    fetchFredCurrency(),
  ]);

  const result: Record<string, CountryRisk> = {};
  const maxEnforcement = Math.max(1, ...Object.values(enforcement));
  const maxDisasters = Math.max(1, ...Object.values(disasters));

  for (const [code, info] of Object.entries(TRACKED_COUNTRIES)) {
    const enforcementNorm = ((enforcement[code] || 0) / maxEnforcement) * 15;
    const disasterNorm = ((disasters[code] || 0) / maxDisasters) * 10;

    // FX pressure adds risk for countries with INR/CNY exposure
    let fxPressure = 0;
    if (code === 'IN' && currency.trend === 'weakening') fxPressure = 8;
    if (code === 'CN' && currency.trend === 'weakening') fxPressure = 6;

    const risk = Math.min(100, Math.round(info.baseRisk + enforcementNorm + disasterNorm + fxPressure));

    const notes: string[] = [];
    if (enforcement[code]) notes.push(`${enforcement[code]} FDA enforcement actions`);
    if (disasters[code]) notes.push(`${disasters[code]} recent disaster events`);
    if (fxPressure > 0) notes.push(`Currency ${currency.trend}`);
    if (notes.length === 0) notes.push('No significant recent events');

    result[code] = {
      risk,
      label: riskLabel(risk),
      note: notes.join('; '),
    };
  }

  return result;
}

export async function GET() {
  try {
    const result = await cachedFetch(
      'country-risk',
      21600, // 6h
      fetchCountryRisk,
      'country-risk.json',
    );

    return NextResponse.json({
      ...result.data,
      _meta: {
        source: result.source === 'live'
          ? 'FRED + openFDA Enforcement + ReliefWeb Disasters'
          : 'Static fallback',
        last_updated: result.last_updated,
        _live: result.source === 'live',
      },
    }, {
      headers: cacheHeader(21600),
    });
  } catch (err) {
    console.error('[country-risk] Failed:', err);
    return NextResponse.json(
      { error: 'Failed to load country risk data', _meta: { _live: false } },
      { status: 500 },
    );
  }
}

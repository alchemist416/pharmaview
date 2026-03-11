import { NextResponse } from 'next/server';
import { cachedFetch, cacheHeader } from '@/lib/liveData';
import { supabase } from '@/lib/supabase';
import { Establishment } from '@/lib/types';
import { aggregateByCountry } from '@/lib/mapData';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

const FDA_NDC_URL = 'https://api.fda.gov/drug/ndc.json';

const COUNTRY_TO_CODE: Record<string, string> = {
  'United States': 'US', 'USA': 'US', 'Canada': 'CA', 'Mexico': 'MX',
  'Germany': 'DE', 'United Kingdom': 'GB', 'France': 'FR', 'Italy': 'IT',
  'Spain': 'ES', 'Netherlands': 'NL', 'Switzerland': 'CH', 'Sweden': 'SE',
  'Denmark': 'DK', 'Finland': 'FI', 'Ireland': 'IE', 'Belgium': 'BE',
  'Austria': 'AT', 'Norway': 'NO', 'Poland': 'PL', 'Czech Republic': 'CZ',
  'Hungary': 'HU', 'Romania': 'RO', 'Greece': 'GR', 'Portugal': 'PT',
  'China': 'CN', 'Japan': 'JP', 'South Korea': 'KR', 'India': 'IN',
  'Taiwan': 'TW', 'Singapore': 'SG', 'Malaysia': 'MY', 'Thailand': 'TH',
  'Indonesia': 'ID', 'Philippines': 'PH', 'Vietnam': 'VN', 'Bangladesh': 'BD',
  'Pakistan': 'PK', 'Israel': 'IL', 'Saudi Arabia': 'SA', 'Turkey': 'TR',
  'South Africa': 'ZA', 'Egypt': 'EG', 'Nigeria': 'NG', 'Kenya': 'KE',
  'Brazil': 'BR', 'Argentina': 'AR', 'Chile': 'CL', 'Colombia': 'CO',
  'Australia': 'AU', 'New Zealand': 'NZ', 'Russia': 'RU', 'Ukraine': 'UA',
  'Puerto Rico': 'PR',
};

function resolveCountryCode(country: string): string {
  if (!country) return 'US';
  if (COUNTRY_TO_CODE[country]) return COUNTRY_TO_CODE[country];
  if (country.length === 2 && country === country.toUpperCase()) return country;
  const lower = country.toLowerCase();
  for (const [name, code] of Object.entries(COUNTRY_TO_CODE)) {
    if (name.toLowerCase() === lower) return code;
  }
  return country.length === 2 ? country : 'US';
}

function classifyType(productType: string): 'manufacturer' | 'api' | 'repackager' {
  const lower = (productType || '').toLowerCase();
  if (lower.includes('api') || lower.includes('ingredient') || lower.includes('bulk')) return 'api';
  if (lower.includes('repack')) return 'repackager';
  return 'manufacturer';
}

interface EstablishmentData {
  establishments: Establishment[];
}

async function fetchFromSupabase(): Promise<Establishment[] | null> {
  if (!supabase) return null;
  try {
    const { data: rows, error } = await supabase
      .from('establishments')
      .select('*')
      .limit(500);
    if (!error && rows && rows.length > 0) {
      return rows as Establishment[];
    }
  } catch { /* fall through */ }
  return null;
}

async function fetchFdaNdcEstablishments(): Promise<Establishment[]> {
  const fetches = [0, 100, 200].map(async (skip) => {
    const url = new URL(FDA_NDC_URL);
    url.searchParams.set('limit', '100');
    url.searchParams.set('skip', String(skip));
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.results || [];
  });

  const batches = await Promise.allSettled(fetches);
  const allResults = batches.flatMap((b) => b.status === 'fulfilled' ? b.value : []);

  const map = new Map<string, Establishment>();
  let regCounter = 1;

  for (const item of allResults) {
    const firmName = item.labeler_name || 'Unknown';
    const openfda = item.openfda || {};
    const country = openfda.manufacturer_country?.[0] || '';
    const countryCode = country ? resolveCountryCode(country) : 'US';
    const resolvedCountry = country || 'United States';
    const key = `${firmName}-${countryCode}`;

    if (!map.has(key)) {
      map.set(key, {
        firm_name: firmName,
        country_code: countryCode,
        country: resolvedCountry,
        city: '',
        registration_number: `NDC-${regCounter++}`,
        type: classifyType(item.product_type || ''),
      });
    }
  }

  return Array.from(map.values());
}

async function fetchLiveEstablishments(): Promise<EstablishmentData> {
  // Priority 1: Supabase (weekly refresh)
  const supabaseData = await fetchFromSupabase();
  if (supabaseData && supabaseData.length > 0) {
    return { establishments: supabaseData };
  }

  // Priority 2: Live FDA NDC
  const fdaData = await fetchFdaNdcEstablishments();
  return { establishments: fdaData };
}

export async function GET() {
  try {
    const result = await cachedFetch<EstablishmentData>(
      'establishments',
      3600,
      fetchLiveEstablishments,
      'decrs.json',
    );

    const allEstablishments = result.data.establishments;
    const countries = aggregateByCountry(allEstablishments);

    const isSupabaseSource = supabase !== null && result.source === 'live';

    return NextResponse.json({
      countries,
      total_establishments: allEstablishments.length,
      source: result.source === 'live'
        ? (isSupabaseSource ? 'Supabase + openFDA NDC' : 'openFDA NDC Directory')
        : 'DECRS Static Fallback',
      last_updated: result.last_updated,
      _live: result.source === 'live',
    }, {
      headers: cacheHeader(3600),
    });
  } catch (err) {
    console.error('Failed to load establishment data:', err);
    return NextResponse.json(
      { error: 'Failed to load establishment data', countries: [], _live: false },
      { status: 500 },
    );
  }
}

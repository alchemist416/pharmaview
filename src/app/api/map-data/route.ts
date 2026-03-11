import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { Establishment } from '@/lib/types';
import { aggregateByCountry } from '@/lib/mapData';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

const FDA_NDC_URL = 'https://api.fda.gov/drug/ndc.json';

// Comprehensive country name to ISO Alpha-2 mapping
const COUNTRY_TO_CODE: Record<string, string> = {
  // North America
  'United States': 'US', 'USA': 'US', 'United States of America': 'US',
  'Canada': 'CA', 'Mexico': 'MX',
  // Europe
  'Germany': 'DE', 'United Kingdom': 'GB', 'UK': 'GB', 'France': 'FR',
  'Italy': 'IT', 'Spain': 'ES', 'Netherlands': 'NL', 'Belgium': 'BE',
  'Switzerland': 'CH', 'Austria': 'AT', 'Sweden': 'SE', 'Norway': 'NO',
  'Denmark': 'DK', 'Finland': 'FI', 'Ireland': 'IE', 'Portugal': 'PT',
  'Poland': 'PL', 'Czech Republic': 'CZ', 'Czechia': 'CZ',
  'Hungary': 'HU', 'Romania': 'RO', 'Greece': 'GR', 'Bulgaria': 'BG',
  'Croatia': 'HR', 'Slovakia': 'SK', 'Slovenia': 'SI', 'Lithuania': 'LT',
  'Latvia': 'LV', 'Estonia': 'EE', 'Luxembourg': 'LU', 'Malta': 'MT',
  'Cyprus': 'CY', 'Iceland': 'IS', 'Serbia': 'RS', 'Bosnia and Herzegovina': 'BA',
  'North Macedonia': 'MK', 'Albania': 'AL', 'Montenegro': 'ME', 'Moldova': 'MD',
  'Belarus': 'BY', 'Ukraine': 'UA', 'Russia': 'RU', 'Russian Federation': 'RU',
  'Turkey': 'TR', 'Türkiye': 'TR',
  // Asia
  'China': 'CN', 'Japan': 'JP', 'South Korea': 'KR', 'Korea, Republic of': 'KR',
  'India': 'IN', 'Taiwan': 'TW', 'Singapore': 'SG', 'Malaysia': 'MY',
  'Thailand': 'TH', 'Indonesia': 'ID', 'Philippines': 'PH', 'Vietnam': 'VN',
  'Viet Nam': 'VN', 'Bangladesh': 'BD', 'Pakistan': 'PK', 'Sri Lanka': 'LK',
  'Myanmar': 'MM', 'Cambodia': 'KH', 'Nepal': 'NP',
  // Middle East
  'Israel': 'IL', 'Saudi Arabia': 'SA', 'United Arab Emirates': 'AE', 'UAE': 'AE',
  'Qatar': 'QA', 'Kuwait': 'KW', 'Bahrain': 'BH', 'Oman': 'OM',
  'Jordan': 'JO', 'Lebanon': 'LB', 'Iraq': 'IQ', 'Iran': 'IR',
  // Africa
  'South Africa': 'ZA', 'Egypt': 'EG', 'Nigeria': 'NG', 'Kenya': 'KE',
  'Morocco': 'MA', 'Tunisia': 'TN', 'Algeria': 'DZ', 'Ghana': 'GH',
  'Ethiopia': 'ET', 'Tanzania': 'TZ', 'Uganda': 'UG', 'Senegal': 'SN',
  // South America
  'Brazil': 'BR', 'Argentina': 'AR', 'Chile': 'CL', 'Colombia': 'CO',
  'Peru': 'PE', 'Venezuela': 'VE', 'Ecuador': 'EC', 'Uruguay': 'UY',
  'Paraguay': 'PY', 'Bolivia': 'BO',
  // Central America & Caribbean
  'Costa Rica': 'CR', 'Panama': 'PA', 'Guatemala': 'GT', 'Honduras': 'HN',
  'El Salvador': 'SV', 'Nicaragua': 'NI', 'Dominican Republic': 'DO',
  'Jamaica': 'JM', 'Trinidad and Tobago': 'TT', 'Cuba': 'CU',
  'Puerto Rico': 'PR',
  // Oceania
  'Australia': 'AU', 'New Zealand': 'NZ',
};

function resolveCountryCode(country: string): string {
  if (!country) return 'US';
  // Direct match
  if (COUNTRY_TO_CODE[country]) return COUNTRY_TO_CODE[country];
  // Already a 2-letter code
  if (country.length === 2 && country === country.toUpperCase()) return country;
  // Case-insensitive match
  const lower = country.toLowerCase();
  for (const [name, code] of Object.entries(COUNTRY_TO_CODE)) {
    if (name.toLowerCase() === lower) return code;
  }
  // Partial match
  for (const [name, code] of Object.entries(COUNTRY_TO_CODE)) {
    if (lower.includes(name.toLowerCase()) || name.toLowerCase().includes(lower)) return code;
  }
  return country.length === 2 ? country : 'US';
}

function classifyType(productType: string): 'manufacturer' | 'api' | 'repackager' {
  const lower = (productType || '').toLowerCase();
  if (lower.includes('api') || lower.includes('ingredient') || lower.includes('bulk')) return 'api';
  if (lower.includes('repack')) return 'repackager';
  return 'manufacturer';
}

async function loadDecrsData(): Promise<Establishment[]> {
  const decrsPath = path.join(process.cwd(), 'public', 'data', 'decrs.json');
  const raw = await fs.readFile(decrsPath, 'utf-8');
  const decrs = JSON.parse(raw);
  return decrs.establishments || [];
}

async function fetchFdaNdcEstablishments(): Promise<Establishment[]> {
  const fetches = [0, 100, 200].map(async (skip) => {
    const url = new URL(FDA_NDC_URL);
    url.searchParams.set('limit', '100');
    url.searchParams.set('skip', String(skip));

    const res = await fetch(url.toString(), {
      next: { revalidate: 3600 },
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) return [];
    const data = await res.json();
    return data.results || [];
  });

  const batches = await Promise.allSettled(fetches);
  const allResults = batches.flatMap((b) =>
    b.status === 'fulfilled' ? b.value : []
  );

  const establishmentMap = new Map<string, Establishment>();
  let regCounter = 1;

  for (const item of allResults) {
    const firmName = item.labeler_name || 'Unknown';
    const openfda = item.openfda || {};
    // openfda may not have manufacturer_country — fall back to resolving from name/context
    const country = openfda.manufacturer_country?.[0] || '';
    const countryCode = country ? resolveCountryCode(country) : 'US';
    const resolvedCountry = country || 'United States';

    const key = `${firmName}-${countryCode}`;
    if (!establishmentMap.has(key)) {
      establishmentMap.set(key, {
        firm_name: firmName,
        country_code: countryCode,
        country: resolvedCountry,
        city: '',
        registration_number: `NDC-${regCounter++}`,
        type: classifyType(item.product_type || ''),
      });
    }
  }

  return Array.from(establishmentMap.values());
}

function mergeEstablishments(decrs: Establishment[], fda: Establishment[]): Establishment[] {
  const seen = new Set(decrs.map((e) => `${e.firm_name}-${e.country_code}`));
  const merged = [...decrs];

  for (const est of fda) {
    const key = `${est.firm_name}-${est.country_code}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(est);
    }
  }

  return merged;
}

export async function GET() {
  try {
    // Load DECRS data (always available, curated)
    const decrsEstablishments = await loadDecrsData();

    // Try to enrich with live FDA NDC data
    let fdaEstablishments: Establishment[] = [];
    try {
      fdaEstablishments = await fetchFdaNdcEstablishments();
    } catch (err) {
      console.error('FDA NDC enrichment failed, using DECRS only:', err);
    }

    // Merge: DECRS as base, FDA adds new unique firms
    const allEstablishments = mergeEstablishments(decrsEstablishments, fdaEstablishments);

    // Aggregate by country — no filtering, all countries included
    const countries = aggregateByCountry(allEstablishments);

    return NextResponse.json({
      countries,
      total_establishments: allEstablishments.length,
      decrs_count: decrsEstablishments.length,
      fda_enriched_count: fdaEstablishments.length,
      source: fdaEstablishments.length > 0
        ? 'DECRS + openFDA NDC Directory'
        : 'DECRS Establishment Registry',
      _live: fdaEstablishments.length > 0,
      last_updated: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Failed to load map data:', err);
    return NextResponse.json(
      { error: 'Failed to load manufacturer map data', countries: [] },
      { status: 500 }
    );
  }
}

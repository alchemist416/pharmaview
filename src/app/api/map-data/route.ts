import { NextResponse } from 'next/server';
import { Establishment, CountryMapData } from '@/lib/types';

export const revalidate = 3600;

const FDA_NDC_URL = 'https://api.fda.gov/drug/ndc.json';

// Map common country names from FDA to ISO Alpha-2
const COUNTRY_TO_CODE: Record<string, string> = {
  'United States': 'US', 'USA': 'US', 'US': 'US',
  'India': 'IN', 'China': 'CN', 'Germany': 'DE',
  'United Kingdom': 'GB', 'Canada': 'CA', 'Switzerland': 'CH',
  'France': 'FR', 'Italy': 'IT', 'Japan': 'JP',
  'South Korea': 'KR', 'Israel': 'IL', 'Brazil': 'BR',
  'Mexico': 'MX', 'Ireland': 'IE', 'Denmark': 'DK',
  'Sweden': 'SE', 'Finland': 'FI', 'South Africa': 'ZA',
  'Australia': 'AU', 'Spain': 'ES', 'Netherlands': 'NL',
  'Belgium': 'BE', 'Austria': 'AT', 'Poland': 'PL',
  'Portugal': 'PT', 'Norway': 'NO', 'New Zealand': 'NZ',
  'Singapore': 'SG', 'Taiwan': 'TW', 'Thailand': 'TH',
  'Indonesia': 'ID', 'Malaysia': 'MY', 'Philippines': 'PH',
  'Vietnam': 'VN', 'Egypt': 'EG', 'Nigeria': 'NG',
  'Kenya': 'KE', 'Argentina': 'AR', 'Chile': 'CL',
  'Colombia': 'CO', 'Peru': 'PE', 'Bangladesh': 'BD',
  'Pakistan': 'PK', 'Turkey': 'TR', 'Saudi Arabia': 'SA',
  'United Arab Emirates': 'AE', 'Russia': 'RU',
  'Czech Republic': 'CZ', 'Hungary': 'HU', 'Romania': 'RO',
  'Greece': 'GR', 'Jordan': 'JO', 'Puerto Rico': 'PR',
  'Croatia': 'HR', 'Slovenia': 'SI', 'Slovakia': 'SK',
  'Iceland': 'IS', 'Luxembourg': 'LU', 'Malta': 'MT',
  'Cyprus': 'CY', 'Estonia': 'EE', 'Latvia': 'LV',
  'Lithuania': 'LT', 'Bulgaria': 'BG', 'Serbia': 'RS',
};

function resolveCountryCode(country: string): string {
  if (!country) return 'US';
  // Check direct match
  if (COUNTRY_TO_CODE[country]) return COUNTRY_TO_CODE[country];
  // Check if it's already a 2-letter code
  if (country.length === 2 && country === country.toUpperCase()) return country;
  // Fuzzy match
  const upper = country.toUpperCase();
  for (const [name, code] of Object.entries(COUNTRY_TO_CODE)) {
    if (name.toUpperCase() === upper) return code;
  }
  return 'US'; // Default fallback
}

function classifyType(productType: string): 'manufacturer' | 'api' | 'repackager' {
  const lower = (productType || '').toLowerCase();
  if (lower.includes('api') || lower.includes('ingredient') || lower.includes('bulk')) return 'api';
  if (lower.includes('repack')) return 'repackager';
  return 'manufacturer';
}

export async function GET() {
  try {
    // Fetch NDC data in parallel batches to get broad coverage
    const fetches = [0, 100, 200, 300, 400].map(async (skip) => {
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

    // Build establishments from NDC data
    const establishmentMap = new Map<string, Establishment>();
    let regCounter = 1;

    for (const item of allResults) {
      const firmName = item.labeler_name || 'Unknown';
      // Use openfda for richer data when available
      const openfda = item.openfda || {};
      const country = openfda.manufacturer_country?.[0] || 'United States';
      const countryCode = resolveCountryCode(country);

      const key = `${firmName}-${countryCode}`;
      if (!establishmentMap.has(key)) {
        establishmentMap.set(key, {
          firm_name: firmName,
          country_code: countryCode,
          country,
          city: '', // NDC doesn't provide city-level detail
          registration_number: `NDC-${regCounter++}`,
          type: classifyType(item.product_type || ''),
        });
      }
    }

    const establishments = Array.from(establishmentMap.values());

    // Aggregate by country
    const countryMap = new Map<string, CountryMapData>();
    for (const est of establishments) {
      const existing = countryMap.get(est.country_code);
      if (existing) {
        existing.manufacturer_count++;
        existing.establishments.push(est);
      } else {
        countryMap.set(est.country_code, {
          country_code: est.country_code,
          country: est.country,
          manufacturer_count: 1,
          establishments: [est],
        });
      }
    }

    const countries = Array.from(countryMap.values()).sort(
      (a, b) => b.manufacturer_count - a.manufacturer_count
    );

    return NextResponse.json({
      countries,
      total_establishments: establishments.length,
      source: 'openFDA NDC Directory',
    });
  } catch (err) {
    console.error('Failed to fetch map data:', err);
    return NextResponse.json(
      { error: 'Failed to fetch manufacturer map data from FDA', countries: [] },
      { status: 500 }
    );
  }
}

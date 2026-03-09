import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { Establishment } from '@/lib/types';
import { aggregateByCountry } from '@/lib/mapData';

export const revalidate = 3600;

const FDA_NDC_URL = 'https://api.fda.gov/drug/ndc.json';

// Map country names from FDA NDC to ISO Alpha-2
const COUNTRY_TO_CODE: Record<string, string> = {
  'United States': 'US', 'USA': 'US',
  'India': 'IN', 'China': 'CN', 'Germany': 'DE',
  'United Kingdom': 'GB', 'Canada': 'CA', 'Switzerland': 'CH',
  'France': 'FR', 'Italy': 'IT', 'Japan': 'JP',
  'South Korea': 'KR', 'Israel': 'IL', 'Brazil': 'BR',
  'Ireland': 'IE', 'Singapore': 'SG', 'Mexico': 'MX',
  'Denmark': 'DK', 'Sweden': 'SE', 'Australia': 'AU',
  'Spain': 'ES', 'Netherlands': 'NL', 'Belgium': 'BE',
  'Austria': 'AT', 'Norway': 'NO', 'Finland': 'FI',
  'South Africa': 'ZA', 'Taiwan': 'TW', 'Thailand': 'TH',
  'Indonesia': 'ID', 'Poland': 'PL', 'Turkey': 'TR',
  'Puerto Rico': 'PR', 'New Zealand': 'NZ',
};

function resolveCountryCode(country: string): string {
  if (!country) return 'US';
  if (COUNTRY_TO_CODE[country]) return COUNTRY_TO_CODE[country];
  if (country.length === 2 && country === country.toUpperCase()) return country;
  const upper = country.toUpperCase();
  for (const [name, code] of Object.entries(COUNTRY_TO_CODE)) {
    if (name.toUpperCase() === upper) return code;
  }
  return 'US';
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
    const country = openfda.manufacturer_country?.[0] || 'United States';
    const countryCode = resolveCountryCode(country);

    const key = `${firmName}-${countryCode}`;
    if (!establishmentMap.has(key)) {
      establishmentMap.set(key, {
        firm_name: firmName,
        country_code: countryCode,
        country,
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

    // Aggregate by country
    const countries = aggregateByCountry(allEstablishments);

    return NextResponse.json({
      countries,
      total_establishments: allEstablishments.length,
      decrs_count: decrsEstablishments.length,
      fda_enriched_count: fdaEstablishments.length,
      source: fdaEstablishments.length > 0
        ? 'DECRS + openFDA NDC Directory'
        : 'DECRS Establishment Registry',
    });
  } catch (err) {
    console.error('Failed to load map data:', err);
    return NextResponse.json(
      { error: 'Failed to load manufacturer map data', countries: [] },
      { status: 500 }
    );
  }
}

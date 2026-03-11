import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { cachedFetch, cacheHeader, fetchJSON } from '@/lib/liveData';

export const revalidate = 86400; // 24h

const FDA_NDC_URL = 'https://api.fda.gov/drug/ndc.json';

interface MfgGeoYear {
  year: number;
  'United States': number;
  Europe: number;
  India: number;
  China: number;
  'Rest of World': number;
}

interface MfgGeoData {
  description: string;
  regions: string[];
  data: MfgGeoYear[];
}

// European country codes
const EUROPE_CODES = new Set([
  'DE', 'GB', 'FR', 'IT', 'ES', 'NL', 'BE', 'CH', 'AT', 'SE', 'NO',
  'DK', 'FI', 'IE', 'PT', 'PL', 'CZ', 'HU', 'RO', 'GR', 'BG',
  'HR', 'SK', 'SI', 'LT', 'LV', 'EE', 'LU', 'MT', 'CY', 'IS',
]);

async function fetchCurrentMfgShares(): Promise<Record<string, number>> {
  // Use FDA NDC to estimate current manufacturing geography
  const data = await fetchJSON<{
    results?: { openfda?: { manufacturer_country?: string[] } }[];
  }>(`${FDA_NDC_URL}?limit=100&skip=0`);

  const counts: Record<string, number> = { US: 0, Europe: 0, India: 0, China: 0, ROW: 0 };
  let total = 0;

  for (const item of data.results ?? []) {
    const countries = item.openfda?.manufacturer_country ?? [];
    for (const c of countries) {
      total++;
      if (c === 'United States' || c === 'US') counts.US++;
      else if (c === 'India' || c === 'IN') counts.India++;
      else if (c === 'China' || c === 'CN') counts.China++;
      else {
        // Check if European
        const isEurope = EUROPE_CODES.has(c) || ['Germany', 'France', 'Italy', 'Spain', 'United Kingdom', 'Switzerland', 'Netherlands', 'Belgium', 'Ireland', 'Sweden', 'Denmark', 'Austria'].includes(c);
        if (isEurope) counts.Europe++;
        else counts.ROW++;
      }
    }
  }

  if (total === 0) throw new Error('No NDC data for manufacturing geography');

  return {
    'United States': Math.round((counts.US / total) * 100),
    Europe: Math.round((counts.Europe / total) * 100),
    India: Math.round((counts.India / total) * 100),
    China: Math.round((counts.China / total) * 100),
    'Rest of World': Math.round((counts.ROW / total) * 100),
  };
}

async function fetchMfgGeoData(): Promise<MfgGeoData> {
  // Load static data for pre-2021 (historical)
  const staticPath = path.join(process.cwd(), 'public', 'data', 'atlas-manufacturing-geo.json');
  const staticRaw = await fs.readFile(staticPath, 'utf-8');
  const staticData: MfgGeoData = JSON.parse(staticRaw);

  // Get live current shares
  const currentShares = await fetchCurrentMfgShares();
  const currentYear = new Date().getFullYear();

  // Use static data for years up to 2021, interpolate 2022-present with live data
  const historicYears = staticData.data.filter((d) => d.year <= 2021);

  // For 2022 onwards, interpolate between 2021 and live current data
  const year2021 = staticData.data.find((d) => d.year === 2021);
  if (year2021) {
    for (let year = 2022; year <= currentYear; year++) {
      const t = (year - 2021) / (currentYear - 2021 || 1);
      const interpolated: MfgGeoYear = {
        year,
        'United States': Math.round(year2021['United States'] + t * (currentShares['United States'] - year2021['United States'])),
        Europe: Math.round(year2021.Europe + t * (currentShares.Europe - year2021.Europe)),
        India: Math.round(year2021.India + t * (currentShares.India - year2021.India)),
        China: Math.round(year2021.China + t * (currentShares.China - year2021.China)),
        'Rest of World': Math.round(year2021['Rest of World'] + t * (currentShares['Rest of World'] - year2021['Rest of World'])),
      };

      // Normalize to 100%
      const sum = interpolated['United States'] + interpolated.Europe + interpolated.India + interpolated.China + interpolated['Rest of World'];
      if (sum !== 100) {
        interpolated['Rest of World'] += (100 - sum);
      }

      historicYears.push(interpolated);
    }
  }

  return {
    description: 'Pharmaceutical manufacturing share by region — static pre-2021, live post-2021 from openFDA NDC',
    regions: ['United States', 'Europe', 'India', 'China', 'Rest of World'],
    data: historicYears,
  };
}

export async function GET() {
  try {
    const result = await cachedFetch<MfgGeoData>(
      'atlas-manufacturing-geo',
      86400,
      fetchMfgGeoData,
      'atlas-manufacturing-geo.json',
    );

    return NextResponse.json({
      ...result.data,
      source: result.source === 'live'
        ? 'Static pre-2021 + openFDA NDC (live post-2021)'
        : 'Static fallback',
      last_updated: result.last_updated,
      _live: result.source === 'live',
    }, {
      headers: cacheHeader(86400),
    });
  } catch (err) {
    console.error('[atlas-manufacturing-geo] Failed:', err);
    return NextResponse.json(
      { error: 'Failed to load manufacturing geography data', _live: false },
      { status: 500 },
    );
  }
}

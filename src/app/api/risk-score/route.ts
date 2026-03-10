import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { CountryRisk, PatentExpiry } from '@/lib/types';
import {
  calculateCompositeRisk,
  predictShortage,
  InspectionData,
  ShortageHistoryData,
} from '@/lib/riskScoring';

export const revalidate = 3600;

// In-memory caches
let inspectionCache: Record<string, InspectionData> | null = null;
let shortageHistoryCache: Record<string, ShortageHistoryData> | null = null;
let countryRiskCache: Record<string, CountryRisk> | null = null;
let patentCache: PatentExpiry[] | null = null;

async function loadJSON<T>(filename: string): Promise<T> {
  const filePath = path.join(process.cwd(), 'public', 'data', filename);
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

async function getInspections(): Promise<Record<string, InspectionData>> {
  if (inspectionCache) return inspectionCache;
  const data = await loadJSON<{ inspections: Record<string, InspectionData> }>('inspection-history.json');
  inspectionCache = data.inspections;
  return inspectionCache;
}

async function getShortageHistory(): Promise<Record<string, ShortageHistoryData>> {
  if (shortageHistoryCache) return shortageHistoryCache;
  const data = await loadJSON<{ shortage_history: Record<string, ShortageHistoryData> }>('inspection-history.json');
  shortageHistoryCache = data.shortage_history;
  return shortageHistoryCache;
}

async function getCountryRisk(): Promise<Record<string, CountryRisk>> {
  if (countryRiskCache) return countryRiskCache;
  countryRiskCache = await loadJSON<Record<string, CountryRisk>>('country-risk.json');
  return countryRiskCache;
}

async function getPatents(): Promise<PatentExpiry[]> {
  if (patentCache) return patentCache;
  const data = await loadJSON<{ patents: PatentExpiry[] }>('patent-expiry.json');
  patentCache = data.patents;
  return patentCache;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const drug = searchParams.get('drug')?.toLowerCase();

    if (!drug) {
      return NextResponse.json({ error: 'Missing ?drug= parameter' }, { status: 400 });
    }

    const [inspections, shortageHistory, countryRiskMap, patents] = await Promise.all([
      getInspections(),
      getShortageHistory(),
      getCountryRisk(),
      getPatents(),
    ]);

    // Also fetch manufacturer data from our own API
    const baseUrl = request.nextUrl.origin;
    const [mfgRes, shortageRes] = await Promise.allSettled([
      fetch(`${baseUrl}/api/manufacturers?drug=${encodeURIComponent(drug)}`),
      fetch(`${baseUrl}/api/shortages`),
    ]);

    // Parse manufacturer data
    let manufacturers: { country_code: string; country: string }[] = [];
    if (mfgRes.status === 'fulfilled' && mfgRes.value.ok) {
      const data = await mfgRes.value.json();
      manufacturers = (data.manufacturers || []).map((m: { country_code?: string; country?: string }) => ({
        country_code: m.country_code || 'US',
        country: m.country || 'United States',
      }));
    }

    // Build countryData from manufacturers
    const countryMap = new Map<string, { country_code: string; country: string; count: number }>();
    for (const m of manufacturers) {
      const existing = countryMap.get(m.country_code);
      if (existing) {
        existing.count++;
      } else {
        countryMap.set(m.country_code, { country_code: m.country_code, country: m.country, count: 1 });
      }
    }
    const countryData = Array.from(countryMap.values()).map((c) => ({
      country_code: c.country_code,
      country: c.country,
      manufacturer_count: c.count,
      establishments: [],
    }));

    // Parse shortage data
    let isActiveShortage = false;
    let shortageCount = 0;
    if (shortageRes.status === 'fulfilled' && shortageRes.value.ok) {
      const data = await shortageRes.value.json();
      const results = (data.results || []) as Record<string, unknown>[];
      const q = drug.toLowerCase();
      const drugShortages = results.filter(
        (s) =>
          ((s.generic_name as string) || '').toLowerCase().includes(q) ||
          ((s.brand_name as string) || '').toLowerCase().includes(q)
      );
      shortageCount = drugShortages.length;
      isActiveShortage = drugShortages.some((s) => {
        const st = ((s.status as string) || '').toLowerCase();
        return st.includes('current') || st.includes('active') || st.includes('ongoing');
      });
    }

    const inspection = inspections[drug];
    const history = shortageHistory[drug];
    const patent = patents.find((p) => p.drug_name.toLowerCase() === drug);

    const compositeRisk = calculateCompositeRisk({
      isActiveShortage,
      shortageCount,
      lastShortageDate: history?.last_shortage,
      countryData,
      totalManufacturers: manufacturers.length,
      countryRiskMap,
      inspection,
      patent,
      shortageHistory: history,
    });

    const prediction = predictShortage({
      shortageHistory: history,
      inspection,
      totalManufacturers: manufacturers.length,
      patent,
      isCurrentlyShortage: isActiveShortage,
    });

    return NextResponse.json({
      drug,
      composite_risk: compositeRisk,
      prediction,
      data_sources: {
        manufacturers: manufacturers.length,
        countries: countryData.length,
        has_inspection_data: !!inspection,
        has_patent_data: !!patent,
        has_shortage_history: !!history,
      },
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },
    });
  } catch (err) {
    console.error('Failed to compute risk score:', err);
    return NextResponse.json(
      { error: 'Failed to compute risk score' },
      { status: 500 }
    );
  }
}

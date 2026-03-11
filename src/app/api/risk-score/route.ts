import { NextRequest, NextResponse } from 'next/server';
import { cacheHeader } from '@/lib/liveData';
import { CountryRisk, PatentExpiry } from '@/lib/types';
import {
  calculateCompositeRisk,
  predictShortage,
  InspectionData,
  ShortageHistoryData,
} from '@/lib/riskScoring';

export const revalidate = 3600;

async function fetchFromApi<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const drug = searchParams.get('drug')?.toLowerCase();

    if (!drug) {
      return NextResponse.json({ error: 'Missing ?drug= parameter' }, { status: 400 });
    }

    const baseUrl = request.nextUrl.origin;

    // Fetch from our live API routes in parallel
    const [inspHistRes, countryRiskRes, patentRes, mfgRes, shortageRes] = await Promise.allSettled([
      fetchFromApi<{
        inspections: Record<string, InspectionData>;
        shortage_history: Record<string, ShortageHistoryData>;
        _live?: boolean;
      }>(`${baseUrl}/api/inspection-history`),
      fetchFromApi<Record<string, CountryRisk> & { _meta?: { _live?: boolean } }>(`${baseUrl}/api/country-risk`),
      fetchFromApi<{ results: PatentExpiry[]; _live?: boolean }>(`${baseUrl}/api/patents?drug=${encodeURIComponent(drug)}`),
      fetchFromApi<{ manufacturers: { country_code: string; country: string }[] }>(`${baseUrl}/api/manufacturers?drug=${encodeURIComponent(drug)}`),
      fetchFromApi<{ results: Record<string, unknown>[] }>(`${baseUrl}/api/shortages`),
    ]);

    // Parse inspection data
    let inspection: InspectionData | undefined;
    let history: ShortageHistoryData | undefined;
    let inspLive = false;
    if (inspHistRes.status === 'fulfilled') {
      const data = inspHistRes.value;
      inspection = data.inspections?.[drug];
      history = data.shortage_history?.[drug];
      inspLive = !!data._live;
    }

    // Parse country risk
    let countryRiskMap: Record<string, CountryRisk> = {};
    let countryRiskLive = false;
    if (countryRiskRes.status === 'fulfilled') {
      const data = countryRiskRes.value;
      countryRiskLive = !!data._meta?._live;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { _meta, ...rest } = data;
      countryRiskMap = rest as Record<string, CountryRisk>;
    }

    // Parse patents
    let patent: PatentExpiry | undefined;
    let patentLive = false;
    if (patentRes.status === 'fulfilled') {
      patent = patentRes.value.results?.[0];
      patentLive = !!patentRes.value._live;
    }

    // Parse manufacturers
    let manufacturers: { country_code: string; country: string }[] = [];
    if (mfgRes.status === 'fulfilled') {
      manufacturers = mfgRes.value.manufacturers || [];
    }

    // Build countryData
    const countryMap = new Map<string, { country_code: string; country: string; count: number }>();
    for (const m of manufacturers) {
      const existing = countryMap.get(m.country_code);
      if (existing) existing.count++;
      else countryMap.set(m.country_code, { country_code: m.country_code, country: m.country, count: 1 });
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
    if (shortageRes.status === 'fulfilled') {
      const results = shortageRes.value.results || [];
      const q = drug.toLowerCase();
      const drugShortages = results.filter(
        (s) =>
          ((s.generic_name as string) || '').toLowerCase().includes(q) ||
          ((s.brand_name as string) || '').toLowerCase().includes(q),
      );
      shortageCount = drugShortages.length;
      isActiveShortage = drugShortages.some((s) => {
        const st = ((s.status as string) || '').toLowerCase();
        return st.includes('current') || st.includes('active') || st.includes('ongoing');
      });
    }

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

    const isLive = inspLive || countryRiskLive || patentLive;

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
      _live: isLive,
      last_updated: new Date().toISOString(),
    }, {
      headers: cacheHeader(3600),
    });
  } catch (err) {
    console.error('Failed to compute risk score:', err);
    return NextResponse.json(
      { error: 'Failed to compute risk score', _live: false },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { cachedFetch, cacheHeader, fetchJSON } from '@/lib/liveData';
import { Drug340BPricing } from '@/lib/types';

export const revalidate = 3600;

interface PricingData {
  drugs: Drug340BPricing[];
  source: string;
  last_updated: string;
}

const CMS_NADAC_URL = 'https://data.cms.gov/data-api/v1/dataset/9767cb68-8ea9-4f0b-8179-9431abc89f11/data';

async function fetchLivePricing(): Promise<PricingData> {
  const data = await fetchJSON<Record<string, string>[]>(
    `${CMS_NADAC_URL}?size=200&offset=0`,
    { timeoutMs: 20000 },
  );

  if (!data || data.length === 0) {
    throw new Error('Empty response from CMS NADAC API');
  }

  const drugs: Drug340BPricing[] = data
    .filter((r) => r['NDC'] && r['NDC Description'])
    .slice(0, 100)
    .map((r) => {
      const nadacPrice = parseFloat(r['NADAC_Per_Unit'] || '0');
      const wholesaleEst = nadacPrice * 1.2;
      const retailEst = nadacPrice * 2.5;
      const savings = retailEst > 0 ? Math.round(((retailEst - nadacPrice) / retailEst) * 100) : 0;

      return {
        ndc: r['NDC'] || '',
        drug_name: r['NDC Description'] || '',
        generic_name: r['NDC Description']?.split(' ')[0] || '',
        strength: r['NDC Description']?.match(/\d+\s*(?:MG|MCG|ML|%)/i)?.[0] || '',
        form: r['Pharmacy Type Indicator'] || 'Tablet',
        unit_price_340b: nadacPrice,
        unit_price_wholesale: Math.round(wholesaleEst * 10000) / 10000,
        unit_price_retail: Math.round(retailEst * 10000) / 10000,
        savings_pct: savings,
        effective_date: r['Effective_Date'] || new Date().toISOString().slice(0, 10),
        manufacturer: r['Labeler Name'] || 'Unknown',
      };
    });

  return {
    drugs,
    source: 'CMS NADAC API (data.cms.gov)',
    last_updated: new Date().toISOString(),
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const drug = searchParams.get('drug')?.toLowerCase();

    const result = await cachedFetch<PricingData>(
      'pricing-340b',
      3600,
      fetchLivePricing,
      'pricing-340b.json',
    );

    let results = result.data.drugs;
    if (drug) {
      results = results.filter(
        (d) =>
          d.drug_name.toLowerCase().includes(drug) ||
          d.generic_name.toLowerCase().includes(drug),
      );
    }

    return NextResponse.json({
      results,
      source: result.source === 'live' ? 'CMS NADAC API (data.cms.gov)' : result.data.source,
      last_updated: result.last_updated,
      _live: result.source === 'live',
    }, {
      headers: cacheHeader(3600),
    });
  } catch (err) {
    console.error('Failed to load 340B pricing data:', err);
    return NextResponse.json(
      { error: 'Failed to load pricing data', results: [], _live: false },
      { status: 500 },
    );
  }
}

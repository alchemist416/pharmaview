import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { Drug340BPricing } from '@/lib/types';

export const revalidate = 3600;

interface PricingData {
  drugs: Drug340BPricing[];
  source: string;
  last_updated: string;
}

let cachedData: PricingData | null = null;

async function loadPricingData(): Promise<PricingData> {
  if (cachedData) return cachedData;
  const filePath = path.join(process.cwd(), 'public', 'data', 'pricing-340b.json');
  const raw = await fs.readFile(filePath, 'utf-8');
  cachedData = JSON.parse(raw);
  return cachedData!;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const drug = searchParams.get('drug')?.toLowerCase();

    const data = await loadPricingData();

    if (drug) {
      const matches = data.drugs.filter(
        (d) =>
          d.drug_name.toLowerCase().includes(drug) ||
          d.generic_name.toLowerCase().includes(drug)
      );
      return NextResponse.json({
        results: matches,
        source: data.source,
        last_updated: data.last_updated,
      }, {
        headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },
      });
    }

    return NextResponse.json({
      results: data.drugs,
      source: data.source,
      last_updated: data.last_updated,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },
    });
  } catch (err) {
    console.error('Failed to load 340B pricing data:', err);
    return NextResponse.json(
      { error: 'Failed to load pricing data', results: [] },
      { status: 500 }
    );
  }
}

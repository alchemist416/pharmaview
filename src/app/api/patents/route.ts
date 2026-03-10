import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { PatentExpiry } from '@/lib/types';

export const revalidate = 3600;

interface PatentData {
  patents: PatentExpiry[];
  source: string;
  last_updated: string;
}

let cachedData: PatentData | null = null;

async function loadPatentData(): Promise<PatentData> {
  if (cachedData) return cachedData;
  const filePath = path.join(process.cwd(), 'public', 'data', 'patent-expiry.json');
  const raw = await fs.readFile(filePath, 'utf-8');
  cachedData = JSON.parse(raw);
  return cachedData!;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const drug = searchParams.get('drug')?.toLowerCase();
    const status = searchParams.get('status'); // 'active' | 'expired'

    const data = await loadPatentData();
    let results = data.patents;

    if (drug) {
      results = results.filter(
        (p) =>
          p.drug_name.toLowerCase().includes(drug) ||
          p.generic_name.toLowerCase().includes(drug)
      );
    }

    if (status === 'active' || status === 'expired') {
      results = results.filter((p) => p.status === status);
    }

    return NextResponse.json({
      results,
      source: data.source,
      last_updated: data.last_updated,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },
    });
  } catch (err) {
    console.error('Failed to load patent data:', err);
    return NextResponse.json(
      { error: 'Failed to load patent data', results: [] },
      { status: 500 }
    );
  }
}

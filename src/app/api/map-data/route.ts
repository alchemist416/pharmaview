import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { aggregateByCountry } from '@/lib/mapData';

export const revalidate = 3600;

export async function GET() {
  try {
    const decrsPath = path.join(process.cwd(), 'public', 'data', 'decrs.json');
    const decrsRaw = await fs.readFile(decrsPath, 'utf-8');
    const decrs = JSON.parse(decrsRaw);

    const countryData = aggregateByCountry(decrs.establishments);

    return NextResponse.json({ countries: countryData });
  } catch {
    return NextResponse.json(
      { error: 'Failed to load map data', countries: [] },
      { status: 500 }
    );
  }
}

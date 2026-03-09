import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const drug = searchParams.get('drug');

    // Load DECRS data
    const decrsPath = path.join(process.cwd(), 'public', 'data', 'decrs.json');
    const decrsRaw = await fs.readFile(decrsPath, 'utf-8');
    const decrs = JSON.parse(decrsRaw);

    if (drug) {
      // Also try openFDA NDC endpoint for drug-specific data
      try {
        const fdaRes = await fetch(
          `https://api.fda.gov/drug/ndc.json?search=brand_name:"${encodeURIComponent(drug)}"+generic_name:"${encodeURIComponent(drug)}"&limit=100`,
          { next: { revalidate: 3600 } }
        );

        if (fdaRes.ok) {
          const fdaData = await fdaRes.json();
          return NextResponse.json({
            fda_results: fdaData.results || [],
            decrs_establishments: decrs.establishments,
          });
        }
      } catch {
        // Fall through to return DECRS data only
      }
    }

    return NextResponse.json({
      fda_results: [],
      decrs_establishments: decrs.establishments,
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch manufacturers', fda_results: [], decrs_establishments: [] },
      { status: 500 }
    );
  }
}

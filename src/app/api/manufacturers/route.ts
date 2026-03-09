import { NextRequest, NextResponse } from 'next/server';

export const revalidate = 3600;

const FDA_NDC_URL = 'https://api.fda.gov/drug/ndc.json';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const drug = searchParams.get('drug');
    const limit = searchParams.get('limit') || '100';

    const url = new URL(FDA_NDC_URL);
    url.searchParams.set('limit', limit);

    if (drug) {
      // Search by both brand name and generic name
      const encoded = encodeURIComponent(drug);
      url.searchParams.set(
        'search',
        `brand_name:"${encoded}"+generic_name:"${encoded}"`
      );
    }

    const res = await fetch(url.toString(), {
      next: { revalidate: 3600 },
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error');
      console.error(`FDA NDC API returned ${res.status}: ${errorText}`);
      return NextResponse.json(
        { error: `FDA API returned ${res.status}`, results: [], meta: null },
        { status: 502 }
      );
    }

    const data = await res.json();
    const results = data.results || [];

    // Extract unique manufacturers from NDC results
    const manufacturerMap = new Map<string, {
      firm_name: string;
      products: string[];
    }>();

    for (const item of results) {
      const labeler = item.labeler_name || 'Unknown';
      const existing = manufacturerMap.get(labeler);
      const productName = item.brand_name || item.generic_name || 'Unknown';
      if (existing) {
        if (!existing.products.includes(productName)) {
          existing.products.push(productName);
        }
      } else {
        manufacturerMap.set(labeler, {
          firm_name: labeler,
          products: [productName],
        });
      }
    }

    return NextResponse.json({
      meta: data.meta || null,
      results,
      manufacturers: Array.from(manufacturerMap.values()),
    });
  } catch (err) {
    console.error('Failed to fetch manufacturers:', err);
    return NextResponse.json(
      { error: 'Failed to fetch NDC data from FDA', results: [], manufacturers: [], meta: null },
      { status: 500 }
    );
  }
}

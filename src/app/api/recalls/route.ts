import { NextRequest, NextResponse } from 'next/server';

export const revalidate = 3600;

const FDA_ENFORCEMENT_URL = 'https://api.fda.gov/drug/enforcement.json';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') || '100';
    const classification = searchParams.get('classification');
    const days = searchParams.get('days') || '90';

    const queryParts: string[] = [];

    // Always filter for ongoing recalls
    queryParts.push('status:"Ongoing"');

    if (classification) {
      queryParts.push(`classification:"${classification}"`);
    }

    // Date range filter
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
    queryParts.push(`report_date:[${fmt(startDate)}+TO+${fmt(endDate)}]`);

    const url = new URL(FDA_ENFORCEMENT_URL);
    url.searchParams.set('limit', limit);
    url.searchParams.set('sort', 'report_date:desc');
    url.searchParams.set('search', queryParts.join('+AND+'));

    const res = await fetch(url.toString(), {
      next: { revalidate: 3600 },
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error');
      console.error(`FDA Enforcement API returned ${res.status}: ${errorText}`);
      return NextResponse.json(
        { error: `FDA API returned ${res.status}`, results: [], meta: null },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json({
      meta: data.meta || null,
      results: data.results || [],
    });
  } catch (err) {
    console.error('Failed to fetch recalls:', err);
    return NextResponse.json(
      { error: 'Failed to fetch enforcement data from FDA', results: [], meta: null },
      { status: 500 }
    );
  }
}

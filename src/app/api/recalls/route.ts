import { NextRequest, NextResponse } from 'next/server';

export const revalidate = 3600;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') || '50';
    const classification = searchParams.get('classification');
    const days = searchParams.get('days') || '90';

    const queryParts: string[] = [];

    if (classification) {
      queryParts.push(`classification.exact:"${classification}"`);
    }

    // Date range filter
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    const dateStr = `report_date:[${startDate.toISOString().slice(0, 10).replace(/-/g, '')}+TO+${endDate.toISOString().slice(0, 10).replace(/-/g, '')}]`;
    queryParts.push(dateStr);

    const url = new URL('https://api.fda.gov/drug/enforcement.json');
    url.searchParams.set('limit', limit);
    url.searchParams.set('sort', 'report_date:desc');
    if (queryParts.length > 0) {
      url.searchParams.set('search', queryParts.join('+AND+'));
    }

    const res = await fetch(url.toString(), {
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: 'FDA API unavailable', results: [] },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch recalls', results: [] },
      { status: 500 }
    );
  }
}

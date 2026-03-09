import { NextResponse } from 'next/server';

export const revalidate = 3600;

const FDA_SHORTAGES_URL = 'https://api.fda.gov/drug/drugshortages.json';

export async function GET() {
  try {
    const url = new URL(FDA_SHORTAGES_URL);
    url.searchParams.set('limit', '100');

    const res = await fetch(url.toString(), {
      next: { revalidate: 3600 },
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error');
      console.error(`FDA Shortages API returned ${res.status}: ${errorText}`);
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
    console.error('Failed to fetch shortages:', err);
    return NextResponse.json(
      { error: 'Failed to fetch drug shortages from FDA', results: [], meta: null },
      { status: 500 }
    );
  }
}

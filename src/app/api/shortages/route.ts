import { NextResponse } from 'next/server';

export const revalidate = 3600; // Cache for 1 hour

export async function GET() {
  try {
    const res = await fetch(
      'https://api.fda.gov/drug/drugshortages.json?limit=100&skip=0',
      { next: { revalidate: 3600 } }
    );

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
      { error: 'Failed to fetch shortages', results: [] },
      { status: 500 }
    );
  }
}

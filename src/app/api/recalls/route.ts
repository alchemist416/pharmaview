import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const FDA_ENFORCEMENT_URL = 'https://api.fda.gov/drug/enforcement.json';

export async function GET(request: NextRequest) {
  const debug: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    endpoint: FDA_ENFORCEMENT_URL,
  };

  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') || '100';
    const classification = searchParams.get('classification');
    const days = searchParams.get('days') || '90';

    const queryParts: string[] = [];

    if (classification) {
      queryParts.push(`classification:"${classification}"`);
    }

    // Date range filter — use proper openFDA Lucene syntax
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
    queryParts.push(`report_date:[${fmt(startDate)}+TO+${fmt(endDate)}]`);

    // Build URL manually to avoid double-encoding of + signs in Lucene query syntax.
    // searchParams.set() encodes + as %2B which breaks openFDA's query parser.
    const searchQuery = queryParts.join('+AND+');
    const fetchUrl = `${FDA_ENFORCEMENT_URL}?limit=${limit}&sort=report_date:desc&search=${searchQuery}`;

    debug.requestUrl = fetchUrl;
    debug.queryParts = queryParts;
    debug.dateRange = { from: fmt(startDate), to: fmt(endDate), days };
    const startTime = Date.now();

    const res = await fetch(fetchUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
      next: { revalidate: 3600 },
    });

    debug.responseTime = `${Date.now() - startTime}ms`;
    debug.status = res.status;
    debug.statusText = res.statusText;

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Could not read response body');
      debug.errorBody = errorText.slice(0, 500);
      console.error(`[recalls] FDA API returned ${res.status}:`, errorText.slice(0, 200));

      // FDA returns 404 when no results match the search
      if (res.status === 404) {
        return NextResponse.json({
          meta: null,
          results: [],
          debug,
          _note: 'No recalls found matching the search criteria',
        });
      }

      return NextResponse.json(
        { error: `FDA API returned ${res.status}`, results: [], meta: null, debug },
        { status: 502 }
      );
    }

    const data = await res.json();
    debug.resultCount = (data.results || []).length;
    debug.metaTotal = data.meta?.results?.total;

    return NextResponse.json({
      meta: data.meta || null,
      results: data.results || [],
      debug,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.includes('timeout') || message.includes('abort');
    const isDns = message.includes('ENOTFOUND') || message.includes('EAI_AGAIN');

    debug.error = message;
    debug.errorType = isTimeout ? 'TIMEOUT' : isDns ? 'DNS_FAILURE' : 'NETWORK_ERROR';

    console.error(`[recalls] Failed to fetch:`, message);

    return NextResponse.json(
      {
        error: `Failed to fetch recalls: ${debug.errorType}`,
        results: [],
        meta: null,
        debug,
      },
      { status: 503 }
    );
  }
}

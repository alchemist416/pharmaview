import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Correct endpoint: shortages.json, NOT drugshortages.json
// See: https://open.fda.gov/apis/drug/drugshortages/
const FDA_SHORTAGES_URL = 'https://api.fda.gov/drug/shortages.json';

export async function GET() {
  const debug: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    endpoint: FDA_SHORTAGES_URL,
  };

  try {
    const url = new URL(FDA_SHORTAGES_URL);
    url.searchParams.set('limit', '100');

    debug.requestUrl = url.toString();
    const startTime = Date.now();

    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });

    debug.responseTime = `${Date.now() - startTime}ms`;
    debug.status = res.status;
    debug.statusText = res.statusText;

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Could not read response body');
      debug.errorBody = errorText.slice(0, 500);
      console.error(`[shortages] FDA API returned ${res.status}:`, errorText.slice(0, 200));

      // FDA returns 404 when no results match
      if (res.status === 404) {
        return NextResponse.json({
          meta: null,
          results: [],
          debug,
          _note: 'FDA returned 404 — no results found',
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
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.includes('timeout') || message.includes('abort');
    const isDns = message.includes('ENOTFOUND') || message.includes('EAI_AGAIN');

    debug.error = message;
    debug.errorType = isTimeout ? 'TIMEOUT' : isDns ? 'DNS_FAILURE' : 'NETWORK_ERROR';

    console.error(`[shortages] Failed to fetch:`, message);

    return NextResponse.json(
      {
        error: `Failed to fetch drug shortages: ${debug.errorType}`,
        results: [],
        meta: null,
        debug,
      },
      { status: 503 }
    );
  }
}

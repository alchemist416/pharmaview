import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface EndpointResult {
  name: string;
  url: string;
  status: number | null;
  ok: boolean;
  responseTime: string;
  resultCount?: number;
  error?: string;
  sampleData?: unknown;
}

async function testEndpoint(name: string, url: string): Promise<EndpointResult> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    const elapsed = `${Date.now() - start}ms`;

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        name,
        url,
        status: res.status,
        ok: false,
        responseTime: elapsed,
        error: `HTTP ${res.status}: ${body.slice(0, 200)}`,
      };
    }

    const data = await res.json();
    const results = data.results || [];

    return {
      name,
      url,
      status: res.status,
      ok: true,
      responseTime: elapsed,
      resultCount: results.length,
      sampleData: results[0] ? Object.keys(results[0]) : null,
    };
  } catch (err) {
    return {
      name,
      url,
      status: null,
      ok: false,
      responseTime: `${Date.now() - start}ms`,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function GET() {
  const endpoints = [
    {
      name: 'Drug Shortages',
      url: 'https://api.fda.gov/drug/shortages.json?limit=1',
    },
    {
      name: 'Enforcement/Recalls',
      url: 'https://api.fda.gov/drug/enforcement.json?limit=1',
    },
    {
      name: 'NDC Directory',
      url: 'https://api.fda.gov/drug/ndc.json?limit=1',
    },
    {
      name: 'Drug Labels',
      url: 'https://api.fda.gov/drug/label.json?limit=1',
    },
  ];

  const results = await Promise.all(
    endpoints.map((ep) => testEndpoint(ep.name, ep.url))
  );

  const allOk = results.every((r) => r.ok);

  return NextResponse.json({
    status: allOk ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    environment: {
      nodeEnv: process.env.NODE_ENV,
      hasAnthropicKey: !!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_key_here'),
      vercelRegion: process.env.VERCEL_REGION || 'unknown',
    },
    endpoints: results,
  });
}

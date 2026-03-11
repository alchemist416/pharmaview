import { NextRequest, NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET || '';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured', refreshed: false });
  }

  try {
    // Trigger a fresh fetch of country-risk data by calling our own API
    // This ensures the in-memory cache is cleared and live data is re-fetched
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    const res = await fetch(`${baseUrl}/api/country-risk`, {
      headers: { 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to refresh country risk', refreshed: false }, { status: 502 });
    }

    const data = await res.json();

    // Optionally store snapshot in Supabase
    if (supabase) {
      const entries = Object.entries(data)
        .filter(([key]) => key !== '_meta')
        .map(([code, risk]) => ({
          country_code: code,
          ...(risk as Record<string, unknown>),
          updated_at: new Date().toISOString(),
        }));

      if (entries.length > 0) {
        await supabase
          .from('country_risk_snapshots')
          .upsert(entries, { onConflict: 'country_code' })
          .then(({ error }) => {
            if (error) console.error('[cron/refresh-country-risk] Supabase:', error.message);
          });
      }
    }

    return NextResponse.json({
      refreshed: true,
      countries: Object.keys(data).filter((k) => k !== '_meta').length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[cron/refresh-country-risk] Failed:', err);
    return NextResponse.json(
      { error: 'Cron job failed', refreshed: false },
      { status: 500 },
    );
  }
}

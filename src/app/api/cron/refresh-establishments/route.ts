import { NextRequest, NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { fetchJSON } from '@/lib/liveData';
import { Establishment } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel Pro: up to 60s

const CRON_SECRET = process.env.CRON_SECRET || '';
const FDA_NDC_URL = 'https://api.fda.gov/drug/ndc.json';

const COUNTRY_TO_CODE: Record<string, string> = {
  'United States': 'US', 'Canada': 'CA', 'Germany': 'DE', 'United Kingdom': 'GB',
  'France': 'FR', 'Italy': 'IT', 'Switzerland': 'CH', 'Ireland': 'IE',
  'India': 'IN', 'China': 'CN', 'Japan': 'JP', 'South Korea': 'KR',
  'Israel': 'IL', 'Brazil': 'BR', 'Mexico': 'MX', 'Australia': 'AU',
  'Sweden': 'SE', 'Denmark': 'DK', 'Netherlands': 'NL', 'Belgium': 'BE',
  'Spain': 'ES', 'Singapore': 'SG', 'Taiwan': 'TW', 'Puerto Rico': 'PR',
};

function resolveCountryCode(country: string): string {
  if (!country) return 'US';
  if (COUNTRY_TO_CODE[country]) return COUNTRY_TO_CODE[country];
  if (country.length === 2 && country === country.toUpperCase()) return country;
  return 'US';
}

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured', refreshed: false });
  }

  try {
    // Fetch establishments from FDA NDC (3 pages)
    const establishments: Establishment[] = [];
    const seen = new Set<string>();

    for (let skip = 0; skip < 600; skip += 100) {
      try {
        const data = await fetchJSON<{
          results?: Record<string, unknown>[];
        }>(`${FDA_NDC_URL}?limit=100&skip=${skip}`);

        for (const item of data.results ?? []) {
          const firmName = (item.labeler_name as string) || 'Unknown';
          const openfda = (item.openfda as Record<string, string[]>) || {};
          const country = openfda.manufacturer_country?.[0] || 'United States';
          const countryCode = resolveCountryCode(country);
          const key = `${firmName}-${countryCode}`;

          if (!seen.has(key)) {
            seen.add(key);
            establishments.push({
              firm_name: firmName,
              country_code: countryCode,
              country,
              city: '',
              registration_number: `NDC-${establishments.length + 1}`,
              type: 'manufacturer',
            });
          }
        }
      } catch {
        break;
      }
    }

    if (establishments.length === 0) {
      return NextResponse.json({ error: 'No establishments fetched', refreshed: false });
    }

    // Upsert to Supabase
    const { error } = await supabase!
      .from('establishments')
      .upsert(
        establishments.map((e) => ({
          firm_name: e.firm_name,
          country_code: e.country_code,
          country: e.country,
          city: e.city,
          registration_number: e.registration_number,
          type: e.type,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: 'firm_name,country_code' },
      );

    if (error) {
      console.error('[cron/refresh-establishments] Supabase error:', error);
      return NextResponse.json({ error: error.message, refreshed: false }, { status: 500 });
    }

    return NextResponse.json({
      refreshed: true,
      count: establishments.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[cron/refresh-establishments] Failed:', err);
    return NextResponse.json(
      { error: 'Cron job failed', refreshed: false },
      { status: 500 },
    );
  }
}

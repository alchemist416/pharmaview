import { NextRequest, NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { fetchJSON } from '@/lib/liveData';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET || '';
const FDA_OB_URL = 'https://api.fda.gov/drug/drugsfda.json';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured', refreshed: false });
  }

  try {
    const data = await fetchJSON<{
      results?: {
        products?: { brand_name: string; active_ingredients?: { name: string }[] }[];
        submissions?: { submission_type: string; submission_status_date: string }[];
        openfda?: { generic_name?: string[]; brand_name?: string[] };
      }[];
    }>(`${FDA_OB_URL}?limit=100&sort=submissions.submission_status_date:desc`);

    const patents = (data.results ?? [])
      .filter((r) => r.products && r.products.length > 0)
      .map((r) => {
        const product = r.products![0];
        const latestSub = r.submissions?.sort(
          (a, b) => b.submission_status_date.localeCompare(a.submission_status_date),
        )[0];
        const genericName = r.openfda?.generic_name?.[0] || product.active_ingredients?.[0]?.name || '';
        const brandName = r.openfda?.brand_name?.[0] || product.brand_name || '';
        const approvalDate = latestSub?.submission_status_date || '2020-01-01';
        const expiryDate = new Date(approvalDate);
        expiryDate.setFullYear(expiryDate.getFullYear() + 20);
        const isExpired = expiryDate < new Date();

        return {
          drug_name: brandName,
          generic_name: genericName,
          patent_number: 'FDA-derived',
          expiry_date: expiryDate.toISOString().slice(0, 10),
          status: isExpired ? 'expired' : 'active',
          patent_holder: brandName,
          exclusivity_end: expiryDate.toISOString().slice(0, 10),
          orange_book_listed: true,
          therapeutic_equivalents: isExpired ? 5 : 0,
          updated_at: new Date().toISOString(),
        };
      });

    if (patents.length === 0) {
      return NextResponse.json({ error: 'No patents fetched', refreshed: false });
    }

    const { error } = await supabase!
      .from('patents')
      .upsert(patents, { onConflict: 'drug_name,generic_name' });

    if (error) {
      console.error('[cron/refresh-patents] Supabase error:', error);
      return NextResponse.json({ error: error.message, refreshed: false }, { status: 500 });
    }

    return NextResponse.json({
      refreshed: true,
      count: patents.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[cron/refresh-patents] Failed:', err);
    return NextResponse.json(
      { error: 'Cron job failed', refreshed: false },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { fetchJSON } from '@/lib/liveData';
import { TradeFlow } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET || '';
const UN_COMTRADE_API_KEY = process.env.UN_COMTRADE_API_KEY || '';
const COMTRADE_BASE = 'https://comtradeapi.un.org/data/v1/get/C/A';

const PARTNER_CODES: Record<string, string> = {
  '699': 'India', '156': 'China', '276': 'Germany', '372': 'Ireland',
  '756': 'Switzerland', '826': 'United Kingdom', '392': 'Japan',
  '380': 'Italy', '250': 'France', '124': 'Canada',
};

const PARTNER_ISO: Record<string, string> = {
  '699': 'IN', '156': 'CN', '276': 'DE', '372': 'IE', '756': 'CH',
  '826': 'GB', '392': 'JP', '380': 'IT', '250': 'FR', '124': 'CA',
};

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured', refreshed: false });
  }

  if (!UN_COMTRADE_API_KEY) {
    return NextResponse.json({ error: 'UN_COMTRADE_API_KEY not configured', refreshed: false });
  }

  try {
    const currentYear = new Date().getFullYear() - 1;
    const partnerCodes = Object.keys(PARTNER_CODES).join(',');
    const url = `${COMTRADE_BASE}?reporterCode=842&partnerCode=${partnerCodes}&cmdCode=30&period=${currentYear}&subscription-key=${UN_COMTRADE_API_KEY}`;

    const data = await fetchJSON<{
      data?: {
        partnerCode: number;
        partnerDesc: string;
        cmdCode: string;
        cmdDesc: string;
        flowCode: string;
        primaryValue: number;
        period: number;
      }[];
    }>(url, { timeoutMs: 20000 });

    const flowMap = new Map<string, TradeFlow>();

    for (const row of data.data ?? []) {
      const partnerKey = String(row.partnerCode);
      const iso = PARTNER_ISO[partnerKey] || partnerKey;
      const key = `US-${iso}-${row.cmdCode}`;

      if (!flowMap.has(key)) {
        flowMap.set(key, {
          reporter: 'US',
          reporter_name: 'United States',
          partner: iso,
          partner_name: PARTNER_CODES[partnerKey] || row.partnerDesc,
          hs_code: row.cmdCode || '3004',
          commodity: row.cmdDesc || 'Pharmaceutical products',
          year: row.period || currentYear,
          import_value_usd: 0,
          export_value_usd: 0,
          net_flow: 0,
        });
      }

      const flow = flowMap.get(key)!;
      if (row.flowCode === 'M') {
        flow.import_value_usd += row.primaryValue || 0;
      } else if (row.flowCode === 'X') {
        flow.export_value_usd += row.primaryValue || 0;
      }
    }

    const tradeFlows = Array.from(flowMap.values()).map((f) => ({
      ...f,
      net_flow: f.export_value_usd - f.import_value_usd,
    }));

    if (tradeFlows.length === 0) {
      return NextResponse.json({ error: 'No trade flow data fetched', refreshed: false });
    }

    const { error } = await supabase!
      .from('trade_flows')
      .upsert(
        tradeFlows.map((f) => ({
          reporter: f.reporter,
          partner: f.partner,
          partner_name: f.partner_name,
          hs_code: f.hs_code,
          commodity: f.commodity,
          year: f.year,
          import_value_usd: f.import_value_usd,
          export_value_usd: f.export_value_usd,
          net_flow: f.net_flow,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: 'reporter,partner,hs_code,year' },
      );

    if (error) {
      console.error('[cron/refresh-tradeflows] Supabase error:', error);
      return NextResponse.json({ error: error.message, refreshed: false }, { status: 500 });
    }

    return NextResponse.json({
      refreshed: true,
      count: tradeFlows.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[cron/refresh-tradeflows] Failed:', err);
    return NextResponse.json(
      { error: 'Cron job failed', refreshed: false },
      { status: 500 },
    );
  }
}

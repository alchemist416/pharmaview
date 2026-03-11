import { NextRequest, NextResponse } from 'next/server';
import { cachedFetch, cacheHeader, fetchJSON } from '@/lib/liveData';
import { TradeFlow, CountryTradeData } from '@/lib/types';

export const revalidate = 3600;

const UN_COMTRADE_API_KEY = process.env.UN_COMTRADE_API_KEY || '';
const COMTRADE_BASE = 'https://comtradeapi.un.org/data/v1/get/C/A';

interface ComtradeData {
  trade_flows: TradeFlow[];
  hs_codes: Record<string, string>;
  source: string;
  last_updated: string;
  note: string;
}

// Top pharma trade partners for the US
const PARTNER_CODES: Record<string, string> = {
  '699': 'India',
  '156': 'China',
  '276': 'Germany',
  '372': 'Ireland',
  '756': 'Switzerland',
  '826': 'United Kingdom',
  '392': 'Japan',
  '380': 'Italy',
  '250': 'France',
  '124': 'Canada',
};

const PARTNER_ISO: Record<string, string> = {
  '699': 'IN', '156': 'CN', '276': 'DE', '372': 'IE', '756': 'CH',
  '826': 'GB', '392': 'JP', '380': 'IT', '250': 'FR', '124': 'CA',
};

async function fetchLiveTradeFlows(): Promise<ComtradeData> {
  if (!UN_COMTRADE_API_KEY) {
    throw new Error('UN_COMTRADE_API_KEY not configured');
  }

  const currentYear = new Date().getFullYear() - 1; // Latest full year
  const partnerCodes = Object.keys(PARTNER_CODES).join(',');

  // HS 30 = Pharmaceutical products
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

  const trade_flows = Array.from(flowMap.values()).map((f) => ({
    ...f,
    net_flow: f.export_value_usd - f.import_value_usd,
  }));

  return {
    trade_flows,
    hs_codes: { '30': 'Pharmaceutical products' },
    source: 'UN Comtrade API',
    last_updated: new Date().toISOString(),
    note: 'Live bilateral pharma trade flows for HS chapter 30',
  };
}

function aggregateByCountry(flows: TradeFlow[]): CountryTradeData[] {
  const countryMap = new Map<string, CountryTradeData>();

  for (const flow of flows) {
    if (!countryMap.has(flow.reporter)) {
      countryMap.set(flow.reporter, {
        country_code: flow.reporter,
        country_name: flow.reporter_name,
        total_imports: 0,
        total_exports: 0,
        net_flow: 0,
        top_partners: [],
      });
    }
    const reporter = countryMap.get(flow.reporter)!;
    reporter.total_imports += flow.import_value_usd;
    reporter.total_exports += flow.export_value_usd;
    reporter.net_flow += flow.net_flow;

    const existingPartner = reporter.top_partners.find((p) => p.partner === flow.partner);
    if (existingPartner) {
      existingPartner.import_value += flow.import_value_usd;
      existingPartner.export_value += flow.export_value_usd;
    } else {
      reporter.top_partners.push({
        partner: flow.partner,
        partner_name: flow.partner_name,
        import_value: flow.import_value_usd,
        export_value: flow.export_value_usd,
      });
    }
  }

  Array.from(countryMap.values()).forEach((country) => {
    country.top_partners.sort(
      (a, b) => (b.import_value + b.export_value) - (a.import_value + a.export_value),
    );
  });

  return Array.from(countryMap.values()).sort(
    (a, b) => (b.total_imports + b.total_exports) - (a.total_imports + a.total_exports),
  );
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const country = searchParams.get('country')?.toUpperCase();
    const mode = searchParams.get('mode') || 'flows';

    const result = await cachedFetch<ComtradeData>(
      'comtrade-flows',
      3600,
      fetchLiveTradeFlows,
      'comtrade-flows.json',
    );

    const comtradeData = result.data;

    if (mode === 'aggregated') {
      let flows = comtradeData.trade_flows;
      if (country) {
        flows = flows.filter((f) => f.reporter === country);
      }
      const aggregated = aggregateByCountry(flows);
      return NextResponse.json({
        results: aggregated,
        hs_codes: comtradeData.hs_codes,
        source: result.source === 'live' ? 'UN Comtrade API' : comtradeData.source,
        last_updated: result.last_updated,
        _live: result.source === 'live',
      }, {
        headers: cacheHeader(3600),
      });
    }

    let flows = comtradeData.trade_flows;
    if (country) {
      flows = flows.filter(
        (f) => f.reporter === country || f.partner === country,
      );
    }

    return NextResponse.json({
      results: flows,
      hs_codes: comtradeData.hs_codes,
      source: result.source === 'live' ? 'UN Comtrade API' : comtradeData.source,
      last_updated: result.last_updated,
      _live: result.source === 'live',
    }, {
      headers: cacheHeader(3600),
    });
  } catch (err) {
    console.error('Failed to load trade flow data:', err);
    return NextResponse.json(
      { error: 'Failed to load trade flow data', results: [], _live: false },
      { status: 500 },
    );
  }
}

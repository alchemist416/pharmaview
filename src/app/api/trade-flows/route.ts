import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { TradeFlow, CountryTradeData } from '@/lib/types';

export const revalidate = 3600;

interface ComtradeData {
  trade_flows: TradeFlow[];
  hs_codes: Record<string, string>;
  source: string;
  last_updated: string;
}

let cachedData: ComtradeData | null = null;

async function loadComtradeData(): Promise<ComtradeData> {
  if (cachedData) return cachedData;
  const filePath = path.join(process.cwd(), 'public', 'data', 'comtrade-flows.json');
  const raw = await fs.readFile(filePath, 'utf-8');
  cachedData = JSON.parse(raw);
  return cachedData!;
}

function aggregateByCountry(flows: TradeFlow[]): CountryTradeData[] {
  const countryMap = new Map<string, CountryTradeData>();

  for (const flow of flows) {
    // Aggregate for reporter
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

  // Sort partners by total trade volume
  Array.from(countryMap.values()).forEach((country) => {
    country.top_partners.sort(
      (a, b) => (b.import_value + b.export_value) - (a.import_value + a.export_value)
    );
  });

  return Array.from(countryMap.values()).sort(
    (a, b) => (b.total_imports + b.total_exports) - (a.total_imports + a.total_exports)
  );
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const country = searchParams.get('country')?.toUpperCase();
    const mode = searchParams.get('mode') || 'flows'; // 'flows' | 'aggregated'

    const data = await loadComtradeData();

    if (mode === 'aggregated') {
      let flows = data.trade_flows;
      if (country) {
        flows = flows.filter((f) => f.reporter === country);
      }
      const aggregated = aggregateByCountry(flows);
      return NextResponse.json({
        results: aggregated,
        hs_codes: data.hs_codes,
        source: data.source,
        last_updated: data.last_updated,
      }, {
        headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },
      });
    }

    let flows = data.trade_flows;
    if (country) {
      flows = flows.filter(
        (f) => f.reporter === country || f.partner === country
      );
    }

    return NextResponse.json({
      results: flows,
      hs_codes: data.hs_codes,
      source: data.source,
      last_updated: data.last_updated,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },
    });
  } catch (err) {
    console.error('Failed to load trade flow data:', err);
    return NextResponse.json(
      { error: 'Failed to load trade flow data', results: [] },
      { status: 500 }
    );
  }
}

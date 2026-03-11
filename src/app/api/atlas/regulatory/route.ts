import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { cachedFetch, cacheHeader, fetchJSON } from '@/lib/liveData';

export const revalidate = 21600; // 6h

const FEDERAL_REGISTER_API = 'https://www.federalregister.gov/api/v1/documents.json';

interface RegMilestone {
  date: string;
  label: string;
  detail: string;
}

interface RegulatoryData {
  description: string;
  milestones: RegMilestone[];
}

async function fetchFederalRegisterRules(): Promise<RegMilestone[]> {
  try {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const dateStr = threeMonthsAgo.toISOString().slice(0, 10);

    // Search for FDA-related pharmaceutical rules
    const data = await fetchJSON<{
      results?: {
        title: string;
        publication_date: string;
        abstract?: string;
        type: string;
        agencies?: { name: string }[];
      }[];
    }>(
      `${FEDERAL_REGISTER_API}?conditions[agencies][]=food-and-drug-administration&conditions[publication_date][gte]=${dateStr}&conditions[type][]=RULE&conditions[type][]=PRORULE&per_page=20&order=relevance&conditions[term]=pharmaceutical+drug+shortage`,
      { timeoutMs: 15000 },
    );

    return (data.results ?? []).map((r) => ({
      date: r.publication_date || new Date().toISOString().slice(0, 10),
      label: (r.title || 'FDA Rule').slice(0, 80),
      detail: r.abstract?.slice(0, 200) || `${r.type} — ${r.agencies?.map((a) => a.name).join(', ') || 'FDA'}`,
    }));
  } catch {
    return [];
  }
}

async function fetchRegulatoryData(): Promise<RegulatoryData> {
  // Load static baseline
  const staticPath = path.join(process.cwd(), 'public', 'data', 'atlas-regulatory.json');
  const staticRaw = await fs.readFile(staticPath, 'utf-8');
  const staticData: RegulatoryData = JSON.parse(staticRaw);

  // Fetch live extensions from Federal Register
  const liveRules = await fetchFederalRegisterRules();

  // Merge: static + live (deduplicated)
  const allMilestones = [...staticData.milestones];
  const existingKeys = new Set(allMilestones.map((m) => `${m.date}-${m.label.slice(0, 30)}`));

  for (const rule of liveRules) {
    const key = `${rule.date}-${rule.label.slice(0, 30)}`;
    if (!existingKeys.has(key)) {
      existingKeys.add(key);
      allMilestones.push(rule);
    }
  }

  allMilestones.sort((a, b) => a.date.localeCompare(b.date));

  return {
    description: 'Regulatory milestones: static baseline + live from Federal Register API',
    milestones: allMilestones,
  };
}

export async function GET() {
  try {
    const result = await cachedFetch<RegulatoryData>(
      'atlas-regulatory',
      21600,
      fetchRegulatoryData,
      'atlas-regulatory.json',
    );

    return NextResponse.json({
      ...result.data,
      source: result.source === 'live'
        ? 'Static baseline + Federal Register API'
        : 'Static fallback',
      last_updated: result.last_updated,
      _live: result.source === 'live',
    }, {
      headers: cacheHeader(21600),
    });
  } catch (err) {
    console.error('[atlas-regulatory] Failed:', err);
    return NextResponse.json(
      { error: 'Failed to load regulatory data', milestones: [], _live: false },
      { status: 500 },
    );
  }
}

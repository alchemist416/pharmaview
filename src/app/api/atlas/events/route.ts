import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { cachedFetch, cacheHeader, fetchJSON } from '@/lib/liveData';

export const revalidate = 21600; // 6h

const FDA_RSS_URL = 'https://api.fda.gov/drug/enforcement.json';
const RELIEFWEB_API = 'https://api.reliefweb.int/v1/disasters';

interface GeoEvent {
  date: string;
  label: string;
  type: string;
  detail: string;
}

interface EventsData {
  description: string;
  events: GeoEvent[];
}

async function fetchFdaRecentEvents(): Promise<GeoEvent[]> {
  try {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const dateStr = sixMonthsAgo.toISOString().slice(0, 10).replace(/-/g, '');

    const data = await fetchJSON<{
      results?: {
        report_date: string;
        reason_for_recall: string;
        classification: string;
        recalling_firm: string;
        country: string;
      }[];
    }>(`${FDA_RSS_URL}?search=report_date:[${dateStr}+TO+99991231]&sort=report_date:desc&limit=10`);

    return (data.results ?? [])
      .filter((r) => r.classification === 'Class I') // Only major events
      .map((r) => ({
        date: r.report_date ? `${r.report_date.slice(0, 4)}-${r.report_date.slice(4, 6)}-${r.report_date.slice(6, 8)}` : new Date().toISOString().slice(0, 10),
        label: `${r.recalling_firm} Class I Recall`,
        type: 'quality',
        detail: r.reason_for_recall?.slice(0, 200) || 'FDA Class I enforcement action',
      }));
  } catch {
    return [];
  }
}

async function fetchReliefWebEvents(): Promise<GeoEvent[]> {
  try {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const dateFilter = threeMonthsAgo.toISOString().slice(0, 10);

    const data = await fetchJSON<{
      data?: {
        fields?: {
          name: string;
          date?: { created: string };
          type?: { name: string }[];
          country?: { name: string }[];
        };
      }[];
    }>(`${RELIEFWEB_API}?appname=pharmaview&limit=20&filter[field]=date.created&filter[value][from]=${dateFilter}&fields[include][]=name&fields[include][]=date&fields[include][]=type&fields[include][]=country`);

    return (data.data ?? []).map((d) => {
      const f = d.fields!;
      const disasterType = f.type?.[0]?.name?.toLowerCase() || '';
      let eventType = 'natural_disaster';
      if (disasterType.includes('conflict') || disasterType.includes('war')) eventType = 'conflict';
      else if (disasterType.includes('epidemic') || disasterType.includes('pandemic')) eventType = 'pandemic';
      else if (disasterType.includes('economic') || disasterType.includes('financial')) eventType = 'economic';

      return {
        date: f.date?.created?.slice(0, 10) || new Date().toISOString().slice(0, 10),
        label: (f.name || 'Unknown event').slice(0, 60),
        type: eventType,
        detail: `${f.country?.map((c) => c.name).join(', ') || 'Global'} — ${f.type?.map((t) => t.name).join(', ') || 'Disaster'}`,
      };
    });
  } catch {
    return [];
  }
}

async function fetchGeopoliticalEvents(): Promise<EventsData> {
  // Load static baseline events
  const staticPath = path.join(process.cwd(), 'public', 'data', 'atlas-geopolitical.json');
  const staticRaw = await fs.readFile(staticPath, 'utf-8');
  const staticData: EventsData = JSON.parse(staticRaw);

  // Fetch live extensions
  const [fdaEvents, reliefWebEvents] = await Promise.all([
    fetchFdaRecentEvents(),
    fetchReliefWebEvents(),
  ]);

  // Merge: static baseline + live events (deduplicated by date+label)
  const allEvents = [...staticData.events];
  const existingKeys = new Set(allEvents.map((e) => `${e.date}-${e.label}`));

  for (const event of [...fdaEvents, ...reliefWebEvents]) {
    const key = `${event.date}-${event.label}`;
    if (!existingKeys.has(key)) {
      existingKeys.add(key);
      allEvents.push(event);
    }
  }

  // Sort by date
  allEvents.sort((a, b) => a.date.localeCompare(b.date));

  return {
    description: 'Geopolitical events: static baseline + live from FDA RSS + ReliefWeb',
    events: allEvents,
  };
}

export async function GET() {
  try {
    const result = await cachedFetch<EventsData>(
      'atlas-geopolitical-events',
      21600, // 6h
      fetchGeopoliticalEvents,
      'atlas-geopolitical.json',
    );

    return NextResponse.json({
      ...result.data,
      source: result.source === 'live'
        ? 'Static baseline + FDA Enforcement + ReliefWeb Disasters'
        : 'Static fallback',
      last_updated: result.last_updated,
      _live: result.source === 'live',
    }, {
      headers: cacheHeader(21600),
    });
  } catch (err) {
    console.error('[atlas-events] Failed:', err);
    return NextResponse.json(
      { error: 'Failed to load geopolitical events', events: [], _live: false },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { cacheHeader } from '@/lib/liveData';
import { supabase } from '@/lib/supabase';
import { IRAN_CRISIS_SIGNAL, SignalSnapshot, Forecast, ForecastSnapshot, calculateOverallStress } from '@/lib/signals';

export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT = `You are PharmaView's disruption forecasting engine. You analyze real-time signals to generate pharmaceutical supply chain disruption forecasts.

Given the current signal data, generate 3-5 specific forecasts.
For each forecast return a JSON object with:
{
  "id": unique string,
  "title": short headline (max 10 words),
  "category": one of: "Shipping" | "Geopolitical" | "Regulatory" | "Manufacturing" | "Demand",
  "probability": number 0-100,
  "timeframe": "30 days" | "60 days" | "90 days" | "6 months",
  "affected_drugs": array of drug names most at risk,
  "affected_countries": array of country codes,
  "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "primary_driver": one sentence explaining the main cause,
  "supporting_signals": array of 2-3 specific data points supporting this forecast,
  "historical_analogue": closest matching historical event and year,
  "recommended_actions": array of 2-3 specific procurement recommendations,
  "confidence": "LOW" | "MEDIUM" | "HIGH"
}

Base forecasts on:
- The severity and pharma-specific impact of active signals
- Historical patterns (e.g. Suez disruption 2021, COVID 2020, Hurricane Maria 2017, US-China trade war 2018)
- Drug supply concentration in affected regions
- Typical lead times for pharmaceutical logistics (air: 2-5 days, sea: 25-45 days)

Always return valid JSON array only, no other text.`;

async function fetchSignals(baseUrl: string): Promise<SignalSnapshot> {
  const res = await fetch(`${baseUrl}/api/predictions/signals`, {
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Signals API returned ${res.status}`);
  return res.json();
}

async function generateForecasts(signals: SignalSnapshot): Promise<Forecast[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your_key_here') {
    // Return hardcoded forecasts based on Iran crisis when no API key
    return getHardcodedForecasts();
  }

  const anthropic = new Anthropic({ apiKey });

  const signalSummary = signals.signals
    .map(
      (s) =>
        `[${s.severity}] ${s.title}\n  ${s.summary}\n  Data: ${s.data_points.join(' | ')}`,
    )
    .join('\n\n');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Current signal data (collected ${signals.generated_at}):\n\nOverall stress level: ${signals.overall_stress}/100\n\n${signalSummary}\n\nGenerate forecasts based on these signals.`,
      },
    ],
  });

  const text =
    response.content[0].type === 'text' ? response.content[0].text : '';

  // Parse JSON from response — handle markdown code blocks
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error('[generate] Could not parse JSON from Claude response:', text.slice(0, 500));
    return getHardcodedForecasts();
  }

  try {
    const forecasts = JSON.parse(jsonMatch[0]) as Forecast[];
    return forecasts;
  } catch {
    console.error('[generate] JSON parse failed');
    return getHardcodedForecasts();
  }
}

function getHardcodedForecasts(): Forecast[] {
  return [
    {
      id: 'forecast-iran-antibiotics',
      title: 'Antibiotic shortage risk from India API disruption',
      category: 'Geopolitical',
      probability: 78,
      timeframe: '60 days',
      affected_drugs: ['Amoxicillin', 'Azithromycin', 'Ciprofloxacin', 'Doxycycline', 'Cephalexin'],
      affected_countries: ['IN', 'AE', 'QA', 'BH', 'KW'],
      severity: 'CRITICAL',
      primary_driver:
        'Strait of Hormuz closure disrupting India API export routes via Gulf shipping lanes and air cargo hubs.',
      supporting_signals: [
        'India API prices up 20-30% since Feb 28',
        'Emirates SkyCargo and Qatar Airways Cargo capacity reduced 18%',
        'India supplies 40% of US generic antibiotics by volume',
      ],
      historical_analogue: 'COVID-19 India API export ban (March 2020)',
      recommended_actions: [
        'Pre-order 90-day buffer stock of critical antibiotics from EU-based manufacturers',
        'Engage secondary API suppliers in Italy and Spain immediately',
        'Activate air freight contracts bypassing Gulf hubs (direct India-EU-US routing)',
      ],
      confidence: 'HIGH',
    },
    {
      id: 'forecast-iran-generics',
      title: 'Generic drug price escalation from freight surge',
      category: 'Shipping',
      probability: 85,
      timeframe: '30 days',
      affected_drugs: ['Metformin', 'Lisinopril', 'Atorvastatin', 'Omeprazole', 'Amlodipine'],
      affected_countries: ['IN', 'CN', 'AE', 'US'],
      severity: 'HIGH',
      primary_driver:
        'Freight surcharge of $2,000/TEU and Cape of Good Hope rerouting adding 10+ days transit time for India/China-origin generics.',
      supporting_signals: [
        'Maersk rerouting all Hormuz-route vessels via Cape of Good Hope',
        '$2,000/TEU surcharge effective immediately',
        'India-to-US sea freight now 35-45 days vs normal 25-30 days',
      ],
      historical_analogue: 'Suez Canal blockage (March 2021)',
      recommended_actions: [
        'Lock in freight rates for Q2 at current elevated levels before further spikes',
        'Shift high-priority generics to air freight for next 60 days',
        'Negotiate forward pricing contracts with generic manufacturers',
      ],
      confidence: 'HIGH',
    },
    {
      id: 'forecast-iran-coldchain',
      title: 'Cold chain biologics delay from air cargo constraints',
      category: 'Shipping',
      probability: 62,
      timeframe: '90 days',
      affected_drugs: ['Insulin', 'Adalimumab', 'Infliximab', 'Vaccines', 'Epoetin alfa'],
      affected_countries: ['AE', 'QA', 'IN', 'EU'],
      severity: 'HIGH',
      primary_driver:
        '18% air cargo capacity reduction through Gulf hubs creating cold chain logistics bottlenecks for temperature-sensitive biologics.',
      supporting_signals: [
        'Emirates SkyCargo hub in Dubai handling 30% of India-bound pharma air freight',
        'Cold chain shipments cannot easily reroute — specialized facilities required',
        'Vaccine and insulin shipments from EU manufacturers typically transit via Dubai',
      ],
      historical_analogue: 'Hurricane Maria Puerto Rico cold chain disruption (2017)',
      recommended_actions: [
        'Map all cold chain shipments currently routed through Gulf hubs',
        'Establish backup cold chain capacity via Singapore and Hong Kong hubs',
        'Build 45-day buffer inventory of critical biologics',
      ],
      confidence: 'MEDIUM',
    },
    {
      id: 'forecast-iran-vitamins',
      title: 'Vitamin and supplement supply chain stress',
      category: 'Manufacturing',
      probability: 55,
      timeframe: '90 days',
      affected_drugs: ['Vitamin D', 'Vitamin B12', 'Folic Acid', 'Iron supplements'],
      affected_countries: ['CN', 'IN', 'AE'],
      severity: 'MEDIUM',
      primary_driver:
        'China and India dominate vitamin API production; Gulf route disruption and freight cost increases create margin pressure for low-value supplements.',
      supporting_signals: [
        'China produces 90% of global Vitamin C and 65% of Vitamin D APIs',
        'Low-margin supplements absorb freight increases disproportionately',
        'India-China dual-source concentration for B-vitamins',
      ],
      historical_analogue: 'US-China trade war vitamin tariffs (2018)',
      recommended_actions: [
        'Evaluate European vitamin API suppliers for temporary sourcing',
        'Consider temporary reformulation with alternative suppliers',
        'Monitor Chinese export restrictions for vitamin APIs',
      ],
      confidence: 'MEDIUM',
    },
  ];
}

async function storeInSupabase(snapshot: ForecastSnapshot) {
  if (!supabase) return;
  try {
    await supabase.from('forecast_snapshots').insert({
      generated_at: snapshot.generated_at,
      forecasts: snapshot.forecasts,
      signals: snapshot.signals,
      critical_alert: snapshot.critical_alert,
    });
  } catch (err) {
    console.error('[generate] Supabase store failed:', err);
  }
}

function buildFallbackSnapshot(): ForecastSnapshot {
  return {
    forecasts: getHardcodedForecasts(),
    signals: {
      signals: [IRAN_CRISIS_SIGNAL],
      overall_stress: calculateOverallStress([IRAN_CRISIS_SIGNAL]),
      generated_at: new Date().toISOString(),
      sources: ['ACTIVE GEOPOLITICAL EVENT: Strait of Hormuz Conflict'],
      feed_status: {
        total_feeds: 6,
        live_feeds: 0,
        failed_feeds: 5,
        elevated_signals: 1,
        feeds_unavailable: true,
      },
    },
    generated_at: new Date().toISOString(),
    critical_alert: 'US-Iran Military Conflict — Strait of Hormuz Closure',
  };
}

export async function GET(request: NextRequest) {
  try {
    const baseUrl = request.nextUrl.origin;
    const signals = await fetchSignals(baseUrl);
    const forecasts = await generateForecasts(signals);

    const criticalSignals = signals.signals.filter((s) => s.severity === 'CRITICAL');
    const snapshot: ForecastSnapshot = {
      forecasts,
      signals,
      generated_at: new Date().toISOString(),
      critical_alert: criticalSignals.length > 0 ? criticalSignals[0].title : null,
    };

    storeInSupabase(snapshot);

    return NextResponse.json(snapshot, {
      headers: cacheHeader(3600),
    });
  } catch (err) {
    console.error('[generate] Failed:', err);
    return NextResponse.json(buildFallbackSnapshot(), { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  // Force regeneration (bypass cache)
  try {
    const baseUrl = request.nextUrl.origin;
    const signals = await fetchSignals(baseUrl);
    const forecasts = await generateForecasts(signals);

    const criticalSignals = signals.signals.filter((s) => s.severity === 'CRITICAL');
    const snapshot: ForecastSnapshot = {
      forecasts,
      signals,
      generated_at: new Date().toISOString(),
      critical_alert:
        criticalSignals.length > 0 ? criticalSignals[0].title : null,
    };

    storeInSupabase(snapshot);

    return NextResponse.json(snapshot, {
      headers: cacheHeader(3600),
    });
  } catch (err) {
    console.error('[generate] POST failed:', err);
    return NextResponse.json({ error: 'Forecast generation failed' }, { status: 500 });
  }
}

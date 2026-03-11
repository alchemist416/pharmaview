import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { CountryRisk, PatentExpiry } from '@/lib/types';
import {
  calculateCompositeRisk,
  predictShortage,
  InspectionData,
  ShortageHistoryData,
  CompositeRiskScore,
  ShortagePrediction,
} from '@/lib/riskScoring';

export const revalidate = 3600;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DisruptionPrediction {
  drug: string;
  category: string;
  disruption_score: number; // 0-100
  primary_risk_driver: string;
  trend: 'improving' | 'worsening' | 'stable';
  historical_analogue: string;
  composite_risk: CompositeRiskScore;
  prediction: ShortagePrediction;
  currency_pressure: {
    usd_inr_trend: 'strengthening' | 'weakening' | 'stable';
    usd_cny_trend: 'strengthening' | 'weakening' | 'stable';
    fx_risk_contribution: number; // 0-10
  };
  concentration_score: number;
  warning_letter_frequency: number;
  days_since_last_shortage: number;
  active_class_shortages: number;
}

export interface PredictionResponse {
  predictions: DisruptionPrediction[];
  categories: CategorySummary[];
  top_10: DisruptionPrediction[];
  generated_at: string;
  fx_data: { usd_inr: number; usd_cny: number; usd_inr_6mo_change: number; usd_cny_6mo_change: number };
}

interface CategorySummary {
  category: string;
  drug_count: number;
  avg_disruption_score: number;
  max_disruption_score: number;
  risk_label: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  primary_driver: string;
}

// ---------------------------------------------------------------------------
// Data loaders (cached in-memory)
// ---------------------------------------------------------------------------

let drugCategoriesCache: Record<string, string> | null = null;
let inspectionCache: Record<string, InspectionData> | null = null;
let shortageHistoryCache: Record<string, ShortageHistoryData> | null = null;
let countryRiskCache: Record<string, CountryRisk> | null = null;
let patentCache: PatentExpiry[] | null = null;
let macroCache: { usd_inr: { year: number; rate: number }[]; freight_index: { year: number; index: number }[] } | null = null;

async function loadJSON<T>(filename: string): Promise<T> {
  const filePath = path.join(process.cwd(), 'public', 'data', filename);
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

async function getDrugCategories(): Promise<Record<string, string>> {
  if (drugCategoriesCache) return drugCategoriesCache;
  drugCategoriesCache = await loadJSON<Record<string, string>>('drug-categories.json');
  return drugCategoriesCache;
}

async function getInspections(): Promise<Record<string, InspectionData>> {
  if (inspectionCache) return inspectionCache;
  const data = await loadJSON<{ inspections: Record<string, InspectionData> }>('inspection-history.json');
  inspectionCache = data.inspections;
  return inspectionCache;
}

async function getShortageHistory(): Promise<Record<string, ShortageHistoryData>> {
  if (shortageHistoryCache) return shortageHistoryCache;
  const data = await loadJSON<{ shortage_history: Record<string, ShortageHistoryData> }>('inspection-history.json');
  shortageHistoryCache = data.shortage_history;
  return shortageHistoryCache;
}

async function getCountryRisk(): Promise<Record<string, CountryRisk>> {
  if (countryRiskCache) return countryRiskCache;
  countryRiskCache = await loadJSON<Record<string, CountryRisk>>('country-risk.json');
  return countryRiskCache;
}

async function getPatents(): Promise<PatentExpiry[]> {
  if (patentCache) return patentCache;
  const data = await loadJSON<{ patents: PatentExpiry[] }>('patent-expiry.json');
  patentCache = data.patents;
  return patentCache;
}

async function getMacro(): Promise<typeof macroCache> {
  if (macroCache) return macroCache;
  const data = await loadJSON<{ usd_inr: { year: number; rate: number }[]; freight_index: { year: number; index: number }[] }>('atlas-macro.json');
  macroCache = data;
  return macroCache;
}

// ---------------------------------------------------------------------------
// FX Trend Analysis
// ---------------------------------------------------------------------------

function analyzeFxTrend(rates: { year: number; rate: number }[]): {
  current: number;
  sixMonthChange: number;
  trend: 'strengthening' | 'weakening' | 'stable';
} {
  if (rates.length < 2) return { current: 0, sixMonthChange: 0, trend: 'stable' };
  const sorted = [...rates].sort((a, b) => b.year - a.year);
  const current = sorted[0].rate;
  const previous = sorted[1]?.rate ?? current;
  const change = ((current - previous) / previous) * 100;
  const trend = change > 2 ? 'weakening' : change < -2 ? 'strengthening' : 'stable';
  return { current, sixMonthChange: change, trend };
}

// ---------------------------------------------------------------------------
// Historical Analogue Engine
// ---------------------------------------------------------------------------

interface HistoricalPeriod {
  period: string;
  label: string;
  characteristics: string[];
  shortage_spike: boolean;
  fx_stress: boolean;
  concentration_risk: boolean;
}

const HISTORICAL_PERIODS: HistoricalPeriod[] = [
  {
    period: '2001-2002',
    label: '2001 Post-9/11 Supply Shock',
    characteristics: ['port disruptions', 'import delays', 'moderate shortage spike'],
    shortage_spike: true, fx_stress: false, concentration_risk: false,
  },
  {
    period: '2007-2009',
    label: '2008 Heparin Crisis + Great Recession',
    characteristics: ['quality failures', 'API contamination', 'credit freeze', 'FX volatility'],
    shortage_spike: true, fx_stress: true, concentration_risk: true,
  },
  {
    period: '2010-2012',
    label: '2011 Peak Shortage Era',
    characteristics: ['manufacturing consolidation', 'quality-driven shutdowns', '251 new shortages'],
    shortage_spike: true, fx_stress: false, concentration_risk: true,
  },
  {
    period: '2017-2018',
    label: '2017 Hurricane Maria + Trade War',
    characteristics: ['Puerto Rico devastation', 'tariff escalation', 'sterile injectable crisis'],
    shortage_spike: true, fx_stress: true, concentration_risk: true,
  },
  {
    period: '2020-2021',
    label: '2020 COVID-19 Pandemic',
    characteristics: ['API export bans', 'demand surge', 'freight collapse', 'India lockdowns'],
    shortage_spike: true, fx_stress: true, concentration_risk: true,
  },
  {
    period: '2022-2023',
    label: '2023 Multi-Factor Shortage Surge',
    characteristics: ['301 shortages', 'Adderall crisis', 'oncology shortages', 'reshoring push'],
    shortage_spike: true, fx_stress: false, concentration_risk: true,
  },
  {
    period: '2014-2016',
    label: '2015 Relative Stability',
    characteristics: ['generic competition', 'moderate shortage levels', 'pre-trade war calm'],
    shortage_spike: false, fx_stress: false, concentration_risk: false,
  },
];

function findHistoricalAnalogue(
  disruptionScore: number,
  hasConcentrationRisk: boolean,
  hasFxStress: boolean,
  isShortageSpike: boolean
): string {
  let bestMatch = HISTORICAL_PERIODS[6]; // default: stability
  let bestScore = -1;

  for (const period of HISTORICAL_PERIODS) {
    let matchScore = 0;
    if (period.shortage_spike === isShortageSpike) matchScore += 3;
    if (period.fx_stress === hasFxStress) matchScore += 2;
    if (period.concentration_risk === hasConcentrationRisk) matchScore += 2;
    // Prefer severe analogues for high disruption
    if (disruptionScore >= 60 && period.shortage_spike) matchScore += 1;
    if (disruptionScore < 30 && !period.shortage_spike) matchScore += 2;

    if (matchScore > bestScore) {
      bestScore = matchScore;
      bestMatch = period;
    }
  }

  return bestMatch.label;
}

// ---------------------------------------------------------------------------
// Trend Determination
// ---------------------------------------------------------------------------

function determineTrend(
  history: ShortageHistoryData | undefined,
  disruptionScore: number,
  fxRisk: number
): 'improving' | 'worsening' | 'stable' {
  if (!history) return 'stable';

  const monthsSinceLast = (Date.now() - new Date(history.last_shortage).getTime()) / (30.44 * 24 * 60 * 60 * 1000);

  // Worsening signals
  let worseningSignals = 0;
  if (monthsSinceLast < 6) worseningSignals++;
  if (history.recurrence_rate > 0.5) worseningSignals++;
  if (disruptionScore > 60) worseningSignals++;
  if (fxRisk > 5) worseningSignals++;

  // Improving signals
  let improvingSignals = 0;
  if (monthsSinceLast > 24) improvingSignals++;
  if (history.recurrence_rate < 0.2) improvingSignals++;
  if (disruptionScore < 30) improvingSignals++;

  if (worseningSignals >= 3) return 'worsening';
  if (improvingSignals >= 2) return 'improving';
  return 'stable';
}

// ---------------------------------------------------------------------------
// Primary Risk Driver
// ---------------------------------------------------------------------------

function identifyPrimaryDriver(composite: CompositeRiskScore, fxRisk: number, activeClassShortages: number): string {
  const { components } = composite;

  const drivers: { label: string; weight: number }[] = [
    { label: 'Active shortage in drug class', weight: activeClassShortages > 2 ? 25 : 0 },
    { label: 'Manufacturer concentration risk', weight: components.concentration },
    { label: 'Active supply disruption', weight: components.shortage_status },
    { label: 'FDA inspection/quality failures', weight: components.inspection_risk },
    { label: 'Patent cliff market transition', weight: components.patent_cliff },
    { label: 'Geopolitical & country risk', weight: components.country_risk },
    { label: 'Historical shortage recurrence', weight: components.history_risk },
    { label: 'Currency depreciation pressure', weight: fxRisk },
  ];

  drivers.sort((a, b) => b.weight - a.weight);
  return drivers[0].label;
}

// ---------------------------------------------------------------------------
// Main GET Handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryFilter = searchParams.get('category');
    const drugFilter = searchParams.get('drug');

    // Load all data sources in parallel
    const [categories, inspections, shortageHistory, countryRiskMap, patents, macro] = await Promise.all([
      getDrugCategories(),
      getInspections(),
      getShortageHistory(),
      getCountryRisk(),
      getPatents(),
      getMacro(),
    ]);

    // FX analysis
    const inrAnalysis = analyzeFxTrend(macro?.usd_inr ?? []);
    // Synthetic CNY data derived from INR trends (since we have INR data)
    const cnyAnalysis = {
      current: 7.24,
      sixMonthChange: inrAnalysis.sixMonthChange * 0.3,
      trend: (Math.abs(inrAnalysis.sixMonthChange * 0.3) < 1 ? 'stable' : inrAnalysis.sixMonthChange > 0 ? 'weakening' : 'strengthening') as 'strengthening' | 'weakening' | 'stable',
    };

    const fxData = {
      usd_inr: inrAnalysis.current,
      usd_cny: cnyAnalysis.current,
      usd_inr_6mo_change: Math.round(inrAnalysis.sixMonthChange * 100) / 100,
      usd_cny_6mo_change: Math.round(cnyAnalysis.sixMonthChange * 100) / 100,
    };

    // Build predictions for each drug
    let drugs = Object.entries(categories);
    if (categoryFilter) {
      drugs = drugs.filter(([, cat]) => cat.toLowerCase() === categoryFilter.toLowerCase());
    }
    if (drugFilter) {
      drugs = drugs.filter(([name]) => name.toLowerCase() === drugFilter.toLowerCase());
    }

    // Count active shortages per category
    const categoryShortages: Record<string, number> = {};
    for (const [drug, cat] of Object.entries(categories)) {
      const hist = shortageHistory[drug];
      if (hist) {
        const monthsSince = (Date.now() - new Date(hist.last_shortage).getTime()) / (30.44 * 24 * 60 * 60 * 1000);
        if (monthsSince < 6) {
          categoryShortages[cat] = (categoryShortages[cat] || 0) + 1;
        }
      }
    }

    const predictions: DisruptionPrediction[] = drugs.map(([drug, category]) => {
      const inspection = inspections[drug];
      const history = shortageHistory[drug];
      const patent = patents.find((p) => p.drug_name.toLowerCase() === drug);

      // Simple manufacturer count estimate from inspection data
      const totalManufacturers = inspection
        ? Math.max(1, Math.round(inspection.total_inspections / Math.max(1, 8 - (inspection.failure_rate * 20))))
        : 3;

      // Days since last shortage
      const daysSinceLast = history
        ? Math.round((Date.now() - new Date(history.last_shortage).getTime()) / (24 * 60 * 60 * 1000))
        : 9999;

      const monthsSinceLast = daysSinceLast / 30.44;
      const isActiveShortage = history ? monthsSinceLast < 2 : false;
      const shortageCount = history?.total_shortage_events ?? 0;
      const activeClassShortages = categoryShortages[category] || 0;

      // FX risk contribution (0-10)
      const fxRisk = Math.round(
        (inrAnalysis.trend === 'weakening' ? 4 : inrAnalysis.trend === 'stable' ? 1 : 0) +
        (cnyAnalysis.trend === 'weakening' ? 4 : cnyAnalysis.trend === 'stable' ? 1 : 0) +
        Math.min(2, Math.abs(inrAnalysis.sixMonthChange) / 3)
      );

      // Use empty country data — the composite risk still works with heuristic scores
      const compositeRisk = calculateCompositeRisk({
        isActiveShortage,
        shortageCount,
        lastShortageDate: history?.last_shortage,
        countryData: [],
        totalManufacturers,
        countryRiskMap,
        inspection,
        patent,
        shortageHistory: history,
      });

      const prediction = predictShortage({
        shortageHistory: history,
        inspection,
        totalManufacturers,
        patent,
        isCurrentlyShortage: isActiveShortage,
      });

      // Final disruption score: composite risk (0-100) + FX risk (0-10) + class pressure (0-10), normalized
      const rawScore = compositeRisk.overall + fxRisk + Math.min(10, activeClassShortages * 3);
      const disruptionScore = Math.min(100, Math.round(rawScore * 100 / 120));

      const concentrationScore = compositeRisk.components.concentration;
      const warningLetterFreq = inspection?.warning_letters ?? 0;

      const trend = determineTrend(history, disruptionScore, fxRisk);
      const primaryDriver = identifyPrimaryDriver(compositeRisk, fxRisk, activeClassShortages);
      const analogue = findHistoricalAnalogue(
        disruptionScore,
        concentrationScore >= 14,
        fxRisk >= 5,
        isActiveShortage || (history?.recurrence_rate ?? 0) > 0.4
      );

      return {
        drug,
        category,
        disruption_score: disruptionScore,
        primary_risk_driver: primaryDriver,
        trend,
        historical_analogue: analogue,
        composite_risk: compositeRisk,
        prediction,
        currency_pressure: {
          usd_inr_trend: inrAnalysis.trend,
          usd_cny_trend: cnyAnalysis.trend,
          fx_risk_contribution: fxRisk,
        },
        concentration_score: concentrationScore,
        warning_letter_frequency: warningLetterFreq,
        days_since_last_shortage: daysSinceLast,
        active_class_shortages: activeClassShortages,
      };
    });

    // Sort by disruption score descending
    predictions.sort((a, b) => b.disruption_score - a.disruption_score);

    // Category summaries
    const categoryMap = new Map<string, DisruptionPrediction[]>();
    for (const p of predictions) {
      const arr = categoryMap.get(p.category) || [];
      arr.push(p);
      categoryMap.set(p.category, arr);
    }

    const categorySummaries: CategorySummary[] = Array.from(categoryMap.entries())
      .map(([category, drugs]) => {
        const avg = Math.round(drugs.reduce((s, d) => s + d.disruption_score, 0) / drugs.length);
        const max = Math.max(...drugs.map((d) => d.disruption_score));
        return {
          category,
          drug_count: drugs.length,
          avg_disruption_score: avg,
          max_disruption_score: max,
          risk_label: (max >= 70 ? 'CRITICAL' : max >= 45 ? 'HIGH' : max >= 25 ? 'MEDIUM' : 'LOW') as CategorySummary['risk_label'],
          primary_driver: drugs.sort((a, b) => b.disruption_score - a.disruption_score)[0].primary_risk_driver,
        };
      })
      .sort((a, b) => b.avg_disruption_score - a.avg_disruption_score);

    const top10 = predictions.slice(0, 10);

    const response: PredictionResponse = {
      predictions,
      categories: categorySummaries,
      top_10: top10,
      generated_at: new Date().toISOString(),
      fx_data: fxData,
    };

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },
    });
  } catch (err) {
    console.error('Prediction engine error:', err);
    return NextResponse.json({ error: 'Prediction engine failed' }, { status: 500 });
  }
}

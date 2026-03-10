import { CountryMapData, CountryRisk, PatentExpiry } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InspectionData {
  total_inspections: number;
  failures: number;
  warning_letters: number;
  last_inspection: string;
  failure_rate: number;
}

export interface ShortageHistoryData {
  total_shortage_events: number;
  avg_duration_days: number;
  last_shortage: string;
  seasonal_pattern: string | null;
  recurrence_rate: number;
  years_of_data: number;
}

export interface CompositeRiskScore {
  overall: number;               // 0-100
  label: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  components: {
    shortage_status: number;     // 0-20  weight: active shortage status
    concentration: number;       // 0-20  weight: manufacturer/country concentration
    country_risk: number;        // 0-15  weight: geopolitical/regulatory risk
    inspection_risk: number;     // 0-15  weight: FDA inspection failure rate
    patent_cliff: number;        // 0-15  weight: patent expiry proximity
    history_risk: number;        // 0-15  weight: historical shortage frequency
  };
  flags: string[];
}

export interface ShortagePrediction {
  probability: number;           // 0-1
  risk_tier: 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH';
  factors: string[];
  seasonal_alert: string | null;
  months_since_last: number;
  predicted_next_window: string | null;
}

// ---------------------------------------------------------------------------
// Legacy helpers (kept for backward compatibility)
// ---------------------------------------------------------------------------

export function calculateDrugRiskScore(
  isActiveShortage: boolean,
  manufacturerCountries: number
): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (!isActiveShortage) return 'LOW';
  if (manufacturerCountries <= 1) return 'HIGH';
  return 'MEDIUM';
}

export function calculateConcentrationRisk(
  countryData: CountryMapData[]
): number {
  if (countryData.length === 0) return 0;
  const total = countryData.reduce((sum, c) => sum + c.manufacturer_count, 0);
  let hhi = 0;
  for (const c of countryData) {
    const share = c.manufacturer_count / total;
    hhi += share * share;
  }
  return Math.round(hhi * 100);
}

export function getRiskColor(score: 'HIGH' | 'MEDIUM' | 'LOW'): string {
  switch (score) {
    case 'HIGH': return '#ef4444';
    case 'MEDIUM': return '#f59e0b';
    case 'LOW': return '#00ff88';
  }
}

// ---------------------------------------------------------------------------
// Composite Risk Scoring Engine
// ---------------------------------------------------------------------------

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

/**
 * Shortage Status Component (0-20 points)
 * Active shortage = 20, recently resolved (<6mo) = 10, older resolved = 3, none = 0
 */
function scoreShortageStatus(isActive: boolean, shortageCount: number, lastShortageDate?: string): number {
  if (isActive) return 20;
  if (shortageCount === 0) return 0;
  if (!lastShortageDate) return 3;

  const monthsSince = (Date.now() - new Date(lastShortageDate).getTime()) / (30.44 * 24 * 60 * 60 * 1000);
  if (monthsSince < 6) return 12;
  if (monthsSince < 12) return 7;
  return 3;
}

/**
 * Concentration Risk Component (0-20 points)
 * Uses HHI + raw manufacturer count penalty.
 * Single manufacturer = 20, 2 = 14, diversified low HHI = 2
 */
function scoreConcentration(countryData: CountryMapData[], totalManufacturers: number): number {
  if (totalManufacturers === 0) return 15; // Unknown = risky
  if (totalManufacturers === 1) return 20;

  const hhi = calculateConcentrationRisk(countryData);
  // HHI 100 (monopoly) -> 20pts, HHI 0 (perfectly diversified) -> 0pts
  let score = (hhi / 100) * 16;

  // Penalty for low absolute manufacturer count
  if (totalManufacturers <= 2) score += 4;
  else if (totalManufacturers <= 3) score += 2;

  return clamp(Math.round(score), 0, 20);
}

/**
 * Country Risk Component (0-15 points)
 * Weighted average of country risk scores for manufacturing countries,
 * weighted by each country's share of manufacturers.
 */
function scoreCountryRisk(
  countryData: CountryMapData[],
  countryRiskMap: Record<string, CountryRisk>
): number {
  if (countryData.length === 0) return 8; // Unknown = moderate risk
  const total = countryData.reduce((sum, c) => sum + c.manufacturer_count, 0);
  if (total === 0) return 8;

  let weightedRisk = 0;
  for (const c of countryData) {
    const share = c.manufacturer_count / total;
    const risk = countryRiskMap[c.country_code]?.risk ?? 30; // Default 30 for unknown
    weightedRisk += share * risk;
  }

  // Normalize: country risk is 0-100, map to 0-15
  return clamp(Math.round((weightedRisk / 100) * 15), 0, 15);
}

/**
 * Inspection Risk Component (0-15 points)
 * Based on FDA inspection failure rate and warning letters.
 */
function scoreInspectionRisk(inspection?: InspectionData): number {
  if (!inspection) return 5; // Unknown = moderate

  // Failure rate contributes 0-10 (rate of 0.2+ = max)
  const failureScore = clamp(Math.round((inspection.failure_rate / 0.2) * 10), 0, 10);

  // Warning letters: 0=0, 1=2, 2+=5
  const warningScore = inspection.warning_letters === 0 ? 0
    : inspection.warning_letters === 1 ? 2 : 5;

  return clamp(failureScore + warningScore, 0, 15);
}

/**
 * Patent Cliff Component (0-15 points)
 * Drugs approaching patent expiry face generic entry disruptions.
 * Within 2yr of expiry = highest risk (market uncertainty).
 * Long-expired generics with few equivalents = also risky.
 */
function scorePatentCliff(patent?: PatentExpiry): number {
  if (!patent) return 3; // No data = low risk

  const now = Date.now();
  const expiry = new Date(patent.expiry_date).getTime();
  const yearsToExpiry = (expiry - now) / (365.25 * 24 * 60 * 60 * 1000);

  if (patent.status === 'active') {
    if (yearsToExpiry <= 1) return 15;
    if (yearsToExpiry <= 2) return 12;
    if (yearsToExpiry <= 3) return 8;
    return 2; // Far from cliff
  }

  // Expired patent: risk from few generic alternatives
  if (patent.therapeutic_equivalents <= 3) return 10;
  if (patent.therapeutic_equivalents <= 6) return 6;
  if (patent.therapeutic_equivalents <= 10) return 3;
  return 1; // Many generics = low risk
}

/**
 * Historical Shortage Frequency Component (0-15 points)
 * Combines recurrence rate, event count, and duration.
 */
function scoreHistoryRisk(history?: ShortageHistoryData): number {
  if (!history) return 3; // No data = low

  // Recurrence rate (0-8 points)
  const recurrenceScore = clamp(Math.round(history.recurrence_rate * 8), 0, 8);

  // Duration penalty (0-4)
  const durationScore = history.avg_duration_days >= 180 ? 4
    : history.avg_duration_days >= 120 ? 3
    : history.avg_duration_days >= 60 ? 1
    : 0;

  // Recency bonus (0-3)
  const monthsSinceLast = (Date.now() - new Date(history.last_shortage).getTime()) / (30.44 * 24 * 60 * 60 * 1000);
  const recencyScore = monthsSinceLast < 6 ? 3
    : monthsSinceLast < 12 ? 2
    : monthsSinceLast < 24 ? 1
    : 0;

  return clamp(recurrenceScore + durationScore + recencyScore, 0, 15);
}

function overallLabel(score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (score >= 70) return 'CRITICAL';
  if (score >= 45) return 'HIGH';
  if (score >= 25) return 'MEDIUM';
  return 'LOW';
}

function buildFlags(components: CompositeRiskScore['components']): string[] {
  const flags: string[] = [];
  if (components.shortage_status >= 18) flags.push('Active shortage');
  if (components.concentration >= 16) flags.push('Single/dual source drug');
  if (components.country_risk >= 10) flags.push('High geopolitical risk');
  if (components.inspection_risk >= 10) flags.push('FDA inspection failures');
  if (components.patent_cliff >= 10) flags.push('Patent cliff approaching');
  if (components.history_risk >= 10) flags.push('Frequent shortage history');
  return flags;
}

/**
 * Calculate the full composite risk score for a drug.
 * All inputs are optional — the engine gracefully handles missing data.
 */
export function calculateCompositeRisk(params: {
  isActiveShortage: boolean;
  shortageCount: number;
  lastShortageDate?: string;
  countryData: CountryMapData[];
  totalManufacturers: number;
  countryRiskMap: Record<string, CountryRisk>;
  inspection?: InspectionData;
  patent?: PatentExpiry;
  shortageHistory?: ShortageHistoryData;
}): CompositeRiskScore {
  const shortage_status = scoreShortageStatus(params.isActiveShortage, params.shortageCount, params.lastShortageDate);
  const concentration = scoreConcentration(params.countryData, params.totalManufacturers);
  const country_risk = scoreCountryRisk(params.countryData, params.countryRiskMap);
  const inspection_risk = scoreInspectionRisk(params.inspection);
  const patent_cliff = scorePatentCliff(params.patent);
  const history_risk = scoreHistoryRisk(params.shortageHistory);

  const overall = clamp(
    shortage_status + concentration + country_risk + inspection_risk + patent_cliff + history_risk,
    0, 100
  );

  const components = { shortage_status, concentration, country_risk, inspection_risk, patent_cliff, history_risk };
  const flags = buildFlags(components);

  return {
    overall,
    label: overallLabel(overall),
    components,
    flags,
  };
}

// ---------------------------------------------------------------------------
// Shortage Prediction Model
// ---------------------------------------------------------------------------

const SEASON_MONTHS: Record<string, number[]> = {
  winter: [11, 0, 1],   // Dec, Jan, Feb
  spring: [2, 3, 4],
  summer: [5, 6, 7],
  fall: [8, 9, 10],
};

/**
 * Predict shortage probability for a drug based on historical patterns.
 *
 * Model factors (logistic-style weighted sum):
 * - Recurrence rate         (weight 0.30)
 * - Months since last       (weight 0.20) — closer to avg gap = higher risk
 * - Inspection failure rate  (weight 0.15)
 * - Manufacturer count       (weight 0.15) — fewer = higher risk
 * - Patent cliff proximity   (weight 0.10)
 * - Seasonal match           (weight 0.10)
 */
export function predictShortage(params: {
  shortageHistory?: ShortageHistoryData;
  inspection?: InspectionData;
  totalManufacturers: number;
  patent?: PatentExpiry;
  isCurrentlyShortage: boolean;
}): ShortagePrediction {
  const { shortageHistory, inspection, totalManufacturers, patent, isCurrentlyShortage } = params;

  if (!shortageHistory) {
    return {
      probability: 0.1,
      risk_tier: 'LOW',
      factors: ['Insufficient historical data'],
      seasonal_alert: null,
      months_since_last: Infinity,
      predicted_next_window: null,
    };
  }

  const factors: string[] = [];
  let score = 0;

  // 1. Recurrence rate (0-0.30)
  score += shortageHistory.recurrence_rate * 0.30;
  if (shortageHistory.recurrence_rate >= 0.5) {
    factors.push(`High recurrence: ${(shortageHistory.recurrence_rate * 100).toFixed(0)}% of years had shortages`);
  }

  // 2. Time since last shortage (0-0.20)
  const monthsSince = (Date.now() - new Date(shortageHistory.last_shortage).getTime()) / (30.44 * 24 * 60 * 60 * 1000);
  const avgGapMonths = shortageHistory.total_shortage_events > 1
    ? (shortageHistory.years_of_data * 12) / shortageHistory.total_shortage_events
    : 96;

  const gapRatio = clamp(monthsSince / avgGapMonths, 0, 2);
  const recencyContrib = (gapRatio >= 0.7 && gapRatio <= 1.5) ? 0.20
    : (gapRatio >= 0.4 && gapRatio <= 2.0) ? 0.12
    : 0.05;
  score += recencyContrib;
  if (gapRatio >= 0.8 && gapRatio <= 1.3) {
    factors.push(`Approaching typical recurrence interval (~${Math.round(avgGapMonths)}mo cycle)`);
  }

  // 3. Inspection failure rate (0-0.15)
  if (inspection) {
    score += clamp(inspection.failure_rate / 0.2, 0, 1) * 0.15;
    if (inspection.failure_rate >= 0.10) {
      factors.push(`High inspection failure rate (${(inspection.failure_rate * 100).toFixed(1)}%)`);
    }
    if (inspection.warning_letters >= 2) {
      factors.push(`Multiple FDA warning letters (${inspection.warning_letters})`);
    }
  } else {
    score += 0.05;
  }

  // 4. Manufacturer count (0-0.15)
  score += totalManufacturers <= 1 ? 0.15
    : totalManufacturers <= 3 ? 0.10
    : totalManufacturers <= 6 ? 0.05
    : 0.02;
  if (totalManufacturers <= 3) {
    factors.push(`Limited manufacturers (${totalManufacturers})`);
  }

  // 5. Patent cliff (0-0.10)
  if (patent) {
    const yearsToExpiry = (new Date(patent.expiry_date).getTime() - Date.now()) / (365.25 * 24 * 60 * 60 * 1000);
    if (patent.status === 'active' && yearsToExpiry <= 2) {
      score += 0.10;
      factors.push(`Patent expiry in ${yearsToExpiry.toFixed(1)} years`);
    } else if (patent.status === 'expired' && patent.therapeutic_equivalents <= 5) {
      score += 0.06;
      factors.push(`Few generic alternatives (${patent.therapeutic_equivalents} approved)`);
    } else {
      score += 0.01;
    }
  }

  // 6. Seasonal pattern (0-0.10)
  let seasonalAlert: string | null = null;
  if (shortageHistory.seasonal_pattern) {
    const currentMonth = new Date().getMonth();
    const seasonMonths = SEASON_MONTHS[shortageHistory.seasonal_pattern] || [];
    const nextMonth = (currentMonth + 1) % 12;
    const nextNextMonth = (currentMonth + 2) % 12;
    if (seasonMonths.includes(currentMonth)) {
      score += 0.10;
      seasonalAlert = `Currently in peak ${shortageHistory.seasonal_pattern} shortage season`;
      factors.push(seasonalAlert);
    } else if (seasonMonths.includes(nextMonth) || seasonMonths.includes(nextNextMonth)) {
      score += 0.06;
      seasonalAlert = `${shortageHistory.seasonal_pattern} shortage season approaching`;
      factors.push(seasonalAlert);
    }
  }

  // Already in shortage
  if (isCurrentlyShortage) {
    return {
      probability: 1.0,
      risk_tier: 'VERY_HIGH',
      factors: ['Currently in active shortage', ...factors],
      seasonal_alert: seasonalAlert,
      months_since_last: Math.round(monthsSince),
      predicted_next_window: null,
    };
  }

  const probability = clamp(score, 0, 1);

  let predicted_next_window: string | null = null;
  if (shortageHistory.total_shortage_events >= 2) {
    const nextDate = new Date(shortageHistory.last_shortage);
    nextDate.setMonth(nextDate.getMonth() + Math.round(avgGapMonths));
    if (nextDate.getTime() > Date.now()) {
      predicted_next_window = nextDate.toISOString().slice(0, 7);
    }
  }

  const risk_tier: ShortagePrediction['risk_tier'] = probability >= 0.65 ? 'VERY_HIGH'
    : probability >= 0.45 ? 'HIGH'
    : probability >= 0.25 ? 'MODERATE'
    : 'LOW';

  if (factors.length === 0) {
    factors.push('No significant risk factors identified');
  }

  return {
    probability,
    risk_tier,
    factors,
    seasonal_alert: seasonalAlert,
    months_since_last: Math.round(monthsSince),
    predicted_next_window,
  };
}

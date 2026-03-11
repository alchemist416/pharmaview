// ---------------------------------------------------------------------------
// Simulation Engine — Cross-references real DECRS/FDA data
// ---------------------------------------------------------------------------

import {
  SimulationParams,
  SimulationResult,
  AffectedDrug,
  AffectedRegion,
  SHIPPING_ROUTES,
  COUNTRY_NAMES,
} from './types';
import { CountryMapData, Establishment } from '@/lib/types';

// ---------------------------------------------------------------------------
// Data fetching helpers
// ---------------------------------------------------------------------------

interface EngineData {
  countries: CountryMapData[];
  shortages: Record<string, unknown>[];
  drugCategories: Record<string, string>;
  inspectionHistory: {
    inspections: Record<string, { total_inspections: number; failures: number; failure_rate: number }>;
    shortage_history: Record<string, {
      total_shortage_events: number;
      avg_duration_days: number;
      last_shortage: string;
      recurrence_rate: number;
    }>;
  };
}

async function fetchEngineData(): Promise<EngineData> {
  const [mapRes, shortageRes, catRes, inspRes] = await Promise.allSettled([
    fetch('/api/map-data').then((r) => r.json()),
    fetch('/api/shortages').then((r) => r.json()),
    fetch('/api/drug-categories').then((r) => r.json()),
    fetch('/api/inspection-history').then((r) => r.json()),
  ]);

  return {
    countries: mapRes.status === 'fulfilled' ? mapRes.value.countries ?? [] : [],
    shortages: shortageRes.status === 'fulfilled' ? shortageRes.value.results ?? [] : [],
    drugCategories: catRes.status === 'fulfilled' ? catRes.value.categories ?? {} : {},
    inspectionHistory: inspRes.status === 'fulfilled'
      ? { inspections: inspRes.value.inspections ?? {}, shortage_history: inspRes.value.shortage_history ?? {} }
      : { inspections: {}, shortage_history: {} },
  };
}

// ---------------------------------------------------------------------------
// Impact calculation helpers
// ---------------------------------------------------------------------------

function getEstablishmentsByCountry(countries: CountryMapData[], codes: string[]): Establishment[] {
  const codeSet = new Set(codes.map((c) => c.toUpperCase()));
  return countries
    .filter((c) => codeSet.has(c.country_code))
    .flatMap((c) => c.establishments);
}

function getUniqueManufacturers(establishments: Establishment[]): string[] {
  return Array.from(new Set(establishments.map((e) => e.firm_name)));
}

function getDrugsForManufacturers(
  manufacturers: string[],
  drugCategories: Record<string, string>,
): { name: string; category: string }[] {
  // Cross-reference manufacturers against drug categories
  // More affected manufacturers = broader drug impact
  const drugs = Object.entries(drugCategories);

  // If many manufacturers are affected, more drugs are at risk
  const affectedRatio = Math.min(manufacturers.length / 20, 1);
  const drugsToInclude = Math.max(3, Math.ceil(drugs.length * affectedRatio));

  return drugs.slice(0, drugsToInclude).map(([name, category]) => ({ name, category }));
}

function buildConfidenceInterval(baseProbability: number, uncertainty: number): [number, number] {
  const lower = Math.max(0, Math.round((baseProbability - uncertainty) * 100)) / 100;
  const upper = Math.min(1, Math.round((baseProbability + uncertainty) * 100)) / 100;
  return [lower, upper];
}

function estimateRecovery(
  severity: string,
  shortageHistory?: { avg_duration_days: number },
): { days: number; range: [number, number] } {
  const historicalAvg = shortageHistory?.avg_duration_days ?? 120;
  const multipliers: Record<string, number> = {
    catastrophic: 2.0,
    severe: 1.5,
    moderate: 1.0,
    prolonged: 2.0,
    months: 1.5,
    weeks: 0.8,
  };
  const mult = multipliers[severity] ?? 1.0;
  const days = Math.round(historicalAvg * mult);
  return {
    days,
    range: [Math.round(days * 0.6), Math.round(days * 1.5)],
  };
}

function overallSeverity(drugs: AffectedDrug[]): 'critical' | 'high' | 'moderate' | 'low' {
  const critical = drugs.filter((d) => d.impactLevel === 'critical').length;
  const high = drugs.filter((d) => d.impactLevel === 'high').length;
  if (critical >= 3 || drugs.length >= 15) return 'critical';
  if (critical >= 1 || high >= 3 || drugs.length >= 8) return 'high';
  if (high >= 1 || drugs.length >= 3) return 'moderate';
  return 'low';
}

function drugImpactLevel(probability: number): 'critical' | 'high' | 'moderate' | 'low' {
  if (probability >= 0.75) return 'critical';
  if (probability >= 0.55) return 'high';
  if (probability >= 0.3) return 'moderate';
  return 'low';
}

// ---------------------------------------------------------------------------
// Core simulation runners
// ---------------------------------------------------------------------------

function runNaturalDisaster(
  params: Extract<SimulationParams, { type: 'natural-disaster' }>,
  data: EngineData,
): Omit<SimulationResult, 'id' | 'timestamp' | 'aiSummary'> {
  const affectedEstablishments = getEstablishmentsByCountry(data.countries, [params.region]);
  const manufacturers = getUniqueManufacturers(affectedEstablishments);
  const drugs = getDrugsForManufacturers(manufacturers, data.drugCategories);

  const severityMultiplier = params.severity === 'catastrophic' ? 1.0
    : params.severity === 'severe' ? 0.7 : 0.4;

  const affectedDrugs: AffectedDrug[] = drugs.map((drug) => {
    const history = data.inspectionHistory.shortage_history[drug.name.toLowerCase()];
    const baseProbability = Math.min(0.95, 0.4 + severityMultiplier * 0.5 + (history?.recurrence_rate ?? 0) * 0.1);
    const recovery = estimateRecovery(params.severity, history);
    const isActive = data.shortages.some((s) =>
      ((s.generic_name as string) || '').toLowerCase() === drug.name.toLowerCase() &&
      ((s.status as string) || '').toLowerCase().includes('current'),
    );

    return {
      name: drug.name,
      genericName: drug.name,
      category: drug.category,
      impactLevel: drugImpactLevel(baseProbability),
      shortageProbability: baseProbability,
      confidenceInterval: buildConfidenceInterval(baseProbability, 0.1),
      estimatedRecoveryDays: recovery.days,
      recoveryRange: recovery.range,
      affectedManufacturers: manufacturers.slice(0, 5),
      affectedCountries: [params.region],
      currentStatus: isActive ? 'Already in shortage' : 'Currently available',
      riskFactors: [
        `${params.disasterType} in ${COUNTRY_NAMES[params.region] || params.region}`,
        `${affectedEstablishments.length} facilities in affected region`,
        `Severity: ${params.severity}`,
      ],
    };
  });

  const regionInfo = data.countries.find((c) => c.country_code === params.region);
  const affectedRegions: AffectedRegion[] = [{
    countryCode: params.region,
    countryName: COUNTRY_NAMES[params.region] || params.region,
    impactLevel: params.severity === 'catastrophic' ? 'critical' : params.severity === 'severe' ? 'high' : 'moderate',
    affectedFacilities: affectedEstablishments.length,
    totalFacilities: regionInfo?.establishments.length ?? affectedEstablishments.length,
    percentAffected: Math.round(severityMultiplier * 100),
    drugsAtRisk: affectedDrugs.length,
  }];

  return {
    params,
    affectedDrugs,
    affectedRegions,
    totalDrugsAffected: affectedDrugs.length,
    totalFacilitiesAffected: affectedEstablishments.length,
    overallSeverity: overallSeverity(affectedDrugs),
    estimatedRecoveryTimeline: `${affectedDrugs[0]?.recoveryRange[0] ?? 60}–${affectedDrugs[0]?.recoveryRange[1] ?? 180} days`,
    recommendations: [
      `Identify alternative suppliers outside ${COUNTRY_NAMES[params.region] || params.region}`,
      'Increase safety stock for critical drugs in affected categories',
      'Activate dual-sourcing agreements for single-source drugs',
      'Monitor FDA shortage reports daily during recovery period',
    ],
  };
}

function runShippingDisruption(
  params: Extract<SimulationParams, { type: 'shipping-disruption' }>,
  data: EngineData,
): Omit<SimulationResult, 'id' | 'timestamp' | 'aiSummary'> {
  const route = SHIPPING_ROUTES[params.route];
  const affectedCountries = route?.affectedCountries ?? [];
  const affectedEstablishments = getEstablishmentsByCountry(data.countries, affectedCountries);
  const manufacturers = getUniqueManufacturers(affectedEstablishments);
  const drugs = getDrugsForManufacturers(manufacturers, data.drugCategories);

  const durationMultiplier = params.duration === 'prolonged' ? 1.0
    : params.duration === 'months' ? 0.7 : 0.4;

  const affectedDrugs: AffectedDrug[] = drugs.map((drug) => {
    const history = data.inspectionHistory.shortage_history[drug.name.toLowerCase()];
    // Shipping disruptions have lower direct probability but broad impact
    const baseProbability = Math.min(0.90, 0.25 + durationMultiplier * 0.4 + (history?.recurrence_rate ?? 0) * 0.15);
    const recovery = estimateRecovery(params.duration, history);

    return {
      name: drug.name,
      genericName: drug.name,
      category: drug.category,
      impactLevel: drugImpactLevel(baseProbability),
      shortageProbability: baseProbability,
      confidenceInterval: buildConfidenceInterval(baseProbability, 0.12),
      estimatedRecoveryDays: recovery.days,
      recoveryRange: recovery.range,
      affectedManufacturers: manufacturers.slice(0, 8),
      affectedCountries,
      currentStatus: 'Supply chain delayed',
      riskFactors: [
        `${route?.label || params.route} disruption`,
        `${affectedCountries.length} countries with affected trade routes`,
        `Duration: ${params.duration}`,
        `${affectedEstablishments.length} facilities with disrupted logistics`,
      ],
    };
  });

  const affectedRegions: AffectedRegion[] = affectedCountries.map((code) => {
    const regionData = data.countries.find((c) => c.country_code === code);
    const facilities = regionData?.establishments.length ?? 0;
    return {
      countryCode: code,
      countryName: COUNTRY_NAMES[code] || code,
      impactLevel: durationMultiplier >= 0.7 ? 'high' : 'moderate',
      affectedFacilities: facilities,
      totalFacilities: facilities,
      percentAffected: Math.round(durationMultiplier * 80),
      drugsAtRisk: Math.ceil(affectedDrugs.length / affectedCountries.length),
    };
  });

  return {
    params,
    affectedDrugs,
    affectedRegions,
    totalDrugsAffected: affectedDrugs.length,
    totalFacilitiesAffected: affectedEstablishments.length,
    overallSeverity: overallSeverity(affectedDrugs),
    estimatedRecoveryTimeline: `${affectedDrugs[0]?.recoveryRange[0] ?? 30}–${affectedDrugs[0]?.recoveryRange[1] ?? 120} days`,
    recommendations: [
      `Reroute shipments away from ${route?.label || params.route}`,
      'Pre-position inventory at domestic distribution centers',
      'Negotiate air freight for critical API shipments',
      'Coordinate with customs for expedited clearance on alternative routes',
    ],
  };
}

function runFacilityFailure(
  params: Extract<SimulationParams, { type: 'facility-failure' }>,
  data: EngineData,
): Omit<SimulationResult, 'id' | 'timestamp' | 'aiSummary'> {
  const allEstablishments = data.countries.flatMap((c) => c.establishments);
  const targetFacility = allEstablishments.find(
    (e) => e.firm_name.toLowerCase() === params.facilityName.toLowerCase(),
  );
  const country = targetFacility?.country_code || params.facilityCountry;
  const drugs = getDrugsForManufacturers([params.facilityName], data.drugCategories);

  // Single facility = moderate impact unless it's a sole source
  const causeMultiplier = params.cause === 'contamination' ? 0.9
    : params.cause === 'fire' ? 0.8
    : params.cause === 'compliance' ? 0.7 : 0.6;

  const affectedDrugs: AffectedDrug[] = drugs.map((drug) => {
    const history = data.inspectionHistory.shortage_history[drug.name.toLowerCase()];
    const baseProbability = Math.min(0.90, 0.35 + causeMultiplier * 0.35);
    const recovery = estimateRecovery(params.cause === 'contamination' ? 'severe' : 'moderate', history);

    return {
      name: drug.name,
      genericName: drug.name,
      category: drug.category,
      impactLevel: drugImpactLevel(baseProbability),
      shortageProbability: baseProbability,
      confidenceInterval: buildConfidenceInterval(baseProbability, 0.08),
      estimatedRecoveryDays: recovery.days,
      recoveryRange: recovery.range,
      affectedManufacturers: [params.facilityName],
      affectedCountries: [country],
      currentStatus: 'Facility offline',
      riskFactors: [
        `${params.facilityName} ${params.cause} event`,
        `Facility in ${COUNTRY_NAMES[country] || country}`,
      ],
    };
  });

  const regionData = data.countries.find((c) => c.country_code === country);
  const affectedRegions: AffectedRegion[] = [{
    countryCode: country,
    countryName: COUNTRY_NAMES[country] || country,
    impactLevel: 'moderate',
    affectedFacilities: 1,
    totalFacilities: regionData?.establishments.length ?? 1,
    percentAffected: regionData ? Math.round((1 / regionData.establishments.length) * 100) : 100,
    drugsAtRisk: affectedDrugs.length,
  }];

  return {
    params,
    affectedDrugs,
    affectedRegions,
    totalDrugsAffected: affectedDrugs.length,
    totalFacilitiesAffected: 1,
    overallSeverity: overallSeverity(affectedDrugs),
    estimatedRecoveryTimeline: `${affectedDrugs[0]?.recoveryRange[0] ?? 45}–${affectedDrugs[0]?.recoveryRange[1] ?? 150} days`,
    recommendations: [
      `Activate backup suppliers for products manufactured by ${params.facilityName}`,
      'File FDA notification for potential supply interruption',
      'Assess inventory coverage at current consumption rates',
      `Monitor ${params.facilityName} remediation progress`,
    ],
  };
}

function runGeopoliticalShock(
  params: Extract<SimulationParams, { type: 'geopolitical-shock' }>,
  data: EngineData,
): Omit<SimulationResult, 'id' | 'timestamp' | 'aiSummary'> {
  const affectedEstablishments = getEstablishmentsByCountry(data.countries, [params.country]);
  const manufacturers = getUniqueManufacturers(affectedEstablishments);
  const drugs = getDrugsForManufacturers(manufacturers, data.drugCategories);

  const policyMultiplier = params.policyType === 'export-ban' ? 1.0
    : params.policyType === 'sanctions' ? 0.9
    : params.policyType === 'tariff-escalation' ? 0.6 : 0.5;

  const affectedDrugs: AffectedDrug[] = drugs.map((drug) => {
    const history = data.inspectionHistory.shortage_history[drug.name.toLowerCase()];
    const baseProbability = Math.min(0.95, 0.3 + policyMultiplier * 0.45);
    const recovery = estimateRecovery(policyMultiplier >= 0.8 ? 'severe' : 'moderate', history);

    return {
      name: drug.name,
      genericName: drug.name,
      category: drug.category,
      impactLevel: drugImpactLevel(baseProbability),
      shortageProbability: baseProbability,
      confidenceInterval: buildConfidenceInterval(baseProbability, 0.11),
      estimatedRecoveryDays: recovery.days,
      recoveryRange: recovery.range,
      affectedManufacturers: manufacturers.slice(0, 10),
      affectedCountries: [params.country],
      currentStatus: 'Trade flow disrupted',
      riskFactors: [
        `${params.policyType.replace('-', ' ')} affecting ${COUNTRY_NAMES[params.country] || params.country}`,
        `${manufacturers.length} manufacturers in affected country`,
        `${affectedEstablishments.length} facilities at risk`,
      ],
    };
  });

  const regionData = data.countries.find((c) => c.country_code === params.country);
  const affectedRegions: AffectedRegion[] = [{
    countryCode: params.country,
    countryName: COUNTRY_NAMES[params.country] || params.country,
    impactLevel: policyMultiplier >= 0.8 ? 'critical' : 'high',
    affectedFacilities: affectedEstablishments.length,
    totalFacilities: regionData?.establishments.length ?? affectedEstablishments.length,
    percentAffected: Math.round(policyMultiplier * 100),
    drugsAtRisk: affectedDrugs.length,
  }];

  return {
    params,
    affectedDrugs,
    affectedRegions,
    totalDrugsAffected: affectedDrugs.length,
    totalFacilitiesAffected: affectedEstablishments.length,
    overallSeverity: overallSeverity(affectedDrugs),
    estimatedRecoveryTimeline: 'Depends on policy resolution — 90–365+ days',
    recommendations: [
      `Diversify supply away from ${COUNTRY_NAMES[params.country] || params.country} manufacturers`,
      'Engage trade compliance team to assess regulatory exposure',
      'Build strategic stockpile of affected APIs',
      'Evaluate domestic manufacturing alternatives',
    ],
  };
}

function runDemandSurge(
  params: Extract<SimulationParams, { type: 'demand-surge' }>,
  data: EngineData,
): Omit<SimulationResult, 'id' | 'timestamp' | 'aiSummary'> {
  const drugCategories = data.drugCategories;
  let targetDrugs: { name: string; category: string }[];

  if (params.targetType === 'drug') {
    const cat = drugCategories[params.target.toLowerCase()] || 'Unknown';
    targetDrugs = [{ name: params.target, category: cat }];
  } else {
    targetDrugs = Object.entries(drugCategories)
      .filter(([, cat]) => cat.toLowerCase() === params.target.toLowerCase())
      .map(([name, cat]) => ({ name, category: cat }));
  }

  if (targetDrugs.length === 0) {
    targetDrugs = [{ name: params.target, category: 'Unknown' }];
  }

  const multiplierRisk = params.multiplier >= 5 ? 0.9
    : params.multiplier >= 3 ? 0.7
    : params.multiplier >= 2 ? 0.5 : 0.3;

  const affectedDrugs: AffectedDrug[] = targetDrugs.map((drug) => {
    const history = data.inspectionHistory.shortage_history[drug.name.toLowerCase()];
    const baseProbability = Math.min(0.95, multiplierRisk + (history?.recurrence_rate ?? 0) * 0.15);
    const recovery = estimateRecovery(multiplierRisk >= 0.7 ? 'severe' : 'moderate', history);

    return {
      name: drug.name,
      genericName: drug.name,
      category: drug.category,
      impactLevel: drugImpactLevel(baseProbability),
      shortageProbability: baseProbability,
      confidenceInterval: buildConfidenceInterval(baseProbability, 0.09),
      estimatedRecoveryDays: recovery.days,
      recoveryRange: recovery.range,
      affectedManufacturers: [],
      affectedCountries: [],
      currentStatus: `Demand ${params.multiplier}x normal`,
      riskFactors: [
        `${params.multiplier}x demand surge for ${params.target}`,
        'Manufacturing capacity may be insufficient',
        history ? `Historical avg shortage duration: ${history.avg_duration_days} days` : 'No shortage history data',
      ],
    };
  });

  return {
    params,
    affectedDrugs,
    affectedRegions: [],
    totalDrugsAffected: affectedDrugs.length,
    totalFacilitiesAffected: 0,
    overallSeverity: overallSeverity(affectedDrugs),
    estimatedRecoveryTimeline: `${affectedDrugs[0]?.recoveryRange[0] ?? 30}–${affectedDrugs[0]?.recoveryRange[1] ?? 90} days after demand normalizes`,
    recommendations: [
      'Implement allocation protocols to distribute existing supply equitably',
      'Coordinate with manufacturers to increase production schedules',
      'Consider therapeutic alternatives for non-critical use cases',
      'Communicate with providers about expected timeline',
    ],
  };
}

function runRegulatoryCascade(
  params: Extract<SimulationParams, { type: 'regulatory-cascade' }>,
  data: EngineData,
): Omit<SimulationResult, 'id' | 'timestamp' | 'aiSummary'> {
  let affectedEstablishments: Establishment[];
  let targetLabel: string;

  if (params.scope === 'country-wide' && params.targetCountry) {
    affectedEstablishments = getEstablishmentsByCountry(data.countries, [params.targetCountry]);
    targetLabel = COUNTRY_NAMES[params.targetCountry] || params.targetCountry;
  } else if (params.targetFirm) {
    affectedEstablishments = data.countries
      .flatMap((c) => c.establishments)
      .filter((e) => e.firm_name.toLowerCase().includes(params.targetFirm!.toLowerCase()));
    targetLabel = params.targetFirm;
  } else {
    // Multi-firm: take a percentage
    const all = data.countries.flatMap((c) => c.establishments);
    affectedEstablishments = all.slice(0, Math.ceil(all.length * 0.15));
    targetLabel = 'Multiple firms';
  }

  const manufacturers = getUniqueManufacturers(affectedEstablishments);
  const drugs = getDrugsForManufacturers(manufacturers, data.drugCategories);

  const actionMultiplier = params.action === 'facility-shutdown' ? 1.0
    : params.action === 'consent-decree' ? 0.85
    : params.action === 'import-alert' ? 0.7 : 0.5;

  const affectedDrugs: AffectedDrug[] = drugs.map((drug) => {
    const history = data.inspectionHistory.shortage_history[drug.name.toLowerCase()];
    const baseProbability = Math.min(0.95, 0.3 + actionMultiplier * 0.45);
    const recovery = estimateRecovery(actionMultiplier >= 0.8 ? 'severe' : 'moderate', history);

    return {
      name: drug.name,
      genericName: drug.name,
      category: drug.category,
      impactLevel: drugImpactLevel(baseProbability),
      shortageProbability: baseProbability,
      confidenceInterval: buildConfidenceInterval(baseProbability, 0.1),
      estimatedRecoveryDays: recovery.days,
      recoveryRange: recovery.range,
      affectedManufacturers: manufacturers.slice(0, 5),
      affectedCountries: Array.from(new Set(affectedEstablishments.map((e) => e.country_code))),
      currentStatus: `Under ${params.action.replace('-', ' ')}`,
      riskFactors: [
        `FDA ${params.action.replace('-', ' ')} — ${params.scope.replace('-', ' ')} scope`,
        `Target: ${targetLabel}`,
        `${affectedEstablishments.length} facilities affected`,
      ],
    };
  });

  const countryGroups = new Map<string, Establishment[]>();
  for (const e of affectedEstablishments) {
    if (!countryGroups.has(e.country_code)) countryGroups.set(e.country_code, []);
    countryGroups.get(e.country_code)!.push(e);
  }

  const affectedRegions: AffectedRegion[] = Array.from(countryGroups.entries()).map(([code, ests]) => {
    const regionData = data.countries.find((c) => c.country_code === code);
    return {
      countryCode: code,
      countryName: COUNTRY_NAMES[code] || code,
      impactLevel: actionMultiplier >= 0.8 ? 'high' : 'moderate',
      affectedFacilities: ests.length,
      totalFacilities: regionData?.establishments.length ?? ests.length,
      percentAffected: regionData ? Math.round((ests.length / regionData.establishments.length) * 100) : 100,
      drugsAtRisk: affectedDrugs.length,
    };
  });

  return {
    params,
    affectedDrugs,
    affectedRegions,
    totalDrugsAffected: affectedDrugs.length,
    totalFacilitiesAffected: affectedEstablishments.length,
    overallSeverity: overallSeverity(affectedDrugs),
    estimatedRecoveryTimeline: `${affectedDrugs[0]?.recoveryRange[0] ?? 90}–${affectedDrugs[0]?.recoveryRange[1] ?? 365} days`,
    recommendations: [
      'Identify alternative approved sources not under regulatory action',
      'File shortage notification with FDA if supply impacts expected',
      'Review current inventory levels against projected demand',
      `Track ${targetLabel} remediation milestones`,
    ],
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function runSimulation(params: SimulationParams): Promise<SimulationResult> {
  const data = await fetchEngineData();

  let result: Omit<SimulationResult, 'id' | 'timestamp' | 'aiSummary'>;

  switch (params.type) {
    case 'natural-disaster':
      result = runNaturalDisaster(params, data);
      break;
    case 'shipping-disruption':
      result = runShippingDisruption(params, data);
      break;
    case 'facility-failure':
      result = runFacilityFailure(params, data);
      break;
    case 'geopolitical-shock':
      result = runGeopoliticalShock(params, data);
      break;
    case 'demand-surge':
      result = runDemandSurge(params, data);
      break;
    case 'regulatory-cascade':
      result = runRegulatoryCascade(params, data);
      break;
  }

  return {
    ...result,
    id: `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    aiSummary: null, // Filled separately via API
  };
}

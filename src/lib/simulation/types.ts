// ---------------------------------------------------------------------------
// Simulation Engine Types
// ---------------------------------------------------------------------------

export type SimulationType =
  | 'natural-disaster'
  | 'shipping-disruption'
  | 'facility-failure'
  | 'geopolitical-shock'
  | 'demand-surge'
  | 'regulatory-cascade';

export interface SimulationTypeInfo {
  id: SimulationType;
  label: string;
  description: string;
  icon: string; // lucide icon name
}

export const SIMULATION_TYPES: SimulationTypeInfo[] = [
  {
    id: 'natural-disaster',
    label: 'Natural Disaster',
    description: 'Regional manufacturing shutdown from earthquake, flood, typhoon, or similar event',
    icon: 'CloudLightning',
  },
  {
    id: 'shipping-disruption',
    label: 'Shipping Route Disruption',
    description: 'Major trade route blockage or disruption affecting pharma supply chains',
    icon: 'Ship',
  },
  {
    id: 'facility-failure',
    label: 'Single Facility Failure',
    description: 'A specific manufacturer facility goes offline due to compliance, fire, or equipment failure',
    icon: 'Factory',
  },
  {
    id: 'geopolitical-shock',
    label: 'Geopolitical / Trade Shock',
    description: 'Trade sanctions, export bans, tariff escalation, or diplomatic crisis affecting pharma trade',
    icon: 'Shield',
  },
  {
    id: 'demand-surge',
    label: 'Demand Surge',
    description: 'Unexpected spike in demand for a drug or therapeutic category',
    icon: 'TrendingUp',
  },
  {
    id: 'regulatory-cascade',
    label: 'Regulatory Cascade',
    description: 'FDA enforcement action triggering cascading supply disruptions',
    icon: 'Gavel',
  },
];

// ---------------------------------------------------------------------------
// Simulation Parameters (per type)
// ---------------------------------------------------------------------------

export interface NaturalDisasterParams {
  type: 'natural-disaster';
  region: string;           // country code
  severity: 'moderate' | 'severe' | 'catastrophic';
  disasterType: 'earthquake' | 'flood' | 'typhoon' | 'wildfire' | 'pandemic-wave';
}

export interface ShippingDisruptionParams {
  type: 'shipping-disruption';
  route: 'suez' | 'malacca' | 'trans-pacific' | 'trans-atlantic';
  duration: 'weeks' | 'months' | 'prolonged';
}

export interface FacilityFailureParams {
  type: 'facility-failure';
  facilityName: string;     // from DECRS list
  facilityCountry: string;  // country code
  cause: 'compliance' | 'fire' | 'equipment' | 'contamination';
}

export interface GeopoliticalShockParams {
  type: 'geopolitical-shock';
  country: string;          // country code
  policyType: 'export-ban' | 'tariff-escalation' | 'sanctions' | 'diplomatic-crisis';
}

export interface DemandSurgeParams {
  type: 'demand-surge';
  target: string;           // drug name or category
  targetType: 'drug' | 'category';
  multiplier: number;       // 1.5x, 2x, 3x, 5x
}

export interface RegulatoryCascadeParams {
  type: 'regulatory-cascade';
  action: 'warning-letter' | 'import-alert' | 'consent-decree' | 'facility-shutdown';
  scope: 'single-firm' | 'multi-firm' | 'country-wide';
  targetFirm?: string;
  targetCountry?: string;
}

export type SimulationParams =
  | NaturalDisasterParams
  | ShippingDisruptionParams
  | FacilityFailureParams
  | GeopoliticalShockParams
  | DemandSurgeParams
  | RegulatoryCascadeParams;

// ---------------------------------------------------------------------------
// Simulation Results
// ---------------------------------------------------------------------------

export interface AffectedDrug {
  name: string;
  genericName: string;
  category: string;
  impactLevel: 'critical' | 'high' | 'moderate' | 'low';
  shortageProbability: number; // 0-1
  confidenceInterval: [number, number]; // e.g. [0.67, 0.84]
  estimatedRecoveryDays: number;
  recoveryRange: [number, number]; // e.g. [60, 180]
  affectedManufacturers: string[];
  affectedCountries: string[];
  currentStatus: string;
  riskFactors: string[];
}

export interface AffectedRegion {
  countryCode: string;
  countryName: string;
  impactLevel: 'critical' | 'high' | 'moderate' | 'low';
  affectedFacilities: number;
  totalFacilities: number;
  percentAffected: number;
  drugsAtRisk: number;
}

export interface SimulationResult {
  id: string;
  params: SimulationParams;
  timestamp: string;
  affectedDrugs: AffectedDrug[];
  affectedRegions: AffectedRegion[];
  totalDrugsAffected: number;
  totalFacilitiesAffected: number;
  overallSeverity: 'critical' | 'high' | 'moderate' | 'low';
  estimatedRecoveryTimeline: string;
  aiSummary: string | null;
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// Shipping route metadata
// ---------------------------------------------------------------------------

export const SHIPPING_ROUTES: Record<string, {
  label: string;
  description: string;
  affectedCountries: string[]; // country codes whose trade flows through this route
}> = {
  suez: {
    label: 'Suez Canal',
    description: 'Connects Mediterranean to Red Sea — critical for EU-Asia pharma trade',
    affectedCountries: ['IN', 'CN', 'IL', 'DE', 'FR', 'IT', 'CH', 'GB', 'ES', 'NL', 'BE', 'SE', 'DK'],
  },
  malacca: {
    label: 'Strait of Malacca',
    description: 'Key chokepoint for East Asia — Japan, Korea, China trade routes',
    affectedCountries: ['CN', 'JP', 'KR', 'SG', 'TW', 'IN'],
  },
  'trans-pacific': {
    label: 'Trans-Pacific',
    description: 'US West Coast ↔ Asia — major pharma ingredient supply lines',
    affectedCountries: ['CN', 'IN', 'JP', 'KR', 'TW', 'SG', 'AU'],
  },
  'trans-atlantic': {
    label: 'Trans-Atlantic',
    description: 'US East Coast ↔ Europe — finished drug product and API trade',
    affectedCountries: ['DE', 'IE', 'GB', 'FR', 'IT', 'CH', 'NL', 'BE', 'SE', 'DK', 'ES'],
  },
};

// Country name lookup
export const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States', CA: 'Canada', DE: 'Germany', GB: 'United Kingdom',
  FR: 'France', IT: 'Italy', CH: 'Switzerland', IE: 'Ireland',
  IN: 'India', CN: 'China', JP: 'Japan', KR: 'South Korea',
  IL: 'Israel', BR: 'Brazil', MX: 'Mexico', AU: 'Australia',
  SE: 'Sweden', DK: 'Denmark', NL: 'Netherlands', BE: 'Belgium',
  ES: 'Spain', SG: 'Singapore', TW: 'Taiwan', PR: 'Puerto Rico',
};

import { CountryMapData } from './types';

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
  // HHI-inspired score: higher = more concentrated
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

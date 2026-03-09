import { Establishment, CountryMapData } from './types';

// ISO Alpha-2 to ISO Alpha-3 mapping for react-simple-maps
const alpha2ToAlpha3: Record<string, string> = {
  US: 'USA', IN: 'IND', CN: 'CHN', DE: 'DEU', GB: 'GBR',
  CA: 'CAN', CH: 'CHE', FR: 'FRA', IT: 'ITA', JP: 'JPN',
  KR: 'KOR', IL: 'ISR', BR: 'BRA', MX: 'MEX', IE: 'IRL',
  DK: 'DNK', SE: 'SWE', FI: 'FIN', ZA: 'ZAF', AU: 'AUS',
  ES: 'ESP', NL: 'NLD', BE: 'BEL', AT: 'AUT', PL: 'POL',
  PT: 'PRT', NO: 'NOR', NZ: 'NZL', SG: 'SGP', TW: 'TWN',
  TH: 'THA', ID: 'IDN', MY: 'MYS', PH: 'PHL', VN: 'VNM',
  EG: 'EGY', NG: 'NGA', KE: 'KEN', AR: 'ARG', CL: 'CHL',
  CO: 'COL', PE: 'PER', BD: 'BGD', PK: 'PAK', TR: 'TUR',
  SA: 'SAU', AE: 'ARE', RU: 'RUS', UA: 'UKR', CZ: 'CZE',
  HU: 'HUN', RO: 'ROU', GR: 'GRC', JO: 'JOR',
};

export function getAlpha3(alpha2: string): string {
  return alpha2ToAlpha3[alpha2] || alpha2;
}

export function aggregateByCountry(establishments: Establishment[]): CountryMapData[] {
  const countryMap = new Map<string, CountryMapData>();

  for (const est of establishments) {
    const existing = countryMap.get(est.country_code);
    if (existing) {
      existing.manufacturer_count++;
      existing.establishments.push(est);
    } else {
      countryMap.set(est.country_code, {
        country_code: est.country_code,
        country: est.country,
        manufacturer_count: 1,
        establishments: [est],
      });
    }
  }

  return Array.from(countryMap.values()).sort(
    (a, b) => b.manufacturer_count - a.manufacturer_count
  );
}

export function filterEstablishments(
  establishments: Establishment[],
  type?: 'manufacturer' | 'api' | 'repackager'
): Establishment[] {
  if (!type) return establishments;
  return establishments.filter((e) => e.type === type);
}

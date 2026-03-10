import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

const FDA_NDC_URL = 'https://api.fda.gov/drug/ndc.json';

// Dosage form suffixes to strip for better search matching
const DOSAGE_FORMS = [
  'injection', 'injectable', 'tablet', 'tablets', 'capsule', 'capsules',
  'solution', 'suspension', 'cream', 'ointment', 'gel', 'patch',
  'spray', 'drops', 'syrup', 'elixir', 'powder', 'suppository',
  'inhaler', 'inhalation', 'ophthalmic', 'nasal', 'topical',
  'oral', 'rectal', 'vaginal', 'transdermal', 'sublingual',
  'extended-release', 'delayed-release', 'sustained-release',
  'for injection', 'for oral suspension', 'for inhalation',
  'hcl', 'hydrochloride', 'sulfate', 'sodium', 'potassium',
  'acetate', 'phosphate', 'maleate', 'besylate', 'mesylate',
  'fumarate', 'succinate', 'tartrate', 'citrate', 'chloride',
];

interface DecrsEstablishment {
  firm_name: string;
  country_code: string;
  country: string;
  city: string;
  registration_number: string;
  type: string;
}

/**
 * Normalize a drug name for FDA NDC search.
 * Strips dosage forms and salt forms to get the core drug name.
 * Returns an array of search terms from most specific to least.
 */
function normalizeDrugName(name: string): string[] {
  const original = name.trim();
  let simplified = original.toLowerCase();

  // Strip dosage form suffixes (longest first to avoid partial matches)
  const sortedForms = [...DOSAGE_FORMS].sort((a, b) => b.length - a.length);
  for (const form of sortedForms) {
    const regex = new RegExp(`\\b${form}\\b`, 'gi');
    simplified = simplified.replace(regex, '');
  }
  simplified = simplified.replace(/\s+/g, ' ').trim();

  // Build search candidates from most specific to least
  const candidates: string[] = [];

  // 1. Original name (exact)
  candidates.push(original);

  // 2. Simplified name (dosage forms stripped)
  if (simplified && simplified.toLowerCase() !== original.toLowerCase()) {
    // Capitalize first letter of each word
    const capitalized = simplified.replace(/\b\w/g, (c) => c.toUpperCase());
    candidates.push(capitalized);
  }

  // 3. First word only (active ingredient)
  const firstWord = simplified.split(/\s+/)[0];
  if (firstWord && firstWord.length > 2) {
    const capitalized = firstWord.charAt(0).toUpperCase() + firstWord.slice(1);
    if (!candidates.some((c) => c.toLowerCase() === capitalized.toLowerCase())) {
      candidates.push(capitalized);
    }
  }

  return candidates;
}

/**
 * Try searching FDA NDC with progressive fallback.
 * Tries exact match first, then simplified names.
 */
async function searchNDC(drug: string, limit: string) {
  const candidates = normalizeDrugName(drug);

  for (const candidate of candidates) {
    // Use OR logic: search brand_name OR generic_name
    const searchQuery = `(brand_name:"${candidate}")+OR+(generic_name:"${candidate}")`;
    const fetchUrl = `${FDA_NDC_URL}?limit=${limit}&search=${searchQuery}`;

    try {
      const res = await fetch(fetchUrl, {
        next: { revalidate: 3600 },
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const data = await res.json();
        const results = data.results || [];
        if (results.length > 0) {
          return { data, results, matchedQuery: candidate };
        }
      }
    } catch {
      // Try next candidate
    }
  }

  // Last resort: search without quotes (wildcard-like)
  const baseWord = candidates[candidates.length - 1] || drug;
  const fallbackUrl = `${FDA_NDC_URL}?limit=${limit}&search=generic_name:${encodeURIComponent(baseWord.toLowerCase())}`;

  try {
    const res = await fetch(fallbackUrl, {
      next: { revalidate: 3600 },
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const data = await res.json();
      const results = data.results || [];
      if (results.length > 0) {
        return { data, results, matchedQuery: `${baseWord} (unquoted fallback)` };
      }
    }
  } catch {
    // Fall through
  }

  return { data: { meta: null }, results: [], matchedQuery: null };
}

/**
 * Load DECRS establishment data for country cross-referencing.
 */
async function loadDecrsData(): Promise<DecrsEstablishment[]> {
  try {
    const decrsPath = path.join(process.cwd(), 'public', 'data', 'decrs.json');
    const raw = await fs.readFile(decrsPath, 'utf-8');
    const decrs = JSON.parse(raw);
    return decrs.establishments || [];
  } catch {
    return [];
  }
}

/**
 * Cross-reference NDC labeler names with DECRS data to resolve countries.
 * Uses fuzzy matching on firm names.
 */
function resolveCountryFromDecrs(
  labelerName: string,
  decrsEstablishments: DecrsEstablishment[]
): { country: string; country_code: string; city: string } | null {
  const labelerLower = labelerName.toLowerCase().replace(/[,.\-()]/g, ' ').replace(/\s+/g, ' ').trim();

  for (const est of decrsEstablishments) {
    const firmLower = est.firm_name.toLowerCase().replace(/[,.\-()]/g, ' ').replace(/\s+/g, ' ').trim();

    // Exact match
    if (firmLower === labelerLower) {
      return { country: est.country, country_code: est.country_code, city: est.city };
    }

    // One contains the other
    if (firmLower.includes(labelerLower) || labelerLower.includes(firmLower)) {
      return { country: est.country, country_code: est.country_code, city: est.city };
    }

    // Match on first significant word (company name root)
    const firmWords = firmLower.split(/\s+/).filter((w) => w.length > 3);
    const labelerWords = labelerLower.split(/\s+/).filter((w) => w.length > 3);
    if (firmWords.length > 0 && labelerWords.length > 0) {
      const commonWords = firmWords.filter((w) => labelerWords.includes(w));
      if (commonWords.length >= 2) {
        return { country: est.country, country_code: est.country_code, city: est.city };
      }
    }
  }

  return null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const drug = searchParams.get('drug');
    const limit = searchParams.get('limit') || '100';

    // Load DECRS data for country cross-referencing
    const decrsEstablishments = await loadDecrsData();

    let results: Record<string, unknown>[] = [];
    let meta = null;
    let matchedQuery: string | null = null;

    if (drug) {
      const ndcResult = await searchNDC(drug, limit);
      results = ndcResult.results;
      meta = ndcResult.data.meta || null;
      matchedQuery = ndcResult.matchedQuery;
    } else {
      // No drug specified, return general NDC data
      const url = new URL(FDA_NDC_URL);
      url.searchParams.set('limit', limit);
      const res = await fetch(url.toString(), {
        next: { revalidate: 3600 },
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        results = data.results || [];
        meta = data.meta || null;
      }
    }

    // Extract unique manufacturers with country info
    const manufacturerMap = new Map<string, {
      firm_name: string;
      products: string[];
      country: string;
      country_code: string;
      city: string;
    }>();

    for (const item of results) {
      const labeler = (item.labeler_name as string) || 'Unknown';
      const productName = (item.brand_name as string) || (item.generic_name as string) || 'Unknown';

      // Try to resolve country from DECRS cross-reference
      const countryInfo = resolveCountryFromDecrs(labeler, decrsEstablishments);

      const existing = manufacturerMap.get(labeler);
      if (existing) {
        if (!existing.products.includes(productName)) {
          existing.products.push(productName);
        }
      } else {
        manufacturerMap.set(labeler, {
          firm_name: labeler,
          products: [productName],
          country: countryInfo?.country || 'United States',
          country_code: countryInfo?.country_code || 'US',
          city: countryInfo?.city || '',
        });
      }
    }

    return NextResponse.json({
      meta,
      results,
      manufacturers: Array.from(manufacturerMap.values()),
      matchedQuery,
      debug: {
        searchedDrug: drug,
        normalizedCandidates: drug ? normalizeDrugName(drug) : [],
        matchedQuery,
        resultCount: results.length,
        manufacturerCount: manufacturerMap.size,
        decrsCount: decrsEstablishments.length,
      },
    });
  } catch (err) {
    console.error('Failed to fetch manufacturers:', err);
    return NextResponse.json(
      { error: 'Failed to fetch NDC data from FDA', results: [], manufacturers: [], meta: null },
      { status: 500 }
    );
  }
}

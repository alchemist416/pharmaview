import { NextResponse } from 'next/server';
import { cachedFetch, cacheHeader, fetchJSON } from '@/lib/liveData';

export const revalidate = 86400; // 24h

const RXNORM_BASE = 'https://rxnav.nlm.nih.gov/REST';

interface RxClassEntry {
  className: string;
  classId: string;
}

// Core drugs to categorize
const DRUG_LIST = [
  'amoxicillin', 'azithromycin', 'ciprofloxacin', 'doxycycline', 'metformin',
  'insulin', 'lisinopril', 'amlodipine', 'atorvastatin', 'losartan',
  'metoprolol', 'warfarin', 'heparin', 'omeprazole', 'pantoprazole',
  'albuterol', 'fluticasone', 'prednisone', 'dexamethasone', 'morphine',
  'fentanyl', 'acetaminophen', 'ibuprofen', 'sertraline', 'escitalopram',
  'levothyroxine', 'gabapentin', 'carbamazepine', 'hydrochlorothiazide',
  'furosemide', 'cisplatin', 'methotrexate', 'fluorouracil', 'vincristine',
  'epinephrine', 'norepinephrine', 'propofol', 'lidocaine', 'vancomycin',
  'piperacillin',
];

async function fetchDrugCategory(drugName: string): Promise<string | null> {
  try {
    // Step 1: get RxCUI
    const rxcuiData = await fetchJSON<{ idGroup?: { rxnormId?: string[] } }>(
      `${RXNORM_BASE}/rxcui.json?name=${encodeURIComponent(drugName)}&search=1`,
      { timeoutMs: 8000 },
    );
    const rxcui = rxcuiData.idGroup?.rxnormId?.[0];
    if (!rxcui) return null;

    // Step 2: get drug class via RxClass
    const classData = await fetchJSON<{
      rxclassDrugInfoList?: { rxclassDrugInfo?: { rxclassMinConceptItem: RxClassEntry }[] };
    }>(
      `${RXNORM_BASE}/rxclass/class/byDrugName.json?drugName=${encodeURIComponent(drugName)}&relaSource=ATC&relas=may_treat`,
      { timeoutMs: 8000 },
    );

    const classes = classData.rxclassDrugInfoList?.rxclassDrugInfo;
    if (classes && classes.length > 0) {
      return classes[0].rxclassMinConceptItem.className;
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchAllCategories(): Promise<Record<string, string>> {
  const results: Record<string, string> = {};

  // Process in batches of 5 to avoid overwhelming the API
  for (let i = 0; i < DRUG_LIST.length; i += 5) {
    const batch = DRUG_LIST.slice(i, i + 5);
    const batchResults = await Promise.allSettled(
      batch.map(async (drug) => {
        const category = await fetchDrugCategory(drug);
        return { drug, category };
      }),
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled' && result.value.category) {
        results[result.value.drug] = result.value.category;
      }
    }
  }

  return results;
}

export async function GET() {
  try {
    const result = await cachedFetch(
      'drug-categories',
      86400, // 24h TTL
      fetchAllCategories,
      'drug-categories.json',
    );

    return NextResponse.json({
      categories: result.data,
      source: result.source === 'live' ? 'NIH RxNorm API' : 'Static fallback',
      last_updated: result.last_updated,
      _live: result.source === 'live',
    }, {
      headers: cacheHeader(86400),
    });
  } catch (err) {
    console.error('[drug-categories] Failed:', err);
    return NextResponse.json(
      { error: 'Failed to load drug categories', categories: {} },
      { status: 500 },
    );
  }
}

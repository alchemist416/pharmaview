const FDA_API_BASE = process.env.NEXT_PUBLIC_FDA_API_BASE || 'https://api.fda.gov';

interface FDAResponse<T> {
  meta?: {
    results?: {
      total: number;
      skip: number;
      limit: number;
    };
  };
  results?: T[];
  error?: {
    code: string;
    message: string;
  };
}

async function fdaFetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<FDAResponse<T>> {
  const url = new URL(`${FDA_API_BASE}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const res = await fetch(url.toString(), {
    next: { revalidate: 3600 }, // Cache for 1 hour
  });

  if (!res.ok) {
    throw new Error(`FDA API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export async function fetchShortages(limit = 100, skip = 0) {
  return fdaFetch('/drug/drugshortages.json', {
    limit: String(limit),
    skip: String(skip),
  });
}

export async function fetchRecalls(params: {
  limit?: number;
  classification?: string;
  search?: string;
} = {}) {
  const queryParts: string[] = [];

  if (params.classification) {
    queryParts.push(`classification:"${params.classification}"`);
  }

  const searchParams: Record<string, string> = {
    limit: String(params.limit || 50),
    sort: 'report_date:desc',
  };

  if (params.search) {
    queryParts.push(params.search);
  }

  if (queryParts.length > 0) {
    searchParams.search = queryParts.join('+AND+');
  }

  return fdaFetch('/drug/enforcement.json', searchParams);
}

export async function fetchNDCByDrug(drugName: string) {
  return fdaFetch('/drug/ndc.json', {
    search: `brand_name:"${drugName}"+generic_name:"${drugName}"`,
    limit: '100',
  });
}

export async function fetchDrugLabel(drugName: string) {
  return fdaFetch('/drug/label.json', {
    search: `openfda.brand_name:"${drugName}"+openfda.generic_name:"${drugName}"`,
    limit: '5',
  });
}

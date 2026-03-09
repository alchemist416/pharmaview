export interface Shortage {
  id: string;
  brand_name: string;
  generic_name: string;
  status: 'Active' | 'Resolved' | 'Discontinued';
  shortage_start_date: string;
  reason: string;
  presentations: string[];
  manufacturer?: string;
  risk_score: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface Recall {
  recall_number: string;
  product_description: string;
  reason_for_recall: string;
  classification: 'Class I' | 'Class II' | 'Class III';
  recalling_firm: string;
  city: string;
  state: string;
  country: string;
  report_date: string;
  status: string;
  voluntary_mandated: string;
}

export interface Establishment {
  firm_name: string;
  country_code: string;
  country: string;
  city: string;
  registration_number: string;
  type: 'manufacturer' | 'api' | 'repackager';
}

export interface CountryMapData {
  country_code: string;
  country: string;
  manufacturer_count: number;
  establishments: Establishment[];
}

export interface CountryRisk {
  risk: number;
  label: 'Low' | 'Medium' | 'High' | 'Critical';
  note: string;
}

export interface DrugCategory {
  [drugName: string]: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ManufacturerForDrug {
  firm_name: string;
  country: string;
  country_code: string;
  city: string;
  concentration_pct: number;
}

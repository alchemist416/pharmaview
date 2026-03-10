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

export interface Drug340BPricing {
  ndc: string;
  drug_name: string;
  generic_name: string;
  strength: string;
  form: string;
  unit_price_340b: number;
  unit_price_wholesale: number;
  unit_price_retail: number;
  savings_pct: number;
  effective_date: string;
  manufacturer: string;
}

export interface PatentExpiry {
  drug_name: string;
  generic_name: string;
  patent_number: string;
  expiry_date: string;
  status: 'active' | 'expired';
  patent_holder: string;
  exclusivity_end: string;
  orange_book_listed: boolean;
  therapeutic_equivalents: number;
  related_patents?: string[];
}

export interface TradeFlow {
  reporter: string;
  reporter_name: string;
  partner: string;
  partner_name: string;
  hs_code: string;
  commodity: string;
  year: number;
  import_value_usd: number;
  export_value_usd: number;
  net_flow: number;
}

export interface CountryTradeData {
  country_code: string;
  country_name: string;
  total_imports: number;
  total_exports: number;
  net_flow: number;
  top_partners: { partner: string; partner_name: string; import_value: number; export_value: number }[];
}

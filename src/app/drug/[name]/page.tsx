'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import PanelCard from '@/components/layout/PanelCard';
import RiskBadge from '@/components/shortages/RiskBadge';
import ConcentrationBar from '@/components/charts/ConcentrationBar';
import { Recall, Drug340BPricing, PatentExpiry, TradeFlow } from '@/lib/types';
import { calculateConcentrationRisk, CompositeRiskScore, ShortagePrediction } from '@/lib/riskScoring';
import { aggregateByCountry } from '@/lib/mapData';
import { formatDate } from '@/lib/utils';
import {
  Building2,
  Bot,
  ArrowLeft,
  Pill,
  MapPin,
  Shield,
  DollarSign,
  Scale,
  Ship,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Activity,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';

interface ManufacturerResult {
  firm_name: string;
  products: string[];
  country: string;
  country_code: string;
  city: string;
}

interface ShortageResult {
  generic_name?: string;
  brand_name?: string;
  status?: string;
  initial_posting_date?: string;
  revision_date?: string;
  [key: string]: unknown;
}

function formatUSD(val: number): string {
  if (val >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(0)}M`;
  if (val >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
  if (val >= 1) return `$${val.toFixed(2)}`;
  return `$${val.toFixed(4)}`;
}

function yearsUntil(dateStr: string): string {
  const target = new Date(dateStr);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  if (diff <= 0) return 'Expired';
  const years = diff / (365.25 * 24 * 60 * 60 * 1000);
  if (years < 1) return `${Math.round(years * 12)}mo remaining`;
  return `${years.toFixed(1)}yr remaining`;
}

export default function DrugDetailPage() {
  const params = useParams();
  const router = useRouter();
  const drugName = decodeURIComponent((params.name as string) || '');

  const [manufacturers, setManufacturers] = useState<ManufacturerResult[]>([]);
  const [shortages, setShortages] = useState<ShortageResult[]>([]);
  const [recalls, setRecalls] = useState<Recall[]>([]);
  const [pricing, setPricing] = useState<Drug340BPricing[]>([]);
  const [patents, setPatents] = useState<PatentExpiry[]>([]);
  const [tradeFlows, setTradeFlows] = useState<TradeFlow[]>([]);
  const [riskScore, setRiskScore] = useState<CompositeRiskScore | null>(null);
  const [prediction, setPrediction] = useState<ShortagePrediction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!drugName) return;

    async function fetchDrugData() {
      setLoading(true);
      setError('');
      const errs: string[] = [];

      const [mfgRes, shortageRes, recallRes, pricingRes, patentRes, tradeRes, riskRes] =
        await Promise.allSettled([
          fetch(`/api/manufacturers?drug=${encodeURIComponent(drugName)}`),
          fetch('/api/shortages'),
          fetch(`/api/recalls?limit=50&days=365`),
          fetch(`/api/pricing?drug=${encodeURIComponent(drugName)}`),
          fetch(`/api/patents?drug=${encodeURIComponent(drugName)}`),
          fetch('/api/trade-flows?mode=flows'),
          fetch(`/api/risk-score?drug=${encodeURIComponent(drugName)}`),
        ]);

      if (mfgRes.status === 'fulfilled' && mfgRes.value.ok) {
        const data = await mfgRes.value.json();
        setManufacturers(data.manufacturers || []);
      } else {
        errs.push('Manufacturer data unavailable');
      }

      if (shortageRes.status === 'fulfilled' && shortageRes.value.ok) {
        const data = await shortageRes.value.json();
        const results = (data.results || []) as ShortageResult[];
        const q = drugName.toLowerCase();
        setShortages(
          results.filter(
            (s) =>
              (s.generic_name || '').toLowerCase().includes(q) ||
              (s.brand_name || '').toLowerCase().includes(q)
          )
        );
      } else {
        errs.push('Shortage data unavailable');
      }

      if (recallRes.status === 'fulfilled' && recallRes.value.ok) {
        const data = await recallRes.value.json();
        const results = (data.results || []) as Recall[];
        const q = drugName.toLowerCase();
        setRecalls(
          results.filter(
            (r) =>
              r.product_description.toLowerCase().includes(q) ||
              r.reason_for_recall.toLowerCase().includes(q)
          )
        );
      } else {
        errs.push('Recall data unavailable');
      }

      if (pricingRes.status === 'fulfilled' && pricingRes.value.ok) {
        const data = await pricingRes.value.json();
        setPricing(data.results || []);
      }

      if (patentRes.status === 'fulfilled' && patentRes.value.ok) {
        const data = await patentRes.value.json();
        setPatents(data.results || []);
      }

      if (tradeRes.status === 'fulfilled' && tradeRes.value.ok) {
        const data = await tradeRes.value.json();
        setTradeFlows(data.results || []);
      }

      if (riskRes.status === 'fulfilled' && riskRes.value.ok) {
        const data = await riskRes.value.json();
        setRiskScore(data.composite_risk || null);
        setPrediction(data.prediction || null);
      }

      if (errs.length > 0) setError(errs.join(' | '));
      setLoading(false);
    }

    fetchDrugData();
  }, [drugName]);

  const countryMapData = useMemo(() => {
    const establishments = manufacturers.map((m) => ({
      firm_name: m.firm_name,
      country_code: m.country_code || 'US',
      country: m.country || 'United States',
      city: m.city || '',
      registration_number: '',
      type: 'manufacturer' as const,
    }));
    return aggregateByCountry(establishments);
  }, [manufacturers]);

  const concentrationScore = useMemo(
    () => calculateConcentrationRisk(countryMapData),
    [countryMapData]
  );

  const activeShortage = shortages.some((s) => {
    const status = (s.status || '').toLowerCase();
    return status.includes('current') || status.includes('active') || status.includes('ongoing');
  });

  const shortageStatus = activeShortage ? 'ACTIVE SHORTAGE' : shortages.length > 0 ? 'RESOLVED' : 'NO SHORTAGE';

  const concentrationCountries = useMemo(() => {
    const total = countryMapData.reduce((sum, c) => sum + c.manufacturer_count, 0);
    return countryMapData.map((c) => ({
      ...c,
      pct: total > 0 ? Math.round((c.manufacturer_count / total) * 100) : 0,
    }));
  }, [countryMapData]);

  // Filter trade flows relevant to the drug's manufacturer countries
  const relevantTradeFlows = useMemo(() => {
    const mfgCountries = new Set(countryMapData.map((c) => c.country_code));
    mfgCountries.add('US');
    return tradeFlows.filter(
      (f) => mfgCountries.has(f.reporter) || mfgCountries.has(f.partner)
    );
  }, [tradeFlows, countryMapData]);

  return (
    <div className="min-h-screen p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 rounded hover:bg-white/5 text-muted hover:text-primary transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-accent-blue/10">
            <Pill className="text-accent-blue" size={20} />
          </div>
          <div>
            <h1 className="font-mono text-lg font-bold text-primary uppercase">{drugName}</h1>
            <p className="font-mono text-[10px] text-muted">Drug Supply Chain Detail</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {patents.length > 0 && (
            <span
              className={`font-mono text-[10px] font-bold px-2.5 py-1 rounded ${
                patents[0].status === 'active'
                  ? 'bg-accent-amber/20 text-accent-amber'
                  : 'bg-white/5 text-muted'
              }`}
            >
              {patents[0].status === 'active' ? 'PATENT ACTIVE' : 'OFF-PATENT'}
            </span>
          )}
          <span
            className={`font-mono text-xs font-bold px-3 py-1.5 rounded ${
              activeShortage
                ? 'bg-accent-red/20 text-accent-red'
                : shortages.length > 0
                ? 'bg-accent-green/20 text-accent-green'
                : 'bg-accent-blue/20 text-accent-blue'
            }`}
          >
            {shortageStatus}
          </span>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-accent-red/10 border border-accent-red/30 rounded-lg">
          <p className="font-mono text-xs text-accent-red">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="skeleton h-96" />
          <div className="skeleton h-96" />
        </div>
      ) : (
        <>
          {/* Main two-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-4">
            {/* Left Column */}
            <div className="space-y-4">
              {/* 340B Pricing */}
              {pricing.length > 0 && (
                <PanelCard
                  title="340B Pricing"
                  subtitle="CMS 340B Drug Pricing Program"
                  headerRight={
                    <div className="flex items-center gap-1 text-accent-green">
                      <DollarSign size={10} />
                      <span className="font-mono text-[10px]">340B</span>
                    </div>
                  }
                >
                  <div className="space-y-3">
                    {pricing.map((p, i) => (
                      <div
                        key={i}
                        className="p-3 rounded bg-terminal-bg border border-terminal-border"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-mono text-xs text-primary font-medium">
                            {p.generic_name} {p.strength}
                          </span>
                          <span className="font-mono text-[10px] text-muted">{p.form}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="text-center p-2 rounded bg-accent-green/5 border border-accent-green/20">
                            <p className="font-mono text-sm font-bold text-accent-green">
                              {formatUSD(p.unit_price_340b)}
                            </p>
                            <p className="font-mono text-[9px] text-muted mt-0.5">340B Price</p>
                          </div>
                          <div className="text-center p-2 rounded bg-white/5">
                            <p className="font-mono text-sm font-bold text-primary">
                              {formatUSD(p.unit_price_wholesale)}
                            </p>
                            <p className="font-mono text-[9px] text-muted mt-0.5">Wholesale</p>
                          </div>
                          <div className="text-center p-2 rounded bg-white/5">
                            <p className="font-mono text-sm font-bold text-muted">
                              {formatUSD(p.unit_price_retail)}
                            </p>
                            <p className="font-mono text-[9px] text-muted mt-0.5">Retail</p>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="font-mono text-[10px] text-muted">
                            Mfg: {p.manufacturer}
                          </span>
                          <span className="font-mono text-[10px] text-accent-green font-bold">
                            {p.savings_pct}% savings
                          </span>
                        </div>
                      </div>
                    ))}
                    <p className="font-mono text-[9px] text-muted/60 text-center">
                      Source: CMS 340B Program — Effective {pricing[0].effective_date}
                    </p>
                  </div>
                </PanelCard>
              )}

              {/* Patent / Exclusivity */}
              {patents.length > 0 && (
                <PanelCard
                  title="Patent & Exclusivity"
                  subtitle="FDA Orange Book / USPTO"
                  headerRight={
                    <div className="flex items-center gap-1 text-accent-purple">
                      <Scale size={10} />
                      <span className="font-mono text-[10px]">IP</span>
                    </div>
                  }
                >
                  <div className="space-y-3">
                    {patents.map((p, i) => (
                      <div
                        key={i}
                        className="p-3 rounded bg-terminal-bg border border-terminal-border"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-mono text-xs text-primary font-medium">
                            {p.generic_name}
                          </span>
                          <span
                            className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded ${
                              p.status === 'active'
                                ? 'bg-accent-amber/20 text-accent-amber'
                                : 'bg-accent-green/20 text-accent-green'
                            }`}
                          >
                            {p.status === 'active' ? 'ACTIVE' : 'EXPIRED'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] font-mono text-muted">
                          <div>
                            <span className="text-muted/60">Patent:</span>{' '}
                            <span className="text-primary">
                              {p.patent_number === 'expired' ? 'N/A' : p.patent_number}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted/60">Holder:</span>{' '}
                            <span className="text-primary">{p.patent_holder}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock size={8} className="text-muted/60" />
                            <span className="text-muted/60">Expiry:</span>{' '}
                            <span className={p.status === 'active' ? 'text-accent-amber' : 'text-muted'}>
                              {formatDate(p.expiry_date)}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted/60">Time:</span>{' '}
                            <span
                              className={
                                p.status === 'active' ? 'text-accent-amber font-bold' : 'text-muted'
                              }
                            >
                              {yearsUntil(p.expiry_date)}
                            </span>
                          </div>
                        </div>
                        {p.status === 'expired' && (
                          <div className="mt-2 pt-2 border-t border-terminal-border/50">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-[10px] text-muted">
                                Therapeutic equivalents (generics):
                              </span>
                              <span className="font-mono text-xs font-bold text-accent-green">
                                {p.therapeutic_equivalents}
                              </span>
                            </div>
                          </div>
                        )}
                        {p.related_patents && p.related_patents.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-terminal-border/50">
                            <span className="font-mono text-[9px] text-muted">
                              Related patents: {p.related_patents.join(', ')}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                    {patents[0]?.orange_book_listed && (
                      <p className="font-mono text-[9px] text-muted/60 text-center">
                        Listed in FDA Orange Book
                      </p>
                    )}
                  </div>
                </PanelCard>
              )}

              {/* Shortage Details */}
              <PanelCard title="Shortage Details" subtitle={`${shortages.length} record(s) found`}>
                {shortages.length === 0 ? (
                  <p className="font-mono text-xs text-muted py-4 text-center">
                    No shortage records found for this drug.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {shortages.map((s, i) => {
                      const status = (s.status || '').toLowerCase();
                      const isActive =
                        status.includes('current') || status.includes('active') || status.includes('ongoing');
                      return (
                        <div
                          key={i}
                          className="p-3 rounded bg-terminal-bg border border-terminal-border"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-mono text-xs text-primary font-medium">
                              {s.generic_name || s.brand_name || 'Unknown'}
                            </span>
                            <RiskBadge risk={isActive ? 'HIGH' : 'LOW'} />
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-muted">
                            <div>
                              <span className="text-muted/60">Status:</span>{' '}
                              <span className={isActive ? 'text-accent-red' : 'text-accent-green'}>
                                {s.status || 'Unknown'}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted/60">Date:</span>{' '}
                              {s.initial_posting_date ? formatDate(s.initial_posting_date) : '—'}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </PanelCard>

              {/* Related Recalls */}
              <PanelCard
                title="Related Regulatory Actions"
                headerRight={
                  <span className="font-mono text-[10px] text-muted">{recalls.length} found</span>
                }
              >
                {recalls.length === 0 ? (
                  <p className="font-mono text-xs text-muted py-4 text-center">
                    No recent recalls found for this drug.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {recalls.slice(0, 10).map((r, i) => (
                      <div
                        key={r.recall_number || i}
                        className="p-2 rounded bg-terminal-bg border border-terminal-border"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Shield size={10} className="text-muted" />
                          <span
                            className={`font-mono text-[10px] font-bold ${
                              r.classification === 'Class I'
                                ? 'text-accent-red'
                                : r.classification === 'Class II'
                                ? 'text-accent-amber'
                                : 'text-accent-blue'
                            }`}
                          >
                            {r.classification}
                          </span>
                          <span className="font-mono text-[10px] text-muted">
                            {formatDate(r.report_date)}
                          </span>
                        </div>
                        <p className="font-mono text-[10px] text-primary truncate">
                          {r.recalling_firm}
                        </p>
                        <p className="text-[10px] text-muted line-clamp-2">
                          {r.reason_for_recall}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </PanelCard>
            </div>

            {/* Right Column */}
            <div className="space-y-4">
              {/* Manufacturing Geography */}
              <PanelCard
                title="Manufacturing Geography"
                headerRight={
                  <span className="font-mono text-[10px] text-muted">
                    {countryMapData.length} {countryMapData.length === 1 ? 'country' : 'countries'}
                  </span>
                }
              >
                {countryMapData.length > 0 ? (
                  <div className="space-y-2">
                    {countryMapData.map((c) => {
                      const total = countryMapData.reduce((sum, x) => sum + x.manufacturer_count, 0);
                      const pct = total > 0 ? Math.round((c.manufacturer_count / total) * 100) : 0;
                      return (
                        <div
                          key={c.country_code}
                          className="flex items-center gap-3 p-2 rounded bg-terminal-bg"
                        >
                          <MapPin size={12} className="text-accent-blue shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-xs text-primary font-medium">
                                {c.country}
                              </span>
                              <span className="font-mono text-[10px] text-muted">
                                {c.manufacturer_count} mfg ({pct}%)
                              </span>
                            </div>
                            <div className="mt-1 h-1.5 bg-terminal-border rounded-full overflow-hidden">
                              <div
                                className="h-full bg-accent-blue rounded-full"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="font-mono text-xs text-muted py-4 text-center">
                    No geographic data available
                  </p>
                )}
              </PanelCard>

              {/* Composite Risk Score */}
              <PanelCard
                title="Composite Risk Score"
                subtitle="6-factor algorithmic assessment"
                headerRight={
                  <div className="flex items-center gap-1">
                    <Activity size={10} className="text-accent-amber" />
                    <span className="font-mono text-[10px] text-accent-amber">Risk Engine</span>
                  </div>
                }
              >
                {riskScore ? (
                  <div>
                    {/* Overall score */}
                    <div className="flex items-center gap-4 mb-4">
                      <div
                        className={`font-mono text-3xl font-bold ${
                          riskScore.label === 'CRITICAL' ? 'text-accent-red'
                            : riskScore.label === 'HIGH' ? 'text-accent-amber'
                            : riskScore.label === 'MEDIUM' ? 'text-accent-blue'
                            : 'text-accent-green'
                        }`}
                      >
                        {riskScore.overall}
                      </div>
                      <div>
                        <span
                          className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${
                            riskScore.label === 'CRITICAL' ? 'bg-accent-red/20 text-accent-red'
                              : riskScore.label === 'HIGH' ? 'bg-accent-amber/20 text-accent-amber'
                              : riskScore.label === 'MEDIUM' ? 'bg-accent-blue/20 text-accent-blue'
                              : 'bg-accent-green/20 text-accent-green'
                          }`}
                        >
                          {riskScore.label}
                        </span>
                        <p className="font-mono text-[10px] text-muted mt-1">Score 0-100</p>
                      </div>
                    </div>

                    {/* Component breakdown bars */}
                    <div className="space-y-2">
                      {([
                        { key: 'shortage_status', label: 'Shortage Status', max: 20, color: '#ef4444' },
                        { key: 'concentration', label: 'Mfg Concentration', max: 20, color: '#f59e0b' },
                        { key: 'country_risk', label: 'Country Risk', max: 15, color: '#3b82f6' },
                        { key: 'inspection_risk', label: 'Inspection Risk', max: 15, color: '#7c3aed' },
                        { key: 'patent_cliff', label: 'Patent Cliff', max: 15, color: '#ec4899' },
                        { key: 'history_risk', label: 'History Risk', max: 15, color: '#06b6d4' },
                      ] as const).map(({ key, label, max, color }) => {
                        const val = riskScore.components[key];
                        const pct = (val / max) * 100;
                        return (
                          <div key={key}>
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="font-mono text-[10px] text-muted">{label}</span>
                              <span className="font-mono text-[10px] text-primary">{val}/{max}</span>
                            </div>
                            <div className="h-1.5 bg-terminal-border rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${pct}%`, backgroundColor: color }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Flags */}
                    {riskScore.flags.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-terminal-border/50">
                        <div className="flex flex-wrap gap-1.5">
                          {riskScore.flags.map((flag, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent-red/10 text-accent-red font-mono text-[9px]"
                            >
                              <AlertTriangle size={8} />
                              {flag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-4 mb-3">
                    <div className="font-mono text-2xl font-bold text-primary">{concentrationScore}</div>
                    <div>
                      <p className="font-mono text-xs text-muted">HHI Score (0-100)</p>
                      <p className="font-mono text-[10px] text-muted">
                        {concentrationScore > 50 ? 'High concentration' : concentrationScore > 25 ? 'Moderate' : 'Diversified'}
                      </p>
                    </div>
                  </div>
                )}
                {concentrationCountries.length > 0 && (
                  <div className="mt-3">
                    <ConcentrationBar countries={concentrationCountries} />
                  </div>
                )}
              </PanelCard>

              {/* Shortage Prediction */}
              {prediction && (
                <PanelCard
                  title="Shortage Prediction"
                  subtitle="Pattern-based forecast model"
                  headerRight={
                    <div className="flex items-center gap-1">
                      <TrendingUp size={10} className="text-accent-purple" />
                      <span className="font-mono text-[10px] text-accent-purple">AI Model</span>
                    </div>
                  }
                >
                  <div>
                    {/* Probability gauge */}
                    <div className="flex items-center gap-4 mb-3">
                      <div
                        className={`font-mono text-2xl font-bold ${
                          prediction.risk_tier === 'VERY_HIGH' ? 'text-accent-red'
                            : prediction.risk_tier === 'HIGH' ? 'text-accent-amber'
                            : prediction.risk_tier === 'MODERATE' ? 'text-accent-blue'
                            : 'text-accent-green'
                        }`}
                      >
                        {(prediction.probability * 100).toFixed(0)}%
                      </div>
                      <div>
                        <span
                          className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded ${
                            prediction.risk_tier === 'VERY_HIGH' ? 'bg-accent-red/20 text-accent-red'
                              : prediction.risk_tier === 'HIGH' ? 'bg-accent-amber/20 text-accent-amber'
                              : prediction.risk_tier === 'MODERATE' ? 'bg-accent-blue/20 text-accent-blue'
                              : 'bg-accent-green/20 text-accent-green'
                          }`}
                        >
                          {prediction.risk_tier.replace('_', ' ')}
                        </span>
                        <p className="font-mono text-[10px] text-muted mt-1">Shortage probability (12mo)</p>
                      </div>
                    </div>

                    {/* Probability bar */}
                    <div className="h-2 bg-terminal-border rounded-full overflow-hidden mb-3">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${prediction.probability * 100}%`,
                          backgroundColor: prediction.risk_tier === 'VERY_HIGH' ? '#ef4444'
                            : prediction.risk_tier === 'HIGH' ? '#f59e0b'
                            : prediction.risk_tier === 'MODERATE' ? '#3b82f6'
                            : '#00ff88',
                        }}
                      />
                    </div>

                    {/* Key stats */}
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {prediction.months_since_last !== Infinity && (
                        <div className="p-2 rounded bg-terminal-bg text-center">
                          <p className="font-mono text-sm font-bold text-primary">
                            {prediction.months_since_last}mo
                          </p>
                          <p className="font-mono text-[9px] text-muted">Since last shortage</p>
                        </div>
                      )}
                      {prediction.predicted_next_window && (
                        <div className="p-2 rounded bg-terminal-bg text-center">
                          <p className="font-mono text-sm font-bold text-accent-amber">
                            {prediction.predicted_next_window}
                          </p>
                          <p className="font-mono text-[9px] text-muted">Predicted window</p>
                        </div>
                      )}
                    </div>

                    {/* Seasonal alert */}
                    {prediction.seasonal_alert && (
                      <div className="p-2 rounded bg-accent-amber/10 border border-accent-amber/20 mb-3">
                        <p className="font-mono text-[10px] text-accent-amber flex items-center gap-1.5">
                          <AlertTriangle size={10} />
                          {prediction.seasonal_alert}
                        </p>
                      </div>
                    )}

                    {/* Risk factors */}
                    <div className="space-y-1.5">
                      <p className="font-mono text-[10px] text-muted uppercase tracking-wider">Risk Factors</p>
                      {prediction.factors.map((factor, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="text-muted mt-0.5 shrink-0">&#x2022;</span>
                          <span className="font-mono text-[10px] text-primary">{factor}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </PanelCard>
              )}

              {/* Trade Flows */}
              {relevantTradeFlows.length > 0 && (
                <PanelCard
                  title="Pharma Trade Flows"
                  subtitle="UN Comtrade (HS 2941-3004)"
                  headerRight={
                    <div className="flex items-center gap-1 text-accent-blue">
                      <Ship size={10} />
                      <span className="font-mono text-[10px]">Trade</span>
                    </div>
                  }
                >
                  <div className="space-y-2 max-h-[360px] overflow-y-auto">
                    {relevantTradeFlows.slice(0, 12).map((f, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 p-2 rounded bg-terminal-bg border border-terminal-border"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="font-mono text-[10px] text-primary font-medium">
                              {f.reporter_name}
                            </span>
                            {f.net_flow < 0 ? (
                              <ArrowDownRight size={10} className="text-accent-red" />
                            ) : (
                              <ArrowUpRight size={10} className="text-accent-green" />
                            )}
                            <span className="font-mono text-[10px] text-primary font-medium">
                              {f.partner_name}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[9px] font-mono text-muted">
                            <span className="text-accent-red">
                              IMP {formatUSD(f.import_value_usd)}
                            </span>
                            <span className="text-accent-green">
                              EXP {formatUSD(f.export_value_usd)}
                            </span>
                            <span className="text-muted/60">
                              {f.commodity}
                            </span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p
                            className={`font-mono text-xs font-bold ${
                              f.net_flow < 0 ? 'text-accent-red' : 'text-accent-green'
                            }`}
                          >
                            {f.net_flow < 0 ? '-' : '+'}{formatUSD(Math.abs(f.net_flow))}
                          </p>
                          <p className="font-mono text-[9px] text-muted">net {f.year}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="font-mono text-[9px] text-muted/60 text-center mt-2">
                    Source: UN Comtrade — Pharma bilateral flows for manufacturer countries
                  </p>
                </PanelCard>
              )}

              {/* Manufacturer List */}
              <PanelCard
                title="Manufacturers"
                headerRight={
                  <span className="font-mono text-[10px] text-muted">
                    {manufacturers.length} found
                  </span>
                }
              >
                {manufacturers.length === 0 ? (
                  <p className="font-mono text-xs text-muted py-4 text-center">
                    No manufacturer data found.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {manufacturers.map((m, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 p-2 rounded bg-terminal-bg"
                      >
                        <Building2 size={12} className="text-muted mt-0.5 shrink-0" />
                        <div>
                          <p className="font-mono text-xs text-primary">{m.firm_name}</p>
                          <p className="font-mono text-[10px] text-muted">
                            {m.products.slice(0, 3).join(', ')}
                            {m.products.length > 3 && ` +${m.products.length - 3} more`}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </PanelCard>
            </div>
          </div>

          {/* Bottom: Ask AI */}
          <PanelCard>
            <Link
              href={`/analyst`}
              onClick={() => {
                if (typeof window !== 'undefined') {
                  sessionStorage.setItem(
                    'analyst_prefill',
                    `What's the supply chain risk profile for ${drugName}? Include shortage status, manufacturer concentration, 340B pricing implications, patent status, and trade flow dependencies.`
                  );
                }
              }}
              className="flex items-center gap-3 p-3 rounded-lg border border-terminal-border
                hover:border-accent-green/50 hover:bg-accent-green/5 transition-colors group"
            >
              <div className="p-2 rounded bg-accent-green/10">
                <Bot size={16} className="text-accent-green" />
              </div>
              <div>
                <p className="font-mono text-xs text-primary font-medium group-hover:text-accent-green transition-colors">
                  Ask AI Analyst about {drugName}
                </p>
                <p className="font-mono text-[10px] text-muted">
                  Get supply chain risk analysis, 340B pricing context, patent outlook, and trade flow insights
                </p>
              </div>
            </Link>
          </PanelCard>
        </>
      )}
    </div>
  );
}

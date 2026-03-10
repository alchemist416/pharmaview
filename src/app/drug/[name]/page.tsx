'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import PanelCard from '@/components/layout/PanelCard';
import WorldMap from '@/components/map/WorldMap';
import RiskBadge from '@/components/shortages/RiskBadge';
import ConcentrationBar from '@/components/charts/ConcentrationBar';
import { Recall } from '@/lib/types';
import { calculateConcentrationRisk } from '@/lib/riskScoring';
import { aggregateByCountry } from '@/lib/mapData';
import { formatDate } from '@/lib/utils';
import {
  Building2,
  Bot,
  ArrowLeft,
  Pill,
  Globe,
  Shield,
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

export default function DrugDetailPage() {
  const params = useParams();
  const router = useRouter();
  const drugName = decodeURIComponent((params.name as string) || '');

  const [manufacturers, setManufacturers] = useState<ManufacturerResult[]>([]);
  const [shortages, setShortages] = useState<ShortageResult[]>([]);
  const [recalls, setRecalls] = useState<Recall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!drugName) return;

    async function fetchDrugData() {
      setLoading(true);
      setError('');
      const errs: string[] = [];

      const [mfgRes, shortageRes, recallRes] = await Promise.allSettled([
        fetch(`/api/manufacturers?drug=${encodeURIComponent(drugName)}`),
        fetch('/api/shortages'),
        fetch(`/api/recalls?limit=50&days=365`),
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

      if (errs.length > 0) setError(errs.join(' | '));
      setLoading(false);
    }

    fetchDrugData();
  }, [drugName]);

  // Build country data from manufacturer results (which include DECRS cross-referenced countries)
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
        <div className="ml-auto">
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
        <div className="grid grid-cols-2 gap-4">
          <div className="skeleton h-96" />
          <div className="skeleton h-96" />
        </div>
      ) : (
        <>
          {/* Main two-column layout */}
          <div className="grid grid-cols-[1fr_1fr] gap-4">
            {/* Left: Drug Info + Shortage Details */}
            <div className="space-y-4">
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

            {/* Right: Map + Manufacturers + Risk */}
            <div className="space-y-4">
              {/* Mini Map */}
              <PanelCard title="Manufacturing Geography" subtitle="Countries producing this drug">
                {countryMapData.length > 0 ? (
                  <div className="h-[250px]">
                    <WorldMap countryData={countryMapData} />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[250px]">
                    <div className="text-center">
                      <Globe size={24} className="text-muted mx-auto mb-2" />
                      <p className="font-mono text-xs text-muted">No geographic data available</p>
                    </div>
                  </div>
                )}
              </PanelCard>

              {/* Concentration Risk */}
              <PanelCard title="Concentration Risk">
                <div className="flex items-center gap-4 mb-3">
                  <div className="font-mono text-2xl font-bold text-primary">{concentrationScore}</div>
                  <div>
                    <p className="font-mono text-xs text-muted">HHI Score (0-100)</p>
                    <p className="font-mono text-[10px] text-muted">
                      {concentrationScore > 50
                        ? 'High concentration — supply chain at risk'
                        : concentrationScore > 25
                        ? 'Moderate concentration'
                        : 'Well diversified supply chain'}
                    </p>
                  </div>
                </div>
                {concentrationCountries.length > 0 && (
                  <ConcentrationBar countries={concentrationCountries} />
                )}
              </PanelCard>

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
                    `What's the supply chain risk profile for ${drugName}? Include shortage status, manufacturer concentration, and regulatory concerns.`
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
                  Get supply chain risk analysis, shortage insights, and regulatory context
                </p>
              </div>
            </Link>
          </PanelCard>
        </>
      )}
    </div>
  );
}

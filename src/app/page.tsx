'use client';

import { useEffect, useState } from 'react';
import PanelCard from '@/components/layout/PanelCard';
import TickerTape from '@/components/layout/TickerTape';
import WorldMap from '@/components/map/WorldMap';
import { CountryMapData, Recall } from '@/lib/types';
import { AlertTriangle, Shield, Globe } from 'lucide-react';

export default function Dashboard() {
  const [countryData, setCountryData] = useState<CountryMapData[]>([]);
  const [shortages, setShortages] = useState<Record<string, unknown>[]>([]);
  const [recalls, setRecalls] = useState<Recall[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');

  useEffect(() => {
    async function fetchData() {
      try {
        const [mapRes, shortageRes, recallRes] = await Promise.allSettled([
          fetch('/api/map-data'),
          fetch('/api/shortages'),
          fetch('/api/recalls?limit=20&days=90'),
        ]);

        if (mapRes.status === 'fulfilled' && mapRes.value.ok) {
          const data = await mapRes.value.json();
          setCountryData(data.countries || []);
        }

        if (shortageRes.status === 'fulfilled' && shortageRes.value.ok) {
          const data = await shortageRes.value.json();
          setShortages(data.results || []);
        }

        if (recallRes.status === 'fulfilled' && recallRes.value.ok) {
          const data = await recallRes.value.json();
          setRecalls(data.results || []);
        }

        setLastUpdated(new Date().toLocaleTimeString());
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const activeShortages = shortages.filter(
    (s) => {
      const status = ((s.status as string) || '').toLowerCase();
      return status.includes('current') || status.includes('active') || status.includes('ongoing');
    }
  ).length;

  const recentRecalls = recalls.length;

  const countriesWithRisk = countryData.filter((c) => c.manufacturer_count > 50).length;

  return (
    <div className="min-h-screen">
      {/* Ticker */}
      <TickerTape recalls={recalls} />

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4 p-4">
        <div className="bg-terminal-panel border border-terminal-border rounded-lg p-4 flex items-center gap-4">
          <div className="p-3 rounded-lg bg-accent-red/10">
            <AlertTriangle className="text-accent-red" size={20} />
          </div>
          <div>
            <p className="font-mono text-2xl font-bold text-accent-red">
              {loading ? '—' : activeShortages}
            </p>
            <p className="font-mono text-[10px] text-muted uppercase tracking-wider">Active Shortages</p>
          </div>
        </div>
        <div className="bg-terminal-panel border border-terminal-border rounded-lg p-4 flex items-center gap-4">
          <div className="p-3 rounded-lg bg-accent-amber/10">
            <Shield className="text-accent-amber" size={20} />
          </div>
          <div>
            <p className="font-mono text-2xl font-bold text-accent-amber">
              {loading ? '—' : recentRecalls}
            </p>
            <p className="font-mono text-[10px] text-muted uppercase tracking-wider">Recent Recalls (90d)</p>
          </div>
        </div>
        <div className="bg-terminal-panel border border-terminal-border rounded-lg p-4 flex items-center gap-4">
          <div className="p-3 rounded-lg bg-accent-purple/10">
            <Globe className="text-accent-purple" size={20} />
          </div>
          <div>
            <p className="font-mono text-2xl font-bold text-accent-purple">
              {loading ? '—' : countriesWithRisk}
            </p>
            <p className="font-mono text-[10px] text-muted uppercase tracking-wider">Concentration Risk Countries</p>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-[1fr_2fr_1fr] gap-4 p-4 pt-0">
        {/* Left: Shortages Watchlist */}
        <PanelCard
          title="Shortage Watchlist"
          subtitle={lastUpdated ? `Updated ${lastUpdated}` : undefined}
          className="max-h-[600px] overflow-hidden"
        >
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="skeleton h-10 w-full" />
              ))}
            </div>
          ) : (
            <div className="max-h-[500px] overflow-y-auto">
              {shortages.slice(0, 20).map((s, i) => {
                const name = (s.generic_name || s.brand_name || s.brand_name_search || 'Unknown') as string;
                const status = ((s.status as string) || '').toLowerCase();
                const isActive = status.includes('current') || status.includes('active') || status.includes('ongoing');
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between py-2 border-b border-terminal-border/30 last:border-0"
                  >
                    <span className="font-mono text-xs text-primary truncate mr-2">{name}</span>
                    <span
                      className={`font-mono text-[10px] font-bold shrink-0 ${
                        isActive ? 'text-accent-red' : 'text-accent-green'
                      }`}
                    >
                      {isActive ? 'ACTIVE' : 'RESOLVED'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </PanelCard>

        {/* Center: World Map */}
        <PanelCard
          title="Supply Chain Map"
          subtitle="FDA-registered drug manufacturers worldwide"
          className="min-h-[500px]"
        >
          {loading ? (
            <div className="skeleton w-full h-[400px]" />
          ) : (
            <WorldMap countryData={countryData} />
          )}
        </PanelCard>

        {/* Right: Regulatory Feed */}
        <PanelCard
          title="Regulatory Alerts"
          subtitle="Recent FDA enforcement actions"
          className="max-h-[600px] overflow-hidden"
        >
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skeleton h-20 w-full" />
              ))}
            </div>
          ) : (
            <div className="max-h-[500px] overflow-y-auto pr-1">
              {recalls.slice(0, 10).map((recall, i) => (
                <div
                  key={recall.recall_number || i}
                  className="py-3 border-b border-terminal-border/30 last:border-0"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        recall.classification === 'Class I'
                          ? 'bg-accent-red/20 text-accent-red'
                          : recall.classification === 'Class II'
                          ? 'bg-accent-amber/20 text-accent-amber'
                          : 'bg-accent-blue/20 text-accent-blue'
                      }`}
                    >
                      {recall.classification}
                    </span>
                  </div>
                  <p className="font-mono text-xs text-primary font-medium truncate">
                    {recall.recalling_firm}
                  </p>
                  <p className="text-[10px] text-muted line-clamp-2 mt-0.5">
                    {recall.reason_for_recall}
                  </p>
                </div>
              ))}
            </div>
          )}
        </PanelCard>
      </div>
    </div>
  );
}

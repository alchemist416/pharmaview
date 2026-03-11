'use client';

import { useEffect, useState } from 'react';
import PanelCard from '@/components/layout/PanelCard';
import TickerTape from '@/components/layout/TickerTape';
import WorldMap from '@/components/map/WorldMap';
import { CountryMapData, Recall, TradeFlow } from '@/lib/types';
import { AlertTriangle, Shield, Globe, Search, Bug, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';

interface LiveStatus { isLive: boolean; lastUpdated: string; source: string }

export default function Dashboard() {
  const [countryData, setCountryData] = useState<CountryMapData[]>([]);
  const [shortages, setShortages] = useState<Record<string, unknown>[]>([]);
  const [recalls, setRecalls] = useState<Recall[]>([]);
  const [tradeFlows, setTradeFlows] = useState<TradeFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [drugSearch, setDrugSearch] = useState('');
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugData, setDebugData] = useState<Record<string, unknown> | null>(null);
  const [apiDebug, setApiDebug] = useState<Record<string, unknown>>({});
  const [liveStatus, setLiveStatus] = useState<Record<string, LiveStatus>>({});

  useEffect(() => {
    async function fetchData() {
      const errs: string[] = [];
      const debugInfo: Record<string, unknown> = {};
      const live: Record<string, LiveStatus> = {};

      try {
        const [mapRes, shortageRes, recallRes, tradeRes] = await Promise.allSettled([
          fetch('/api/map-data'),
          fetch('/api/shortages'),
          fetch('/api/recalls?limit=20&days=90'),
          fetch('/api/trade-flows?mode=flows'),
        ]);

        if (mapRes.status === 'fulfilled') {
          const data = await mapRes.value.json();
          debugInfo.map = { status: mapRes.value.status, debug: data.debug, resultCount: (data.countries || []).length };
          if (mapRes.value.ok) {
            setCountryData(data.countries || []);
            live.map = { isLive: !!data._live, lastUpdated: data.last_updated || '', source: data.source || '' };
          } else {
            errs.push(`Map: ${data.error || mapRes.value.status}`);
          }
        } else {
          debugInfo.map = { error: mapRes.reason?.message || 'Network error' };
          errs.push('Map data unavailable');
        }

        if (shortageRes.status === 'fulfilled') {
          const data = await shortageRes.value.json();
          debugInfo.shortages = { status: shortageRes.value.status, debug: data.debug, resultCount: (data.results || []).length };
          if (shortageRes.value.ok || (data.results && data.results.length > 0)) {
            setShortages(data.results || []);
            live.shortages = { isLive: !!data._live, lastUpdated: data.last_updated || '', source: data.source || '' };
          } else {
            errs.push(`Shortages: ${data.error || shortageRes.value.status}`);
          }
        } else {
          debugInfo.shortages = { error: shortageRes.reason?.message || 'Network error' };
          errs.push('Shortage data unavailable');
        }

        if (recallRes.status === 'fulfilled') {
          const data = await recallRes.value.json();
          debugInfo.recalls = { status: recallRes.value.status, debug: data.debug, resultCount: (data.results || []).length };
          if (recallRes.value.ok || (data.results && data.results.length > 0)) {
            setRecalls(data.results || []);
            live.recalls = { isLive: !!data._live, lastUpdated: data.last_updated || '', source: data.source || '' };
          } else {
            errs.push(`Recalls: ${data.error || recallRes.value.status}`);
          }
        } else {
          debugInfo.recalls = { error: recallRes.reason?.message || 'Network error' };
          errs.push('Recall data unavailable');
        }

        if (tradeRes.status === 'fulfilled' && tradeRes.value.ok) {
          const data = await tradeRes.value.json();
          setTradeFlows(data.results || []);
          live.trade = { isLive: !!data._live, lastUpdated: data.last_updated || '', source: data.source || '' };
        }

        setLiveStatus(live);
        setApiDebug(debugInfo);
        setErrors(errs);
        setLastUpdated(new Date().toLocaleTimeString());
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
        setErrors(['Failed to connect to FDA API']);
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
      {/* Error Banner */}
      {errors.length > 0 && (
        <div className="mx-4 mt-2 p-3 bg-accent-red/10 border border-accent-red/30 rounded-lg">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs text-accent-red">
              {errors.join(' | ')}
            </p>
            <button
              onClick={() => setDebugOpen((v) => !v)}
              className="flex items-center gap-1 font-mono text-[10px] text-accent-red/70 hover:text-accent-red transition-colors ml-4 shrink-0"
            >
              <Bug size={10} />
              Debug
              {debugOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </button>
          </div>
        </div>
      )}

      {/* Ticker */}
      <TickerTape recalls={recalls} />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4">
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
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr_1fr] gap-4 p-4 pt-0">
        {/* Left: Drug Search + Shortages Watchlist */}
        <div className="space-y-4">
          {/* Drug Search */}
          <PanelCard title="Drug Search">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (drugSearch.trim()) {
                  window.location.href = `/drug/${encodeURIComponent(drugSearch.trim())}`;
                }
              }}
              className="flex gap-2"
            >
              <div className="relative flex-1">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  placeholder="Search drug name..."
                  value={drugSearch}
                  onChange={(e) => setDrugSearch(e.target.value)}
                  className="w-full bg-terminal-bg border border-terminal-border rounded pl-8 pr-3 py-2 text-xs font-mono text-primary placeholder:text-muted focus:outline-none focus:border-accent-green/50"
                />
              </div>
              <button
                type="submit"
                disabled={!drugSearch.trim()}
                className="px-3 py-2 bg-accent-green/10 border border-accent-green/30 rounded text-accent-green text-xs font-mono hover:bg-accent-green/20 transition-colors disabled:opacity-30"
              >
                Go
              </button>
            </form>
          </PanelCard>

          <PanelCard
            title="Shortage Watchlist"
            subtitle={lastUpdated ? `Updated ${lastUpdated}` : undefined}
            className="max-h-[500px] overflow-hidden"
            isLive={liveStatus.shortages?.isLive}
            lastUpdated={liveStatus.shortages?.lastUpdated}
            dataSource={liveStatus.shortages?.source}
          >
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="skeleton h-10 w-full" />
                ))}
              </div>
            ) : (
              <div className="max-h-[400px] overflow-y-auto">
                {shortages.slice(0, 20).map((s, i) => {
                  const name = (s.generic_name || s.brand_name || s.brand_name_search || 'Unknown') as string;
                  const status = ((s.status as string) || '').toLowerCase();
                  const isActive = status.includes('current') || status.includes('active') || status.includes('ongoing');
                  return (
                    <Link
                      href={`/drug/${encodeURIComponent(name)}`}
                      key={i}
                      className="flex items-center justify-between py-2 border-b border-terminal-border/30 last:border-0 hover:bg-white/[0.02] transition-colors"
                    >
                      <span className="font-mono text-xs text-primary truncate mr-2">{name}</span>
                      <span
                        className={`font-mono text-[10px] font-bold shrink-0 ${
                          isActive ? 'text-accent-red' : 'text-accent-green'
                        }`}
                      >
                        {isActive ? 'ACTIVE' : 'RESOLVED'}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </PanelCard>
        </div>

        {/* Center: World Map */}
        <PanelCard
          title="Supply Chain Map"
          subtitle="FDA-registered drug manufacturers worldwide"
          className="min-h-[500px]"
          isLive={liveStatus.map?.isLive}
          lastUpdated={liveStatus.map?.lastUpdated}
          dataSource={liveStatus.map?.source}
        >
          {loading ? (
            <div className="skeleton w-full h-[400px]" />
          ) : (
            <WorldMap countryData={countryData} tradeFlows={tradeFlows} />
          )}
        </PanelCard>

        {/* Right: Regulatory Feed */}
        <PanelCard
          title="Regulatory Alerts"
          subtitle="Recent FDA enforcement actions"
          className="max-h-[600px] overflow-hidden"
          isLive={liveStatus.recalls?.isLive}
          lastUpdated={liveStatus.recalls?.lastUpdated}
          dataSource={liveStatus.recalls?.source}
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

      {/* Debug Panel */}
      {debugOpen && (
        <div className="mx-4 mb-4 p-4 bg-terminal-panel border border-terminal-border rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-mono text-xs font-bold text-primary flex items-center gap-2">
              <Bug size={12} className="text-accent-amber" />
              API Debug Panel
            </h3>
            <button
              onClick={async () => {
                try {
                  const res = await fetch('/api/debug');
                  const data = await res.json();
                  setDebugData(data);
                } catch (err) {
                  setDebugData({ error: err instanceof Error ? err.message : 'Failed to fetch debug data' });
                }
              }}
              className="font-mono text-[10px] px-2 py-1 rounded bg-accent-blue/10 text-accent-blue hover:bg-accent-blue/20 transition-colors"
            >
              Run Health Check
            </button>
          </div>

          <div className="space-y-3">
            {/* API Response Debug */}
            <div>
              <p className="font-mono text-[10px] text-muted uppercase tracking-wider mb-1">
                API Responses (from page load)
              </p>
              <pre className="font-mono text-[10px] text-primary bg-terminal-bg p-3 rounded overflow-x-auto max-h-[200px] overflow-y-auto">
                {JSON.stringify(apiDebug, null, 2)}
              </pre>
            </div>

            {/* Health Check Results */}
            {debugData && (
              <div>
                <p className="font-mono text-[10px] text-muted uppercase tracking-wider mb-1">
                  Health Check Results
                </p>
                <pre className="font-mono text-[10px] text-primary bg-terminal-bg p-3 rounded overflow-x-auto max-h-[300px] overflow-y-auto">
                  {JSON.stringify(debugData, null, 2)}
                </pre>
              </div>
            )}

            <p className="font-mono text-[10px] text-muted">
              You can also hit <code className="text-accent-green">/api/debug</code> directly in your browser,
              or check Vercel Function Logs at <code className="text-accent-green">vercel.com → Project → Logs</code>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

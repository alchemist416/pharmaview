'use client';

import { useEffect, useState } from 'react';
import PanelCard from '@/components/layout/PanelCard';
import TickerTape from '@/components/layout/TickerTape';
import RecallFeed from '@/components/regulatory/RecallFeed';
import RecallTrendLine from '@/components/charts/RecallTrendLine';
import RecallDonutChart from '@/components/charts/RecallDonutChart';
import { Recall } from '@/lib/types';

export default function RegulatoryPage() {
  const [recalls, setRecalls] = useState<Recall[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(90);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/recalls?limit=100&days=${days}`);
        if (res.ok) {
          const data = await res.json();
          setRecalls(data.results || []);
        } else {
          setError('FDA Enforcement API returned an error.');
        }
      } catch (err) {
        console.error('Failed to fetch recalls:', err);
        setError('Failed to connect to FDA API.');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [days]);

  // Stats
  const classBreakdown = recalls.reduce((acc, r) => {
    acc[r.classification] = (acc[r.classification] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const donutData = Object.entries(classBreakdown).map(([name, value]) => ({
    name,
    value,
  }));

  const topCompanies = Object.entries(
    recalls.reduce((acc, r) => {
      acc[r.recalling_firm] = (acc[r.recalling_firm] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div>
      <TickerTape recalls={recalls} />

      <div className="p-4 space-y-4">
        {error && (
          <div className="p-3 bg-accent-red/10 border border-accent-red/30 rounded-lg">
            <p className="font-mono text-xs text-accent-red">{error}</p>
          </div>
        )}
        <div className="flex items-center justify-between">
          <h1 className="font-mono text-lg font-bold text-primary uppercase tracking-wider">
            Regulatory Pulse
          </h1>
          <div className="flex items-center gap-1">
            {[7, 30, 90, 365].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 rounded text-xs font-mono transition-colors ${
                  days === d
                    ? 'bg-accent-blue/20 text-accent-blue'
                    : 'text-muted hover:text-primary hover:bg-white/5'
                }`}
              >
                {d === 365 ? '1Y' : `${d}D`}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
          {/* Main Feed */}
          <PanelCard title="Enforcement Actions" subtitle={`Last ${days} days`}>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="skeleton h-24 w-full" />
                ))}
              </div>
            ) : (
              <RecallFeed recalls={recalls} />
            )}
          </PanelCard>

          {/* Sidebar Stats */}
          <div className="space-y-4">
            <PanelCard title="By Classification">
              {loading ? (
                <div className="skeleton h-40 w-full" />
              ) : (
                <RecallDonutChart data={donutData} />
              )}
            </PanelCard>

            <PanelCard title="Recall Trend">
              {loading ? (
                <div className="skeleton h-[120px] w-full" />
              ) : (
                <RecallTrendLine recalls={recalls} />
              )}
            </PanelCard>

            <PanelCard title="Top Companies">
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="skeleton h-6 w-full" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {topCompanies.map(([company, count], i) => (
                    <div
                      key={company}
                      className="flex items-center justify-between py-1.5 border-b border-terminal-border/30 last:border-0"
                    >
                      <span className="font-mono text-xs text-primary truncate mr-2">
                        <span className="text-muted">{i + 1}.</span> {company}
                      </span>
                      <span className="font-mono text-xs text-accent-amber shrink-0 font-bold">
                        {count}
                      </span>
                    </div>
                  ))}
                  {topCompanies.length === 0 && (
                    <p className="text-muted font-mono text-xs text-center py-4">No data</p>
                  )}
                </div>
              )}
            </PanelCard>
          </div>
        </div>
      </div>
    </div>
  );
}

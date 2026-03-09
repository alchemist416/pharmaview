'use client';

import { useEffect, useState } from 'react';
import PanelCard from '@/components/layout/PanelCard';
import ShortageTable from '@/components/shortages/ShortageTable';
import { AlertTriangle, TrendingUp, CheckCircle } from 'lucide-react';

export default function ShortagesPage() {
  const [shortages, setShortages] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/shortages');
        if (res.ok) {
          const data = await res.json();
          setShortages(data.results || []);
        } else {
          setError('FDA Shortages API returned an error. Data may be stale.');
        }
      } catch (err) {
        console.error('Failed to fetch shortages:', err);
        setError('Failed to connect to FDA API.');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const activeCount = shortages.filter((s) => {
    const status = ((s.status as string) || '').toLowerCase();
    return status.includes('current') || status.includes('active') || status.includes('ongoing');
  }).length;

  const resolvedCount = shortages.filter((s) =>
    ((s.status as string) || '').toLowerCase().includes('resolved')
  ).length;

  return (
    <div className="p-4 space-y-4">
      <h1 className="font-mono text-lg font-bold text-primary uppercase tracking-wider">
        Drug Shortages Monitor
      </h1>

      {/* Error Banner */}
      {error && (
        <div className="p-3 bg-accent-red/10 border border-accent-red/30 rounded-lg">
          <p className="font-mono text-xs text-accent-red">{error}</p>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-terminal-panel border border-terminal-border rounded-lg p-4 flex items-center gap-4">
          <div className="p-3 rounded-lg bg-accent-red/10">
            <AlertTriangle className="text-accent-red" size={20} />
          </div>
          <div>
            <p className="font-mono text-2xl font-bold text-accent-red">
              {loading ? '—' : activeCount}
            </p>
            <p className="font-mono text-[10px] text-muted uppercase tracking-wider">Total Active Shortages</p>
          </div>
        </div>
        <div className="bg-terminal-panel border border-terminal-border rounded-lg p-4 flex items-center gap-4">
          <div className="p-3 rounded-lg bg-accent-amber/10">
            <TrendingUp className="text-accent-amber" size={20} />
          </div>
          <div>
            <p className="font-mono text-2xl font-bold text-accent-amber">
              {loading ? '—' : shortages.length}
            </p>
            <p className="font-mono text-[10px] text-muted uppercase tracking-wider">Total Records</p>
          </div>
        </div>
        <div className="bg-terminal-panel border border-terminal-border rounded-lg p-4 flex items-center gap-4">
          <div className="p-3 rounded-lg bg-accent-green/10">
            <CheckCircle className="text-accent-green" size={20} />
          </div>
          <div>
            <p className="font-mono text-2xl font-bold text-accent-green">
              {loading ? '—' : resolvedCount}
            </p>
            <p className="font-mono text-[10px] text-muted uppercase tracking-wider">Resolved</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <PanelCard title="Drug Shortages" subtitle="Source: openFDA Drug Shortages API">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="skeleton h-10 w-full" />
            ))}
          </div>
        ) : (
          <ShortageTable shortages={shortages} />
        )}
      </PanelCard>
    </div>
  );
}

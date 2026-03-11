'use client';

import { AlertTriangle, X } from 'lucide-react';
import { useSimulation } from '@/lib/simulation/context';

export default function SimulationBanner() {
  const { isActive, exitSimulation, result } = useSimulation();

  if (!isActive || !result) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[90] bg-accent-amber/10 border-t-2 border-accent-amber">
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-3">
          <AlertTriangle size={16} className="text-accent-amber animate-pulse" />
          <span className="font-mono text-xs font-bold text-accent-amber tracking-wider">
            SIMULATION MODE
          </span>
          <span className="font-mono text-[10px] text-accent-amber/70">
            — Results are projections, not real data
          </span>
          <span className="font-mono text-[10px] text-muted ml-2">
            {result.totalDrugsAffected} drugs affected | {result.totalFacilitiesAffected} facilities |
            Severity: {result.overallSeverity.toUpperCase()}
          </span>
        </div>
        <button
          onClick={exitSimulation}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-accent-amber/20 text-accent-amber text-xs font-mono hover:bg-accent-amber/30 transition-colors"
        >
          <X size={12} /> Exit Simulation
        </button>
      </div>
    </div>
  );
}

'use client';

import { useState, useCallback } from 'react';
import { useSimulation } from '@/lib/simulation/context';
import { AffectedDrug, AffectedRegion } from '@/lib/simulation/types';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Download,
  Bot,
  Loader2,
  Clock,
  MapPin,
  Pill,
  Factory,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Severity badge
// ---------------------------------------------------------------------------

function SeverityBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-accent-red/20 text-accent-red',
    high: 'bg-accent-amber/20 text-accent-amber',
    moderate: 'bg-accent-blue/20 text-accent-blue',
    low: 'bg-accent-green/20 text-accent-green',
  };
  return (
    <span className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded ${colors[level] || colors.low}`}>
      {level.toUpperCase()}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Affected drugs table
// ---------------------------------------------------------------------------

function AffectedDrugsTable({ drugs }: { drugs: AffectedDrug[] }) {
  const [sortKey, setSortKey] = useState<'probability' | 'recovery' | 'name'>('probability');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = [...drugs].sort((a, b) => {
    const dir = sortDir === 'desc' ? -1 : 1;
    switch (sortKey) {
      case 'probability': return dir * (b.shortageProbability - a.shortageProbability);
      case 'recovery': return dir * (b.estimatedRecoveryDays - a.estimatedRecoveryDays);
      case 'name': return dir * a.name.localeCompare(b.name);
      default: return 0;
    }
  });

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortIcon = ({ k }: { k: typeof sortKey }) => {
    if (sortKey !== k) return null;
    return sortDir === 'desc' ? <ChevronDown size={10} /> : <ChevronUp size={10} />;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-terminal-border text-left">
            <th className="py-2 pr-3 font-mono text-[10px] text-muted uppercase cursor-pointer" onClick={() => toggleSort('name')}>
              Drug <SortIcon k="name" />
            </th>
            <th className="py-2 px-3 font-mono text-[10px] text-muted uppercase">Category</th>
            <th className="py-2 px-3 font-mono text-[10px] text-muted uppercase">Impact</th>
            <th className="py-2 px-3 font-mono text-[10px] text-muted uppercase cursor-pointer" onClick={() => toggleSort('probability')}>
              Shortage Prob. <SortIcon k="probability" />
            </th>
            <th className="py-2 px-3 font-mono text-[10px] text-muted uppercase">Confidence</th>
            <th className="py-2 px-3 font-mono text-[10px] text-muted uppercase cursor-pointer" onClick={() => toggleSort('recovery')}>
              Recovery <SortIcon k="recovery" />
            </th>
            <th className="py-2 pl-3 font-mono text-[10px] text-muted uppercase">Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((drug, i) => (
            <tr key={i} className="border-b border-terminal-border/30 hover:bg-white/[0.02]">
              <td className="py-2.5 pr-3 font-mono text-xs text-primary">{drug.name}</td>
              <td className="py-2.5 px-3 font-mono text-[10px] text-muted">{drug.category}</td>
              <td className="py-2.5 px-3"><SeverityBadge level={drug.impactLevel} /></td>
              <td className="py-2.5 px-3 font-mono text-xs text-primary font-bold">
                {(drug.shortageProbability * 100).toFixed(0)}%
              </td>
              <td className="py-2.5 px-3 font-mono text-[10px] text-muted">
                {(drug.confidenceInterval[0] * 100).toFixed(0)}–{(drug.confidenceInterval[1] * 100).toFixed(0)}%
              </td>
              <td className="py-2.5 px-3 font-mono text-[10px] text-muted">
                {drug.recoveryRange[0]}–{drug.recoveryRange[1]}d
              </td>
              <td className="py-2.5 pl-3 font-mono text-[10px] text-muted">{drug.currentStatus}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Affected regions grid
// ---------------------------------------------------------------------------

function AffectedRegionsGrid({ regions }: { regions: AffectedRegion[] }) {
  if (regions.length === 0) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {regions.map((r) => (
        <div key={r.countryCode} className="bg-terminal-bg border border-terminal-border rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-xs text-primary font-bold">{r.countryName}</span>
            <SeverityBadge level={r.impactLevel} />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between font-mono text-[10px]">
              <span className="text-muted">Facilities affected</span>
              <span className="text-primary">{r.affectedFacilities}/{r.totalFacilities} ({r.percentAffected}%)</span>
            </div>
            <div className="flex justify-between font-mono text-[10px]">
              <span className="text-muted">Drugs at risk</span>
              <span className="text-primary">{r.drugsAtRisk}</span>
            </div>
            {/* Progress bar */}
            <div className="h-1.5 bg-terminal-border rounded-full mt-1">
              <div
                className={`h-full rounded-full ${
                  r.impactLevel === 'critical' ? 'bg-accent-red'
                  : r.impactLevel === 'high' ? 'bg-accent-amber'
                  : 'bg-accent-blue'
                }`}
                style={{ width: `${r.percentAffected}%` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Summary section
// ---------------------------------------------------------------------------

function AiSummarySection() {
  const { result, fetchAiSummary } = useSimulation();
  const [loading, setLoading] = useState(false);

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    await fetchAiSummary();
    setLoading(false);
  }, [fetchAiSummary]);

  if (!result) return null;

  return (
    <div className="bg-terminal-bg border border-terminal-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Bot size={14} className="text-accent-purple" />
          <h4 className="font-mono text-xs font-bold text-primary">AI Simulation Summary</h4>
        </div>
        {!result.aiSummary && (
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-accent-purple/10 border border-accent-purple/30 text-accent-purple text-[10px] font-mono hover:bg-accent-purple/20 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 size={10} className="animate-spin" /> : <Bot size={10} />}
            {loading ? 'Generating...' : 'Generate Summary'}
          </button>
        )}
      </div>
      {result.aiSummary ? (
        <div className="font-mono text-xs text-primary leading-relaxed whitespace-pre-wrap">
          {result.aiSummary}
        </div>
      ) : (
        <p className="font-mono text-[10px] text-muted">
          Click &ldquo;Generate Summary&rdquo; to have the AI Analyst produce a simulation briefing with procurement recommendations.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PDF Export
// ---------------------------------------------------------------------------

async function exportPdf(result: NonNullable<ReturnType<typeof useSimulation>['result']>) {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);

  const el = document.getElementById('simulation-results-content');
  if (!el) return;

  const canvas = await html2canvas(el, {
    backgroundColor: '#0a0e1a',
    scale: 2,
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const imgWidth = pageWidth - 20;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  // Title
  pdf.setFontSize(16);
  pdf.setTextColor(245, 158, 11); // amber
  pdf.text('PHARMAVIEW SIMULATION REPORT', 10, 15);
  pdf.setFontSize(8);
  pdf.setTextColor(100, 116, 139); // muted
  pdf.text('SIMULATED PROJECTIONS — NOT REAL DATA', 10, 21);
  pdf.text(`Generated: ${new Date(result.timestamp).toLocaleString()}`, 10, 25);
  pdf.text(`Scenario: ${result.params.type.replace(/-/g, ' ').toUpperCase()}`, 10, 29);
  pdf.text(`Severity: ${result.overallSeverity.toUpperCase()} | Drugs: ${result.totalDrugsAffected} | Facilities: ${result.totalFacilitiesAffected}`, 10, 33);

  let yPos = 38;

  // If the image fits on remaining page
  if (yPos + imgHeight <= pdf.internal.pageSize.getHeight() - 10) {
    pdf.addImage(imgData, 'PNG', 10, yPos, imgWidth, imgHeight);
  } else {
    // Split across pages
    const pageHeight = pdf.internal.pageSize.getHeight() - 10;
    let remaining = imgHeight;
    let srcY = 0;

    while (remaining > 0) {
      const sliceHeight = Math.min(remaining, pageHeight - yPos);
      const sliceSrcHeight = (sliceHeight / imgHeight) * canvas.height;

      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sliceSrcHeight;
      const ctx = sliceCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(canvas, 0, srcY, canvas.width, sliceSrcHeight, 0, 0, canvas.width, sliceSrcHeight);
        pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', 10, yPos, imgWidth, sliceHeight);
      }

      remaining -= sliceHeight;
      srcY += sliceSrcHeight;

      if (remaining > 0) {
        pdf.addPage();
        yPos = 10;
      }
    }
  }

  pdf.save(`pharmaview-simulation-${result.id}.pdf`);
}

// ---------------------------------------------------------------------------
// Main Results Component
// ---------------------------------------------------------------------------

export default function SimulationResults() {
  const { isActive, result } = useSimulation();

  if (!isActive || !result) return null;

  const scenarioLabel = result.params.type.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="space-y-4 p-4" id="simulation-results-container">
      {/* Header */}
      <div className="bg-terminal-panel border-2 border-accent-amber/40 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <AlertTriangle size={18} className="text-accent-amber" />
            <h2 className="font-mono text-lg font-bold text-accent-amber">Simulation Results</h2>
          </div>
          <button
            onClick={() => exportPdf(result)}
            className="flex items-center gap-1.5 px-4 py-2 rounded bg-accent-amber/10 border border-accent-amber/30 text-accent-amber text-xs font-mono hover:bg-accent-amber/20 transition-colors"
          >
            <Download size={12} /> Export PDF
          </button>
        </div>

        <div className="bg-accent-amber/5 border border-accent-amber/20 rounded-lg p-3 mb-4">
          <p className="font-mono text-[10px] text-accent-amber">
            DISCLAIMER: These results are simulated projections based on real DECRS manufacturer data and openFDA records.
            They represent modeled scenarios and do not predict actual events. Confidence intervals reflect model uncertainty.
          </p>
        </div>

        <div id="simulation-results-content">
          {/* KPI Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="bg-terminal-bg border border-terminal-border rounded-lg p-3 text-center">
              <Pill size={16} className="text-accent-red mx-auto mb-1" />
              <p className="font-mono text-xl font-bold text-accent-red">{result.totalDrugsAffected}</p>
              <p className="font-mono text-[10px] text-muted">Drugs Affected</p>
            </div>
            <div className="bg-terminal-bg border border-terminal-border rounded-lg p-3 text-center">
              <Factory size={16} className="text-accent-amber mx-auto mb-1" />
              <p className="font-mono text-xl font-bold text-accent-amber">{result.totalFacilitiesAffected}</p>
              <p className="font-mono text-[10px] text-muted">Facilities Affected</p>
            </div>
            <div className="bg-terminal-bg border border-terminal-border rounded-lg p-3 text-center">
              <MapPin size={16} className="text-accent-purple mx-auto mb-1" />
              <p className="font-mono text-xl font-bold text-accent-purple">{result.affectedRegions.length}</p>
              <p className="font-mono text-[10px] text-muted">Regions Impacted</p>
            </div>
            <div className="bg-terminal-bg border border-terminal-border rounded-lg p-3 text-center">
              <Clock size={16} className="text-accent-blue mx-auto mb-1" />
              <p className="font-mono text-sm font-bold text-accent-blue">{result.estimatedRecoveryTimeline}</p>
              <p className="font-mono text-[10px] text-muted">Est. Recovery</p>
            </div>
          </div>

          {/* Scenario Details */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-mono text-xs font-bold text-primary uppercase">Scenario: {scenarioLabel}</h3>
              <SeverityBadge level={result.overallSeverity} />
            </div>
            <p className="font-mono text-[10px] text-muted">
              Timestamp: {new Date(result.timestamp).toLocaleString()} | ID: {result.id}
            </p>
          </div>

          {/* Affected Regions */}
          {result.affectedRegions.length > 0 && (
            <div className="mb-6">
              <h3 className="font-mono text-xs font-bold text-primary uppercase mb-3">Affected Regions</h3>
              <AffectedRegionsGrid regions={result.affectedRegions} />
            </div>
          )}

          {/* Affected Drugs Table */}
          <div className="mb-6">
            <h3 className="font-mono text-xs font-bold text-primary uppercase mb-3">
              Affected Drugs ({result.affectedDrugs.length})
            </h3>
            <AffectedDrugsTable drugs={result.affectedDrugs} />
          </div>

          {/* Recommendations */}
          <div className="mb-6">
            <h3 className="font-mono text-xs font-bold text-primary uppercase mb-3">Recommended Procurement Actions</h3>
            <div className="space-y-2">
              {result.recommendations.map((rec, i) => (
                <div key={i} className="flex items-start gap-2 bg-terminal-bg border border-terminal-border rounded-lg p-3">
                  <span className="font-mono text-[10px] text-accent-green font-bold shrink-0">{i + 1}.</span>
                  <p className="font-mono text-xs text-primary">{rec}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* AI Summary */}
        <AiSummarySection />
      </div>
    </div>
  );
}

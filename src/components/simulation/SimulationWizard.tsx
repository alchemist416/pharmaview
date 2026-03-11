'use client';

import { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft, Loader2, AlertTriangle } from 'lucide-react';
import { useSimulation } from '@/lib/simulation/context';
import {
  SimulationType,
  SimulationParams,
  SIMULATION_TYPES,
  SHIPPING_ROUTES,
  COUNTRY_NAMES,
} from '@/lib/simulation/types';
import { Establishment } from '@/lib/types';

// ---------------------------------------------------------------------------
// Step 1: Choose simulation type
// ---------------------------------------------------------------------------

function StepChooseType({
  value,
  onChange,
}: {
  value: SimulationType | null;
  onChange: (t: SimulationType) => void;
}) {
  return (
    <div>
      <h3 className="font-mono text-sm font-bold text-primary mb-1">Select Disruption Scenario</h3>
      <p className="font-mono text-[10px] text-muted mb-4">Choose the type of supply chain disruption to simulate</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {SIMULATION_TYPES.map((st) => (
          <button
            key={st.id}
            onClick={() => onChange(st.id)}
            className={`text-left p-3 rounded-lg border transition-all ${
              value === st.id
                ? 'border-accent-amber bg-accent-amber/10 text-accent-amber'
                : 'border-terminal-border bg-terminal-bg text-primary hover:border-accent-amber/40'
            }`}
          >
            <p className="font-mono text-xs font-bold mb-1">{st.label}</p>
            <p className="font-mono text-[10px] text-muted leading-relaxed">{st.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Configure parameters (dynamic per type)
// ---------------------------------------------------------------------------

const SEVERITY_OPTIONS = [
  { value: 'moderate', label: 'Moderate', desc: 'Partial disruption, some facilities remain operational' },
  { value: 'severe', label: 'Severe', desc: 'Major disruption, most facilities in region affected' },
  { value: 'catastrophic', label: 'Catastrophic', desc: 'Total shutdown of manufacturing in affected region' },
] as const;

const DISASTER_TYPES = [
  { value: 'earthquake', label: 'Earthquake' },
  { value: 'flood', label: 'Flood' },
  { value: 'typhoon', label: 'Typhoon / Hurricane' },
  { value: 'wildfire', label: 'Wildfire' },
  { value: 'pandemic-wave', label: 'Pandemic Wave' },
] as const;

const DURATION_OPTIONS = [
  { value: 'weeks', label: '2-4 Weeks', desc: 'Short-term disruption, rerouting possible' },
  { value: 'months', label: '1-3 Months', desc: 'Extended disruption requiring alternative routes' },
  { value: 'prolonged', label: '3+ Months', desc: 'Major blockage with no clear resolution timeline' },
] as const;

const POLICY_TYPES = [
  { value: 'export-ban', label: 'Export Ban' },
  { value: 'tariff-escalation', label: 'Tariff Escalation' },
  { value: 'sanctions', label: 'Sanctions' },
  { value: 'diplomatic-crisis', label: 'Diplomatic Crisis' },
] as const;

const MULTIPLIER_OPTIONS = [1.5, 2, 3, 5];

const REGULATORY_ACTIONS = [
  { value: 'warning-letter', label: 'Warning Letter' },
  { value: 'import-alert', label: 'Import Alert' },
  { value: 'consent-decree', label: 'Consent Decree' },
  { value: 'facility-shutdown', label: 'Facility Shutdown' },
] as const;

const SCOPE_OPTIONS = [
  { value: 'single-firm', label: 'Single Firm' },
  { value: 'multi-firm', label: 'Multiple Firms' },
  { value: 'country-wide', label: 'Country-wide' },
] as const;

const countryOptions = Object.entries(COUNTRY_NAMES).sort((a, b) => a[1].localeCompare(b[1]));

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block font-mono text-[10px] text-muted uppercase tracking-wider mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-terminal-bg border border-terminal-border rounded px-3 py-2 text-xs font-mono text-primary focus:outline-none focus:border-accent-amber/50"
      >
        <option value="">Select...</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function RadioGroup({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string; desc?: string }[];
}) {
  return (
    <div>
      <label className="block font-mono text-[10px] text-muted uppercase tracking-wider mb-2">{label}</label>
      <div className="space-y-2">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`w-full text-left p-2.5 rounded border transition-all ${
              value === o.value
                ? 'border-accent-amber bg-accent-amber/10'
                : 'border-terminal-border hover:border-accent-amber/30'
            }`}
          >
            <p className="font-mono text-xs text-primary">{o.label}</p>
            {o.desc && <p className="font-mono text-[10px] text-muted mt-0.5">{o.desc}</p>}
          </button>
        ))}
      </div>
    </div>
  );
}

function StepConfigureParams({
  simType,
  params,
  onChange,
  facilities,
}: {
  simType: SimulationType;
  params: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  facilities: Establishment[];
}) {
  switch (simType) {
    case 'natural-disaster':
      return (
        <div className="space-y-4">
          <h3 className="font-mono text-sm font-bold text-primary">Configure Natural Disaster</h3>
          <SelectField
            label="Affected Region"
            value={(params.region as string) || ''}
            onChange={(v) => onChange('region', v)}
            options={countryOptions.map(([code, name]) => ({ value: code, label: name }))}
          />
          <SelectField
            label="Disaster Type"
            value={(params.disasterType as string) || ''}
            onChange={(v) => onChange('disasterType', v)}
            options={[...DISASTER_TYPES]}
          />
          <RadioGroup
            label="Severity"
            value={(params.severity as string) || ''}
            onChange={(v) => onChange('severity', v)}
            options={SEVERITY_OPTIONS}
          />
        </div>
      );

    case 'shipping-disruption':
      return (
        <div className="space-y-4">
          <h3 className="font-mono text-sm font-bold text-primary">Configure Shipping Disruption</h3>
          <div>
            <label className="block font-mono text-[10px] text-muted uppercase tracking-wider mb-2">Shipping Route</label>
            <div className="space-y-2">
              {Object.entries(SHIPPING_ROUTES).map(([key, route]) => (
                <button
                  key={key}
                  onClick={() => onChange('route', key)}
                  className={`w-full text-left p-2.5 rounded border transition-all ${
                    params.route === key
                      ? 'border-accent-amber bg-accent-amber/10'
                      : 'border-terminal-border hover:border-accent-amber/30'
                  }`}
                >
                  <p className="font-mono text-xs text-primary">{route.label}</p>
                  <p className="font-mono text-[10px] text-muted mt-0.5">{route.description}</p>
                </button>
              ))}
            </div>
          </div>
          <RadioGroup
            label="Duration"
            value={(params.duration as string) || ''}
            onChange={(v) => onChange('duration', v)}
            options={DURATION_OPTIONS}
          />
        </div>
      );

    case 'facility-failure': {
      const uniqueFacilities = Array.from(new Map(facilities.map((f) => [f.firm_name, f])).values())
        .sort((a, b) => a.firm_name.localeCompare(b.firm_name));
      return (
        <div className="space-y-4">
          <h3 className="font-mono text-sm font-bold text-primary">Configure Facility Failure</h3>
          <div>
            <label className="block font-mono text-[10px] text-muted uppercase tracking-wider mb-1">Select Facility (from DECRS)</label>
            <select
              value={(params.facilityName as string) || ''}
              onChange={(e) => {
                const fac = uniqueFacilities.find((f) => f.firm_name === e.target.value);
                onChange('facilityName', e.target.value);
                if (fac) onChange('facilityCountry', fac.country_code);
              }}
              className="w-full bg-terminal-bg border border-terminal-border rounded px-3 py-2 text-xs font-mono text-primary focus:outline-none focus:border-accent-amber/50"
            >
              <option value="">Select manufacturer...</option>
              {uniqueFacilities.map((f) => (
                <option key={f.firm_name} value={f.firm_name}>
                  {f.firm_name} ({COUNTRY_NAMES[f.country_code] || f.country_code})
                </option>
              ))}
            </select>
          </div>
          <SelectField
            label="Failure Cause"
            value={(params.cause as string) || ''}
            onChange={(v) => onChange('cause', v)}
            options={[
              { value: 'compliance', label: 'FDA Compliance Issue' },
              { value: 'fire', label: 'Fire / Physical Damage' },
              { value: 'equipment', label: 'Equipment Failure' },
              { value: 'contamination', label: 'Product Contamination' },
            ]}
          />
        </div>
      );
    }

    case 'geopolitical-shock':
      return (
        <div className="space-y-4">
          <h3 className="font-mono text-sm font-bold text-primary">Configure Geopolitical Shock</h3>
          <SelectField
            label="Target Country"
            value={(params.country as string) || ''}
            onChange={(v) => onChange('country', v)}
            options={countryOptions.map(([code, name]) => ({ value: code, label: name }))}
          />
          <RadioGroup
            label="Policy Type"
            value={(params.policyType as string) || ''}
            onChange={(v) => onChange('policyType', v)}
            options={[...POLICY_TYPES]}
          />
        </div>
      );

    case 'demand-surge':
      return (
        <div className="space-y-4">
          <h3 className="font-mono text-sm font-bold text-primary">Configure Demand Surge</h3>
          <RadioGroup
            label="Target Type"
            value={(params.targetType as string) || 'drug'}
            onChange={(v) => onChange('targetType', v)}
            options={[
              { value: 'drug', label: 'Specific Drug' },
              { value: 'category', label: 'Therapeutic Category' },
            ]}
          />
          <div>
            <label className="block font-mono text-[10px] text-muted uppercase tracking-wider mb-1">
              {(params.targetType as string) === 'category' ? 'Category Name' : 'Drug Name'}
            </label>
            <input
              type="text"
              value={(params.target as string) || ''}
              onChange={(e) => onChange('target', e.target.value)}
              placeholder={(params.targetType as string) === 'category' ? 'e.g. Antibiotic, Oncology' : 'e.g. amoxicillin, heparin'}
              className="w-full bg-terminal-bg border border-terminal-border rounded px-3 py-2 text-xs font-mono text-primary placeholder:text-muted focus:outline-none focus:border-accent-amber/50"
            />
          </div>
          <div>
            <label className="block font-mono text-[10px] text-muted uppercase tracking-wider mb-2">Demand Multiplier</label>
            <div className="flex gap-2">
              {MULTIPLIER_OPTIONS.map((m) => (
                <button
                  key={m}
                  onClick={() => onChange('multiplier', m)}
                  className={`flex-1 py-2 rounded border font-mono text-xs font-bold transition-all ${
                    params.multiplier === m
                      ? 'border-accent-amber bg-accent-amber/10 text-accent-amber'
                      : 'border-terminal-border text-muted hover:border-accent-amber/30'
                  }`}
                >
                  {m}x
                </button>
              ))}
            </div>
          </div>
        </div>
      );

    case 'regulatory-cascade':
      return (
        <div className="space-y-4">
          <h3 className="font-mono text-sm font-bold text-primary">Configure Regulatory Cascade</h3>
          <RadioGroup
            label="Enforcement Action"
            value={(params.action as string) || ''}
            onChange={(v) => onChange('action', v)}
            options={[...REGULATORY_ACTIONS]}
          />
          <RadioGroup
            label="Scope"
            value={(params.scope as string) || ''}
            onChange={(v) => onChange('scope', v)}
            options={[...SCOPE_OPTIONS]}
          />
          {(params.scope === 'single-firm' || params.scope === 'multi-firm') && (
            <div>
              <label className="block font-mono text-[10px] text-muted uppercase tracking-wider mb-1">Target Firm</label>
              <input
                type="text"
                value={(params.targetFirm as string) || ''}
                onChange={(e) => onChange('targetFirm', e.target.value)}
                placeholder="e.g. Teva, Sun Pharma"
                className="w-full bg-terminal-bg border border-terminal-border rounded px-3 py-2 text-xs font-mono text-primary placeholder:text-muted focus:outline-none focus:border-accent-amber/50"
              />
            </div>
          )}
          {params.scope === 'country-wide' && (
            <SelectField
              label="Target Country"
              value={(params.targetCountry as string) || ''}
              onChange={(v) => onChange('targetCountry', v)}
              options={countryOptions.map(([code, name]) => ({ value: code, label: name }))}
            />
          )}
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Step 3: Review and run
// ---------------------------------------------------------------------------

function StepReview({ params, simType }: { params: Record<string, unknown>; simType: SimulationType }) {
  const typeInfo = SIMULATION_TYPES.find((t) => t.id === simType);
  return (
    <div>
      <h3 className="font-mono text-sm font-bold text-primary mb-1">Review Simulation</h3>
      <p className="font-mono text-[10px] text-muted mb-4">Confirm parameters before running the simulation</p>

      <div className="bg-terminal-bg border border-terminal-border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2 pb-3 border-b border-terminal-border">
          <AlertTriangle size={14} className="text-accent-amber" />
          <span className="font-mono text-xs text-accent-amber font-bold">SIMULATION — PROJECTIONS ONLY</span>
        </div>

        <div>
          <span className="font-mono text-[10px] text-muted uppercase">Scenario</span>
          <p className="font-mono text-xs text-primary">{typeInfo?.label}</p>
        </div>

        {Object.entries(params)
          .filter(([key]) => key !== 'type')
          .map(([key, value]) => (
            <div key={key}>
              <span className="font-mono text-[10px] text-muted uppercase">{key.replace(/([A-Z])/g, ' $1')}</span>
              <p className="font-mono text-xs text-primary">
                {key === 'region' || key === 'country' || key === 'targetCountry' || key === 'facilityCountry'
                  ? COUNTRY_NAMES[value as string] || (value as string)
                  : key === 'route'
                  ? SHIPPING_ROUTES[value as string]?.label || (value as string)
                  : key === 'multiplier'
                  ? `${value}x`
                  : String(value).replace(/-/g, ' ')}
              </p>
            </div>
          ))}
      </div>

      <div className="mt-4 p-3 bg-accent-amber/5 border border-accent-amber/20 rounded-lg">
        <p className="font-mono text-[10px] text-accent-amber">
          Results are simulated projections based on real DECRS manufacturer data and openFDA records.
          They do not represent actual events or guaranteed outcomes.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Wizard
// ---------------------------------------------------------------------------

export default function SimulationWizard() {
  const { wizardOpen, closeWizard, execute, isRunning } = useSimulation();
  const [step, setStep] = useState(0);
  const [simType, setSimType] = useState<SimulationType | null>(null);
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [facilities, setFacilities] = useState<Establishment[]>([]);

  useEffect(() => {
    if (wizardOpen) {
      fetch('/api/map-data')
        .then((r) => r.json())
        .then((data) => {
          const all = (data.countries ?? []).flatMap((c: { establishments: Establishment[] }) => c.establishments);
          setFacilities(all);
        })
        .catch(() => {});
    }
  }, [wizardOpen]);

  useEffect(() => {
    if (!wizardOpen) {
      setStep(0);
      setSimType(null);
      setParams({});
    }
  }, [wizardOpen]);

  if (!wizardOpen) return null;

  const handleParamChange = (key: string, value: unknown) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  const canProceed = () => {
    if (step === 0) return simType !== null;
    if (step === 1) {
      switch (simType) {
        case 'natural-disaster': return params.region && params.disasterType && params.severity;
        case 'shipping-disruption': return params.route && params.duration;
        case 'facility-failure': return params.facilityName && params.cause;
        case 'geopolitical-shock': return params.country && params.policyType;
        case 'demand-surge': return params.target && params.multiplier;
        case 'regulatory-cascade': return params.action && params.scope;
        default: return false;
      }
    }
    return true;
  };

  const handleRun = () => {
    if (!simType) return;
    const fullParams = { type: simType, ...params } as SimulationParams;
    execute(fullParams);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-terminal-panel border border-accent-amber/30 rounded-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl shadow-accent-amber/5">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-terminal-border">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-accent-amber animate-pulse" />
            <h2 className="font-mono text-sm font-bold text-accent-amber">SIMULATION WIZARD</h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex gap-1">
              {[0, 1, 2].map((s) => (
                <div
                  key={s}
                  className={`h-1.5 w-8 rounded-full transition-colors ${
                    s <= step ? 'bg-accent-amber' : 'bg-terminal-border'
                  }`}
                />
              ))}
            </div>
            <button onClick={closeWizard} className="text-muted hover:text-primary transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-5 py-5">
          {step === 0 && <StepChooseType value={simType} onChange={setSimType} />}
          {step === 1 && simType && (
            <StepConfigureParams
              simType={simType}
              params={params}
              onChange={handleParamChange}
              facilities={facilities}
            />
          )}
          {step === 2 && simType && <StepReview params={{ ...params, type: simType }} simType={simType} />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-terminal-border">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded text-xs font-mono text-muted hover:text-primary transition-colors disabled:opacity-30"
          >
            <ChevronLeft size={14} /> Back
          </button>
          {step < 2 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canProceed()}
              className="flex items-center gap-1.5 px-5 py-2 rounded bg-accent-amber/10 border border-accent-amber/30 text-accent-amber text-xs font-mono font-bold hover:bg-accent-amber/20 transition-colors disabled:opacity-30"
            >
              Next <ChevronRight size={14} />
            </button>
          ) : (
            <button
              onClick={handleRun}
              disabled={isRunning}
              className="flex items-center gap-2 px-6 py-2 rounded bg-accent-amber text-terminal-bg text-xs font-mono font-bold hover:bg-accent-amber/90 transition-colors disabled:opacity-50"
            >
              {isRunning ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Running...
                </>
              ) : (
                'Run Simulation'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

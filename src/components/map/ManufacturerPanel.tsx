'use client';

import { X, Building2, MapPin, ArrowUpRight, ArrowDownRight, Ship } from 'lucide-react';
import { CountryMapData, TradeFlow } from '@/lib/types';

function formatUSD(val: number): string {
  if (val >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(0)}M`;
  if (val >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}

interface ManufacturerPanelProps {
  country: CountryMapData;
  onClose: () => void;
  tradeFlows?: TradeFlow[];
}

export default function ManufacturerPanel({ country, onClose, tradeFlows = [] }: ManufacturerPanelProps) {
  const manufacturers = country.establishments.filter((e) => e.type === 'manufacturer');
  const apiMakers = country.establishments.filter((e) => e.type === 'api');
  const repackagers = country.establishments.filter((e) => e.type === 'repackager');

  // Filter trade flows for this country
  const countryFlows = tradeFlows.filter(
    (f) => f.reporter === country.country_code || f.partner === country.country_code
  );

  const totalImports = countryFlows
    .filter((f) => f.reporter === country.country_code)
    .reduce((sum, f) => sum + f.import_value_usd, 0);
  const totalExports = countryFlows
    .filter((f) => f.reporter === country.country_code)
    .reduce((sum, f) => sum + f.export_value_usd, 0);

  return (
    <div className="absolute top-0 right-0 h-full w-80 bg-terminal-panel border-l border-terminal-border overflow-y-auto z-40 shadow-2xl">
      <div className="flex items-center justify-between p-4 border-b border-terminal-border sticky top-0 bg-terminal-panel">
        <div>
          <h3 className="font-mono text-sm font-bold text-primary">{country.country}</h3>
          <p className="font-mono text-[10px] text-muted">
            {country.manufacturer_count} registered establishments
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-muted hover:text-primary transition-colors p-1"
        >
          <X size={16} />
        </button>
      </div>

      {/* Trade Flow Summary */}
      {countryFlows.length > 0 && (
        <div className="p-4 border-b border-terminal-border">
          <h4 className="font-mono text-[10px] text-accent-blue uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Ship size={10} /> Pharma Trade Flows
          </h4>
          {/* Totals */}
          {(totalImports > 0 || totalExports > 0) && (
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="p-2 rounded bg-terminal-bg text-center">
                <p className="font-mono text-xs font-bold text-accent-red">{formatUSD(totalImports)}</p>
                <p className="font-mono text-[9px] text-muted">Imports</p>
              </div>
              <div className="p-2 rounded bg-terminal-bg text-center">
                <p className="font-mono text-xs font-bold text-accent-green">{formatUSD(totalExports)}</p>
                <p className="font-mono text-[9px] text-muted">Exports</p>
              </div>
            </div>
          )}
          {/* Individual flows */}
          <div className="space-y-1.5">
            {countryFlows.slice(0, 6).map((f, i) => {
              const isReporter = f.reporter === country.country_code;
              const partnerName = isReporter ? f.partner_name : f.reporter_name;
              return (
                <div key={i} className="flex items-center gap-2 p-1.5 rounded bg-terminal-bg text-[9px] font-mono">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      {f.net_flow < 0 ? (
                        <ArrowDownRight size={8} className="text-accent-red shrink-0" />
                      ) : (
                        <ArrowUpRight size={8} className="text-accent-green shrink-0" />
                      )}
                      <span className="text-primary truncate">{partnerName}</span>
                    </div>
                    <span className="text-muted/60 truncate">{f.commodity}</span>
                  </div>
                  <span
                    className={`shrink-0 font-bold ${
                      isReporter && f.net_flow < 0 ? 'text-accent-red' : 'text-accent-green'
                    }`}
                  >
                    {formatUSD(isReporter ? f.import_value_usd : f.export_value_usd)}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="font-mono text-[8px] text-muted/50 mt-2">Source: UN Comtrade 2024</p>
        </div>
      )}

      {manufacturers.length > 0 && (
        <div className="p-4 border-b border-terminal-border">
          <h4 className="font-mono text-[10px] text-accent-green uppercase tracking-wider mb-3">
            Manufacturers ({manufacturers.length})
          </h4>
          <div className="space-y-2">
            {manufacturers.map((est) => (
              <div
                key={est.registration_number}
                className="flex items-start gap-2 p-2 rounded bg-terminal-bg"
              >
                <Building2 size={12} className="text-muted mt-0.5 shrink-0" />
                <div>
                  <p className="font-mono text-xs text-primary">{est.firm_name}</p>
                  <p className="font-mono text-[10px] text-muted flex items-center gap-1">
                    <MapPin size={8} /> {est.city}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {apiMakers.length > 0 && (
        <div className="p-4 border-b border-terminal-border">
          <h4 className="font-mono text-[10px] text-accent-purple uppercase tracking-wider mb-3">
            API Manufacturers ({apiMakers.length})
          </h4>
          <div className="space-y-2">
            {apiMakers.map((est) => (
              <div
                key={est.registration_number}
                className="flex items-start gap-2 p-2 rounded bg-terminal-bg"
              >
                <Building2 size={12} className="text-muted mt-0.5 shrink-0" />
                <div>
                  <p className="font-mono text-xs text-primary">{est.firm_name}</p>
                  <p className="font-mono text-[10px] text-muted flex items-center gap-1">
                    <MapPin size={8} /> {est.city}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {repackagers.length > 0 && (
        <div className="p-4">
          <h4 className="font-mono text-[10px] text-accent-amber uppercase tracking-wider mb-3">
            Repackagers ({repackagers.length})
          </h4>
          <div className="space-y-2">
            {repackagers.map((est) => (
              <div
                key={est.registration_number}
                className="flex items-start gap-2 p-2 rounded bg-terminal-bg"
              >
                <Building2 size={12} className="text-muted mt-0.5 shrink-0" />
                <div>
                  <p className="font-mono text-xs text-primary">{est.firm_name}</p>
                  <p className="font-mono text-[10px] text-muted flex items-center gap-1">
                    <MapPin size={8} /> {est.city}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

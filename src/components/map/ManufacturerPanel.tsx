'use client';

import { X, Building2, MapPin } from 'lucide-react';
import { CountryMapData } from '@/lib/types';

interface ManufacturerPanelProps {
  country: CountryMapData;
  onClose: () => void;
}

export default function ManufacturerPanel({ country, onClose }: ManufacturerPanelProps) {
  const manufacturers = country.establishments.filter((e) => e.type === 'manufacturer');
  const apiMakers = country.establishments.filter((e) => e.type === 'api');
  const repackagers = country.establishments.filter((e) => e.type === 'repackager');

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

'use client';

import { useState, memo, useMemo } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from 'react-simple-maps';
import { CountryMapData } from '@/lib/types';
import { getCountryColor } from '@/lib/utils';
import { getAlpha3 } from '@/lib/mapData';
import ManufacturerPanel from './ManufacturerPanel';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

interface WorldMapProps {
  countryData: CountryMapData[];
  showType?: 'manufacturer' | 'api' | 'all';
}

function WorldMap({ countryData, showType = 'all' }: WorldMapProps) {
  const [tooltip, setTooltip] = useState<{ name: string; count: number; x: number; y: number } | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<CountryMapData | null>(null);

  // Filter establishments by type, then rebuild country data
  const filteredData = useMemo(() => {
    if (showType === 'all') return countryData;
    return countryData
      .map((c) => {
        const filtered = c.establishments.filter((e) =>
          showType === 'manufacturer' ? e.type === 'manufacturer' : e.type === 'api'
        );
        return {
          ...c,
          establishments: filtered,
          manufacturer_count: filtered.length,
        };
      })
      .filter((c) => c.manufacturer_count > 0);
  }, [countryData, showType]);

  // Build a map from ISO Alpha-3 to country data
  const countryLookup = new Map<string, CountryMapData>();
  for (const c of filteredData) {
    const alpha3 = getAlpha3(c.country_code);
    countryLookup.set(alpha3, c);
  }

  const handleMouseLeave = () => {
    setTooltip(null);
  };

  return (
    <div className="relative w-full h-full min-h-[400px]">
      <ComposableMap
        projectionConfig={{ scale: 147, center: [0, 20] }}
        className="w-full h-full"
        style={{ backgroundColor: 'transparent' }}
      >
        <ZoomableGroup>
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const alpha3 = geo.properties?.['Alpha-3'] || geo.id || '';
                const data = countryLookup.get(alpha3);
                const count = data?.manufacturer_count || 0;
                const fillColor = count > 0 ? getCountryColor(count) : '#0f1629';

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={fillColor}
                    stroke="#1e2d4a"
                    strokeWidth={0.5}
                    style={{
                      default: { outline: 'none' },
                      hover: {
                        fill: count > 0 ? '#3b82f6' : '#1e2d4a',
                        outline: 'none',
                        cursor: count > 0 ? 'pointer' : 'default',
                      },
                      pressed: { outline: 'none' },
                    }}
                    onMouseEnter={(evt) => {
                      setTooltip({
                        name: geo.properties?.name || 'Unknown',
                        count,
                        x: evt.clientX,
                        y: evt.clientY,
                      });
                    }}
                    onMouseMove={(evt) => {
                      if (tooltip) {
                        setTooltip((prev) =>
                          prev ? { ...prev, x: evt.clientX, y: evt.clientY } : null
                        );
                      }
                    }}
                    onMouseLeave={handleMouseLeave}
                    onClick={() => {
                      if (data) setSelectedCountry(data);
                    }}
                  />
                );
              })
            }
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none bg-terminal-panel border border-terminal-border rounded px-3 py-2 shadow-lg"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
        >
          <p className="font-mono text-xs text-primary font-semibold">{tooltip.name}</p>
          {tooltip.count > 0 && (
            <p className="font-mono text-[10px] text-muted">
              {tooltip.count} registered manufacturer{tooltip.count !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-terminal-panel/90 border border-terminal-border rounded p-3">
        <p className="font-mono text-[10px] text-muted mb-2 uppercase">Manufacturers</p>
        <div className="flex flex-col gap-1">
          {[
            { color: '#1e3a5f', label: '1-10' },
            { color: '#1d4ed8', label: '11-50' },
            { color: '#7c3aed', label: '51-200' },
            { color: '#dc2626', label: '200+' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
              <span className="font-mono text-[10px] text-muted">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Manufacturer Panel */}
      {selectedCountry && (
        <ManufacturerPanel
          country={selectedCountry}
          onClose={() => setSelectedCountry(null)}
        />
      )}
    </div>
  );
}

export default memo(WorldMap);

'use client';

import { useState, memo, useMemo } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from 'react-simple-maps';
import { CountryMapData, TradeFlow } from '@/lib/types';
import { getCountryColor } from '@/lib/utils';
import { getAlpha3 } from '@/lib/mapData';
import ManufacturerPanel from './ManufacturerPanel';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

// ISO 3166-1 numeric → Alpha-2 mapping
// world-atlas@2 uses numeric codes as geo.id
const numericToAlpha2: Record<string, string> = {
  '004': 'AF', '008': 'AL', '012': 'DZ', '020': 'AD', '024': 'AO',
  '028': 'AG', '032': 'AR', '051': 'AM', '036': 'AU', '040': 'AT',
  '031': 'AZ', '044': 'BS', '048': 'BH', '050': 'BD', '052': 'BB',
  '112': 'BY', '056': 'BE', '084': 'BZ', '204': 'BJ', '064': 'BT',
  '068': 'BO', '070': 'BA', '072': 'BW', '076': 'BR', '096': 'BN',
  '100': 'BG', '854': 'BF', '108': 'BI', '116': 'KH', '120': 'CM',
  '124': 'CA', '132': 'CV', '140': 'CF', '148': 'TD', '152': 'CL',
  '156': 'CN', '170': 'CO', '174': 'KM', '178': 'CG', '180': 'CD',
  '188': 'CR', '384': 'CI', '191': 'HR', '192': 'CU', '196': 'CY',
  '203': 'CZ', '208': 'DK', '262': 'DJ', '212': 'DM', '214': 'DO',
  '218': 'EC', '818': 'EG', '222': 'SV', '226': 'GQ', '232': 'ER',
  '233': 'EE', '748': 'SZ', '231': 'ET', '242': 'FJ', '246': 'FI',
  '250': 'FR', '266': 'GA', '270': 'GM', '268': 'GE', '276': 'DE',
  '288': 'GH', '300': 'GR', '308': 'GD', '320': 'GT', '324': 'GN',
  '624': 'GW', '328': 'GY', '332': 'HT', '340': 'HN', '348': 'HU',
  '352': 'IS', '356': 'IN', '360': 'ID', '364': 'IR', '368': 'IQ',
  '372': 'IE', '376': 'IL', '380': 'IT', '388': 'JM', '392': 'JP',
  '400': 'JO', '398': 'KZ', '404': 'KE', '296': 'KI', '408': 'KP',
  '410': 'KR', '414': 'KW', '417': 'KG', '418': 'LA', '428': 'LV',
  '422': 'LB', '426': 'LS', '430': 'LR', '434': 'LY', '438': 'LI',
  '440': 'LT', '442': 'LU', '450': 'MG', '454': 'MW', '458': 'MY',
  '462': 'MV', '466': 'ML', '470': 'MT', '584': 'MH', '478': 'MR',
  '480': 'MU', '484': 'MX', '583': 'FM', '498': 'MD', '492': 'MC',
  '496': 'MN', '499': 'ME', '504': 'MA', '508': 'MZ', '104': 'MM',
  '516': 'NA', '520': 'NR', '524': 'NP', '528': 'NL', '554': 'NZ',
  '558': 'NI', '562': 'NE', '566': 'NG', '807': 'MK', '578': 'NO',
  '512': 'OM', '586': 'PK', '585': 'PW', '591': 'PA', '598': 'PG',
  '600': 'PY', '604': 'PE', '608': 'PH', '616': 'PL', '620': 'PT',
  '630': 'PR', '634': 'QA', '642': 'RO', '643': 'RU', '646': 'RW',
  '659': 'KN', '662': 'LC', '670': 'VC', '882': 'WS', '674': 'SM',
  '678': 'ST', '682': 'SA', '686': 'SN', '688': 'RS', '690': 'SC',
  '694': 'SL', '702': 'SG', '703': 'SK', '705': 'SI', '090': 'SB',
  '706': 'SO', '710': 'ZA', '728': 'SS', '724': 'ES', '144': 'LK',
  '736': 'SD', '740': 'SR', '752': 'SE', '756': 'CH', '760': 'SY',
  '158': 'TW', '762': 'TJ', '834': 'TZ', '764': 'TH', '626': 'TL',
  '768': 'TG', '776': 'TO', '780': 'TT', '788': 'TN', '792': 'TR',
  '795': 'TM', '798': 'TV', '800': 'UG', '804': 'UA', '784': 'AE',
  '826': 'GB', '840': 'US', '858': 'UY', '860': 'UZ', '548': 'VU',
  '862': 'VE', '704': 'VN', '887': 'YE', '894': 'ZM', '716': 'ZW',
  // Special cases
  '-99': 'XK', // Kosovo
  '275': 'PS', // Palestine
  '732': 'EH', // Western Sahara
};

interface WorldMapProps {
  countryData: CountryMapData[];
  showType?: 'manufacturer' | 'api' | 'all';
  tradeFlows?: TradeFlow[];
}

function WorldMap({ countryData, showType = 'all', tradeFlows = [] }: WorldMapProps) {
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

  // Build lookup from ISO Alpha-3 to country data
  const countryLookup = useMemo(() => {
    const lookup = new Map<string, CountryMapData>();
    for (const c of filteredData) {
      const alpha3 = getAlpha3(c.country_code);
      lookup.set(alpha3, c);
    }
    return lookup;
  }, [filteredData]);

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
                // world-atlas@2 uses ISO numeric as geo.id
                const numericId = String(geo.id);
                const alpha2 = numericToAlpha2[numericId] || '';
                const alpha3 = alpha2 ? getAlpha3(alpha2) : '';
                const data = alpha3 ? countryLookup.get(alpha3) : undefined;
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
          tradeFlows={tradeFlows}
        />
      )}
    </div>
  );
}

export default memo(WorldMap);

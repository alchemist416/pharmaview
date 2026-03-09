'use client';

import { useEffect, useState } from 'react';
import PanelCard from '@/components/layout/PanelCard';
import WorldMap from '@/components/map/WorldMap';
import { CountryMapData } from '@/lib/types';

export default function MapPage() {
  const [countryData, setCountryData] = useState<CountryMapData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showType, setShowType] = useState<'all' | 'manufacturer' | 'api'>('all');
  const [error, setError] = useState('');
  const [totalEstablishments, setTotalEstablishments] = useState(0);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/map-data');
        if (res.ok) {
          const data = await res.json();
          setCountryData(data.countries || []);
          setTotalEstablishments(data.total_establishments || 0);
        } else {
          setError('FDA NDC API returned an error. Map data unavailable.');
        }
      } catch (err) {
        console.error('Failed to fetch map data:', err);
        setError('Failed to connect to FDA API.');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-lg font-bold text-primary uppercase tracking-wider">
            Supply Chain Map
          </h1>
          {totalEstablishments > 0 && (
            <p className="font-mono text-[10px] text-muted">
              {totalEstablishments} manufacturers from openFDA NDC Directory
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {[
            { key: 'all', label: 'All Types' },
            { key: 'manufacturer', label: 'Finished Drug' },
            { key: 'api', label: 'API Manufacturers' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setShowType(key as 'all' | 'manufacturer' | 'api')}
              className={`px-3 py-1.5 rounded text-xs font-mono transition-colors ${
                showType === key
                  ? 'bg-accent-blue/20 text-accent-blue'
                  : 'text-muted hover:text-primary hover:bg-white/5'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-accent-red/10 border border-accent-red/30 rounded-lg">
          <p className="font-mono text-xs text-accent-red">{error}</p>
        </div>
      )}

      <PanelCard className="min-h-[calc(100vh-160px)]">
        {loading ? (
          <div className="skeleton w-full h-[600px]" />
        ) : (
          <WorldMap countryData={countryData} showType={showType} />
        )}
      </PanelCard>

      {/* Country ranking */}
      <div className="grid grid-cols-4 gap-4">
        {countryData.slice(0, 4).map((country) => (
          <PanelCard key={country.country_code} title={country.country}>
            <div className="flex items-center justify-between">
              <span className="font-mono text-3xl font-bold text-primary">
                {country.manufacturer_count}
              </span>
              <span className="font-mono text-[10px] text-muted uppercase">Establishments</span>
            </div>
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-[10px] font-mono">
                <span className="text-muted">Manufacturers</span>
                <span className="text-primary">
                  {country.establishments.filter((e) => e.type === 'manufacturer').length}
                </span>
              </div>
              <div className="flex justify-between text-[10px] font-mono">
                <span className="text-muted">API Makers</span>
                <span className="text-primary">
                  {country.establishments.filter((e) => e.type === 'api').length}
                </span>
              </div>
              <div className="flex justify-between text-[10px] font-mono">
                <span className="text-muted">Repackagers</span>
                <span className="text-primary">
                  {country.establishments.filter((e) => e.type === 'repackager').length}
                </span>
              </div>
            </div>
          </PanelCard>
        ))}
      </div>
    </div>
  );
}

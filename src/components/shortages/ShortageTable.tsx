'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, ArrowUpDown, MapPin, Bell } from 'lucide-react';
import RiskBadge from './RiskBadge';
import ShortageSparkline from '../charts/ShortageSparkline';
import { formatDate } from '@/lib/utils';

interface ShortageRecord {
  generic_name?: string;
  brand_name?: string;
  brand_name_search?: string;
  status?: string;
  initial_posting_date?: string;
  revision_date?: string;
  presentation?: string;
  [key: string]: unknown;
}

interface ShortageTableProps {
  shortages: ShortageRecord[];
}

function getStatus(s: ShortageRecord): string {
  const status = (s.status || '').toLowerCase();
  if (status.includes('current') || status.includes('active') || status.includes('ongoing')) return 'Active';
  if (status.includes('resolved')) return 'Resolved';
  if (status.includes('discontinued')) return 'Discontinued';
  return s.status || 'Unknown';
}

function getRisk(status: string): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (status === 'Active') return 'HIGH';
  if (status === 'Resolved') return 'LOW';
  return 'MEDIUM';
}

function statusColor(status: string): string {
  if (status === 'Active') return 'text-accent-red';
  if (status === 'Resolved') return 'text-accent-green';
  return 'text-accent-amber';
}

export default function ShortageTable({ shortages }: ShortageTableProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Active' | 'Resolved'>('all');
  const [sortField, setSortField] = useState<'name' | 'date' | 'status'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const filtered = useMemo(() => {
    let result = shortages.map((s) => ({
      ...s,
      _status: getStatus(s),
      _name: s.generic_name || s.brand_name || s.brand_name_search || 'Unknown',
      _date: s.initial_posting_date || s.revision_date || '',
    }));

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s._name.toLowerCase().includes(q) ||
          (s.brand_name || '').toLowerCase().includes(q)
      );
    }

    if (statusFilter !== 'all') {
      result = result.filter((s) => s._status === statusFilter);
    }

    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') cmp = a._name.localeCompare(b._name);
      else if (sortField === 'date') cmp = a._date.localeCompare(b._date);
      else cmp = a._status.localeCompare(b._status);
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [shortages, search, statusFilter, sortField, sortDir]);

  const toggleSort = (field: 'name' | 'date' | 'status') => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  return (
    <div>
      {/* Controls */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search drug name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-terminal-bg border border-terminal-border rounded pl-9 pr-3 py-2 text-xs font-mono text-primary placeholder:text-muted focus:outline-none focus:border-accent-blue"
          />
        </div>
        <div className="flex items-center gap-1">
          {(['all', 'Active', 'Resolved'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded text-xs font-mono transition-colors ${
                statusFilter === s
                  ? 'bg-accent-blue/20 text-accent-blue'
                  : 'text-muted hover:text-primary hover:bg-white/5'
              }`}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-terminal-border">
              <th
                className="text-left py-2 px-3 font-mono text-[10px] text-muted uppercase tracking-wider cursor-pointer hover:text-primary"
                onClick={() => toggleSort('name')}
              >
                <span className="flex items-center gap-1">
                  Drug Name <ArrowUpDown size={10} />
                </span>
              </th>
              <th
                className="text-left py-2 px-3 font-mono text-[10px] text-muted uppercase tracking-wider cursor-pointer hover:text-primary"
                onClick={() => toggleSort('status')}
              >
                <span className="flex items-center gap-1">
                  Status <ArrowUpDown size={10} />
                </span>
              </th>
              <th
                className="text-left py-2 px-3 font-mono text-[10px] text-muted uppercase tracking-wider cursor-pointer hover:text-primary"
                onClick={() => toggleSort('date')}
              >
                <span className="flex items-center gap-1">
                  Date <ArrowUpDown size={10} />
                </span>
              </th>
              <th className="text-left py-2 px-3 font-mono text-[10px] text-muted uppercase tracking-wider">
                Risk
              </th>
              <th className="text-left py-2 px-3 font-mono text-[10px] text-muted uppercase tracking-wider">
                Trend
              </th>
              <th className="text-left py-2 px-3 font-mono text-[10px] text-muted uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-muted font-mono">
                  No shortages found
                </td>
              </tr>
            ) : (
              filtered.map((s, i) => (
                <tr
                  key={i}
                  className="border-b border-terminal-border/50 hover:bg-white/[0.02] transition-colors"
                >
                  <td className="py-2.5 px-3">
                    <p className="font-mono text-primary font-medium">{s._name}</p>
                    {s.brand_name && s.generic_name && (
                      <p className="font-mono text-[10px] text-muted">{s.brand_name}</p>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={`font-mono font-semibold ${statusColor(s._status)}`}>
                      {s._status}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-muted">
                    {s._date ? formatDate(s._date) : '—'}
                  </td>
                  <td className="py-2.5 px-3">
                    <RiskBadge risk={getRisk(s._status)} />
                  </td>
                  <td className="py-2.5 px-3">
                    <ShortageSparkline isActive={s._status === 'Active'} />
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/drug/${encodeURIComponent(s._name)}`}
                        className="flex items-center gap-1 text-[10px] font-mono text-accent-blue hover:text-accent-blue/80 transition-colors"
                      >
                        <MapPin size={10} /> Map
                      </Link>
                      <button
                        onClick={() => alert(`Alert set for ${s._name}`)}
                        className="flex items-center gap-1 text-[10px] font-mono text-accent-amber hover:text-accent-amber/80 transition-colors"
                      >
                        <Bell size={10} /> Alert
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

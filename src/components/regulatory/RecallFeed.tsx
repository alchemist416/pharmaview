'use client';

import { useState, useMemo } from 'react';
import { Recall } from '@/lib/types';
import RecallCard from './RecallCard';

interface RecallFeedProps {
  recalls: Recall[];
}

export default function RecallFeed({ recalls }: RecallFeedProps) {
  const [classFilter, setClassFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    if (classFilter === 'all') return recalls;
    return recalls.filter((r) => r.classification === classFilter);
  }, [recalls, classFilter]);

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-1 mb-4">
        {['all', 'Class I', 'Class II', 'Class III'].map((c) => (
          <button
            key={c}
            onClick={() => setClassFilter(c)}
            className={`px-3 py-1.5 rounded text-xs font-mono transition-colors ${
              classFilter === c
                ? 'bg-accent-blue/20 text-accent-blue'
                : 'text-muted hover:text-primary hover:bg-white/5'
            }`}
          >
            {c === 'all' ? 'All' : c}
          </button>
        ))}
      </div>

      {/* Feed */}
      <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <p className="text-center text-muted font-mono text-xs py-8">
            No recalls found
          </p>
        ) : (
          filtered.map((recall, i) => (
            <RecallCard key={recall.recall_number || i} recall={recall} />
          ))
        )}
      </div>
    </div>
  );
}

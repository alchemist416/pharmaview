import { formatDate } from '@/lib/utils';
import { Recall } from '@/lib/types';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

interface RecallCardProps {
  recall: Recall;
}

function classColor(classification: string): string {
  if (classification === 'Class I') return 'bg-accent-red/20 text-accent-red';
  if (classification === 'Class II') return 'bg-accent-amber/20 text-accent-amber';
  return 'bg-accent-blue/20 text-accent-blue';
}

export default function RecallCard({ recall }: RecallCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-terminal-bg border border-terminal-border/50 rounded-lg p-4 hover:border-terminal-border transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase tracking-wider ${classColor(recall.classification)}`}>
              RECALL
            </span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-[10px] font-bold tracking-wider ${classColor(recall.classification)}`}>
              {recall.classification}
            </span>
          </div>
          <p className="font-mono text-xs text-primary font-semibold mb-1 truncate">
            {recall.recalling_firm}
          </p>
          <p className="text-[11px] text-muted line-clamp-2">
            {recall.product_description}
          </p>
          <p className="font-mono text-[10px] text-muted mt-2">
            {formatDate(recall.report_date)}
            {recall.city && ` | ${recall.city}, ${recall.state || recall.country}`}
          </p>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-muted hover:text-primary transition-colors shrink-0"
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-terminal-border/50">
          <p className="text-xs text-muted mb-2">
            <span className="text-primary font-semibold">Reason: </span>
            {recall.reason_for_recall}
          </p>
          <p className="text-xs text-muted">
            <span className="text-primary font-semibold">Status: </span>
            {recall.status}
          </p>
          {recall.voluntary_mandated && (
            <p className="text-xs text-muted">
              <span className="text-primary font-semibold">Type: </span>
              {recall.voluntary_mandated}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

'use client';

import { Recall } from '@/lib/types';
import { formatDate } from '@/lib/utils';

interface TickerTapeProps {
  recalls: Recall[];
}

function classColor(classification: string): string {
  if (classification.includes('I') && !classification.includes('II')) return 'text-accent-red';
  if (classification.includes('II') && !classification.includes('III')) return 'text-accent-amber';
  return 'text-accent-blue';
}

export default function TickerTape({ recalls }: TickerTapeProps) {
  if (!recalls.length) return null;

  const items = [...recalls, ...recalls]; // duplicate for seamless loop

  return (
    <div className="h-8 bg-terminal-bg border-b border-terminal-border overflow-hidden relative">
      <div className="animate-ticker flex items-center h-full whitespace-nowrap">
        {items.map((recall, i) => (
          <span key={`${recall.recall_number}-${i}`} className="inline-flex items-center gap-2 mx-6 text-xs">
            <span className={classColor(recall.classification)}>&#9888;</span>
            <span className="text-muted">RECALL</span>
            <span className="text-primary font-medium">{recall.product_description?.slice(0, 50)}</span>
            <span className="text-muted">|</span>
            <span className="text-primary">{recall.recalling_firm}</span>
            <span className="text-muted">|</span>
            <span className={classColor(recall.classification)}>{recall.classification}</span>
            <span className="text-muted">|</span>
            <span className="text-muted">{formatDate(recall.report_date)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

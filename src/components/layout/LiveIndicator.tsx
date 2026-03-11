'use client';

interface LiveIndicatorProps {
  isLive: boolean;
  lastUpdated?: string;
  source?: string;
}

export default function LiveIndicator({ isLive, lastUpdated, source }: LiveIndicatorProps) {
  const formattedTime = lastUpdated
    ? new Date(lastUpdated).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="flex items-center gap-2">
      {/* LIVE dot */}
      <div className="flex items-center gap-1">
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ${
            isLive
              ? 'bg-accent-green animate-pulse'
              : 'bg-muted'
          }`}
        />
        <span
          className={`font-mono text-[9px] font-bold uppercase tracking-wider ${
            isLive ? 'text-accent-green' : 'text-muted'
          }`}
        >
          {isLive ? 'LIVE' : 'STATIC'}
        </span>
      </div>

      {/* Last Updated */}
      {formattedTime && (
        <span className="font-mono text-[9px] text-muted/70">
          {formattedTime}
        </span>
      )}

      {/* Source tooltip */}
      {source && (
        <span className="font-mono text-[9px] text-muted/50 hidden lg:inline" title={source}>
          · {source.length > 25 ? source.slice(0, 23) + '…' : source}
        </span>
      )}
    </div>
  );
}

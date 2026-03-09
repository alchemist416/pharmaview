'use client';

interface ShortageSparklineProps {
  isActive: boolean;
}

/**
 * Simple visual sparkline indicator for shortage status.
 * Shows a pulsing bar for active shortages, flat line for resolved.
 */
export default function ShortageSparkline({ isActive }: ShortageSparklineProps) {
  if (!isActive) {
    return (
      <div className="flex items-center gap-[2px] h-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="w-[3px] h-[3px] rounded-full bg-accent-green/40" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-end gap-[2px] h-4">
      {[3, 5, 8, 12, 10, 14, 11, 16].map((h, i) => (
        <div
          key={i}
          className="w-[3px] rounded-sm bg-accent-red/70"
          style={{ height: h }}
        />
      ))}
    </div>
  );
}

import { cn } from '@/lib/utils';

interface RiskBadgeProps {
  risk: 'HIGH' | 'MEDIUM' | 'LOW';
  className?: string;
}

export default function RiskBadge({ risk, className }: RiskBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase tracking-wider',
        risk === 'HIGH' && 'bg-accent-red/20 text-accent-red',
        risk === 'MEDIUM' && 'bg-accent-amber/20 text-accent-amber',
        risk === 'LOW' && 'bg-accent-green/20 text-accent-green',
        className
      )}
    >
      {risk}
    </span>
  );
}

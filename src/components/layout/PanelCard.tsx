import { cn } from '@/lib/utils';

interface PanelCardProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  headerRight?: React.ReactNode;
}

export default function PanelCard({ title, subtitle, children, className, headerRight }: PanelCardProps) {
  return (
    <div className={cn('bg-terminal-panel border border-terminal-border rounded-lg overflow-hidden', className)}>
      {title && (
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-terminal-border">
          <div>
            <h3 className="font-mono text-xs font-semibold text-primary uppercase tracking-wider">{title}</h3>
            {subtitle && <p className="text-[10px] text-muted mt-0.5">{subtitle}</p>}
          </div>
          {headerRight}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

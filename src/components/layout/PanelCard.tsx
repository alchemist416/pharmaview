import { cn } from '@/lib/utils';
import LiveIndicator from './LiveIndicator';

interface PanelCardProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  headerRight?: React.ReactNode;
  isLive?: boolean;
  lastUpdated?: string;
  dataSource?: string;
}

export default function PanelCard({ title, subtitle, children, className, headerRight, isLive, lastUpdated, dataSource }: PanelCardProps) {
  return (
    <div className={cn('bg-terminal-panel border border-terminal-border rounded-lg overflow-hidden', className)}>
      {title && (
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-terminal-border">
          <div className="flex items-center gap-2.5">
            <div>
              <h3 className="font-mono text-xs font-semibold text-primary uppercase tracking-wider">{title}</h3>
              {subtitle && <p className="text-[10px] text-muted mt-0.5">{subtitle}</p>}
            </div>
            {isLive !== undefined && (
              <LiveIndicator isLive={isLive} lastUpdated={lastUpdated} source={dataSource} />
            )}
          </div>
          {headerRight}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

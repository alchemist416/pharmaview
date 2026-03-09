'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Map, AlertTriangle, Shield, Bot } from 'lucide-react';
import { formatTime } from '@/lib/utils';

const navLinks = [
  { href: '/', label: 'Dashboard', icon: Activity },
  { href: '/map', label: 'Supply Map', icon: Map },
  { href: '/shortages', label: 'Shortages', icon: AlertTriangle },
  { href: '/regulatory', label: 'Regulatory', icon: Shield },
  { href: '/analyst', label: 'AI Analyst', icon: Bot },
];

export default function TopNav() {
  const pathname = usePathname();
  const [time, setTime] = useState('');

  useEffect(() => {
    const update = () => setTime(formatTime(new Date()));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <nav className="h-12 border-b border-terminal-border bg-terminal-panel flex items-center justify-between px-4 sticky top-0 z-50">
      <div className="flex items-center gap-6">
        <Link href="/" className="font-mono text-accent-green font-bold text-lg tracking-wider">
          PHARMAVIEW
        </Link>
        <div className="flex items-center gap-1">
          {navLinks.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  active
                    ? 'bg-accent-green/10 text-accent-green'
                    : 'text-muted hover:text-primary hover:bg-white/5'
                }`}
              >
                <Icon size={14} />
                {label}
              </Link>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-xs">
          <span className="relative flex h-2 w-2">
            <span className="animate-pulse-dot absolute inline-flex h-full w-full rounded-full bg-accent-green opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-green" />
          </span>
          <span className="text-accent-green font-mono font-semibold">LIVE</span>
        </div>
        <span className="font-mono text-xs text-muted">{time}</span>
      </div>
    </nav>
  );
}

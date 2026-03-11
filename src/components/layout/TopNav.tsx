'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Map, AlertTriangle, Shield, Bot, Menu, X, Layers, Crosshair, FlaskConical } from 'lucide-react';
import { formatTime } from '@/lib/utils';
import { useSimulation } from '@/lib/simulation/context';

const navLinks = [
  { href: '/', label: 'Dashboard', icon: Activity },
  { href: '/map', label: 'Supply Map', icon: Map },
  { href: '/shortages', label: 'Shortages', icon: AlertTriangle },
  { href: '/regulatory', label: 'Regulatory', icon: Shield },
  { href: '/predictions', label: 'Predictions', icon: Crosshair },
  { href: '/atlas', label: 'Atlas', icon: Layers },
  { href: '/analyst', label: 'AI Analyst', icon: Bot },
];

export default function TopNav() {
  const pathname = usePathname();
  const [time, setTime] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isActive, openWizard, exitSimulation } = useSimulation();

  useEffect(() => {
    const update = () => setTime(formatTime(new Date()));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  // Close mobile menu on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <nav className="border-b border-terminal-border bg-terminal-panel sticky top-0 z-50">
      <div className="h-12 flex items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-mono text-accent-green font-bold text-lg tracking-wider">
            PHARMAVIEW
          </Link>
          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
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
          {/* Simulation toggle */}
          <button
            onClick={isActive ? exitSimulation : openWizard}
            className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono font-medium transition-all ${
              isActive
                ? 'bg-accent-amber/20 border border-accent-amber/40 text-accent-amber animate-pulse'
                : 'bg-terminal-bg border border-terminal-border text-muted hover:text-accent-amber hover:border-accent-amber/40'
            }`}
          >
            <FlaskConical size={13} />
            {isActive ? 'SIM ACTIVE' : 'Simulate'}
          </button>
          <div className="flex items-center gap-2 text-xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-pulse-dot absolute inline-flex h-full w-full rounded-full bg-accent-green opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-green" />
            </span>
            <span className="text-accent-green font-mono font-semibold hidden sm:inline">LIVE</span>
          </div>
          <span className="font-mono text-xs text-muted hidden sm:inline">{time}</span>
          {/* Mobile menu button */}
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="md:hidden p-1.5 rounded text-muted hover:text-primary hover:bg-white/5 transition-colors"
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="md:hidden border-t border-terminal-border bg-terminal-panel px-4 py-2 space-y-1">
          {navLinks.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 px-3 py-2.5 rounded text-sm font-medium transition-colors ${
                  active
                    ? 'bg-accent-green/10 text-accent-green'
                    : 'text-muted hover:text-primary hover:bg-white/5'
                }`}
              >
                <Icon size={16} />
                {label}
              </Link>
            );
          })}
          <button
            onClick={isActive ? exitSimulation : openWizard}
            className={`flex items-center gap-2 px-3 py-2.5 rounded text-sm font-medium transition-colors w-full ${
              isActive
                ? 'bg-accent-amber/10 text-accent-amber'
                : 'text-muted hover:text-accent-amber hover:bg-white/5'
            }`}
          >
            <FlaskConical size={16} />
            {isActive ? 'Exit Simulation' : 'Run Simulation'}
          </button>
        </div>
      )}
    </nav>
  );
}

'use client';

import { ReactNode } from 'react';
import { useSimulation } from '@/lib/simulation/context';

export default function SimulationBorderWrapper({ children }: { children: ReactNode }) {
  const { isActive } = useSimulation();

  return (
    <div className={isActive ? 'ring-2 ring-accent-amber ring-inset min-h-screen' : 'min-h-screen'}>
      {children}
    </div>
  );
}

'use client';

import { ReactNode } from 'react';
import { SimulationProvider } from '@/lib/simulation/context';
import SimulationWizard from './SimulationWizard';
import SimulationBanner from './SimulationBanner';
import SimulationBorderWrapper from './SimulationBorderWrapper';

export default function SimulationShell({ children }: { children: ReactNode }) {
  return (
    <SimulationProvider>
      <SimulationBorderWrapper>
        {children}
        <SimulationWizard />
        <SimulationBanner />
      </SimulationBorderWrapper>
    </SimulationProvider>
  );
}

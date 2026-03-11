'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { SimulationParams, SimulationResult } from './types';
import { runSimulation } from './engine';

interface SimulationContextValue {
  isActive: boolean;
  isRunning: boolean;
  wizardOpen: boolean;
  result: SimulationResult | null;
  error: string | null;

  openWizard: () => void;
  closeWizard: () => void;
  execute: (params: SimulationParams) => Promise<void>;
  fetchAiSummary: () => Promise<void>;
  exitSimulation: () => void;
}

const SimulationContext = createContext<SimulationContextValue | null>(null);

export function SimulationProvider({ children }: { children: ReactNode }) {
  const [isActive, setIsActive] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openWizard = useCallback(() => setWizardOpen(true), []);
  const closeWizard = useCallback(() => setWizardOpen(false), []);

  const execute = useCallback(async (params: SimulationParams) => {
    setIsRunning(true);
    setError(null);
    try {
      const res = await runSimulation(params);
      setResult(res);
      setIsActive(true);
      setWizardOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Simulation failed');
    } finally {
      setIsRunning(false);
    }
  }, []);

  const fetchAiSummary = useCallback(async () => {
    if (!result) return;
    try {
      const res = await fetch('/api/simulation-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result }),
      });
      if (!res.ok) throw new Error('Failed to generate AI summary');
      const data = await res.json();
      setResult((prev) => prev ? { ...prev, aiSummary: data.summary } : prev);
    } catch {
      // Non-blocking — summary is optional
    }
  }, [result]);

  const exitSimulation = useCallback(() => {
    setIsActive(false);
    setResult(null);
    setError(null);
  }, []);

  return (
    <SimulationContext.Provider
      value={{ isActive, isRunning, wizardOpen, result, error, openWizard, closeWizard, execute, fetchAiSummary, exitSimulation }}
    >
      {children}
    </SimulationContext.Provider>
  );
}

export function useSimulation() {
  const ctx = useContext(SimulationContext);
  if (!ctx) throw new Error('useSimulation must be used within SimulationProvider');
  return ctx;
}

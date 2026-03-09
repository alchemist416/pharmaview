'use client';

import PanelCard from '@/components/layout/PanelCard';
import { Bot, Lock } from 'lucide-react';

export default function AnalystPage() {
  return (
    <div className="p-4 flex items-center justify-center min-h-[calc(100vh-48px)]">
      <PanelCard className="max-w-lg w-full text-center">
        <div className="py-8">
          <div className="flex justify-center mb-4">
            <div className="p-4 rounded-full bg-accent-green/10">
              <Bot className="text-accent-green" size={32} />
            </div>
          </div>
          <h2 className="font-mono text-lg font-bold text-primary mb-2">AI Analyst</h2>
          <p className="text-sm text-muted mb-4">
            Claude-powered pharmaceutical supply chain analysis.
            Available in Phase 2.
          </p>
          <div className="flex items-center justify-center gap-2 text-xs text-muted">
            <Lock size={12} />
            <span className="font-mono">Requires ANTHROPIC_API_KEY</span>
          </div>
        </div>
      </PanelCard>
    </div>
  );
}

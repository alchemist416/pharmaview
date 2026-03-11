'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { RefreshCw, AlertTriangle, Bell } from 'lucide-react';
import ForecastCard from '@/components/predictions/ForecastCard';
import SignalDashboard from '@/components/predictions/SignalDashboard';
import ForecastHistory from '@/components/predictions/ForecastHistory';
import { ForecastSnapshot } from '@/lib/signals';

const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 60 minutes

export default function PredictionsPage() {
  const [data, setData] = useState<ForecastSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [minutesAgo, setMinutesAgo] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/predictions/generate');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ForecastSnapshot = await res.json();
      setData(json);
      setLastFetched(new Date());

      // Check for new CRITICAL signals and send browser notification
      if (showRefreshing && json.critical_alert) {
        sendNotification(json.critical_alert);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load forecasts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 60 minutes
  useEffect(() => {
    refreshTimerRef.current = setInterval(() => {
      fetchData(true);
    }, REFRESH_INTERVAL_MS);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [fetchData]);

  // Update "minutes ago" counter
  useEffect(() => {
    timerRef.current = setInterval(() => {
      if (lastFetched) {
        setMinutesAgo(Math.floor((Date.now() - lastFetched.getTime()) / 60000));
      }
    }, 30000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [lastFetched]);

  function sendNotification(alert: string) {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      new Notification('PharmaView CRITICAL Alert', { body: alert, icon: '/favicon.ico' });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }

  function requestNotificationPermission() {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      Notification.requestPermission();
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="text-accent-green font-mono animate-pulse text-sm mb-2">
            INITIALIZING FORECAST ENGINE...
          </div>
          <div className="text-[9px] font-mono text-muted">
            Collecting signals from ReliefWeb, FRED, openFDA
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-red-400 font-mono text-sm">ERROR: {error || 'No data'}</div>
      </div>
    );
  }

  // Sort forecasts: severity first, then probability descending
  const severityOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const sortedForecasts = [...data.forecasts].sort((a, b) => {
    const sevDiff = (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4);
    if (sevDiff !== 0) return sevDiff;
    return b.probability - a.probability;
  });

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* CRITICAL alert banner */}
      {data.critical_alert && (
        <div className="relative overflow-hidden border border-red-500/40 rounded-lg bg-red-500/10 px-4 py-3">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500 animate-pulse" />
          <div className="flex items-center gap-3 pl-2">
            <AlertTriangle size={18} className="text-red-400 flex-shrink-0 animate-pulse" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-mono font-bold text-red-400">
                CRITICAL: {data.critical_alert}
              </div>
              <div className="text-[9px] font-mono text-red-400/70 mt-0.5">
                Active disruption detected. Forecasts updated{' '}
                {minutesAgo === 0 ? 'just now' : `${minutesAgo} minute${minutesAgo !== 1 ? 's' : ''} ago`}
              </div>
            </div>
            <button
              onClick={requestNotificationPermission}
              className="flex items-center gap-1 px-2 py-1 text-[9px] font-mono text-red-400 border border-red-500/30 rounded hover:bg-red-500/10 transition-colors flex-shrink-0"
              title="Enable browser notifications for critical alerts"
            >
              <Bell size={10} />
              NOTIFY
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-mono font-bold text-primary tracking-wider">
            AI DISRUPTION FORECASTS
          </h1>
          <p className="text-xs text-muted font-mono mt-1">
            {data.signals.feed_status?.feeds_unavailable ? (
              <span className="text-amber-400">
                Live feeds temporarily unavailable — showing cached signals
              </span>
            ) : (
              <>
                Claude-powered forecasts from {data.signals.feed_status?.total_feeds ?? data.signals.signals.length} data feeds
                {(data.signals.feed_status?.elevated_signals ?? 0) > 0 && (
                  <span className="text-red-400">
                    {' '}({data.signals.feed_status.elevated_signals} elevated signal{data.signals.feed_status.elevated_signals !== 1 ? 's' : ''} detected)
                  </span>
                )}
                {(data.signals.feed_status?.failed_feeds ?? 0) > 0 && (
                  <span className="text-amber-400/60">
                    {' · '}{data.signals.feed_status.failed_feeds} feed{data.signals.feed_status.failed_feeds !== 1 ? 's' : ''} offline
                  </span>
                )}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-terminal-border rounded text-xs font-mono text-muted hover:text-primary hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'REFRESHING...' : 'REFRESH NOW'}
          </button>
          <span className="text-[9px] font-mono text-muted">
            Updated{' '}
            {minutesAgo === 0 ? 'just now' : `${minutesAgo}m ago`}
            {' · '}Auto-refresh 60m
          </span>
        </div>
      </div>

      {/* Main grid: forecasts + signal sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
        {/* Forecast cards */}
        <div className="space-y-4">
          <div className="text-[9px] font-mono text-muted">
            {sortedForecasts.length} ACTIVE FORECASTS · Sorted by severity then probability
          </div>
          {sortedForecasts.map((forecast) => (
            <ForecastCard key={forecast.id} forecast={forecast} />
          ))}
        </div>

        {/* Signal dashboard sidebar */}
        <div className="space-y-4">
          <SignalDashboard snapshot={data.signals} />
        </div>
      </div>

      {/* Forecast history */}
      <ForecastHistory forecasts={data.forecasts} generatedAt={data.generated_at} />
    </div>
  );
}

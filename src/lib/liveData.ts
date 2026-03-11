import { promises as fs } from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Generic live-data fetcher with static JSON fallback
// ---------------------------------------------------------------------------

export interface LiveDataResult<T> {
  data: T;
  source: 'live' | 'fallback';
  last_updated: string;
  error?: string;
}

/**
 * Try fetching live data; fall back to static JSON on failure.
 * @param liveFetcher  async function that returns the live data
 * @param fallbackFile filename inside public/data/ to use as fallback
 */
export async function fetchWithFallback<T>(
  liveFetcher: () => Promise<T>,
  fallbackFile: string,
): Promise<LiveDataResult<T>> {
  try {
    const data = await liveFetcher();
    return {
      data,
      source: 'live',
      last_updated: new Date().toISOString(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[liveData] Live fetch failed for ${fallbackFile}, using fallback:`, message);

    try {
      const filePath = path.join(process.cwd(), 'public', 'data', fallbackFile);
      const raw = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(raw) as T;
      return {
        data,
        source: 'fallback',
        last_updated: new Date().toISOString(),
        error: `Live fetch failed: ${message}`,
      };
    } catch {
      throw new Error(`Both live and fallback failed for ${fallbackFile}: ${message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// In-memory cache with TTL
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T;
  source: 'live' | 'fallback';
  expires: number;
  last_updated: string;
}

const memoryCache = new Map<string, CacheEntry<unknown>>();

/**
 * Fetch with in-memory cache + TTL. Prevents redundant API calls within the
 * same serverless invocation or across revalidation windows.
 */
export async function cachedFetch<T>(
  key: string,
  ttlSeconds: number,
  liveFetcher: () => Promise<T>,
  fallbackFile: string,
): Promise<LiveDataResult<T>> {
  const cached = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (cached && Date.now() < cached.expires) {
    return {
      data: cached.data,
      source: cached.source,
      last_updated: cached.last_updated,
    };
  }

  const result = await fetchWithFallback(liveFetcher, fallbackFile);

  memoryCache.set(key, {
    data: result.data,
    source: result.source,
    expires: Date.now() + ttlSeconds * 1000,
    last_updated: result.last_updated,
  });

  return result;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

/** Fetch JSON with timeout and AbortSignal */
export async function fetchJSON<T>(
  url: string,
  opts?: { timeoutMs?: number; headers?: Record<string, string> },
): Promise<T> {
  const { timeoutMs = 15000, headers = {} } = opts ?? {};
  const res = await fetch(url, {
    headers: { Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

/** Build cache-control header string */
export function cacheHeader(maxAge: number, swr?: number): Record<string, string> {
  const swrVal = swr ?? maxAge * 2;
  return {
    'Cache-Control': `public, s-maxage=${maxAge}, stale-while-revalidate=${swrVal}`,
  };
}

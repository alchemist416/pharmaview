This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Environment Variables

Copy `.env.local` and fill in the API keys:

| Variable | Required | Source | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | [anthropic.com](https://console.anthropic.com) | AI analyst chat |
| `SUPABASE_URL` | Optional | [supabase.com](https://supabase.com) → Settings > API | Persistent storage for establishments, patents, country risk |
| `SUPABASE_ANON_KEY` | Optional | Same as above | Supabase anonymous key |
| `UN_COMTRADE_API_KEY` | Optional | [comtradeapi.un.org](https://comtradeapi.un.org) | Live pharmaceutical trade flows (HS code 30) |
| `FRED_API_KEY` | Optional | [fred.stlouisfed.org/docs/api/api_key.html](https://fred.stlouisfed.org/docs/api/api_key.html) | USD/INR exchange rates, oil prices, recession data |
| `CRON_SECRET` | Optional | `openssl rand -hex 32` | Protects Vercel cron job endpoints |

All live data API keys are optional — routes gracefully fall back to static JSON files in `/public/data/` when API keys are missing or API calls fail.

## Live Data Architecture

Every static JSON file in `/public/data/` has been replaced with a dynamic API route:

| Static File | API Route | Live Source | Cache TTL |
|---|---|---|---|
| `drug-categories.json` | `/api/drug-categories` | NIH RxNorm API | 24h |
| `atlas-shortage-history.json` | `/api/atlas/shortage-history` | openFDA Enforcement | 1h |
| `atlas-macro.json` | `/api/atlas/macro` | FRED API | 24h |
| `pricing-340b.json` | `/api/pricing` | CMS NADAC API | 1h |
| `country-risk.json` | `/api/country-risk` | FRED + openFDA + ReliefWeb | 6h |
| `inspection-history.json` | `/api/inspection-history` | openFDA Enforcement + Shortages | 1h |
| `comtrade-flows.json` | `/api/trade-flows` | UN Comtrade API | 1h |
| `decrs.json` | `/api/establishments` | openFDA NDC + Supabase | 1h |
| `patent-expiry.json` | `/api/patents` | FDA Drugs@FDA + Supabase | 1h |
| `atlas-manufacturing-geo.json` | `/api/atlas/manufacturing-geo` | Static pre-2021 + openFDA NDC | 24h |
| `atlas-geopolitical.json` | `/api/atlas/events` | Static baseline + FDA RSS + ReliefWeb | 6h |
| `atlas-regulatory.json` | `/api/atlas/regulatory` | Static baseline + Federal Register API | 6h |

### Fallback Strategy

Every route follows the same pattern:
1. Try live API fetch
2. On failure, serve from static JSON in `/public/data/`
3. Return `_live: true/false` flag so UI can show LIVE/STATIC indicator
4. In-memory cache prevents redundant API calls within TTL

### Vercel Cron Jobs

Configured in `vercel.json`:

| Schedule | Endpoint | Purpose |
|---|---|---|
| Weekly (Mon 3am) | `/api/cron/refresh-establishments` | Refresh DECRS data in Supabase |
| Monthly (1st, 4am) | `/api/cron/refresh-patents` | Refresh patent data in Supabase |
| Every 6 hours | `/api/cron/refresh-country-risk` | Refresh country risk scores |

### Supabase Schema

If using Supabase, create these tables:

```sql
CREATE TABLE establishments (
  id SERIAL PRIMARY KEY,
  firm_name TEXT NOT NULL,
  country_code TEXT NOT NULL,
  country TEXT,
  city TEXT,
  registration_number TEXT,
  type TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(firm_name, country_code)
);

CREATE TABLE patents (
  id SERIAL PRIMARY KEY,
  drug_name TEXT NOT NULL,
  generic_name TEXT NOT NULL,
  patent_number TEXT,
  expiry_date DATE,
  status TEXT,
  patent_holder TEXT,
  exclusivity_end DATE,
  orange_book_listed BOOLEAN DEFAULT TRUE,
  therapeutic_equivalents INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(drug_name, generic_name)
);

CREATE TABLE country_risk_snapshots (
  country_code TEXT PRIMARY KEY,
  risk INTEGER,
  label TEXT,
  note TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme).

Add all environment variables in the Vercel dashboard under Settings > Environment Variables.

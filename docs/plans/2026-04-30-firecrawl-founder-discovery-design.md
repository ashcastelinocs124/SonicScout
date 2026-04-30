# Firecrawl Founder Discovery — Design

**Date:** 2026-04-30
**Status:** Approved (pending implementation plan)
**Replaces:** `src/ingest/linkedin.ts` (naive undici GET → cheerio strip)

## Problem

The current `extractLinkedIn` does a raw `undici.request(url)` against LinkedIn profile URLs. LinkedIn returns either a login wall or a near-empty public stub for unauthenticated requests, so `founderProfiles[].text` is almost always empty in practice. Inspection of run #4 (`harvey.ai`, 2026-04-29) confirmed: input had no `founderProfileUrls`, ingestion finished in 174ms, the Founder agent ran with zero founder evidence and had to mark every claim `[speculative]`.

Two compounding gaps:
1. **No discovery.** The web UI has no input for founder URLs. The backend field exists but is never populated.
2. **No real scrape.** Even when URLs are passed, LinkedIn's anti-bot wall defeats `undici`.

## Goal

Given just a company URL, produce a memo whose Founder section contains `[verified]` claims sourced to real LinkedIn profile content. Manual URL override remains available for demo reliability.

## Approach

**Auto-discover founders from the company website + manual override**, using Firecrawl for both the discovery extract and the per-profile scrape. Founder agent input goes from "empty" today to structured profile markdown.

Rejected alternatives:
- *Manual URLs only* — works but pushes work onto the user during a live pitch.
- *Cheerio + LLM extraction in our own code* — equivalent quality but more moving parts; we'd be reimplementing what Firecrawl `/extract` already does.

## Architecture

### Two new modules

```
src/ingest/
  firecrawl.ts       NEW — thin client wrapper, single Firecrawl SDK instance
  founders.ts        NEW — discoverFounders(url) + scrapeProfile(url)
  linkedin.ts        DELETED (replaced by founders.ts)
  web.ts             unchanged
  pdf.ts             unchanged
```

`firecrawl.ts` exports a singleton `FirecrawlApp` reading `FIRECRAWL_API_KEY` from env. Returns `null` if the key is missing — every caller must handle that.

`founders.ts` exports:
- `discoverFounders(companyUrl): Promise<DiscoveredFounder[]>`
- `scrapeProfile(linkedinUrl): Promise<{ url: string; text: string }>`

### Ingestion flow

`src/agents/ingestion.ts` is rewritten to a two-phase parallel pipeline:

**Phase 1 — fetch in parallel:**
- `extractWeb(companyUrl)` (existing, ~200ms)
- `extractPdf(deckPath)` if provided (existing)
- `extractPdf(whitepaperPath)` if provided (existing)
- `discoverFounders(companyUrl)` if no manual URLs were provided (~5s)

**Phase 2 — scrape profiles in parallel:**
- `Promise.all(allFounderUrls.map(scrapeProfile))` (~3–5s each, parallel)
- `allFounderUrls = userProvided ?? discovered`

Total ingestion: ~8–12s (was ~200ms). Acceptable for live demo because (a) progress UI explains the wait, (b) it only runs once per memo, (c) the Founder section now has real data.

### Discovered-founder schema

```ts
const FoundersSchema = z.object({
  founders: z.array(z.object({
    name: z.string(),
    title: z.string().optional(),
    linkedinUrl: z.string().url().optional(),
  })),
  companyName: z.string().optional(),
});
```

Only `linkedinUrl` is consumed downstream; `name` and `title` are kept in `IngestedContext.rawMetadata` for debugging.

### IngestedContext shape

No type changes. `founderProfiles: { url; text }[]` is unchanged. The new data flows in through the same field, so specialists are untouched.

`rawMetadata` gains `discoveredFounders: number` and `discoverySource: "auto" | "manual" | "skipped"` for observability.

### UI changes

`web/src/pages/Home.tsx` adds one optional field:

> **Founder LinkedIn URLs (optional)** — one per line. Leave blank to auto-discover from the company site.

Submitted as `founderProfileUrls: string[] | undefined` in the `POST /api/runs` body. Existing `runs.input_payload` JSON column already accommodates it.

Progress messages added to the SSE stream:
- `discovering founders…`
- `scraping N profiles…`

These hook into the existing `AgentProgress` component as a pre-specialist phase.

## Failure modes

| Condition | Behavior | User-visible |
|---|---|---|
| `FIRECRAWL_API_KEY` missing | Skip discovery + scrape; fall back to passing manual URLs through `extractWeb` (today's behavior). Log warn once. | "founder discovery disabled — set FIRECRAWL_API_KEY" banner on Home |
| Firecrawl `/extract` 4xx/5xx | `founders: []`, run continues, Founder agent runs on website text only | Inline note in Founder section: "auto-discovery failed" |
| Firecrawl returns founders, scrape fails on 1 | That profile gets `text: ""`; others succeed | Founder agent annotates gap with `[speculative]` |
| Rate limit (429) | Same as 5xx — log + degrade. No retry storm. | "founder discovery rate-limited" |
| Manual URLs provided | Skip discovery entirely; only scrape user URLs | No discovery progress message |

The Founder agent's existing tiering rules already handle missing data correctly — no agent prompt changes needed.

## Cost model

Firecrawl Hobby ($16/mo, 3k credits):
- 1 `/extract` per run = 5 credits
- ~2 `/scrape` per run = 2 credits
- ≈ **7 credits per run** → **~430 runs/month** on Hobby

For a demo project this is fine. If we later hit limits, the manual-URL path skips `/extract` entirely (2 credits/run instead of 7).

## Testing

- `tests/ingest/founders.test.ts` — mock Firecrawl SDK; assert schema parsing, fallback when key missing, fallback when extract throws, dedupe of manual+discovered URLs.
- `tests/agents/ingestion.test.ts` — update existing test to assert two-phase flow and that manual URLs skip discovery.
- No live Firecrawl calls in tests (per project rule: all external SDKs mocked).

Existing 39 backend tests must still pass. New tests added for the two new modules.

## Out of scope

- Twitter/X profile scraping (Firecrawl supports it; defer until thesis weights it).
- Caching scraped profiles across runs (each run is independent for now).
- Tracking Firecrawl credit usage — defer until we hit a limit in practice.
- Re-introducing the deleted `linkedin.ts` for non-LinkedIn fallback — `web.ts` already handles arbitrary URLs.

## Open questions resolved during brainstorm

- **Discovery method:** Firecrawl `/extract` with Zod schema (one call does scrape + LLM extraction). Rejected cheerio-only and DIY LLM-over-markdown.
- **Override UX:** Single optional textarea on Home; manual URLs replace auto-discovery, not append. Simpler mental model than merge-and-dedupe.
- **Latency budget:** ~10s ingestion is acceptable given progress UI; alternative was running discovery lazily (after specialists start) but that complicates the SSE state machine for marginal gain.

## Next step

Invoke `superpowers:writing-plans` to break this into an implementation plan (estimated 6–8 tasks: Firecrawl client, founders module, ingestion rewrite, UI input field, SSE progress events, tests, env wiring, docs).

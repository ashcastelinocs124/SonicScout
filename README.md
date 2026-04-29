# DealSense

Localhost web app — multi-agent venture analyst for **Decasonic** (Web3 x AI). Paste a startup URL, watch 5 AI specialist agents analyze it in parallel, get a thesis-aligned investment memo in ~90 seconds with a `Pass / Watch / Take Meeting / Invest` recommendation.

## Architecture

```
URL submitted at /
        │
        ▼
  POST /api/runs → BullMQ job (Redis)
        │
        ▼
  Orchestrator
        │
  Agent 1 (Ingestion)
        │
        ├─► Agent 2 (Market Map)        ┐
        ├─► Agent 3 (Founder Signal)    │  parallel
        ├─► Agent 4 (Product)           │
        ├─► Agent 5 (Tokenomics)        │
        └─► Agent 6 (Trust & Risk)      ┘
                │
                ▼
        Agent 7 (Memo Synthesis)
                │
                ▼
        SSE → /runs/:id (browser)
        SQLite persistence
```

Every factual claim is tagged `[verified]`, `[inferred]`, or `[speculative]`. A post-processor strips `[verified]` tags that lack a source line. Inline confidence pills surface the discipline visually. The Decasonic thesis lives in `config/thesis.md` and is sliced per-agent.

## Run locally

Requires Node 20+, Redis, an OpenAI API key.

```bash
cp .env.example .env             # fill in OPENAI_API_KEY
redis-server &
npm install
npm --prefix web install
npm run dev                      # backend :3000 + vite :5173 concurrently
```

Open http://localhost:5173 — paste a URL, click Analyze.

## Demo build (single port, single binary)

```bash
npm run build
NODE_ENV=production npm start
# http://localhost:3000
```

## Pre-demo checklist

- [ ] `redis-cli ping` → PONG
- [ ] `npm run build && NODE_ENV=production npm start`
- [ ] http://localhost:3000 loads
- [ ] Paste a known-good URL → memo lands in <120s
- [ ] Recommendation card, thesis, risks, 5 sections, follow-up chat all visible
- [ ] Copy `/runs/N` URL into a fresh tab — completed memo renders from snapshot

## Tests + typecheck

```bash
npm test          # vitest, all LLM calls mocked
npm run typecheck # strict tsc, no emit
npm run build     # compile backend to dist/, frontend to web/dist/
```

## Editing the thesis

`config/thesis.md` has four sections sliced per agent:

- `## Market beliefs` → Market Map agent
- `## Founder filters` → Founder Signal agent
- `## Token stance` → Product + Tokenomics agents
- `## Anti-patterns` → Tokenomics + Trust & Risk agents (anti-patterns become HARD FLAGS)

Edit the file, restart the worker. Read on each request.

## Adding a new specialist agent

All specialists share `src/agents/specialist.ts`. To add a seventh:

1. Create `src/agents/<your-agent>.ts` following `market.ts`/`founder.ts` — call `runSpecialist({ agent, systemPreamble, userTask, ctx, thesis })`.
2. Add a new `AgentKey` literal in `src/agents/thesis.ts` and a slice rule in `sliceThesis`.
3. Add it to the `Promise.all` fan-out in `src/orchestrator/run.ts`.
4. Add its section to `Memo.sections` (no schema change needed — `z.record`) and to the tabs list in `web/src/components/MemoSections.tsx`.
5. Mock its module in any test that imports the orchestrator.

## Project layout

```
config/thesis.md            # Decasonic thesis (hand-edited)
src/
  agents/                   # 7 agents + shared helpers (llm, thesis, tiering)
  ingest/                   # PDF, web, LinkedIn extractors
  orchestrator/             # ingestion → fan-out → memo
  queue/                    # BullMQ producer + worker
  web/                      # Express + SSE bus + routes + static serve
  db/                       # SQLite store
  index.ts                  # boots Express + worker
web/                        # Vite + React + Tailwind v4 + shadcn frontend
  src/pages/                # Home, Run
  src/components/           # AgentProgress, RecommendationCard, MemoSections, FollowupChat
  src/lib/                  # api client, useRunStream hook
tests/                      # vitest, all LLM calls mocked
docs/plans/                 # design + implementation plans
```

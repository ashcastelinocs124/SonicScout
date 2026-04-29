# sonicscout / DealSense

Localhost web app — multi-agent venture analyst for **Decasonic** (Web3 x AI VC). Turns startup inputs (deck, site, founder profiles, tokenomics, whitepaper) into a thesis-aligned investment memo with `Pass / Watch / Take Meeting / Invest` recommendation, optimized for live VC-pitch demos.

## Architecture (one-liner)

`POST /api/runs` → BullMQ → Orchestrator → Agent 1 (Ingestion) → Agents 2-6 in parallel (Market, Founder, Product, Tokenomics, Risk) → Agent 7 (Memo synthesis) → SSE stream → browser at `/runs/:id` + SQLite persistence.

Every factual claim is tagged `[verified]` / `[inferred]` / `[speculative]`; a post-processor strips `[verified]` tags lacking a source line. Inline confidence pills surface the discipline visually. The Decasonic thesis lives in `config/thesis.md` and is sliced per agent.

## Tech stack

- Node 20 + TypeScript strict (NodeNext, `noUncheckedIndexedAccess`)
- Backend: `express` (HTTP + SSE), `openai` (gpt-5-mini for specialists, gpt-5 for memo synthesis), `bullmq` + `ioredis`, `better-sqlite3`, `pdf-parse@2`, `cheerio`, `undici`, `zod`, `pino`
- Frontend: Vite + React + TypeScript + Tailwind v4 + shadcn/ui + wouter (router)
- `vitest` (all LLM calls mocked in tests), `supertest` for HTTP route tests

## Git push policy (HARD RULE)

Every push to a remote MUST go through the `/gitpush` skill. Never run `git push`, `gh repo create --push`, or any other push-equivalent directly in Bash. The skill runs a pre-push secret scan that raw `git push` skips.

## Learnings

This project maintains `learnings.md` at the project root. Add entries when you discover something interesting. Each entry must include a **Ref** subtitle pointing to the relevant CLAUDE.md section. Only read `learnings.md` when its contents are directly relevant to the current task.

## Memory System

### Short-term memory (`short_term_memory.md`)
Last 5 immediate tasks — what was done, why, and the outcome. When a 6th lands, summarize the oldest into `long_term_memory.md` first.

### Long-term memory (`long_term_memory.md`)
Condensed historical context (2-3 lines per entry). Pruned every 10 sessions against current state.

### Loading priority
At session start, read `short_term_memory.md` first, then `long_term_memory.md`.

## Completed Work

### 2026-04-25 — DealSense v1 (15-task plan) shipped
- Built end-to-end Slack-first multi-agent venture analyst per `docs/plans/2026-04-25-dealsense-implementation.md`
- 7 agents: Ingestion (PDF/HTML/LinkedIn), Market Map, Founder Signal, Product, Tokenomics, Trust & Risk, Memo Synthesis
- Confidence tiering enforced via prompt + post-processor (`src/agents/tiering.ts`)
- Static thesis encoded in `config/thesis.md`, sliced per-agent in `src/agents/thesis.ts`
- BullMQ async pattern, SQLite persistence for follow-up Q&A routing, progressive Slack updates
- Decisions: Slack-first wedge (not web app), gpt-5-mini for specialists / gpt-5 for synthesis (originally Sonnet 4.6 / Opus 4.7 — swapped to OpenAI on 2026-04-28), in-process worker (single binary), strict TS / no ESLint
- All 31 tests pass, typecheck clean

### 2026-04-29 — Web surface (replaces Slack)
- Localhost web app for live VC-pitch demos per `docs/plans/2026-04-29-dealsense-web-implementation.md`
- Express HTTP + SSE backend: `POST /api/runs`, `GET /api/runs/:id`, `GET .../stream`, `POST .../followup`
- Vite + React + Tailwind v4 + shadcn frontend with 3 visual states (loading / progress / completed)
- AgentProgress: 5 cards lighting up as agents complete in parallel (the hero moment)
- Inline confidence pills (`[verified]` green, `[inferred]` yellow, `[speculative]` red)
- Schema migration: dropped Slack-specific columns, persistence is now surface-agnostic
- Decisions: SSE over WebSocket, in-process EventEmitter bus (no Redis pub/sub), wouter over react-router, Tailwind transitions over Framer Motion, Tailwind v4 (forced by shadcn output)
- 39 backend tests pass, typecheck clean, prod build serves via single binary on `:3000`

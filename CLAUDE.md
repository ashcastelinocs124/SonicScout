# sonicscout / DealSense

Slack-first multi-agent venture analyst for **Decasonic** (Web3 x AI VC). Turns startup inputs (deck, site, founder profiles, tokenomics, whitepaper) into a thesis-aligned investment memo with `Pass / Watch / Take Meeting / Invest` recommendation.

## Architecture (one-liner)

`/dealsense <url>` → BullMQ → Orchestrator → Agent 1 (Ingestion) → Agents 2-6 in parallel (Market, Founder, Product, Tokenomics, Risk) → Agent 7 (Memo synthesis) → Slack thread + SQLite persistence.

Every factual claim is tagged `[verified]` / `[inferred]` / `[speculative]`; a post-processor strips `[verified]` tags lacking a source line. The Decasonic thesis lives in `config/thesis.md` and is sliced per agent.

## Tech stack

- Node 20 + TypeScript strict (NodeNext, `noUncheckedIndexedAccess`)
- `@slack/bolt` (Socket Mode), `@anthropic-ai/sdk`, `bullmq` + `ioredis`, `better-sqlite3`, `pdf-parse@2` (class-based PDFParse API), `cheerio`, `undici`, `zod`, `pino`
- `vitest` (all LLM calls mocked in tests)

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
- Decisions: Slack-first wedge (not web app), Sonnet 4.6 for specialists / Opus 4.7 for synthesis, in-process worker (single binary), strict TS / no ESLint
- All 31 tests pass, typecheck clean

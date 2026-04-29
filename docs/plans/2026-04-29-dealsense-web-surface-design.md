# DealSense — Web Surface Design

**Date:** 2026-04-29
**Status:** Approved (brainstorm complete)
**Author:** ash + Claude
**Supersedes (chat surface only):** the Slack adapter from the 2026-04-25 design doc. The orchestrator, agents, queue, LLM, and persistence layers are unchanged.

---

## 1. Why this exists

DealSense v1 ships as a Slack-first multi-agent venture analyst. The Slack surface was chosen as a "wedge" for partner-internal use, but it has hurt the *demo* loop:

- Each demo requires a Slack workspace login and bot install.
- Recording a demo (Loom, screenshare) is awkward through Slack.
- The visual story (5 agents thinking in parallel → recommendation reveal) is capped by Block Kit.

The web surface fixes all three. It's the **same product** behind the same orchestrator — only the chat layer changes.

## 2. Decisions locked in (brainstorm)

| # | Question | Decision | Rationale |
|---|---|---|---|
| 1 | Audience? | Decasonic team only (no founders, no public) | No ACL, no rate limiting, no multi-tenant scope creep |
| 2 | Demo shape? | Live laptop demo on localhost | No deploy, no auth, no domain. `npm run dev` and screenshare. |
| 3 | Polish bar? | "Looks like a designed product" — Vite + React + Tailwind + shadcn/ui | VC audience expects polish; shadcn delivers it fast |
| 4 | Real-time progress? | SSE (Server-Sent Events) | Sub-100ms agent-card-light-up effect with the simplest backend |
| 5 | Page structure? | Routed: `/` + `/runs/:id` | Permalinks let us pre-warm a result before the meeting |
| 6 | Animations? | Tailwind transitions only (no Framer Motion) | Sufficient for the agent-cards effect; can upgrade later |
| 7 | Confidence tags? | Inline pills (verified=green, inferred=yellow, speculative=red) | Turns the no-hallucination discipline into a visible product feature |
| 8 | Deck PDF upload? | Out of scope for v1 | URL-only is enough to demo; PDF ingestion path already exists, can ship later |

## 3. Architecture diff

```
┌─────────────────────────────────────────────────────────────┐
│  KEEPS (untouched):                                         │
│    src/agents/*           — 7 agents + helpers              │
│    src/orchestrator/run.ts — phase callbacks                │
│    src/queue/*            — BullMQ + worker                 │
│    src/db/store.ts        — SQLite (already keys by runId)  │
│    src/agents/llm.ts      — OpenAI                          │
│    config/thesis.md       — thesis                          │
│    All ~30 existing tests below the chat layer              │
├─────────────────────────────────────────────────────────────┤
│  DELETES:                                                   │
│    src/slack/app.ts                                         │
│    src/slack/render.ts                                      │
│    tests/slack.render.test.ts                               │
│    @slack/bolt dependency                                   │
│    SLACK_BOT_TOKEN / SLACK_SIGNING_SECRET / SLACK_APP_TOKEN │
│    DealJobData.slackChannel / .slackThreadTs                │
├─────────────────────────────────────────────────────────────┤
│  ADDS:                                                      │
│    src/web/server.ts      — Express HTTP + SSE              │
│    src/web/routes.ts      — POST /api/runs, GET /api/runs   │
│    src/web/sse.ts         — in-process SSE pubsub bus       │
│    src/web/static.ts      — serve built frontend in prod    │
│    web/                   — Vite + React + Tailwind project │
│      web/src/pages/Home.tsx                                 │
│      web/src/pages/Run.tsx                                  │
│      web/src/components/AgentProgress.tsx                   │
│      web/src/components/RecommendationCard.tsx              │
│      web/src/components/MemoSections.tsx                    │
│      web/src/components/FollowupChat.tsx                    │
│      web/src/lib/sse.ts                                     │
│      web/src/lib/api.ts                                     │
│      web/src/lib/useRunStream.ts                            │
│    Top-level: concurrently (run backend + vite in dev)      │
├─────────────────────────────────────────────────────────────┤
│  CHANGES:                                                   │
│    src/index.ts          → start Express, not Slack         │
│    src/queue/queue.ts    → DealJobData uses runId only      │
│    src/queue/worker.ts   → onProgress writes to SSE bus     │
│    .env.example          → drop SLACK_*, add PORT           │
│    package.json          → add express, drop @slack/bolt    │
│    README.md, CLAUDE.md  → update                           │
└─────────────────────────────────────────────────────────────┘
```

The single biggest change: **the worker no longer knows about the chat surface.** It writes events to an in-process EventEmitter bus keyed by `runId`. The HTTP layer subscribes and streams to the browser. Worker and HTTP server share memory (single Node process), so no Redis pub/sub is needed.

## 4. Data flow

```
Browser              Express :3000             BullMQ Worker
   │                      │                          │
   │ POST /api/runs       │                          │
   ├─────────────────────►│                          │
   │                      │ store.createRun()        │
   │                      │ dealQueue.add(runId)     │
   │ 202 {runId:42}       │                          │
   │◄─────────────────────┤                          │
   │                      │                          │
   │ navigate /runs/42    │                          │
   │ GET /api/runs/42     │                          │
   ├─────────────────────►│                          │
   │ {status:"running"}   │                          │
   │◄─────────────────────┤                          │
   │                      │                          │
   │ EventSource          │                          │
   │ /api/runs/42/stream  │  bus.subscribe(42)       │
   ├─────────────────────►│                          │
   │                      │  ◄─── progress(ingestion,1,1) ─┤
   │ event: progress      │                                 │
   │◄─────────────────────┤                                 │
   │                      │  ◄─── progress(market,1,5) ────┤
   │                      │  ◄─── progress(founder,2,5) ───┤
   │ event: progress (×5) │  ... 3 more ...                 │
   │◄─────────────────────┤                                 │
   │                      │  ◄─── progress(memo,1,1) ──────┤
   │                      │  ◄─── complete(memo) ──────────┤
   │ event: complete      │                          │
   │◄─────────────────────┤                          │
   │ EventSource.close()  │                          │
```

## 5. Backend API surface

### `POST /api/runs`
Creates a run and enqueues the job. Returns 202 immediately.
```ts
// Request:  { "url": "https://startup.com" }
// Response 202: { "runId": 42 }
// Response 400: { "error": "url required" }
```

### `GET /api/runs/:id`
Snapshot for initial page load + refresh-after-complete.
```ts
// In progress: { id, status:"running", url, phase, completed, total, memo:null }
// Completed:   { id, status:"completed", url, phase, completed, total, memo:{...} }
// 404 unknown id
```

### `GET /api/runs/:id/stream`
Server-Sent Events. Page opens this *after* snapshot fetch.
```
event: progress
data: {"phase":"ingestion","done":1,"total":1}

event: progress
data: {"phase":"market","done":1,"total":5}

... 4 more progress events ...

event: complete
data: {"memo": {...}}
```

If the run is already complete when `/stream` is opened, the server immediately writes a single `event: complete` from `store.findById(id)` and closes — covers refresh-after-complete with no race.

### `POST /api/runs/:id/followup`
Plain JSON, not SSE. Follow-ups complete in 2-3s.
```ts
// Request:  { "question": "What's the token unlock schedule?" }
// Response: { "answer": "Linear vest over 36 months ... [verified]\n  ↳ Source: ..." }
// 409 if run not yet completed
```

### SSE bus (`src/web/sse.ts`)
```ts
type Listener = (evt: { event: string; data: unknown }) => void;
const listeners = new Map<number, Set<Listener>>();
export function emit(runId: number, event: string, data: unknown);
export function subscribe(runId: number, l: Listener): () => void; // returns unsubscribe
```
Worker callbacks become:
```ts
onProgress: (data, phase, completed, total) =>
  emit(data.runId, 'progress', { phase, done: completed, total }),
onComplete: (data, memo) => {
  store.completeRun(data.runId, { memoJson: memo, ... });
  emit(data.runId, 'complete', { memo });
},
```

## 6. Frontend structure

```
web/
  index.html
  vite.config.ts            ← proxy /api/* to localhost:3000
  src/
    main.tsx                ← wouter Router
    pages/
      Home.tsx              ← URL input → POST /api/runs → navigate
      Run.tsx               ← three visual states: loading | progress | done
    components/
      AgentProgress.tsx     ← 5 cards that light up (hero moment)
      RecommendationCard.tsx← big verdict + thesis + risks
      MemoSections.tsx      ← tabs for the 5 agent sections
      FollowupChat.tsx      ← chat input + answer bubbles below memo
    lib/
      api.ts                ← typed fetch wrappers
      useRunStream.ts       ← snapshot + SSE → discriminated-union state
    types.ts                ← Memo, Phase, RunSnapshot
```

### The three visual states of `/runs/:id`

**State 1 — `loading`:** skeleton placeholder, ~50ms before snapshot returns.

**State 2 — `progress`** (the hero moment, ~90s):
- Top: URL pill, "~90s" ETA, live phase label
- Center: **5 agent cards in a row** (Market / Founder / Product / Tokenomics / Risk)
  - Pending: muted grey, dim icon
  - Running: subtle shimmer + accent border + "Analyzing…" caption
  - Done: full color, ✓ checkmark, "Complete · Xs" caption
  - Cards complete out-of-order (parallel agents) — visually compelling
- Bottom: thin progress bar (`done/total`)

**State 3 — `completed`:**
- Smooth Tailwind transition: agent row collapses up, RecommendationCard animates in from below
- **RecommendationCard:** enormous verdict (`PASS` / `WATCH` / `TAKE MEETING` / `INVEST`) with color coding (red / amber / green / sapphire) + 3-bullet thesis + 3-bullet risks
- **MemoSections:** tabs for Market / Founder / Product / Tokenomics / Risk; full agent output per tab; **inline confidence pills** (`[verified]` green, `[inferred]` yellow, `[speculative]` red); source quotes as cited callouts
- **FollowupChat:** pinned below memo; input + send; Q&A pairs as chat bubbles; POSTs to `/api/runs/:id/followup`

### `useRunStream` hook

```ts
type RunState =
  | { status: 'loading' }
  | { status: 'progress'; agents: AgentState[]; phase: Phase; done: number; total: number }
  | { status: 'completed'; memo: Memo }
  | { status: 'error'; message: string };

function useRunStream(runId: number): RunState {
  // 1. fetch snapshot (covers refresh-after-complete)
  // 2. attach SSE if not yet completed
  // 3. apply progress + complete events to state
  // 4. handle SSE error with one reconnect attempt
}
```

Discriminated union forces `switch(state.status)` rendering — kills entire classes of half-loaded UI bugs.

### Visual references

- Layout: shadcn cards + Tailwind container + `max-w-3xl` center column
- Palette: zinc neutrals + a single accent (emerald or violet)
- Typography: Inter (shadcn default), monospaced for source quotes
- Motion: Tailwind `transition-all duration-500` for state changes; no Framer Motion in v1

## 7. Error handling

| Failure | Behavior |
|---|---|
| Empty/invalid URL | 400 → inline form error on `/` |
| URL fetch fails (404, paywall, timeout) | Job fails → `emit('error', {message})` → red error card on `/runs/:id` |
| LLM 429 / 5xx | Existing 3-retry backoff in `callLLM` — invisible to user |
| LLM JSON parse fails (memo) | Same as URL failure — error card |
| Redis down | `dealQueue.add()` catches → 503 + form error. Pre-demo: `redis-cli ping`. |
| SSE drops mid-run | Browser auto-reconnects; server replays from snapshot then re-subscribes |
| Refresh during progress | `useRunStream` re-fetches snapshot → re-attaches SSE; identical to first load |
| Refresh after completion | Snapshot returns memo → skip SSE → render state-3 immediately. Permalink works. |
| Unknown `/runs/:id` | 404 → "Run not found" + link to `/` |
| Multiple tabs on same run | Bus is multi-listener — both tabs receive events. No-op concern. |
| Worker process dies | Out of scope for localhost demo |

Two error UIs to actually build:
- Red error card on `/runs/:id` (replaces AgentProgress)
- Inline shadcn FormMessage under the URL input on `/`

## 8. Testing strategy

| Layer | Approach |
|---|---|
| **Existing ~30 tests** | Keep all unchanged (they live below the chat layer) |
| **Delete** | `tests/slack.render.test.ts` |
| **New: HTTP routes** | vitest + supertest. 4 tests covering POST createRun, GET 404, GET completed, POST followup |
| **New: SSE bus** | 2 unit tests: fan-out to multiple listeners, unsubscribe stops events |
| **New: SSE end-to-end** | 1 integration test: start Express on random port, mock worker, assert event order |
| **Frontend** | Optional Playwright smoke test (Home → submit → /runs/:id → recommendation card visible). Replaceable by README pre-demo checklist. |

Net delta: **+6 backend tests, –1 deleted, +1 optional frontend.** Final: **~36 backend tests**.

Not building: storybook, accessibility audits, per-component tests, visual regression. Demo bar.

## 9. Dev experience

```bash
# dev
npm run dev              # tsx watch backend + vite frontend (concurrently)
                         # → frontend at :5173, backend at :3000, vite proxies /api/*

# production / demo
npm run build            # tsc backend + vite build → web/dist/
npm start                # single binary on :3000, serves built frontend statically
```

Demo URL: `http://localhost:3000` after `npm run build && npm start`.

## 10. Pre-demo checklist (README.md)

```
□ redis-cli ping → PONG
□ npm run build && npm start → :3000
□ Open http://localhost:3000
□ Drop a known-good URL → memo lands in <120s
□ Verify: recommendation, thesis bullets, risks, 5 sections, follow-up chat
□ (optional) Disconnect/reconnect Wi-Fi to test SSE reconnect
```

## 11. Out of scope for v1

- Auth / login (single-user laptop demo)
- Deck PDF upload (URL-only)
- Multi-tenant per-org thesis
- Deployed hosting (Railway, Vercel)
- Storybook, accessibility, visual regression
- Framer Motion (Tailwind transitions only)
- Mobile responsiveness (demo is desktop-only)

## 12. Open follow-ups (post-demo)

- If demo lands well: ship a deployed version with shared password gate
- Add deck PDF upload (the ingestion path is already there — just needs multer)
- Mobile-friendly layout
- Persist follow-up Q&A history in SQLite (currently lost on reload)

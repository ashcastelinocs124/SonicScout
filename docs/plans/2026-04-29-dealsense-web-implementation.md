# DealSense Web Surface Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Tasks are grouped into **4 waves** — Wave 0 sequential, Waves 1–2 parallel-friendly, Wave 3 sequential integration. See `superpowers:subagent-driven-development` for wave-batched execution.

**Goal:** Replace the Slack chat surface with a localhost web app (Express + SSE backend + Vite/React/Tailwind/shadcn frontend) for live VC-pitch demos. Orchestrator, agents, queue, LLM, and persistence below the chat layer stay untouched.

**Architecture:** HTTP layer subscribes to an in-process `EventEmitter` bus keyed by `runId`. The BullMQ worker emits `progress` and `complete` events to that bus. The browser opens an SSE stream to `/api/runs/:id/stream` and renders three visual states (loading / progress / completed) on a routed page (`/` and `/runs/:id`). Persistence is genericized away from Slack-specific columns.

**Tech Stack:** Existing — Node 20, TypeScript strict, BullMQ + ioredis, better-sqlite3, OpenAI v6, vitest. Adding — `express`, `supertest`, `concurrently`. Frontend — Vite 5, React 18, TypeScript, Tailwind 3, shadcn/ui, wouter (router).

**Reference:** Design doc — `docs/plans/2026-04-29-dealsense-web-surface-design.md`

**Wave plan (for subagent-driven-development):**
- **Wave 0** (sequential): T1 → T2 → T3 — schema migration + Slack deletion has to land before anything else. Single agent, sequential.
- **Wave 1** (parallel): T4, T5, T6 — SSE bus, Express skeleton, Vite scaffold. Three agents in parallel, isolated worktrees.
- **Wave 2** (parallel): T7–T16 — backend routes and frontend components are mutually independent once the API contract from Wave 1 exists. Up to 10 agents in parallel.
- **Wave 3** (sequential): T17 → T18 → T19 → T20 — page integration, entrypoint swap, docs, smoke test. Single agent.

---

## Pre-flight (do once, before Wave 0)

Read these in order before starting any task:
1. `docs/plans/2026-04-29-dealsense-web-surface-design.md` — the approved design
2. `learnings.md` — known gotchas (pdf-parse v2 API, openai peer-dep, gpt-5 max_completion_tokens, leaked-secret protocol)
3. `short_term_memory.md` — what landed in the last 5 sessions
4. `CLAUDE.md` — project rules (gitpush via skill, learnings format, memory system)

**Pre-flight verification:**
```bash
npm test          # → 31/31 passing (current baseline)
npm run typecheck # → clean
redis-cli ping    # → PONG
```

If any of those fail, stop and fix before starting the plan.

---

# WAVE 0 — Prep (sequential, single agent)

## Task 1: Swap dependencies (remove Slack, add Express + frontend tooling)

**Files:**
- Modify: `package.json`
- Modify: `.env.example`
- Test: smoke — `npm install` succeeds, `npm test` still passes

**Step 1: Remove Slack and add Express**

```bash
npm uninstall @slack/bolt
npm install express
npm install -D @types/express supertest @types/supertest concurrently
```

**Step 2: Reset `.env.example`**

Replace contents of `.env.example` with:

```
OPENAI_API_KEY=
REDIS_URL=redis://localhost:6379
DEALSENSE_DB_PATH=./data.sqlite
PORT=3000
LOG_LEVEL=info
```

(Dropped: `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_APP_TOKEN`. Added: `PORT`.)

**Step 3: Verify nothing broke yet**

Run: `npm test`
Expected: 31/31 still passing — the Slack tests still exist, only deps changed. (If `tests/slack.render.test.ts` fails because @slack/bolt is gone, that's expected — we delete it in Task 3.)

Actually since `@slack/bolt` is removed, `tests/slack.render.test.ts` will fail to *import*. So:

Run: `npm test 2>&1 | tail -10`
Expected: All non-slack tests pass; `slack.render.test.ts` errors on import. Acceptable interim state.

Run: `npm run typecheck`
Expected: errors in `src/slack/app.ts` (cannot find `@slack/bolt`). Acceptable interim — fixed in Task 3.

**Step 4: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "chore: swap @slack/bolt for express + frontend tooling"
```

---

## Task 2: Genericize Store + DealJobData (remove Slack-specific fields)

**Why:** The current schema has `slack_channel`, `slack_user`, `slack_thread_ts` columns and `findByThread()` is keyed by Slack thread TS. Web surface only needs `runId`. Migrating now keeps persistence surface-agnostic and avoids dead columns.

**Files:**
- Modify: `src/db/schema.sql`
- Modify: `src/db/store.ts`
- Modify: `src/queue/queue.ts:15-20` (DealJobData type)
- Test: existing store tests must still pass; if no store tests exist, add `tests/db/store.test.ts`

**Step 1: Find existing store/queue test coverage**

```bash
grep -l "Store\|DealJobData" tests/ -r
```

If `tests/db/store.test.ts` doesn't exist, write one (Step 2). If it does, modify the existing tests to match the new schema.

**Step 2: Write failing test for the new Store API**

Create or replace `tests/db/store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../../src/db/store.js";

describe("Store", () => {
  let store: Store;
  beforeEach(() => { store = new Store(":memory:"); });

  it("creates a run and finds it by id", () => {
    const id = store.createRun({ inputPayload: { url: "https://x.com" } });
    const row = store.find(id);
    expect(row?.id).toBe(id);
    expect(row?.status).toBe("pending");
    expect(row?.inputPayload).toEqual({ url: "https://x.com" });
  });

  it("completes a run and stores the memo", () => {
    const id = store.createRun({ inputPayload: { url: "https://x.com" } });
    const memo = { recommendation: "Watch", thesis: ["a","b","c"], risks: ["r1","r2","r3"], sections: { market: "..." } };
    store.completeRun(id, { recommendation: "Watch", memoJson: memo, ingestedContext: {}, thesisSnapshot: "" });
    const row = store.find(id);
    expect(row?.status).toBe("completed");
    expect(row?.memoJson).toEqual(memo);
  });

  it("returns undefined for unknown id", () => {
    expect(store.find(99999)).toBeUndefined();
  });
});
```

Run: `npm test -- tests/db/store.test.ts`
Expected: FAIL — `createRun` requires `slackChannel` etc. (or pass if `:memory:` schema lookup fails first).

**Step 3: Replace `src/db/schema.sql`**

```sql
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  input_payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  recommendation TEXT,
  memo_json TEXT,
  ingested_context TEXT,
  thesis_snapshot TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
```

(Dropped: `slack_channel`, `slack_user`, `slack_thread_ts`, the thread index.)

**Step 4: Replace `src/db/store.ts`**

```ts
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "schema.sql"),
  "utf8",
);

export interface RunRow {
  id: number;
  inputPayload: any;
  status: "pending" | "running" | "completed" | "failed";
  recommendation: string | null;
  memoJson: any | null;
  createdAt: number;
  completedAt: number | null;
}

export class Store {
  private db: Database.Database;
  constructor(file = process.env.DEALSENSE_DB_PATH ?? "./data.sqlite") {
    this.db = new Database(file);
    this.db.exec(SCHEMA);
  }

  createRun(a: { inputPayload: unknown }): number {
    const stmt = this.db.prepare(
      `INSERT INTO runs (input_payload, created_at) VALUES (?, ?)`,
    );
    const r = stmt.run(JSON.stringify(a.inputPayload), Date.now());
    return Number(r.lastInsertRowid);
  }

  completeRun(
    id: number,
    a: { recommendation: string; memoJson: unknown; ingestedContext: unknown; thesisSnapshot: string },
  ) {
    this.db.prepare(
      `UPDATE runs SET status='completed', recommendation=?, memo_json=?, ingested_context=?, thesis_snapshot=?, completed_at=? WHERE id=?`,
    ).run(a.recommendation, JSON.stringify(a.memoJson), JSON.stringify(a.ingestedContext), a.thesisSnapshot, Date.now(), id);
  }

  failRun(id: number, message: string) {
    this.db.prepare(
      `UPDATE runs SET status='failed', recommendation=?, completed_at=? WHERE id=?`,
    ).run(`Error: ${message}`, Date.now(), id);
  }

  find(id: number): RunRow | undefined {
    return rowToRun(this.db.prepare(`SELECT * FROM runs WHERE id=?`).get(id) as any);
  }
}

function rowToRun(r: any): RunRow | undefined {
  if (!r) return undefined;
  return {
    id: r.id,
    inputPayload: r.input_payload ? JSON.parse(r.input_payload) : null,
    status: r.status,
    recommendation: r.recommendation,
    memoJson: r.memo_json ? JSON.parse(r.memo_json) : null,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  };
}
```

**Step 5: Update `DealJobData` in `src/queue/queue.ts:15-20`**

Change the interface to:

```ts
export interface DealJobData {
  runId: number;
  ingest: IngestArgs;
}
```

(Dropped: `slackChannel`, `slackThreadTs`.)

**Step 6: Run store test**

Run: `npm test -- tests/db/store.test.ts`
Expected: PASS (3/3).

**Step 7: Confirm typecheck still has only Slack-related errors**

Run: `npm run typecheck 2>&1 | grep error | head -20`
Expected: errors only in `src/slack/app.ts` and `tests/slack.render.test.ts`. Anywhere else = real bug, fix it.

**Step 8: Nuke any leftover dev sqlite file**

```bash
rm -f data.sqlite data.sqlite-shm data.sqlite-wal
```

(Schema migration is destructive; `.gitignore` already excludes `data.sqlite*`.)

**Step 9: Commit**

```bash
git add src/db/schema.sql src/db/store.ts src/queue/queue.ts tests/db/store.test.ts
git commit -m "refactor(db): make Store and DealJobData surface-agnostic"
```

---

## Task 3: Delete the Slack adapter

**Files:**
- Delete: `src/slack/app.ts`
- Delete: `src/slack/render.ts`
- Delete: `tests/slack.render.test.ts`
- Modify: `src/index.ts` — temporarily reduced to a stub (real entrypoint lands in T19)

**Step 1: Delete the files**

```bash
rm src/slack/app.ts src/slack/render.ts tests/slack.render.test.ts
rmdir src/slack
```

**Step 2: Replace `src/index.ts` with a stub**

```ts
import "dotenv/config";
import { logger } from "./log.js";

logger.info("DealSense — web surface coming online…");
// Real entrypoint added in plan task 19.
```

**Step 3: Verify clean state**

Run: `npm run typecheck`
Expected: clean (0 errors).

Run: `npm test`
Expected: 30+ tests pass, 0 fail. (Slack render test is gone; net –1 test.)

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: delete slack adapter, stub entrypoint for web surface"
```

**Wave 0 complete.** Backend is now Slack-free, schema is generic, all tests green.

---

# WAVE 1 — Scaffolds (parallel-friendly, 3 agents)

The three tasks below touch different file trees and have no data dependencies — they can run in parallel via `superpowers:subagent-driven-development` with `isolation: "worktree"`.

## Task 4: SSE pubsub bus

**Files:**
- Create: `src/web/sse.ts`
- Test: `tests/web/sse.test.ts`

**Step 1: Write failing tests**

Create `tests/web/sse.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { emit, subscribe } from "../../src/web/sse.js";

describe("SSE bus", () => {
  it("delivers events to all subscribers of a runId", () => {
    const a = vi.fn(); const b = vi.fn();
    const offA = subscribe(1, a);
    const offB = subscribe(1, b);
    emit(1, "progress", { phase: "market", done: 1, total: 5 });
    expect(a).toHaveBeenCalledWith({ event: "progress", data: { phase: "market", done: 1, total: 5 } });
    expect(b).toHaveBeenCalledWith({ event: "progress", data: { phase: "market", done: 1, total: 5 } });
    offA(); offB();
  });

  it("does not deliver events for a different runId", () => {
    const a = vi.fn();
    subscribe(1, a);
    emit(2, "progress", { phase: "market", done: 1, total: 5 });
    expect(a).not.toHaveBeenCalled();
  });

  it("unsubscribe stops delivery", () => {
    const a = vi.fn();
    const off = subscribe(1, a);
    off();
    emit(1, "progress", {});
    expect(a).not.toHaveBeenCalled();
  });
});
```

Run: `npm test -- tests/web/sse.test.ts`
Expected: FAIL (module not found).

**Step 2: Implement `src/web/sse.ts`**

```ts
export interface SseEvent {
  event: string;
  data: unknown;
}
export type Listener = (evt: SseEvent) => void;

const listeners = new Map<number, Set<Listener>>();

export function emit(runId: number, event: string, data: unknown): void {
  const set = listeners.get(runId);
  if (!set) return;
  for (const l of set) l({ event, data });
}

export function subscribe(runId: number, listener: Listener): () => void {
  let set = listeners.get(runId);
  if (!set) {
    set = new Set();
    listeners.set(runId, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) listeners.delete(runId);
  };
}
```

**Step 3: Run tests**

Run: `npm test -- tests/web/sse.test.ts`
Expected: PASS (3/3).

**Step 4: Commit**

```bash
git add src/web/sse.ts tests/web/sse.test.ts
git commit -m "feat(web): in-process SSE pubsub bus keyed by runId"
```

---

## Task 5: Express server skeleton + health endpoint

**Files:**
- Create: `src/web/server.ts`
- Create: `tests/web/server.test.ts`

**Step 1: Write failing test**

Create `tests/web/server.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createServer } from "../../src/web/server.js";

describe("web server", () => {
  it("GET /api/health returns ok", async () => {
    const app = createServer();
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
```

Run: `npm test -- tests/web/server.test.ts`
Expected: FAIL (module not found).

**Step 2: Implement `src/web/server.ts`**

```ts
import express, { type Express } from "express";

export function createServer(): Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  return app;
}
```

**Step 3: Run tests**

Run: `npm test -- tests/web/server.test.ts`
Expected: PASS (1/1).

**Step 4: Commit**

```bash
git add src/web/server.ts tests/web/server.test.ts
git commit -m "feat(web): express server skeleton with health endpoint"
```

---

## Task 6: Vite + React + Tailwind + shadcn frontend scaffold

**Files:**
- Create: `web/` (whole project)
- Modify: top-level `package.json` (add scripts)
- Modify: top-level `tsconfig.json` (exclude `web/` from backend TS build)

**Step 1: Scaffold Vite project**

```bash
npm create vite@latest web -- --template react-ts
cd web
npm install
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
npm install wouter
cd ..
```

**Step 2: Configure Tailwind in `web/tailwind.config.js`**

```js
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: "#10b981", // emerald-500
      },
    },
  },
  plugins: [],
};
```

**Step 3: Add Tailwind directives to `web/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
```

**Step 4: Configure Vite proxy in `web/vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
  },
});
```

**Step 5: Initialize shadcn/ui**

```bash
cd web
npx shadcn@latest init -d   # accepts defaults
npx shadcn@latest add button input card tabs
cd ..
```

If `shadcn@latest init` prompts interactively in non-defaults mode, answer:
- Style: Default
- Base color: Zinc
- CSS variables: Yes

**Step 6: Replace `web/src/App.tsx` with router stub**

```tsx
import { Route, Switch } from "wouter";

function Home() {
  return <main className="min-h-screen flex items-center justify-center bg-zinc-50">
    <h1 className="text-3xl font-bold">DealSense</h1>
  </main>;
}

function Run() {
  return <main className="min-h-screen p-8 bg-zinc-50">Run page placeholder</main>;
}

export default function App() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/runs/:id" component={Run} />
    </Switch>
  );
}
```

**Step 7: Update top-level `tsconfig.json` to exclude `web/`**

In `tsconfig.json`, ensure `"exclude": ["node_modules", "dist", "web"]`.

**Step 8: Add scripts to top-level `package.json`**

In the `scripts` section:

```json
"dev": "concurrently -n api,web -c blue,magenta \"tsx watch src/index.ts\" \"npm --prefix web run dev\"",
"build": "tsc -p tsconfig.json && mkdir -p dist/db && cp src/db/schema.sql dist/db/schema.sql && npm --prefix web run build",
"start": "node dist/index.js",
```

(Replaces the existing `dev`, `build`, `start`.)

**Step 9: Smoke test**

```bash
npm --prefix web run dev
```

Open `http://localhost:5173` in a browser. Expected: see "DealSense" header. Hit `Ctrl+C`.

```bash
npm test
```
Expected: All backend tests pass (frontend has no tests yet).

**Step 10: Commit**

```bash
git add -A
git commit -m "feat(web): scaffold Vite+React+Tailwind+shadcn frontend"
```

**Wave 1 complete.**

---

# WAVE 2 — Routes + Components (parallel-friendly, up to 10 agents)

After Wave 1, the API contract is fixed (from the design doc) and backend/frontend tasks no longer share files. Tasks T7–T16 can run in parallel via subagent-driven-development with `isolation: "worktree"`. The wave merges back together at the end.

**File-conflict map (verify before parallelizing):**
- T7–T11 all modify `src/web/server.ts`. **They must be serialized within the backend half.** Either: (a) run them sequentially, or (b) run them in worktrees and resolve the merge conflicts on `server.ts`.
- T12 modifies `src/queue/queue.ts` only — fully parallel.
- T13–T16 each create their own component file — fully parallel with each other and with backend tasks.

**Recommended sub-batching:**
- Backend serial chain: T7 → T8 → T9 → T10 → T11 → T12 (one agent)
- Frontend parallel: T13 + T14 + T15 + T16 (four agents)
- Total Wave 2 wall-clock = max(serial backend, longest frontend component)

## Task 7: POST /api/runs — create run + enqueue

**Files:**
- Modify: `src/web/server.ts`
- Modify: `tests/web/server.test.ts`
- Create: `src/web/routes.ts`

**Step 1: Failing test (append to `tests/web/server.test.ts`)**

```ts
import { vi } from "vitest";
vi.mock("../../src/queue/queue.js", () => ({
  dealQueue: { add: vi.fn().mockResolvedValue({ id: "job-1" }) },
}));

it("POST /api/runs creates a run and enqueues a job", async () => {
  const app = createServer();
  const res = await request(app).post("/api/runs").send({ url: "https://startup.com" });
  expect(res.status).toBe(202);
  expect(res.body.runId).toBeTypeOf("number");
});

it("POST /api/runs rejects empty url", async () => {
  const app = createServer();
  const res = await request(app).post("/api/runs").send({});
  expect(res.status).toBe(400);
  expect(res.body.error).toBe("url required");
});
```

Run: `npm test -- tests/web/server.test.ts`
Expected: FAIL.

**Step 2: Create `src/web/routes.ts`**

```ts
import { Router } from "express";
import { Store } from "../db/store.js";
import { dealQueue } from "../queue/queue.js";

export function buildRoutes(store: Store): Router {
  const r = Router();

  r.post("/runs", async (req, res) => {
    const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
    if (!url) return res.status(400).json({ error: "url required" });
    const runId = store.createRun({ inputPayload: { url } });
    await dealQueue.add("analyze", { runId, ingest: { websitePath: url } });
    return res.status(202).json({ runId });
  });

  return r;
}
```

**Step 3: Wire into `src/web/server.ts`**

```ts
import express, { type Express } from "express";
import { Store } from "../db/store.js";
import { buildRoutes } from "./routes.js";

export function createServer(store: Store = new Store()): Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api", buildRoutes(store));
  return app;
}
```

**Step 4: Test passes**

Run: `npm test -- tests/web/server.test.ts`
Expected: PASS (3/3).

**Step 5: Commit**

```bash
git add src/web/server.ts src/web/routes.ts tests/web/server.test.ts
git commit -m "feat(web): POST /api/runs creates run and enqueues job"
```

---

## Task 8: GET /api/runs/:id — snapshot

**Files:**
- Modify: `src/web/routes.ts`
- Modify: `tests/web/server.test.ts`

**Step 1: Failing test**

```ts
it("GET /api/runs/:id returns 404 for unknown id", async () => {
  const store = new Store(":memory:");
  const app = createServer(store);
  const res = await request(app).get("/api/runs/9999");
  expect(res.status).toBe(404);
});

it("GET /api/runs/:id returns snapshot for completed run", async () => {
  const store = new Store(":memory:");
  const id = store.createRun({ inputPayload: { url: "https://x.com" } });
  const memo = { recommendation: "Watch", thesis: ["a","b","c"], risks: ["r","r","r"], sections: { market: "..." } };
  store.completeRun(id, { recommendation: "Watch", memoJson: memo, ingestedContext: {}, thesisSnapshot: "" });
  const app = createServer(store);
  const res = await request(app).get(`/api/runs/${id}`);
  expect(res.status).toBe(200);
  expect(res.body.status).toBe("completed");
  expect(res.body.memo).toEqual(memo);
});
```

(Import `Store` at top of test file.)

Run: `npm test -- tests/web/server.test.ts`
Expected: FAIL on the new tests.

**Step 2: Add the route to `routes.ts`**

```ts
r.get("/runs/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "bad id" });
  const row = store.find(id);
  if (!row) return res.status(404).json({ error: "not found" });
  return res.json({
    id: row.id,
    status: row.status,
    url: row.inputPayload?.url ?? null,
    memo: row.memoJson,
  });
});
```

**Step 3: Tests pass**

Run: `npm test -- tests/web/server.test.ts`
Expected: 5/5 pass.

**Step 4: Commit**

```bash
git add src/web/routes.ts tests/web/server.test.ts
git commit -m "feat(web): GET /api/runs/:id snapshot endpoint"
```

---

## Task 9: GET /api/runs/:id/stream — SSE

**Files:**
- Modify: `src/web/routes.ts`
- Create: `tests/web/stream.test.ts`

**Step 1: Failing integration test**

Create `tests/web/stream.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { createServer as httpCreate } from "node:http";
import type { AddressInfo } from "node:net";
import { Store } from "../../src/db/store.js";
import { emit } from "../../src/web/sse.js";

vi.mock("../../src/queue/queue.js", () => ({ dealQueue: { add: vi.fn() } }));
const { createServer } = await import("../../src/web/server.js");

describe("SSE stream", () => {
  it("streams progress and complete events for a running run", async () => {
    const store = new Store(":memory:");
    const id = store.createRun({ inputPayload: { url: "https://x.com" } });
    const app = createServer(store);
    const server = httpCreate(app).listen(0);
    const port = (server.address() as AddressInfo).port;

    const res = await fetch(`http://localhost:${port}/api/runs/${id}/stream`);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    setTimeout(() => emit(id, "progress", { phase: "market", done: 1, total: 5 }), 50);
    setTimeout(() => emit(id, "complete", { memo: { recommendation: "Watch" } }), 100);

    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value);
      if (buf.includes("event: complete")) break;
    }
    server.close();

    expect(buf).toContain("event: progress");
    expect(buf).toContain('"phase":"market"');
    expect(buf).toContain("event: complete");
  }, 5000);
});
```

Run: `npm test -- tests/web/stream.test.ts`
Expected: FAIL.

**Step 2: Add SSE route to `routes.ts`**

```ts
import { subscribe } from "./sse.js";

r.get("/runs/:id/stream", (req, res) => {
  const id = Number(req.params.id);
  const row = store.find(id);
  if (!row) return res.status(404).end();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // If already complete, fire `complete` and close.
  if (row.status === "completed" && row.memoJson) {
    res.write(`event: complete\ndata: ${JSON.stringify({ memo: row.memoJson })}\n\n`);
    return res.end();
  }
  if (row.status === "failed") {
    res.write(`event: error\ndata: ${JSON.stringify({ message: row.recommendation ?? "failed" })}\n\n`);
    return res.end();
  }

  const unsubscribe = subscribe(id, ({ event, data }) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (event === "complete" || event === "error") {
      unsubscribe();
      res.end();
    }
  });

  req.on("close", () => unsubscribe());
});
```

**Step 3: Tests pass**

Run: `npm test -- tests/web/stream.test.ts`
Expected: PASS.

Run: `npm test -- tests/web/`
Expected: All web tests green.

**Step 4: Commit**

```bash
git add src/web/routes.ts tests/web/stream.test.ts
git commit -m "feat(web): SSE stream endpoint for live run progress"
```

---

## Task 10: POST /api/runs/:id/followup

**Files:**
- Modify: `src/web/routes.ts`
- Modify: `tests/web/server.test.ts`

**Step 1: Failing test**

```ts
vi.mock("../../src/agents/followup.js", () => ({
  answerFollowup: vi.fn().mockResolvedValue("answer text [verified]\n  ↳ Source: x"),
}));

it("POST /api/runs/:id/followup returns answer for completed run", async () => {
  const store = new Store(":memory:");
  const id = store.createRun({ inputPayload: { url: "https://x.com" } });
  const memo = { recommendation: "Watch", thesis: ["a","b","c"], risks: ["r","r","r"], sections: { market: "..." } };
  store.completeRun(id, { recommendation: "Watch", memoJson: memo, ingestedContext: {}, thesisSnapshot: "" });
  const app = createServer(store);
  const res = await request(app).post(`/api/runs/${id}/followup`).send({ question: "q?" });
  expect(res.status).toBe(200);
  expect(res.body.answer).toContain("[verified]");
});

it("POST /api/runs/:id/followup returns 409 for incomplete run", async () => {
  const store = new Store(":memory:");
  const id = store.createRun({ inputPayload: { url: "https://x.com" } });
  const app = createServer(store);
  const res = await request(app).post(`/api/runs/${id}/followup`).send({ question: "q?" });
  expect(res.status).toBe(409);
});
```

**Step 2: Add the route**

```ts
import { answerFollowup } from "../agents/followup.js";

r.post("/runs/:id/followup", async (req, res) => {
  const id = Number(req.params.id);
  const row = store.find(id);
  if (!row) return res.status(404).json({ error: "not found" });
  if (row.status !== "completed" || !row.memoJson)
    return res.status(409).json({ error: "run not complete" });
  const question = String(req.body?.question ?? "").trim();
  if (!question) return res.status(400).json({ error: "question required" });
  const answer = await answerFollowup({ question, memoJson: row.memoJson });
  return res.json({ answer });
});
```

**Step 3: Tests pass + commit**

```bash
npm test -- tests/web/
git add src/web/routes.ts tests/web/server.test.ts
git commit -m "feat(web): POST /api/runs/:id/followup endpoint"
```

---

## Task 11: Wire BullMQ worker → SSE bus

**Files:**
- Modify: `src/queue/queue.ts`
- Modify: `src/queue/worker.ts` (only if needed)

**Step 1: Update `startWorker` signature in `src/queue/queue.ts`**

Replace `WorkerCallbacks` and `startWorker` with:

```ts
import { emit } from "../web/sse.js";
import { Store } from "../db/store.js";

export function startWorker(store: Store) {
  const worker = new Worker<DealJobData>("dealsense", async (job) => {
    const progress: ProgressFn = async (phase, completed, total) => {
      emit(job.data.runId, "progress", { phase, done: completed, total });
    };
    try {
      const memo = await processJob(job.data.ingest, progress);
      store.completeRun(job.data.runId, {
        recommendation: memo.recommendation,
        memoJson: memo,
        ingestedContext: {},
        thesisSnapshot: "",
      });
      emit(job.data.runId, "complete", { memo });
      return memo;
    } catch (err: any) {
      const message = err?.message ?? "unknown error";
      store.failRun(job.data.runId, message);
      emit(job.data.runId, "error", { message });
      throw err;
    }
  }, { connection, concurrency: 2 });
  worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "job failed"));
  return worker;
}
```

**Step 2: Update existing orchestrator/queue tests to match new signature**

Find tests that call `startWorker({ onProgress, onComplete })`:

```bash
grep -rn "startWorker" tests/
```

Update each call site to use `startWorker(store)` instead. If tests break, that's the signal — fix them by mocking `emit` and `store.completeRun` calls instead of the old callback object.

**Step 3: Run all tests**

Run: `npm test`
Expected: ≥35/35 passing (original 30 + store + 3 SSE + 5 server + 1 stream).

Run: `npm run typecheck`
Expected: clean.

**Step 4: Commit**

```bash
git add src/queue/queue.ts src/queue/worker.ts tests/
git commit -m "feat(queue): emit progress/complete events to SSE bus"
```

---

## Task 12: Frontend `api.ts` typed client

**Files:**
- Create: `web/src/lib/api.ts`
- Create: `web/src/types.ts`

**Step 1: Create `web/src/types.ts`**

```ts
export type Recommendation = "Pass" | "Watch" | "Take Meeting" | "Invest";
export type Phase = "ingestion" | "market" | "founder" | "product" | "tokenomics" | "risk" | "memo";
export interface Memo {
  recommendation: Recommendation;
  thesis: string[];      // length 3
  risks: string[];       // length 3
  sections: Record<string, string>;
}
export type RunStatus = "pending" | "running" | "completed" | "failed";
export interface RunSnapshot {
  id: number;
  status: RunStatus;
  url: string | null;
  memo: Memo | null;
}
```

**Step 2: Create `web/src/lib/api.ts`**

```ts
import type { RunSnapshot } from "../types";

export async function createRun(url: string): Promise<{ runId: number }> {
  const res = await fetch("/api/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
  return res.json();
}

export async function getRun(id: number): Promise<RunSnapshot> {
  const res = await fetch(`/api/runs/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function postFollowup(id: number, question: string): Promise<{ answer: string }> {
  const res = await fetch(`/api/runs/${id}/followup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
  return res.json();
}
```

**Step 3: Smoke verify TS compiles**

```bash
cd web && npx tsc --noEmit && cd ..
```

**Step 4: Commit**

```bash
git add web/src/types.ts web/src/lib/api.ts
git commit -m "feat(web): typed API client + shared types"
```

---

## Task 13: useRunStream hook

**Files:**
- Create: `web/src/lib/useRunStream.ts`

**Step 1: Implement the hook**

```ts
import { useEffect, useState } from "react";
import { getRun } from "./api";
import type { Memo, Phase } from "../types";

export type AgentKey = "ingestion" | "market" | "founder" | "product" | "tokenomics" | "risk" | "memo";

export type RunState =
  | { status: "loading" }
  | { status: "progress"; phase: Phase; done: number; total: number; doneAgents: Set<AgentKey> }
  | { status: "completed"; memo: Memo }
  | { status: "error"; message: string };

const SPECIALISTS: AgentKey[] = ["market", "founder", "product", "tokenomics", "risk"];

export function useRunStream(runId: number): RunState {
  const [state, setState] = useState<RunState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    let es: EventSource | null = null;

    (async () => {
      try {
        const snap = await getRun(runId);
        if (cancelled) return;

        if (snap.status === "completed" && snap.memo) {
          setState({ status: "completed", memo: snap.memo });
          return;
        }
        if (snap.status === "failed") {
          setState({ status: "error", message: "Run failed" });
          return;
        }

        setState({ status: "progress", phase: "ingestion", done: 0, total: 1, doneAgents: new Set() });
        es = new EventSource(`/api/runs/${runId}/stream`);

        es.addEventListener("progress", (e: MessageEvent) => {
          const d = JSON.parse(e.data) as { phase: Phase; done: number; total: number };
          setState((prev) => {
            if (prev.status !== "progress") return prev;
            const doneAgents = new Set(prev.doneAgents);
            if (SPECIALISTS.includes(d.phase as AgentKey)) doneAgents.add(d.phase as AgentKey);
            return { status: "progress", phase: d.phase, done: d.done, total: d.total, doneAgents };
          });
        });

        es.addEventListener("complete", (e: MessageEvent) => {
          const d = JSON.parse(e.data) as { memo: Memo };
          setState({ status: "completed", memo: d.memo });
          es?.close();
        });

        es.addEventListener("error", (e: MessageEvent) => {
          const message = (() => {
            try { return JSON.parse((e as any).data ?? "{}").message ?? "stream error"; }
            catch { return "stream error"; }
          })();
          setState({ status: "error", message });
          es?.close();
        });
      } catch (err: any) {
        if (!cancelled) setState({ status: "error", message: err?.message ?? "load failed" });
      }
    })();

    return () => { cancelled = true; es?.close(); };
  }, [runId]);

  return state;
}
```

**Step 2: TS compiles + commit**

```bash
cd web && npx tsc --noEmit && cd ..
git add web/src/lib/useRunStream.ts
git commit -m "feat(web): useRunStream hook (snapshot + SSE → discriminated union)"
```

---

## Task 14: Home page

**Files:**
- Create: `web/src/pages/Home.tsx`

**Step 1: Implement**

```tsx
import { useState } from "react";
import { useLocation } from "wouter";
import { createRun } from "../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function Home() {
  const [, navigate] = useLocation();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { runId } = await createRun(url);
      navigate(`/runs/${runId}`);
    } catch (err: any) {
      setError(err?.message ?? "Failed to start run");
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 px-6">
      <div className="w-full max-w-2xl">
        <h1 className="text-5xl font-bold tracking-tight text-zinc-900">DealSense</h1>
        <p className="mt-3 text-zinc-600 text-lg">
          Decasonic's AI venture analyst — paste a startup URL, get a thesis-aligned investment memo in ~90 seconds.
        </p>
        <form onSubmit={submit} className="mt-10 flex gap-3">
          <Input
            type="url"
            placeholder="https://startup.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={submitting}
            className="flex-1 h-12 text-base"
            required
          />
          <Button type="submit" disabled={submitting || !url} className="h-12 px-6 bg-emerald-600 hover:bg-emerald-700">
            {submitting ? "Starting…" : "Analyze"}
          </Button>
        </form>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <p className="mt-8 text-xs text-zinc-400">
          Confidence-tiered analysis: every claim tagged [verified], [inferred], or [speculative].
        </p>
      </div>
    </main>
  );
}
```

**Step 2: Commit**

```bash
git add web/src/pages/Home.tsx
git commit -m "feat(web): Home page with URL input"
```

---

## Task 15: AgentProgress component (the hero moment)

**Files:**
- Create: `web/src/components/AgentProgress.tsx`

**Step 1: Implement**

```tsx
import type { AgentKey, RunState } from "../lib/useRunStream";

const AGENTS: { key: AgentKey; label: string; emoji: string }[] = [
  { key: "market",     label: "Market Map",    emoji: "🗺️" },
  { key: "founder",    label: "Founder Signal", emoji: "👤" },
  { key: "product",    label: "Product",        emoji: "🛠️" },
  { key: "tokenomics", label: "Tokenomics",     emoji: "🪙" },
  { key: "risk",       label: "Trust & Risk",   emoji: "🛡️" },
];

interface Props { state: Extract<RunState, { status: "progress" }>; url: string | null }

export function AgentProgress({ state, url }: Props) {
  const phaseLabel =
    state.phase === "ingestion" ? "Ingesting inputs"
    : state.phase === "memo" ? "Synthesizing memo"
    : `Agents: ${state.doneAgents.size}/5 (${state.phase} done)`;

  return (
    <section className="w-full max-w-5xl mx-auto px-6 py-16">
      <div className="text-center">
        {url && (
          <span className="inline-block px-3 py-1 rounded-full bg-zinc-200 text-xs font-medium text-zinc-700 mb-4">
            {url}
          </span>
        )}
        <h2 className="text-2xl font-semibold text-zinc-900">{phaseLabel}</h2>
        <p className="text-sm text-zinc-500 mt-1">~90 seconds total</p>
      </div>

      <div className="grid grid-cols-5 gap-4 mt-12">
        {AGENTS.map((a) => {
          const done = state.doneAgents.has(a.key);
          const running = !done && state.phase !== "ingestion";
          return (
            <div
              key={a.key}
              className={`rounded-xl border p-4 text-center transition-all duration-500
                ${done
                  ? "bg-emerald-50 border-emerald-300 text-zinc-900"
                  : running
                  ? "bg-white border-emerald-200 text-zinc-900 animate-pulse"
                  : "bg-zinc-50 border-zinc-200 text-zinc-400"
                }`}
            >
              <div className="text-3xl">{a.emoji}</div>
              <div className="text-sm font-medium mt-2">{a.label}</div>
              <div className="text-xs mt-1">
                {done ? "✓ Complete" : running ? "Analyzing…" : "Pending"}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-12 h-1.5 bg-zinc-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-500 transition-all duration-700"
          style={{ width: `${(state.doneAgents.size / 5) * 100}%` }}
        />
      </div>
    </section>
  );
}
```

**Step 2: Commit**

```bash
git add web/src/components/AgentProgress.tsx
git commit -m "feat(web): AgentProgress component — 5 cards that light up"
```

---

## Task 16: RecommendationCard + MemoSections + FollowupChat components

Three components in one task because they're each <60 lines and tightly cohesive.

**Files:**
- Create: `web/src/components/RecommendationCard.tsx`
- Create: `web/src/components/MemoSections.tsx`
- Create: `web/src/components/FollowupChat.tsx`

**Step 1: `RecommendationCard.tsx`**

```tsx
import type { Memo } from "../types";

const COLORS: Record<Memo["recommendation"], { bg: string; text: string; ring: string }> = {
  "Pass":         { bg: "bg-red-50",     text: "text-red-700",     ring: "ring-red-300" },
  "Watch":        { bg: "bg-amber-50",   text: "text-amber-700",   ring: "ring-amber-300" },
  "Take Meeting": { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-300" },
  "Invest":       { bg: "bg-violet-50",  text: "text-violet-700",  ring: "ring-violet-300" },
};

export function RecommendationCard({ memo }: { memo: Memo }) {
  const c = COLORS[memo.recommendation];
  return (
    <section className={`w-full max-w-4xl mx-auto px-6 py-12 rounded-2xl ring-1 ${c.bg} ${c.ring}`}>
      <div className="text-center">
        <div className="text-xs uppercase tracking-widest text-zinc-500">Recommendation</div>
        <h1 className={`text-6xl font-bold mt-2 ${c.text}`}>{memo.recommendation.toUpperCase()}</h1>
      </div>
      <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 mb-3">Thesis</h3>
          <ul className="space-y-2 text-sm text-zinc-700">
            {memo.thesis.map((b, i) => <li key={i} className="flex gap-2"><span>•</span><span>{b}</span></li>)}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 mb-3">Risks</h3>
          <ul className="space-y-2 text-sm text-zinc-700">
            {memo.risks.map((b, i) => <li key={i} className="flex gap-2"><span>•</span><span>{b}</span></li>)}
          </ul>
        </div>
      </div>
    </section>
  );
}
```

**Step 2: `MemoSections.tsx`**

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Memo } from "../types";

const TABS = [
  { key: "market",     label: "Market Map" },
  { key: "founder",    label: "Founder Signal" },
  { key: "product",    label: "Product" },
  { key: "tokenomics", label: "Tokenomics" },
  { key: "risk",       label: "Trust & Risk" },
];

const PILL = {
  verified:    "inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700 mx-0.5",
  inferred:    "inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 mx-0.5",
  speculative: "inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700 mx-0.5",
};

function renderTagged(text: string) {
  // Replace [verified] / [inferred] / [speculative] tags with styled spans
  const parts = text.split(/(\[verified\]|\[inferred\]|\[speculative\])/g);
  return parts.map((p, i) => {
    if (p === "[verified]")    return <span key={i} className={PILL.verified}>verified</span>;
    if (p === "[inferred]")    return <span key={i} className={PILL.inferred}>inferred</span>;
    if (p === "[speculative]") return <span key={i} className={PILL.speculative}>speculative</span>;
    return <span key={i}>{p}</span>;
  });
}

export function MemoSections({ memo }: { memo: Memo }) {
  return (
    <section className="w-full max-w-4xl mx-auto px-6 py-8">
      <Tabs defaultValue="market" className="w-full">
        <TabsList className="grid grid-cols-5 w-full">
          {TABS.map((t) => <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>)}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t.key} value={t.key} className="mt-4">
            <div className="prose prose-sm max-w-none whitespace-pre-wrap text-zinc-800">
              {renderTagged(memo.sections[t.key] ?? "(no output)")}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}
```

**Step 3: `FollowupChat.tsx`**

```tsx
import { useState } from "react";
import { postFollowup } from "../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface QA { q: string; a: string }

export function FollowupChat({ runId }: { runId: number }) {
  const [history, setHistory] = useState<QA[]>([]);
  const [q, setQ] = useState("");
  const [pending, setPending] = useState(false);

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    const question = q;
    setQ("");
    setPending(true);
    try {
      const { answer } = await postFollowup(runId, question);
      setHistory((h) => [...h, { q: question, a: answer }]);
    } catch (err: any) {
      setHistory((h) => [...h, { q: question, a: `Error: ${err?.message ?? "request failed"}` }]);
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="w-full max-w-4xl mx-auto px-6 py-8 border-t border-zinc-200">
      <h3 className="text-sm font-semibold text-zinc-900 mb-4">Ask about this memo</h3>
      <div className="space-y-3 mb-4">
        {history.map((qa, i) => (
          <div key={i} className="space-y-1">
            <div className="text-sm font-medium text-zinc-900">Q: {qa.q}</div>
            <div className="text-sm text-zinc-700 whitespace-pre-wrap pl-3 border-l-2 border-emerald-300">{qa.a}</div>
          </div>
        ))}
      </div>
      <form onSubmit={ask} className="flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="What's the token unlock schedule?" disabled={pending} />
        <Button type="submit" disabled={pending || !q.trim()}>{pending ? "…" : "Ask"}</Button>
      </form>
    </section>
  );
}
```

**Step 4: Smoke build**

```bash
cd web && npx tsc --noEmit && cd ..
```

**Step 5: Commit**

```bash
git add web/src/components/
git commit -m "feat(web): RecommendationCard, MemoSections, FollowupChat"
```

**Wave 2 complete.**

---

# WAVE 3 — Integration (sequential, single agent)

## Task 17: Run.tsx — wire all components together

**Files:**
- Create: `web/src/pages/Run.tsx`
- Modify: `web/src/App.tsx` (replace Run placeholder import)

**Step 1: Implement `Run.tsx`**

```tsx
import { useParams } from "wouter";
import { useEffect, useState } from "react";
import { useRunStream } from "../lib/useRunStream";
import { getRun } from "../lib/api";
import { AgentProgress } from "../components/AgentProgress";
import { RecommendationCard } from "../components/RecommendationCard";
import { MemoSections } from "../components/MemoSections";
import { FollowupChat } from "../components/FollowupChat";

export function Run() {
  const params = useParams<{ id: string }>();
  const runId = Number(params.id);
  const state = useRunStream(runId);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    getRun(runId).then((s) => setUrl(s.url)).catch(() => {});
  }, [runId]);

  if (state.status === "loading") {
    return <main className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="text-zinc-500">Loading…</div>
    </main>;
  }

  if (state.status === "error") {
    return <main className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="max-w-xl px-6 py-8 bg-red-50 border border-red-200 rounded-lg">
        <h2 className="font-semibold text-red-900">Something went wrong</h2>
        <p className="mt-2 text-sm text-red-700">{state.message}</p>
        <a href="/" className="mt-4 inline-block text-sm text-emerald-700 underline">Try another URL</a>
      </div>
    </main>;
  }

  if (state.status === "progress") {
    return <main className="min-h-screen bg-zinc-50">
      <AgentProgress state={state} url={url} />
    </main>;
  }

  return <main className="min-h-screen bg-zinc-50 py-8">
    <RecommendationCard memo={state.memo} />
    <MemoSections memo={state.memo} />
    <FollowupChat runId={runId} />
  </main>;
}
```

**Step 2: Update `App.tsx`**

```tsx
import { Route, Switch } from "wouter";
import { Home } from "./pages/Home";
import { Run } from "./pages/Run";

export default function App() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/runs/:id" component={Run} />
      <Route><div className="p-8">404</div></Route>
    </Switch>
  );
}
```

**Step 3: Smoke verify**

```bash
cd web && npx tsc --noEmit && cd ..
```

**Step 4: Commit**

```bash
git add web/src/pages/Run.tsx web/src/App.tsx
git commit -m "feat(web): Run page wires AgentProgress + Recommendation + Memo + Followup"
```

---

## Task 18: Backend entrypoint — start Express + worker, serve built frontend

**Files:**
- Modify: `src/index.ts`
- Create: `src/web/static.ts`

**Step 1: Static-serving helper `src/web/static.ts`**

```ts
import express, { type Express } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(here, "../../web/dist");

export function attachStatic(app: Express): void {
  app.use(express.static(webDist));
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(path.join(webDist, "index.html"));
  });
}
```

(Catch-all serves `index.html` for any non-`/api` path so client-side routes like `/runs/42` work on refresh.)

**Step 2: Replace `src/index.ts`**

```ts
import "dotenv/config";
import { createServer } from "./web/server.js";
import { attachStatic } from "./web/static.js";
import { Store } from "./db/store.js";
import { startWorker } from "./queue/queue.js";
import { logger } from "./log.js";

const store = new Store();
const app = createServer(store);

if (process.env.NODE_ENV === "production") attachStatic(app);

startWorker(store);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => logger.info({ port }, "DealSense online"));
```

**Step 3: Test full local flow**

In one terminal:
```bash
redis-cli ping  # PONG
npm run dev
```

In a browser, open `http://localhost:5173`. Submit `https://www.io.net` (or any test URL). Expected:
- Navigate to `/runs/1`
- See 5 agent cards
- Cards light up over ~90s
- Recommendation card appears
- Tabs work, follow-up chat works

If anything fails, debug and fix.

**Step 4: Test production build**

```bash
npm run build
NODE_ENV=production npm start
```

Open `http://localhost:3000` (single port now). Repeat the smoke flow. Refresh `/runs/1` — should still render correctly (snapshot path).

**Step 5: Commit**

```bash
git add src/index.ts src/web/static.ts
git commit -m "feat(web): full entrypoint — Express + worker + static frontend"
```

---

## Task 19: Update README, CLAUDE.md, learnings.md

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `learnings.md`
- Modify: `short_term_memory.md`

**Step 1: Replace README "Slack app setup" + "Run locally" sections** with:

```markdown
## Run locally

Requires Node 20+, Redis, an OpenAI key.

```bash
cp .env.example .env  # fill in OPENAI_API_KEY
redis-server &
npm install
npm --prefix web install
npm run dev           # backend :3000 + vite :5173
```

Open http://localhost:5173 — paste a startup URL and click Analyze.

For the demo (single port, single binary):
```bash
npm run build
NODE_ENV=production npm start
# open http://localhost:3000
```

## Pre-demo checklist

- [ ] `redis-cli ping` → PONG
- [ ] `npm run build && NODE_ENV=production npm start`
- [ ] Open http://localhost:3000
- [ ] Drop a known-good URL → memo lands in <120s
- [ ] Verify recommendation, thesis bullets, risks, all 5 sections, follow-up chat
```

**Step 2: Update `CLAUDE.md`** — replace the Slack-first architecture line with:

```markdown
## Architecture (one-liner)

`POST /api/runs` (web) → BullMQ → Orchestrator → Agent 1 (Ingestion) → Agents 2-6 in parallel → Agent 7 (Memo synthesis) → SSE stream → Browser

Every factual claim is tagged `[verified]` / `[inferred]` / `[speculative]`. The Decasonic thesis lives in `config/thesis.md`.

## Tech stack

- Node 20 + TypeScript strict
- `express` (HTTP + SSE), `bullmq` + `ioredis`, `better-sqlite3`, `pdf-parse@2`, `cheerio`, `undici`, `zod`, `pino`
- `openai` (gpt-5-mini for specialists, gpt-5 for memo synthesis)
- Frontend: Vite + React + TypeScript + Tailwind + shadcn/ui + wouter
- `vitest` (all LLM calls mocked in tests), `supertest` for HTTP route tests
```

**Step 3: Append a "Completed Work" entry in `CLAUDE.md`:**

```markdown
### 2026-04-29 — Web surface (replaces Slack)
- Localhost web app for live VC-pitch demos
- Express + SSE backend (POST /api/runs, GET /api/runs/:id, GET .../stream, POST .../followup)
- Vite + React + Tailwind + shadcn frontend with 3 visual states (loading/progress/completed)
- AgentProgress component animates 5 agents lighting up as they complete in parallel
- Inline confidence pills ([verified] green, [inferred] yellow, [speculative] red)
- Schema migration: dropped Slack-specific columns, persistence is now surface-agnostic
- Decisions: SSE over WebSocket, in-process EventEmitter bus (no Redis pub/sub), wouter over react-router, Tailwind transitions over Framer Motion
```

**Step 4: Append to `learnings.md`** any non-obvious gotchas you hit during implementation. Use the standard format with `Ref:`, `What:`, `Why it matters:`, `Fix/Pattern:`. Examples that may apply:
- shadcn aliases (`@/components/ui/*`) requiring `vite.config.ts` + `tsconfig.json` path setup
- SSE behind Vite dev proxy needing `proxyTimeout: 0`
- Express 5 vs 4 catch-all-route syntax differences (`/^\/(?!api).*/` regex form)

**Step 5: Update `short_term_memory.md`** — add a new entry; if total entries exceed 5, summarize the oldest into `long_term_memory.md` first.

**Step 6: Commit**

```bash
git add README.md CLAUDE.md learnings.md short_term_memory.md long_term_memory.md
git commit -m "docs: web surface — README, CLAUDE.md, learnings, memory"
```

---

## Task 20: Final smoke test + cleanup

**Step 1: Full clean rebuild**

```bash
rm -rf node_modules web/node_modules dist web/dist data.sqlite*
npm install
npm --prefix web install
npm run typecheck    # clean
npm test             # all green
npm run build        # clean
```

**Step 2: End-to-end demo**

```bash
redis-cli ping
NODE_ENV=production npm start
```

Open `http://localhost:3000`. Run **3 different URLs** through the system to confirm:
- A real Web3 startup site (e.g. `https://www.io.net`)
- A non-Web3 startup site (e.g. `https://stripe.com` — should still work, may yield "Pass" with weak fit)
- A garbage URL (`https://example.com`) — should fail gracefully with the red error card

**Step 3: Verify the permalink trick** (key demo move)

After a successful run, **copy the `/runs/N` URL**, open it in a new tab. Should render the completed memo immediately from snapshot, no SSE.

**Step 4: Final commit if anything was tweaked**

```bash
git status
# if clean, you're done
```

**Step 5: Update `short_term_memory.md`** with the final shipping entry.

---

# Done

Final state:
- ✅ Slack adapter deleted, schema migrated
- ✅ Express + SSE backend with 4 routes
- ✅ Vite + React + Tailwind + shadcn frontend
- ✅ Three visual states on `/runs/:id`
- ✅ Inline confidence pills
- ✅ Permalink-safe routing
- ✅ ~36 backend tests passing
- ✅ Single-binary production build

**Test count target:** ~36 passing (30 original + Store 3 + SSE 3 + server 5 + stream 1, minus 1 deleted Slack render test, minus the 30 number being approximate).

**Demo URL:** `http://localhost:3000` after `npm run build && NODE_ENV=production npm start`.

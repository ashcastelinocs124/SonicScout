# DealSense Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build DealSense — a Slack-first multi-agent venture analyst for Decasonic that turns startup inputs (deck, site, LinkedIn, tokenomics, GitHub, news) into a thesis-aligned investment memo with `Pass / Watch / Take Meeting / Invest` recommendation.

**Architecture:** TypeScript Node service. Slack Bolt receives `/dealsense`, enqueues a BullMQ job, orchestrator runs Agent 1 (Ingestion) then fans out to Agents 2–6 (Market/Founder/Product/Tokenomics/Risk) in parallel, Agent 7 synthesizes a memo, results post to Slack thread. SQLite persists runs for follow-up Q&A. Confidence tiering (`[verified]`/`[inferred]`/`[speculative]`) is enforced via prompt + post-processor. Static `config/thesis.md` is injected per-agent.

**Tech Stack:**
- Node 20 + TypeScript (strict)
- `@slack/bolt` (Slack app framework, async slash command pattern)
- `bullmq` + `ioredis` (job queue)
- `@anthropic-ai/sdk` (Claude — Sonnet 4.6 for specialists, Opus 4.7 for Memo synthesis)
- `pdf-parse` (deck/whitepaper extraction)
- `cheerio` + `undici` (web scraping)
- `better-sqlite3` (run persistence)
- `zod` (LLM output schema validation)
- `vitest` + `msw` (tests + HTTP mocking)
- `pino` (structured logs)

**Repo layout (created in Task 1):**
```
sonicscout/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .env.example
├── .gitignore
├── config/
│   └── thesis.md            # Decasonic thesis (hand-written)
├── src/
│   ├── index.ts             # entrypoint: starts Slack app + worker
│   ├── slack/
│   │   ├── app.ts           # Bolt app, slash + thread handlers
│   │   └── render.ts        # memo → Slack blocks
│   ├── queue/
│   │   ├── queue.ts         # BullMQ producer
│   │   └── worker.ts        # BullMQ consumer → orchestrator
│   ├── orchestrator/
│   │   └── run.ts           # ingestion → fan-out → synthesis
│   ├── agents/
│   │   ├── llm.ts           # Anthropic wrapper (prompt caching, retries)
│   │   ├── thesis.ts        # load+slice thesis.md
│   │   ├── tiering.ts       # confidence-tag post-processor
│   │   ├── ingestion.ts     # Agent 1
│   │   ├── market.ts        # Agent 2
│   │   ├── founder.ts       # Agent 3
│   │   ├── product.ts       # Agent 4
│   │   ├── tokenomics.ts    # Agent 5
│   │   ├── risk.ts          # Agent 6
│   │   └── memo.ts          # Agent 7
│   ├── ingest/
│   │   ├── pdf.ts           # pdf-parse wrapper
│   │   ├── web.ts           # fetch + cheerio
│   │   └── linkedin.ts      # public profile scrape (degrade-on-block)
│   ├── db/
│   │   ├── schema.sql
│   │   └── store.ts         # better-sqlite3 wrapper
│   ├── types.ts             # shared zod schemas + TS types
│   └── log.ts               # pino instance
├── tests/
│   ├── fixtures/
│   │   ├── synapse-deck.pdf
│   │   └── synapse-site.html
│   ├── agents/*.test.ts
│   ├── orchestrator.test.ts
│   └── e2e.test.ts
└── docs/
    └── plans/...
```

---

## Task 1: Project scaffolding + tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example`, `.gitignore`, `src/index.ts`, `src/log.ts`, `tests/smoke.test.ts`

**Step 1: Write the failing smoke test**

Create `tests/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { logger } from "../src/log.js";

describe("smoke", () => {
  it("logger exists", () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe("function");
  });
});
```

**Step 2: Initialize Node + TS + deps**

```bash
cd /Users/ash/Desktop/sonicscout
npm init -y
npm pkg set type="module"
npm pkg set scripts.dev="tsx watch src/index.ts"
npm pkg set scripts.build="tsc -p tsconfig.json"
npm pkg set scripts.start="node dist/index.js"
npm pkg set scripts.test="vitest run"
npm pkg set scripts.test:watch="vitest"
npm pkg set scripts.typecheck="tsc -p tsconfig.json --noEmit"

npm i @slack/bolt @anthropic-ai/sdk bullmq ioredis pdf-parse cheerio undici better-sqlite3 zod pino dotenv
npm i -D typescript tsx vitest @types/node @types/better-sqlite3 @types/pdf-parse msw
```

**Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

**Step 4: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], testTimeout: 15_000 },
});
```

**Step 5: Write `.gitignore` and `.env.example`**

`.gitignore`:
```
node_modules
dist
.env
.env.local
data.sqlite*
.DS_Store
```

`.env.example`:
```
SLACK_BOT_TOKEN=
SLACK_SIGNING_SECRET=
SLACK_APP_TOKEN=
ANTHROPIC_API_KEY=
REDIS_URL=redis://localhost:6379
DEALSENSE_DB_PATH=./data.sqlite
LOG_LEVEL=info
```

**Step 6: Write `src/log.ts`**

```ts
import pino from "pino";
export const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });
```

**Step 7: Run typecheck + test**

```bash
npm run typecheck
npm test
```
Expected: typecheck passes; smoke test passes.

**Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold node+ts project with vitest, slack/bolt, anthropic, bullmq"
```

---

## Task 2: Thesis loader + slice

**Files:**
- Create: `config/thesis.md`, `src/agents/thesis.ts`, `tests/agents/thesis.test.ts`

**Step 1: Write `config/thesis.md`**

```markdown
## Market beliefs
- AI agents need crypto rails for autonomous payments
- Consumer crypto is fatigued; infra + agentic apps win 2026–2028
- Decentralized compute (GPU, inference) is a thesis-fit category

## Founder filters
- Strong preference for technical founders shipping in public
- Skeptical of repeat-founder solo CEOs without a CTO
- Prior Anthropic / OpenAI / DeepMind / a16z crypto / Paradigm signals weighted positively

## Token stance
- Token only justified if it solves a coordination/incentive problem unsolvable off-chain
- Equity-only Web3 x AI startups are acceptable; tokenization is not required for thesis fit

## Anti-patterns (auto-flag, escalate in Trust & Risk)
- "AI + blockchain" with no concrete on-chain interaction
- Tokens used purely for fundraising
- Anonymous founding teams with no doxxed credibility
- Team allocation > 30% with cliff < 12 months
```

**Step 2: Write the failing test**

`tests/agents/thesis.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { loadThesis, sliceThesis } from "../../src/agents/thesis.js";

describe("thesis", () => {
  it("loads all sections", async () => {
    const t = await loadThesis();
    expect(t.market).toMatch(/AI agents need crypto rails/);
    expect(t.founder).toMatch(/technical founders/);
    expect(t.token).toMatch(/coordination\/incentive/);
    expect(t.antiPatterns).toMatch(/auto-flag/);
  });

  it("slice returns relevant section for an agent", async () => {
    const t = await loadThesis();
    expect(sliceThesis(t, "market")).toContain("AI agents need crypto rails");
    expect(sliceThesis(t, "founder")).toContain("technical founders");
  });
});
```

**Step 3: Run, see fail**

```bash
npm test -- tests/agents/thesis.test.ts
```
Expected: FAIL — module not found.

**Step 4: Write `src/agents/thesis.ts`**

```ts
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export interface Thesis {
  market: string;
  founder: string;
  token: string;
  antiPatterns: string;
  full: string;
}

export type AgentKey = "market" | "founder" | "product" | "token" | "risk" | "memo";

const DEFAULT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../config/thesis.md",
);

export async function loadThesis(filePath = DEFAULT_PATH): Promise<Thesis> {
  const full = await readFile(filePath, "utf8");
  const grab = (heading: string): string => {
    const re = new RegExp(`##\\s+${heading}[\\s\\S]*?(?=\\n##\\s|$)`, "i");
    return (full.match(re)?.[0] ?? "").trim();
  };
  return {
    market: grab("Market beliefs"),
    founder: grab("Founder filters"),
    token: grab("Token stance"),
    antiPatterns: grab("Anti-patterns"),
    full,
  };
}

export function sliceThesis(t: Thesis, agent: AgentKey): string {
  switch (agent) {
    case "market": return t.market;
    case "founder": return t.founder;
    case "product": return [t.market, t.token].join("\n\n");
    case "token": return [t.token, t.antiPatterns].join("\n\n");
    case "risk": return t.antiPatterns;
    case "memo": return t.full;
  }
}
```

**Step 5: Run test, expect pass**

```bash
npm test -- tests/agents/thesis.test.ts
```

**Step 6: Commit**

```bash
git add config/thesis.md src/agents/thesis.ts tests/agents/thesis.test.ts
git commit -m "feat(thesis): static thesis.md loader with per-agent slicing"
```

---

## Task 3: Confidence-tier post-processor

**Files:**
- Create: `src/agents/tiering.ts`, `tests/agents/tiering.test.ts`

**Step 1: Failing test** — `tests/agents/tiering.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { stripUnverified, countTiers } from "../../src/agents/tiering.js";

describe("tiering", () => {
  it("downgrades [verified] without a source to [speculative]", () => {
    const input = "Founder was at Anthropic [verified] (no source).";
    expect(stripUnverified(input)).toContain("[speculative]");
  });

  it("preserves [verified] when a URL or 'Source:' line follows", () => {
    const input = "Founder was at Anthropic [verified]\n  ↳ Source: https://linkedin.com/in/x";
    expect(stripUnverified(input)).toContain("[verified]");
  });

  it("counts tiers across a memo", () => {
    const memo = "a [verified]\nb [inferred]\nc [speculative]\nd [verified]";
    expect(countTiers(memo)).toEqual({ verified: 2, inferred: 1, speculative: 1 });
  });
});
```

**Step 2: Implement** `src/agents/tiering.ts`:

```ts
const URL_OR_SOURCE = /(https?:\/\/\S+|Source:\s*\S+|↳\s*\S+)/i;

export function stripUnverified(text: string): string {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    if (!line.includes("[verified]")) return line;
    const window = [line, lines[i + 1] ?? "", lines[i + 2] ?? ""].join("\n");
    if (URL_OR_SOURCE.test(window) && !/no source/i.test(window)) return line;
    return line.replace("[verified]", "[speculative]");
  }).join("\n");
}

export interface TierCounts { verified: number; inferred: number; speculative: number }

export function countTiers(text: string): TierCounts {
  const count = (tag: string) => (text.match(new RegExp(`\\[${tag}\\]`, "g")) ?? []).length;
  return {
    verified: count("verified"),
    inferred: count("inferred"),
    speculative: count("speculative"),
  };
}
```

**Step 3: Run, expect pass.** **Step 4: Commit:**
```bash
git add -A && git commit -m "feat(tiering): post-processor strips unsourced [verified] tags"
```

---

## Task 4: LLM wrapper (Anthropic + prompt caching + retries)

**Files:**
- Create: `src/agents/llm.ts`, `src/types.ts`, `tests/agents/llm.test.ts`

**Step 1: Failing test** — `tests/agents/llm.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { callLLM } from "../../src/agents/llm.js";

vi.mock("@anthropic-ai/sdk", () => {
  const create = vi.fn();
  class Anthropic { messages = { create }; }
  return { default: Anthropic, __mock: { create } };
});

const sdk = await import("@anthropic-ai/sdk") as any;

describe("callLLM", () => {
  beforeEach(() => sdk.__mock.create.mockReset());

  it("returns text content from a successful call", async () => {
    sdk.__mock.create.mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
    const out = await callLLM({ system: "s", user: "u", model: "claude-sonnet-4-6" });
    expect(out).toBe("ok");
  });

  it("retries on 429 then succeeds", async () => {
    sdk.__mock.create
      .mockRejectedValueOnce(Object.assign(new Error("rate"), { status: 429 }))
      .mockResolvedValueOnce({ content: [{ type: "text", text: "ok2" }] });
    const out = await callLLM({ system: "s", user: "u", model: "claude-sonnet-4-6" });
    expect(out).toBe("ok2");
    expect(sdk.__mock.create).toHaveBeenCalledTimes(2);
  });
});
```

**Step 2: Implement** `src/agents/llm.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../log.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface LLMArgs {
  system: string;
  user: string;
  model: "claude-sonnet-4-6" | "claude-opus-4-7";
  maxTokens?: number;
  cacheSystem?: boolean;
}

export async function callLLM(args: LLMArgs, attempt = 0): Promise<string> {
  try {
    const res = await client.messages.create({
      model: args.model,
      max_tokens: args.maxTokens ?? 2000,
      system: args.cacheSystem
        ? [{ type: "text", text: args.system, cache_control: { type: "ephemeral" } }]
        : args.system,
      messages: [{ role: "user", content: args.user }],
    });
    const block = res.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") throw new Error("no text block in response");
    return block.text;
  } catch (err: any) {
    const status = err?.status;
    if ((status === 429 || status >= 500) && attempt < 3) {
      const ms = 500 * 2 ** attempt;
      logger.warn({ status, attempt, ms }, "llm retry");
      await new Promise((r) => setTimeout(r, ms));
      return callLLM(args, attempt + 1);
    }
    throw err;
  }
}
```

`src/types.ts` — shared zod schemas:
```ts
import { z } from "zod";

export const Recommendation = z.enum(["Pass", "Watch", "Take Meeting", "Invest"]);
export type Recommendation = z.infer<typeof Recommendation>;

export const AgentOutput = z.object({
  agent: z.string(),
  summary: z.string(),
  bullets: z.array(z.string()),
  flags: z.array(z.string()).default([]),
  score: z.number().min(0).max(10).optional(),
});
export type AgentOutput = z.infer<typeof AgentOutput>;

export const Memo = z.object({
  recommendation: Recommendation,
  thesis: z.array(z.string()).length(3),
  risks: z.array(z.string()).length(3),
  sections: z.record(z.string(), z.string()),
});
export type Memo = z.infer<typeof Memo>;

export interface IngestedContext {
  url?: string;
  deckText?: string;
  whitepaperText?: string;
  websiteText?: string;
  founderProfiles: Array<{ url: string; text: string }>;
  rawMetadata: Record<string, unknown>;
}
```

**Step 3:** Run tests. **Step 4:** Commit:
```bash
git add -A && git commit -m "feat(llm): anthropic wrapper with prompt caching and retry"
```

---

## Task 5: Document Ingestion (Agent 1)

**Files:**
- Create: `src/ingest/pdf.ts`, `src/ingest/web.ts`, `src/ingest/linkedin.ts`, `src/agents/ingestion.ts`, fixtures + tests

**Step 1: Add fixtures**

Drop `tests/fixtures/synapse-deck.pdf` (any small sample PDF for now — even a 1-page text PDF) and `tests/fixtures/synapse-site.html`:

```html
<!doctype html><html><body>
<h1>Synapse Protocol</h1>
<p>Decentralized GPU marketplace for AI inference.</p>
<div class="team"><h2>Team</h2><p>Maya Chen, CEO — ex-Anthropic</p></div>
</body></html>
```

**Step 2: Failing test** — `tests/agents/ingestion.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import path from "node:path";
import { ingest } from "../../src/agents/ingestion.js";

describe("ingestion", () => {
  it("extracts text from a local PDF and HTML file", async () => {
    const ctx = await ingest({
      deckPath: path.resolve("tests/fixtures/synapse-deck.pdf"),
      websitePath: path.resolve("tests/fixtures/synapse-site.html"),
    });
    expect(ctx.deckText && ctx.deckText.length).toBeGreaterThan(0);
    expect(ctx.websiteText).toContain("Synapse Protocol");
  });
});
```

**Step 3: Implement extractors**

`src/ingest/pdf.ts`:
```ts
import { readFile } from "node:fs/promises";
import pdfParse from "pdf-parse";

export async function extractPdf(filePath: string): Promise<string> {
  const buf = await readFile(filePath);
  const out = await pdfParse(buf);
  return out.text;
}
```

`src/ingest/web.ts`:
```ts
import * as cheerio from "cheerio";
import { request } from "undici";
import { readFile } from "node:fs/promises";

export async function extractWeb(input: string): Promise<string> {
  const html = input.startsWith("http")
    ? await (await request(input)).body.text()
    : await readFile(input, "utf8");
  const $ = cheerio.load(html);
  $("script,style,nav,footer").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
}
```

`src/ingest/linkedin.ts`:
```ts
import { extractWeb } from "./web.js";
import { logger } from "../log.js";

export async function extractLinkedIn(url: string): Promise<{ url: string; text: string }> {
  try {
    const text = await extractWeb(url);
    return { url, text: text.slice(0, 8000) };
  } catch (err) {
    logger.warn({ err, url }, "linkedin fetch failed — degrading");
    return { url, text: "" };
  }
}
```

`src/agents/ingestion.ts`:
```ts
import { extractPdf } from "../ingest/pdf.js";
import { extractWeb } from "../ingest/web.js";
import { extractLinkedIn } from "../ingest/linkedin.js";
import type { IngestedContext } from "../types.js";

export interface IngestArgs {
  deckPath?: string;
  whitepaperPath?: string;
  websitePath?: string;
  founderProfileUrls?: string[];
}

export async function ingest(a: IngestArgs): Promise<IngestedContext> {
  const [deckText, whitepaperText, websiteText, founderProfiles] = await Promise.all([
    a.deckPath ? extractPdf(a.deckPath) : Promise.resolve(undefined),
    a.whitepaperPath ? extractPdf(a.whitepaperPath) : Promise.resolve(undefined),
    a.websitePath ? extractWeb(a.websitePath) : Promise.resolve(undefined),
    Promise.all((a.founderProfileUrls ?? []).map(extractLinkedIn)),
  ]);
  return {
    url: a.websitePath,
    deckText,
    whitepaperText,
    websiteText,
    founderProfiles,
    rawMetadata: {},
  };
}
```

**Step 4:** Run test, expect pass. **Step 5:** Commit:
```bash
git add -A && git commit -m "feat(ingest): agent 1 extracts deck, site, whitepaper, founder profiles"
```

---

## Task 6: Specialist agents 2–6 (one shared template)

**Files:**
- Create: `src/agents/specialist.ts` (shared runner), `src/agents/{market,founder,product,tokenomics,risk}.ts`, tests for each

**Step 1: Write the shared specialist runner first**

`src/agents/specialist.ts`:
```ts
import { callLLM } from "./llm.js";
import { stripUnverified } from "./tiering.js";
import { sliceThesis, type Thesis, type AgentKey } from "./thesis.js";
import type { IngestedContext } from "../types.js";

const TIERING_RULES = `
For every factual claim you assert, append exactly one tag:
  [verified]   — you can quote or link a specific source from the input
  [inferred]   — logical conclusion from verified facts (briefly state reasoning)
  [speculative] — no source; tag this as "Question to ask on the call"
After any [verified] claim, on the next line add: "  ↳ Source: <url-or-quote>"
Never use [verified] without a Source line.
`;

export interface SpecialistArgs {
  agent: AgentKey;
  systemPreamble: string;
  userTask: string;
  ctx: IngestedContext;
  thesis: Thesis;
}

export async function runSpecialist(a: SpecialistArgs): Promise<string> {
  const thesisSlice = sliceThesis(a.thesis, a.agent);
  const system = [
    a.systemPreamble,
    "## Decasonic thesis (relevant slice)",
    thesisSlice,
    TIERING_RULES,
  ].join("\n\n");
  const user = [
    "## Startup context",
    "### Website", a.ctx.websiteText?.slice(0, 6000) ?? "(none)",
    "### Deck", a.ctx.deckText?.slice(0, 8000) ?? "(none)",
    "### Whitepaper", a.ctx.whitepaperText?.slice(0, 6000) ?? "(none)",
    "### Founder profiles", a.ctx.founderProfiles.map((p) => `[${p.url}]\n${p.text}`).join("\n\n"),
    "",
    "## Your task", a.userTask,
  ].join("\n\n");
  const raw = await callLLM({ system, user, model: "claude-sonnet-4-6", cacheSystem: true });
  return stripUnverified(raw);
}
```

**Step 2: Failing test for one specialist** — `tests/agents/market.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/agents/llm.js", () => ({
  callLLM: vi.fn(async () => "Synapse competes with io.net [verified]\n  ↳ Source: https://io.net"),
}));

import { runMarket } from "../../src/agents/market.js";
import { loadThesis } from "../../src/agents/thesis.js";

describe("market agent", () => {
  it("invokes specialist runner and returns market output", async () => {
    const thesis = await loadThesis();
    const out = await runMarket({
      ctx: { founderProfiles: [], rawMetadata: {} },
      thesis,
    });
    expect(out).toContain("io.net");
    expect(out).toContain("[verified]");
  });
});
```

**Step 3: Implement each specialist**

`src/agents/market.ts`:
```ts
import { runSpecialist } from "./specialist.js";
import type { IngestedContext } from "../types.js";
import type { Thesis } from "./thesis.js";

export async function runMarket(a: { ctx: IngestedContext; thesis: Thesis }) {
  return runSpecialist({
    agent: "market",
    systemPreamble: "You are Decasonic's Market Map analyst. Identify competitors, market category, market size, and assess fit vs. Decasonic's thesis.",
    userTask: "Produce a 'Market Map' section: 5 bullet points covering category, top 3 competitors with one-line teardown, est. market size with reasoning, and a thesis-fit verdict (Strong / Weak / Off-thesis).",
    ctx: a.ctx,
    thesis: a.thesis,
  });
}
```

`src/agents/founder.ts`:
```ts
import { runSpecialist } from "./specialist.js";
import type { IngestedContext } from "../types.js";
import type { Thesis } from "./thesis.js";

export async function runFounder(a: { ctx: IngestedContext; thesis: Thesis }) {
  return runSpecialist({
    agent: "founder",
    systemPreamble: "You are Decasonic's Founder Signal analyst. Score founder-market-fit, prior experience, network, and credibility. Flag anti-patterns from the thesis.",
    userTask: "Produce a 'Founder Signal' section: per-founder bullets (background, prior roles, founder-market fit), a 0-10 score, and an explicit anti-pattern flag list (or 'none').",
    ctx: a.ctx,
    thesis: a.thesis,
  });
}
```

`src/agents/product.ts`:
```ts
import { runSpecialist } from "./specialist.js";
import type { IngestedContext } from "../types.js";
import type { Thesis } from "./thesis.js";

export async function runProduct(a: { ctx: IngestedContext; thesis: Thesis }) {
  return runSpecialist({
    agent: "product",
    systemPreamble: "You are Decasonic's Product analyst. Evaluate the user pain point, differentiation, and whether AI and blockchain are *necessary* (not decorative).",
    userTask: "Produce a 'Product' section: problem, solution, differentiation, AI-necessity verdict, blockchain-necessity verdict (each Yes/No with one-line justification).",
    ctx: a.ctx,
    thesis: a.thesis,
  });
}
```

`src/agents/tokenomics.ts`:
```ts
import { runSpecialist } from "./specialist.js";
import type { IngestedContext } from "../types.js";
import type { Thesis } from "./thesis.js";

export async function runTokenomics(a: { ctx: IngestedContext; thesis: Thesis }) {
  return runSpecialist({
    agent: "token",
    systemPreamble: "You are Decasonic's Tokenomics analyst. Review utility, supply, emissions, governance. Apply the 'token only if necessary' filter strictly.",
    userTask: "Produce a 'Tokenomics' section. If no token: state 'Equity-only — acceptable per thesis' and stop. If token exists: cover utility, supply schedule, team allocation %, vesting, governance, and an explicit 'Token necessary?' verdict (Yes/No/Maybe + reasoning).",
    ctx: a.ctx,
    thesis: a.thesis,
  });
}
```

`src/agents/risk.ts`:
```ts
import { runSpecialist } from "./specialist.js";
import type { IngestedContext } from "../types.js";
import type { Thesis } from "./thesis.js";

export async function runRisk(a: { ctx: IngestedContext; thesis: Thesis }) {
  return runSpecialist({
    agent: "risk",
    systemPreamble: "You are Decasonic's Trust & Risk analyst. Identify regulatory, smart-contract, centralization, and fraud risks. Escalate any anti-pattern hits from the thesis as HARD FLAGS.",
    userTask: "Produce a 'Trust & Risk' section: regulatory exposure, smart-contract risk, centralization risk, fraud signals, and a list of HARD FLAGS triggered from the thesis anti-patterns (or 'none').",
    ctx: a.ctx,
    thesis: a.thesis,
  });
}
```

**Step 4:** Run all specialist tests (mock the LLM in each), expect pass.

**Step 5:** Commit:
```bash
git add -A && git commit -m "feat(agents): specialists 2-6 with shared runner and tier enforcement"
```

---

## Task 7: Memo Synthesis (Agent 7)

**Files:**
- Create: `src/agents/memo.ts`, `tests/agents/memo.test.ts`

**Step 1: Failing test** — `tests/agents/memo.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/agents/llm.js", () => ({
  callLLM: vi.fn(async () => JSON.stringify({
    recommendation: "Take Meeting",
    thesis: ["fits AI x crypto rails", "strong technical founder", "token has clear utility"],
    risks: ["solo CEO", "early traction", "crowded market"],
    sections: { market: "...", founder: "...", product: "...", tokenomics: "...", risk: "..." },
  })),
}));

import { runMemo } from "../../src/agents/memo.js";
import { loadThesis } from "../../src/agents/thesis.js";

describe("memo synthesis", () => {
  it("returns a valid Memo with recommendation and 3+3 bullets", async () => {
    const thesis = await loadThesis();
    const memo = await runMemo({
      sections: { market: "m", founder: "f", product: "p", tokenomics: "t", risk: "r" },
      thesis,
    });
    expect(memo.recommendation).toBe("Take Meeting");
    expect(memo.thesis).toHaveLength(3);
    expect(memo.risks).toHaveLength(3);
  });
});
```

**Step 2: Implement** `src/agents/memo.ts`:

```ts
import { callLLM } from "./llm.js";
import { Memo, type Memo as MemoT } from "../types.js";
import type { Thesis } from "./thesis.js";

export interface MemoArgs {
  sections: { market: string; founder: string; product: string; tokenomics: string; risk: string };
  thesis: Thesis;
}

export async function runMemo(a: MemoArgs): Promise<MemoT> {
  const system = [
    "You are Decasonic's senior partner producing the final investment memo.",
    "You receive structured outputs from 5 specialist agents and the full thesis.",
    "Synthesize a recommendation: Pass | Watch | Take Meeting | Invest.",
    "Output STRICT JSON matching this shape:",
    `{ "recommendation": "...", "thesis": [3 bullets], "risks": [3 bullets], "sections": { "market": "...", "founder": "...", "product": "...", "tokenomics": "...", "risk": "..." } }`,
    "If Trust & Risk lists any HARD FLAGS, recommendation must be Pass or Watch.",
    "Sections in your output should be the specialist outputs verbatim (do not rewrite).",
    "## Decasonic thesis (full)", a.thesis.full,
  ].join("\n\n");
  const user = [
    "### Market", a.sections.market,
    "### Founder", a.sections.founder,
    "### Product", a.sections.product,
    "### Tokenomics", a.sections.tokenomics,
    "### Risk", a.sections.risk,
    "",
    "Output only the JSON object, no prose.",
  ].join("\n\n");
  const raw = await callLLM({ system, user, model: "claude-opus-4-7", maxTokens: 3000, cacheSystem: true });
  const json = JSON.parse(extractJson(raw));
  return Memo.parse({ ...json, sections: a.sections });
}

function extractJson(s: string): string {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("memo did not return JSON");
  return m[0];
}
```

**Step 3:** Run, pass. **Step 4:** Commit:
```bash
git add -A && git commit -m "feat(memo): agent 7 synthesizes structured memo with hard-flag override"
```

---

## Task 8: Orchestrator (ingestion → fan-out → memo)

**Files:**
- Create: `src/orchestrator/run.ts`, `tests/orchestrator.test.ts`

**Step 1: Failing test** — `tests/orchestrator.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("../src/agents/llm.js", () => ({
  callLLM: vi.fn(async ({ user }: { user: string }) => {
    if (user.includes("Output only the JSON")) {
      return JSON.stringify({
        recommendation: "Take Meeting",
        thesis: ["a", "b", "c"],
        risks: ["x", "y", "z"],
        sections: {},
      });
    }
    return "agent-output [verified]\n  ↳ Source: https://example.com";
  }),
}));

import { runOrchestrator } from "../src/orchestrator/run.js";
import path from "node:path";

describe("orchestrator", () => {
  it("runs ingestion → 5 specialists in parallel → memo", async () => {
    const memo = await runOrchestrator({
      websitePath: path.resolve("tests/fixtures/synapse-site.html"),
    });
    expect(memo.recommendation).toBe("Take Meeting");
    expect(memo.sections.market).toContain("agent-output");
  });
});
```

**Step 2: Implement** `src/orchestrator/run.ts`:

```ts
import { ingest, type IngestArgs } from "../agents/ingestion.js";
import { loadThesis } from "../agents/thesis.js";
import { runMarket } from "../agents/market.js";
import { runFounder } from "../agents/founder.js";
import { runProduct } from "../agents/product.js";
import { runTokenomics } from "../agents/tokenomics.js";
import { runRisk } from "../agents/risk.js";
import { runMemo } from "../agents/memo.js";
import type { Memo } from "../types.js";
import { logger } from "../log.js";

export async function runOrchestrator(args: IngestArgs): Promise<Memo> {
  const t0 = Date.now();
  const [ctx, thesis] = await Promise.all([ingest(args), loadThesis()]);
  logger.info({ ms: Date.now() - t0 }, "ingestion complete");

  const t1 = Date.now();
  const [market, founder, product, tokenomics, risk] = await Promise.all([
    runMarket({ ctx, thesis }),
    runFounder({ ctx, thesis }),
    runProduct({ ctx, thesis }),
    runTokenomics({ ctx, thesis }),
    runRisk({ ctx, thesis }),
  ]);
  logger.info({ ms: Date.now() - t1 }, "specialists complete");

  return runMemo({ sections: { market, founder, product, tokenomics, risk }, thesis });
}
```

**Step 3:** Run, pass. **Step 4:** Commit:
```bash
git add -A && git commit -m "feat(orchestrator): pipeline ingestion -> 5 parallel specialists -> memo"
```

---

## Task 9: SQLite persistence (runs + sections + follow-ups)

**Files:**
- Create: `src/db/schema.sql`, `src/db/store.ts`, `tests/db.test.ts`

**Step 1: Schema** — `src/db/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slack_channel TEXT NOT NULL,
  slack_user TEXT NOT NULL,
  slack_thread_ts TEXT,
  input_payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  recommendation TEXT,
  memo_json TEXT,
  ingested_context TEXT,
  thesis_snapshot TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_runs_thread ON runs(slack_thread_ts);
```

**Step 2: Failing test** — `tests/db.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../src/db/store.js";

describe("store", () => {
  let s: Store;
  beforeEach(() => { s = new Store(":memory:"); });

  it("creates a run and reads it back by thread ts", () => {
    const id = s.createRun({
      slackChannel: "C1", slackUser: "U1", slackThreadTs: "1234.5",
      inputPayload: { url: "https://x.com" },
    });
    const r = s.findByThread("1234.5");
    expect(r?.id).toBe(id);
    expect(r?.inputPayload.url).toBe("https://x.com");
  });

  it("completes a run with memo JSON", () => {
    const id = s.createRun({ slackChannel: "C1", slackUser: "U1", inputPayload: {} });
    s.completeRun(id, { recommendation: "Pass", memoJson: { foo: 1 }, ingestedContext: {}, thesisSnapshot: "x" });
    const r = s.find(id);
    expect(r?.status).toBe("completed");
    expect(r?.recommendation).toBe("Pass");
  });
});
```

**Step 3: Implement** `src/db/store.ts`:

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
  slackChannel: string;
  slackUser: string;
  slackThreadTs: string | null;
  inputPayload: any;
  status: string;
  recommendation: string | null;
  memoJson: any | null;
  createdAt: number;
}

export class Store {
  private db: Database.Database;
  constructor(file = process.env.DEALSENSE_DB_PATH ?? "./data.sqlite") {
    this.db = new Database(file);
    this.db.exec(SCHEMA);
  }

  createRun(a: { slackChannel: string; slackUser: string; slackThreadTs?: string; inputPayload: unknown }): number {
    const stmt = this.db.prepare(
      `INSERT INTO runs (slack_channel, slack_user, slack_thread_ts, input_payload, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    const r = stmt.run(a.slackChannel, a.slackUser, a.slackThreadTs ?? null, JSON.stringify(a.inputPayload), Date.now());
    return Number(r.lastInsertRowid);
  }

  completeRun(id: number, a: { recommendation: string; memoJson: unknown; ingestedContext: unknown; thesisSnapshot: string }) {
    this.db.prepare(
      `UPDATE runs SET status='completed', recommendation=?, memo_json=?, ingested_context=?, thesis_snapshot=?, completed_at=? WHERE id=?`,
    ).run(a.recommendation, JSON.stringify(a.memoJson), JSON.stringify(a.ingestedContext), a.thesisSnapshot, Date.now(), id);
  }

  find(id: number): RunRow | undefined {
    return rowToRun(this.db.prepare(`SELECT * FROM runs WHERE id=?`).get(id) as any);
  }

  findByThread(ts: string): RunRow | undefined {
    return rowToRun(this.db.prepare(`SELECT * FROM runs WHERE slack_thread_ts=? ORDER BY id DESC LIMIT 1`).get(ts) as any);
  }
}

function rowToRun(r: any): RunRow | undefined {
  if (!r) return undefined;
  return {
    id: r.id, slackChannel: r.slack_channel, slackUser: r.slack_user, slackThreadTs: r.slack_thread_ts,
    inputPayload: r.input_payload ? JSON.parse(r.input_payload) : null,
    status: r.status, recommendation: r.recommendation,
    memoJson: r.memo_json ? JSON.parse(r.memo_json) : null,
    createdAt: r.created_at,
  };
}
```

**Note:** ensure `schema.sql` is copied to `dist/db/` on build — add `"copy:schema": "cp src/db/schema.sql dist/db/schema.sql"` and chain into `build` script.

**Step 4:** Run, pass. **Step 5:** Commit:
```bash
git add -A && git commit -m "feat(db): sqlite store for runs and follow-up routing"
```

---

## Task 10: BullMQ queue + worker

**Files:**
- Create: `src/queue/queue.ts`, `src/queue/worker.ts`, `tests/queue.test.ts`

**Step 1: Failing test** (in-memory mode) — `tests/queue.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("../src/orchestrator/run.js", () => ({
  runOrchestrator: vi.fn(async () => ({
    recommendation: "Watch",
    thesis: ["a","b","c"], risks: ["x","y","z"], sections: {},
  })),
}));

import { processJob } from "../src/queue/worker.js";

describe("worker", () => {
  it("calls orchestrator and returns memo", async () => {
    const memo = await processJob({ websitePath: "tests/fixtures/synapse-site.html" });
    expect(memo.recommendation).toBe("Watch");
  });
});
```

**Step 2: Implement** `src/queue/worker.ts`:

```ts
import { runOrchestrator } from "../orchestrator/run.js";
import type { IngestArgs } from "../agents/ingestion.js";
import type { Memo } from "../types.js";

export async function processJob(args: IngestArgs): Promise<Memo> {
  return runOrchestrator(args);
}
```

`src/queue/queue.ts`:
```ts
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { processJob } from "./worker.js";
import { logger } from "../log.js";

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

export const dealQueue = new Queue("dealsense", { connection });

export interface DealJobData {
  runId: number;
  slackChannel: string;
  slackThreadTs: string;
  ingest: import("../agents/ingestion.js").IngestArgs;
}

export function startWorker(onComplete: (data: DealJobData, memo: import("../types.js").Memo) => Promise<void>) {
  const worker = new Worker<DealJobData>("dealsense", async (job) => {
    const memo = await processJob(job.data.ingest);
    await onComplete(job.data, memo);
    return memo;
  }, { connection, concurrency: 2 });
  worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "job failed"));
  return worker;
}
```

**Step 3:** Run unit test (worker function only — queue lib not tested live). **Step 4:** Commit:
```bash
git add -A && git commit -m "feat(queue): bullmq worker wraps orchestrator with completion callback"
```

---

## Task 11: Slack render (memo → blocks) + app handlers

**Files:**
- Create: `src/slack/render.ts`, `src/slack/app.ts`, `tests/slack.render.test.ts`

**Step 1: Failing test for renderer** — `tests/slack.render.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderParent, renderSection } from "../src/slack/render.js";

describe("slack render", () => {
  it("parent message has recommendation emoji + thesis + risks", () => {
    const blocks = renderParent({
      recommendation: "Take Meeting",
      thesis: ["a","b","c"],
      risks: ["x","y","z"],
      sections: { market:"", founder:"", product:"", tokenomics:"", risk:"" },
    });
    const text = JSON.stringify(blocks);
    expect(text).toContain("Take Meeting");
    expect(text).toMatch(/Thesis/i);
    expect(text).toMatch(/Risks/i);
  });

  it("section block contains agent name and content", () => {
    const blk = renderSection("Founder Signal", "Maya was at Anthropic [verified]");
    expect(JSON.stringify(blk)).toContain("Founder Signal");
  });
});
```

**Step 2: Implement** `src/slack/render.ts`:

```ts
import type { Memo, Recommendation } from "../types.js";

const EMOJI: Record<Recommendation, string> = {
  "Pass": "🔴",
  "Watch": "🟡",
  "Take Meeting": "🟢",
  "Invest": "💎",
};

export function renderParent(memo: Memo) {
  return [
    { type: "header", text: { type: "plain_text", text: `${EMOJI[memo.recommendation]} Recommendation: ${memo.recommendation.toUpperCase()}` } },
    { type: "section", text: { type: "mrkdwn", text: `*Thesis (why we'd lean in):*\n${memo.thesis.map(b => `• ${b}`).join("\n")}` } },
    { type: "section", text: { type: "mrkdwn", text: `*Risks (what would kill it):*\n${memo.risks.map(b => `• ${b}`).join("\n")}` } },
    { type: "context", elements: [{ type: "mrkdwn", text: "Full per-agent sections in thread ↓" }] },
  ];
}

export function renderSection(name: string, body: string) {
  return [
    { type: "header", text: { type: "plain_text", text: name } },
    { type: "section", text: { type: "mrkdwn", text: body.slice(0, 2900) } },
  ];
}
```

**Step 3: Implement** `src/slack/app.ts`:

```ts
import { App, LogLevel } from "@slack/bolt";
import { dealQueue, startWorker, type DealJobData } from "../queue/queue.js";
import { Store } from "../db/store.js";
import { renderParent, renderSection } from "./render.js";
import { logger } from "../log.js";

const SECTION_NAMES = {
  market: "Market Map", founder: "Founder Signal", product: "Product",
  tokenomics: "Tokenomics", risk: "Trust & Risk",
} as const;

export function startSlack(store: Store) {
  const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    socketMode: true,
    appToken: process.env.SLACK_APP_TOKEN,
    logLevel: LogLevel.INFO,
  });

  app.command("/dealsense", async ({ command, ack, client }) => {
    await ack();
    const url = command.text.trim();
    if (!url) {
      await client.chat.postEphemeral({ channel: command.channel_id, user: command.user_id, text: "Usage: /dealsense <url-or-deck>" });
      return;
    }
    const parent = await client.chat.postMessage({
      channel: command.channel_id,
      text: `🔍 Analyzing ${url} — running 6 agents in parallel… ETA ~90s`,
    });
    const runId = store.createRun({
      slackChannel: command.channel_id, slackUser: command.user_id,
      slackThreadTs: parent.ts!, inputPayload: { url },
    });
    await dealQueue.add("analyze", {
      runId, slackChannel: command.channel_id, slackThreadTs: parent.ts!,
      ingest: { websitePath: url },
    });
  });

  app.event("message", async ({ event, client }) => {
    if (event.subtype || !("thread_ts" in event) || !event.thread_ts) return;
    const run = store.findByThread(event.thread_ts);
    if (!run || run.status !== "completed") return;
    // Follow-up Q&A: route to specialist using cached context (Task 12 hooks here).
    logger.info({ ts: event.thread_ts }, "follow-up received (handler stub)");
  });

  startWorker(async (data: DealJobData, memo) => {
    store.completeRun(data.runId, {
      recommendation: memo.recommendation, memoJson: memo,
      ingestedContext: {}, thesisSnapshot: "",
    });
    await app.client.chat.update({
      channel: data.slackChannel, ts: data.slackThreadTs,
      text: `${memo.recommendation} — see thread for full memo`,
      blocks: renderParent(memo),
    });
    for (const [k, name] of Object.entries(SECTION_NAMES)) {
      const body = (memo.sections as any)[k] ?? "(no output)";
      await app.client.chat.postMessage({
        channel: data.slackChannel, thread_ts: data.slackThreadTs,
        text: name, blocks: renderSection(name, body),
      });
    }
  });

  return app;
}
```

`src/index.ts`:
```ts
import "dotenv/config";
import { Store } from "./db/store.js";
import { startSlack } from "./slack/app.js";
import { logger } from "./log.js";

const store = new Store();
const app = startSlack(store);
const port = Number(process.env.PORT ?? 3000);
await app.start(port);
logger.info({ port }, "DealSense online");
```

**Step 4:** Run renderer test, pass. **Step 5:** Commit:
```bash
git add -A && git commit -m "feat(slack): bolt app with /dealsense + threaded memo posting"
```

---

## Task 12: Follow-up Q&A routing

**Files:**
- Modify: `src/slack/app.ts` (replace stub), Create: `src/agents/followup.ts`, `tests/agents/followup.test.ts`

**Step 1: Failing test** — `tests/agents/followup.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
vi.mock("../../src/agents/llm.js", () => ({
  callLLM: vi.fn(async () => "answer about token [verified]\n  ↳ Source: stored ctx"),
}));
import { answerFollowup } from "../../src/agents/followup.js";

describe("followup", () => {
  it("routes a token-related question to tokenomics context", async () => {
    const out = await answerFollowup({
      question: "what would change your mind on the token?",
      memoJson: { recommendation: "Watch", thesis: [], risks: [], sections: { tokenomics: "team alloc 28%" } },
    });
    expect(out).toContain("answer about token");
  });
});
```

**Step 2: Implement** `src/agents/followup.ts`:

```ts
import { callLLM } from "./llm.js";
import { stripUnverified } from "./tiering.js";
import type { Memo } from "../types.js";

const ROUTES: Array<[RegExp, keyof Memo["sections"]]> = [
  [/token|emission|supply|vest/i, "tokenomics"],
  [/founder|team|ceo|cto/i, "founder"],
  [/competit|market|tam|sam/i, "market"],
  [/regul|risk|fraud|central/i, "risk"],
  [/product|user|pain|differen/i, "product"],
];

export async function answerFollowup(a: { question: string; memoJson: Memo }): Promise<string> {
  const route = ROUTES.find(([re]) => re.test(a.question))?.[1] ?? "product";
  const sectionText = a.memoJson.sections[route] ?? "";
  const system = "You are answering a partner's follow-up using already-cached memo context. Be terse. Use confidence tiering.";
  const user = `Question: ${a.question}\n\nRelevant section (${route}):\n${sectionText}\n\nRecommendation context: ${a.memoJson.recommendation}.`;
  const raw = await callLLM({ system, user, model: "claude-sonnet-4-6" });
  return stripUnverified(raw);
}
```

**Step 3:** In `src/slack/app.ts`, replace the stub message handler:
```ts
import { answerFollowup } from "../agents/followup.js";
// ...inside app.event("message"):
const memo = run.memoJson as import("../types.js").Memo | null;
if (!memo) return;
const text = "text" in event ? event.text ?? "" : "";
const answer = await answerFollowup({ question: text, memoJson: memo });
await client.chat.postMessage({ channel: run.slackChannel, thread_ts: event.thread_ts, text: answer });
```

**Step 4:** Run, pass. **Step 5:** Commit:
```bash
git add -A && git commit -m "feat(followup): route in-thread questions to specialist context"
```

---

## Task 13: End-to-end smoke test (no Slack, no Redis)

**Files:**
- Create: `tests/e2e.test.ts`

**Step 1: Failing test** — `tests/e2e.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import path from "node:path";

vi.mock("../src/agents/llm.js", () => ({
  callLLM: vi.fn(async ({ user }: { user: string }) => {
    if (user.includes("Output only the JSON")) {
      return JSON.stringify({
        recommendation: "Take Meeting",
        thesis: ["AI x crypto rails fit", "tech founder", "token has clear utility"],
        risks: ["solo CEO", "no traction", "crowded category"],
        sections: {},
      });
    }
    return `Synapse Protocol [verified]\n  ↳ Source: tests/fixtures/synapse-site.html`;
  }),
}));

import { runOrchestrator } from "../src/orchestrator/run.js";

describe("e2e: synapse fixture", () => {
  it("produces a valid memo end-to-end", async () => {
    const memo = await runOrchestrator({
      websitePath: path.resolve("tests/fixtures/synapse-site.html"),
    });
    expect(memo.recommendation).toBeDefined();
    expect(memo.thesis).toHaveLength(3);
    expect(memo.risks).toHaveLength(3);
  });
});
```

**Step 2:** Run, pass. **Step 3:** Commit:
```bash
git add -A && git commit -m "test(e2e): orchestrator pipeline produces valid memo end-to-end"
```

---

## Task 14: README + run instructions

**Files:**
- Create: `README.md`

**Step 1:** Brief README covering:
- 1-paragraph "what is this"
- Slack app setup (scopes: `commands`, `chat:write`, `files:read`; Socket Mode on; slash command `/dealsense`)
- Required env vars (point to `.env.example`)
- `npm install && redis-server &` and `npm run dev`
- How to edit `config/thesis.md`
- How to add a new specialist agent (one paragraph pointing to `src/agents/specialist.ts`)

**Step 2:** Commit:
```bash
git add README.md && git commit -m "docs: README with Slack app setup and run instructions"
```

---

## Task 15: Demo polish — progressive Slack updates

**Files:**
- Modify: `src/queue/queue.ts`, `src/slack/app.ts`

**Step 1:** Pass a `progress` callback into `runOrchestrator` so each completed agent triggers a Slack `chat.update` to the parent message: `"🔍 Agent 3/6 done — Founder Signal complete…"`.

**Step 2:** Add progress events in `runOrchestrator` after each `Promise.all` element resolves (use `Promise.allSettled` + a counter, or wrap each runner with `.then(reportProgress)`).

**Step 3:** Test manually in a real Slack workspace — confirm parent message updates as agents finish.

**Step 4:** Commit:
```bash
git add -A && git commit -m "feat(slack): progressive parent-message updates as agents complete"
```

---

## Definition of Done

- [ ] `npm test` passes (all unit + e2e tests with mocked LLM)
- [ ] `npm run typecheck` clean
- [ ] `/dealsense https://example-startup.com` in Slack returns a memo within 120s
- [ ] At least one `thesis.md` anti-pattern correctly trips on a known-bad fixture
- [ ] Zero `[verified]` claims without a source line in any test memo (post-processor verified)
- [ ] Follow-up question in thread returns a coherent specialist-routed answer
- [ ] README sufficient for a fresh dev to run locally

---

## Plan complete and saved to `docs/plans/2026-04-25-dealsense-implementation.md`.

**Two execution options:**

**1. Subagent-Driven (this session)** — I dispatch fresh subagent per task, review between tasks, fast iteration.

**2. Parallel Session (separate)** — Open new session with `superpowers:executing-plans`, batch execution with checkpoints.

**Which approach?**

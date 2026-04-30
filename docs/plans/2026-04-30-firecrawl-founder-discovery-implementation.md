# Firecrawl Founder Discovery — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the broken naive LinkedIn scraper with Firecrawl-based auto-discovery of founders from a company URL plus per-profile `/scrape`, with manual URL override.

**Architecture:** Two new ingest modules (`firecrawl.ts` client wrapper, `founders.ts` discover+scrape), a two-phase parallel ingestion pipeline (fetch website + discover in parallel, then scrape profiles), an optional UI textarea for manual override, and two new SSE progress phases. All Firecrawl calls mocked in tests; production-only network access.

**Tech Stack:** `@mendable/firecrawl-js` SDK, existing zod schemas, vitest mocks, Express + SSE.

**Design doc:** `docs/plans/2026-04-30-firecrawl-founder-discovery-design.md`

**Prior learnings (must respect):**
- `learnings.md` 2026-04-29 secret-leak entry — never write `FIRECRAWL_API_KEY` to disk on the user's behalf, instruct them to set it in `.env` themselves.
- TS strict + NodeNext — every import needs `.js` suffix.
- All external SDKs are mocked in tests — no live Firecrawl calls in `tests/`.

---

### Task 1: Install Firecrawl SDK + env wiring

**Files:**
- Modify: `package.json` (dependencies)
- Modify: `.env.example`

**Step 1: Install the SDK**

Run: `npm install @mendable/firecrawl-js`
Expected: adds `@mendable/firecrawl-js` to `dependencies`. No peer-dep errors (it depends on zod ^3 || ^4).

**Step 2: Add the env var**

Modify `.env.example` — append:

```
# Firecrawl — used for founder discovery + LinkedIn profile scraping.
# Get a key at https://www.firecrawl.dev. Leave blank to disable founder discovery
# (the Founder agent will run on website text only).
FIRECRAWL_API_KEY=
```

**Step 3: Verify install**

Run: `npm ls @mendable/firecrawl-js`
Expected: shows the version, no `UNMET PEER DEPENDENCY` warnings.

**Step 4: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "feat(ingest): add @mendable/firecrawl-js dependency + env var"
```

---

### Task 2: Firecrawl client wrapper (`firecrawl.ts`)

**Files:**
- Create: `src/ingest/firecrawl.ts`
- Test: `tests/ingest/firecrawl.test.ts`

A singleton wrapper that returns `null` if `FIRECRAWL_API_KEY` is unset. Every caller must handle the null case (graceful degrade).

**Step 1: Write the failing test**

Create `tests/ingest/firecrawl.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getFirecrawl } from "../../src/ingest/firecrawl.js";

describe("getFirecrawl", () => {
  const original = process.env.FIRECRAWL_API_KEY;
  beforeEach(() => { delete process.env.FIRECRAWL_API_KEY; });
  afterEach(() => { process.env.FIRECRAWL_API_KEY = original; });

  it("returns null when FIRECRAWL_API_KEY is unset", () => {
    expect(getFirecrawl()).toBeNull();
  });

  it("returns a client when FIRECRAWL_API_KEY is set", () => {
    process.env.FIRECRAWL_API_KEY = "fc-test-key";
    const client = getFirecrawl();
    expect(client).not.toBeNull();
  });

  it("memoizes across calls", () => {
    process.env.FIRECRAWL_API_KEY = "fc-test-key";
    const a = getFirecrawl();
    const b = getFirecrawl();
    expect(a).toBe(b);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ingest/firecrawl.test.ts`
Expected: FAIL — module not found.

**Step 3: Write minimal implementation**

Create `src/ingest/firecrawl.ts`:

```ts
import FirecrawlApp from "@mendable/firecrawl-js";

let cached: FirecrawlApp | null | undefined;

export function getFirecrawl(): FirecrawlApp | null {
  if (cached !== undefined) return cached;
  const apiKey = process.env.FIRECRAWL_API_KEY;
  cached = apiKey ? new FirecrawlApp({ apiKey }) : null;
  return cached;
}

export function _resetFirecrawlForTests(): void {
  cached = undefined;
}
```

**Step 4: Update test to reset memoization between cases**

Add `_resetFirecrawlForTests()` import and call it in `beforeEach`:

```ts
import { getFirecrawl, _resetFirecrawlForTests } from "../../src/ingest/firecrawl.js";
// ...
beforeEach(() => {
  delete process.env.FIRECRAWL_API_KEY;
  _resetFirecrawlForTests();
});
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run tests/ingest/firecrawl.test.ts`
Expected: 3/3 PASS.

**Step 6: Commit**

```bash
git add src/ingest/firecrawl.ts tests/ingest/firecrawl.test.ts
git commit -m "feat(ingest): firecrawl client wrapper with null-when-unset semantics"
```

---

### Task 3: Founders module — `discoverFounders` + `scrapeProfile`

**Files:**
- Create: `src/ingest/founders.ts`
- Test: `tests/ingest/founders.test.ts`
- Delete: `src/ingest/linkedin.ts` (replaced)

**Step 1: Write the failing test**

Create `tests/ingest/founders.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { _resetFirecrawlForTests } from "../../src/ingest/firecrawl.js";

const mockExtract = vi.fn();
const mockScrape = vi.fn();

vi.mock("@mendable/firecrawl-js", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      extract: mockExtract,
      scrape: mockScrape,
    })),
  };
});

import { discoverFounders, scrapeProfile } from "../../src/ingest/founders.js";

describe("discoverFounders", () => {
  beforeEach(() => {
    _resetFirecrawlForTests();
    mockExtract.mockReset();
    mockScrape.mockReset();
    process.env.FIRECRAWL_API_KEY = "fc-test";
  });

  it("returns extracted founders with linkedin URLs", async () => {
    mockExtract.mockResolvedValueOnce({
      success: true,
      data: {
        companyName: "Harvey",
        founders: [
          { name: "Winston Weinberg", title: "CEO", linkedinUrl: "https://www.linkedin.com/in/winston-weinberg/" },
          { name: "Gabriel Pereyra", title: "President" },
        ],
      },
    });
    const result = await discoverFounders("https://harvey.ai");
    expect(result).toHaveLength(2);
    expect(result[0].linkedinUrl).toContain("winston-weinberg");
    expect(result[1].linkedinUrl).toBeUndefined();
  });

  it("returns [] when FIRECRAWL_API_KEY is unset", async () => {
    delete process.env.FIRECRAWL_API_KEY;
    _resetFirecrawlForTests();
    const result = await discoverFounders("https://harvey.ai");
    expect(result).toEqual([]);
    expect(mockExtract).not.toHaveBeenCalled();
  });

  it("returns [] when extract throws", async () => {
    mockExtract.mockRejectedValueOnce(new Error("rate limited"));
    const result = await discoverFounders("https://harvey.ai");
    expect(result).toEqual([]);
  });

  it("returns [] when extract returns success: false", async () => {
    mockExtract.mockResolvedValueOnce({ success: false, error: "boom" });
    const result = await discoverFounders("https://harvey.ai");
    expect(result).toEqual([]);
  });
});

describe("scrapeProfile", () => {
  beforeEach(() => {
    _resetFirecrawlForTests();
    mockExtract.mockReset();
    mockScrape.mockReset();
    process.env.FIRECRAWL_API_KEY = "fc-test";
  });

  it("returns markdown text when scrape succeeds", async () => {
    mockScrape.mockResolvedValueOnce({
      success: true,
      data: { markdown: "## Experience\nCEO at Harvey 2022-present" },
    });
    const result = await scrapeProfile("https://www.linkedin.com/in/winston-weinberg/");
    expect(result.url).toContain("winston-weinberg");
    expect(result.text).toContain("CEO at Harvey");
  });

  it("returns empty text when FIRECRAWL_API_KEY is unset", async () => {
    delete process.env.FIRECRAWL_API_KEY;
    _resetFirecrawlForTests();
    const result = await scrapeProfile("https://www.linkedin.com/in/x/");
    expect(result.text).toBe("");
    expect(mockScrape).not.toHaveBeenCalled();
  });

  it("returns empty text when scrape throws", async () => {
    mockScrape.mockRejectedValueOnce(new Error("network"));
    const result = await scrapeProfile("https://www.linkedin.com/in/x/");
    expect(result.text).toBe("");
  });

  it("truncates very long markdown to 8000 chars", async () => {
    mockScrape.mockResolvedValueOnce({ success: true, data: { markdown: "a".repeat(20000) } });
    const result = await scrapeProfile("https://www.linkedin.com/in/x/");
    expect(result.text.length).toBe(8000);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ingest/founders.test.ts`
Expected: FAIL — module not found.

**Step 3: Write minimal implementation**

Create `src/ingest/founders.ts`:

```ts
import { z } from "zod";
import { getFirecrawl } from "./firecrawl.js";
import { logger } from "../log.js";

export interface DiscoveredFounder {
  name: string;
  title?: string;
  linkedinUrl?: string;
}

const FoundersSchema = z.object({
  companyName: z.string().optional(),
  founders: z.array(z.object({
    name: z.string(),
    title: z.string().optional(),
    linkedinUrl: z.string().url().optional(),
  })),
});

const PROMPT =
  "Extract the founders, co-founders, and C-level leadership of this company. " +
  "Include their LinkedIn URLs if linked anywhere on the page.";

export async function discoverFounders(companyUrl: string): Promise<DiscoveredFounder[]> {
  const fc = getFirecrawl();
  if (!fc) {
    logger.warn({ companyUrl }, "FIRECRAWL_API_KEY unset — skipping founder discovery");
    return [];
  }
  try {
    const res = await fc.extract({
      urls: [companyUrl],
      schema: FoundersSchema,
      prompt: PROMPT,
    });
    if (!res?.success || !res.data) {
      logger.warn({ companyUrl, error: (res as any)?.error }, "firecrawl extract returned no data");
      return [];
    }
    const parsed = FoundersSchema.safeParse(res.data);
    if (!parsed.success) {
      logger.warn({ companyUrl, issues: parsed.error.issues }, "firecrawl extract failed schema");
      return [];
    }
    return parsed.data.founders;
  } catch (err) {
    logger.warn({ err, companyUrl }, "firecrawl extract threw — degrading");
    return [];
  }
}

export async function scrapeProfile(url: string): Promise<{ url: string; text: string }> {
  const fc = getFirecrawl();
  if (!fc) return { url, text: "" };
  try {
    const res = await fc.scrape(url, { formats: ["markdown"] });
    if (!res?.success || !res.data?.markdown) {
      logger.warn({ url }, "firecrawl scrape returned no markdown");
      return { url, text: "" };
    }
    return { url, text: res.data.markdown.slice(0, 8000) };
  } catch (err) {
    logger.warn({ err, url }, "firecrawl scrape threw — degrading");
    return { url, text: "" };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ingest/founders.test.ts`
Expected: 8/8 PASS.

**Step 5: Delete the old linkedin.ts**

Run: `rm src/ingest/linkedin.ts`

Verify nothing else imports it: `grep -rn "ingest/linkedin" src/ tests/`
Expected: only `src/agents/ingestion.ts` (handled in Task 4).

**Step 6: Commit**

```bash
git add src/ingest/founders.ts tests/ingest/founders.test.ts src/ingest/linkedin.ts
git commit -m "feat(ingest): firecrawl-backed discoverFounders + scrapeProfile, drop linkedin.ts"
```

---

### Task 4: Two-phase ingestion pipeline

**Files:**
- Modify: `src/agents/ingestion.ts`
- Modify: `tests/agents/ingestion.test.ts`

The new flow:
1. Phase 1: in parallel — `extractWeb`, `extractPdf` × 2, AND (if no manual URLs) `discoverFounders`.
2. Phase 2: `Promise.all(allFounderUrls.map(scrapeProfile))`.

**Step 1: Update the test to drive the new shape**

Modify `tests/agents/ingestion.test.ts` — replace contents:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "node:path";

const mockDiscover = vi.fn();
const mockScrape = vi.fn();

vi.mock("../../src/ingest/founders.js", () => ({
  discoverFounders: mockDiscover,
  scrapeProfile: mockScrape,
}));

import { ingest } from "../../src/agents/ingestion.js";

describe("ingestion", () => {
  beforeEach(() => {
    mockDiscover.mockReset();
    mockScrape.mockReset();
  });

  it("extracts text from a local PDF and HTML file", async () => {
    mockDiscover.mockResolvedValue([]);
    const ctx = await ingest({
      deckPath: path.resolve("tests/fixtures/synapse-deck.pdf"),
      websitePath: path.resolve("tests/fixtures/synapse-site.html"),
    });
    expect(ctx.deckText && ctx.deckText.length).toBeGreaterThan(0);
    expect(ctx.deckText).toContain("Synapse Protocol");
    expect(ctx.websiteText).toContain("Synapse Protocol");
  });

  it("returns undefined for missing inputs", async () => {
    const ctx = await ingest({});
    expect(ctx.deckText).toBeUndefined();
    expect(ctx.websiteText).toBeUndefined();
    expect(ctx.founderProfiles).toEqual([]);
    expect(mockDiscover).not.toHaveBeenCalled();
  });

  it("auto-discovers founders when no manual URLs given", async () => {
    mockDiscover.mockResolvedValue([
      { name: "A", linkedinUrl: "https://www.linkedin.com/in/a/" },
      { name: "B", linkedinUrl: "https://www.linkedin.com/in/b/" },
      { name: "C" }, // no linkedin URL — should be filtered
    ]);
    mockScrape.mockImplementation(async (u: string) => ({ url: u, text: `markdown for ${u}` }));

    const ctx = await ingest({ websitePath: "https://harvey.ai" });

    expect(mockDiscover).toHaveBeenCalledWith("https://harvey.ai");
    expect(ctx.founderProfiles).toHaveLength(2);
    expect(ctx.founderProfiles[0].text).toContain("markdown for");
    expect(ctx.rawMetadata.discoverySource).toBe("auto");
    expect(ctx.rawMetadata.discoveredFounders).toBe(2);
  });

  it("uses manual URLs when provided and skips discovery", async () => {
    mockScrape.mockImplementation(async (u: string) => ({ url: u, text: `mk-${u}` }));

    const ctx = await ingest({
      websitePath: "https://harvey.ai",
      founderProfileUrls: ["https://www.linkedin.com/in/manual/"],
    });

    expect(mockDiscover).not.toHaveBeenCalled();
    expect(mockScrape).toHaveBeenCalledTimes(1);
    expect(ctx.founderProfiles[0].url).toContain("manual");
    expect(ctx.rawMetadata.discoverySource).toBe("manual");
  });

  it("skips discovery when no website URL is given", async () => {
    const ctx = await ingest({ deckPath: path.resolve("tests/fixtures/synapse-deck.pdf") });
    expect(mockDiscover).not.toHaveBeenCalled();
    expect(ctx.founderProfiles).toEqual([]);
    expect(ctx.rawMetadata.discoverySource).toBe("skipped");
  });

  it("dedupes manual URLs (case-insensitive)", async () => {
    mockScrape.mockImplementation(async (u: string) => ({ url: u, text: "x" }));
    const ctx = await ingest({
      founderProfileUrls: [
        "https://www.linkedin.com/in/foo/",
        "https://www.linkedin.com/in/FOO/",
      ],
    });
    expect(mockScrape).toHaveBeenCalledTimes(1);
    expect(ctx.founderProfiles).toHaveLength(1);
  });
});
```

**Step 2: Run tests to confirm they fail**

Run: `npx vitest run tests/agents/ingestion.test.ts`
Expected: FAIL — `discoverySource` doesn't exist on rawMetadata, `founderProfileUrls` field doesn't trigger anything yet.

**Step 3: Rewrite `src/agents/ingestion.ts`**

```ts
import { extractPdf } from "../ingest/pdf.js";
import { extractWeb } from "../ingest/web.js";
import { discoverFounders, scrapeProfile } from "../ingest/founders.js";
import type { IngestedContext } from "../types.js";

export interface IngestArgs {
  deckPath?: string;
  whitepaperPath?: string;
  websitePath?: string;
  founderProfileUrls?: string[];
}

function dedupe(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    const key = u.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u);
  }
  return out;
}

export async function ingest(a: IngestArgs): Promise<IngestedContext> {
  const manualUrls = a.founderProfileUrls?.filter((u) => u.trim().length > 0) ?? [];
  const shouldDiscover = manualUrls.length === 0 && !!a.websitePath;

  const [deckText, whitepaperText, websiteText, discovered] = await Promise.all([
    a.deckPath ? extractPdf(a.deckPath) : Promise.resolve(undefined),
    a.whitepaperPath ? extractPdf(a.whitepaperPath) : Promise.resolve(undefined),
    a.websitePath ? extractWeb(a.websitePath) : Promise.resolve(undefined),
    shouldDiscover ? discoverFounders(a.websitePath!) : Promise.resolve([]),
  ]);

  const discoveredUrls = discovered
    .map((f) => f.linkedinUrl)
    .filter((u): u is string => typeof u === "string" && u.length > 0);

  const allUrls = dedupe(manualUrls.length > 0 ? manualUrls : discoveredUrls);
  const founderProfiles = await Promise.all(allUrls.map(scrapeProfile));

  const discoverySource: "auto" | "manual" | "skipped" =
    manualUrls.length > 0 ? "manual" : shouldDiscover ? "auto" : "skipped";

  return {
    url: a.websitePath,
    deckText,
    whitepaperText,
    websiteText,
    founderProfiles,
    rawMetadata: {
      discoverySource,
      discoveredFounders: discoveredUrls.length,
      manualFounders: manualUrls.length,
    },
  };
}
```

**Step 4: Run tests**

Run: `npx vitest run tests/agents/ingestion.test.ts`
Expected: 6/6 PASS.

**Step 5: Run full backend test suite**

Run: `npx vitest run`
Expected: all existing tests still pass (no regression).

**Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

**Step 7: Commit**

```bash
git add src/agents/ingestion.ts tests/agents/ingestion.test.ts
git commit -m "feat(ingest): two-phase pipeline with founder auto-discovery + manual override"
```

---

### Task 5: Wire `founderProfileUrls` through queue + route

**Files:**
- Modify: `src/web/routes.ts`
- Modify: `tests/web/server.test.ts` (add a case)

**Step 1: Update the route to accept the field**

Modify `src/web/routes.ts` — replace the `r.post("/runs", ...)` body:

```ts
r.post("/runs", async (req, res) => {
  const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
  if (!url) return res.status(400).json({ error: "url required" });

  const rawUrls = Array.isArray(req.body?.founderProfileUrls) ? req.body.founderProfileUrls : [];
  const founderProfileUrls: string[] = rawUrls
    .filter((u: unknown): u is string => typeof u === "string")
    .map((u: string) => u.trim())
    .filter((u: string) => u.length > 0);

  const runId = store.createRun({ inputPayload: { url, founderProfileUrls } });
  try {
    await dealQueue.add("analyze", {
      runId,
      ingest: { websitePath: url, founderProfileUrls },
    });
  } catch (err: any) {
    store.failRun(runId, `queue unavailable: ${err?.message ?? "unknown"}`);
    return res.status(503).json({ error: "queue unavailable — is redis-server running?" });
  }
  return res.status(202).json({ runId });
});
```

**Step 2: Add a server test**

Append to `tests/web/server.test.ts` (or wherever `POST /api/runs` is tested):

```ts
it("forwards founderProfileUrls to the queue", async () => {
  const res = await request(app)
    .post("/api/runs")
    .send({
      url: "https://harvey.ai",
      founderProfileUrls: ["https://www.linkedin.com/in/a/", "  ", "https://www.linkedin.com/in/b/"],
    });
  expect(res.status).toBe(202);
  // Inspect the spy on dealQueue.add (set up at top of suite) to confirm
  // the payload carried both URLs and dropped the whitespace entry.
});
```

If the existing test file doesn't already mock `dealQueue.add`, add one at the suite top using the same pattern as other queue mocks.

**Step 3: Run server tests**

Run: `npx vitest run tests/web/server.test.ts`
Expected: all PASS including the new case.

**Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

**Step 5: Commit**

```bash
git add src/web/routes.ts tests/web/server.test.ts
git commit -m "feat(api): accept optional founderProfileUrls on POST /api/runs"
```

---

### Task 6: SSE progress phases for discovery + profile scraping

**Files:**
- Modify: `src/orchestrator/run.ts`
- Modify: `src/agents/ingestion.ts` (accept an optional progress hook)
- Modify: `tests/orchestrator.progress.test.ts`

**Step 1: Extend the Phase type**

In `src/orchestrator/run.ts`, change:

```ts
export type Phase =
  | "ingestion"
  | "discovery" | "profiles"
  | "market" | "founder" | "product" | "tokenomics" | "risk"
  | "memo";
```

**Step 2: Plumb the progress callback into ingest**

In `src/agents/ingestion.ts`, change the `ingest` signature:

```ts
export interface IngestArgs {
  deckPath?: string;
  whitepaperPath?: string;
  websitePath?: string;
  founderProfileUrls?: string[];
  onPhase?: (phase: "discovery" | "profiles", info: { count?: number }) => void | Promise<void>;
}
```

Inside `ingest()`, before calling `discoverFounders`, emit `onPhase?.("discovery", {})`. After dedupe-and-before-scrape, emit `onPhase?.("profiles", { count: allUrls.length })`. Both calls guarded with `if (a.onPhase)`.

**Step 3: Wire it from the orchestrator**

In `src/orchestrator/run.ts`, replace the ingest call:

```ts
const [ctx, thesis] = await Promise.all([
  ingest({
    ...args,
    onPhase: async (phase, info) => {
      await progress(phase, info.count ?? 0, info.count ?? 1);
    },
  }),
  loadThesis(),
]);
```

**Step 4: Update the progress test**

In `tests/orchestrator.progress.test.ts`, add an assertion that for a run with `websitePath` set and discovery mocked to return 2 URLs, the progress callback gets called with `phase: "discovery"` and `phase: "profiles"`.

(Use the same `vi.mock("../../src/ingest/founders.js", ...)` pattern from Task 3.)

**Step 5: Run tests**

Run: `npx vitest run tests/orchestrator.progress.test.ts`
Expected: PASS.

**Step 6: Run full suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all PASS, 0 type errors.

**Step 7: Commit**

```bash
git add src/orchestrator/run.ts src/agents/ingestion.ts tests/orchestrator.progress.test.ts
git commit -m "feat(progress): emit discovery + profiles SSE phases"
```

---

### Task 7: Frontend — manual URL textarea + progress UI

**Files:**
- Modify: `web/src/pages/Home.tsx`
- Modify: `web/src/lib/api.ts`
- Modify: `web/src/components/AgentProgress.tsx` (or wherever phase labels live)

**Step 1: Update the API client**

In `web/src/lib/api.ts`:

```ts
export async function createRun(
  url: string,
  founderProfileUrls?: string[],
): Promise<{ runId: number }> {
  const res = await fetch("/api/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, founderProfileUrls }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}
```

**Step 2: Add the textarea to Home.tsx**

In `web/src/pages/Home.tsx`, add:

```tsx
const [founderUrlsRaw, setFounderUrlsRaw] = useState("");
// ...
const submit = async (e: React.FormEvent) => {
  e.preventDefault();
  setError(null);
  setSubmitting(true);
  try {
    const founderProfileUrls = founderUrlsRaw
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const { runId } = await createRun(url, founderProfileUrls.length ? founderProfileUrls : undefined);
    navigate(`/runs/${runId}`);
  } catch (err: any) {
    setError(err?.message ?? "Failed to start run");
    setSubmitting(false);
  }
};
```

In the JSX, after the existing input row, add:

```tsx
<details className="mt-4 text-sm">
  <summary className="cursor-pointer text-zinc-500 hover:text-zinc-700">
    Founder LinkedIn URLs (optional)
  </summary>
  <textarea
    value={founderUrlsRaw}
    onChange={(e) => setFounderUrlsRaw(e.target.value)}
    placeholder={"https://www.linkedin.com/in/founder1/\nhttps://www.linkedin.com/in/founder2/"}
    className="mt-2 w-full h-24 p-3 border border-zinc-300 rounded text-sm font-mono"
    disabled={submitting}
  />
  <p className="mt-1 text-xs text-zinc-400">
    One per line. Leave blank to auto-discover from the company site.
  </p>
</details>
```

**Step 3: Render new progress phases**

In the AgentProgress component (or wherever phase strings are rendered), map the new phases:
- `"discovery"` → "Discovering founders…"
- `"profiles"` → "Scraping LinkedIn profiles…"

If they're already pulled from a single `phase` field, just extend the label switch.

**Step 4: Manually verify in dev**

Run the backend and frontend:
```bash
npm run start &     # backend on :3000
cd web && npm run dev  # vite on :5173
```

Open `http://localhost:5173`, paste a URL, hit Analyze. Expected:
- Without `FIRECRAWL_API_KEY`: warning logged but run completes normally with empty founderProfiles.
- With `FIRECRAWL_API_KEY` set: progress shows "Discovering founders…" then "Scraping LinkedIn profiles…" then specialist cards light up.

**Step 5: Frontend typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: 0 errors.

**Step 6: Commit**

```bash
git add web/src/pages/Home.tsx web/src/lib/api.ts web/src/components/AgentProgress.tsx
git commit -m "feat(web): manual founder URL textarea + new progress phase labels"
```

---

### Task 8: Docs + learnings

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md` (Completed Work section)
- Modify: `learnings.md` (any Firecrawl gotchas hit during impl)
- Modify: `short_term_memory.md`

**Step 1: README — env + Firecrawl mention**

Add a "Firecrawl (optional)" section near "Environment setup":

> Founder discovery uses [Firecrawl](https://www.firecrawl.dev). Set `FIRECRAWL_API_KEY` in `.env` to enable auto-discovery from the company URL and LinkedIn profile scraping. If unset, the Founder agent runs on website text only and marks claims `[speculative]` accordingly.

**Step 2: CLAUDE.md — add a Completed Work entry**

Append under `## Completed Work`:

```markdown
### 2026-04-30 — Firecrawl founder discovery
- Replaced naive undici LinkedIn scraper (always blocked by auth wall) with Firecrawl `/extract` for auto-discovery from company URL + per-profile `/scrape`.
- New ingest modules: `src/ingest/firecrawl.ts` (singleton client, null when key unset) and `src/ingest/founders.ts` (`discoverFounders`, `scrapeProfile`).
- Two-phase ingestion: phase 1 fetches website + discovers founders in parallel; phase 2 scrapes profile URLs in parallel. ~10s total (vs. 200ms) — covered by new SSE phases `discovery` + `profiles`.
- Manual override via optional textarea on Home page; provided URLs replace auto-discovery, dedupe case-insensitive.
- Graceful degrade when `FIRECRAWL_API_KEY` is unset — Founder agent still runs on website text.
- Plan: `docs/plans/2026-04-30-firecrawl-founder-discovery-implementation.md`
```

**Step 3: short_term_memory.md — promote oldest entry to long-term**

Move the oldest 2026-04-25 entry into `long_term_memory.md` as a 2-3 line summary, then prepend the new task summary at the top of `short_term_memory.md`.

**Step 4: learnings.md — only if something surprising happened during impl**

Examples of things worth capturing during implementation:
- Firecrawl SDK return-shape quirks (e.g., `scrape` returns `{ data: { markdown } }` not just `{ markdown }`).
- Any zod-schema mismatch between Firecrawl docs and actual response.
- TS-strict issues with the SDK's optional-property types.

If none surface, skip this file.

**Step 5: Commit**

```bash
git add README.md CLAUDE.md short_term_memory.md long_term_memory.md learnings.md
git commit -m "docs: firecrawl founder discovery — README + CLAUDE.md + memory rotation"
```

---

## Final verification

Run from project root:

```bash
npx vitest run                          # all backend tests
cd web && npx tsc --noEmit && cd ..     # frontend typecheck
npx tsc --noEmit                        # backend typecheck
```

Expected:
- Backend: prior 39 tests + ~12 new tests all PASS.
- Both typechecks: 0 errors.

Optional manual smoke (requires real `FIRECRAWL_API_KEY` + `OPENAI_API_KEY` + redis running):
1. `npm run start` (backend).
2. `cd web && npm run build && cp -r dist ../public` (or however the static-serve is wired).
3. Open `http://localhost:3000`, submit `https://www.harvey.ai`, watch progress phases fire in order, confirm Founder section in final memo cites at least one `[verified]` LinkedIn source.

## Out of scope for this plan
- Twitter/X profile scraping.
- Per-run Firecrawl credit accounting.
- Caching scraped profiles across runs.
- Authenticated LinkedIn scraping via proxy services (Firecrawl already handles this internally).

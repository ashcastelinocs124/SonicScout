# Learnings

### 2026-05-03 — config files mutated by API at runtime: gitignore the active copy, ship a `.example`
**Ref:** Architecture > config/thesis.md, Backend > src/web/routes.ts
- **What:** The thesis-onboarding flow overwrites `config/thesis.md` from the API process whenever the user approves a new thesis. The file is git-tracked, so every onboarding shows up as `M config/thesis.md` in `git status` and risks being committed accidentally (would publish someone's private thesis configuration into the repo).
- **Why it matters:** Same shape as the recurring secret-leak pattern but for non-secret config. The fix is a one-time gitignore + template setup, not a per-incident apology.
- **Fix/Pattern:** When a user-mutable file lives at a stable path the code reads from: ship `<path>.example`, gitignore `<path>`. Boot path: if `<path>` is missing, copy from `<path>.example`. Apply this to `config/thesis.md` next session — the in-product onboarding is shipped, so the file is now de facto user state, not source. Same applies to the marker `data/.thesis-onboarded` (already in gitignored `data/` dir).

### 2026-05-03 — `loadThesis()` is called once per run; reconfigure mid-analysis is safe
**Ref:** Architecture > src/orchestrator/run.ts, src/agents/thesis.ts
- **What:** `runOrchestrator` calls `loadThesis()` exactly once at the top via `Promise.all([ingest(args), loadThesis()])`. The thesis is then passed by value to every specialist. So clicking "Reconfigure thesis" mid-analysis (which deletes the marker and overwrites `config/thesis.md`) does NOT corrupt the in-flight run — it finishes against the snapshot it loaded.
- **Why it matters:** Avoids an obvious-looking "race" worry that doesn't actually exist. New thesis applies to the *next* analysis, not the in-flight one. Behavior is correct by construction; just non-obvious.
- **Fix/Pattern:** When designing user-mutable runtime state, prefer atomic per-run snapshots (load once at the top, pass by value through the pipeline) over re-reading inside hot paths. Saves you from caching invalidation problems and lets users confidently update config without "is my analysis going to break" anxiety.

### 2026-05-02 — OpenAI Responses API: web_search_preview annotations are the only trustable citation source
**Ref:** Architecture > src/ingest/competitors.ts
- **What:** When asking gpt-5-mini to find competitors via the `web_search_preview` tool, the model frequently returns plausible-looking citation URLs that are NOT in the actual `response.output[*].content[*].annotations` (i.e., it hallucinates URLs that match its training-data shape but were never retrieved on this call).
- **Why it matters:** A `[verified]` claim citing a fake URL is worse than no claim — it looks rigorous to the user but fails the project's grounding rule. The whole point of using web_search is that the model can only cite what it retrieved.
- **Fix/Pattern:** Two-layer defense. (1) Prompt-level: explicitly say "you MUST cite a URL the tool actually returned — do NOT invent URLs." (2) Code-level: walk `response.output` for `url_citation` annotations, build `Set<host>`, filter the model's claimed `source` URLs to only those whose host appears in that set. Hostname comparison (not full URL) accommodates query-string and trailing-slash variance. Implementation: `src/agents/llm.ts:callLLMWithSearch` returns `{ text, citationHosts }` so callers can do this filter. Also drop self-citations (source host === company host).

### 2026-05-02 — discoverFounders was extracting from bare homepage; ~always empty
**Ref:** Architecture > src/ingest/founders.ts
- **What:** `discoverFounders` called `fc.extract({ urls: [companyUrl] })` — only the homepage, which rarely lists founders. Result: founder agent ran with `founderProfiles=[]` and produced all-`[speculative]` claims (e.g. Harvey.ai run #4). The original 2026-04-30 design *promised* to fan out across `/team`, `/about`, `/leadership` but that fan-out never shipped — silent quality regression masked by "completed" status.
- **Why it matters:** Pipeline reported success while the founder section was useless. No alert because Firecrawl returned `success: true, data: { founders: [] }` (200 with empty array) which our code happily passes through.
- **Fix/Pattern:** Two-stage picker (`src/ingest/teamPicker.ts`). Path A: cheerio anchor scrape → `gpt-5-mini` picks ≤3 URLs from real nav links. Path B fallback: `fc.map()` → same picker over URL paths. Picker constrained to URLs that appear in the candidate list (no hallucinated 404s). Net cost ~same (5 cr → 1 LLM call + 5 cr) with dramatically higher recall. When picker returns `[]` we skip Firecrawl `/extract` entirely (saves 5 credits per blind run). Pattern to remember: when an external API can return "success with empty payload," wrap it in our own coverage check.

### 2026-05-02 — Vitest 4: top-level `const mockX = vi.fn()` referenced inside `vi.mock` factory throws ReferenceError
**Ref:** Testing > tests/ingest/
- **What:** Writing `const mockRequest = vi.fn(); vi.mock("undici", () => ({ request: mockRequest }))` throws `Cannot access 'mockRequest' before initialization` because `vi.mock` is hoisted above top-level `const` initializers. The existing `tests/ingest/founders.test.ts` happens to dodge it because its FirecrawlMock factory captures `mockExtract`/`mockScrape` *lazily* via `function FirecrawlMock() { return { extract: mockExtract, ... } }` — the references resolve when `new FirecrawlApp()` is called, after init.
- **Why it matters:** Easy to repro, very confusing error, will recur on every new `vi.mock` whose factory eagerly references a `vi.fn()`.
- **Fix/Pattern:** Use `vi.hoisted` for the mock fns:
  ```ts
  const { mockX, mockY } = vi.hoisted(() => ({ mockX: vi.fn(), mockY: vi.fn() }));
  vi.mock("module", () => ({ thing: mockX }));
  ```
  This is the canonical Vitest 4 pattern. Apply to every new test file.

### 2026-05-02 — Node 25 breaks vite/concurrently/native modules; corrupt node_modules choked Vite watcher
**Ref:** Run locally
- **What:** Running `npm run dev` on Node 25.5.0 produced cascading failures: `concurrently` crashed in rxjs ("Class extends value undefined"); Vite 8 threw `does not provide an export named 't'` from its own bundled logger; `tsx watch` hung silently because `htmlparser2/dist/esm/package.json` was an "Invalid package config." After downgrading to Node 22, a corrupt `node_modules` from the prior partial-install left ~hundreds of iCloud-style "name 2" duplicate dirs; `rm -rf` was hanging on them, and Vite's file watcher saw every deletion event and starved HTTP requests (frontend appeared frozen).
- **Why it matters:** Three different failure modes from the same root cause (wrong Node version + dirty install). Each looked unrelated. The "frontend not loading" symptom was the most misleading — Vite was actually running, just busy logging file change events for ~10k files being deleted in the background.
- **Fix/Pattern:** (1) Node version: this project targets Node 20–22. Use nvm: `nvm use 22` before any install. (2) Clean install pattern: `mv node_modules .nm-trash-$$ && rm -rf .nm-trash-$$ &` (atomic move + background delete) instead of foreground `rm -rf node_modules` — but **move the trash OUT of the project root** so file watchers don't see the deletes. (3) When Vite "appears to load forever," check `lsof -iTCP:5173 -sTCP:LISTEN` (proves it's bound) then `curl -m 3 http://127.0.0.1:5173/`; if the curl hangs but the port is bound, suspect file-watcher saturation. (4) `web/vite.config.ts` now has `server.watch.ignored: ["**/.nm-trash-*/**", ...]` to prevent recurrence.

### 2026-04-25 — pdf-parse v2 has a class-based API
**Ref:** Architecture > src/ingest/pdf.ts
- **What:** `pdf-parse@2.4.5` exports `{ PDFParse }` class, not a default function. v1 was `pdfParse(buf) -> {text}`; v2 is `new PDFParse({ data: buf }).getText() -> TextResult{ text, pages[] }`.
- **Why it matters:** Most online docs / blog posts still reference v1 default-function API. Using `import pdfParse from "pdf-parse"` then calling it errors with "is not a function".
- **Fix/Pattern:** `import { PDFParse } from "pdf-parse"; const p = new PDFParse({ data: buf }); const r = await p.getText(); await p.destroy();` Always call destroy() in a finally block — it cleans up the underlying pdfjs document.

### 2026-04-28 — openai SDK peer-dep pin (v4 vs v6) for zod v4 projects
**Ref:** Architecture > Tech stack, src/agents/llm.ts
- **What:** `openai@^4.x` declares `peerOptional zod@^3.23.8` only — npm refuses to install it alongside `zod@^4` (ERESOLVE). `openai@^6.x` widened the peer to `^3.25 || ^4.0`. Hit this swapping DealSense from `@anthropic-ai/sdk` to OpenAI.
- **Why it matters:** Easy to grab the version a stale blog post recommends (`^4.77.0`) and get blocked. `--legacy-peer-deps` would mask it but leaves a real risk of zod-schema runtime mismatch.
- **Fix/Pattern:** For projects on zod v4, pin `openai@^6` (currently `^6.35.0`). Verify with `npm view openai@latest peerDependencies`.

### 2026-04-28 — gpt-5 family requires `max_completion_tokens`, not `max_tokens`
**Ref:** Architecture > src/agents/llm.ts
- **What:** OpenAI's gpt-5 / gpt-5-mini reject the legacy `max_tokens` param on `chat.completions.create` and require `max_completion_tokens` instead. (gpt-4-era models still accept `max_tokens`.)
- **Why it matters:** Silent footgun when migrating from `@anthropic-ai/sdk` (where the field is `max_tokens`) — looks like the same param renamed but it isn't supported on every OpenAI model.
- **Fix/Pattern:** Use `max_completion_tokens` in `callLLM`. If you ever need to support older OpenAI models alongside gpt-5, branch on model name.

### 2026-04-29 — shadcn CLI now generates Tailwind v4 CSS, not v3
**Ref:** Tech stack > Frontend
- **What:** Running `npx shadcn@latest init -t vite -b radix -p nova` writes `src/index.css` using `@import "shadcn/tailwind.css"` and `oklch()` colors with class names like `border-border`, `bg-background`. These are Tailwind v4-only — they don't compile under Tailwind v3 (`The 'border-border' class does not exist`).
- **Why it matters:** Plans/blogs that say "shadcn requires Tailwind v3" are now stale. Pinning v3 + running the latest shadcn CLI gives you a broken build.
- **Fix/Pattern:** For new shadcn projects, install `tailwindcss@^4` + `@tailwindcss/vite`, drop `postcss.config.js` and `tailwind.config.js`, register the plugin in `vite.config.ts` (`plugins: [react(), tailwindcss()]`), and use `@import "tailwindcss"` in CSS. Add a `@theme inline` block to map shadcn's `--background`/`--border`/etc. CSS vars to Tailwind's `--color-*` so utilities like `bg-background` resolve.

### 2026-04-29 — TypeScript 6 deprecates `baseUrl` in tsconfig
**Ref:** Tech stack > Frontend
- **What:** Vite scaffold uses TS 6 (`typescript: ~6.0.2`). Adding `"baseUrl": "."` alongside `"paths": { "@/*": ["./src/*"] }` triggers `error TS5101: Option 'baseUrl' is deprecated and will stop functioning in TypeScript 7.0`.
- **Why it matters:** Most shadcn setup guides include `baseUrl` because TS <6 needed it. With TS 6+, paths resolve relative to the tsconfig dir by default — `baseUrl` is redundant and now warning-noisy.
- **Fix/Pattern:** Just write `"paths": { "@/*": ["./src/*"] }` in `tsconfig.app.json` and `tsconfig.json`. No `baseUrl`. Path resolution still works because TS infers it from the tsconfig location.

### 2026-04-30 — leaked Firecrawl API key in chat → rotate immediately (third recurrence)
**Ref:** Git push policy (HARD RULE), Run locally
- **What:** User pasted a live `fc-...` Firecrawl API key into the conversation while wiring up `.env` for founder discovery. Third secret exposure in this project (Slack 2026-04-28, OpenAI 2026-04-29, Firecrawl 2026-04-30). User opted to use the leaked key for the demo and rotate later.
- **Why it matters:** Firecrawl keys grant scraping + LLM-extraction credits. Hobby tier ($16/mo, 3k credits) can be drained in hours by an exfiltrated key. The cross-provider pattern is now firmly established — every new third-party SDK introduces another leak surface.
- **Fix/Pattern:** Same protocol as prior entries. Even when the user says "use it for now," (1) never echo the key back, (2) write only to gitignored `.env` via terminal redirection, never via a tool that surfaces the value, (3) log this entry, (4) at session end remind the user to rotate. Pre-emptively show the user the `echo 'KEY=...' >> .env` pattern when scaffolding any new third-party SDK so they never paste into chat.

### 2026-04-29 — leaked OpenAI API key in chat → rotate immediately (recurrence)
**Ref:** Git push policy (HARD RULE), Run locally
- **What:** User pasted a live `sk-proj-...` OpenAI key directly into the conversation while trying to set up `.env`. Second secret exposure in this project (Slack bot token first on 2026-04-28).
- **Why it matters:** Chat transcripts may be retained. OpenAI keys grant full inference access — at gpt-5 pricing, an exfiltrated key can rack up hundreds of dollars of spend per day before the user's usage limit kicks in. Pattern is now recurring across providers.
- **Fix/Pattern:** When a user pastes ANY secret (token starting `sk-`, `xoxb-`, `xapp-`, `xoxp-`, JWT, AWS access keys, Github PAT, etc.), immediately: (1) refuse to write it to disk even if `.env` is gitignored, (2) instruct the user to rotate it at the provider's console, (3) provide a terminal-only command pattern (`echo 'KEY=...' > .env`) so the user sets the secret themselves without it touching the conversation. Never echo the secret back. Add a recurring entry rather than overwriting.

### 2026-04-28 — leaked Slack bot token in chat → rotate immediately
**Ref:** Git push policy (HARD RULE), Slack app setup
- **What:** A live `xoxb-...` token was pasted into the conversation. Even if `.env` is gitignored, anything in chat transcripts is considered exposed.
- **Why it matters:** Slack tokens grant full bot scopes (`chat:write`, `files:read`, `commands`) — a leaked token can post-as-bot, read DMs the bot is in, and exfiltrate uploaded decks.
- **Fix/Pattern:** Never write a leaked secret to disk, even in `.env`. Reinstall the Slack app or revoke + reissue tokens, then store only the new value. Tell the user the rotation step explicitly before any wiring work.

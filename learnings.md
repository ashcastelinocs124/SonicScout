# Learnings

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

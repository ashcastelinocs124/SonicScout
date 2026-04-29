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

### 2026-04-28 — leaked Slack bot token in chat → rotate immediately
**Ref:** Git push policy (HARD RULE), Slack app setup
- **What:** A live `xoxb-...` token was pasted into the conversation. Even if `.env` is gitignored, anything in chat transcripts is considered exposed.
- **Why it matters:** Slack tokens grant full bot scopes (`chat:write`, `files:read`, `commands`) — a leaked token can post-as-bot, read DMs the bot is in, and exfiltrate uploaded decks.
- **Fix/Pattern:** Never write a leaked secret to disk, even in `.env`. Reinstall the Slack app or revoke + reissue tokens, then store only the new value. Tell the user the rotation step explicitly before any wiring work.

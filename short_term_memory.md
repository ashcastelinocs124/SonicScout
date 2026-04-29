# Short-term Memory

## 2026-04-25 — DealSense brainstorm + design + implementation
- **What:** Brainstormed DealSense (AI venture analyst for Decasonic) via superpowers:brainstorming. Locked architecture: Slack-first, 7-agent pipeline (Ingestion → 5 parallel specialists → Memo Synthesis), static `thesis.md`, confidence tiering on every claim, recommendation = Pass/Watch/Take Meeting/Invest.
- **Outcome:** Design doc + implementation plan written to `docs/plans/`. All 15 plan tasks implemented sequentially via direct implementation (subagent-driven was rejected as overkill for greenfield). 31/31 tests pass, typecheck clean. No remote push yet.
- **Why:** This is the v1 — pitch-ready demo for Decasonic. Real Slack workspace + Anthropic API key needed to run live.

## 2026-04-28 — LLM provider swap: Anthropic → OpenAI
- **What:** Hard-swapped the LLM layer from `@anthropic-ai/sdk` to `openai`. Models: gpt-5-mini for the 5 specialists + follow-up, gpt-5 for memo synthesis. Removed the `cacheSystem` flag from `LLMArgs` (OpenAI auto-caches prompts >1024 tokens — explicit cache_control is Anthropic-only). Touched: `src/agents/llm.ts`, `specialist.ts`, `memo.ts`, `followup.ts`, `tests/agents/llm.test.ts`, `tests/agents/specialists.test.ts` (replaced cacheSystem assertion with model assertion), `package.json` (`openai@^6.35.0`), `.env.example` (`OPENAI_API_KEY`), `README.md`, `CLAUDE.md`.
- **Outcome:** Typecheck clean, all 31/31 tests pass. Zod-v4 peer-dep conflict required openai v6 (not v4 — captured in learnings.md).
- **Why:** User switched to an OpenAI key. Also rotated/flagged a Slack bot token that leaked in chat — must reinstall Slack app before going live.

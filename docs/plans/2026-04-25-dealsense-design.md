# DealSense Agent — Design Doc

**Date:** 2026-04-25
**Project:** sonicscout
**Status:** Approved — ready for implementation planning

---

## 1. Purpose

DealSense is an AI-native venture analyst built for **Decasonic** (a thesis-driven Web3 x AI venture firm). It transforms unstructured startup inputs (decks, websites, founder bios, tokenomics docs, GitHub, news, competitor data, traction, funding history) into a structured, thesis-aligned investment memo with a clear recommendation.

It is designed to live where Decasonic already works — Slack — and to make epistemic state legible so partners can trust it for IC-grade decisions.

## 2. Use Case (deal-flow position)

**Primary wedge:** deep diligence / IC memo generation, with a recommendation taxonomy that doubles as a screening signal:

```
Pass  →  Watch  →  Take Meeting  →  Invest
```

- Top-of-funnel screening is a byproduct (`Pass` = skip, `Take Meeting`+ = read the memo).
- Pre-meeting prep is a byproduct (the threaded memo *is* the brief).
- Portfolio monitoring is **out of scope for v1** (different system, cron-driven, deferred to v2).

## 3. Form Factor

**Slack-first.** A slash command in Decasonic's deal-flow channel:

```
/dealsense <url-or-deck-attachment>
```

The bot:

1. Replies immediately with `🔍 Analyzing... (~90s)`
2. Runs the 7-agent pipeline asynchronously
3. Edits the parent message to show **recommendation + 3-bullet thesis + 3-bullet risks**
4. Posts full per-agent sections (Market, Founder, Product, Tokenomics, Trust & Risk) as threaded replies
5. Listens for follow-up questions in-thread and routes them to the relevant specialist agent (using already-cached context)
6. Captures partner reactions (👍 / 👎 / 🤔) as feedback signal for v2

**Why Slack and not a web app:**
- Embeds in existing workflow — partners don't switch tools
- Async-friendly — long agent runs don't block a UI
- Threaded replies map naturally to per-agent sections
- File uploads handled natively for deck PDFs
- Reactions = zero-friction feedback loop

## 4. Architecture

### 4.1 Multi-agent pipeline

```
Slack /dealsense <input>
        │
        ▼
  Slack Event Handler ──► Job Queue (Redis/BullMQ)
                                │
                                ▼
                      Orchestrator
                                │
        ┌───────────────────────┴────────────────────────┐
        ▼                                                ▼
  Agent 1: Document Ingestion                  (shared context cache)
        │
        ├──► Agent 2: Market Map      ┐
        ├──► Agent 3: Founder Signal  │
        ├──► Agent 4: Product         │  parallel fan-out
        ├──► Agent 5: Tokenomics      │
        └──► Agent 6: Trust & Risk    ┘
                                │
                                ▼
                      Agent 7: Memo Synthesis
                                │
                                ▼
                Slack Web API: post memo to thread
                                │
                                ▼
                      Persist run to DB (for follow-ups)
```

### 4.2 Agent specifications

| # | Agent | Inputs | Outputs |
|---|---|---|---|
| 1 | **Document Ingestion** | Deck PDF, website URL, LinkedIn URL, whitepaper PDF | Normalized text + structured metadata (founders, claims, links) cached for downstream agents |
| 2 | **Market Map** | Ingested context + `thesis.md` (Market beliefs section) | Competitors, market category, market size estimate, thesis-fit verdict |
| 3 | **Founder Signal** | LinkedIn, GitHub, Crunchbase, deck team slide + `thesis.md` (Founder filters) | Founder-market-fit score, prior experience, network signals, anti-pattern flags |
| 4 | **Product** | Deck + site + ingested claims | Problem/solution/differentiation, judgment on whether AI and blockchain are *necessary* |
| 5 | **Tokenomics** | Whitepaper, token docs (if present) + `thesis.md` (Token stance) | Utility, supply, emissions, governance, "token necessary?" verdict |
| 6 | **Trust & Risk** | Site, contract addresses, news + `thesis.md` (Anti-patterns) | Regulatory exposure, centralization, fraud signals, hard-rule violations |
| 7 | **Investment Memo** | Structured outputs from agents 2–6 + `thesis.md` (full) | VC-style memo with recommendation: `Pass / Watch / Take Meeting / Invest` |

**Key invariants:**
- Agents 2–6 run **in parallel** (no inter-dependencies) — wall-clock target: ~90 seconds
- Agent 1's output is **cached and shared** — never re-parse the same deck
- Agent 7 is **synthesis-only** — never re-fetches data, only reasons over structured outputs
- Each agent emits **structured JSON + prose narrative + citations**

## 5. Thesis Encoding

Decasonic's edge is thesis-driven. v1 uses a **static `config/thesis.md`** as the single source of truth — version-controlled, transparent, easy for partners to edit.

Structure (sections injected per-agent to keep tokens lean):

```markdown
## Market beliefs
- AI agents need crypto rails for autonomous payments
- Consumer crypto is fatigued; infra + agentic apps win 2026–2028

## Founder filters
- Strong preference for technical founders shipping in public
- Skeptical of repeat-founder solo CEOs without CTO

## Token stance
- Token only justified if it solves coordination/incentive problem unsolvable off-chain

## Anti-patterns (auto-flag)
- "AI + blockchain" with no concrete on-chain interaction
- Tokens used purely for fundraising
```

**Anti-patterns become hard rules** — tripping one escalates in Trust & Risk and lowers Memo recommendation tier.

**v2 path:** RAG over Decasonic's full memo archive + portco updates. v1 ships the static doc to keep build scope tight.

## 6. Hallucination Handling — Confidence Tiering

Every factual claim in the memo is tagged:

| Tier | Meaning | Partner action |
|---|---|---|
| `[verified]` | Direct source exists, agent quoted it | Trust it; cite in IC memo |
| `[inferred]` | Logical conclusion from verified facts | Treat as hypothesis; validate on call |
| `[speculative]` | No source; agent's best guess | Use as a question to ask, never as a claim |

**Implementation:**
- Each specialist agent's prompt enforces tagging on every factual claim with a one-line source/reasoning note
- A lightweight post-processor strips `[verified]` tags whose source field is empty (defense-in-depth)
- Memo renderer styles tiers visually distinct (green/yellow/red dots in Slack via emoji)

This beats pure citations-required (too restrictive — drops useful intel) and beats trusting the model (hallucinations show up as `[speculative]` rather than as confident falsehoods).

## 7. Scope — v1 IN / v2 OUT

### ✅ v1 (demo-ready, ~1–2 weeks)
- Slack bot with `/dealsense` slash command + threaded memo + follow-up Q&A
- 7-agent pipeline (Ingestion → 5 specialists in parallel → Memo synthesis)
- Inputs: deck PDF, website URL, LinkedIn URL, whitepaper PDF
- Confidence tiering on every claim
- Static `thesis.md` injected per-agent
- Anti-pattern hard rules
- Recommendation taxonomy: Pass / Watch / Take Meeting / Invest
- Persistence of runs for follow-up routing

### ❌ v2 / Out of scope for v1
- Real-time portfolio monitoring
- Thesis RAG over full Decasonic memo archive (the moat story — pitch but defer)
- On-chain traction analysis (TVL, DAU, token holder distribution)
- Smart contract bytecode audit
- Comp-set valuation modeling
- Multi-tenant / white-label
- Standalone web app UI / PDF export
- Two-pass Fact-Check Agent (rely on prompt-level tiering for v1)

## 8. Demo Script (the "wow" moment)

1. Partner drops a real recent inbound deck into `#deal-flow`:
   `/dealsense ./synapse-deck.pdf`
2. Bot replies in 2 seconds: `🔍 Running 6 agents in parallel… ETA 90s`
3. ~90s later, parent message updates with:
   - **Recommendation:** `Take Meeting`
   - **Thesis (3 bullets)** — why it fits Decasonic
   - **Risks (3 bullets)** — what would kill it
4. Threaded replies post Market / Founder / Product / Tokenomics / Risk in full
5. Partner reacts 👍 → bot logs feedback signal
6. Partner replies in thread: *"what would change your mind on the token?"* → Tokenomics agent answers using cached context

## 9. Risks & Open Questions

| Risk | Mitigation |
|---|---|
| Hallucinated founder facts → embarrassing | Confidence tiering; verified-tag post-processor |
| Slack 3s slash-command timeout | Immediate ack + async job queue |
| Long agent runs (>90s) feel broken | Progressive in-place message edits ("Agent 3/6 done…") |
| `thesis.md` goes stale | Make it a 1-page doc partners can edit in 10min; v2 = auto-RAG |
| Decasonic doesn't use Slack heavily | Confirm before build; CLI fallback is a 1-day port |
| Per-startup data sources rate-limit (LinkedIn, Crunchbase) | Cache aggressively; degrade gracefully — emit `[speculative]` if blocked |
| LLM cost per memo | Budget target: < $2/run; track via per-agent token telemetry |

## 10. Success Criteria for Demo

- One real Decasonic inbound deck → memo in under 120 seconds end-to-end
- Memo correctly trips at least one `thesis.md` anti-pattern on a known-bad example
- Memo correctly identifies founder-market-fit on a known-good example
- Zero `[verified]` claims without a real source URL
- Partner can ask one follow-up question in-thread and get a coherent answer

---

## Appendix A — Memo template (excerpt)

Each memo posts to Slack as:

**Parent message:**
```
🟢 Recommendation: TAKE MEETING — Synapse Protocol

Thesis (why we'd lean in):
• Decentralized GPU marketplace directly on Decasonic's "AI agents need crypto rails" thesis
• Strong technical founder ex-Anthropic with NeurIPS publications
• Token has clear coordination role (GPU supply matching) — not fundraising-only

Risks (what would kill it):
• Solo CEO, no CTO co-founder yet (anti-pattern: softer match)
• Tokenomics: 28% team allocation with 12-month cliff — light vesting
• No traction data yet (pre-launch); category is crowded (io.net, Render, Akash)

→ See thread for full memo
```

**Threaded sections:** Market Map · Founder Signal · Product · Tokenomics · Trust & Risk

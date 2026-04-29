# DealSense

Slack-first multi-agent venture analyst for **Decasonic** (Web3 x AI). Drop a startup URL or deck into Slack with `/dealsense`, get a thesis-aligned investment memo back in ~90 seconds with a `Pass / Watch / Take Meeting / Invest` recommendation, three-bullet thesis, three-bullet risk list, and full per-agent sections in a thread.

## Architecture

```
/dealsense <url-or-deck>
        │
        ▼
  Slack Bolt → BullMQ job
        │
        ▼
  Orchestrator
        │
  Agent 1 (Ingestion)
        │
        ├─► Agent 2 (Market Map)        ┐
        ├─► Agent 3 (Founder Signal)    │  parallel
        ├─► Agent 4 (Product)           │
        ├─► Agent 5 (Tokenomics)        │
        └─► Agent 6 (Trust & Risk)      ┘
                │
                ▼
        Agent 7 (Memo Synthesis)
                │
                ▼
        Slack thread + SQLite persistence
```

Every factual claim is tagged `[verified]`, `[inferred]`, or `[speculative]`. A post-processor strips `[verified]` tags that lack a source line. The Decasonic thesis lives in `config/thesis.md` and is injected per-agent.

## Slack app setup

1. Create a Slack app at https://api.slack.com/apps (from manifest, or from scratch).
2. Enable **Socket Mode** and generate an App-Level Token with `connections:write`.
3. Add bot token scopes: `commands`, `chat:write`, `files:read`, `channels:history`, `groups:history`, `im:history`, `mpim:history`.
4. Add a slash command: `/dealsense` with description "Analyze a startup".
5. Subscribe to bot events: `message.channels`, `message.groups`, `message.im`, `message.mpim`.
6. Install the app to your workspace and copy the bot token, signing secret, and app-level token into `.env`.

## Run locally

Requires Node 20+ and a Redis instance.

```bash
cp .env.example .env
# fill in SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, SLACK_APP_TOKEN, OPENAI_API_KEY

redis-server &
npm install
npm run dev
```

In Slack: `/dealsense https://example-startup.com`

## Tests + typecheck

```bash
npm test          # vitest, all units mock the LLM
npm run typecheck # strict tsc, no emit
npm run build     # compile to dist/ (also copies db/schema.sql)
```

## Editing the thesis

`config/thesis.md` has four sections that get sliced per agent:

- `## Market beliefs` → Market Map agent
- `## Founder filters` → Founder Signal agent
- `## Token stance` → Product + Tokenomics agents
- `## Anti-patterns` → Tokenomics + Trust & Risk agents (anti-patterns become HARD FLAGS)

Edit the file, restart the worker. No rebuild needed at runtime — the file is read on each request.

## Adding a new specialist agent

All specialists share `src/agents/specialist.ts` (the `runSpecialist` runner). To add a seventh specialist:

1. Create `src/agents/<your-agent>.ts` following the pattern in `market.ts`/`founder.ts`/etc. — call `runSpecialist({ agent, systemPreamble, userTask, ctx, thesis })`.
2. Add a new `AgentKey` literal in `src/agents/thesis.ts` and a slice rule in `sliceThesis`.
3. Add it to the `Promise.all` fan-out in `src/orchestrator/run.ts`.
4. Add its section to `Memo.sections` shape (no schema change needed — `z.record`) and to `SECTION_NAMES` in `src/slack/app.ts` so it gets a thread reply.
5. Mock its module in any test that imports the orchestrator.

## Project layout

```
config/thesis.md            # Decasonic thesis (hand-edited)
src/
  agents/                   # 7 agents + shared helpers (llm, thesis, tiering)
  ingest/                   # PDF, web, LinkedIn extractors
  orchestrator/             # ingestion → fan-out → memo
  queue/                    # BullMQ producer + worker
  slack/                    # Bolt app + memo renderer
  db/                       # SQLite store (runs + follow-up routing)
  index.ts                  # entrypoint
tests/                      # vitest, all LLM calls mocked
docs/plans/                 # design + implementation plan
```

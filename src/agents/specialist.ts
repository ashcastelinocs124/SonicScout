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

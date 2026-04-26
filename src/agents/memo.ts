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

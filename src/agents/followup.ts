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

import type { Memo, Recommendation } from "../types.js";

const EMOJI: Record<Recommendation, string> = {
  "Pass": "🔴",
  "Watch": "🟡",
  "Take Meeting": "🟢",
  "Invest": "💎",
};

export function renderParent(memo: Memo) {
  return [
    { type: "header", text: { type: "plain_text", text: `${EMOJI[memo.recommendation]} Recommendation: ${memo.recommendation.toUpperCase()}` } },
    { type: "section", text: { type: "mrkdwn", text: `*Thesis (why we'd lean in):*\n${memo.thesis.map(b => `• ${b}`).join("\n")}` } },
    { type: "section", text: { type: "mrkdwn", text: `*Risks (what would kill it):*\n${memo.risks.map(b => `• ${b}`).join("\n")}` } },
    { type: "context", elements: [{ type: "mrkdwn", text: "Full per-agent sections in thread ↓" }] },
  ];
}

export function renderSection(name: string, body: string) {
  return [
    { type: "header", text: { type: "plain_text", text: name } },
    { type: "section", text: { type: "mrkdwn", text: body.slice(0, 2900) } },
  ];
}

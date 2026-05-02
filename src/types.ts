import { z } from "zod";
import type { Competitor } from "./ingest/competitors.js";

export const Recommendation = z.enum(["Pass", "Watch", "Take Meeting", "Invest"]);
export type Recommendation = z.infer<typeof Recommendation>;

export const AgentOutput = z.object({
  agent: z.string(),
  summary: z.string(),
  bullets: z.array(z.string()),
  flags: z.array(z.string()).default([]),
  score: z.number().min(0).max(10).optional(),
});
export type AgentOutput = z.infer<typeof AgentOutput>;

export const Memo = z.object({
  recommendation: Recommendation,
  thesis: z.array(z.string()).length(3),
  risks: z.array(z.string()).length(3),
  sections: z.record(z.string(), z.string()),
});
export type Memo = z.infer<typeof Memo>;

export interface IngestedContext {
  url?: string;
  deckText?: string;
  whitepaperText?: string;
  websiteText?: string;
  founderProfiles: Array<{ url: string; text: string }>;
  competitors: Competitor[];
  rawMetadata: Record<string, unknown>;
}

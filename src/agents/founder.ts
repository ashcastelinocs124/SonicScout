import { runSpecialist } from "./specialist.js";
import type { IngestedContext } from "../types.js";
import type { Thesis } from "./thesis.js";

export async function runFounder(a: { ctx: IngestedContext; thesis: Thesis }) {
  return runSpecialist({
    agent: "founder",
    systemPreamble: "You are Decasonic's Founder Signal analyst. Score founder-market-fit, prior experience, network, and credibility. Flag anti-patterns from the thesis.",
    userTask: "Produce a 'Founder Signal' section: per-founder bullets (background, prior roles, founder-market fit), a 0-10 score, and an explicit anti-pattern flag list (or 'none').",
    ctx: a.ctx,
    thesis: a.thesis,
  });
}

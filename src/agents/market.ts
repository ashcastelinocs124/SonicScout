import { runSpecialist } from "./specialist.js";
import type { IngestedContext } from "../types.js";
import type { Thesis } from "./thesis.js";

export async function runMarket(a: { ctx: IngestedContext; thesis: Thesis }) {
  return runSpecialist({
    agent: "market",
    systemPreamble: "You are Decasonic's Market Map analyst. Identify competitors, market category, market size, and assess fit vs. Decasonic's thesis.",
    userTask: "Produce a 'Market Map' section: 5 bullet points covering category, top 3 competitors with one-line teardown, est. market size with reasoning, and a thesis-fit verdict (Strong / Weak / Off-thesis).",
    ctx: a.ctx,
    thesis: a.thesis,
  });
}

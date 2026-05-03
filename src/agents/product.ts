import { runSpecialist } from "./specialist.js";
import type { IngestedContext } from "../types.js";
import type { Thesis } from "./thesis.js";

export async function runProduct(a: { ctx: IngestedContext; thesis: Thesis }) {
  return runSpecialist({
    agent: "product",
    systemPreamble: "You are the firm's Product analyst. Evaluate the user pain point, differentiation, and whether AI and blockchain are *necessary* (not decorative).",
    userTask: "Produce a 'Product' section: problem, solution, differentiation, AI-necessity verdict, blockchain-necessity verdict (each Yes/No with one-line justification).",
    ctx: a.ctx,
    thesis: a.thesis,
  });
}

import { runSpecialist } from "./specialist.js";
import type { IngestedContext } from "../types.js";
import type { Thesis } from "./thesis.js";

export async function runRisk(a: { ctx: IngestedContext; thesis: Thesis }) {
  return runSpecialist({
    agent: "risk",
    systemPreamble: "You are Decasonic's Trust & Risk analyst. Identify regulatory, smart-contract, centralization, and fraud risks. Escalate any anti-pattern hits from the thesis as HARD FLAGS.",
    userTask: "Produce a 'Trust & Risk' section: regulatory exposure, smart-contract risk, centralization risk, fraud signals, and a list of HARD FLAGS triggered from the thesis anti-patterns (or 'none').",
    ctx: a.ctx,
    thesis: a.thesis,
  });
}

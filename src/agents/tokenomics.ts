import { runSpecialist } from "./specialist.js";
import type { IngestedContext } from "../types.js";
import type { Thesis } from "./thesis.js";

export async function runTokenomics(a: { ctx: IngestedContext; thesis: Thesis }) {
  return runSpecialist({
    agent: "token",
    systemPreamble: "You are Decasonic's Tokenomics analyst. Review utility, supply, emissions, governance. Apply the 'token only if necessary' filter strictly.",
    userTask: "Produce a 'Tokenomics' section. If no token: state 'Equity-only — acceptable per thesis' and stop. If token exists: cover utility, supply schedule, team allocation %, vesting, governance, and an explicit 'Token necessary?' verdict (Yes/No/Maybe + reasoning).",
    ctx: a.ctx,
    thesis: a.thesis,
  });
}

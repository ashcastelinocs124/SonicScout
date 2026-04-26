import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export interface Thesis {
  market: string;
  founder: string;
  token: string;
  antiPatterns: string;
  full: string;
}

export type AgentKey = "market" | "founder" | "product" | "token" | "risk" | "memo";

const DEFAULT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../config/thesis.md",
);

export async function loadThesis(filePath = DEFAULT_PATH): Promise<Thesis> {
  const full = await readFile(filePath, "utf8");
  const grab = (heading: string): string => {
    const re = new RegExp(`##\\s+${heading}[\\s\\S]*?(?=\\n##\\s|$)`, "i");
    return (full.match(re)?.[0] ?? "").trim();
  };
  return {
    market: grab("Market beliefs"),
    founder: grab("Founder filters"),
    token: grab("Token stance"),
    antiPatterns: grab("Anti-patterns"),
    full,
  };
}

export function sliceThesis(t: Thesis, agent: AgentKey): string {
  switch (agent) {
    case "market": return t.market;
    case "founder": return t.founder;
    case "product": return [t.market, t.token].join("\n\n");
    case "token": return [t.token, t.antiPatterns].join("\n\n");
    case "risk": return t.antiPatterns;
    case "memo": return t.full;
  }
}

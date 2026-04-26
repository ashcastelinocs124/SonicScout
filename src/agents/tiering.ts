const URL_OR_SOURCE = /(https?:\/\/\S+|Source:\s*\S+|↳\s*\S+)/i;

export function stripUnverified(text: string): string {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    if (!line.includes("[verified]")) return line;
    const window = [line, lines[i + 1] ?? "", lines[i + 2] ?? ""].join("\n");
    if (URL_OR_SOURCE.test(window) && !/no source/i.test(window)) return line;
    return line.replace("[verified]", "[speculative]");
  }).join("\n");
}

export interface TierCounts { verified: number; inferred: number; speculative: number }

export function countTiers(text: string): TierCounts {
  const count = (tag: string) => (text.match(new RegExp(`\\[${tag}\\]`, "g")) ?? []).length;
  return {
    verified: count("verified"),
    inferred: count("inferred"),
    speculative: count("speculative"),
  };
}

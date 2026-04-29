import type { AgentKey, RunState } from "../lib/useRunStream";

const AGENTS: { key: AgentKey; label: string; emoji: string }[] = [
  { key: "market",     label: "Market Map",    emoji: "🗺️" },
  { key: "founder",    label: "Founder Signal", emoji: "👤" },
  { key: "product",    label: "Product",        emoji: "🛠️" },
  { key: "tokenomics", label: "Tokenomics",     emoji: "🪙" },
  { key: "risk",       label: "Trust & Risk",   emoji: "🛡️" },
];

interface Props { state: Extract<RunState, { status: "progress" }>; url: string | null }

export function AgentProgress({ state, url }: Props) {
  const phaseLabel =
    state.phase === "ingestion" ? "Ingesting inputs"
    : state.phase === "memo" ? "Synthesizing memo"
    : `Agents: ${state.doneAgents.size}/5 (${state.phase} done)`;

  return (
    <section className="w-full max-w-5xl mx-auto px-6 py-16">
      <div className="text-center">
        {url && (
          <span className="inline-block px-3 py-1 rounded-full bg-zinc-200 text-xs font-medium text-zinc-700 mb-4">
            {url}
          </span>
        )}
        <h2 className="text-2xl font-semibold text-zinc-900">{phaseLabel}</h2>
        <p className="text-sm text-zinc-500 mt-1">~90 seconds total</p>
      </div>

      <div className="grid grid-cols-5 gap-4 mt-12">
        {AGENTS.map((a) => {
          const done = state.doneAgents.has(a.key);
          const running = !done && state.phase !== "ingestion";
          return (
            <div
              key={a.key}
              className={`rounded-xl border p-4 text-center transition-all duration-500
                ${done
                  ? "bg-emerald-50 border-emerald-300 text-zinc-900"
                  : running
                  ? "bg-white border-emerald-200 text-zinc-900 animate-pulse"
                  : "bg-zinc-50 border-zinc-200 text-zinc-400"
                }`}
            >
              <div className="text-3xl">{a.emoji}</div>
              <div className="text-sm font-medium mt-2">{a.label}</div>
              <div className="text-xs mt-1">
                {done ? "✓ Complete" : running ? "Analyzing…" : "Pending"}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-12 h-1.5 bg-zinc-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-500 transition-all duration-700"
          style={{ width: `${(state.doneAgents.size / 5) * 100}%` }}
        />
      </div>
    </section>
  );
}

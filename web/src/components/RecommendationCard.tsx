import type { Memo } from "../types";

const COLORS: Record<Memo["recommendation"], { bg: string; text: string; ring: string }> = {
  "Pass":         { bg: "bg-red-50",     text: "text-red-700",     ring: "ring-red-300" },
  "Watch":        { bg: "bg-amber-50",   text: "text-amber-700",   ring: "ring-amber-300" },
  "Take Meeting": { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-300" },
  "Invest":       { bg: "bg-violet-50",  text: "text-violet-700",  ring: "ring-violet-300" },
};

export function RecommendationCard({ memo }: { memo: Memo }) {
  const c = COLORS[memo.recommendation];
  return (
    <section className={`w-full max-w-4xl mx-auto px-6 py-12 rounded-2xl ring-1 ${c.bg} ${c.ring}`}>
      <div className="text-center">
        <div className="text-xs uppercase tracking-widest text-zinc-500">Recommendation</div>
        <h1 className={`text-6xl font-bold mt-2 ${c.text}`}>{memo.recommendation.toUpperCase()}</h1>
      </div>
      <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 mb-3">Thesis</h3>
          <ul className="space-y-2 text-sm text-zinc-700">
            {memo.thesis.map((b, i) => <li key={i} className="flex gap-2"><span>•</span><span>{b}</span></li>)}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 mb-3">Risks</h3>
          <ul className="space-y-2 text-sm text-zinc-700">
            {memo.risks.map((b, i) => <li key={i} className="flex gap-2"><span>•</span><span>{b}</span></li>)}
          </ul>
        </div>
      </div>
    </section>
  );
}

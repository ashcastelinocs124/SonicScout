import { useState } from "react";
import { postFollowup } from "../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface QA { q: string; a: string }

export function FollowupChat({ runId }: { runId: number }) {
  const [history, setHistory] = useState<QA[]>([]);
  const [q, setQ] = useState("");
  const [pending, setPending] = useState(false);

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    const question = q;
    setQ("");
    setPending(true);
    try {
      const { answer } = await postFollowup(runId, question);
      setHistory((h) => [...h, { q: question, a: answer }]);
    } catch (err: any) {
      setHistory((h) => [...h, { q: question, a: `Error: ${err?.message ?? "request failed"}` }]);
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="w-full max-w-4xl mx-auto px-6 py-8 border-t border-zinc-200">
      <h3 className="text-sm font-semibold text-zinc-900 mb-4">Ask about this memo</h3>
      <div className="space-y-3 mb-4">
        {history.map((qa, i) => (
          <div key={i} className="space-y-1">
            <div className="text-sm font-medium text-zinc-900">Q: {qa.q}</div>
            <div className="text-sm text-zinc-700 whitespace-pre-wrap pl-3 border-l-2 border-emerald-300">{qa.a}</div>
          </div>
        ))}
      </div>
      <form onSubmit={ask} className="flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="What's the token unlock schedule?" disabled={pending} />
        <Button type="submit" disabled={pending || !q.trim()}>{pending ? "…" : "Ask"}</Button>
      </form>
    </section>
  );
}

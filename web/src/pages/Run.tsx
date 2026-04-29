import { useParams } from "wouter";
import { useEffect, useState } from "react";
import { useRunStream } from "../lib/useRunStream";
import { getRun } from "../lib/api";
import { AgentProgress } from "../components/AgentProgress";
import { RecommendationCard } from "../components/RecommendationCard";
import { MemoSections } from "../components/MemoSections";
import { FollowupChat } from "../components/FollowupChat";

export function Run() {
  const params = useParams<{ id: string }>();
  const runId = Number(params.id);
  const state = useRunStream(runId);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    getRun(runId).then((s) => setUrl(s.url)).catch(() => {});
  }, [runId]);

  if (state.status === "loading") {
    return <main className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="text-zinc-500">Loading…</div>
    </main>;
  }

  if (state.status === "error") {
    return <main className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="max-w-xl px-6 py-8 bg-red-50 border border-red-200 rounded-lg">
        <h2 className="font-semibold text-red-900">Something went wrong</h2>
        <p className="mt-2 text-sm text-red-700">{state.message}</p>
        <a href="/" className="mt-4 inline-block text-sm text-emerald-700 underline">Try another URL</a>
      </div>
    </main>;
  }

  if (state.status === "progress") {
    return <main className="min-h-screen bg-zinc-50">
      <AgentProgress state={state} url={url} />
    </main>;
  }

  return <main className="min-h-screen bg-zinc-50 py-8">
    <RecommendationCard memo={state.memo} />
    <MemoSections memo={state.memo} />
    <FollowupChat runId={runId} />
  </main>;
}

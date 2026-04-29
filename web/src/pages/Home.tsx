import { useState } from "react";
import { useLocation } from "wouter";
import { createRun } from "../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function Home() {
  const [, navigate] = useLocation();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { runId } = await createRun(url);
      navigate(`/runs/${runId}`);
    } catch (err: any) {
      setError(err?.message ?? "Failed to start run");
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 px-6">
      <div className="w-full max-w-2xl">
        <h1 className="text-5xl font-bold tracking-tight text-zinc-900">DealSense</h1>
        <p className="mt-3 text-zinc-600 text-lg">
          Decasonic's AI venture analyst — paste a startup URL, get a thesis-aligned investment memo in ~90 seconds.
        </p>
        <form onSubmit={submit} className="mt-10 flex gap-3">
          <Input
            type="url"
            placeholder="https://startup.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={submitting}
            className="flex-1 h-12 text-base"
            required
          />
          <Button type="submit" disabled={submitting || !url} className="h-12 px-6 bg-emerald-600 hover:bg-emerald-700">
            {submitting ? "Starting…" : "Analyze"}
          </Button>
        </form>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <p className="mt-8 text-xs text-zinc-400">
          Confidence-tiered analysis: every claim tagged [verified], [inferred], or [speculative].
        </p>
      </div>
    </main>
  );
}

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { draftThesis, saveThesis, type DraftThesis } from "../lib/api";

const SECTIONS: { key: keyof DraftThesis; label: string; hint: string }[] = [
  { key: "marketBeliefs",  label: "Market beliefs",
    hint: "What categories or trends does this firm believe will win?" },
  { key: "founderFilters", label: "Founder filters",
    hint: "What makes them say yes or no to a founding team?" },
  { key: "tokenStance",    label: "Token stance",
    hint: "Their position on token vs equity. Use \"Equity-only firm.\" if no crypto stance." },
  { key: "antiPatterns",   label: "Anti-patterns",
    hint: "Deal characteristics that get auto-rejected." },
];

const EMPTY: DraftThesis = {
  marketBeliefs: "", founderFilters: "", tokenStance: "", antiPatterns: "",
};

export function ThesisOnboarding({ onDone }: { onDone: () => void }) {
  const [stage, setStage] = useState<"input" | "edit">("input");
  const [vcUrl, setVcUrl] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<DraftThesis>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const startDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDrafting(true);
    try {
      const d = await draftThesis(vcUrl);
      setDraft(d);
      setStage("edit");
    } catch (err: any) {
      setError(err?.message ?? "Failed to read site");
      setDraft(EMPTY);
      setStage("edit");
    } finally {
      setDrafting(false);
    }
  };

  const allFilled = SECTIONS.every((s) => draft[s.key].trim().length > 0);

  const approve = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveThesis(draft);
      onDone();
    } catch (err: any) {
      setError(err?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (stage === "input") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 px-6">
        <div className="w-full max-w-2xl">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900">Set up DealSense</h1>
          <p className="mt-3 text-zinc-600 text-lg">
            Paste your firm's website. An agent will draft your investment thesis from your published material.
            You'll review and edit before it's saved.
          </p>
          <form onSubmit={startDraft} className="mt-10 flex gap-3">
            <Input type="url" placeholder="https://your-firm.com" value={vcUrl}
              onChange={(e) => setVcUrl(e.target.value)} disabled={drafting}
              className="flex-1 h-12 text-base" required />
            <Button type="submit" disabled={drafting || !vcUrl}
              className="h-12 px-6 bg-emerald-600 hover:bg-emerald-700">
              {drafting ? "Reading…" : "Generate thesis"}
            </Button>
          </form>
          {drafting && <p className="mt-4 text-sm text-zinc-500">~15s — picking thesis pages, scraping, extracting…</p>}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50 py-10 px-6">
      <div className="w-full max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Review your thesis</h1>
        <p className="mt-2 text-zinc-600">Edit any section. Approve when it reflects your firm.</p>
        {error && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
            {error}. Fill the sections manually below.
          </div>
        )}
        <div className="mt-8 space-y-6">
          {SECTIONS.map((s) => (
            <div key={s.key}>
              <label htmlFor={`thesis-${s.key}`} className="block text-sm font-semibold text-zinc-900">{s.label}</label>
              <p className="text-xs text-zinc-500 mt-0.5">{s.hint}</p>
              <textarea
                id={`thesis-${s.key}`}
                value={draft[s.key]}
                onChange={(e) => setDraft((d) => ({ ...d, [s.key]: e.target.value }))}
                rows={5}
                className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm font-mono"
              />
            </div>
          ))}
        </div>
        <div className="mt-8 flex justify-end">
          <Button onClick={approve} disabled={saving || !allFilled}
            className="h-12 px-6 bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Saving…" : "Approve & continue"}
          </Button>
        </div>
      </div>
    </main>
  );
}

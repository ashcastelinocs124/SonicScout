import type { RunSnapshot } from "../types";

export async function createRun(url: string): Promise<{ runId: number }> {
  const res = await fetch("/api/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function getRun(id: number): Promise<RunSnapshot> {
  const res = await fetch(`/api/runs/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function postFollowup(id: number, question: string): Promise<{ answer: string }> {
  const res = await fetch(`/api/runs/${id}/followup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export interface DraftThesis {
  marketBeliefs: string;
  founderFilters: string;
  tokenStance: string;
  antiPatterns: string;
}

export async function getThesisStatus(): Promise<{ onboarded: boolean }> {
  const res = await fetch("/api/thesis/status");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function draftThesis(vcUrl: string): Promise<DraftThesis> {
  const res = await fetch("/api/thesis/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vcUrl }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function saveThesis(sections: DraftThesis): Promise<void> {
  const res = await fetch("/api/thesis/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sections }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
}

export async function deleteOnboardedMarker(): Promise<void> {
  await fetch("/api/thesis/onboarded", { method: "DELETE" });
}

import { useEffect, useState } from "react";
import { getRun } from "./api";
import type { Memo, Phase } from "../types";

export type AgentKey = "ingestion" | "market" | "founder" | "product" | "tokenomics" | "risk" | "memo";

export type RunState =
  | { status: "loading" }
  | { status: "progress"; phase: Phase; done: number; total: number; doneAgents: Set<AgentKey> }
  | { status: "completed"; memo: Memo }
  | { status: "error"; message: string };

const SPECIALISTS: AgentKey[] = ["market", "founder", "product", "tokenomics", "risk"];

export function useRunStream(runId: number): RunState {
  const [state, setState] = useState<RunState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    let es: EventSource | null = null;

    (async () => {
      try {
        const snap = await getRun(runId);
        if (cancelled) return;

        if (snap.status === "completed" && snap.memo) {
          setState({ status: "completed", memo: snap.memo });
          return;
        }
        if (snap.status === "failed") {
          setState({ status: "error", message: "Run failed" });
          return;
        }

        setState({ status: "progress", phase: "ingestion", done: 0, total: 1, doneAgents: new Set() });
        es = new EventSource(`/api/runs/${runId}/stream`);

        es.addEventListener("progress", (e: MessageEvent) => {
          const d = JSON.parse(e.data) as { phase: Phase; done: number; total: number };
          setState((prev) => {
            if (prev.status !== "progress") return prev;
            const doneAgents = new Set(prev.doneAgents);
            if ((SPECIALISTS as string[]).includes(d.phase)) doneAgents.add(d.phase as AgentKey);
            return { status: "progress", phase: d.phase, done: d.done, total: d.total, doneAgents };
          });
        });

        es.addEventListener("complete", (e: MessageEvent) => {
          const d = JSON.parse(e.data) as { memo: Memo };
          setState({ status: "completed", memo: d.memo });
          es?.close();
        });

        es.addEventListener("error", (e: MessageEvent) => {
          const message = (() => {
            try { return JSON.parse((e as any).data ?? "{}").message ?? "stream error"; }
            catch { return "stream error"; }
          })();
          setState({ status: "error", message });
          es?.close();
        });
      } catch (err: any) {
        if (!cancelled) setState({ status: "error", message: err?.message ?? "load failed" });
      }
    })();

    return () => { cancelled = true; es?.close(); };
  }, [runId]);

  return state;
}

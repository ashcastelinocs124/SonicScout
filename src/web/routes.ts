import { Router } from "express";
import type { Store } from "../db/store.js";
import { dealQueue } from "../queue/queue.js";
import { subscribe } from "./sse.js";
import { answerFollowup } from "../agents/followup.js";

export function buildRoutes(store: Store): Router {
  const r = Router();

  r.post("/runs", async (req, res) => {
    const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
    if (!url) return res.status(400).json({ error: "url required" });
    const runId = store.createRun({ inputPayload: { url } });
    try {
      await dealQueue.add("analyze", { runId, ingest: { websitePath: url } });
    } catch (err: any) {
      store.failRun(runId, `queue unavailable: ${err?.message ?? "unknown"}`);
      return res.status(503).json({ error: "queue unavailable — is redis-server running?" });
    }
    return res.status(202).json({ runId });
  });

  r.get("/runs/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "bad id" });
    const row = store.find(id);
    if (!row) return res.status(404).json({ error: "not found" });
    return res.json({
      id: row.id,
      status: row.status,
      url: row.inputPayload?.url ?? null,
      memo: row.memoJson,
    });
  });

  r.get("/runs/:id/stream", (req, res) => {
    const id = Number(req.params.id);
    const row = store.find(id);
    if (!row) return res.status(404).end();

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    if (row.status === "completed" && row.memoJson) {
      res.write(`event: complete\ndata: ${JSON.stringify({ memo: row.memoJson })}\n\n`);
      return res.end();
    }
    if (row.status === "failed") {
      res.write(`event: error\ndata: ${JSON.stringify({ message: row.recommendation ?? "failed" })}\n\n`);
      return res.end();
    }

    const unsubscribe = subscribe(id, ({ event, data }) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      if (event === "complete" || event === "error") {
        unsubscribe();
        res.end();
      }
    });

    req.on("close", () => unsubscribe());
  });

  r.post("/runs/:id/followup", async (req, res) => {
    const id = Number(req.params.id);
    const row = store.find(id);
    if (!row) return res.status(404).json({ error: "not found" });
    if (row.status !== "completed" || !row.memoJson)
      return res.status(409).json({ error: "run not complete" });
    const question = String(req.body?.question ?? "").trim();
    if (!question) return res.status(400).json({ error: "question required" });
    const answer = await answerFollowup({ question, memoJson: row.memoJson });
    return res.json({ answer });
  });

  return r;
}

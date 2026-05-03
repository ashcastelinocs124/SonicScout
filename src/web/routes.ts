import { Router } from "express";
import { mkdirSync, existsSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import type { Store } from "../db/store.js";
import { dealQueue } from "../queue/queue.js";
import { subscribe } from "./sse.js";
import { answerFollowup } from "../agents/followup.js";
import { generateThesis, type DraftThesis } from "../agents/thesisGenerator.js";

const DEFAULT_THESIS_PATH = path.resolve("config/thesis.md");
const DEFAULT_MARKER_PATH = path.resolve("data/.thesis-onboarded");
const thesisPath = () => process.env.DEALSENSE_THESIS_PATH ?? DEFAULT_THESIS_PATH;
const markerPath = () => process.env.DEALSENSE_THESIS_MARKER ?? DEFAULT_MARKER_PATH;

function isDraft(x: unknown): x is DraftThesis {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.marketBeliefs === "string"
      && typeof o.founderFilters === "string"
      && typeof o.tokenStance === "string"
      && typeof o.antiPatterns === "string";
}

function assembleThesisMarkdown(d: DraftThesis): string {
  return [
    "## Market beliefs",
    d.marketBeliefs,
    "",
    "## Founder filters",
    d.founderFilters,
    "",
    "## Token stance",
    d.tokenStance,
    "",
    "## Anti-patterns (auto-flag, escalate in Trust & Risk)",
    d.antiPatterns,
    "",
  ].join("\n");
}

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

  r.get("/thesis/status", (_req, res) => {
    res.json({ onboarded: existsSync(markerPath()) });
  });

  r.post("/thesis/draft", async (req, res) => {
    const vcUrl = typeof req.body?.vcUrl === "string" ? req.body.vcUrl.trim() : "";
    if (!vcUrl) return res.status(400).json({ error: "vcUrl required" });
    const draft = await generateThesis(vcUrl);
    return res.json(draft);
  });

  r.post("/thesis/save", (req, res) => {
    const sections = req.body?.sections;
    if (!isDraft(sections)) return res.status(400).json({ error: "sections must include all 4 fields" });
    const tp = thesisPath();
    const mp = markerPath();
    mkdirSync(path.dirname(tp), { recursive: true });
    mkdirSync(path.dirname(mp), { recursive: true });
    writeFileSync(tp, assembleThesisMarkdown(sections), "utf8");
    writeFileSync(mp, "", "utf8");
    return res.json({ ok: true });
  });

  r.delete("/thesis/onboarded", (_req, res) => {
    const mp = markerPath();
    if (existsSync(mp)) unlinkSync(mp);
    return res.json({ ok: true });
  });

  return r;
}

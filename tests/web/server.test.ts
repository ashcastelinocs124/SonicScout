import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { Store } from "../../src/db/store.js";

vi.mock("../../src/queue/queue.js", () => ({
  dealQueue: { add: vi.fn().mockResolvedValue({ id: "job-1" }) },
}));

vi.mock("../../src/agents/followup.js", () => ({
  answerFollowup: vi.fn().mockResolvedValue("answer text [verified]\n  ↳ Source: x"),
}));

const { createServer } = await import("../../src/web/server.js");

describe("web server", () => {
  it("GET /api/health returns ok", async () => {
    const app = createServer();
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("POST /api/runs creates a run and enqueues a job", async () => {
    const store = new Store(":memory:");
    const app = createServer(store);
    const res = await request(app).post("/api/runs").send({ url: "https://startup.com" });
    expect(res.status).toBe(202);
    expect(res.body.runId).toBeTypeOf("number");
  });

  it("POST /api/runs rejects empty url", async () => {
    const app = createServer();
    const res = await request(app).post("/api/runs").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("url required");
  });

  it("GET /api/runs/:id returns 404 for unknown id", async () => {
    const store = new Store(":memory:");
    const app = createServer(store);
    const res = await request(app).get("/api/runs/9999");
    expect(res.status).toBe(404);
  });

  it("GET /api/runs/:id returns snapshot for completed run", async () => {
    const store = new Store(":memory:");
    const id = store.createRun({ inputPayload: { url: "https://x.com" } });
    const memo = { recommendation: "Watch", thesis: ["a","b","c"], risks: ["r","r","r"], sections: { market: "..." } };
    store.completeRun(id, { recommendation: "Watch", memoJson: memo, ingestedContext: {}, thesisSnapshot: "" });
    const app = createServer(store);
    const res = await request(app).get(`/api/runs/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("completed");
    expect(res.body.memo).toEqual(memo);
  });

  it("POST /api/runs/:id/followup returns answer for completed run", async () => {
    const store = new Store(":memory:");
    const id = store.createRun({ inputPayload: { url: "https://x.com" } });
    const memo = { recommendation: "Watch", thesis: ["a","b","c"], risks: ["r","r","r"], sections: { market: "..." } };
    store.completeRun(id, { recommendation: "Watch", memoJson: memo, ingestedContext: {}, thesisSnapshot: "" });
    const app = createServer(store);
    const res = await request(app).post(`/api/runs/${id}/followup`).send({ question: "q?" });
    expect(res.status).toBe(200);
    expect(res.body.answer).toContain("[verified]");
  });

  it("POST /api/runs/:id/followup returns 409 for incomplete run", async () => {
    const store = new Store(":memory:");
    const id = store.createRun({ inputPayload: { url: "https://x.com" } });
    const app = createServer(store);
    const res = await request(app).post(`/api/runs/${id}/followup`).send({ question: "q?" });
    expect(res.status).toBe(409);
  });
});

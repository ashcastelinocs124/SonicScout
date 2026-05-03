import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { Store } from "../../src/db/store.js";
import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const { mockGenerateThesis } = vi.hoisted(() => ({ mockGenerateThesis: vi.fn() }));
vi.mock("../../src/agents/thesisGenerator.js", () => ({ generateThesis: mockGenerateThesis }));
vi.mock("../../src/queue/queue.js", () => ({
  dealQueue: { add: vi.fn().mockResolvedValue({ id: "job-1" }) },
}));
vi.mock("../../src/agents/followup.js", () => ({
  answerFollowup: vi.fn().mockResolvedValue("ok"),
}));

const { createServer } = await import("../../src/web/server.js");

describe("thesis routes", () => {
  let tmpRoot: string;
  let thesisFile: string;
  let markerFile: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(path.join(tmpdir(), "dealsense-thesis-"));
    thesisFile = path.join(tmpRoot, "thesis.md");
    markerFile = path.join(tmpRoot, ".thesis-onboarded");
    process.env.DEALSENSE_THESIS_PATH = thesisFile;
    process.env.DEALSENSE_THESIS_MARKER = markerFile;
    mockGenerateThesis.mockReset();
  });
  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
    delete process.env.DEALSENSE_THESIS_PATH;
    delete process.env.DEALSENSE_THESIS_MARKER;
  });

  it("GET /api/thesis/status returns onboarded:false when marker missing", async () => {
    const res = await request(createServer(new Store(":memory:"))).get("/api/thesis/status");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ onboarded: false });
  });

  it("GET /api/thesis/status returns onboarded:true when marker exists", async () => {
    writeFileSync(markerFile, "");
    const res = await request(createServer(new Store(":memory:"))).get("/api/thesis/status");
    expect(res.body).toEqual({ onboarded: true });
  });

  it("POST /api/thesis/draft returns DraftThesis", async () => {
    mockGenerateThesis.mockResolvedValueOnce({
      marketBeliefs: "- a", founderFilters: "- b", tokenStance: "- c", antiPatterns: "- d",
    });
    const res = await request(createServer(new Store(":memory:")))
      .post("/api/thesis/draft").send({ vcUrl: "https://examplevc.com" });
    expect(res.status).toBe(200);
    expect(res.body.marketBeliefs).toBe("- a");
    expect(mockGenerateThesis).toHaveBeenCalledWith("https://examplevc.com");
  });

  it("POST /api/thesis/draft 400 when vcUrl missing", async () => {
    const res = await request(createServer(new Store(":memory:")))
      .post("/api/thesis/draft").send({});
    expect(res.status).toBe(400);
  });

  it("POST /api/thesis/save writes thesis file and marker", async () => {
    const res = await request(createServer(new Store(":memory:")))
      .post("/api/thesis/save").send({
        sections: {
          marketBeliefs: "- mb", founderFilters: "- ff",
          tokenStance: "- ts", antiPatterns: "- ap",
        },
      });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(existsSync(thesisFile)).toBe(true);
    expect(existsSync(markerFile)).toBe(true);
    const written = readFileSync(thesisFile, "utf8");
    expect(written).toContain("## Market beliefs");
    expect(written).toContain("- mb");
    expect(written).toContain("## Founder filters");
    expect(written).toContain("- ff");
    expect(written).toContain("## Token stance");
    expect(written).toContain("- ts");
    expect(written).toContain("## Anti-patterns");
    expect(written).toContain("- ap");
  });

  it("POST /api/thesis/save 400 when sections missing fields", async () => {
    const res = await request(createServer(new Store(":memory:")))
      .post("/api/thesis/save").send({ sections: { marketBeliefs: "x" } });
    expect(res.status).toBe(400);
  });

  it("DELETE /api/thesis/onboarded removes marker (idempotent)", async () => {
    writeFileSync(markerFile, "");
    const app = createServer(new Store(":memory:"));
    let res = await request(app).delete("/api/thesis/onboarded");
    expect(res.status).toBe(200);
    expect(existsSync(markerFile)).toBe(false);
    res = await request(app).delete("/api/thesis/onboarded");
    expect(res.status).toBe(200);
  });
});

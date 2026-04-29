import { describe, it, expect } from "vitest";
import request from "supertest";
import { createServer } from "../../src/web/server.js";

describe("web server", () => {
  it("GET /api/health returns ok", async () => {
    const app = createServer();
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

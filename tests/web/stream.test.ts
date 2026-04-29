import { describe, it, expect, vi } from "vitest";
import { createServer as httpCreate } from "node:http";
import type { AddressInfo } from "node:net";
import { Store } from "../../src/db/store.js";
import { emit } from "../../src/web/sse.js";

vi.mock("../../src/queue/queue.js", () => ({ dealQueue: { add: vi.fn() } }));
vi.mock("../../src/agents/followup.js", () => ({ answerFollowup: vi.fn() }));

const { createServer } = await import("../../src/web/server.js");

describe("SSE stream", () => {
  it("streams progress and complete events for a running run", async () => {
    const store = new Store(":memory:");
    const id = store.createRun({ inputPayload: { url: "https://x.com" } });
    const app = createServer(store);
    const server = httpCreate(app).listen(0);
    const port = (server.address() as AddressInfo).port;

    const res = await fetch(`http://localhost:${port}/api/runs/${id}/stream`);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    setTimeout(() => emit(id, "progress", { phase: "market", done: 1, total: 5 }), 50);
    setTimeout(() => emit(id, "complete", { memo: { recommendation: "Watch" } }), 100);

    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value);
      if (buf.includes("event: complete")) break;
    }
    server.close();

    expect(buf).toContain("event: progress");
    expect(buf).toContain('"phase":"market"');
    expect(buf).toContain("event: complete");
  }, 5000);
});

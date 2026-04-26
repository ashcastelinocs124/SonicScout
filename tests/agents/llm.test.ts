import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@anthropic-ai/sdk", () => {
  const create = vi.fn();
  class Anthropic { messages = { create }; }
  return { default: Anthropic, __mock: { create } };
});

const sdk = (await import("@anthropic-ai/sdk")) as any;
const { callLLM } = await import("../../src/agents/llm.js");

describe("callLLM", () => {
  beforeEach(() => sdk.__mock.create.mockReset());

  it("returns text content from a successful call", async () => {
    sdk.__mock.create.mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
    const out = await callLLM({ system: "s", user: "u", model: "claude-sonnet-4-6" });
    expect(out).toBe("ok");
  });

  it("retries on 429 then succeeds", async () => {
    sdk.__mock.create
      .mockRejectedValueOnce(Object.assign(new Error("rate"), { status: 429 }))
      .mockResolvedValueOnce({ content: [{ type: "text", text: "ok2" }] });
    const out = await callLLM({ system: "s", user: "u", model: "claude-sonnet-4-6" });
    expect(out).toBe("ok2");
    expect(sdk.__mock.create).toHaveBeenCalledTimes(2);
  });
});

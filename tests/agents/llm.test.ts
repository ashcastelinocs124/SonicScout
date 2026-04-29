import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("openai", () => {
  const create = vi.fn();
  class OpenAI { chat = { completions: { create } }; }
  return { default: OpenAI, __mock: { create } };
});

const sdk = (await import("openai")) as any;
const { callLLM } = await import("../../src/agents/llm.js");

describe("callLLM", () => {
  beforeEach(() => sdk.__mock.create.mockReset());

  it("returns text content from a successful call", async () => {
    sdk.__mock.create.mockResolvedValue({ choices: [{ message: { content: "ok" } }] });
    const out = await callLLM({ system: "s", user: "u", model: "gpt-5-mini" });
    expect(out).toBe("ok");
  });

  it("retries on 429 then succeeds", async () => {
    sdk.__mock.create
      .mockRejectedValueOnce(Object.assign(new Error("rate"), { status: 429 }))
      .mockResolvedValueOnce({ choices: [{ message: { content: "ok2" } }] });
    const out = await callLLM({ system: "s", user: "u", model: "gpt-5-mini" });
    expect(out).toBe("ok2");
    expect(sdk.__mock.create).toHaveBeenCalledTimes(2);
  });
});

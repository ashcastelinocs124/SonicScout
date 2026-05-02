import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("openai", () => {
  const create = vi.fn();
  const responsesCreate = vi.fn();
  class OpenAI {
    chat = { completions: { create } };
    responses = { create: responsesCreate };
  }
  return { default: OpenAI, __mock: { create, responsesCreate } };
});

const sdk = (await import("openai")) as any;
const { callLLM, callLLMWithSearch } = await import("../../src/agents/llm.js");

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

describe("callLLMWithSearch", () => {
  beforeEach(() => sdk.__mock.responsesCreate.mockReset());

  it("returns text + citation hosts from URL annotations", async () => {
    sdk.__mock.responsesCreate.mockResolvedValueOnce({
      output_text: '{"foo":"bar"}',
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: '{"foo":"bar"}',
              annotations: [
                { type: "url_citation", url: "https://www.bcg.com/x/about" },
                { type: "url_citation", url: "https://www.accenture.com/song?utm=x" },
                { type: "file_citation" },
              ],
            },
          ],
        },
      ],
    });
    const r = await callLLMWithSearch({
      system: "sys", user: "usr", model: "gpt-5-mini",
    });
    expect(r.text).toBe('{"foo":"bar"}');
    expect(r.citationHosts.has("www.bcg.com")).toBe(true);
    expect(r.citationHosts.has("www.accenture.com")).toBe(true);
    expect(r.citationHosts.size).toBe(2);
    const args = sdk.__mock.responsesCreate.mock.calls[0][0];
    expect(args.model).toBe("gpt-5-mini");
    expect(args.tools).toEqual([{ type: "web_search_preview" }]);
  });

  it("retries on 429 then succeeds", async () => {
    sdk.__mock.responsesCreate
      .mockRejectedValueOnce(Object.assign(new Error("rate"), { status: 429 }))
      .mockResolvedValueOnce({ output_text: "ok", output: [] });
    const r = await callLLMWithSearch({ system: "s", user: "u", model: "gpt-5-mini" });
    expect(r.text).toBe("ok");
    expect(r.citationHosts.size).toBe(0);
    expect(sdk.__mock.responsesCreate).toHaveBeenCalledTimes(2);
  });
});

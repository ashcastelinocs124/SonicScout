import OpenAI from "openai";
import { logger } from "../log.js";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface LLMArgs {
  system: string;
  user: string;
  model: "gpt-5-mini" | "gpt-5" | "gpt-5.5";
  maxTokens?: number;
}

export async function callLLM(args: LLMArgs, attempt = 0): Promise<string> {
  try {
    const res = await client.chat.completions.create({
      model: args.model,
      max_completion_tokens: args.maxTokens ?? 8000,
      reasoning_effort: "minimal",
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
    });
    const choice = res.choices[0];
    const content = choice?.message?.content;
    if (!content) {
      const finish = choice?.finish_reason ?? "unknown";
      const usage = res.usage;
      throw new Error(
        `no content in response (finish_reason=${finish}, completion_tokens=${usage?.completion_tokens}, reasoning_tokens=${(usage as any)?.completion_tokens_details?.reasoning_tokens})`,
      );
    }
    return content;
  } catch (err: any) {
    const status = err?.status;
    if ((status === 429 || status >= 500) && attempt < 3) {
      const ms = 500 * 2 ** attempt;
      logger.warn({ status, attempt, ms }, "llm retry");
      await new Promise((r) => setTimeout(r, ms));
      return callLLM(args, attempt + 1);
    }
    throw err;
  }
}

export interface LLMSearchArgs {
  system: string;
  user: string;
  model: "gpt-5-mini" | "gpt-5" | "gpt-5.5";
}
export interface LLMSearchResult {
  text: string;
  citationHosts: Set<string>;
}

function safeHost(u: string): string | null {
  try { return new URL(u).host; } catch { return null; }
}

export async function callLLMWithSearch(
  args: LLMSearchArgs,
  attempt = 0,
): Promise<LLMSearchResult> {
  try {
    const res = await client.responses.create({
      model: args.model,
      tools: [{ type: "web_search_preview" }],
      tool_choice: "required",
      input: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
    });
    const text = res.output_text ?? "";
    const hosts = new Set<string>();
    for (const item of res.output ?? []) {
      if (item.type !== "message") continue;
      const content = (item as { content?: Array<{ type: string; annotations?: Array<{ type: string; url?: string }> }> }).content ?? [];
      for (const c of content) {
        if (c.type !== "output_text") continue;
        for (const a of c.annotations ?? []) {
          if (a.type !== "url_citation" || !a.url) continue;
          const host = safeHost(a.url);
          if (host) hosts.add(host);
        }
      }
    }
    return { text, citationHosts: hosts };
  } catch (err: any) {
    const status = err?.status;
    if ((status === 429 || status >= 500) && attempt < 3) {
      const ms = 500 * 2 ** attempt;
      logger.warn({ status, attempt, ms }, "llm search retry");
      await new Promise((r) => setTimeout(r, ms));
      return callLLMWithSearch(args, attempt + 1);
    }
    throw err;
  }
}

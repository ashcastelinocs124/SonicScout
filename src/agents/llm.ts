import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../log.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface LLMArgs {
  system: string;
  user: string;
  model: "claude-sonnet-4-6" | "claude-opus-4-7";
  maxTokens?: number;
  cacheSystem?: boolean;
}

export async function callLLM(args: LLMArgs, attempt = 0): Promise<string> {
  try {
    const res = await client.messages.create({
      model: args.model,
      max_tokens: args.maxTokens ?? 2000,
      system: args.cacheSystem
        ? [{ type: "text", text: args.system, cache_control: { type: "ephemeral" } }]
        : args.system,
      messages: [{ role: "user", content: args.user }],
    });
    const block = res.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") throw new Error("no text block in response");
    return block.text;
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

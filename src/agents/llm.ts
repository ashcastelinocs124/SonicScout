import OpenAI from "openai";
import { logger } from "../log.js";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface LLMArgs {
  system: string;
  user: string;
  model: "gpt-5-mini" | "gpt-5";
  maxTokens?: number;
}

export async function callLLM(args: LLMArgs, attempt = 0): Promise<string> {
  try {
    const res = await client.chat.completions.create({
      model: args.model,
      max_completion_tokens: args.maxTokens ?? 2000,
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
    });
    const choice = res.choices[0];
    const content = choice?.message?.content;
    if (!content) throw new Error("no content in response");
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

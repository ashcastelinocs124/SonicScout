import { ingest, type IngestArgs } from "../agents/ingestion.js";
import { loadThesis } from "../agents/thesis.js";
import { runMarket } from "../agents/market.js";
import { runFounder } from "../agents/founder.js";
import { runProduct } from "../agents/product.js";
import { runTokenomics } from "../agents/tokenomics.js";
import { runRisk } from "../agents/risk.js";
import { runMemo } from "../agents/memo.js";
import type { Memo } from "../types.js";
import { logger } from "../log.js";

export type Phase =
  | "ingestion"
  | "market" | "founder" | "product" | "tokenomics" | "risk"
  | "memo";

export type ProgressFn = (phase: Phase, completed: number, total: number) => void | Promise<void>;

export interface OrchestratorArgs extends IngestArgs {
  onProgress?: ProgressFn;
}

const SPECIALIST_TOTAL = 5;

export async function runOrchestrator(args: OrchestratorArgs): Promise<Memo> {
  const progress = args.onProgress ?? (() => {});

  const t0 = Date.now();
  const [ctx, thesis] = await Promise.all([ingest(args), loadThesis()]);
  logger.info({ ms: Date.now() - t0 }, "ingestion complete");
  await progress("ingestion", 1, 1);

  const t1 = Date.now();
  let done = 0;
  const track = <T>(phase: Phase, p: Promise<T>): Promise<T> =>
    p.then(async (v) => {
      done += 1;
      await progress(phase, done, SPECIALIST_TOTAL);
      return v;
    });

  const [market, founder, product, tokenomics, risk] = await Promise.all([
    track("market",     runMarket({ ctx, thesis })),
    track("founder",    runFounder({ ctx, thesis })),
    track("product",    runProduct({ ctx, thesis })),
    track("tokenomics", runTokenomics({ ctx, thesis })),
    track("risk",       runRisk({ ctx, thesis })),
  ]);
  logger.info({ ms: Date.now() - t1 }, "specialists complete");

  const memo = await runMemo({ sections: { market, founder, product, tokenomics, risk }, thesis });
  await progress("memo", 1, 1);
  return memo;
}

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

export async function runOrchestrator(args: IngestArgs): Promise<Memo> {
  const t0 = Date.now();
  const [ctx, thesis] = await Promise.all([ingest(args), loadThesis()]);
  logger.info({ ms: Date.now() - t0 }, "ingestion complete");

  const t1 = Date.now();
  const [market, founder, product, tokenomics, risk] = await Promise.all([
    runMarket({ ctx, thesis }),
    runFounder({ ctx, thesis }),
    runProduct({ ctx, thesis }),
    runTokenomics({ ctx, thesis }),
    runRisk({ ctx, thesis }),
  ]);
  logger.info({ ms: Date.now() - t1 }, "specialists complete");

  return runMemo({ sections: { market, founder, product, tokenomics, risk }, thesis });
}

import { runOrchestrator } from "../orchestrator/run.js";
import type { IngestArgs } from "../agents/ingestion.js";
import type { Memo } from "../types.js";

export async function processJob(args: IngestArgs): Promise<Memo> {
  return runOrchestrator(args);
}

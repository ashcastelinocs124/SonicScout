import { runOrchestrator, type ProgressFn } from "../orchestrator/run.js";
import type { IngestArgs } from "../agents/ingestion.js";
import type { Memo } from "../types.js";

export async function processJob(args: IngestArgs, onProgress?: ProgressFn): Promise<Memo> {
  return runOrchestrator({ ...args, onProgress });
}

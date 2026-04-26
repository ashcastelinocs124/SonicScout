import { Queue, Worker } from "bullmq";
import { Redis as IORedis } from "ioredis";
import { processJob } from "./worker.js";
import { logger } from "../log.js";
import type { IngestArgs } from "../agents/ingestion.js";
import type { Memo } from "../types.js";
import type { ProgressFn } from "../orchestrator/run.js";

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

export const dealQueue = new Queue("dealsense", { connection });

export interface DealJobData {
  runId: number;
  slackChannel: string;
  slackThreadTs: string;
  ingest: IngestArgs;
}

export interface WorkerCallbacks {
  onProgress?: (data: DealJobData, phase: string, completed: number, total: number) => Promise<void>;
  onComplete: (data: DealJobData, memo: Memo) => Promise<void>;
}

export function startWorker(cb: WorkerCallbacks) {
  const worker = new Worker<DealJobData>("dealsense", async (job) => {
    const progress: ProgressFn = async (phase, completed, total) => {
      if (cb.onProgress) await cb.onProgress(job.data, phase, completed, total);
    };
    const memo = await processJob(job.data.ingest, progress);
    await cb.onComplete(job.data, memo);
    return memo;
  }, { connection, concurrency: 2 });
  worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "job failed"));
  return worker;
}

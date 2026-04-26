import { Queue, Worker } from "bullmq";
import { Redis as IORedis } from "ioredis";
import { processJob } from "./worker.js";
import { logger } from "../log.js";
import type { IngestArgs } from "../agents/ingestion.js";
import type { Memo } from "../types.js";

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

export function startWorker(onComplete: (data: DealJobData, memo: Memo) => Promise<void>) {
  const worker = new Worker<DealJobData>("dealsense", async (job) => {
    const memo = await processJob(job.data.ingest);
    await onComplete(job.data, memo);
    return memo;
  }, { connection, concurrency: 2 });
  worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "job failed"));
  return worker;
}

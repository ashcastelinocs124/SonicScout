import { Queue, Worker } from "bullmq";
import { Redis as IORedis } from "ioredis";
import { processJob } from "./worker.js";
import { logger } from "../log.js";
import type { IngestArgs } from "../agents/ingestion.js";
import type { ProgressFn } from "../orchestrator/run.js";
import { emit } from "../web/sse.js";
import type { Store } from "../db/store.js";

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

export const dealQueue = new Queue("dealsense", { connection });

export interface DealJobData {
  runId: number;
  ingest: IngestArgs;
}

export function startWorker(store: Store) {
  const worker = new Worker<DealJobData>("dealsense", async (job) => {
    const progress: ProgressFn = async (phase, completed, total) => {
      emit(job.data.runId, "progress", { phase, done: completed, total });
    };
    try {
      const memo = await processJob(job.data.ingest, progress);
      store.completeRun(job.data.runId, {
        recommendation: memo.recommendation,
        memoJson: memo,
        ingestedContext: {},
        thesisSnapshot: "",
      });
      emit(job.data.runId, "complete", { memo });
      return memo;
    } catch (err: any) {
      const message = err?.message ?? "unknown error";
      store.failRun(job.data.runId, message);
      emit(job.data.runId, "error", { message });
      throw err;
    }
  }, { connection, concurrency: 2 });
  worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "job failed"));
  return worker;
}

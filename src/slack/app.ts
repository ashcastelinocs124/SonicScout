import bolt from "@slack/bolt";
import { dealQueue, startWorker, type DealJobData } from "../queue/queue.js";
import type { Store } from "../db/store.js";
import { renderParent, renderSection } from "./render.js";
import { logger } from "../log.js";
import type { Memo } from "../types.js";

const { App, LogLevel } = bolt;

const SECTION_NAMES = {
  market: "Market Map", founder: "Founder Signal", product: "Product",
  tokenomics: "Tokenomics", risk: "Trust & Risk",
} as const;

export function startSlack(store: Store) {
  const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    socketMode: true,
    appToken: process.env.SLACK_APP_TOKEN,
    logLevel: LogLevel.INFO,
  });

  app.command("/dealsense", async ({ command, ack, client }) => {
    await ack();
    const url = command.text.trim();
    if (!url) {
      await client.chat.postEphemeral({ channel: command.channel_id, user: command.user_id, text: "Usage: /dealsense <url-or-deck>" });
      return;
    }
    const parent = await client.chat.postMessage({
      channel: command.channel_id,
      text: `🔍 Analyzing ${url} — running 6 agents in parallel… ETA ~90s`,
    });
    const runId = store.createRun({
      slackChannel: command.channel_id, slackUser: command.user_id,
      slackThreadTs: parent.ts!, inputPayload: { url },
    });
    await dealQueue.add("analyze", {
      runId, slackChannel: command.channel_id, slackThreadTs: parent.ts!,
      ingest: { websitePath: url },
    });
  });

  app.event("message", async ({ event }) => {
    if (event.subtype || !("thread_ts" in event) || !event.thread_ts) return;
    const run = store.findByThread(event.thread_ts);
    if (!run || run.status !== "completed") return;
    // Follow-up Q&A handler installed in Task 12.
    logger.info({ ts: event.thread_ts }, "follow-up received (handler stub)");
  });

  startWorker(async (data: DealJobData, memo: Memo) => {
    store.completeRun(data.runId, {
      recommendation: memo.recommendation, memoJson: memo,
      ingestedContext: {}, thesisSnapshot: "",
    });
    await app.client.chat.update({
      channel: data.slackChannel, ts: data.slackThreadTs,
      text: `${memo.recommendation} — see thread for full memo`,
      blocks: renderParent(memo),
    });
    for (const [k, name] of Object.entries(SECTION_NAMES)) {
      const body = (memo.sections as Record<string, string>)[k] ?? "(no output)";
      await app.client.chat.postMessage({
        channel: data.slackChannel, thread_ts: data.slackThreadTs,
        text: name, blocks: renderSection(name, body),
      });
    }
  });

  return app;
}

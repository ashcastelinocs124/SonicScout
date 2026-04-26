import "dotenv/config";
import { Store } from "./db/store.js";
import { startSlack } from "./slack/app.js";
import { logger } from "./log.js";

const store = new Store();
const app = startSlack(store);
const port = Number(process.env.PORT ?? 3000);
await app.start(port);
logger.info({ port }, "DealSense online");

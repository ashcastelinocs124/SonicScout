import "dotenv/config";
import { createServer } from "./web/server.js";
import { attachStatic } from "./web/static.js";
import { Store } from "./db/store.js";
import { startWorker } from "./queue/queue.js";
import { logger } from "./log.js";

const store = new Store();
const app = createServer(store);

if (process.env.NODE_ENV === "production") attachStatic(app);

startWorker(store);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => logger.info({ port }, "DealSense online"));

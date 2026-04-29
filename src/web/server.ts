import express, { type Express } from "express";
import { Store } from "../db/store.js";
import { buildRoutes } from "./routes.js";

export function createServer(store: Store = new Store()): Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api", buildRoutes(store));
  return app;
}

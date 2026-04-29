import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "schema.sql"),
  "utf8",
);

export interface RunRow {
  id: number;
  inputPayload: any;
  status: "pending" | "running" | "completed" | "failed";
  recommendation: string | null;
  memoJson: any | null;
  createdAt: number;
  completedAt: number | null;
}

export class Store {
  private db: Database.Database;
  constructor(file = process.env.DEALSENSE_DB_PATH ?? "./data.sqlite") {
    this.db = new Database(file);
    this.db.exec(SCHEMA);
  }

  createRun(a: { inputPayload: unknown }): number {
    const stmt = this.db.prepare(
      `INSERT INTO runs (input_payload, created_at) VALUES (?, ?)`,
    );
    const r = stmt.run(JSON.stringify(a.inputPayload), Date.now());
    return Number(r.lastInsertRowid);
  }

  completeRun(
    id: number,
    a: { recommendation: string; memoJson: unknown; ingestedContext: unknown; thesisSnapshot: string },
  ) {
    this.db.prepare(
      `UPDATE runs SET status='completed', recommendation=?, memo_json=?, ingested_context=?, thesis_snapshot=?, completed_at=? WHERE id=?`,
    ).run(a.recommendation, JSON.stringify(a.memoJson), JSON.stringify(a.ingestedContext), a.thesisSnapshot, Date.now(), id);
  }

  failRun(id: number, message: string) {
    this.db.prepare(
      `UPDATE runs SET status='failed', recommendation=?, completed_at=? WHERE id=?`,
    ).run(`Error: ${message}`, Date.now(), id);
  }

  find(id: number): RunRow | undefined {
    return rowToRun(this.db.prepare(`SELECT * FROM runs WHERE id=?`).get(id) as any);
  }
}

function rowToRun(r: any): RunRow | undefined {
  if (!r) return undefined;
  return {
    id: r.id,
    inputPayload: r.input_payload ? JSON.parse(r.input_payload) : null,
    status: r.status,
    recommendation: r.recommendation,
    memoJson: r.memo_json ? JSON.parse(r.memo_json) : null,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  };
}

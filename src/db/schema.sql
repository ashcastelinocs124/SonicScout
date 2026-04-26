CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slack_channel TEXT NOT NULL,
  slack_user TEXT NOT NULL,
  slack_thread_ts TEXT,
  input_payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  recommendation TEXT,
  memo_json TEXT,
  ingested_context TEXT,
  thesis_snapshot TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_runs_thread ON runs(slack_thread_ts);

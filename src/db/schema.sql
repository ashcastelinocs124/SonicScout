CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  input_payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  recommendation TEXT,
  memo_json TEXT,
  ingested_context TEXT,
  thesis_snapshot TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);

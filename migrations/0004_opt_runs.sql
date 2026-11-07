-- 测速历史：npm run optimize 跑完自动上报，面板「优选」页展示
CREATE TABLE IF NOT EXISTS opt_runs (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  zone      TEXT,
  best_ip   TEXT,
  best_ms   INTEGER,
  second_ip TEXT,
  second_ms INTEGER,
  third_ip  TEXT,
  third_ms  INTEGER,
  available INTEGER,
  total     INTEGER,
  skipped   INTEGER DEFAULT 0
);

-- 请求日志：临时诊断表（记录 TG 等客户端的真实请求形态）
CREATE TABLE IF NOT EXISTS req_log (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  ts    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  host  TEXT,
  method TEXT,
  path  TEXT,
  search TEXT,
  ua    TEXT,
  ip    TEXT,
  status INTEGER
);

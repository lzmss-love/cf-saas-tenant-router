-- 接入码：管理员在面板生成发给客户，客户在 /join 自助页凭码绑定自己的域名
CREATE TABLE IF NOT EXISTS join_codes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT    NOT NULL UNIQUE,
  slug         TEXT    NOT NULL,
  plan         TEXT    NOT NULL DEFAULT 'free',
  note         TEXT    NOT NULL DEFAULT '',
  status       TEXT    NOT NULL DEFAULT 'active', -- active / used / revoked
  used_by_host TEXT    NULL,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  used_at      TEXT    NULL
);

CREATE INDEX IF NOT EXISTS idx_join_codes_status ON join_codes(status);

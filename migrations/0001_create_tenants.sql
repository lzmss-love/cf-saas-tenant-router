-- tenants: 每个接入的客户域名一行
CREATE TABLE IF NOT EXISTS tenants (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  host          TEXT    NOT NULL UNIQUE,          -- shop.customer.com
  slug          TEXT    NOT NULL UNIQUE,          -- customer 的内部标识
  plan          TEXT    NOT NULL DEFAULT 'free',  -- free / pro / enterprise
  upstream_base TEXT    NULL,                      -- 租户专属上游地址（覆盖默认 TENANT_UPSTREAM_BASE）
  status        TEXT    NOT NULL DEFAULT 'pending',-- pending / active / suspended / deleted
  note          TEXT    NOT NULL DEFAULT '',
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT    NULL,
  deleted_at    TEXT    NULL
);

CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenants_slug   ON tenants(slug);

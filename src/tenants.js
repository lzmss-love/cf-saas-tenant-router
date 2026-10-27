// 按 Host 头查租户。Cloudflare for SaaS 已经在边缘做过一次 Hostname 匹配，
// 这里再查一次是为了拿到"这个域名对应哪个租户的业务数据"（slug、套餐、上游地址）。

export async function findTenantByHost(host, db) {
  // suspended 为管理员主动停用，停止转发；pending 只是接入流程标记，不影响转发
  const row = await db.prepare(
    "SELECT * FROM tenants WHERE host = ? COLLATE NOCASE AND deleted_at IS NULL AND status != 'suspended'",
  )
    .bind(host.toLowerCase())
    .first();
  return row;
}

export async function upsertTenant(db, { host, slug, plan, upstreamBase, note }) {
  const exists = await db.prepare("SELECT id, status FROM tenants WHERE host = ? COLLATE NOCASE").bind(host.toLowerCase()).first();
  if (exists) {
    // 编辑保留原状态（状态由面板的启用/停用开关管理）
    await db
      .prepare("UPDATE tenants SET slug = ?, plan = ?, upstream_base = ?, note = ?, updated_at = current_timestamp WHERE id = ?")
      .bind(slug, plan, upstreamBase, note ?? "", exists.id)
      .run();
    return exists.id;
  }
  // 新增：配了上游即为 active，否则 pending
  const status = upstreamBase ? "active" : "pending";
  const r = await db
    .prepare("INSERT INTO tenants (host, slug, plan, upstream_base, status, note, created_at) VALUES (?, ?, ?, ?, ?, ?, current_timestamp)")
    .bind(host.toLowerCase(), slug, plan, upstreamBase, status, note ?? "")
    .run();
  return r?.meta?.last_insert_rowid ?? null;
}

export async function setTenantStatus(db, host, status) {
  if (!["active", "pending", "suspended"].includes(status)) return 0;
  const r = await db
    .prepare("UPDATE tenants SET status = ?, updated_at = current_timestamp WHERE host = ? COLLATE NOCASE AND deleted_at IS NULL")
    .bind(status, host)
    .run();
  return r?.meta?.changes ?? 0;
}

export async function listTenants(db) {
  const r = await db.prepare(
    "SELECT id, host, slug, plan, status, upstream_base, note, created_at, updated_at FROM tenants WHERE deleted_at IS NULL ORDER BY id DESC",
  ).all();
  return r.results;
}

export async function deleteTenant(db, host) {
  const r = await db.prepare("DELETE FROM tenants WHERE host = ? COLLATE NOCASE AND deleted_at IS NULL").bind(host.toLowerCase()).run();
  return r?.meta?.changes ?? 0;
}

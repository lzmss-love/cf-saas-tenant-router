// 接入码：面板生成发给客户；客户在 /join 自助页凭码绑定自己的域名。
import { upsertTenant, findTenantByHost } from "./tenants.js";
import { RESERVED_SUFFIXES } from "./config.js";
import { getCfg } from "./config.js";

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // 去掉 0 O 1 I L 等易混淆字符

export function genCode(len = 8) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join("");
}

function now() {
  return new Date().toISOString().replace(/\.\d+Z$/, "Z");
}

export async function createCode(db, { slug, plan, note }) {
  if (!slug) throw badRequest("slug 必填");
  for (let i = 0; i < 5; i++) {
    const code = genCode();
    const dup = await db.prepare("SELECT id FROM join_codes WHERE code = ?").bind(code).first();
    if (dup) continue;
    const r = await db
      .prepare("INSERT INTO join_codes (code, slug, plan, note) VALUES (?, ?, ?, ?)")
      .bind(code, slug, plan || "free", note ?? "")
      .run();
    return { id: r?.meta?.last_row_id ?? null, code, slug, plan: plan || "free" };
  }
  throw new Error("生成接入码冲突过多，请重试");
}

export async function listCodes(db) {
  const r = await db
    .prepare("SELECT id, code, slug, plan, note, status, used_by_host, created_at, used_at FROM join_codes ORDER BY id DESC")
    .all();
  return r.results;
}

export async function revokeCode(db, id) {
  const r = await db
    .prepare("UPDATE join_codes SET status = 'revoked' WHERE id = ? AND status = 'active'")
    .bind(Number(id))
    .run();
  return (r?.meta?.changes ?? 0) > 0;
}

export function validateHostname(host, ownZone) {
  if (!host || !host.includes(".")) return "域名格式不正确";
  if (host === ownZone || host.endsWith(`.${ownZone}`)) return "不能使用宿主域名本身";
  const tld = host.split(".").pop().toLowerCase();
  if (RESERVED_SUFFIXES.includes(tld)) return `保留域名（.${tld}）不能接入`;
  if (!/^[a-z0-9.-]+$/.test(host)) return "域名只能包含小写字母、数字、点和连字符";
  return null;
}

// 自助接入：凭码绑定域名。返回要给客户展示的 CNAME 指令。
export async function joinByCode(db, env, { code, host }) {
  host = String(host || "").trim().toLowerCase().replace(/\.$/, "");
  const err = validateHostname(host, getCfg(env).ownZone);
  if (err) throw badRequest(err);

  const row = await db.prepare("SELECT * FROM join_codes WHERE code = ?").bind(String(code || "").toUpperCase()).first();
  if (!row) throw badRequest("接入码不存在");
  if (row.status === "used") throw badRequest("接入码已被使用");
  if (row.status !== "active") throw badRequest("接入码已作废");

  const exists = await findTenantByHost(host, db);
  if (exists) throw badRequest("该域名已接入");

  // slug 冲突时加短后缀
  let slug = row.slug;
  const slugTaken = await db.prepare("SELECT id FROM tenants WHERE slug = ?").bind(slug).first();
  if (slugTaken) slug = `${row.slug}-${genCode(4)}`;

  await upsertTenant(db, {
    host,
    slug,
    plan: row.plan,
    upstreamBase: null,
    note: `接入码 ${row.code} 自助接入`,
  });
  await db
    .prepare("UPDATE join_codes SET status = 'used', used_by_host = ?, used_at = ? WHERE id = ?")
    .bind(host, now(), row.id)
    .run();

  return {
    host,
    slug,
    plan: row.plan,
    cname_record: { host, type: "CNAME", target: getCfg(env).cnameTarget, note: "在域名 DNS 服务商添加该记录；不能用 A 记录；apex 根域名不支持" },
    hostname_hint: "Custom Hostname 将由管理员在面板确认创建；证书验证通过后即可访问",
  };
}

function badRequest(msg) {
  const e = new Error(msg);
  e.status = 400;
  e.code = "bad_request";
  return e;
}

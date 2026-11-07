// 多路优选记录管理：opt、opt2、opt3… 每条是一个备用/特殊线路入口。
// 支持 A 记录（直指优选 IP）与 CNAME（指社区优选域名）两种形态，更新时保持原类型。
// 自动测速（npm run optimize）只更新主用 opt；其余记录在面板手动维护。
import { cf, zoneBase } from "./cfapi.js";
import { getCfg } from "./config.js";

// 记录名白名单：opt、opt2…opt999（防止借管理面板改任意 DNS 记录）
const NAME_RE = /^opt\d{0,3}$/;

function isIp(v) { return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(v); }
function isDomain(v) { return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(v); }

function validateValue(value) {
  const v = String(value || "").trim().toLowerCase();
  if (!isIp(v) && !isDomain(v)) {
    const e = new Error("格式不正确：填 IPv4 或优选域名");
    e.status = 400; e.code = "bad_value";
    throw e;
  }
  return v;
}

function today() { return new Date().toISOString().slice(0, 10); }

export function validOptName(name) { return NAME_RE.test(String(name || "").trim().toLowerCase()); }

export async function listOptRecords(env) {
  const cfg = getCfg(env);
  const list = await cf("GET", `${zoneBase(env)}/dns_records?per_page=100`, undefined, env);
  const items = Array.isArray(list) ? list : list?.result ?? [];
  // 注意：正则用普通字符串拼接——模板串里 \d 会被 JS 当无效转义丢弃反斜杠
  const re = new RegExp("^opt\\d{0,3}\\." + cfg.ownZone.replace(/\./g, "\\.") + "$", "i");
  return items
    .filter(r => re.test(r.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    .map(r => ({
      id: r.id,
      name: r.name.split(".")[0].toLowerCase(),
      fqdn: r.name,
      type: r.type,
      value: r.content,
      comment: r.comment ?? "",
      modified_on: r.modified_on ?? null,
    }));
}

export async function upsertOpt(env, name, value) {
  const cfg = getCfg(env);
  const short = String(name || "").trim().toLowerCase();
  if (!validOptName(short)) {
    const e = new Error("记录名只允许 opt、opt2、opt3…（opt + 数字）");
    e.status = 400; e.code = "bad_name";
    throw e;
  }
  const v = validateValue(value);
  const fqdn = `${short}.${cfg.ownZone}`;
  const list = await cf("GET", `${zoneBase(env)}/dns_records?name=${fqdn}`, undefined, env);
  const items = Array.isArray(list) ? list : list?.result ?? [];
  const cur = items[0];
  // 新建时按值的形态定类型（IP→A、域名→CNAME）；更新保持原类型
  const type = cur?.type ?? (isIp(v) ? "A" : "CNAME");
  const body = {
    type,
    name: fqdn,
    content: v,
    proxied: false,
    ttl: 1,
    comment: `CF 优选入口 ${today()} 面板更新`,
  };
  if (cur) await cf("PUT", `${zoneBase(env)}/dns_records/${cur.id}`, body, env);
  else await cf("POST", `${zoneBase(env)}/dns_records`, body, env);
  return { name: short, fqdn, type, value: v, previous: cur ? `${cur.type}:${cur.content}` : null };
}

export async function deleteOpt(env, name) {
  const cfg = getCfg(env);
  const short = String(name || "").trim().toLowerCase();
  if (!validOptName(short)) {
    const e = new Error("记录名不合法");
    e.status = 400; e.code = "bad_name";
    throw e;
  }
  const fqdn = `${short}.${cfg.ownZone}`;
  const list = await cf("GET", `${zoneBase(env)}/dns_records?name=${fqdn}`, undefined, env);
  const items = Array.isArray(list) ? list : list?.result ?? [];
  const cur = items[0];
  if (!cur) return false;
  if (fqdn === cfg.cnameTarget) {
    const e = new Error("主用入口（CNAME_TARGET）不能删除，只能改指向");
    e.status = 400; e.code = "protected";
    throw e;
  }
  await cf("DELETE", `${zoneBase(env)}/dns_records/${cur.id}`, undefined, env);
  return true;
}

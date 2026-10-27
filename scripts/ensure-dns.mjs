#!/usr/bin/env node
// 部署时幂等补齐 DNS 基础记录（service / customers / opt / opt2）。
// 需要 CF_API_TOKEN 有 Zone.DNS:Edit；记录已存在则跳过，可反复执行。
// 默认值读 wrangler.jsonc 的 vars（OPT_PRESETS 第一个作为 opt 的默认 CNAME 目标）。

import fs from "node:fs";

// token 优先级：.dns-token 文件（Actions 传入）> CF_DNS_TOKEN env > CF_API_TOKEN env
const TOKEN = (() => {
  try {
    if (fs.existsSync(".dns-token")) {
      const t = fs.readFileSync(".dns-token", "utf8").trim();
      if (t) return t;
    }
  } catch {}
  return process.env.CF_DNS_TOKEN || process.env.CF_API_TOKEN || "";
})();
console.error(`[diag] file=${fs.existsSync(".dns-token") ? "yes" : "no"} CF_DNS_TOKEN=${typeof process.env.CF_DNS_TOKEN}:${(process.env.CF_DNS_TOKEN || "").length} CF_API_TOKEN=${typeof process.env.CF_API_TOKEN}:${(process.env.CF_API_TOKEN || "").length} TOKEN=${(TOKEN || "").length}`);
if (!TOKEN) {
  // 诊断：列出注入了哪些 CF 相关 env（只显示长度，不显示值）
  const injected = Object.keys(process.env)
    .filter(k => /CF_|CLOUDFLARE/i.test(k))
    .map(k => `${k}(len=${(process.env[k] || "").length})`);
  die(`缺少 CF_DNS_TOKEN 或 CF_API_TOKEN。本次 run 注入的 CF 相关 env: ${injected.join(", ") || "无——secrets 未注入，确认它们配在跑 Actions 的同一个仓库"}`);
}

const vars = (() => {
  try {
    const lines = fs.readFileSync("wrangler.jsonc", "utf8")
      .split("\n")
      .filter(l => !l.trim().startsWith("//"));
    const raw = lines.join("\n").replace(/,(\s*[}\]])/g, "$1");
    return JSON.parse(raw).vars || {};
  } catch { return {}; }
})();

const ZONE = process.env.CF_ZONE || vars.OWN_ZONE;
const OPT_DEFAULT = String(vars.OPT_PRESETS || "").split(",")[0].trim() || "104.26.1.1";
if (!ZONE) die("zone 未知：CF_ZONE env 或 wrangler.jsonc vars.OWN_ZONE");

// 1. zone id：优先 env（Actions 已渲染），其次 wrangler.jsonc vars——
//    纯 DNS Edit 的 token 没有 Zone:Read，不能走 GET /zones 查询
const zoneId = process.env.CF_ZONE_ID || vars.OWN_ZONE_ID;
if (!zoneId) die("zone id 未知：CF_ZONE_ID env 或 wrangler.jsonc vars.OWN_ZONE_ID");
console.log(`zone: ${ZONE} (${zoneId})`);

// 2. 幂等建记录
await ensure("service", "AAAA", "100::", true, "originless fallback origin");
await ensure("customers", "CNAME", `service.${ZONE}`, true, "标准 CNAME 入口");
await ensure("opt", "CNAME", OPT_DEFAULT, false, "优选入口（默认社区优选，可在面板改）");
await ensure("opt2", "A", "104.19.1.1", false, "优选备用 IP");

console.log("\n✓ DNS 基础记录就绪。Fallback Origin 需在控制台设为 service." + ZONE);

// ---- helpers ----

async function ensure(name, type, content, proxied, comment) {
  const name_ = `${name}.${ZONE}`;
  const q = await cf("GET", `/zones/${zoneId}/dns_records?name=${name_}&type=${type}`);
  if ((q.result ?? q).length) {
    console.log(`  = ${name_} 已存在，跳过`);
    return;
  }
  await cf("POST", `/zones/${zoneId}/dns_records`, { type, name, content, proxied, ttl: 1, comment });
  console.log(`  ✓ ${name_} ${type} ${content} proxied=${proxied}`);
}

async function cf(method, path, body) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({ success: false, errors: [{ message: "解析失败" }] }));
  if (!data.success) {
    const msg = (data.errors || []).map(e => `${e.code}: ${e.message}`).join("; ");
    // 权限不足时警告而非退出（不阻塞部署流程）
    if (msg.includes("Authentication") || msg.includes("9109") || msg.includes("10000")) {
      console.warn(`⚠ DNS 操作被拒（token 缺 DNS 权限，请到控制台手动建记录）：${msg}`);
      process.exit(0);
    }
    die(`${method} ${path}: ${msg}`);
  }
  return data.result ?? data;
}

function die(m) { console.error(`✗ ${m}`); process.exit(1); }

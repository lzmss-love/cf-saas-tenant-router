#!/usr/bin/env node
// 新 CF 账号从零部署：把本仓库变成任何账号都能跑的项目。
//
// 前置（人工，一次性）：
//   1. 宿主域名已加入新 CF 账号（NS 已托管，Free 套餐即可）
//   2. 该 zone 已 Enable Cloudflare for SaaS（控制台：SSL/TLS → Custom Hostnames → Enable，需绑卡）
//   3. 准备一个 API Token（Zone.Zone:Read + Zone.DNS:Edit + Account.D1:Edit + Workers 部署权限）
//
// 用法:
//   CF_API_TOKEN=xxx node scripts/init.mjs newsaas.example.com
//
// 自动完成:
//   查 zone id → 建 D1 → 重写 wrangler.jsonc（routes/D1/vars 全部指向新账号）
//   → 建 DNS 记录（fallback origin / customers / opt 占位）→ 打印剩余手动步骤

import fs from "node:fs";
import readline from "node:readline";

const ZONE_NAME = process.argv[2];
const TOKEN = process.env.CF_API_TOKEN;
if (!ZONE_NAME || !TOKEN) die("用法: CF_API_TOKEN=xxx node scripts/init.mjs <宿主域名>");
const zone = ZONE_NAME.toLowerCase();
const ACCOUNT_ID = process.env.CF_ACCOUNT_ID || (await ask("Account ID（新账号，控制台右栏可复制）: "));

console.log(`\n== 初始化新账号: ${zone} ==\n`);

// 1. 查 zone
const zones = await cf("GET", `/zones?name=${zone}`);
const z = (zones.result ?? zones)[0];
if (!z) die(`zone ${zone} 不在该账号——先把域名加进 CF 并等 NS 生效`);
const zoneId = z.id;
console.log(`✓ zone ${z.name}  id=${zoneId}  plan=${z.plan?.name}`);

// 2. 建 D1
console.log("创建 D1 saas-tenants ...");
const d1 = await cf("POST", `/accounts/${ACCOUNT_ID}/d1/database`, { name: "saas-tenants" });
const d1Id = d1.uuid ?? d1.id ?? d1.database_id;
console.log(`✓ D1 id=${d1Id}`);

// 3. 从模板渲染 wrangler.jsonc（真实配置不入库）
const template = fs.readFileSync("wrangler.template.jsonc", "utf8");
const cfgText = template
  .replaceAll("__ZONE__", zone)
  .replaceAll("__ZONE_ID__", zoneId)
  .replaceAll("__D1_ID__", d1Id)
  .replaceAll("__CNAME_TARGET__", `opt.${zone}`)
  .replaceAll("__WORKERS_DEV_SUFFIX__", "")
  .replaceAll("__OPT_TEST_HOST__", "");
fs.writeFileSync("wrangler.jsonc", cfgText);
console.log("✓ wrangler.jsonc 已生成（zone/D1/vars，文件不入库）");

// 4. DNS 记录
console.log("创建 DNS 记录 ...");
await ensureA("service", "100::", "AAAA", true, "originless fallback origin（Worker 回源）");
await ensureC("customers", `service.${zone}`, true, "客户 CNAME 入口（标准）");
await ensureA("opt", "104.26.1.1", "A", false, "优选IP 占位——部署后跑 npm run optimize 自动测速更新");
await ensureC("opt2", `opt.${zone}`, false, "优选备用");
console.log("✓ DNS 记录完成");

// 5. 剩余手动步骤
console.log(`
========================================
✅ 自动部分完成。剩余手动步骤（均为一次性）：

  1. Enable Cloudflare for SaaS（若未做）:
     控制台 → ${zone} → SSL/TLS → Custom Hostnames → Enable（绑卡）

  2. 设置 Fallback Origin:
     同页 Fallback Origin 栏填 service.${zone} → 等 Active

  3. 部署 Worker + 迁移:
     npx wrangler deploy
     npx wrangler d1 migrations apply saas-tenants --remote

  4. 设置面板密码:
     npx wrangler secret put ADMIN_TOKEN        # 格式 账号:密码

  5. 优选测速:
     CF_API_TOKEN=<本token> npm run optimize

  6. 验证: curl https://${zone}/health
========================================`);

// ---- helpers ----

async function ensureA(name, content, type, proxied, comment) {
  const exist = await cf("GET", `/zones/${zoneId}/dns_records?name=${name}.${zone}&type=${type}`);
  if ((exist.result ?? exist).length) return console.log(`  = ${name}.${zone} 已存在，跳过`);
  await cf("POST", `/zones/${zoneId}/dns_records`, { type, name, content, proxied, ttl: 1, comment });
  console.log(`  ✓ ${name}.${zone} ${type} ${content} proxied=${proxied}`);
}

async function ensureC(name, content, proxied, comment) {
  const exist = await cf("GET", `/zones/${zoneId}/dns_records?name=${name}.${zone}&type=CNAME`);
  if ((exist.result ?? exist).length) return console.log(`  = ${name}.${zone} 已存在，跳过`);
  await cf("POST", `/zones/${zoneId}/dns_records`, { type: "CNAME", name, content, proxied, ttl: 1, comment });
  console.log(`  ✓ ${name}.${zone} CNAME ${content} proxied=${proxied}`);
}

async function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const a = await new Promise(r => rl.question(q, r));
  rl.close();
  return a.trim();
}

async function cf(method, path, body) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({ success: false, errors: [{ message: "解析失败" }] }));
  if (!data.success) die(`CF API ${method} ${path}: ${(data.errors || []).map(e => e.message).join("; ")}`);
  return data.result ?? data;
}

function die(m) { console.error(`✗ ${m}`); process.exit(1); }

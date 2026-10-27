#!/usr/bin/env node
// 一键优选：对候选 CF IP 测 TLS 握手延迟（本机网络视角），自动把最快的 IP 更新到优选入口记录（opt.<宿主域>）。
//
// 用法:
//   CF_API_TOKEN=xxx npm run optimize
//   CF_API_TOKEN=xxx CF_OPT_HOST=opt2.<宿主域> npm run optimize   # 更新备用记录
//
// 原理:
//   Node https 请求 https://<测速SNI>/ 时用自定义 lookup 把连接指到候选 IP，
//   SNI 仍是测速域名（证书校验正常通过），量 connect+TLS 完成耗时。
//   测速域名必须是本 CF 账号下已激活的 hostname（默认用 SaaS 宿主 zone 根域）。

import https from "node:https";
import fs from "node:fs";
import { execSync } from "node:child_process";

// 默认值从 wrangler.jsonc 的 vars 读取（env 可覆盖）
const wranglerVars = (() => {
  try {
    // 去注释：整行 // 开头丢弃；再去 JSONC 尾逗号
    const lines = fs.readFileSync("wrangler.jsonc", "utf8")
      .split("\n")
      .filter(l => !l.trim().startsWith("//"));
    const raw = lines.join("\n").replace(/,(\s*[}\]])/g, "$1");
    return JSON.parse(raw).vars || {};
  } catch { return {}; }
})();
const ZONE_NAME = process.env.CF_SaaS_ZONE_NAME || wranglerVars.OWN_ZONE;
const TEST_HOST = process.env.CF_SPEED_TEST_HOST || wranglerVars.OPT_TEST_HOST || ZONE_NAME; // SNI/测速主机
const OPT_HOST = process.env.CF_OPT_HOST || `opt.${ZONE_NAME}`;
const TOKEN = process.env.CF_API_TOKEN;
const PATH_ = "/cdn-cgi/trace";

if (!TOKEN) die("缺少 CF_API_TOKEN");

// 候选 IP：CF 常用段的 .1 地址（同段承载同一 Anycast 组，测一个代表整段）
const CANDIDATES = [
  ...[16, 17, 18, 19, 20, 21, 22, 24, 25, 26, 27].map(n => `104.${n}.1.1`),
  ...[64, 65, 66, 67, 68, 69, 70, 71].map(n => `172.${n}.1.1`),
  "162.159.1.1", "162.159.2.1", "162.159.8.1",
  "188.114.96.1", "188.114.97.1",
];

const TIMEOUT = 5000;
const ROUNDS = 2;

console.log(`测速主机(SNI): ${TEST_HOST}  |  更新目标: ${OPT_HOST}`);
console.log(`候选 IP ${CANDIDATES.length} 个，每轮 ${ROUNDS} 次 TLS 握手，超时 ${TIMEOUT}ms\n`);

// 并发测速（5 个一批）
const results = [];
for (let i = 0; i < CANDIDATES.length; i += 5) {
  const batch = CANDIDATES.slice(i, i + 5);
  const vals = await Promise.all(batch.map(ip => measure(ip, ROUNDS)));
  vals.forEach((ms, j) => {
    results.push({ ip: batch[j], ms });
    process.stdout.write(`  ${batch[j].padEnd(16)} ${ms === null ? "超时/失败" : ms + " ms"}\n`);
  });
}

const ok = results.filter(r => r.ms !== null).sort((a, b) => a.ms - b.ms);
if (!ok.length) die("全部候选超时——检查本机网络");
console.log(`\n可用 ${ok.length}/${results.length}，Top3: ${ok.slice(0, 3).map(r => `${r.ip}(${r.ms}ms)`).join("  ")}`);

const winner = ok[0].ip;

// 更新 DNS
console.log(`\n更新 ${OPT_HOST} -> ${winner} ...`);
const rec = await cf("GET", `/zones?name=${ZONE_NAME}`);
const zoneId = rec[0].id;
const list = await cf("GET", `/zones/${zoneId}/dns_records?name=${OPT_HOST}&type=A`);
let record = (list.result ?? list)[0];
if (!record) {
  const created = await cf("POST", `/zones/${zoneId}/dns_records`, {
    type: "A", name: OPT_HOST, content: winner, proxied: false, ttl: 1,
    comment: `CF 优选IP ${new Date().toISOString().slice(0, 10)} TLS ${ok[0].ms}ms`,
  });
  record = created.result ?? created;
  console.log(`✓ 已创建 ${OPT_HOST} -> ${winner}`);
} else {
  const old = record.content;
  const updated = await cf("PUT", `/zones/${zoneId}/dns_records/${record.id}`, {
    type: "A", name: OPT_HOST, content: winner, proxied: false, ttl: 1,
    comment: `CF 优选IP ${new Date().toISOString().slice(0, 10)} TLS ${ok[0].ms}ms`,
  });
  if (!updated.success && !updated.id) die(`更新失败: ${JSON.stringify(updated).slice(0, 200)}`);
  console.log(old === winner ? `= IP 未变化（${old} 已是最优）` : `✓ ${old} -> ${winner}`);
}
console.log(`\n完成。客户 CNAME 指向 ${OPT_HOST} 即吃到优选，无需改代码。`);

// ---- helpers ----

// 直连候选 IP（host=IP）+ SNI 用测速域名；证书 host 不匹配故跳过校验——只测延迟，无敏感数据
function measure(ip, rounds) {
  return new Promise(resolve => {
    let best = null, r = 0;
    const once = () => {
      const t0 = Date.now();
      const req = https.get({
        host: ip,
        servername: TEST_HOST,
        path: PATH_,
        rejectUnauthorized: false,
        timeout: TIMEOUT,
        headers: { "User-Agent": "saas-optimize/1.0", "Host": TEST_HOST },
      }, res => {
        res.resume();
        const ms = Date.now() - t0;
        if (best === null || ms < best) best = ms;
        res.destroy();
        req.destroy();
        if (++r < rounds) once();
        else resolve(best);
      });
      req.on("timeout", () => { req.destroy(); resolve(best); });
      req.on("error", () => { resolve(best); });
    };
    once();
    setTimeout(() => resolve(best), TIMEOUT * (rounds + 1) + 500);
  });
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

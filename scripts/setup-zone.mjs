#!/usr/bin/env node
// 一次性 zone 初始化：建 fallback origin DNS 记录 + CNAME target + Worker route */* + 自定义 Hostname 启用。
//
// 用法:
//   node scripts/setup-zone.mjs your-saas-domain.com --zone-id <ZONE_ID>
//
// 幂等：已存在的记录跳过，可反复运行。
import { cf } from "./lib-cf.mjs";

const zoneName = process.argv[2];
const zoneId = arg("--zone-id");
const FALLBACK = process.env.CF_FALLBACK_NAME || "service";
const CNAME_TARGET = process.env.CF_CUSTOMER_CNAME_TARGET || `customers.${zoneName}`;
if (!zoneName || !zoneId) die("usage: node scripts/setup-zone.mjs your-saas-domain.com --zone-id <id>");

// 1) fallback origin: originless DNS 记录，必须是 Proxied
const dnsRes = await cf("GET", `/zones/${zoneId}/dns_records`, undefined);
const dnsList = Array.isArray(dnsRes) ? dnsRes : dnsRes.results ?? [];
const fallbackRecord = dnsList.find(r => r.name === `${FALLBACK}.${zoneName}`);

if (fallbackRecord) {
  console.log(`= fallback record 已存在 ${fallbackRecord.name} proxied=${fallbackRecord.proxied}`);
} else {
  const created = await cf("POST", `/zones/${zoneId}/dns_records`, {
    type: "AAAA",
    name: FALLBACK,
    content: "100::", // CF 文档指定的 originless 占位地址
    proxied: true,
  });
  console.log(`✓ 创建 fallback record ${created.name} (proxied)`);
}

// 2) CNAME target：给租户指向的入口，用通配子域
const cnameRes = await cf("GET", `/zones/${zoneId}/dns_records`, undefined);
const cnameList = Array.isArray(cnameRes) ? cnameRes : cnameRes.results ?? [];
const cnameName = CNAME_TARGET.split(zoneName)[0].replace(/\.$/, "");
if (cnameList.some(r => r.name === CNAME_TARGET || r.name === `*${cnameName}`)) {
  console.log(`= CNAME target 已存在 ${CNAME_TARGET}`);
} else {
  // 注意：CNAME 记录必须用 `content` 字段传值，用 `target` 会报 9007 Content for CNAME record is invalid
  await cf("POST", `/zones/${zoneId}/dns_records`, {
    type: "CNAME",
    name: cnameName,
    content: `${FALLBACK}.${zoneName}`,
    proxied: true,
    ttl: 1,
  });
  console.log(`✓ 创建 CNAME target *${cnameName} -> ${FALLBACK}.${zoneName}`);
}

// 3) Worker route */*：把进 zone 的所有流量（含所有 Custom Hostname）打进 Worker
const routeRes = await cf("GET", `/zones/${zoneId}/workers/routes`, undefined);
const routes = Array.isArray(routeRes) ? routeRes : routeRes.results ?? [];
const workerName = process.env.CF_WORKER_NAME;
const hasWildcard = routes.some(r => r.pattern === "*/*");
if (hasWildcard) {
  console.log(`= */* route 已存在`);
} else if (!workerName) {
  die("缺少 CF_WORKER_NAME，跳过 route 创建（先部署 Worker 再跑一次）");
} else {
  await cf("POST", `/zones/${zoneId}/workers/routes`, {
    pattern: "*/*",
    script_name: workerName,
  });
  console.log(`✓ 创建 route */* -> ${workerName}`);
}

console.log(`\n下一步:\n`);
console.log(`1. 控制台确认 Custom Hostnames 已启用:`);
console.log(`   https://dash.cloudflare.com/?to=/:account/:zone/ssl-tls/custom-hostnames`);
console.log(`2. 注册第一个租户:`);
console.log(`   node scripts/register-tenant.mjs shop.customer.com --cname ${CNAME_TARGET}`);

function arg(k) {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function die(m) {
  console.error(`✗ ${m}`);
  process.exit(1);
}

#!/usr/bin/env node
// 把一个客户域名注册成 Cloudflare Custom Hostname，并打印客户要照着填的 DNS 记录。
//
// 用法:
//   node scripts/register-tenant.mjs shop.customer.com --slug customer --plan pro
//   node scripts/register-tenant.mjs shop.customer.com --cname customers.your-saas.com --wait
//
// 前置:
//   - CF_API_TOKEN 具备 Zone.CustomHostnames:Edit 权限
//   - CF_ACCOUNT_ID
//   - CF_SaaS_ZONE_ID  = 你的 SaaS zone（宿主 zone，客户域名挂这里）
//
// 说明:
//   Cloudflare 用 Custom Hostname 时，"创建 Custom Hostname" 这一步是平台方在
//   自己的 zone 下做的，不需要客户授权、也不需要客户域名进 CF。客户那边只加一条 CNAME。

import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    slug: { type: "string" },
    plan: { type: "string", default: "free" },
    cname: { type: "string" },
    wait: { type: "boolean", default: false },
    minTls: { type: "string", default: "1.2" },
    noCname: { type: "boolean", default: false },
  },
});

const hostname = positionals[0];
if (!hostname) die("hostname required: node scripts/register-tenant.mjs shop.customer.com");

const account = env("CF_ACCOUNT_ID");
const zone = env("CF_SaaS_ZONE_ID");
const token = env("CF_API_TOKEN");
const cname = values.cname ?? env("CF_CUSTOMER_CNAME_TARGET");
if (!cname) die("need --cname customers.your-saas.com or CF_CUSTOMER_CNAME_TARGET");

// apex 不支持
if (!hostname.includes(".")) {
  console.warn(`! ${hostname} looks like an apex — CF Custom Hostname 不支持 apex，必须用子域名`);
}

// 1) 创建 Custom Hostname。custom_origin_server 故意不填：
//    Worker route 优先级高于 hostname 级 custom origin，填了会被绕过。
const created = await cf("POST", `/accounts/${account}/zones/${zone}/custom_hostnames`, {
  hostname,
  custom_origin_settings: { ssl: { minimum_tls_version: values.minTls } },
});
const id = created.id;
console.log(`✓ created custom hostname ${hostname}  id=${id}`);

// 2) 取验证信息。POST 响应经常不立刻返回 validation_records，必须 GET 一次。
await new Promise(r => setTimeout(r, 3000));
const fetched = await cf("GET", `/accounts/${account}/zones/${zone}/custom_hostnames/${id}`);
printValidation(fetched);

// 3) 客户填完 CNAME 后再 activate；用 --wait 轮询
if (values.wait) {
  const ready = await waitForActive(`/accounts/${account}/zones/${zone}/custom_hostnames/${id}`, {
    status: "active",
    ssl: { status: "active" },
  }, 60, 30_000);
  if (ready) console.log("✓ active, 可以接客");
  else {
    console.log(`! 还没 active。提示客户在其 DNS 服务商添加: ${hostname} CNAME ${cname}`);
    console.log(`  然后在 https://dash.cloudflare.com/?to=/:account/:zone/ssl-tls/custom-hostnames 点 Activate hostname`);
  }
} else {
  console.log(`\n给客户的唯一一条操作:\n  ${hostname}   CNAME   ${cname}`);
  console.log(`然后点 Activate hostname，或用: node scripts/wait-hostname.mjs ${id}`);
}

function printValidation(h) {
  console.log(`  status: ${h.status}`);
  console.log(`  ssl:    ${h.ssl?.status ?? "?"}`);
  const recs = h.validation_records;
  if (recs?.length) {
    console.log(`  validation_records:`);
    for (const r of recs) console.log(`    ${r.type.padEnd(4)} ${r.name.padEnd(40)} ${r.value.slice(0, 48)}`);
    console.log(`  ↑ 客户要在他的 DNS 里加的 TXT 记录（TXT 验证路径）`);
  }
}

async function waitForActive(path, { status, ssl }, tries, delay) {
  for (let i = 0; i < tries; i++) {
    const h = await cf("GET", path);
    const ok = h.status === "active" && h.ssl?.status === "active";
    if (ok) return true;
    await new Promise(r => setTimeout(r, delay));
  }
  return false;
}

async function cf(method, path, body) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "saas-tenant-router/1.0",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!data.success) {
    const msg = Array.isArray(data.errors) ? data.errors.map(e => `${e.code}: ${e.message}`).join("; ") : data.message;
    die(`${method} ${path} failed: ${msg}`);
  }
  return data.result;
}

function env(k) {
  const v = process.env[k];
  if (!v) die(`missing env ${k}`);
  return v;
}

function die(m) {
  console.error(`✗ ${m}`);
  process.exit(1);
}

#!/usr/bin/env node
// 轮询 Custom Hostname 到 active。用法: node scripts/wait-hostname.mjs <hostname_id>
import { cf } from "./lib-cf.mjs";

const id = process.argv[2];
if (!id) die("usage: node scripts/wait-hostname.mjs <hostname_id>");

const path = `/accounts/${env("CF_ACCOUNT_ID")}/zones/${env("CF_SaaS_ZONE_ID")}/custom_hostnames/${id}`;

for (let i = 1; i <= 120; i++) {
  const h = await cf("GET", path);
  process.stdout.write(
    `[${String(i).padStart(3)}] ${h.hostname} status=${h.status} ssl=${h.ssl?.status ?? "?"}` +
      (h.validation_records?.length ? ` dcv=${h.validation_records[0].type}:${h.validation_records[0].name}` : "") +
      "\n",
  );
  if (h.status === "active" && h.ssl?.status === "active") {
    console.log(`✓ active，可以接客`);
    process.exit(0);
  }
  if (h.status === "invalid") {
    console.log(`✗ invalid：该域名已被 Cloudflare 或第三方使用。换子域名，或先让租户清理掉同名 DNS`);
    process.exit(2);
  }
  await new Promise(r => setTimeout(r, 15_000));
}
console.log(`! 30 分钟仍未 active。请先确认租户已加好 CNAME 且 DNS 生效（dig +short ${h.hostname}）`);
process.exit(3);

function env(k) {
  const v = process.env[k];
  if (!v) die(`missing env ${k}`);
  return v;
}

function die(m) {
  console.error(`✗ ${m}`);
  process.exit(1);
}

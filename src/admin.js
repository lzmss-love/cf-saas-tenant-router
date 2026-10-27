import { findTenantByHost, upsertTenant, listTenants, deleteTenant, setTenantStatus } from "./tenants.js";

import { listHostnames, getHostname, createHostname, deleteHostname, cnameInstruction } from "./hostnames.js";
import { listCodes, createCode, revokeCode } from "./join.js";
import { listOptRecords, upsertOpt, deleteOpt } from "./optimize.js";
import { getCfg, isOwnHost } from "./config.js";

const ADMIN_PREFIX = "/__saas/admin";
// 管理接口允许的 host 前缀（api.<zone>），与宿主域名后缀判定互补。
const ADMIN_ZONE_PREFIX = "api.";

export function isInternalRequest(request, env) {
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();
  const onAdminZone =
    host.startsWith(ADMIN_ZONE_PREFIX) ||
    isOwnHost(host, getCfg(env));
  if (!onAdminZone || !url.pathname.includes(ADMIN_PREFIX) || !env.ADMIN_TOKEN) return false;
  // 认证方式：请求头或 ?token= 参数（面板用 query 方式，脚本用 header 方式）
  if (request.headers.get("x-cf-saas-admin") === env.ADMIN_TOKEN) return true;
  return url.searchParams.get("token") === env.ADMIN_TOKEN;
}

// panel-debug 登录诊断端点会回显 token 匹配结果，等于开放 token 猜解 oracle，
// 默认关闭；排查面板登录问题时设 ADMIN_DEBUG=1 再临时打开。
export function panelDebugEnabled(env) {
  return env.ADMIN_DEBUG === "1";
}

export function ownZoneDebugAllowed(host, env) {
  return isOwnHost(host, getCfg(env));
}

// GET    /__saas/admin/tenants          -> 列表
// GET    /__saas/admin/tenants/<host>   -> 详情 + 给客户的 CNAME 指令
// PUT    /__saas/admin/tenants          -> 注册租户
// DELETE /__saas/admin/tenants/<host>   -> 软删除
export async function handleAdminRequest(request, env) {
  return run(request, env);
}

async function run(request, env) {
  const db = env.TENANTS_DB;
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const body = await parseJson(request);
  const name = lastPath(url.pathname);

  // ---- 自定义主机名管理（调 Cloudflare API）----
  if (url.pathname.endsWith("/hostnames")) {
    try {
      if (method === "GET") {
        return json({ ok: true, hostnames: await listHostnames(env) });
      }
      if (method === "POST") {
        if (!body?.hostname) return json({ ok: false, error: "hostname 必填" }, 400);
        const h = await createHostname(env, String(body.hostname).trim().toLowerCase(), body.method || "http");
        return json({ ok: true, hostname: h, customer_cname_record: cnameInstruction(env, h.hostname) }, 201);
      }
    } catch (e) {
      return json({ ok: false, error: e.message, code: e.code || "error" }, e.status || 500);
    }
  }
  if (url.pathname.includes("/hostnames/")) {
    try {
      if (method === "GET") {
        return json({ ok: true, hostname: await getHostname(env, name) });
      }
      if (method === "DELETE") {
        await deleteHostname(env, name);
        return json({ ok: true, deleted: name });
      }
    } catch (e) {
      return json({ ok: false, error: e.message, code: e.code || "error" }, e.status || 500);
    }
  }

  // ---- 多路优选记录（opt、opt2、opt3…）----
  if (url.pathname.endsWith("/opts")) {
    if (method === "GET") {
      // 测速主机三级回退：OPT_TEST_HOST → 第一个 active 租户域名 → 宿主域名（zone 激活即有边缘证书）
      let testHost = String(env.OPT_TEST_HOST || "").trim();
      if (!testHost) {
        try {
          const t = await env.TENANTS_DB
            .prepare("SELECT host FROM tenants WHERE status = 'active' AND deleted_at IS NULL ORDER BY id LIMIT 1")
            .first();
          testHost = t?.host || "";
        } catch {}
      }
      if (!testHost) testHost = getCfg(env).ownZone;
      return json({
        ok: true,
        target: getCfg(env).cnameTarget,
        opts: await listOptRecords(env),
        testHost,
        presets: String(env.OPT_PRESETS || "").split(",").map(x => x.trim()).filter(Boolean),
      });
    }
    if (method === "POST") {
      try {
        const r = await upsertOpt(env, body?.name, body?.value);
        return json({ ok: true, opt: r }, 201);
      } catch (e) {
        return json({ ok: false, error: e.message, code: e.code || "error" }, e.status || 500);
      }
    }
  }
  if (url.pathname.includes("/opts/")) {
    const short = lastPath(url.pathname);
    try {
      if (method === "PUT") {
        const r = await upsertOpt(env, short, body?.value ?? body?.ip);
        return json({ ok: true, opt: r });
      }
      if (method === "DELETE") {
        const ok = await deleteOpt(env, short);
        return json({ ok, name: short });
      }
    } catch (e) {
      return json({ ok: false, error: e.message, code: e.code || "error" }, e.status || 500);
    }
  }

  // ---- 接入码管理 ----
  if (url.pathname.endsWith("/codes")) {
    if (method === "GET") {
      return json({ ok: true, codes: await listCodes(db) });
    }
    if (method === "POST") {
      try {
        const c = await createCode(db, { slug: body?.slug, plan: body?.plan, note: body?.note });
        return json({ ok: true, code: c }, 201);
      } catch (e) {
        return json({ ok: false, error: e.message }, e.status || 500);
      }
    }
  }
  if (method === "DELETE" && url.pathname.includes("/codes/")) {
    const ok = await revokeCode(db, name);
    return json({ ok, id: name });
  }

  // panel 请求 GET /__saas/admin 时 lastPath 会取到 "admin"，一并视为列表请求
  if (method === "GET" && (!name || name === "admin")) {
    return json({ ok: true, tenants: await listTenants(db) });
  }

  if (method === "GET" && name) {
    const t = await findTenantByHost(name, db);
    if (!t) return json({ ok: false, error: "not_found", host: name }, 404);
    // 客户要照着填的那条 DNS 记录
    return json({
      ok: true,
      tenant: t,
      customer_cname_record: {
        host: t.host,
        type: "CNAME",
        target: getCfg(env).cnameTarget,
        note: "在客户自己的权威 DNS 服务商添加；不能用 A 记录，apex 域名不支持",
      },
    });
  }

  if (method === "PUT") {
    // 仅状态切换（不带 host/slug 时）：PUT {status}
    if (body?.status && !body?.host) {
      if (!name) return json({ ok: false, error: "host 路径必填" }, 400);
      const n = await setTenantStatus(db, name, body.status);
      return json({ ok: n > 0, host: name, status: body.status });
    }
    if (!body?.host || !body?.slug) return json({ ok: false, error: "host and slug are required" }, 400);
    const id = await upsertTenant(db, {
      host: body.host,
      slug: body.slug,
      plan: body.plan || "free",
      upstreamBase: body.upstream_base,
      note: body.note,
    });
    // 面板编辑时可顺带切换状态（可选字段）
    if (body.status) await setTenantStatus(db, body.host, body.status);
    return json({ ok: true, id, host: body.host, next: "在「自定义主机名」标签页为该 host 创建 Custom Hostname" }, 201);
  }

  if (method === "DELETE" && name) {
    const n = await deleteTenant(db, name);
    return json({ ok: n > 0, changed: n, host: name, next: "然后调 scripts/deregister-tenant.mjs 删除 Cloudflare 上的 Custom Hostname" });
  }

  return json({ ok: false, error: "not_implemented" }, 405);
}

function lastPath(p) {
  const parts = p.split("/").filter(Boolean);
  return decodeURIComponent(parts[parts.length - 1] ?? "");
}

async function parseJson(request) {
  const c = request.clone();
  try {
    return (await c.json()) ?? {};
  } catch {
    return {};
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

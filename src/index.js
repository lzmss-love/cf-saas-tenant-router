import { findTenantByHost } from "./tenants.js";
import { isInternalRequest, panelDebugEnabled, ownZoneDebugAllowed, handleAdminRequest } from "./admin.js";
import { panelResponse } from "./panel.js";
import { joinPageResponse, handleJoinPost } from "./joinpage.js";
import { getCfg, isOwnHost } from "./config.js";

export default {
  async fetch(request, env, ctx) {
    logRequest(request, env, ctx);
    const host = normalizeHost(request);
    const url = new URL(request.url);

    // 管理接口：注册/查询/注销客户域名。未认证一律 401（此前会落回首页 200，语义不对）。
    if (url.pathname.includes("/__saas/admin")) {
      if (!isInternalRequest(request, env)) {
        return jsonResponse({ ok: false, error: "unauthorized" }, 401);
      }
      return handleAdminRequest(request, env);
    }

    // 管理面板登录诊断。默认关闭（token 猜解风险），排查时设 ADMIN_DEBUG=1。
    if (
      ownZoneDebugAllowed(host, env) &&
      url.pathname === "/__saas/panel-debug"
    ) {
      if (!panelDebugEnabled(env)) {
        return jsonResponse({ ok: false, error: "debug_disabled" }, 404);
      }
      const qToken = url.searchParams.get("token") || "";
      const hToken = request.headers.get("x-cf-saas-admin") || "";
      return jsonResponse({
        adminTokenSet: Boolean(env.ADMIN_TOKEN),
        queryMatch: Boolean(env.ADMIN_TOKEN) && qToken === env.ADMIN_TOKEN,
        headerPresent: Boolean(hToken),
        headerMatch: Boolean(env.ADMIN_TOKEN) && hToken === env.ADMIN_TOKEN,
      });
    }

    // 管理面板：根路径直接是面板，/__saas/panel 继续兼容
    if (ownZoneDebugAllowed(host, env) && (url.pathname.startsWith("/__saas/panel") || url.pathname === "/")) {
      return panelResponse();
    }

    // 客户自助接入页
    if (ownZoneDebugAllowed(host, env) && url.pathname === "/join") {
      if (request.method === "POST") return handleJoinPost(request, env);
      return joinPageResponse();
    }

    // 1) 打到自己 zone 的请求（marketing 站、控制台、健康检查），或 workers.dev 验证子域
    if (isOwnHost(host, getCfg(env))) {
      return handleOwnZone(request, env);
    }

    // 2) 客户域名：按 Host 头查租户表
    const tenant = await findTenantByHost(host, env.TENANTS_DB);

    if (!tenant) {
      // 正常不会走到这里：Custom Hostname 未经注册，Cloudflare 在边缘就拦了。
      // 走到这里说明表数据和 Custom Hostname 记录不一致，返回明确错误便于排查。
      return jsonResponse(
        {
          ok: false,
          error: "unknown_host",
          host,
          hint: "no tenant row for this host; check the tenants table or the Custom Hostname record",
        },
        404,
      );
    }

    // 3) 按租户渲染
    return serveTenant(request, tenant, env);
  },
};

function normalizeHost(request) {
  const host = new URL(request.url).hostname.toLowerCase().replace(/\.$/, "");
  return host;
}

// tgproxy 的 bridge cap 算法（与 tgproxy mkCap 一致）：
// HMAC-SHA256(key=hex(secret), "tdesktop-web-proxy-bridge-v1\n"+host) -> base64url 无填充
async function bridgeCap(secret, host) {
  const enc = new TextEncoder();
  const raw = String(secret).trim().toLowerCase().slice(-32);
  const keyBytes = new Uint8Array(raw.length / 2);
  for (let i = 0; i < keyBytes.length; i++) keyBytes[i] = Number.parseInt(raw.slice(i * 2, i * 2 + 2), 16);
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("tdesktop-web-proxy-bridge-v1\n" + host));
  let bin = "";
  for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

// 请求诊断日志：写 D1（不阻塞响应）。排查 TG 等客户端的真实请求形态后可移除。
function logRequest(request, env, ctx) {
  try {
    const url = new URL(request.url);
    const stmt = env.TENANTS_DB.prepare(
      "INSERT INTO req_log (host, method, path, search, ua, ip) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(
      url.hostname,
      request.method,
      url.pathname,
      url.search || "",
      (request.headers.get("user-agent") || "").slice(0, 120),
      request.headers.get("cf-connecting-ip") || "",
    );
    if (ctx && ctx.waitUntil) ctx.waitUntil(stmt.run());
    else stmt.run();
  } catch {}
}

function handleOwnZone(request, env) {
  const url = new URL(request.url);

  if (url.pathname === "/health") {
    return jsonResponse({ ok: true, service: "saas-tenant-router", ts: Date.now() });
  }

  return htmlResponse(`<!doctype html>
<html><body style="font-family:system-ui;background:#0b0d12;color:#e8e8e8;padding:8vh 8vw">
  <h1 style="font-size:14px;letter-spacing:.3em;color:#7d8590">SAAS TENANT ROUTER</h1>
  <h2 style="margin-top:2vh">${getCfg(env).ownZone}</h2>
  <p>Zone 自己的流量入口。客户流量走 Custom Hostname → <code>*/*</code> route → 本 Worker。</p>
  <p>当前 zone：<code>${getCfg(env).ownZone}</code></p>
  <p><a href="/__saas/panel" style="color:#6cb6ff">→ 打开管理控制面板</a></p>
  <p><a href="/join" style="color:#6cb6ff">→ 客户域名自助接入（凭接入码）</a></p>
</body></html>`);
}

// 把租户的上下文塞进环境变量，交给上层应用逻辑。
// 你的真实业务（渲染页面 / 转发 API / 拼路径）在这里接入。
async function serveTenant(request, tenant, env) {
  const url = new URL(request.url);

  // 若配置了 TGPROXY service binding（wrangler.jsonc services），优先走 binding 直转
  if (env.TGPROXY) {
    return env.TGPROXY.fetch(request);
  }

  // 租户级 upstream 优先，其次全局默认。两者都没配时返回租户信息页，
  // 避免 fetch 占位域名导致 1016 Origin DNS error。
  const upstreamBase = tenant.upstream_base || env.TENANT_UPSTREAM_BASE;
  if (!upstreamBase) {
    return htmlResponse(`<!doctype html>
<html><body style="font-family:system-ui;background:#0b0d12;color:#e8e8e8;padding:8vh 8vw">
  <h1 style="font-size:14px;letter-spacing:.3em;color:#7d8590">SAAS TENANT ROUTER</h1>
  <h2>✅ 租户流量已进 Worker</h2>
  <p>host: <code>${tenant.host}</code> · slug: <code>${tenant.slug}</code> · plan: <code>${tenant.plan}</code></p>
  <p style="color:#a3aab4">这条链路已通：Custom Hostname → <code>*/*</code> route → Worker → D1 租户表。</p>
  <p style="color:#ffb454">下一步：给该租户配 <code>upstream_base</code>（租户专属上游）或全局 <code>TENANT_UPSTREAM_BASE</code>，Worker 就会把请求转发到你的真实业务源站。</p>
</body></html>`);
  }

  const upstream = new URL(upstreamBase);
  // 原样透传路径与 query（上游不按租户路径分片）
  const target = new URL(url.pathname, upstream);

  // bridge cap 与 hostname 绑定（tgproxy 的 mkCap 校验）。客户手里的 cap 是按客户域名算的，
  // 而 tgproxy 收到的 hostname 是 upstream.hostname，必须重算替换，否则 bridge 认证失败返回占位页。
  if (
    url.pathname === "/" &&
    url.search.startsWith("?bridge=") &&
    env.TGPROXY_SECRET
  ) {
    try {
      const want = await bridgeCap(env.TGPROXY_SECRET, upstream.hostname);
      target.search = "?bridge=" + want;
    } catch {}
  } else {
    url.search && (target.search = url.search);
  }

  const headers = new Headers(request.headers);
  headers.set("X-Forwarded-Host", tenant.host);
  headers.set("X-Tenant-Id", String(tenant.id));
  // 上游应用按自身域名做 Origin 校验（如 tgproxy 的 WebSocket 握手），
  // 客户域名访问时必须改写成上游 origin，否则被拒。
  if (headers.has("Origin")) headers.set("Origin", upstream.origin);
  if (env.UPSTREAM_API_KEY) headers.set("Authorization", `Bearer ${env.UPSTREAM_API_KEY}`);

  const upstreamResp = await fetch(target, {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
    redirect: "follow",
  });

  // WebSocket 升级（101）：必须把 webSocket 属性带回客户端，
  // 用普通 new Response(body) 包装会丢掉通道，握手失败。
  if (upstreamResp.status === 101 && upstreamResp.webSocket) {
    return new Response(null, {
      status: upstreamResp.status,
      statusText: upstreamResp.statusText,
      headers: upstreamResp.headers,
      webSocket: upstreamResp.webSocket,
    });
  }

  const respHeaders = new Headers(upstreamResp.headers);
  respHeaders.set("X-Tenant-Id", String(tenant.id));
  respHeaders.set("Cache-Control", "public, max-age=60, s-maxage=300"); // 配合 Cache for SaaS

  // 页面内容改写：上游生成的页面里注入了自己的域名（页面 JS 的 ws 目标、CSP 的 connect-src），
  // 不改写的话浏览器会绕开本链路直连上游，且 Origin 校验失败。把上游 origin 替换为客户域名。
  // 注意 CSP 里是 wss:// 前缀（不是 https://），两种都要替换。
  const clientOrigin = `https://${tenant.host}`;
  const clientWsOrigin = `wss://${tenant.host}`;
  const csp = respHeaders.get("content-security-policy");
  if (csp && (csp.includes(upstream.origin) || csp.includes(upstream.hostname))) {
    respHeaders.set(
      "content-security-policy",
      csp.split(upstream.origin).join(clientOrigin).split(`wss://${upstream.hostname}`).join(clientWsOrigin),
    );
  }
  const contentType = upstreamResp.headers.get("content-type") || "";
  if (contentType.includes("text/html") && !["GET", "HEAD"].includes(request.method)) {
    // 非 GET 的 HTML 不常见，走原样返回
    return new Response(upstreamResp.body, {
      status: upstreamResp.status,
      statusText: upstreamResp.statusText,
      headers: respHeaders,
    });
  }
  if (contentType.includes("text/html")) {
    let html = await upstreamResp.text();
    if (html.includes(upstream.origin)) {
      html = html.split(upstream.origin).join(clientOrigin);
    }
    respHeaders.delete("content-length");
    return new Response(request.method === "HEAD" ? null : html, {
      status: upstreamResp.status,
      statusText: upstreamResp.statusText,
      headers: respHeaders,
    });
  }

  return new Response(upstreamResp.body, {
    status: upstreamResp.status,
    statusText: upstreamResp.statusText,
    headers: respHeaders,
  });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function htmlResponse(body) {
  return new Response(body, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

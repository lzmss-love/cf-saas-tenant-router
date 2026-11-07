// Worker 内调 Cloudflare API 的薄封装。
// token 来自 secret CF_API_TOKEN，需要 Zone.Custom Hostnames:Edit 权限才能管理自定义主机名。

export async function cf(method, path, body, env) {
  if (!env.CF_API_TOKEN) {
    const err = new Error("CF_API_TOKEN 未配置");
    err.status = 412;
    err.code = "token_missing";
    throw err;
  }
  let res;
  try {
    res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${env.CF_API_TOKEN}`,
        "Content-Type": "application/json",
        "User-Agent": "saas-tenant-router/1.0",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    const err = new Error("无法连接 Cloudflare API");
    err.status = 502;
    err.code = "network";
    throw err;
  }
  const data = await res.json().catch(() => ({ success: false, errors: [{ message: "响应解析失败" }] }));
  if (!data.success) {
    const e = (data.errors || [{}])[0] || {};
    const err = new Error(e.message || `CF API ${method} ${path} 失败`);
    err.status = e.code === 10000 ? 403 : 502;
    err.code = e.code === 10000 ? "token_permission" : "cf_api";
    err.detail = data.errors;
    throw err;
  }
  return data.result;
}

export function zoneBase(env) {
  return `/zones/${env.OWN_ZONE_ID}`;
}

// 把 CF 的 custom hostname 对象压成面板要显示的字段
export function slimHostname(h) {
  // 证书验证 TXT（method=txt 时客户要加的记录）；字段名 CF 文档为 txt_name/txt_value（兼容 txt_record）
  const vr = (h.ssl?.validation_records ?? []).map(r => ({
    txt_name: r.txt_name ?? r.name ?? "",
    txt_value: r.txt_value ?? r.txt_record ?? r.value ?? "",
  }));
  return {
    id: h.id,
    hostname: h.hostname,
    status: h.status,
    cert_status: h.ssl?.status ?? null,
    cert_expires: h.ssl?.expires_on ?? null,
    cert_method: h.ssl?.method ?? null,
    validation_records: vr,
    created_at: h.created_at,
  };
}

// 账号的 ACME DCV 委派目标（<hash>.dcv.cloudflare.com）。
// 用于给客户生成委派 CNAME：_acme-challenge.<hostname> CNAME <hostname>.<该域>
// 端点不可用/权限不足时返回 null，前端不显示该方式。
export async function getDcvDelegation(env) {
  try {
    // GET /zones/{zone_id}/dcv_delegation/uuid（CF API schema 确认），需 SSL and Certificates Read
    const res = await cf("GET", `${zoneBase(env)}/dcv_delegation/uuid`, undefined, env);
    const uuid = res?.uuid ?? res?.result?.uuid ?? null;
    return uuid ? `${uuid}.dcv.cloudflare.com` : null;
  } catch {
    return null;
  }
}
// 运行时配置：全部从部署 vars 读取（wrangler.jsonc 的 vars 段），代码零硬编码。
// 新 CF 账号部署时用 scripts/init.mjs 自动生成配置，或在 wrangler.jsonc 里改 vars。
// isolate 生命周期内缓存一次（同一 Worker 的绑定不变）。

// ICANN 保留 TLD，不能作为 Custom Hostname
export const RESERVED_SUFFIXES = ["test", "example", "invalid", "localhost"];

let cached = null;

export function getCfg(env) {
  if (cached) return cached;
  const ownZone = String(env.OWN_ZONE || "").trim().toLowerCase();
  const ownZoneId = String(env.OWN_ZONE_ID || "").trim();
  cached = {
    ownZone,
    ownZoneId,
    // workers.dev 验证子域后缀（可选；不配置则不匹配任何 workers.dev 流量）
    workersDevSuffix: String(env.OWN_WORKERSDEV_SUFFIX || "").trim().toLowerCase(),
    // 客户 CNAME 指向的入口（默认从宿主域名推导）
    cnameTarget: String(env.CNAME_TARGET || "").trim().toLowerCase() || `opt.${ownZone}`,
    // 上游默认（可选，租户级 upstream_base 优先）
    tenantUpstreamBase: String(env.TENANT_UPSTREAM_BASE || "").trim(),
  };
  return cached;
}

export function isOwnHost(host, cfg) {
  return (
    host === cfg.ownZone ||
    (!!cfg.ownZone && host.endsWith(`.${cfg.ownZone}`)) ||
    (!!cfg.workersDevSuffix && host.endsWith(cfg.workersDevSuffix))
  );
}

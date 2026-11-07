// 自定义主机名（Custom Hostname）管理：面板直接增删查，替代手动去 CF Dashboard。
import { cf, zoneBase, slimHostname, getDcvDelegation } from "./cfapi.js";
import { getCfg } from "./config.js";

export async function listHostnames(env) {
  const result = await cf("GET", `${zoneBase(env)}/custom_hostnames?per_page=100`, undefined, env);
  const items = Array.isArray(result) ? result : result?.result ?? result ?? [];
  return items.map(slimHostname);
}

export async function getHostname(env, id) {
  const h = await cf("GET", `${zoneBase(env)}/custom_hostnames/${id}`, undefined, env);
  const slim = slimHostname(h);
  // DCV 委派 CNAME（推荐：一次配置自动续期），账号无委派配置时为 null
  const dcv = await getDcvDelegation(env);
  slim.dcv_cname = dcv
    ? { name: `_acme-challenge.${h.hostname}`, target: `${h.hostname}.${dcv}` }
    : null;
  return slim;
}

export async function createHostname(env, hostname, method = "http") {
  const body = {
    hostname,
    ssl: { method, type: "dv", wildcard: false },
  };
  const created = await cf("POST", `${zoneBase(env)}/custom_hostnames`, body, env);
  // POST 响应常不带回 validation_records，延时 GET 补全
  await new Promise(r => setTimeout(r, 3000));
  try {
    return await getHostname(env, created.id);
  } catch {
    return slimHostname(created);
  }
}

export async function deleteHostname(env, id) {
  await cf("DELETE", `${zoneBase(env)}/custom_hostnames/${id}`, undefined, env);
  return true;
}

// 创建后给客户的 DNS 指令
export function cnameInstruction(env, hostname) {
  return {
    host: hostname,
    type: "CNAME",
    target: getCfg(env).cnameTarget,
    note: "在客户自己的权威 DNS 服务商添加；不能用 A 记录；apex 根域名不支持",
  };
}

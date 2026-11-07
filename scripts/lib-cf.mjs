// Cloudflare API 薄封装。token 需要 Zone.Zone:Read + Zone.CustomHostnames:Edit + Zone.DNS:Edit + Workers Routes 权限。
export async function cf(method, path, body, token) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token ?? process.env.CF_API_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "saas-tenant-router/1.0",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!data.success) {
    const msg = Array.isArray(data.errors)
      ? data.errors.map(e => `${e.code}: ${e.message}`).join("; ")
      : data.message ?? JSON.stringify(data);
    throw new Error(`${method} ${path} -> ${msg}`);
  }
  return data.result;
}

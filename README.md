# cf-saas-tenant-router

Cloudflare for SaaS 多租户接入系统：客户域名**不托管 CF**，加一条 CNAME 即可把流量接入你的 Worker，按 Host 分流转发到各自的上游。

- 管理面板（租户 / 接入码 / 自定义主机名 / 多路优选）+ 客户自助接入页
- GitHub Actions 全自动部署：push 即上线（建 D1 / 写密钥 / 建 DNS / 设 Fallback Origin 全自动）
- 模板化：任何新 CF 账号从零部署零代码修改（本机 `npm run init` 或模板仓库 + secrets）

```
客户域名（如 test.vs.new.tg，NS 留在客户自己的 DNS）
        │ CNAME → opt.<宿主域名>（优选 IP，灰云 A 记录）
        ▼
Cloudflare 边缘 ── Custom Hostname（证书自动签发）── */* route
        ▼
saas-tenant-router Worker
   ├─ 按 Host 查 D1 租户表 → 转发上游（tgproxy / cf-erp / cf-subcloud …）
   ├─ Origin 改写 + 页面域名替换 + WebSocket 透传（兼容 tgproxy 等严格校验的上游）
   └─ bridge cap 重算（客户手里任何域名版本的接入凭证都能过认证）
```

部署完成后你会得到：

| 资源 | 值 |
|---|---|
| 面板 | `https://<宿主域名>`（ADMIN_TOKEN 账号密码登录）|
| 客户自助接入 | `https://<宿主域名>/join` |
| Worker | `saas-tenant-router`，`*/*` 路由挂宿主 zone |
| D1 | `saas-tenants`（租户 / 接入码 / 请求日志）|
| DNS 记录 | `service`（fallback origin）、`customers`、`opt*`（优选入口，可多条）|

> 仓库不包含任何真实域名/ID；部署配置由 `scripts/init.mjs`（本机）或 GitHub Actions secrets（CI）从 `wrangler.template.jsonc` 渲染。

## 面板功能（四个标签页）

| 标签 | 功能 |
|---|---|
| 租户 | 增删改查、详情（含客户要填的 CNAME）、**启用/停用**（suspended 停止转发）、删除（物理删除，列表即消失）|
| 接入码 | 生成 8 位码发给客户；客户在 `/join` 输码 + 域名自助完成接入；一次性、防重放、可作废 |
| 自定义主机名 | 创建/删除 Custom Hostname；列表显示证书与主机名状态；**详情弹窗**含客户要加的全部 DNS 指令（CNAME / 验证 TXT / DCV 委派 CNAME）|
| 优选 | **多路管理**（opt/opt2/opt3… 每条可编辑/新增/删除，A 或 CNAME 双形态）；**在线测速**（当前线路真实延迟）；快捷切换社区优选域名 |

## 新客户接入流程（约 3 分钟）

1. 面板「接入码」→ 生成 → 发给客户（复制按钮自带接入地址）
2. 客户开 `https://<宿主域名>/join` → 输接入码 + 自己的域名 → 页面直接给出要加的 CNAME：
   ```
   <客户域名>  CNAME  opt.<宿主域名>
   ```
3. 客户在他的 DNS 服务商添加记录（不能用 A 记录；apex 根域名不支持，让客户用子域）
4. 面板「自定义主机名」→ 为该 host 创建 Custom Hostname → 点**详情**把弹窗里的 DNS 指令发给客户补加（验证 TXT 或 DCV 委派 CNAME）
5. 等证书/主机名双绿灯。若证书一直"待验证"→ 检查客户域名的 **CAA 记录**（沿 DNS 树向上继承），需授权 `ssl.com` 等 CA
6. 完事。Worker 已自动识别新租户并转发到其 upstream_base

## 新 CF 账号从零部署（模板化，代码零修改）

本仓库是可复用模板：拿到任何新 CF 账号，跑一条初始化命令即可，域名/账号/D1 全部自动配置。

**前置（人工）**：
1. 宿主域名加入新 CF 账号（NS 托管，Free 即可）
2. 控制台 Enable Cloudflare for SaaS（SSL/TLS → Custom Hostnames → Enable，绑卡）
3. 建一个 API Token，权限（init 要读写 DNS 和建库）：
   - **Zone → Zone → Read**
   - **Zone → DNS → Edit**
   - **Account → D1 → Edit**
   - （模板 "Edit Cloudflare Workers" 可顺带勾上，后续 deploy 用同一 token）
   - Zone Resources 选你的宿主 zone

**在哪里跑**：在你自己电脑的终端、**clone 出来的新目录**里跑（init 会重写该目录的 wrangler.jsonc，不要在已有部署的目录执行，否则当前账号配置会被覆盖）。

**一条命令初始化**：

```bash
# 1) clone 到新目录
git clone https://github.com/love-ztm/cf-saas-tenant-router.git my-new-saas
cd my-new-saas && npm i

# 2) 初始化（Git Bash 语法）
CF_API_TOKEN=xxx node scripts/init.mjs <你的宿主域名>

# PowerShell 写法：
#   $env:CF_API_TOKEN="xxx"; node scripts/init.mjs <你的宿主域名>
```

自动完成：查 zone id → 建 D1 → 重写 wrangler.jsonc（routes/D1/vars 全部指向新账号）→ 建 DNS 记录（fallback origin / customers / opt）→ 打印剩余手动步骤（Fallback origin 设置、deploy、ADMIN_TOKEN）。

之后照常 `npx wrangler deploy` + `npm run optimize`，新账号整套就绪。

**配置在哪改**：全部在 `wrangler.jsonc` 的 `vars` 段（`OWN_ZONE` / `OWN_ZONE_ID` / `CNAME_TARGET` / `OWN_WORKERSDEV_SUFFIX`），改完部署生效。代码里零硬编码。

## 部署

### 手动部署（本机）

**日常更新**（改完代码）：

```bash
git pull
npm i
npx wrangler deploy          # Worker + 路由；secrets 在 CF 侧，不受影响
```

**首次初始化**（新机器/重建）：

```bash
npm i
npx wrangler d1 create saas-tenants          # 把 database_id 填进 wrangler.jsonc
npx wrangler d1 migrations apply saas-tenants --remote
npx wrangler deploy
```

**secrets 管理**（存 CF 侧，`wrangler deploy` 不会清除；**不要**在 Dashboard 建 plain text 变量——会被部署清掉）：

```bash
npx wrangler secret put ADMIN_TOKEN        # 面板登录，格式 账号:密码
npx wrangler secret put CF_API_TOKEN       # DNS/Custom Hostnames 操作
npx wrangler secret put TGPROXY_SECRET     # tgproxy 的 SECRET，用于 bridge cap 重算
```

查看现有密钥：`npx wrangler secret list`。

**验证部署**：`curl https://<宿主域名>/health` 返回 `{"ok":true,...}`；面板能登录即正常。

### 自动部署（GitHub Actions）

仓库已含 `.github/workflows/deploy.yml`：push 到 `master`（或 Actions 页手动触发）自动完成**全流程**：

```
查 zone id → 建/找 D1 → 渲染配置 → 部署 Worker → D1 迁移
→ 自动写入运行时密钥（CF_API_TOKEN / ADMIN_TOKEN / TGPROXY_SECRET）
→ 幂等补齐 DNS 基础记录
```

secrets 未配置时 Actions 绿灯跳过并提示，配置后自动恢复。

**一次性配置（需要你操作）**：

1. 建 CF 部署专用 API Token（[dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) → Create Token），权限：
   - 模板 **"Edit Cloudflare Workers"**
   - 追加 **Account → D1 → Edit**
   - 追加 **Zone → DNS → Edit**（自动建 DNS 记录用）
   - 追加 **Zone → Zone → Read**（自动查 zone id 用）
   - Zone Resources 选你的宿主 zone

2. GitHub 仓库 → Settings → Secrets and variables → Actions → New repository secret：

   | Secret | 值 | 必填 |
   |---|---|---|
   | `CF_ZONE` | 你的宿主域名（如 `xxx.com`）| ✅ |
   | `CLOUDFLARE_API_TOKEN` | 上一步的 token | ✅ |
   | `CLOUDFLARE_ACCOUNT_ID` | 你的 Account ID | ✅ |
   | `CF_ADMIN_TOKEN` | 面板密码（格式 `账号:密码`）| ✅ |
   | `CF_DNS_TOKEN` | 专用 DNS token（不填则复用部署 token）| ⬜ |
   | `CF_TGPROXY_SECRET` | TG WEB 代理密码（不接 TG 不用填）| ⬜ |
   | `CF_WORKERS_DEV_SUFFIX` | workers.dev 子域后缀（测试期才用）| ⬜ |
   | `CF_OPT_TEST_HOST` | 在线测速用的已激活租户域名 | ⬜ |

   zone id / D1 id / CNAME target **不用填**——Actions 自动解析（D1 不存在会自动创建）。

3. 完成。之后 `git push` 即自动上线（含首次：建库、建 DNS、设密钥全自动）。

**单仓库部署多个 CF 账号**（GitHub Environments，推荐方式）：本仓库统一管理多个 CF 账号，每个账号一个 Environment。Actions 手动触发时 `target` **自由输入**目标账号名。

启用一个账号（以 `maowei` 为例）：

1. 仓库 → Settings → Environments → **New environment**，名称填账号名（如 `maowei`）
2. 在该 environment 的 **Secrets** 里配置该 CF 账号的 secrets（同上表，换成该账号的值）
3. Actions → Deploy → **Run workflow** → target 填 `maowei` → 部署到对应 CF 账号

注意：**指定 target 时，zone/D1 会按 zone 名在目标账号实时解析**（忽略仓库级回退的 ID，避免跨账号错绑路由）；新增账号不需要改任何代码。push 自动部署不受影响（无 target = 用本仓库 secrets，对应"主账号"）。

### 备选：新账号的通用前置（人工三件套）

无论用哪种部署方式，每个新 CF 账号都要先完成（无法 API 化）：

1. 宿主域名加进该账号（NS 托管）
2. **Enable Cloudflare for SaaS**（SSL/TLS → Custom Hostnames → Enable，绑卡）——CF 唯一不给 API 的步骤
3. **Fallback Origin**：控制台 SSL/TLS → Custom Hostnames → Fallback Origin 栏填 `service.<你的域名>` → 等 Active（该端点不接受 API Token 认证，必须控制台操作）

> 不用 Actions 的替代路线：本机 clone 仓库 → `CF_API_TOKEN=xxx npm run init <域名>` → `npx wrangler deploy`，效果相同（见「新 CF 账号从零部署」）。仓库也保留了 Use this template 的模板属性，按需自取。

## 优选 IP 维护

优选解决的是"国内访问 CF 边缘入口慢"的问题：客户域名解析到测速优选的 CF IP，SNI 路由不变。

```bash
CF_API_TOKEN=xxx npm run optimize
```

- 对 24 个候选 IP 测 TLS 握手 → 自动把最快的写入优选记录（IP 没变则跳过写入）
- 换 IP 只改 DNS 记录，客户域名不用动，代码不用动
- 优选入口支持两种形态：**A 记录**（直指优选 IP）或 **CNAME**（指社区优选域名如 `*.cf.090227.xyz`，自动更新更省心）；面板更新时保持原类型
- 建议每周跑一次；某天客户集体打不开（IP 失效）立即跑
- 非标端口的反代节点（如 `IP:26524`）对 TG WEB 无用（固定 443 且无端口字段），仅适合支持自定义端口的客户端

## 排障

**D1 请求日志**：Worker 把每个请求（method/path/query/UA/IP）写入 `req_log` 表，排查客户端真实请求形态直接查表：

```bash
npx wrangler d1 execute saas-tenants --remote --command "SELECT * FROM req_log ORDER BY id DESC LIMIT 20"
```

**常见问题**：

| 现象 | 原因/处理 |
|---|---|
| 客户域名返回占位页 "Connection" | bridge cap 与 hostname 不匹配——Worker 已自动重算，若仍出现查 `req_log` 看请求形态 |
| 面板登录失败 | ADMIN_TOKEN 是 secret（账号:密码），确认没在 Dashboard 建同名明文变量 |
| 面板按钮无反应 | 内嵌 JS 语法问题，跑 `node scripts/check-embedded-js.mjs` 检查后再部署 |
| Custom Hostname 操作 403 | CF_API_TOKEN 缺权限（需 Zone → SSL and Certificates → Edit），重建 token 更新 secret |
| Custom Hostname 证书一直"待验证" | 客户域名或其上级的 **CAA 记录**未授权签发 CA——加 `0 issue "ssl.com"` 等 CAA，或删除现有 CAA |
| Fallback Origin API 报 10405 | 该端点不接受 API Token 认证（CF 硬限制）——控制台手点 |
| 证书到期列显示"自动续期" | 正常：CF 签发的证书自动续期，API 不返回到期日 |
| `wrangler deploy` 后变量消失 | 部署会用 wrangler.jsonc 整体替换明文变量——一切凭证走 secret，不走 Dashboard 明文变量 |

## 项目结构

```
src/
  index.js        Worker 主入口：路由分发（admin/panel/join/租户转发/健康检查）
  config.js       运行时配置（从 wrangler.jsonc vars 读取，getCfg/isOwnHost）
  tenants.js      D1 租户表 CRUD 与状态机（active/pending/suspended/deleted）
  admin.js        /__saas/admin API（租户/接入码/主机名/优选）+ 认证
  panel.js        管理面板页面（单文件 HTML，内嵌 JS 有独立语法检查）
  join.js         接入码生成与自助接入业务逻辑
  joinpage.js     /join 自助接入页
  hostnames.js    Custom Hostname 管理（调 CF API）
  cfapi.js        CF API 薄封装（Worker 内）
  optimize.js     优选记录查/改
migrations/       D1 迁移（tenants / join_codes / req_log）
scripts/
  init.mjs                新 CF 账号一键初始化（查 zone/建 D1/写配置/建 DNS）
  optimize.mjs            一键优选（本机测速 + 自动更新 DNS）
  ensure-dns.mjs          幂等补齐基础 DNS（Actions 部署时自动调用）
  setup-zone.mjs          zone 初始化（fallback origin / CNAME target / 路由）
  register-tenant.mjs     CLI 创建 Custom Hostname
  wait-hostname.mjs       轮询 hostname 到 active
  check-embedded-js.mjs   部署前检查页面内嵌 JS 语法
wrangler.template.jsonc  配置模板（占位符，真实值不入库）
wrangler.jsonc           本机部署配置（gitignore，init/optimize 时生成/读取）
```

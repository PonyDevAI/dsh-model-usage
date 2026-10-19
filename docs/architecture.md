# DSH 模型供应商额度插件 — 架构方案

> 目标：在 DSH Web UI 里实时显示「已添加的模型供应商」的使用额度/余额与用量统计。
> 当前机器上的实例：`dsh web` / `@deepseek-ai/dsh@0.2.0-rc.2`，profile `web`，监听 `127.0.0.1:3080`。
> 本文是架构设计，不包含已安装的插件。

---

## 1. 需求拆解

「使用额度统计」实际上有三类数据，必须分开设计，否则会把余额、额度、本机 token 估算混成一个数：

| 数据面 | 例子 | 数据来源 | 实时性 |
|---|---|---|---|
| **服务商侧余额/额度** | DeepSeek 余额 ¥12.40；GLM Coding Plan 5h 已用 38% / 周 62% | 服务商 HTTP 接口（轮询快照） | 轮询 + 每次模型调用后触发刷新 |
| **本机用量统计** | 今日/近 7 天各供应商、各模型 token 数 | DSH 会话事件 `assistant/message` | 事件驱动，立即可得 |
| **单轮消耗** | 这一轮用了多少 token | 已有能力：聊天页每轮 usage 面板 / 上下文占用环 | 已由 DSH 自带，不重复做 |

结论：

- **额度面**是插件的主价值：DeepSeek API Key 余额、DeepSeek 账号余额、GLM Coding Plan 窗口额度。
- **用量面**作为第二层：跨会话累计的 token 统计（今日 / 7 天 / 按供应商/模型），补足服务商只返回「余额」不返回明细的问题。
- **单轮 token** 不重复实现；现有 `dsh-client-ui-chat` 已经有每轮 usage 面板，`dsh-client-ui-conversation` 已有上下文占用环。

「实时」的准确语义：服务商接口是快照，没有推送。所以实时 = 定时轮询（60s）+ 一轮对话结束后主动刷新 + 前端本地倒计时/相对时间，不承诺秒级。

当前 profile 里已添加的供应商（`~/.dsh/profiles/web/cordis.patch.yml`）：

```yaml
- id: llm-pi-ai
  config:
    providers:
      zai-coding-cn:
        apiKeyEnv: ZAI_CODING_CN_API_KEY
- id: agent-default-model
  config:
    provider: deepseek-official
    model: deepseek-flash
```

即：`deepseek-official`（DeepSeek API Key）+ `zai-coding-cn`（GLM Coding Plan）。凭据文件里存在 `DEEPSEEK_API_KEY`、`ZAI_CODING_CN_API_KEY` 两个 ref（不读取、不打印值）。

---

## 2. 关键结论（推荐架构）

**一个标准 DSH bundle 插件，Host + Client 两半，宿主负责取数和缓存，浏览器只负责展示。**

```
┌──────────────────────── dsh web (browser) ────────────────────────┐
│  Sidebar 底部额度条（常驻） │ 设置 → 模型用量（详情页） │ 可选：模型卡片角标 │
│            └────────── ctx.connection.rpc.call('/model-usage', ...) │
└───────────────────────────────────┬───────────────────────────────┘
                                    │ 带认证的 /model-usage 前缀路由
┌───────────────────────────────────▼───────────────────────────────┐
│ Host 插件 dsh-model-usage                                          │
│  UsageService                                                      │
│   ├─ ProviderRegistry   ctx.llm.listProviders() / adapters-updated │
│   ├─ QuotaAdapters      deepseek-balance / deepseek-account / glm  │
│   ├─ QuotaCache         TTL + 单飞 + 退避 + stale 快照             │
│   ├─ UsageLedger        session/event → 今日/7天 按 provider/model  │
│   └─ Snapshot builder   稳定的 JSON 契约                           │
└──────────┬──────────────────────────────┬──────────────────────────┘
           │ HTTPS（固定域名）             │ 可选：DSH 账号服务
  api.deepseek.com/user/balance       ctx.deepseekAccount.getBalance()
  open.bigmodel.cn/api/monitor/...    api.z.ai/api/monitor/...
```

三个核心设计决策：

1. **Host + Client 标准插件，不用 typert 代码生成。**
   Client 与 Host 之间走 `ctx.connection.rpc.handle('/model-usage', handler)` + 浏览器侧 `ctx.connection.rpc.call('/model-usage', endpoint, payload)`。这是 DSH 的通用、带认证、与载体无关的 RPC 通道（Web HTTP 和桌面壳都能用），不需要生成 `remote` 声明，也不依赖 `dsh-api-remotes` 的静态装配。typert Remote 适合第一方包，第三方包用它会引入构建期代码生成，成本过高。

2. **Host 只访问固定白名单端点，绝不接受前端传来的 URL。**
   凭据只从 `ctx.credentials` 解析，只在 Host 内存中使用；RPC 返回值里只出现 `configured: true/false`，永不出现 key 值。这是从社区插件 `dsh-whale-widget` 的 S1 安全修复里得到的教训：任何「让用户填 URL、宿主带 key 去请求」的设计都是把 API Key 外带的口子。

3. **额度和本机用量分离展示，错误隔离。**
   一个供应商失败（超时/401/无接口）不能让整个面板变空；每个 provider 有独立的 `status/stale/error`，面板继续显示其他 provider 和上次成功值。

---

## 3. DSH 机制盘点（本方案依赖的公开能力）

### 3.1 插件形态

标准 bundle 包（参考 `dsh-agent-preset/skills/cordis-plugin-development/templates/decoration/`）：

```
package.json          # dsh.bundle.patch + dsh.client
cordis.patch.yml      # insert 一个 Host 行
lib/index.js          # Host 插件（Cordis apply）
lib/client.js         # 浏览器模块（window.__ModuleLoader__.load 格式）
```

- Host 行通过 `cordis.patch.yml` 插入，profile 的 `dsh.profile.bundles` 里登记包名。
- Client 半区由 `dsh.client` 声明，`platform: 'web'`，`exports["./client"]` 指向 `lib/client.js`；`dsh-client-modules` 会把它作为 `/plugins/...` 资源提供给浏览器。
- 本地开发用 `link:` 安装：`dsh plugin --profile web add link:/abs/path`（会在 profile 里登记 bundle）。Client 改动硬刷新即可，Host 改动需重启 `dsh web`。

### 3.2 供应商列表与凭据

- `ctx.llm.listProviders(): LlmProviderInfo[]` → 当前**已注册/已添加**的路由，注册顺序稳定；路由变更会发 `llm/adapters-updated` 事件。
- `ctx.llm.listConfigurableProviders()` → 可配置目录（包含未激活的），用来区分「已添加」和「只是可添加」。
- 当前部署里预期的路由 id：
  - `deepseek-official`（`dsh-llm-deepseek-api-key`，默认 `apiKeyEnv: DEEPSEEK_API_KEY`，默认 baseURL `https://api.deepseek.com/anthropic`）
  - `deepseek-account`（`dsh-llm-deepseek-account`，走 DSH 账号 grant）
  - `zai-coding-cn`（`dsh-llm-pi-ai`，baseURL `https://open.bigmodel.cn/api/coding/paas/v4`，默认 `ZAI_CODING_CN_API_KEY`）
- 凭据：`ctx.credentials.resolve(ref)` 只在 Host 内取值；`ctx.credentials.describe(ref)` 只返回 `{configured, source, writable}`，适合给 UI 做「已配置/未配置」标记。

### 3.3 数据源

**DeepSeek API Key 余额**（官方接口）：

```http
GET https://api.deepseek.com/user/balance
Authorization: Bearer <DEEPSEEK_API_KEY>
```

返回 `is_available` + `balance_infos[]`（`currency` / `total_balance` / `granted_balance` / `topped_up_balance`），见 <https://api-docs.deepseek.com/api/get-user-balance/>。

**DeepSeek 账号余额**：不要自己拼 HTTP。宿主服务 `ctx.deepseekAccount.getBalance({version, locale, timezoneOffsetSeconds})` 负责 token 注入、平台头、401 清理；返回 `{status:'ready', value:[充值钱包], bonusWallets:[赠金钱包]}` 或 `null`（未登录/无 grant）。这是可选服务，必须用 `ctx.get('deepseekAccount')` 拿，不能写进 `inject`，否则服务不存在时插件永远不启动。

**GLM Coding Plan 额度**（国内站，社区实测）：

```http
GET https://open.bigmodel.cn/api/monitor/usage/quota/limit
Authorization: <ZAI_CODING_CN_API_KEY>        # 注意：raw，不带 Bearer
Accept: application/json
```

返回 `data.limits[]` 扁平数组，每项形如 `{type: 'TOKENS_LIMIT'|'CREDIT_LIMIT'|'TIME_LIMIT', unit: 3|6, percentage, nextResetTime, ...}`：`unit=3` 是 5 小时滚动窗口，`unit=6` 是周窗口，`percentage` 是**已用百分比**，`nextResetTime` 是 epoch ms。**不能按数组下标取**，必须按 `type + unit` 选条目（不同账号顺序不同）。国际站同结构，主机为 `https://api.z.ai`。

参考实现与踩坑记录：

- <https://github.com/focksor/pi-glm-quota>（org/project/type 与 credit 制套餐的兼容说明）
- <https://github.com/steipete/CodexBar/blob/main/docs/zai.md>（z.ai 主机与字段）
- `dsh-whale-widget` 的 `zhipu_glm_coding` 模板（v789 按 `type+unit` 选条目，兼容 `CREDIT_LIMIT`）

兼容策略：先用 raw key 请求；401 时再试 `Bearer`；若返回业务错误「当前用户不存在 coding plan」或 `data.limits` 为空，则标记 `unsupported`，并允许用户在插件设置里补 `organization` / `project` / `planType (1|2)` 后重试。这样不会因为一次接口改版就整个功能不可用。

**本机用量**：订阅 `ctx.on('session/event', (session, event) => ...)`。`assistant/message` 事件里同时有：

```js
event.data.usage                  // { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, reasoningTokens, totalTokens }
event.data.message.source         // { provider, model }  ← 直接带路由 id 和模型 id
```

注意：`outputTokens` 已包含 `reasoningTokens`，不能重复累加（DSH token-meter 的约束）。

历史回填（P2 可选）：DSH 已有 `ctx.sessionQuery.listSessions()` / `readSession(id)`，可以在启用插件的后台低优先级扫描近 7 天会话日志，补出「安装插件之前」的用量；注意它读取的是持久化日志，别在启动时同步阻塞。实时增量仍由 `session/event` 完成。

成本估算（P3 可选）：pi-ai 的模型目录带每百万 token 单价（`cost.input/output/cacheRead/cacheWrite`），DeepSeek 模型也有公开价目。可以把小型价目表内置，按 provider/model 折算金额；但 DeepSeek 余额口径已经能反映真实扣费，成本估算只作为辅助，不要和余额混为一谈。

### 3.4 UI 扩展点

已确认可用的 slot：

| Slot | 位置 | 用途 |
|---|---|---|
| `sidebar.footer.action` | 左侧栏底部、设置按钮旁边（`list`，owner `{wide}`） | **常驻额度条**；折叠时只显示图标/圆点 |
| `settings.section` | 设置面板（`list`，owner `{close}`） | 详情页 + 偏好设置，**不依赖会话** |
| `settings.models.provider-card` | 设置 → 模型 → 每个供应商卡片内部（`keyed` by `settingsNs`，owner 带 `provider` / `configured` / `keyConfigured`） | v2：把「余额/5h/周」直接显示在每个供应商卡片上 |
| `conversation.session.header.utilities` | 会话头部工具区（`list`） | 可选：会话内紧凑 chip |

不建议用 `conversation.session.header.corner`（`single`，已被右侧栏展开按钮占用）；不建议在 composer 里加（已有上下文占用环，容易拥挤）。

样式只用主题 token，例如 `--dsw-alias-label-primary/secondary/tertiary`、`--dsw-alias-bg-layer-1/2`、`--dsw-alias-border-l1/l2`、`--dsw-alias-state-success/warn/error-primary`、`--dsw-radius-sm/md/lg`。不要 import `@deepseek-ai/dsh-client-ui-primitives`，避免把第三方插件绑死在某版组件库上。

### 3.5 传输与认证（实现说明）

> 实测修正：`connection.rpc.handle()` 在 web 组合下不可用——其内部读取 connection 插件 fiber 上的 `webServer` 服务（该插件 inject 只有 `credentials`），必然抛 `cannot get property "webServer" without inject`（Cordis 服务访问控制）。官方 dsh-api-gateway 注册 mux 路由时也是自己注入 `['connection','webServer']` 后用 `webServer.register` + `connection.admit`。

最终实现：插件自己注册 `/model-usage` 前缀路由，纯 JSON 协议：

```
POST /model-usage/<endpoint>        body: { endpoint, payload }
→ 200 { ok: true, value } | { ok: false, error: { code, message } }
未认证 → 401；伪造 Host/Origin → 403（connection.admit 统一围栏）
```

---

## 4. 数据契约

### 4.1 统一 ProviderUsage

```ts
type ProviderStatus = 'ok' | 'stale' | 'error' | 'unsupported' | 'needs-credential' | 'needs-signin'

interface ProviderUsage {
  route: string                  // 'deepseek-official' | 'deepseek-account' | 'zai-coding-cn'
  displayName: string
  adapter: 'deepseek-balance' | 'deepseek-account' | 'glm-coding' | 'local-only'
  status: ProviderStatus
  configured: boolean            // 路由是否真的配置可用
  credential: {
    refs: string[]               // 仅 ref 名
    configured: boolean
  }
  balance?: {
    currency: 'CNY' | 'USD'
    total: string                // 保留服务商精度
    granted?: string
    toppedUp?: string
    available?: boolean
  }
  plan?: string                  // 例如 GLM 套餐等级
  windows?: Array<{
    key: 'rolling' | 'weekly'
    label: string                // '5h' | '周'
    usedPct: number              // 0-100，已用
    resetAt: number | null       // epoch ms
  }>
  local: {
    sessionTokens?: number
    todayTokens: number
    weekTokens: number
    byModel?: Array<{ model: string; tokens: number }>
  }
  fetchedAt: number
  error?: { code: string; message: string }   // 已脱敏、已截断
}

interface Snapshot {
  generatedAt: number
  providers: ProviderUsage[]
  prefs: { refreshSeconds: number; footer: boolean }
}
```

### 4.2 RPC 端点

| endpoint | payload | 返回 |
|---|---|---|
| `snapshot` | `{ refresh?: boolean }` | `Snapshot` |
| `refresh` | `{ providers?: string[] }` | `Snapshot`（强制刷新指定/全部） |
| `config/get` | `{}` | 公开配置 |
| `config/set` | `{ patch }` | 更新后的公开配置 |
| `probe` | `{ provider }` | 单 provider 的诊断信息（状态码、业务 code、响应字段名，不含 key） |

错误码统一为 `model-usage/<reason>`（如 `model-usage/unauthorized`、`model-usage/upstream-timeout`），前端按 code 分支，不解析 message。

---

## 5. 刷新与缓存策略

- **TTL**：每个 adapter 60s（可配置 30/60/120/300）。`snapshot` 命中 TTL 直接返回缓存。
- **单飞**：同一个 provider 同时只允许一个 in-flight 请求；多个窗口/多个组件同时请求时合并成一个。
- **退避**：429 / 5xx / 超时后 60s→120s→300s 指数退避；成功一次后重置。尊重 `Retry-After`。
- **事件触发**：Host 收到 `assistant/message` 且其 provider 属于额度 adapter 时，标记该 provider dirty；`turn/end` 后 5s 内如果该 provider 距上次成功请求 > 15s，安排一次刷新（防抖）。
- **前端轮询**：侧边栏额度条组件在可见时每 `refreshSeconds` 调一次 `snapshot`；`document.visibilityState === 'hidden'` 时暂停，回前台立即刷新一次。
- **stale 显示**：失败时保留上次成功值，`status: 'stale'`，UI 显示「12 分钟前 · 刷新失败」，不把数字清空。
- **手动刷新**：详情页/额度条提供刷新按钮，调 `refresh`。

---

## 6. UI 设计

### 6.1 侧边栏底部额度条（主入口，常驻）

展开（`wide=true`）：

```
┌──────────────────────────────┐
│ ◔ 模型额度        GLM 38%  › │
│   ¥12.40 · 5h 38% · 周 62%   │
└──────────────────────────────┘
```

折叠（`wide=false`）：只显示一个状态圆点 + 图标，颜色取所有窗口中最大已用百分比：

- `< 50%` 绿（`--dsw-alias-state-success-primary`）
- `50–79%` 黄（`--dsw-alias-state-warn-primary`）
- `≥ 80%` 红（`--dsw-alias-state-error-primary`）

点击打开详情面板（`createPortal` 到 body 的居中 Modal，或就地向上展开；宽约 520px）。没有数据/全部未配置时整条不渲染，避免占地。

### 6.2 详情面板

按 provider 分组，每组一张卡：

```
DeepSeek API Key                       已配置 · 12s 前 ↻
  总余额 ¥12.40   充值 ¥10.00   赠金 ¥2.40
  is_available: true

GLM Coding Plan（zai-coding-cn）        已配置 · 30s 前 ↻
  套餐：GLM Coding Pro
  5h  ██████░░░░░░  38%     2h18m 后重置
  周  ██████████░░  62%     3d4h 后重置

DeepSeek 账号                          未登录
  登录 DSH 账号后可显示账号余额

本机用量（按会话日志统计）
  今日  1.24M tokens    近 7 天  8.7M tokens
  按供应商：DeepSeek 0.9M · GLM 0.34M
```

交互：刷新全部、自动刷新间隔、显示/隐藏底部条、每个 provider 的「测试连接」和高级配置（GLM org/project/type、凭据 ref 覆盖）。

### 6.3 设置页（`settings.section`）

- 标题：`模型用量` / `Model usage`
- 同一套详情组件 + 偏好区（刷新间隔、显示位置、低额度提醒阈值）
- 诊断区：每个 provider 的 endpoint host、HTTP 状态、业务 code、最后成功时间、原始字段名（不含值），方便接口改版时自救

### 6.4 Composer 供应商 chip（推荐默认开启）

位置：`conversation.input.right`（list，session scope）——composer 底栏右侧控制区，渲染顺序在 `conversation.input.model`（模型选择器）**左侧同一行**（源码已确认：`standardControls` 内先渲染 `input.right` 再渲染 `input.model`；该 seat 当前零占用，契约注释即「模型选择器之前的紧凑控件」）。

形态：24px 圆形供应商 Logo（插件内置 SVG，无网络请求），外圈 2px 状态色环（绿/黄/红，取该 provider 所有窗口/余额的最大已用程度）。

交互：**hover 弹出 300px 弹层**（向上、带箭头锚定 chip），内容：provider 名 + 刷新时间、GLM 5h/周进度条与重置倒计时（或 DeepSeek 余额三项）、底部「查看全部供应商额度 →」点击打开详情 Modal；移开/Esc 关闭。点击 Logo 本体也打开详情 Modal。

数据：Host 监听 `session/event` 的 `request/context` 维护 `sessionProviders[sessionId]`，新增 RPC endpoint `session-provider`（payload 带 sessionId）返回当前 provider；无记录时回退默认模型 provider（读 `agent-default-model` 配置，可选服务）或显示通用图标。

### 6.5 v2：供应商卡片角标（`settings.models.provider-card`）

在「设置 → 模型」每个已添加供应商卡片里加一行：

```
余额 ¥12.40 · 5h 38% · 周 62%
```

这个 slot 的 owner props 已经带 `provider` / `configured` / `keyConfigured`，`key` 用 `settingsNs`。需要为 `llm-deepseek`、`llm-deepseek-account`、`llm-pi-ai` 各注册一次（或只注册需要的 namespace）。

---

## 7. 插件包结构

```
dsh-model-usage/
├── package.json
├── cordis.patch.yml
├── icon.png                 # 可选，插件列表图标（正方形 PNG）
├── README.md
├── lib/
│   ├── index.js             # Host：apply、RPC、service 装配
│   ├── service.js           # UsageService：provider 列表、缓存、快照
│   ├── adapters/
│   │   ├── deepseek-balance.js
│   │   ├── deepseek-account.js
│   │   └── glm-coding.js
│   ├── ledger.js            # session/event → 今日/7天聚合 + 持久化
│   ├── credentials.js       # ref 解析、describe、deriveKeyRef
│   ├── prefs.js             # 插件配置读写（$DSH_HOME/model-usage/config.json）
│   └── util.js              # fetchJson 超时、clamp、脱敏、日期
└── client/
    └── client.js            # 手写 ModuleLoader bundle（React 来自平台）
```

**零运行时依赖**是刻意设计：

- Host 只用 `node:` 内置模块和 `ctx` 服务，不 `import '@deepseek-ai/dsh-*'`，避免 profile 安装的包解析不到 peer 依赖。
- Client 只 `require('react')`（平台模块表已提供），不 import 任何 DSH 客户端包。
- 这样 DSH 升级时最坏情况是 API 名字变了，而不是包解析失败。

### 7.1 package.json

```json
{
  "name": "dsh-model-usage",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "实时显示已添加模型供应商的额度与用量",
  "exports": { ".": "./lib/index.js", "./client": "./lib/client.js" },
  "engines": { "dsh": ">=0.2.0-rc.2 <0.3.0" },
  "dsh": {
    "manifestVersion": 1,
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "inject": [
        "@deepseek-ai/dsh-client-connection",
        "@deepseek-ai/dsh-client-ui-sidebar",
        "@deepseek-ai/dsh-client-ui-settings",
        "@deepseek-ai/dsh-client-locale"
      ]
    }
  }
}
```

`dsh.client.inject` 是启动图依赖（不是 Cordis injection），只用于保证用到的 slot 声明方先加载。

### 7.2 cordis.patch.yml

```yaml
- insert:
    - id: model-usage
      name: dsh-model-usage
      config:
        refreshSeconds: 60
        footer: true
        composerChip: true      # composer 模型选择器左侧供应商 Logo chip（hover 弹层）
        headerChip: false
```

### 7.3 Host 骨架

```js
// lib/index.js（示意，非完整实现）
export const name = 'model-usage'

export function apply(ctx, config) {
  const service = createUsageService(ctx, config)

  // 1) 本机用量账本：所有会话的追加事件
  ctx.on('session/event', (session, event) => service.onSessionEvent(session, event))
  ctx.on('session/disposed', (session) => service.dropSession(session?.id))
  ctx.effect(() => service.loadLedger(), 'model-usage: ledger')

  // 2) 额度面只在 llm/credentials 存在时启用（可选服务，缺了不影响本机用量）
  ctx.inject(['llm', 'credentials'], (scope) => {
    scope.effect(() => service.startQuota(), 'model-usage: quota')
    scope.on('llm/adapters-updated', () => service.invalidateProviderList())
  })

  // 3) 前端 RPC 通道
  ctx.inject(['connection'], (scope) => {
    scope.effect(
      () => scope.connection.rpc.handle('/model-usage', service.handleRpc),
      'model-usage: rpc',
    )
  })
}
```

`handleRpc` 必须是纯 JSON 输入输出，并把所有异常收敛成 `{ ok:false, error:{ code, message, details } }`。

### 7.4 适配器接口

```js
/**
 * @typedef {object} Adapter
 * @property {string} id
 * @property {(route: string) => boolean} matches
 * @property {(env: AdapterEnv) => Promise<Partial<ProviderUsage>>} read
 */
```

`read()` 内部：

1. 解析凭据 ref（先按路由默认表，再 `deriveKeyRef(route)`，最后插件配置覆盖）。
2. 固定 URL + `fetchJson(url, { headers }, 8000, signal)`，超时/状态码转成稳定 code。
3. 归一化成 `ProviderUsage` 的 `balance` / `windows` / `plan`。
4. 捕获并脱敏异常 message（截断 160 字符，去掉任何 `Bearer`/`sk-` 形态的内容）。

GLM 归一化关键点：

```js
const limits = Array.isArray(data?.data?.limits) ? data.data.limits : []
const pick = (unit) => limits.find(
  (l) => (l.type === 'TOKENS_LIMIT' || l.type === 'CREDIT_LIMIT') && Number(l.unit) === unit,
)
const windows = [
  { key: 'rolling', label: '5h', unit: 3 },
  { key: 'weekly',  label: '周', unit: 6 },
].map(({ key, label, unit }) => {
  const item = pick(unit)
  return item && {
    key, label,
    usedPct: Math.max(0, Math.min(100, Number(item.percentage) || 0)),
    resetAt: Number(item.nextResetTime) || null,
  }
}).filter(Boolean)
```

### 7.5 Client 骨架

```js
// lib/client.js
window.__ModuleLoader__.load({
  id: 'dsh-model-usage',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useRef } = React

    const NS = 'model-usage'
    const zh = { nav: '模型用量', footer: '模型额度', refresh: '刷新', ... }
    const en = { nav: 'Model usage', footer: 'Model quota', refresh: 'Refresh', ... }

    function createApi(ctx) {
      const call = (endpoint, payload) =>
        ctx.connection.rpc.call('/model-usage', endpoint, payload)
      return {
        async snapshot(opts) {
          const r = await call('snapshot', opts || {})
          if (!r.ok) throw new Error(r.error.message)
          return r.value
        },
        async refresh() {
          const r = await call('refresh', {})
          if (!r.ok) throw new Error(r.error.message)
          return r.value
        },
      }
    }

    function Footer(props) {
      const { t, api, wide } = props
      const [snap, setSnap] = useState(null)
      const [open, setOpen] = useState(false)
      // useEffect：可见时轮询、visibilitychange 刷新
      // 渲染：wide ? 两行摘要 : 状态圆点；onClick 打开详情 Modal
    }

    return {
      inject: ['slots', 'connection', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'model-usage: locale')
        const api = createApi(ctx)

        ctx.slots.inject('sidebar.footer.action', () =>
          ctx.slots.register({
            name: 'sidebar.footer.action',
            id: 'model-usage',
            order: -1,
            locale: NS,
            inject: () => ({ api }),
          }, Footer),
        )

        ctx.slots.inject('settings.section', () =>
          ctx.slots.register({
            name: 'settings.section',
            id: 'model-usage',
            order: 20,
            label: () => ctx.locale.bind(NS)('nav'),
            locale: NS,
            inject: () => ({ api }),
          }, UsageSettingsSection),
        )
      },
    }
  },
})
```

注意：

- Client 文件是**手写的 CJS 风格 bundle**，没有 ESM import，`factory` 只注册工厂；样式在 `apply` 里用 `<style>` + `ctx.effect` 注入并在卸载时删除。
- 若以后要写 TSX，加一个很小的 esbuild 脚本把输出包成 `window.__ModuleLoader__.load({ id, factory })`，external 只保留 `react` / `react/jsx-runtime` / `react-dom`；不要引入 DSH 的客户端包。
- 所有可见文案走 `ctx.locale.register` 的 namespace；`t` 由 slot 的 `locale` 选项注入。

---

## 8. 安全与隐私

1. **Key 只在 Host 内存中**：不接受前端传 URL/headers/凭据值；adapter 里的目标域名写死。
2. **RPC 返回值白名单**：`snapshot` 里不允许出现 `key`、`Authorization`、完整异常堆栈；错误 message 统一截断 + 脱敏。
3. **认证复用 DSH**：`/model-usage` 走 Connection 的 Host/Origin 栅栏 + 浏览器 Cookie；不自己实现 token 校验。
4. **配置落盘**：`$DSH_HOME/model-usage/config.json`，只存 ref 名和 GLM org/project/type（非密钥）；文件权限 600。
5. **账号余额只走 DSH 服务**：不接触账号 grant / platform token。
6. **模型无感**：插件不注册工具、不写 system prompt、不追加会话事件，KV Cache 不受影响。
7. **如果未来做「自定义额度模板」**：必须把目标 URL 限定在厂商模板白名单，或要求用户在本机勾选「允许把凭据发送到自定义地址」，并只接受回环来源的写请求（参考 whale widget 0.3.15 的修复）。

---

## 9. 分阶段实施计划

| 阶段 | 内容 | 验收标准 | 预估 |
|---|---|---|---|
| **P0 探针** | Host：列 provider、解析凭据、真实请求 DeepSeek balance + GLM quota；注册 `/model-usage` RPC 返回原始归一化数据；Client：只做设置页里一段纯文本 | 在本机能同时看到 DeepSeek ¥余额和 GLM 5h/周百分比；GLM 若失败能看到具体业务 code | 0.5–1 天 |
| **P1 MVP** | 三个 adapter + 缓存/退避 + 全部错误状态；侧边栏额度条 + 详情 Modal；手动/自动刷新 | 刷新 ≤60s；单 provider 失败不影响其他；无 key 值出现在响应/日志 | 1–2 天 |
| **P2 用量层** | 本机 ledger（今日/7天、按 provider/model）；turn/end 触发刷新；设置页偏好；i18n | 今日统计与逐轮 usage 总量一致（不含历史回填）；刷新后数字更新 | 1–2 天 |
| **P3 扩展** | `settings.models.provider-card` 角标；更多 adapter（OpenRouter/Kimi/MiniMax/OpenCode Go）；自定义模板（带安全边界）；历史回填 | 新增 provider 只加一个 adapter 文件 | 1–2 天 |

建议先做 P0 + P1：这两步就能回答「GLM 这个套餐到底能不能用 API 查到额度」这个最关键的未知数。

---

## 10. 风险与待验证清单

| 风险 | 影响 | 缓解 |
|---|---|---|
| GLM 接口按套餐类型/账号变化（org/project/type、CREDIT_LIMIT） | 拿不到额度 | 按 `type+unit` 容错解析；保留 org/project/type 高级配置；失败时显示业务 code 和「测试连接」诊断 |
| GLM 接口对个人/团队套餐要求不同 | 部分用户不可用 | 先按社区实测的 raw key 路径；失败 fallback Bearer；再不行让用户从浏览器 DevTools 抄 org/project |
| DeepSeek API Key 指向自定义网关 | `/user/balance` 无效 | 检查 baseURL host 是否为 `api.deepseek.com`；不是则标记 `unsupported`，只显示本机用量 |
| `deepseekAccount` 服务签名/行为变化 | 账号余额块失败 | `ctx.get()` 可选获取 + try/catch，失败只影响该 provider |
| DSH 插件/slot/Connection API 版本漂移 | 插件装不上或 UI 不渲染 | 零运行时依赖；`engines.dsh` 声明范围；P0 先验证本版本；升级后跑一次 smoke |
| 浏览器模块格式变化 | Client 半区加载失败 | 手写 bundle 很小，改 `window.__ModuleLoader__.load` 包装即可；保留降级为「Host 路由 + 原生脚本」的方案 |
| 轮询触发服务商限流/风控 | 额度查询失败 | TTL ≥60s、单飞、指数退避、只在 UI 可见时轮询 |
| 多实例/多窗口同时请求 | 重复请求 | Host 单飞 + 缓存；多窗口共享同一个 Host 快照 |
| 本机用量与官网口径不一致 | 用户困惑 | 明确标注「本机统计，不含其他设备/其他客户端」；DeepSeek 以余额为准 |

待验证（P0 要跑通的三件事）：

1. `ctx.llm.listProviders()` 在本 profile 是否同时返回 `deepseek-official`、`deepseek-account`、`zai-coding-cn`，以及各自的 `displayName`。
2. 用 `ZAI_CODING_CN_API_KEY` 请求 GLM 额度接口，返回的是 `TOKENS_LIMIT` 还是 `CREDIT_LIMIT`，`data.level` 是什么，是否需要 org/project。
3. `ctx.deepseekAccount.getBalance()` 在当前账号下是否返回 ready（未登录则应返回 null，UI 显示「未登录」而不是错误）。

---

## 11. 备选方案对比

| 方案 | 做法 | 优点 | 缺点 | 结论 |
|---|---|---|---|---|
| **A. Host + Client 标准插件（推荐）** | `rpc.handle` + slot | 原生 UI、认证复用、可维护、桌面兼容 | 需要手写 client bundle；Host 改动要重启 | ✅ 采用 |
| B. 纯 Host + 注入脚本（whale widget 风格） | `webServer.register` + `tapIndex` 插 `<script>` | 不需要 ModuleLoader 格式；脚本热改 | 绕开原生 slot/主题/国际化；样式和层级要自己维护 | 仅作 Client 方案失败时的降级 |
| C. 纯 Client 插件直连服务商 | 浏览器 fetch 余额接口 | 不用 Host | CORS 不通；拿不到凭据；不可行 | ❌ |
| D. typert Remote 命名空间 | 生成 remote 声明 | 类型安全、第一方推荐 | 需要构建期代码生成 + 静态装配；第三方包成本高 | ❌（若将来并入第一方再考虑） |
| E. 只用 token-meter | 读 `contextPressure` / `tokenUsage` | 现成 | 没有服务商额度；不跨会话；只能估算 | ❌ 作为补充而非主体 |

---

## 12. 验收清单（P1）

- [ ] 设置 → 模型用量 能看到当前所有已添加 provider，未配置的显示「未配置」而不是空白。
- [ ] DeepSeek 显示总余额/充值余额/赠金余额（CNY），`is_available=false` 时有明确提示。
- [ ] GLM 显示 5h / 周两个窗口的已用百分比、重置倒计时、套餐等级。
- [ ] 侧边栏底部额度条常驻，折叠侧栏时显示状态圆点；颜色按最大已用百分比分档。
- [ ] 刷新间隔 60s；手动刷新立即生效；后台标签页暂停轮询。
- [ ] 单个 provider 超时/401/业务错误时其他 provider 正常，面板显示 stale + 最后成功时间。
- [ ] 浏览器 DevTools 的 `/model-usage/snapshot` 响应里没有任何 key/token/Authorization 字段。
- [ ] 禁用插件后：额度条消失，`POST /model-usage/snapshot` 返回 404/401，无残留定时器。
- [ ] 插件不产生工具、不写会话事件、不改变模型请求前缀（KV Cache 无影响）。

---

## 附录：相关文件与命令

```bash
# 当前 profile 组合
dsh --profile web --dump-config | grep -A6 "llm-pi-ai"

# 安装本地插件（宿主需重启；client 改动硬刷新）
dsh plugin --profile web add link:/Users/pony/deepseek/plugins/dsh-model-usage

# 卸载
dsh plugin --profile web remove dsh-model-usage
```

本机关键路径：

- provider 配置：`~/.dsh/profiles/web/cordis.patch.yml`
- 凭据（只看 ref 名，不要打印值）：`~/.dsh/.credentials.yaml`
- 会话日志：`~/.dsh/sessions/<workspace>/<session>/session.v4.jsonl.zstd`
- DSH 安装包（读 API 文档/类型）：`~/.local/share/node/node-v24.22.0-darwin-arm64/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/`

外部参考：

- DeepSeek 余额接口：<https://api-docs.deepseek.com/api/get-user-balance/>
- GLM Coding Plan 额度（社区实现）：<https://github.com/focksor/pi-glm-quota>
- z.ai 额度接口说明：<https://github.com/steipete/CodexBar/blob/main/docs/zai.md>
- DSH 额度挂件先例（架构与安全边界可参考）：<https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget>

---

## 13. 展示设计 v2 —— 按额度类型分化的卡片体系

> mockup：`docs/mockups/11-archetypes-light.png`（四种原型）、`12-modal-v2-light.png`（详情弹窗）、`13-archetypes-dark.png`（暗色）；源文件 `gen3.mjs`。
> 参考：Claude Code `/usage` 的窗口条 + 重置倒计时、CodexBar 的紧凑百分比、Vercel/Linear 的大数字卡片层级、Raycast 的仪表隐喻。

### 13.1 核心抽象：额度四原型

所有供应商的额度归入四种渲染原型，卡片组件按 `kind` 分发，新增供应商 = 选原型 + 填字段：

| 原型 | kind | 主视觉 | 次级信息 | 适用 |
|---|---|---|---|---|
| A · API 余额 | `balance` | **大数字金额**（¥12.40，30px/700/tabular-nums） | 可用 ✓ 徽标；充值/赠金拆分 caption；趋势 chips（今日 −¥1.24 · 近7天 −¥8.31）；**可用天数估算** chip（warn 色） | DeepSeek Key、OpenRouter、Moonshot、阶跃等按量计费 |
| B · 订阅窗口 | `subscription` | **窗口进度条 ×N**（5h/周/月，10px 高圆角，色带绿→黄→红）+ 每条独立重置倒计时 | 套餐档位 pill（Pro/Max）；≥50% 加「已用偏高」、≥80% 加红字警示 + 卡片顶部 2px 警示描边；脚注说明超限策略归服务商 | GLM Coding、Kimi Coding、MiniMax Coding、OpenCode Go、Claude/Codex 订阅 |
| C · 账号钱包 | `wallet` | **大数字总余额** + **单条堆叠构成条**（充值=accent、赠金=violet，两段宽度=占比）+ 图例 | 登录态；赠金单独可见（新账号常只有赠金） | DeepSeek 账号登录态 |
| D · 本机统计 | `local` | **今日 tokens 大数字** + 7 日 sparkline（7 根 mini 柱）+ 供应商占比条 | ≈金额估算（按内置价目）；「仅统计本机会话」徽标（诚实口径） | 无公开额度接口的供应商、以及全供应商总览 |

设计原则：

1. **一种原型一种主视觉**——金额类看数字，套餐类看进度，本机类看趋势。绝不把百分比和金额塞进同一根进度条。
2. **重置倒计时是订阅卡的灵魂**（Claude Code 生态验证过的最强需求）：`⏳ 2h18m 后重置`，<1h 转 warn 色，条目按窗口独立倒计时。
3. **大数字用 tabular-nums + 负字距**；辅助信息 11px 降级到 text2/text3；卡片只允许一个视觉重心。
4. **诚实标注**：本机统计必须带「仅统计本机会话」徽标；服务商数据标注相对刷新时间；stale 时刷新时间变黄 + 保留旧值不清零。

### 13.2 阈值与状态语言（全局统一）

| 状态 | 视觉 |
|---|---|
| 健康（<50% / 余额充足） | 绿 `--dsw-alias-state-success-primary` |
| 偏高（50–79%） | 黄 + 订阅卡加「已用偏高」角标 |
| 紧急（≥80% / 余额低于阈值） | 红 + **订阅卡顶部 2px 红描边** + 摘要条圆点红 |
| 预计耗尽（P3，余额/近期日均） | API 卡「约可用 N 天」chip，N<3 转 warn |
| stale | 保留旧值，右上角「X 前获取 ⚠」黄字，可手动刷新 |
| 错误/未配置/未登录 | 卡片内联警示行（红/黄/灰三级），CTA：去设置-模型配置 |

### 13.3 信息排序规则

**详情弹窗/设置页分组顺序**：`当前会话在用`（pinned，带高亮描边）→ `订阅窗口` → `API 余额` → `账号钱包` → `本机统计`。组内按紧急度（max usedPct / 低余额）降序。

**摘要条（侧边栏底部）取数规则**：最多展示两个指标——
1. 最紧急窗口（全部 provider 所有窗口中 usedPct 最大者，≥50% 才上榜）；
2. API 余额总额（多币种取 CNY 优先）。
格式：`GLM 周 62% · ¥12.40`；圆点颜色 = 全局最紧急状态。全部健康且无窗口 → 只显示金额；什么都没有 → 整条隐藏。

**composer chip hover 弹层**：只显示当前会话 provider 的卡片（原型渲染），底部「查看全部」。

### 13.4 供应商 → 原型映射

| 供应商路由 | 原型 | 数据源 |
|---|---|---|
| `deepseek-official` | A | `/user/balance` |
| `deepseek-account` | C | `deepseekAccount.getBalance` |
| `zai-coding-cn` / `zai` | B | `monitor/usage/quota/limit`（5h+周） |
| `moonshot-cn` / `moonshot` | A | 余额接口 |
| `kimi-coding` | B | `coding/v1/usages`（remaining/limit → 已用%） |
| `minimax-coding(-intl)` | B | `coding_plan/remains`（区间+周） |
| `opencode-go` | B（3 窗口） | `zen/go/v1/usage` |
| `openrouter` | A | `/api/v1/credits` |
| 其余（OpenAI/Anthropic/Ollama…） | D | 会话日志本地统计 |

### 13.5 实现差距（当前 v1 → 目标）

已实现：A 的余额数字与拆分、B 的双窗口条+倒计时+套餐、状态色、stale、错误行。
待补：B 的≥80% 顶部描边与警示角标（纯 CSS，小）；A 的趋势 chips + 可用天数（依赖 P2 余额观测账本）；C 的堆叠构成条（数据已有 wallets，纯渲染）；D 整卡（依赖 P2 本地 ledger）；分组排序与 pinned（客户端排序逻辑）；阈值跨域 toast（P2）。

---

## 14. 「用量统计」面板规划（设置 → 模型用量 v2）

> 参考图2-5（ccusage / OpenRouter activity / Helicone / LiteLLM 的行业共识），以及 models.dev 定价目录同步。

### 14.1 数据源双轨

| 轨道 | 数据 | 状态 |
|---|---|---|
| 服务商真相 | 额度接口：余额 / 窗口剩余% / 重置时间 | ✅ 已实现 |
| 本机事实 | 请求账本：从 `session/event` 提取每次 attempt | P2 |

请求账本单条记录（session/event 已含全部字段）：

```ts
{ ts, sessionId, provider, model,
  input, cacheRead, cacheWrite, output,  // reasoning 已含在 output
  cost?,            // 定价表换算
  durationMs, ttftMs,                    // TTFT 从 assistant stream 首包时间取
  status: 'ok' | 'error' }
```

存储：每日聚合（provider×model×日，JSON 原子写）+ 近 7~30 天逐请求尾部（P3，可挂 session-query-sqlite）。

### 14.2 统计口径（行业标准）

- **KPI**：总成本 · 总请求数 · 真实消耗 Tokens（uncached input + output）· 缓存命中率（cacheRead/(input+cacheRead)）；更多：平均 TTFT、tok/s、成功率、每会话成本
- **趋势**：当天按小时 / 7d·30d 按天；序列切换 Tokens / 请求 / 成本
- **聚合表**：按供应商 / 按模型（请求数、Tokens、成本、成功率、速度、首字）
- **定价**：models.dev 目录同步（图5 即该源）+ 手动覆盖，USD/每百万 Tokens；成本 = Σ tokens×单价，缓存读按折扣价

### 14.3 订阅信息显示规范（图1）

- 每窗口一条：**名称**（5 小时限额 / 每周限额）+ 右对齐**剩余 N%** + **重置倒计时**（X 天 X 小时后重置）+ 细条（填充=剩余量，健康=墨色、>50% 黄、>80% 红）
- 卡片级：套餐档位 pill；脚注「超限策略以服务商为准」
- 订阅卡**不显示金额**；与 API 余额卡严格分离（两种心智）
- ✅ 本轮已实现

### 14.4 位置

- **设置 → 模型用量**：顶部 Tab：`总览(KPI+趋势) / 额度 / 供应商 / 模型 / 请求日志 / 定价`
- 侧边栏 + composer chip：保持轻量（当前供应商一行 + 弹层），点开进完整面板

### 14.5 分期

| 期 | 内容 |
|---|---|
| P2a | 请求账本 + KPI + 趋势 + 供应商/模型聚合表 |
| P2b | 定价表（内置常用 + models.dev 同步开关） |
| P3 | 逐条请求日志 + CSV 导出 |

---

## 15. 统计口径审计（2026-10-19）

### 15.1 逐 token 对账（已验证）

对独立复算（直接解压会话日志，按事件 `time` ≥ 宿主重启时刻过滤，求和 `assistant/message.usage`）与账本记录比对：

| 指标 | 独立复算 | 账本 | 结论 |
|---|---|---|---|
| 调用数 | 3 | 3 | ✅ 一致 |
| 未缓存输入 | 651,681 | 651,681 | ✅ 一致 |
| 缓存读 | 1,306,240 | 1,306,240 | ✅ 一致 |
| 输出 | 3,141 | 3,141 | ✅ 一致 |

结论：**Tokens / 调用数 / 缓存命中率是精确值**（直接来自服务商回传 usage，不经过估算）。

### 15.2 指标口径与可信度

| 指标 | 定义 | 可信度 | 展示策略 |
|---|---|---|---|
| 消耗 Tokens | input + cacheRead + cacheWrite + output（reasoning 已含 output） | 精确 | 常驻 |
| 模型调用 | `assistant/message` 事件数（成功产生回复的调用） | 精确（不含失败重试 attempt） | 常驻，标签「模型调用」 |
| 缓存命中率 | cacheRead / (cacheRead + input) | 精确（adapter 未上报的少数事件按未命中计） | 常驻 |
| 成本 | Σ tokens × 价目表（CNY/百万） | **估算** | 标签「成本估算」；有未定价项显示 `≈`；无定价/订阅套餐显示 `—` |
| 速度 / 首字 / 成功率 | 需要 assistant stream 时序 | 暂未实现 | **不展示**（没有的不要） |
| 逐条请求日志 | 需保留逐请求尾部 | P3 | 不展示 |

### 15.3 已知边界（诚实声明）

- 只统计**写入会话日志的模型调用**：标题生成、压缩摘要等旁路调用不在其中；
- 只统计**本机、安装插件之后**的调用（历史回填在 P3）；
- 成本是估算：DeepSeek 真实花费以余额变动为准；GLM 订阅套餐无边际成本，显示 `—`；
- 其他设备/终端（Codex、Claude Code 等）不计入。

### 15.4 修订：移除金额估算（2026-10-19 晚）

订阅套餐（GLM Coding Plan 等）按套餐额度计费，不是按 API 逐次扣费，任何「成本估算」都会与真实付费方式不符、反而误导。因此：

- 移除账本的成本计算与 `pricing` 配置；
- KPI 移除「成本估算」，仅保留 模型调用 / 消耗 Tokens / 缓存命中率（全部为服务商回传的真实 usage，已逐 token 对账）；
- 供应商/模型表移除成本列；
- 金额相关只保留服务商接口返回的真实数据（DeepSeek 余额、GLM 套餐剩余额度）；
- 原 P2b（内置价目 + models.dev 定价同步）取消。

### 15.5 P2b 一致性打磨（2026-10-19 已完成）

- 主 Tab 换官方 `SegmentedTabs`（键盘 Left/Right/Home/End + aria tablist/tabpanel）
- 底部卡片/按钮恢复 `:focus-visible` 焦点环（token）
- i18n 全量收口：数字单位（zh 万/亿、en K/M）、「剩」词序（prefix/suffix）、账号短名、重试/空态/失败文案
- 空态与错误态：统计加载失败 → 错误提示 + 重试按钮；趋势全 0 → 空态文案；表格空 → 「暂无数据」
- 动效适配 `prefers-reduced-motion`
- 删除死配置 `dock` / `headerChip`（host/yml/README）
- 赠金紫走 `--dmu-violet` 变量；Tokens 口径补充「含缓存读」

### 15.6 P3 统计深化（2026-10-19 已完成）

- **逐条请求日志**：从 `assistant/message.stream[].time` 与 `step/start` 计算「耗时 / 首字(TTFT)」，保留最近 300 条；新增「请求日志」Tab（时间/模型/输入/输出/缓存读/耗时/首字）
- **范围切换**：当天 / 近 7 天 / 近 30 天（账本保留 120 天）
- **CSV 导出**：KPI + 每日 + 供应商/模型 + 请求日志，带 BOM 兼容 Excel
- **历史回填**：首次启动扫描本机 `sessions/**/*.jsonl.zstd`（近 30 天）重算账本，回填期间实时记录入队避免重复；实测 ~3 天日志 73ms 完成
- **不做成功率**：`assistant/attempt` 事件不含 provider/model，无法按供应商归属，按「没有的不要」原则不展示
- 时序基准改用 `step/start`（`request/context` 只在路由变化时记录，不能当每次调用的起点）

### 15.7 P4 真实消耗观测（2026-10-19 已完成）

单项测试（离线账本）验证：

- 余额观测：30.00 → 28.76 → 支出 1.24；28.76 → 33.76 → 充值 +5.00（分开记，不冲抵）✓
- 窗口观测：rolling 10% → 13.2% → 额度消耗 3.2%；重置（resetAt 变化）后不误计 ✓
- `today.spendToday` 持久化到 ledger.json 的 `obs` 段 ✓

UI：「今日实际消耗（观测）」小节，DeepSeek 显示 `−¥1.24 / 支出`，GLM 显示 `5 小时限额 −3.2% · 每周限额 −1.8%`，并标注「实测值，非估算」。
注意：首次观测只建立基线，第二次刷新后才产生差额。

### 15.8 P5 面板增强 + 供应商扩展（2026-10-19 已完成）

面板：
- 供应商筛选下拉（官方 Menu，对齐参考截图「全部应用 ▾」），KPI、趋势、聚合表全部跟随筛选
- 趋势指标切换（Tokens / 请求数）
- 设置 → 模型页底部 `settings.models.footer` 注册「供应商额度」区块（DSH 官方扩展位；per-card 角标需 settingsNs 映射，按需再做）

供应商：
- OpenRouter：`GET https://openrouter.ai/api/v1/credits` → `data.{total_credits,total_usage}`；兜底 `/api/v1/key`
- Kimi Coding Plan：`GET https://api.kimi.com/coding/v1/usages`（schema 从社区代码中已对线上验证的实现移植：
  `usage` 为周窗口、`limits[].detail` 为滚动窗口、`user.membership.level` 为套餐）
- 通用 `customQuota`：URL + JSON dot-path 映射（balance 或 windows），覆盖任意供应商
- MiniMax / OpenCode Go：未找到可信公开接口文档，暂用 customQuota 配置接入，不写死 URL

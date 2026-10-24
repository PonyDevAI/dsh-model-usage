# 供应商覆盖矩阵

DSH（`@deepseek-ai/dsh` 0.2.0-rc.2）的 pi-ai provider 目录共 43 个 provider。本插件按「**有真实额度接口才显示，没有就隐藏**」的原则覆盖。

图例：
- ✅ **真实额度**：调用服务商官方接口，显示余额或窗口剩余
- 🟡 **订阅/接口待确认**：接口存在但需要特定 Key 类型，失败时优雅隐藏
- ⬜ **无公开接口**：服务商未提供可用 API Key 查询的余额接口 → 不显示卡片（不会报错）
- 🔧 **customQuota**：可用配置接入（URL + JSON 路径映射）

## 已支持（真实额度）

| Provider id | 数据接口 | 凭据引用 | 展示 |
|---|---|---|---|
| `deepseek-official` / `deepseek` | `api.deepseek.com/user/balance` | `DEEPSEEK_API_KEY` | 余额（总/充值/赠金） |
| `deepseek-account` | DSH `deepseekAccount` 服务 | 登录态 | 账号钱包 |
| `zai` / `zai-coding-cn` | `open.bigmodel.cn` / `api.z.ai` 额度接口 | `ZAI_CODING_CN_API_KEY` / `ZAI_API_KEY` | 5 小时 / 每周 / **每月 MCP 工具次数** |
| `openrouter` | `openrouter.ai/api/v1/credits`（兜底 `/api/v1/key`） | `OPENROUTER_API_KEY` | credits 余额 |
| `kimi-coding` / `kimi-coding-cn` | `api.kimi.com/coding/v1/usages` | `KIMI_CODING_API_KEY` / `KIMI_API_KEY` | 周 + 滚动窗口 |
| `moonshotai` / `moonshotai-cn` | `api.moonshot.{ai,cn}/v1/users/me/balance` | `MOONSHOT_API_KEY` / `MOONSHOT_CN_API_KEY` | 平台余额 |
| `minimax` / `minimax-cn` | `api.minimax.io` / `api.minimaxi.com` `/v1/token_plan/remains` | `MINIMAX_API_KEY` / `MINIMAX_CN_API_KEY` | 5h + 周（订阅 Key） |
| `opencode-go` | `opencode.ai/zen/go/v1/usage` | `OPENCODE_API_KEY` | 5h / 周 / 月 |
| `xiaomi*`（含 token-plan） | `platform.xiaomimimo.com/api/v1/balance` | `XIAOMI_API_KEY` | 余额 |
| `github-copilot` | `api.github.com/copilot_internal/user` | `GITHUB_TOKEN` / `GH_TOKEN` | Premium / Chat / 补全 配额 |

## 无公开余额接口（隐藏，不报错）

| Provider id | 说明 |
|---|---|
| `anthropic` | 无用户 Key 余额接口（组织用量需 Admin Key + 控制台） |
| `openai`、`openai-codex` | 用量接口需组织 Admin Key / ChatGPT OAuth，DSH 的普通 Key 不可用 |
| `google`、`google-vertex` | 需 GCP 项目计费 API，非 Key 级 |
| `amazon-bedrock` | 需 AWS IAM/CloudWatch 计费 |
| `azure-openai-responses` | 需 Azure 订阅计费 API |
| `groq`、`cerebras`、`fireworks`、`together`、`baseten`、`nvidia`、`huggingface`、`mistral`、`meta`、`cloudflare-ai-gateway`、`cloudflare-workers-ai`、`vercel-ai-gateway`、`radius`、`ant-ling`、`opencode` | 无 Key 级余额/配额查询接口 |
| `qwen-token-plan` / `-cn` / `-individual` | 阿里云百炼暂未提供 Token Plan 用量 OpenAPI（控制台可见） |

> 这些 provider 的卡片**直接隐藏**，不影响插件运行；需要展示时用 `customQuota` 配置接入，或提 issue 附接口文档。

## Logo 覆盖

已知官方 Logo（26 个资产，`assets/logos/`）：

`aws`(Bedrock) · `azure` · `baseten` · `cloudflare` · `deepseek` · `fireworks` · `github`(Copilot) · `googlegemini`(Google/Vertex) · `groq` · `huggingface` · `kimi`(Moonshot) · `meta` · `minimax` · `mistral` · `nvidia` · `openai`(含 Codex) · `opencode` · `openrouter` · `qwen` · `together` · `vercel` · `xai` · `xiaomi` · `zai`(GLM)

无官方资源的（`ant-ling`、`radius`、`cerebras`）回退字母圆标。

### 自定义供应商 Logo

两种方式：

1. **官方风格 slug**：把 SVG 放到 `$DSH_HOME/model-usage/logos/<slug>.svg`，然后在 `customQuota` 里指定 `logo: <slug>`
2. 不指定时按路由名自动匹配（`zai`/`kimi`/`openai` 等），未匹配则用字母圆标

```yaml
config:
  customQuota:
    my-provider:
      url: https://api.example.com/quota
      logo: my-provider        # 对应 $DSH_HOME/model-usage/logos/my-provider.svg
      balance: { path: data.balance, currency: CNY }
```

## sub2api 中转站 / 多账号（1.5.0+）

中转站（sub2api）与「同一官方账号的多个副本」都按 **每个账号一个 provider 路由** 处理：

```yaml
config:
  sub2api:
    my-relay:                       # DSH 里的 provider 路由 id
      baseUrl: https://sub2api.example
      keyRef: MY_RELAY_API_KEY      # 可选，默认用该路由的 apiKeyEnv / <ROUTE>_API_KEY
    deepseek-backup-2:              # 第二个账号（同一中转站或另一个账号）
      baseUrl: https://sub2api.example
      keyRef: DEEPSEEK_BACKUP2_API_KEY
```

- 查询地址：`GET {baseUrl}/v1/usage`，`Authorization: Bearer <该账号 Key>`
- 两种响应都支持（[sub2api](https://deepwiki.com/Wei-Shaw/sub2api/3.4-billing-and-quotas)）：
  - 余额模式：`remaining` / `balance` / `available` + `quota.used` + `unit` + `expires_at`
  - 限额模式：`rate_limits: [{ window: '5h'|'1d'|'7d', limit, used, remaining, reset_at }]` → 展示 5 小时 / 每日 / 每周窗口
- `baseUrl` 必须是 HTTPS（不合规会显示"配置"错误，不会明文发 Key）
- 同一个中转站下的多个账号各自独立成卡，互不影响

> 非 sub2api 的中转站或私有余额接口：用 `customQuota`（URL + JSON 路径映射）。

## 用 customQuota 接入任意供应商

```yaml
config:
  customQuota:
    my-provider:
      url: https://api.example.com/quota
      auth: bearer            # bearer | raw | x-api-key | none
      keyRef: MY_PROVIDER_API_KEY
      balance: { path: data.balance, currency: CNY }
      # 或窗口式
      windows:
        - key: rolling
          label: 5h
          usedPath: data.used
          limitPath: data.limit
          resetAtPath: data.resetAt
          resetAtUnit: ms     # ms | s | iso
```

## 新增适配器

1. 在 `lib/adapters.js` 新增 `{ id, refs, read(env) }`
2. `adapterFor()` 加路由匹配（注意顺序：更具体的路由在前，如 `kimi-coding` 先于 `kimi`）
3. 返回 `{ status:'ok', balance }` 或 `{ status:'ok', windows:[{key,label,usedPct,resetAt,countBased?,remaining?,limit?}] }`
4. 失败一律：`needs-credential` / `unauthorized` / `unsupported`（不抛未捕获异常）
5. 只允许写死白名单域名，错误信息必须脱敏
6. 更新本文档矩阵 + `package.json` version（patch/minor）+ `CHANGELOG.md`

# dsh-model-usage

[![npm](https://img.shields.io/npm/v/@ponydev/dsh-model-usage)](https://www.npmjs.com/package/@ponydev/dsh-model-usage)
[![license](https://img.shields.io/npm/l/@ponydev/dsh-model-usage)](LICENSE)

**DeepSeek Harness（DSH）Web UI 插件：实时显示模型供应商的额度与用量。**

- 侧边栏底部：当前供应商的额度/余额卡片，点击打开全部供应商弹窗（Codex 式）
- 设置 → 模型用量：KPI、趋势图、供应商/模型聚合、请求日志、CSV 导出
- 设置 → 模型：页面底部显示各供应商额度
- 只用**真实数据**：额度来自服务商接口，用量来自本机会话日志（逐 token 一致），不做金额估算

![侧边栏额度卡片](https://raw.githubusercontent.com/PonyDevAI/dsh-model-usage/main/docs/screenshots/01-sidebar.png)

![模型用量弹窗](https://raw.githubusercontent.com/PonyDevAI/dsh-model-usage/main/docs/screenshots/02-modal.png)

![统计面板](https://raw.githubusercontent.com/PonyDevAI/dsh-model-usage/main/docs/screenshots/03-settings.png)

## 安装

要求 DSH `>= 0.2.0-rc.2 < 0.3.0`。

```bash
# CLI
dsh plugin --profile web add @ponydev/dsh-model-usage

# 或在 Web「插件」页搜索安装
```

安装后重启宿主（`launchctl kickstart -k gui/$(id -u)/local.deepseek-harness.web`）并刷新页面。

本地开发：

```bash
dsh plugin --profile web add link:/path/to/dsh-model-usage
```

## 供应商支持

| 供应商 | 数据接口 | 凭据引用 |
|---|---|---|
| DeepSeek API | `api.deepseek.com/user/balance` | `DEEPSEEK_API_KEY` |
| DeepSeek 账号 | Host `deepseekAccount` 服务（登录态） | — |
| GLM Coding Plan（国内 / 国际） | `open.bigmodel.cn` / `api.z.ai` 额度接口 | `ZAI_CODING_CN_API_KEY` / `ZAI_API_KEY` |
| OpenRouter | `openrouter.ai/api/v1/credits`（兜底 `/api/v1/key`） | `OPENROUTER_API_KEY` |
| Kimi Coding Plan | `api.kimi.com/coding/v1/usages` | `KIMI_CODING_API_KEY` / `KIMI_API_KEY` / `MOONSHOT_API_KEY` |
| 其他任意供应商 | `customQuota` 配置（URL + JSON 路径映射） | 自定义 `keyRef` |

`customQuota` 示例（余额式）：

```yaml
config:
  customQuota:
    mycoder:
      url: https://api.example.com/quota
      auth: bearer                 # bearer | raw | x-api-key | none
      keyRef: MYCODER_API_KEY
      balance:
        path: data.balance
        currency: CNY
```

窗口式：

```yaml
config:
  customQuota:
    mycoder:
      url: https://api.example.com/quota
      windows:
        - key: rolling
          label: 5h
          usedPath: data.used
          limitPath: data.limit
          resetAtPath: data.resetAt   # ms | s | iso
          resetAtUnit: ms
```

## 配置

`cordis.patch.yml` 中 `model-usage` 行的 `config`：

| 键 | 默认 | 说明 |
|---|---|---|
| `refreshSeconds` | 60 | 额度刷新间隔（秒） |
| `footer` | true | 是否显示侧边栏底部入口 |
| `credentials` | `{}` | 按路由覆盖凭据引用，如 `{ "deepseek-official": "MY_DEEPSEEK_KEY" }` |
| `glm` | `{}` | GLM 组织/项目/套餐类型：`organization` / `project` / `planType` |
| `customQuota` | `{}` | 通用额度适配器（见上） |

## 数据口径

- **用量**：`assistant/message` 事件中的服务商回传 usage（input / cacheRead / cacheWrite / output），与本机会话日志逐 token 一致
- **额度/余额**：服务商接口返回的真实值（DeepSeek 余额、GLM 5h/周剩余、Kimi 周/滚动窗口、OpenRouter credits）
- **真实消耗观测**：每次刷新比对余额/套餐额度变动，得到当日实际支出（余额下降）与充值（余额上升，分开记录不冲抵）
- **不做金额估算**：订阅套餐按套餐额度计费而不是按 API 逐次扣费，任何估算都会误导
- **统计范围**：本机、安装后写入会话日志的调用；旁路调用（标题生成/压缩摘要）与其他设备不计
- 账本文件：`$DSH_HOME/model-usage/ledger.json`（按日聚合，保留 120 天；首次启动回填近 30 天）

## 安全

- API Key 只在 Host 内存中解析使用，**不进入浏览器**，任何 RPC 响应都不包含密钥
- 只请求写死的白名单接口域名；客户端不能指定 URL
- 账本只存用量聚合（token 数、窗口百分比），不含对话内容
- 错误信息脱敏（`sk-*` / `Bearer *` 会被打码）

## 开发

```bash
# 本地渲染台（离线验证 UI，不依赖宿主）
open test-render.html

# 宿主侧改动后需要重启 dsh web；client 侧改动刷新页面即可
```

架构说明见 [docs/architecture.md](docs/architecture.md)。

## License

[MIT](LICENSE)

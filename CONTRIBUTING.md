# 贡献指南

## 环境要求

- Node.js 24+
- 已安装 DSH（`@deepseek-ai/dsh` ≥ 0.2.0-rc.2）
- 本地开发无需构建（ESM 手写 bundle，无打包步骤）

## 本地开发

```bash
# 1. 链接安装到 DSH profile
dsh plugin --profile web add link:$PWD

# 2. Host 侧（lib/index.js、lib/adapters.js、lib/ledger.js）改完必须重启宿主
launchctl kickstart -k gui/$(id -u)/local.deepseek-harness.web

# 3. Client 侧（lib/client.js）改完刷新页面即可（⌘⇧R）
```

离线 UI 验证（不依赖宿主）：

```bash
open test-render.html
```

## 提交前检查

```bash
npm run check          # 语法 + i18n + 隐私 / 截图来源门禁
node scripts/smoke.mjs
npm pack --dry-run
```

## 代码约定（摘要，完整见 AGENTS.md）

- ESM、零运行时依赖、无构建工具
- 只展示真实数据；**禁止金额估算**
- 凭据只在 Host 内存；RPC 不返回密钥；只请求白名单域名
- UI 只用 DSH 官方组件与 `--dsw-*` token；文案走 zh/en i18n
- 设置页面不写说明性长文（口径放 README/docs）

## 提交规范

- Conventional Commits：`feat:` `fix:` `docs:` `ci:` `chore:` `refactor:`
- 一个提交一件事
- 不要提交 `node_modules/`、`*.tgz`、密钥、临时脚本
- **截图只能由离线 harness（`scripts/render-test.mjs`）+ 假数据生成**，不得用真实账户截图；凭据 / 余额 / 真实用量不得入库；新增截图必须在 `docs/screenshots/MANIFEST.md` 登记（`check-shots` 强制）

## 发布

不手动发布。`npm version patch|minor|major` 后 `git push --follow-tags`，详见 [RELEASE.md](RELEASE.md)。

## Issue / PR

- Bug 请附：DSH 版本、复现步骤、`~/Library/Logs/deepseek-harness/stderr.log` 相关片段
- 新增供应商适配器请附：接口文档链接、响应示例（脱敏）、凭据引用名
- PR 描述写清楚：改了什么、为什么、如何验证

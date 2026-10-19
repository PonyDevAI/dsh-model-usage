# AGENTS.md — dsh-model-usage 项目规范（AI / 自动化代理）

本文件是**在这个仓库里工作时必须遵守的项目级规范**。全局规范见 `~/.dsh/AGENTS.md`；本文件只写项目特有约束。

## 0. 一句话

DSH Web 插件：显示模型供应商额度与用量。**只展示真实数据，绝不做金额估算**；UI 必须符合 DSH Web 原生规范。

## 1. 目录与职责

```
lib/index.js      Host 入口（Cordis 插件、RPC 路由、会话事件、额度缓存）
lib/adapters.js   供应商额度适配器（只允许写死的白名单域名）
lib/ledger.js     请求账本（会话日志聚合、观测、历史回填、持久化）
lib/client.js     浏览器端 bundle（slots、组件、样式、i18n）
cordis.patch.yml  bundle 补丁（插入 model-usage 行、默认配置）
assets/logos/     供应商 logo（SVG）
scripts/smoke.mjs 冒烟测试（不触网）
docs/             架构文档、截图
```

**约束**：Host 与 Client 不能互相 import；Client 不得直接读文件/环境变量；所有跨端数据走 RPC（`POST /model-usage/<endpoint>`）。

## 2. 修改前必须做

1. `git status`、`git log --oneline -3` 确认工作区状态
2. 涉及 UI：先读 `docs/architecture.md` 的 UI 规范章节
3. 涉及适配器：确认接口域名/字段有可信来源，**不要编造 URL**

## 3. 提交前必须通过

```bash
for f in lib/*.js; do node --check "$f"; done   # 语法
node scripts/smoke.mjs                          # 冒烟（16 项断言）
npm pack --dry-run                              # 发布内容检查
```

CI 会重复执行以上检查；失败不合并。

## 4. 代码规范

- **ESM only**，无构建步骤，无运行时依赖
- 命名：camelCase；私有状态放闭包；不引入全局变量
- 错误：`err(code, msg)`；错误信息必须脱敏（`safeMsg` 打码 `sk-*`/`Bearer *`）
- 日志：Host 侧可用 `console`，但**禁止打印凭据、请求头、完整响应**
- 金额：**禁止出现成本/价格估算逻辑**（订阅按额度计费，估算是错的）
- 数据口径：Tokens = input + cacheRead + cacheWrite + output；缓存命中率 = cacheRead/(cacheRead+input)

## 5. 安全不变量（不可破坏）

1. API Key 只在 Host 内存中使用，**绝不进入浏览器**，任何 RPC 响应不含密钥
2. 只请求写死的白名单域名；**客户端不能传 URL**
3. 账本只存聚合数字，不含对话内容
4. 新增适配器必须：固定 base URL、超时（`fetchT`）、错误脱敏、`needs-credential` 状态
5. 不新增第三方运行时依赖（保持零依赖）

## 6. UI 规范（DSH 原生）

- 只用官方组件：`Modal` / `Button` / `Pill` / `StateDot` / `Tooltip` / `Menu` / `SegmentedTabs`
- 颜色/圆角/字号只用 `--dsw-*` token，禁止硬编码色值（fallback 除外）
- 设置页只放**短标签 + 控件**，不写说明性长文（口径说明放 README/docs）
- 文案全走 i18n（zh/en 两个字典），不出现硬编码中文/英文
- 间距节奏：组件内 12px；卡片内边距 13px 15px；弹窗内容 `mbody` 12px
- 修改 client 后：`open test-render.html` 离线验证 + 0 控制台错误

## 7. 版本与发布

- 语义化版本：`patch` 修 bug / `minor` 新功能 / `major` 破坏性变更
- **发布只由 tag 触发**，禁止手动 `npm publish`
- 流程见 `RELEASE.md`；tag 必须与 `package.json` 版本一致
- 每个版本更新 `CHANGELOG.md`（按 Keep a Changelog 风格）
- 发布使用 npm Trusted Publishing（OIDC），**不增加 NPM_TOKEN**

## 8. 提交规范

- Conventional Commits：`feat:` / `fix:` / `docs:` / `ci:` / `chore:` / `refactor:`
- 一个提交只做一件事；提交信息中文或英文均可，但需说明"为什么"
- 不要提交：`node_modules/`、`*.tgz`、临时脚本、密钥、截图调试残留
- 作者身份使用全局 git config（`Pony <205503242+jmaubay7@users.noreply.github.com>`），不要用 `-c user.email=` 覆盖，不要写 AI 署名

## 9. 不要做的事

- 不要引入构建工具/打包器（手写 ModuleLoader bundle 是刻意设计）
- 不要改 `lib/client.js` 的 bundle 壳（`window.__ModuleLoader__.load`）结构
- 不要用 `ctx.connection.rpc.handle()`（web composition 下会失败，必须用 `webServer.register` + `connection.admit`）
- 不要在 `inject` 里放可选服务（`deepseekAccount` 用 `ctx.get` 宽松读取）
- 不要删除/改写历史 tag

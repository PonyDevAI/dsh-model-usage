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
scripts/smoke.mjs            冒烟测试（不触网）
scripts/check-privacy.mjs    隐私门禁（本机绝对路径 / 私有主机名 / 凭据）
scripts/check-shots.mjs      截图来源门禁（必须 harness 生成 + MANIFEST 登记）
docs/             架构文档；docs/screenshots（MANIFEST 登记，当前无截图）
```

**约束**：Host 与 Client 不能互相 import；Client 不得直接读文件/环境变量；所有跨端数据走 RPC（`POST /model-usage/<endpoint>`）。

## 2. 修改前必须做

1. `git status`、`git log --oneline -3` 确认工作区状态
2. 涉及 UI：先读 `docs/architecture.md` 的 UI 规范章节
3. 涉及适配器：确认接口域名/字段有可信来源，**不要编造 URL**

## 3. 提交前必须通过

```bash
npm run check                                   # 语法 + i18n + 隐私/截图来源门禁
node scripts/smoke.mjs                          # 冒烟（16 项断言）
npm pack --dry-run                              # 发布内容检查
```

其中 `npm run check` 含两道门禁：`scripts/check-privacy.mjs`（本机路径 / 私有主机名 / 凭据）与 `scripts/check-shots.mjs`（`docs/screenshots` / `docs/mockups` 下每张图必须在 `docs/screenshots/MANIFEST.md` 登记且来源为 `scripts/*.mjs`）。

CI 会重复执行以上检查（另跑 privacy 门禁）；失败不合并。

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
- **语言必须通过框架 `t`（`props.t`）翻译**，禁止用 `navigator.language` 自行判断（DSH 语言可在设置里切换）
- zh/en 字典键必须完全一致，CI 用 `scripts/check-i18n.mjs` 强制校验
- 间距节奏：组件内 12px；卡片内边距 13px 15px；弹窗内容 `mbody` 12px
- 修改 client 后：`open test-render.html` 离线验证 + 0 控制台错误

### 6.1 不覆写 Primitive 度量
- **禁止**给 Primitive 传 `style` 覆盖 `font-size / padding / height / border-radius`；语义颜色（走 `--dsw-*` token）可以传
- 互斥视图切换用 `SegmentedTabs`；二进制量纲/模式切换用 `Button`（primary=选中 / ghost=未选）
- 图标按钮用 `Button variant='ghost' size='sm'` + 14px 内联 SVG；不要自造 22px 迷你按钮
- 列表行规格：44px 高 / 16px 标签 / 1px `--dsw-alias-border-l1` 分割线
- 数据可视化（柱状、圆环、迷你趋势）DSH 无原语，允许自绘，但只能用 `--dsw-*` token 取色

### 6.2 字号 / 圆角清单（唯一允许值）
- 字号：`9.5`（图表轴）/ `11`（说明）/ `12`（次要）/ `13`（小正文）/ `14`（正文）/ `16`（行标签）/ `20`（KPI 与标题）
- 圆角：`12`（控件/卡片）/ `16`（弹层/大卡片）/ `999`（胶囊、进度条端点）/ `4`（图表柱）
- 新增样式前先对照清单，不在清单内的值不要引入

### 6.3 图标尺寸
- 供应商 logo 走 `Logo` 组件：16（表格/日志）/ 18（侧边栏卡片）/ 20（额度表、设置行）/ 22（弹窗卡片）

## 7. 版本与发布

- 语义化版本：`patch` 修 bug / `minor` 新功能 / `major` 破坏性变更
- **发布只由 tag 触发**，禁止手动 `npm publish`
- 流程见 `RELEASE.md`；tag 必须与 `package.json` 版本一致
- **每个版本必须更新 `CHANGELOG.md`**，条目格式 `## <semver> — <YYYY-MM-DD>`；Release workflow 会抽取当前版本条目作为 GitHub Release 正文，缺失则发布失败
- 发布使用 npm Trusted Publishing（OIDC），**不增加 NPM_TOKEN**

## 8. 提交规范

- Conventional Commits：`feat:` / `fix:` / `docs:` / `ci:` / `chore:` / `refactor:`
- 一个提交只做一件事；提交信息中文或英文均可，但需说明"为什么"
- 不要提交：`node_modules/`、`*.tgz`、临时脚本、密钥、截图调试残留
- **截图必须由离线 harness + 假数据生成**：不得用真实账户 / 真机截图；凭据、余额、真实用量不得入库
- 新增或恢复截图时，必须在 `docs/screenshots/MANIFEST.md` 登记「文件 ← 生成脚本」，否则 `check-shots` 失败
- 作者身份使用全局 git config（`Pony <205503242+jmaubay7@users.noreply.github.com>`），不要用 `-c user.email=` 覆盖，不要写 AI 署名

## 9. 不要做的事

- 不要引入构建工具/打包器（手写 ModuleLoader bundle 是刻意设计）
- 不要改 `lib/client.js` 的 bundle 壳（`window.__ModuleLoader__.load`）结构
- 不要用 `ctx.connection.rpc.handle()`（web composition 下会失败，必须用 `webServer.register` + `connection.admit`）
- 不要在 `inject` 里放可选服务（`deepseekAccount` 用 `ctx.get` 宽松读取）
- 不要删除/改写历史 tag

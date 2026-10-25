# Changelog

## 1.12.0 — 2026-10-25

### 变更（右上角入口按预期重做 + 底部入口归位）
- **右上角统计按钮**：改为 **圆环进度 + 中心供应商 logo**（去掉数字角标）
  - hover 显示额度卡片：供应商名 + 各窗口剩余百分比 + 进度条（最多 3 个窗口）+「点击查看全部额度」
  - click 打开完整弹窗
- **输入框底部入口归位**：注册槽位从 `shell.bottom` 改为 **`conversation.composer.dock`**，与「N 轮 M 步 · tok/s · 缓存命中」同一行（右侧、内建 context 环之前）
- 卡片标题两端对齐（名称 ←→ 百分比），进度条改 6px 圆头
- 截图：`docs/screenshots/24-header-hover-card.png`、`25-composer-dock.png`

## 1.11.2 — 2026-10-25

### 变更（右上角统计入口视觉收口）
- 去掉 28px 圆环（与邻居图标叠在一起显得过大/过重），改为 **供应商 logo + 右下角百分比角标**（与 DSH 头部的「图标+徽标」惯例一致，如带 5 的角标）
- 按钮尺寸保持 28px（实测邻居：24 / 28 / 28 / 28 / 30），不再有实心底色
- 截图：`docs/screenshots/23-header-badge.png`

## 1.11.1 — 2026-10-25

### 修复
- **「侧边栏底部卡片」开关无效**：1.10.0 把 `useDisplay()` 上移时误删了 `if (!display.footer) return null` 判断（改成了仅读取不判断），开关只写 localStorage 但不影响渲染。已恢复判断，并移除旧的 config-only 判断（config 值仍通过 useDisplay 默认值生效）
- 验证：三开关全开 → 卡片/头部环/底部入口均出现；全关 → 三者均消失

## 1.11.0 — 2026-10-25

### 新增（输入框底部额度入口 + 头部图标可辨识）
- **输入框底部状态栏额度入口**（`shell.bottom` 槽位，与 CPU/内存/磁盘同一行）：
  - 形态：`◯ GLM Coding Plan 83%`（环形进度 + 供应商名 + 百分比）
  - 取**全部供应商中最紧的窗口**，颜色按 ≥50% / <50% / <20% 分级
  - 点击打开完整额度弹窗
- **右上角统计图标改为环内百分比**（原来只有 logo，看不出是统计），弧长 = 最紧窗口剩余
- **设置 → 模型 → 显示设置**新增第三个开关「输入框底部额度」（默认关）
- 新增 config 键：`bottomBar`（默认 `false`）
- 截图：`docs/screenshots/20-bottom-entry.png`、`21-header-pct.png`、`22-display-switches-3.png`

### 修复
- 底部/头部入口的供应商名与百分比归属不一致（现统一取"最紧窗口所属供应商"）

## 1.10.1 — 2026-10-25

### 修复（重要）
- **模型页「供应商额度」表格消失**：1.10.0 插入显示开关时括号错位，`return h(div, table), h(div, opts)` 变成**逗号表达式**（只返回最后一个节点），表格被丢弃、只剩开关。改为数组 children 结构，表格与开关都正常渲染
- 新增回归截图：`docs/screenshots/19-models-table-and-toggles.png`

## 1.10.0 — 2026-10-25

### 新增（显示区域可配置）
- **设置 → 模型 → 额度表格底部新增「显示设置」**（原生 `Switch` 行，44px）：
  - 侧边栏底部卡片（默认开）——「更多」上方那张额度卡
  - 右上角统计图标（默认关）——会话头部 `conversation.session.header.utilities` 槽位的圆形徽标
- **会话头部圆形统计图标**：环形进度 = 当前供应商最紧窗口剩余，环内供应商 logo；点击打开完整弹窗
- 偏好写入 `localStorage['dmu:display']`，即时生效；默认值来自插件 config
- 新增 config 键：`footer`（默认 `true`）、`headerIcon`（默认 `false`）
- 截图：`docs/screenshots/17-header-icon.png`、`18-display-toggles.png`

### 修复
- SVG 描边改用 CSS `style`（`stroke="var(--dsw-…)"` 属描述属性，`var()` 无效会导致圆环发灰/显示错误颜色）
- 余额型供应商（无窗口）不再画空环

## 1.9.0 — 2026-10-25

### 变更（按反馈调整信息架构）
- **改名**：设置分区「模型用量」→「用量统计」（zh）；en 同步 `Usage statistics`
- **头部按钮尺寸**：`md`(36px) → `sm`（与 Tailscale / IM 助理等插件头部按钮观感一致）
- **分区标题加图表图标**（柱状图 SVG）：DSH 不开放 `settings.section` 导航图标（导航图标按 section id 硬编码，插件 id 回落齿轮），因此图标放在本分区标题处（与 Tailscale 做法一致）
- **移除「额度」tab**：供应商额度已统一在 设置 → 模型 页底部表格，避免重复入口；tab 只剩「总览 / 请求日志」
- **模型页额度表去掉「供应商额度」标题**，直接呈现表头
- 截图：`docs/screenshots/15-header-usage-stats.png`、`16-models-quota-no-heading.png`

## 1.8.0 — 2026-10-24

### UI 规范化收口（P1 + P2 + P3）

**P1 · 控件回归 Primitive**
- 侧边栏卡片刷新按钮：自写 `.dmu-rbtn`（22px 迷你按钮）→ 原生 `Button variant='ghost' size='sm'` + 内联 SVG 图标
- `StatusPill` / `PlanPill`：删除 `fontSize/padding/borderRadius` 覆写，只保留语义色
- MCP 次数角标 `.dmu-countpill` → 原生 `Pill`
- 主 tabs 去掉 `.dmu-main-tabs` 的 CSS 覆盖，使用原生 `SegmentedTabs` 尺寸

**P2 · 字号/圆角收敛**
- 字号 15 档 → **7 档**：9.5（图表轴）/ 11（说明）/ 12（次要）/ 13（小正文）/ 14（正文）/ 16（行标签）/ 20（KPI 与标题）
- 圆角 6/8/10/14 等混用 → **12（控件卡片）/ 16（弹层）/ 999（胶囊）/ 4（图表柱例外）**
- 规则写入 `AGENTS.md` §6.1–6.3（禁止覆写 Primitive 度量、字号/圆角允许清单）

**P3 · 更新弹窗行规格**
- 运行版本/最新版本行改为原生设置行：44px 高、16px 标签、右侧对齐数值、1px 分割线

### 截图
`docs/screenshots/12-card-final.png`、`13-update-dialog.png`、`14-quota-tab.png`

## 1.7.6 — 2026-10-24

### 变更（请求日志表与总览表统一）
- 模型列改为**供应商 logo + 模型名**（与总览的模型表一致），不再显示供应商文字后缀
- 模型名超长时省略号 + 悬停显示完整名（tooltip 含供应商）
- 修复 7 列在设置面板内挤压：数字/表头 `nowrap`、列内边距 7px、字号 12.5px；表头「缓存读」精简为「缓存」
- 截图：`docs/screenshots/11-request-log.png`

## 1.7.5 — 2026-10-24

### 变更（总览 · 时间范围切换）
- 「当天 / 近 7 天 / 近 30 天」由手写 `P.Pill`（描边胶囊）改为**原生 `P.SegmentedTabs`**：
  - 与 DSH 官方用法一致（`value/onChange/items`，官方在智能体预设引导、插件管理使用）
  - 自带 `role="tablist"/aria-selected` 无障碍语义（旧实现没有）
  - 不再手改 Primitive 的 padding/字号，尺寸回归原生度量
- 同行右侧「供应商筛选 / CSV」按钮统一为 `md`（36px），与范围控件垂直居中
- 截图：`docs/screenshots/10-range-segmented.png`

## 1.7.4 — 2026-10-24

### 变更（总览 · 指标切换按钮）
- 「Tokens / 请求数」由描边胶囊改为**实体按钮**：选中 = `primary` 实心按钮，未选 = `ghost` 文字按钮（与关闭按钮同一视觉语言）
- 截图：`docs/screenshots/09-metric-toggle.png`

## 1.7.3 — 2026-10-24

### 变更（设置 → 总览 两张表）
- **供应商表**：名称前加供应商 logo（16px），名称用品牌名（`OpenCode Go` / `GLM Coding Plan`），不再裸露 route id
- **模型表**：去掉供应商文字后缀，改为**模型名前的供应商 logo**；模型名用等宽字体
- 新增截图：`docs/screenshots/07-overview-providers.png`、`08-overview-models.png`

## 1.7.2 — 2026-10-24

### 新增
- **槽位错误边界**：侧边栏卡片 / 设置分区 / 模型页额度表任一渲染异常只会隐藏该区块并打印 `console.warn`，不再让 DSH 卸载整个槽位（避免"点一下卡片就消失"）

### 说明
- 1.7.0 的包各自带的 bundle 有 `IcoChart` 崩溃问题；1.7.1 已修。旧页面缓存旧 bundle 时会出现"点击卡片 → 卡片消失"，刷新（⌘⇧R）即恢复。

## 1.7.1 — 2026-10-24

### 修复
- **设置 → 模型用量 崩溃（严重）**：`SettingsHeader` 与图标组件（GitHub / 外链 / 刷新 / 图表）在某次重构中丢失，导致该分区渲染抛错（`IcoChart is not defined`）。已补回，并把弹窗内图标改为内联 SVG 避免作用域依赖。

### 变更（弹窗趋势按 C 版对齐）
- 左文右图**上下边界对齐**：右侧块顶部与「今日用量」齐平、底部与说明行齐平
- 趋势图补文字说明：「近 7 天 · 10 月」+「峰值 6.62 亿」（跨月自动显示 `M/D`）
- 柱状 + 日期轴（18…24，日期轴随月份自动标注），高度 46px
- 截图更新：`docs/screenshots/06-modal-summary.png`

## 1.7.0 — 2026-10-24

### 变更（设置 → 模型页底部「供应商额度」重做为表格）
- **表格布局**：`供应商 | 5 小时 | 每日 | 每周 | 每月 | 每月 MCP | 余额`（列按实际窗口动态出现）
- **圆环进度**：30px 圆环、描边 3px、弧长 = 剩余百分比，环内小号数字（8.5px）；剩余 ≥50% 墨色 / <50% 橙 / <20% 红
- **余额列**：右对齐 `¥106.20`；无该窗口或无余额统一显示 `—`
- 次数型额度（MCP / Copilot 等）用 pill 文本（`4000/4000`），不硬画成百分比圆环
- 跨语言安全：列宽自适应，长名称不再挤压；新增截图 `docs/screenshots/05-models-quota.png`

## 1.6.5 — 2026-10-24

### 修复（弹窗趋势图观感）
- 右侧迷你趋势改回**近 7 天（按天）**：7 根柱、等宽间距，不再出现"今日按小时"导致的稀疏/断点观感
- 与底部说明「近 7 天 · X tokens」保持一致（同一时间尺度）
- 柱高最小 3px，避免零用量日变成不可见

## 1.6.4 — 2026-10-24

### 变更（弹窗「今日用量」保持左文右图版式，修正口径）
- 保留「左侧文字 KPI + 右侧迷你趋势」布局（与用户确认的样式一致）
- **趋势改为今日按小时**（与标题「今日用量」同一时间尺度，不再混用近 7 天数据）；无调用的整点不画柱，避免一排空虚线
- 底部说明精简为「近 7 天 · 13.6 亿 tokens」，删掉重复的「完整统计在 设置 → 模型用量」（弹窗已有「查看完整统计」按钮）
- 迷你趋势宽度 120 → 168px，24 个时间点更易分辨

## 1.6.3 — 2026-10-24

### 变更（多语言适配的进度条对齐）
- 窗口列表改为 **CSS Grid（auto / 1fr / auto）**：名称列宽度按当前语言的**最长标签自动计算**，百分比列右对齐，进度条占据剩余空间
- 任意语言下三行进度条**起点/终点/长度完全一致**（实测：中文 92/99px、英文 105/86px、超长标签 135/57px，三行均等）
- 名称列 `max-width:132px` + 省略号，极端长标签（语言包）不会挤爆布局；JS 逻辑无需随语言改动

## 1.6.2 — 2026-10-24

### 修复（侧边栏卡片进度条对齐）
- 窗口行改为**固定列宽**：名称列 62px（超长省略）、百分比列 58px 右对齐，中间进度条 `flex:1`
- 三行进度条起点/终点完全一致，不再因前缀名称长短导致条长不齐

## 1.6.1 — 2026-10-24

### 变更（侧边栏卡片压缩）
- 高度 149px → **102px**（约 -32%）：
  - 卡片内边距 10/12 → 8/10、圆角 14 → 12
  - 窗口行改为**单行**：`5 小时限额 ▬▬▬ 剩余 82%`（原来是"标签+百分比"一行、进度条一行）
  - 头部行更紧凑（logo/名称/时间/刷新按钮缩小），余额数字 22 → 18px
- 最多仍展示 3 个窗口（5 小时 / 每周 / 每月），信息不丢

## 1.6.0 — 2026-10-24

### 新增
- 弹窗底部新增**「查看完整统计」**按钮（图表图标 + 主题色高亮 + 箭头，位于左下角），点击关闭弹窗并直接打开 **设置 → 模型用量** 统计面板
  - 跳转实现：优先 ⌥⌘, 打开设置（0.2.1+ 设置收进账号菜单），失败则回退账号菜单导航；随后自动选中「模型用量」分区

### 修复
- **侧边栏折叠（窄窗 / 36px 轨）时点击额度图标不弹窗**：rail 分支提前 return，未渲染 Modal

## 1.5.0 — 2026-10-24

### 新增（issue #1）
- **sub2api 中转站支持**：`config.sub2api.<route>.baseUrl` → 查询 `GET {baseUrl}/v1/usage`
  - 余额模式（`remaining`/`balance` + `quota.used` + `unit` + `expires_at`）
  - 限额模式（`rate_limits` 的 5h / 1d / 7d 三个窗口，含余额与重置时间）
  - 仅接受 HTTPS baseUrl，Key 只走请求头
- **同一账号多副本 / 多账号**：每个账号一个 provider 路由，各自配置 baseUrl + Key，独立成卡
- 新增窗口标签「每日限额」（1d）
- 余额卡说明行按实际字段展示（仅余额时不再出现空的"充值/赠金"）
- 解析逻辑抽成纯函数 `parseSub2apiUsage`，纳入冒烟测试（余额/限额/停用/未知 5 组断言）

## 1.4.0 — 2026-10-24

### 修复（语言显示不一致：DSH 中文但插件偶发英文）
- **语言兜底改为 `document.documentElement.lang` 优先**（DSH 写入的活动语言），不再依赖 `navigator.language`（浏览器界面语言可能与 DSH 不同）
- 订阅 locale revision：字典晚到/切换语言后，所有插件组件（含框架未注入 `t` 的槽位）强制重渲染，不再残留旧语言
- 未本地化文案补齐：GitHub Copilot 窗口（Premium 请求 / 对话 / 补全）、错误提示统一中文（凭据无效、接口失败、格式变化、网络失败，原始错误进 tooltip）
- 供应商名称不再裸露 route id：`opencode-go` → 「OpenCode Go」、`zai-coding-cn` → 「GLM Coding Plan」等 30+ 映射；账号显示「DeepSeek 账号」

## 1.3.1 — 2026-10-22

### 变更（更新弹窗对齐 IM 助手）
- 弹窗结构：说明行 → 「运行版本 / 最新版本」键值行 → 橙色状态提示 → 「手工更新」+ 命令块 + 复制 → 底部「重新检查 / 关闭」
- 标题改为「模型用量 更新」，与插件名一致

## 1.3.0 — 2026-10-22

### 新增
- 设置页头部改为 **标题 + 版本号 + 动作按钮组**（参考 IM 助手插件）：
  - `GitHub`（打开仓库）、`问题反馈`（打开 issues）、`检查更新`（版本对比弹窗）
  - 图标使用内联 SVG（GitHub mark / 外链 / 刷新），按钮为原生 36px 尺寸
- 版本号与标题同行展示，已是最新/有新版状态在弹窗中呈现

### 变更
- 更新弹窗内容排版对齐原生设置行（13px 标题 + 12px 说明 + 代码块 + 复制按钮）

## 1.2.1 — 2026-10-20

### 变更（UI 对齐 DSH 设置页规范）
- 版本/检查更新改为**原生设置行**（16px 标签 + 44px 行高 + 细分割线 + 右侧控件）
- 设置内容去掉重复大标题（section 名称已由设置导航提供）
- 卡片圆角统一 12px、列表改为无卡片底的 44px 行 + 细线（对齐 通用设置/模型 页）
- 字号规范化：正文 12px、行标签 16px、卡片标签 12px，去掉 10.5px 等非规范字号
- 分组标题由 10.5px 大写间距改为 13px/600 常规字重

## 1.2.0 — 2026-10-20

### 新增
- **检查更新**：设置 → 模型用量 标题右侧显示当前版本 `vX.Y.Z`，点击「检查更新」查询 npm registry 最新版本；有新版本时显示橙点与更新提示
- 弹窗展示 运行版本 / 最新版本 / 一键复制手工更新命令（`dsh plugin --profile web add <pkg>@<ver> --registry=...`）
- RPC `update-check`（10 分钟缓存；registry 固定 npmjs，不返回凭据）

### 说明
- 自动更新需 DSH profile 包管理器介入，本插件只提供「检查 + 命令复制」，执行后重启 DSH Web 生效

## 1.1.0 — 2026-10-20

### 新增
- **Logo 覆盖对齐 DSH 全部 provider**：新增 AWS/Bedrock、Azure、Baseten、Cloudflare、Fireworks、GitHub(Copilot)、Groq、HuggingFace、Meta、Mistral、NVIDIA、Qwen、Together、Vercel、Xiaomi 官方图标（共 26 个资产）
- 路由映射补全：`openai-codex`、`google`/`google-vertex`、`github-copilot`、`xiaomi*`、`qwen*` 等
- **自定义供应商 Logo**：`$DSH_HOME/model-usage/logos/<slug>.svg` + `customQuota.<route>.logo` 指定
- 透明底品牌标改白底圆形（深色主题下可见），不透明方形标保持圆角方形

### 说明
- 统计/用量（KPI/趋势/请求日志/聚合表）对所有 provider 通用：来自会话事件，任何路由（含自定义）都会统计
- 额度接口不可用的 provider（Anthropic/OpenAI/Google/Bedrock/Azure/Groq 等）保持隐藏，可用 customQuota 或提 issue

## 1.0.9 — 2026-10-20

### 修复
- 供应商卡头部在 `displayName` 与路由 id 相同时不再重复显示（如 `opencode-go opencode-go`）

## 1.0.8 — 2026-10-20

### 新增
- OpenCode / OpenCode Go 官方 Logo（`opencode.ai/favicon.svg`）

### 修复
- 方形品牌标（Z.ai、Kimi、OpenRouter、MiniMax、OpenCode、xAI）改用**圆角方形**渲染，避免圆形裁切掉四角

## 1.0.7 — 2026-10-20

### 修复
- **凭据引用改为「路由派生优先」**：如 `opencode-go` → `OPENCODE_GO_API_KEY`（与 DSH Models 页的 `apiKeyEnv` 一致），修复已配置 Key 的供应商仍显示未配置/不显示的问题

## 1.0.6 — 2026-10-20

### 新增
- **供应商覆盖对齐 DSH provider 目录（43 个）**：
  - 新增适配器：OpenCode Go（`zen/go/v1/usage`，5h/周/月）、Moonshot/Kimi 平台余额、MiniMax Token Plan（5h/周）、Xiaomi MiMo 余额、GitHub Copilot 配额（Premium/Chat/补全）
  - `deepseek` 路由也映射到 DeepSeek 余额适配器
  - 新增「每月限额」窗口标签
- `docs/providers.md`：完整覆盖矩阵（真实额度 / 订阅待确认 / 无公开接口 / customQuota 接入方式）

### 变更
- 无公开额度接口的 provider（Anthropic/OpenAI/Google/Bedrock/Azure/Groq 等）保持隐藏，不产生错误卡片

## 1.0.5 — 2026-10-20

### 新增
- **GLM 每月 MCP 工具调用限额**：解析 `TIME_LIMIT`（unit=5，月）窗口，展示「每月 MCP 工具 · 剩余 N/M 次」与重置倒计时（额度接口 `usageDetails`: search-prime / web-reader / zread）
- 窗口行支持「次数型」额度（无百分比时按剩余次数展示，进度条仍按剩余比例）
- **官方 Logo**：GLM / Z.ai（官方 SVG）、Kimi / Moonshot、OpenRouter、MiniMax、xAI；路由映射扩展（zai/glm/bigmodel/zhipu/chatglm、kimi/moonshot、openrouter、minimax、xai），无官方资源时回退字母圆标

### 变更
- 侧边栏迷你卡片最多展示 3 个窗口（5 小时 / 每周 / 每月 MCP）

## 1.0.4 — 2026-10-20

### 修复
- **语言跟随 DSH 设置**：此前用 `navigator.language` 判断，切到英文界面时插件仍显示中文；现在统一走框架 `t`（活动语言 → en 回退）
- 补齐分组标题（当前会话在用 / 订阅窗口 / API 余额 / 账号钱包 / 其他）的 zh/en 字典键

### 新增
- `scripts/check-i18n.mjs`：校验 zh/en 字典键完全一致 + 代码使用的键都存在，已接入 CI

## 1.0.3 — 2026-10-19

### 修复
- 前端模块注册名与安装包名不一致导致 DSH Web 启动失败（`__ModuleLoader__` id 改为 `@ponydev/dsh-model-usage`）
- 账本实时记录的输入/输出/缓存字段修复后重算历史（此前实时记录 token 明细为 0，聚合少算）

### 变更
- 更新 README 截图（总览 / 弹窗 / 请求日志），与当前 UI 一致
- 新增请求日志截图 `docs/screenshots/04-request-log.png`

## 1.0.2 — 2026-10-19

### 新增
- 项目规范文档：`AGENTS.md`（项目级规范）、`CONTRIBUTING.md`（开发指南）、`RELEASE.md`（自动发布规范）
- Release 正文自动从 CHANGELOG 抽取当前版本条目（`scripts/release-notes.mjs`），缺失版本条目时发布失败

### 变更
- 文档三件套随 npm 包发布（`files` 白名单）

## 1.0.1 — 2026-10-19

- 发布链路切换到 npm Trusted Publishing（OIDC），CI 不再依赖 NPM_TOKEN
- 修复：`usageOf` 兼容实时链路的 `input/cacheRead/...` 字段（tokens 统计）
- 新增：CI（语法 + 16 项冒烟测试）与 Release 自动发布工作流

## 1.0.0 — 2026-10-19

首个公开发布（npm: `@ponydevai/dsh-model-usage`）。

### 功能
- 侧边栏底部额度卡片（当前供应商，点击打开全部供应商弹窗）
- 弹窗：今日用量摘要（调用 / Tokens / 缓存命中率 + 7 日迷你趋势）与各供应商真实额度
- 设置 → 模型用量：KPI、趋势（当天/7 天/30 天 × Tokens/请求数）、供应商筛选、聚合表、请求日志（耗时/首字）、CSV 导出
- 设置 → 模型页底部供应商额度
- 真实消耗观测（余额/套餐额度变动），不做金额估算
- 历史回填（近 30 天会话日志）
- 供应商：DeepSeek API/账号、GLM Coding Plan、OpenRouter、Kimi Coding Plan、customQuota 通用适配器
- 官方组件与设计 token、明暗主题、i18n（zh/en）、无障碍（焦点环/aria）

## 0.2.1 — 2026-10-19

### 新增
- 面板增强：供应商下拉筛选（全部/GLM/DeepSeek…，官方 Menu 组件）、趋势指标切换（Tokens / 请求数）
- 设置 → 模型页底部「供应商额度」区块（settings.models.footer）
- 供应商扩展：OpenRouter（credits API）、Kimi Coding Plan（api.kimi.com/coding/v1/usages）、通用 customQuota 适配器

## 0.2.0 — 2026-10-19

### 新增
- 设置 → 模型用量 统计面板：KPI（调用 / Tokens / 缓存命中率）+ 小时/天趋势 + 供应商/模型聚合表
- 范围切换：当天 / 近 7 天 / 近 30 天；CSV 导出
- 请求日志：逐条时间 / 模型 / 输入 / 输出 / 缓存读 / 耗时 / 首字（保留最近 300 条）
- 历史回填：首次启动自动从本机会话日志回填近 30 天
- 真实消耗观测：按服务商余额差（DeepSeek）与套餐额度差（GLM）计算当日实际消耗，非估算

### 变更
- 移除成本估算（订阅套餐按额度计费，估算会误导）；金额只展示服务商真实值
- 主 Tab 使用官方 SegmentedTabs；焦点环、空态/错误态、i18n 全量收口
- 移除 `dock` / `headerChip` 死配置

## 0.1.1
- 侧边栏底部额度卡片（当前供应商 + 分钟窗口条）、官方 Modal、供应商分组、官方 Logo

# Changelog

## 1.0.5 — 2026-10-20

### 新增
- **GLM 每月 MCP 工具调用限额**：解析 `TIME_LIMIT`（unit=5，月）窗口，展示「每月 MCP 工具 · 剩余 N/M 次」与重置倒计时（额度接口 `usageDetails`: search-prime / web-reader / zread）
- 窗口行支持「次数型」额度（无百分比时按剩余次数展示，进度条仍按剩余比例）

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

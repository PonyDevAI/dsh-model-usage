# 发布规范（自动发布 · Tag 触发）

本项目**不手动 `npm publish`**。发布唯一入口是**推送 `v*` tag**，由 GitHub Actions 自动完成。

## 一、链路总览

```
git push --follow-tags
        │
        ▼
GitHub Actions: .github/workflows/release.yml   (触发: push tags: v*)
  1. 校验 tag 与 package.json 版本一致（不一致 → 失败，防误发）
  2. 语法检查 + 冒烟测试（scripts/smoke.mjs）
  3. npm Trusted Publishing（OIDC）发布，附 SLSA provenance 签名
     - 版本已存在则跳过（幂等，可安全重跑）
  4. 创建 GitHub Release（body 取 CHANGELOG.md）
```

CI（`.github/workflows/ci.yml`）在 push `main` / PR 时只跑检查（语法 + 冒烟 + `npm pack` 内容校验），**不会发布**。

## 一·五、CHANGELOG 与 Release 正文（强制）

- **每个版本必须在 `CHANGELOG.md` 有对应 `## <版本>` 条目**，缺失时 release workflow 直接失败（`scripts/release-notes.mjs`）
- GitHub Release 正文 = **自动从 CHANGELOG 抽取当前版本条目**（不是全文、不是手写）
- CHANGELOG 采用 [Keep a Changelog](https://keepachangelog.com/) 风格：

```markdown
## 1.0.2 — 2026-10-19

### 新增
- ...

### 修复
- ...

### 变更 / 移除
- ...
```

- 分类固定用：`新增` / `变更` / `修复` / `移除` / `安全`（无内容的分类省略）
- 语言：与仓库一致用中文；写"用户可感知的变化"，不写实现细节流水账
- 版本标题格式：`## <semver> — <YYYY-MM-DD>`（工具按 `## <version>` 前缀匹配）

## 二、认证方式（永不过期）

使用 **npm Trusted Publishing（OIDC）**：

- npm 包设置 → Trusted Publisher → GitHub Actions
  - Organization or user: `PonyDevAI`
  - Repository: `dsh-model-usage`
  - Workflow filename: `release.yml`
- workflow 权限：`id-token: write` + `contents: write`
- **不需要** `NPM_TOKEN` secret、不需要 OTP、不会过期
- 发布包自动获得 `dist.attestations.provenance`（SLSA v1）

> 不要退回 granular token：bypass-2FA token 最长 7 天，且 2027 年起禁止直接发布。

## 三、标准发版步骤

```bash
# 0. 确认工作区干净、检查通过
git status
node scripts/smoke.mjs

# 1. 更新 CHANGELOG.md（新增当前版本条目）

# 2. 升版本（自动改 package.json + commit + 本地 tag）
npm version patch     # 修复：1.0.1 → 1.0.2
npm version minor     # 新功能：1.0.x → 1.1.0
npm version major     # 破坏性：1.x → 2.0.0

# 3. 推送（--follow-tags 会带上 tag，触发发布）
git push --follow-tags
```

发布完成后验证：

```bash
npm view @ponydev/dsh-model-usage version          # 应为新版本
npm view @ponydev/dsh-model-usage@<ver> dist.attestations   # 应有 provenance
gh run list --limit 3                               # Release workflow success
gh release view v<ver>                              # Release 已创建
```

## 四、版本规则

| 变更类型 | 版本 | 示例 |
|---|---|---|
| 修 bug / 文案 / 样式 | patch | 1.0.1 → 1.0.2 |
| 新功能（兼容） | minor | 1.0.2 → 1.1.0 |
| 破坏性（改配置结构、RPC、插槽、去除功能） | major | 1.1.0 → 2.0.0 |

- `engines.dsh` 兼容范围变化视为 major
- 每个版本必须在 `CHANGELOG.md` 增加条目（Keep a Changelog 风格）

## 五、手动打 tag（等价方式）

```bash
# 先把 package.json version 改成目标版本并提交到 main
git tag -a v1.0.2 -m "dsh-model-usage 1.0.2"
git push origin v1.0.2
```

tag 与 `package.json` 不一致会导致 workflow 第一步失败。

## 六、故障处理

| 现象 | 原因 | 处理 |
|---|---|---|
| `tag x != package.json y` | 版本没改或 tag 打错 | 删本地 tag `git tag -d vX`，改版本后重打 |
| 发布步骤 "already published, skipping" | 该版本已存在 | 正常；要重发请升版本 |
| `E403 ... trusted publisher` | npm 未配置 OIDC 或 repo/workflow 名不匹配 | 检查 npm Trusted Publisher 三项字段 |
| npm 页面差几分钟才出现新版本 | registry 同步延迟 | 等待 2–5 分钟，直接查版本接口 |
| 需要撤回刚发布的版本 | 72 小时内可 unpublish | 见下节（需 2FA/OTP） |

### 撤回/废弃

```bash
# 72 小时内：删除版本
npm unpublish @ponydev/dsh-model-usage@<ver> --force --otp=<OTP>

# 超过 72 小时：标记废弃（推荐）
npm deprecate @ponydev/dsh-model-usage@<ver> "原因，建议升级到 x.y.z"
```

## 七、GitHub Release

- 自动创建，标题 `v<版本>`，正文取 `CHANGELOG.md` 全文
- 不手工编辑历史 Release；如需补充说明，在下一个版本体现

## 八、发布前检查清单

- [ ] `node scripts/smoke.mjs` 通过
- [ ] `npm pack --dry-run` 内容正确（无临时文件/密钥）
- [ ] `CHANGELOG.md` 已更新
- [ ] `README.md` 的安装命令/包名正确
- [ ] 工作量：`docs/screenshots/` 截图与实际 UI 一致（UI 变更时）
- [ ] `package.json` 的 `version` 与将要打的 tag 一致

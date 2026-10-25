# 截图来源登记（MANIFEST）

**当前不提供截图。** 本仓库还没有离线截图 harness；此前的 31 张真机 / 真实账户截图（含真实模型名、余额与 token 用量）已在 2026-10 隐私清理时全部移除。

恢复截图时必须同时满足：

1. 先在 `scripts/render-test.mjs` 实现离线 harness（假数据；不连宿主、不读真实账户、不读凭据）；
2. 每张图在本文件登记一行：`- 文件` ← `生成脚本`（脚本必须是 `scripts/*.mjs`）；
3. 通过 `node scripts/check-shots.mjs`（`npm run check` 已包含）。

## 登记

（暂无。恢复后在此按上面的格式追加。）

## 规则

- 禁止真机 / 真实账户截图；凭据、余额、真实用量不得入库；
- `docs/screenshots/` 与 `docs/mockups/` 下的任何图片都必须有本文件登记，否则 `check-shots` 失败。

// 冒烟测试：账本聚合 / 观测 / 适配器分发（不触网、不写真实 DSH_HOME）
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const home = mkdtempSync(join(tmpdir(), 'dmu-smoke-'))
process.env.DSH_HOME = home

const { createLedger } = await import('../lib/ledger.js')
const { adapterFor } = await import('../lib/adapters.js')

const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exitCode = 1 } else console.log('ok:', msg) }

// 1) 账本聚合
const ledger = createLedger()
await ledger.ready()
ledger.record('deepseek-official', 'deepseek-flash', { input: 1000, cacheRead: 4000, cacheWrite: 0, output: 500 }, { durationMs: 1200, ttftMs: 300 })
ledger.record('zai-coding-cn', 'glm-5.3-flash', { input: 2000, cacheRead: 8000, cacheWrite: 0, output: 900 })
const st = ledger.stats({ days: 1 })
assert(st.today.requests === 2, '统计请求数 = 2')
assert(st.today.tokens === 1000 + 4000 + 500 + 2000 + 8000 + 900, '统计 tokens 汇总正确')
assert(st.today.cacheHitRate === Math.round((12000 / (12000 + 3000)) * 1000) / 10, '缓存命中率公式')
assert(st.models.length === 2 && st.models[0].tokens >= st.models[1].tokens, '模型聚合排序')
assert(st.recent.length === 2 && st.recent[0].dur === 1200 && st.recent[0].ttft === 300, '逐条日志耗时/首字')
assert(st.spentToday && typeof st.spentToday === 'object', '观测字段存在')

// 2) 余额/窗口观测
ledger.observe('deepseek-official', { balance: { currency: 'CNY', total: '30.00' } })
ledger.observe('deepseek-official', { balance: { currency: 'CNY', total: '28.5' } })
ledger.observe('deepseek-official', { balance: { currency: 'CNY', total: '33.5' } })
const w = (used, resetAt) => ({ windows: [{ key: 'rolling', usedPct: used, resetAt }] })
ledger.observe('zai-coding-cn', w(10, 1000))
ledger.observe('zai-coding-cn', w(13.5, 1000))
ledger.observe('zai-coding-cn', w(1, 2000))
const st2 = ledger.stats({ days: 1 })
assert(st2.spentToday['deepseek-official'].spent === 1.5, '余额差 = 支出 1.50')
assert(st2.spentToday['deepseek-official'].recharged === 5, '余额上升 = 充值 5（不冲抵）')
assert(st2.spentToday['zai-coding-cn'].windows.rolling === 3.5, '窗口消耗 = 3.5%')
assert(st2.days.length === 1 && st2.days[0].tokens > 0, '按天趋势桶')

// 3) 适配器分发
const cfg = { credentials: {}, customQuota: { mycoder: { url: 'https://example.com/q', balance: { path: 'data.left' } } } }
assert(adapterFor('deepseek-official', cfg)?.id === 'deepseek-balance', 'deepseek 适配器')
assert(adapterFor('zai-coding-cn', cfg)?.id === 'glm-coding', 'glm 适配器')
assert(adapterFor('openrouter', cfg)?.id === 'openrouter', 'openrouter 适配器')
assert(/^kimi/.test(adapterFor('kimi-coding-cn', cfg)?.id || ''), 'kimi 适配器')
assert(adapterFor('mycoder', cfg)?.id === 'custom-quota', 'customQuota 适配器')
assert(adapterFor('unknown-route', cfg) === null, '未知路由返回 null')

await ledger.flush()
rmSync(home, { recursive: true, force: true })
console.log(process.exitCode ? '\nSMOKE FAILED' : '\nSMOKE PASSED')

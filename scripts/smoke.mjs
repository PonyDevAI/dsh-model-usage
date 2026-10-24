// 冒烟测试：账本聚合 / 观测 / 适配器分发（不触网、不写真实 DSH_HOME）
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const home = mkdtempSync(join(tmpdir(), 'dmu-smoke-'))
process.env.DSH_HOME = home

const { createLedger } = await import('../lib/ledger.js')
const { adapterFor, parseSub2apiUsage } = await import('../lib/adapters.js')

const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exitCode = 1 } else console.log('ok:', msg) }

// 浏览器按包名解析模块；能执行脚本还不足以证明注册成功。
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const modules = new Map()
runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), {
  window: { __ModuleLoader__: { load(def) { modules.set(def.id, def) } } },
})
assert(typeof modules.get(pkg.name)?.factory === 'function', '前端模块按安装包名注册，可由 DSH 加载')

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
assert(st.recent.length === 2 && st.recent.some((r) => r.dur === 1200 && r.ttft === 300), '逐条日志耗时/首字')
assert(st.spendToday && typeof st.spendToday === 'object', '观测字段存在')

// 2) 余额/窗口观测
ledger.observe('deepseek-official', { balance: { currency: 'CNY', total: '30.00' } })
ledger.observe('deepseek-official', { balance: { currency: 'CNY', total: '28.5' } })
ledger.observe('deepseek-official', { balance: { currency: 'CNY', total: '33.5' } })
const w = (used, resetAt) => ({ windows: [{ key: 'rolling', usedPct: used, resetAt }] })
ledger.observe('zai-coding-cn', w(10, 1000))
ledger.observe('zai-coding-cn', w(13.5, 1000))
ledger.observe('zai-coding-cn', w(1, 2000))
const st2 = ledger.stats({ days: 1 })
assert(st2.spendToday['deepseek-official'].spent === 1.5, '余额差 = 支出 1.50')
assert(st2.spendToday['deepseek-official'].recharged === 5, '余额上升 = 充值 5（不冲抵）')
assert(st2.spendToday['zai-coding-cn'].windows.rolling === 3.5, '窗口消耗 = 3.5%')
assert(st2.days.length === 1 && st2.days[0].tokens > 0, '按天趋势桶')

// 3) 适配器分发
const cfg = { credentials: {}, customQuota: { mycoder: { url: 'https://example.com/q', balance: { path: 'data.left' } } } }
assert(adapterFor('deepseek-official', cfg)?.id === 'deepseek-balance', 'deepseek 适配器')
assert(adapterFor('zai-coding-cn', cfg)?.id === 'glm-coding', 'glm 适配器')
assert(adapterFor('openrouter', cfg)?.id === 'openrouter', 'openrouter 适配器')
assert(/^kimi/.test(adapterFor('kimi-coding-cn', cfg)?.id || ''), 'kimi 适配器')
assert(adapterFor('mycoder', cfg)?.id === 'custom-quota', 'customQuota 适配器')
assert(adapterFor('unknown-route', cfg) === null, '未知路由返回 null')

// 4) sub2api 解析（余额 / 限额 / 停用 / 未知）
const s2bal = parseSub2apiUsage({ remaining: 88.5, quota: { used: 11.5, total: 100 }, unit: 'USD' })
assert(s2bal.kind === 'balance' && s2bal.balance.total === '88.5' && s2bal.balance.used === '11.5' && s2bal.balance.currency === 'USD', 'sub2api 余额模式')
const s2lim = parseSub2apiUsage({ mode: 'quota_limited', rate_limits: [
  { window: '5h', limit: 20, used: 6.5, reset_at: '2028-06-01T00:00:00Z' },
  { window: '1d', limit: 50, used: 12 },
  { window: '7d', limit: 200, used: 40 },
] })
assert(s2lim.kind === 'windows' && s2lim.windows.map((w) => w.key).join(',') === 'rolling,daily,weekly', 'sub2api 限额窗口键')
assert(Math.abs(s2lim.windows[0].usedPct - 32.5) < 1e-6, 'sub2api 5h 使用百分比')
assert(s2lim.windows[0].resetAt > 0, 'sub2api 重置时间解析')
assert(parseSub2apiUsage({ isValid: false }).kind === 'invalid', 'sub2api 停用 Key')
assert(parseSub2apiUsage({}).kind === 'shape', 'sub2api 未知响应')
assert(adapterFor('my-sub2api', { sub2api: { 'my-sub2api': { baseUrl: 'https://s.example' } }, credentials: {}, customQuota: {} })?.id === 'sub2api', 'sub2api 适配器分派')

await ledger.flush()
rmSync(home, { recursive: true, force: true })
console.log(process.exitCode ? '\nSMOKE FAILED' : '\nSMOKE PASSED')

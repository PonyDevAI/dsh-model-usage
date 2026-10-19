// 请求账本：session 事件 → 按日聚合（按小时/供应商/模型）+ 逐条请求环形日志
// 口径：Tokens = input + output + cacheRead + cacheWrite（reasoning 已含在 output）
// 不做成本估算：订阅套餐不是按 API 计费，金额以服务商账单/余额为准。
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { mkdir, readFile, readdir, rename, stat as statFile, writeFile } from 'node:fs/promises'
import { zstdDecompressSync } from 'node:zlib'

const RECENT_MAX = 300
const BACKFILL_DAYS = 30

export function dateKey(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function dshHome() {
  return process.env.DSH_HOME && process.env.DSH_HOME.trim() ? process.env.DSH_HOME.trim() : join(homedir(), '.dsh')
}

export function ledgerFilePath() {
  return join(dshHome(), 'model-usage', 'ledger.json')
}

export function sessionsRoot() {
  return join(dshHome(), 'sessions')
}

function emptyDay() {
  return { hours: {}, providers: {} }
}

function usageOf(u) {
  const out = {
    input: Number(u.inputTokens) || 0,
    cacheRead: Number(u.cacheReadTokens) || 0,
    cacheWrite: Number(u.cacheWriteTokens) || 0,
    output: Number(u.outputTokens) || 0,
  }
  out.total = out.input + out.cacheRead + out.cacheWrite + out.output
  return out
}

function bumpBucket(bucket, usage) {
  bucket.requests = (bucket.requests || 0) + 1
  bucket.input = (bucket.input || 0) + (usage.input || 0)
  bucket.cacheRead = (bucket.cacheRead || 0) + (usage.cacheRead || 0)
  bucket.cacheWrite = (bucket.cacheWrite || 0) + (usage.cacheWrite || 0)
  bucket.output = (bucket.output || 0) + (usage.output || 0)
  bucket.tokens = (bucket.tokens || 0) + (usage.total || 0)
}

function pushRecord(data, rec) {
  if (!Array.isArray(data.recent)) data.recent = []
  data.recent.push(rec)
  if (data.recent.length > RECENT_MAX) data.recent.splice(0, data.recent.length - RECENT_MAX)
}

function applyRecord(data, { time, provider, model, usage, durationMs, ttftMs }) {
  const u = usageOf(usage)
  const d = new Date(time || Date.now())
  const dayKey = dateKey(d)
  const day = data.days[dayKey] || (data.days[dayKey] = emptyDay())
  const hourBucket = day.hours[d.getHours()] || (day.hours[d.getHours()] = {})
  const prov = day.providers[provider] || (day.providers[provider] = { models: {} })
  const modelBucket = prov.models[model] || (prov.models[model] = {})
  bumpBucket(day, u)
  bumpBucket(hourBucket, u)
  bumpBucket(prov, u)
  bumpBucket(modelBucket, u)
  if (!hourBucket.byProvider) hourBucket.byProvider = {}
  const hp = hourBucket.byProvider[provider] || (hourBucket.byProvider[provider] = { tokens: 0, requests: 0 })
  hp.tokens += u.total
  hp.requests += 1
  pushRecord(data, {
    t: time || Date.now(),
    p: provider,
    m: model,
    i: u.input,
    o: u.output,
    cr: u.cacheRead,
    cw: u.cacheWrite,
    dur: Number.isFinite(durationMs) ? durationMs : null,
    ttft: Number.isFinite(ttftMs) ? ttftMs : null,
  })
}

/** 从会话日志回填：完整重算 days/recent（日志为权威），完成后设 backfilled 标记 */
async function backfillFromLogs(data, root, days) {
  const cutoff = Date.now() - days * 86400000
  const files = []
  async function walk(dir) {
    let ents
    try { ents = await readdir(dir, { withFileTypes: true }) } catch { return }
    for (const e of ents) {
      const p = join(dir, e.name)
      if (e.isDirectory()) await walk(p)
      else if (e.name.endsWith('.jsonl.zstd')) files.push(p)
    }
  }
  await walk(root)
  const tmp = { days: {}, recent: [] }
  const recs = []
  for (const file of files) {
    let text
    try {
      const st = await statFile(file)
      if (st.mtimeMs < cutoff) continue
      const buf = await readFile(file)
      text = zstdDecompressSync(buf).toString('utf8')
    } catch { continue }
    let pendingAt = null
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      let ev
      try { ev = JSON.parse(line) } catch { continue }
      const type = ev.type
      const d = ev.data
      if (!d) continue
      if (type === 'step/start') { pendingAt = ev.time || null; continue }
      if (type !== 'assistant/message') continue
      if (!d.usage || !d.message || !d.message.source) continue
      const t = ev.time || Date.now()
      if (t < cutoff) continue
      const stream = Array.isArray(d.stream) ? d.stream : []
      const firstTime = stream.length && Number.isFinite(stream[0].time) ? stream[0].time : null
      const ttft = pendingAt && firstTime && firstTime >= pendingAt ? firstTime - pendingAt : null
      const dur = pendingAt ? Math.max(0, t - pendingAt) : null
      applyRecord(tmp, {
        time: t,
        provider: d.message.source.provider,
        model: d.message.source.model || '',
        usage: d.usage,
        durationMs: dur,
        ttftMs: ttft,
      })
      pendingAt = null
    }
  }
  tmp.recent.sort((a, b) => a.t - b.t)
  data.days = tmp.days
  data.recent = tmp.recent.slice(-RECENT_MAX)
  data.backfilled = true
  data.backfillAt = Date.now()
}

export function createLedger() {
  const file = ledgerFilePath()
  let data = { version: 1, days: {}, recent: [], obs: { last: {}, days: {} } }
  let ready = null
  let dirty = false
  let flushTimer = null
  let backfilling = false
  const queue = []

  async function load() {
    try {
      const text = await readFile(file, 'utf8')
      const parsed = JSON.parse(text)
      if (parsed && parsed.version === 1 && parsed.days) data = parsed
    } catch {}
    if (!Array.isArray(data.recent)) data.recent = []
    if (!data.obs || typeof data.obs !== 'object') data.obs = { last: {}, days: {} }
    if (!data.obs.last) data.obs.last = {}
    if (!data.obs.days) data.obs.days = {}
    prune()
  }
  function ensureLoaded() {
    if (!ready) ready = load()
    return ready
  }
  function prune() {
    const cutoff = Date.now() - 120 * 86400000
    for (const key of Object.keys(data.days)) {
      const t = new Date(key + 'T00:00:00').getTime()
      if (Number.isFinite(t) && t < cutoff) delete data.days[key]
    }
    if (Array.isArray(data.recent)) data.recent = data.recent.filter((r) => r && r.t > cutoff).slice(-RECENT_MAX)
    if (data.obs && data.obs.days) {
      for (const key of Object.keys(data.obs.days)) {
        const t = new Date(key + 'T00:00:00').getTime()
        if (Number.isFinite(t) && t < cutoff) delete data.obs.days[key]
      }
    }
  }

  /** 首次运行从会话日志回填；回填期间的实时记录先入队，完成后合并 */
  async function backfill() {
    if (data.backfilled) return false
    backfilling = true
    try {
      await backfillFromLogs(data, sessionsRoot(), BACKFILL_DAYS)
      for (const rec of queue.splice(0)) applyRecord(data, rec)
      dirty = true
      await flush()
      return true
    } catch {
      return false
    } finally {
      backfilling = false
    }
  }

  function record(provider, model, usage, timing) {
    const rec = {
      time: (timing && timing.time) || Date.now(),
      provider,
      model,
      usage,
      durationMs: timing && timing.durationMs,
      ttftMs: timing && timing.ttftMs,
    }
    if (backfilling) { queue.push(rec); return }
    applyRecord(data, rec)
    dirty = true
    scheduleFlush()
  }

  function scheduleFlush() {
    if (flushTimer) return
    flushTimer = setTimeout(() => {
      flushTimer = null
      flush().catch(() => {})
    }, 3000)
  }

  async function flush() {
    if (!dirty) return
    dirty = false
    try {
      await mkdir(dirname(file), { recursive: true })
      const tmp = file + '.tmp'
      await writeFile(tmp, JSON.stringify(data))
      await rename(tmp, file)
    } catch {
      dirty = true
    }
  }

  function statBucket(b) {
    return {
      requests: b.requests || 0,
      tokens: b.tokens || 0,
      input: b.input || 0,
      output: b.output || 0,
      cacheRead: b.cacheRead || 0,
      cacheWrite: b.cacheWrite || 0,
    }
  }
  function cacheHitRate(hit, totalIn) {
    const d = hit + totalIn
    return d > 0 ? Math.round((hit / d) * 1000) / 10 : null
  }
  function sumRange(fromKey, toKey) {
    const agg = { requests: 0, tokens: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, byProvider: {}, byModel: [] }
    for (const [key, day] of Object.entries(data.days)) {
      if (key < fromKey || key > toKey) continue
      for (const [route, prov] of Object.entries(day.providers || {})) {
        const s = statBucket(prov)
        agg.requests += s.requests
        agg.tokens += s.tokens
        agg.input += s.input
        agg.output += s.output
        agg.cacheRead += s.cacheRead
        agg.cacheWrite += s.cacheWrite
        const bp = agg.byProvider[route] || (agg.byProvider[route] = { requests: 0, tokens: 0, input: 0, cacheRead: 0 })
        bp.requests += s.requests
        bp.tokens += s.tokens
        bp.input += s.input
        bp.cacheRead += s.cacheRead
        for (const [model, mb] of Object.entries(prov.models || {})) {
          const ms = statBucket(mb)
          let row = agg.byModel.find((x) => x.provider === route && x.model === model)
          if (!row) { row = { provider: route, model, requests: 0, tokens: 0 }; agg.byModel.push(row) }
          row.requests += ms.requests
          row.tokens += ms.tokens
        }
      }
    }
    agg.cacheHitRate = cacheHitRate(agg.cacheRead, agg.input)
    agg.byProvider = Object.entries(agg.byProvider)
      .map(([route, v]) => ({
        route, requests: v.requests, tokens: v.tokens, input: v.input, cacheRead: v.cacheRead,
        cacheHitRate: cacheHitRate(v.cacheRead, v.input),
      }))
      .sort((a, b) => b.tokens - a.tokens)
    agg.byModel.sort((a, b) => b.tokens - a.tokens)
    return agg
  }

  function obsDay(route) {
    const key = dateKey()
    const days = data.obs.days
    const day = days[key] || (days[key] = {})
    return day[route] || (day[route] = {})
  }

  /**
   * 观测服务商真实额度变动（不估算）：
   * - 余额类：余额下降 = 当日支出；余额上升 = 充值/赠金（分开记，不冲抵）
   * - 窗口类：同一重置周期内 usedPct 上升量 = 当日额度消耗
   */
  function observe(route, usage) {
    if (!usage) return
    let changed = false
    if (usage.balance && usage.balance.currency) {
      const cur = usage.balance.currency
      const val = Number(usage.balance.total)
      if (Number.isFinite(val)) {
        const last = data.obs.last[route]
        if (last && last.kind === 'balance' && last.currency === cur && Number.isFinite(last.total)) {
          const delta = last.total - val
          if (delta > 0.000001) {
            const d = obsDay(route)
            d.kind = 'balance'
            d.currency = cur
            d.spent = Math.round(((d.spent || 0) + delta) * 10000) / 10000
            changed = true
          } else if (delta < -0.000001) {
            const d = obsDay(route)
            d.kind = 'balance'
            d.currency = cur
            d.recharged = Math.round(((d.recharged || 0) - delta) * 10000) / 10000
            changed = true
          }
        }
        data.obs.last[route] = { kind: 'balance', total: val, currency: cur, ts: Date.now() }
      }
    }
    if (Array.isArray(usage.windows) && usage.windows.length) {
      const last = data.obs.last[route]
      const prevWindows = last && last.kind === 'windows' ? last.windows || {} : null
      const nextWindows = {}
      for (const w of usage.windows) {
        if (!w || !w.key) continue
        const used = Number(w.usedPct)
        if (!Number.isFinite(used)) continue
        const resetAt = w.resetAt || null
        const prev = prevWindows && prevWindows[w.key]
        if (prev && prev.resetAt === resetAt && used >= prev.used) {
          const delta = used - prev.used
          if (delta > 0.01) {
            const d = obsDay(route)
            d.kind = 'windows'
            if (!d.windows) d.windows = {}
            d.windows[w.key] = Math.round(((d.windows[w.key] || 0) + delta) * 10) / 10
            changed = true
          }
        }
        nextWindows[w.key] = { used, resetAt }
      }
      data.obs.last[route] = { kind: 'windows', windows: nextWindows, ts: Date.now() }
    }
    if (changed) { dirty = true; scheduleFlush() }
  }

  /** 今日观测汇总：{ [route]: {kind, currency?, spent?, recharged?, windows?} } */
  function spendToday() {
    const day = data.obs.days[dateKey()] || {}
    return day
  }

  /** @param {{days?: number}} opts 范围天数：1=当天，7/30=近 N 天（含当天） */
  function stats(opts = {}) {
    const rangeDays = Math.min(90, Math.max(1, Number(opts.days) || 7))
    const now = new Date()
    const todayKey = dateKey(now)
    const fromKey = dateKey(new Date(now.getTime() - (rangeDays - 1) * 86400000))
    const today = sumRange(todayKey, todayKey)
    const range = sumRange(fromKey, todayKey)
    const day = data.days[todayKey] || emptyDay()
    const hours = []
    for (let h = 0; h < 24; h++) {
      const b = day.hours[h]
      hours.push({ h, tokens: (b && b.tokens) || 0, requests: (b && b.requests) || 0, byProvider: (b && b.byProvider) || {} })
    }
    const daysList = []
    for (let i = rangeDays - 1; i >= 0; i--) {
      const key = dateKey(new Date(now.getTime() - i * 86400000))
      const d = data.days[key]
      const byProvider = {}
      for (const [route, prov] of Object.entries((d && d.providers) || {})) {
        const sb = statBucket(prov)
        byProvider[route] = { tokens: sb.tokens, requests: sb.requests, input: sb.input, cacheRead: sb.cacheRead }
      }
      daysList.push({ date: key, tokens: (d && d.tokens) || 0, requests: (d && d.requests) || 0, byProvider })
    }
    const kpi = (s) => ({ requests: s.requests, tokens: s.tokens, cacheHitRate: s.cacheHitRate })
    return {
      generatedAt: Date.now(),
      rangeDays,
      today: kpi(today),
      range: kpi(range),
      last7: kpi(sumRange(dateKey(new Date(now.getTime() - 6 * 86400000)), todayKey)),
      hours,
      days: daysList,
      providers: range.byProvider,
      todayByProvider: Object.entries((data.days[todayKey] && data.days[todayKey].providers) || {}).map(([route, prov]) => {
        const sb = statBucket(prov)
        return { route, requests: sb.requests, tokens: sb.tokens, cacheHitRate: cacheHitRate(sb.cacheRead, sb.input) }
      }),
      models: range.byModel,
      recent: (data.recent || []).slice(-100).reverse(),
      spendToday: spendToday(),
      backfilled: !!data.backfilled,
    }
  }

  return {
    ready: ensureLoaded,
    backfill,
    observe,
    record,
    stats,
    flush,
  }
}

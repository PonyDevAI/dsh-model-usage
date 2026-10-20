// Host 侧额度适配器：deepseek-official / deepseek-account / zai-coding-cn(zai)
// 设计约束：只请求写死的白名单域名；凭据只在 Host 内存中出现；错误 message 脱敏。

export function err(code, message) {
  const e = new Error(message)
  e.code = code
  return e
}

export function safeMsg(e) {
  return String((e && e.message) || e)
    .replace(/(sk-|Bearer\s+)[A-Za-z0-9._-]+/gi, '$1***')
    .slice(0, 200)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function clampPct(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}

/** 业务层错误提炼：有些接口（智谱）key 不对也返回 HTTP 200，真问题在 body 的 code/msg */
export function bizError(d) {
  if (!d || typeof d !== 'object') return ''
  if (d.success === false || d.ok === false) {
    return String(d.msg || d.message || d.error || 'success=false').slice(0, 160)
  }
  const c = Number(d.code)
  if (Number.isFinite(c) && c !== 0 && c !== 200 && d.msg) return String(d.msg).slice(0, 160)
  if (typeof d.error === 'string' && d.error) return d.error.slice(0, 160)
  return ''
}

/** 带超时的 fetch；网络层失败重试一次（undici 偶发 IPv6 优先导致 open.bigmodel.cn 连不上） */
export async function fetchT(url, init, ms) {
  const doFetch = async () => {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), ms || 10000)
    try {
      return await fetch(url, { ...init, signal: ctl.signal })
    } finally {
      clearTimeout(t)
    }
  }
  try {
    return await doFetch()
  } catch (e) {
    await sleep(400)
    return await doFetch()
  }
}

/** 按顺序解析凭据 ref：优先注入作用域的 credentials 服务，再回退环境变量 */
export async function resolveKey(env) {
  const cred = env.credentials
  for (const ref of env.refs || []) {
    if (!ref) continue
    if (cred && typeof cred.resolve === 'function') {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const hit = await cred.resolve(ref)
          if (hit && hit.value) return hit.value
          break
        } catch (e) {
          if (attempt === 0) {
            await sleep(700)
            continue
          }
        }
      }
    }
    if (process.env[ref]) return process.env[ref]
  }
  return null
}

export function safeGet(ctx, name) {
  try {
    return typeof ctx.get === 'function' ? ctx.get(name) : null
  } catch {
    return null
  }
}

/** GLM data.limits[] 按 type+unit 选窗口条目（数组顺序不保证，不能按下标） */
export function pickWindow(limits, unit) {
  if (!Array.isArray(limits)) return null
  for (const it of limits) {
    if (!it || typeof it !== 'object') continue
    const type = String(it.type || '')
    if (type !== 'TOKENS_LIMIT' && type !== 'CREDIT_LIMIT') continue
    if (Number(it.unit) !== unit) continue
    return it
  }
  return null
}

// ---------------------------------------------------------------- adapters

const deepseekBalance = {
  id: 'deepseek-balance',
  refs: (cfg, route) => [cfg.credentials[route] || 'DEEPSEEK_API_KEY'],
  async read(env) {
    const key = await resolveKey(env)
    if (!key) {
      return { status: 'needs-credential', credential: { refs: env.refs, configured: false } }
    }
    const custom = process.env.DEEPSEEK_BASE_URL
    if (custom) {
      try {
        if (new URL(custom).host !== 'api.deepseek.com') {
          return {
            status: 'unsupported',
            credential: { refs: env.refs, configured: true },
            error: { code: 'model-usage/custom-endpoint', message: 'DEEPSEEK_BASE_URL 指向自定义网关，该端点没有余额接口' },
          }
        }
      } catch {}
    }
    const res = await fetchT('https://api.deepseek.com/user/balance', {
      headers: { authorization: 'Bearer ' + key },
    }, 10000)
    if (res.status === 401 || res.status === 403) throw err('model-usage/unauthorized', 'HTTP ' + res.status + '（API key 无效或过期）')
    if (!res.ok) throw err('model-usage/http', 'HTTP ' + res.status)
    const data = await res.json()
    const biz = bizError(data)
    if (biz) return { status: 'error', error: { code: 'model-usage/biz', message: biz } }
    const infos = Array.isArray(data && data.balance_infos) ? data.balance_infos : []
    const pick = infos.find((i) => i && i.currency === 'CNY') || infos[0]
    if (!pick) {
      return { status: 'unsupported', error: { code: 'model-usage/empty', message: '余额响应缺少 balance_infos 字段' } }
    }
    return {
      status: 'ok',
      fetchedAt: Date.now(),
      credential: { refs: env.refs, configured: true },
      balance: {
        currency: String(pick.currency || 'CNY').toUpperCase(),
        total: String(pick.total_balance ?? ''),
        granted: String(pick.granted_balance ?? '0'),
        toppedUp: String(pick.topped_up_balance ?? '0'),
        available: data.is_available !== false,
      },
    }
  },
}

const deepseekAccount = {
  id: 'deepseek-account',
  refs: () => [],
  async read(env) {
    const acct = env.getAccount ? env.getAccount() : null
    if (!acct || typeof acct.getBalance !== 'function') {
      return { status: 'unsupported', error: { code: 'model-usage/no-service', message: '当前 DSH 没有账号余额服务' } }
    }
    const meta = {
      version: String(process.env.DSH_CLIENT_VERSION || process.env.DSH_VERSION || 'unknown'),
      locale: 'zh_CN',
      timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
    }
    const res = await Promise.race([
      acct.getBalance(meta).catch(() => null),
      new Promise((r) => setTimeout(() => r('timeout'), 15000)),
    ])
    if (res === 'timeout') throw err('model-usage/timeout', '账号余额请求超时（15s）')
    if (!res) return { status: 'needs-signin' }
    if (res.status !== 'ready') {
      return { status: 'error', error: { code: 'model-usage/account', message: '账号余额接口未就绪（' + String(res.status || 'unknown') + '）' } }
    }
    const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null }
    const usable = (list) => (Array.isArray(list) ? list : [])
      .map((w) => ({ cur: String((w && w.currency) || 'CNY').toUpperCase(), v: num(w && w.balance) }))
      .filter((w) => w.v !== null)
    const recharge = usable(res.value)
    const bonus = usable(res.bonusWallets)
    const all = recharge.concat(bonus)
    if (!all.length) {
      return { status: 'unsupported', error: { code: 'model-usage/empty', message: '账号没有可用的余额钱包' } }
    }
    const nonzero = all.filter((w) => w.v > 0)
    const cur = ((nonzero.find((w) => w.cur === 'CNY') || nonzero[0] || all.find((w) => w.cur === 'CNY') || all[0])).cur
    const sum = (l) => l.filter((w) => w.cur === cur).reduce((s, w) => s + w.v, 0)
    const fmt = (n) => n.toFixed(2)
    return {
      status: 'ok',
      fetchedAt: Date.now(),
      credential: { refs: [], configured: true },
      balance: {
        currency: cur,
        total: fmt(sum(recharge) + sum(bonus)),
        granted: fmt(sum(bonus)),
        toppedUp: fmt(sum(recharge)),
        available: true,
      },
    }
  },
}

const glmCoding = {
  id: 'glm-coding',
  refs: (cfg, route) => [cfg.credentials[route] || (route === 'zai' ? 'ZAI_API_KEY' : 'ZAI_CODING_CN_API_KEY')],
  async read(env) {
    const key = await resolveKey(env)
    if (!key) {
      return { status: 'needs-credential', credential: { refs: env.refs, configured: false } }
    }
    const host = env.route === 'zai' ? 'https://api.z.ai' : 'https://open.bigmodel.cn'
    const g = (env.config && env.config.glm) || {}
    const qs = []
    if (g.planType) qs.push('type=' + encodeURIComponent(String(g.planType)))
    const url = host + '/api/monitor/usage/quota/limit' + (qs.length ? '?' + qs.join('&') : '')
    const headers = {
      authorization: key,
      accept: 'application/json',
    }
    if (g.organization) headers['bigmodel-organization'] = String(g.organization)
    if (g.project) headers['bigmodel-project'] = String(g.project)
    let res = await fetchT(url, { headers }, 10000)
    if (res.status === 401) {
      const retry = { ...headers, authorization: 'Bearer ' + key }
      res = await fetchT(url, { headers: retry }, 10000)
    }
    if (res.status === 401 || res.status === 403) {
      throw err('model-usage/unauthorized', 'HTTP ' + res.status + '（key 无效或过期）')
    }
    if (!res.ok) throw err('model-usage/http', 'HTTP ' + res.status)
    const data = await res.json()
    const biz = bizError(data)
    if (biz) {
      const unsupported = /coding plan/i.test(biz)
      return {
        status: unsupported ? 'unsupported' : 'error',
        error: { code: 'model-usage/biz', message: unsupported ? biz + '（该 key 可能不是 Coding Plan 订阅账号）' : biz },
      }
    }
    const d = data && data.data
    const limits = d && Array.isArray(d.limits) ? d.limits : null
    if (!limits) {
      return { status: 'unsupported', error: { code: 'model-usage/shape', message: '响应缺少 data.limits 字段（接口可能改版）' } }
    }
    const windows = []
    for (const [k, label, unit] of [['rolling', '5h', 3], ['weekly', '周', 6]]) {
      const it = pickWindow(limits, unit)
      if (!it) continue
      windows.push({
        key: k,
        label,
        usedPct: clampPct(it.percentage),
        resetAt: Number(it.nextResetTime) || null,
      })
    }
    // 每月 MCP/工具调用次数限额：type=TIME_LIMIT, unit=5（月），usage=总量，remaining=剩余次数
    const timeLimit = limits.find((it) => it && String(it.type) === 'TIME_LIMIT' && Number(it.unit) === 5)
    if (timeLimit) {
      const limit = Number(timeLimit.usage)
      const remaining = Number(timeLimit.remaining)
      const pctRaw = Number(timeLimit.percentage)
      const usedPct = Number.isFinite(pctRaw) && timeLimit.percentage != null
        ? pctRaw
        : (Number.isFinite(limit) && limit > 0 && Number.isFinite(remaining) ? (1 - remaining / limit) * 100 : 0)
      windows.push({
        key: 'mcp',
        label: 'MCP',
        usedPct: clampPct(usedPct),
        resetAt: Number(timeLimit.nextResetTime) || null,
        countBased: true,
        limit: Number.isFinite(limit) ? limit : null,
        remaining: Number.isFinite(remaining) ? remaining : null,
        details: Array.isArray(timeLimit.usageDetails)
          ? timeLimit.usageDetails.map((it) => ({ code: String(it && it.modelCode || ''), usage: Number(it && it.usage) || 0 }))
          : null,
      })
    }
    if (!windows.length) {
      const types = limits.map((l) => (l && l.type) + '/' + (l && l.unit)).join(', ')
      return {
        status: 'unsupported',
        error: { code: 'model-usage/shape', message: 'data.limits 中未找到 5h/周窗口条目（got: ' + types + '）' },
      }
    }
    return {
      status: 'ok',
      fetchedAt: Date.now(),
      credential: { refs: env.refs, configured: true },
      plan: typeof d.level === 'string' ? d.level : '',
      windows,
    }
  },
}

function dotPath(obj, path) {
  let cur = obj
  for (const part of String(path || '').split('.')) {
    if (cur == null) return undefined
    cur = cur[part]
  }
  return cur
}
function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// Kimi Coding Plan（会员套餐）：GET https://api.kimi.com/coding/v1/usages
// 实测 schema（社区代码对线上接口验证 2026-07）：
//   usage:{limit,used,remaining,resetTime}  → 周窗口
//   limits:[{window:{duration,timeUnit},detail:{limit,used,resetTime}}] → 滚动窗口（300 分钟=5h）
const kimiCoding = {
  id: 'kimi-coding',
  refs: (cfg, route) => [cfg.credentials[route] || 'KIMI_CODING_API_KEY', 'KIMI_API_KEY', 'MOONSHOT_API_KEY'],
  async read(env) {
    const key = await resolveKey(env)
    if (!key) return { status: 'needs-credential', credential: { refs: env.refs, configured: false } }
    const res = await fetchT('https://api.kimi.com/coding/v1/usages', {
      headers: { authorization: 'Bearer ' + key, accept: 'application/json' },
    }, 10000)
    if (res.status === 401 || res.status === 403) throw err('model-usage/unauthorized', 'HTTP ' + res.status + '（Kimi 凭据无效）')
    if (!res.ok) throw err('model-usage/http', 'HTTP ' + res.status)
    const data = await res.json()
    const windows = []
    const weekly = data && data.usage
    if (weekly) {
      const limit = num(weekly.limit)
      const used = num(weekly.used)
      if (limit && limit > 0 && used != null) {
        windows.push({
          key: 'weekly',
          label: '周',
          usedPct: clampPct((used / limit) * 100),
          resetAt: weekly.resetTime ? Date.parse(weekly.resetTime) || null : null,
        })
      }
    }
    const limits = data && Array.isArray(data.limits) ? data.limits : []
    for (const entry of limits) {
      const detail = (entry && entry.detail) || {}
      const limit = num(detail.limit)
      const used = num(detail.used)
      if (!limit || limit <= 0 || used == null) continue
      const w = (entry.window || {})
      const dur = num(w.duration) || 0
      const unit = String(w.timeUnit || '')
      let label = '滚动窗口'
      if (unit === 'TIME_UNIT_MINUTE' && dur > 0) label = dur % 60 === 0 ? (dur / 60) + 'h' : dur + 'm'
      else if (unit === 'TIME_UNIT_HOUR' && dur > 0) label = dur + 'h'
      else if (unit === 'TIME_UNIT_DAY' && dur > 0) label = dur + 'd'
      windows.push({
        key: dur >= 240 && dur <= 360 ? 'rolling' : 'w' + Math.round(dur) + unit,
        label,
        usedPct: clampPct((used / limit) * 100),
        resetAt: detail.resetTime ? Date.parse(detail.resetTime) || null : null,
      })
    }
    if (!windows.length) {
      return { status: 'unsupported', error: { code: 'model-usage/shape', message: 'Kimi 响应中未找到额度窗口' } }
    }
    const level = data && data.user && data.user.membership && data.user.membership.level
    return {
      status: 'ok',
      fetchedAt: Date.now(),
      credential: { refs: env.refs, configured: true },
      plan: level ? String(level).replace(/^LEVEL_/, '').toLowerCase() : '',
      windows,
    }
  },
}

// OpenRouter 额度：GET https://openrouter.ai/api/v1/credits → data:{total_credits,total_usage}
// 兜底：GET /api/v1/key → data:{limit,usage,limit_remaining}
const openrouter = {
  id: 'openrouter',
  refs: (cfg, route) => [cfg.credentials[route] || 'OPENROUTER_API_KEY'],
  async read(env) {
    const key = await resolveKey(env)
    if (!key) return { status: 'needs-credential', credential: { refs: env.refs, configured: false } }
    const headers = { authorization: 'Bearer ' + key, accept: 'application/json' }
    const res = await fetchT('https://openrouter.ai/api/v1/credits', { headers }, 10000)
    if (res.status === 401 || res.status === 403) throw err('model-usage/unauthorized', 'HTTP ' + res.status + '（OpenRouter 凭据无效）')
    if (res.ok) {
      const body = await res.json()
      const d = (body && body.data) || {}
      const total = num(d.total_credits)
      const used = num(d.total_usage)
      if (total != null && used != null) {
        const remain = Math.max(0, total - used)
        return {
          status: 'ok',
          fetchedAt: Date.now(),
          credential: { refs: env.refs, configured: true },
          balance: {
            currency: 'USD',
            total: (Math.round(remain * 100) / 100).toFixed(2),
            toppedUp: (Math.round(total * 100) / 100).toFixed(2),
            granted: '0.00',
            available: remain > 0,
          },
        }
      }
    }
    const res2 = await fetchT('https://openrouter.ai/api/v1/key', { headers }, 10000)
    if (!res2.ok) throw err('model-usage/http', 'HTTP ' + res2.status)
    const body2 = await res2.json()
    const d2 = (body2 && body2.data) || {}
    const remain2 = num(d2.limit_remaining)
    const limit = num(d2.limit)
    const usage = num(d2.usage) || 0
    if (remain2 == null && limit == null) {
      return { status: 'unsupported', error: { code: 'model-usage/shape', message: 'OpenRouter 未返回额度字段' } }
    }
    const total = remain2 != null ? remain2 : Math.max(0, (limit || 0) - usage)
    return {
      status: 'ok',
      fetchedAt: Date.now(),
      credential: { refs: env.refs, configured: true },
      balance: { currency: 'USD', total: (Math.round(total * 100) / 100).toFixed(2), toppedUp: limit != null ? (Math.round(limit * 100) / 100).toFixed(2) : '', granted: '0.00', available: total > 0 },
    }
  },
}

// OpenCode Go（订阅）：GET https://opencode.ai/zen/go/v1/usage  Bearer
// 响应 { usage: { rolling: { percent, resetsAt }, weekly: {...}, monthly: {...} } }
const opencodeGo = {
  id: 'opencode-go',
  refs: (cfg, route) => [cfg.credentials[route] || 'OPENCODE_API_KEY'],
  async read(env) {
    const key = await resolveKey(env)
    if (!key) return { status: 'needs-credential', credential: { refs: env.refs, configured: false } }
    const res = await fetchT('https://opencode.ai/zen/go/v1/usage', { headers: { authorization: 'Bearer ' + key, accept: 'application/json' } }, 10000)
    if (res.status === 401 || res.status === 403) throw err('model-usage/unauthorized', 'HTTP ' + res.status + '（OpenCode Key 无效）')
    if (!res.ok) throw err('model-usage/http', 'HTTP ' + res.status)
    const data = await res.json()
    const u = (data && data.usage) || {}
    const windows = []
    for (const [key2, label] of [['rolling', '5h'], ['weekly', '周'], ['monthly', '月']]) {
      const it = u[key2]
      if (!it || typeof it !== 'object') continue
      const pct = Number(it.percent)
      if (!Number.isFinite(pct)) continue
      const resetRaw = it.resetsAt
      const resetAt = typeof resetRaw === 'string' ? Date.parse(resetRaw) || null : (Number(resetRaw) || null)
      windows.push({ key: key2 === 'rolling' ? 'rolling' : key2 === 'weekly' ? 'weekly' : 'monthly', label, usedPct: clampPct(pct), resetAt })
    }
    if (!windows.length) return { status: 'unsupported', error: { code: 'model-usage/shape', message: 'OpenCode Go 未返回 usage 窗口' } }
    return { status: 'ok', fetchedAt: Date.now(), credential: { refs: env.refs, configured: true }, windows }
  },
}

// Moonshot / Kimi 平台余额：GET https://api.moonshot.{cn,ai}/v1/users/me/balance  Bearer
// 响应 { data: { available_balance, voucher_balance, cash_balance } }
const moonshotBalance = {
  id: 'moonshot-balance',
  refs: (cfg, route) => [cfg.credentials[route] || (/cn$/.test(route) ? 'MOONSHOT_CN_API_KEY' : 'MOONSHOT_API_KEY'), 'MOONSHOT_API_KEY', 'KIMI_API_KEY', 'MOONSHOT_CN_API_KEY'],
  async read(env) {
    const key = await resolveKey(env)
    if (!key) return { status: 'needs-credential', credential: { refs: env.refs, configured: false } }
    const cn = /cn$/.test(env.route || '')
    const host = cn ? 'https://api.moonshot.cn' : 'https://api.moonshot.ai'
    const res = await fetchT(host + '/v1/users/me/balance', { headers: { authorization: 'Bearer ' + key, accept: 'application/json' } }, 10000)
    if (res.status === 401 || res.status === 403) throw err('model-usage/unauthorized', 'HTTP ' + res.status + '（Moonshot Key 无效）')
    if (!res.ok) throw err('model-usage/http', 'HTTP ' + res.status)
    const body = await res.json()
    const d = (body && body.data) || body || {}
    const pick = (k) => { const v = Number(d[k]); return Number.isFinite(v) ? v : null }
    const available = pick('available_balance')
    if (available == null) return { status: 'unsupported', error: { code: 'model-usage/shape', message: 'Moonshot 未返回 available_balance' } }
    const cash = pick('cash_balance')
    const voucher = pick('voucher_balance')
    const cur = cn ? 'CNY' : 'USD'
    return {
      status: 'ok',
      fetchedAt: Date.now(),
      credential: { refs: env.refs, configured: true },
      balance: {
        currency: cur,
        total: available.toFixed(2),
        toppedUp: cash != null ? cash.toFixed(2) : '',
        granted: voucher != null ? voucher.toFixed(2) : '',
        available: available > 0,
      },
    }
  },
}

// MiniMax Token Plan：GET {api.minimax.io|api.minimaxi.com}/v1/token_plan/remains  Bearer
// 响应 model_remains[] / models[]：current_interval_remaining_percent、current_weekly_remaining_percent、
// remains_time（毫秒）、weekly_remains_time、end_time / weekly_end_time
const minimaxPlan = {
  id: 'minimax-plan',
  refs: (cfg, route) => [cfg.credentials[route] || (/cn$/.test(route) ? 'MINIMAX_CN_API_KEY' : 'MINIMAX_API_KEY')],
  async read(env) {
    const key = await resolveKey(env)
    if (!key) return { status: 'needs-credential', credential: { refs: env.refs, configured: false } }
    const cn = /cn$/.test(env.route || '')
    const url = cn ? 'https://api.minimaxi.com/v1/token_plan/remains' : 'https://api.minimax.io/v1/token_plan/remains'
    const res = await fetchT(url, { headers: { authorization: 'Bearer ' + key, accept: 'application/json' } }, 10000)
    if (res.status === 401 || res.status === 403) throw err('model-usage/unauthorized', 'HTTP ' + res.status + '（需要 MiniMax 订阅 Key，不是按量付费 Key）')
    if (!res.ok) throw err('model-usage/http', 'HTTP ' + res.status)
    const body = await res.json()
    const base = (body && body.base_resp) || {}
    if (Number(base.status_code) && Number(base.status_code) !== 0) {
      return { status: 'unsupported', error: { code: 'model-usage/biz', message: String(base.status_msg || base.status_code) } }
    }
    const rows = [body.model_remains, body.models, body.data, body.data && body.data.model_remains].find((x) => Array.isArray(x) && x.length)
    if (!rows) return { status: 'unsupported', error: { code: 'model-usage/shape', message: 'MiniMax 未返回 model_remains' } }
    const n = (row, keys) => {
      for (const k of keys) { const v = Number(row[k]); if (Number.isFinite(v)) return v }
      return null
    }
    // 取第一条有配额的行（多模型时展示主模型）
    let picked = null
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue
      const intervalPct = n(row, ['current_interval_remaining_percent', 'interval_remaining_percent', 'current_interval_remain_percent'])
      const weeklyPct = n(row, ['current_weekly_remaining_percent', 'weekly_remaining_percent', 'current_weekly_remain_percent'])
      if (intervalPct == null && weeklyPct == null) continue
      picked = { row, intervalPct, weeklyPct }
      break
    }
    if (!picked) return { status: 'unsupported', error: { code: 'model-usage/shape', message: 'MiniMax 配额字段缺失' } }
    const now = Date.now()
    const remainsToReset = (row, keys) => {
      const ms = n(row, keys)
      return ms == null ? null : now + ms
    }
    const endAt = (row, keys) => {
      const v = n(row, keys)
      if (v == null) return null
      return v < 1e12 ? v * 1000 : v
    }
    const windows = []
    if (picked.intervalPct != null) {
      windows.push({
        key: 'rolling', label: '5h',
        usedPct: clampPct(100 - picked.intervalPct),
        resetAt: endAt(picked.row, ['end_time', 'current_interval_end_time', 'interval_end_time']) || remainsToReset(picked.row, ['remains_time', 'current_interval_remains_time', 'interval_remains_time']),
      })
    }
    if (picked.weeklyPct != null) {
      windows.push({
        key: 'weekly', label: '周',
        usedPct: clampPct(100 - picked.weeklyPct),
        resetAt: endAt(picked.row, ['weekly_end_time', 'current_weekly_end_time']) || remainsToReset(picked.row, ['weekly_remains_time', 'current_weekly_remains_time']),
      })
    }
    const plan = (typeof (picked.row.subscribe_title || picked.row.plan_name || body.plan_name) === 'string') ? String(picked.row.subscribe_title || picked.row.plan_name || body.plan_name) : ''
    return { status: 'ok', fetchedAt: Date.now(), credential: { refs: env.refs, configured: true }, plan, windows }
  },
}

// Xiaomi MiMo 余额：GET https://platform.xiaomimimo.com/api/v1/balance  Bearer
const xiaomiBalance = {
  id: 'xiaomi-balance',
  refs: (cfg, route) => [cfg.credentials[route] || 'XIAOMI_API_KEY'],
  async read(env) {
    const key = await resolveKey(env)
    if (!key) return { status: 'needs-credential', credential: { refs: env.refs, configured: false } }
    const res = await fetchT('https://platform.xiaomimimo.com/api/v1/balance', { headers: { authorization: 'Bearer ' + key, accept: 'application/json' } }, 10000)
    if (res.status === 401 || res.status === 403) throw err('model-usage/unauthorized', 'HTTP ' + res.status + '（Xiaomi Key 无效）')
    if (!res.ok) throw err('model-usage/http', 'HTTP ' + res.status)
    const body = await res.json()
    const d = (body && (body.data || body.result)) || body || {}
    const val = [d.balance, d.remaining, d.available_balance, d.total_balance].map(Number).find((v) => Number.isFinite(v))
    if (val == null) return { status: 'unsupported', error: { code: 'model-usage/shape', message: 'Xiaomi 未返回余额字段' } }
    return {
      status: 'ok',
      fetchedAt: Date.now(),
      credential: { refs: env.refs, configured: true },
      balance: { currency: 'CNY', total: val.toFixed(2), toppedUp: '', granted: '', available: val > 0 },
    }
  },
}

// GitHub Copilot：GET https://api.github.com/copilot_internal/user  Bearer(GitHub token)
// 响应 quota_snapshots: { premium_interactions|chat|completions: { entitlement, remaining, percent_remaining } }
const githubCopilot = {
  id: 'github-copilot',
  refs: (cfg, route) => [cfg.credentials[route] || 'GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_COPILOT_TOKEN'],
  async read(env) {
    const key = await resolveKey(env)
    if (!key) return { status: 'needs-credential', credential: { refs: env.refs, configured: false } }
    const res = await fetchT('https://api.github.com/copilot_internal/user', {
      headers: { authorization: 'Bearer ' + key, accept: 'application/json', 'user-agent': 'dsh-model-usage' },
    }, 10000)
    if (res.status === 401 || res.status === 403) throw err('model-usage/unauthorized', 'HTTP ' + res.status + '（需要 GitHub Copilot token）')
    if (!res.ok) throw err('model-usage/http', 'HTTP ' + res.status)
    const body = await res.json()
    const snap = body && body.quota_snapshots
    if (!snap || typeof snap !== 'object') return { status: 'unsupported', error: { code: 'model-usage/shape', message: 'Copilot 未返回 quota_snapshots（非 Copilot 账号或接口改版）' } }
    const windows = []
    let resetAt = null
    const qr = Number(body.quota_reset_date)
    if (Number.isFinite(qr)) resetAt = qr < 1e12 ? qr * 1000 : qr
    for (const [key2, label] of [['premium_interactions', 'Premium'], ['chat', 'Chat'], ['completions', '补全']]) {
      const it = snap[key2]
      if (!it || typeof it !== 'object') continue
      const pctRemain = Number(it.percent_remaining)
      const remain = Number(it.remaining)
      const ent = Number(it.entitlement)
      let usedPct = null
      let countBased = false
      let remaining = null
      let limit = null
      if (Number.isFinite(pctRemain)) usedPct = clampPct(100 - pctRemain)
      else if (Number.isFinite(remain) && Number.isFinite(ent) && ent > 0) usedPct = clampPct(((ent - remain) / ent) * 100)
      if (Number.isFinite(remain) && Number.isFinite(ent)) { countBased = true; remaining = remain; limit = ent }
      if (usedPct == null) continue
      windows.push({ key: key2, label, usedPct, resetAt, countBased, remaining, limit })
    }
    if (!windows.length) return { status: 'unsupported', error: { code: 'model-usage/shape', message: 'Copilot 配额为空' } }
    const plan = typeof body.copilot_plan === 'string' ? body.copilot_plan : ''
    return { status: 'ok', fetchedAt: Date.now(), credential: { refs: env.refs, configured: true }, plan, windows }
  },
}

// 通用自定义额度：任何供应商都能通过 cordis.patch.yml 的 customQuota 配置接入
// customQuota: { [route]: { url, auth:'bearer'|'raw'|'x-api-key'|'none', keyRef, headers,
//                          balance:{path,currencyPath,currency}, windows:[{key,label,usedPath,limitPath,resetAtPath,resetAtUnit}] } }
const customQuota = {
  id: 'custom-quota',
  refs: (cfg, route) => {
    const c = (cfg.customQuota && cfg.customQuota[route]) || {}
    return [c.keyRef || (cfg.credentials && cfg.credentials[route]) || route.toUpperCase().replace(/[^A-Z0-9]+/g, '_') + '_API_KEY']
  },
  async read(env) {
    const c = (env.config.customQuota && env.config.customQuota[env.route]) || null
    if (!c || !c.url) return { status: 'unsupported', error: { code: 'model-usage/config', message: '缺少 customQuota 配置' } }
    const u = new URL(String(c.url))
    const key = await resolveKey(env)
    const headers = { accept: 'application/json', ...(c.headers || {}) }
    if (key) {
      if (c.auth === 'raw') headers.authorization = key
      else if (c.auth === 'x-api-key') headers['x-api-key'] = key
      else headers.authorization = 'Bearer ' + key
    }
    const res = await fetchT(u.toString(), { headers }, 10000)
    if (res.status === 401 || res.status === 403) throw err('model-usage/unauthorized', 'HTTP ' + res.status)
    if (!res.ok) throw err('model-usage/http', 'HTTP ' + res.status)
    const body = await res.json()
    if (c.balance && c.balance.path) {
      const total = num(dotPath(body, c.balance.path))
      if (total == null) return { status: 'unsupported', error: { code: 'model-usage/shape', message: 'customQuota.balance.path 未取到数值' } }
      const currency = c.balance.currencyPath ? String(dotPath(body, c.balance.currencyPath) || c.balance.currency || 'USD') : (c.balance.currency || 'USD')
      return {
        status: 'ok',
        fetchedAt: Date.now(),
        credential: { refs: env.refs, configured: true },
        balance: { currency, total: total.toFixed(2), toppedUp: '', granted: '', available: total > 0 },
      }
    }
    if (Array.isArray(c.windows) && c.windows.length) {
      const windows = []
      for (const w of c.windows) {
        const limit = num(dotPath(body, w.limitPath))
        const used = num(dotPath(body, w.usedPath))
        if (!limit || limit <= 0 || used == null) continue
        let resetAt = null
        if (w.resetAtPath) {
          const raw = dotPath(body, w.resetAtPath)
          if (w.resetAtUnit === 'iso' || typeof raw === 'string') resetAt = Date.parse(raw) || null
          else if (w.resetAtUnit === 's') resetAt = Number(raw) * 1000 || null
          else resetAt = Number(raw) || null
        }
        windows.push({ key: w.key || 'w' + windows.length, label: w.label || w.key || '窗口', usedPct: clampPct((used / limit) * 100), resetAt })
      }
      if (!windows.length) return { status: 'unsupported', error: { code: 'model-usage/shape', message: 'customQuota.windows 未取到有效窗口' } }
      return { status: 'ok', fetchedAt: Date.now(), credential: { refs: env.refs, configured: true }, windows }
    }
    return { status: 'unsupported', error: { code: 'model-usage/config', message: 'customQuota 需要 balance 或 windows 配置' } }
  },
}

export function adapterFor(route, cfg) {
  if (!route) return null
  if (route === 'deepseek-official' || route === 'deepseek') return deepseekBalance
  if (route === 'deepseek-account') return deepseekAccount
  if (route === 'zai-coding-cn' || route === 'zai') return glmCoding
  if (/^openrouter/i.test(route)) return openrouter
  if (/^kimi-coding/i.test(route)) return kimiCoding
  if (/^(moonshot|kimi)/i.test(route)) return moonshotBalance
  if (/^minimax/i.test(route)) return minimaxPlan
  if (/^opencode-go/i.test(route)) return opencodeGo
  if (/^(xiaomi|mimo)/i.test(route)) return xiaomiBalance
  if (/^github-copilot/i.test(route)) return githubCopilot
  if (cfg && cfg.customQuota && cfg.customQuota[route] && cfg.customQuota[route].url) return customQuota
  return null
}
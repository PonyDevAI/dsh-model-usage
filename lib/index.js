// dsh-model-usage · Host 半区
// - session/event 跟踪每个会话当前 provider；模型调用后尽快刷新对应额度
// - 自挂 /model-usage 前缀路由（webServer.register + connection.admit 认证围栏），
//   纯 JSON 协议：POST { endpoint, payload } → { ok, value } | { ok, error }
//   （不走 connection.rpc.handle：其内部对 connection fiber 的 webServer 访问
//    在 web 组合下会抛 without inject —— 参见 dsh-api-gateway 的同类做法）
// - 凭据只在 Host 进程内存中出现；TTL 缓存 + 单飞 + 指数退避
import { adapterFor, fetchT, safeMsg } from './adapters.js'
import { createLedger } from './ledger.js'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'

const PKG_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS_DIR = join(PKG_DIR, 'assets', 'logos')
const REGISTRY = 'https://registry.npmjs.org/'
const PKG_NAME = '@ponydev/dsh-model-usage'

/** 自身版本（读 package.json；失败返回 '0.0.0'） */
let SELF_VERSION = '0.0.0'
try {
  SELF_VERSION = JSON.parse(readFileSync(join(PKG_DIR, 'package.json'), 'utf8')).version || '0.0.0'
} catch {}

/** 检查 npm 最新版本（10 分钟缓存；force 跳过缓存） */
let updateCache = { at: 0, data: null }
async function checkUpdate(force) {
  const now = Date.now()
  if (!force && updateCache.data && now - updateCache.at < 10 * 60 * 1000) return updateCache.data
  const url = REGISTRY + PKG_NAME.replace('/', '%2F') + '/latest'
  let latest = null
  let error = null
  try {
    const res = await fetchT(url, { headers: { accept: 'application/json' } }, 8000)
    if (res.ok) {
      const body = await res.json()
      latest = typeof body.version === 'string' ? body.version : null
      if (!latest) error = 'registry 未返回 version'
    } else {
      error = 'HTTP ' + res.status
    }
  } catch (e) {
    error = safeMsg(e)
  }
  const data = {
    current: SELF_VERSION,
    latest,
    updateAvailable: !!(latest && latest !== SELF_VERSION && cmpVersion(latest, SELF_VERSION) > 0),
    registry: REGISTRY,
    name: PKG_NAME,
    command: 'dsh plugin --profile web add ' + PKG_NAME + (latest ? '@' + latest : '') + ' --registry=' + REGISTRY,
    error,
    checkedAt: now,
  }
  if (latest) updateCache = { at: now, data }
  return data
}
function cmpVersion(a, b) {
  const pa = String(a).split(/[.-]/).map((x) => parseInt(x, 10) || 0)
  const pb = String(b).split(/[.-]/).map((x) => parseInt(x, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0
    if (x !== y) return x > y ? 1 : -1
  }
  return 0
}

/** 用户自定义 logo 目录（$DSH_HOME/model-usage/logos） */
function userLogosDir() {
  const home = process.env.DSH_HOME && process.env.DSH_HOME.trim() ? process.env.DSH_HOME.trim() : join(homedir(), '.dsh')
  return join(home, 'model-usage', 'logos')
}
function validLogoSlug(v) {
  return typeof v === 'string' && /^[a-z0-9][a-z0-9_-]{0,39}$/.test(v) ? v : null
}

const DEFAULTS = {
  refreshSeconds: 60,
  footer: true,
  credentials: {},
  glm: {},
  customQuota: {},
}

export const name = 'dsh-model-usage'

const prettyNames = {
  'deepseek-official': 'DeepSeek',
  'deepseek-account': 'DeepSeek 账号',
  'zai-coding-cn': 'GLM Coding Plan',
  zai: 'GLM Coding (国际)',
}

function prettyName(p) {
  return prettyNames[p.id] || p.name || p.id
}

export function apply(ctx, rawConfig) {
  const raw = rawConfig || {}
  const config = { ...DEFAULTS, ...raw }
  config.credentials = { ...DEFAULTS.credentials, ...(raw.credentials || {}) }
  config.glm = { ...DEFAULTS.glm, ...(raw.glm || {}) }
  config.customQuota = { ...(raw.customQuota || {}) }
  config.refreshSeconds = Math.max(15, Number(config.refreshSeconds) || 60)

  const ok = (value) => ({ ok: true, value })
  const fail = (code, message) => ({ ok: false, error: { code, message, details: {} } })

  const state = {
    pendingRequest: new Map(),   // sessionId -> { t, provider, model }  (request/context 时间)
    sessionProviders: new Map(), // sessionId -> provider route
    lastActive: null,            // { route, ts } 最近一次真实模型调用的 provider（侧边栏「当前供应商」用）
    cache: new Map(),            // route -> { inflight, lastAttempt, backoffUntil, lastBackoff, data }
  }
  let listRoutes = async () => []   // 在 llm/credentials 注入后替换
  let quotaScope = null             // llm/credentials 注入作用域，供适配器访问凭据
  const ledger = createLedger()

  function staleView(c) {
    return { ...c.data, status: 'stale', stale: true }
  }

  // 可选服务：用 ctx.get 宽松读取（服务缺失时返回 null，绝不能进 inject —— 否则老宿主上整个插件不启动）
  function getAccount() {
    try {
      return typeof ctx.get === 'function' ? ctx.get('deepseekAccount') : null
    } catch {
      return null
    }
  }

  async function getUsage(ad, routeId, force) {
    let c = state.cache.get(routeId)
    if (!c) {
      c = { inflight: null, lastAttempt: 0, backoffUntil: 0, lastBackoff: 0, data: null }
      state.cache.set(routeId, c)
    }
    if (c.inflight) return c.inflight
    const ttl = config.refreshSeconds * 1000
    const now = Date.now()
    if (!force && c.data && now - c.lastAttempt < ttl) return c.data
    if (!force && now < c.backoffUntil && c.data) return staleView(c)

    const refs = ad.refs(config, routeId)
    const env = {
      ctx: quotaScope,
      credentials: quotaScope ? quotaScope.credentials : undefined,
      getAccount,
      config,
      route: routeId,
      refs,
    }
    const p = (async () => {
      try {
        const d = await ad.read(env)
        d.route = routeId
        d.adapter = ad.id
        if (!d.credential) d.credential = { refs, configured: true }
        try { ledger.observe(routeId, d) } catch {}
        c.data = d
        c.lastAttempt = Date.now()
        c.backoffUntil = 0
      } catch (e) {
        c.lastAttempt = Date.now()
        c.lastBackoff = c.lastBackoff ? Math.min(300000, c.lastBackoff * 2) : 60000
        c.backoffUntil = Date.now() + c.lastBackoff
        const error = { code: 'model-usage/fetch-failed', message: safeMsg(e) }
        c.data = c.data
          ? { ...c.data, status: 'stale', stale: true, error }
          : { route: routeId, adapter: ad.id, status: 'error', error }
      } finally {
        c.inflight = null
      }
      return c.data
    })()
    c.inflight = p
    return p
  }

  function triggerFetch(routeId) {
    const ad = adapterFor(routeId, config)
    if (!ad) return
    getUsage(ad, routeId, true).catch(() => {})
  }

  async function buildSnapshot(force) {
    const routes = await listRoutes()
    const providers = []
    for (const r of routes) {
      const base = { route: r.id, displayName: prettyName(r) }
      try {
        const cq = config.customQuota && config.customQuota[r.id]
        const slug = validLogoSlug(cq && cq.logo)
        if (slug) base.logoSlug = slug
      } catch {}
      const ad = adapterFor(r.id, config)
      if (!ad) {
        providers.push({ ...base, adapter: 'none', status: 'idle' })
        continue
      }
      const usage = await getUsage(ad, r.id, force)
      providers.push({ ...base, ...usage })
    }
    return { generatedAt: Date.now(), refreshSeconds: config.refreshSeconds, providers }
  }

  function publicConfig() {
    return {
      refreshSeconds: config.refreshSeconds,
      entries: {
        footer: !!config.footer,
      },
    }
  }

  async function handleRpc(endpoint, payload) {
    switch (endpoint) {
      case 'snapshot':
        return ok(await buildSnapshot(!!(payload && payload.refresh)))
      case 'session-provider': {
        // 带 sessionId → 该会话当前 provider；不带 → 全局最近活跃的 provider（侧边栏「当前供应商」）
        const sid = payload && payload.sessionId
        if (sid) return ok({ route: state.sessionProviders.get(sid) || null })
        return ok({ route: (state.lastActive && state.lastActive.route) || null })
      }
      case 'config':
        return ok(publicConfig())
      case 'stats':
        return ok(ledger.stats({ days: payload && payload.days }))
      case 'update-check':
        return ok(await checkUpdate(!!(payload && payload.force)))
      default:
        return fail('model-usage/unknown-endpoint', 'unknown endpoint: ' + String(endpoint))
    }
  }

  // ---- 账本：加载 + 退出前落盘
  ctx.effect(() => {
    Promise.resolve(ledger.ready())
      .then(() => ledger.backfill())
      .catch(() => {})
    return () => { ledger.flush().catch(() => {}) }
  }, 'dmu: ledger lifecycle')

  // ---- 会话事件：跟踪每个会话当前 provider + 模型调用后尽快刷新对应额度
  ctx.effect(() => ctx.on('session/event', (session, event) => {
    try {
      const sid = session && session.id
      const type = event && event.type
      const d = event && event.data
      if (!sid || !d) return
      if (type === 'step/start') {
        state.pendingRequest.set(sid, { t: (event && event.time) || Date.now() })
        return
      }
      if (type === 'request/context' && d.provider) {
        state.sessionProviders.set(sid, d.provider)
        state.lastActive = { route: d.provider, ts: Date.now() }
        return
      }
      if (type === 'assistant/message' && d.message && d.message.source && d.message.source.provider) {
        const prov = d.message.source.provider
        const model = d.message.source.model || ''
        state.sessionProviders.set(sid, prov)
        state.lastActive = { route: prov, ts: Date.now() }
        const u = d.usage
        if (u && typeof u === 'object') {
          try {
            const pending = state.pendingRequest.get(sid)
            state.pendingRequest.delete(sid)
            const tMsg = (event && event.time) || Date.now()
            const stream = Array.isArray(d.stream) ? d.stream : []
            const firstTime = stream.length && Number.isFinite(stream[0].time) ? stream[0].time : null
            const ttftMs = pending && firstTime && firstTime >= pending.t ? firstTime - pending.t : null
            const durationMs = pending ? Math.max(0, tMsg - pending.t) : null
            ledger.record(prov, model, {
              input: u.inputTokens,
              cacheRead: u.cacheReadTokens,
              cacheWrite: u.cacheWriteTokens,
              output: u.outputTokens,
            }, { time: tMsg, durationMs, ttftMs })
          } catch {}
        }
        if (state.cache.has(prov)) {
          const c = state.cache.get(prov)
          if (Date.now() - c.lastAttempt > 15000) triggerFetch(prov)
        }
      }
    } catch {}
  }), 'dmu: session events')

  // ---- 额度面（需要 llm + credentials）
  ctx.inject(['llm', 'credentials'], (scope) => {
    quotaScope = scope
    listRoutes = async () => {
      try {
        const llm = scope.llm
        return (llm && typeof llm.listProviders === 'function' ? llm.listProviders() : [])
          .map((p) => ({ id: p.id, name: p.name }))
      } catch {
        return []
      }
    }
    scope.effect(() => scope.on('llm/adapters-updated', () => {
      for (const c of state.cache.values()) c.lastAttempt = 0
    }), 'dmu: adapters-updated')
  })

  // ---- 前端路由（connection.admit 认证围栏 + webServer 注册）
  ctx.inject(['connection', 'webServer'], (scope) => {
    scope.effect(() => scope.webServer.register({
      kind: 'prefix',
      path: '/model-usage',
      handler: async (req, res) => {
        const admission = scope.connection.admit(req)
        if ('rejection' in admission) {
          res.writeHead(admission.rejection)
          res.end(admission.rejection === 401 ? 'unauthorized' : 'forbidden')
          return
        }
        const json = (code, obj) => {
          res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          res.end(JSON.stringify(obj))
        }
        try {
          // 官方品牌 Logo 静态资产：GET /model-usage/logo/<slug>.svg
          if (req.method === 'GET') {
            const pn = (req.url || '').split('?')[0]
            const m = /^\/model-usage\/logo\/([a-z0-9_-]+)\.svg$/.exec(pn)
            if (m) {
              const name = m[1]
              if (!/^[a-z0-9_-]+$/.test(name)) { res.writeHead(404); res.end(); return }
              try {
                const svg = await readFile(join(ASSETS_DIR, name + '.svg'), 'utf8')
                res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400' })
                res.end(svg)
              } catch {
                // 用户自定义供应商 logo：$DSH_HOME/model-usage/logos/<slug>.svg
                try {
                  const svg = await readFile(join(userLogosDir(), name + '.svg'), 'utf8')
                  res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=3600' })
                  res.end(svg)
                } catch {
                  res.writeHead(404); res.end()
                }
              }
              return
            }
          }
          if (req.method !== 'POST') {
            json(405, fail('model-usage/method', 'POST only'))
            return
          }
          const body = await readBody(req, 1 << 20)
          let parsed = {}
          try { parsed = JSON.parse(body || '{}') } catch { json(400, fail('model-usage/bad-request', 'body is not JSON')); return }
          const result = await handleRpc(String(parsed.endpoint || ''), parsed.payload)
          json(200, result)
        } catch (e) {
          json(200, fail('model-usage/internal', safeMsg(e)))
        }
      },
    }), 'dmu: route')
  })
}

function readBody(req, cap) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > cap) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

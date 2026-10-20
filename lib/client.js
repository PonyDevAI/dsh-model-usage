// dsh-model-usage · Client 半区（手写 ModuleLoader bundle，UI 全部对齐 DSH 原生规范）
// 入口：侧边栏底部（原生 42px 行，Codex 式当前供应商）/ 设置 → 模型用量。
// 组件：官方 dsh-client-ui-primitives（Modal/Button/Pill/StateDot/Tooltip/锚定弹层）。
window.__ModuleLoader__.load({
  id: '@ponydev/dsh-model-usage',
  factory(require) {
    const React = require('react')
    const ReactDOM = require('react-dom')
    const P = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement
    const { useState, useEffect, useRef, useCallback } = React

    const NS = 'dsh-model-usage'

    // ---------------------------------------------------------------- i18n
    const zh = {
      nav: '模型用量',
      footName: '模型额度',
      refresh: '刷新',
      refreshAll: '刷新全部',
      close: '关闭',
      totalBalance: '总余额',
      grantedBalance: '赠金',
      toppedUpBalance: '充值余额',
      available: '可用',
      unavailable: '余额不足',
      needsCred: '未配置凭据',
      limitRolling: '5 小时限额',
      limitWeekly: '每周限额',
      remaining: '剩余 {n}%',
      resetIn: '{t}后重置',
      warnHigh: '已用偏高',
      critHigh: '即将用尽',
      relJustNow: '刚刚',
      relSecAgo: '{n} 秒前',
      relMinAgo: '{n} 分钟前',
      relHourAgo: '{n} 小时前',
      stale: '已过期 · {ago}',
      waitingHost: '正在等待宿主接口（/model-usage）… 重启 dsh web 后可用',
      waitingStats: '正在加载统计…',
      tabOverview: '总览', tabQuota: '额度', tabLog: '请求日志', tabToday: '当天', tab7d: '近 7 天', tab30d: '近 30 天', tabsLabel: '模型用量视图',
      chipAll: '全部供应商', metricTokens: 'Tokens', metricRequests: '请求数', modelsQuotaTitle: '供应商额度', filterProvider: '按供应商筛选', exportShort: 'CSV', modalStatsTitle: '今日用量', fullStatsHint: '完整统计在 设置 → 模型用量',
      spendTitle: '今日实际消耗', spentWord: '支出', rechargedWord: '充值', windowSpentWord: '额度消耗', thTime: '时间', thInput: '输入', thOutput: '输出', thCache: '缓存读', thDur: '耗时', thTtft: '首字', noLog: '暂无请求记录',
      shortAccount: '账号', remainCompact: '剩 {n}%', remainPrefix: '剩 ', remainSuffix: '', statsError: '统计加载失败', retry: '重试', emptyData: '暂无数据', emptyUsage: '今天还没有调用记录',
      kpiRequests: '模型调用', kpiTokens: '消耗 Tokens', kpiCacheHit: '缓存命中率',
      limitMcp: '每月 MCP 工具', limitMonthly: '每月限额', remainCalls: '剩余 {n}/{m} 次',
      groupCurrent: '当前会话在用', groupSub: '订阅窗口', groupApi: 'API 余额', groupWallet: '账号钱包', groupOther: '其他',
      trendTitle: '使用趋势',
      thProvider: '供应商', thModel: '模型', thRequests: '请求数', thTokens: 'Tokens',
      lang: 'zh',
    }
    const en = {
      nav: 'Model usage',
      footName: 'Model quota',
      refresh: 'Refresh',
      refreshAll: 'Refresh all',
      close: 'Close',
      totalBalance: 'Total',
      grantedBalance: 'Granted',
      toppedUpBalance: 'Topped up',
      available: 'Available',
      unavailable: 'Low balance',
      needsCred: 'Credential missing',
      limitRolling: '5-hour limit',
      limitWeekly: 'Weekly limit',
      remaining: '{n}% left',
      resetIn: 'resets in {t}',
      warnHigh: 'elevated',
      critHigh: 'nearly exhausted',
      relJustNow: 'now',
      relSecAgo: '{n}s ago',
      relMinAgo: '{n}m ago',
      relHourAgo: '{n}h ago',
      stale: 'stale · {ago}',
      waitingHost: 'Waiting for the host API (/model-usage)… restart dsh web to enable it',
      waitingStats: 'Loading stats…',
      tabOverview: 'Overview', tabQuota: 'Quota', tabLog: 'Request log', tabToday: 'Today', tab7d: 'Last 7 days', tab30d: 'Last 30 days', tabsLabel: 'Model usage views',
      chipAll: 'All providers', metricTokens: 'Tokens', metricRequests: 'Requests', modelsQuotaTitle: 'Provider quota', filterProvider: 'Filter by provider', exportShort: 'CSV', modalStatsTitle: 'Today\'s usage', fullStatsHint: 'Full stats in Settings → Model usage',
      spendTitle: 'Today\'s actual usage', spentWord: 'Spent', rechargedWord: 'Recharged', windowSpentWord: 'Quota used', thTime: 'Time', thInput: 'Input', thOutput: 'Output', thCache: 'Cache', thDur: 'Duration', thTtft: 'TTFT', noLog: 'No requests yet',
      shortAccount: 'Account', remainCompact: '{n}% left', remainPrefix: '', remainSuffix: ' left', statsError: 'Failed to load stats', retry: 'Retry', emptyData: 'No data', emptyUsage: 'No calls today yet',
      kpiRequests: 'Model calls', kpiTokens: 'Tokens', kpiCacheHit: 'Cache hit rate',
      limitMcp: 'MCP tools / month', limitMonthly: 'Monthly', remainCalls: '{n}/{m} calls left',
      groupCurrent: 'In use this session', groupSub: 'Subscription windows', groupApi: 'API balance', groupWallet: 'Account wallet', groupOther: 'Other',
      trendTitle: 'Usage trend',
      thProvider: 'Provider', thModel: 'Model', thRequests: 'Requests', thTokens: 'Tokens',
      lang: 'en',
    }
    // 语言：DSH 的活动语言通过框架 seat（props.t）提供；无 seat 时按浏览器语言回退
    const trWith = (t) => {
      if (typeof t === 'function') {
        return (key, vars) => {
          const out = vars ? t(key, vars) : t(key)
          if (out != null && out !== key) return out
          const d = String(navigator.language || '').toLowerCase().startsWith('zh') ? zh : en
          return d[key] != null ? d[key] : (en[key] != null ? en[key] : key)
        }
      }
      const d = String(navigator.language || '').toLowerCase().startsWith('zh') ? zh : en
      return (key, vars) => {
        let v = d[key] != null ? d[key] : (en[key] != null ? en[key] : key)
        if (vars) for (const k of Object.keys(vars)) v = v.split('{' + k + '}').join(String(vars[k]))
        return v
      }
    }

    // ---------------------------------------------------------------- css（行规格照抄 VOzbGW_trigger*，全部官方 token）
    const CSS = `
.dmu-row{display:flex;align-items:center;gap:8px}
.dmu-footrow{flex:none;width:calc(100% - 16px);margin:2px 8px 4px}
.dmu-footcard{background:var(--dsw-alias-settings-card-fill,var(--dsw-alias-bg-layer-1,#fff));border:1px solid var(--dsw-alias-settings-card-stroke,var(--dsw-alias-border-l1,#e3e7ed));border-radius:var(--dsw-radius-lg,14px);padding:10px 12px;cursor:pointer}
.dmu-footcard:focus-visible,.dmu-railbtn:focus-visible,.dmu-rbtn:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4176E6));outline-offset:2px}
.dmu-footcard:hover{border-color:var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,#d8dce2))}
.dmu-footcard .name{font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-primary,#191f28);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dmu-footcard .metric{margin-left:auto;display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-secondary,#637182);font-variant-numeric:tabular-nums;white-space:nowrap}
.dmu-footcard .metric b{font-weight:650}
.dmu-mwin{margin-top:8px}
.dmu-mwin:first-child{margin-top:9px}
.dmu-mwin .t{display:flex;font-size:10.5px;color:var(--dsw-alias-label-secondary,#637182);margin-bottom:3px}
.dmu-mwin .t b{margin-left:auto;color:var(--dsw-alias-label-primary,#191f28);font-variant-numeric:tabular-nums}
.dmu-mwin .track{height:6px;border-radius:4px;background:var(--dsw-alias-bg-base,#e4e8ee);overflow:hidden}
.dmu-mwin .fill{height:100%;border-radius:4px;transition:width .4s ease}
.dmu-railbtn{width:36px;height:36px;border-radius:var(--dsw-radius-md);display:flex;align-items:center;justify-content:center;cursor:pointer;position:relative}
.dmu-railbtn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dmu-raildot{position:absolute;top:4px;right:4px}
.dmu-rbtn{width:28px;height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:none;border:none;border-radius:999px;justify-content:center;align-items:center;padding:0;display:inline-flex;font-size:12px;flex:none}
.dmu-rbtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.dmu-logo{border-radius:50%;display:flex;align-items:center;justify-content:center;flex:none;user-select:none;overflow:hidden}
.dmu-pop{width:300px;background:var(--dsw-alias-bg-layer-2,#fff);border:0;border-radius:var(--dsw-radius-lg,14px);box-shadow:var(--dsw-shadow-lv2,0 12px 40px rgba(2,6,16,.16));padding:13px 14px 11px;position:fixed;z-index:2147483000}
.dmu-pop .nm{font-size:var(--dsh-content-font-size-secondary,13px);font-weight:600;color:var(--dsw-alias-label-primary,#191f28)}
.dmu-pop .win{margin-top:10px}
.dmu-pop .win .t{display:flex;font-size:11px;color:var(--dsw-alias-label-secondary,#637182);margin-bottom:4px}
.dmu-pop .win .t b{margin-left:auto;color:var(--dsw-alias-label-primary,#191f28);font-variant-numeric:tabular-nums}
.dmu-pop .track{height:7px;border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-bg-base,#e4e8ee);overflow:hidden}
.dmu-pop .fill{height:100%;border-radius:var(--dsw-radius-sm,6px)}
.dmu-pop .foot{margin-top:10px;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1,#e3e7ed);display:flex;align-items:center;font-size:11px;color:var(--dsw-alias-link,var(--dsw-alias-state-business-primary,#4176E6));cursor:pointer}
.dmu-pop .foot:hover{text-decoration:underline}
.dmu-modal-w{width:640px;max-width:calc(100vw - 48px)}
.dmu-mbody{display:flex;flex-direction:column;gap:12px}
.dmu-mbody > :first-child{padding-bottom:6px}
.dmu-mbody > :nth-child(2){margin-top:6px;max-height:58vh;overflow:auto;padding-bottom:6px}
.dmu-mbody .dmu-pcard{margin:12px 0 0}
.dmu-mbody .dmu-pcard:first-child{margin-top:0}
.dmu-mbody .dmu-kicker{margin:12px 0 0}
.dmu-sumhead{display:flex;align-items:center;gap:8px}
.dmu-sumhead .k{font-size:10.5px;font-weight:700;letter-spacing:1px;color:var(--dsw-alias-label-tertiary,#98a2b3)}
.dmu-summrow{display:flex;align-items:flex-end;gap:26px;margin-top:11px}
.dmu-sumstat .k{font-size:10.5px;color:var(--dsw-alias-label-secondary,#637182)}
.dmu-sumstat .v{margin-top:3px;font-size:16px;font-weight:700;color:var(--dsw-alias-label-primary,#191f28);font-variant-numeric:tabular-nums;line-height:1}
.dmu-spark{display:flex;align-items:flex-end;gap:3px;height:22px;width:120px;margin-left:auto}
.dmu-spark i{flex:1;background:var(--dsw-alias-state-business-primary,#4176E6);border-radius:2px 2px 0 0;min-height:2px;display:block;opacity:.85}
.dmu-sumtext{margin-top:9px;font-size:10.5px;color:var(--dsw-alias-label-tertiary,#98a2b3)}
.dmu-kicker{font-size:10.5px;font-weight:700;letter-spacing:1px;color:var(--dsw-alias-label-tertiary,#98a2b3);margin:6px 0 6px}
.dmu-pcard{background:var(--dsw-alias-settings-card-fill,var(--dsw-alias-bg-layer-1,#fff));border:1px solid var(--dsw-alias-settings-card-stroke,var(--dsw-alias-border-l1,#e3e7ed));border-radius:var(--dsw-radius-lg,14px);padding:13px 15px}
.dmu-pcard.crit{border-top:2px solid var(--dsw-alias-state-error-primary,#f04438)}
.dmu-pcard .ph{display:flex;align-items:center;gap:8px;font-size:var(--dsh-content-font-size-secondary,13px);font-weight:600;color:var(--dsw-alias-label-primary,#191f28);white-space:nowrap}
.dmu-pcard .ph .dmu-pill{white-space:nowrap}
.dmu-pcard .route{font-size:10.5px;color:var(--dsw-alias-label-tertiary,#98a2b3);font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:26%}
.dmu-big{margin-top:11px;font-size:28px;font-weight:700;letter-spacing:-.5px;line-height:1;color:var(--dsw-alias-label-primary,#191f28);font-variant-numeric:tabular-nums}
.dmu-big small{font-size:13px;font-weight:600;color:var(--dsw-alias-label-secondary,#637182);margin-left:3px;letter-spacing:0}
.dmu-cap{margin-top:6px;font-size:11px;color:var(--dsw-alias-label-secondary,#637182)}
.dmu-seg{display:flex;height:10px;border-radius:var(--dsw-radius-sm,6px);overflow:hidden;margin-top:12px;background:var(--dsw-alias-bg-base,#e4e8ee)}
.dmu-seg span{height:100%}
.dmu-legend{display:flex;gap:14px;margin-top:8px;font-size:10.5px;color:var(--dsw-alias-label-secondary,#637182)}
.dmu-legend i{width:8px;height:8px;border-radius:3px;display:inline-block;margin-right:5px;vertical-align:-1px}
.dmu-pcard .winrow{margin-top:12px;display:flex;flex-direction:column;gap:12px}
.dmu-pcard .win .t{display:flex;align-items:baseline;font-size:11.5px;color:var(--dsw-alias-label-secondary,#637182);margin-bottom:5px}
.dmu-pcard .win .t .lb{font-weight:600;color:var(--dsw-alias-label-primary,#191f28);margin-right:8px}
.dmu-pcard .win .t b{margin-left:auto;font-size:12.5px;color:var(--dsw-alias-label-primary,#191f28);font-variant-numeric:tabular-nums}
.dmu-pcard .win .track{height:10px;border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-bg-base,#e4e8ee);overflow:hidden}
.dmu-pcard .win .fill{height:100%;border-radius:var(--dsw-radius-sm,6px);transition:width .4s ease}
.dmu-pcard .win .f{display:flex;margin-top:5px;font-size:10.5px;color:var(--dsw-alias-label-tertiary,#98a2b3)}
.dmu-pcard .win .f .wh{margin-left:auto;font-weight:600}
.dmu-errline{display:flex;gap:8px;align-items:flex-start;font-size:11px;color:var(--dsw-alias-state-error-primary,#f04438);background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#f04438) 8%,transparent);border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary,#f04438) 25%,transparent);padding:7px 10px;border-radius:var(--dsw-radius-md,10px);margin-top:10px;word-break:break-all}
.dmu-warnline{color:var(--dsw-alias-state-warn-primary,#f79009);font-size:11px;margin-top:10px}
.dmu-mutedline{color:var(--dsw-alias-label-tertiary,#98a2b3);font-size:11px;margin-top:10px}
.dmu-settings{padding:4px 2px}
.dmu-settings h2{font-size:16px;font-weight:650;margin:0 0 2px;color:var(--dsw-alias-label-primary,#191f28)}
.dmu-settings .desc{font-size:11.5px;color:var(--dsw-alias-label-tertiary,#98a2b3);margin-bottom:14px}
.dmu-settings .list{display:flex;flex-direction:column;gap:12px}
.dmu-empty{padding:18px 12px;text-align:center;font-size:11.5px;color:var(--dsw-alias-label-tertiary,#98a2b3)}
.dmu-settings,.dmu-mbody{--dmu-violet:#7c5cf0}
@media (prefers-reduced-motion:reduce){.dmu-pcard .win .fill,.dmu-mwin .fill{transition:none}}
.dmu-kpis{display:flex;gap:10px;flex-wrap:wrap}
.dmu-kpi{flex:1;min-width:120px;background:var(--dsw-alias-settings-card-fill,var(--dsw-alias-bg-layer-1,#fff));border:1px solid var(--dsw-alias-settings-card-stroke,var(--dsw-alias-border-l1,#e3e7ed));border-radius:var(--dsw-radius-lg,14px);padding:12px 14px}
.dmu-kpi .k{font-size:10.5px;color:var(--dsw-alias-label-tertiary,#98a2b3)}
.dmu-kpi .v{margin-top:5px;font-size:22px;font-weight:700;letter-spacing:-.3px;color:var(--dsw-alias-label-primary,#191f28);font-variant-numeric:tabular-nums}
.dmu-kpi .v small{font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary,#637182);margin-left:2px}
.dmu-chart{background:var(--dsw-alias-settings-card-fill,var(--dsw-alias-bg-layer-1,#fff));border:1px solid var(--dsw-alias-settings-card-stroke,var(--dsw-alias-border-l1,#e3e7ed));border-radius:var(--dsw-radius-lg,14px);padding:14px 16px 10px;margin-top:12px}
.dmu-chart .bars{display:flex;align-items:flex-end;gap:3px;height:120px}
.dmu-chart .bar{flex:1;border-radius:3px 3px 1px 1px;background:var(--dsw-alias-state-business-primary,#4176E6);min-height:2px;position:relative}
.dmu-chart .bar:hover{opacity:.75}
.dmu-chart .labels{display:flex;gap:3px;margin-top:5px}
.dmu-chart .labels span{flex:1;text-align:center;font-size:9px;color:var(--dsw-alias-label-tertiary,#98a2b3);overflow:visible;white-space:nowrap}
.dmu-table{width:100%;border-collapse:collapse;font-size:12px;margin-top:12px;background:var(--dsw-alias-settings-card-fill,var(--dsw-alias-bg-layer-1,#fff));border:1px solid var(--dsw-alias-settings-card-stroke,var(--dsw-alias-border-l1,#e3e7ed));border-radius:var(--dsw-radius-lg,14px);overflow:hidden}
.dmu-table th{ text-align:left;font-size:10.5px;font-weight:600;color:var(--dsw-alias-label-tertiary,#98a2b3);padding:9px 12px;border-bottom:1px solid var(--dsw-alias-border-l1,#e3e7ed)}
.dmu-table td{padding:9px 12px;border-bottom:1px solid var(--dsw-alias-border-l1,#e3e7ed);color:var(--dsw-alias-label-primary,#191f28);font-variant-numeric:tabular-nums}
.dmu-table tr:last-child td{border-bottom:none}
.dmu-table .num{text-align:right;font-variant-numeric:tabular-nums}
.dmu-table th.num{text-align:right}
`

    // ---------------------------------------------------------------- helpers
    const curSym = (cur) => (cur === 'CNY' ? '¥' : cur === 'USD' ? '$' : '')
    const shortName = (route, tr) =>
      route === 'deepseek-official' ? 'DeepSeek'
        : route === 'deepseek-account' ? (tr ? tr('shortAccount') : '账号')
        : route && route.startsWith('zai') ? 'GLM'
        : route || ''

    function fmtResetLong(resetAt, tr) {
      if (!resetAt) return ''
      const d = resetAt - Date.now()
      if (d <= 0) return ''
      const days = Math.floor(d / 86400000)
      const hh = Math.floor((d % 86400000) / 3600000)
      const mm = Math.floor((d % 3600000) / 60000)
      const zhMode = tr('lang') === 'zh'
      if (zhMode) {
        if (days > 0) return days + ' 天 ' + hh + ' 小时'
        if (hh > 0) return hh + ' 小时 ' + mm + ' 分钟'
        return Math.max(1, mm) + ' 分钟'
      }
      if (days > 0) return days + 'd ' + hh + 'h'
      if (hh > 0) return hh + 'h ' + mm + 'm'
      return Math.max(1, mm) + 'm'
    }

    function relTime(ts, tr) {
      if (!ts) return ''
      const s = Math.max(0, Math.floor((Date.now() - ts) / 1000))
      if (s < 10) return tr('relJustNow')
      if (s < 60) return tr('relSecAgo', { n: s })
      if (s < 3600) return tr('relMinAgo', { n: Math.floor(s / 60) })
      return tr('relHourAgo', { n: Math.floor(s / 3600) })
    }

    function pctColor(pc) {
      return pc >= 80 ? 'var(--dsw-alias-state-error-primary,#f04438)' : pc >= 50 ? 'var(--dsw-alias-state-warn-primary,#f79009)' : 'var(--dsw-alias-state-success-primary,#12b76a)'
    }
    function dotState(p) {
      const ws = (p && p.windows) || []
      if (ws.length) {
        const max = Math.max.apply(null, ws.map((w) => w.usedPct || 0))
        return max >= 80 ? 'error' : max >= 50 ? 'warning' : 'done'
      }
      if (p && p.balance) return p.balance.available === false ? 'error' : 'done'
      return 'idle'
    }
    function statusColor(p) {
      const st = dotState(p)
      return st === 'error' ? 'var(--dsw-alias-state-error-primary,#f04438)' : st === 'warning' ? 'var(--dsw-alias-state-warn-primary,#f79009)' : st === 'done' ? 'var(--dsw-alias-state-success-primary,#12b76a)' : 'var(--dsw-alias-label-tertiary,#98a2b3)'
    }

    function summaryOf(snap, tr) {
      const provs = ((snap && snap.providers) || []).filter((p) => p && (p.balance || (p.windows && p.windows.length)))
      const multi = provs.length > 1
      const trFn = tr || ((k, v) => {
        let out = (zh[k] != null ? zh[k] : k)
        if (v) for (const kk of Object.keys(v)) out = out.split('{' + kk + '}').join(String(v[kk]))
        return out
      })
      const parts = []
      for (const p of provs) {
        const nm = multi ? shortName(p.route, trFn) + ' ' : ''
        let seg = ''
        if (p.balance) seg += curSym(p.balance.currency) + p.balance.total
        if (p.windows && p.windows.length) {
          seg += (seg ? ' · ' : '') + p.windows.map((w) => windowLabel(w, trFn) + ' ' + (w.countBased ? trFn('remainCalls', { n: w.remaining != null ? w.remaining : '—', m: w.limit != null ? w.limit : '—' }) : trFn('remainCompact', { n: 100 - Math.round(w.usedPct) }))).join(' · ')
        }
        if (seg) parts.push(nm + seg)
      }
      return parts.join('  ·  ')
    }
    function hasDisplayable(snap) {
      return !!((snap && snap.providers) || []).some((p) => p && (p.balance || (p.windows && p.windows.length)))
    }

    // ---- 原型归类 + 紧急度 + 分组排序
    function kindOf(p) {
      if (p && p.windows && p.windows.length) return 'sub'
      if (p && p.balance) return p.adapter === 'deepseek-account' ? 'wallet' : 'api'
      return 'other'
    }
    function urgencyOf(p) {
      if (p && p.windows && p.windows.length) return Math.max.apply(null, p.windows.map((w) => w.usedPct || 0))
      if (p && p.balance && p.balance.available === false) return 100
      return 0
    }
    function groupProviders(list, currentRoute) {
      const order = [
        { key: 'current', labelKey: 'groupCurrent' },
        { key: 'sub', labelKey: 'groupSub' },
        { key: 'api', labelKey: 'groupApi' },
        { key: 'wallet', labelKey: 'groupWallet' },
        { key: 'other', labelKey: 'groupOther' },
      ]
      const groups = { current: [], sub: [], api: [], wallet: [], other: [] }
      const rest = []
      for (const p of list || []) {
        if (currentRoute && p.route === currentRoute) groups.current.push(p)
        else rest.push(p)
      }
      rest
        .slice()
        .sort((a, b) => {
          const ka = ['sub', 'api', 'wallet', 'other'].indexOf(kindOf(a))
          const kb = ['sub', 'api', 'wallet', 'other'].indexOf(kindOf(b))
          if (ka !== kb) return ka - kb
          return urgencyOf(b) - urgencyOf(a)
        })
        .forEach((p) => groups[kindOf(p)].push(p))
      const out = order
        .map((o) => ({ key: o.key, labelKey: o.labelKey, items: groups[o.key] }))
        .filter((g) => g.items.length > 0)
      const nonCurrent = out.filter((g) => g.key !== 'current')
      if (!groups.current.length && nonCurrent.length <= 1) return null
      return out
    }

    // ---------------------------------------------------------------- api
    function createApi(ctx) {
      const unwrap = async (endpoint, payload) => {
        const res = await fetch('model-usage/' + endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint, payload }),
        })
        if (!res.ok) throw new Error('HTTP ' + res.status)
        const r = await res.json()
        if (r && r.ok) return r.value
        throw new Error((r && r.error && r.error.message) || ('rpc failed: ' + endpoint))
      }
      return {
        snapshot: (opts) => unwrap('snapshot', opts || {}),
        sessionProvider: (sessionId) => unwrap('session-provider', { sessionId }),
        stats: (opts) => unwrap('stats', opts || {}),
        config: () => unwrap('config', {}),
      }
    }

    let CFG_PROMISE = null
    function useCfg(api) {
      const [cfg, setCfg] = useState(null)
      useEffect(() => {
        let alive = true
        CFG_PROMISE = CFG_PROMISE || api.config().catch(() => null)
        CFG_PROMISE.then((c) => { if (!alive) return; setCfg(c) })
        return () => { alive = false }
      }, [])
      return cfg
    }

    function useSnapshot(api) {
      const [snap, setSnap] = useState(null)
      const [, setTick] = useState(0)
      const [busy, setBusy] = useState(false)
      useEffect(() => {
        let alive = true
        const load = async (force) => {
          try {
            const s = await api.snapshot(force ? { refresh: true } : {})
            if (!alive) return
            setSnap(s)
          } catch {}
        }
        load()
        const iv = setInterval(() => { if (document.visibilityState === 'visible') load() }, 60000)
        const tv = setInterval(() => setTick((x) => x + 1), 10000)
        const vis = () => { if (document.visibilityState === 'visible') load() }
        document.addEventListener('visibilitychange', vis)
        return () => {
          alive = false
          clearInterval(iv)
          clearInterval(tv)
          document.removeEventListener('visibilitychange', vis)
        }
      }, [])
      const refresh = useCallback(async () => {
        setBusy(true)
        try { setSnap(await api.snapshot({ refresh: true })) } catch {} finally { setBusy(false) }
      }, [])
      return { snap, busy, refresh }
    }

    function useUsageSummary(api) {
      const [stats, setStats] = useState(null)
      useEffect(() => {
        let alive = true
        api.stats({ days: 7 }).then((v) => { if (alive) setStats(v) }).catch(() => {})
        return () => { alive = false }
      }, [])
      return stats
    }

    /** 当前供应商控制器：客户端会话投影（模型切换即时生效）+ 宿主 lastActive 兜底 */
    function createSelectionController(ctx, api) {
      const ctrl = {
        route: null,
        listeners: new Set(),
        get() { return this.route },
        set(r) {
          if (!r || r === this.route) return
          this.route = r
          for (const l of [...this.listeners]) { try { l(r) } catch {} }
        },
        subscribe(l) { this.listeners.add(l); return () => this.listeners.delete(l) },
      }
      api.sessionProvider(null).then((r) => {
        if (r && r.route && !ctrl.route) ctrl.set(r.route)
      }).catch(() => {})
      try {
        const sessions = ctx.sessions
        const attached = new WeakSet()
        const attach = (session) => {
          if (!session || attached.has(session)) return
          try {
            const face = session.projections.faceOf('modelSelection')
            attached.add(session)
            const read = () => {
              try {
                const snapv = face.getSnapshot()
                const pick = (snapv && (snapv.next || snapv.lastUsed)) || null
                if (pick && pick.provider) ctrl.set(pick.provider)
              } catch {}
            }
            read()
            face.subscribe(read)
          } catch {}
        }
        const attachAll = () => {
          try {
            const snap = sessions.list.getSnapshot()
            for (const sid of Object.keys(snap.byId || {})) {
              try {
                const b = sessions.binding(sid)
                if (b && b.session) attach(b.session)
              } catch {}
            }
          } catch {}
        }
        attachAll()
        sessions.list.subscribe(attachAll)
      } catch {}
      return ctrl
    }

    // ---------------------------------------------------------------- atoms
    // [路由正则, slug, 形状]：不透明方形品牌标用 rounded 方形，透明图形标用白底圆形
    const LOGO_SLUGS = [
      [/^deepseek/, 'deepseek', 'circle'],
      [/^(zai|glm|bigmodel|zhipu|chatglm)/, 'zai', 'square'],
      [/^openai/, 'openai', 'circle'],
      [/^anthropic/, 'anthropic', 'circle'],
      [/^(google|vertex)/, 'googlegemini', 'circle'],
      [/^(moonshot|kimi)/, 'kimi', 'square'],
      [/^openrouter/, 'openrouter', 'square'],
      [/^minimax/, 'minimax', 'square'],
      [/^opencode/, 'opencode', 'square'],
      [/^xai/, 'xai', 'circle'],
      [/^(amazon-bedrock|bedrock)/, 'aws', 'circle'],
      [/^azure/, 'azure', 'circle'],
      [/^baseten/, 'baseten', 'square'],
      [/^cloudflare/, 'cloudflare', 'circle'],
      [/^fireworks/, 'fireworks', 'circle'],
      [/^github-copilot/, 'github', 'circle'],
      [/^groq/, 'groq', 'circle'],
      [/^huggingface/, 'huggingface', 'circle'],
      [/^meta/, 'meta', 'circle'],
      [/^mistral/, 'mistral', 'circle'],
      [/^nvidia/, 'nvidia', 'circle'],
      [/^qwen/, 'qwen', 'circle'],
      [/^together/, 'together', 'circle'],
      [/^vercel/, 'vercel', 'circle'],
      [/^(xiaomi|mimo)/, 'xiaomi', 'circle'],
    ]
    function logoSpec(route) {
      for (const [re, slug, shape] of LOGO_SLUGS) if (re.test(route || '')) return { slug, shape }
      return null
    }

    function Logo({ route, slug, size = 24 }) {
      const [failed, setFailed] = useState(false)
      const spec = slug ? { slug, shape: 'circle' } : logoSpec(route)
      if (spec && !failed) {
        const square = spec.shape === 'square'
        return h('span', {
          className: 'dmu-logo',
          style: square
            ? { width: size, height: size, borderRadius: Math.max(4, Math.round(size * 0.26)), background: 'transparent' }
            : { width: size, height: size, background: 'var(--dsw-alias-bg-layer-1,#fff)', border: '1px solid var(--dsw-alias-border-l1,#e3e7ed)' },
          title: route || '',
        },
          h('img', {
            src: 'model-usage/logo/' + spec.slug + '.svg',
            alt: route || '',
            width: square ? size : size - 6,
            height: square ? size : size - 6,
            style: { display: 'block', margin: 'auto', objectFit: 'contain', borderRadius: square ? Math.max(4, Math.round(size * 0.26)) : 0 },
            onError: () => setFailed(true),
          }))
      }
      const s = { width: size, height: size, fontSize: Math.round(size * 0.46) }
      let bg = 'linear-gradient(135deg,#8b93a1,#6b7480)'
      let ch = '◇'
      if (route === 'deepseek-official' || route === 'deepseek') { bg = 'linear-gradient(135deg,#4D6BFE,#7a94ff)'; ch = 'D' }
      else if (route === 'deepseek-account') { bg = 'linear-gradient(135deg,#4D6BFE,#7c5cf0)'; ch = 'A' }
      else if (route && route.startsWith('zai')) { bg = 'linear-gradient(135deg,#0ea5a0,#12b76a)'; ch = 'G' }
      return h('span', { className: 'dmu-logo', style: { ...s, background: bg } }, ch)
    }

    function StatusPill({ ok, okText, badText }) {
      return h(P.Pill, { active: false, style: {
        background: ok ? 'color-mix(in srgb,var(--dsw-alias-state-success-primary,#12b76a) 12%,transparent)' : 'color-mix(in srgb,var(--dsw-alias-state-error-primary,#f04438) 12%,transparent)',
        color: ok ? 'var(--dsw-alias-state-success-primary,#12b76a)' : 'var(--dsw-alias-state-error-primary,#f04438)',
        fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
      } }, ok ? '✓ ' + okText : '✕ ' + badText)
    }
    function PlanPill({ children }) {
      return h(P.Pill, { active: true, style: { fontSize: 10, fontWeight: 600 } }, children)
    }

    /** 图1 规范式窗口行：名称 + 剩余 N% + 重置倒计时 + 剩余填充细条 */
    function windowLabel(w, tr) {
      if (w.key === 'rolling') return tr('limitRolling')
      if (w.key === 'weekly') return tr('limitWeekly')
      if (w.key === 'mcp') return tr('limitMcp')
      if (w.key === 'monthly') return tr('limitMonthly')
      return w.label || ''
    }
    function WinRow({ w, tr }) {
      const used = Math.round(w.usedPct)
      const remain = 100 - used
      const resetLong = fmtResetLong(w.resetAt, tr)
      const fillColor = used >= 80 ? 'var(--dsw-alias-state-error-primary,#f04438)' : used >= 50 ? 'var(--dsw-alias-state-warn-primary,#f79009)' : 'var(--dsw-alias-label-primary,#191f28)'
      return h('div', { className: 'win' },
        h('div', { className: 't' },
          h('span', { className: 'lb' }, windowLabel(w, tr)),
          h('b', null, w.countBased && w.remaining != null
            ? tr('remainCalls', { n: w.remaining, m: w.limit != null ? w.limit : '—' })
            : tr('remaining', { n: remain }))),
        h('div', { className: 'track' },
          h('div', { className: 'fill', style: { width: remain + '%', background: fillColor } })),
        h('div', { className: 'f' },
          h('span', null, resetLong ? tr('resetIn', { t: resetLong }) : ''),
          used >= 50 ? h('span', { className: 'wh', style: { color: used >= 80 ? 'var(--dsw-alias-state-error-primary,#f04438)' : 'var(--dsw-alias-state-warn-primary,#f79009)' } }, used >= 80 ? tr('critHigh') : tr('warnHigh')) : null),
      )
    }

    /** 四原型卡片 */
    function ProviderCard({ p, tr }) {
      const kind = kindOf(p)
      const maxPct = urgencyOf(p)
      const kids = []

      const headerKids = [h(Logo, { route: p.route, slug: p.logoSlug, size: 22 }), h('span', null, p.displayName || p.route)]
      if (p.route && p.displayName !== p.route) headerKids.push(h('span', { className: 'route' }, p.route))
      if (kind === 'sub' && p.plan) headerKids.push(h(PlanPill, null, p.plan))
      if (kind === 'api' && p.balance) {
        headerKids.push(h(StatusPill, { ok: p.balance.available !== false, okText: tr('available'), badText: tr('unavailable') }))
      }
      headerKids.push(h('span', { className: 'dmu-meta' },
        p.status === 'stale'
          ? tr('stale', { ago: relTime(p.fetchedAt, tr) })
          : p.fetchedAt ? relTime(p.fetchedAt, tr) : ''))
      kids.push(h('div', { className: 'ph', key: 'ph' }, headerKids))

      if (kind === 'sub') {
        kids.push(h('div', { className: 'winrow', key: 'win' },
          p.windows.map((w, i) => h(WinRow, { key: w.key || i, w, tr }))))
      }

      if (kind === 'api' && p.balance) {
        kids.push(h('div', { className: 'dmu-big', key: 'big' },
          curSym(p.balance.currency) + p.balance.total,
          h('small', null, p.balance.currency || '')))
        kids.push(h('div', { className: 'dmu-cap', key: 'cap' },
          tr('totalBalance') + ' · ' + tr('toppedUpBalance') + ' ' + curSym(p.balance.currency) + (p.balance.toppedUp || '0')
          + ' · ' + tr('grantedBalance') + ' ' + curSym(p.balance.currency) + (p.balance.granted || '0')))
      }

      if (kind === 'wallet' && p.balance) {
        const totalN = Number(p.balance.total) || 0
        const topN = Number(p.balance.toppedUp) || 0
        const graN = Number(p.balance.granted) || 0
        const base = (totalN > 0) ? totalN : ((topN + graN) || 1)
        const wTop = Math.round((topN / base) * 100)
        const wGra = Math.max(0, 100 - wTop)
        kids.push(h('div', { className: 'dmu-big', key: 'big' },
          curSym(p.balance.currency) + p.balance.total,
          h('small', null, tr('totalBalance'))))
        kids.push(h('div', { className: 'dmu-seg', key: 'seg' },
          h('span', { style: { width: wTop + '%', background: 'var(--dsw-alias-state-business-primary,#4176E6)' } }),
          h('span', { style: { width: wGra + '%', background: 'var(--dmu-violet,#7c5cf0)' } })))
        kids.push(h('div', { className: 'dmu-legend', key: 'seg-leg' },
          h('span', null, h('i', { style: { background: 'var(--dsw-alias-state-business-primary,#4176E6)' } }), tr('toppedUpBalance') + ' ' + curSym(p.balance.currency) + (p.balance.toppedUp || '0')),
          h('span', null, h('i', { style: { background: 'var(--dmu-violet,#7c5cf0)' } }), tr('grantedBalance') + ' ' + curSym(p.balance.currency) + (p.balance.granted || '0'))))
      }

      if (p.status === 'needs-credential') {
        kids.push(h('div', { className: 'dmu-warnline', key: 'st' }, '⚠ ' + tr('needsCred') + '：' + ((p.credential && p.credential.refs) || []).join(' / ')))
      } else if (p.error) {
        kids.push(h('div', { className: 'dmu-errline', key: 'st' }, '⚠ ' + (p.error.message || '')))
      }

      const cls = 'dmu-pcard' + (kind === 'sub' && maxPct >= 80 ? ' crit' : '')
      return h('div', { className: cls }, kids)
    }

    function renderGroups(list, tr, currentRoute) {
      // 与第一方「模型」页同规：未登录的账号路由、无额度接口的供应商不渲染
      const filtered = (list || []).filter((p) => p && p.status !== 'idle' && p.status !== 'needs-signin')
      const groups = groupProviders(filtered, currentRoute)
      const out = []
      if (groups === null) {
        for (const p of filtered) out.push(h(ProviderCard, { key: p.route, p, tr }))
        return out
      }
      let first = true
      for (const g of groups) {
        out.push(h('div', { className: 'dmu-kicker', key: 'k-' + g.key }, tr(g.labelKey)))
        for (const p of g.items) out.push(h(ProviderCard, { key: p.route + ':' + g.key, p, tr }))
        first = false
      }
      return out
    }

    function UsageModal({ api, snap, busy, refresh, onClose, tr, sessionId }) {
      useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose() }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [onClose])
      const providers = (snap && snap.providers) || []
      return h(P.Modal, {
        open: true,
        onClose,
        className: 'dmu-modal-w',
        title: tr('nav'),
        closeLabel: tr('close'),
        contentClassName: 'dmu-mbody',
        footer: h('div', { className: 'dmu-row', style: { justifyContent: 'flex-end' } },
          h(P.Button, { variant: 'outline', size: 'sm', onClick: refresh, disabled: busy }, (busy ? '… ' : '') + '↻ ' + tr('refreshAll')),
          h(P.Button, { variant: 'primary', size: 'sm', onClick: onClose }, tr('close'))),
      },
        [
          h(ModalUsageSummary, { key: 'summary', api, tr }),
          ...(providers.length ? renderGroups(providers, tr, sessionId) : [h('div', { key: 'empty', className: 'dmu-mutedline' }, '…')]),
        ])
    }

    function ModalUsageSummary({ api, tr }) {
      const stats = useUsageSummary(api)
      if (!stats) return null
      const total7 = (stats.days || []).reduce((s2, d) => s2 + d.tokens, 0)
      const max7 = Math.max.apply(null, (stats.days || []).map((d) => d.tokens).concat([1]))
      const stat = (label, value) => h('div', { className: 'dmu-sumstat', key: label },
        h('div', { className: 'k' }, label),
        h('div', { className: 'v' }, value))
      return h('div', { className: 'dmu-pcard' },
        h('div', { className: 'dmu-sumhead' },
          h('span', { className: 'k' }, tr('modalStatsTitle')),
          h('div', { className: 'dmu-spark', role: 'img', 'aria-label': tr('trendTitle') },
            (stats.days || []).map((d, i) => h('i', {
              key: i,
              style: { height: Math.max(2, Math.round((d.tokens / max7) * 22)) },
              title: d.date + ' · ' + fmtTokens(d.tokens, tr) + ' tokens',
            })))),
        h('div', { className: 'dmu-summrow' },
          stat(tr('kpiRequests'), String(stats.today.requests)),
          stat(tr('kpiTokens'), fmtTokens(stats.today.tokens, tr)),
          stats.today.cacheHitRate != null ? stat(tr('kpiCacheHit'), stats.today.cacheHitRate + '%') : null),
        h('div', { className: 'dmu-sumtext' },
          tr('trendTitle') + ' · ' + fmtTokens(total7, tr) + ' tokens · ' + tr('fullStatsHint')))
    }

    // ---------------------------------------------------------------- 入口 1：侧边栏底部（原生 42px 行 · Codex 式当前供应商）
    function metricTextOf(p, tr) {
      if (!p) return ''
      if (p.windows && p.windows.length) {
        return p.windows.map((w) => windowLabel(w, tr) + ' ' + (w.countBased ? tr('remainCalls', { n: w.remaining != null ? w.remaining : '—', m: w.limit != null ? w.limit : '—' }) : tr('remainCompact', { n: 100 - Math.round(w.usedPct) }))).join(' · ')
      }
      if (p.balance) return curSym(p.balance.currency) + p.balance.total
      return ''
    }
    function metricNodeOf(p, tr) {
      if (!p) return null
      if (p.windows && p.windows.length) {
        return h('span', null, p.windows.map((w, i) => {
          const remain = 100 - Math.round(w.usedPct)
          const used = Math.round(w.usedPct)
          return h('span', { key: w.key || i },
            i > 0 ? h('span', { style: { color: 'var(--dsw-alias-label-tertiary,#98a2b3)' } }, ' · ') : null,
            windowLabel(w, tr) + ' ',
            w.countBased
              ? h('b', { style: { color: pctColor(used) } }, (w.remaining != null ? w.remaining : '—') + '/' + (w.limit != null ? w.limit : '—'))
              : h('span', null, tr('remainPrefix'), h('b', { style: { color: pctColor(used) } }, remain + '%'), tr('remainSuffix')))
        }))
      }
      if (p.balance) {
        return h('span', null, h('b', null, curSym(p.balance.currency) + p.balance.total))
      }
      return null
    }

    function FooterEntry(props) {
      const { api, sel } = props
      const tr = trWith(props.t)
      const cfg = useCfg(api)
      const { snap, busy, refresh } = useSnapshot(api)
      const [modal, setModal] = useState(false)
      const [hostRoute, setHostRoute] = useState(null)
      const [selRoute, setSelRoute] = useState(sel ? sel.get() : null)
      const cardRef = useRef(null)
      useEffect(() => {
        if (!sel) return
        return sel.subscribe((r) => setSelRoute(r))
      }, [sel])
      useEffect(() => {
        let alive = true
        const load = async () => {
          try {
            const r = await api.sessionProvider(null)
            if (!alive) return
            setHostRoute(r && r.route)
          } catch {}
        }
        load()
        const iv = setInterval(load, 60000)
        return () => { alive = false; clearInterval(iv) }
      }, [])
      const currentRoute = selRoute || hostRoute
      if (cfg && cfg.entries && cfg.entries.footer === false) return null
      if (!snap || !hasDisplayable(snap)) return null
      const provs = ((snap && snap.providers) || []).filter((p) => p && (p.balance || (p.windows && p.windows.length)))
      const current = currentRoute ? provs.find((p) => p.route === currentRoute) : null
      const color = statusColor(current || (provs.find((p) => p.windows && p.windows.length) || provs[0]))
      const fallbackSum = summaryOf(snap, tr)
      const metricNode = metricNodeOf(current, tr)
      const titleText = current ? ((current.displayName || shortName(current.route, tr)) + ' · ' + (metricTextOf(current, tr) || '')) : (tr('footName') + (fallbackSum ? ' · ' + fallbackSum : ''))
      const openModal = () => setModal(true)
      const guardedOpen = (e) => {
        if (cardRef.current && cardRef.current.contains(e.target)) openModal()
      }
      const refreshBtn = h('button', {
        className: 'dmu-rbtn', title: tr('refresh'), 'aria-label': tr('refresh'),
        onClick: (e) => { e.stopPropagation(); refresh() },
      }, busy ? '…' : '↻')
      if (!props.wide) {
        return h('div', { className: 'dmu-railbtn', role: 'button', tabIndex: 0, 'aria-label': tr('footName'), onClick: openModal, onKeyDown: (e) => { if (e.key === 'Enter') openModal() } },
          h(P.Tooltip, { label: titleText, side: 'right', portal: true },
            h('span', { style: { position: 'relative', display: 'flex' } },
              h(Logo, { route: current ? current.route : 'generic', slug: current ? current.logoSlug : null, size: 18 }),
              h('span', { className: 'dmu-raildot' }, h(P.StateDot, { state: dotState(current || provs.find((p) => p.windows && p.windows.length) || provs[0]), size: 8 })))))
      }
      // 小型卡片：弹窗卡片的迷你版（头部 + 订阅迷你窗口条 / 余额）
      const bodyKids = []
      if (current && current.windows && current.windows.length) {
        for (const [i, w] of current.windows.slice(0, 3).entries()) {
          const used = Math.round(w.usedPct)
          const remain = 100 - used
          const color = used >= 80 ? 'var(--dsw-alias-state-error-primary,#f04438)' : used >= 50 ? 'var(--dsw-alias-state-warn-primary,#f79009)' : 'var(--dsw-alias-label-primary,#191f28)'
          if (w.countBased) {
            bodyKids.push(h('div', { className: 'dmu-mwin', key: 'w' + i },
              h('div', { className: 't' },
                h('span', null, windowLabel(w, tr)),
                h('b', null, tr('remainCalls', { n: w.remaining != null ? w.remaining : '—', m: w.limit != null ? w.limit : '—' })))))
          } else {
            bodyKids.push(h('div', { className: 'dmu-mwin', key: 'w' + i },
              h('div', { className: 't' },
                h('span', null, windowLabel(w, tr)),
                h('b', null, tr('remaining', { n: remain }))),
              h('div', { className: 'track' },
                h('div', { className: 'fill', style: { width: remain + '%', background: color } }))))
          }
        }
      } else if (current && current.balance) {
        bodyKids.push(h('div', { className: 'dmu-big', key: 'b0', style: { fontSize: 22, marginTop: 8 } },
          curSym(current.balance.currency) + current.balance.total))
      } else {
        bodyKids.push(h('div', { className: 'dmu-mutedline', key: 'b1', style: { marginTop: 8 } }, fallbackSum || '…'))
      }
      return h('div', { className: 'dmu-footrow' },
        h('div', { ref: cardRef, className: 'dmu-footcard', role: 'button', tabIndex: 0, 'aria-label': tr('footName'), onClick: guardedOpen, onKeyDown: (e) => { if (e.key === 'Enter') openModal() } },
          h('div', { className: 'dmu-row' },
            h(Logo, { route: current ? current.route : 'generic', slug: current ? current.logoSlug : null, size: 18 }),
            h('span', { className: 'name' }, current ? (shortName(current.route, tr) || tr('footName')) : tr('footName')),
            h(P.StateDot, { state: dotState(current || provs.find((p) => p.windows && p.windows.length) || provs[0]), size: 8 }),
            h('span', { className: 'metric' },
              relTime((current && current.fetchedAt) || snap.generatedAt, tr),
              refreshBtn)),
          bodyKids),
        modal && h(UsageModal, { api, snap, busy, refresh, onClose: () => setModal(false), tr, sessionId: currentRoute }),
      )
    }

    // ---------------------------------------------------------------- 统计组件
    function fmtTokens(n, tr) {
      if (!Number.isFinite(n)) return '0'
      const enMode = tr ? tr('lang') === 'en' : false
      if (enMode) {
        if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
        if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
        if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
        return String(Math.round(n))
      }
      if (n >= 1e8) return (n / 1e8).toFixed(2) + ' 亿'
      if (n >= 1e4) return (n / 1e4).toFixed(1) + ' 万'
      if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
      return String(Math.round(n))
    }
    function KpiCard({ label, value, unit }) {
      return h('div', { className: 'dmu-kpi' },
        h('div', { className: 'k' }, label),
        h('div', { className: 'v' }, value, unit ? h('small', null, unit) : null))
    }

    function BarChart({ items, getLabel, formatTitle, tr }) {
      const max = Math.max.apply(null, items.map((x) => x.v).concat([1]))
      const total = items.reduce((s2, x) => s2 + x.v, 0)
      if (total <= 0) return h('div', { className: 'dmu-empty' }, tr('emptyUsage'))
      return h('div', { className: 'dmu-chart' },
        h('div', { className: 'bars', role: 'img', 'aria-label': tr('trendTitle') },
          items.map((x, i) => h('div', {
            key: i, className: 'bar',
            style: { height: Math.max(2, Math.round((x.v / max) * 116)) },
            title: formatTitle(x),
          }))),
        h('div', { className: 'labels', 'aria-hidden': true },
          items.map((x, i) => h('span', { key: i }, getLabel(x)))))
    }

    function DataTable({ tr, columns, rows, emptyText }) {
      return h('table', { className: 'dmu-table' },
        h('thead', null,
          h('tr', null, columns.map((c, i) => h('th', { key: i, className: c.num ? 'num' : null }, c.label)))),
        h('tbody', null,
          rows.length
            ? rows.map((r, ri) => h('tr', { key: ri },
              r.map((cell, ci) => h('td', { key: ci, className: columns[ci] && columns[ci].num ? 'num' : null }, cell))))
            : h('tr', null, h('td', { colSpan: columns.length }, h('div', { className: 'dmu-empty' }, emptyText)))))
    }

    function fmtMs(ms) {
      if (!Number.isFinite(ms)) return '—'
      if (ms >= 1000) return (ms / 1000).toFixed(1) + 's'
      return Math.round(ms) + 'ms'
    }
    function fmtClock(t) {
      const d = new Date(t)
      const p2 = (n) => String(n).padStart(2, '0')
      return p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds())
    }

    function exportCsv(stats, tr) {
      const rows = []
      rows.push(['模型用量统计', new Date(stats.generatedAt).toISOString()])
      rows.push([])
      rows.push(['指标', '值'])
      rows.push([tr('kpiRequests'), stats.range.requests])
      rows.push([tr('kpiTokens'), stats.range.tokens])
      rows.push([tr('kpiCacheHit'), stats.range.cacheHitRate == null ? '' : stats.range.cacheHitRate + '%'])
      rows.push([])
      rows.push(['日期', 'Tokens', tr('kpiRequests')])
      for (const d of stats.days) rows.push([d.date, d.tokens, d.requests])
      rows.push([])
      rows.push([tr('thProvider'), tr('thRequests'), tr('thTokens')])
      for (const p of stats.providers) rows.push([p.route, p.requests, p.tokens])
      rows.push([])
      rows.push([tr('thModel'), tr('thRequests'), tr('thTokens')])
      for (const m of stats.models) rows.push([m.provider + '/' + m.model, m.requests, m.tokens])
      rows.push([])
      rows.push([tr('thTime'), tr('thModel'), tr('thInput'), tr('thOutput'), tr('thCache'), tr('thDur'), tr('thTtft')])
      for (const r of stats.recent || []) rows.push([new Date(r.t).toISOString(), r.p + '/' + r.m, r.i, r.o, r.cr, r.dur == null ? '' : r.dur, r.ttft == null ? '' : r.ttft])
      const csv = rows.map((row) => row.map((cell) => {
        const t = String(cell == null ? '' : cell)
        return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t
      }).join(',')).join('\n')
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      const d = new Date()
      const stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0')
      a.download = 'model-usage-' + stamp + '.csv'
      document.body.appendChild(a)
      a.click()
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 1000)
    }

    function SpendSection({ spend, routes, tr }) {
      const entries = Object.entries(spend || {}).filter(([route, v]) => {
        if (!v) return false
        if (v.kind === 'balance') return Number(v.spent) > 0 || Number(v.recharged) > 0
        if (v.kind === 'windows') return v.windows && Object.keys(v.windows).some((k) => Number(v.windows[k]) > 0)
        return false
      })
      if (!entries.length) return null
      const nameOf = (route) => shortName(route, tr) || route
      return h('div', { style: { marginTop: 14 } },
        h('div', { className: 'dmu-kicker', style: { marginTop: 0 } }, tr('spendTitle')),
        h('div', { className: 'dmu-kpis' },
          entries.map(([route, v]) => {
            let metric = null
            let sub = null
            if (v.kind === 'balance') {
              const sym = curSym(v.currency)
              metric = (v.spent > 0 ? '−' + sym + Number(v.spent).toFixed(2) : '—')
              sub = v.recharged > 0 ? tr('rechargedWord') + ' +' + sym + Number(v.recharged).toFixed(2) : tr('spentWord')
            } else {
              const rolling = v.windows && v.windows['rolling']
              const weekly = v.windows && v.windows['weekly']
              metric = Number(rolling) > 0 ? '−' + Number(rolling).toFixed(1) + '%'
                : Number(weekly) > 0 ? '−' + Number(weekly).toFixed(1) + '%' : '—'
              const bits = []
              if (Number(rolling) > 0) bits.push(tr('limitRolling'))
              if (Number(weekly) > 0) bits.push(tr('limitWeekly') + ' −' + Number(weekly).toFixed(1) + '%')
              sub = bits.join(' · ') || tr('windowSpentWord')
            }
            return h('div', { className: 'dmu-kpi', key: route },
              h('div', { className: 'k' }, nameOf(route)),
              h('div', { className: 'v', style: { fontSize: 20 } }, metric),
              h('div', { className: 'dmu-cap', style: { marginTop: 4, fontSize: 10.5 } }, sub))
          })))
    }

    function StatsOverview({ api, tr }) {
      const [stats, setStats] = useState(null)
      const [error, setError] = useState(false)
      const [range, setRange] = useState('today')
      const [metric, setMetric] = useState('tokens')
      const [provider, setProvider] = useState('all')
      const [filterOpen, setFilterOpen] = useState(false)
      const rangeDays = range === 'today' ? 1 : range === '7d' ? 7 : 30
      const load = useCallback(async (days) => {
        try {
          setStats(await api.stats({ days: days || 1 }))
          setError(false)
        } catch {
          setError(true)
        }
      }, [])
      useEffect(() => { load(rangeDays) }, [rangeDays])
      useEffect(() => {
        const iv = setInterval(() => { if (document.visibilityState === 'visible') load(rangeDays) }, 60000)
        return () => clearInterval(iv)
      }, [rangeDays])
      if (!stats && error) {
        return h('div', { className: 'dmu-row', style: { gap: 10 } },
          h('span', { className: 'dmu-warnline', style: { margin: 0 } }, tr('statsError')),
          h(P.Button, { variant: 'outline', size: 'sm', onClick: () => load(rangeDays) }, tr('retry')))
      }
      if (!stats) return h('div', { className: 'dmu-mutedline' }, tr('waitingStats'))
      const todayMode = range === 'today'
      const provRows = stats.providers || []
      const filteredProviders = provider === 'all' ? provRows : provRows.filter((r) => r.route === provider)
      const filteredModels = provider === 'all' ? (stats.models || []) : (stats.models || []).filter((m) => m.provider === provider)
      const kpiRow = todayMode
        ? (provider === 'all' ? { requests: stats.today.requests, tokens: stats.today.tokens, cacheHitRate: stats.today.cacheHitRate }
          : (stats.todayByProvider || []).find((r) => r.route === provider) || { requests: 0, tokens: 0, cacheHitRate: null })
        : (provider === 'all' ? stats.range
          : (provRows.find((r) => r.route === provider) || { requests: 0, tokens: 0, cacheHitRate: null }))
      const pickVal = (x) => {
        if (provider === 'all') {
          return metric === 'tokens' ? x.tokens : x.requests
        }
        const bp = (x.byProvider && x.byProvider[provider]) || null
        if (!bp) return 0
        return metric === 'tokens' ? bp.tokens : bp.requests
      }
      const bars = (todayMode ? stats.hours : stats.days).map((x) => {
        const v = pickVal(x)
        const label = todayMode
          ? (x.h % 4 === 0 ? String(x.h).padStart(2, '0') : '')
          : x.date.slice(5)
        const when = todayMode ? String(x.h).padStart(2, '0') + ':00' : x.date
        return { label, v, title: when + ' · ' + fmtTokens(v, tr) + ' tokens · ' + (provider === 'all' ? x.requests : ((x.byProvider && x.byProvider[provider] && x.byProvider[provider].requests) || 0)) }
      })
      const rangeTab = (value, label) => h(P.Pill, {
        active: range === value, onClick: () => setRange(value),
        style: { padding: '4px 10px', fontSize: 11.5, whiteSpace: 'nowrap', flex: 'none' },
      }, label)
      const metricTab = (value, label) => h(P.Pill, {
        active: metric === value, onClick: () => setMetric(value),
        style: { padding: '4px 10px', fontSize: 11.5, whiteSpace: 'nowrap', flex: 'none' },
      }, label)
      return h('div', null,
        h('div', { className: 'dmu-row', style: { gap: 5, marginBottom: 14, flexWrap: 'nowrap' } },
          rangeTab('today', tr('tabToday')),
          rangeTab('7d', tr('tab7d')),
          rangeTab('30d', tr('tab30d')),
          h('span', { style: { marginLeft: 'auto' } }),
          h(P.Menu, {
            open: filterOpen,
            anchor: h(P.Button, {
              variant: 'outline',
              size: 'sm',
              onClick: () => setFilterOpen((v) => !v),
              'aria-label': tr('filterProvider'),
              style: { whiteSpace: 'nowrap', flex: 'none' },
            }, (provider === 'all' ? tr('chipAll') : (shortName(provider, tr) || provider)) + ' ▾'),
            items: [{ id: 'all', label: tr('chipAll') }].concat(provRows.map((r) => ({ id: r.route, label: shortName(r.route, tr) || r.route }))),
            selectedId: provider,
            onSelect: (id) => { setProvider(id); setFilterOpen(false) },
            onClose: () => setFilterOpen(false),
            portal: true,
            align: 'end',
          }),
          h(P.Button, { variant: 'outline', size: 'sm', onClick: () => exportCsv(stats, tr), style: { whiteSpace: 'nowrap', flex: 'none' } }, '↓ ' + tr('exportShort'))),
        
        h('div', { className: 'dmu-kpis' },
          h(KpiCard, { label: tr('kpiRequests'), value: String(kpiRow.requests) }),
          h(KpiCard, { label: tr('kpiTokens'), value: fmtTokens(kpiRow.tokens, tr) }),
          kpiRow.cacheHitRate != null
            ? h(KpiCard, { label: tr('kpiCacheHit'), value: kpiRow.cacheHitRate + '%' })
            : h(KpiCard, { label: tr('kpiCacheHit'), value: '—' })),
        h(SpendSection, { spend: stats.spendToday, tr }),
        h('div', { className: 'dmu-chart' },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 } },
            h('span', { style: { fontSize: 11.5, color: 'var(--dsw-alias-label-secondary,#637182)' } },
              tr('trendTitle') + ' · ' + (metric === 'tokens'
                ? fmtTokens(bars.reduce((s2, x) => s2 + x.v, 0), tr) + ' tokens'
                : bars.reduce((s2, x) => s2 + x.v, 0) + ' ' + tr('kpiRequests'))),
            h('span', { style: { marginLeft: 'auto', display: 'flex', gap: 4 } },
              metricTab('tokens', tr('metricTokens')),
              metricTab('requests', tr('metricRequests')))),
          bars.some((x) => x.v > 0)
            ? h(BarChart, { items: bars, getLabel: (x) => x.label, formatTitle: (x) => x.title, tr })
            : h('div', { className: 'dmu-empty' }, tr('emptyUsage'))),
        h(DataTable, {
          tr,
          columns: [{ label: tr('thProvider') }, { label: tr('thRequests'), num: true }, { label: tr('thTokens'), num: true }],
          rows: filteredProviders.map((r) => [shortName(r.route, tr) || r.route, String(r.requests), fmtTokens(r.tokens, tr)]),
          emptyText: tr('emptyData'),
        }),
        h(DataTable, {
          tr,
          columns: [{ label: tr('thModel') }, { label: tr('thRequests'), num: true }, { label: tr('thTokens'), num: true }],
          rows: filteredModels.slice(0, 30).map((r) => [
            h('span', null,
              h('span', { style: { fontFamily: 'var(--dsh-font-mono,monospace)', fontSize: 11.5 } }, r.model),
              h('span', { className: 'route', style: { marginLeft: 6 } }, r.provider)),
            String(r.requests),
            fmtTokens(r.tokens, tr),
          ]),
          emptyText: tr('emptyData'),
        }),
        )
    }


    function LogTab({ api, tr }) {
      const [stats, setStats] = useState(null)
      const [error, setError] = useState(false)
      const load = useCallback(async () => {
        try { setStats(await api.stats({ days: 7 })); setError(false) } catch { setError(true) }
      }, [])
      useEffect(() => { load(); const iv = setInterval(() => { if (document.visibilityState === 'visible') load() }, 60000); return () => clearInterval(iv) }, [])
      if (!stats && error) {
        return h('div', { className: 'dmu-row', style: { gap: 10 } },
          h('span', { className: 'dmu-warnline', style: { margin: 0 } }, tr('statsError')),
          h(P.Button, { variant: 'outline', size: 'sm', onClick: load }, tr('retry')))
      }
      if (!stats) return h('div', { className: 'dmu-mutedline' }, tr('waitingStats'))
      const rows = (stats.recent || []).map((r) => [
        h('span', { style: { fontVariantNumeric: 'tabular-nums' } }, fmtClock(r.t)),
        h('span', null,
          h('span', { style: { fontFamily: 'var(--dsh-font-mono,monospace)', fontSize: 11.5 } }, r.m),
          h('span', { className: 'route', style: { marginLeft: 6 } }, shortName(r.p, tr) || r.p)),
        fmtTokens(r.i, tr),
        fmtTokens(r.o, tr),
        fmtTokens(r.cr, tr),
        fmtMs(r.dur),
        fmtMs(r.ttft),
      ])
      return h('div', null,
        h('div', { className: 'dmu-row', style: { gap: 6, marginBottom: 14 } },
          h('span', { style: { marginLeft: 'auto' } },
            h(P.Button, { variant: 'outline', size: 'sm', onClick: load }, '↻ ' + tr('refresh'))),
          h(P.Button, { variant: 'outline', size: 'sm', onClick: () => exportCsv(stats, tr), style: { whiteSpace: 'nowrap', flex: 'none' } }, '↓ ' + tr('exportShort'))),
        h(DataTable, {
          tr,
          columns: [
            { label: tr('thTime'), num: true },
            { label: tr('thModel') },
            { label: tr('thInput'), num: true },
            { label: tr('thOutput'), num: true },
            { label: tr('thCache'), num: true },
            { label: tr('thDur'), num: true },
            { label: tr('thTtft'), num: true },
          ],
          rows,
          emptyText: tr('noLog'),
        }))
    }


    // ---------------------------------------------------------------- 入口 3：设置 → 模型（底部 supplier quota 区）
    function ModelsFooter(props) {
      const { api } = props
      const tr = trWith(props.t)
      const { snap } = useSnapshot(api)
      if (!snap || !hasDisplayable(snap)) return null
      const provs = ((snap && snap.providers) || []).filter((p) => p && (p.balance || (p.windows && p.windows.length)))
      return h('div', { className: 'dmu-settings', style: { marginTop: 8 } },
        h('div', { className: 'dmu-kicker', style: { marginTop: 0 } }, tr('modelsQuotaTitle')),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
          provs.map((p) => h('div', { key: p.route, className: 'dmu-row', style: { gap: 8 } },
            h(Logo, { route: p.route, slug: p.logoSlug, size: 18 }),
            h('span', { style: { fontSize: 12.5, fontWeight: 600 } }, p.displayName || shortName(p.route, tr)),
            h(P.StateDot, { state: dotState(p), size: 8 }),
            h('span', { className: 'metric', style: { marginLeft: 'auto', fontSize: 11 } },
              summaryOf({ providers: [p] }, tr))))))
    }

    // ---------------------------------------------------------------- 入口 2：设置页
    function SettingsEntry(props) {
      const { api } = props
      const tr = trWith(props.t)
      const [tab, setTab] = useState('overview')
      const tabs = [
        { value: 'overview', label: tr('tabOverview'), id: 'dmu-tab-overview', panelId: 'dmu-panel-overview' },
        { value: 'quota', label: tr('tabQuota'), id: 'dmu-tab-quota', panelId: 'dmu-panel-quota' },
        { value: 'log', label: tr('tabLog'), id: 'dmu-tab-log', panelId: 'dmu-panel-log' },
      ]
      return h('div', { className: 'dmu-settings' },
        h('h2', null, tr('nav')),
        h(P.SegmentedTabs, {
          items: tabs,
          value: tab,
          onChange: (v) => setTab(v),
          label: tr('tabsLabel'),
          className: 'dmu-main-tabs',
        }),
        h('div', { id: 'dmu-panel-' + tab, role: 'tabpanel', 'aria-labelledby': 'dmu-tab-' + tab, style: { marginTop: 14 } },
          tab === 'overview'
            ? h(StatsOverview, { api, tr })
            : tab === 'quota'
              ? h(QuotaTab, { api, tr })
              : h(LogTab, { api, tr })))
    }

    function QuotaTab(props) {
      const { api } = props
      const tr = trWith(props.t)
      const { snap, busy, refresh } = useSnapshot(api)
      return h('div', null,
        h('div', { className: 'dmu-row', style: { marginBottom: 12 } },
          h(P.Button, { variant: 'primary', size: 'sm', onClick: refresh, disabled: busy }, (busy ? '… ' : '') + '↻ ' + tr('refreshAll'))),
        h('div', { className: 'list' },
          snap
            ? renderGroups(snap.providers || [], tr, null)
            : h('div', { className: 'dmu-mutedline' }, tr('waitingHost'))))
    }

    // ---------------------------------------------------------------- apply
    return {
      inject: ['slots', 'locale', 'sessions'],
      apply(ctx) {
        const api = createApi(ctx)

        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dmu: locale')
        ctx.effect(() => {
          const tag = document.createElement('style')
          tag.id = 'dsh-model-usage-style'
          tag.textContent = CSS
          document.head.appendChild(tag)
          return () => tag.remove()
        }, 'dmu: styles')

        const selCtrl = createSelectionController(ctx, api)

        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'dsh-model-usage',
          order: -2,
          locale: NS,
          inject: () => ({ api, sel: selCtrl }),
        }, FooterEntry))

        ctx.slots.inject('settings.models.footer', () => ctx.slots.register({
          name: 'settings.models.footer',
          id: 'dsh-model-usage-models-footer',
          order: 10,
          locale: NS,
          inject: () => ({ api }),
        }, ModelsFooter))

        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'model-usage',
          order: 25,
          label: () => { try { return ctx.locale.bind(NS)('nav') } catch { return zh.nav } },
          locale: NS,
          inject: () => ({ api }),
        }, SettingsEntry))
      },
    }
  },
})

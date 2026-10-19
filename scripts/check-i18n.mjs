// 校验 zh/en 字典：键集合必须完全一致，且代码中用到的 tr('key') 必须存在
import { readFileSync } from 'node:fs'
const src = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const zhStart = src.indexOf('const zh = {')
const enStart = src.indexOf('const en = {')
const trStart = src.indexOf('const trWith')
if (zhStart < 0 || enStart < 0 || trStart < 0) { console.error('找不到 zh/en 字典或 trWith'); process.exit(1) }
const keys = (block) => new Set([...block.matchAll(/([A-Za-z][A-Za-z0-9]*):\s*'(?:[^'\\]|\\.)*'/g)].map((m) => m[1]))
const zh = keys(src.slice(zhStart, enStart))
const en = keys(src.slice(enStart, trStart))
const onlyZh = [...zh].filter((k) => !en.has(k))
const onlyEn = [...en].filter((k) => !zh.has(k))
const dyn = ['groupCurrent', 'groupSub', 'groupApi', 'groupWallet', 'groupOther']
const used = new Set([...[...src.matchAll(/tr\('([A-Za-z][A-Za-z0-9]*)'/g)].map((m) => m[1]), ...dyn])
const missing = [...used].filter((k) => !zh.has(k))
let bad = 0
if (onlyZh.length) { console.error('仅 zh 有:', onlyZh.join(', ')); bad = 1 }
if (onlyEn.length) { console.error('仅 en 有:', onlyEn.join(', ')); bad = 1 }
if (missing.length) { console.error('代码使用但字典缺失:', missing.join(', ')); bad = 1 }
if (bad) process.exit(1)
console.log(`i18n OK（zh ${zh.size} 键 / en ${en.size} 键 / 使用 ${used.size} 键）`)

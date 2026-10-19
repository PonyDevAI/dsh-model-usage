// 从 CHANGELOG.md 提取当前版本条目，作为 GitHub Release 正文
// 找不到当前版本条目 → 退出码 1（发布流程强制要求 CHANGELOG 规范）
import { readFileSync, writeFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const version = pkg.version
const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8')

const lines = changelog.split('\n')
const startRe = new RegExp('^##\\s+' + version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:\\s|$)')
let start = -1
for (let i = 0; i < lines.length; i++) {
  if (startRe.test(lines[i].trim())) { start = i; break }
}
if (start === -1) {
  console.error(`CHANGELOG.md 缺少当前版本 ## ${version} 条目（发布要求每个版本有说明）`)
  process.exit(1)
}
let end = lines.length
for (let i = start + 1; i < lines.length; i++) {
  if (/^##\s+/.test(lines[i].trim())) { end = i; break }
}
const body = lines.slice(start + 1, end).join('\n').trim()
if (!body) {
  console.error(`CHANGELOG.md 中 ## ${version} 条目内容为空`)
  process.exit(1)
}

const out = process.argv[2] || '/tmp/release-notes.md'
writeFileSync(out, body + '\n')
console.log(`release notes → ${out}（版本 ${version}，${body.split('\n').length} 行）`)

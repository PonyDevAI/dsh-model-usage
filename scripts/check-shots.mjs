// 截图来源门禁：docs/screenshots、docs/mockups 下的每张图必须在 MANIFEST 中登记，
// 且必须由 scripts/ 下的离线 harness 使用假数据生成；禁止真机 / 真实账户截图。
// 登记格式（docs/screenshots/MANIFEST.md，一行一张）：
//   - `docs/screenshots/01-regions.png` ← `scripts/render-test.mjs`
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST = 'docs/screenshots/MANIFEST.md'
const IMAGE_RE = /\.(png|jpe?g|webp|gif)$/i
const ENTRY_RE = /^-\s+`([^`]+)`\s+←\s+`([^`]+)`\s*$/

function tracked() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
  return out.split('\0').filter(Boolean)
}

const images = tracked().filter(
  (f) => (f.startsWith('docs/screenshots/') || f.startsWith('docs/mockups/')) && IMAGE_RE.test(f),
)
if (images.length === 0) {
  console.log('shots gate: ok（docs 下无截图）')
  process.exit(0)
}

const manifestPath = join(ROOT, MANIFEST)
if (!existsSync(manifestPath)) {
  console.error(`shots gate: 发现 ${images.length} 张截图，但缺少 ${MANIFEST}`)
  console.error('  → 截图只能由离线 harness（scripts/*.mjs）生成，并在 MANIFEST 登记生成命令')
  process.exit(1)
}

const entries = new Map()
for (const line of readFileSync(manifestPath, 'utf8').split('\n')) {
  const m = ENTRY_RE.exec(line.trim())
  if (!m) continue
  entries.set(m[1], m[2])
}

const problems = []
for (const image of images) {
  const source = entries.get(image)
  if (!source) {
    problems.push(`${image} 未在 ${MANIFEST} 登记`)
    continue
  }
  if (!/^scripts\/[A-Za-z0-9._-]+\.mjs$/.test(source)) {
    problems.push(`${image} 的来源 "${source}" 不是离线 harness（应为 scripts/*.mjs）`)
  }
}
for (const image of entries.keys()) {
  if (!images.includes(image)) problems.push(`${MANIFEST} 登记了不存在的文件：${image}`)
}

if (problems.length === 0) {
  console.log(`shots gate: ok（${images.length} 张截图均有 harness 来源）`)
  process.exit(0)
}

console.error('shots gate: 截图来源不合规：')
for (const p of problems) console.error('  ' + p)
process.exit(1)

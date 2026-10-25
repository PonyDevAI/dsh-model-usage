// 隐私门禁：禁止真实个人信息 / 本机标识 / 凭据进入仓库。
// 由 2026-10 四插件隐私审计沉淀；在 `npm run check` 与 CI 中强制执行。
// 设计取舍：
// - 允许 100.64.0.x 作为 Tailscale 分类测试段（通用测试值，非真实设备）；
// - 允许 example-tailnet.ts.net / tail1234.ts.net 作为占位域名；
// - 真实设备序列号按「5 位数字 + 4 位大写字母 + 5 位数字」模式识别（如 SERIAL0123456789AB）。
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SKIP_EXT = /\.(png|jpe?g|gif|webp|bmp|ico|icns|woff2?|ttf|otf|mp4|mov|h264|zip|tgz|gz|pdf|p12|cer)$/i

const RULES = [
  {
    id: 'home-path',
    re: /\/Users\/[A-Za-z0-9._-]+\//g,
    hint: '本机绝对路径：改用 ~/... 或 <path>',
  },
  {
    id: 'cgnat-ip',
    re: /\b100\.(?:6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.\d{1,3}\.\d{1,3}\b/g,
    hint: 'Tailscale CGNAT 设备 IP：改用 192.0.2.x（RFC 5737）或 100.64.0.x 测试段',
    allow: (m) => /^100\.64\.0\.\d{1,3}$/.test(m),
  },
  {
    id: 'private-host',
    re: /\bunicom-[a-z0-9-]+/gi,
    hint: '私有主机名前缀：改用 node-a / example-* 等中性命名',
  },
  {
    id: 'tsnet-fqdn',
    re: /\b[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*\.ts\.net\b/g,
    hint: '真实 tailnet 域名：改用 example-tailnet.ts.net / tail1234.ts.net',
    allow: (m) => /(?:^|\.)example-tailnet\.ts\.net$/.test(m) || /(?:^|\.)tail1234\.ts\.net$/.test(m),
  },
  {
    id: 'device-serial',
    re: /\b[0-9]{5}[A-Z]{4}[0-9]{5}\b/g,
    hint: '疑似真实设备序列号：改用 SERIAL0123456789AB',
  },
  {
    id: 'private-email',
    re: /\b[A-Za-z0-9._%+-]+@(?:gmail|qq|163|outlook|hotmail|icloud|foxmail|126|sina|sohu)\.[A-Za-z.]{2,6}\b/gi,
    hint: '私人邮箱：只允许 GitHub noreply 身份',
  },
  {
    id: 'secret-token',
    re: /\b(?:ghp_|gho_|ghs_|github_pat_|npm_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{20,}|xox[baprs]-)[A-Za-z0-9_-]{4,}/g,
    hint: '疑似凭据：禁止提交任何 token / key',
  },
  {
    id: 'private-key',
    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
    hint: '私钥：禁止提交',
  },
]

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
  return out.split('\0').filter(Boolean)
}

const hits = []
for (const file of trackedFiles()) {
  if (SKIP_EXT.test(file)) continue
  let text
  try {
    text = readFileSync(join(ROOT, file), 'utf8')
  } catch {
    continue
  }
  if (text.length > 4 * 1024 * 1024) continue
  const lines = text.split('\n')
  for (const rule of RULES) {
    for (let i = 0; i < lines.length; i++) {
      rule.re.lastIndex = 0
      const matches = lines[i].match(rule.re)
      if (!matches) continue
      for (const m of matches) {
        if (rule.allow && rule.allow(m)) continue
        hits.push({ file, line: i + 1, rule: rule.id, sample: m, hint: rule.hint })
      }
    }
  }
}

if (hits.length === 0) {
  console.log('privacy gate: ok（未发现真实个人信息 / 凭据）')
  process.exit(0)
}

console.error(`privacy gate: ${hits.length} 处命中，禁止提交：`)
for (const hit of hits) {
  console.error(`  ${hit.file}:${hit.line}  [${hit.rule}]  ${hit.sample}  → ${hit.hint}`)
}
process.exit(1)

#!/usr/bin/env node
/**
 * 把明文的受保護模組內容（protected/modules.plain.json，gitignore）加密成
 * 可進版控的密文（public/protected/modules.enc.json，AES-GCM）。
 *
 * 用法：
 *   npm run protect:encrypt
 *   npm run protect:encrypt -- --in protected/modules.plain.json --out public/protected/modules.enc.json --iterations 600000
 *
 * 加密前先驗證明文形狀（ProtectedModuleMap）與 registry 的 slug 雙向比對，
 * 任一不符就直接失敗——不會把形狀錯誤或漏收模組的內容悄悄加密進去。
 * 密碼來源：環境變數 SPORT3D_PROTECT_PASSWORD，沒設就互動輸入（見 scripts/protect-lib.mjs）。
 */
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { isProtectedModuleMap } from '../app/modules/protected.ts'
import { encryptPayload } from '../app/utils/protected-crypto.ts'
import { parseArgs, readPassword, registrySlugs } from './protect-lib.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const args = parseArgs(process.argv.slice(2))
const inPath = join(ROOT, args.in ?? 'protected/modules.plain.json')
const outPath = join(ROOT, args.out ?? 'public/protected/modules.enc.json')
const iterations = args.iterations ? Number(args.iterations) : 600_000

const raw = await readFile(inPath, 'utf8')
let plain
try {
  plain = JSON.parse(raw)
}
catch {
  console.error(`${inPath} 不是合法 JSON`)
  process.exit(1)
}

if (!isProtectedModuleMap(plain)) {
  console.error(`${inPath} 形狀不符 ProtectedModuleMap，先修正明文再加密`)
  process.exit(1)
}

const plainSlugs = new Set(Object.keys(plain))
const wantedSlugs = new Set(await registrySlugs())

const missing = [...wantedSlugs].filter(slug => !plainSlugs.has(slug))
const extra = [...plainSlugs].filter(slug => !wantedSlugs.has(slug))
if (missing.length > 0 || extra.length > 0) {
  if (missing.length > 0)
    console.error(`模組缺受保護內容：${missing.join('、')}`)
  if (extra.length > 0)
    console.error(`明文有 registry 不存在的 slug：${extra.join('、')}`)
  process.exit(1)
}

const password = await readPassword({ confirm: true })
const bundle = await encryptPayload(raw, [...wantedSlugs], password, { iterations })

await mkdir(dirname(outPath), { recursive: true })
const json = `${JSON.stringify(bundle, null, 2)}\n`
await writeFile(outPath, json)

const plainBytes = Buffer.byteLength(raw)
const cipherBytes = Buffer.byteLength(json)
const plainHash = createHash('sha256').update(raw).digest('hex').slice(0, 12)

console.log(`已加密 ${wantedSlugs.size} 個模組 → ${outPath}`)
console.log(`明文 ${plainBytes} bytes → 密文 ${cipherBytes} bytes`)
console.log(`明文 SHA-256 前 12 碼：${plainHash}`)

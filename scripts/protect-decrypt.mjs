#!/usr/bin/env node
/**
 * 用密文（public/protected/modules.enc.json）解回明文（protected/modules.plain.json）。
 * 換電腦或新 clone 後的救援路徑；密碼錯誤會被擋下、不會落地殘破內容。
 *
 * 用法：
 *   npm run protect:decrypt              # → protected/modules.plain.json
 *   npm run protect:decrypt -- --stdout  # 只印出來不落地
 *   npm run protect:decrypt -- --force   # 覆寫已存在的明文
 *
 * 預設拒絕覆寫已存在的明文，避免手滑用舊密文蓋掉本機還沒加密的新編輯。
 * 密碼來源：環境變數 SPORT3D_PROTECT_PASSWORD，沒設就互動輸入（見 scripts/protect-lib.mjs）。
 */
import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { decryptPayload, UnlockError } from '../app/utils/protected-crypto.ts'
import { loadBundle, parseArgs, readPassword } from './protect-lib.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const args = parseArgs(process.argv.slice(2))
const inPath = join(ROOT, args.in ?? 'public/protected/modules.enc.json')
const outPath = join(ROOT, args.out ?? 'protected/modules.plain.json')
const toStdout = args.stdout === true
const force = args.force === true

if (!toStdout && !force) {
  const exists = await access(outPath).then(() => true, () => false)
  if (exists) {
    console.error(`${outPath} 已存在，預設拒絕覆寫（避免手滑用舊密文蓋掉本機還沒加密的新編輯）。要覆寫請加 --force`)
    process.exit(1)
  }
}

const bundle = await loadBundle(inPath)
const password = await readPassword({ confirm: false })

let plaintext
try {
  plaintext = await decryptPayload(bundle, password)
}
catch (error) {
  if (error instanceof UnlockError) {
    console.error('密碼錯誤')
    process.exit(1)
  }
  throw error
}

if (toStdout) {
  process.stdout.write(plaintext)
}
else {
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, plaintext)
  console.log(`已解密 → ${outPath}`)
}

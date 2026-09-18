#!/usr/bin/env node
// 受保護模組內容守門檢查——擋住四種會讓 AES-GCM 保護失效的操作：
//   a. 明文欄位（data/handoff/limitations/references）被寫回 registry
//   b. 密文檔（public/protected/modules.enc.json）被誤刪或格式壞掉
//   c. 加了新模組卻忘記重跑 npm run protect:encrypt（密文／registry 的 slug 集合對不上）
//   d. 明文路徑（protected/modules.plain.json）沒被 gitignore 或誤入版控
//
// 四條預設檢查不需密碼、不需明文——CI 是 fresh checkout，兩者都沒有。
// 由 npm run eslint 串跑；違規列出原因並以 exit 1 失敗。
//
// --deep（本機用，npm run protect:verify，不進 CI）：額外用密碼解密，
// 與本機明文逐字元比對，證明密文確實是目前明文加密出來的。

import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { decryptPayload, UnlockError } from '../app/utils/protected-crypto.ts'
import { loadBundle, parseArgs, readPassword, registrySlugs } from './protect-lib.mjs'

const BUNDLE_PATH = 'public/protected/modules.enc.json'
const PLAIN_PATH = 'protected/modules.plain.json'
const PROTECTED_FIELDS = ['data', 'handoff', 'limitations', 'references']

const args = parseArgs(process.argv.slice(2))
const deep = args.deep === true

const violations = []

// a. registry 不得帶受保護欄位——明文寫回 registry 就會重新進 bundle
const { modules } = await import('../app/modules/registry.ts')
for (const mod of modules) {
  const leaked = PROTECTED_FIELDS.filter(field => Object.hasOwn(mod, field))
  if (leaked.length > 0)
    violations.push(`registry「${mod.slug}」帶受保護欄位：${leaked.join('、')}——明文不能寫回 registry`)
}

// b. 密文檔存在且 schema 完整（形狀驗證重用 protect-lib.mjs 的 loadBundle）
let bundle
try {
  bundle = await loadBundle(BUNDLE_PATH)
}
catch (error) {
  if (error?.code === 'ENOENT') {
    console.error(`${BUNDLE_PATH} 不存在——密文檔被誤刪，用 git checkout 還原或重跑 npm run protect:encrypt`)
    process.exit(1)
  }
  throw error
}

// c. 密文的 slugs 集合必須與 registry 的 slug 集合一致
const registrySlugSet = new Set(await registrySlugs())
const bundleSlugSet = new Set(bundle.slugs)
const missingInBundle = [...registrySlugSet].filter(slug => !bundleSlugSet.has(slug))
const extraInBundle = [...bundleSlugSet].filter(slug => !registrySlugSet.has(slug))
if (missingInBundle.length > 0)
  violations.push(`密文缺 registry 有的模組：${missingInBundle.join('、')}——忘了重跑 npm run protect:encrypt`)
if (extraInBundle.length > 0)
  violations.push(`密文多出 registry 沒有的模組：${extraInBundle.join('、')}——忘了重跑 npm run protect:encrypt`)

// d. 明文路徑必須被 gitignore，且從未進版控
try {
  execFileSync('git', ['check-ignore', '-q', PLAIN_PATH])
}
catch {
  violations.push(`${PLAIN_PATH} 未被 .gitignore 排除——明文可能誤入版控`)
}
try {
  execFileSync('git', ['ls-files', '--error-unmatch', PLAIN_PATH], { stdio: 'ignore' })
  violations.push(`${PLAIN_PATH} 已進版控——明文外洩，立即從版控移除並清歷史`)
}
catch {
  // 預期行為：不在版控裡才是對的，ls-files 找不到會拋錯
}

if (violations.length > 0) {
  console.error(`受保護內容守門檢查失敗：\n${violations.map(v => `  ${v}`).join('\n')}`)
  process.exit(1)
}

console.log(`受保護內容守門檢查通過（${modules.length} 個模組、密文 ${bundle.slugs.length} 筆）`)

// --deep：本機額外驗證密文解密結果與本機明文逐字元一致
if (deep) {
  const plainRaw = await readFile(PLAIN_PATH, 'utf8').catch(() => null)
  if (plainRaw === null) {
    console.log(`（略過 --deep：找不到 ${PLAIN_PATH}，本機無明文可比對）`)
  }
  else {
    const password = await readPassword({ confirm: false })
    let decrypted
    try {
      decrypted = await decryptPayload(bundle, password)
    }
    catch (error) {
      if (error instanceof UnlockError) {
        console.error('密碼錯誤或密文已損毀，--deep 比對失敗')
        process.exit(1)
      }
      throw error
    }
    if (decrypted !== plainRaw) {
      console.error('密文解密結果與本機明文不一致——密文不是目前明文加密出來的，重跑 npm run protect:encrypt')
      process.exit(1)
    }
    console.log('--deep：密文與本機明文逐字元相符')
  }
}

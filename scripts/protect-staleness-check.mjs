#!/usr/bin/env node
// 提醒「改了明文卻忘記重新加密」——網站讀的是密文，明文改了不會自動生效。
//
// 由 predev／prebuild／pregenerate 自動跑，**永遠 exit 0，不擋任何事**。
// 它的工作是在你忘記的時候喊一聲，不是當關卡。真正的關卡是
// protected-content-check.mjs（串在 npm run eslint）與 protect:verify。
//
// 判斷分兩層：
//   1. 先比檔案時間（零成本）。明文不比密文新就直接過，這是絕大多數情況。
//   2. 明文比較新時，才真的解密比對內容——因為 git checkout、rsync 都會動到
//      檔案時間，只看時間會誤報，害人白跑一次加密產生 62KB 的無謂 diff。
//      拿不到密碼（非 macOS、沒存鑰匙圈）就退回只用時間判斷，語氣放軟。
//
// 明文不存在是正常狀態（剛 clone、或不需要改內容的人），直接安靜跳過。

import { readFile, stat } from 'node:fs/promises'
import process from 'node:process'
import { decryptPayload } from '../app/utils/protected-crypto.ts'
import { loadBundle, passwordFromKeychain } from './protect-lib.mjs'

const PLAIN_PATH = 'protected/modules.plain.json'
const BUNDLE_PATH = 'public/protected/modules.enc.json'

function warn(lines) {
  console.warn('')
  for (const line of lines) console.warn(line)
  console.warn('')
}

let plainStat, bundleStat
try {
  ;[plainStat, bundleStat] = await Promise.all([stat(PLAIN_PATH), stat(BUNDLE_PATH)])
}
catch {
  // 明文或密文不在——前者是正常狀態，後者由 protected-content-check.mjs 負責報
  process.exit(0)
}

// 第 1 層：明文不比密文新 → 一定沒問題
if (plainStat.mtimeMs <= bundleStat.mtimeMs)
  process.exit(0)

// 第 2 層：時間看起來過期了，解密比對內容確認，避免 checkout 造成的誤報
const password = process.env.SPORT3D_PROTECT_PASSWORD || passwordFromKeychain()

if (!password) {
  warn([
    '⚠️  protected/modules.plain.json 的修改時間比密文新。',
    '   如果你剛改過那四個區塊的內容，記得跑 npm run protect:encrypt，',
    '   否則網站上顯示的還是舊的。（沒有密碼可用，無法確認是不是真的改了）',
  ])
  process.exit(0)
}

try {
  const [plain, bundle] = await Promise.all([
    readFile(PLAIN_PATH, 'utf8'),
    loadBundle(BUNDLE_PATH),
  ])
  const decrypted = await decryptPayload(bundle, password)

  if (decrypted !== plain) {
    warn([
      '⚠️  你改過 protected/modules.plain.json，但還沒重新加密。',
      '   網站讀的是加密後的那份，所以畫面上還是舊內容。',
      '',
      '   跑這行更新：npm run protect:encrypt',
    ])
  }
}
catch {
  // 密碼錯、密文壞掉之類——這裡只負責提醒，不搶 protect:verify 的工作
}

process.exit(0)

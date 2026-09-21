/**
 * scripts/protect-encrypt.mjs 與 scripts/protect-decrypt.mjs 共用工具，本身無 CLI。
 *
 * 提供：
 *   parseArgs(argv)           解析 --key value / --flag 形式的參數
 *   readPassword({ confirm }) 取密碼：環境變數 → macOS 鑰匙圈 → 互動隱藏輸入，依序嘗試
 *   promptHidden(label)       單次隱藏輸入（stdin raw mode，不回顯）
 *   loadBundle(path)          讀密文檔並驗證是合法的 EncryptedBundle 形狀
 *   registrySlugs()           讀 registry 取全部模組 slug
 *
 * 密碼絕不能靜默落成空字串：非 TTY 且沒設環境變數一律報錯退出。
 */
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { isEncryptedBundle } from '../app/utils/protected-crypto.ts'

export function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith('--'))
      continue
    const key = token.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) {
      args[key] = true
    }
    else {
      args[key] = next
      i++
    }
  }
  return args
}

/** 單次隱藏輸入：不回顯、Enter 送出、Ctrl+C 中斷 */
export function promptHidden(label) {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process
    if (!stdin.isTTY) {
      reject(new Error('非互動環境（stdin 非 TTY），無法提示輸入密碼'))
      return
    }

    stdout.write(label)
    stdin.resume()
    stdin.setEncoding('utf8')
    stdin.setRawMode(true)

    let input = ''
    function cleanup() {
      stdin.setRawMode(false)
      stdin.pause()
      stdin.removeListener('data', onData)
    }
    function onData(char) {
      switch (char) {
        case '': // Ctrl+D
        case '\r':
        case '\n':
          cleanup()
          stdout.write('\n')
          resolve(input)
          break
        case '': // Ctrl+C
          cleanup()
          stdout.write('\n')
          reject(new Error('使用者中斷輸入'))
          break
        case '': // Backspace
          input = input.slice(0, -1)
          break
        default:
          input += char
          break
      }
    }
    stdin.on('data', onData)
  })
}

/** macOS 鑰匙圈裡存密碼用的服務名。存法見 protected/README.md */
export const KEYCHAIN_SERVICE = 'sport3d-protect'

/** security 的輸出結尾固定帶一個換行，取值時要去掉 */
const TRAILING_NEWLINE = /\n$/

/**
 * 從 macOS 鑰匙圈取密碼，取不到回 null。
 *
 * 非 macOS、沒存過、或使用者在系統彈窗按了拒絕，都會讓 security 回非 0，
 * 一律視為「這條路沒有密碼」往下一層走，不中斷流程。
 */
export function passwordFromKeychain() {
  if (process.platform !== 'darwin')
    return null

  try {
    const out = execFileSync(
      'security',
      ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
    return out.replace(TRAILING_NEWLINE, '') || null
  }
  catch {
    return null
  }
}

/**
 * 取得密碼，依序嘗試三個來源：
 *   1. SPORT3D_PROTECT_PASSWORD 環境變數（CI 或臨時覆寫用）
 *   2. macOS 鑰匙圈（日常用；由作業系統加密保管，不落在專案目錄裡）
 *   3. 互動隱藏輸入
 *
 * confirm 為 true 時（加密流程）要求再輸入一次確認，避免手滑打錯字自己都不知道。
 * 注意 confirm 只作用在第 3 層——前兩層是既有的可信來源，不需要再確認一次。
 */
export async function readPassword({ confirm = false } = {}) {
  const fromEnv = process.env.SPORT3D_PROTECT_PASSWORD
  if (fromEnv)
    return fromEnv

  const fromKeychain = passwordFromKeychain()
  if (fromKeychain)
    return fromKeychain

  if (!process.stdin.isTTY) {
    console.error('找不到密碼：SPORT3D_PROTECT_PASSWORD 未設定、鑰匙圈也沒有，且 stdin 非互動環境')
    console.error('存進鑰匙圈：security add-generic-password -a "$USER" -s sport3d-protect -w')
    process.exit(1)
  }

  const password = await promptHidden('密碼：')
  if (!password) {
    console.error('密碼不可為空')
    process.exit(1)
  }
  if (confirm) {
    const again = await promptHidden('再輸入一次確認：')
    if (again !== password) {
      console.error('兩次輸入的密碼不一致')
      process.exit(1)
    }
  }
  return password
}

/** 讀密文檔並驗證形狀，格式不符直接報錯退出（不回傳半殘的資料給呼叫端判斷） */
export async function loadBundle(path) {
  const raw = await readFile(path, 'utf8')
  let bundle
  try {
    bundle = JSON.parse(raw)
  }
  catch {
    console.error(`${path} 不是合法 JSON`)
    process.exit(1)
  }
  if (!isEncryptedBundle(bundle)) {
    console.error(`${path} 不是合法的密文 bundle 格式`)
    process.exit(1)
  }
  return bundle
}

/** 讀 registry 取全部模組 slug（Node 原生 type stripping 讀 .ts，registry 內的動態 import 是惰性的不會真的執行） */
export async function registrySlugs() {
  const { modules } = await import('../app/modules/registry.ts')
  return modules.map(m => m.slug)
}

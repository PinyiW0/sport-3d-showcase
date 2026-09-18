/**
 * scripts/protect-encrypt.mjs 與 scripts/protect-decrypt.mjs 共用工具，本身無 CLI。
 *
 * 提供：
 *   parseArgs(argv)           解析 --key value / --flag 形式的參數
 *   readPassword({ confirm }) 取密碼：SPORT3D_PROTECT_PASSWORD 有值就用，否則互動隱藏輸入
 *   promptHidden(label)       單次隱藏輸入（stdin raw mode，不回顯）
 *   loadBundle(path)          讀密文檔並驗證是合法的 EncryptedBundle 形狀
 *   registrySlugs()           讀 registry 取全部模組 slug
 *
 * 密碼絕不能靜默落成空字串：非 TTY 且沒設環境變數一律報錯退出。
 */
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

/**
 * 取得密碼：環境變數優先，沒設就互動隱藏輸入。
 * confirm 為 true 時（加密流程）要求再輸入一次確認，避免手滑打錯字自己都不知道。
 */
export async function readPassword({ confirm = false } = {}) {
  const fromEnv = process.env.SPORT3D_PROTECT_PASSWORD
  if (fromEnv)
    return fromEnv

  if (!process.stdin.isTTY) {
    console.error('未設定 SPORT3D_PROTECT_PASSWORD，且 stdin 非互動環境，無法提示輸入密碼')
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

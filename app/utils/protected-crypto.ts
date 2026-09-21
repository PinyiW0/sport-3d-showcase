// 受保護模組內容的加解密實作——Node 腳本（scripts/protect-*.mjs）與瀏覽器前端
// import 同一份原始碼，兩邊都要能執行。
//
// 硬性約束：本檔只能用兩端都有的 API。
// 禁止 Nuxt auto-import、禁止 Buffer、禁止 process。
// 可用的只有 globalThis.crypto（含 subtle 與 getRandomValues）、TextEncoder/TextDecoder、atob/btoa。
//
// 加密規格（不要改動任何參數）：
// - KDF：PBKDF2-SHA256，600000 次迭代，salt 16 bytes
// - 加密：AES-GCM 256-bit，iv 12 bytes，128-bit auth tag（WebCrypto 預設，附在 ciphertext 尾端）
// - salt 與 iv 每次加密都用 crypto.getRandomValues 重新產生，絕不重複使用

export interface EncryptedBundle {
  version: number
  algorithm: 'AES-GCM'
  kdf: {
    name: 'PBKDF2'
    hash: 'SHA-256'
    iterations: number
    salt: string
  }
  iv: string
  ciphertext: string
  slugs: string[]
  generatedAt: string
}

export type UnlockErrorKind = 'wrong-password' | 'fetch-failed' | 'corrupt-bundle' | 'unsupported'

export class UnlockError extends Error {
  readonly kind: UnlockErrorKind

  constructor(message: string, kind: UnlockErrorKind) {
    super(message)
    this.name = 'UnlockError'
    this.kind = kind
  }
}

const BUNDLE_VERSION = 1
const SALT_BYTES = 16
const IV_BYTES = 12
const PBKDF2_ITERATIONS = 600_000

/** 一次 spread 四萬個參數會爆 call stack，分 32KB 一段轉 base64 */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK)
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  return btoa(binary)
}

// 明確標成 Uint8Array<ArrayBuffer>：TS 5.7+ 的 Uint8Array 預設泛型含 SharedArrayBuffer，
// 傳給 WebCrypto 的 BufferSource 參數型別對不上，這裡鎖死具體型別才會過 typecheck。
function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++)
    bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** 兩端都有 globalThis.crypto，但獨立抽出來才能給出好懂的「不支援」錯誤 */
function getCrypto(): Crypto {
  const crypto = globalThis.crypto
  if (!crypto?.subtle)
    throw new UnlockError('此環境不支援 Web Crypto API', 'unsupported')
  return crypto
}

/**
 * 由密碼與 salt 衍生 AES-GCM 金鑰。
 * extractable 一律關閉、keyUsages 只給呼叫端實際要做的那個操作，
 * 金鑰全程留在 WebCrypto 內部、不可被匯出。
 */
async function deriveKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
  usage: 'encrypt' | 'decrypt',
): Promise<CryptoKey> {
  const { subtle } = getCrypto()
  const keyMaterial = await subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  )
}

/** 判斷是否為合法的密文 bundle（形狀守衛，不驗證密文內容是否解得開） */
export function isEncryptedBundle(v: unknown): v is EncryptedBundle {
  if (v === null || typeof v !== 'object')
    return false
  const bundle = v as Record<string, unknown>

  if (typeof bundle.version !== 'number' || bundle.algorithm !== 'AES-GCM')
    return false
  if (typeof bundle.iv !== 'string' || typeof bundle.ciphertext !== 'string')
    return false
  if (typeof bundle.generatedAt !== 'string')
    return false
  if (!Array.isArray(bundle.slugs) || !bundle.slugs.every(s => typeof s === 'string'))
    return false

  if (bundle.kdf === null || typeof bundle.kdf !== 'object')
    return false
  const kdf = bundle.kdf as Record<string, unknown>
  if (kdf.name !== 'PBKDF2' || kdf.hash !== 'SHA-256')
    return false
  if (typeof kdf.iterations !== 'number' || typeof kdf.salt !== 'string')
    return false

  return true
}

/** 加密明文，回傳可直接落地成 JSON 的 bundle */
export async function encryptPayload(
  plaintext: string,
  slugs: string[],
  password: string,
  opts?: { iterations?: number },
): Promise<EncryptedBundle> {
  const crypto = getCrypto()
  const iterations = opts?.iterations ?? PBKDF2_ITERATIONS

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await deriveKey(password, salt, iterations, 'encrypt')

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  )

  return {
    version: BUNDLE_VERSION,
    algorithm: 'AES-GCM',
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations,
      salt: bytesToBase64(salt),
    },
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    slugs,
    generatedAt: new Date().toISOString(),
  }
}

/** 解密 bundle，回傳原始明文字串。密碼錯誤或密文遭竄改一律丟 UnlockError('wrong-password') */
export async function decryptPayload(bundle: EncryptedBundle, password: string): Promise<string> {
  if (!isEncryptedBundle(bundle))
    throw new UnlockError('密文格式不正確', 'corrupt-bundle')

  const crypto = getCrypto()
  const salt = base64ToBytes(bundle.kdf.salt)
  const iv = base64ToBytes(bundle.iv)
  const key = await deriveKey(password, salt, bundle.kdf.iterations, 'decrypt')

  let plainBuffer: ArrayBuffer
  try {
    plainBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      base64ToBytes(bundle.ciphertext),
    )
  }
  catch (error) {
    // AES-GCM 的 auth tag 對不上——密碼錯或密文被動過，WebCrypto 兩者回同一種錯誤，分不出來。
    // 只比對 name 不用 instanceof DOMException：worker、iframe、測試環境屬於不同 realm，
    // 那裡丟出的 DOMException 與本地 globalThis.DOMException 不是同一個 class，instanceof 會失效。
    if (typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'OperationError')
      throw new UnlockError('密碼錯誤或密文已損毀', 'wrong-password')
    throw error
  }

  return new TextDecoder().decode(plainBuffer)
}

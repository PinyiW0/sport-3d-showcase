// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { isProtectedModuleMap } from '../../app/modules/protected'
import { decryptPayload, encryptPayload, UnlockError } from '../../app/utils/protected-crypto'

// 測試用小迭代數：正式加解密用 600000 次，單元測試每次都跑太慢，靠 opts.iterations 參數化
const TEST_ITERATIONS = 1000

describe('protected-crypto 加解密', () => {
  it('round-trip：加密後解密還原逐字元相同', async () => {
    // 準備：測資含中文、換行、引號
    const plaintext = '中文內容\n換行\n"雙引號"與\'單引號\''
    const password = 'correct-horse-battery-staple'

    // 執行
    const bundle = await encryptPayload(plaintext, ['baseball-spin'], password, { iterations: TEST_ITERATIONS })
    const decrypted = await decryptPayload(bundle, password)

    // 驗證
    expect(decrypted).toBe(plaintext)
  })

  it('錯密碼：丟出 UnlockError 且 kind 為 wrong-password', async () => {
    // 準備
    const bundle = await encryptPayload('secret', ['x'], 'right-password', { iterations: TEST_ITERATIONS })

    // 執行與驗證
    const attempt = decryptPayload(bundle, 'wrong-password')
    await expect(attempt).rejects.toBeInstanceOf(UnlockError)
    await expect(attempt).rejects.toMatchObject({ kind: 'wrong-password' })
  })

  it('竄改偵測：ciphertext 被改掉一個字元會被擋下', async () => {
    // 準備
    const bundle = await encryptPayload('secret', ['x'], 'password', { iterations: TEST_ITERATIONS })
    const flippedChar = bundle.ciphertext[0] === 'A' ? 'B' : 'A'
    const tampered = { ...bundle, ciphertext: flippedChar + bundle.ciphertext.slice(1) }

    // 執行與驗證
    await expect(decryptPayload(tampered, 'password')).rejects.toBeInstanceOf(UnlockError)
  })

  it('salt 與 iv：連續加密兩次皆不相同', async () => {
    // 執行
    const first = await encryptPayload('secret', ['x'], 'password', { iterations: TEST_ITERATIONS })
    const second = await encryptPayload('secret', ['x'], 'password', { iterations: TEST_ITERATIONS })

    // 驗證
    expect(first.kdf.salt).not.toBe(second.kdf.salt)
    expect(first.iv).not.toBe(second.iv)
  })

  it('bundle schema：欄位齊全、迭代數正確、salt 16 bytes、iv 12 bytes', async () => {
    // 執行
    const bundle = await encryptPayload('secret', ['x'], 'password', { iterations: TEST_ITERATIONS })

    // 驗證
    expect(bundle.algorithm).toBe('AES-GCM')
    expect(bundle.kdf.name).toBe('PBKDF2')
    expect(bundle.kdf.hash).toBe('SHA-256')
    expect(bundle.kdf.iterations).toBe(TEST_ITERATIONS)
    expect(atob(bundle.kdf.salt)).toHaveLength(16)
    expect(atob(bundle.iv)).toHaveLength(12)
  })

  it('isProtectedModuleMap：缺 data.summary 或 handoff.files 回 false', () => {
    // 準備
    const missingSummary = { a: { data: {}, handoff: { files: ['x'], flexPoints: ['y'] } } }
    const missingFiles = { a: { data: { summary: 's' }, handoff: { files: [], flexPoints: ['y'] } } }

    // 執行與驗證
    expect(isProtectedModuleMap(missingSummary)).toBe(false)
    expect(isProtectedModuleMap(missingFiles)).toBe(false)
  })
})

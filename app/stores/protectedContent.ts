import type { ProtectedModuleContent, ProtectedModuleMap } from '~/modules/types'
import type { UnlockErrorKind } from '~/utils/protected-crypto'
import { isProtectedModuleMap } from '~/modules/protected'
import { decryptPayload, isEncryptedBundle, UnlockError } from '~/utils/protected-crypto'

// 受保護模組內容（數據資料／交接說明／已知限制／參考資料）的解鎖狀態。
//
// 刻意不掛 persist：
// (a) frontend-security.md 禁止把敏感內容寫進 localStorage／sessionStorage；
// (b) 本站是 prerender 的，預渲染 HTML 永遠是鎖定狀態；解鎖狀態若存進儲存，
//     第二次造訪時 client 初始 state 會與 HTML 不一致，造成 hydration mismatch。
// 金鑰與解密後的內容只活在這次分頁的記憶體裡，重新整理就要重新解鎖。
export const useProtectedContentStore = defineStore('protected-content', () => {
  // 密文路徑在 setup 期就算好：useAssetUrl() 需要 Nuxt context，
  // 而 unlock() 是在 click handler 裡跑的，那時 context 可能已經散了。
  const asset = useAssetUrl()
  const bundleUrl = asset('/protected/modules.enc.json')

  // 整包一次換掉，不需要深層響應
  const content = shallowRef<ProtectedModuleMap | null>(null)
  const status = ref<'locked' | 'unlocking' | 'unlocked'>('locked')
  const error = ref<{ kind: UnlockErrorKind, message: string } | null>(null)
  const unlocked = computed(() => status.value === 'unlocked')

  async function unlock(password: string): Promise<boolean> {
    // 保險絲：prerender 期絕不解密
    if (import.meta.server)
      return false

    // 解鎖中就不再受理：表單按 Enter 不受送出鈕 disabled 保護，
    // 連按會疊出多次解密，每次都要跑 60 萬輪 PBKDF2，而且彼此覆寫狀態
    if (status.value === 'unlocking')
      return false

    if (!globalThis.crypto?.subtle) {
      error.value = { kind: 'unsupported', message: '此連線不支援 Web Crypto（需 HTTPS 或 localhost），無法解鎖' }
      status.value = 'locked'
      return false
    }

    status.value = 'unlocking'
    error.value = null

    let raw: unknown
    try {
      raw = await $fetch<unknown>(bundleUrl, { responseType: 'json' })
    }
    catch {
      error.value = { kind: 'fetch-failed', message: '載入受保護內容失敗，請檢查網路後重試' }
      status.value = 'locked'
      return false
    }

    if (!isEncryptedBundle(raw)) {
      error.value = { kind: 'corrupt-bundle', message: '受保護內容格式不符，請聯絡維護者重新產生密文' }
      status.value = 'locked'
      return false
    }

    let plaintext: string
    try {
      plaintext = await decryptPayload(raw, password)
    }
    catch (e) {
      const kind = e instanceof UnlockError ? e.kind : 'corrupt-bundle'
      const message = kind === 'wrong-password' ? '密碼錯誤，請再試一次' : '受保護內容格式不符，請聯絡維護者重新產生密文'
      error.value = { kind, message }
      status.value = 'locked'
      return false
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(plaintext)
    }
    catch {
      error.value = { kind: 'corrupt-bundle', message: '受保護內容格式不符，請聯絡維護者重新產生密文' }
      status.value = 'locked'
      return false
    }

    if (!isProtectedModuleMap(parsed)) {
      error.value = { kind: 'corrupt-bundle', message: '受保護內容格式不符，請聯絡維護者重新產生密文' }
      status.value = 'locked'
      return false
    }

    content.value = parsed
    status.value = 'unlocked'
    return true
  }

  function lock(): void {
    content.value = null
    status.value = 'locked'
    error.value = null
  }

  function contentOf(slug: string): ProtectedModuleContent | null {
    return content.value?.[slug] ?? null
  }

  return { content, status, error, unlocked, unlock, lock, contentOf }
})

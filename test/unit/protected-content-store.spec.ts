import type { ProtectedModuleMap } from '~/modules/types'
import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { createError } from 'h3'
import { beforeEach, describe, expect, it } from 'vitest'
import { useProtectedContentStore } from '~/stores/protectedContent'
import { encryptPayload } from '~/utils/protected-crypto'

// 假造的密文端點路徑：與 useAssetUrl()('/protected/modules.enc.json') 在測試環境（baseURL 為根路徑）算出的路徑一致
const BUNDLE_PATH = '/protected/modules.enc.json'
// 測試用小迭代數：正式加解密用 600000 次，單元測試每次都跑太慢，靠 opts.iterations 參數化
const TEST_ITERATIONS = 1000
const PASSWORD = 'correct-horse-battery-staple'

const PLAIN_MAP: ProtectedModuleMap = {
  'test-slug': {
    data: { summary: '測試用摘要' },
    handoff: { files: ['a.ts'], flexPoints: ['b'] },
  },
}

async function registerValidBundle() {
  const bundle = await encryptPayload(JSON.stringify(PLAIN_MAP), Object.keys(PLAIN_MAP), PASSWORD, { iterations: TEST_ITERATIONS })
  registerEndpoint(BUNDLE_PATH, () => bundle)
}

describe('useProtectedContentStore', () => {
  beforeEach(() => {
    useProtectedContentStore().lock()
  })

  it('初始 state：locked、content 為 null、contentOf 回 null', () => {
    const store = useProtectedContentStore()
    expect(store.status).toBe('locked')
    expect(store.content).toBeNull()
    expect(store.contentOf('x')).toBeNull()
  })

  it('unlock(正確密碼)：unlocked 為 true，contentOf(slug) 拿得到內容', async () => {
    await registerValidBundle()
    const store = useProtectedContentStore()

    const ok = await store.unlock(PASSWORD)

    expect(ok).toBe(true)
    expect(store.unlocked).toBe(true)
    expect(store.contentOf('test-slug')).toEqual(PLAIN_MAP['test-slug'])
  })

  it('unlock(錯密碼)：回 locked、error.kind 為 wrong-password，content 仍是 null', async () => {
    await registerValidBundle()
    const store = useProtectedContentStore()

    const ok = await store.unlock('wrong-password')

    expect(ok).toBe(false)
    expect(store.status).toBe('locked')
    expect(store.error?.kind).toBe('wrong-password')
    expect(store.content).toBeNull()
  })

  it('端點回 404：error.kind 為 fetch-failed', async () => {
    registerEndpoint(BUNDLE_PATH, () => {
      throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    })
    const store = useProtectedContentStore()

    const ok = await store.unlock(PASSWORD)

    expect(ok).toBe(false)
    expect(store.error?.kind).toBe('fetch-failed')
  })

  it('lock()：content 與 error 都清空', async () => {
    await registerValidBundle()
    const store = useProtectedContentStore()
    await store.unlock(PASSWORD)

    store.lock()

    expect(store.status).toBe('locked')
    expect(store.content).toBeNull()
    expect(store.error).toBeNull()
  })

  it('解鎖進行中再次呼叫直接回 false，不重複解密', async () => {
    await registerValidBundle()
    const store = useProtectedContentStore()

    // 不 await 第一次：unlock 同步跑到 status = 'unlocking' 才遇到第一個 await
    const first = store.unlock(PASSWORD)
    const second = await store.unlock(PASSWORD)

    expect(second).toBe(false)
    expect(await first).toBe(true)
    expect(store.unlocked).toBe(true)
  })

  it('【守 frontend-security】解鎖成功後不落地 localStorage／sessionStorage', async () => {
    await registerValidBundle()
    const store = useProtectedContentStore()
    // 站台本身的深色模式模組會寫 localStorage（與本功能無關），
    // 所以驗證「解鎖前後 storage 一個字都沒變」，而非驗證整個 storage 是空的。
    // 比對完整快照而不只比長度：覆寫既有 key 不會改變長度，但一樣是落地。
    function snapshot(store: Storage): string {
      return JSON.stringify(Object.keys({ ...store }).sort().map(k => [k, store.getItem(k)]))
    }
    const localBefore = snapshot(localStorage)
    const sessionBefore = snapshot(sessionStorage)

    await store.unlock(PASSWORD)

    expect(store.unlocked).toBe(true)
    expect(snapshot(localStorage)).toBe(localBefore)
    expect(snapshot(sessionStorage)).toBe(sessionBefore)
  })
})

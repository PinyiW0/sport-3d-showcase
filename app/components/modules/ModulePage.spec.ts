import type { ModuleSpec, ProtectedModuleContent, ProtectedModuleMap } from '~/modules/types'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it } from 'vitest'
import { useProtectedContentStore } from '~/stores/protectedContent'
import ModulePage from './ModulePage.vue'

// ModulePage 是 11 個模組頁共用的範本。「數據資料」區塊的欄位組合只有兩種
// （全給／只給 format），版面調整時兩種都要顧到，所以在這裡鎖住；
// 另外數據資料／交接說明／已知限制／參考資料四個區塊受保護，
// 版面調整時「未解鎖」與「解鎖後」兩種鎖定狀態也都要顧到。

function spec(): ModuleSpec {
  return {
    slug: 'test',
    title: '測試模組',
    sport: 'baseball',
    status: 'wip',
    category: 'ball',
    summary: '摘要',
    tags: [],
    tech: ['Vue 3'],
  }
}

function protectedOf(data: ProtectedModuleContent['data']): ProtectedModuleContent {
  return {
    data,
    handoff: { files: [], flexPoints: [] },
  }
}

// setup store 沒有 $reset，改用 $patch 種資料
function unlockWith(map: ProtectedModuleMap) {
  useProtectedContentStore().$patch({ content: map, status: 'unlocked' })
}

const full = protectedOf({
  summary: '吃每球的入壘點',
  format: 'DistributionPitch',
  sample: '{ "x": 1 }',
  sampleUrl: 'public/samples/x.json',
})

const formatOnly = protectedOf({ summary: '規劃中', format: 'series[metric][frame]' })

describe('modulePage 鎖定狀態', () => {
  beforeEach(() => {
    useProtectedContentStore().lock()
  })

  it('未解鎖時四個受保護區塊完全不進 DOM', async () => {
    const wrapper = await mountSuspended(ModulePage, { props: { module: spec() } })
    // 用區塊標題（ModuleSection 的 h2）判斷區塊本身在不在，
    // 而不是整頁文字——解鎖面板本來就會列出這四個名稱告訴訪客鎖了什麼
    const sectionTitles = wrapper.findAll('h2').map(h => h.text())

    expect(sectionTitles).not.toContain('數據資料')
    expect(sectionTitles).not.toContain('交接說明')
    expect(sectionTitles).not.toContain('已知限制')
    expect(sectionTitles).not.toContain('參考資料')
    expect(wrapper.find('details').exists()).toBe(false)

    expect(sectionTitles).toContain('模組呈現')
    expect(sectionTitles).toContain('使用技術')
    expect(sectionTitles).toContain('登入後檢視')

    // 標題不在還不夠，內容也不准在：這條守的是「未解鎖就先載入內容、只把它藏起來」那種改法
    expect(wrapper.text()).not.toContain(full.data.summary)
    expect(wrapper.text()).not.toContain(full.data.format)
    expect(wrapper.text()).not.toContain(full.data.sample)
  })

  it('解鎖了但該 slug 不在 content 裡：四個區塊都不渲染、不丟例外', async () => {
    unlockWith({ 'other-slug': full })
    const wrapper = await mountSuspended(ModulePage, { props: { module: spec() } })

    expect(wrapper.text()).not.toContain('數據資料')
    expect(wrapper.text()).not.toContain('交接說明')
    expect(wrapper.find('details').exists()).toBe(false)
  })
})

describe('modulePage 的數據資料區塊（解鎖後）', () => {
  beforeEach(() => {
    useProtectedContentStore().lock()
  })

  it('summary 留在摺疊區外,格式與樣本收進摺疊區', async () => {
    unlockWith({ test: full })
    const wrapper = await mountSuspended(ModulePage, { props: { module: spec() } })
    const details = wrapper.get('details')

    expect(details.text()).toContain('DistributionPitch')
    expect(details.text()).toContain('public/samples/x.json')
    expect(details.text()).toContain('{ "x": 1 }')
    // 摘要不該被一起收起來——那是這區塊唯一該一眼看到的東西
    expect(wrapper.text()).toContain('吃每球的入壘點')
  })

  it('有樣本時 summary 文字含「與樣本」', async () => {
    unlockWith({ test: full })
    const wrapper = await mountSuspended(ModulePage, { props: { module: spec() } })
    expect(wrapper.get('details > summary').text()).toBe('檢視資料格式與樣本')
  })

  it('只有格式沒有樣本時,summary 文字不提樣本,也不渲染 pre', async () => {
    unlockWith({ test: formatOnly })
    const wrapper = await mountSuspended(ModulePage, { props: { module: spec() } })
    expect(wrapper.get('details > summary').text()).toBe('檢視資料格式')
    expect(wrapper.find('details pre').exists()).toBe(false)
    expect(wrapper.get('details').text()).toContain('series[metric][frame]')
  })

  it('三個欄位都沒有時完全不渲染摺疊區', async () => {
    unlockWith({ test: protectedOf({ summary: '只有摘要' }) })
    const wrapper = await mountSuspended(ModulePage, { props: { module: spec() } })
    expect(wrapper.find('details').exists()).toBe(false)
    expect(wrapper.text()).toContain('只有摘要')
  })
})

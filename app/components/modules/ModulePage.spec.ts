import type { ModuleSpec } from '~/modules/types'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import ModulePage from './ModulePage.vue'

// ModulePage 是 9 個模組頁共用的範本，「數據資料」區塊的欄位組合只有兩種
// （全給／只給 format），版面調整時兩種都要顧到，所以在這裡鎖住。

function spec(data: ModuleSpec['data']): ModuleSpec {
  return {
    slug: 'test',
    title: '測試模組',
    sport: 'baseball',
    status: 'wip',
    summary: '摘要',
    tags: [],
    tech: ['Vue 3'],
    data,
    handoff: { files: [], flexPoints: [] },
  }
}

const full = spec({
  summary: '吃每球的入壘點',
  format: 'DistributionPitch',
  sample: '{ "x": 1 }',
  sampleUrl: 'public/samples/x.json',
})

const formatOnly = spec({ summary: '規劃中', format: 'series[metric][frame]' })

describe('modulePage 的數據資料區塊', () => {
  it('summary 留在摺疊區外,格式與樣本收進摺疊區', async () => {
    const wrapper = await mountSuspended(ModulePage, { props: { module: full } })
    const details = wrapper.get('details')

    expect(details.text()).toContain('DistributionPitch')
    expect(details.text()).toContain('public/samples/x.json')
    expect(details.text()).toContain('{ "x": 1 }')
    // 摘要不該被一起收起來——那是這區塊唯一該一眼看到的東西
    expect(wrapper.text()).toContain('吃每球的入壘點')
  })

  it('有樣本時 summary 文字含「與樣本」', async () => {
    const wrapper = await mountSuspended(ModulePage, { props: { module: full } })
    expect(wrapper.get('details > summary').text()).toBe('檢視資料格式與樣本')
  })

  it('只有格式沒有樣本時,summary 文字不提樣本,也不渲染 pre', async () => {
    const wrapper = await mountSuspended(ModulePage, { props: { module: formatOnly } })
    expect(wrapper.get('details > summary').text()).toBe('檢視資料格式')
    expect(wrapper.find('details pre').exists()).toBe(false)
    expect(wrapper.get('details').text()).toContain('series[metric][frame]')
  })

  it('三個欄位都沒有時完全不渲染摺疊區', async () => {
    const bare = spec({ summary: '只有摘要' })
    const wrapper = await mountSuspended(ModulePage, { props: { module: bare } })
    expect(wrapper.find('details').exists()).toBe(false)
    expect(wrapper.text()).toContain('只有摘要')
  })
})

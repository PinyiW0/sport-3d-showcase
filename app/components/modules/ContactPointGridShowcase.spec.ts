import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import ContactPointGridShowcase from './ContactPointGridShowcase.vue'

// 樣本靠 useFetch 在 client 載入，測試環境不會真的抓到檔案，所以這裡驗的是
// 「沒有資料時也掛得起來、不炸」，資料正確性由 bpe-data 與 core/contactGridScale 的 spec 顧。
// 理由與 PoseMetricsChartShowcase.spec.ts、PitchDistributionShowcase.spec.ts 相同。
describe('contactPointGridShowcase', () => {
  it('沒有資料時也掛得起來，不拋錯', async () => {
    const wrapper = await mountSuspended(ContactPointGridShowcase)
    expect(wrapper.exists()).toBe(true)
  })

  it('打者級別選單存在', async () => {
    const wrapper = await mountSuspended(ContactPointGridShowcase)
    expect(wrapper.find('[aria-label="打者級別"]').exists()).toBe(true)
  })

  it('事件選單存在', async () => {
    const wrapper = await mountSuspended(ContactPointGridShowcase)
    expect(wrapper.find('[aria-label="選擇事件"]').exists()).toBe(true)
  })

  it('輔助線開關存在', async () => {
    const wrapper = await mountSuspended(ContactPointGridShowcase)
    expect(wrapper.text()).toContain('輔助線')
  })
})

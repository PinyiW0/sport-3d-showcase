import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import LandingFieldChartShowcase from './LandingFieldChartShowcase.vue'

// 這支測試的存在理由與 PitchDistributionShowcase.spec.ts／ContactPointGridShowcase.spec.ts 相同：
// 樣本靠 useFetch 在 client 載入，測試環境不會真的抓到 public/ 檔案，
// 所以這裡只驗「沒有資料時也掛得起來、不炸」與控制項存在，資料正確性由 core 的 spec 顧。
describe('landingFieldChartShowcase', () => {
  it('掛載時不拋錯', async () => {
    const wrapper = await mountSuspended(LandingFieldChartShowcase)
    expect(wrapper.exists()).toBe(true)
  })

  it('沒有資料時不畫球場圖與數值面板，只留控制列', async () => {
    const wrapper = await mountSuspended(LandingFieldChartShowcase)
    expect(wrapper.find('[data-testid="landing-field-chart"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="選擇事件"]').exists()).toBe(true)
  })

  it('有「距離弧與內野」開關', async () => {
    const wrapper = await mountSuspended(LandingFieldChartShowcase)
    expect(wrapper.find('[aria-label]').exists()).toBe(true)
    expect(wrapper.text()).toContain('距離弧與內野')
  })

  it('說明文字講清楚球場邊界照畫、預測飛行距離的限制', async () => {
    const wrapper = await mountSuspended(LandingFieldChartShowcase)
    const text = wrapper.text()
    expect(text).toContain('照座標畫')
    expect(text).toContain('Magnus')
    expect(text).toContain('沒有擊球點不代表沒有落點')
  })
})

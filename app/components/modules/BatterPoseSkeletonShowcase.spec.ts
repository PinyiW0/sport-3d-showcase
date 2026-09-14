import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import BatterPoseSkeletonShowcase from './BatterPoseSkeletonShowcase.vue'

// 樣本靠 useFetch 在 client 載入，測試環境不會真的抓到檔案——這裡驗的是「沒有資料
// 時也掛得起來、不炸」，資料正確性由 core 的 spec 顧（同 PoseMetricsChartShowcase.spec.ts
// 的理由）。3D 元件用 stub：happy-dom 沒有 WebGL，讓 BatterSwing3d 真的掛載會在
// onMounted 動態 import three 後嘗試建 WebGLRenderer 而失敗。
describe('batterPoseSkeletonShowcase', () => {
  it('沒有資料時也掛得起來，不拋錯', async () => {
    const wrapper = await mountSuspended(BatterPoseSkeletonShowcase, {
      global: { stubs: { BatterSwing3d: true } },
    })
    expect(wrapper.find('[aria-label="選擇事件"]').exists()).toBe(true)
  })

  it('沒有資料時「跳至擊球」按鈕不存在（swing 為 null 時整段播放控制列都不畫）', async () => {
    const wrapper = await mountSuspended(BatterPoseSkeletonShowcase, {
      global: { stubs: { BatterSwing3d: true } },
    })
    const buttons = wrapper.findAll('button').map(b => b.text())
    expect(buttons).not.toContain('跳至擊球')
  })

  it('沒有資料時不畫 3D 元件', async () => {
    const wrapper = await mountSuspended(BatterPoseSkeletonShowcase, {
      global: { stubs: { BatterSwing3d: true } },
    })
    expect(wrapper.find('[data-testid="batter-swing-3d"]').exists()).toBe(false)
  })
})

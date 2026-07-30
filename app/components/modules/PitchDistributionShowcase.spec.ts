import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import PitchDistributionShowcase from './PitchDistributionShowcase.vue'

// 這支測試的存在理由：純 SVG 的 PitchDistribution.vue 測得再滿，也測不到
// NuxtUI 元件的執行期約束。實際踩過的坑是 USelect 的 value 不能是空字串
// （Reka UI 保留空字串代表清除選擇），只有真的把 showcase 掛起來才會炸。
describe('pitchDistributionShowcase', () => {
  it('掛載時不拋錯,三個 USelect 都渲染出來', async () => {
    const wrapper = await mountSuspended(PitchDistributionShowcase)
    expect(wrapper.findAll('select, [role="combobox"]').length).toBeGreaterThanOrEqual(3)
  })

  it('篩選選項的 value 一律非空字串', async () => {
    const wrapper = await mountSuspended(PitchDistributionShowcase)
    // USelect 會把 items 展開成 option/SelectItem;任何空 value 都是上述那顆雷
    for (const option of wrapper.findAll('option')) {
      expect(option.attributes('value')).not.toBe('')
    }
  })

  it('渲染出好球帶九宮格', async () => {
    const wrapper = await mountSuspended(PitchDistributionShowcase)
    expect(wrapper.find('[data-testid="pitch-distribution"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid^="distribution-cell-"]')).toHaveLength(9)
  })
})

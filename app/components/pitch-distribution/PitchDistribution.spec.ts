import type { DistributionPitch } from './core/distribution'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { getStrikeZone } from '../baseball-field/core/fieldGeometry'
import PitchDistribution from './PitchDistribution.vue'

// 成棒:left -21.59 / right 21.59 / bottom 46.44 / top 92.02
const zone = getStrikeZone(172)

function pitch(x: number, z: number): DistributionPitch {
  return { x, z, pitcher: 'P01', pitchType: 'FF' }
}

function render(pitches: DistributionPitch[], props: Record<string, unknown> = {}) {
  return mount(PitchDistribution, { props: { pitches, zone, ...props } })
}

describe('pitchDistribution', () => {
  it('上千顆落點仍只產生兩個 path 節點', () => {
    // 這是整個模組的設計依據:逐點 <circle> 會變成上千個 DOM 節點,
    // 合併成好球/壞球各一條 path 後不論幾顆都是 2 個。這條測試在守這件事。
    const pitches = Array.from({ length: 1500 }, (_, i) => pitch((i % 40) - 20, 50 + (i % 40)))
    const wrapper = render(pitches)
    expect(wrapper.findAll('path')).toHaveLength(2)
  })

  it('九宮格產生 9 個帶格號的錨點,球數寫在 data-count', () => {
    const wrapper = render([pitch(0, 69.23), pitch(0, 69.23)])
    const cells = wrapper.findAll('[data-testid^="distribution-cell-"]')
    expect(cells).toHaveLength(9)
    expect(wrapper.get('[data-testid="distribution-cell-5"]').attributes('data-count')).toBe('2')
    expect(wrapper.get('[data-testid="distribution-cell-1"]').attributes('data-count')).toBe('0')
  })

  it('視野外的球不畫,改以文字標示球數', () => {
    // x=300 遠超視野(maxX 64.77),不該被 clamp 到邊緣造成假聚集
    const wrapper = render([pitch(0, 69.23), pitch(300, 69.23)])
    expect(wrapper.text()).toContain('另有 1 球在視野外')
  })

  it('全部都在視野內時不顯示視野外提示', () => {
    expect(render([pitch(0, 69.23)]).text()).not.toContain('視野外')
  })

  it('熱區深淺對應該格球數,空格為全透明', () => {
    const pitches = [pitch(0, 69.23), pitch(0, 69.23), pitch(-18, 90)]
    const wrapper = render(pitches)
    const hottest = wrapper.get('[data-testid="distribution-cell-5"]')
    const cooler = wrapper.get('[data-testid="distribution-cell-1"]')
    const empty = wrapper.get('[data-testid="distribution-cell-3"]')
    expect(Number(hottest.attributes('fill-opacity'))).toBeGreaterThan(
      Number(cooler.attributes('fill-opacity')),
    )
    expect(Number(empty.attributes('fill-opacity'))).toBe(0)
  })

  it('關掉落點與熱區後對應的節點就不渲染', () => {
    const wrapper = render([pitch(0, 69.23)], { showPoints: false, showHeatmap: false })
    expect(wrapper.find('[data-testid="distribution-points"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="distribution-heatmap"]').exists()).toBe(false)
    // 框線與格線不受開關影響,好球帶本身一定要在
    expect(wrapper.findAll('line')).toHaveLength(4)
  })

  it('沒有任何球時仍渲染完整的九宮格', () => {
    const wrapper = render([])
    expect(wrapper.findAll('[data-testid^="distribution-cell-"]')).toHaveLength(9)
    expect(wrapper.get('svg').attributes('aria-label')).toContain('共 0 球')
  })
})

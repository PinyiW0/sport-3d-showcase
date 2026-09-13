import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { computeFieldViewport, createFieldScale } from './core/fieldChart'
import LandingFieldChart from './LandingFieldChart.vue'

describe('landingFieldChart', () => {
  it('有落點時，落點座標與 scale 換算結果一致', () => {
    const landing = { x: -16.118, y: 26.591 }
    const wrapper = mount(LandingFieldChart, { props: { landing } })

    const expected = createFieldScale(computeFieldViewport(landing)).toSvg(landing.x, landing.y)
    const point = wrapper.get('[data-testid="landing-point"]')
    expect(Number(point.attributes('cx'))).toBeCloseTo(expected.x, 6)
    expect(Number(point.attributes('cy'))).toBeCloseTo(expected.y, 6)
  })

  it('落點為 null 時不畫落點，改顯示提示文字', () => {
    const wrapper = mount(LandingFieldChart, { props: { landing: null } })

    expect(wrapper.find('[data-testid="landing-point"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="landing-missing"]').text()).toBe('這筆結果沒有預測落點')
  })

  it('showDecorations=false 時不畫距離弧與內野裝飾', () => {
    const wrapper = mount(LandingFieldChart, { props: { landing: { x: 0, y: 30 }, showDecorations: false } })
    expect(wrapper.find('[data-testid="landing-field-decorations"]').exists()).toBe(false)
  })

  it('showDecorations 預設為 true，會畫出裝飾群組', () => {
    const wrapper = mount(LandingFieldChart, { props: { landing: { x: 0, y: 30 } } })
    expect(wrapper.find('[data-testid="landing-field-decorations"]').exists()).toBe(true)
  })

  it('落點在預設視野外時，svg 的 viewBox 會擴大（照座標畫，不 clamp）', () => {
    const landing = { x: 8.157, y: -59.458 }
    const wrapper = mount(LandingFieldChart, { props: { landing } })
    const viewBox = wrapper.get('svg').attributes('viewBox')!
    const [, , , height] = viewBox.split(' ').map(Number)
    // 預設高度是 138（128 - (-10)），落到本壘後方 59 m 會讓高度明顯變大
    expect(height!).toBeGreaterThan(128 - -10)
  })

  it('label prop 有給時顯示在落點旁第二行', () => {
    const wrapper = mount(LandingFieldChart, {
      props: { landing: { x: 2.047, y: 56.224 }, label: '預測飛行距離 56.3 m' },
    })
    expect(wrapper.text()).toContain('預測飛行距離 56.3 m')
  })

  it('svg 根節點有 role 與 data-testid', () => {
    const wrapper = mount(LandingFieldChart, { props: { landing: null } })
    const svg = wrapper.get('svg')
    expect(svg.attributes('role')).toBe('img')
    expect(svg.attributes('data-testid')).toBe('landing-field-chart')
  })
})

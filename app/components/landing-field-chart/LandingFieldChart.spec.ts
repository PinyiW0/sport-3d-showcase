import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { computeFieldViewport, createFieldScale, DEFAULT_VIEW } from './core/fieldChart'
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
    // 落到本壘後方 59 m 會超出包含界外草地的預設視野
    expect(height!).toBeGreaterThan(DEFAULT_VIEW.yMax - DEFAULT_VIEW.yMin)
  })

  it('label prop 有給時顯示在落點旁第二行', () => {
    const wrapper = mount(LandingFieldChart, {
      props: { landing: { x: 2.047, y: 56.224 }, label: '預測飛行距離 56.3 m' },
    })
    expect(wrapper.text()).toContain('預測飛行距離 56.3 m')
  })

  it('dark 預設 false 用淺色配色，設為 true 換深色配色', () => {
    const landing = { x: 0, y: 30 }
    // 落點描邊是底色：淺色底 neutral-100、深色底 neutral-900
    const light = mount(LandingFieldChart, { props: { landing } })
    const dark = mount(LandingFieldChart, { props: { landing, dark: true } })
    expect(light.get('[data-testid="landing-point"]').classes()).toContain('stroke-neutral-100')
    expect(dark.get('[data-testid="landing-point"]').classes()).toContain('stroke-neutral-900')
  })

  it('label 給陣列時一行一項；不給時只寫「預測落點」，原始座標放在點的提示裡', () => {
    const landing = { x: 2.047, y: 56.224 }
    const withLines = mount(LandingFieldChart, { props: { landing, label: ['56.3 m', '一壘側 2.9°'] } })
    expect(withLines.get('[data-testid="landing-point-label"]').findAll('tspan').map(t => t.text()))
      .toEqual(['56.3 m', '一壘側 2.9°'])

    const plain = mount(LandingFieldChart, { props: { landing } })
    expect(plain.get('[data-testid="landing-point-label"]').text()).toBe('預測落點')
    expect(plain.get('[data-testid="landing-point"] title').text()).toBe('預測落點 (2.047, 56.224) m')
  })

  it('其他事件的落點畫成可點選的灰點，點一下發出 select 帶回 id', async () => {
    const wrapper = mount(LandingFieldChart, {
      props: { landing: { x: 0, y: 30 }, others: [{ id: 4, x: -16.1, y: 26.6 }, { id: 14, x: -10.4, y: 22.5 }] },
    })
    const markers = wrapper.findAll('[data-testid="landing-point-other"]')
    expect(markers).toHaveLength(2)

    await markers[0]!.trigger('click')
    expect(wrapper.emitted('select')).toEqual([[4]])
  })

  it('落在目前視野外的其他事件不畫，也不會讓視野擴大', () => {
    const wrapper = mount(LandingFieldChart, {
      props: { landing: { x: 0, y: 30 }, others: [{ id: 11, x: 8.157, y: -59.458 }] },
    })
    expect(wrapper.find('[data-testid="landing-point-other"]').exists()).toBe(false)
    const [, , , height] = wrapper.get('svg').attributes('viewBox')!.split(' ').map(Number)
    expect(height).toBe(DEFAULT_VIEW.yMax - DEFAULT_VIEW.yMin)
  })

  it('一壘側方位字不混用 +x 記號，與三壘側寫法對稱', () => {
    const wrapper = mount(LandingFieldChart, { props: { landing: null } })
    expect(wrapper.text()).toContain('一壘側 →')
    expect(wrapper.text()).not.toContain('+x')
  })

  it('svg 根節點是 role=group（不是 img，灰點按鈕才讀得到）且有 data-testid', () => {
    const wrapper = mount(LandingFieldChart, { props: { landing: null } })
    const svg = wrapper.get('svg')
    expect(svg.attributes('role')).toBe('group')
    expect(svg.attributes('data-testid')).toBe('landing-field-chart')
  })
})

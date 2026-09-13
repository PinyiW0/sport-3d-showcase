import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { getStrikeZoneForLevel } from '../baseball-field/core/batterLevels'
import ContactPointGrid from './ContactPointGrid.vue'
import { useContactGridScale } from './core/contactGridScale'

const zone = getStrikeZoneForLevel('adult')

function render(point: { x: number, z: number } | null, props: Record<string, unknown> = {}) {
  return mount(ContactPointGrid, { props: { zone, point, ...props } })
}

describe('contactPointGrid', () => {
  it('有擊球點時畫出 contact-point，且 cx/cy 與 scale 算出的座標一致', () => {
    const point = { x: 10, z: 80 }
    const wrapper = render(point)
    const circle = wrapper.get('[data-testid="contact-point"]')

    // 元件內部邊距（PAD）不對外開放，改用同一顆 core scale 反推期望值：
    // 元件的 toSvg = 原始 scale.toSvg + 固定邊距，兩者的差值就是邊距本身。
    const scale = useContactGridScale(zone, point).value
    const svg = wrapper.get('svg')
    const [, , , viewBoxHeight] = svg.attributes('viewBox')!.split(' ').map(Number)
    const padTop = viewBoxHeight! - scale.viewHeight - 20 // bottom pad 固定 20，見元件 PAD 常數
    const raw = scale.toSvg(point.x, point.z)

    expect(Number(circle.attributes('cx'))).toBeCloseTo(raw.x + 18, 1) // left pad 固定 18
    expect(Number(circle.attributes('cy'))).toBeCloseTo(raw.y + padTop, 1)
  })

  it('沒有擊球點（point 為 null）時不畫點，並顯示提示文字', () => {
    const wrapper = render(null)
    expect(wrapper.find('[data-testid="contact-point"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('這筆結果沒有擊球點')
  })

  it('好球帶外框與 3×3 內線在沒有擊球點時仍照常畫出，版面不塌', () => {
    const wrapper = render(null)
    expect(wrapper.findAll('rect').length).toBeGreaterThanOrEqual(1) // 好球帶外框 + 本壘板窄帶
    expect(wrapper.findAll('line').length).toBeGreaterThan(4) // 格線 + 刻度 + 地面線
  })

  it('落在預設視野外的擊球點仍然畫得出來（不裁切）', () => {
    const point = { x: 100, z: 50 }
    const wrapper = render(point)
    // wrapper.get() 找不到會直接拋錯，這行本身就是「畫得出來」的斷言
    const circle = wrapper.get('[data-testid="contact-point"]')

    const svg = wrapper.get('svg')
    const [, , viewBoxWidth] = svg.attributes('viewBox')!.split(' ').map(Number)
    expect(Number(circle.attributes('cx'))).toBeLessThanOrEqual(viewBoxWidth!)
    expect(Number(circle.attributes('cx'))).toBeGreaterThanOrEqual(0)
  })

  it('關掉 showGuides 後不畫輔助線，但點仍在', () => {
    const wrapper = render({ x: 10, z: 80 }, { showGuides: false })
    expect(wrapper.find('[data-testid="contact-point"]').exists()).toBe(true)
    // 輔助線用 stroke-dasharray 標示，關閉時該屬性不該出現在畫面上
    expect(wrapper.html()).not.toContain('stroke-dasharray')
  })

  it('擊球點半徑可由 pointRadius 覆寫', () => {
    const wrapper = render({ x: 0, z: 70 }, { pointRadius: 10 })
    expect(wrapper.get('[data-testid="contact-point"]').attributes('r')).toBe('10')
  })

  it('svg 帶有 role=img 與 aria-label', () => {
    const wrapper = render({ x: 0, z: 70 })
    const svg = wrapper.get('svg')
    expect(svg.attributes('role')).toBe('img')
    expect(svg.attributes('aria-label')).toContain('擊球點')
  })
})

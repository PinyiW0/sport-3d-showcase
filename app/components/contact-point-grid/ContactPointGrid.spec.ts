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

    // 元件內部邊距跟著字級走、不對外開放，改用同一顆 core scale 反推期望值：
    // 元件的 toSvg = 原始 scale.toSvg + 邊距。地面線（第一條 line）畫在 z=0，
    // 它的 x1／y1 與原始座標的差值就是左、上邊距。
    const scale = useContactGridScale(zone, point).value
    const ground = wrapper.get('line')
    const rawGround = scale.toSvg(scale.minX, 0)
    const padLeft = Number(ground.attributes('x1')) - rawGround.x
    const padTop = Number(ground.attributes('y1')) - rawGround.y
    const raw = scale.toSvg(point.x, point.z)

    expect(padLeft).toBeGreaterThan(0)
    expect(padTop).toBeGreaterThan(0)
    expect(Number(circle.attributes('cx'))).toBeCloseTo(raw.x + padLeft, 6)
    expect(Number(circle.attributes('cy'))).toBeCloseTo(raw.y + padTop, 6)
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

  it('dark 預設 false 用淺色配色，設為 true 換深色配色', () => {
    const point = { x: 10, z: 80 }
    // 擊球點描邊是底色：淺色底 neutral-100、深色底 neutral-900
    expect(render(point).get('[data-testid="contact-point"]').classes()).toContain('stroke-neutral-100')
    expect(render(point, { dark: true }).get('[data-testid="contact-point"]').classes()).toContain('stroke-neutral-900')
  })

  it('點旁標籤用一位小數，原始座標放在點的提示裡', () => {
    const wrapper = render({ x: 0.458, z: 48.998 }, { pointTitle: '擊球點原始座標 x 0.458 · z 48.998 cm' })
    expect(wrapper.get('[data-testid="contact-point-label"]').text()).toBe('x 0.5 · z 49.0 cm')
    expect(wrapper.get('[data-testid="contact-point"] title').text()).toBe('擊球點原始座標 x 0.458 · z 48.998 cm')
  })

  it('其他事件的擊球點畫成可點選的灰點，點一下發出 select 帶回 id', async () => {
    const wrapper = render({ x: 0, z: 70 }, { others: [{ id: 4, x: -21.9, z: 57.9 }, { id: 7, x: 38.2, z: 168 }] })
    const markers = wrapper.findAll('[data-testid="contact-point-other"]')
    expect(markers).toHaveLength(2)

    await markers[1]!.trigger('click')
    await markers[0]!.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('select')).toEqual([[7], [4]])
  })

  it('落在目前視野外的其他事件不畫，也不會讓視野擴大', () => {
    const inside = render({ x: 0, z: 70 })
    const withFarOther = render({ x: 0, z: 70 }, { others: [{ id: 1, x: 300, z: 70 }] })
    expect(withFarOther.find('[data-testid="contact-point-other"]').exists()).toBe(false)
    expect(withFarOther.get('svg').attributes('viewBox')).toBe(inside.get('svg').attributes('viewBox'))
  })

  it('九格標出格號 1～9', () => {
    const wrapper = render(null)
    const numbers = wrapper.get('[data-testid="contact-grid-cell-numbers"]').findAll('text').map(t => t.text())
    expect(numbers).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9'])
  })

  it('svg 是 role=group（不是 img，灰點按鈕才讀得到）且帶 aria-label', () => {
    const wrapper = render({ x: 0, z: 70 })
    const svg = wrapper.get('svg')
    expect(svg.attributes('role')).toBe('group')
    expect(svg.attributes('aria-label')).toContain('擊球點')
  })
})

describe('簡約呈現', () => {
  it('切換樣貌保留擊球點與格號，返回原版恢復座標刻度', async () => {
    const wrapper = render({ x: 10, z: 80 })
    expect(wrapper.text()).toContain('本壘板')
    expect(wrapper.find('[data-testid="contact-grid-axes"]').exists()).toBe(true)
    await wrapper.setProps({ schematic: true })
    expect(wrapper.find('[data-testid="contact-grid-axes"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="contact-grid-field"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="contact-grid-cell-numbers"] text')).toHaveLength(9)
    expect(wrapper.get('[data-testid="contact-point"] title').text()).toContain('x 10.0')
    const vertices = wrapper.get('[data-testid="contact-grid-home-plate"]').attributes('points')!.split(' ').map(p => p.split(',').map(Number))
    // 五角形中間的尖端高於其餘四個頂點（SVG y 越小越上方）。
    expect(vertices[3]![1]).toBeLessThan(Math.min(...vertices.filter((_, i) => i !== 3).map(p => p[1]!)))
    await wrapper.setProps({ schematic: false })
    expect(wrapper.find('[data-testid="contact-grid-axes"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="contact-point-label"]').text()).toContain('x 10.0')
  })

  it('簡約版保留框外座標並能選取其他事件', async () => {
    const wrapper = render({ x: 100, z: 220 }, { schematic: true, others: [{ id: 4, x: 10, z: 80 }] })
    const [,, width, height] = wrapper.get('svg').attributes('viewBox')!.split(' ').map(Number)
    const point = wrapper.get('[data-testid="contact-point"]')
    expect(Number(point.attributes('cx'))).toBeGreaterThan(0)
    expect(Number(point.attributes('cx'))).toBeLessThan(width!)
    expect(Number(point.attributes('cy'))).toBeGreaterThan(0)
    expect(Number(point.attributes('cy'))).toBeLessThan(height!)
    await wrapper.get('[data-testid="contact-point-other"]').trigger('click')
    expect(wrapper.emitted('select')).toEqual([[4]])
  })
})

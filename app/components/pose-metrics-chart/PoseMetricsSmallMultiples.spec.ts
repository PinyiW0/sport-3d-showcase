import type { MetricKey, PoseMetrics } from './core/types'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PoseMetricsSmallMultiples from './PoseMetricsSmallMultiples.vue'

/** 三條值域差很多的指標：0~10、100~200、-5~5 */
function makeMetrics(overrides: Partial<PoseMetrics> = {}): PoseMetrics {
  const frameCount = 10
  return {
    pitchId: 'test',
    throwingHand: 'right',
    frameCount,
    timesMs: Array.from({ length: frameCount }, (_, i) => i * 4),
    series: {
      elbow_flexion_angle: [0, 2, 4, null, 6, 8, 10, 8, 6, 4],
      trunk_rotation: [100, 120, 140, 160, 180, 200, 180, 160, 140, 120],
      trunk_anterior_tilt: [-5, -3, -1, 1, 3, 5, 3, 1, -1, -3],
    },
    events: [
      { key: 'foot_plant', label: '踏地', frameIndex: 6, timeMs: 24, truncated: false },
      { key: 'release', label: '出手', frameIndex: 8, timeMs: 32, truncated: false },
    ],
    peaks: [],
    atRelease: [],
    atFootPlant: [],
    ...overrides,
  }
}

const THREE: MetricKey[] = ['elbow_flexion_angle', 'trunk_rotation', 'trunk_anterior_tilt']

/** 測資只有 10 格，軸也給 10——用預設的 750 會把曲線擠成 1.3% 寬的一小截 */
function render(metricKeys: MetricKey[] = THREE, props: Record<string, unknown> = {}) {
  return mount(PoseMetricsSmallMultiples, {
    props: { metrics: makeMetrics(), metricKeys, frameSpan: 10, ...props },
  })
}

describe('poseMetricsSmallMultiples', () => {
  it('一條指標一列，列數等於選取數', () => {
    const wrapper = render()
    expect(wrapper.findAll('[data-testid^="pose-metrics-row-"]')).toHaveLength(3)
    expect(wrapper.findAll('[data-testid^="pose-metrics-line-"]')).toHaveLength(3)
  })

  it('列由上而下依序排開，不重疊', () => {
    const rects = render().findAll('[data-testid^="pose-metrics-row-"]')
    const tops = rects.map(r => Number(r.attributes('y')))
    for (let i = 1; i < tops.length; i++)
      expect(tops[i]!).toBeGreaterThan(tops[i - 1]!)
  })

  it('每列用自己的值域——這正是拆成小圖的意義', () => {
    // 三條的值域是 0~10、100~200、-5~5，刻度標的是各自的實際極值
    const text = render().text()
    expect(text).toContain('10')
    expect(text).toContain('200')
    expect(text).toContain('-5')
  })

  it('刻度標實際量到的極值，不是加了留白的繪圖值域', () => {
    // 軀幹旋轉實測 100~200，若標成留白後的值會變成 92／208
    const text = render(['trunk_rotation']).text()
    expect(text).toContain('200')
    expect(text).not.toContain('208')
  })

  it('指標名稱直接標在每列左側，不必回頭對照圖例', () => {
    const text = render().text()
    expect(text).toContain('手肘彎曲')
    expect(text).toContain('軀幹旋轉')
    expect(text).toContain('軀幹前傾')
  })

  it('事件線貫穿所有列，列與列之間才對得起來', () => {
    const wrapper = render()
    const rows = wrapper.findAll('[data-testid^="pose-metrics-row-"]')
    const firstTop = Number(rows[0]!.attributes('y'))
    const lastBottom = Number(rows.at(-1)!.attributes('y')) + Number(rows.at(-1)!.attributes('height'))

    const eventLine = wrapper.get('[data-testid="pose-metrics-events"] line')
    expect(Number(eventLine.attributes('y1'))).toBeLessThanOrEqual(firstTop)
    expect(Number(eventLine.attributes('y2'))).toBeGreaterThanOrEqual(lastBottom)
  })

  it('段落端點畫成圓點，斷幾段就看得出幾段', () => {
    // 手肘那條第 3 格缺測，但缺口只有 1 格、兩端只差 2 度，預設會被接起來 → 一段兩個端點
    expect(render().findAll('[data-testid="pose-metrics-break-elbow_flexion_angle"]')).toHaveLength(2)
    // 關掉接補後就真的斷成兩段 → 四個端點
    expect(render(THREE, { bridgeGaps: false })
      .findAll('[data-testid="pose-metrics-break-elbow_flexion_angle"]')).toHaveLength(4)
  })

  it('游標的讀數直接標在各列右側，不用開面板遮住資料', () => {
    const wrapper = render(THREE, { hoverFrame: 5 })
    expect(wrapper.get('[data-testid="pose-metrics-readout-elbow_flexion_angle"]').text()).toBe('8.0°')
    expect(wrapper.get('[data-testid="pose-metrics-readout-trunk_rotation"]').text()).toBe('200.0°')
  })

  it('該影格缺測就標破折號', () => {
    expect(render(THREE, { hoverFrame: 3 }).get('[data-testid="pose-metrics-readout-elbow_flexion_angle"]').text())
      .toBe('—')
  })

  it('游標線同樣貫穿全部列', () => {
    expect(render(THREE, { hoverFrame: 5 }).find('[data-testid="pose-metrics-cursor"]').exists()).toBe(true)
    expect(render().find('[data-testid="pose-metrics-cursor"]').exists()).toBe(false)
  })

  it('全缺測的指標仍保留一列，列的順序才不會隨資料跳動', () => {
    const metrics = makeMetrics()
    metrics.series.lead_knee_flexion = Array.from({ length: 10 }).fill(null) as (number | null)[]
    const wrapper = mount(PoseMetricsSmallMultiples, {
      props: { metrics, metricKeys: [...THREE, 'lead_knee_flexion'] },
    })
    expect(wrapper.findAll('[data-testid^="pose-metrics-row-"]')).toHaveLength(4)
    // 但沒有資料的那列不畫線
    expect(wrapper.find('[data-testid="pose-metrics-line-lead_knee_flexion"]').exists()).toBe(false)
  })

  it('沒有選取任何指標時給空狀態', () => {
    expect(render([]).get('[data-testid="pose-metrics-empty"]').text()).toContain('沒有選取')
  })
})

describe('poseMetricsSmallMultiples 交付長度不等於軸長度時', () => {
  it('交付不滿名目長度時軸不縮短，右邊留白', () => {
    // 10 格的資料畫在 20 格的軸上，曲線只到一半——演算法端每次交付的影格數不
    // 固定，軸跟著縮的話就看不出這球比較短，兩顆球也並排比不了
    const wrapper = render(['trunk_rotation'], { frameSpan: 20 })
    expect(wrapper.findAll('text').map(t => t.text())).toContain('20')

    const row = wrapper.get('[data-testid="pose-metrics-row-trunk_rotation"]')
    const plotLeft = Number(row.attributes('x'))
    const plotWidth = Number(row.attributes('width'))
    const dots = wrapper.findAll('[data-testid="pose-metrics-break-trunk_rotation"]')
    // 最後一格是第 9 格，落在 20 格軸的 45%，右邊超過一半是空的
    expect(Number(dots.at(-1)!.attributes('cx'))).toBeLessThan(plotLeft + plotWidth * 0.5)
  })

  it('游標拖進留白區時讀數顯示破折號，不是整組消失', () => {
    const wrapper = render(THREE, { frameSpan: 20, hoverFrame: 15 })
    expect(wrapper.find('[data-testid="pose-metrics-cursor"]').exists()).toBe(true)
    for (const key of THREE)
      expect(wrapper.get(`[data-testid="pose-metrics-readout-${key}"]`).text()).toBe('—')
  })

  it('交付超過軸長度時，越界的事件線不畫——這是硬鎖軸長度的代價', () => {
    // fixture 的出手在第 8 格。軸只到 5 的話那條線會畫到繪圖區外（事件線不在
    // clipPath 內），所以直接濾掉。軸不會為了容納它自動延伸，這是刻意的取捨。
    const wrapper = render(THREE, { frameSpan: 5 })
    expect(wrapper.find('[data-testid="pose-metrics-event-foot_plant"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="pose-metrics-event-release"]').exists()).toBe(false)
  })
})

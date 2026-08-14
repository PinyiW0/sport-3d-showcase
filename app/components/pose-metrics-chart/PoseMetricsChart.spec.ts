import type { MetricKey, PoseMetrics } from './core/types'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { SERIES_METRIC_KEYS } from './core/types'
import PoseMetricsChart from './PoseMetricsChart.vue'

/** 10 影格的最小資料 */
function makeMetrics(overrides: Partial<PoseMetrics> = {}): PoseMetrics {
  return {
    pitchId: 'test_pitch',
    throwingHand: 'right',
    frameCount: 10,
    timesMs: Array.from({ length: 10 }, (_, i) => i * 4),
    series: {
      elbow_flexion_angle: [10, 20, 30, null, 50, 60, 70, 80, 90, 100],
      trunk_rotation: [170, 175, 179, -178, -170, -160, -150, -140, -130, -120],
      lead_knee_flexion: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50],
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

/** 測資只有 10 格，軸也給 10——用預設的 750 會把曲線擠成 1.3% 寬的一小截 */
function render(metricKeys: MetricKey[] = ['elbow_flexion_angle'], props: Record<string, unknown> = {}) {
  return mount(PoseMetricsChart, {
    props: { metrics: makeMetrics(), metricKeys, frameSpan: 10, ...props },
  })
}

describe('poseMetricsChart', () => {
  it('一條指標一個 path 節點，不論幾個影格', () => {
    // 這是模組的效能依據：748 個點逐點畫 <circle> 會塞爆 DOM，
    // 合併成單一 path 後點數再多都是一個節點
    const many = makeMetrics({
      frameCount: 748,
      timesMs: Array.from({ length: 748 }, (_, i) => i * 4),
      series: { elbow_flexion_angle: Array.from({ length: 748 }, (_, i) => i % 90) },
      events: [],
    })
    const wrapper = mount(PoseMetricsChart, {
      props: { metrics: many, metricKeys: ['elbow_flexion_angle'] },
    })
    expect(wrapper.findAll('[data-testid^="pose-metrics-line-"]')).toHaveLength(1)
  })

  it('三條一起畫就是三個 path，各自掛得到自己的錨點', () => {
    const wrapper = render(['elbow_flexion_angle', 'trunk_rotation', 'lead_knee_flexion'])
    expect(wrapper.findAll('[data-testid^="pose-metrics-line-"]')).toHaveLength(3)
    expect(wrapper.find('[data-testid="pose-metrics-line-trunk_rotation"]').exists()).toBe(true)
  })

  it('沒有資料的指標不佔一條線，也不畫空 path', () => {
    // fixture 只給了三條，其餘四條沒有資料
    const wrapper = render([...SERIES_METRIC_KEYS])
    expect(wrapper.findAll('[data-testid^="pose-metrics-line-"]')).toHaveLength(3)
  })

  it('缺測讓 path 斷成多段，不是一路連過去', () => {
    const d = render(['elbow_flexion_angle'], { smooth: false })
      .get('[data-testid="pose-metrics-line-elbow_flexion_angle"]')
      .attributes('d')!
    expect(d.split('M')).toHaveLength(3)
  })

  it('環繞角在 ±180 邊界也斷開', () => {
    const d = render(['trunk_rotation'], { smooth: false })
      .get('[data-testid="pose-metrics-line-trunk_rotation"]')
      .attributes('d')!
    expect(d.split('M')).toHaveLength(3)
  })

  it('平滑開啟時走貝茲，關掉是直線——兩者的斷點數一樣', () => {
    const smooth = render(['elbow_flexion_angle'], { smooth: true })
      .get('[data-testid="pose-metrics-line-elbow_flexion_angle"]')
      .attributes('d')!
    const straight = render(['elbow_flexion_angle'], { smooth: false })
      .get('[data-testid="pose-metrics-line-elbow_flexion_angle"]')
      .attributes('d')!
    expect(smooth).toContain('C')
    expect(straight).not.toContain('C')
    expect(smooth.split('M')).toHaveLength(straight.split('M').length)
  })

  it('每條線有各自的顏色，且都是實線', () => {
    const wrapper = render(['elbow_flexion_angle', 'trunk_rotation', 'lead_knee_flexion'])
    const paths = wrapper.findAll('[data-testid^="pose-metrics-line-"]')
    expect(new Set(paths.map(p => p.attributes('class'))).size).toBe(3)
    for (const path of paths)
      expect(path.attributes('stroke-dasharray')).toBeUndefined()
  })

  it('事件畫成垂直線加膠囊，關掉後線與膠囊都不渲染', () => {
    const wrapper = render()
    expect(wrapper.find('[data-testid="pose-metrics-event-foot_plant"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="pose-metrics-event-release"]').text()).toBe('出手')

    const hidden = render(['elbow_flexion_angle'], { showEvents: false })
    expect(hidden.find('[data-testid="pose-metrics-events"]').exists()).toBe(false)
    expect(hidden.find('[data-testid="pose-metrics-event-release"]').exists()).toBe(false)
  })

  it('繪圖區有底色，零線恆在——軸固定 ±180 一定跨 0', () => {
    const wrapper = render()
    expect(wrapper.find('[data-testid="pose-metrics-canvas"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="pose-metrics-zero-line"]').exists()).toBe(true)
  })

  it('預設是淺色主題——正式專案是淺色介面', () => {
    const canvas = render().get('[data-testid="pose-metrics-canvas"]').attributes('class')!
    expect(canvas).toContain('fill-white')
  })

  it('切成深色主題後底色與線色整組換掉', () => {
    const light = render(['trunk_rotation'])
    const dark = render(['trunk_rotation'], { theme: 'dark' })

    expect(dark.get('[data-testid="pose-metrics-canvas"]').attributes('class'))
      .toContain('fill-chart-canvas')
    expect(dark.get('[data-testid="pose-metrics-line-trunk_rotation"]').attributes('class'))
      .not
      .toBe(light.get('[data-testid="pose-metrics-line-trunk_rotation"]').attributes('class'))
  })

  it('y 軸固定 -180~180，不隨資料縮放', () => {
    // fixture 的膝屈曲只到 50，軸照樣停在 180
    const labels = render(['lead_knee_flexion']).findAll('text').map(t => t.text())
    expect(labels).toContain('180')
    expect(labels).toContain('-180')
  })

  it('縱軸單位另起一行放在最高刻度上方，不與 180 疊在一起', () => {
    // 原本兩者都貼著繪圖區頂端，實測「(度)」與「180」垂直重疊 8.1 單位、字高
    // 15.5——留白寫死 26 單位，一行字加半個刻度字高本來就塞不下
    const wrapper = render()
    const unitY = Number(wrapper.get('[data-testid="pose-metrics-y-unit"]').attributes('y'))
    const tickY = Number(wrapper.findAll('text').find(t => t.text() === '180')!.attributes('y'))
    expect(tickY - unitY).toBeGreaterThanOrEqual(13)
  })

  it('x 軸是影格序號，固定畫到名目長度不隨資料縮短', () => {
    // 10 格的資料畫在 20 格的軸上，右半留白——交付長度每次不同，軸跟著縮的話
    // 兩顆球的圖就並排比不了
    const labels = render(['elbow_flexion_angle'], { frameSpan: 20 }).findAll('text').map(t => t.text())
    expect(labels).toContain('影格')
    expect(labels).toContain('20')
  })

  it('全部取消選取時給空狀態文字，不畫任何線', () => {
    const wrapper = render([])
    expect(wrapper.get('[data-testid="pose-metrics-empty"]').text()).toContain('沒有選取')
    expect(wrapper.findAll('[data-testid^="pose-metrics-line-"]')).toHaveLength(0)
  })

  it('aria-label 講得出畫了哪幾條與影格範圍', () => {
    const label = render(['elbow_flexion_angle', 'trunk_rotation']).get('svg').attributes('aria-label')!
    expect(label).toContain('2 條指標')
    expect(label).toContain('手肘彎曲')
    expect(label).toContain('軀幹旋轉')
    // 軸長度與資料長度分開講——兩者不一致正是留白的來源
    expect(label).toContain('橫軸固定第 0 到 10 影格')
    expect(label).toContain('資料到第 9 影格')
  })
})

/** 用預設軸長（750）掛一張圖，資料長度自訂 */
function mountWide(frameCount: number) {
  const many = makeMetrics({
    frameCount,
    timesMs: Array.from({ length: frameCount }, (_, i) => i * 4),
    series: { elbow_flexion_angle: Array.from({ length: frameCount }, (_, i) => i % 90) },
    events: [],
  })
  return mount(PoseMetricsChart, { props: { metrics: many, metricKeys: ['elbow_flexion_angle'] } })
}

/** jsdom 量不到版面，補一個與 viewBox 同寬的矩形讓座標換算成立 */
function mockLayout(wrapper: ReturnType<typeof mountWide>) {
  const svg = wrapper.get('svg')
  vi.spyOn(svg.element, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    width: 960,
    top: 0,
    height: 360,
  } as DOMRect)
  return svg
}

describe('poseMetricsChart 游標與數值面板', () => {
  it('沒有游標時不畫游標線也不畫面板', () => {
    const wrapper = render()
    expect(wrapper.find('[data-testid="pose-metrics-cursor"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="pose-metrics-tooltip"]').exists()).toBe(false)
  })

  it('指定影格後畫出游標線與面板，標題是該影格', () => {
    const wrapper = render(['elbow_flexion_angle'], { hoverFrame: 4 })
    expect(wrapper.find('[data-testid="pose-metrics-cursor"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="pose-metrics-tooltip"]').text()).toContain('4 frame')
  })

  it('數值只到小數點後一位', () => {
    const metrics = makeMetrics()
    metrics.series.elbow_flexion_angle![4] = 25.34567
    const wrapper = mount(PoseMetricsChart, {
      props: { metrics, metricKeys: ['elbow_flexion_angle'], hoverFrame: 4 },
    })
    const row = wrapper.get('[data-testid="pose-metrics-tooltip-elbow_flexion_angle"]')
    expect(row.text()).toContain('25.3°')
    expect(row.text()).not.toContain('25.34')
  })

  it('只列出目前顯示的指標——圖例關掉的不會出現', () => {
    const wrapper = render(['elbow_flexion_angle', 'trunk_rotation'], { hoverFrame: 4 })
    expect(wrapper.find('[data-testid="pose-metrics-tooltip-elbow_flexion_angle"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="pose-metrics-tooltip-trunk_rotation"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="pose-metrics-tooltip-lead_knee_flexion"]').exists()).toBe(false)
  })

  it('該影格缺測時寫破折號，不寫 0 也不留空', () => {
    // fixture 的第 3 格是 null
    const row = render(['elbow_flexion_angle'], { hoverFrame: 3 })
      .get('[data-testid="pose-metrics-tooltip-elbow_flexion_angle"]')
    expect(row.text()).toContain('—')
    expect(row.text()).not.toContain('0.0')
  })

  it('每列都帶自己的色塊，對得回曲線顏色', () => {
    const wrapper = render(['elbow_flexion_angle', 'trunk_rotation'], { hoverFrame: 4 })
    const swatches = wrapper.findAll('[data-testid^="pose-metrics-tooltip-"] rect')
      .map(r => r.attributes('class'))
    expect(new Set(swatches).size).toBe(2)
  })

  it('關掉 interactive 就完全不互動——錄影頁不要游標跟著跑', async () => {
    const wrapper = render(['elbow_flexion_angle'], { interactive: false })
    await wrapper.get('svg').trigger('pointermove', { clientX: 300 })
    expect(wrapper.find('[data-testid="pose-metrics-cursor"]').exists()).toBe(false)
  })

  it('拖曳後放開游標仍留在原處，離開圖表才清掉', async () => {
    const wrapper = render(['elbow_flexion_angle'], { hoverFrame: 4 })
    await wrapper.get('svg').trigger('pointerup', { pointerType: 'mouse' })
    expect(wrapper.find('[data-testid="pose-metrics-cursor"]').exists()).toBe(true)

    await wrapper.get('svg').trigger('pointerleave')
    expect(wrapper.find('[data-testid="pose-metrics-cursor"]').exists()).toBe(false)
  })

  it('pointermove 會依游標的水平位置換算影格', async () => {
    const wrapper = mountWide(748)
    const svg = mockLayout(wrapper)

    // 繪圖區是 52～940.5，軸是 0～750，所以正中央對到第 375 格
    await svg.trigger('pointermove', { clientX: 52 })
    expect(wrapper.get('[data-testid="pose-metrics-tooltip"]').text()).toContain('0 frame')

    await svg.trigger('pointermove', { clientX: 496 })
    expect(wrapper.get('[data-testid="pose-metrics-tooltip"]').text()).toContain('375 frame')
  })

  it('游標走得到軸尾端，不卡在資料末——那段讀數是破折號', async () => {
    // 交付 748 格、軸畫到 750。游標夾在第 747 格的話，繪圖區最右邊那截就成了
    // 拖不動的死區；交付 500 格時那截會是整整三分之一
    const wrapper = mountWide(748)
    const svg = mockLayout(wrapper)

    await svg.trigger('pointermove', { clientX: 942 })
    const tooltip = wrapper.get('[data-testid="pose-metrics-tooltip"]')
    expect(tooltip.text()).toContain('750 frame')
    expect(tooltip.text()).toContain('—')
  })

  it('交付超過軸長度時游標仍停在軸尾——超出的影格畫不出來', async () => {
    // 這是硬鎖軸長度的代價，記在這裡免得日後被當成 bug：軸不會為了容納 900 格
    // 自動延伸，換來的是不同球用同一條軸、並排比得起來
    const wrapper = mountWide(900)
    const svg = mockLayout(wrapper)

    await svg.trigger('pointermove', { clientX: 942 })
    expect(wrapper.get('[data-testid="pose-metrics-tooltip"]').text()).toContain('750 frame')
  })
})

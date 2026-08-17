import { mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import PoseMetricsSmallMultiples from '~/components/pose-metrics-chart/PoseMetricsSmallMultiples.vue'
import PoseMetricsChartShowcase from './PoseMetricsChartShowcase.vue'

beforeEach(() => {
  // 測試環境沒有解碼器，影片面板的 play()／pause() 只要不炸就好
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
})

// 這支測試的存在理由與 PitchDistributionShowcase.spec.ts 相同：純 SVG 的圖表
// 本體測得再滿，也測不到 NuxtUI 元件的執行期約束（USelect 的 value 不能是
// 空字串，Reka UI 保留空字串代表清除選擇）。
//
// 樣本靠 useFetch 在 client 載入，測試環境不會真的抓到檔案——所以這裡驗的是
// 「沒有資料時也掛得起來、不炸」，資料正確性由 core 的 spec 顧。
describe('poseMetricsChartShowcase', () => {
  it('掛載時不拋錯，七個膠囊圖例都渲染得出來', async () => {
    const wrapper = await mountSuspended(PoseMetricsChartShowcase)
    expect(wrapper.findAll('[data-testid^="pose-metrics-legend-"]')).toHaveLength(7)
  })

  it('膠囊預設全部是開啟狀態', async () => {
    const wrapper = await mountSuspended(PoseMetricsChartShowcase)
    for (const chip of wrapper.findAll('[data-testid^="pose-metrics-legend-"]'))
      expect(chip.attributes('aria-pressed')).toBe('true')
  })

  it('點膠囊會切成關閉，再點一次切回來', async () => {
    const wrapper = await mountSuspended(PoseMetricsChartShowcase)
    const chip = wrapper.get('[data-testid="pose-metrics-legend-trunk_rotation"]')

    await chip.trigger('click')
    expect(chip.attributes('aria-pressed')).toBe('false')

    await chip.trigger('click')
    expect(chip.attributes('aria-pressed')).toBe('true')
  })

  it('每個膠囊標出該條的缺測率', async () => {
    const wrapper = await mountSuspended(PoseMetricsChartShowcase)
    for (const chip of wrapper.findAll('[data-testid^="pose-metrics-legend-"]'))
      expect(chip.text()).toMatch(/缺 \d+%/)
  })

  it('說明文字講清楚缺口怎麼補、什麼情況不補，以及平滑的代價', async () => {
    const wrapper = await mountSuspended(PoseMetricsChartShowcase)
    const text = wrapper.text()
    expect(text).toContain('缺測')
    // 補洞的兩道門檻都要講出來，不能只說「有補」
    expect(text).toContain('10 格')
    expect(text).toContain('15 度')
    expect(text).toContain('留白不猜')
    // 平滑會動到數值，代價要標數字而不是說「稍微」
    expect(text).toContain('點的位置沒動')
    expect(text).toContain('曲率降 78%')
    expect(text).toContain('2.6 度')
  })

  it('平滑強度的選項把代價標在標籤上，不是只寫弱中強', async () => {
    const wrapper = await mountSuspended(PoseMetricsChartShowcase)
    expect(wrapper.find('[aria-label="線條平滑程度"]').exists()).toBe(true)
  })

  it('預設是分列版面——七條共用一軸會互相交纏，也會把小值域的指標壓扁', async () => {
    const wrapper = await mountSuspended(PoseMetricsChartShowcase)
    expect(wrapper.find('[data-testid="pose-metrics-stacked"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="pose-metrics-chart"]').exists()).toBe(false)
  })

  it('版面切換的選單在，兩種都掛得上去', async () => {
    const wrapper = await mountSuspended(PoseMetricsChartShowcase)
    expect(wrapper.find('[aria-label="圖表版面"]').exists()).toBe(true)
  })

  it('有「模擬短資料」開關，說明也講清楚軸固定與留白', async () => {
    // 手上唯一的樣本是 748 格、畫在 750 的軸上只留白 0.4%，肉眼看不出來，
    // 所以要有辦法在畫面上把「交付不足」演出來
    const wrapper = await mountSuspended(PoseMetricsChartShowcase)
    const text = wrapper.text()
    expect(text).toContain('模擬短資料')
    expect(text).toContain('750')
    expect(text).toContain('留白')
  })

  it('三機影片接在圖表上方，播放頭共用', async () => {
    const wrapper = await mountSuspended(PoseMetricsChartShowcase)
    expect(wrapper.find('[data-testid="pose-metrics-video"]').exists()).toBe(true)
    expect(wrapper.findAll('video')).toHaveLength(3)
  })

  it('滑鼠移開圖表時播放頭留在原地，不歸零', async () => {
    // 圖表的 hoverFrame 是「滑鼠在哪」、移開就 null；接上影片後它要變成常駐的
    // 播放位置。這條就是那個語意轉換的合約
    const wrapper = await mountSuspended(PoseMetricsChartShowcase)
    const chart = wrapper.findComponent(PoseMetricsSmallMultiples)
    const readout = () => wrapper.get('[data-testid="pose-metrics-video-readout"]').text()

    chart.vm.$emit('update:hover-frame', 211)
    await nextTick()
    expect(readout()).toContain('211 影格')

    chart.vm.$emit('update:hover-frame', null)
    await nextTick()
    expect(readout()).toContain('211 影格')
  })

  it('拖圖表會停播，不跟影片搶著寫播放頭', async () => {
    const wrapper = await mountSuspended(PoseMetricsChartShowcase)
    const play = wrapper.get('[data-testid="pose-metrics-video-play"]')

    await play.trigger('click')
    expect(play.attributes('aria-label')).toBe('暫停')

    wrapper.findComponent(PoseMetricsSmallMultiples).vm.$emit('update:hover-frame', 300)
    await nextTick()
    expect(play.attributes('aria-label')).toBe('播放')
  })

  it('樣本還沒到手時仍排出七個空列，版面不會整塊塌掉再彈回來', async () => {
    // 全缺測的指標保留列而不是消失，資料一到位只是線長出來，列的位置不動
    const wrapper = await mountSuspended(PoseMetricsChartShowcase)
    expect(wrapper.find('[data-testid="pose-metrics-stacked"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid^="pose-metrics-row-"]')).toHaveLength(7)
    expect(wrapper.findAll('[data-testid^="pose-metrics-line-"]')).toHaveLength(0)
  })
})

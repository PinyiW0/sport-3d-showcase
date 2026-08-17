import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { frameToTime } from './core/videoSync'
import PoseMetricsVideoPanel from './PoseMetricsVideoPanel.vue'

const SOURCES = [
  { key: 'HB', label: '本壘後方', src: '/samples/pose-metrics/videos/HB.mp4' },
  { key: '3B', label: '三壘鏡頭', src: '/samples/pose-metrics/videos/3B.mp4' },
  { key: '1B', label: '一壘鏡頭', src: '/samples/pose-metrics/videos/1B.mp4' },
]

const FRAME_COUNT = 748

function render(props: Record<string, unknown> = {}) {
  return mount(PoseMetricsVideoPanel, {
    props: { sources: SOURCES, frameCount: FRAME_COUNT, ...props },
  })
}

function videos(wrapper: ReturnType<typeof render>) {
  return wrapper.findAll('video').map(item => item.element as HTMLVideoElement)
}

beforeEach(() => {
  // 測試環境沒有真的解碼器，play()／pause() 只要不炸就好
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
})

describe('版面', () => {
  it('三個機位都渲染成 video，src 照傳入的來源', () => {
    const wrapper = render()
    const elements = videos(wrapper)
    expect(elements).toHaveLength(3)
    expect(elements.map(el => el.getAttribute('src'))).toEqual(SOURCES.map(source => source.src))
  })

  it('第一支是主畫面，其餘是可點的縮圖', () => {
    const wrapper = render()
    expect(wrapper.get('[data-testid="pose-metrics-video-cell-HB"]').attributes('data-active')).toBe('true')
    expect(wrapper.find('[data-testid="pose-metrics-video-thumb-HB"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="pose-metrics-video-thumb-3B"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="pose-metrics-video-thumb-1B"]').exists()).toBe(true)
  })

  it('點縮圖換主畫面，但 video 節點不重新掛載（重掛等於整支影片重載）', async () => {
    const wrapper = render()
    const before = videos(wrapper)

    await wrapper.get('[data-testid="pose-metrics-video-thumb-3B"]').trigger('click')

    expect(wrapper.get('[data-testid="pose-metrics-video-cell-3B"]').attributes('data-active')).toBe('true')
    expect(wrapper.get('[data-testid="pose-metrics-video-cell-HB"]').attributes('data-active')).toBe('false')
    // 同一批 DOM 節點，順序也沒變
    expect(videos(wrapper)).toEqual(before)
  })
})

describe('影格對位', () => {
  it('外部改播放頭時三支都對到該影格的時間', async () => {
    const wrapper = render({ frame: 0 })

    await wrapper.setProps({ frame: 300 })

    for (const video of videos(wrapper))
      expect(video.currentTime).toBeCloseTo(frameToTime(300), 6)
  })

  it('第 637 格（出手）對到的是影片的第 637 格，不是第 637 秒', async () => {
    const wrapper = render({ frame: 0 })

    await wrapper.setProps({ frame: 637 })

    // 30fps：637.5 / 30 ≈ 21.25 秒
    expect(videos(wrapper)[0]!.currentTime).toBeCloseTo(21.25, 2)
  })

  it('播放頭超出影片長度時夾在最後一格', async () => {
    const wrapper = render({ frame: 0 })

    await wrapper.setProps({ frame: 749 })

    expect(videos(wrapper)[0]!.currentTime).toBeCloseTo(frameToTime(747), 6)
  })
})

describe('越界提示', () => {
  it('播放頭走到影片之外會說明沒有影像，而不是靜靜凍住', async () => {
    const wrapper = render({ frame: 0 })
    expect(wrapper.get('[data-testid="pose-metrics-video-readout"]').text()).not.toContain('無影像')

    await wrapper.setProps({ frame: 749 })

    expect(wrapper.get('[data-testid="pose-metrics-video-readout"]').text()).toContain('此影格無影像')
  })

  it('讀數的秒數走實際擷取時間，不是影片時間', () => {
    // 第 637 格在影片上是 21 秒，實際擷取只有 2.55 秒——差 8 倍
    const wrapper = render({ frame: 637, captureSeconds: 2.55 })
    const text = wrapper.get('[data-testid="pose-metrics-video-readout"]').text()
    expect(text).toContain('637 影格')
    expect(text).toContain('2.55 秒')
  })
})

describe('播放控制', () => {
  it('按播放鍵會發出 playing 的更新', async () => {
    const wrapper = render({ playing: false })

    await wrapper.get('[data-testid="pose-metrics-video-play"]').trigger('click')

    expect(wrapper.emitted('update:playing')?.at(-1)).toEqual([true])
  })

  it('播放中按鈕變成暫停的語意', async () => {
    const wrapper = render({ playing: true })
    expect(wrapper.get('[data-testid="pose-metrics-video-play"]').attributes('aria-label')).toBe('暫停')
  })

  it('拖時間軸會停播並把播放頭移到該影格', async () => {
    const wrapper = render({ frame: 0, playing: true })
    const scrub = wrapper.get('[data-testid="pose-metrics-video-scrub"]')

    ;(scrub.element as HTMLInputElement).value = '211'
    await scrub.trigger('input')

    expect(wrapper.emitted('update:playing')?.at(-1)).toEqual([false])
    expect(wrapper.emitted('update:frame')?.at(-1)).toEqual([211])
  })

  it('時間軸的上限是影片的最後一格', () => {
    const wrapper = render()
    expect(wrapper.get('[data-testid="pose-metrics-video-scrub"]').attributes('max')).toBe('747')
  })

  it('切播放速度會套到三支影片上', async () => {
    const wrapper = render()

    await wrapper.findAll('[aria-pressed]').find(button => button.text() === '0.5×')!.trigger('click')

    for (const video of videos(wrapper))
      expect(video.playbackRate).toBe(0.5)
  })
})

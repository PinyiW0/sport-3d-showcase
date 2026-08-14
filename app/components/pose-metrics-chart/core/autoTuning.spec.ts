import type { PoseMetrics, RawBiomech } from './types'
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { diagnoseMetrics, resolveTuning } from './autoTuning'
import { parseBiomech } from './parseBiomech'
import { metricInfo } from './types'

function wrapsOf(key: Parameters<typeof metricInfo>[0]) {
  return metricInfo(key).wraps === true
}

/** 指定 fps 與缺口的最小資料 */
function makeMetrics(options: {
  frameCount?: number
  fps?: number
  values?: (number | null)[]
  eventFrames?: number[]
} = {}): PoseMetrics {
  const { fps = 250, eventFrames = [] } = options
  const values = options.values ?? (Array.from({ length: options.frameCount ?? 100 }).fill(0) as (number | null)[])
  const frameCount = values.length
  const step = 1000 / fps
  const timesMs = Array.from({ length: frameCount }, (_, i) => i * step)

  return {
    pitchId: 'test',
    throwingHand: 'right',
    frameCount,
    timesMs,
    series: { elbow_flexion_angle: values },
    events: eventFrames.map((frameIndex, i) => ({
      key: `e${i}`,
      label: `事件${i}`,
      frameIndex,
      timeMs: timesMs[frameIndex] ?? 0,
      truncated: false,
    })),
    peaks: [],
    atRelease: [],
    atFootPlant: [],
  }
}

describe('diagnoseMetrics', () => {
  it('由時間戳推導實際取樣率，不信任何寫死的常數', () => {
    expect(diagnoseMetrics(makeMetrics({ fps: 250 }), wrapsOf).fps).toBeCloseTo(250, 6)
    expect(diagnoseMetrics(makeMetrics({ fps: 120 }), wrapsOf).fps).toBeCloseTo(120, 6)
  })

  it('影格不足或時間為零時退回預設 fps，不回傳 Infinity', () => {
    const single = diagnoseMetrics(makeMetrics({ frameCount: 1 }), wrapsOf)
    expect(Number.isFinite(single.fps)).toBe(true)
    expect(single.fps).toBe(250)
  })

  it('取相鄰事件的最短間隔——動作越快，能容忍的缺口越短', () => {
    // 250fps 下：0→200 格 = 800ms、200→250 格 = 200ms
    const diagnostics = diagnoseMetrics(
      makeMetrics({ frameCount: 300, eventFrames: [0, 200, 250] }),
      wrapsOf,
    )
    expect(diagnostics.shortestEventGapMs).toBeCloseTo(200, 6)
  })

  it('事件不足兩個時沒有間隔可算', () => {
    expect(diagnoseMetrics(makeMetrics({ eventFrames: [10] }), wrapsOf).shortestEventGapMs).toBeNull()
  })

  it('統計缺口兩端的角度差，中位數與 MAD 都算得出來', () => {
    // 三個缺口，兩端差分別是 2、2、40
    const values = [0, null, 2, null, 4, null, 44]
    const { gaps } = diagnoseMetrics(makeMetrics({ values }), wrapsOf)
    expect(gaps.count).toBe(3)
    expect(gaps.medianDelta).toBe(2)
    expect(gaps.maxDelta).toBe(40)
  })

  it('缺測率逐條算', () => {
    const values = [1, null, 3, null]
    expect(diagnoseMetrics(makeMetrics({ values }), wrapsOf).missingRatio.elbow_flexion_angle).toBe(0.5)
  })
})

describe('resolveTuning', () => {
  it('缺口上限跟著 fps 走——同樣的毫秒數在不同取樣率是不同格數', () => {
    const fast = resolveTuning(diagnoseMetrics(makeMetrics({ fps: 250 }), wrapsOf))
    const slow = resolveTuning(diagnoseMetrics(makeMetrics({ fps: 60 }), wrapsOf))
    expect(fast.maxBridgeFrames).toBeGreaterThan(slow.maxBridgeFrames)
    // 40ms 在 250fps 是 10 格、在 60fps 是 2 格
    expect(fast.maxBridgeFrames).toBe(10)
    expect(slow.maxBridgeFrames).toBe(2)
  })

  it('事件間隔很短時，缺口上限跟著縮——不讓缺口長到與關鍵動作同量級', () => {
    // 兩事件只隔 60ms，1/3 = 20ms = 5 格，比 40ms 的上限更嚴
    const tight = resolveTuning(
      diagnoseMetrics(makeMetrics({ frameCount: 60, eventFrames: [0, 15] }), wrapsOf),
    )
    expect(tight.maxBridgeFrames).toBe(5)
  })

  it('平滑強度也跟著 fps 換算，換相機視覺效果才一致', () => {
    const fast = resolveTuning(diagnoseMetrics(makeMetrics({ fps: 250 }), wrapsOf), 'mid')
    const slow = resolveTuning(diagnoseMetrics(makeMetrics({ fps: 100 }), wrapsOf), 'mid')
    expect(fast.filterSigma).toBeCloseTo(1.5, 6)
    expect(slow.filterSigma).toBeCloseTo(0.6, 6)
  })

  it('關閉平滑就是 0，不留殘量', () => {
    expect(resolveTuning(diagnoseMetrics(makeMetrics(), wrapsOf), 'off').filterSigma).toBe(0)
  })

  it('強度越高 σ 越大', () => {
    const diagnostics = diagnoseMetrics(makeMetrics(), wrapsOf)
    const sigmas = (['off', 'low', 'mid', 'high'] as const).map(p => resolveTuning(diagnostics, p).filterSigma)
    expect(sigmas).toEqual([...sigmas].sort((a, b) => a - b))
  })

  it('角度門檻由缺口分布推導，離群的大缺口會落在門檻外', () => {
    // 多數缺口差 2 度，一個 86 度的離群值
    const values: (number | null)[] = []
    for (let i = 0; i < 10; i++)
      values.push(i * 2, null)
    values.push(106)
    const tuning = resolveTuning(diagnoseMetrics(makeMetrics({ values }), wrapsOf))
    expect(tuning.maxBridgeDelta).toBeLessThan(86)
    expect(tuning.maxBridgeDelta).toBeGreaterThan(2)
  })

  it('完全沒有缺口時給得出可用的預設，不會是 0 或 NaN', () => {
    const tuning = resolveTuning(diagnoseMetrics(makeMetrics({ values: [1, 2, 3, 4] }), wrapsOf))
    expect(tuning.maxBridgeDelta).toBeGreaterThan(0)
    expect(Number.isFinite(tuning.maxBridgeDelta)).toBe(true)
  })

  it('所有參數都夾在合理範圍內，極端資料不會推出離譜的值', () => {
    const extreme = resolveTuning(diagnoseMetrics(makeMetrics({ fps: 5000 }), wrapsOf), 'high')
    expect(extreme.maxBridgeFrames).toBeLessThanOrEqual(30)
    expect(extreme.filterSigma).toBeLessThanOrEqual(6)
  })
})

const SAMPLE_PATH = 'public/samples/pose-metrics/biomech.json'

describe.skipIf(!existsSync(SAMPLE_PATH))('真實樣本的推導結果', () => {
  const metrics = parseBiomech(JSON.parse(readFileSync(SAMPLE_PATH, 'utf8')) as RawBiomech)
  const diagnostics = diagnoseMetrics(metrics, wrapsOf)
  const tuning = resolveTuning(diagnostics, 'mid')

  it('推導出 249.6 fps', () => {
    expect(diagnostics.fps).toBeCloseTo(249.6, 1)
  })

  it('最短事件間隔是踏地到出手的 116ms', () => {
    expect(diagnostics.shortestEventGapMs).toBeCloseTo(117, 0)
  })

  it('推導值重現先前手動調校的參數——10 格、約 15 度、σ=1.5', () => {
    expect(tuning.maxBridgeFrames).toBe(10)
    expect(tuning.maxBridgeDelta).toBeCloseTo(15.8, 0)
    expect(tuning.filterSigma).toBeCloseTo(1.5, 1)
  })

  it('踏地前後那個 86.2 度的缺口仍然落在門檻外', () => {
    expect(diagnostics.gaps.maxDelta).toBeCloseTo(86.2, 0)
    expect(tuning.maxBridgeDelta).toBeLessThan(diagnostics.gaps.maxDelta)
  })
})

import type { RawBiomech } from './types'
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { missingRatio, parseBiomech, parseBiomechTimestampUs, truncateMetrics } from './parseBiomech'
import { metricInfo, SERIES_METRIC_KEYS } from './types'

/** 5 影格、間隔 4ms 的最小資料 */
function makeRaw(overrides: Partial<RawBiomech> = {}): RawBiomech {
  return {
    schema_version: 6,
    pitch_id: 'test_pitch',
    throwing_hand: 'right',
    frame_count: 5,
    timeseries: {
      timestamp: [
        '2026-06-24T15:25:02.000000',
        '2026-06-24T15:25:02.004000',
        '2026-06-24T15:25:02.008000',
        '2026-06-24T15:25:02.012000',
        '2026-06-24T15:25:02.016000',
      ],
      elbow_flexion_angle: [10, null, 30, 40, 50],
      lead_knee_flexion: [1, 2, 3, 4, 5],
    },
    events: {
      release: { frame_index: 3, timestamp: '2026-06-24T15:25:02.012000' },
      leg_lift: { frame_index: 1, timestamp: '2026-06-24T15:25:02.004000', truncated: true },
    },
    peak: {
      // value 刻意與 timeseries[4] 的 50 不同，模擬後端平滑過的峰值
      elbow_flexion_angle: { value: 55, raw_value: -50, frame_index: 4, window: 'foot_plant→release', reliable: true },
      elbow_varus_torque: { value: 16.2, frame_index: 2, window: 'foot_plant→release', reliable: false },
    },
    at_release: { release_height: 164.2, arm_extension: 175.1 },
    at_foot_plant: { stride_length: 119.3 },
    ...overrides,
  }
}

describe('parseBiomechTimestampUs', () => {
  it('微秒是精確整數——影格最短間隔只有 0.6ms，用毫秒表示會被 double 吃掉', () => {
    const a = parseBiomechTimestampUs('2026-06-24T15:25:02.469251')!
    const b = parseBiomechTimestampUs('2026-06-24T15:25:02.469851')!
    expect(b - a).toBe(600)
    expect(Number.isSafeInteger(a)).toBe(true)
  })

  it('一律以 UTC 解讀，不吃本機時區', () => {
    expect(parseBiomechTimestampUs('2026-06-24T15:25:02')).toBe(Date.UTC(2026, 5, 24, 15, 25, 2) * 1000)
  })

  it('秒以下的位數不足時補滿到微秒', () => {
    expect(parseBiomechTimestampUs('2026-06-24T15:25:02.5')).toBe(
      parseBiomechTimestampUs('2026-06-24T15:25:02.500000'),
    )
  })

  it('格式不合回傳 null，不回傳 NaN', () => {
    for (const bad of ['', '20260624_152502.469251', '2026-06-24 15:25:02', 'not-a-time'])
      expect(parseBiomechTimestampUs(bad)).toBeNull()
  })
})

describe('missingRatio', () => {
  it('算得出缺測比例，空陣列視為 0', () => {
    expect(missingRatio([1, null, 3, null])).toBe(0.5)
    expect(missingRatio([])).toBe(0)
  })
})

describe('指標字典', () => {
  it('可畫曲線的指標剛好七條——後端 timeseries 就只給這些', () => {
    expect(SERIES_METRIC_KEYS).toHaveLength(7)
  })

  it('每條可畫的指標都有中文名與單位，不會在 UI 上露出原始欄位名', () => {
    for (const key of SERIES_METRIC_KEYS) {
      const info = metricInfo(key)
      expect(info.label).not.toBe(key)
      expect(info.unit).toBe('°')
    }
  })

  it('兩條環繞角有標記，其餘沒有', () => {
    const wrapping = SERIES_METRIC_KEYS.filter(k => metricInfo(k).wraps)
    expect(wrapping).toEqual(['trunk_rotation', 'pelvis_rotation'])
  })

  it('沒登錄過的欄位退回顯示原始 key，不丟例外', () => {
    expect(metricInfo('some_future_metric')).toEqual({ label: 'some_future_metric', unit: '' })
  })
})

describe('parseBiomech', () => {
  it('時間從第一格起算為 0，單位是毫秒', () => {
    const { timesMs } = parseBiomech(makeRaw())
    expect(timesMs[0]).toBe(0)
    expect(timesMs[4]).toBeCloseTo(16, 6)
  })

  it('缺測保留 null，不填 0 也不內插', () => {
    const { series } = parseBiomech(makeRaw())
    expect(series.elbow_flexion_angle).toEqual([10, null, 30, 40, 50])
  })

  it('長度與影格數不符的指標整條丟棄，免得索引錯位', () => {
    const raw = makeRaw()
    raw.timeseries!.elbow_flexion_angle = [1, 2, 3]
    const { series } = parseBiomech(raw)
    expect(series.elbow_flexion_angle).toBeUndefined()
    expect(series.lead_knee_flexion).toHaveLength(5)
  })

  it('沒登錄在 SERIES_METRIC_KEYS 的欄位不會混進 series', () => {
    const raw = makeRaw()
    raw.timeseries!.some_future_metric = [1, 2, 3, 4, 5]
    const { series } = parseBiomech(raw)
    expect(Object.keys(series).sort()).toEqual(['elbow_flexion_angle', 'lead_knee_flexion'])
  })

  it('事件依影格順序排列並帶中文名，truncated 照實反映', () => {
    const { events } = parseBiomech(makeRaw())
    expect(events.map(e => e.key)).toEqual(['leg_lift', 'release'])
    expect(events.map(e => e.label)).toEqual(['抬腿', '出手'])
    expect(events[0]!.truncated).toBe(true)
    expect(events[1]!.truncated).toBe(false)
  })

  it('事件時間直接取 timesMs[frame_index]，不另做時間比對', () => {
    const { events, timesMs } = parseBiomech(makeRaw())
    const release = events.find(e => e.key === 'release')!
    expect(release.timeMs).toBe(timesMs[3])
  })

  it('影格索引超出範圍的事件與峰值一律略過，不夾到邊界', () => {
    const raw = makeRaw({
      events: { release: { frame_index: 99 } },
      peak: { elbow_flexion_angle: { value: 50, frame_index: -1 } },
    })
    const result = parseBiomech(raw)
    expect(result.events).toEqual([])
    expect(result.peaks).toEqual([])
  })

  it('峰值標記有無對應曲線——沒有的只能當數值顯示', () => {
    const { peaks } = parseBiomech(makeRaw())
    expect(peaks.find(p => p.key === 'elbow_flexion_angle')!.onSeries).toBe(true)
    expect(peaks.find(p => p.key === 'elbow_varus_torque')!.onSeries).toBe(false)
  })

  it('圖上要標的 y 取自曲線，不是 peak 平滑後的 value，也不是帶錯號的 raw_value', () => {
    const peak = parseBiomech(makeRaw()).peaks.find(p => p.key === 'elbow_flexion_angle')!
    expect(peak.value).toBe(55)
    expect(peak.plotValue).toBe(50)
  })

  it('沒有對應曲線時 plotValue 為 null，標不上圖', () => {
    const peak = parseBiomech(makeRaw()).peaks.find(p => p.key === 'elbow_varus_torque')!
    expect(peak.plotValue).toBeNull()
  })

  it('reliable 只有明寫 false 才算不可信，缺欄位視為可信', () => {
    const raw = makeRaw({ peak: { hip_shoulder_separation: { value: 25, frame_index: 2 } } })
    expect(parseBiomech(raw).peaks[0]!.reliable).toBe(true)
    expect(parseBiomech(makeRaw()).peaks.find(p => p.key === 'elbow_varus_torque')!.reliable).toBe(false)
  })

  it('單點值分成出手與踏地兩組，各自帶中文名與單位', () => {
    const { atRelease, atFootPlant } = parseBiomech(makeRaw())
    expect(atRelease.map(v => v.label).sort()).toEqual(['出手高度', '手臂伸展距離'])
    expect(atFootPlant).toEqual([{ key: 'stride_length', label: '跨步距離', unit: 'cm', value: 119.3 }])
  })

  it('完全沒有 timeseries 時回傳空結構，不丟例外', () => {
    const result = parseBiomech({})
    expect(result.frameCount).toBe(0)
    expect(result.timesMs).toEqual([])
    expect(result.series).toEqual({})
    expect(result.events).toEqual([])
  })
})

const SAMPLE_PATH = 'public/samples/pose-metrics/biomech.json'

describe.skipIf(!existsSync(SAMPLE_PATH))('真實樣本', () => {
  const raw = JSON.parse(readFileSync(SAMPLE_PATH, 'utf8')) as RawBiomech
  const metrics = parseBiomech(raw)

  it('748 影格、約 3 秒、右投', () => {
    expect(metrics.frameCount).toBe(748)
    expect(metrics.timesMs[0]).toBe(0)
    expect(metrics.timesMs[747]).toBeGreaterThan(2900)
    expect(metrics.timesMs[747]).toBeLessThan(3100)
    expect(metrics.throwingHand).toBe('right')
  })

  it('七條曲線全部到齊，且每條都保留了缺測', () => {
    expect(Object.keys(metrics.series)).toHaveLength(7)
    for (const points of Object.values(metrics.series)) {
      expect(points).toHaveLength(748)
      expect(points.includes(null)).toBe(true)
    }
  })

  it('三個事件依抬腿、踏地、出手排列', () => {
    expect(metrics.events.map(e => e.key)).toEqual(['leg_lift', 'foot_plant', 'release'])
    expect(metrics.events.map(e => e.frameIndex)).toEqual([211, 608, 637])
  })

  it('五個峰值中只有兩個標得上曲線，肘內翻力矩不可信', () => {
    expect(metrics.peaks).toHaveLength(5)
    expect(metrics.peaks.filter(p => p.onSeries).map(p => p.key).sort()).toEqual([
      'shoulder_external_rotation_angle',
      'shoulder_internal_rotation_angle',
    ])
    expect(metrics.peaks.find(p => p.key === 'elbow_varus_torque')!.reliable).toBe(false)
  })

  it('時間單調遞增——事件參考線才不會畫錯位置', () => {
    for (let i = 1; i < metrics.timesMs.length; i++)
      expect(metrics.timesMs[i]!).toBeGreaterThanOrEqual(metrics.timesMs[i - 1]!)
  })

  it('峰值標記的 y 與後端平滑後的 value 確實不同，證明取的是曲線值', () => {
    const peak = metrics.peaks.find(p => p.key === 'shoulder_external_rotation_angle')!
    expect(peak.value).toBeCloseTo(158.49, 1)
    expect(peak.plotValue).toBeCloseTo(143.23, 1)
  })

  it('肩內旋恆等於肩外旋的相反數——後端哪天改了語意，這條會先紅', () => {
    const external = metrics.series.shoulder_external_rotation_angle!
    const internal = metrics.series.shoulder_internal_rotation_angle!
    let compared = 0
    for (let i = 0; i < external.length; i++) {
      const e = external[i] ?? null
      const n = internal[i] ?? null
      if (e === null || n === null)
        continue
      expect(n).toBeCloseTo(-e, 6)
      compared++
    }
    expect(compared).toBe(447)
  })
})

describe('truncateMetrics', () => {
  const full = parseBiomech(makeRaw())

  it('影格數、時間與每一條序列都截到指定長度', () => {
    const cut = truncateMetrics(full, 3)
    expect(cut.frameCount).toBe(3)
    expect(cut.timesMs).toHaveLength(3)
    expect(cut.series.elbow_flexion_angle).toEqual([10, null, 30])
    expect(cut.series.lead_knee_flexion).toHaveLength(3)
  })

  it('落在範圍外的事件一併丟掉——短交付本來就不會有後面那些事件', () => {
    // fixture 的抬腿在第 1 格、出手在第 3 格
    const cut = truncateMetrics(full, 3)
    expect(cut.events.map(e => e.key)).toEqual(['leg_lift'])
  })

  it('落在範圍外的峰值也丟掉，免得卡片指向一個畫不出來的影格', () => {
    // fixture 的手肘峰值在第 4 格、肘內翻力矩在第 2 格
    const cut = truncateMetrics(full, 3)
    expect(cut.peaks.map(p => p.key)).toEqual(['elbow_varus_torque'])
  })

  it('單點值不動——那是卡片內容，不屬於曲線', () => {
    const cut = truncateMetrics(full, 3)
    expect(cut.atRelease).toEqual(full.atRelease)
    expect(cut.atFootPlant).toEqual(full.atFootPlant)
  })

  it('長度未超過時原樣回傳，不做多餘的複製', () => {
    expect(truncateMetrics(full, 5)).toBe(full)
    expect(truncateMetrics(full, 99)).toBe(full)
  })
})

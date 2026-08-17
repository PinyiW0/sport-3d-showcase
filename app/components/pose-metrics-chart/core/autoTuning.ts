/**
 * 從資料本身推導繪圖參數。
 *
 * 存在的理由：缺口門檻、濾波強度這些數字，第一版是對著**一顆球**調出來的，
 * 換一位投手、換一台相機（fps 不同）、換一版姿態模型（缺測分布不同）就不一定
 * 適用。這支把三個參數都改成「量出來」的：
 *
 * | 參數 | 怎麼來 |
 * |---|---|
 * | `maxBridgeFrames` | 40ms 與「最短事件間隔的 1/3」取小，再依實際 fps 換成格數 |
 * | `maxBridgeDelta` | 全部缺口兩端差的 `median + 10×MAD`（統計上的離群界線） |
 * | `filterSigma` | 依 preset 給定的時間常數（毫秒）換算成格數 |
 *
 * 在手上這顆球（249.6fps）推出來的值是 10 格 / 15.8 度 / σ=1.5，與先前手動
 * 調校的 10 格 / 15 度 / 1.5 幾乎一模一樣——不是巧合，是同一組數字換個算法。
 *
 * 純 TS、零依賴。
 */

import type { MetricKey, PoseMetrics } from './types'
import { SERIES_METRIC_KEYS } from './types'

/** 缺口能接的絕對上限（毫秒）。再長就是真的沒量到那麼久 */
const MAX_BRIDGE_MS = 40
/**
 * 缺口也不該長到與關鍵動作區間同量級。踏地到出手只有 116ms，
 * 取其 1/3 當上限——動作越快的投手，能容忍的缺口越短。
 */
const EVENT_GAP_FRACTION = 1 / 3
/**
 * 缺口兩端差的離群界線係數。
 *
 * `median + k×MAD` 是穩健統計的離群判定（常態下 k=3 約等於 3σ）。這裡取 10
 * 是因為目標不是「排除所有偏大的缺口」而是「只排除明顯不能接的那種」——實測
 * k=10 得到 15.8 度，剛好讓踏地前後那個 86.2 度的缺口斷開，其餘照接。
 */
const BRIDGE_DELTA_MAD_K = 10
/** 各級平滑的時間常數（毫秒）。換算成格數才是高斯的 σ */
const FILTER_SIGMA_MS = { off: 0, low: 4, mid: 6, high: 12 } as const

/** fps 算不出來時的退路（這批資料的量級） */
const FALLBACK_FPS = 250
/** 完全沒有缺口可以統計時的退路 */
const FALLBACK_BRIDGE_DELTA = 15

export type SmoothPreset = keyof typeof FILTER_SIGMA_MS

export interface GapStats {
  /** 缺口總數（全部指標合計） */
  count: number
  /** 兩端角度差的中位數 */
  medianDelta: number
  /** 中位數絕對偏差 */
  madDelta: number
  /** 最大的一個，通常就是最不該接的那個 */
  maxDelta: number
}

export interface ChartDiagnostics {
  frameCount: number
  durationMs: number
  /** 由時間戳推導的實際取樣率 */
  fps: number
  /** 相鄰事件的最短間隔（毫秒）；不足兩個事件時為 null */
  shortestEventGapMs: number | null
  gaps: GapStats
  /** 每條指標的缺測率 0–1 */
  missingRatio: Partial<Record<MetricKey, number>>
}

export interface ChartTuning {
  maxBridgeFrames: number
  maxBridgeDelta: number
  filterSigma: number
}

function median(values: readonly number[]): number {
  if (!values.length)
    return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/**
 * 相鄰兩個有值影格的角度差；跨過缺口才算。
 * 環繞角取短弧，否則 179 到 -179 會被當成差 358 度。
 */
function collectGapDeltas(values: readonly (number | null)[], wraps: boolean): number[] {
  const deltas: number[] = []
  let previous: number | null = null
  let gap = 0

  for (const value of values) {
    if (value === null || !Number.isFinite(value)) {
      gap++
      continue
    }
    if (gap > 0 && previous !== null) {
      const delta = Math.abs(value - previous)
      deltas.push(wraps && delta > 180 ? 360 - delta : delta)
    }
    previous = value
    gap = 0
  }
  return deltas
}

export function diagnoseMetrics(
  metrics: PoseMetrics,
  wrapsOf: (key: MetricKey) => boolean,
): ChartDiagnostics {
  const { frameCount, timesMs } = metrics
  const durationMs = timesMs.length > 1 ? timesMs.at(-1)! - timesMs[0]! : 0
  const fps = durationMs > 0 && frameCount > 1
    ? ((frameCount - 1) / durationMs) * 1000
    : FALLBACK_FPS

  const eventTimes = metrics.events.map(e => e.timeMs).sort((a, b) => a - b)
  const eventGaps = eventTimes.slice(1).map((t, i) => t - eventTimes[i]!)
  const shortestEventGapMs = eventGaps.length ? Math.min(...eventGaps) : null

  const allDeltas: number[] = []
  const missingRatio: Partial<Record<MetricKey, number>> = {}
  for (const key of SERIES_METRIC_KEYS) {
    const values = metrics.series[key]
    if (!values?.length)
      continue
    missingRatio[key] = values.filter(v => v === null).length / values.length
    allDeltas.push(...collectGapDeltas(values, wrapsOf(key)))
  }

  const medianDelta = median(allDeltas)
  const madDelta = median(allDeltas.map(d => Math.abs(d - medianDelta)))

  return {
    frameCount,
    durationMs,
    fps,
    shortestEventGapMs,
    gaps: {
      count: allDeltas.length,
      medianDelta,
      madDelta,
      maxDelta: allDeltas.length ? Math.max(...allDeltas) : 0,
    },
    missingRatio,
  }
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high)
}

export function resolveTuning(
  diagnostics: ChartDiagnostics,
  preset: SmoothPreset = 'mid',
): ChartTuning {
  const { fps, shortestEventGapMs, gaps } = diagnostics

  const bridgeMs = shortestEventGapMs === null
    ? MAX_BRIDGE_MS
    : Math.min(MAX_BRIDGE_MS, shortestEventGapMs * EVENT_GAP_FRACTION)
  const maxBridgeFrames = clamp(Math.round((bridgeMs / 1000) * fps), 1, 30)

  // MAD 為 0 代表缺口差異全部一樣（樣本太少），這時 median+k×0 會變成死門檻，
  // 退回中位數的兩倍讓它至少接得起同量級的缺口
  const spread = gaps.madDelta > 0 ? gaps.madDelta * BRIDGE_DELTA_MAD_K : gaps.medianDelta
  const maxBridgeDelta = gaps.count
    ? clamp(gaps.medianDelta + spread, 3, 45)
    : FALLBACK_BRIDGE_DELTA

  const filterSigma = clamp((FILTER_SIGMA_MS[preset] / 1000) * fps, 0, 6)

  return { maxBridgeFrames, maxBridgeDelta, filterSigma }
}

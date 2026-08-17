/**
 * biomech.json → 折線圖用的資料結構。
 *
 * 兩條不可退讓的規則：
 *
 * 1. **缺測一律保留 null**，不填 0 也不內插。這份資料的 null 率是 2.5%～40%，
 *    填補會捏造出根本沒量到的動作曲線；畫線時斷開才是誠實的呈現。
 * 2. **陣列長度永遠等於 frameCount**，索引即 frame_index。events 與 peak 都用
 *    frame_index 指向影格（已驗證其 timestamp 與 timeseries.timestamp[i] 完全
 *    一致），對齊靠索引，不做時間比對。
 */

import type {
  MetricKey,
  PoseMetricEvent,
  PoseMetricPeak,
  PoseMetrics,
  PoseMetricValue,
  RawBiomech,
} from './types'
import { EVENT_LABELS, metricInfo, SERIES_METRIC_KEYS } from './types'

/** `2026-06-24T15:25:02.469251` — 秒以下最多 6 位（微秒） */
const ISO_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?$/

/**
 * 影格時間戳 → epoch 微秒（整數）。
 *
 * 回傳微秒而不是毫秒，是因為毫秒撐不住這份資料的精度：epoch 毫秒是 1.78e12
 * 量級，double 在那個量級的解析度已經比 1 微秒還粗，小數位加下去就被吃掉了。
 * 換成微秒整數是 1.78e15，仍遠低於 `Number.MAX_SAFE_INTEGER`（9.0e15），
 * 每一微秒都表示得出來。影格最短間隔只有 0.6ms，這個精度是必要的。
 *
 * 時區刻意補 `Z`——原字串沒帶偏移，不補的話會被當本地時間。反正下游只用
 * 「相對第一格」的差值，補哪個時區都不影響結果，補 Z 只是為了跨機器一致。
 */
export function parseBiomechTimestampUs(ts: string): number | null {
  const matched = ISO_PATTERN.exec(ts)
  if (!matched)
    return null

  // 整秒才交給 Date.parse，回傳值必為整毫秒，不會有精度問題
  const seconds = Date.parse(`${matched[1]}T${matched[2]}Z`)
  if (!Number.isFinite(seconds))
    return null

  const fraction = matched[3] ? Number(matched[3].padEnd(6, '0')) : 0
  return seconds * 1000 + fraction
}

/**
 * 時間戳陣列 → 相對第一格的毫秒。
 *
 * 解析不出來的那格沿用前一格的時間（首格解析不出就當 0），**不跳過**——
 * 跳過會讓後面每一格的索引位移，events 的 frame_index 就指錯影格了。
 * 沿用的代價只是該點與前一點在 X 軸上重疊，曲線幾乎看不出差別。
 */
function toRelativeTimes(timestamps: readonly string[]): number[] {
  const absolute = timestamps.map(parseBiomechTimestampUs)
  const origin = absolute.find(t => t !== null)
  if (origin === undefined)
    return timestamps.map(() => 0)

  const times: number[] = []
  let previous = 0
  for (const t of absolute) {
    // 相減完才轉毫秒：微秒整數相減仍是精確整數，除以 1000 之後的小數也才是對的
    previous = t === null ? previous : (t - origin) / 1000
    times.push(previous)
  }
  return times
}

/** 取逐影格數值：長度不符或非有限數一律當缺測 */
function toSeries(raw: unknown, frameCount: number): (number | null)[] | null {
  if (!Array.isArray(raw) || raw.length !== frameCount)
    return null
  return raw.map(v => (typeof v === 'number' && Number.isFinite(v) ? v : null))
}

function toEvents(raw: RawBiomech['events'], times: readonly number[]): PoseMetricEvent[] {
  if (!raw)
    return []

  const events: PoseMetricEvent[] = []
  for (const [key, event] of Object.entries(raw)) {
    const frameIndex = event?.frame_index
    if (typeof frameIndex !== 'number' || frameIndex < 0 || frameIndex >= times.length)
      continue
    events.push({
      key,
      label: EVENT_LABELS[key] ?? key,
      frameIndex,
      timeMs: times[frameIndex]!,
      truncated: event.truncated === true,
    })
  }
  return events.sort((a, b) => a.frameIndex - b.frameIndex)
}

/**
 * peak 區塊 → 峰值清單。
 *
 * frame_index 落在影格範圍外的整筆略過：峰值要標在時間軸上才有意義，
 * 夾到邊界會標在錯的地方，比不標更糟。
 */
function toPeaks(
  raw: RawBiomech['peak'],
  times: readonly number[],
  series: Partial<Record<MetricKey, (number | null)[]>>,
): PoseMetricPeak[] {
  if (!raw)
    return []

  const peaks: PoseMetricPeak[] = []
  for (const [key, peak] of Object.entries(raw)) {
    const value = peak?.value
    const frameIndex = peak?.frame_index
    if (typeof value !== 'number' || !Number.isFinite(value))
      continue
    if (typeof frameIndex !== 'number' || frameIndex < 0 || frameIndex >= times.length)
      continue

    const info = metricInfo(key)
    const points = series[key as MetricKey]
    peaks.push({
      key,
      label: info.label,
      unit: info.unit,
      value,
      frameIndex,
      timeMs: times[frameIndex]!,
      window: peak.window ?? '',
      reliable: peak.reliable !== false,
      onSeries: points !== undefined,
      plotValue: points?.[frameIndex] ?? null,
    })
  }
  return peaks.sort((a, b) => a.frameIndex - b.frameIndex)
}

/** 缺測比例 0–1。斷線多的指標要在圖例上講清楚，否則會被當成畫壞了 */
export function missingRatio(values: readonly (number | null)[]): number {
  if (!values.length)
    return 0
  return values.filter(v => v === null).length / values.length
}

/** 單點值區塊（at_release / at_foot_plant）→ 顯示用清單 */
function toValues(raw: Record<string, number> | undefined): PoseMetricValue[] {
  if (!raw)
    return []

  const values: PoseMetricValue[] = []
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'number' || !Number.isFinite(value))
      continue
    const info = metricInfo(key)
    values.push({ key, label: info.label, unit: info.unit, value })
  }
  return values
}

export function parseBiomech(raw: RawBiomech): PoseMetrics {
  const timestamps = raw.timeseries?.timestamp
  const validTimestamps = Array.isArray(timestamps) ? timestamps : []
  // 以實際的時間戳長度為準，不信 frame_count——兩者不一致時，能索引的只有前者
  const frameCount = validTimestamps.length
  const timesMs = toRelativeTimes(validTimestamps)

  const series: Partial<Record<MetricKey, (number | null)[]>> = {}
  for (const key of SERIES_METRIC_KEYS) {
    const points = toSeries(raw.timeseries?.[key], frameCount)
    if (points)
      series[key] = points
  }

  return {
    pitchId: raw.pitch_id ?? '',
    throwingHand: raw.throwing_hand ?? null,
    frameCount,
    timesMs,
    series,
    events: toEvents(raw.events, timesMs),
    peaks: toPeaks(raw.peak, timesMs, series),
    atRelease: toValues(raw.at_release),
    atFootPlant: toValues(raw.at_foot_plant),
  }
}

/**
 * 取前 n 影格，落在範圍外的事件與峰值一併丟掉。
 *
 * 用途是展示「交付不足名目長度」的樣子。手上唯一的樣本是 748 格，畫在 750 的
 * 軸上只留白 0.4%，肉眼看不出來；截到 480 格就看得到右邊三分之一是空的，也看
 * 得到踏地（第 608 格）與出手（第 637 格）兩條事件線隨之消失——那正是短交付
 * 的真實後果，不是渲染錯誤。
 *
 * `atRelease` / `atFootPlant` 刻意不動：那是單點卡片、不屬於曲線內容。
 */
export function truncateMetrics(metrics: PoseMetrics, frameCount: number): PoseMetrics {
  if (frameCount >= metrics.frameCount)
    return metrics

  const limit = Math.max(0, frameCount)
  const series: Partial<Record<MetricKey, (number | null)[]>> = {}
  for (const key of Object.keys(metrics.series) as MetricKey[]) {
    const values = metrics.series[key]
    if (values)
      series[key] = values.slice(0, limit)
  }

  return {
    ...metrics,
    frameCount: limit,
    timesMs: metrics.timesMs.slice(0, limit),
    series,
    events: metrics.events.filter(event => event.frameIndex < limit),
    peaks: metrics.peaks.filter(peak => peak.frameIndex < limit),
  }
}

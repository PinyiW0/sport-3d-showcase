/**
 * 折線圖的座標、刻度與 path 產生。
 *
 * 純 TS、零依賴（連 vue 都不 import），所以能單獨測、也能整包搬到別的框架。
 * SVG 座標系原點在左上、y 往下增加，所以 `toY` 一律是翻轉的。
 */

import type { PoseMetrics } from './types'

/**
 * 環繞角的斷線閾值（度）。
 *
 * 這份資料的實測依據：軀幹與骨盆旋轉角通過 ±180 時的跳變是 350～358 度，
 * 而所有指標的正常相鄰變化最大只有 39.6 度。取 180 有 4.5 倍安全邊際，
 * 不會誤斷真實的快速動作。
 */
export const WRAP_THRESHOLD_DEG = 180

export interface Point2D {
  x: number
  y: number
}

export interface ChartPadding {
  top: number
  right: number
  bottom: number
  left: number
}

export interface ChartTick {
  value: number
  /** 已換算的 SVG 座標 */
  position: number
  label: string
}

export interface ChartScale {
  /** viewBox 尺寸 */
  width: number
  height: number
  /** 扣掉軸標籤留白後的繪圖區 */
  plot: { x: number, y: number, width: number, height: number }
  xDomain: [number, number]
  yDomain: [number, number]
  toX: (timeMs: number) => number
  toY: (value: number) => number
  xTicks: ChartTick[]
  yTicks: ChartTick[]
}

export interface NiceScale {
  domain: [number, number]
  ticks: number[]
  step: number
}

/**
 * 角度軸的刻度候選。
 *
 * 通用的 1／2／5 階梯畫角度會很難看：±180 會挑到 100，於是值域被撐成 ±200
 * （浪費一成高度），刻度也讀不出「半圈」「四分之一圈」。角度的自然分度是
 * 30／45／60／90，另開一張表比在通用階梯上硬湊乾淨。
 */
export const DEGREE_TICK_STEPS: readonly number[] = [1, 2, 5, 10, 15, 30, 45, 60, 90, 180, 360]

/** 數值範圍，全部缺測時回傳 null（不讓 Infinity 漏到下游） */
export function extent(values: readonly (number | null)[]): [number, number] | null {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const v of values) {
    if (v === null || !Number.isFinite(v))
      continue
    if (v < min)
      min = v
    if (v > max)
      max = v
  }
  return Number.isFinite(min) && Number.isFinite(max) ? [min, max] : null
}

/** 浮點累加會漏出 0.30000000000000004 這種尾巴，刻度值統一收斂 */
function tidy(value: number): number {
  return Number(value.toPrecision(12))
}

/** 通用階梯：1／2／5 的十次方倍 */
function pickDecimalStep(min: number, max: number, targetCount: number): number {
  const rawStep = (max - min) / Math.max(1, targetCount)
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const normalized = rawStep / magnitude
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return factor * magnitude
}

/** 指定階梯：挑第一個能把刻度數壓到目標以內的候選，都壓不下就用最大的 */
function pickCandidateStep(
  min: number,
  max: number,
  targetCount: number,
  candidates: readonly number[],
): number {
  const fit = candidates.find(
    step => Math.ceil(max / step) - Math.floor(min / step) <= targetCount,
  )
  return fit ?? candidates.at(-1) ?? 1
}

/**
 * 取「好看的」刻度：值域外擴到刻度邊界，曲線才不會貼齊上下緣。
 *
 * 間距預設用 1／2／5 的十次方倍；傳 `candidates`（如 `DEGREE_TICK_STEPS`）
 * 就改從那張表挑。
 *
 * 值域退化（全部同值、或完全沒資料）時回傳一個固定的小區間，避免 step 變成
 * 0 而在下面的迴圈裡無限跑。
 */
export function niceScale(
  min: number,
  max: number,
  targetCount = 5,
  candidates?: readonly number[],
): NiceScale {
  if (!Number.isFinite(min) || !Number.isFinite(max))
    return { domain: [0, 1], ticks: [0, 1], step: 1 }

  if (min === max) {
    const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.1 : 1
    return niceScale(min - pad, max + pad, targetCount, candidates)
  }

  const step = candidates
    ? pickCandidateStep(min, max, targetCount, candidates)
    : pickDecimalStep(min, max, targetCount)

  const lower = tidy(Math.floor(min / step) * step)
  const upper = tidy(Math.ceil(max / step) * step)

  const ticks: number[] = []
  // 用乘法而非累加，免得步數多時把浮點誤差滾大
  const count = Math.round((upper - lower) / step)
  for (let i = 0; i <= count; i++)
    ticks.push(tidy(lower + step * i))

  return { domain: [lower, upper], ticks, step }
}

/** 依刻度間距決定小數位數：間距 5 就不必印小數，間距 0.5 才印一位 */
export function formatTickLabel(value: number, step: number): string {
  if (!Number.isFinite(value))
    return ''
  const digits = step >= 1 ? 0 : step >= 0.1 ? 1 : 2
  return value.toFixed(digits)
}

export interface ChartScaleOptions {
  width: number
  height: number
  padding: ChartPadding
  /** X 軸值域，直接使用不做 nice 外擴 */
  xDomain: [number, number]
  /**
   * Y 軸值域。給定就照用、不外擴——多系列疊圖靠共用一條固定軸互相比較，
   * 軸跟著資料浮動的話兩次觀察就對不起來。省略時才由 `valueRange` nice 化。
   */
  yDomain?: readonly [number, number] | null
  /** Y 軸原始值域，只在 `yDomain` 省略時使用；null 代表沒有可畫的資料 */
  valueRange?: [number, number] | null
  xTickCount?: number
  yTickCount?: number
  /** X 軸刻度候選，省略走通用 1／2／5 階梯 */
  xTickCandidates?: readonly number[]
  /** Y 軸刻度候選，角度軸傳 `DEGREE_TICK_STEPS` */
  yTickCandidates?: readonly number[]
  /**
   * 直接指定繪圖區，給定時忽略 `padding`。
   * 多列版面用得到——七列各佔一條橫帶，位置不是靠留白算出來的。
   */
  plot?: { x: number, y: number, width: number, height: number }
}

export function createChartScale(options: ChartScaleOptions): ChartScale {
  const { width, height, padding, xDomain, yDomain, valueRange } = options
  const plot = options.plot ?? {
    x: padding.left,
    y: padding.top,
    width: Math.max(1, width - padding.left - padding.right),
    height: Math.max(1, height - padding.top - padding.bottom),
  }

  const [x0, x1] = xDomain
  const xSpan = x1 - x0 || 1
  const toX = (value: number) => plot.x + ((value - x0) / xSpan) * plot.width

  const y = yDomain
    ? { domain: [yDomain[0], yDomain[1]] as [number, number], ...tickSet(yDomain[0], yDomain[1], options.yTickCount ?? 5, options.yTickCandidates) }
    : niceScale(
        valueRange ? valueRange[0] : 0,
        valueRange ? valueRange[1] : 1,
        options.yTickCount ?? 5,
        options.yTickCandidates,
      )
  const [y0, y1] = y.domain
  const valueSpan = y1 - y0 || 1
  const toY = (value: number) => plot.y + plot.height - ((value - y0) / valueSpan) * plot.height

  const x = niceScale(x0, x1, options.xTickCount ?? 6, options.xTickCandidates)
  const xTicks: ChartTick[] = x.ticks
    .filter(v => v >= x0 && v <= x1)
    .map(v => ({ value: v, position: toX(v), label: formatTickLabel(v, x.step) }))

  const yTicks: ChartTick[] = y.ticks.map(v => ({
    value: v,
    position: toY(v),
    label: formatTickLabel(v, y.step),
  }))

  return {
    width,
    height,
    plot,
    xDomain: [x0, x1],
    yDomain: y.domain,
    toX,
    toY,
    xTicks,
    yTicks,
  }
}

/** 在固定值域上取刻度：步進照樣挑好看的，但端點不動 */
function tickSet(
  min: number,
  max: number,
  targetCount: number,
  candidates?: readonly number[],
): { ticks: number[], step: number } {
  const step = candidates
    ? pickCandidateStep(min, max, targetCount, candidates)
    : pickDecimalStep(min, max, targetCount)

  const ticks: number[] = []
  const first = Math.ceil(min / step) * step
  for (let v = first; v <= max + step * 1e-9; v += step)
    ticks.push(tidy(v))
  return { ticks, step }
}

/**
 * 短缺口的跨越門檻——**兩個條件要同時成立**才把線接過去。
 *
 * 這份資料的缺口幾乎全是 4～10 格（40ms 內），而且絕大多數缺口兩端只差 1～3
 * 度，接起來的誤差比線寬還小；碎成 25 段反而讓人以為圖畫壞了。但長度不能單獨
 * 當門檻：肩膀外旋在第 604～613 格（踏地前後）也只缺 10 格，兩端卻差 86.2 度
 * ——那是投球最劇烈的瞬間，一條直線補過去等於捏造一段沒量到的軌跡。
 *
 * 所以再加一道角度差門檻，把「安靜的小洞」和「關鍵時刻的大洞」分開。
 */
export const MAX_BRIDGE_FRAMES = 10
export const MAX_BRIDGE_DELTA_DEG = 15

export interface SegmentOptions {
  /** 是否為 ±180 環繞角，是的話跳變處要斷開 */
  wraps?: boolean
  wrapThreshold?: number
  /** 缺口最多幾格可以接過去。0（預設）＝一律斷開 */
  maxBridgeFrames?: number
  /** 接缺口時兩端值差的上限，超過就仍然斷開 */
  maxBridgeDelta?: number
}

/**
 * 把逐影格數值切成連續段落。
 *
 * 三種情況會斷開：
 *
 * 1. 缺口太長（超過 `maxBridgeFrames`）——真的沒量到那麼久
 * 2. 缺口雖短但兩端差太多（超過 `maxBridgeDelta`）——中間發生了什麼無從得知
 * 3. 環繞角在 ±180 邊界的整圈跳變——同一個角度換了個表示法，不是真的轉了 358 度
 */
export function buildLineSegments(
  values: readonly (number | null)[],
  toPoint: (index: number, value: number) => Point2D,
  options: SegmentOptions = {},
): Point2D[][] {
  const {
    wraps = false,
    wrapThreshold = WRAP_THRESHOLD_DEG,
    maxBridgeFrames = 0,
    maxBridgeDelta = Number.POSITIVE_INFINITY,
  } = options

  const segments: Point2D[][] = []
  let current: Point2D[] = []
  let previous: number | null = null
  let gap = 0

  for (let i = 0; i < values.length; i++) {
    const value = values[i]
    if (value === null || value === undefined || !Number.isFinite(value)) {
      gap++
      continue
    }

    if (current.length && previous !== null) {
      const delta = Math.abs(value - previous)
      // 環繞角跨邊界時，真正的變化量是短弧那一邊
      const travelled = wraps && delta > 180 ? 360 - delta : delta
      const bridged = gap === 0 || (gap <= maxBridgeFrames && travelled <= maxBridgeDelta)
      const wrapped = wraps && delta > wrapThreshold

      if (!bridged || wrapped) {
        segments.push(current)
        current = []
      }
    }

    current.push(toPoint(i, value))
    previous = value
    gap = 0
  }

  if (current.length)
    segments.push(current)

  return segments
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

/**
 * 段落 → 單一 `<path>` 的 d。
 *
 * 全部段落合成一條 path，所以 748 個點只有一個 DOM 節點（同 pitch-distribution
 * 的做法）。孤立的單點段落補一段零長度線段，配 `stroke-linecap="round"` 才畫得
 * 出來——否則只有 M 沒有 L，SVG 什麼都不畫。
 */
export function segmentsToPath(segments: readonly Point2D[][]): string {
  return segments
    .map((segment) => {
      const [head, ...rest] = segment
      if (!head)
        return ''
      const start = `M${round(head.x)},${round(head.y)}`
      if (!rest.length)
        return `${start}L${round(head.x)},${round(head.y)}`
      return start + rest.map(p => `L${round(p.x)},${round(p.y)}`).join('')
    })
    .join('')
}

/**
 * 段落 → 平滑曲線的 d（Catmull-Rom 轉三次貝茲）。
 *
 * 只改「點與點之間怎麼連」，**每個資料點的位置一個都沒動**——線會穿過所有原始
 * 點，中間的起伏是內插畫出來的、不是量到的。七條疊圖時折角太多會糊成一片，
 * 平滑過的線比較讀得出走勢；代價寫在 README 與模組的已知限制裡。
 *
 * 控制點取 Catmull-Rom 的標準形式（張力 1/6）：段落端點沒有前一點／後一點時
 * 拿自己代替，曲線才不會在兩端甩出去。
 */
export function segmentsToSmoothPath(segments: readonly Point2D[][]): string {
  return segments
    .map((segment) => {
      const head = segment[0]
      if (!head)
        return ''
      const start = `M${round(head.x)},${round(head.y)}`
      if (segment.length === 1)
        return `${start}L${round(head.x)},${round(head.y)}`
      if (segment.length === 2) {
        const next = segment[1]!
        return `${start}L${round(next.x)},${round(next.y)}`
      }

      let d = start
      for (let i = 0; i < segment.length - 1; i++) {
        const previous = segment[i - 1] ?? segment[i]!
        const current = segment[i]!
        const next = segment[i + 1]!
        const after = segment[i + 2] ?? next

        const cp1x = current.x + (next.x - previous.x) / 6
        const cp1y = current.y + (next.y - previous.y) / 6
        const cp2x = next.x - (after.x - current.x) / 6
        const cp2y = next.y - (after.y - current.y) / 6

        d += `C${round(cp1x)},${round(cp1y)} ${round(cp2x)},${round(cp2y)} ${round(next.x)},${round(next.y)}`
      }
      return d
    })
    .join('')
}

/**
 * 高斯低通濾波的預設強度（單位是影格）。
 *
 * 這是唯一會**改動數值**的處理，所以強度是量出來的而不是憑感覺調的。實測
 * σ=1.5 讓曲率（二階差分，視覺上「滑不滑」的指標）降 78%，而峰值一位小數都
 * 沒變、出手那格的誤差 2.6 度。再往上 σ=3 雖然曲率降 91%，但出手格會偏掉
 * 7.9 度——那是整段動作最劇烈的瞬間，不能為了好看犧牲它。
 *
 * 對姿態估計資料做低通是生物力學的標準處理（後端自己的 peak 也分 `value` 與
 * `raw_value`，差了 15 度），不是憑空修飾。
 */
export const DEFAULT_FILTER_SIGMA = 1.5

/** 高斯權重，取 ±3σ 為窗寬後正規化 */
export function gaussianKernel(sigma: number): number[] {
  const half = Math.max(1, Math.round(sigma * 3))
  const weights: number[] = []
  for (let k = -half; k <= half; k++)
    weights.push(Math.exp(-(k * k) / (2 * sigma * sigma)))
  const total = weights.reduce((sum, w) => sum + w, 0)
  return weights.map(w => w / total)
}

/**
 * 逐段做高斯濾波。
 *
 * **一定要在分段之後做**：段落的邊界正是缺口與 ±180 環繞跳變的位置，跨過去
 * 平均會把 179 和 -178 混成接近 0 的假值。段內連續，濾起來才有意義。
 *
 * 濾的是 y 座標而不是原始值——值到座標是線性映射，兩者等價，但在座標上做就
 * 不必把 scale 傳進來。
 *
 * 段落兩端用**反對稱延拓**取樣（`2·y(端點) − y(鏡像)`）而不是把窗口截短。
 * 截短再重新正規化看似無害，實測卻會把端點往段落內側拉：一條 y=i 的直線，
 * σ=1.5 下起點從 0 被拉到 0.909。反對稱延拓在延伸段維持原本的斜率，直線濾
 * 完仍是同一條直線，端點一動都不動。
 */
export function smoothSegments(
  segments: readonly Point2D[][],
  sigma: number,
): Point2D[][] {
  if (sigma <= 0)
    return segments.map(segment => [...segment])

  const kernel = gaussianKernel(sigma)
  const half = (kernel.length - 1) / 2

  return segments.map((segment) => {
    if (segment.length < 3)
      return [...segment]

    const last = segment.length - 1
    /** 越界時沿著端點的斜率往外延伸，而不是折回來 */
    function sampleY(index: number): number {
      if (index < 0)
        return 2 * segment[0]!.y - segment[Math.min(-index, last)]!.y
      if (index > last)
        return 2 * segment[last]!.y - segment[Math.max(2 * last - index, 0)]!.y
      return segment[index]!.y
    }

    return segment.map((point, i) => {
      let acc = 0
      for (let k = -half; k <= half; k++)
        acc += kernel[k + half]! * sampleY(i + k)
      return { x: point.x, y: acc }
    })
  })
}

export interface LinePathOptions extends SegmentOptions {
  /** 走 Catmull-Rom 把折線轉成曲線 */
  smooth?: boolean
  /** 高斯低通的 σ（影格）。0 或省略＝不濾，數值原封不動 */
  filterSigma?: number
}

/** `buildLineSegments` → 濾波 → path 的常用組合 */
export function buildLinePath(
  values: readonly (number | null)[],
  toPoint: (index: number, value: number) => Point2D,
  options: LinePathOptions = {},
): string {
  const segments = smoothSegments(
    buildLineSegments(values, toPoint, options),
    options.filterSigma ?? 0,
  )
  return options.smooth ? segmentsToSmoothPath(segments) : segmentsToPath(segments)
}

/** 曲線在該影格有值才標得上去；沒有就只能當數值顯示 */
export function peakOnSeries(metrics: PoseMetrics, key: string) {
  return metrics.peaks.find(p => p.key === key && p.onSeries) ?? null
}

/**
 * SVG 座標 → 影格序號。
 *
 * 夾在**軸**範圍內，不是資料範圍。軸固定在名目長度（750）而交付常少於此數，
 * 若夾在 `frameCount - 1`，繪圖區最右邊那段就成了拖不動的死區——748 格時是
 * 0.4%，500 格時是三分之一。
 *
 * 越界的影格讀到 `undefined` 是預期的，由呼叫端顯示「—」（兩個版面都已經這樣
 * 做）；那個破折號本身就是「這裡沒有交付資料」的訊號。
 */
export function frameAtX(svgX: number, scale: ChartScale): number {
  const { plot, xDomain } = scale
  const ratio = (svgX - plot.x) / plot.width
  const frame = Math.round(xDomain[0] + ratio * (xDomain[1] - xDomain[0]))
  return Math.min(Math.max(frame, xDomain[0]), xDomain[1])
}

export interface StackedRowInput {
  key: string
  values: readonly (number | null)[]
}

export interface StackedRow {
  key: string
  scale: ChartScale
  /** 繪圖用的值域（實際值域外加留白） */
  domain: [number, number]
  /**
   * 實際量到的極值，**刻度要標這個**。標 domain 的話讀者看到的是留白後的數字
   * ——實測肩膀外旋會顯示成 187／-111，但真正的極值是 166.6／-90.3。
   * 全缺測時為 null。
   */
  valueRange: [number, number] | null
  /** 該列繪圖區的垂直中線，標籤對齊用 */
  centerY: number
}

export interface StackedLayoutOptions {
  width: number
  /** 每一列繪圖區的高度 */
  rowHeight: number
  /** 列與列之間的空隙 */
  rowGap: number
  padding: ChartPadding
  xDomain: [number, number]
  /** 每列最多幾條水平刻度。小圖只需要上中下三條 */
  yTickCount?: number
  yTickCandidates?: readonly number[]
  xTickCount?: number
  xTickCandidates?: readonly number[]
}

export interface StackedLayout {
  width: number
  height: number
  rows: StackedRow[]
  /** X 軸刻度只畫最下面一次，位置用任一列的 scale 換算都一樣 */
  xTicks: ChartTick[]
  /** 事件線與游標貫穿全部列的上下界 */
  spanY1: number
  spanY2: number
  /** X 軸刻度文字的基準線 */
  axisLabelY: number
}

/** 值域加 8% 留白；全缺測或值域退化時給一個看得出是空的固定區間 */
function padDomain(range: [number, number] | null): [number, number] {
  if (!range)
    return [0, 1]
  const [min, max] = range
  const pad = (max - min) * 0.08 || 1
  return [min - pad, max + pad]
}

/**
 * 把多條指標排成上下堆疊的小圖（small multiples）。
 *
 * 解決的是疊圖的兩個結構問題：七條共用一軸時互相交纏無法追蹤，而且為了容納
 * 值域最大的那條（環繞角 ±180），其餘五條被壓在中間——實測軀幹前傾只用到軸高
 * 的 16%、肩膀內旋 25%。拆成小圖後每條都用滿自己那一列，解析度差 4～6 倍。
 *
 * 共用的是 X 軸（時間）與事件線，這樣列與列之間仍然對得起來；各自最佳化的是
 * Y 值域。代價是看不到交叉點——兩種版面各有適用場合，所以並存而不是取代。
 *
 * 全缺測的指標仍然保留一列（畫成空的），不然列的順序會隨資料跳動。
 */
export function layoutStackedRows(
  inputs: readonly StackedRowInput[],
  options: StackedLayoutOptions,
): StackedLayout {
  const { width, rowHeight, rowGap, padding, xDomain } = options
  const plotWidth = Math.max(1, width - padding.left - padding.right)
  const height = padding.top + inputs.length * rowHeight
    + Math.max(0, inputs.length - 1) * rowGap + padding.bottom

  const rows = inputs.map((input, index) => {
    const y = padding.top + index * (rowHeight + rowGap)
    /**
     * 用實際值域加一點留白，**不做 nice 外擴**。
     *
     * 小圖的整個意義就是每列填滿自己那一格：手肘彎曲實測 11～141，nice 化會
     * 撐成 0～180，又浪費掉 28% 的高度——那正是疊圖已經犯過的錯，只是程度輕
     * 一點。刻度只標頭尾兩個數字，不需要湊整。
     */
    const range = extent(input.values)
    const domain = padDomain(range)
    const scale = createChartScale({
      width,
      height,
      padding,
      plot: { x: padding.left, y, width: plotWidth, height: rowHeight },
      xDomain,
      yDomain: domain,
      yTickCount: options.yTickCount ?? 2,
      yTickCandidates: options.yTickCandidates,
      xTickCount: options.xTickCount,
      xTickCandidates: options.xTickCandidates,
    })
    return { key: input.key, scale, domain, valueRange: range, centerY: y + rowHeight / 2 }
  })

  const lastRow = rows.at(-1)
  const spanY1 = padding.top
  const spanY2 = lastRow ? lastRow.scale.plot.y + rowHeight : padding.top

  return {
    width,
    height,
    rows,
    xTicks: rows[0]?.scale.xTicks ?? [],
    spanY1,
    spanY2,
    axisLabelY: spanY2 + 20,
  }
}

export interface TooltipRow {
  label: string
  value: string
}

export interface TooltipRowGeometry {
  swatchX: number
  swatchY: number
  swatchWidth: number
  swatchHeight: number
  labelX: number
  /** 數值右對齊的位置 */
  valueX: number
  textY: number
}

/** 泛型讓呼叫端可以在每列多掛自己的欄位（例如色塊的 class），版面照樣算得出來 */
export interface TooltipLayout<T extends TooltipRow = TooltipRow> {
  x: number
  y: number
  width: number
  height: number
  titleX: number
  titleY: number
  /** 分隔線的 y，null 代表沒有列要畫 */
  dividerY: number | null
  /** 面板落在游標的哪一側 */
  side: 'left' | 'right'
  /** 指向游標那一側的小三角，直接餵給 `<polygon points>` */
  tailPoints: string
  rows: (T & TooltipRowGeometry)[]
}

export interface TooltipLayoutOptions {
  fontSize?: number
  /** 游標左右要留的距離 */
  offset?: number
}

/**
 * 數值面板的版面。
 *
 * 純算座標、不碰 DOM，所以擺放規則測得到。兩個規則：
 *
 * 1. **預設放游標右側**，右邊塞不下就翻到左側——面板寬度接近繪圖區的四分之一，
 *    游標拖到尾端時不翻面會有一半被切掉。
 * 2. **垂直置中對齊游標，再夾回繪圖區**，免得列數多的時候上下溢出。
 *
 * 寬度用字數估：中文字寬約等於字級，數值是半寬字元約 0.6 倍。
 */
export function layoutTooltip<T extends TooltipRow>(
  rows: readonly T[],
  scale: ChartScale,
  cursorX: number,
  options: TooltipLayoutOptions = {},
): TooltipLayout<T> {
  const { fontSize = 13, offset = 14 } = options
  const { plot } = scale

  const padX = 10
  const padY = 9
  const rowHeight = fontSize + 8
  const swatchWidth = fontSize + 3
  const swatchHeight = Math.round(fontSize * 0.5)
  const swatchGap = 7
  const valueGap = 16

  const labelChars = Math.max(0, ...rows.map(r => r.label.length))
  const valueChars = Math.max(0, ...rows.map(r => r.value.length))
  const labelWidth = labelChars * fontSize
  const valueWidth = valueChars * fontSize * 0.6

  const width = padX * 2 + swatchWidth + swatchGap + labelWidth + valueGap + valueWidth
  const titleHeight = rows.length ? fontSize + 12 : fontSize
  const height = padY * 2 + titleHeight + rows.length * rowHeight

  // 右邊放不下就翻到左側；兩邊都放不下（極窄畫布）就貼左緣
  const preferRight = cursorX + offset + width <= plot.x + plot.width
  const rawX = preferRight ? cursorX + offset : cursorX - offset - width
  const x = Math.min(Math.max(rawX, plot.x), Math.max(plot.x, plot.x + plot.width - width))

  const y = Math.min(
    Math.max(plot.y + plot.height / 2 - height / 2, plot.y),
    Math.max(plot.y, plot.y + plot.height - height),
  )

  const titleY = y + padY + fontSize * 0.8
  const rowsTop = y + padY + titleHeight

  // 小三角認的是面板最後落在游標哪一側，不是原本想放哪側——夾回繪圖區後可能翻邊
  const side: 'left' | 'right' = x >= cursorX ? 'right' : 'left'
  const tailSize = 8
  const tailCenterY = y + height / 2
  const tailBaseX = side === 'right' ? x : x + width
  const tailTipX = side === 'right' ? x - tailSize : x + width + tailSize
  const tailPoints = [
    `${round(tailTipX)},${round(tailCenterY)}`,
    `${round(tailBaseX)},${round(tailCenterY - tailSize)}`,
    `${round(tailBaseX)},${round(tailCenterY + tailSize)}`,
  ].join(' ')

  return {
    x,
    y,
    width,
    height,
    titleX: x + padX,
    titleY,
    dividerY: rows.length ? rowsTop - 5 : null,
    side,
    tailPoints,
    rows: rows.map((row, i) => {
      const centerY = rowsTop + i * rowHeight + rowHeight / 2
      return {
        ...row,
        swatchX: x + padX,
        swatchY: centerY - swatchHeight / 2,
        swatchWidth,
        swatchHeight,
        labelX: x + padX + swatchWidth + swatchGap,
        valueX: x + width - padX,
        textY: centerY,
      }
    }),
  }
}

export interface EventLineLayout {
  key: string
  /** 垂直線的 x */
  x: number
  y1: number
  y2: number
  /** 標籤膠囊：已夾在繪圖區內，元件直接畫 rect + 置中文字 */
  chip: {
    text: string
    x: number
    y: number
    width: number
    height: number
    /** 文字中心 */
    textX: number
    textY: number
  }
}

export interface EventLayoutOptions {
  /** 標籤字級（SVG user unit） */
  fontSize?: number
  /** 最多疊幾列後繞回第一列 */
  maxRows?: number
}

/**
 * 事件垂直線與標籤膠囊的排版。`x` 由呼叫端換算好（這張圖用 frame index）。
 *
 * 膠囊要處理兩件事，都是這份資料量出來的、不是防禦性設計：
 *
 * 1. **互相重疊**——踏地在第 608 影格、出手在第 637 影格，只差 29 格，換算成
 *    畫寬不到 4%。任何「置中放在線頂」的直覺寫法都會讓兩個膠囊疊在一起，
 *    所以距離不夠時往下推一列。
 * 2. **左右出界**——出手落在全長的 85%，置中會有一半跑到繪圖區外，所以最後
 *    一律把膠囊夾回繪圖區內。
 *
 * 中文字寬約等於字級，寬度就用 `字數 × fontSize + 左右內距` 估。
 */
export function layoutEventLines(
  events: readonly { key: string, label: string, x: number }[],
  scale: ChartScale,
  options: EventLayoutOptions = {},
): EventLineLayout[] {
  const { fontSize = 12, maxRows = 2 } = options
  const { plot } = scale
  const padX = 8
  const padY = 4
  const height = fontSize + padY * 2
  const rowHeight = height + 4

  const sorted = [...events].sort((a, b) => a.x - b.x)
  const layouts: EventLineLayout[] = []
  let previousRight = Number.NEGATIVE_INFINITY
  let row = 0

  for (const event of sorted) {
    const width = event.label.length * fontSize + padX * 2
    // 先置中，再夾回繪圖區——夾過的膠囊仍指得到它的線，因為線本來就在區內
    const left = Math.min(
      Math.max(event.x - width / 2, plot.x),
      plot.x + plot.width - width,
    )

    row = left < previousRight ? (row + 1) % maxRows : 0
    previousRight = left + width

    const y = plot.y + 6 + row * rowHeight

    layouts.push({
      key: event.key,
      x: event.x,
      y1: plot.y,
      y2: plot.y + plot.height,
      chip: {
        text: event.label,
        x: left,
        y,
        width,
        height,
        textX: left + width / 2,
        textY: y + height / 2,
      },
    })
  }

  return layouts
}

import type { RawBiomech } from './types'
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  buildLineSegments,
  createChartScale,
  DEGREE_TICK_STEPS,
  extent,
  formatTickLabel,
  frameAtX,
  gaussianKernel,
  layoutEventLines,
  layoutTooltip,
  MAX_BRIDGE_DELTA_DEG,
  MAX_BRIDGE_FRAMES,
  niceScale,
  segmentsToPath,
  segmentsToSmoothPath,
  smoothSegments,
} from './chartGeometry'
import { parseBiomech } from './parseBiomech'
import { metricInfo } from './types'

/** 測試用：index 當 x、值當 y，方便直接讀座標 */
function identity(index: number, value: number) {
  return { x: index, y: value }
}

const PADDING = { top: 10, right: 10, bottom: 20, left: 40 }

describe('extent', () => {
  it('忽略缺測取頭尾', () => {
    expect(extent([3, null, -1, 7, null])).toEqual([-1, 7])
  })

  it('全部缺測回傳 null，不讓 Infinity 漏到下游', () => {
    expect(extent([null, null])).toBeNull()
    expect(extent([])).toBeNull()
  })
})

describe('niceScale', () => {
  it('刻度間距收斂成 1／2／5 的十次方倍', () => {
    expect(niceScale(0, 100).step).toBe(20)
    expect(niceScale(0, 47).step).toBe(10)
    expect(niceScale(0, 0.9).step).toBe(0.2)
  })

  it('值域外擴到刻度邊界，曲線才不會貼齊上下緣', () => {
    const { domain } = niceScale(11.37, 140.84)
    expect(domain[0]).toBeLessThanOrEqual(11.37)
    expect(domain[1]).toBeGreaterThanOrEqual(140.84)
  })

  it('刻度含頭尾且等距，浮點尾巴要收乾淨', () => {
    const { ticks } = niceScale(0, 1, 5)
    expect(ticks).toEqual([0, 0.2, 0.4, 0.6000000000000001, 0.8, 1].map(v => Number(v.toPrecision(12))))
    expect(ticks[3]).toBe(0.6)
  })

  it('值域退化成單點時自動撐開，step 不會是 0', () => {
    const { step, domain } = niceScale(42, 42)
    expect(step).toBeGreaterThan(0)
    expect(domain[0]).toBeLessThan(domain[1])
  })

  it('沒有有限值時回傳固定小區間，不無限迴圈', () => {
    expect(niceScale(Number.NaN, Number.NaN)).toEqual({ domain: [0, 1], ticks: [0, 1], step: 1 })
  })

  it('角度階梯挑得出 60 度這種自然分度，值域不會被撐大', () => {
    const degree = niceScale(-180, 180, 6, DEGREE_TICK_STEPS)
    expect(degree.step).toBe(60)
    expect(degree.domain).toEqual([-180, 180])
  })

  it('對照組：通用 1／2／5 階梯畫 ±180 會挑到 100，值域被撐成 ±200', () => {
    const decimal = niceScale(-180, 180, 6)
    expect(decimal.step).toBe(100)
    expect(decimal.domain).toEqual([-200, 200])
  })

  it('角度階梯套在實測值域上——膝屈曲 0.99~113.84 得到 30 度一格', () => {
    expect(niceScale(0.99, 113.84, 6, DEGREE_TICK_STEPS).step).toBe(30)
  })
})

describe('formatTickLabel', () => {
  it('小數位跟著刻度間距走', () => {
    expect(formatTickLabel(20, 20)).toBe('20')
    expect(formatTickLabel(0.6, 0.2)).toBe('0.6')
    expect(formatTickLabel(0.05, 0.05)).toBe('0.05')
  })
})

describe('buildLineSegments', () => {
  it('缺測把線斷開，不用 0 也不內插接過去', () => {
    const segments = buildLineSegments([1, 2, null, 4, 5], identity)
    expect(segments).toHaveLength(2)
    expect(segments[0]!.map(p => p.y)).toEqual([1, 2])
    expect(segments[1]!.map(p => p.y)).toEqual([4, 5])
  })

  it('環繞角在 ±180 邊界整圈翻轉時斷開，不畫出貫穿全圖的假垂直線', () => {
    const segments = buildLineSegments([170, 175, -179, -175], identity, { wraps: true })
    expect(segments).toHaveLength(2)
    expect(segments[0]!.map(p => p.y)).toEqual([170, 175])
    expect(segments[1]!.map(p => p.y)).toEqual([-179, -175])
  })

  it('真實動作的快速變化不會被誤斷——實測最大相鄰變化只有 39.6 度', () => {
    const segments = buildLineSegments([0, 39.6, 79.2, 118.8], identity, { wraps: true })
    expect(segments).toHaveLength(1)
  })

  it('非環繞角不套用斷線規則，大跳變照樣連', () => {
    const segments = buildLineSegments([170, -175], identity, { wraps: false })
    expect(segments).toHaveLength(1)
  })

  it('全部缺測回傳空陣列', () => {
    expect(buildLineSegments([null, null], identity)).toEqual([])
  })

  it('index 照原始位置傳給 toPoint，缺測不會讓後面的點位移', () => {
    const segments = buildLineSegments([null, 5, null, 7], identity)
    expect(segments.map(s => s[0]!.x)).toEqual([1, 3])
  })

  it('預設不接任何缺口——要接是呼叫端明示的決定', () => {
    expect(buildLineSegments([1, null, 1], identity)).toHaveLength(2)
  })

  it('缺口夠短且兩端幾乎沒變化時接起來，中間不補點', () => {
    const segments = buildLineSegments(
      [10, null, null, 12],
      identity,
      { maxBridgeFrames: 10, maxBridgeDelta: 15 },
    )
    expect(segments).toHaveLength(1)
    // 只有原始的兩個點，缺的兩格沒有被補成假資料
    expect(segments[0]!.map(p => p.x)).toEqual([0, 3])
  })

  it('缺口夠短但兩端差太多就仍然斷開——中間發生什麼無從得知', () => {
    // 肩膀外旋在踏地前後就是這個情況：只缺 10 格，兩端卻差 86.2 度
    const segments = buildLineSegments(
      [16, null, null, 102],
      identity,
      { maxBridgeFrames: 10, maxBridgeDelta: 15 },
    )
    expect(segments).toHaveLength(2)
  })

  it('缺口太長一律斷開，就算兩端剛好接近', () => {
    const values = [10, ...Array.from({ length: 12 }).fill(null) as null[], 11]
    expect(buildLineSegments(values, identity, { maxBridgeFrames: 10, maxBridgeDelta: 15 }))
      .toHaveLength(2)
  })

  it('環繞角接缺口時算短弧，不會把 179 到 -179 誤判成差 358 度', () => {
    const segments = buildLineSegments(
      [179, null, -179],
      identity,
      { wraps: true, maxBridgeFrames: 10, maxBridgeDelta: 15 },
    )
    // 短弧只有 2 度，在門檻內；但它同時是 ±180 跳變，仍該斷開
    expect(segments).toHaveLength(2)
  })
})

describe('segmentsToPath', () => {
  it('多個段落合成單一 path，各自以 M 起頭', () => {
    const d = segmentsToPath([[{ x: 0, y: 1 }, { x: 1, y: 2 }], [{ x: 3, y: 4 }]])
    expect(d.startsWith('M0,1L1,2')).toBe(true)
    expect(d.split('M')).toHaveLength(3)
  })

  it('孤立單點補一段零長度線段，配 round linecap 才畫得出來', () => {
    expect(segmentsToPath([[{ x: 2, y: 3 }]])).toBe('M2,3L2,3')
  })

  it('座標收到小數三位，path 字串才不會被浮點尾巴撐爆', () => {
    expect(segmentsToPath([[{ x: 1.23456789, y: 2.3456789 }]])).toBe('M1.235,2.346L1.235,2.346')
  })

  it('空輸入回傳空字串', () => {
    expect(segmentsToPath([])).toBe('')
  })
})

describe('createChartScale', () => {
  const scale = createChartScale({
    width: 400,
    height: 200,
    padding: PADDING,
    xDomain: [0, 1000],
    valueRange: [0, 100],
  })

  it('繪圖區是扣掉留白後的矩形', () => {
    expect(scale.plot).toEqual({ x: 40, y: 10, width: 350, height: 170 })
  })

  it('x 軸兩端貼齊繪圖區，不做 nice 外擴——影格軸的頭尾就是呼叫端給的範圍', () => {
    expect(scale.toX(0)).toBe(40)
    expect(scale.toX(1000)).toBe(390)
    expect(scale.xDomain).toEqual([0, 1000])
  })

  it('數值軸上下顛倒：值越大 y 越小', () => {
    expect(scale.toY(scale.yDomain[1])).toBe(10)
    expect(scale.toY(scale.yDomain[0])).toBe(180)
  })

  it('x 軸刻度不超出值域', () => {
    for (const tick of scale.xTicks) {
      expect(tick.value).toBeGreaterThanOrEqual(0)
      expect(tick.value).toBeLessThanOrEqual(1000)
    }
  })

  it('給定 yDomain 就照用不外擴——多系列共用一條不動的軸才比得起來', () => {
    const fixed = createChartScale({
      width: 960,
      height: 360,
      padding: PADDING,
      xDomain: [0, 750],
      yDomain: [-180, 180],
      // 實際資料只到 166.6，軸照樣停在 180 不縮
      valueRange: [-90.3, 166.6],
      yTickCount: 8,
      yTickCandidates: DEGREE_TICK_STEPS,
    })
    expect(fixed.yDomain).toEqual([-180, 180])
    expect(fixed.yTicks.map(t => t.value)).toEqual([-180, -135, -90, -45, 0, 45, 90, 135, 180])
  })

  it('影格軸取得到 50 一格的整數刻度', () => {
    const frames = createChartScale({
      width: 960,
      height: 360,
      padding: PADDING,
      xDomain: [0, 750],
      yDomain: [-180, 180],
      xTickCount: 15,
      xTickCandidates: [10, 25, 50, 100, 250],
    })
    expect(frames.xTicks.map(t => t.value)).toEqual(Array.from({ length: 16 }, (_, i) => i * 50))
    expect(frames.xTicks[1]!.label).toBe('50')
  })

  it('沒有可畫的資料時仍給得出有限座標', () => {
    const empty = createChartScale({
      width: 400,
      height: 200,
      padding: PADDING,
      xDomain: [0, 0],
      valueRange: null,
    })
    expect(Number.isFinite(empty.toX(0))).toBe(true)
    expect(Number.isFinite(empty.toY(0))).toBe(true)
    expect(empty.yTicks.every(t => Number.isFinite(t.position))).toBe(true)
  })
})

describe('segmentsToSmoothPath', () => {
  it('三點以上走三次貝茲，且線仍穿過每個原始點', () => {
    const d = segmentsToSmoothPath([[
      { x: 0, y: 0 },
      { x: 10, y: 20 },
      { x: 20, y: 0 },
    ]])
    expect(d.startsWith('M0,0')).toBe(true)
    expect(d).toContain('C')
    // 每段貝茲的終點就是原始點，點的位置一個都沒動
    expect(d).toContain('10,20')
    expect(d).toContain('20,0')
  })

  it('兩點段不硬湊曲線，直接連直線', () => {
    expect(segmentsToSmoothPath([[{ x: 0, y: 0 }, { x: 5, y: 5 }]])).toBe('M0,0L5,5')
  })

  it('單點段仍補零長線段，才畫得出圓點', () => {
    expect(segmentsToSmoothPath([[{ x: 2, y: 3 }]])).toBe('M2,3L2,3')
  })

  it('多段各自起一個 M，缺測處不會被曲線接過去', () => {
    const d = segmentsToSmoothPath([
      [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }],
      [{ x: 5, y: 0 }, { x: 6, y: 1 }, { x: 7, y: 0 }],
    ])
    expect(d.split('M')).toHaveLength(3)
  })

  it('空輸入回傳空字串', () => {
    expect(segmentsToSmoothPath([])).toBe('')
  })
})

describe('gaussianKernel', () => {
  it('權重總和為 1，濾波不會整條線上下平移', () => {
    for (const sigma of [0.5, 1, 1.5, 3])
      expect(gaussianKernel(sigma).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10)
  })

  it('對稱且中央最重', () => {
    const kernel = gaussianKernel(1.5)
    const half = (kernel.length - 1) / 2
    expect(kernel[half]).toBe(Math.max(...kernel))
    expect(kernel[0]).toBeCloseTo(kernel.at(-1)!, 12)
  })

  it('σ 越大窗越寬', () => {
    expect(gaussianKernel(3).length).toBeGreaterThan(gaussianKernel(1).length)
  })
})

describe('smoothSegments', () => {
  /** 鋸齒：在直線上下交錯跳動 */
  const zigzag = Array.from({ length: 21 }, (_, i) => ({ x: i, y: i % 2 ? 10 : 0 }))

  function curvature(points: readonly { y: number }[]) {
    let total = 0
    for (let i = 1; i < points.length - 1; i++)
      total += Math.abs(points[i + 1]!.y - 2 * points[i]!.y + points[i - 1]!.y)
    return total / (points.length - 2)
  }

  it('σ=0 原封不動', () => {
    expect(smoothSegments([zigzag], 0)[0]).toEqual(zigzag)
  })

  it('把鋸齒壓平，曲率大幅下降', () => {
    const [smoothed] = smoothSegments([zigzag], 1.5)
    expect(curvature(smoothed!)).toBeLessThan(curvature(zigzag) * 0.3)
  })

  it('只動 y 不動 x——點在時間軸上的位置不會位移', () => {
    const [smoothed] = smoothSegments([zigzag], 1.5)
    expect(smoothed!.map(p => p.x)).toEqual(zigzag.map(p => p.x))
  })

  it('段落太短就不濾，兩點的線沒有平滑可言', () => {
    const short = [{ x: 0, y: 0 }, { x: 1, y: 10 }]
    expect(smoothSegments([short], 2)[0]).toEqual(short)
  })

  it('逐段獨立，不會跨段平均', () => {
    // 兩段值域差很遠：跨段平均的話邊界會被互相拉近
    const low = Array.from({ length: 9 }, (_, i) => ({ x: i, y: 0 }))
    const high = Array.from({ length: 9 }, (_, i) => ({ x: i + 9, y: 100 }))
    const [a, b] = smoothSegments([low, high], 2)
    for (const point of a!)
      expect(point.y).toBeCloseTo(0, 9)
    for (const point of b!)
      expect(point.y).toBeCloseTo(100, 9)
  })

  it('段落端點不被往中間拉——窗口在邊緣自動收窄', () => {
    const ramp = Array.from({ length: 15 }, (_, i) => ({ x: i, y: i }))
    const [smoothed] = smoothSegments([ramp], 1.5)
    // 線性資料在任何對稱窗下都該保持原值
    expect(smoothed![0]!.y).toBeCloseTo(0, 6)
    expect(smoothed!.at(-1)!.y).toBeCloseTo(14, 6)
  })
})

describe('layoutEventLines', () => {
  // 用實測的事件影格：抬腿 211、踏地 608、出手 637，全長 748 影格（軸畫到 750）
  const scale = createChartScale({
    width: 960,
    height: 420,
    padding: PADDING,
    xDomain: [0, 750],
    yDomain: [-180, 180],
  })
  function at(frame: number) {
    return scale.toX(frame)
  }
  const events = [
    { key: 'leg_lift', label: '抬腿', x: at(211) },
    { key: 'foot_plant', label: '踏地', x: at(608) },
    { key: 'release', label: '出手', x: at(637) },
  ]

  it('垂直線貫穿整個繪圖區，x 依影格遞增', () => {
    const lines = layoutEventLines(events, scale)
    expect(lines.map(l => l.key)).toEqual(['leg_lift', 'foot_plant', 'release'])
    expect(lines[0]!.x).toBeLessThan(lines[1]!.x)
    for (const line of lines) {
      expect(line.y1).toBe(scale.plot.y)
      expect(line.y2).toBe(scale.plot.y + scale.plot.height)
    }
  })

  it('踏地與出手只差 29 影格，膠囊擠不下就被推到另一列', () => {
    const lines = layoutEventLines(events, scale)
    expect(lines.find(l => l.key === 'foot_plant')!.chip.y)
      .not
      .toBe(lines.find(l => l.key === 'release')!.chip.y)
  })

  it('離得夠遠的事件維持同一列', () => {
    const lines = layoutEventLines(
      [{ key: 'leg_lift', label: '抬腿', x: at(100) }, { key: 'release', label: '出手', x: at(600) }],
      scale,
    )
    expect(lines[0]!.chip.y).toBe(lines[1]!.chip.y)
  })

  it('膠囊一律夾在繪圖區內，貼著兩端的事件也不會被切掉', () => {
    const { plot } = scale
    for (const frame of [0, 750]) {
      const [line] = layoutEventLines([{ key: 'release', label: '出手', x: at(frame) }], scale)
      expect(line!.chip.x).toBeGreaterThanOrEqual(plot.x)
      expect(line!.chip.x + line!.chip.width).toBeLessThanOrEqual(plot.x + plot.width)
    }
  })

  it('文字座標落在膠囊正中央', () => {
    const [line] = layoutEventLines([{ key: 'leg_lift', label: '抬腿', x: at(300) }], scale)
    expect(line!.chip.textX).toBe(line!.chip.x + line!.chip.width / 2)
    expect(line!.chip.textY).toBe(line!.chip.y + line!.chip.height / 2)
  })

  it('沒有事件時回傳空陣列', () => {
    expect(layoutEventLines([], scale)).toEqual([])
  })
})

describe('frameAtX', () => {
  const scale = createChartScale({
    width: 960,
    height: 360,
    padding: PADDING,
    xDomain: [0, 750],
    yDomain: [-180, 180],
  })

  it('繪圖區兩端對應軸的頭尾', () => {
    expect(frameAtX(scale.plot.x, scale)).toBe(0)
    expect(frameAtX(scale.plot.x + scale.plot.width, scale)).toBe(750)
  })

  it('夾在軸範圍而不是資料範圍——交付只有 500 格時，游標仍走得到 750', () => {
    // 軸固定 750，交付不足的部分右邊留白，但游標要拖得過去；那段讀到
    // undefined 是預期的，由呼叫端顯示「—」。夾在資料末會讓那段變成死區。
    expect(frameAtX(scale.toX(600), scale)).toBe(600)
    expect(frameAtX(scale.plot.x + scale.plot.width + 200, scale)).toBe(750)
    expect(frameAtX(scale.plot.x - 200, scale)).toBe(0)
  })

  it('中間位置四捨五入到最近的影格', () => {
    expect(frameAtX(scale.toX(425), scale)).toBe(425)
  })
})

describe('layoutTooltip', () => {
  const scale = createChartScale({
    width: 960,
    height: 360,
    padding: PADDING,
    xDomain: [0, 750],
    yDomain: [-180, 180],
  })
  const rows = [
    { key: 'a', label: '肩膀外旋角度：', value: '25.3°' },
    { key: 'b', label: '前腳彎曲角度：', value: '-178.7°' },
  ]

  it('預設浮在游標右側', () => {
    const layout = layoutTooltip(rows, scale, scale.toX(100))
    expect(layout.x).toBeGreaterThan(scale.toX(100))
  })

  it('右邊塞不下就翻到游標左側，不會被繪圖區切掉', () => {
    const layout = layoutTooltip(rows, scale, scale.toX(740))
    expect(layout.x + layout.width).toBeLessThanOrEqual(scale.plot.x + scale.plot.width)
    expect(layout.x).toBeLessThan(scale.toX(740))
  })

  it('垂直方向一律夾在繪圖區內', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ key: `k${i}`, label: '軀幹前傾角度：', value: '-45.0°' }))
    const layout = layoutTooltip(many, scale, scale.toX(300))
    expect(layout.y).toBeGreaterThanOrEqual(scale.plot.y)
    expect(layout.y + layout.height).toBeLessThanOrEqual(scale.plot.y + scale.plot.height)
  })

  it('每列的色塊、標籤、數值座標依序排開，數值靠右對齊', () => {
    const layout = layoutTooltip(rows, scale, scale.toX(100))
    const [first, second] = layout.rows
    expect(first!.swatchX).toBeLessThan(first!.labelX)
    expect(first!.labelX).toBeLessThan(first!.valueX)
    expect(first!.valueX).toBe(layout.x + layout.width - 10)
    expect(second!.textY).toBeGreaterThan(first!.textY)
  })

  it('呼叫端多掛的欄位會原樣帶到每一列上', () => {
    const layout = layoutTooltip(rows, scale, scale.toX(100))
    expect(layout.rows.map(r => r.key)).toEqual(['a', 'b'])
  })

  it('寬度跟著最長的標籤與數值長出來', () => {
    const narrow = layoutTooltip([{ key: 'a', label: '短：', value: '1°' }], scale, scale.toX(100))
    expect(narrow.width).toBeLessThan(layoutTooltip(rows, scale, scale.toX(100)).width)
  })

  it('沒有列時不畫分隔線', () => {
    expect(layoutTooltip([], scale, scale.toX(100)).dividerY).toBeNull()
  })

  it('小三角指回游標那一側', () => {
    const right = layoutTooltip(rows, scale, scale.toX(100))
    expect(right.side).toBe('right')
    // 面板在右側，尖端要在面板左緣之外（更靠游標）
    expect(Number(right.tailPoints.split(',')[0])).toBeLessThan(right.x)

    const left = layoutTooltip(rows, scale, scale.toX(740))
    expect(left.side).toBe('left')
    expect(Number(left.tailPoints.split(',')[0])).toBeGreaterThan(left.x + left.width)
  })
})

const SAMPLE_PATH = 'public/samples/pose-metrics/biomech.json'

describe.skipIf(!existsSync(SAMPLE_PATH))('真實樣本的斷線行為', () => {
  const metrics = parseBiomech(JSON.parse(readFileSync(SAMPLE_PATH, 'utf8')) as RawBiomech)

  it('軀幹旋轉角恰好多出兩個環繞斷點', () => {
    const values = metrics.series.trunk_rotation!
    const withoutWrap = buildLineSegments(values, identity, { wraps: false })
    const withWrap = buildLineSegments(values, identity, { wraps: true })
    expect(withWrap.length - withoutWrap.length).toBe(2)
  })

  it('骨盆旋轉角同樣是兩個', () => {
    const values = metrics.series.pelvis_rotation!
    const withoutWrap = buildLineSegments(values, identity, { wraps: false })
    const withWrap = buildLineSegments(values, identity, { wraps: true })
    expect(withWrap.length - withoutWrap.length).toBe(2)
  })

  it('非環繞角的指標套用環繞規則也不會多斷——沒有超過閾值的跳變', () => {
    for (const key of ['elbow_flexion_angle', 'lead_knee_flexion', 'trunk_anterior_tilt'] as const) {
      const values = metrics.series[key]!
      expect(buildLineSegments(values, identity, { wraps: true })).toHaveLength(
        buildLineSegments(values, identity, { wraps: false }).length,
      )
    }
  })

  it('雙門檻把碎掉的曲線接回來：肩膀外旋 25 段變 5 段', () => {
    const values = metrics.series.shoulder_external_rotation_angle!
    expect(buildLineSegments(values, identity)).toHaveLength(25)
    expect(buildLineSegments(values, identity, {
      maxBridgeFrames: MAX_BRIDGE_FRAMES,
      maxBridgeDelta: MAX_BRIDGE_DELTA_DEG,
    })).toHaveLength(5)
  })

  it('踏地前後那個 86 度的缺口不會被接起來', () => {
    const values = metrics.series.shoulder_external_rotation_angle!
    const segments = buildLineSegments(values, identity, {
      maxBridgeFrames: MAX_BRIDGE_FRAMES,
      maxBridgeDelta: MAX_BRIDGE_DELTA_DEG,
    })
    // frame 603 是某段的結尾、614 是下一段的開頭，代表 604~613 沒被跨過去
    expect(segments.some(s => s.at(-1)!.x === 603)).toBe(true)
    expect(segments.some(s => s[0]!.x === 614)).toBe(true)
  })

  it('三條安靜的指標接完各剩一段', () => {
    for (const key of ['trunk_rotation', 'trunk_anterior_tilt', 'pelvis_rotation'] as const) {
      const values = metrics.series[key]!
      expect(buildLineSegments(values, identity, {
        wraps: metricInfo(key).wraps,
        maxBridgeFrames: MAX_BRIDGE_FRAMES,
        maxBridgeDelta: MAX_BRIDGE_DELTA_DEG,
      }).length).toBeLessThanOrEqual(3)
    }
  })
})

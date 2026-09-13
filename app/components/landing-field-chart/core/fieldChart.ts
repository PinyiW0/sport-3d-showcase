/**
 * 預測落點球場圖的幾何計算（渲染器無關，零 npm 依賴）。
 *
 * 座標系與規範第 1 節相同：原點本壘板尖端，+x 一壘方向，+y 中外野方向，單位公尺。
 * 球場邊界公式出處：演算法端 `frontend-render-guide.md` 第 4 節。
 * SVG 單位直接等於 1 公尺（與 pitch-distribution 的「SVG 單位 = 1cm」同一手法），
 * 橫縱共用同一個縮放比例，球場才不會被拉扁。
 */

/** 落點／場地上任一點，單位公尺 */
export interface LandingPoint {
  x: number
  y: number
}

/** 疊在圖上的其他事件落點：id 由呼叫端決定（例如事件索引），點選時原樣回傳 */
export interface FieldMarker extends LandingPoint {
  id: number
  /** 滑鼠提示與讀屏文字；不給就寫「事件 id」 */
  label?: string
}

// ---------------------------------------------------------------------------
// 球場邊界（規範公式，不可改動）
// ---------------------------------------------------------------------------

/** 界外線與外野弧的交點 x 座標；邊線距離 = 102 m */
export const FOUL_LINE_X = 72.125
/** 外野弧半徑 */
export const OUTFIELD_ARC_RADIUS = 77.088
/** 外野弧圓心 y 座標；中外野距離 = OUTFIELD_ARC_CENTER_Y + OUTFIELD_ARC_RADIUS = 122 m */
export const OUTFIELD_ARC_CENTER_Y = 44.912

/**
 * 外野弧線：`y = 44.912 + sqrt(77.088² − x²)`，定義域 `−72.125 ≤ x ≤ 72.125`。
 * 在 `x = ±72.125` 處與界外線 `y = |x|` 相接（浮點誤差 < 1e-3 m）。
 */
export function outfieldArcY(x: number): number {
  return OUTFIELD_ARC_CENTER_Y + Math.sqrt(OUTFIELD_ARC_RADIUS ** 2 - x ** 2)
}

/**
 * 外野弧的折線點（世界座標）。用折線而非 SVG arc 指令是因為翻轉 y 軸後
 * arc 的 sweep-flag 需另外推導，折線直接用同一個 toSvg 轉換即可，且夠密看不出差異。
 * 端點強制對齊 `outfieldArcY(±FOUL_LINE_X)`，不受步進誤差影響，確保與界外線精確相接。
 */
export function buildOutfieldArcPoints(stepM = 2): LandingPoint[] {
  const points: LandingPoint[] = [{ x: -FOUL_LINE_X, y: outfieldArcY(-FOUL_LINE_X) }]
  for (let x = -FOUL_LINE_X + stepM; x < FOUL_LINE_X; x += stepM)
    points.push({ x, y: outfieldArcY(x) })
  points.push({ x: FOUL_LINE_X, y: outfieldArcY(FOUL_LINE_X) })
  return points
}

/** 全場界線的封閉折線：本壘 → 三壘側界外點 → 外野弧 → 一壘側界外點（畫成 Z 封閉回本壘） */
export function buildFairTerritoryPoints(stepM = 2): LandingPoint[] {
  return [{ x: 0, y: 0 }, ...buildOutfieldArcPoints(stepM)]
}

// ---------------------------------------------------------------------------
// 裝飾（不是資料，showDecorations 關閉時不畫）
// ---------------------------------------------------------------------------

/**
 * 本壘為圓心的距離弧刻度。不畫 120 m：圍牆本身就是 102（邊線）～122 m（中外野）的距離參考，
 * 120 m 弧大半落在圍牆外，兩端還會超出預設視野被裁斷，標籤也跟著看不到。
 */
export const DISTANCE_RINGS_M = [30, 60, 90] as const

/**
 * 距離弧只畫界內那段：以本壘為圓心、半徑 r 的圓與兩條界外線
 * （45°／135°）之間的弧，對應世界角度 45°（一壘側）到 135°（三壘側）。
 */
export function buildDistanceRingPoints(radiusM: number, stepDeg = 5): LandingPoint[] {
  const points: LandingPoint[] = []
  for (let deg = 135; deg > 45; deg -= stepDeg) {
    const rad = (deg * Math.PI) / 180
    points.push({ x: radiusM * Math.cos(rad), y: radiusM * Math.sin(rad) })
  }
  points.push({ x: radiusM * Math.SQRT1_2, y: radiusM * Math.SQRT1_2 })
  return points
}

/** 壘間 27.431 m，內野菱形四頂點（本壘為圓心的等腰直角三角形排列） */
export const FIRST_BASE: LandingPoint = { x: 19.397, y: 19.397 }
export const SECOND_BASE: LandingPoint = { x: 0, y: 38.795 }
export const THIRD_BASE: LandingPoint = { x: -19.397, y: 19.397 }
/** 投手板中心點 */
export const PITCHERS_PLATE: LandingPoint = { x: 0, y: 18.44 }

// ---------------------------------------------------------------------------
// 視野
// ---------------------------------------------------------------------------

/** 預設視野（公尺），包住整個球場並留邊 */
export const DEFAULT_VIEW = { xMin: -80, xMax: 80, yMin: -10, yMax: 128 } as const
/** 落點在預設視野外時，擴大視野包住該點後再留的邊 */
export const VIEW_EXPAND_MARGIN_M = 8

export interface FieldViewport {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  /** 落點是否讓視野擴大超出預設範圍 */
  expanded: boolean
}

/**
 * 依落點決定視野。落點在預設視野內就用預設視野（切換事件時圖不跳動）；
 * 落點在外面（例：本壘後方）就照座標擴大到包住它，不 clamp、不判斷界內外。
 */
export function computeFieldViewport(landing: LandingPoint | null): FieldViewport {
  let { xMin, xMax, yMin, yMax } = DEFAULT_VIEW
  let expanded = false

  if (landing) {
    if (landing.x < xMin) {
      xMin = landing.x - VIEW_EXPAND_MARGIN_M
      expanded = true
    }
    if (landing.x > xMax) {
      xMax = landing.x + VIEW_EXPAND_MARGIN_M
      expanded = true
    }
    if (landing.y < yMin) {
      yMin = landing.y - VIEW_EXPAND_MARGIN_M
      expanded = true
    }
    if (landing.y > yMax) {
      yMax = landing.y + VIEW_EXPAND_MARGIN_M
      expanded = true
    }
  }

  return { xMin, xMax, yMin, yMax, expanded }
}

/** 點在不在視野內（含邊界）；視野外的其他事件不畫，也不為它們擴大視野 */
export function isInViewport(viewport: FieldViewport, point: LandingPoint): boolean {
  return point.x >= viewport.xMin && point.x <= viewport.xMax && point.y >= viewport.yMin && point.y <= viewport.yMax
}

export interface FieldScale {
  viewport: FieldViewport
  /** viewBox 寬高（公尺，即 SVG 單位） */
  viewWidth: number
  viewHeight: number
  /** 世界座標 → SVG 座標（y 軸翻轉：+y 越大畫面越上面） */
  toSvg: (x: number, y: number) => { x: number, y: number }
}

export function createFieldScale(viewport: FieldViewport): FieldScale {
  const viewWidth = viewport.xMax - viewport.xMin
  const viewHeight = viewport.yMax - viewport.yMin
  return {
    viewport,
    viewWidth,
    viewHeight,
    toSvg: (x, y) => ({ x: x - viewport.xMin, y: viewport.yMax - y }),
  }
}

/** 折線點陣列 → SVG path `d`；close 為 true 時補 `Z` 封閉（供填色用） */
export function toPathData(scale: FieldScale, points: readonly LandingPoint[], close = false): string {
  if (points.length === 0)
    return ''
  const svgPoints = points.map(p => scale.toSvg(p.x, p.y))
  const [first, ...rest] = svgPoints
  const segments = rest.map(p => `L${p.x},${p.y}`).join(' ')
  return `M${first!.x},${first!.y}${segments ? ` ${segments}` : ''}${close ? ' Z' : ''}`
}

/**
 * 數字轉顯示字串：負號換成 Unicode 減號（U+2212），原樣顯示不四捨五入。
 * 與 `bpe-data/core/format.ts` 的 `formatNumber` 規則相同，但本模組不依賴
 * bpe-data（可攜性約束），在此地端重寫一份同規則的版本。
 */
export function formatFieldNumber(value: number): string {
  return String(value).replace('-', '−')
}

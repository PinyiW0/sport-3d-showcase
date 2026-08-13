/**
 * 投球軌跡的資料解析、場地幾何與配色——**渲染器無關**。
 *
 * Three.js 版（pitch-trajectory）與 Plotly 版（pitch-trajectory-plotly）都吃這一份，
 * 形狀與顏色不會分岔。要哪一版就整包搬那個資料夾，再加上這個 -data 資料夾。
 *
 * 流程：
 * 1. parsePitchTrajectory()   — 從後端 analysis_result.json 取出軌跡點(cm)
 * 2. buildStrikeZoneCorners() — 由打者身高算出九宮格四個角(JSON 沒有提供框)
 * 3. buildStrikeZoneLines()   — 四個角 → 外框與內部分隔線
 *    buildHomePlateGeometry() — 本壘板立體頂點與面索引(尺寸為固定常數,不需外部資料)
 * 4. computeTrajectoryRange() — 依軌跡資料動態算出座標軸範圍
 *
 * 座標系(單位皆為 cm):x = 左右(捕手視角)、y = 投手方向距離、z = 高度
 * 完整定義見 spec/domain/baseball-field-coordinates.md
 */

import { getStrikeZone, HOME_PLATE, HOME_PLATE_POINTS } from '../../baseball-field/core/fieldGeometry'

export type Point3D = [number, number, number]

/**
 * 三軸範圍 [min, max]，單位 cm。
 * 這裡自己定義而非從 scene3d 引入——資料層要能被 Plotly 版單獨帶走，
 * 不該相依任何 three 專用的東西。與 scene3d 的同名型別結構相同、可直接互通。
 */
export interface Range3 { x: [number, number], y: [number, number], z: [number, number] }

/** analysis_result.json 中畫 3D 圖會用到的欄位(其餘欄位忽略) */
export interface PitchAnalysisResult {
  /** 拟合後的軌跡點 [x, y, z](cm),最後一點即入壘點 strike_zone_point */
  pitch_trajectory: number[][]
  /** 入壘點 [x, y, z](cm),落在本壘板中線的 y 平面上 */
  strike_zone_point: number[]
  /** 球速(km/h),部分資料為 null */
  pitch_velocity?: number | null
}

/** 本壘板半寬(cm)。場地幾何的單一來源見 baseball-field/core/fieldGeometry.ts */
export const PLATE_HALF_WIDTH_CM = HOME_PLATE.halfWidth

/** 本壘板頂面五個點(cm),尖端朝捕手(y=0),前緣在 y=43.18 */
const HOME_PLATE_TOP: Point3D[] = HOME_PLATE_POINTS.map(([x, y]) => [x, y, 0] as Point3D)

/**
 * 配色:暗色主題——
 * 純黑畫布配琥珀黃軌跡,深紅入壘點,白色九宮格與軸線。
 * 改主題只需動這一組常數(兩個渲染器讀同一組)。
 */
export const CHART_THEME = {
  /** 圖表外框底色 */
  paper: '#000000',
  /** 繪圖區底色 */
  plot: '#181818',
  /** 軸面底色:x/z 深、y(進壘深度)稍亮以區分前後 */
  axisBackground: { x: '#1a1a1a', y: '#282828', z: '#1a1a1a' },
  /** 軸標題、刻度文字 */
  axisText: '#ffffff',
  /** 軸格線 */
  grid: '#444444',
  /** 軌跡線與出手點 */
  trajectory: '#FFC107',
  /** 入壘點 */
  landing: '#A40C17',
  /** 九宮格與本壘板 */
  strikeZone: 'white',
  homePlate: 'gray',
} as const

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** 產生 start 到 end 之間等距的 count 個值(含頭尾) */
function linspace(start: number, end: number, count: number): number[] {
  const step = (end - start) / (count - 1)
  return Array.from({ length: count }, (_, i) => start + step * i)
}

/**
 * 步驟 1:從 analysis_result.json 取出可用的軌跡點。
 * 逐筆過濾格式不符的資料(需為至少 3 個有限數值的陣列),多餘欄位捨棄。
 */
export function parsePitchTrajectory(result: Pick<PitchAnalysisResult, 'pitch_trajectory'>): Point3D[] {
  if (!Array.isArray(result.pitch_trajectory)) {
    return []
  }
  return result.pitch_trajectory
    .filter(pt => Array.isArray(pt) && pt.length >= 3 && pt.slice(0, 3).every(isFiniteNumber))
    .map(pt => [pt[0]!, pt[1]!, pt[2]!])
}

/**
 * 步驟 2:由打者身高算出九宮格四個角,順序為 左上 → 右上 → 右下 → 左下。
 * @param batterHeightCm - 打者身高(cm)
 * @param yPlaneCm - 九宮格所在的 y 平面(cm),通常取入壘點的 y(軌跡最後一點)
 */
export function buildStrikeZoneCorners(
  batterHeightCm: number,
  yPlaneCm: number,
): [Point3D, Point3D, Point3D, Point3D] {
  const { left, right, top, bottom } = getStrikeZone(batterHeightCm)
  return [
    [left, yPlaneCm, top],
    [right, yPlaneCm, top],
    [right, yPlaneCm, bottom],
    [left, yPlaneCm, bottom],
  ]
}

/** 本壘板的立體幾何：10 個頂點（頂面 0-4、底面 5-9）與三角面索引。 */
export interface HomePlateGeometry {
  vertices: Point3D[]
  faces: number[][]
}

/**
 * 本壘板立體幾何。
 * 由頂面五個點自動生成底面與側面。Plotly 版轉成 mesh3d 的 x/y/z/i/j/k，
 * three 版直接餵 BufferGeometry——兩邊共用這一份計算，形狀不會分岔。
 * @param thicknessCm - 本壘板厚度(cm),往 -z 方向長,頂面貼齊地面 z=0
 */
export function buildHomePlateGeometry(thicknessCm = 3): HomePlateGeometry {
  const top = HOME_PLATE_TOP
  const bottom = top.map(([x, y, z]) => [x, y, z - thicknessCm] as Point3D)
  const vertices = [...top, ...bottom]
  // 五邊形以頂點 0 為扇形中心切成三角形;側面每邊兩個三角形。
  // HOME_PLATE_POINTS 在 XY 平面是順時針,扇形得反序切頂面法線才朝 +z——
  // 照原序切會全部朝 -z,three 版 FrontSide 材質會把頂面剔除,板子從上方看是穿透的。
  const topFaces: [number, number, number][] = [[0, 2, 1], [0, 3, 2], [0, 4, 3]]
  // 底面朝 -z,相對頂面再反一次繞向
  const bottomFaces = topFaces.map(([a, b, c]) => [a + 5, c + 5, b + 5])
  const sideFaces = top.flatMap((_, i) => {
    const next = (i + 1) % top.length
    return [[i, next, next + 5], [i, next + 5, i + 5]]
  })
  return { vertices, faces: [...topFaces, ...bottomFaces, ...sideFaces] }
}

/** 九宮格的線段。 */
export interface StrikeZoneLines {
  /** 外框閉合路徑，5 點（首尾相同）。 */
  outline: Point3D[]
  /** 內部分隔線，每條一組起訖點；共 4 條（2 直 2 橫）。 */
  grid: Array<[Point3D, Point3D]>
}

/**
 * 由四個角切出外框與內部分隔線。
 * 內線只取中間兩條（索引 1、2），外圍由 outline 負責。
 */
export function buildStrikeZoneLines(
  corners: [Point3D, Point3D, Point3D, Point3D],
): StrikeZoneLines {
  const [topLeft, topRight, bottomRight] = corners
  const yPlane = topLeft[1]
  const xLines = linspace(topLeft[0], topRight[0], 4)
  const zLines = linspace(topLeft[2], bottomRight[2], 4)
  const [xLeft, xRight] = [xLines[0]!, xLines[3]!]
  const [zTop, zBottom] = [zLines[0]!, zLines[3]!]

  const outline: Point3D[] = [
    [xLeft, yPlane, zTop],
    [xRight, yPlane, zTop],
    [xRight, yPlane, zBottom],
    [xLeft, yPlane, zBottom],
    [xLeft, yPlane, zTop],
  ]
  const grid: Array<[Point3D, Point3D]> = [
    ...xLines.slice(1, 3).map(x => [
      [x, yPlane, zTop],
      [x, yPlane, zBottom],
    ] as [Point3D, Point3D]),
    ...zLines.slice(1, 3).map(z => [
      [xLeft, yPlane, z],
      [xRight, yPlane, z],
    ] as [Point3D, Point3D]),
  ]
  return { outline, grid }
}

/**
 * 軸範圍：取整到 100cm，並保底涵蓋本壘板與九宮格。
 * 保底值（x ±150、y 600、z 180）確保軌跡再短也框得住場地元素。
 */
export function computeTrajectoryRange(points: Point3D[]): Range3 {
  const roundUpTo = (value: number, step: number) => Math.ceil(value / step) * step
  const maxAbsX = Math.max(150, ...points.map(p => Math.abs(p[0])))
  const maxY = Math.max(600, ...points.map(p => p[1]))
  const maxZ = Math.max(180, ...points.map(p => p[2]))
  return {
    x: [-roundUpTo(maxAbsX + 20, 100), roundUpTo(maxAbsX + 20, 100)],
    y: [-100, roundUpTo(maxY + 50, 100)],
    z: [0, roundUpTo(maxZ + 20, 100)],
  }
}

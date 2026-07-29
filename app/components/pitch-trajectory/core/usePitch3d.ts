/**
 * 3D 投球軌跡模組(獨立實作,不依賴 useBaseball3d.ts)
 *
 * 實作流程:
 * 1. parsePitchTrajectory()   — 從後端 analysis_result.json 取出軌跡點(cm)
 * 2. buildStrikeZoneCorners() — 由打者身高算出九宮格四個角(JSON 沒有提供框)
 * 3. createTrajectoryTraces() — 軌跡線 + 出手點 + 入壘點
 *    createHomePlateTrace()   — 本壘板立體 mesh(尺寸為固定常數,不需外部資料)
 *    createStrikeZoneTraces() — 九宮格外框 + 內部分隔線
 * 4. createChartLayout()      — 依軌跡資料動態算出座標軸範圍與等比例 aspect
 *
 * 座標系(單位皆為 cm):x = 左右(捕手視角)、y = 投手方向距離、z = 高度
 */

export type Point3D = [number, number, number]

/** analysis_result.json 中畫 3D 圖會用到的欄位(其餘欄位忽略) */
export interface PitchAnalysisResult {
  /** 拟合後的軌跡點 [x, y, z](cm),最後一點即入壘點 strike_zone_point */
  pitch_trajectory: number[][]
  /** 入壘點 [x, y, z](cm),落在本壘板中線的 y 平面上 */
  strike_zone_point: number[]
  /** 球速(km/h),部分資料為 null */
  pitch_velocity?: number | null
}

/** 本壘板半寬(cm),MLB 規格 17 吋 = 43.18cm */
export const PLATE_HALF_WIDTH_CM = 21.59
/**
 * 好球帶上緣 ≈ 身高 × 0.535(與 2D 落點圖 useStrikeZoneScale 同一比例)。
 * 不 export:避免與 useStrikeZoneScale 的同名常數在 Nuxt auto-import 撞名
 */
const SZ_TOP_RATIO = 0.535
/** 好球帶下緣 ≈ 身高 × 0.27 */
const SZ_BOT_RATIO = 0.27

/** 本壘板頂面五個點(cm),尖端朝捕手(y=0),前緣在 y=43.18 */
const HOME_PLATE_TOP: Point3D[] = [
  [0, 0, 0],
  [-PLATE_HALF_WIDTH_CM, PLATE_HALF_WIDTH_CM, 0],
  [-PLATE_HALF_WIDTH_CM, PLATE_HALF_WIDTH_CM * 2, 0],
  [PLATE_HALF_WIDTH_CM, PLATE_HALF_WIDTH_CM * 2, 0],
  [PLATE_HALF_WIDTH_CM, PLATE_HALF_WIDTH_CM, 0],
]

/** aspectratio 的換算基準:每 200cm 對應 1 個視覺單位 */
const CM_PER_ASPECT_UNIT = 200

/**
 * 配色:沿用 internal-project-b(內部系統)的暗色主題——
 * 純黑畫布配琥珀黃軌跡,深紅入壘點,白色九宮格與軸線。
 * 改主題只需動這一組常數。
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
  const zTop = SZ_TOP_RATIO * batterHeightCm
  const zBottom = SZ_BOT_RATIO * batterHeightCm
  return [
    [-PLATE_HALF_WIDTH_CM, yPlaneCm, zTop],
    [PLATE_HALF_WIDTH_CM, yPlaneCm, zTop],
    [PLATE_HALF_WIDTH_CM, yPlaneCm, zBottom],
    [-PLATE_HALF_WIDTH_CM, yPlaneCm, zBottom],
  ]
}

/**
 * 步驟 3a:軌跡 traces。
 * @returns [軌跡線, 出手點標記, 入壘點標記]
 */
export function createTrajectoryTraces(points: Point3D[]) {
  const x = points.map(p => p[0])
  const y = points.map(p => p[1])
  const z = points.map(p => p[2])
  const line = {
    type: 'scatter3d',
    mode: 'lines+markers',
    x,
    y,
    z,
    name: '球的軌跡',
    line: { width: 2, color: CHART_THEME.trajectory },
    marker: { size: 2, color: CHART_THEME.trajectory },
  }
  const startMarker = {
    type: 'scatter3d',
    mode: 'markers',
    x: [x[0]],
    y: [y[0]],
    z: [z[0]],
    name: '出手點',
    marker: { size: 2, color: CHART_THEME.trajectory },
  }
  const endMarker = {
    type: 'scatter3d',
    mode: 'markers',
    x: [x.at(-1)],
    y: [y.at(-1)],
    z: [z.at(-1)],
    name: '入壘點',
    marker: { size: 4, color: CHART_THEME.landing },
  }
  return [line, startMarker, endMarker] as const
}

/**
 * 步驟 3b:本壘板 mesh3d。
 * 由頂面五個點自動生成底面與側面;頂點索引 0-4 為頂面、5-9 為底面。
 * @param thicknessCm - 本壘板厚度(cm),往 -z 方向長,頂面貼齊地面 z=0
 */
export function createHomePlateTrace(thicknessCm = 3) {
  const top = HOME_PLATE_TOP
  const bottom = top.map(([x, y, z]) => [x, y, z - thicknessCm] as Point3D)
  const vertices = [...top, ...bottom]
  // 五邊形以頂點 0 為扇形中心切成三角形;側面每邊兩個三角形
  const topFaces = [[0, 1, 2], [0, 2, 3], [0, 3, 4]]
  const bottomFaces = topFaces.map(face => face.map(i => i + 5))
  const sideFaces = top.flatMap((_, i) => {
    const next = (i + 1) % top.length
    return [[i, next, next + 5], [i, next + 5, i + 5]]
  })
  const faces = [...topFaces, ...bottomFaces, ...sideFaces]

  return {
    type: 'mesh3d',
    x: vertices.map(v => v[0]),
    y: vertices.map(v => v[1]),
    z: vertices.map(v => v[2]),
    i: faces.map(f => f[0]),
    j: faces.map(f => f[1]),
    k: faces.map(f => f[2]),
    color: CHART_THEME.homePlate,
    opacity: 1,
    flatshading: true,
    name: '本壘板',
  }
}

/**
 * 步驟 3c:九宮格 traces。
 * 用四個角切出 4 條直線 × 4 條橫線(外框粗、內線細),
 * 每條線段間以 null 斷開,Plotly 會自動分段。
 * @returns [外框, 內部分隔線]
 */
export function createStrikeZoneTraces(corners: [Point3D, Point3D, Point3D, Point3D]) {
  const [topLeft, topRight, bottomRight] = corners
  const yPlane = topLeft[1]
  const xLines = linspace(topLeft[0], topRight[0], 4)
  const zLines = linspace(topLeft[2], bottomRight[2], 4)
  const [xLeft, xRight] = [xLines[0]!, xLines[3]!]
  const [zTop, zBottom] = [zLines[0]!, zLines[3]!]

  const outline = {
    type: 'scatter3d',
    mode: 'lines',
    x: [xLeft, xRight, xRight, xLeft, xLeft],
    y: Array.from({ length: 5 }).fill(yPlane),
    z: [zTop, zTop, zBottom, zBottom, zTop],
    name: '九宮格外框',
    line: { color: CHART_THEME.strikeZone, width: 3 },
    showlegend: false,
  }

  // 內線只取中間兩條(索引 1、2),外圍由 outline 負責
  const gridX: (number | null)[] = []
  const gridY: (number | null)[] = []
  const gridZ: (number | null)[] = []
  for (const xInner of xLines.slice(1, 3)) {
    gridX.push(xInner, xInner, null)
    gridY.push(yPlane, yPlane, null)
    gridZ.push(zTop, zBottom, null)
  }
  for (const zInner of zLines.slice(1, 3)) {
    gridX.push(xLeft, xRight, null)
    gridY.push(yPlane, yPlane, null)
    gridZ.push(zInner, zInner, null)
  }
  const gridLines = {
    type: 'scatter3d',
    mode: 'lines',
    x: gridX,
    y: gridY,
    z: gridZ,
    name: '九宮格分隔線',
    line: { color: CHART_THEME.strikeZone, width: 1.5 },
    showlegend: false,
  }
  return [outline, gridLines] as const
}

/**
 * 步驟 4:依軌跡資料動態算出 layout。
 * - 軸範圍取整到 100cm,並保底涵蓋本壘板與九宮格
 * - aspectratio 依實際範圍等比例換算,1cm 在三軸的視覺長度一致(空間不變形)
 * - 相機位置隨 aspect 等比拉遠,確保完整軌跡在視野內
 */
export interface ChartLayoutOptions {
  width?: number
  height?: number
  /**
   * Camera distance multiplier. 1 = the framing that just fits the trajectory;
   * >1 pulls further back (see more), <1 moves closer (zoom in). Default 1.
   */
  zoom?: number
  /** Full camera-eye override (in aspect units) for a custom default angle. */
  cameraEye?: { x: number, y: number, z: number }
}

export function createChartLayout(points: Point3D[], options: ChartLayoutOptions = {}) {
  const { width = 640, height = 480, zoom = 1, cameraEye } = options
  const roundUpTo = (value: number, step: number) => Math.ceil(value / step) * step
  const maxAbsX = Math.max(150, ...points.map(p => Math.abs(p[0])))
  const maxY = Math.max(600, ...points.map(p => p[1]))
  const maxZ = Math.max(180, ...points.map(p => p[2]))
  const range = {
    x: [-roundUpTo(maxAbsX + 20, 100), roundUpTo(maxAbsX + 20, 100)],
    y: [-100, roundUpTo(maxY + 50, 100)],
    z: [0, roundUpTo(maxZ + 20, 100)],
  }
  const aspect = {
    x: (range.x[1]! - range.x[0]!) / CM_PER_ASPECT_UNIT,
    y: (range.y[1]! - range.y[0]!) / CM_PER_ASPECT_UNIT,
    z: (range.z[1]! - range.z[0]!) / CM_PER_ASPECT_UNIT,
  }
  const axis = (title: string, range: number[], backgroundcolor: string) => ({
    title,
    range,
    backgroundcolor,
    color: CHART_THEME.axisText,
    gridcolor: CHART_THEME.grid,
    showbackground: true,
    tickfont: { color: CHART_THEME.axisText, size: 10 },
  })

  return {
    autosize: false,
    width,
    height,
    paper_bgcolor: CHART_THEME.paper,
    plot_bgcolor: CHART_THEME.plot,
    margin: { l: 0, r: 0, b: 30, t: 10, pad: 0 },
    legend: { x: 0, y: 1, font: { color: CHART_THEME.axisText, size: 12 } },
    scene: {
      aspectmode: 'manual',
      aspectratio: aspect,
      camera: {
        // 從本壘板後方、略高於打者的位置往投手方向看:z(高度)在左、y(進壘
        // 深度)往右延伸,完整拋物線斜向入鏡。距離隨場景等比縮放並乘上 zoom。
        eye: cameraEye ?? {
          x: aspect.x * 1.4 * zoom,
          y: -aspect.y * 1.1 * zoom,
          z: aspect.z * 0.5 * zoom,
        },
        center: { x: 0, y: 0, z: 0 },
        up: { x: 0, y: 0, z: 1 },
      },
      xaxis: axis('X (cm)', range.x, CHART_THEME.axisBackground.x),
      yaxis: axis('Y (cm)', range.y, CHART_THEME.axisBackground.y),
      zaxis: axis('Z (cm)', range.z, CHART_THEME.axisBackground.z),
    },
  }
}

export function usePitch3D() {
  return {
    parsePitchTrajectory,
    buildStrikeZoneCorners,
    createTrajectoryTraces,
    createHomePlateTrace,
    createStrikeZoneTraces,
    createChartLayout,
  }
}

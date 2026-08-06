/**
 * Plotly 版軌跡圖的 traces 與 layout 建構（純函式，無 DOM）。
 *
 * 這是遷移到 Three.js 之前的實作，保留作為對照版。幾何與配色一律取自
 * `pitch-trajectory-data`，與 Three.js 版共用同一份計算，兩版形狀不會分岔。
 */
import type { Point3D, Range3 } from '../../pitch-trajectory-data/core/trajectoryGeometry'
import {
  buildHomePlateGeometry,
  buildStrikeZoneLines,
  CHART_THEME,
  computeTrajectoryRange,
} from '../../pitch-trajectory-data/core/trajectoryGeometry'

/**
 * aspectratio 的換算基準：每 200cm 對應 1 個視覺單位。
 * Plotly 的 gl3d 空間是無單位的，不做這個換算三軸比例就會失真
 * （Three.js 版不需要——世界單位直接就是 cm）。
 */
const CM_PER_ASPECT_UNIT = 200

/**
 * 軌跡 traces。
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
 * 本壘板 mesh3d。頂點索引 0-4 為頂面、5-9 為底面。
 * @param thicknessCm - 本壘板厚度(cm)
 */
export function createHomePlateTrace(thicknessCm = 3) {
  const { vertices, faces } = buildHomePlateGeometry(thicknessCm)

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
 * 九宮格 traces。外框粗、內線細,每條線段間以 null 斷開,Plotly 會自動分段。
 * @returns [外框, 內部分隔線]
 */
export function createStrikeZoneTraces(corners: [Point3D, Point3D, Point3D, Point3D]) {
  const { outline, grid } = buildStrikeZoneLines(corners)

  const outlineTrace = {
    type: 'scatter3d',
    mode: 'lines',
    x: outline.map(p => p[0]),
    y: outline.map(p => p[1]),
    z: outline.map(p => p[2]),
    name: '九宮格外框',
    line: { color: CHART_THEME.strikeZone, width: 3 },
    showlegend: false,
  }

  const gridX: (number | null)[] = []
  const gridY: (number | null)[] = []
  const gridZ: (number | null)[] = []
  for (const [a, b] of grid) {
    gridX.push(a[0], b[0], null)
    gridY.push(a[1], b[1], null)
    gridZ.push(a[2], b[2], null)
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
  return [outlineTrace, gridLines] as const
}

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

/**
 * 依軌跡資料動態算出 layout。
 * - 軸範圍取自資料層的 computeTrajectoryRange()
 * - aspectratio 依實際範圍等比例換算,1cm 在三軸的視覺長度一致(空間不變形)
 * - 相機位置隨 aspect 等比拉遠,確保完整軌跡在視野內
 */
export function createChartLayout(points: Point3D[], options: ChartLayoutOptions = {}) {
  const { width = 640, height = 480, zoom = 1, cameraEye } = options
  const range: Range3 = computeTrajectoryRange(points)
  const aspect = {
    x: (range.x[1] - range.x[0]) / CM_PER_ASPECT_UNIT,
    y: (range.y[1] - range.y[0]) / CM_PER_ASPECT_UNIT,
    z: (range.z[1] - range.z[0]) / CM_PER_ASPECT_UNIT,
  }
  const axis = (title: string, axisRange: number[], backgroundcolor: string) => ({
    title,
    range: axisRange,
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
    createTrajectoryTraces,
    createHomePlateTrace,
    createStrikeZoneTraces,
    createChartLayout,
  }
}

/**
 * Plotly 版骨架的 traces 與 layout 建構（純函式，無 DOM）。
 *
 * 這是遷移到 Three.js 之前的實作，保留作為對照版。軸範圍改用資料層的
 * `computeSkeletonBounds()`，與 Three.js 版共用同一份計算，兩版讀數不會分岔。
 */
import type { Pose3dFrame } from '../../pitch-pose-data/core/parsePitchOutcome'
import type { Range3 } from '../../pitch-pose-data/core/skeletonBounds'
import { COCO_KEYPOINT_NAMES, SKELETON_EDGES } from '../../pitch-pose-data/core/types'

/** 深色畫布的配色，對齊 pitch-trajectory 的 CHART_THEME。 */
export const DARK_THEME = {
  paper: '#000000',
  plot: '#181818',
  axisBackground: '#1a1a1a',
  axisText: '#ffffff',
  grid: '#444444',
} as const

/**
 * aspectratio 的換算基準：每 200cm 對應 1 個視覺單位。
 * Plotly 的 gl3d 空間是無單位的，不做這個換算三軸比例就會失真
 * （Three.js 版不需要——世界單位直接就是 cm）。
 */
const CM_PER_ASPECT_UNIT = 200

/** 由軸範圍換算固定的 aspectratio。 */
export function computeAspect(range: Range3): { x: number, y: number, z: number } {
  return {
    x: (range.x[1] - range.x[0]) / CM_PER_ASPECT_UNIT,
    y: (range.y[1] - range.y[0]) / CM_PER_ASPECT_UNIT,
    z: (range.z[1] - range.z[0]) / CM_PER_ASPECT_UNIT,
  }
}

/**
 * 一幀骨架的三條 trace。
 * 第一條是隱形 anchor：釘住 bounding box 對角，即使 autorange 介入空間也不變。
 */
export function buildTraces(frame: Pose3dFrame | null, range: Range3, color: string) {
  const lineX: Array<number | null> = []
  const lineY: Array<number | null> = []
  const lineZ: Array<number | null> = []
  const markerX: number[] = []
  const markerY: number[] = []
  const markerZ: number[] = []
  const markerNames: string[] = []

  if (frame) {
    for (const [a, b] of SKELETON_EDGES) {
      const pa = frame.points[a]
      const pb = frame.points[b]
      if (!pa || !pb)
        continue
      // null 分段：一條 trace 畫完所有骨頭
      lineX.push(pa[0], pb[0], null)
      lineY.push(pa[1], pb[1], null)
      lineZ.push(pa[2], pb[2], null)
    }
    frame.points.forEach((point, id) => {
      if (!point)
        return
      markerX.push(point[0])
      markerY.push(point[1])
      markerZ.push(point[2])
      markerNames.push(COCO_KEYPOINT_NAMES[id]!)
    })
  }

  return [
    {
      type: 'scatter3d',
      mode: 'markers',
      x: [range.x[0], range.x[1]],
      y: [range.y[0], range.y[1]],
      z: [range.z[0], range.z[1]],
      marker: { size: 1, opacity: 0 },
      hoverinfo: 'skip',
    },
    {
      type: 'scatter3d',
      mode: 'lines',
      x: lineX,
      y: lineY,
      z: lineZ,
      line: { color, width: 6 },
      hoverinfo: 'skip',
    },
    {
      type: 'scatter3d',
      mode: 'markers',
      x: markerX,
      y: markerY,
      z: markerZ,
      marker: { color: '#ffffff', size: 3.5, line: { color, width: 1 } },
      text: markerNames,
      hoverinfo: 'text',
    },
  ]
}

export interface LayoutOptions {
  height: number
  dark: boolean
  /** gl3d 當下的相機；null 時用預設視角（三壘側斜上方）。 */
  camera: unknown | null
}

export function buildLayout(range: Range3, opts: LayoutOptions) {
  const aspect = computeAspect(range)
  // 深色時軸面、格線與文字一起翻深；淺色維持 Plotly 預設（不傳值）
  const axis = (title: string, axisRange: readonly number[]) => ({
    title: { text: title },
    range: axisRange,
    ...(opts.dark
      ? {
          backgroundcolor: DARK_THEME.axisBackground,
          showbackground: true,
          gridcolor: DARK_THEME.grid,
          zerolinecolor: DARK_THEME.grid,
          color: DARK_THEME.axisText,
        }
      : {}),
  })

  return {
    height: opts.height,
    margin: { l: 0, r: 0, t: 0, b: 0 },
    showlegend: false,
    ...(opts.dark ? { paper_bgcolor: DARK_THEME.paper, plot_bgcolor: DARK_THEME.plot } : {}),
    // 固定值 → Plotly.react 重畫時保留使用者旋轉 / 縮放的視角
    uirevision: 'pose3d-skeleton',
    scene: {
      // manual + 固定 aspectratio：空間比例由整段動作決定，不隨當下 frame 適配
      aspectmode: 'manual',
      aspectratio: aspect,
      xaxis: axis('x (cm)', range.x),
      yaxis: axis('y (cm)', range.y),
      zaxis: axis('z (cm)', range.z),
      // 初次渲染用預設視角（三壘側斜上方，距離隨場景大小等比縮放），
      // 之後一律沿用使用者當下的視角
      camera: opts.camera ?? {
        eye: { x: aspect.x * 2.4, y: -aspect.y * 1.8, z: aspect.z * 0.9 },
        center: { x: 0, y: 0, z: 0 },
        up: { x: 0, y: 0, z: 1 },
      },
    },
  }
}

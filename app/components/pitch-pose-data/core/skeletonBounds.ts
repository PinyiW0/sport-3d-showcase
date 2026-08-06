/**
 * 骨架的立體空間定義（純計算，無 DOM）。
 *
 * 空間由「整段動作」決定、播放中永不重算——若跟著當下 frame 的資料範圍適配，
 * 骨架每格的大小會逐幀改變，整個空間看起來像在「呼吸」。這是已知地雷。
 */
import type { Pose3dFrame } from './parsePitchOutcome'

/**
 * 三軸範圍 [min, max]，單位 cm。
 * 這裡自己定義而非從 scene3d 引入——資料層要能被 Plotly 版單獨帶走，
 * 不該相依任何 three 專用的東西。與 scene3d 的同名型別結構相同、可直接互通。
 */
export interface Range3 { x: [number, number], y: [number, number], z: [number, number] }

/** 資料範圍外推的留白（cm）。 */
const PAD_CM = 15
/** 範圍圓整的格子大小（cm），讓軸端點落在整數上。 */
const STEP_CM = 10

/**
 * 掃描所有 frame 的所有 keypoint，算出涵蓋整段動作的軸範圍。
 * 資料全缺時回傳 0~100cm 的預設方盒，避免下游拿到 Infinity。
 */
export function computeSkeletonBounds(frames: readonly Pose3dFrame[]): Range3 {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]

  for (const frame of frames) {
    for (const point of frame.points) {
      if (!point)
        continue
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis]!, point[axis]!)
        max[axis] = Math.max(max[axis]!, point[axis]!)
      }
    }
  }

  if (!Number.isFinite(min[0]!)) {
    return { x: [0, 100], y: [0, 100], z: [0, 100] }
  }

  const floorTo = (v: number) => Math.floor(v / STEP_CM) * STEP_CM
  const ceilTo = (v: number) => Math.ceil(v / STEP_CM) * STEP_CM

  return {
    x: [floorTo(min[0]! - PAD_CM), ceilTo(max[0]! + PAD_CM)],
    y: [floorTo(min[1]! - PAD_CM), ceilTo(max[1]! + PAD_CM)],
    // 地面（z=0）保留在畫面內，骨架高度才有參照
    z: [Math.min(0, floorTo(min[2]!)), ceilTo(max[2]! + PAD_CM)],
  }
}

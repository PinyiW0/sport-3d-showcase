/**
 * 球體拖尾取樣（純函式，無 three 依賴）。
 *
 * 規範第 2.4 節：固定 20 顆球的物件池，顯示第 i 幀時第 age 顆取
 * `frames[i - age].ball`（age 0～19）。只看目標幀往前數的時間視窗，
 * 缺值或負索引就隱藏該顆，不往更早的幀找補——拖尾只由「目標幀」決定，
 * 不累積歷史，播放、拖曳、逐幀、跳至擊球、循環回開頭都自然正確。
 */
import type { BpeFrame, BpePoint3 } from '../../bpe-data/core/types'

/** 拖尾顆數，固定 20 顆物件池（規範 2.4）。 */
export const BALL_TRAIL_LENGTH = 20

/**
 * 拖尾球的幾何半徑（cm）。顯示設定，不是量測值——
 * 實際顯示半徑再乘上 age 對應的 scale（見 {@link BallTrailSample.scale}）。
 */
export const BALL_TRAIL_RADIUS_CM = 3.7

/** 最舊那顆的縮放下限。顯示設定，不是量測值。 */
export const BALL_TRAIL_MIN_SCALE = 0.2

export interface BallTrailSample {
  /** 世界座標；null 表示這一齡的球這一幀不顯示。 */
  point: BpePoint3 | null
  /** mesh scale：0.2 + 0.8 × freshness，套在 {@link BALL_TRAIL_RADIUS_CM} 上。 */
  scale: number
  /** 透明度：0.15 + 0.85 × freshness。 */
  opacity: number
}

/**
 * 顯示第 `targetFrame` 幀時，20 顆拖尾球（age 0～19）各自該取哪個座標。
 * age 0 是當前幀本身（freshness 1，最大且不透明）。
 */
export function sampleBallTrail(frames: readonly BpeFrame[], targetFrame: number): BallTrailSample[] {
  return Array.from({ length: BALL_TRAIL_LENGTH }, (_, age) => {
    const freshness = 1 - age / (BALL_TRAIL_LENGTH - 1)
    const sourceIndex = targetFrame - age
    const point = sourceIndex >= 0 ? (frames[sourceIndex]?.ball ?? null) : null
    return {
      point,
      scale: BALL_TRAIL_MIN_SCALE + (1 - BALL_TRAIL_MIN_SCALE) * freshness,
      opacity: 0.15 + 0.85 * freshness,
    }
  })
}

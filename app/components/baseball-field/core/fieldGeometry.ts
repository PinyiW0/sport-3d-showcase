/**
 * 棒球場地座標系與好球帶幾何——全 repo 的單一來源。
 *
 * 規格出處:`spec/domain/baseball-field-coordinates.md`(演算法團隊 draw.io 規格圖)。
 * 改動任何常數前先看該文件,數值有官方規則依據,不是隨手調的魔術數字。
 *
 * 座標系(單位皆為 cm):
 * - 原點 (0, 0, 0) = 本壘板尖端(指向捕手的角),位於地面
 * - +X 一壘側、+Y 投手方向、+Z 垂直向上(右手座標系)
 *
 * 本模組刻意放在 `app/components/` 下而非 `app/utils/`:後者會進 Nuxt
 * auto-import,`isStrike` 等泛用名稱會與各模組的同名 export 撞名。這裡一律
 * 顯式 import,消費端自己決定要不要 re-export。
 */

/** 本壘板幾何(cm),原點在尖端。MLB 官方 17 吋 = 43.18cm */
export const HOME_PLATE = {
  /** 左右半寬 */
  halfWidth: 21.59,
  /** 側角的 Y(斜邊起點) */
  notchY: 21.59,
  /** 前緣的 Y(投手側) */
  frontY: 43.18,
} as const

/** 本壘板五個頂點 (x, y),順序為 尖端 → 三壘側 → 前緣 → 一壘側,可直接餵給 SVG polygon */
export const HOME_PLATE_POINTS: readonly (readonly [number, number])[] = [
  [0, 0],
  [-HOME_PLATE.halfWidth, HOME_PLATE.notchY],
  [-HOME_PLATE.halfWidth, HOME_PLATE.frontY],
  [HOME_PLATE.halfWidth, HOME_PLATE.frontY],
  [HOME_PLATE.halfWidth, HOME_PLATE.notchY],
] as const

/**
 * 打擊區幾何(cm),左右各一個 100 × 220 矩形,不含本壘板本身。
 * 三壘側(X 負)站右打者、一壘側(X 正)站左打者。
 */
export const BATTERS_BOX = {
  /** 內緣(靠本壘板側)的 |X| */
  innerX: 37.5,
  /** 外緣的 |X| */
  outerX: 137.5,
  /** 捕手側邊界的 Y */
  backY: -77.5,
  /** 投手側邊界的 Y */
  frontY: 142.5,
  width: 100,
  length: 220,
  /** 本壘板側緣到打擊區內緣的間隙 = innerX − HOME_PLATE.halfWidth */
  gapToPlate: 15.91,
} as const

/** 好球帶上緣的身高比例:top = 身高 × 此值 */
export const ZONE_TOP_RATIO = 0.535
/** 好球帶下緣的身高比例:bottom = 身高 × 此值 */
export const ZONE_BOTTOM_RATIO = 0.27

/** 棒球半徑(cm),球徑約 7.3cm。球緣判定時用來外擴邊界 */
export const BALL_RADIUS = 3.65

/** 英尺換算(strike-zone-grid 以英尺作業,故一併集中在此) */
export const CM_PER_FOOT = 30.48

/**
 * 好球帶邊界(cm)。左右由本壘板寬固定,上下依打者身高計算。
 * 命名為 Bounds 以區別 `strike-zone-grid/core/types.ts` 的英尺制 `StrikeZone`。
 */
export interface StrikeZoneBounds {
  left: number
  right: number
  bottom: number
  top: number
}

/** 依打者身高(cm)算出好球帶邊界 */
export function getStrikeZone(batterHeightCm: number): StrikeZoneBounds {
  return {
    left: -HOME_PLATE.halfWidth,
    right: HOME_PLATE.halfWidth,
    bottom: batterHeightCm * ZONE_BOTTOM_RATIO,
    top: batterHeightCm * ZONE_TOP_RATIO,
  }
}

/**
 * 好球判定,座標為球心。
 *
 * `byBallEdge` 為 true 時改採「球的任何部分通過即好球」(棒球規則的正式定義),
 * 四邊各外擴一個球半徑;預設 false,即球心落在框內才算,與本 repo 現行判定一致。
 */
export function isStrike(
  x: number,
  z: number,
  zone: StrikeZoneBounds,
  byBallEdge = false,
): boolean {
  const m = byBallEdge ? BALL_RADIUS : 0
  return (
    x >= zone.left - m && x <= zone.right + m
    && z >= zone.bottom - m && z <= zone.top + m
  )
}

/** {@link getZoneCell} 的回傳:九宮格的 0-based 格位 */
export interface ZoneCell {
  /** 0=三壘側(X 最小) 1=中 2=一壘側。與後端 classifyCell 同慣例 */
  col: number
  /** 0=高 1=中 2=低 */
  row: number
}

/**
 * 落點屬於九宮格哪一格。超出好球帶會被夾到最近的邊格,
 * 需要區分「界外」請先用 {@link isStrike} 過濾。
 */
export function getZoneCell(x: number, z: number, zone: StrikeZoneBounds): ZoneCell {
  const clamp3 = (n: number) => Math.max(0, Math.min(2, Math.floor(n)))
  const cellW = (zone.right - zone.left) / 3
  const cellH = (zone.top - zone.bottom) / 3
  return {
    col: clamp3((x - zone.left) / cellW),
    row: clamp3((zone.top - z) / cellH),
  }
}

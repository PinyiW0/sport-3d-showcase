/**
 * 落點分布的純資料層——篩選、九宮格聚合、大量散點的 SVG path 產生。
 *
 * 座標一律沿用後端 `strike_zone_point` 的 cm 制（x = 距本壘板中心水平位移、
 * z = 離地高度），**不轉英尺**。strike-zone-grid 轉英尺是為了對齊 MLB 的
 * px/pz 慣例，本模組沒有這個包袱，直接用 cm 與 fieldGeometry 同單位。
 *
 * 純 TS、零 Vue 依賴，可單獨在 node 端做統計。
 */

import type { StrikeZoneBounds } from '../../baseball-field/core/fieldGeometry'
import { getZoneCell, isStrike } from '../../baseball-field/core/fieldGeometry'

/** 一顆球的落點（cm） */
export interface DistributionPitch {
  /** 距本壘板中心的水平位移，+X 為一壘側 */
  x: number
  /** 離地高度 */
  z: number
  /** 投手識別（後端 pitcher 欄位） */
  pitcher: string
  /** 球種代碼，如 FF / SL / CU / CH / SI */
  pitchType: string
}

/** 篩選條件，欄位省略或為 null 代表「全部」 */
export interface DistributionFilter {
  pitcher?: string | null
  pitchType?: string | null
}

/** 單格統計 */
export interface CellStat {
  /** 1–9，左上到右下 */
  number: number
  /** 0=三壘側 1=中 2=一壘側 */
  col: number
  /** 0=高 1=中 2=低 */
  row: number
  count: number
  /** count / 該次聚合的最大格數，0–1，供顏色深淺用 */
  intensity: number
}

export interface DistributionStats {
  /** 納入統計的總球數（含好球帶外） */
  total: number
  /** 落在好球帶內的球數 */
  inZone: number
  /** 固定 9 格，依 number 由小到大 */
  cells: CellStat[]
  /** 單格最高球數，0 代表沒有任何球進好球帶 */
  maxCount: number
}

export function filterPitches(
  pitches: readonly DistributionPitch[],
  filter: DistributionFilter = {},
): DistributionPitch[] {
  const { pitcher, pitchType } = filter
  return pitches.filter(
    p => (!pitcher || p.pitcher === pitcher) && (!pitchType || p.pitchType === pitchType),
  )
}

/**
 * 依九宮格聚合。
 *
 * 好球帶外的球只計入 `total`，不進任何一格——`getZoneCell` 會把界外點夾到邊格，
 * 直接用它做統計會讓邊格灌水，所以這裡先用 `isStrike` 過濾。
 */
export function aggregateByCell(
  pitches: readonly DistributionPitch[],
  zone: StrikeZoneBounds,
): DistributionStats {
  const counts = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  let inZone = 0

  for (const { x, z } of pitches) {
    if (!isStrike(x, z, zone))
      continue
    const { col, row } = getZoneCell(x, z, zone)
    counts[row * 3 + col]!++
    inZone++
  }

  const maxCount = Math.max(...counts)
  const cells = counts.map((count, i) => ({
    number: i + 1,
    col: i % 3,
    row: Math.floor(i / 3),
    count,
    intensity: maxCount > 0 ? count / maxCount : 0,
  }))

  return { total: pitches.length, inZone, cells, maxCount }
}

/** 各篩選維度的可選值，依字母排序 */
export function collectFilterOptions(pitches: readonly DistributionPitch[]) {
  return {
    pitchers: [...new Set(pitches.map(p => p.pitcher))].sort(),
    pitchTypes: [...new Set(pitches.map(p => p.pitchType))].sort(),
  }
}

/**
 * 把多顆點合併成單一 SVG path 的 `d`。
 *
 * 每顆點一個 `<circle>` 的話，上千顆會產出上千個 DOM 節點；合併成一條 path
 * 後不論幾顆都只有一個節點。代價是失去逐點的 title 與 testid——分布圖的互動
 * 錨點掛在九宮格的格子上（固定 9 個），不需要逐點定位。
 *
 * 每顆點畫成兩段半圓弧（SVG 沒有畫整圓的單一指令）。
 */
export function buildPointsPath(
  points: readonly { x: number, y: number }[],
  radius: number,
): string {
  const r = radius
  return points
    .map(({ x, y }) => `M${x},${y}m${-r},0a${r},${r} 0 1,0 ${r * 2},0a${r},${r} 0 1,0 ${-r * 2},0`)
    .join('')
}

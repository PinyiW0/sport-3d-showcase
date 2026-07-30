/**
 * 分布圖的座標與版面。
 *
 * 刻意不共用 strike-zone-grid 的 `useStrikeZoneScale`：那支以英尺作業、留白比例
 * 也是為單球檢視調的。分布圖要看的是框外的球跑多遠，留白需求本就不同，硬共用
 * 會逼出一堆 options 參數。共用的是規則（fieldGeometry），不是呈現決策。
 *
 * SVG 單位 = 1cm，所以橫縱天然等比例，分布形狀不會被拉扁。
 */

import type { MaybeRefOrGetter } from 'vue'
import type { StrikeZoneBounds } from '../../baseball-field/core/fieldGeometry'
import { computed, toValue } from 'vue'

export interface DistributionScaleOptions {
  /** 好球帶四周的留白，以好球帶自身尺寸為倍數。預設 1 = 各留一個好球帶寬/高 */
  paddingFraction?: number
}

export interface DistributionScale {
  /** viewBox 寬高（cm） */
  viewWidth: number
  viewHeight: number
  /** 場地座標 → SVG 座標（y 軸翻轉） */
  toSvg: (x: number, z: number) => { x: number, y: number }
  /** 落點是否在視野內；視野外的球不繪製，由呼叫端另行計數 */
  inView: (x: number, z: number) => boolean
  zoneRect: { x: number, y: number, width: number, height: number }
  /** 九宮格內部分隔線（2 直 2 橫） */
  gridLines: { x1: number, y1: number, x2: number, y2: number }[]
  /** 9 個格子的矩形，作為 hover / 點擊的錨點 */
  cells: { number: number, x: number, y: number, width: number, height: number }[]
}

export function useDistributionScale(
  zone: MaybeRefOrGetter<StrikeZoneBounds>,
  options: MaybeRefOrGetter<DistributionScaleOptions> = {},
) {
  return computed<DistributionScale>(() => {
    const { left, right, bottom, top } = toValue(zone)
    const { paddingFraction = 1 } = toValue(options)

    const zoneWidth = right - left
    const zoneHeight = top - bottom
    const padX = zoneWidth * paddingFraction
    const padZ = zoneHeight * paddingFraction

    // 地面以下沒有落點，下緣不留白到負值，免得整張圖被空白撐開
    const minX = left - padX
    const maxX = right + padX
    const minZ = Math.max(0, bottom - padZ)
    const maxZ = top + padZ

    const viewWidth = maxX - minX
    const viewHeight = maxZ - minZ
    const toSvg = (x: number, z: number) => ({ x: x - minX, y: maxZ - z })
    const inView = (x: number, z: number) => x >= minX && x <= maxX && z >= minZ && z <= maxZ

    const topLeft = toSvg(left, top)
    const zoneRect = { x: topLeft.x, y: topLeft.y, width: zoneWidth, height: zoneHeight }

    const cellW = zoneWidth / 3
    const cellH = zoneHeight / 3

    const gridLines = [
      ...[1, 2].map(i => ({
        x1: topLeft.x + cellW * i,
        y1: topLeft.y,
        x2: topLeft.x + cellW * i,
        y2: topLeft.y + zoneHeight,
      })),
      ...[1, 2].map(i => ({
        x1: topLeft.x,
        y1: topLeft.y + cellH * i,
        x2: topLeft.x + zoneWidth,
        y2: topLeft.y + cellH * i,
      })),
    ]

    const cells = Array.from({ length: 9 }, (_, i) => ({
      number: i + 1,
      x: topLeft.x + cellW * (i % 3),
      y: topLeft.y + cellH * Math.floor(i / 3),
      width: cellW,
      height: cellH,
    }))

    return { viewWidth, viewHeight, toSvg, inView, zoneRect, gridLines, cells }
  })
}

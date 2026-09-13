/**
 * 擊球點九宮格的座標與視野。
 *
 * 捕手視角、+x 在畫面右側，**不**像 strike-zone-grid 反轉 x 軸——
 * BPE 規範（frontend-render-guide.md §3）明定「捕手視角，+x 為一壘方向、畫面右側」，
 * 本模組直接對齊業界慣例；strike-zone-grid 的反轉是為了對齊後端 2D 落點圖 renderer，
 * 兩者需求不同，見 spec/domain/baseball-field-coordinates.md §6 的警告框。
 *
 * SVG 單位 = 1cm（比照 pitch-distribution 的 useDistributionScale），橫縱天然等比例。
 *
 * 視野固定 x∈[-75,75]、z∈[0,200] cm，讓不同事件的擊球點可以直接比位置；
 * 23 筆樣本的擊球點（x −21.9~40.9、z 15.2~168.0）全都落在這個範圍內、不會觸發擴大。
 * 落在範圍外時（未來資料）依規範「照座標畫，不裁切」：把視野擴大到剛好包住該點、
 * 外加 15cm 邊，並回傳 `expanded` 旗標讓外面知道視野已經改變（規範 §9「不要只做 clamp」）。
 */

import type { MaybeRefOrGetter } from 'vue'
import type { StrikeZoneBounds } from '../../baseball-field/core/fieldGeometry'
import { computed, toValue } from 'vue'

/** 預設視野（cm）：23 筆樣本的擊球點全都裝得下 */
export const DEFAULT_VIEW_X: readonly [number, number] = [-75, 75]
export const DEFAULT_VIEW_Z: readonly [number, number] = [0, 200]
/** 擊球點落在預設視野外時，擴大視野後多留的邊距（cm） */
export const EXPAND_MARGIN_CM = 15

export interface ContactPoint {
  x: number
  z: number
}

export interface SvgPoint {
  x: number
  y: number
}

export interface ContactGridScale {
  /** 視野邊界（cm） */
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  /** = maxX − minX */
  viewWidth: number
  /** = maxZ − minZ */
  viewHeight: number
  /** 場地座標(cm) → SVG 座標；y 軸翻轉(z 越大、SVG y 越小) */
  toSvg: (x: number, z: number) => SvgPoint
  /** 視野是否因擊球點落在預設範圍外而擴大 */
  expanded: boolean
  /** 好球帶外框（SVG 座標，未加畫布邊距） */
  zoneRect: { x: number, y: number, width: number, height: number }
  /** 好球帶內部分隔線（2 直 2 橫）；九宮格不假設正方形，格高依 zone 實際尺寸算 */
  gridLines: { x1: number, y1: number, x2: number, y2: number }[]
}

/** 產生 [min, max] 區間內、以 step 為間距、對齊到 step 倍數的刻度值 */
export function ticksInRange(min: number, max: number, step: number): number[] {
  const ticks: number[] = []
  const start = Math.ceil(min / step) * step
  for (let v = start; v <= max + 1e-9; v += step)
    ticks.push(v)
  return ticks
}

export function useContactGridScale(
  zone: MaybeRefOrGetter<StrikeZoneBounds>,
  point: MaybeRefOrGetter<ContactPoint | null>,
) {
  return computed<ContactGridScale>(() => {
    const z = toValue(zone)
    const p = toValue(point)

    let [minX, maxX] = DEFAULT_VIEW_X
    let [minZ, maxZ] = DEFAULT_VIEW_Z
    let expanded = false

    if (p) {
      if (p.x < minX) {
        minX = p.x - EXPAND_MARGIN_CM
        expanded = true
      }
      if (p.x > maxX) {
        maxX = p.x + EXPAND_MARGIN_CM
        expanded = true
      }
      if (p.z < minZ) {
        minZ = p.z - EXPAND_MARGIN_CM
        expanded = true
      }
      if (p.z > maxZ) {
        maxZ = p.z + EXPAND_MARGIN_CM
        expanded = true
      }
    }

    const viewWidth = maxX - minX
    const viewHeight = maxZ - minZ
    const toSvg = (x: number, zz: number): SvgPoint => ({ x: x - minX, y: maxZ - zz })

    const topLeft = toSvg(z.left, z.top)
    const bottomRight = toSvg(z.right, z.bottom)
    const zoneRect = {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
    }

    const cellW = (z.right - z.left) / 3
    const cellH = (z.top - z.bottom) / 3
    const gridLines = [
      ...[1, 2].map(i => ({
        x1: toSvg(z.left + cellW * i, z.top).x,
        y1: zoneRect.y,
        x2: toSvg(z.left + cellW * i, z.bottom).x,
        y2: zoneRect.y + zoneRect.height,
      })),
      ...[1, 2].map(i => ({
        x1: zoneRect.x,
        y1: toSvg(0, z.top - cellH * i).y,
        x2: zoneRect.x + zoneRect.width,
        y2: toSvg(0, z.top - cellH * i).y,
      })),
    ]

    return { minX, maxX, minZ, maxZ, viewWidth, viewHeight, toSvg, expanded, zoneRect, gridLines }
  })
}

import type { Pose3dFrame } from './parsePitchOutcome'
import { describe, expect, it } from 'vitest'
import { computeSkeletonBounds } from './skeletonBounds'

/** 用少數幾個 keypoint 組一幀，其餘槽位為缺測。 */
function frame(timestampMs: number, points: Array<[number, number, number] | null>): Pose3dFrame {
  return { timestampMs, points }
}

describe('computeSkeletonBounds', () => {
  it('涵蓋所有 frame 的所有 keypoint，不只第一幀', () => {
    const bounds = computeSkeletonBounds([
      frame(0, [[0, 1000, 50]]),
      frame(4, [[100, 1200, 170]]),
    ])
    // 加 15cm padding 後往外圓整到 10cm 格
    expect(bounds.x).toEqual([-20, 120])
    expect(bounds.y).toEqual([980, 1220])
    expect(bounds.z).toEqual([0, 190])
  })

  it('z 軸永遠含地面 0，骨架高度才有參照', () => {
    // 資料最低點在 80cm（騰空），下緣仍要拉到 0
    const bounds = computeSkeletonBounds([frame(0, [[0, 0, 80]]), frame(4, [[0, 0, 190]])])
    expect(bounds.z[0]).toBe(0)
  })

  it('資料低於地面時 z 下緣跟著往下，不會被 0 截斷', () => {
    const bounds = computeSkeletonBounds([frame(0, [[0, 0, -35]])])
    expect(bounds.z[0]).toBe(-40)
  })

  it('缺測的 keypoint 不影響範圍', () => {
    const withNulls = computeSkeletonBounds([frame(0, [null, [10, 20, 30], null])])
    const withoutNulls = computeSkeletonBounds([frame(0, [[10, 20, 30]])])
    expect(withNulls).toEqual(withoutNulls)
  })

  it('完全沒有資料時回傳預設方盒，不會漏出 Infinity', () => {
    for (const frames of [[], [frame(0, [null, null])]]) {
      const bounds = computeSkeletonBounds(frames)
      expect(bounds).toEqual({ x: [0, 100], y: [0, 100], z: [0, 100] })
    }
  })

  it('範圍端點一律落在 10cm 格上，軸刻度才會是整數', () => {
    const bounds = computeSkeletonBounds([frame(0, [[-3.7, 1013.2, 47.9]]), frame(4, [[62.1, 1188.4, 173.6]])])
    for (const axis of [bounds.x, bounds.y, bounds.z]) {
      // 取絕對值：負數取模會得到 -0，Object.is(-0, 0) 為 false
      expect(Math.abs(axis[0] % 10)).toBe(0)
      expect(Math.abs(axis[1] % 10)).toBe(0)
    }
  })
})

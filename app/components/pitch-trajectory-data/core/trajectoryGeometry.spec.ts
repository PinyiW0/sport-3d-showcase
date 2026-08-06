import { describe, expect, it } from 'vitest'
import {
  buildHomePlateGeometry,
  buildStrikeZoneCorners,
  buildStrikeZoneLines,
  computeTrajectoryRange,
  parsePitchTrajectory,
  PLATE_HALF_WIDTH_CM,
} from './trajectoryGeometry'

describe('parsePitchTrajectory', () => {
  it('取出 [x, y, z] 三元組並捨棄多餘欄位', () => {
    const result = parsePitchTrajectory({ pitch_trajectory: [[1, 2, 3, 99], [4, 5, 6]] })
    expect(result).toEqual([[1, 2, 3], [4, 5, 6]])
  })

  it('過濾格式不符的列，非陣列輸入也不會拋錯', () => {
    expect(parsePitchTrajectory({ pitch_trajectory: [[1, 2], [1, Number.NaN, 3], [7, 8, 9]] }))
      .toEqual([[7, 8, 9]])
    expect(parsePitchTrajectory({ pitch_trajectory: null as never })).toEqual([])
  })
})

describe('buildStrikeZoneCorners', () => {
  it('由打者身高推出上下緣，四個角都落在指定的 y 平面上', () => {
    const corners = buildStrikeZoneCorners(175, 21.59)
    // 順序:左上 → 右上 → 右下 → 左下
    expect(corners[0]).toEqual([-PLATE_HALF_WIDTH_CM, 21.59, 0.535 * 175])
    expect(corners[1]).toEqual([PLATE_HALF_WIDTH_CM, 21.59, 0.535 * 175])
    expect(corners[2]).toEqual([PLATE_HALF_WIDTH_CM, 21.59, 0.27 * 175])
    expect(corners[3]).toEqual([-PLATE_HALF_WIDTH_CM, 21.59, 0.27 * 175])
  })
})

describe('buildHomePlateGeometry', () => {
  it('組出封閉的五邊形立體：10 個頂點、16 個三角面', () => {
    const { vertices, faces } = buildHomePlateGeometry(3)
    expect(vertices).toHaveLength(10)
    expect(faces).toHaveLength(16) // 3 頂面 + 3 底面 + 5 邊 × 2
  })

  it('底面往 -z 長，頂面貼齊地面 z=0', () => {
    const { vertices } = buildHomePlateGeometry(3)
    const zs = vertices.map(v => v[2])
    expect(Math.max(...zs)).toBe(0)
    expect(Math.min(...zs)).toBe(-3)
  })

  it('每個面索引都指向存在的頂點', () => {
    const { vertices, faces } = buildHomePlateGeometry()
    for (const face of faces) {
      for (const index of face) {
        expect(index).toBeGreaterThanOrEqual(0)
        expect(index).toBeLessThan(vertices.length)
      }
    }
  })
})

describe('buildStrikeZoneLines', () => {
  it('外框閉合且所有點都在好球帶的 y 平面上', () => {
    const { outline } = buildStrikeZoneLines(buildStrikeZoneCorners(175, 21.59))
    expect(outline).toHaveLength(5)
    expect(new Set(outline.map(p => p[1]))).toEqual(new Set([21.59]))
    expect(outline[0]).toEqual(outline.at(-1))
  })

  it('內部分隔線為 2 直 2 橫，共 4 條', () => {
    const { grid } = buildStrikeZoneLines(buildStrikeZoneCorners(175, 21.59))
    expect(grid).toHaveLength(4)
    // 前兩條是直線（x 固定），後兩條是橫線（z 固定）
    expect(grid[0]![0][0]).toBe(grid[0]![1][0])
    expect(grid[2]![0][2]).toBe(grid[2]![1][2])
  })
})

describe('computeTrajectoryRange', () => {
  it('軸範圍涵蓋完整軌跡', () => {
    const range = computeTrajectoryRange([[0, 1587, 186], [15, 21.59, 93]])
    expect(range.y[1]).toBeGreaterThanOrEqual(1587)
    expect(range.z[1]).toBeGreaterThanOrEqual(186)
  })

  it('軌跡再短也保底涵蓋本壘板與九宮格', () => {
    const range = computeTrajectoryRange([[0, 30, 90], [1, 25, 85]])
    expect(range.x[0]).toBeLessThanOrEqual(-150)
    expect(range.x[1]).toBeGreaterThanOrEqual(150)
    expect(range.y[1]).toBeGreaterThanOrEqual(600)
    expect(range.z[1]).toBeGreaterThanOrEqual(180)
  })

  it('端點取整到 100cm，軸刻度才會是整數', () => {
    const range = computeTrajectoryRange([[0, 1587, 186]])
    for (const axis of [range.x, range.y, range.z]) {
      expect(Math.abs(axis[0] % 100)).toBe(0)
      expect(Math.abs(axis[1] % 100)).toBe(0)
    }
  })
})

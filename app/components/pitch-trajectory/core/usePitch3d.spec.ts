import { describe, expect, it } from 'vitest'
import {
  buildStrikeZoneCorners,
  createChartLayout,
  createHomePlateTrace,
  createStrikeZoneTraces,
  createTrajectoryTraces,
  parsePitchTrajectory,
  PLATE_HALF_WIDTH_CM,
} from './usePitch3d'

describe('parsePitchTrajectory', () => {
  it('extracts [x, y, z] tuples and drops extra fields', () => {
    const result = parsePitchTrajectory({ pitch_trajectory: [[1, 2, 3, 99], [4, 5, 6]] })
    expect(result).toEqual([[1, 2, 3], [4, 5, 6]])
  })

  it('filters malformed rows and tolerates non-array input', () => {
    expect(parsePitchTrajectory({ pitch_trajectory: [[1, 2], [1, Number.NaN, 3], [7, 8, 9]] }))
      .toEqual([[7, 8, 9]])
    expect(parsePitchTrajectory({ pitch_trajectory: null as never })).toEqual([])
  })
})

describe('buildStrikeZoneCorners', () => {
  it('derives top/bottom from batter height and puts all corners on the given y plane', () => {
    const corners = buildStrikeZoneCorners(175, 21.59)
    // 順序:左上 → 右上 → 右下 → 左下
    expect(corners[0]).toEqual([-PLATE_HALF_WIDTH_CM, 21.59, 0.535 * 175])
    expect(corners[1]).toEqual([PLATE_HALF_WIDTH_CM, 21.59, 0.535 * 175])
    expect(corners[2]).toEqual([PLATE_HALF_WIDTH_CM, 21.59, 0.27 * 175])
    expect(corners[3]).toEqual([-PLATE_HALF_WIDTH_CM, 21.59, 0.27 * 175])
  })
})

describe('createTrajectoryTraces', () => {
  it('returns line + start + end traces marking the trajectory endpoints', () => {
    const [line, start, end] = createTrajectoryTraces([[0, 1500, 180], [10, 700, 150], [15, 21.59, 93]])
    expect(line.x).toEqual([0, 10, 15])
    expect(start.x).toEqual([0])
    expect(start.z).toEqual([180])
    expect(end.x).toEqual([15])
    expect(end.z).toEqual([93])
  })
})

describe('createHomePlateTrace', () => {
  it('builds a closed pentagon solid: 10 vertices and 16 triangle faces', () => {
    const plate = createHomePlateTrace(3)
    expect(plate.x).toHaveLength(10)
    expect(plate.i).toHaveLength(16) // 3 頂面 + 3 底面 + 5 邊 × 2
    // 底面往 -z 長,頂面貼齊 z=0
    expect(Math.max(...plate.z)).toBe(0)
    expect(Math.min(...plate.z)).toBe(-3)
  })
})

describe('createStrikeZoneTraces', () => {
  it('keeps every line on the zone y plane and closes the outline', () => {
    const corners = buildStrikeZoneCorners(175, 21.59)
    const [outline, grid] = createStrikeZoneTraces(corners)
    expect(new Set(outline.y)).toEqual(new Set([21.59]))
    expect(outline.x[0]).toBe(outline.x.at(-1))
    expect(outline.z[0]).toBe(outline.z.at(-1))
    // 內線:2 直 + 2 橫,每條 3 個元素(頭、尾、null 斷點)
    expect(grid.x).toHaveLength(12)
    expect(grid.y.filter(v => v === null)).toHaveLength(4)
  })
})

describe('createChartLayout', () => {
  it('expands the y axis to cover the full trajectory', () => {
    const layout = createChartLayout([[0, 1587, 186], [15, 21.59, 93]])
    const { scene } = layout
    expect(scene.yaxis.range[1]).toBeGreaterThanOrEqual(1587)
    expect(scene.zaxis.range[1]).toBeGreaterThanOrEqual(186)
  })

  it('keeps aspectratio proportional to axis ranges so 1cm renders equally on all axes', () => {
    const layout = createChartLayout([[0, 1587, 186], [15, 21.59, 93]])
    const { scene } = layout
    const spanY = scene.yaxis.range[1]! - scene.yaxis.range[0]!
    const spanZ = scene.zaxis.range[1]! - scene.zaxis.range[0]!
    expect(scene.aspectratio.y / scene.aspectratio.z).toBeCloseTo(spanY / spanZ, 6)
  })
})

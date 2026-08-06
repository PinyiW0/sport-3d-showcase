import { describe, expect, it } from 'vitest'
import { buildStrikeZoneCorners } from '../../pitch-trajectory-data/core/trajectoryGeometry'
import {
  createChartLayout,
  createHomePlateTrace,
  createStrikeZoneTraces,
  createTrajectoryTraces,
} from './plotlyFigure'

describe('createTrajectoryTraces', () => {
  it('回傳軌跡線 + 出手點 + 入壘點三條 trace，標出軌跡端點', () => {
    const [line, start, end] = createTrajectoryTraces([[0, 1500, 180], [10, 700, 150], [15, 21.59, 93]])
    expect(line.x).toEqual([0, 10, 15])
    expect(start.x).toEqual([0])
    expect(start.z).toEqual([180])
    expect(end.x).toEqual([15])
    expect(end.z).toEqual([93])
  })
})

describe('createHomePlateTrace', () => {
  it('轉成 mesh3d 格式：10 個頂點、16 個三角面', () => {
    const plate = createHomePlateTrace(3)
    expect(plate.x).toHaveLength(10)
    expect(plate.i).toHaveLength(16) // 3 頂面 + 3 底面 + 5 邊 × 2
    // 底面往 -z 長,頂面貼齊 z=0
    expect(Math.max(...plate.z)).toBe(0)
    expect(Math.min(...plate.z)).toBe(-3)
  })
})

describe('createStrikeZoneTraces', () => {
  it('所有線都在好球帶的 y 平面上，外框閉合', () => {
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
  it('y 軸範圍拉開到涵蓋完整軌跡', () => {
    const layout = createChartLayout([[0, 1587, 186], [15, 21.59, 93]])
    const { scene } = layout
    expect(scene.yaxis.range[1]).toBeGreaterThanOrEqual(1587)
    expect(scene.zaxis.range[1]).toBeGreaterThanOrEqual(186)
  })

  it('aspectratio 與軸範圍等比，1cm 在三軸的視覺長度一致', () => {
    const layout = createChartLayout([[0, 1587, 186], [15, 21.59, 93]])
    const { scene } = layout
    const spanY = scene.yaxis.range[1]! - scene.yaxis.range[0]!
    const spanZ = scene.zaxis.range[1]! - scene.zaxis.range[0]!
    expect(scene.aspectratio.y / scene.aspectratio.z).toBeCloseTo(spanY / spanZ, 6)
  })
})

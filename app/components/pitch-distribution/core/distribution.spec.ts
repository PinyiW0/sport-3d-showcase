import type { DistributionPitch } from './distribution'
import { describe, expect, it } from 'vitest'
import { getStrikeZone } from '../../baseball-field/core/fieldGeometry'
import {
  aggregateByCell,
  buildPointsPath,
  collectFilterOptions,
  filterPitches,
} from './distribution'

// 成棒代表身高的好球帶:left -21.59 / right 21.59 / bottom 46.44 / top 92.02
const zone = getStrikeZone(172)

function pitch(x: number, z: number, pitcher = 'P01', pitchType = '4S'): DistributionPitch {
  return { x, z, pitcher, pitchType }
}

describe('filterPitches', () => {
  const pitches = [
    pitch(0, 70, 'P01', '4S'),
    pitch(0, 70, 'P01', 'SL'),
    pitch(0, 70, 'P02', '4S'),
  ]

  it('條件全省略時回傳全部', () => {
    expect(filterPitches(pitches)).toHaveLength(3)
  })

  it('依投手篩選', () => {
    expect(filterPitches(pitches, { pitcher: 'P01' })).toHaveLength(2)
  })

  it('依球種篩選', () => {
    expect(filterPitches(pitches, { pitchType: '4S' })).toHaveLength(2)
  })

  it('兩個條件同時成立才留下', () => {
    const result = filterPitches(pitches, { pitcher: 'P01', pitchType: 'SL' })
    expect(result).toHaveLength(1)
    expect(result[0]!.pitcher).toBe('P01')
  })

  it('null 視為不篩選', () => {
    expect(filterPitches(pitches, { pitcher: null, pitchType: null })).toHaveLength(3)
  })

  it('無符合條件時回傳空陣列', () => {
    expect(filterPitches(pitches, { pitcher: 'P99' })).toEqual([])
  })
})

describe('aggregateByCell', () => {
  it('落點歸到正確的格號', () => {
    const cases: [number, number, number][] = [
      [-18, 90, 1], // 左上
      [0, 90, 2],
      [18, 90, 3],
      [0, 69.23, 5], // 正中央
      [-18, 48, 7],
      [18, 48, 9], // 右下
    ]
    for (const [x, z, expected] of cases) {
      const stats = aggregateByCell([pitch(x, z)], zone)
      const hit = stats.cells.find(c => c.count === 1)
      expect(hit?.number, `(${x}, ${z})`).toBe(expected)
    }
  })

  it('好球帶外的球計入 total 但不進任何一格', () => {
    const stats = aggregateByCell([pitch(0, 70), pitch(50, 70), pitch(0, 150)], zone)
    expect(stats.total).toBe(3)
    expect(stats.inZone).toBe(1)
    expect(stats.cells.reduce((sum, c) => sum + c.count, 0)).toBe(1)
  })

  it('intensity 以單格最大值正規化', () => {
    const pitches = [
      pitch(0, 69.23), // 第 5 格 4 球
      pitch(0, 69.23),
      pitch(0, 69.23),
      pitch(0, 69.23),
      pitch(-18, 90), // 第 1 格 1 球
    ]
    const stats = aggregateByCell(pitches, zone)
    expect(stats.maxCount).toBe(4)
    expect(stats.cells[4]!.intensity).toBe(1)
    expect(stats.cells[0]!.intensity).toBe(0.25)
    expect(stats.cells[1]!.intensity).toBe(0)
  })

  it('空輸入回傳 9 個空格而非空陣列', () => {
    const stats = aggregateByCell([], zone)
    expect(stats.cells).toHaveLength(9)
    expect(stats.total).toBe(0)
    expect(stats.maxCount).toBe(0)
    expect(stats.cells.every(c => c.intensity === 0)).toBe(true)
  })

  it('全部落在框外時不會產生除以零的 NaN', () => {
    const stats = aggregateByCell([pitch(80, 70), pitch(-80, 70)], zone)
    expect(stats.inZone).toBe(0)
    expect(stats.cells.every(c => Number.isFinite(c.intensity))).toBe(true)
  })

  it('格號與 col/row 對應一致', () => {
    const stats = aggregateByCell([], zone)
    for (const cell of stats.cells) {
      expect(cell.number).toBe(cell.row * 3 + cell.col + 1)
    }
  })
})

describe('collectFilterOptions', () => {
  it('去重並排序', () => {
    const options = collectFilterOptions([
      pitch(0, 70, 'P02', 'SL'),
      pitch(0, 70, 'P01', '4S'),
      pitch(0, 70, 'P02', '4S'),
    ])
    expect(options.pitchers).toEqual(['P01', 'P02'])
    expect(options.pitchTypes).toEqual(['4S', 'SL'])
  })

  it('空輸入回傳兩個空陣列', () => {
    expect(collectFilterOptions([])).toEqual({ pitchers: [], pitchTypes: [] })
  })
})

describe('buildPointsPath', () => {
  it('每個點產生一段 M 指令', () => {
    const d = buildPointsPath([{ x: 10, y: 20 }, { x: 30, y: 40 }], 3)
    expect(d.match(/M/g)).toHaveLength(2)
    expect(d).toContain('M10,20')
    expect(d).toContain('M30,40')
  })

  it('單點由兩段半圓弧構成閉合的圓', () => {
    expect(buildPointsPath([{ x: 0, y: 0 }], 2)).toBe('M0,0m-2,0a2,2 0 1,0 4,0a2,2 0 1,0 -4,0')
  })

  it('空陣列回傳空字串,不會產出無效 path', () => {
    expect(buildPointsPath([], 3)).toBe('')
  })

  it('上千顆點仍只是一條 path', () => {
    const points = Array.from({ length: 2000 }, (_, i) => ({ x: i, y: i }))
    const d = buildPointsPath(points, 2)
    expect(d.match(/M/g)).toHaveLength(2000)
    expect(d.startsWith('M0,0')).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import {
  BALL_RADIUS,
  BATTERS_BOX,
  getStrikeZone,
  getZoneCell,
  HOME_PLATE,
  HOME_PLATE_POINTS,
  isStrike,
} from './fieldGeometry'

// 斷言一律寫死規格文件上的數值,不從常數反推——否則常數打錯時測試會跟著錯。
const HALF = 21.59
const zone = getStrikeZone(175)

describe('場地常數', () => {
  it('本壘板為 MLB 官方 17 吋(43.18cm)規格', () => {
    expect(HOME_PLATE.halfWidth).toBe(21.59)
    expect(HOME_PLATE.frontY).toBe(43.18)
    expect(HOME_PLATE.halfWidth * 2).toBeCloseTo(HOME_PLATE.frontY, 6)
  })

  it('本壘板五頂點:尖端在原點,前緣朝投手', () => {
    expect(HOME_PLATE_POINTS).toHaveLength(5)
    expect(HOME_PLATE_POINTS[0]).toEqual([0, 0])
    expect(HOME_PLATE_POINTS.map(([x]) => x)).toEqual([0, -HALF, -HALF, HALF, HALF])
    expect(Math.max(...HOME_PLATE_POINTS.map(([, y]) => y))).toBe(43.18)
  })

  it('打擊區間隙 = 內緣 − 本壘板半寬', () => {
    expect(BATTERS_BOX.gapToPlate).toBeCloseTo(BATTERS_BOX.innerX - HOME_PLATE.halfWidth, 6)
    expect(BATTERS_BOX.width).toBe(BATTERS_BOX.outerX - BATTERS_BOX.innerX)
    expect(BATTERS_BOX.length).toBe(BATTERS_BOX.frontY - BATTERS_BOX.backY)
  })
})

describe('getStrikeZone', () => {
  it('左右固定為本壘板寬,不隨身高變動', () => {
    expect(zone.left).toBe(-HALF)
    expect(zone.right).toBe(HALF)
    expect(getStrikeZone(190).right).toBe(zone.right)
  })

  it('上下緣依身高比例計算(175cm → 47.25 / 93.625)', () => {
    expect(zone.bottom).toBeCloseTo(47.25, 6)
    expect(zone.top).toBeCloseTo(93.625, 6)
  })

  it('帶高隨身高線性成長', () => {
    const short = getStrikeZone(160)
    const tall = getStrikeZone(190)
    expect(tall.top - tall.bottom).toBeGreaterThan(short.top - short.bottom)
  })
})

describe('isStrike', () => {
  it('球心落在邊界上算好球(閉區間)', () => {
    expect(isStrike(HALF, zone.top, zone)).toBe(true)
    expect(isStrike(-HALF, zone.bottom, zone)).toBe(true)
  })

  it('球心超出任一邊界即壞球', () => {
    expect(isStrike(HALF + 0.01, 70, zone)).toBe(false)
    expect(isStrike(0, zone.top + 0.01, zone)).toBe(false)
    expect(isStrike(0, zone.bottom - 0.01, zone)).toBe(false)
  })

  it('byBallEdge 把邊界外擴一個球半徑', () => {
    const justOutside = HALF + BALL_RADIUS - 0.01 // 25.23
    expect(isStrike(justOutside, 70, zone)).toBe(false)
    expect(isStrike(justOutside, 70, zone, true)).toBe(true)
    // 外擴也有極限:超過一顆球仍是壞球
    expect(isStrike(HALF + BALL_RADIUS + 0.01, 70, zone, true)).toBe(false)
  })

  it('兩種判定的分界落在 21.59 與 25.24 之間', () => {
    // 球心 −25.2:只有球緣判定算好球。−25.3 已超過 21.59 + 3.65,兩種都是壞球
    expect(isStrike(-25.2, 70, zone)).toBe(false)
    expect(isStrike(-25.2, 70, zone, true)).toBe(true)
    expect(isStrike(-25.3, 70, zone, true)).toBe(false)
  })
})

describe('getZoneCell', () => {
  it('正中央落在 (1, 1)', () => {
    expect(getZoneCell(0, (zone.top + zone.bottom) / 2, zone)).toEqual({ col: 1, row: 1 })
  })

  it('col 由三壘側往一壘側遞增、row 由高往低遞增', () => {
    expect(getZoneCell(-15, zone.top - 1, zone)).toEqual({ col: 0, row: 0 })
    expect(getZoneCell(15, zone.bottom + 1, zone)).toEqual({ col: 2, row: 2 })
  })

  it('橫向每格 14.39cm,格線在 ±7.20', () => {
    // −7.20 左側屬 col 0,右側屬 col 1
    expect(getZoneCell(-7.21, 70, zone).col).toBe(0)
    expect(getZoneCell(-7.19, 70, zone).col).toBe(1)
    expect(getZoneCell(7.19, 70, zone).col).toBe(1)
    expect(getZoneCell(7.21, 70, zone).col).toBe(2)
  })

  it('超出好球帶會被夾到最近的邊格', () => {
    expect(getZoneCell(-999, 999, zone)).toEqual({ col: 0, row: 0 })
    expect(getZoneCell(999, -999, zone)).toEqual({ col: 2, row: 2 })
  })

  it('落在上下邊界上不會溢出 0..2', () => {
    expect(getZoneCell(zone.right, zone.bottom, zone)).toEqual({ col: 2, row: 2 })
    expect(getZoneCell(zone.left, zone.top, zone)).toEqual({ col: 0, row: 0 })
  })
})

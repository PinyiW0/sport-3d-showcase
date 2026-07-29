import { describe, expect, it } from 'vitest'
import {
  BATTER_LEVEL_ORDER,
  BATTER_LEVELS,
  getStrikeZoneForLevel,
  inferLevelFromHeight,
} from './batterLevels'
import { HOME_PLATE } from './fieldGeometry'

describe('級別資料表', () => {
  it('代表身高等於該級距各年齡 PR50 的平均', () => {
    for (const key of BATTER_LEVEL_ORDER) {
      const { pr50ByAge, referenceHeightCm, label } = BATTER_LEVELS[key]
      const avg = pr50ByAge.reduce((sum, h) => sum + h, 0) / pr50ByAge.length
      expect(referenceHeightCm, label).toBeCloseTo(avg, 1)
    }
  })

  it('pr50ByAge 的筆數對得上年齡範圍', () => {
    for (const key of BATTER_LEVEL_ORDER) {
      const { ages, pr50ByAge, label } = BATTER_LEVELS[key]
      expect(pr50ByAge, label).toHaveLength(ages[1] - ages[0] + 1)
    }
  })

  it('代表身高隨級別遞增,且落在該級別的身高範圍內', () => {
    let prev = 0
    for (const key of BATTER_LEVEL_ORDER) {
      const { referenceHeightCm, heightRangeCm, label } = BATTER_LEVELS[key]
      expect(referenceHeightCm, label).toBeGreaterThan(prev)
      expect(referenceHeightCm, label).toBeGreaterThanOrEqual(heightRangeCm[0])
      expect(referenceHeightCm, label).toBeLessThanOrEqual(heightRangeCm[1])
      prev = referenceHeightCm
    }
  })
})

describe('getStrikeZoneForLevel', () => {
  // 規格文件 §5 的換算表,寫死驗算值而非從常數反推
  const expected = {
    little: { height: 134.3, bottom: 36.261, top: 71.8505 },
    junior: { height: 156.5, bottom: 42.255, top: 83.7275 },
    senior: { height: 169.7, bottom: 45.819, top: 90.7895 },
    adult: { height: 172, bottom: 46.44, top: 92.02 },
  } as const

  it('四個級別的上下緣符合換算表', () => {
    for (const key of BATTER_LEVEL_ORDER) {
      const zone = getStrikeZoneForLevel(key)
      const { label } = BATTER_LEVELS[key]
      expect(zone.bottom, label).toBeCloseTo(expected[key].bottom, 4)
      expect(zone.top, label).toBeCloseTo(expected[key].top, 4)
    }
  })

  it('左右邊界固定為本壘板寬,不隨級別變動', () => {
    for (const key of BATTER_LEVEL_ORDER) {
      const zone = getStrikeZoneForLevel(key)
      expect(zone.left).toBe(-HOME_PLATE.halfWidth)
      expect(zone.right).toBe(HOME_PLATE.halfWidth)
    }
  })

  it('少棒的格子明顯扁於成棒(橫向固定、縱向隨身高)', () => {
    const cellH = (key: 'little' | 'adult') => {
      const z = getStrikeZoneForLevel(key)
      return (z.top - z.bottom) / 3
    }
    const cellW = (HOME_PLATE.halfWidth * 2) / 3
    expect(cellH('little') / cellW).toBeCloseTo(0.82, 2)
    expect(cellH('adult') / cellW).toBeCloseTo(1.06, 2)
  })
})

describe('inferLevelFromHeight', () => {
  it('依身高對應到級別', () => {
    expect(inferLevelFromHeight(120)).toBe('little')
    expect(inferLevelFromHeight(160)).toBe('junior')
    expect(inferLevelFromHeight(178)).toBe('senior')
  })

  it('級別範圍重疊時取最小的級別', () => {
    // 140 同時落在少棒(117–156.1)與青少棒(135.6–176)
    expect(inferLevelFromHeight(140)).toBe('little')
  })

  it('超出所有級別範圍回傳 null', () => {
    expect(inferLevelFromHeight(100)).toBeNull()
    expect(inferLevelFromHeight(200)).toBeNull()
  })
})

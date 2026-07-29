import { describe, expect, it } from 'vitest'
import { clockNumberPositions } from './clock-geometry'

describe('clockNumberPositions', () => {
  const positions = clockNumberPositions()

  it('回傳 1–12 共 12 個數字', () => {
    expect(positions).toHaveLength(12)
    expect(positions.map(p => p.num)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  })

  it('12 點落在正上方、6 點在正下方（SVG y 軸向下）', () => {
    const twelve = positions.find(p => p.num === 12)!
    const six = positions.find(p => p.num === 6)!
    expect(twelve.x).toBeCloseTo(100, 6)
    expect(twelve.y).toBeCloseTo(25, 6) // 100 - 75
    expect(six.x).toBeCloseTo(100, 6)
    expect(six.y).toBeCloseTo(175, 6) // 100 + 75
  })

  it('3 點在正右方、9 點在正左方（順時針排列）', () => {
    const three = positions.find(p => p.num === 3)!
    const nine = positions.find(p => p.num === 9)!
    expect(three.x).toBeCloseTo(175, 6)
    expect(three.y).toBeCloseTo(100, 6)
    expect(nine.x).toBeCloseTo(25, 6)
    expect(nine.y).toBeCloseTo(100, 6)
  })

  it('每個數字都落在指定半徑的圓周上', () => {
    for (const p of positions) {
      const dist = Math.hypot(p.x - 100, p.y - 100)
      expect(dist).toBeCloseTo(75, 6)
    }
  })

  it('可覆寫中心與半徑', () => {
    const custom = clockNumberPositions({ cx: 50, cy: 50, radius: 30 })
    const twelve = custom.find(p => p.num === 12)!
    expect(twelve.x).toBeCloseTo(50, 6)
    expect(twelve.y).toBeCloseTo(20, 6)
  })
})

import { describe, expect, it } from 'vitest'
import { getStrikeZone } from '../../baseball-field/core/fieldGeometry'
import { useDistributionScale } from './useDistributionScale'

// 成棒:left -21.59 / right 21.59 / bottom 46.44 / top 92.02(寬 43.18、高 45.58)
const zone = getStrikeZone(172)
const scale = useDistributionScale(zone).value

describe('useDistributionScale', () => {
  it('視野為好球帶四周各留一倍尺寸', () => {
    // 寬:43.18 + 左右各 43.18 = 129.54
    expect(scale.viewWidth).toBeCloseTo(129.54, 2)
    // 高:下緣 46.44 − 45.58 = 0.86 未觸地,故 137.6 − 0.86 = 136.74
    expect(scale.viewHeight).toBeCloseTo(136.74, 2)
  })

  it('留白會撐到地面以下時,下緣截在 0', () => {
    // 少棒 bottom 36.26、高 35.59,減完是正的;改用刻意矮的框驗證截斷
    const low = useDistributionScale({ left: -21.59, right: 21.59, bottom: 10, top: 60 }).value
    // minZ = max(0, 10 − 50) = 0,maxZ = 60 + 50 = 110
    expect(low.viewHeight).toBeCloseTo(110, 2)
  })

  it('1cm 對應 1 個 SVG 單位,橫縱等比例不會把分布拉扁', () => {
    const a = scale.toSvg(0, 100)
    const b = scale.toSvg(10, 100)
    const c = scale.toSvg(0, 90)
    expect(b.x - a.x).toBeCloseTo(10, 6)
    expect(c.y - a.y).toBeCloseTo(10, 6)
  })

  it('toSvg 翻轉 y 軸:場地越高、SVG 越上面', () => {
    expect(scale.toSvg(0, 120).y).toBeLessThan(scale.toSvg(0, 60).y)
  })

  it('好球帶左上角對應 zoneRect 原點', () => {
    const topLeft = scale.toSvg(zone.left, zone.top)
    expect(scale.zoneRect.x).toBeCloseTo(topLeft.x, 6)
    expect(scale.zoneRect.y).toBeCloseTo(topLeft.y, 6)
    expect(scale.zoneRect.width).toBeCloseTo(43.18, 2)
    expect(scale.zoneRect.height).toBeCloseTo(45.58, 2)
  })

  it('inView 認得視野內外', () => {
    expect(scale.inView(0, 70)).toBe(true)
    expect(scale.inView(64, 130)).toBe(true)
    expect(scale.inView(70, 70)).toBe(false) // 超出 maxX 64.77
    expect(scale.inView(0, 140)).toBe(false) // 超出 maxZ 137.6
  })

  it('分隔線為 2 直 2 橫,且落在好球帶三等分處', () => {
    expect(scale.gridLines).toHaveLength(4)
    const vertical = scale.gridLines.filter(l => l.x1 === l.x2)
    const horizontal = scale.gridLines.filter(l => l.y1 === l.y2)
    expect(vertical).toHaveLength(2)
    expect(horizontal).toHaveLength(2)
    expect(vertical[0]!.x1 - scale.zoneRect.x).toBeCloseTo(43.18 / 3, 4)
  })

  it('九個格子鋪滿好球帶且不重疊', () => {
    expect(scale.cells).toHaveLength(9)
    const area = scale.cells.reduce((sum, c) => sum + c.width * c.height, 0)
    expect(area).toBeCloseTo(scale.zoneRect.width * scale.zoneRect.height, 4)
    expect(scale.cells.map(c => c.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('格號 1 在左上、9 在右下', () => {
    const first = scale.cells[0]!
    const last = scale.cells[8]!
    expect(first.x).toBeLessThan(last.x)
    expect(first.y).toBeLessThan(last.y)
  })
})

import { describe, expect, it } from 'vitest'
import { axisTicks, chooseTickStep } from './axisBox'

describe('chooseTickStep', () => {
  it('選出的級距讓刻度數落在 4~7 個之間', () => {
    // 涵蓋兩個模組的實際跨度：骨架約 200~400cm、軌跡 y 軸可達 1900cm
    for (const span of [50, 120, 200, 350, 700, 1200, 1900, 4000]) {
      const step = chooseTickStep(span)
      const count = axisTicks(0, span, step).length
      expect(count, `跨度 ${span} 用級距 ${step} 產生 ${count} 個刻度`).toBeGreaterThanOrEqual(4)
      expect(count, `跨度 ${span} 用級距 ${step} 產生 ${count} 個刻度`).toBeLessThanOrEqual(7)
    }
  })

  it('只回傳人看得懂的 1/2/5 系列級距', () => {
    const allowed = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000]
    for (const span of [30, 90, 180, 460, 900, 3300])
      expect(allowed).toContain(chooseTickStep(span))
  })

  it('跨度為 0 時仍回傳有效級距，不會產生 NaN', () => {
    expect(chooseTickStep(0)).toBeGreaterThan(0)
  })
})

describe('axisTicks', () => {
  it('刻度對齊級距的整數倍，而非從 min 起算', () => {
    // min 是 -35 這種非整數倍時，第一個刻度應該是 -20 而不是 -35
    expect(axisTicks(-35, 45, 20)).toEqual([-20, 0, 20, 40])
  })

  it('涵蓋整個範圍且不超出邊界', () => {
    const ticks = axisTicks(0, 300, 100)
    expect(ticks).toEqual([0, 100, 200, 300])
  })

  it('邊界值剛好落在級距上時要收進來', () => {
    expect(axisTicks(100, 200, 50)).toEqual([100, 150, 200])
  })

  it('浮點累加不產生 99.99999 這類髒值', () => {
    const ticks = axisTicks(0, 1, 0.1)
    for (const tick of ticks)
      expect(tick).toBe(Math.round(tick * 1e6) / 1e6)
    expect(ticks.at(-1)).toBe(1)
  })

  it('級距非正數時回傳空陣列，不會無限迴圈', () => {
    expect(axisTicks(0, 100, 0)).toEqual([])
    expect(axisTicks(0, 100, -10)).toEqual([])
    expect(axisTicks(0, 100, Number.NaN)).toEqual([])
  })
})

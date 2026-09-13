import { existsSync, readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { getStrikeZoneForLevel } from '../../baseball-field/core/batterLevels'
import { ticksInRange, useContactGridScale } from './contactGridScale'

// 成棒好球帶：left -21.59 / right 21.59 / bottom 46.44 / top 92.02
const zone = getStrikeZoneForLevel('adult')

describe('useContactGridScale', () => {
  it('捕手視角不反轉：+x 越大，SVG x 越大', () => {
    const scale = useContactGridScale(zone, null).value
    expect(scale.toSvg(10, 0).x).toBeGreaterThan(scale.toSvg(-10, 0).x)
  })

  it('z 越高，SVG y 越小（y 軸翻轉）', () => {
    const scale = useContactGridScale(zone, null).value
    expect(scale.toSvg(0, 100).y).toBeLessThan(scale.toSvg(0, 50).y)
  })

  it('沒有擊球點時使用預設視野，且不擴大', () => {
    const scale = useContactGridScale(zone, null).value
    expect(scale.minX).toBe(-75)
    expect(scale.maxX).toBe(75)
    expect(scale.minZ).toBe(0)
    expect(scale.maxZ).toBe(200)
    expect(scale.expanded).toBe(false)
  })

  it('好球帶矩形寬度恆為 43.18（本壘板寬，不隨級別變動）', () => {
    const scale = useContactGridScale(zone, null).value
    expect(scale.zoneRect.width).toBeCloseTo(43.18, 2)

    const littleZone = getStrikeZoneForLevel('little')
    const littleScale = useContactGridScale(littleZone, null).value
    expect(littleScale.zoneRect.width).toBeCloseTo(43.18, 2)
  })

  it('視野外的點會擴大視野並包住該點（不裁切）', () => {
    const scale = useContactGridScale(zone, { x: 100, z: 50 }).value
    expect(scale.expanded).toBe(true)
    expect(scale.maxX).toBeCloseTo(100 + 15, 6)
    // 包住點：點的 SVG 座標必須落在視野內（x 介於 0 與 viewWidth 之間）
    const svg = scale.toSvg(100, 50)
    expect(svg.x).toBeGreaterThanOrEqual(0)
    expect(svg.x).toBeLessThanOrEqual(scale.viewWidth)
  })

  it('高過預設視野的點（z > 200）會往上擴大視野', () => {
    const scale = useContactGridScale(zone, { x: 0, z: 220 }).value
    expect(scale.expanded).toBe(true)
    expect(scale.maxZ).toBeCloseTo(220 + 15, 6)
  })

  it('視野內的點不會觸發擴大', () => {
    const scale = useContactGridScale(zone, { x: 30, z: 100 }).value
    expect(scale.expanded).toBe(false)
    expect(scale.maxX).toBe(75)
  })
})

describe('ticksInRange', () => {
  it('對齊到 step 的倍數，兩端都含在內', () => {
    expect(ticksInRange(0, 200, 50)).toEqual([0, 50, 100, 150, 200])
  })

  it('下界不是 step 倍數時，從第一個大於等於 min 的倍數開始', () => {
    expect(ticksInRange(-75, 75, 25)).toEqual([-75, -50, -25, 0, 25, 50, 75])
  })
})

// 用真實樣本核對：預設視野要包住全部 23 筆的擊球點，且不因此擴大。
// 只取得到 event_id 就夠了，不需要 bpe-data 的完整型別——本模組刻意不依賴 bpe-data。
const SAMPLE_DIR = 'public/samples/bpe'

describe.skipIf(!existsSync(`${SAMPLE_DIR}/index.json`))('真實樣本（23 筆龍潭實測）', () => {
  // 讀檔放 beforeAll：describe 的內文在收集測試時就會執行，整組被 skipIf 跳過也一樣照跑，
  // 直接寫在這裡的話，模組搬到沒有樣本的專案時會在收集階段報 ENOENT，而不是跳過
  let points: [number, number, number][] = []
  beforeAll(() => {
    const index = JSON.parse(readFileSync(`${SAMPLE_DIR}/index.json`, 'utf8')) as { event_id: string }[]
    points = index
      .map(entry => JSON.parse(readFileSync(`${SAMPLE_DIR}/events/${entry.event_id}.json`, 'utf8')))
      .map(raw => raw?.payload?.contact?.point_cm as [number, number, number] | undefined)
      .filter((p): p is [number, number, number] => Array.isArray(p))
  })

  it('14 筆有擊球點，全都落在預設視野內、不觸發擴大', () => {
    expect(points).toHaveLength(14)
    for (const [x, , z] of points) {
      const scale = useContactGridScale(zone, { x, z }).value
      expect(scale.expanded).toBe(false)
    }
  })
})

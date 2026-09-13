import { existsSync, readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  buildDistanceRingPoints,
  buildFairTerritoryPoints,
  buildOutfieldArcPoints,
  computeFieldViewport,
  createFieldScale,
  DEFAULT_VIEW,
  formatFieldNumber,
  FOUL_LINE_X,
  outfieldArcY,
  VIEW_EXPAND_MARGIN_M,
} from './fieldChart'

describe('外野弧公式', () => {
  it('x=0 時中外野距離為 122 m', () => {
    expect(outfieldArcY(0)).toBeCloseTo(122, 3)
  })

  it('x=±72.125 時與界外線 y=|x| 相接（誤差 < 1e-3 m）', () => {
    expect(outfieldArcY(FOUL_LINE_X)).toBeCloseTo(FOUL_LINE_X, 3)
    expect(outfieldArcY(-FOUL_LINE_X)).toBeCloseTo(FOUL_LINE_X, 3)
  })
})

describe('外野弧折線', () => {
  it('折線兩端精確落在界外線交點上（不受步進誤差影響）', () => {
    const points = buildOutfieldArcPoints(2)
    expect(points[0]).toEqual({ x: -FOUL_LINE_X, y: outfieldArcY(-FOUL_LINE_X) })
    expect(points.at(-1)).toEqual({ x: FOUL_LINE_X, y: outfieldArcY(FOUL_LINE_X) })
  })

  it('球場封閉折線從本壘出發', () => {
    const points = buildFairTerritoryPoints()
    expect(points[0]).toEqual({ x: 0, y: 0 })
  })
})

describe('距離弧', () => {
  it('只涵蓋 45°~135°（界內段），兩端落在界外線上', () => {
    const points = buildDistanceRingPoints(30)
    const first = points[0]!
    const last = points.at(-1)!
    // 135° 端點：三壘側界外線 y = -x
    expect(first.y).toBeCloseTo(-first.x, 5)
    // 45° 端點：一壘側界外線 y = x
    expect(last.y).toBeCloseTo(last.x, 5)
  })

  it('頂點在 x=0 附近時 y 最接近半徑（弧最高點）', () => {
    const points = buildDistanceRingPoints(60, 1)
    const top = points.reduce((a, b) => (b.y > a.y ? b : a))
    expect(top.y).toBeCloseTo(60, 1)
  })
})

describe('視野', () => {
  it('落點為 null 時使用預設視野，包住整個球場（界外線與外野弧頂點都在視野內）', () => {
    const viewport = computeFieldViewport(null)
    expect(viewport).toEqual({ ...DEFAULT_VIEW, expanded: false })
    expect(viewport.xMin).toBeLessThanOrEqual(-FOUL_LINE_X)
    expect(viewport.xMax).toBeGreaterThanOrEqual(FOUL_LINE_X)
    expect(viewport.yMax).toBeGreaterThanOrEqual(122)
  })

  it('落點在預設視野內時不擴大', () => {
    expect(computeFieldViewport({ x: 10, y: 30 }).expanded).toBe(false)
  })

  it('落點在預設視野外（例：本壘後方 y<-10）時擴大視野並留 8 m 邊，不 clamp', () => {
    const landing = { x: 8.157, y: -59.458 }
    const viewport = computeFieldViewport(landing)
    expect(viewport.expanded).toBe(true)
    expect(viewport.yMin).toBe(landing.y - VIEW_EXPAND_MARGIN_M)
    // x 沒有超界，維持預設
    expect(viewport.xMin).toBe(DEFAULT_VIEW.xMin)
    expect(viewport.xMax).toBe(DEFAULT_VIEW.xMax)
  })
})

describe('座標縮放', () => {
  const scale = createFieldScale(computeFieldViewport(null))

  it('+x 越大，svgX 越大', () => {
    expect(scale.toSvg(-10, 0).x).toBeLessThan(scale.toSvg(10, 0).x)
  })

  it('+y 越大，svgY 越小（畫面越上面）', () => {
    expect(scale.toSvg(0, -5).y).toBeGreaterThan(scale.toSvg(0, 50).y)
  })

  it('viewBox 尺寸等於視野寬高，橫縱同一個縮放比例（1 SVG 單位 = 1 公尺）', () => {
    expect(scale.viewWidth).toBe(DEFAULT_VIEW.xMax - DEFAULT_VIEW.xMin)
    expect(scale.viewHeight).toBe(DEFAULT_VIEW.yMax - DEFAULT_VIEW.yMin)
  })
})

describe('formatFieldNumber', () => {
  it('負號換成 Unicode 減號', () => {
    expect(formatFieldNumber(-59.458)).toBe('−59.458')
  })

  it('正數原樣顯示，不補正號', () => {
    expect(formatFieldNumber(8.157)).toBe('8.157')
  })
})

// 以下用 23 筆真實樣本核對「只有落點在預設視野外的那幾筆會擴大視野」。
// 樣本不在時自動跳過（同 bpe-data/core/parseBpeResult.spec.ts 的做法）。
const SAMPLE_DIR = 'public/samples/bpe'

interface SampleEnvelope {
  status?: string
  payload?: { predicted_landing_point_m?: [number, number, number] | null } | null
}

describe.skipIf(!existsSync(`${SAMPLE_DIR}/index.json`))('真實樣本（23 筆龍潭實測）', () => {
  // 讀檔放 beforeAll：describe 的內文在收集測試時就會執行，整組被 skipIf 跳過也一樣照跑，
  // 直接寫在這裡的話，模組搬到沒有樣本的專案時會在收集階段報 ENOENT，而不是跳過
  let landings: Array<{ x: number, y: number } | null> = []
  beforeAll(() => {
    const index = JSON.parse(readFileSync(`${SAMPLE_DIR}/index.json`, 'utf8')) as { event_id: string }[]
    landings = index.map((entry) => {
      const raw = JSON.parse(readFileSync(`${SAMPLE_DIR}/events/${entry.event_id}.json`, 'utf8')) as SampleEnvelope
      const point = raw.payload?.predicted_landing_point_m
      return point ? { x: point[0], y: point[1] } : null
    })
  })

  it('23 筆中只有 #11（本壘後方 59 m）的落點會讓視野擴大', () => {
    const expandedIndexes = landings
      .map((landing, i) => (computeFieldViewport(landing).expanded ? i : -1))
      .filter(i => i >= 0)
    expect(expandedIndexes).toEqual([11])
  })

  it('#11 擴大視野後，落點座標仍在視野範圍內（照座標畫，不 clamp）', () => {
    const landing = landings[11]!
    const viewport = computeFieldViewport(landing)
    expect(landing.x).toBeGreaterThanOrEqual(viewport.xMin)
    expect(landing.x).toBeLessThanOrEqual(viewport.xMax)
    expect(landing.y).toBeGreaterThanOrEqual(viewport.yMin)
    expect(landing.y).toBeLessThanOrEqual(viewport.yMax)
  })
})

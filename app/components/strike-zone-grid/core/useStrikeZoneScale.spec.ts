import type { StrikeZone } from './types'
import { describe, expect, it } from 'vitest'
import { classifyCell, createFieldLayout, createStrikeZoneScale, pitchFromStrikeZonePoint, strikeZoneFromHeight } from './useStrikeZoneScale'

// 任意測試寬度,刻意不等於 DEFAULT_PLATE_HALF_WIDTH,好驗證 override 真的生效。
const TEST_HALF_WIDTH = 0.83
const zone: StrikeZone = { sz_top: 3.5, sz_bot: 1.5, plate_half_width: TEST_HALF_WIDTH }

describe('createStrikeZoneScale', () => {
  it('derives view height from the real-world aspect ratio (uniform scale)', () => {
    const s = createStrikeZoneScale(zone, { viewWidth: 200, paddingFraction: 0.5 })
    // world width = (0.83*2)*(1+0.5*2)=... just assert uniform scale + positive dims.
    expect(s.viewWidth).toBe(200)
    expect(s.viewHeight).toBeGreaterThan(0)
    // A round ball must stay round: the same scale applies to both axes.
    const dx = s.toSvg(1, 2).x - s.toSvg(0, 2).x
    const dy = s.toSvg(0, 3).y - s.toSvg(0, 2).y
    expect(Math.abs(dx)).toBeCloseTo(Math.abs(dy), 6)
  })

  it('flips the y-axis: higher pz maps to a smaller svg y', () => {
    const s = createStrikeZoneScale(zone)
    expect(s.toSvg(0, zone.sz_top).y).toBeLessThan(s.toSvg(0, zone.sz_bot).y)
  })

  it('flips the x-axis (catcher\'s view): larger px maps to a smaller svg x', () => {
    const s = createStrikeZoneScale(zone)
    // Matches the backend renderer: bigger world x sits toward the LEFT.
    expect(s.toSvg(0.5, 2.5).x).toBeLessThan(s.toSvg(-0.5, 2.5).x)
  })

  it('places the zone corners on the plate/zone edges', () => {
    const s = createStrikeZoneScale(zone)
    // Screen top-left is at +halfWidth because the x-axis is flipped.
    const topLeft = s.toSvg(TEST_HALF_WIDTH, zone.sz_top)
    expect(topLeft.x).toBeCloseTo(s.zoneRect.x, 6)
    expect(topLeft.y).toBeCloseTo(s.zoneRect.y, 6)
    expect(s.zoneRect.width).toBeGreaterThan(0)
    expect(s.zoneRect.height).toBeGreaterThan(0)
  })

  it('splits the zone into 9 equal cells numbered 1-9 top-left to bottom-right', () => {
    const s = createStrikeZoneScale(zone)
    expect(s.cells).toHaveLength(9)
    expect(s.cells.map(c => c.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])

    // Cell 1 is top-left, cell 9 is bottom-right.
    expect(s.cells[0]).toMatchObject({ row: 0, col: 0 })
    expect(s.cells[8]).toMatchObject({ row: 2, col: 2 })

    // All cells share the same width/height (equal split).
    const w0 = s.cells[0]!.width
    const h0 = s.cells[0]!.height
    for (const cell of s.cells) {
      expect(cell.width).toBeCloseTo(w0, 6)
      expect(cell.height).toBeCloseTo(h0, 6)
    }
    // Nine cells tile the whole zone rect.
    expect(w0 * 3).toBeCloseTo(s.zoneRect.width, 6)
    expect(h0 * 3).toBeCloseTo(s.zoneRect.height, 6)
  })

  it('classifies points inside vs outside the zone', () => {
    const s = createStrikeZoneScale(zone)
    expect(s.isInZone(0, 2.5)).toBe(true)
    expect(s.isInZone(1.2, 2.5)).toBe(false) // outside horizontally
    expect(s.isInZone(0, 0.9)).toBe(false) // below the zone
  })

  it('rescales the grid height when the batter (sz_top/sz_bot) changes', () => {
    const tall = createStrikeZoneScale({ sz_top: 4.0, sz_bot: 1.5 })
    const short = createStrikeZoneScale({ sz_top: 3.0, sz_bot: 1.6 })
    expect(tall.zoneRect.height).not.toBeCloseTo(short.zoneRect.height, 3)
  })
})

describe('strikeZoneFromHeight', () => {
  it('derives edges from the backend ratios (0.535 / 0.27 × height)', () => {
    // 175cm → backend 93.625 / 47.25 cm → feet.
    const z = strikeZoneFromHeight(175)
    expect(z.sz_top).toBeCloseTo(93.625 / 30.48, 4)
    expect(z.sz_bot).toBeCloseTo(47.25 / 30.48, 4)
  })

  it('scales the zone height linearly with batter height', () => {
    const shortH = strikeZoneFromHeight(160)
    const tallH = strikeZoneFromHeight(190)
    expect(tallH.sz_top - tallH.sz_bot).toBeGreaterThan(shortH.sz_top - shortH.sz_bot)
  })
})

describe('pitchFromStrikeZonePoint', () => {
  it('takes [0]/[2] (cm) → px/pz (feet) and ignores [1]', () => {
    // Real point from bt3d_data (…18:36:34): x=-17.01, plane=21.59, z=76.78.
    const p = pitchFromStrikeZonePoint([-17.006975690617924, 21.59, 76.77862971734986], 'p1')
    expect(p.px).toBeCloseTo(-17.006975690617924 / 30.48, 6)
    expect(p.pz).toBeCloseTo(76.77862971734986 / 30.48, 6)
    expect(p.description).toBe('p1')
  })

  it('places that point inside the fixed 175cm zone (a strike)', () => {
    const zone = strikeZoneFromHeight(175)
    const s = createStrikeZoneScale(zone)
    const p = pitchFromStrikeZonePoint([-17.006975690617924, 21.59, 76.77862971734986])
    expect(s.isInZone(p.px, p.pz)).toBe(true)
  })
})

describe('classifyCell', () => {
  // Backend zone in feet (from the handoff doc's cm constants ÷ 30.48).
  const cm = (v: number) => v / 30.48
  const bZone: StrikeZone = { sz_top: cm(93.625), sz_bot: cm(47.25), plate_half_width: cm(21.59) }

  it('reproduces the doc example: x=-17, z=76.78 → 左欄・中列 (col 0, row 1)', () => {
    expect(classifyCell(bZone, cm(-17), cm(76.78))).toEqual({ col: 0, row: 1, inZone: true })
  })

  it('uses the backend column convention: col 0 = smallest px', () => {
    expect(classifyCell(bZone, cm(-20), cm(70)).col).toBe(0)
    expect(classifyCell(bZone, cm(20), cm(70)).col).toBe(2)
  })

  it('marks out-of-zone pitches with col/row = -1', () => {
    expect(classifyCell(bZone, cm(30), cm(70))).toEqual({ col: -1, row: -1, inZone: false })
  })
})

describe('createFieldLayout', () => {
  const scale = createStrikeZoneScale(zone, { viewWidth: 200 })
  const parse = (s: string) => s.split(' ').map(p => p.split(',').map(Number) as [number, number])

  it('anchors the ground band just below the grid bottom', () => {
    const f = createFieldLayout(scale)
    const gridBottom = scale.zoneRect.y + scale.zoneRect.height
    // Band sits just below the grid (short gap), not below the padded region.
    expect(f.bandTop).toBeGreaterThan(gridBottom)
    expect(f.bandTop - gridBottom).toBeLessThan(scale.viewWidth * 0.1)
    expect(f.bandHeight).toBeGreaterThan(0)
    expect(f.totalHeight).toBeCloseTo(f.bandTop + f.bandHeight, 6)
  })

  it('produces a 5-point home plate and two 4-point batter boxes', () => {
    const f = createFieldLayout(scale)
    expect(parse(f.homePlate)).toHaveLength(5)
    expect(parse(f.leftBox)).toHaveLength(4)
    expect(parse(f.rightBox)).toHaveLength(4)
  })

  it('keeps every point inside the svg width and the ground band', () => {
    const f = createFieldLayout(scale)
    const bandBottom = f.bandTop + f.bandHeight
    for (const poly of [f.homePlate, f.leftBox, f.rightBox]) {
      for (const [x, y] of parse(poly)) {
        expect(x).toBeGreaterThanOrEqual(0)
        expect(x).toBeLessThanOrEqual(scale.viewWidth)
        expect(y).toBeGreaterThanOrEqual(f.bandTop)
        expect(y).toBeLessThanOrEqual(bandBottom)
      }
    }
  })

  it('connects the grid bottom corners to the plate with risers', () => {
    const f = createFieldLayout(scale)
    const gridBottomY = scale.zoneRect.y + scale.zoneRect.height
    const [lTop, lBottom] = parse(f.leftRiser)
    // Riser starts at the grid's bottom-left corner... (coords are rounded to 2dp)
    expect(lTop![0]).toBeCloseTo(scale.zoneRect.x, 1)
    expect(lTop![1]).toBeCloseTo(gridBottomY, 1)
    // ...and ends lower down, on the plate's back edge.
    expect(lBottom![1]).toBeGreaterThan(lTop![1])
    expect(parse(f.rightRiser)[0]![0]).toBeCloseTo(scale.zoneRect.x + scale.zoneRect.width, 1)
  })

  it('centers the plate and mirrors the two boxes across the plate center', () => {
    const f = createFieldLayout(scale)
    const cx = scale.toSvg(0, 0).x
    // Plate is symmetric about cx.
    const plateXs = parse(f.homePlate).map(([x]) => x)
    expect(Math.min(...plateXs) + Math.max(...plateXs)).toBeCloseTo(2 * cx, 3)
    // Left box lives left of center, right box right of center.
    const leftMax = Math.max(...parse(f.leftBox).map(([x]) => x))
    const rightMin = Math.min(...parse(f.rightBox).map(([x]) => x))
    expect(leftMax).toBeLessThanOrEqual(cx)
    expect(rightMin).toBeGreaterThanOrEqual(cx)
  })
})

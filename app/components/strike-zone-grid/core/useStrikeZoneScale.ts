import type { MaybeRefOrGetter } from 'vue'
import type { PitchLocation, StrikeZone } from './types'
import { computed, toValue } from 'vue'
import { CM_PER_FOOT, getStrikeZone, HOME_PLATE } from '../../baseball-field/core/fieldGeometry'

/**
 * Default plate half-width in feet — the exact 17" plate half-width, NOT
 * widened by a ball radius. Derived from the shared cm-based field geometry
 * (`baseball-field/core/fieldGeometry.ts`), the single source of truth.
 */
export const DEFAULT_PLATE_HALF_WIDTH = HOME_PLATE.halfWidth / CM_PER_FOOT

/**
 * Build a {@link StrikeZone} from a batter's height. The shared geometry works
 * in centimetres; this returns feet to match the rest of this module.
 */
export function strikeZoneFromHeight(heightCm: number, plateHalfWidth?: number): StrikeZone {
  const { top, bottom } = getStrikeZone(heightCm)
  return {
    sz_top: top / CM_PER_FOOT,
    sz_bot: bottom / CM_PER_FOOT,
    ...(plateHalfWidth != null ? { plate_half_width: plateHalfWidth } : {}),
  }
}

/**
 * Convert a backend `strike_zone_point` ([x, y, z] in cm) into a
 * {@link PitchLocation} (feet). Only `[0]` (x) and `[2]` (z) are used — `[1]`
 * is the fixed home-plate plane and is ignored, per the backend handoff doc.
 */
export function pitchFromStrikeZonePoint(
  point: readonly number[],
  description?: string,
): PitchLocation {
  return {
    px: point[0]! / CM_PER_FOOT,
    pz: point[2]! / CM_PER_FOOT,
    ...(description != null ? { description } : {}),
  }
}

/** A point in SVG user-space units. */
export interface SvgPoint {
  x: number
  y: number
}

/** A rectangle in SVG user-space units. */
export interface SvgRect {
  x: number
  y: number
  width: number
  height: number
}

/** A line segment in SVG user-space units. */
export interface SvgLine {
  x1: number
  y1: number
  x2: number
  y2: number
}

/** One of the nine grid cells, positioned in SVG space. */
export interface SvgCell extends SvgRect {
  /** 1-9, left-to-right, top-to-bottom. */
  number: number
  row: number
  col: number
  /** Cell center, for labels. */
  cx: number
  cy: number
}

export interface StrikeZoneScaleOptions {
  /** SVG width in user units. Height is derived to preserve real-world aspect. */
  viewWidth?: number
  /**
   * Padding around the zone, as a fraction of the zone's own size, so
   * out-of-zone pitches stay visible. Default `0.5` (50%).
   */
  paddingFraction?: number
}

export interface StrikeZoneScale {
  viewWidth: number
  viewHeight: number
  /** Uniform world→svg scale factor (same on both axes, no distortion). */
  scale: number
  /** Map a world coordinate (feet) to an SVG point. */
  toSvg: (px: number, pz: number) => SvgPoint
  /** The outer border of the strike zone, in SVG space. */
  zoneRect: SvgRect
  /** The two internal vertical grid lines. */
  verticalLines: [SvgLine, SvgLine]
  /** The two internal horizontal grid lines. */
  horizontalLines: [SvgLine, SvgLine]
  /** The nine cells, numbered 1-9. */
  cells: SvgCell[]
  /** True when a world point falls inside the zone rectangle. */
  isInZone: (px: number, pz: number) => boolean
}

/**
 * Pure geometry builder — no Vue reactivity, fully unit-testable.
 *
 * Uses a single uniform scale for both axes so a round ball stays round and
 * distances are faithful. The SVG height is derived from the world aspect ratio.
 */
export function createStrikeZoneScale(
  zone: StrikeZone,
  options: StrikeZoneScaleOptions = {},
): StrikeZoneScale {
  const viewWidth = options.viewWidth ?? 200
  const paddingFraction = options.paddingFraction ?? 0.5

  const halfWidth = zone.plate_half_width ?? DEFAULT_PLATE_HALF_WIDTH
  const { sz_top, sz_bot } = zone

  const zoneWidth = halfWidth * 2
  const zoneHeight = sz_top - sz_bot

  const padX = zoneWidth * paddingFraction
  const padY = zoneHeight * paddingFraction

  const xMin = -halfWidth - padX
  const xMax = halfWidth + padX
  const yMin = sz_bot - padY
  const yMax = sz_top + padY

  const worldWidth = xMax - xMin
  const worldHeight = yMax - yMin

  const scale = viewWidth / worldWidth
  const viewHeight = worldHeight * scale

  // Catcher's perspective, matching the backend renderer: BOTH axes flip.
  // - x-flip: larger world px maps to a SMALLER svg x (i.e. the LEFT of the
  //   screen). Skipping this is the classic bug where landing points come out
  //   left-right mirrored versus the backend.
  // - y-flip: world y grows upward, SVG y grows downward.
  const toSvg = (px: number, pz: number): SvgPoint => ({
    x: (xMax - px) * scale,
    y: (yMax - pz) * scale,
  })

  // With x flipped, the screen's top-left corner is at +halfWidth (not -).
  const topLeft = toSvg(halfWidth, sz_top)
  const bottomRight = toSvg(-halfWidth, sz_bot)
  const zoneRect: SvgRect = {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  }

  const colStep = zoneWidth / 3
  const rowStep = zoneHeight / 3

  const verticalLines = [1, 2].map((i) => {
    const wx = -halfWidth + colStep * i
    return {
      x1: toSvg(wx, sz_top).x,
      y1: zoneRect.y,
      x2: toSvg(wx, sz_bot).x,
      y2: zoneRect.y + zoneRect.height,
    }
  }) as [SvgLine, SvgLine]

  const horizontalLines = [1, 2].map((j) => {
    const wy = sz_bot + rowStep * j
    return {
      x1: zoneRect.x,
      y1: toSvg(0, wy).y,
      x2: zoneRect.x + zoneRect.width,
      y2: toSvg(0, wy).y,
    }
  }) as [SvgLine, SvgLine]

  const cells: SvgCell[] = []
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      // `col`/`row` are on-screen indices (0 = left/top, reading order). Since
      // the x-axis is flipped for the catcher's view, the screen-LEFT edge of a
      // cell corresponds to the LARGER world x.
      const wLeft = halfWidth - colStep * col
      const wTop = sz_top - rowStep * row
      const wBottom = sz_top - rowStep * (row + 1)
      const p = toSvg(wLeft, wTop)
      const width = colStep * scale
      const height = (wTop - wBottom) * scale
      cells.push({
        number: row * 3 + col + 1,
        row,
        col,
        x: p.x,
        y: p.y,
        width,
        height,
        cx: p.x + width / 2,
        cy: p.y + height / 2,
      })
    }
  }

  const isInZone = (px: number, pz: number): boolean =>
    px >= -halfWidth && px <= halfWidth && pz >= sz_bot && pz <= sz_top

  return {
    viewWidth,
    viewHeight,
    scale,
    toSvg,
    zoneRect,
    verticalLines,
    horizontalLines,
    cells,
    isInZone,
  }
}

/** Decide whether a pitch is a strike — explicit flag wins, else geometry. */
export function isStrike(scale: StrikeZoneScale, pitch: PitchLocation): boolean {
  return pitch.is_strike ?? scale.isInZone(pitch.px, pitch.pz)
}

/** Result of {@link classifyCell}. `col`/`row` are `-1` when out of the zone. */
export interface CellClassification {
  /** 0=left, 1=middle, 2=right — backend convention (col 0 = smallest px). */
  col: number
  /** 0=top, 1=middle, 2=bottom. */
  row: number
  inZone: boolean
}

/**
 * Classify a pitch into a 3×3 cell, matching the backend `classifyCell`
 * (`src/modules/reconstruct/strike_zone_plotter.py`).
 *
 * IMPORTANT — the column convention follows the BACKEND, not the on-screen
 * `scale.cells`: here `col 0` = the smallest px. Because the renderer flips x
 * for the catcher's view, `col 0` is drawn on the RIGHT of the screen. Returns
 * `{ col: -1, row: -1, inZone: false }` when the pitch is outside the zone.
 */
export function classifyCell(zone: StrikeZone, px: number, pz: number): CellClassification {
  const halfWidth = zone.plate_half_width ?? DEFAULT_PLATE_HALF_WIDTH
  const { sz_top, sz_bot } = zone

  const inZone = px >= -halfWidth && px <= halfWidth && pz >= sz_bot && pz <= sz_top
  if (!inZone)
    return { col: -1, row: -1, inZone: false }

  const width = halfWidth * 2
  const height = sz_top - sz_bot
  const clamp = (v: number) => Math.min(2, Math.max(0, v))
  // col: x from small→large (backend "catcher's view left→right").
  const col = clamp(Math.floor((px + halfWidth) / (width / 3)))
  // row: 0=top, 2=bottom.
  const row = clamp(Math.floor((sz_top - pz) / (height / 3)))
  return { col, row, inZone: true }
}

/**
 * Home plate + batter's boxes + connecting risers, as SVG point strings.
 *
 * This is a *semi-3D schematic*: the ground (home plate + batter's boxes) is
 * drawn on a single-vanishing-point perspective floor, while the strike-zone
 * grid stays a fronto-parallel vertical plane. Two "riser" lines connect the
 * grid's bottom corners down to the plate's back edge, so the zone reads as
 * standing directly above home plate.
 *
 * Ground points are addressed as `(lat, depth)`: `lat ∈ [-1, 1]` is the lateral
 * position as a fraction of the floor half-width at that depth; `depth ∈ [0, 1]`
 * goes from the near edge (bottom, closest to the viewer) to the far edge (top,
 * toward the pitcher — where the zone rises).
 */
export interface FieldLayout {
  bandTop: number
  bandHeight: number
  /** Total svg height including zone + gap + band. */
  totalHeight: number
  homePlate: string
  leftBox: string
  rightBox: string
  /** Left/right lines connecting the grid's bottom corners to the plate. */
  leftRiser: string
  rightRiser: string
}

export interface FieldLayoutOptions {
  /** Gap between the grid bottom and the band, as a fraction of viewWidth. */
  gapFraction?: number
  /** Band height as a fraction of viewWidth. */
  bandFraction?: number
  /**
   * Floor half-width (fraction of viewWidth) at the near and far edges. The far
   * value being smaller is what produces the receding perspective — the bigger
   * the gap between them, the stronger the 3D effect.
   */
  nearHalf?: number
  farHalf?: number
  /** Batter's-box depth extent along the floor (0 = near/bottom, 1 = far/top). */
  boxNear?: number
  boxFar?: number
  /** Batter's-box inner/outer lateral edges (fraction of floor half-width). */
  boxInnerLat?: number
  boxOuterLat?: number
  /** Plate flat-edge width relative to the grid width (1 = equal). */
  plateWidthFactor?: number
  /** Plate depth relative to the batter's-box depth span (1 = same span). */
  plateDepthFactor?: number
}

export function createFieldLayout(
  scale: StrikeZoneScale,
  options: FieldLayoutOptions = {},
): FieldLayout {
  const { viewWidth } = scale
  const gap = viewWidth * (options.gapFraction ?? 0.03)
  const bandHeight = viewWidth * (options.bandFraction ?? 0.44)
  // Anchor the ground band to the grid's actual bottom edge (not the padded
  // region below it) so the risers connecting the zone to the plate stay short.
  const gridBottom = scale.zoneRect.y + scale.zoneRect.height
  const bandTop = gridBottom + gap
  const totalHeight = bandTop + bandHeight

  const cx = scale.toSvg(0, 0).x / viewWidth // horizontal center, fraction 0..1

  // The strike-zone width IS the width of home plate.
  const zoneHalfFrac = scale.zoneRect.width / 2 / viewWidth

  // Perspective floor: it narrows from `nearHalf` (bottom) to `farHalf` (top).
  const nearHalf = options.nearHalf ?? 0.52
  const farHalf = options.farHalf ?? 0.42
  const nearY = 0.95
  const farY = 0.16
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  const halfAt = (t: number) => lerp(nearHalf, farHalf, t)

  // Ground point (lat, depth) → absolute svg [x, y].
  const g = (lat: number, t: number): [number, number] => [
    (cx + lat * halfAt(t)) * viewWidth,
    bandTop + lerp(nearY, farY, t) * bandHeight,
  ]
  const poly = (pts: [number, number][]) => pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')

  // Batter's boxes: floor rectangles flanking the plate. The OUTER edge (the
  // lat = ±1 side) is intentionally left open, so these are open polylines
  // ordered near-outer → near-inner → far-inner → far-outer (the outer edge,
  // between first and last point, is never connected).
  const boxNear = options.boxNear ?? 0.12
  const boxFar = options.boxFar ?? 0.66
  const boxInnerLat = options.boxInnerLat ?? 0.56
  const boxOuterLat = options.boxOuterLat ?? 0.96
  const leftBox = poly([g(-boxOuterLat, boxNear), g(-boxInnerLat, boxNear), g(-boxInnerLat, boxFar), g(-boxOuterLat, boxFar)])
  const rightBox = poly([g(boxOuterLat, boxNear), g(boxInnerLat, boxNear), g(boxInnerLat, boxFar), g(boxOuterLat, boxFar)])

  // Home plate on the floor: point toward the viewer (near/bottom), flat 17"
  // edge toward the pitcher (far/top). Its depth range is centered on the
  // batter's boxes so the plate sits vertically centered between them.
  const boxCenterT = (boxNear + boxFar) / 2
  const plateHalfT = ((boxFar - boxNear) / 2) * (options.plateDepthFactor ?? 0.9)
  const tPoint = boxCenterT - plateHalfT
  const tMid = boxCenterT
  const tFlat = boxCenterT + plateHalfT
  const plateFlatLat = ((options.plateWidthFactor ?? 0.9) * zoneHalfFrac) / halfAt(tFlat)
  const backLeft = g(-plateFlatLat, tFlat)
  const backRight = g(plateFlatLat, tFlat)
  const homePlate = poly([
    backLeft,
    backRight,
    g(plateFlatLat, tMid),
    g(0, tPoint),
    g(-plateFlatLat, tMid),
  ])

  // Risers: connect the grid's bottom corners down to the plate's back edge.
  const gridLeftX = scale.zoneRect.x
  const gridRightX = scale.zoneRect.x + scale.zoneRect.width
  const leftRiser = poly([[gridLeftX, gridBottom], backLeft])
  const rightRiser = poly([[gridRightX, gridBottom], backRight])

  return { bandTop, bandHeight, totalHeight, homePlate, leftBox, rightBox, leftRiser, rightRiser }
}

/** Reactive wrapper for use inside components. */
export function useStrikeZoneScale(
  zone: MaybeRefOrGetter<StrikeZone>,
  options: MaybeRefOrGetter<StrikeZoneScaleOptions> = {},
) {
  return computed(() => createStrikeZoneScale(toValue(zone), toValue(options)))
}

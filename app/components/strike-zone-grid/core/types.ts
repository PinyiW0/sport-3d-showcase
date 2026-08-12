/**
 * Strike-zone domain types.
 *
 * Coordinate convention (MLB / catcher's perspective, unit = feet):
 * - `px`: horizontal offset from the center of home plate (0 = center).
 * - `pz`: vertical height above the ground.
 * - The zone width is fixed by the plate; the zone *height* is driven by the
 *   per-batter `sz_top` / `sz_bot` measurements — this is how the 3x3 grid
 *   adjusts to the batter's height.
 *
 * The underlying field geometry (in cm) lives in
 * `baseball-field/core/fieldGeometry.ts`; see
 * `spec/domain/baseball-field-coordinates.md` for the full spec.
 */

/** A batter's strike zone, as measured upper/lower boundaries. */
export interface StrikeZone {
  /** Upper edge of the zone, in feet. */
  sz_top: number
  /** Lower edge of the zone, in feet. */
  sz_bot: number
  /**
   * Half-width of the zone in feet. Defaults to `DEFAULT_PLATE_HALF_WIDTH`
   * (21.59cm ≈ 0.708 ft) when omitted — the bare 17" plate half-width, so a
   * pitch is a strike when its *center* is inside. Pass a value widened by the
   * ball radius (+3.65cm) to switch to ball-edge semantics.
   */
  plate_half_width?: number
}

/** A single pitch landing location. */
export interface PitchLocation {
  /** Horizontal offset from plate center, in feet. */
  px: number
  /** Height above the ground, in feet. */
  pz: number
  /** e.g. "4S", "SL", "CH" — optional metadata. */
  pitch_type?: string
  /**
   * Whether the pitch is a strike. When omitted the renderer derives it
   * geometrically from the zone bounds.
   */
  is_strike?: boolean
  /** Optional free-text description (shown as tooltip). */
  description?: string
}

/** One of the nine grid cells (numbered 1-9, left-to-right, top-to-bottom). */
export interface StrikeZoneCell {
  /** 1-9. */
  number: number
  /** Row index, 0 (top) .. 2 (bottom). */
  row: number
  /** Column index, 0 (left) .. 2 (right). */
  col: number
}

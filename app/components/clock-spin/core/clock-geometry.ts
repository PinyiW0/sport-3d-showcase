/**
 * 時鐘面板的純幾何計算（零 Vue 依賴）。
 *
 * SVG 座標慣例：原點在左上、y 軸向下、rotate() 為順時針，
 * 因此 12 點在正上方＝角度 -90°（而非 0°）。
 */

export interface ClockNumberPosition {
  /** 1–12 */
  num: number
  x: number
  y: number
}

export interface ClockLayoutOptions {
  /** 面板中心，預設 (100, 100)（搭配 viewBox="0 0 200 200"） */
  cx?: number
  cy?: number
  /** 數字環半徑，預設 75 */
  radius?: number
}

/**
 * 算出 1–12 這 12 個數字在盤面上的座標。
 * 12 點在正上方，順時針排列。
 */
export function clockNumberPositions(options: ClockLayoutOptions = {}): ClockNumberPosition[] {
  const { cx = 100, cy = 100, radius = 75 } = options
  return Array.from({ length: 12 }, (_, i) => {
    const num = i + 1
    const angle = (num / 12) * 360 - 90
    const rad = (angle * Math.PI) / 180
    return {
      num,
      x: cx + radius * Math.cos(rad),
      y: cy + radius * Math.sin(rad),
    }
  })
}

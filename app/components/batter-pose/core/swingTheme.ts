/**
 * 打者揮棒場景的深淺兩套配色（純資料，無 three）。場景（core/swingScene.ts）與圖例
 * （BatterSwing3d.vue）共用這一份，換色只改這裡、兩邊不會對不上。
 *
 * 配色原則：
 * - 背景是上暗下亮的石板灰漸層（不是純黑／純白），地面中央一圈微光，像在攝影棚裡看
 * - 視覺層級：四肢（左藍右玫瑰）帶彩度最搶眼 → 軀幹是不帶彩度的淺灰 → 頭部最淡。
 *   軀幹若也帶彩度，眼睛會先看到肩髖的四邊形，看不到手腳在做什麼
 * - 骨頭是 3px 細線，面積小，深色畫布上整組比粗圓柱時期亮一階才看得清楚（參考實作的骨頭是近白的 #DCE2E6）
 * - 左右兩色飽和度壓低、明度相近，份量相當；避開球棒的木頭色與規範球的紅，紅綠色盲下仍分得開
 * - 球棒是蜂蜜色的木頭（場景裡再乘上木紋貼圖、加亮光漆），不用飽和的黃，才不像塑膠
 * - 本壘板是參照物，深色畫布上用淺灰而不是純白，免得成為畫面上最亮的東西
 * - 淺色整組換深一階：近白底上淺色的線會被吃掉；背景用淺灰而不是純白，放在深色頁面裡才不刺眼
 */

export interface SwingTheme {
  /** 背景漸層：畫面頂端 → 底端 */
  backdrop: readonly [top: number, bottom: number]
  /** 地面中央的微光：顏色與中心不透明度（往外淡到 0） */
  floorGlow: { color: number, opacity: number }
  /** 地面格線：顏色、一般線與過本壘板尖端兩條中線的不透明度 */
  grid: { color: number, lineOpacity: number, axisOpacity: number }
  /** 骨架：左半身四肢、右半身四肢、軀幹與中線、頭部 */
  left: number
  right: number
  core: number
  head: number
  bat: number
  plate: { fill: number, edge: number }
  /** 指向投手的箭頭 */
  arrow: number
}

export type SwingThemeName = 'dark' | 'light'

export const SWING_THEME: Readonly<Record<SwingThemeName, SwingTheme>> = {
  dark: {
    backdrop: [0x0B0E13, 0x1B2029],
    floorGlow: { color: 0x9DB2CE, opacity: 0.12 },
    grid: { color: 0x8C9AB0, lineOpacity: 0.09, axisOpacity: 0.22 },
    left: 0x7FA8F8,
    right: 0xF08AA8,
    core: 0xC3CBD6,
    head: 0x7D8798,
    bat: 0xD39A55,
    plate: { fill: 0xCDD3DA, edge: 0x5C6778 },
    arrow: 0x6B7686,
  },
  light: {
    backdrop: [0xF3F5F8, 0xDCE2E9],
    floorGlow: { color: 0xFFFFFF, opacity: 0.85 },
    grid: { color: 0x475569, lineOpacity: 0.08, axisOpacity: 0.2 },
    left: 0x2F6BDB,
    right: 0xC7406C,
    core: 0x56606F,
    head: 0x9AA3B1,
    bat: 0xB9803A,
    plate: { fill: 0xFFFFFF, edge: 0x94A3B8 },
    arrow: 0x8A94A3,
  },
}

/** 沒用棒球模型時的紅球（規範：球用與球棒不同的紅色），兩套配色共用 */
export const BALL_FALLBACK_COLOR = 0xEF4444

/**
 * 關節球比所屬部位的線往白色混多少（0 = 同色、1 = 純白）：
 * 關節讀起來是「同一條肢體上較亮的節點」，比線顯眼一點，左右仍分得出來。
 */
export const JOINT_TINT = 0.45

/** 0xRRGGBB 往白色混 amount（0～1），各色版分開算、四捨五入到整數 */
export function tintTowardWhite(color: number, amount: number): number {
  const mix = (channel: number) => Math.round(channel + (255 - channel) * amount)
  return (mix((color >> 16) & 0xFF) << 16) | (mix((color >> 8) & 0xFF) << 8) | mix(color & 0xFF)
}

export function swingTheme(dark: boolean): SwingTheme {
  return SWING_THEME[dark ? 'dark' : 'light']
}

/** 0xRRGGBB → '#rrggbb'：給圖例的 inline style 與 canvas 漸層用 */
export function toCssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}

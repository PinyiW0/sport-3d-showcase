/**
 * 圖表的兩套配色。
 *
 * 放在 core 而不是元件裡，是因為圖例與圖表是兩個分離的區塊（圖例在圖表容器
 * 外、還要能點），兩邊必須讀同一份對照表才不會色號對不上。
 *
 * **深淺兩套不是同一組顏色換個亮度**：深底上要用 200–300 這種亮色階才看得清，
 * 白底上同一組會淡到消失，得換成 500–600。黃色系差最多——深底用 `yellow-200`，
 * 白底必須換成 `amber-500`，否則整條線像沒畫。
 *
 * 用 Tailwind 具名色階而非 hex：`visual-hierarchy-check` 擋 class 任意值色彩。
 * 七色取色相環上分得夠開的位置，且七條都是實線——試過給每條不同虛線樣式當第二
 * 重編碼，但 748 個點的線本身就有密集起伏，再加虛線會整片糊掉、反而更難追。
 * 分辨色改靠另一條路：圖例可以逐條點掉，要確認哪條是哪條，單獨留一條看就好。
 */

import type { MetricKey } from './types'

export type ChartTheme = 'dark' | 'light'

export interface MetricStyle {
  /** 曲線的 stroke class */
  stroke: string
  /** 圖例色塊的背景 class（HTML 用） */
  swatch: string
  /** 數值面板色塊的填色 class（SVG 用） */
  fill: string
}

export interface ChartPalette {
  /** 繪圖區底色 */
  canvas: string
  /** 繪圖區外框，深色版不需要所以是空字串 */
  canvasBorder: string
  grid: string
  zeroLine: string
  eventLine: string
  eventChip: string
  eventChipText: string
  /** 無膠囊底時的事件文字，跟事件線同色系 */
  eventLabel: string
  /**
   * 繪圖區外的軸文字。兩套主題相同——它畫在頁面背景上而不是繪圖區裡，
   * 所以跟著頁面的 light/dark 走，圖表自己是深是淺不影響。
   */
  axisLabel: string
  axisMuted: string
  cursor: string
  tooltipSurface: string
  tooltipBorder: string
  tooltipDivider: string
  tooltipTitle: string
  tooltipLabel: string
  tooltipValue: string
  emptyText: string
  metrics: Record<MetricKey, MetricStyle>
}

/**
 * 七個色相在環上盡量拉開：紅 350° → 橘 25° → 黃 48° → 綠 160° → 藍 200°
 * → 紫 258° → 洋紅 292°。
 *
 * 第一版把手肘配 pink、肩外旋配 rose，兩者色相只差 20 度，在白底上是兩條分不
 * 開的紅粉線；軀幹旋轉的 teal 與軀幹前傾的 sky 也只差 25 度。改成現在這組後
 * 最近的一對是橘與黃（差 23 度），但那兩個明度差得夠多，仍分得開。
 *
 * 兩套用同一組色相、只換色階，同一條線在深淺版才認得出是同一條。
 *
 * **class 一律寫成完整字面字串，不要用 `stroke-${shade}` 這種拼接。** Tailwind
 * 的 JIT 是掃原始碼找完整 class 名，拼出來的字串它看不到，編譯後那些 class
 * 根本不存在——實測會讓好幾條線直接從畫面上消失、色塊變成黑色。囉嗦是必要的。
 */
const DARK_METRICS: Record<MetricKey, MetricStyle> = {
  shoulder_external_rotation_angle: { stroke: 'stroke-rose-300', swatch: 'bg-rose-300', fill: 'fill-rose-300' },
  shoulder_internal_rotation_angle: { stroke: 'stroke-orange-300', swatch: 'bg-orange-300', fill: 'fill-orange-300' },
  lead_knee_flexion: { stroke: 'stroke-yellow-200', swatch: 'bg-yellow-200', fill: 'fill-yellow-200' },
  trunk_rotation: { stroke: 'stroke-emerald-300', swatch: 'bg-emerald-300', fill: 'fill-emerald-300' },
  trunk_anterior_tilt: { stroke: 'stroke-sky-300', swatch: 'bg-sky-300', fill: 'fill-sky-300' },
  pelvis_rotation: { stroke: 'stroke-violet-300', swatch: 'bg-violet-300', fill: 'fill-violet-300' },
  elbow_flexion_angle: { stroke: 'stroke-fuchsia-300', swatch: 'bg-fuchsia-300', fill: 'fill-fuchsia-300' },
}

const LIGHT_METRICS: Record<MetricKey, MetricStyle> = {
  shoulder_external_rotation_angle: { stroke: 'stroke-rose-500', swatch: 'bg-rose-500', fill: 'fill-rose-500' },
  shoulder_internal_rotation_angle: { stroke: 'stroke-orange-500', swatch: 'bg-orange-500', fill: 'fill-orange-500' },
  // 白底上 yellow-500 已經是這個色相能給的極限，再淺就糊在背景裡
  lead_knee_flexion: { stroke: 'stroke-yellow-500', swatch: 'bg-yellow-500', fill: 'fill-yellow-500' },
  trunk_rotation: { stroke: 'stroke-emerald-600', swatch: 'bg-emerald-600', fill: 'fill-emerald-600' },
  trunk_anterior_tilt: { stroke: 'stroke-sky-600', swatch: 'bg-sky-600', fill: 'fill-sky-600' },
  pelvis_rotation: { stroke: 'stroke-violet-500', swatch: 'bg-violet-500', fill: 'fill-violet-500' },
  elbow_flexion_angle: { stroke: 'stroke-fuchsia-600', swatch: 'bg-fuchsia-600', fill: 'fill-fuchsia-600' },
}

/** 除了 metrics 以外的部分；metrics 由 `chartPalette()` 併進來 */
const CHART_SURFACES: Readonly<Record<ChartTheme, Omit<ChartPalette, 'metrics'>>> = {
  dark: {
    canvas: 'fill-chart-canvas',
    canvasBorder: '',
    grid: 'stroke-slate-700',
    zeroLine: 'stroke-slate-400',
    eventLine: 'stroke-amber-400',
    eventChip: 'fill-amber-400',
    eventChipText: 'fill-neutral-900',
    eventLabel: 'fill-amber-600 dark:fill-amber-400',
    axisLabel: 'fill-neutral-700 dark:fill-neutral-200',
    axisMuted: 'fill-neutral-500 dark:fill-neutral-400',
    cursor: 'stroke-sky-400',
    // 面板跟著繪圖區同色系：色塊用的是這一套的 300 色階，放到白底面板上會淡掉
    tooltipSurface: 'fill-slate-800',
    tooltipBorder: 'stroke-slate-600',
    tooltipDivider: 'stroke-slate-600',
    tooltipTitle: 'fill-white',
    tooltipLabel: 'fill-slate-300',
    tooltipValue: 'fill-white',
    emptyText: 'fill-neutral-400',
  },
  light: {
    canvas: 'fill-white',
    // 白底與頁面同色，沒有外框就分不出繪圖區到哪裡結束
    canvasBorder: 'stroke-neutral-300',
    grid: 'stroke-neutral-200',
    zeroLine: 'stroke-neutral-400',
    // 深色版的 amber-400 在白底上太淡，往下壓兩階才壓得住七條彩線
    eventLine: 'stroke-amber-600',
    eventChip: 'fill-amber-500',
    eventChipText: 'fill-neutral-900',
    eventLabel: 'fill-amber-600 dark:fill-amber-400',
    axisLabel: 'fill-neutral-700 dark:fill-neutral-200',
    axisMuted: 'fill-neutral-500 dark:fill-neutral-400',
    cursor: 'stroke-sky-600',
    // 同理：色塊是 500–600 色階，配白底面板才對；白對白靠外框分界
    tooltipSurface: 'fill-white',
    tooltipBorder: 'stroke-neutral-300',
    tooltipDivider: 'stroke-neutral-200',
    tooltipTitle: 'fill-neutral-900',
    tooltipLabel: 'fill-neutral-600',
    tooltipValue: 'fill-neutral-900',
    emptyText: 'fill-neutral-400',
  },
}

const THEME_METRICS: Record<ChartTheme, Record<MetricKey, MetricStyle>> = {
  dark: DARK_METRICS,
  light: LIGHT_METRICS,
}

export function chartPalette(theme: ChartTheme): ChartPalette {
  return { ...CHART_SURFACES[theme], metrics: THEME_METRICS[theme] }
}

export function metricStyle(key: MetricKey, theme: ChartTheme = 'dark'): MetricStyle {
  return THEME_METRICS[theme][key]
}

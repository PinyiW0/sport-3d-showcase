<script setup lang="ts">
import type { FieldMarker, LandingPoint } from './core/fieldChart'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  buildDistanceRingPoints,
  buildFairTerritoryPoints,
  buildOutfieldArcPoints,
  computeFieldViewport,
  createFieldScale,
  DISTANCE_RINGS_M,
  FIRST_BASE,
  formatFieldNumber,
  FOUL_LINE_X,
  isInViewport,
  OUTFIELD_ARC_CENTER_Y,
  OUTFIELD_ARC_RADIUS,
  PITCHERS_PLATE,
  SECOND_BASE,
  THIRD_BASE,
  toPathData,
} from './core/fieldChart'

// 可攜性約束：內部只用相對 import、不用 NuxtUI；不依賴 bpe-data，BPE → props 的轉換
// 由 showcase 負責。SVG 單位 = 1 公尺，橫縱共用同一個縮放比例，球場不會被拉扁。

const props = withDefaults(
  defineProps<{
    /** 預測落點（公尺）；null 表示這筆結果沒有預測落點 */
    landing: LandingPoint | null
    /**
     * 落點旁的標籤，給陣列就一行一項（例：['56.3 m', '一壘側 2.9°']），由呼叫端格式化好傳入。
     * 不給就只寫「預測落點」
     */
    label?: string | readonly string[]
    /** 距離弧、內野菱形、投手板點；預設顯示 */
    showDecorations?: boolean
    /** 深色配色（淺色底上用 false）。不跟頁面 colorMode 走，底色由呼叫端鋪 */
    dark?: boolean
    /**
     * 其他事件的落點：畫成淡灰小點，點一下發出 select。視野只依 landing 決定——
     * 不為其他事件擴大，落在目前視野外的就不畫（呼叫端要提示可自己用 isInViewport 算）
     */
    others?: readonly FieldMarker[]
    /** 落點的滑鼠提示；不給就寫落點的原始座標 */
    pointTitle?: string
  }>(),
  {
    label: undefined,
    showDecorations: true,
    dark: false,
    others: () => [],
    pointTitle: undefined,
  },
)

const emit = defineEmits<{ select: [id: number] }>()

// 深淺兩套線條與文字配色。視覺層級：落點 → 界外線與外野弧（規範邊界）→ 距離弧與內野（裝飾）→ 其他事件的點。
// 落點與本壘到落點的虛線用紅色：界內區是綠色，紅點在上面最跳，也跟打擊姿態的紅球同一個顏色。
// 落點與標籤文字的描邊（halo）是底色，壓在距離弧上時邊緣分得開。淺色的落點深一階（red-600），
// 淺底疊上綠色界內區後，red-500 的對比只剩 3:1 左右，點會發虛。
// 顏色只用 Tailwind 內建色盤（neutral、green、red），不用 Nuxt UI 的 primary：搬到沒有 Nuxt UI 的專案時，
// primary-* 沒有定義，界內區會變成預設的黑色填色，整片球場塗黑。green 與本站 primary 同色。
const TONES = {
  light: {
    fair: 'fill-green-500/10',
    ring: 'stroke-neutral-400/60',
    ringLabel: 'fill-neutral-500',
    infield: 'stroke-neutral-400/70',
    pitchersPlate: 'fill-neutral-400/70',
    boundary: 'stroke-neutral-600',
    home: 'fill-neutral-700',
    homeLabel: 'fill-neutral-600',
    text: 'fill-neutral-500',
    guide: 'stroke-red-600',
    point: 'fill-red-600 stroke-neutral-100',
    pointLabel: 'fill-neutral-800',
    other: 'fill-neutral-500/45 group-hover:fill-neutral-700 group-focus-visible:fill-neutral-700',
    halo: 'stroke-neutral-100',
    empty: 'fill-neutral-500',
  },
  dark: {
    fair: 'fill-green-500/10',
    ring: 'stroke-neutral-600/60',
    ringLabel: 'fill-neutral-500',
    infield: 'stroke-neutral-600/70',
    pitchersPlate: 'fill-neutral-600/70',
    boundary: 'stroke-neutral-400',
    home: 'fill-neutral-300',
    homeLabel: 'fill-neutral-400',
    text: 'fill-neutral-500',
    guide: 'stroke-red-500',
    point: 'fill-red-500 stroke-neutral-900',
    pointLabel: 'fill-neutral-100',
    other: 'fill-neutral-400/45 group-hover:fill-neutral-200 group-focus-visible:fill-neutral-200',
    halo: 'stroke-neutral-900',
    empty: 'fill-neutral-500',
  },
} as const
const tone = computed(() => TONES[props.dark ? 'dark' : 'light'])

const viewport = computed(() => computeFieldViewport(props.landing))
const scale = computed(() => createFieldScale(viewport.value))

// 字級與點的大小要保證「畫面上至少幾像素」：SVG 單位跟著 viewBox 一起縮，
// 球場圖塞進手機時整張只剩兩百多像素寬，照公尺算的 4 單位字會小到約 6px。
// 量實際渲染寬度換算回 SVG 單位；SSR 與第一次量到之前寬度是 0，一律用設計值。
const svgRef = ref<SVGSVGElement | null>(null)
const renderedWidth = ref(0)
let observer: ResizeObserver | undefined
onMounted(() => {
  if (!svgRef.value || typeof ResizeObserver === 'undefined')
    return
  observer = new ResizeObserver((entries) => {
    renderedWidth.value = entries[0]?.contentRect.width ?? 0
  })
  observer.observe(svgRef.value)
})
onBeforeUnmount(() => observer?.disconnect())

/** 輔助文字至少 11px、落點標籤至少 12px、其他事件點的點擊範圍至少 11px 半徑 */
const MIN_TEXT_PX = 11
const MIN_LABEL_PX = 12
const MIN_HIT_RADIUS_PX = 11

/** 像素 → SVG 單位；還量不到寬度時回傳 0，讓 Math.max 退回設計值 */
function pxToUnits(px: number): number {
  return renderedWidth.value > 0 ? (px * scale.value.viewWidth) / renderedWidth.value : 0
}

/** 設計字級（公尺）與最小像素取大者 */
const ringFontSize = computed(() => Math.max(3.2, pxToUnits(MIN_TEXT_PX - 1)))
const textFontSize = computed(() => Math.max(3.6, pxToUnits(MIN_TEXT_PX)))
const homeFontSize = computed(() => Math.max(4, pxToUnits(MIN_TEXT_PX)))
const labelFontSize = computed(() => Math.max(4, pxToUnits(MIN_LABEL_PX)))
const landingRadius = computed(() => Math.max(2, pxToUnits(4.5)))
const homeRadius = computed(() => Math.max(1.2, pxToUnits(2.5)))
const pitchersPlateRadius = computed(() => Math.max(1, pxToUnits(2)))

const fairTerritoryPath = computed(() => toPathData(scale.value, buildFairTerritoryPoints(), true))
const outfieldArcPath = computed(() => toPathData(scale.value, buildOutfieldArcPoints()))

const homeSvg = computed(() => scale.value.toSvg(0, 0))
const foulCornerLeftSvg = computed(() => scale.value.toSvg(-FOUL_LINE_X, FOUL_LINE_X))
const foulCornerRightSvg = computed(() => scale.value.toSvg(FOUL_LINE_X, FOUL_LINE_X))
/** 中外野標籤：字變大時往下挪，頂端不被裁掉 */
const centerFieldLabelY = computed(() =>
  Math.max(scale.value.toSvg(0, OUTFIELD_ARC_CENTER_Y + OUTFIELD_ARC_RADIUS).y - 2, textFontSize.value),
)
/** 本壘標籤：放本壘下方，字變大時不超出視野底端 */
const homeLabelY = computed(() =>
  Math.min(homeSvg.value.y + homeFontSize.value * 1.4, scale.value.viewHeight - homeFontSize.value * 0.25),
)

const rings = computed(() => DISTANCE_RINGS_M.map((radius) => {
  const points = buildDistanceRingPoints(radius)
  return {
    radius,
    d: toPathData(scale.value, points),
    // 左端（三壘側界外線交點）當標籤錨點，往外偏一點避免壓在線上
    labelSvg: scale.value.toSvg(points[0]!.x, points[0]!.y),
  }
}))

const infieldPath = computed(() =>
  toPathData(scale.value, [{ x: 0, y: 0 }, FIRST_BASE, SECOND_BASE, THIRD_BASE], true),
)
const pitchersPlateSvg = computed(() => scale.value.toSvg(PITCHERS_PLATE.x, PITCHERS_PLATE.y))

const landingSvg = computed(() => (props.landing ? scale.value.toSvg(props.landing.x, props.landing.y) : null))
const guidePath = computed(() => (landingSvg.value ? toPathData(scale.value, [{ x: 0, y: 0 }, props.landing!]) : ''))

/** 其他事件的點：只畫落在目前視野內的；點擊範圍比看得到的點大，手指點得到 */
const otherMarkers = computed(() => {
  const hitRadius = Math.max(3, pxToUnits(MIN_HIT_RADIUS_PX))
  const dotRadius = Math.max(1.3, pxToUnits(3))
  return props.others
    .filter(marker => isInViewport(viewport.value, marker))
    .map(marker => ({ ...marker, ...scale.value.toSvg(marker.x, marker.y), hitRadius, dotRadius, name: marker.label ?? `事件 ${marker.id}` }))
})

const labelLines = computed<readonly string[]>(() => {
  if (props.label == null)
    return ['預測落點']
  return typeof props.label === 'string' ? [props.label] : props.label
})

const landingTitle = computed(() => (props.landing
  ? props.pointTitle ?? `預測落點 (${formatFieldNumber(props.landing.x)}, ${formatFieldNumber(props.landing.y)}) m`
  : ''))

/** 估字寬時算窄字（約 0.3 em）的字元：空白、間隔號、小數點、逗號 */
const NARROW_CHARS = new Set([' ', '·', '.', ','])

/**
 * 估字寬（em）：中日韓文字與全形符號（U+2E80 起）1 em、空白與標點約 0.3 em、其餘約 0.56 em。
 * 只拿來排標籤位置，不求精確；估太寬會讓放得下的標籤被趕到另一側
 */
function estimateEm(text: string): number {
  let em = 0
  for (const char of text)
    em += char.codePointAt(0)! >= 0x2E80 ? 1 : NARROW_CHARS.has(char) ? 0.3 : 0.56
  return em
}

/**
 * 標籤位置：預設疊在點的右上方；右邊放不下換左邊，兩邊都放不下（手機上字相對大）就置中在點的正上方，
 * 並夾在視野內。上方貼齊視野頂端時改放點的下方。
 */
const labelLayout = computed(() => {
  const p = landingSvg.value
  if (!p)
    return null
  const fontSize = labelFontSize.value
  const lines = labelLines.value
  const width = Math.max(...lines.map(estimateEm)) * fontSize
  const gap = landingRadius.value + fontSize * 0.4
  const viewWidth = scale.value.viewWidth

  let anchor: 'start' | 'end' | 'middle' = 'start'
  let x = p.x + gap
  if (x + width > viewWidth - 1) {
    if (p.x - gap - width >= 1) {
      anchor = 'end'
      x = p.x - gap
    }
    else {
      anchor = 'middle'
      x = Math.min(Math.max(p.x, width / 2 + 1), viewWidth - width / 2 - 1)
    }
  }

  const lineHeight = fontSize * 1.2
  const blockHeight = lineHeight * lines.length
  const fitsAbove = p.y - gap - blockHeight >= 0
  const firstBaseline = fitsAbove
    ? p.y - gap - (lines.length - 1) * lineHeight
    : p.y + gap + fontSize * 0.9
  return { anchor, x, firstBaseline, lineHeight }
})

const noLandingSvg = computed(() => ({ x: scale.value.viewWidth / 2, y: scale.value.viewHeight * 0.15 }))

const ariaLabel = computed(() => {
  const base = props.landing
    ? `球場圖，預測落點約在 (${formatFieldNumber(props.landing.x)}, ${formatFieldNumber(props.landing.y)}) 公尺`
    : '球場圖，這筆結果沒有預測落點'
  return otherMarkers.value.length ? `${base}；另畫出 ${otherMarkers.value.length} 筆其他事件的落點` : base
})
</script>

<template>
  <svg
    ref="svgRef"
    class="h-auto w-full select-none"
    :viewBox="`0 0 ${scale.viewWidth} ${scale.viewHeight}`"
    preserveAspectRatio="xMidYMid meet"
    role="img"
    :aria-label="ariaLabel"
    data-testid="landing-field-chart"
  >
    <!-- 界內區域淡淡填色，界線本身用較深的線描邊 -->
    <path :d="fairTerritoryPath" :class="tone.fair" />

    <!-- 距離弧與內野：裝飾，比界線淡，可關 -->
    <g v-if="showDecorations" data-testid="landing-field-decorations">
      <g v-for="ring in rings" :key="ring.radius">
        <path :d="ring.d" fill="none" :class="tone.ring" stroke-width="0.4" />
        <text
          :x="ring.labelSvg.x - 1"
          :y="ring.labelSvg.y + ringFontSize * 0.45"
          text-anchor="end"
          :font-size="ringFontSize"
          :class="tone.ringLabel"
        >
          {{ ring.radius }} m
        </text>
      </g>
      <path :d="infieldPath" fill="none" :class="tone.infield" stroke-width="0.5" />
      <circle :cx="pitchersPlateSvg.x" :cy="pitchersPlateSvg.y" :r="pitchersPlateRadius" :class="tone.pitchersPlate" />
    </g>

    <!-- 界外線 + 外野弧：球場邊界公式，一律照畫 -->
    <g fill="none" :class="tone.boundary">
      <path :d="`M${foulCornerLeftSvg.x},${foulCornerLeftSvg.y} L${homeSvg.x},${homeSvg.y} L${foulCornerRightSvg.x},${foulCornerRightSvg.y}`" stroke-width="0.6" />
      <path :d="outfieldArcPath" stroke-width="0.6" />
    </g>

    <!-- 方位標示：本壘、一壘側／三壘側、中外野 -->
    <circle :cx="homeSvg.x" :cy="homeSvg.y" :r="homeRadius" :class="tone.home" />
    <text
      :x="homeSvg.x"
      :y="homeLabelY"
      text-anchor="middle"
      :font-size="homeFontSize"
      :class="[tone.homeLabel, tone.halo]"
      :stroke-width="homeFontSize * 0.25"
      paint-order="stroke"
      stroke-linejoin="round"
    >
      本壘
    </text>
    <!-- 方位字放畫面下緣兩角：放在界外線端點旁會超出視野被裁掉（端點離視野邊只有 8 m） -->
    <text x="2" :y="scale.viewHeight - textFontSize * 0.4" :font-size="textFontSize" :class="tone.text">
      ← 三壘側
    </text>
    <text :x="scale.viewWidth - 2" :y="scale.viewHeight - textFontSize * 0.4" text-anchor="end" :font-size="textFontSize" :class="tone.text">
      一壘側 →
    </text>
    <!-- 手機上字變大、被往下推到外野弧上，描邊讓它壓在線上也讀得清楚 -->
    <text
      :x="homeSvg.x"
      :y="centerFieldLabelY"
      text-anchor="middle"
      :font-size="textFontSize"
      :class="[tone.text, tone.halo]"
      :stroke-width="textFontSize * 0.25"
      paint-order="stroke"
      stroke-linejoin="round"
    >
      中外野 122 m
    </text>

    <!-- 其他事件的落點：淡灰小點，可點選切換（鍵盤 Tab 到點上按 Enter 也可以） -->
    <g
      v-for="marker in otherMarkers"
      :key="`other-${marker.id}`"
      class="group cursor-pointer"
      role="button"
      tabindex="0"
      :aria-label="`切換到${marker.name}`"
      data-testid="landing-point-other"
      @click="emit('select', marker.id)"
      @keydown.enter.prevent="emit('select', marker.id)"
      @keydown.space.prevent="emit('select', marker.id)"
    >
      <title>{{ marker.name }}</title>
      <circle :cx="marker.x" :cy="marker.y" :r="marker.hitRadius" fill="transparent" />
      <circle :cx="marker.x" :cy="marker.y" :r="marker.dotRadius" :class="tone.other" />
    </g>

    <!-- 落點：沒有落點時只顯示提示文字，球場照樣畫 -->
    <template v-if="landingSvg && labelLayout">
      <path :d="guidePath" fill="none" :class="tone.guide" stroke-width="0.5" stroke-dasharray="2.5 2" />
      <circle
        :cx="landingSvg.x"
        :cy="landingSvg.y"
        :r="landingRadius"
        :class="tone.point"
        stroke-width="0.8"
        data-testid="landing-point"
      >
        <title>{{ landingTitle }}</title>
      </circle>
      <text
        :font-size="labelFontSize"
        :text-anchor="labelLayout.anchor"
        :class="[tone.pointLabel, tone.halo]"
        :stroke-width="labelFontSize * 0.25"
        paint-order="stroke"
        stroke-linejoin="round"
        class="pointer-events-none"
        data-testid="landing-point-label"
      >
        <tspan
          v-for="(line, i) in labelLines"
          :key="i"
          :x="labelLayout.x"
          :y="labelLayout.firstBaseline + i * labelLayout.lineHeight"
          :font-weight="i === 0 ? 600 : undefined"
        >{{ line }}</tspan>
      </text>
    </template>
    <text
      v-else
      :x="noLandingSvg.x"
      :y="noLandingSvg.y"
      text-anchor="middle"
      :font-size="labelFontSize"
      :class="[tone.empty, tone.halo]"
      :stroke-width="labelFontSize * 0.25"
      paint-order="stroke"
      stroke-linejoin="round"
      data-testid="landing-missing"
    >
      這筆結果沒有預測落點
    </text>
  </svg>
</template>

<script setup lang="ts">
import type { FieldMarker, LandingPoint } from './core/fieldChart'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  buildDistanceRingPoints,
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
    /** 距離弧、紅土內野、壘包與投手丘；預設顯示 */
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

// 落點與白底資訊卡是主焦點；草地上的方位與刻度用淺色文字，距離弧保持低對比。
const TONES = {
  light: {
    grass: '#446d50',
    ring: 'stroke-white/20',
    ringLabel: 'fill-white/85',
    dirt: '#d6a17c',
    chalk: 'stroke-white/90',
    plate: 'fill-white stroke-orange-900/40',
    boundary: 'stroke-white/85',
    homeLabel: 'fill-white/85',
    text: 'fill-neutral-500',
    guide: 'stroke-red-600',
    point: 'fill-red-600 stroke-neutral-100',
    pointLabel: 'fill-neutral-900',
    other: 'fill-neutral-500/45 group-hover:fill-neutral-700 group-focus-visible:fill-neutral-700',
    halo: 'stroke-neutral-100',
    empty: 'fill-neutral-500',
  },
  dark: {
    grass: '#304f3e',
    ring: 'stroke-white/20',
    ringLabel: 'fill-white/85',
    dirt: '#bb8864',
    chalk: 'stroke-white/85',
    plate: 'fill-white stroke-orange-900/40',
    boundary: 'stroke-white/75',
    homeLabel: 'fill-white/85',
    text: 'fill-neutral-500',
    guide: 'stroke-red-500',
    point: 'fill-red-500 stroke-neutral-900',
    pointLabel: 'fill-neutral-900',
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

/** 輔助文字至少 11px、落點標籤至少 15px、其他事件點的點擊範圍至少 11px 半徑 */
const MIN_TEXT_PX = 11
const MIN_LABEL_PX = 15
const MIN_HIT_RADIUS_PX = 11

/** 像素 → SVG 單位；還量不到寬度時回傳 0，讓 Math.max 退回設計值 */
function pxToUnits(px: number): number {
  return renderedWidth.value > 0 ? (px * scale.value.viewWidth) / renderedWidth.value : 0
}

/** 設計字級（公尺）與最小像素取大者 */
const ringFontSize = computed(() => Math.max(3.2, pxToUnits(MIN_TEXT_PX - 1)))
const textFontSize = computed(() => Math.max(3.6, pxToUnits(MIN_TEXT_PX)))
const homeFontSize = computed(() => Math.max(4, pxToUnits(MIN_TEXT_PX)))
const labelFontSize = computed(() => Math.max(4.8, pxToUnits(MIN_LABEL_PX)))
const landingRadius = computed(() => Math.max(2, pxToUnits(4.5)))

// 草地維持 18 m 留邊：輪廓先外移 14 m，再加 4 m 圓角，避免轉角過度圓潤。
const grassPath = computed(() => {
  const offset = 14 * Math.SQRT2
  const radius = OUTFIELD_ARC_RADIUS + 14
  const center = OUTFIELD_ARC_CENTER_Y
  // 外移後的界外線 y = |x| − offset 與外野圓相交。
  const cornerX = (center + offset + Math.sqrt(2 * radius ** 2 - (center + offset) ** 2)) / 2
  const arc = Array.from({ length: 73 }, (_, i) => {
    const x = -cornerX + 2 * cornerX * i / 72
    return { x, y: center + Math.sqrt(radius ** 2 - x ** 2) }
  })
  return toPathData(scale.value, [{ x: 0, y: -offset }, ...arc], true)
})
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
  Math.min(homeSvg.value.y + 6 + homeFontSize.value, scale.value.viewHeight - homeFontSize.value * 0.25),
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
// 紅土外緣繞過二壘，內側留草地；僅作示意，不改動壘位與資料座標。
const infieldDirtPath = computed(() => {
  const arc = Array.from({ length: 37 }, (_, i) => {
    const angle = (165 - i * 150 / 36) * Math.PI / 180
    return { x: 29 * Math.cos(angle), y: PITCHERS_PLATE.y + 29 * Math.sin(angle) }
  })
  const outer = [{ x: -3, y: -3 }, ...arc, { x: 3, y: -3 }]
  const grass = [{ x: 0, y: 5 }, { x: 15, y: 20 }, { x: 0, y: 34 }, { x: -15, y: 20 }]
  return `${toPathData(scale.value, outer, true)} ${toPathData(scale.value, grass, true)}`
})
const bases = [FIRST_BASE, SECOND_BASE, THIRD_BASE]

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

/** 白底落點資訊卡：優先放右上方，空間不足換左邊，卡片邊界保持在視野內。 */
const labelLayout = computed(() => {
  const p = landingSvg.value
  if (!p)
    return null
  const fontSize = labelFontSize.value
  const lines = labelLines.value
  const width = Math.max(...lines.map((line, i) => estimateEm(line) * (i === 0 ? 1 : 0.8))) * fontSize
  const padding = fontSize * 0.55
  const cardWidth = width + padding * 2
  const gap = landingRadius.value + fontSize * 0.65
  const viewWidth = scale.value.viewWidth

  let cardX = p.x + gap
  if (cardX + cardWidth > viewWidth - 1)
    cardX = p.x - gap - cardWidth
  cardX = Math.max(1, Math.min(cardX, viewWidth - cardWidth - 1))

  const lineHeight = fontSize * 1.35
  const cardHeight = fontSize + (lines.length - 1) * lineHeight + padding * 2
  const cardY = Math.max(1, Math.min(p.y - gap - cardHeight, scale.value.viewHeight - cardHeight - 1))
  return {
    anchor: 'start' as const,
    x: cardX + padding,
    firstBaseline: cardY + padding + fontSize * 0.8,
    lineHeight,
    cardX,
    cardY,
    cardWidth,
    cardHeight,
    padding,
  }
})

const noLandingSvg = computed(() => ({ x: scale.value.viewWidth / 2, y: scale.value.viewHeight * 0.15 }))

// svg 用 role="group" 而不是 role="img"：img 會把整棵子樹當成一張圖，
// 裡面可點選的灰點（role="button"）報讀軟體就讀不到
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
    role="group"
    :aria-label="ariaLabel"
    data-testid="landing-field-chart"
  >
    <!-- 草地底色，紅土與白色場地標線疊在上方 -->
    <path :d="grassPath" :fill="tone.grass" :stroke="tone.grass" stroke-width="8" stroke-linejoin="round" />

    <g v-if="showDecorations" aria-hidden="true">
      <path :d="infieldDirtPath" :fill="tone.dirt" fill-rule="evenodd" />
      <g :transform="`translate(${homeSvg.x} ${homeSvg.y}) scale(1 -1)`">
        <circle cx="0" cy="0" r="6" :fill="tone.dirt" />
        <circle :cx="PITCHERS_PLATE.x" :cy="PITCHERS_PLATE.y" r="3" :fill="tone.dirt" />
      </g>
    </g>

    <!-- 距離弧與內野：裝飾，可關 -->
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
      <path :d="infieldPath" fill="none" :class="tone.chalk" stroke-width="0.35" />
      <g :transform="`translate(${homeSvg.x} ${homeSvg.y}) scale(1 -1)`" aria-hidden="true">
        <rect
          v-for="(base, i) in bases"
          :key="i"
          x="-0.9" y="-0.9" width="1.8" height="1.8"
          :transform="`translate(${base.x} ${base.y}) rotate(45)`"
          :class="tone.plate" stroke-width="0.15"
        />
        <rect x="-1.1" :y="PITCHERS_PLATE.y - 0.3" width="2.2" height="0.6" :class="tone.plate" stroke-width="0.12" />
        <g fill="none" :class="tone.chalk" stroke-width="0.25">
          <rect x="-3.6" y="-0.9" width="1.8" height="3.4" />
          <rect x="1.8" y="-0.9" width="1.8" height="3.4" />
        </g>
      </g>
    </g>

    <!-- 界外線 + 外野弧：球場邊界公式，一律照畫 -->
    <g fill="none" :class="tone.boundary">
      <path :d="`M${foulCornerLeftSvg.x},${foulCornerLeftSvg.y} L${homeSvg.x},${homeSvg.y} L${foulCornerRightSvg.x},${foulCornerRightSvg.y}`" stroke-width="0.6" />
      <path :d="outfieldArcPath" stroke-width="0.6" />
    </g>

    <!-- 方位標示：本壘、一壘側／三壘側、中外野 -->
    <!-- 本壘尖端固定在 (0, 0)，板面朝向投手；適度放大以利小畫面辨識 -->
    <path
      :transform="`translate(${homeSvg.x} ${homeSvg.y}) scale(1 -1)`"
      d="M0,0 L-1.1,1.1 L-1.1,2.2 L1.1,2.2 L1.1,1.1 Z"
      :class="tone.plate" stroke-width="0.15"
    />
    <text
      :x="homeSvg.x"
      :y="homeLabelY"
      text-anchor="middle"
      :font-size="homeFontSize"
      :class="tone.homeLabel"
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
    <!-- 中外野標籤置於深綠草地上，以淺色文字保持對比 -->
    <text
      :x="homeSvg.x"
      :y="centerFieldLabelY"
      text-anchor="middle"
      :font-size="textFontSize"
      :class="tone.homeLabel"
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
      <path :d="guidePath" fill="none" :class="tone.guide" stroke-width="0.7" stroke-dasharray="2.5 2" />
      <circle :cx="landingSvg.x" :cy="landingSvg.y" :r="landingRadius + 0.7" fill="white" />
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
      <rect
        :x="labelLayout.cardX" :y="labelLayout.cardY"
        :width="labelLayout.cardWidth" :height="labelLayout.cardHeight"
        :rx="labelLayout.padding * 0.6"
        fill="white" class="pointer-events-none stroke-neutral-200" stroke-width="0.3"
      />
      <text
        :font-size="labelFontSize"
        :text-anchor="labelLayout.anchor"
        :class="tone.pointLabel"
        class="pointer-events-none"
        data-testid="landing-point-label"
      >
        <tspan
          v-for="(line, i) in labelLines"
          :key="i"
          :x="labelLayout.x"
          :y="labelLayout.firstBaseline + i * labelLayout.lineHeight"
          :font-weight="i === 0 ? 600 : 400"
          :font-size="i === 0 ? labelFontSize : labelFontSize * 0.8"
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

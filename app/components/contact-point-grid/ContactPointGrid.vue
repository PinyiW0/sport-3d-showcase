<script setup lang="ts">
import type { StrikeZoneBounds } from '../baseball-field/core/fieldGeometry'
import type { ContactGridMarker, ContactPoint } from './core/contactGridScale'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { BALL_RADIUS, HOME_PLATE } from '../baseball-field/core/fieldGeometry'
import { isInView, ticksInRange, useContactGridScale } from './core/contactGridScale'

// 純 SVG 呈現擊球點在好球帶九宮格上的位置。元件本身只吃 x/z 數字與好球帶邊界，
// 不依賴 bpe-data，換任何資料來源都能用；BPE → props 的轉換交給 showcase 做。
//
// 捕手視角、+x 在畫面右側，刻意不像 strike-zone-grid 反轉 x 軸——理由見
// core/contactGridScale.ts 開頭與本模組 README「座標與視角」一節。

const props = withDefaults(
  defineProps<{
    /** 好球帶邊界（cm），由呼叫端依打者級別或實際身高推算，本元件不自己決定 */
    zone: StrikeZoneBounds
    /** 擊球點 [x, z]（cm）；null 表示這筆結果沒有擊球點，依規範不畫點 */
    point: ContactPoint | null
    /** 擊球點半徑（cm）。預設用真實球半徑，SVG 單位即 cm，畫出來就是真實大小 */
    pointRadius?: number
    /** 擊球點到兩軸的虛線輔助線 */
    showGuides?: boolean
    /** 深色配色（淺色底上用 false）。不跟頁面 colorMode 走，底色由呼叫端鋪 */
    dark?: boolean
    /**
     * 其他事件的擊球點：畫成淡灰小點，點一下發出 select。視野只依 point 決定——
     * 不為其他事件擴大，落在目前視野外的就不畫（呼叫端要提示可自己用 isInView 算）
     */
    others?: readonly ContactGridMarker[]
    /** 擊球點的滑鼠提示，例如原始座標；不給就用點旁的標籤文字 */
    pointTitle?: string
  }>(),
  {
    pointRadius: BALL_RADIUS,
    showGuides: true,
    dark: false,
    others: () => [],
    pointTitle: undefined,
  },
)

const emit = defineEmits<{ select: [id: number] }>()

// 深淺兩套線條與文字配色。視覺層級：擊球點 → 好球帶外框 → 地面線 → 格線與刻度 → 其他事件的點 → 格號。
// 擊球點與文字的描邊（halo）是底色：點壓在格線上、字壓在線上時邊緣分得開。
// 淺色底是 neutral-100，所以本壘板用白色填色才看得出來；擊球點深一階（green-600），
// green-500 在淺底上對比不到 3:1，點會發虛。
// 顏色只用 Tailwind 內建色盤（neutral、green），不用 Nuxt UI 的 primary：搬到沒有 Nuxt UI 的專案時，
// primary-* 沒有定義，擊球點會變成預設的黑色填色，深色畫布上等於看不到。green 與本站 primary 同色。
const TONES = {
  light: {
    ground: 'stroke-neutral-500',
    plate: 'fill-white stroke-neutral-400',
    line: 'stroke-neutral-400',
    text: 'fill-neutral-500',
    cellNumber: 'fill-neutral-400',
    zone: 'stroke-neutral-700',
    guide: 'stroke-green-600',
    point: 'fill-green-600 stroke-neutral-100',
    pointLabel: 'fill-neutral-800',
    other: 'fill-neutral-500/40 group-hover:fill-neutral-700 group-focus-visible:fill-neutral-700',
    halo: 'stroke-neutral-100',
    empty: 'fill-neutral-500',
  },
  dark: {
    ground: 'stroke-neutral-400',
    plate: 'fill-neutral-800 stroke-neutral-600',
    line: 'stroke-neutral-600',
    text: 'fill-neutral-400',
    cellNumber: 'fill-neutral-600',
    zone: 'stroke-neutral-300',
    guide: 'stroke-green-500',
    point: 'fill-green-500 stroke-neutral-900',
    pointLabel: 'fill-neutral-100',
    other: 'fill-neutral-400/40 group-hover:fill-neutral-200 group-focus-visible:fill-neutral-200',
    halo: 'stroke-neutral-900',
    empty: 'fill-neutral-500',
  },
} as const
const tone = computed(() => TONES[props.dark ? 'dark' : 'light'])

const scale = useContactGridScale(
  () => props.zone,
  () => props.point,
)

// 字級與點的大小要保證「畫面上至少幾像素」：SVG 單位跟著 viewBox 一起縮，
// 圖塞進手機的窄欄時，照 viewBox 比例算的字會小到讀不了。量實際渲染寬度換算回 SVG 單位。
// SSR 與第一次量到之前寬度是 0，一律用設計值。
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

/** 刻度、方位字等輔助文字至少 11px，點旁標籤至少 12px，其他事件點的點擊範圍至少 11px 半徑 */
const MIN_TEXT_PX = 11
const MIN_LABEL_PX = 12
const MIN_HIT_RADIUS_PX = 11

/**
 * 畫布邊距（cm）：左邊放 z 刻度數字（最長的「200」約 1.7 em 加間隔）、上面放 cm 單位字、
 * 下面放 x 刻度與三壘側／一壘側方位字，所以左、上、下三邊跟著字級走——字在窄畫面上放大時，
 * 邊距固定的話刻度數字會跟方位字疊在一起。右邊只要留一點空，固定 6。
 * 邊距不是資料視野的一部分：視野擴大只動 core 算出的 minX/maxX/minZ/maxZ。
 */
const PAD_EM = { left: 2.52, top: 2.1, bottom: 2.8 }
const PAD_RIGHT = 6

/**
 * 輔助文字的字級（cm）。設計值跟著資料視野高度走（預設 200 cm 高約 7.1），用 cm 指定而非 Tailwind 字級
 * （比照 pitch-distribution 的 countFontSize）。量到實際寬度後要保證至少 MIN_TEXT_PX：
 * 左邊距也跟著字級變，所以最小字級要解「字級 = 最小像素 × viewBox 寬 ÷ 實際寬」這條含字級本身的式子。
 */
const fontSize = computed(() => {
  const design = scale.value.viewHeight / 28
  const width = renderedWidth.value
  const room = width - MIN_TEXT_PX * PAD_EM.left
  if (width <= 0 || room <= 0)
    return design
  return Math.max(design, (MIN_TEXT_PX * (scale.value.viewWidth + PAD_RIGHT)) / room)
})

const pad = computed(() => ({
  left: fontSize.value * PAD_EM.left,
  right: PAD_RIGHT,
  top: fontSize.value * PAD_EM.top,
  bottom: fontSize.value * PAD_EM.bottom,
}))

const viewBoxWidth = computed(() => scale.value.viewWidth + pad.value.left + pad.value.right)
const viewBoxHeight = computed(() => scale.value.viewHeight + pad.value.top + pad.value.bottom)

/** 像素 → SVG 單位；還量不到寬度時回傳 0，讓 Math.max 退回設計值 */
function pxToUnits(px: number): number {
  return renderedWidth.value > 0 ? (px * viewBoxWidth.value) / renderedWidth.value : 0
}

const labelFontSize = computed(() => Math.max(fontSize.value * 1.1, pxToUnits(MIN_LABEL_PX)))
const cellNumberFontSize = computed(() => Math.max(fontSize.value * 0.72, pxToUnits(MIN_TEXT_PX - 1)))
/** 文字描邊寬度：字級的四分之一，壓在線上仍讀得清楚、又不會糊成一塊 */
const haloWidth = computed(() => fontSize.value * 0.25)

/** 場地座標(cm) → 加上畫布邊距後的實際繪製座標 */
function toSvg(x: number, z: number) {
  const p = scale.value.toSvg(x, z)
  return { x: p.x + pad.value.left, y: p.y + pad.value.top }
}

const zTicks = computed(() => ticksInRange(scale.value.minZ, scale.value.maxZ, 50))
const xTicks = computed(() => ticksInRange(scale.value.minX, scale.value.maxX, 25))

const groundY = computed(() => toSvg(0, 0).y)

/** 本壘板正視：貼地窄帶，寬度固定為本壘板寬（43.18cm），不隨好球帶隨級別變動 */
const plateBand = computed(() => {
  const left = toSvg(-HOME_PLATE.halfWidth, 0)
  const right = toSvg(HOME_PLATE.halfWidth, 0)
  const height = viewBoxHeight.value * 0.02
  return { x: left.x, y: groundY.value - height / 2, width: right.x - left.x, height }
})

/**
 * 九格的格號：由上而下、由三壘側到一壘側 1～9，與 baseball-field 的 getZoneCell
 * （row 從上緣算、col 從 zone.left 算）同一套編號，showcase 寫「第 8 格」時對得上圖。
 */
const cellNumbers = computed(() => {
  const { left, right, top, bottom } = props.zone
  const cellW = (right - left) / 3
  const cellH = (top - bottom) / 3
  return [0, 1, 2].flatMap(row => [0, 1, 2].map((col) => {
    const center = toSvg(left + cellW * (col + 0.5), top - cellH * (row + 0.5))
    return { number: row * 3 + col + 1, x: center.x, y: center.y }
  }))
})

const pointSvg = computed(() => (props.point ? toSvg(props.point.x, props.point.z) : null))

/** 其他事件的點：只畫落在目前視野內的；點擊範圍比看得到的點大，手指點得到 */
const otherMarkers = computed(() => {
  const hitRadius = Math.max(props.pointRadius * 1.5, pxToUnits(MIN_HIT_RADIUS_PX))
  const dotRadius = Math.max(props.pointRadius * 0.7, pxToUnits(3))
  return props.others
    .filter(marker => isInView(scale.value, marker))
    .map(marker => ({ ...marker, ...toSvg(marker.x, marker.z), hitRadius, dotRadius, name: marker.label ?? `事件 ${marker.id}` }))
})

/** 一位小數，負號換成 Unicode 減號（與 bpe-data 的精簡寫法同規則；本元件不依賴 bpe-data，就地寫一份） */
function formatNum(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1).replace('-', '−')
}

const pointLabel = computed(() =>
  props.point ? `x ${formatNum(props.point.x)} · z ${formatNum(props.point.z)} cm` : '',
)

/** 估字寬時算窄字（約 0.3 em）的字元：空白、間隔號、小數點、逗號 */
const NARROW_CHARS = new Set([' ', '·', '.', ','])

/**
 * 估字寬（em）：中日韓文字與全形符號（U+2E80 起）1 em、空白與標點約 0.3 em、其餘約 0.56 em。
 * 只拿來決定標籤放點的哪一側，不求精確；估太寬會讓放得下的標籤被趕到另一側
 */
function estimateEm(text: string): number {
  let em = 0
  for (const char of text)
    em += char.codePointAt(0)! >= 0x2E80 ? 1 : NARROW_CHARS.has(char) ? 0.3 : 0.56
  return em
}

/** 標籤先放點的右邊；右邊放不下（會被裁掉）才換到左邊 */
const labelOnLeft = computed(() => {
  const p = pointSvg.value
  if (!p)
    return false
  const width = estimateEm(pointLabel.value) * labelFontSize.value
  return p.x + props.pointRadius + 3 + width > viewBoxWidth.value - 1
})

/** 沒有擊球點時的提示放在好球帶上方的空白處，不壓在框線上 */
const emptySvg = computed(() => toSvg(0, (scale.value.maxZ + props.zone.top) / 2))

const ariaLabel = computed(() => {
  const base = props.point
    ? `擊球點九宮格，擊球點 x ${formatNum(props.point.x)}、z ${formatNum(props.point.z)} 公分`
    : '擊球點九宮格，這筆結果沒有擊球點'
  return otherMarkers.value.length ? `${base}；另畫出 ${otherMarkers.value.length} 筆其他事件的擊球點` : base
})
</script>

<template>
  <svg
    ref="svgRef"
    class="h-auto w-full select-none"
    :viewBox="`0 0 ${viewBoxWidth} ${viewBoxHeight}`"
    preserveAspectRatio="xMidYMid meet"
    role="img"
    :aria-label="ariaLabel"
    data-testid="contact-point-grid"
  >
    <!-- 地面線 z=0 -->
    <line
      :x1="toSvg(scale.minX, 0).x"
      :y1="groundY"
      :x2="toSvg(scale.maxX, 0).x"
      :y2="groundY"
      :class="tone.ground"
      stroke-width="0.8"
    />

    <!-- 本壘板正視：貼地窄帶 -->
    <rect
      :x="plateBand.x"
      :y="plateBand.y"
      :width="plateBand.width"
      :height="plateBand.height"
      :class="tone.plate"
      stroke-width="0.5"
    />

    <!-- z 軸刻度（左側，每 50cm，含數字與 cm 單位） -->
    <g :class="tone.line">
      <line
        v-for="tick in zTicks"
        :key="`z-tick-${tick}`"
        :x1="toSvg(scale.minX, tick).x - 2"
        :y1="toSvg(scale.minX, tick).y"
        :x2="toSvg(scale.minX, tick).x"
        :y2="toSvg(scale.minX, tick).y"
        stroke-width="0.5"
      />
    </g>
    <g :class="tone.text" :font-size="fontSize">
      <text
        v-for="tick in zTicks"
        :key="`z-label-${tick}`"
        :x="toSvg(scale.minX, tick).x - 3"
        :y="toSvg(scale.minX, tick).y + fontSize * 0.32"
        text-anchor="end"
      >{{ String(tick).replace('-', '−') }}</text>
      <!-- 單位字放在最上面那個刻度數字的正上方，隔一行，不跟數字疊在一起 -->
      <text
        :x="toSvg(scale.minX, scale.maxZ).x - 3"
        :y="Math.max(toSvg(scale.minX, scale.maxZ).y - fontSize * 0.9, fontSize * 0.85)"
        text-anchor="end"
      >cm</text>
    </g>

    <!-- x 軸刻度（下方，每 25cm） -->
    <g :class="tone.line">
      <line
        v-for="tick in xTicks"
        :key="`x-tick-${tick}`"
        :x1="toSvg(tick, scale.minZ).x"
        :y1="toSvg(tick, scale.minZ).y"
        :x2="toSvg(tick, scale.minZ).x"
        :y2="toSvg(tick, scale.minZ).y + 2"
        stroke-width="0.5"
      />
    </g>
    <g :class="tone.text" :font-size="fontSize" text-anchor="middle">
      <text
        v-for="tick in xTicks"
        :key="`x-label-${tick}`"
        :x="toSvg(tick, scale.minZ).x"
        :y="toSvg(tick, scale.minZ).y + fontSize * 1.3"
      >{{ String(tick).replace('-', '−') }}</text>
    </g>

    <!-- 方位字：捕手視角，−x 三壘側在左、+x 一壘側在右（不依打者慣用手翻轉） -->
    <g :class="tone.text" :font-size="fontSize">
      <text :x="toSvg(scale.minX, scale.minZ).x" :y="viewBoxHeight - fontSize * 0.4" text-anchor="start">
        三壘側
      </text>
      <text :x="toSvg(scale.maxX, scale.minZ).x" :y="viewBoxHeight - fontSize * 0.4" text-anchor="end">
        一壘側
      </text>
    </g>

    <!-- 格號 1～9：淡淡標在每格正中，說明列寫「第 8 格」時對得上。只標位置，不依好壞球換色 -->
    <g :class="tone.cellNumber" :font-size="cellNumberFontSize" text-anchor="middle" data-testid="contact-grid-cell-numbers">
      <text
        v-for="cell in cellNumbers"
        :key="`cell-${cell.number}`"
        :x="cell.x"
        :y="cell.y + cellNumberFontSize * 0.35"
      >{{ cell.number }}</text>
    </g>

    <!-- 好球帶外框與 3×3 內線（格子不假設正方形） -->
    <g :class="tone.line" fill="none">
      <line
        v-for="(line, i) in scale.gridLines"
        :key="`grid-${i}`"
        :x1="line.x1 + pad.left"
        :y1="line.y1 + pad.top"
        :x2="line.x2 + pad.left"
        :y2="line.y2 + pad.top"
        stroke-width="0.5"
      />
      <rect
        :x="scale.zoneRect.x + pad.left"
        :y="scale.zoneRect.y + pad.top"
        :width="scale.zoneRect.width"
        :height="scale.zoneRect.height"
        :class="tone.zone"
        stroke-width="1"
      />
    </g>

    <!-- 其他事件的擊球點：淡灰小點，可點選切換（鍵盤 Tab 到點上按 Enter 也可以） -->
    <g
      v-for="marker in otherMarkers"
      :key="`other-${marker.id}`"
      class="group cursor-pointer"
      role="button"
      tabindex="0"
      :aria-label="`切換到${marker.name}`"
      data-testid="contact-point-other"
      @click="emit('select', marker.id)"
      @keydown.enter.prevent="emit('select', marker.id)"
      @keydown.space.prevent="emit('select', marker.id)"
    >
      <title>{{ marker.name }}</title>
      <circle :cx="marker.x" :cy="marker.y" :r="marker.hitRadius" fill="transparent" />
      <circle :cx="marker.x" :cy="marker.y" :r="marker.dotRadius" :class="tone.other" />
    </g>

    <!-- 擊球點：輔助線 + 圓點 + 標籤 -->
    <template v-if="pointSvg">
      <g v-if="showGuides" :class="tone.guide" stroke-dasharray="2 2">
        <line
          :x1="toSvg(scale.minX, 0).x"
          :y1="pointSvg.y"
          :x2="pointSvg.x"
          :y2="pointSvg.y"
          stroke-width="0.5"
        />
        <line
          :x1="pointSvg.x"
          :y1="pointSvg.y"
          :x2="pointSvg.x"
          :y2="toSvg(0, scale.minZ).y"
          stroke-width="0.5"
        />
      </g>
      <circle
        :cx="pointSvg.x"
        :cy="pointSvg.y"
        :r="pointRadius"
        :class="tone.point"
        stroke-width="1"
        data-testid="contact-point"
      >
        <title>{{ pointTitle ?? pointLabel }}</title>
      </circle>
      <text
        :x="pointSvg.x + (labelOnLeft ? -pointRadius - 3 : pointRadius + 3)"
        :y="pointSvg.y - pointRadius - 2"
        :text-anchor="labelOnLeft ? 'end' : 'start'"
        :font-size="labelFontSize"
        :class="[tone.pointLabel, tone.halo]"
        :stroke-width="haloWidth"
        paint-order="stroke"
        stroke-linejoin="round"
        class="pointer-events-none"
        data-testid="contact-point-label"
      >{{ pointLabel }}</text>
    </template>

    <!-- 沒有擊球點：照樣畫九宮格與刻度，版面不塌，改顯示這行字 -->
    <text
      v-else
      :x="viewBoxWidth / 2"
      :y="emptySvg.y"
      text-anchor="middle"
      :font-size="labelFontSize"
      :class="[tone.empty, tone.halo]"
      :stroke-width="haloWidth"
      paint-order="stroke"
      stroke-linejoin="round"
    >
      這筆結果沒有擊球點
    </text>
  </svg>
</template>

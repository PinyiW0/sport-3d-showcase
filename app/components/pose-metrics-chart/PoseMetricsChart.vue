<script setup lang="ts">
import type { ChartTheme } from './core/palette'
import type { MetricKey, PoseMetrics } from './core/types'
import { computed, ref, useId } from 'vue'
import {
  buildLinePath,
  createChartScale,
  DEFAULT_FILTER_SIGMA,
  DEGREE_TICK_STEPS,
  frameAtX,
  layoutEventLines,
  layoutTooltip,
  MAX_BRIDGE_DELTA_DEG,
  MAX_BRIDGE_FRAMES,
} from './core/chartGeometry'
import { chartPalette } from './core/palette'
import { ANGLE_DOMAIN, metricInfo, NOMINAL_FRAME_SPAN } from './core/types'
import { useElementWidth } from './core/useElementWidth'

// 可攜性約束：內部只用相對 import、不用 NuxtUI。一條指標一個 <path>，
// 748 個點合成一條，七條疊起來也只有七個節點。
//
// 字級一律用 SVG 的 font-size（user unit）而非 text-* class——文字要跟著
// viewBox 縮放，掛 Tailwind 字級會在窄螢幕上變成大到蓋住圖的字。

const props = withDefaults(
  defineProps<{
    /** parseBiomech 的輸出 */
    metrics: PoseMetrics
    /** 要畫哪幾條，依陣列順序疊放（後面的畫在上層） */
    metricKeys: MetricKey[]
    /** viewBox 尺寸（user unit，不是 px） */
    viewWidth?: number
    viewHeight?: number
    /**
     * X 軸固定畫到第幾影格。交付不足時右邊留白，超過的影格畫不出來。
     * 預設是名目擷取長度，理由與取捨見 core/types.ts 的 NOMINAL_FRAME_SPAN。
     */
    frameSpan?: number
    /** 抬腿／踏地／出手三條垂直參考線 */
    showEvents?: boolean
    /** 走 Catmull-Rom 平滑；關掉就是逐點直線 */
    smooth?: boolean
    /**
     * 把安靜的小缺口接起來（≤10 格且兩端差 ≤15 度）。
     * 關掉的話每個缺測都斷，肩膀外旋會碎成 25 段。
     */
    bridgeGaps?: boolean
    /** 關掉就沒有游標與數值面板（錄影用的靜態頁會關） */
    interactive?: boolean
    /**
     * 高斯低通的 σ（影格）。這是唯一會動到數值的處理：
     * 0 = 原封不動，1.5 = 曲率降 78%、峰值不變、出手格偏 2.6 度。
     */
    filterSigma?: number
    /**
     * 缺口的兩道門檻。預設值是對 250fps 這批資料調的；換一批資料應該由
     * `core/autoTuning.ts` 依實際 fps 與缺口分布推導後傳進來，不要沿用預設。
     */
    maxBridgeFrames?: number
    maxBridgeDelta?: number
    /**
     * 配色主題。兩套不是同一組顏色換亮度——深底用 200–300 色階、白底得換成
     * 500–600，否則線會淡到看不見。詳見 core/palette.ts。
     */
    theme?: ChartTheme
  }>(),
  {
    viewWidth: 960,
    viewHeight: 360,
    frameSpan: NOMINAL_FRAME_SPAN,
    showEvents: true,
    smooth: true,
    bridgeGaps: true,
    interactive: true,
    filterSigma: DEFAULT_FILTER_SIGMA,
    maxBridgeFrames: MAX_BRIDGE_FRAMES,
    maxBridgeDelta: MAX_BRIDGE_DELTA_DEG,
    theme: 'light',
  },
)

const palette = computed(() => chartPalette(props.theme))
const svgRef = ref<SVGSVGElement | null>(null)

/**
 * 游標停在第幾影格，null 為沒有游標。
 *
 * 用 defineModel 是為了兩種用法都成立：父層綁 v-model 就能拿去做別的事
 * （例如同步 3D 骨架），不綁就由元件自己記著，圖表仍然可以單獨互動。
 *
 * 發出的是**軸範圍**內的影格（0 到 frameSpan），可能超出實際交付的長度——
 * 交付不足時游標仍走得到尾端。消費端要自己處理越界。
 */
const hoverFrame = defineModel<number | null>('hoverFrame', { default: null })

/**
 * 窄畫面的分界與字級。
 *
 * 字級是 SVG user unit，會跟著 viewBox 縮放：960 寬的圖塞進 375px 手機時，
 * 13 單位的字實際只剩 5px。所以窄畫面要把 user unit 的字級加大（渲染出來才
 * 回到可讀的實際尺寸），順便把 15 個 X 刻度減到 6 個，否則數字會疊在一起。
 */
const COMPACT_BREAKPOINT = 560
const FONT_SIZE = 13
const COMPACT_FONT_SIZE = 24
/**
 * 裁切區比繪圖區上下各放寬一點。
 *
 * 平滑曲線的控制點在急轉處會 overshoot（肩膀外旋衝到 166.6 時就會頂出去），
 * 剛好貼著邊界裁的話那一段會被切平、看起來像資料真的撞到 180 的天花板。
 * 放寬讓 overshoot 有地方去，又不至於畫到軸標籤上。
 */
const CLIP_BLEED = 8

// clipPath 的 id 必須逐實例唯一，同頁掛兩張圖才不會互相裁到
const clipId = useId()

/** 固定長度，不隨資料伸縮——交付不足的部分就是空的 */
const xDomain = computed<[number, number]>(() => [0, props.frameSpan])

const renderedWidth = useElementWidth(svgRef)
const compact = computed(() => renderedWidth.value > 0 && renderedWidth.value < COMPACT_BREAKPOINT)
const AXIS_FONT_SIZE = computed(() => (compact.value ? COMPACT_FONT_SIZE : FONT_SIZE))
const EVENT_FONT_SIZE = AXIS_FONT_SIZE

/**
 * 留白跟著字級長，不能寫死。
 *
 * top 要放得下「(度)」一整行**再加**最高刻度的半個字高——原本寫死 26 單位，
 * 兩者只好共用同一段空間，「(度)」直接疊在 180 上（實測垂直重疊 8.1／字高
 * 15.5）。窄畫面字級加大到 24 時更嚴重，那是寫死像素的必然結果。
 * bottom 要放得下 X 軸刻度與「影格」兩行。right 要放得下最後一個 X 刻度的右半
 * ——刻度是置中對齊在繪圖區右緣的，原本寫死 18 單位在窄畫面（字級 24）會把
 * 「750」切掉 4.1 單位。
 */
const PADDING = computed(() => {
  const unit = AXIS_FONT_SIZE.value
  return { top: unit * 2.8, right: Math.max(18, unit * 1.5), bottom: unit * 3.4, left: unit * 4 }
})

/** 「(度)」擺在最高刻度**上方**一行的位置，不與它共線 */
const unitLabelY = computed(() => PADDING.value.top - AXIS_FONT_SIZE.value * 1.15)

const scale = computed(() =>
  createChartScale({
    width: props.viewWidth,
    height: props.viewHeight,
    padding: PADDING.value,
    xDomain: xDomain.value,
    // 固定 ±180：多系列疊圖靠共用一條不動的軸互相比較
    yDomain: ANGLE_DOMAIN,
    xTickCount: compact.value ? 6 : 15,
    xTickCandidates: [10, 25, 50, 100, 250],
    // 9 條格線（每 45 度）在七條線之上太吵，減到 5 條（±180／±90／0）
    yTickCount: 5,
    yTickCandidates: DEGREE_TICK_STEPS,
  }),
)

interface Line {
  key: MetricKey
  label: string
  path: string
  stroke: string
}

const lines = computed<Line[]>(() =>
  props.metricKeys.flatMap((key) => {
    const values = props.metrics.series[key]
    if (!values?.some(v => v !== null))
      return []

    const info = metricInfo(key)
    return [{
      key,
      label: info.label,
      stroke: palette.value.metrics[key].stroke,
      path: buildLinePath(
        values,
        (index, value) => ({ x: scale.value.toX(index), y: scale.value.toY(value) }),
        {
          wraps: info.wraps,
          smooth: props.smooth,
          filterSigma: props.filterSigma,
          maxBridgeFrames: props.bridgeGaps ? props.maxBridgeFrames : 0,
          maxBridgeDelta: props.maxBridgeDelta,
        },
      ),
    }]
  }),
)

const eventLines = computed(() =>
  props.showEvents
    ? layoutEventLines(
        // 事件線與膠囊不在 clipPath 內，越界的會畫到繪圖區外
        props.metrics.events.filter(e => e.frameIndex <= props.frameSpan).map(e => ({
          key: e.key,
          label: e.label,
          x: scale.value.toX(e.frameIndex),
        })),
        scale.value,
        { fontSize: EVENT_FONT_SIZE.value },
      )
    : [],
)

const zeroY = computed(() => scale.value.toY(0))

// ---- 游標與數值面板 ----

/**
 * 指標事件的 client 座標 → 影格。
 *
 * viewBox 走 `xMidYMid meet` 且元素是 `w-full h-auto`，所以寬度方向恆定填滿，
 * 用寬度比例換算就夠，不必動用 SVG 的 matrix API。
 */
function frameFromPointer(event: PointerEvent): number | null {
  const element = svgRef.value
  // 樣本還沒到手時不要冒出一條游標配一整面破折號
  if (!element || !props.metrics.frameCount)
    return null
  const rect = element.getBoundingClientRect()
  if (!rect.width)
    return null
  const svgX = (event.clientX - rect.left) * (props.viewWidth / rect.width)
  return frameAtX(svgX, scale.value)
}

function onPointerMove(event: PointerEvent) {
  if (props.interactive)
    hoverFrame.value = frameFromPointer(event)
}

function onPointerLeave() {
  hoverFrame.value = null
}

/**
 * 觸控要 capture 才追得到拖出圖外的手指——沒有 capture 的話 pointermove
 * 一離開元素就斷，游標會卡在邊緣。
 */
function onPointerDown(event: PointerEvent) {
  if (!props.interactive)
    return
  // optional call：jsdom 沒有 Pointer Capture API，測試環境會是 undefined
  if (event.pointerType !== 'mouse')
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId)
  hoverFrame.value = frameFromPointer(event)
}

function onPointerUp(event: PointerEvent) {
  const target = event.currentTarget as Element
  if (target.hasPointerCapture?.(event.pointerId))
    target.releasePointerCapture?.(event.pointerId)
}

const cursorX = computed(() =>
  hoverFrame.value === null ? null : scale.value.toX(hoverFrame.value),
)

const tooltip = computed(() => {
  const frame = hoverFrame.value
  const x = cursorX.value
  if (frame === null || x === null || !props.interactive || !lines.value.length)
    return null

  const rows = lines.value.map((line) => {
    const value = props.metrics.series[line.key]?.[frame]
    return {
      key: line.key,
      // 冒號算進 label，寬度估算才對得上實際渲染的字數
      label: `${line.label}角度：`,
      // 缺測就寫沒有量到，不要留空讓人以為是 0
      value: value === null || value === undefined ? '—' : `${value.toFixed(1)}°`,
      fill: palette.value.metrics[line.key].fill,
    }
  })

  return layoutTooltip(rows, scale.value, x, { fontSize: AXIS_FONT_SIZE.value })
})

const ariaLabel = computed(() => {
  const names = lines.value.map(l => l.label).join('、')
  return names
    ? `投手姿態角度折線圖，共 ${lines.value.length} 條指標（${names}），`
    + `橫軸固定第 0 到 ${props.frameSpan} 影格，資料到第 ${Math.max(0, props.metrics.frameCount - 1)} 影格`
    : '投手姿態角度折線圖，目前沒有選取任何指標'
})
</script>

<template>
  <svg
    ref="svgRef"
    class="h-auto w-full touch-pan-y select-none"
    :class="interactive ? 'cursor-crosshair' : ''"
    :viewBox="`0 0 ${viewWidth} ${viewHeight}`"
    preserveAspectRatio="xMidYMid meet"
    role="img"
    :aria-label="ariaLabel"
    data-testid="pose-metrics-chart"
    @pointermove="onPointerMove"
    @pointerdown="onPointerDown"
    @pointerup="onPointerUp"
    @pointerleave="onPointerLeave"
    @pointercancel="onPointerLeave"
  >
    <defs>
      <clipPath :id="clipId">
        <rect
          :x="scale.plot.x"
          :y="scale.plot.y - CLIP_BLEED"
          :width="scale.plot.width"
          :height="scale.plot.height + CLIP_BLEED * 2"
        />
      </clipPath>
    </defs>

    <!-- 繪圖區底色固定深底：七條粉彩線的對比是照深底調的，跟著主題翻面會整組跑掉 -->
    <rect
      :x="scale.plot.x"
      :y="scale.plot.y"
      :width="scale.plot.width"
      :height="scale.plot.height"
      :class="[palette.canvas, palette.canvasBorder]"
      stroke-width="1"
      data-testid="pose-metrics-canvas"
    />

    <!-- 水平格線 -->
    <g :class="palette.grid" fill="none">
      <line
        v-for="tick in scale.yTicks"
        :key="`grid-${tick.value}`"
        :x1="scale.plot.x"
        :y1="tick.position"
        :x2="scale.plot.x + scale.plot.width"
        :y2="tick.position"
        stroke-width="1"
      />
    </g>

    <!-- 零線：正負分界，畫得比格線亮且用虛線區隔 -->
    <line
      :x1="scale.plot.x"
      :y1="zeroY"
      :x2="scale.plot.x + scale.plot.width"
      :y2="zeroY"
      :class="palette.zeroLine"
      stroke-width="1.5"
      stroke-dasharray="8 6"
      data-testid="pose-metrics-zero-line"
    />

    <!-- 事件參考線：黃色貫穿全高，膠囊標籤壓在頂端 -->
    <g v-if="eventLines.length" data-testid="pose-metrics-events">
      <line
        v-for="line in eventLines"
        :key="`event-line-${line.key}`"
        :x1="line.x"
        :y1="line.y1"
        :x2="line.x"
        :y2="line.y2"
        :class="palette.eventLine"
        stroke-width="1.5"
        stroke-dasharray="5 4"
      />
    </g>

    <!-- 曲線：缺測與 ±180 環繞處都已在 core 斷開，這裡只負責畫。
         裁進繪圖區，免得平滑後的控制點把線甩出邊界 -->
    <g :clip-path="`url(#${clipId})`" fill="none">
      <path
        v-for="line in lines"
        :key="line.key"
        :d="line.path"
        :class="line.stroke"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        :data-testid="`pose-metrics-line-${line.key}`"
      />
    </g>

    <!-- 事件膠囊畫在曲線之上，否則會被線穿過去 -->
    <g v-for="line in eventLines" :key="`event-chip-${line.key}`" :data-testid="`pose-metrics-event-${line.key}`">
      <rect
        :x="line.chip.x"
        :y="line.chip.y"
        :width="line.chip.width"
        :height="line.chip.height"
        :class="palette.eventChip"
      />
      <text
        :x="line.chip.textX"
        :y="line.chip.textY"
        text-anchor="middle"
        dominant-baseline="central"
        :font-size="EVENT_FONT_SIZE"
        :class="palette.eventChipText"
      >
        {{ line.chip.text }}
      </text>
    </g>

    <!-- Y 軸刻度（在繪圖區外，跟著頁面主題走） -->
    <text
      v-for="tick in scale.yTicks"
      :key="`y-${tick.value}`"
      :x="scale.plot.x - 10"
      :y="tick.position"
      text-anchor="end"
      dominant-baseline="central"
      :font-size="AXIS_FONT_SIZE"
      font-weight="600"
      :class="palette.axisLabel"
    >
      {{ tick.label }}
    </text>

    <!-- X 軸刻度（影格） -->
    <text
      v-for="tick in scale.xTicks"
      :key="`x-${tick.value}`"
      :x="tick.position"
      :y="scale.plot.y + scale.plot.height + AXIS_FONT_SIZE + 8"
      text-anchor="middle"
      :font-size="AXIS_FONT_SIZE"
      font-weight="600"
      :class="palette.axisLabel"
    >
      {{ tick.label }}
    </text>

    <text
      :x="scale.plot.x + scale.plot.width / 2"
      :y="scale.plot.y + scale.plot.height + AXIS_FONT_SIZE * 2 + 12"
      text-anchor="middle"
      :font-size="AXIS_FONT_SIZE"
      :class="palette.axisMuted"
    >
      影格
    </text>

    <text
      :x="scale.plot.x - 10"
      :y="unitLabelY"
      text-anchor="end"
      :font-size="AXIS_FONT_SIZE"
      :class="palette.axisMuted"
      data-testid="pose-metrics-y-unit"
    >
      (度)
    </text>

    <text
      v-if="!lines.length"
      :x="scale.plot.x + scale.plot.width / 2"
      :y="scale.plot.y + scale.plot.height / 2"
      text-anchor="middle"
      dominant-baseline="central"
      :font-size="AXIS_FONT_SIZE"
      :class="palette.emptyText"
      data-testid="pose-metrics-empty"
    >
      沒有選取任何指標
    </text>

    <!-- 游標線與數值面板畫在最上層，蓋過曲線 -->
    <line
      v-if="cursorX !== null"
      :x1="cursorX"
      :y1="scale.plot.y"
      :x2="cursorX"
      :y2="scale.plot.y + scale.plot.height"
      :class="palette.cursor"
      stroke-width="3"
      data-testid="pose-metrics-cursor"
    />

    <g v-if="tooltip" data-testid="pose-metrics-tooltip">
      <polygon :points="tooltip.tailPoints" :class="[palette.tooltipSurface, palette.tooltipBorder]" stroke-width="1" />
      <rect
        :x="tooltip.x"
        :y="tooltip.y"
        :width="tooltip.width"
        :height="tooltip.height"
        :class="[palette.tooltipSurface, palette.tooltipBorder]"
        stroke-width="1"
      />
      <text
        :x="tooltip.titleX"
        :y="tooltip.titleY"
        :font-size="AXIS_FONT_SIZE"
        font-weight="600"
        :class="palette.tooltipTitle"
      >
        {{ hoverFrame }} frame
      </text>
      <line
        v-if="tooltip.dividerY !== null"
        :x1="tooltip.x + 10"
        :y1="tooltip.dividerY"
        :x2="tooltip.x + tooltip.width - 10"
        :y2="tooltip.dividerY"
        :class="palette.tooltipDivider"
        stroke-width="1"
      />
      <g v-for="row in tooltip.rows" :key="row.key" :data-testid="`pose-metrics-tooltip-${row.key}`">
        <rect
          :x="row.swatchX"
          :y="row.swatchY"
          :width="row.swatchWidth"
          :height="row.swatchHeight"
          :class="row.fill"
        />
        <text
          :x="row.labelX"
          :y="row.textY"
          dominant-baseline="central"
          :font-size="AXIS_FONT_SIZE"
          :class="palette.tooltipLabel"
        >
          {{ row.label }}
        </text>
        <text
          :x="row.valueX"
          :y="row.textY"
          text-anchor="end"
          dominant-baseline="central"
          :font-size="AXIS_FONT_SIZE"
          font-weight="600"
          class="tabular-nums" :class="[palette.tooltipValue]"
        >
          {{ row.value }}
        </text>
      </g>
    </g>
  </svg>
</template>

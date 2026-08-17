<script setup lang="ts">
import type { ChartTheme } from './core/palette'
import type { MetricKey, PoseMetrics } from './core/types'
import { computed, ref, useId } from 'vue'
import {
  buildLinePath,
  buildLineSegments,
  DEFAULT_FILTER_SIGMA,
  DEGREE_TICK_STEPS,
  frameAtX,
  layoutStackedRows,
  MAX_BRIDGE_DELTA_DEG,
  MAX_BRIDGE_FRAMES,
} from './core/chartGeometry'
import { chartPalette } from './core/palette'
import { metricInfo, NOMINAL_FRAME_SPAN } from './core/types'
import { useElementWidth } from './core/useElementWidth'

// small multiples 版面：一條指標一列，共用時間軸與事件線，各列用自己的最佳值域。
//
// 與疊圖版（PoseMetricsChart.vue）並存而不是取代：疊圖看得到交叉點，分列看得清
// 個別走勢。兩者共用 core 的所有純函式與色表，差別只在版面。

const props = withDefaults(
  defineProps<{
    metrics: PoseMetrics
    /** 要畫哪幾條，順序即列的順序 */
    metricKeys: MetricKey[]
    viewWidth?: number
    /** 每一列繪圖區的高度 */
    rowHeight?: number
    /**
     * X 軸固定畫到第幾影格。交付不足時右邊留白，超過的影格畫不出來。
     * 預設是名目擷取長度，理由與取捨見 core/types.ts 的 NOMINAL_FRAME_SPAN。
     */
    frameSpan?: number
    showEvents?: boolean
    smooth?: boolean
    bridgeGaps?: boolean
    interactive?: boolean
    filterSigma?: number
    maxBridgeFrames?: number
    maxBridgeDelta?: number
    theme?: ChartTheme
  }>(),
  {
    viewWidth: 960,
    rowHeight: 62,
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

/**
 * 游標停在第幾影格，null 為沒有游標。
 *
 * 發出的是**軸範圍**內的影格（0 到 frameSpan），可能超出實際交付的長度——
 * 交付不足時游標仍走得到尾端。消費端（例如未來連動 3D 骨架）要自己處理越界。
 */
const hoverFrame = defineModel<number | null>('hoverFrame', { default: null })

const ROW_GAP = 10
/** 窄畫面：字級是 user unit 會跟著縮，所以要加大；刻度數也得減 */
const COMPACT_BREAKPOINT = 560
const FONT_SIZE = 12
const COMPACT_FONT_SIZE = 24

const palette = computed(() => chartPalette(props.theme))
const clipId = useId()
const svgRef = ref<SVGSVGElement | null>(null)

const renderedWidth = useElementWidth(svgRef)
const compact = computed(() => renderedWidth.value > 0 && renderedWidth.value < COMPACT_BREAKPOINT)
const AXIS_FONT_SIZE = computed(() => (compact.value ? COMPACT_FONT_SIZE : FONT_SIZE))
const LABEL_FONT_SIZE = computed(() => AXIS_FONT_SIZE.value + 1)

/**
 * 左邊要放得下「肩膀外旋」四個字加值域刻度，右邊留給游標讀數，
 * 上面留兩列給避讓後的事件標籤。字級一放大，留白也要跟著長。
 */
const PADDING = computed(() => {
  const unit = AXIS_FONT_SIZE.value
  return {
    top: unit * 2 + 10,
    right: unit * 6,
    bottom: unit * 3.5,
    left: unit * 8.5,
  }
})

/** 左側標籤區的排版，全部跟著字級縮放，不寫死像素偏移 */
const labelLayout = computed(() => {
  const unit = AXIS_FONT_SIZE.value
  const swatchWidth = unit * 1.5
  return {
    swatchX: 2,
    swatchWidth,
    swatchHeight: unit * 0.75,
    textX: 2 + swatchWidth + unit * 0.5,
    tickX: PADDING.value.left - unit * 0.6,
  }
})

/** 固定長度，不隨資料伸縮——交付不足的部分就是空的 */
const xDomain = computed<[number, number]>(() => [0, props.frameSpan])

const layout = computed(() =>
  layoutStackedRows(
    props.metricKeys.map(key => ({ key, values: props.metrics.series[key] ?? [] })),
    {
      width: props.viewWidth,
      rowHeight: props.rowHeight,
      rowGap: ROW_GAP,
      padding: PADDING.value,
      xDomain: xDomain.value,
      yTickCount: 2,
      yTickCandidates: DEGREE_TICK_STEPS,
      xTickCount: compact.value ? 6 : 15,
      xTickCandidates: [10, 25, 50, 100, 250],
    },
  ),
)

interface Row {
  key: MetricKey
  label: string
  unit: string
  stroke: string
  fill: string
  path: string
  /** 缺測造成的段落端點，畫成小圓點才分得出「斷了」與「資料結束」 */
  breaks: { x: number, y: number }[]
  hasData: boolean
  extremes: { top: { text: string, y: number }, bottom: { text: string, y: number } } | null
  plot: { x: number, y: number, width: number, height: number }
  centerY: number
  /** 游標所在影格的讀數，null 代表缺測 */
  readout: { text: string, y: number } | null
}

const rows = computed<Row[]>(() =>
  layout.value.rows.map((row, index) => {
    const key = props.metricKeys[index]!
    const info = metricInfo(key)
    const style = palette.value.metrics[key]
    const values = props.metrics.series[key] ?? []
    const toPoint = (i: number, value: number) => ({ x: row.scale.toX(i), y: row.scale.toY(value) })
    const segmentOptions = {
      wraps: info.wraps,
      maxBridgeFrames: props.bridgeGaps ? props.maxBridgeFrames : 0,
      maxBridgeDelta: props.maxBridgeDelta,
    }
    const segments = buildLineSegments(values, toPoint, segmentOptions)
    const hasData = segments.length > 0

    const frame = hoverFrame.value
    const value = frame === null ? undefined : values[frame]

    return {
      key,
      label: info.label,
      unit: info.unit,
      stroke: style.stroke,
      fill: style.fill,
      hasData,
      path: buildLinePath(values, toPoint, {
        ...segmentOptions,
        smooth: props.smooth,
        filterSigma: props.filterSigma,
      }),
      // 每段的頭尾各一點；段落多代表缺口多，一眼看得出資料完整度
      breaks: segments.flatMap(segment => [segment[0]!, segment.at(-1)!]),
      // 標實際極值而不是留白後的 domain，並把刻度畫在該值真正的高度上
      extremes: row.valueRange
        ? {
            top: { text: `${Math.round(row.valueRange[1])}`, y: row.scale.toY(row.valueRange[1]) },
            bottom: { text: `${Math.round(row.valueRange[0])}`, y: row.scale.toY(row.valueRange[0]) },
          }
        : null,
      plot: row.scale.plot,
      centerY: row.centerY,
      readout: value === null || value === undefined
        ? (frame === null ? null : { text: '—', y: row.centerY })
        : { text: `${value.toFixed(1)}${info.unit}`, y: row.scale.toY(value) },
    }
  }),
)

/**
 * 事件線與標籤。標籤要做水平避讓——踏地與出手只差 29 影格（畫寬不到 4%），
 * 兩個標籤置中放在線頂會直接疊在一起。
 */
const eventLines = computed(() => {
  if (!props.showEvents || !layout.value.rows.length)
    return []

  const scale = layout.value.rows[0]!.scale
  // 事件線與標籤不在 clipPath 內，越界的會畫到繪圖區外
  const sorted = props.metrics.events
    .filter(event => event.frameIndex <= props.frameSpan)
    .sort((a, b) => a.frameIndex - b.frameIndex)

  let previousRight = Number.NEGATIVE_INFINITY
  let row = 0

  return sorted.map((event) => {
    const x = scale.toX(event.frameIndex)
    const width = event.label.length * AXIS_FONT_SIZE.value
    const left = x - width / 2

    row = left < previousRight ? (row + 1) % 2 : 0
    previousRight = left + width

    return {
      key: event.key,
      label: event.label,
      x,
      // 第 0 列貼著繪圖區、第 1 列再往上一階
      labelY: layout.value.spanY1 - 4 - row * (AXIS_FONT_SIZE.value + 2),
    }
  })
})

function frameFromPointer(event: PointerEvent): number | null {
  const element = svgRef.value
  const scale = layout.value.rows[0]?.scale
  // 樣本還沒到手時不要冒出一條游標配七個「—」
  if (!element || !scale || !props.metrics.frameCount)
    return null
  const rect = element.getBoundingClientRect()
  if (!rect.width)
    return null
  const svgX = (event.clientX - rect.left) * (props.viewWidth / rect.width)
  return frameAtX(svgX, scale)
}

function onPointerMove(event: PointerEvent) {
  if (props.interactive)
    hoverFrame.value = frameFromPointer(event)
}

function onPointerLeave() {
  hoverFrame.value = null
}

function onPointerDown(event: PointerEvent) {
  if (!props.interactive)
    return
  if (event.pointerType !== 'mouse')
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId)
  hoverFrame.value = frameFromPointer(event)
}

function onPointerUp(event: PointerEvent) {
  const target = event.currentTarget as Element
  if (target.hasPointerCapture?.(event.pointerId))
    target.releasePointerCapture?.(event.pointerId)
}

const cursorX = computed(() => {
  const scale = layout.value.rows[0]?.scale
  return hoverFrame.value === null || !scale ? null : scale.toX(hoverFrame.value)
})

const ariaLabel = computed(() =>
  `投手姿態角度分列圖，${rows.value.length} 條指標各佔一列，`
  + `共用固定第 0 到 ${props.frameSpan} 影格的時間軸，`
  + `資料到第 ${Math.max(0, props.metrics.frameCount - 1)} 影格`,
)
</script>

<template>
  <svg
    ref="svgRef"
    class="h-auto w-full touch-pan-y select-none"
    :class="interactive ? 'cursor-crosshair' : ''"
    :viewBox="`0 0 ${layout.width} ${layout.height}`"
    preserveAspectRatio="xMidYMid meet"
    role="img"
    :aria-label="ariaLabel"
    data-testid="pose-metrics-stacked"
    @pointermove="onPointerMove"
    @pointerdown="onPointerDown"
    @pointerup="onPointerUp"
    @pointerleave="onPointerLeave"
    @pointercancel="onPointerLeave"
  >
    <defs>
      <clipPath :id="clipId">
        <rect
          :x="PADDING.left"
          :y="layout.spanY1 - 4"
          :width="layout.width - PADDING.left - PADDING.right"
          :height="layout.spanY2 - layout.spanY1 + 8"
        />
      </clipPath>
    </defs>

    <!-- 每列的底：淺色版靠底色分帶，深色版靠邊界線 -->
    <rect
      v-for="row in rows"
      :key="`bg-${row.key}`"
      :x="row.plot.x"
      :y="row.plot.y"
      :width="row.plot.width"
      :height="row.plot.height"
      :class="[palette.canvas, palette.canvasBorder]"
      stroke-width="1"
      :data-testid="`pose-metrics-row-${row.key}`"
    />

    <!-- 事件線貫穿全部列，列與列之間才對得起來。虛線且較細，不與資料爭焦點 -->
    <g v-if="eventLines.length" data-testid="pose-metrics-events">
      <line
        v-for="line in eventLines"
        :key="line.key"
        :x1="line.x"
        :y1="layout.spanY1"
        :x2="line.x"
        :y2="layout.spanY2"
        :class="palette.eventLine"
        stroke-width="1.5"
        stroke-dasharray="5 4"
      />
      <text
        v-for="line in eventLines"
        :key="`label-${line.key}`"
        :x="line.x"
        :y="line.labelY"
        text-anchor="middle"
        :font-size="AXIS_FONT_SIZE"
        font-weight="600"
        :class="palette.eventLabel"
        :data-testid="`pose-metrics-event-${line.key}`"
      >
        {{ line.label }}
      </text>
    </g>

    <!-- 曲線與斷點 -->
    <g :clip-path="`url(#${clipId})`">
      <template v-for="row in rows" :key="row.key">
        <path
          v-if="row.hasData"
          :d="row.path"
          :class="row.stroke"
          fill="none"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          :data-testid="`pose-metrics-line-${row.key}`"
        />
        <circle
          v-for="(point, i) in row.breaks"
          :key="`break-${i}`"
          :cx="point.x"
          :cy="point.y"
          r="1.8"
          :class="row.fill"
          :data-testid="`pose-metrics-break-${row.key}`"
        />
      </template>
    </g>

    <!-- 指標名稱直接標在左側，不必來回對照圖例 -->
    <g v-for="row in rows" :key="`label-${row.key}`">
      <rect
        :x="labelLayout.swatchX"
        :y="row.centerY - labelLayout.swatchHeight / 2"
        :width="labelLayout.swatchWidth"
        :height="labelLayout.swatchHeight"
        :class="row.fill"
      />
      <text
        :x="labelLayout.textX"
        :y="row.centerY"
        dominant-baseline="central"
        :font-size="LABEL_FONT_SIZE"
        :class="palette.axisLabel"
      >
        {{ row.label }}
      </text>
      <template v-if="row.extremes">
        <text
          :x="labelLayout.tickX"
          :y="row.extremes.top.y"
          text-anchor="end"
          dominant-baseline="central"
          :font-size="AXIS_FONT_SIZE"
          :class="palette.axisMuted"
        >
          {{ row.extremes.top.text }}
        </text>
        <text
          :x="labelLayout.tickX"
          :y="row.extremes.bottom.y"
          text-anchor="end"
          dominant-baseline="central"
          :font-size="AXIS_FONT_SIZE"
          :class="palette.axisMuted"
        >
          {{ row.extremes.bottom.text }}
        </text>
      </template>
    </g>

    <!-- 游標貫穿全列，讀數直接標在各列右側——不必開一塊面板遮住資料 -->
    <g v-if="cursorX !== null" data-testid="pose-metrics-cursor">
      <line
        :x1="cursorX"
        :y1="layout.spanY1"
        :x2="cursorX"
        :y2="layout.spanY2"
        :class="palette.cursor"
        stroke-width="2"
      />
      <template v-for="row in rows" :key="`readout-${row.key}`">
        <circle
          v-if="row.readout && row.readout.text !== '—'"
          :cx="cursorX"
          :cy="row.readout.y"
          r="3.5"
          :class="row.fill"
        />
        <text
          v-if="row.readout"
          :x="layout.width - PADDING.right + 8"
          :y="row.centerY"
          dominant-baseline="central"
          :font-size="AXIS_FONT_SIZE"
          font-weight="600"
          class="tabular-nums" :class="[palette.axisLabel]"
          :data-testid="`pose-metrics-readout-${row.key}`"
        >
          {{ row.readout.text }}
        </text>
      </template>
    </g>

    <!-- X 軸只畫最下面一次 -->
    <g>
      <text
        v-for="tick in layout.xTicks"
        :key="`x-${tick.value}`"
        :x="tick.position"
        :y="layout.axisLabelY"
        text-anchor="middle"
        :font-size="AXIS_FONT_SIZE"
        :class="palette.axisMuted"
      >
        {{ tick.label }}
      </text>
      <text
        :x="PADDING.left + (layout.width - PADDING.left - PADDING.right) / 2"
        :y="layout.axisLabelY + 20"
        text-anchor="middle"
        :font-size="AXIS_FONT_SIZE"
        :class="palette.axisMuted"
      >
        影格
      </text>
    </g>

    <text
      v-if="!rows.length"
      :x="layout.width / 2"
      :y="layout.height / 2"
      text-anchor="middle"
      dominant-baseline="central"
      :font-size="LABEL_FONT_SIZE"
      :class="palette.emptyText"
      data-testid="pose-metrics-empty"
    >
      沒有選取任何指標
    </text>
  </svg>
</template>

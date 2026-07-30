<script setup lang="ts">
import type { StrikeZoneBounds } from '../baseball-field/core/fieldGeometry'
import type { DistributionPitch } from './core/distribution'
import { computed } from 'vue'
import { isStrike } from '../baseball-field/core/fieldGeometry'
import { aggregateByCell, buildPointsPath } from './core/distribution'
import { useDistributionScale } from './core/useDistributionScale'

// 可攜性約束：內部只用相對 import、不用 NuxtUI；SVG 單位即 1cm。
// 大量落點合併成單一 <path>（好球/壞球各一條），所以 600 顆點只有 2 個 DOM 節點。

const props = withDefaults(
  defineProps<{
    /** 落點清單（cm），已由呼叫端篩選完畢 */
    pitches: DistributionPitch[]
    /** 好球帶邊界，決定九宮格與視野大小 */
    zone: StrikeZoneBounds
    /** 落點半徑（cm）。球的真實半徑 3.65，取小一半才看得出密集處的層次 */
    pointRadius?: number
    /** 九宮格熱區填色 */
    showHeatmap?: boolean
    /** 落點散布 */
    showPoints?: boolean
    /** 格內球數 */
    showCounts?: boolean
    /** 好球帶四周留白，以好球帶尺寸為倍數 */
    paddingFraction?: number
  }>(),
  {
    pointRadius: 1.5,
    showHeatmap: true,
    showPoints: true,
    showCounts: true,
    paddingFraction: 1,
  },
)

const scale = useDistributionScale(
  () => props.zone,
  () => ({ paddingFraction: props.paddingFraction }),
)

const stats = computed(() => aggregateByCell(props.pitches, props.zone))

// 視野外的球不畫——強行 clamp 到邊緣會在四周造成假聚集，寧可另外標示球數
const visible = computed(() => props.pitches.filter(p => scale.value.inView(p.x, p.z)))
const outOfView = computed(() => props.pitches.length - visible.value.length)

const strikePath = computed(() => pathOf(true))
const ballPath = computed(() => pathOf(false))

function pathOf(strike: boolean) {
  const points = visible.value
    .filter(p => isStrike(p.x, p.z, props.zone) === strike)
    .map(p => scale.value.toSvg(p.x, p.z))
  return buildPointsPath(points, props.pointRadius)
}

/** 格內數字的字級：跟著 viewBox 縮放，所以用 cm 指定而非 tailwind 字級 */
const countFontSize = computed(() => scale.value.zoneRect.height / 3 * 0.28)
</script>

<template>
  <svg
    class="h-auto w-full select-none"
    :viewBox="`0 0 ${scale.viewWidth} ${scale.viewHeight}`"
    preserveAspectRatio="xMidYMid meet"
    role="img"
    :aria-label="`落點分布圖，共 ${stats.total} 球，好球帶內 ${stats.inZone} 球`"
    data-testid="pitch-distribution"
  >
    <!-- 九宮格熱區：同一個語意色，深淺靠 opacity，避免任意值色階 -->
    <g v-if="showHeatmap" data-testid="distribution-heatmap">
      <rect
        v-for="cell in scale.cells"
        :key="cell.number"
        :x="cell.x"
        :y="cell.y"
        :width="cell.width"
        :height="cell.height"
        class="fill-primary-500"
        :fill-opacity="stats.cells[cell.number - 1]!.intensity * 0.32"
        :data-testid="`distribution-cell-${cell.number}`"
        :data-count="stats.cells[cell.number - 1]!.count"
      >
        <title>第 {{ cell.number }} 格 · {{ stats.cells[cell.number - 1]!.count }} 球</title>
      </rect>
    </g>

    <!-- 九宮格框線 -->
    <g class="stroke-neutral-400" fill="none">
      <line
        v-for="(line, i) in scale.gridLines"
        :key="i"
        :x1="line.x1"
        :y1="line.y1"
        :x2="line.x2"
        :y2="line.y2"
        stroke-width="0.6"
      />
      <rect
        :x="scale.zoneRect.x"
        :y="scale.zoneRect.y"
        :width="scale.zoneRect.width"
        :height="scale.zoneRect.height"
        class="stroke-neutral-600"
        stroke-width="1"
      />
    </g>

    <!-- 落點：好球與壞球各一條 path，點數再多都只有兩個節點 -->
    <g v-if="showPoints" data-testid="distribution-points">
      <!-- 壞球畫得比好球淡：框外的球散得開、視覺面積大，同樣濃度會蓋過好球帶 -->
      <path
        :d="ballPath"
        class="fill-error-400"
        fill-opacity="0.22"
        data-testid="distribution-balls"
      />
      <path
        :d="strikePath"
        class="fill-primary-700"
        fill-opacity="0.42"
        data-testid="distribution-strikes"
      />
    </g>

    <!-- 格內球數 -->
    <text
      v-for="cell in showCounts ? scale.cells : []"
      :key="`count-${cell.number}`"
      :x="cell.x + cell.width / 2"
      :y="cell.y + cell.height / 2"
      text-anchor="middle"
      dominant-baseline="central"
      :font-size="countFontSize"
      class="fill-neutral-700 dark:fill-neutral-200"
    >
      {{ stats.cells[cell.number - 1]!.count }}
    </text>

    <text
      v-if="outOfView"
      :x="scale.viewWidth - 2"
      :y="scale.viewHeight - 2"
      text-anchor="end"
      :font-size="countFontSize * 0.8"
      class="fill-neutral-500"
    >
      另有 {{ outOfView }} 球在視野外
    </text>
  </svg>
</template>

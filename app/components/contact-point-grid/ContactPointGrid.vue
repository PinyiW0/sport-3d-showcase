<script setup lang="ts">
import type { StrikeZoneBounds } from '../baseball-field/core/fieldGeometry'
import { computed } from 'vue'
import { BALL_RADIUS, HOME_PLATE } from '../baseball-field/core/fieldGeometry'
import { ticksInRange, useContactGridScale } from './core/contactGridScale'

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
    point: { x: number, z: number } | null
    /** 擊球點半徑（cm）。預設用真實球半徑，SVG 單位即 cm，畫出來就是真實大小 */
    pointRadius?: number
    /** 擊球點到兩軸的虛線輔助線 */
    showGuides?: boolean
  }>(),
  {
    pointRadius: BALL_RADIUS,
    showGuides: true,
  },
)

// 畫布邊距（cm）：容納左側 z 刻度、下方 x 刻度與三壘側／一壘側方位字。
// 不是資料視野的一部分——視野擴大只動 core 算出的 minX/maxX/minZ/maxZ，邊距恆定。
const PAD = { left: 18, right: 6, top: 8, bottom: 20 }

const scale = useContactGridScale(
  () => props.zone,
  () => props.point,
)

const viewBoxWidth = computed(() => scale.value.viewWidth + PAD.left + PAD.right)
const viewBoxHeight = computed(() => scale.value.viewHeight + PAD.top + PAD.bottom)

/** 場地座標(cm) → 加上畫布邊距後的實際繪製座標 */
function toSvg(x: number, z: number) {
  const p = scale.value.toSvg(x, z)
  return { x: p.x + PAD.left, y: p.y + PAD.top }
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

const pointSvg = computed(() => (props.point ? toSvg(props.point.x, props.point.z) : null))

/** 負號換成 Unicode 減號，與 bpe-data/core/format.ts 的 formatNumber 同規則；
 * 本元件刻意不依賴 bpe-data（見上方說明），所以就地重寫這一條規則，不做 import。 */
function formatNum(value: number): string {
  return String(value).replace('-', '−')
}

const pointLabel = computed(() =>
  props.point ? `x ${formatNum(props.point.x)} · z ${formatNum(props.point.z)} cm` : '',
)

/** 標籤靠近右緣時換到點的左邊，避免被裁掉 */
const labelOnLeft = computed(() => {
  const p = pointSvg.value
  return p != null && p.x > viewBoxWidth.value * 0.72
})

/** 字級跟著 viewBox 縮放，用 cm 指定而非 Tailwind 字級（比照 pitch-distribution 的 countFontSize） */
const fontSize = computed(() => viewBoxHeight.value / 32)

const ariaLabel = computed(() =>
  props.point
    ? `擊球點九宮格，擊球點 x ${formatNum(props.point.x)}、z ${formatNum(props.point.z)} 公分`
    : '擊球點九宮格，這筆結果沒有擊球點',
)
</script>

<template>
  <svg
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
      class="stroke-neutral-500 dark:stroke-neutral-400"
      stroke-width="0.8"
    />

    <!-- 本壘板正視：貼地窄帶 -->
    <rect
      :x="plateBand.x"
      :y="plateBand.y"
      :width="plateBand.width"
      :height="plateBand.height"
      class="fill-neutral-100 stroke-neutral-400 dark:fill-neutral-800 dark:stroke-neutral-600"
      stroke-width="0.5"
    />

    <!-- z 軸刻度（左側，每 50cm，含數字與 cm 單位） -->
    <g class="stroke-neutral-400 dark:stroke-neutral-600">
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
    <g class="fill-neutral-500 dark:fill-neutral-400" :font-size="fontSize">
      <text
        v-for="tick in zTicks"
        :key="`z-label-${tick}`"
        :x="toSvg(scale.minX, tick).x - 3"
        :y="toSvg(scale.minX, tick).y + fontSize * 0.32"
        text-anchor="end"
      >{{ formatNum(tick) }}</text>
      <text
        :x="toSvg(scale.minX, scale.maxZ).x - 3"
        :y="toSvg(scale.minX, scale.maxZ).y - fontSize * 0.6"
        text-anchor="end"
      >cm</text>
    </g>

    <!-- x 軸刻度（下方，每 25cm） -->
    <g class="stroke-neutral-400 dark:stroke-neutral-600">
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
    <g class="fill-neutral-500 dark:fill-neutral-400" :font-size="fontSize" text-anchor="middle">
      <text
        v-for="tick in xTicks"
        :key="`x-label-${tick}`"
        :x="toSvg(tick, scale.minZ).x"
        :y="toSvg(tick, scale.minZ).y + fontSize * 1.3"
      >{{ formatNum(tick) }}</text>
    </g>

    <!-- 方位字：捕手視角，−x 三壘側在左、+x 一壘側在右（不依打者慣用手翻轉） -->
    <g class="fill-neutral-500 dark:fill-neutral-400" :font-size="fontSize">
      <text :x="toSvg(scale.minX, scale.minZ).x" :y="viewBoxHeight - fontSize * 0.4" text-anchor="start">
        三壘側
      </text>
      <text :x="toSvg(scale.maxX, scale.minZ).x" :y="viewBoxHeight - fontSize * 0.4" text-anchor="end">
        一壘側
      </text>
    </g>

    <!-- 好球帶外框與 3×3 內線（格子不假設正方形） -->
    <g class="stroke-neutral-400 dark:stroke-neutral-600" fill="none">
      <line
        v-for="(line, i) in scale.gridLines"
        :key="`grid-${i}`"
        :x1="line.x1 + PAD.left"
        :y1="line.y1 + PAD.top"
        :x2="line.x2 + PAD.left"
        :y2="line.y2 + PAD.top"
        stroke-width="0.5"
      />
      <rect
        :x="scale.zoneRect.x + PAD.left"
        :y="scale.zoneRect.y + PAD.top"
        :width="scale.zoneRect.width"
        :height="scale.zoneRect.height"
        class="stroke-neutral-600 dark:stroke-neutral-300"
        stroke-width="1"
      />
    </g>

    <!-- 擊球點：輔助線 + 圓點 + 標籤 -->
    <template v-if="pointSvg">
      <g v-if="showGuides" class="stroke-primary-400 dark:stroke-primary-500" stroke-dasharray="2 2">
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
        class="fill-primary-500 stroke-white dark:stroke-neutral-900"
        stroke-width="1"
        data-testid="contact-point"
      />
      <text
        :x="pointSvg.x + (labelOnLeft ? -pointRadius - 3 : pointRadius + 3)"
        :y="pointSvg.y - pointRadius - 2"
        :text-anchor="labelOnLeft ? 'end' : 'start'"
        :font-size="fontSize * 1.1"
        class="fill-neutral-800 dark:fill-neutral-100"
      >{{ pointLabel }}</text>
    </template>

    <!-- 沒有擊球點：照樣畫九宮格與刻度，版面不塌，改顯示這行字 -->
    <text
      v-else
      :x="viewBoxWidth / 2"
      :y="viewBoxHeight / 2"
      text-anchor="middle"
      :font-size="fontSize * 1.3"
      class="fill-neutral-400 dark:fill-neutral-500"
    >
      這筆結果沒有擊球點
    </text>
  </svg>
</template>

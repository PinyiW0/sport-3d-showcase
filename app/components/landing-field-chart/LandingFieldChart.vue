<script setup lang="ts">
import type { LandingPoint } from './core/fieldChart'
import { computed } from 'vue'
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
    /** 落點標籤第二行，例：「預測飛行距離 56.2 m」，由呼叫端格式化好傳入 */
    label?: string
    /** 距離弧、內野菱形、投手板點；預設顯示 */
    showDecorations?: boolean
  }>(),
  {
    label: undefined,
    showDecorations: true,
  },
)

const viewport = computed(() => computeFieldViewport(props.landing))
const scale = computed(() => createFieldScale(viewport.value))

const fairTerritoryPath = computed(() => toPathData(scale.value, buildFairTerritoryPoints(), true))
const outfieldArcPath = computed(() => toPathData(scale.value, buildOutfieldArcPoints()))

const homeSvg = computed(() => scale.value.toSvg(0, 0))
const foulCornerLeftSvg = computed(() => scale.value.toSvg(-FOUL_LINE_X, FOUL_LINE_X))
const foulCornerRightSvg = computed(() => scale.value.toSvg(FOUL_LINE_X, FOUL_LINE_X))
const centerFieldLabelSvg = computed(() => scale.value.toSvg(0, OUTFIELD_ARC_CENTER_Y + OUTFIELD_ARC_RADIUS))

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

/** 落點旁三行文字：標題、呼叫端傳入的說明、座標；由下往上疊在點的正上方 */
const labelLines = computed(() => {
  if (!props.landing)
    return []
  const lines = ['預測落點']
  if (props.label)
    lines.push(props.label)
  lines.push(`(${formatFieldNumber(props.landing.x)}, ${formatFieldNumber(props.landing.y)}) m`)
  return lines
})

const LABEL_GAP_M = 3
const LABEL_LINE_HEIGHT_M = 4.5
function labelY(index: number): number {
  return landingSvg.value!.y - LABEL_GAP_M - (labelLines.value.length - 1 - index) * LABEL_LINE_HEIGHT_M
}

/**
 * 標籤靠右側邊緣時換到點的左邊，避免文字被裁掉。45 是估計最長一行（座標行）
 * 所需寬度（字級 4 × 約 11 字），不是精算值。
 */
const LABEL_SIDE_MARGIN_M = 45
const LABEL_OFFSET_M = 3
const labelOnRight = computed(() => !landingSvg.value || landingSvg.value.x < scale.value.viewWidth - LABEL_SIDE_MARGIN_M)
const labelAnchor = computed(() => (labelOnRight.value ? 'start' : 'end'))
const labelX = computed(() => (landingSvg.value ? landingSvg.value.x + (labelOnRight.value ? LABEL_OFFSET_M : -LABEL_OFFSET_M) : 0))

const noLandingSvg = computed(() => ({ x: scale.value.viewWidth / 2, y: scale.value.viewHeight * 0.15 }))

const ariaLabel = computed(() => props.landing
  ? `球場圖，預測落點約在 (${formatFieldNumber(props.landing.x)}, ${formatFieldNumber(props.landing.y)}) 公尺`
  : '球場圖，這筆結果沒有預測落點')
</script>

<template>
  <svg
    class="h-auto w-full select-none"
    :viewBox="`0 0 ${scale.viewWidth} ${scale.viewHeight}`"
    preserveAspectRatio="xMidYMid meet"
    role="img"
    :aria-label="ariaLabel"
    data-testid="landing-field-chart"
  >
    <!-- 界內區域淡淡填色，界線本身用較深的線描邊 -->
    <path :d="fairTerritoryPath" class="fill-primary-500/10" />

    <!-- 距離弧與內野：裝飾，比界線淡，可關 -->
    <g v-if="showDecorations" data-testid="landing-field-decorations">
      <g v-for="ring in rings" :key="ring.radius">
        <path :d="ring.d" fill="none" class="stroke-neutral-400/60 dark:stroke-neutral-600/60" stroke-width="0.4" />
        <text
          :x="ring.labelSvg.x - 1"
          :y="ring.labelSvg.y + 1.5"
          text-anchor="end"
          font-size="3.2"
          class="fill-neutral-500/80 dark:fill-neutral-500"
        >
          {{ ring.radius }} m
        </text>
      </g>
      <path :d="infieldPath" fill="none" class="stroke-neutral-400/70 dark:stroke-neutral-600/70" stroke-width="0.5" />
      <circle :cx="pitchersPlateSvg.x" :cy="pitchersPlateSvg.y" r="1" class="fill-neutral-400/70 dark:fill-neutral-600/70" />
    </g>

    <!-- 界外線 + 外野弧：球場邊界公式，一律照畫 -->
    <g fill="none" class="stroke-neutral-600 dark:stroke-neutral-400">
      <path :d="`M${foulCornerLeftSvg.x},${foulCornerLeftSvg.y} L${homeSvg.x},${homeSvg.y} L${foulCornerRightSvg.x},${foulCornerRightSvg.y}`" stroke-width="0.6" />
      <path :d="outfieldArcPath" stroke-width="0.6" />
    </g>

    <!-- 方位標示：本壘、一壘側／三壘側、中外野 -->
    <circle :cx="homeSvg.x" :cy="homeSvg.y" r="1.2" class="fill-neutral-700 dark:fill-neutral-300" />
    <text :x="homeSvg.x" :y="homeSvg.y + 6" text-anchor="middle" font-size="4" class="fill-neutral-600 dark:fill-neutral-400">
      本壘
    </text>
    <!-- 方位字放畫面下緣兩角：放在界外線端點旁會超出視野被裁掉（端點離視野邊只有 8 m） -->
    <text x="2" :y="scale.viewHeight - 2" font-size="3.6" class="fill-neutral-500">
      ← 三壘側
    </text>
    <text :x="scale.viewWidth - 2" :y="scale.viewHeight - 2" text-anchor="end" font-size="3.6" class="fill-neutral-500">
      一壘側 +x →
    </text>
    <text :x="centerFieldLabelSvg.x" :y="centerFieldLabelSvg.y - 2" text-anchor="middle" font-size="3.6" class="fill-neutral-500">
      中外野 122 m
    </text>

    <!-- 落點：沒有落點時只顯示提示文字，球場照樣畫 -->
    <template v-if="landingSvg">
      <path :d="guidePath" fill="none" class="stroke-primary-500" stroke-width="0.5" stroke-dasharray="2.5 2" />
      <circle
        :cx="landingSvg.x"
        :cy="landingSvg.y"
        r="2"
        class="fill-primary-500 stroke-white dark:stroke-neutral-900"
        stroke-width="0.8"
        data-testid="landing-point"
      />
      <text
        v-for="(line, i) in labelLines"
        :key="i"
        :x="labelX"
        :y="labelY(i)"
        :text-anchor="labelAnchor"
        font-size="4"
        class="fill-neutral-800 dark:fill-neutral-100"
      >
        {{ line }}
      </text>
    </template>
    <text
      v-else
      :x="noLandingSvg.x"
      :y="noLandingSvg.y"
      text-anchor="middle"
      font-size="4.5"
      class="fill-neutral-500"
      data-testid="landing-missing"
    >
      這筆結果沒有預測落點
    </text>
  </svg>
</template>

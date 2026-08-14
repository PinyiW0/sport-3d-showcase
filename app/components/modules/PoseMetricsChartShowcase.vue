<script setup lang="ts">
import type { SmoothPreset } from '~/components/pose-metrics-chart/core/autoTuning'
import type { ChartTheme } from '~/components/pose-metrics-chart/core/palette'
import type { MetricKey } from '~/components/pose-metrics-chart/core/types'
import { chartPalette } from '~/components/pose-metrics-chart/core/palette'
import { truncateMetrics } from '~/components/pose-metrics-chart/core/parseBiomech'
import { metricInfo, NOMINAL_FRAME_SPAN, SERIES_METRIC_KEYS } from '~/components/pose-metrics-chart/core/types'
import PoseMetricsChart from '~/components/pose-metrics-chart/PoseMetricsChart.vue'
import PoseMetricsSmallMultiples from '~/components/pose-metrics-chart/PoseMetricsSmallMultiples.vue'

// pose-metrics-chart 模組的「模組呈現」互動元件：七條姿態角度疊在同一條
// ±180 的軸上，點膠囊可以單獨藏起某幾條。
//
// 圖例做在這裡而不是圖表元件內，是因為它要能點——狀態留在宿主層，圖表本體
// 保持無狀態才能被 /preview 錄影頁直接驅動。兩邊共讀 core/palette.ts 的色表。

/**
 * 線條平滑分四段。「關」是原始折線，其餘三段都會動到數值——級數越高越滑，
 * 但出手那格（角度變化最劇烈處）也偏得越多。
 *
 * 每一級對應的是**時間常數**而不是固定的 σ，實際的 σ 由 `resolveTuning`
 * 依這批資料的 fps 換算，換一台 fps 不同的相機視覺效果才會一致。
 */
const SMOOTH_LABELS: Record<SmoothPreset, string> = {
  off: '關（原始折線）',
  low: '弱（曲率 −66%）',
  mid: '中（曲率 −78%）',
  high: '強（曲率 −91%）',
}

const smoothLevel = ref<SmoothPreset>('mid')
const smoothOptions = (Object.keys(SMOOTH_LABELS) as SmoothPreset[]).map(value => ({
  label: SMOOTH_LABELS[value],
  value,
}))

const { metrics, diagnostics, tuning, error } = usePoseMetrics(smoothLevel)

const hidden = ref(new Set<MetricKey>())
const showEvents = ref(true)
const bridgeGaps = ref(true)

/**
 * 「模擬短資料」把樣本截到 480 格。
 *
 * 演算法端每次交付的影格數不固定，而 X 軸固定畫到 750，所以交付不足時右邊會
 * 留白。手上唯一的樣本是 748 格，留白只有 0.4%、肉眼看不出來——這個開關讓那個
 * 行為看得見：右邊三分之一空掉、踏地與出手兩條事件線消失、游標拖進留白區各列
 * 讀數變成「—」。
 *
 * `diagnostics` / `tuning` 刻意仍算全量樣本——fps、缺口分布是資料源的性質，
 * 不該被展示用的截斷改掉。
 */
const TRUNCATE_TO = 480
const truncate = ref(false)
const shownMetrics = computed(() =>
  truncate.value ? truncateMetrics(metrics.value, TRUNCATE_TO) : metrics.value,
)

/**
 * 深淺兩套配色。正式專案是淺色介面，所以預設 light；深色版留著是因為它在
 * 大螢幕看板上對比更強，也是這個模組原本的設計稿。
 */
/**
 * 兩種版面各解一半的問題，所以並存：
 * - 疊圖：看得到交叉點與相位差，但七條共用 ±180 軸時互相交纏，而且為了容納
 *   環繞角，其餘五條被壓在中間（軀幹前傾只用到軸高的 16%）
 * - 分列：每條用滿自己那一列、解析度差 4～6 倍，代價是看不到交叉
 */
const LAYOUT_LABELS = { stacked: '分列（各自值域）', overlay: '疊圖（共用軸）' }
type ChartLayout = keyof typeof LAYOUT_LABELS

const layout = ref<ChartLayout>('stacked')
const layoutOptions = (Object.keys(LAYOUT_LABELS) as ChartLayout[]).map(value => ({
  label: LAYOUT_LABELS[value],
  value,
}))

/** 兩種版面共用同一個游標，切換時位置不會跑掉 */
const hoverFrame = ref<number | null>(null)

const theme = ref<ChartTheme>('light')
const palette = computed(() => chartPalette(theme.value))
const themeOptions: { label: string, value: ChartTheme }[] = [
  { label: '淺色圖表', value: 'light' },
  { label: '深色圖表', value: 'dark' },
]

const visibleKeys = computed(() => SERIES_METRIC_KEYS.filter(key => !hidden.value.has(key)))

function toggle(key: MetricKey) {
  const next = new Set(hidden.value)
  if (next.has(key))
    next.delete(key)
  else
    next.add(key)
  hidden.value = next
}

/** 每條的缺測率——肩膀內旋缺 40%，線會斷成一截一截，不先講會被當成畫壞了 */
function missingPercent(key: MetricKey) {
  return Math.round((diagnostics.value.missingRatio[key] ?? 1) * 100)
}

const durationSec = computed(() => {
  const times = shownMetrics.value.timesMs
  return times.length ? (times.at(-1)! / 1000).toFixed(2) : '0.00'
})

const handLabel = computed(() => {
  const hand = shownMetrics.value.throwingHand
  return hand === 'right' ? '右投' : hand === 'left' ? '左投' : '未知'
})

/** 事件之間隔了幾格——踏地到出手只有 29 格，這種讀數是影格軸的存在意義 */
const eventGaps = computed(() => {
  const events = shownMetrics.value.events
  return events.slice(1).map((event, i) => ({
    key: event.key,
    label: `${events[i]!.label} → ${event.label}`,
    frames: event.frameIndex - events[i]!.frameIndex,
  }))
})

const singleValues = computed(() => [
  ...shownMetrics.value.atFootPlant.map(v => ({ ...v, moment: '踏地' })),
  ...shownMetrics.value.atRelease.map(v => ({ ...v, moment: '出手' })),
])

const wrappingLabels = computed(() =>
  SERIES_METRIC_KEYS.filter(key => metricInfo(key).wraps).map(key => metricInfo(key).label).join('與'),
)
</script>

<template>
  <div class="space-y-4">
    <UAlert
      v-if="error"
      color="error"
      title="樣本載入失敗"
      :description="String(error)"
    />

    <!-- 圖例即開關：點一下把那條藏起來／叫回來 -->
    <div class="flex flex-wrap gap-2" data-testid="pose-metrics-legend">
      <button
        v-for="key in SERIES_METRIC_KEYS"
        :key="key"
        type="button"
        class="flex items-center gap-2 border px-3 py-1.5 text-sm transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary-500"
        :class="hidden.has(key)
          ? 'border-neutral-200 text-neutral-400 dark:border-neutral-800 dark:text-neutral-600'
          : 'border-neutral-300 text-neutral-800 dark:border-neutral-700 dark:text-neutral-100'"
        :aria-pressed="!hidden.has(key)"
        :data-testid="`pose-metrics-legend-${key}`"
        @click="toggle(key)"
      >
        <span
          class="h-3 w-6 transition-opacity duration-150"
          :class="[palette.metrics[key].swatch, hidden.has(key) ? 'opacity-25' : '']"
        />
        {{ metricInfo(key).label }}
        <span class="text-xs text-neutral-500">缺 {{ missingPercent(key) }}%</span>
      </button>
    </div>

    <PoseMetricsSmallMultiples
      v-if="layout === 'stacked'"
      v-model:hover-frame="hoverFrame"
      :metrics="shownMetrics"
      :metric-keys="visibleKeys"
      :show-events="showEvents"
      :smooth="smoothLevel !== 'off'"
      :filter-sigma="tuning.filterSigma"
      :bridge-gaps="bridgeGaps"
      :max-bridge-frames="tuning.maxBridgeFrames"
      :max-bridge-delta="tuning.maxBridgeDelta"
      :theme="theme"
    />
    <PoseMetricsChart
      v-else
      v-model:hover-frame="hoverFrame"
      :metrics="shownMetrics"
      :metric-keys="visibleKeys"
      :show-events="showEvents"
      :smooth="smoothLevel !== 'off'"
      :filter-sigma="tuning.filterSigma"
      :bridge-gaps="bridgeGaps"
      :max-bridge-frames="tuning.maxBridgeFrames"
      :max-bridge-delta="tuning.maxBridgeDelta"
      :theme="theme"
    />

    <div class="flex flex-wrap items-center justify-center gap-4">
      <USelect
        v-model="layout"
        :items="layoutOptions"
        size="sm"
        class="w-40"
        aria-label="圖表版面"
      />
      <USwitch v-model="showEvents" label="事件線" />
      <USwitch v-model="bridgeGaps" label="接小缺口" />
      <USwitch v-model="truncate" label="模擬短資料（480 格）" />
      <USelect
        v-model="smoothLevel"
        :items="smoothOptions"
        size="sm"
        class="w-44"
        aria-label="線條平滑程度"
      />
      <USelect
        v-model="theme"
        :items="themeOptions"
        size="sm"
        class="w-32"
        aria-label="圖表配色"
      />
    </div>

    <p class="text-center text-sm text-neutral-500">
      {{ handLabel }} · {{ shownMetrics.frameCount }} 影格 · {{ durationSec }} 秒
      <template v-if="eventGaps.length">
        <span v-for="gap in eventGaps" :key="gap.key"> · {{ gap.label }} {{ gap.frames }} 格</span>
      </template>
      <!-- 軸硬鎖名目長度，超過的畫不出來。這行讓截斷看得見而不是無聲發生 -->
      <span v-if="shownMetrics.frameCount > NOMINAL_FRAME_SPAN">
        · 軸固定 {{ NOMINAL_FRAME_SPAN }} 格，第 {{ NOMINAL_FRAME_SPAN }} 格之後未顯示
      </span>
    </p>

    <div v-if="shownMetrics.peaks.length" class="space-y-2">
      <p class="text-xs font-semibold uppercase tracking-wider text-neutral-500">
        峰值
      </p>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="peak in shownMetrics.peaks"
          :key="peak.key"
          class="border border-neutral-200 p-4 dark:border-neutral-800"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm text-neutral-700 dark:text-neutral-300">{{ peak.label }}</span>
            <UBadge v-if="!peak.reliable" color="warning" variant="subtle" size="sm">
              未達可信度
            </UBadge>
            <UBadge v-else-if="!peak.onSeries" color="neutral" variant="subtle" size="sm">
              無曲線
            </UBadge>
          </div>
          <p class="text-2xl font-semibold tabular-nums">
            {{ peak.value.toFixed(1) }}<span class="text-sm font-normal text-neutral-500">{{ peak.unit }}</span>
          </p>
          <p class="text-xs text-neutral-500">
            第 {{ peak.frameIndex }} 影格 · {{ peak.window || '全段' }}
            <template v-if="peak.plotValue !== null">
              · 曲線上為 {{ peak.plotValue.toFixed(1) }}{{ peak.unit }}
            </template>
          </p>
        </div>
      </div>
    </div>

    <div v-if="singleValues.length" class="space-y-2">
      <p class="text-xs font-semibold uppercase tracking-wider text-neutral-500">
        關鍵時刻的單點值
      </p>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div
          v-for="value in singleValues"
          :key="`${value.moment}-${value.key}`"
          class="border border-neutral-200 p-4 dark:border-neutral-800"
        >
          <p class="text-xs text-neutral-500">
            {{ value.moment }} · {{ value.label }}
          </p>
          <p class="text-2xl font-semibold tabular-nums">
            {{ value.value.toFixed(1) }}<span class="text-sm font-normal text-neutral-500">{{ value.unit }}</span>
          </p>
        </div>
      </div>
    </div>

    <p class="border border-neutral-200 p-3 text-xs text-neutral-600 dark:border-neutral-800 dark:text-neutral-400" data-testid="pose-metrics-tuning">
      <span class="font-semibold text-neutral-800 dark:text-neutral-200">這批資料推導出的參數</span>：
      取樣率 <span class="tabular-nums">{{ diagnostics.fps.toFixed(1) }}</span> fps ·
      缺口門檻 <span class="tabular-nums">{{ tuning.maxBridgeFrames }}</span> 格／<span class="tabular-nums">{{ tuning.maxBridgeDelta.toFixed(1) }}</span> 度 ·
      平滑 σ=<span class="tabular-nums">{{ tuning.filterSigma.toFixed(2) }}</span> 影格
      <template v-if="diagnostics.gaps.count">
        （依據：{{ diagnostics.gaps.count }} 個缺口，兩端差中位數
        <span class="tabular-nums">{{ diagnostics.gaps.medianDelta.toFixed(1) }}</span> 度、最大
        <span class="tabular-nums">{{ diagnostics.gaps.maxDelta.toFixed(1) }}</span> 度）
      </template>
      。換一顆球、換一台 fps 不同的相機，這三個值都會重算，不是寫死的。
    </p>

    <p class="text-xs text-neutral-500 dark:text-neutral-400">
      橫軸是影格序號，固定畫到第 {{ NOMINAL_FRAME_SPAN }} 格不隨資料伸縮，縱軸固定 ±180 度——
      兩條軸都不動，不同球的圖才並排比得起來。演算法端每次交付的影格數不固定，
      交付不足時右邊就留白，游標拖進去各列讀數顯示「—」；打開「模擬短資料」看得到這件事。
      缺測代表姿態估計在該影格失敗（遮蔽或關鍵點信心不足）：缺口夠短
      <em class="not-italic text-neutral-700 dark:text-neutral-300">且</em>兩端角度差夠小才接起來，
      其餘一律留白不猜——像肩膀外旋在踏地前後只缺 10 格、兩端卻差 86 度，
      那段就是斷的，一條直線補過去等於捏造沒量到的軌跡。關掉「接小缺口」可以看原始的斷點分布。
      {{ wrappingLabels }}是 ±180 的環繞角，通過邊界時數值會整圈翻轉，那裡的缺口同樣是刻意斷的。
      線條平滑分兩層：Catmull-Rom 只改「點與點之間怎麼連」，點的位置沒動；高斯低通則會實際動到數值，
      這是姿態估計資料的標準處理（後端自己的 peak 也分 value 與 raw_value、差了 15 度）。
      預設「中」實測讓曲率降 78%、峰值一位小數都沒變、出手那格偏 2.6 度；選「關」看的就是原始折線。
      拖曳游標讀到的數值一律取自原始資料，不受平滑影響。
    </p>
  </div>
</template>

<script setup lang="ts">
import type { BpeMetricKey, BpeMetricValue } from '~/components/bpe-data/core/types'
import { formatMetric, formatMetricBrief } from '~/components/bpe-data/core/format'
import { pickMetrics } from '~/components/bpe-data/core/parseBpeResult'
import { BPE_METRICS } from '~/components/bpe-data/core/types'

// BPE 三個模組共用的數值面板：只列這個模組負責的那幾項（keys），缺值的項目不顯示。
// 缺了哪幾項另起一行明說——規範要求「不顯示」，但完全無聲會讓人以為版面漏畫。
//
// 數字用精簡寫法（一位小數、秒改毫秒）一眼讀；原始值與欄位名稱放在提示裡（滑鼠停在卡片上），
// 精確值隨時看得到。primary 給了就分主次：主要幾項大卡片，其餘縮成一行一項。
const props = defineProps<{
  metrics: readonly BpeMetricValue[]
  keys: readonly BpeMetricKey[]
  title: string
  /** 放大顯示的幾項；不給就全部同一個權重 */
  primary?: readonly BpeMetricKey[]
  /** 標題下的一句說明（例如數字的意思、跟哪個模組的數字不要搞混） */
  description?: string
}>()

const shown = computed(() => pickMetrics(props.metrics, props.keys))
const primaryShown = computed(() =>
  props.primary ? shown.value.filter(m => props.primary!.includes(m.key)) : shown.value,
)
const secondaryShown = computed(() =>
  props.primary ? shown.value.filter(m => !props.primary!.includes(m.key)) : [],
)

const missingLabels = computed(() => {
  const present = new Set(shown.value.map(m => m.key))
  return props.keys
    .filter(key => !present.has(key))
    .map(key => BPE_METRICS.find(def => def.key === key)!.label)
})

/** 提示：欄位名稱與原始值，例「bat_speed = 67.538 km/h（原始值）」 */
function rawTitle(metric: BpeMetricValue): string {
  return `${metric.key} = ${formatMetric(metric.value, metric.unit)}（原始值）`
}
</script>

<template>
  <div class="space-y-3" data-testid="bpe-metric-list">
    <div class="space-y-1">
      <p class="text-xs font-semibold uppercase tracking-wider text-neutral-500">
        {{ title }}
      </p>
      <p v-if="description" class="text-xs text-neutral-500 dark:text-neutral-400">
        {{ description }}
      </p>
    </div>

    <div v-if="primaryShown.length" class="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <div
        v-for="metric in primaryShown"
        :key="metric.key"
        class="border border-neutral-200 p-4 dark:border-neutral-800"
        :title="rawTitle(metric)"
        :data-testid="`bpe-metric-${metric.key}`"
      >
        <p class="text-sm text-neutral-600 dark:text-neutral-400">
          {{ metric.label }}
        </p>
        <p class="mt-1 text-xl font-semibold tabular-nums text-neutral-900 sm:text-2xl dark:text-white">
          {{ formatMetricBrief(metric.value, metric.unit) }}
        </p>
      </div>
    </div>

    <dl v-if="secondaryShown.length" class="grid grid-cols-2 gap-x-6 gap-y-2 lg:grid-cols-3">
      <div
        v-for="metric in secondaryShown"
        :key="metric.key"
        class="flex items-baseline justify-between gap-3 border-b border-neutral-200 pb-2 dark:border-neutral-800"
        :title="rawTitle(metric)"
        :data-testid="`bpe-metric-${metric.key}`"
      >
        <dt class="text-sm text-neutral-600 dark:text-neutral-400">
          {{ metric.label }}
        </dt>
        <dd class="text-sm font-medium tabular-nums text-neutral-900 dark:text-white">
          {{ formatMetricBrief(metric.value, metric.unit) }}
        </dd>
      </div>
    </dl>

    <p v-if="missingLabels.length" class="text-xs text-neutral-500" data-testid="bpe-metric-missing">
      {{ shown.length ? `另有 ${missingLabels.length} 項` : `這 ${missingLabels.length} 項` }}在這筆結果裡缺值（value 為 null 或欄位缺少），依規範不顯示：{{ missingLabels.join('、') }}
    </p>
  </div>
</template>

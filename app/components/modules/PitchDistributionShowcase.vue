<script setup lang="ts">
import type { BatterLevel } from '~/components/baseball-field/core/batterLevels'
import {
  BATTER_LEVEL_ORDER,
  BATTER_LEVELS,
  getStrikeZoneForLevel,
} from '~/components/baseball-field/core/batterLevels'
import {
  aggregateByCell,
  collectFilterOptions,
  filterPitches,
} from '~/components/pitch-distribution/core/distribution'
import PitchDistribution from '~/components/pitch-distribution/PitchDistribution.vue'

// pitch-distribution 模組的「模組呈現」互動元件：依投手與球種篩選，看落點集中在哪。
// 樣本為合成資料（600 球），因為真實的 25 球樣本沒有 pitcher / pitch_type 欄位。

const { pitches, error } = useDistributionSamples()

// 「全部」的哨兵值。不能用空字串——USelect 底層的 Reka UI 保留空字串代表
// 「清除選擇並顯示 placeholder」，給 SelectItem 空字串 value 會直接拋錯。
const ALL = '__all__'

const pitcher = ref(ALL)
const pitchType = ref(ALL)
const level = ref<BatterLevel>('adult')

const showHeatmap = ref(true)
const showPoints = ref(true)
const showCounts = ref(true)

const zone = computed(() => getStrikeZoneForLevel(level.value))
const filtered = computed(() =>
  filterPitches(pitches.value, {
    pitcher: pitcher.value === ALL ? null : pitcher.value,
    pitchType: pitchType.value === ALL ? null : pitchType.value,
  }),
)
const stats = computed(() => aggregateByCell(filtered.value, zone.value))

const options = computed(() => collectFilterOptions(pitches.value))

// 球種代碼對照，只給顯示用——core 保持純資料，不帶顯示字串。
// 代號與中文名的單一真理來源是 spec/domain/pitch-types.md，查不到的代號顯示裸代號。
const PITCH_TYPE_LABEL: Record<string, string> = {
  '4S': '四縫線速球',
  'SL': '滑球',
  'CB': '曲球',
  'CH': '變速球',
  'SW': '橫掃球',
  'SK': '伸卡球',
  'CT': '卡特球',
  'SP': '指叉球',
  'KN': '蝴蝶球',
  'OTH': '其他',
}

const pitcherOptions = computed(() => [
  { label: '全部投手', value: ALL },
  ...options.value.pitchers.map(id => ({ label: id, value: id })),
])

const pitchTypeOptions = computed(() => [
  { label: '全部球種', value: ALL },
  ...options.value.pitchTypes.map(code => ({
    label: `${code} ${PITCH_TYPE_LABEL[code] ?? ''}`.trim(),
    value: code,
  })),
])

const levelOptions = BATTER_LEVEL_ORDER.map(key => ({
  label: `${BATTER_LEVELS[key].label} ${BATTER_LEVELS[key].referenceHeightCm} cm`,
  value: key,
}))

const inZoneRatio = computed(() =>
  stats.value.total ? (stats.value.inZone / stats.value.total * 100).toFixed(1) : '0.0',
)

// 最熱的格子——一句話講完這批球集中在哪，比讓人自己看色階快
const hottest = computed(() => {
  if (!stats.value.maxCount)
    return null
  return stats.value.cells.find(c => c.count === stats.value.maxCount) ?? null
})
</script>

<template>
  <div class="space-y-4">
    <UAlert
      v-if="error"
      color="error"
      title="樣本載入失敗"
      :description="String(error)"
    />

    <div class="flex flex-wrap items-center gap-3">
      <USelect
        v-model="pitcher"
        :items="pitcherOptions"
        size="sm"
        class="w-36"
        aria-label="投手"
      />
      <USelect
        v-model="pitchType"
        :items="pitchTypeOptions"
        size="sm"
        class="w-44"
        aria-label="球種"
      />
      <USelect
        v-model="level"
        :items="levelOptions"
        size="sm"
        class="w-40"
        aria-label="打者級別與代表身高"
      />
      <USwitch v-model="showHeatmap" label="熱區" />
      <USwitch v-model="showPoints" label="落點" />
      <USwitch v-model="showCounts" label="球數" />
    </div>

    <div class="mx-auto w-full max-w-md">
      <PitchDistribution
        :pitches="filtered"
        :zone="zone"
        :show-heatmap="showHeatmap"
        :show-points="showPoints"
        :show-counts="showCounts"
      />
    </div>

    <p class="text-center text-sm text-neutral-500">
      <template v-if="stats.total">
        {{ stats.total }} 球 · 好球帶內 {{ stats.inZone }} 球（{{ inZoneRatio }}%）
        <template v-if="hottest">
          · 最集中在第 <span class="text-primary">{{ hottest.number }}</span> 格（{{ hottest.count }} 球）
        </template>
      </template>
      <template v-else>
        此組合沒有資料
      </template>
    </p>

    <p class="text-center text-xs text-neutral-500 dark:text-neutral-400">
      綠點為好球、紅點為壞球，重疊處自然變深即為熱區；九宮格底色深淺代表該格球數。
      樣本為合成資料（600 球），生成方式見
      <span class="font-mono">scripts/gen-distribution-sample.mjs</span>。
    </p>
  </div>
</template>

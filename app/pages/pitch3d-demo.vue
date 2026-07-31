<script setup lang="ts">
import PitchTrajectoryChart from '~/components/pitch-trajectory/PitchTrajectoryChart.vue'

// pitch-trajectory 模組驗證頁：25 球逐球檢視 3D 軌跡。
// 九宮格為固定 175cm 標準框（後端資料不含打者身高），可拖曳旋轉視角。

const { pitches, error } = useBt3dSamples()

const selected = ref(0)
const current = computed(() => pitches.value[selected.value] ?? null)
const trajectory = computed(() => current.value?.trajectory ?? [])

const zoom = ref(1)
const zoomOptions = [
  { label: '0.8x（拉近）', value: 0.8 },
  { label: '1x（預設）', value: 1 },
  { label: '1.3x（拉遠）', value: 1.3 },
]
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6 p-8">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold">
          BT3D 軌跡圖驗證（{{ pitches.length }} 球）
        </h1>
        <p class="mt-1 text-sm text-neutral-500">
          點選左側任一球，右側顯示該球 3D 軌跡與本壘板、九宮格。
        </p>
      </div>
      <USelect v-model="zoom" :items="zoomOptions" size="sm" class="w-40" />
    </div>

    <UAlert
      v-if="error"
      color="error"
      title="樣本載入失敗"
      :description="String(error)"
    />

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
      <ul class="flex max-h-130 flex-col gap-1 overflow-y-auto border border-neutral-200 p-2 dark:border-neutral-700">
        <li v-for="pitch in pitches" :key="pitch.ts">
          <button
            type="button"
            class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors"
            :class="pitch.index === selected
              ? 'bg-primary/10 ring-1 ring-primary'
              : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'"
            @click="selected = pitch.index"
          >
            <span class="flex items-center gap-2">
              <span class="font-medium tabular-nums">#{{ pitch.index + 1 }}</span>
              <span class="text-neutral-400 tabular-nums">{{ pitch.time }}</span>
            </span>
            <span class="text-neutral-500 tabular-nums">
              {{ pitch.velocity != null ? `${pitch.velocity.toFixed(1)} km/h` : '— km/h' }}
            </span>
          </button>
        </li>
      </ul>

      <div class="flex flex-col gap-2">
        <!-- 圖表為暗色主題，容器同步壓深避免黑圖貼白框 -->
        <div class="overflow-x-auto bg-neutral-950 p-4">
          <PitchTrajectoryChart
            :trajectory="trajectory"
            :zoom="zoom"
            :width="640"
            :height="480"
          />
        </div>
        <p v-if="current" class="text-center text-sm text-neutral-500">
          第 {{ current.index + 1 }} 球 · {{ current.time }} ·
          入壘點 x {{ current.strikeZonePoint[0].toFixed(1) }} ·
          z {{ current.strikeZonePoint[2].toFixed(1) }} cm
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import BaseballSpinViewer from '~/components/baseball-spin/BaseballSpinViewer.vue'
import { parseSpinResult } from '~/components/baseball-spin/core/types'
import SpinTiltClock from '~/components/clock-spin/SpinTiltClock.vue'

// clock-spin 模組驗證頁：同一顆球的兩種轉軸呈現並排——
// 左邊是 2D 時鐘面板（直接把 spin_tilt.degrees 餵給 SVG rotate），
// 右邊是 3D 檢視器的轉軸指針，用來對照兩者是否指向一致。

const sampleIds = ['sample1', 'sample2', 'sample3']
const selected = ref('sample1')

const { data: spinData, error } = useFetch(
  () => `/samples/spin/${selected.value}/result.json`,
  { server: false, transform: json => parseSpinResult(json) },
)

const tilt = computed(() => spinData.value?.spinTilt ?? null)
const dir = computed(() => spinData.value?.spinDir ?? null)

const metrics = computed(() => {
  const d = spinData.value
  if (!d)
    return []
  return [
    { label: '轉速', value: `${Math.floor(d.rpm)} rpm` },
    { label: '轉軸（spin_tilt）', value: `${d.spinTilt.hhmm}（${d.spinTilt.degrees}°）` },
    { label: '方向（spin_dir）', value: `${d.spinDir.hhmm}（${d.spinDir.degrees}°）` },
  ]
})
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6 p-8">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold">
          時鐘轉軸驗證
        </h1>
        <p class="mt-1 text-sm text-neutral-500">
          同一顆球的三種轉軸呈現並排對照：兩種 2D 指針樣式（分別取自 internal-project-c 與 internal-project-a，
          盤面幾何相同、只差畫法），以及 3D 檢視器依姿態矩陣旋轉的實體指針。
        </p>
      </div>
      <UTabs
        v-model="selected"
        :items="sampleIds.map(id => ({ label: id, value: id }))"
        :content="false"
      />
    </div>

    <UAlert
      v-if="error"
      color="error"
      title="樣本載入失敗"
      :description="String(error)"
    />

    <div class="grid grid-cols-1 gap-6 sm:grid-cols-3">
      <div class="space-y-2">
        <h2 class="text-sm font-medium opacity-70">
          V 形指針（internal-project-c）
        </h2>
        <div class="border border-neutral-200 p-4 dark:border-neutral-700">
          <SpinTiltClock
            v-if="tilt"
            :degrees="tilt.degrees"
            :hhmm="tilt.hhmm"
            pointer="chevron"
          />
        </div>
      </div>

      <div class="space-y-2">
        <h2 class="text-sm font-medium opacity-70">
          箭頭指針（internal-project-a）
        </h2>
        <div class="border border-neutral-200 p-4 dark:border-neutral-700">
          <SpinTiltClock
            v-if="tilt"
            :degrees="tilt.degrees"
            :hhmm="tilt.hhmm"
            pointer="arrow"
          />
        </div>
      </div>

      <div class="space-y-2">
        <h2 class="text-sm font-medium opacity-70">
          3D 轉軸指針（three.js）
        </h2>
        <div class="overflow-hidden bg-black">
          <BaseballSpinViewer
            :data="spinData ?? null"
            :speed="1 / 60"
            :show-axis-arrow="true"
          />
        </div>
      </div>
    </div>

    <dl v-if="metrics.length" class="grid grid-cols-3 gap-4 text-sm">
      <div v-for="m in metrics" :key="m.label">
        <dt class="opacity-60">
          {{ m.label }}
        </dt>
        <dd class="font-mono">
          {{ m.value }}
        </dd>
      </div>
    </dl>

    <p v-if="tilt && dir" class="text-xs text-neutral-400">
      三個樣本實測：spin_tilt 與 spin_dir 的時鐘標籤固定差 3 小時（degrees 差 90°）；
      而 spin_tilt.degrees 比自己 hhmm 對應的盤面角度多約 180°，
      所以指針箭頭指的是標籤的對側（沿用 internal-project-a 既有行為，未改動數學）。
      後端的 degrees 未正規化到 0–360（本批樣本出現 442.15° 與 −7.85°），SVG rotate 可直接吃。
    </p>
  </div>
</template>

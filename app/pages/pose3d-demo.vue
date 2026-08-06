<script setup lang="ts">
import type { SkeletonCalibrationReport } from '~/components/pitch-pose/core/pose3dRetarget'
import Pose3dSkeletonPlotly from '~/components/pitch-pose-plotly/Pose3dSkeleton.vue'
import Pose3dCapsule from '~/components/pitch-pose/Pose3dCapsule.vue'
import Pose3dHuman from '~/components/pitch-pose/Pose3dHuman.vue'
import Pose3dSkeleton from '~/components/pitch-pose/Pose3dSkeleton.vue'
import { POSE3D_RATES, usePose3dClip } from '~/composables/usePose3dClip'

// pitch-pose 模組驗證頁：真人模型（three.js retarget）、程式生成素體與骨架點線圖四版可切換，
// 對照同一份 outcome.json 的 COCO-17 3D 重建結果。
// 骨架保留 Plotly 版並列比對：渲染器換掉後軸刻度、視角行為是否等價，靠這個切換看得最快。

const VIEW_MODES = [
  { value: 'human', label: '真人模型（three.js）' },
  { value: 'capsule', label: '素體（程式生成）' },
  { value: 'skeleton', label: '骨架（Three.js）' },
  { value: 'skeleton-plotly', label: '骨架（Plotly 對照）' },
] as const
const viewMode = ref<(typeof VIEW_MODES)[number]['value']>('human')

// 骨架疊顯開關：只作用在真人模型與素體這兩個「有身體」的呈現
const showSkeleton = ref(true)
const hasSkeletonToggle = computed(() => viewMode.value === 'human' || viewMode.value === 'capsule')

// 骨長校正：只有真人模型需要（素體本來就由 keypoints 直接長出，天生吻合）。
// 校正在模型載入時做一次，所以切換時用 key 強制重新掛載。
const calibrate = ref(true)
const calibration = ref<SkeletonCalibrationReport | null>(null)
const calibrationSummary = computed(() => {
  const report = calibration.value
  if (!calibrate.value || !report)
    return null
  const parts = Object.entries(report.ratios).map(([key, ratio]) => `${key} ${ratio.toFixed(2)}×`)
  if (report.clamped.length > 0)
    parts.push(`⚠ 已夾限：${report.clamped.join('、')}`)
  if (report.skipped.length > 0)
    parts.push(`略過：${report.skipped.join('、')}`)
  return parts.join(' · ')
})

const { pitch, loadError, clockMs, playing, rate, jumpToRelease } = usePose3dClip()

function onScrub(event: Event) {
  clockMs.value = Number((event.target as HTMLInputElement).value)
}
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6 p-8">
    <div>
      <h1 class="text-2xl font-bold">
        3D 投球骨架動態圖驗證
      </h1>
      <p class="mt-1 text-sm text-neutral-500">
        outcome.json 的多鏡位 3D 重建骨架，COCO-17、單位 cm、250fps。
        可拖曳旋轉視角（播放中視角不會被重設）；真人模型由 keypoints retarget 而成，
        手腕、脊椎等 COCO-17 沒有的細節為近似值。
      </p>
    </div>

    <UAlert
      v-if="loadError"
      color="error"
      title="outcome.json 載入失敗"
      :description="loadError"
    />

    <div v-else-if="!pitch" class="border border-neutral-200 p-8 text-center text-sm text-neutral-400 dark:border-neutral-700">
      載入骨架資料中…
    </div>

    <template v-else>
      <div class="border border-neutral-200 p-4 dark:border-neutral-700">
        <UTabs
          v-model="viewMode"
          :items="VIEW_MODES.map(m => ({ label: m.label, value: m.value }))"
          :content="false"
          size="sm"
          class="mb-3"
        />
        <Pose3dHuman
          v-if="viewMode === 'human'"
          :key="String(calibrate)"
          :frames="pitch.frames"
          :time-ms="clockMs"
          :height="520"
          :skeleton="showSkeleton"
          :calibrate="calibrate"
          @calibrated="calibration = $event"
        />
        <Pose3dCapsule v-else-if="viewMode === 'capsule'" :frames="pitch.frames" :time-ms="clockMs" :height="520" :skeleton="showSkeleton" />
        <Pose3dSkeleton v-else-if="viewMode === 'skeleton'" :frames="pitch.frames" :time-ms="clockMs" :height="520" />
        <!-- v-else 而非常駐：不切到這個 tab 就不會觸發 plotly 的 dynamic import -->
        <Pose3dSkeletonPlotly v-else :frames="pitch.frames" :time-ms="clockMs" :height="520" />
      </div>

      <div class="flex flex-wrap items-center gap-4 border border-neutral-200 p-4 dark:border-neutral-700">
        <UButton size="sm" @click="playing = !playing">
          {{ playing ? '暫停' : '播放' }}
        </UButton>

        <USelect
          v-model="rate"
          :items="POSE3D_RATES.map(r => ({ label: `${r}×`, value: r }))"
          size="sm"
          class="w-28"
        />

        <USwitch v-if="hasSkeletonToggle" v-model="showSkeleton" label="顯示骨架" />

        <USwitch v-if="viewMode === 'human'" v-model="calibrate" label="骨長校正" />

        <UButton
          v-if="pitch.releaseMs != null"
          size="sm"
          variant="outline"
          @click="jumpToRelease"
        >
          跳到出手瞬間（{{ (pitch.releaseMs / 1000).toFixed(2) }}s）
        </UButton>

        <input
          type="range"
          min="0"
          :max="pitch.durationMs"
          step="1"
          :value="clockMs"
          class="min-w-48 flex-1"
          aria-label="播放進度"
          @input="onScrub"
        >
        <span class="text-sm text-neutral-500 tabular-nums">
          {{ (clockMs / 1000).toFixed(3) }}s / {{ (pitch.durationMs / 1000).toFixed(2) }}s
        </span>
      </div>

      <p v-if="calibrationSummary" class="text-xs text-neutral-400">
        骨長校正（模型骨長 → 資料骨長的比例）：{{ calibrationSummary }}
      </p>

      <p class="text-xs text-neutral-400">
        pitch_id：{{ pitch.pitchId }} · 慣用手：{{ pitch.throwingHand ?? '未知' }} ·
        {{ pitch.frames.length }} frames / {{ (pitch.durationMs / 1000).toFixed(2) }}s
        （~{{ Math.round(pitch.frames.length / (pitch.durationMs / 1000)) }}fps）
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import Pose3dHuman from '~/components/pitch-pose/Pose3dHuman.vue'
import Pose3dSkeleton from '~/components/pitch-pose/Pose3dSkeleton.vue'
import { POSE3D_RATES, usePose3dClip } from '~/composables/usePose3dClip'

// pitch-pose 模組驗證頁：真人模型（three.js retarget）與骨架點線圖（Plotly）並可切換，
// 對照同一份 outcome.json 的 COCO-17 3D 重建結果。

const VIEW_MODES = [
  { value: 'human', label: '真人模型（three.js）' },
  { value: 'skeleton', label: '骨架（Plotly）' },
] as const
const viewMode = ref<(typeof VIEW_MODES)[number]['value']>('human')

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

    <div v-else-if="!pitch" class="rounded-lg border border-neutral-200 p-8 text-center text-sm text-neutral-400 dark:border-neutral-700">
      載入骨架資料中…
    </div>

    <template v-else>
      <div class="rounded-lg border border-neutral-200 p-4 dark:border-neutral-700">
        <UTabs
          v-model="viewMode"
          :items="VIEW_MODES.map(m => ({ label: m.label, value: m.value }))"
          :content="false"
          size="sm"
          class="mb-3"
        />
        <Pose3dHuman v-if="viewMode === 'human'" :frames="pitch.frames" :time-ms="clockMs" :height="520" />
        <Pose3dSkeleton v-else :frames="pitch.frames" :time-ms="clockMs" :height="520" />
      </div>

      <div class="flex flex-wrap items-center gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-700">
        <UButton size="sm" @click="playing = !playing">
          {{ playing ? '暫停' : '播放' }}
        </UButton>

        <USelect
          v-model="rate"
          :items="POSE3D_RATES.map(r => ({ label: `${r}×`, value: r }))"
          size="sm"
          class="w-28"
        />

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

      <p class="text-xs text-neutral-400">
        pitch_id：{{ pitch.pitchId }} · 慣用手：{{ pitch.throwingHand ?? '未知' }} ·
        {{ pitch.frames.length }} frames / {{ (pitch.durationMs / 1000).toFixed(2) }}s
        （~{{ Math.round(pitch.frames.length / (pitch.durationMs / 1000)) }}fps）
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import Pose3dSkeletonPlotly from '~/components/pitch-pose-plotly/Pose3dSkeleton.vue'
import Pose3dHuman from '~/components/pitch-pose/Pose3dHuman.vue'
import Pose3dSkeleton from '~/components/pitch-pose/Pose3dSkeleton.vue'
import { POSE3D_RATES, usePose3dClip } from '~/composables/usePose3dClip'

// pitch-pose 兩個模組（骨架版／真人版）共用的「模組呈現」互動元件：
// 播放、調速、跳到出手瞬間。三版並排對照在獨立頁 /pose3d-demo。
withDefaults(defineProps<{ mode?: 'skeleton' | 'human' }>(), { mode: 'skeleton' })

const asset = useAssetUrl()
const { pitch, loadError, clockMs, playing, rate, jumpToRelease } = usePose3dClip()

// 骨架版可切渲染器：Three.js 為預設，Plotly 是遷移前的實作留著對照
const renderer = ref<'three' | 'plotly'>('three')
const rendererOptions = [
  { label: 'Three.js', value: 'three' as const },
  { label: 'Plotly 對照', value: 'plotly' as const },
]
</script>

<template>
  <div class="space-y-4">
    <UAlert
      v-if="loadError"
      color="error"
      title="outcome.json 載入失敗"
      :description="loadError"
    />

    <div v-else-if="!pitch" class="border border-dashed border-neutral-300 py-16 text-center text-sm text-neutral-400 dark:border-neutral-700">
      載入骨架資料中…
    </div>

    <template v-else>
      <div class="bg-neutral-100 dark:bg-neutral-800">
        <Pose3dHuman v-if="mode === 'human'" :frames="pitch.frames" :time-ms="clockMs" :height="440" :model-url="asset('/models/Soldier.glb')" />
        <Pose3dSkeleton v-else-if="renderer === 'three'" :frames="pitch.frames" :time-ms="clockMs" :height="440" />
        <!-- v-else 而非常駐：不切到對照版就不會觸發 plotly 的 dynamic import -->
        <Pose3dSkeletonPlotly v-else :frames="pitch.frames" :time-ms="clockMs" :height="440" />
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <UButton size="sm" @click="playing = !playing">
          {{ playing ? '暫停' : '播放' }}
        </UButton>
        <USelect
          v-model="rate"
          :items="POSE3D_RATES.map(r => ({ label: `${r}×`, value: r }))"
          size="sm"
          class="w-24"
        />
        <USelect
          v-if="mode === 'skeleton'"
          v-model="renderer"
          :items="rendererOptions"
          size="sm"
          class="w-32"
          aria-label="渲染器"
        />
        <UButton
          v-if="pitch.releaseMs != null"
          size="sm"
          variant="outline"
          @click="jumpToRelease"
        >
          出手瞬間
        </UButton>
        <span class="text-sm text-neutral-500 tabular-nums">
          {{ (clockMs / 1000).toFixed(2) }}s / {{ (pitch.durationMs / 1000).toFixed(2) }}s
        </span>
      </div>
    </template>
  </div>
</template>

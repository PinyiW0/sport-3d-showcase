<script setup lang="ts">
import type { Pose3dFrame } from '../pitch-pose-data/core/parsePitchOutcome'
/**
 * 3D 骨架動畫（three.js）。由父層時鐘餵 `timeMs`，每次變動就把當下 frame 套進場景。
 *
 * 本元件只是薄殼：場景邏輯全在 core/poseSkeletonScene.ts（框架無關的 class），
 * 換到 React／Svelte 只要重寫這 50 行。three 於 onMounted 內動態 import，
 * SSR 安全且不進 server bundle。
 *
 * Plotly 對照版在 ../pitch-pose-plotly/，props 介面相同可直接互換。
 */
import type { PoseSkeletonScene } from './core/poseSkeletonScene'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    frames: readonly Pose3dFrame[]
    /** 目前播放時間（毫秒）；null 或無對應 frame 時只顯示空場景。 */
    timeMs: number | null
    height?: number
    /** 骨架顏色。 */
    color?: string
    /** 深色畫布（放進深色版面時開啟，如索引頁的預覽卡）。 */
    dark?: boolean
  }>(),
  {
    height: 480,
    color: '#22c55e',
    dark: false,
  },
)

const hostRef = ref<HTMLDivElement | null>(null)
let scene: PoseSkeletonScene | null = null
/** 卸載旗標。onMounted 的 await 期間就可能卸載,續行前必須重新確認元件還活著。 */
let disposed = false

/** 冪等釋放,卸載與 await 後的卸載分支共用。 */
function teardown() {
  disposed = true
  scene?.dispose()
  scene = null
}

onMounted(async () => {
  if (!hostRef.value)
    return
  const { PoseSkeletonScene } = await import('./core/poseSkeletonScene')
  // 卸載落在 await 期間時 onBeforeUnmount 早已跑完(當時 scene 還是 null,什麼都沒清),
  // 這裡再建場景就會留下一個沒人回收的 WebGL context
  if (disposed || !hostRef.value)
    return
  scene = new PoseSkeletonScene(hostRef.value, props.frames, {
    color: props.color,
    dark: props.dark,
  })
  scene.setTime(props.timeMs)
})

watch(() => props.timeMs, ms => scene?.setTime(ms))
watch(() => props.frames, (frames) => {
  scene?.setFrames(frames)
  scene?.setTime(props.timeMs)
})
watch(() => props.color, color => scene?.setColor(color))
watch(() => props.dark, dark => scene?.setDark(dark))

onBeforeUnmount(teardown)
</script>

<template>
  <!-- relative：hover 標籤以絕對定位掛在這一層 -->
  <div
    ref="hostRef"
    class="relative w-full overflow-hidden"
    :style="{ height: `${props.height}px` }"
    data-testid="pose3d-skeleton"
  />
</template>

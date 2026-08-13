<script setup lang="ts">
import type { Pose3dFrame } from '../pitch-pose-data/core/parsePitchOutcome'
/**
 * 程式生成素體（three.js）。由父層時鐘餵 `timeMs`，每次變動把當下 frame 套進場景。
 *
 * 本元件只是薄殼：場景邏輯全在 core/poseCapsuleScene.ts（框架無關的 class）。
 * 與 Pose3dHuman 的差異：不載外部模型檔，keypoints 直接組合幾何、無 retarget 近似；
 * 骨架疊顯開關由 `skeleton` prop 控制。
 */
import type { PoseCapsuleScene } from './core/poseCapsuleScene'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    frames: readonly Pose3dFrame[]
    /** 目前播放時間（毫秒）；null 或無對應 frame 時只顯示空場景。 */
    timeMs: number | null
    height?: number
    /** 骨架疊顯（骨頭線 + 關節球，x-ray）。 */
    skeleton?: boolean
    /** 深色畫布（放進深色版面時開啟）。 */
    dark?: boolean
  }>(),
  {
    height: 480,
    skeleton: true,
    dark: false,
  },
)

const hostRef = ref<HTMLDivElement | null>(null)
let scene: PoseCapsuleScene | null = null
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
  const { PoseCapsuleScene } = await import('./core/poseCapsuleScene')
  // 卸載落在 await 期間時 onBeforeUnmount 早已跑完(當時 scene 還是 null,什麼都沒清),
  // 這裡再建場景就會留下一個沒人回收的 WebGL context
  if (disposed || !hostRef.value)
    return
  scene = new PoseCapsuleScene(hostRef.value, props.frames, {
    dark: props.dark,
    skeleton: props.skeleton,
  })
  scene.setTime(props.timeMs)
})

watch(() => props.timeMs, ms => scene?.setTime(ms))
watch(() => props.frames, (frames) => {
  scene?.setFrames(frames)
  scene?.setTime(props.timeMs)
})
watch(() => props.skeleton, visible => scene?.setSkeletonVisible(visible))
watch(() => props.dark, dark => scene?.setDark(dark))

onBeforeUnmount(teardown)
</script>

<template>
  <!-- relative：hover 標籤以絕對定位掛在這一層 -->
  <div
    ref="hostRef"
    class="relative w-full overflow-hidden"
    :style="{ height: `${props.height}px` }"
    data-testid="pose3d-capsule"
  />
</template>

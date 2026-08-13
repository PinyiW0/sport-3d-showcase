<script setup lang="ts">
import type { BaseballSpinScene } from './core/scene'
import type { SpinResult } from './core/types'
import type { SpinViewPreset } from './core/views'

// 3D 棒球旋轉檢視器（模組唯一對外元件）。
// 可攜性約束：內部只用相對 import、不用 NuxtUI；three 於 onMounted 內 dynamic import
// （SSR 安全、且不進 server bundle）。載入 UI 交給 #loading slot 由宿主決定。
const props = withDefaults(defineProps<{
  data: SpinResult | null
  modelUrl?: string
  /** 播放速度倍率，1 = 真實轉速；對照後端 gif 用 0.125（slow_factor 8） */
  speed?: number
  autoplay?: boolean
  showAxisArrow?: boolean
  showDirectionRing?: boolean
  view?: SpinViewPreset
}>(), {
  modelUrl: '/models/baseball_detail.glb',
  speed: 1,
  autoplay: true,
  showAxisArrow: true,
  showDirectionRing: true,
  view: 'camera',
})

const emit = defineEmits<{
  ready: []
  error: [err: Error]
  progress: [loaded: number, total: number]
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const loading = ref(true)
const progressPercent = ref(0)

let scene: BaseballSpinScene | null = null
let resizeObserver: ResizeObserver | null = null
/** 卸載旗標。onMounted 有兩段 await,每段之後都得重新確認元件還活著。 */
let disposed = false

/** 冪等釋放,三條路徑共用:onUnmounted、await 後的卸載分支、catch 內的卸載分支。 */
function teardown() {
  disposed = true
  resizeObserver?.disconnect()
  resizeObserver = null
  scene?.dispose()
  scene = null
}

onMounted(async () => {
  if (!containerRef.value)
    return
  try {
    const { BaseballSpinScene } = await import('./core/scene')
    // 卸載落在這段 await 時 onUnmounted 早已跑完(當時 scene 還是 null),
    // 這裡再 new 場景就會留下一個沒人回收的 WebGL context
    if (disposed || !containerRef.value)
      return
    scene = new BaseballSpinScene(containerRef.value, { view: props.view, speed: props.speed })
    scene.setAxisArrowVisible(props.showAxisArrow)
    scene.setDirectionRingVisible(props.showDirectionRing)

    resizeObserver = new ResizeObserver(() => scene?.resize())
    resizeObserver.observe(containerRef.value)

    await scene.loadModel(props.modelUrl, (loaded, total) => {
      if (disposed)
        return
      progressPercent.value = total > 0 ? Math.round(loaded / total * 100) : 0
      emit('progress', loaded, total)
    })
    // glb 載入比 import 久得多,卸載更常落在這一段:此時場景已存在但 onUnmounted 早跑完,
    // 沒人會回收,只能由這裡主動收
    if (disposed) {
      teardown()
      return
    }
    loading.value = false

    if (props.data)
      scene.setData(props.data)
    if (props.autoplay && props.data)
      scene.play()
    emit('ready')
  }
  catch (err) {
    if (disposed) {
      teardown()
      return
    }
    loading.value = false
    emit('error', err instanceof Error ? err : new Error(String(err)))
  }
})

watch(() => props.data, (data) => {
  if (!scene || !data)
    return
  scene.setData(data)
  if (props.autoplay)
    scene.play()
})

watch(() => props.speed, (speed) => {
  scene?.setSpeed(speed)
})

watch(() => props.showAxisArrow, (visible) => {
  scene?.setAxisArrowVisible(visible)
})

watch(() => props.showDirectionRing, (visible) => {
  scene?.setDirectionRingVisible(visible)
})

onUnmounted(teardown)

function play(): void {
  scene?.play()
}

function pause(): void {
  scene?.pause()
}

defineExpose({ play, pause })
</script>

<template>
  <div class="relative aspect-square" data-testid="baseball-spin-viewer">
    <div ref="containerRef" class="absolute inset-0" />
    <div v-if="loading" class="absolute inset-0 flex items-center justify-center">
      <slot name="loading" :percent="progressPercent">
        <span class="text-sm opacity-60">模型載入中… {{ progressPercent }}%</span>
      </slot>
    </div>
  </div>
</template>

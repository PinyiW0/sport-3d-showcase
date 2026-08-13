<script setup lang="ts">
import type { Point3D } from '../pitch-trajectory-data/core/trajectoryGeometry'
/**
 * 3D 投球軌跡圖（three.js，模組唯一對外元件）。
 *
 * 本元件只是薄殼：場景邏輯全在 core/trajectoryScene.ts（框架無關的 class），
 * 換到 React／Svelte 只要重寫這 50 行。three 於 onMounted 內動態 import，
 * SSR 安全且不進 server bundle。
 *
 * Plotly 對照版在 ../pitch-trajectory-plotly/，props 介面相同可直接互換。
 */
import type { TrajectoryScene } from './core/trajectoryScene'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  /** 軌跡點 [x, y, z](cm),即 analysis_result.json 的 pitch_trajectory */
  trajectory: Point3D[]
  /** 打者身高(cm),用來推算九宮格上下緣 */
  batterHeightCm?: number
  width?: number
  height?: number
  /** 相機距離倍率:>1 拉遠看得更完整,<1 拉近放大。預設 1(已框住完整軌跡)。 */
  zoom?: number
  /** 完整覆寫相機視角(aspect 單位),用來自訂預設角度。 */
  cameraEye?: { x: number, y: number, z: number }
}>(), {
  batterHeightCm: 175,
  width: 640,
  height: 480,
  zoom: 1,
})

const hostRef = ref<HTMLDivElement | null>(null)
let scene: TrajectoryScene | null = null
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
  const { TrajectoryScene } = await import('./core/trajectoryScene')
  // 卸載落在 await 期間時 onBeforeUnmount 早已跑完(當時 scene 還是 null,什麼都沒清),
  // 這裡再建場景就會留下一個沒人回收的 WebGL context
  if (disposed || !hostRef.value)
    return
  scene = new TrajectoryScene(hostRef.value, {
    batterHeightCm: props.batterHeightCm,
    zoom: props.zoom,
    cameraEye: props.cameraEye,
  })
  scene.setTrajectory(props.trajectory)
})

// 視角與身高變動要重建場景內容才會生效，統一走 setOptions + setTrajectory
watch(
  () => [props.trajectory, props.batterHeightCm, props.zoom, props.cameraEye],
  () => {
    scene?.setOptions({
      batterHeightCm: props.batterHeightCm,
      zoom: props.zoom,
      cameraEye: props.cameraEye,
    })
    scene?.setTrajectory(props.trajectory)
  },
  { deep: true },
)

onBeforeUnmount(teardown)
</script>

<template>
  <div class="mx-auto flex w-full flex-col items-center justify-center">
    <div
      ref="hostRef"
      :style="{ width: `${props.width}px`, height: `${props.height}px` }"
      data-testid="pitch3d-chart"
    />
  </div>
</template>

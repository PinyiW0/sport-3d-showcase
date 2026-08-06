<script setup lang="ts">
import type { Point3D } from '../pitch-trajectory-data/core/trajectoryGeometry'
import {
  buildStrikeZoneCorners,
  PLATE_HALF_WIDTH_CM,
} from '../pitch-trajectory-data/core/trajectoryGeometry'
import { usePitch3D } from './core/plotlyFigure'

/**
 * 3D 投球軌跡圖（Plotly）——遷移到 Three.js 之前的實作，保留作為對照版。
 * props 介面與 pitch-trajectory 的 Three.js 版相同，可直接互換。
 *
 * 可攜性約束：內部只用相對 import、不用 NuxtUI；plotly 於 onMounted 內 dynamic import
 * （SSR 安全、且不進 server bundle）。
 * - trajectory 變動時會用 Plotly.react 重畫，不需重建元件
 * - 九宮格的 y 平面取軌跡最後一點（入壘點）的 y
 */
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

const {
  createTrajectoryTraces,
  createHomePlateTrace,
  createStrikeZoneTraces,
  createChartLayout,
} = usePitch3D()

const chartRef = ref<HTMLDivElement | null>(null)
let plotly: typeof import('plotly.js-dist-min') | null = null

function buildFigure() {
  const yPlane = props.trajectory.at(-1)?.[1] ?? PLATE_HALF_WIDTH_CM
  const corners = buildStrikeZoneCorners(props.batterHeightCm, yPlane)
  const traces = [
    ...createTrajectoryTraces(props.trajectory),
    createHomePlateTrace(),
    ...createStrikeZoneTraces(corners),
  ]
  const layout = createChartLayout(props.trajectory, {
    width: props.width,
    height: props.height,
    zoom: props.zoom,
    cameraEye: props.cameraEye,
  })
  return { traces, layout }
}

async function render() {
  if (!plotly || !chartRef.value || props.trajectory.length < 2) {
    return
  }
  const { traces, layout } = buildFigure()
  await plotly.react(chartRef.value, traces, layout, { displaylogo: false })
}

onMounted(async () => {
  plotly = await import('plotly.js-dist-min')
  await render()
})

watch(() => [props.trajectory, props.batterHeightCm, props.zoom, props.cameraEye], render, { deep: true })

onBeforeUnmount(() => {
  if (plotly && chartRef.value) {
    plotly.purge(chartRef.value)
  }
})
</script>

<template>
  <div class="mx-auto flex w-full flex-col items-center justify-center">
    <div
      ref="chartRef"
      class="w-full"
      data-testid="pitch3d-chart"
    />
  </div>
</template>

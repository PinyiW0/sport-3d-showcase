<script setup lang="ts">
/**
 * 3D 骨架動畫(Plotly scatter3d,同 PitchTrajectoryChart 的載入 / 更新模式)。
 * 由父層時鐘餵 `timeMs`,每次更新用 Plotly.react 重畫當下 frame:
 * 場景僅 17 點 + 19 條骨頭,react 成本低,60fps 播放無壓力。
 *
 * - 座標軸範圍由整段動作的 bounds 固定,播放時軸不跳動。
 * - layout.uirevision 固定 → 使用者拖曳旋轉的視角在播放中不會被重設。
 * - 缺測關鍵點為 null:該點與相連骨頭自動不畫。
 */
import type { Pose3dFrame } from './core/parsePitchOutcome'
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { findPoseFrame } from './core/findPoseFrame'
import { COCO_KEYPOINT_NAMES, SKELETON_EDGES } from './core/types'

const props = withDefaults(
  defineProps<{
    frames: readonly Pose3dFrame[]
    /** 目前播放時間(毫秒);null 或無對應 frame 時只顯示空場景。 */
    timeMs: number | null
    height?: number
    /** 骨架顏色。 */
    color?: string
  }>(),
  {
    height: 480,
    color: '#22c55e',
  },
)

const chartRef = ref<HTMLDivElement | null>(null)
let plotly: typeof import('plotly.js-dist-min') | null = null

/** aspectratio 的換算基準,同 usePitch3d:每 200cm 對應 1 個視覺單位。 */
const CM_PER_ASPECT_UNIT = 200

/**
 * 立體空間定義:由「整段動作」的 bounds 決定,播放中永不重算。
 * range 圓整到 10cm 格;aspectratio 由 range 跨度換算(aspectmode: manual)。
 * 若改用 aspectmode: 'data',gl3d 會跟著當下 frame 的資料範圍重新適配,
 * 骨架每格大小不同,空間就會跟著「呼吸」——這是已知地雷。
 */
const space = computed(() => {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const frame of props.frames) {
    for (const point of frame.points) {
      if (!point)
        continue
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis]!, point[axis]!)
        max[axis] = Math.max(max[axis]!, point[axis]!)
      }
    }
  }
  if (!Number.isFinite(min[0]!)) {
    min[0] = min[1] = min[2] = 0
    max[0] = max[1] = max[2] = 100
  }

  const PAD_CM = 15
  const STEP_CM = 10
  const floorTo = (v: number) => Math.floor(v / STEP_CM) * STEP_CM
  const ceilTo = (v: number) => Math.ceil(v / STEP_CM) * STEP_CM
  const range = {
    x: [floorTo(min[0]! - PAD_CM), ceilTo(max[0]! + PAD_CM)],
    y: [floorTo(min[1]! - PAD_CM), ceilTo(max[1]! + PAD_CM)],
    // 地面(z=0)保留在畫面內,骨架高度才有參照
    z: [Math.min(0, floorTo(min[2]!)), ceilTo(max[2]! + PAD_CM)],
  }
  const aspect = {
    x: (range.x[1]! - range.x[0]!) / CM_PER_ASPECT_UNIT,
    y: (range.y[1]! - range.y[0]!) / CM_PER_ASPECT_UNIT,
    z: (range.z[1]! - range.z[0]!) / CM_PER_ASPECT_UNIT,
  }
  return { range, aspect }
})

function buildTraces(frame: Pose3dFrame | null) {
  const lineX: Array<number | null> = []
  const lineY: Array<number | null> = []
  const lineZ: Array<number | null> = []
  const markerX: number[] = []
  const markerY: number[] = []
  const markerZ: number[] = []
  const markerNames: string[] = []

  if (frame) {
    for (const [a, b] of SKELETON_EDGES) {
      const pa = frame.points[a]
      const pb = frame.points[b]
      if (!pa || !pb)
        continue
      // null 分段:一條 trace 畫完所有骨頭
      lineX.push(pa[0], pb[0], null)
      lineY.push(pa[1], pb[1], null)
      lineZ.push(pa[2], pb[2], null)
    }
    frame.points.forEach((point, id) => {
      if (!point)
        return
      markerX.push(point[0])
      markerY.push(point[1])
      markerZ.push(point[2])
      markerNames.push(COCO_KEYPOINT_NAMES[id]!)
    })
  }

  const { range } = space.value
  return [
    // 隱形 anchor:釘住 bounding box 對角,即使 autorange 介入,空間也不變
    {
      type: 'scatter3d',
      mode: 'markers',
      x: [range.x[0], range.x[1]],
      y: [range.y[0], range.y[1]],
      z: [range.z[0], range.z[1]],
      marker: { size: 1, opacity: 0 },
      hoverinfo: 'skip',
    },
    {
      type: 'scatter3d',
      mode: 'lines',
      x: lineX,
      y: lineY,
      z: lineZ,
      line: { color: props.color, width: 6 },
      hoverinfo: 'skip',
    },
    {
      type: 'scatter3d',
      mode: 'markers',
      x: markerX,
      y: markerY,
      z: markerZ,
      marker: { color: '#ffffff', size: 3.5, line: { color: props.color, width: 1 } },
      text: markerNames,
      hoverinfo: 'text',
    },
  ]
}

/**
 * gl3d 場景「當下」的相機狀態(含拖曳中尚未 commit 回 layout 的部分)。
 * 每次 react 都以此為準,重繪就永遠不會把使用者的視角蓋掉。
 */
function liveCamera() {
  const gd = chartRef.value as
    | (HTMLDivElement & { _fullLayout?: { scene?: { _scene?: { getCamera?: () => unknown } } } })
    | null
  return gd?._fullLayout?.scene?._scene?.getCamera?.() ?? null
}

function buildLayout() {
  const { range, aspect } = space.value
  return {
    height: props.height,
    margin: { l: 0, r: 0, t: 0, b: 0 },
    showlegend: false,
    // 固定值 → Plotly.react 重畫時保留使用者旋轉 / 縮放的視角
    uirevision: 'pose3d-skeleton',
    scene: {
      // manual + 固定 aspectratio:空間比例由整段動作決定,不隨當下 frame 適配
      aspectmode: 'manual',
      aspectratio: aspect,
      xaxis: { title: { text: 'x (cm)' }, range: range.x },
      yaxis: { title: { text: 'y (cm)' }, range: range.y },
      zaxis: { title: { text: 'z (cm)' }, range: range.z },
      // 初次渲染用預設視角(三壘側斜上方,距離隨場景大小等比縮放),
      // 之後一律沿用使用者當下的視角
      camera: liveCamera() ?? {
        eye: { x: aspect.x * 2.4, y: -aspect.y * 1.8, z: aspect.z * 0.9 },
        center: { x: 0, y: 0, z: 0 },
        up: { x: 0, y: 0, z: 1 },
      },
    },
  }
}

/**
 * 使用者拖曳旋轉期間必須暫停 Plotly.react:播放中每秒重畫 ~60 次,
 * 每次重畫都會打斷 gl3d 進行中的拖曳手勢,造成「播放中無法旋轉」。
 * 按住期間 skip 重繪(骨架暫時定格),放開後補畫當下 frame。
 */
let interacting = false
let renderPending = false

async function render() {
  if (!plotly || !chartRef.value || props.frames.length === 0)
    return
  if (interacting) {
    renderPending = true
    return
  }
  const frame = props.timeMs == null ? null : findPoseFrame(props.frames, props.timeMs)
  await plotly.react(chartRef.value, buildTraces(frame), buildLayout(), { displaylogo: false })
}

function onPointerDown() {
  interacting = true
}

function onPointerUp() {
  if (!interacting)
    return
  // 延兩個 rAF 再恢復:讓 gl3d 先把拖曳結果 commit 回 layout
  requestAnimationFrame(() => requestAnimationFrame(() => {
    interacting = false
    if (renderPending) {
      renderPending = false
      void render()
    }
  }))
}

onMounted(async () => {
  chartRef.value?.addEventListener('pointerdown', onPointerDown)
  // 放開可能發生在圖表外,監聽整個 window
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
  plotly = await import('plotly.js-dist-min')
  await render()
})

watch(() => [props.timeMs, props.frames, props.color], render)

onBeforeUnmount(() => {
  chartRef.value?.removeEventListener('pointerdown', onPointerDown)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
  if (plotly && chartRef.value)
    plotly.purge(chartRef.value)
})
</script>

<template>
  <div ref="chartRef" class="w-full" data-testid="pose3d-skeleton" />
</template>

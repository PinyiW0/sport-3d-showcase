<script setup lang="ts">
/**
 * 3D 骨架動畫（Plotly scatter3d）——遷移到 Three.js 之前的實作，保留作為對照版。
 * props 介面與 pitch-pose 的 Three.js 版相同，可直接互換。
 *
 * 由父層時鐘餵 `timeMs`，每次更新用 Plotly.react 重畫當下 frame。
 * 場景僅 17 點 + 19 條骨頭，react 成本低，60fps 播放無壓力。
 *
 * 兩個 Plotly 特有的包袱（Three.js 版都不需要，見 pitch-pose/README.md）：
 * - 視角保留得讀私有結構 `gd._fullLayout.scene._scene.getCamera()`
 * - 播放中每秒 ~60 次重繪會打斷 gl3d 拖曳，必須在按住期間暫停重繪
 */
import type { Pose3dFrame } from '../pitch-pose-data/core/parsePitchOutcome'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { findPoseFrame } from '../pitch-pose-data/core/findPoseFrame'
import { computeSkeletonBounds } from '../pitch-pose-data/core/skeletonBounds'
import { buildLayout, buildTraces } from './core/plotlyFigure'

const props = withDefaults(
  defineProps<{
    frames: readonly Pose3dFrame[]
    /** 目前播放時間（毫秒）；null 或無對應 frame 時只顯示空場景。 */
    timeMs: number | null
    height?: number
    /** 骨架顏色。 */
    color?: string
    /**
     * 深色畫布。Plotly 預設是白底配深色軸，放進深色版面（如索引頁的預覽卡）會突兀；
     * 開啟後底色與軸文字一起翻深，不影響骨架配色。預設 false 以維持既有呈現。
     */
    dark?: boolean
  }>(),
  {
    height: 480,
    color: '#22c55e',
    dark: false,
  },
)

const chartRef = ref<HTMLDivElement | null>(null)
let plotly: typeof import('plotly.js-dist-min') | null = null

/** 立體空間由「整段動作」決定，播放中永不重算，否則骨架會隨每幀資料範圍「呼吸」。 */
const space = computed(() => computeSkeletonBounds(props.frames))

/**
 * gl3d 場景「當下」的相機狀態（含拖曳中尚未 commit 回 layout 的部分）。
 * 每次 react 都以此為準，重繪就永遠不會把使用者的視角蓋掉。
 */
function liveCamera() {
  const gd = chartRef.value as
    | (HTMLDivElement & { _fullLayout?: { scene?: { _scene?: { getCamera?: () => unknown } } } })
    | null
  return gd?._fullLayout?.scene?._scene?.getCamera?.() ?? null
}

/**
 * 使用者拖曳旋轉期間必須暫停 Plotly.react：播放中每秒重畫 ~60 次，
 * 每次重畫都會打斷 gl3d 進行中的拖曳手勢，造成「播放中無法旋轉」。
 * 按住期間 skip 重繪（骨架暫時定格），放開後補畫當下 frame。
 */
let interacting = false
let renderPending = false
/** 卸載旗標。plotly 的 dynamic import 與 react 都是 await,續行前得確認元件還活著。 */
let disposed = false

async function render() {
  const el = chartRef.value
  if (!plotly || !el || disposed || props.frames.length === 0)
    return
  if (interacting) {
    renderPending = true
    return
  }
  const frame = props.timeMs == null ? null : findPoseFrame(props.frames, props.timeMs)
  await plotly.react(
    el,
    buildTraces(frame, space.value, props.color),
    buildLayout(space.value, {
      height: props.height,
      dark: props.dark,
      camera: liveCamera(),
    }),
    { displaylogo: false },
  )
  // 卸載落在 react 期間時 onBeforeUnmount 的 purge 可能早於這次繪製,自己收
  if (disposed)
    plotly.purge(el)
}

function onPointerDown() {
  interacting = true
}

function onPointerUp() {
  if (!interacting)
    return
  // 延兩個 rAF 再恢復：讓 gl3d 先把拖曳結果 commit 回 layout
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
  // 放開可能發生在圖表外，監聽整個 window
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
  plotly = await import('plotly.js-dist-min')
  // 卸載落在 import 期間時 onBeforeUnmount 早已跑完(當時 plotly 還是 null,沒 purge 到),
  // 這裡再畫下去會在已脫離文件的節點上開出 WebGL context
  if (disposed)
    return
  await render()
})

watch(() => [props.timeMs, props.frames, props.color, props.dark], render)

onBeforeUnmount(() => {
  disposed = true
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

<script setup lang="ts">
import BaseballSpinViewer from '~/components/baseball-spin/BaseballSpinViewer.vue'
import { parseSpinResult } from '~/components/baseball-spin/core/types'
import SpinTiltClock from '~/components/clock-spin/SpinTiltClock.vue'
import Pose3dHuman from '~/components/pitch-pose/Pose3dHuman.vue'
import Pose3dSkeleton from '~/components/pitch-pose/Pose3dSkeleton.vue'
import PitchTrajectoryChart from '~/components/pitch-trajectory/PitchTrajectoryChart.vue'
import {
  pitchFromStrikeZonePoint,
  strikeZoneFromHeight,
} from '~/components/strike-zone-grid/core/useStrikeZoneScale'
import StrikeZone from '~/components/strike-zone-grid/StrikeZone.vue'
import { usePose3dClip } from '~/composables/usePose3dClip'

// 預覽錄製頁：只渲染模組的呈現本體（不含 Showcase 的控制列），
// 供 scripts/capture-previews.mjs 用 Playwright 錄成卡片 hover 用的 webm。
// viewport 由腳本設成 PREVIEW_SIZE，頁面填滿即可。

const PREVIEW_WIDTH = 480
const PREVIEW_HEIGHT = 300
/** 球的呈現尺寸（正方形）；小於畫布高度，四周留黑邊 */
const SPIN_SIZE = 230
/** 時鐘盤面尺寸；含上方標籤列，抓略小於畫布高度 */
const CLOCK_SIZE = 250

const route = useRoute()
const slug = computed(() => String(route.params.slug))

const needsBt3d = computed(() => slug.value === 'pitch-trajectory' || slug.value === 'strike-zone-grid')
const needsPose = computed(() => slug.value === 'pitch-pose-skeleton' || slug.value === 'pitch-pose-human')

// --- spin 樣本：baseball-spin 靠球自轉、clock-spin 靠逐 sample 輪播指針角度 ---
const needsSpin = computed(() => slug.value === 'baseball-spin' || slug.value === 'clock-spin')
const SPIN_SAMPLES = ['sample1', 'sample2', 'sample3']
const spinSampleIndex = ref(0)

const { data: spinData } = useFetch(
  () => `/samples/spin/${SPIN_SAMPLES[spinSampleIndex.value]}/result.json`,
  {
    server: false,
    immediate: needsSpin.value,
    transform: json => parseSpinResult(json),
  },
)

// --- bt3d 兩個模組：呈現本身是靜態的，用「逐球輪播」當動畫 ---
const { pitches } = useBt3dSamples()
const rotatingIndex = ref(0)
let rotateTimer: ReturnType<typeof setInterval> | undefined

let spinTimer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  if (needsBt3d.value) {
    rotateTimer = setInterval(() => {
      if (pitches.value.length)
        rotatingIndex.value = (rotatingIndex.value + 1) % pitches.value.length
    }, 500)
  }
  // 時鐘盤面本身是靜態的，輪播 sample 讓指針換角度才看得出是動的
  if (slug.value === 'clock-spin') {
    spinTimer = setInterval(() => {
      spinSampleIndex.value = (spinSampleIndex.value + 1) % SPIN_SAMPLES.length
    }, 1200)
  }
})
onBeforeUnmount(() => {
  clearInterval(rotateTimer)
  clearInterval(spinTimer)
})

const currentPitch = computed(() => pitches.value[rotatingIndex.value] ?? null)
const trajectory = computed(() => currentPitch.value?.trajectory ?? [])

const zone = strikeZoneFromHeight(175)
const shownPitches = computed(() =>
  currentPitch.value ? [pitchFromStrikeZonePoint(currentPitch.value.strikeZonePoint)] : [],
)

// --- pose3d 兩個模組：rAF 時鐘本身就是動畫 ---
// 預設 0.25× 是給人細看用的，做成幾秒的循環預覽會顯得停滯，這裡調快
const { pitch: poseClip, clockMs, rate } = usePose3dClip()
rate.value = 0.7

// 畫布底色要跟該模組的呈現一致，否則錄出來的影片會出現與內容不搭的邊。
// baseball-spin 的 viewer 是正方形（three.js renderer 開 alpha，背景全靠 CSS），
// 放進 480×300 的畫布左右會露出外層背景，所以整塊得是黑的。
const canvasBg = computed(() =>
  slug.value === 'baseball-spin' || slug.value === 'pitch-trajectory' ? 'bg-black' : 'bg-white',
)

// 錄製腳本靠這個旗標判斷「內容已就緒、可以開錄」
const ready = computed(() => {
  if (needsBt3d.value)
    return trajectory.value.length > 0
  if (needsPose.value)
    return poseClip.value != null
  if (needsSpin.value)
    return spinData.value != null
  return false
})
</script>

<template>
  <div
    class="flex items-center justify-center overflow-hidden"
    :class="canvasBg"
    :style="{ width: `${PREVIEW_WIDTH}px`, height: `${PREVIEW_HEIGHT}px` }"
    :data-preview-ready="ready"
  >
    <!-- viewer 內部是 aspect-square，需要外層給定尺寸才撐得開；
         留白邊讓球不要頂到畫布邊緣（卡片上是 object-cover，上下會再裁掉約 7%） -->
    <div v-if="slug === 'baseball-spin'" :style="{ width: `${SPIN_SIZE}px`, height: `${SPIN_SIZE}px` }">
      <!-- 1/8 是對照後端 gif 的慢速；預覽要看得出「在轉」，調到 1/3 -->
      <BaseballSpinViewer
        :data="spinData ?? null"
        :speed="1 / 3"
        :show-axis-arrow="true"
      />
    </div>

    <div v-else-if="slug === 'clock-spin'" :style="{ width: `${CLOCK_SIZE}px` }">
      <SpinTiltClock
        v-if="spinData"
        :degrees="spinData.spinTilt.degrees"
        :hhmm="spinData.spinTilt.hhmm"
      />
    </div>

    <PitchTrajectoryChart
      v-else-if="slug === 'pitch-trajectory'"
      :trajectory="trajectory"
      :width="PREVIEW_WIDTH"
      :height="PREVIEW_HEIGHT"
    />

    <!-- StrikeZone 的 svg 是 w-full h-auto，直接放會超出高度把落點裁掉；強制改成以高度為準 -->
    <div v-else-if="slug === 'strike-zone-grid'" class="h-full [&_svg]:h-full! [&_svg]:w-auto!">
      <!-- padding 放大到 1：資料裡有幾顆離群球（x 可達 98cm），預設 0.6 的框會把它們裁在邊緣 -->
      <StrikeZone
        :zone="zone"
        :pitches="shownPitches"
        :padding-fraction="1"
        :pitch-radius="4"
        show-field
      />
    </div>

    <Pose3dSkeleton
      v-else-if="slug === 'pitch-pose-skeleton' && poseClip"
      :frames="poseClip.frames"
      :time-ms="clockMs"
      :height="PREVIEW_HEIGHT"
    />

    <Pose3dHuman
      v-else-if="slug === 'pitch-pose-human' && poseClip"
      :frames="poseClip.frames"
      :time-ms="clockMs"
      :height="PREVIEW_HEIGHT"
    />
  </div>
</template>

<script setup lang="ts">
import type { BatterLevel } from '~/components/baseball-field/core/batterLevels'
import { BATTER_LEVELS, getStrikeZoneForLevel } from '~/components/baseball-field/core/batterLevels'
import BaseballSpinViewer from '~/components/baseball-spin/BaseballSpinViewer.vue'
import { parseSpinResult } from '~/components/baseball-spin/core/types'
import SpinTiltClock from '~/components/clock-spin/SpinTiltClock.vue'
import { filterPitches } from '~/components/pitch-distribution/core/distribution'
import PitchDistribution from '~/components/pitch-distribution/PitchDistribution.vue'
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

/** 基準畫布尺寸（16:10，對齊索引頁卡片的 aspect-16/10）。 */
const BASE_WIDTH = 480
const BASE_HEIGHT = 300
/** 球的呈現尺寸（正方形）；小於畫布高度，四周留黑邊 */
const BASE_SPIN_SIZE = 230
/** 時鐘盤面尺寸；含上方標籤列，抓略小於畫布高度 */
const BASE_CLOCK_SIZE = 250
/**
 * 九宮格的呈現寬度。以寬度而非高度為準是刻意的：StrikeZone 的 viewWidth
 * 恆為 129.54（本壘板寬固定），viewHeight 才隨級別變，所以固定寬度時
 * 框寬在畫面上恆定、只有高度變——這才是好球帶真正的行為。
 * 284 = 300 × 129.54 / 136.74，讓最高的成棒框剛好塞滿畫布高度不被裁。
 */
const BASE_SZ_WIDTH = 284

const route = useRoute()
const slug = computed(() => String(route.params.slug))

/**
 * 畫布放大倍率，由 `?scale=2` 帶入（錄製腳本使用）。
 *
 * 走 CSS `zoom` 而不是把尺寸常數乘上去：3D 元件的線寬與標記大小是**像素單位**
 * （骨架線 6px、軌跡線 2px），畫布直接開成 2 倍的話這些線相對畫面會細一半。
 * `zoom` 讓元素的 `clientWidth` 維持 480，元件算出來的比例不變，但瀏覽器以
 * 2 倍畫素渲染——配合錄製端的 deviceScaleFactor，canvas buffer 也跟著加倍。
 *
 * 也不能只在錄製端用 deviceScaleFactor：Playwright 的 `recordVideo.size` 只會把
 * 畫面**縮小**塞進指定尺寸、不會放大，viewport 沒放大就會錄出「畫面在左上角、
 * 其餘補灰」的結果。
 */
const scale = computed(() => {
  const value = Number(route.query.scale)
  return Number.isFinite(value) && value > 0 ? value : 1
})

const PREVIEW_WIDTH = BASE_WIDTH
const PREVIEW_HEIGHT = BASE_HEIGHT
const SPIN_SIZE = BASE_SPIN_SIZE
const CLOCK_SIZE = BASE_CLOCK_SIZE
const SZ_WIDTH = BASE_SZ_WIDTH

const asset = useAssetUrl()

const needsBt3d = computed(() => slug.value === 'pitch-trajectory' || slug.value === 'strike-zone-grid')
const needsPose = computed(() => slug.value === 'pitch-pose-skeleton' || slug.value === 'pitch-pose-human')

// --- spin 樣本：baseball-spin 靠球自轉、clock-spin 靠逐 sample 輪播指針角度 ---
const needsSpin = computed(() => slug.value === 'baseball-spin' || slug.value === 'clock-spin')
const SPIN_SAMPLES = ['sample1', 'sample2', 'sample3']
const spinSampleIndex = ref(0)

const { data: spinData } = useFetch(
  () => asset(`/samples/spin/${SPIN_SAMPLES[spinSampleIndex.value]}/result.json`),
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

// --- strike-zone-grid：除了逐球輪播,再輪播打者級別。
// 預覽頁不含控制列,好球帶「依級別變高變矮」這個能力只能靠輪播演出來,
// 否則預覽跟沒有級別功能時長得一模一樣。
const LEVEL_SEQUENCE: BatterLevel[] = ['little', 'junior', 'senior', 'adult']
const levelIndex = ref(0)
let levelTimer: ReturnType<typeof setInterval> | undefined

// --- pitch-distribution：分布圖是靜態的,輪播球種當動畫。
// 這也剛好是這個模組的賣點:同一批球換個球種看,熱區位置就整片移動。
const { pitches: distributionPitches } = useDistributionSamples()
const DISTRIBUTION_TYPES: (string | null)[] = [null, 'FF', 'SL', 'CU', 'CH']
const distributionIndex = ref(0)
let distributionTimer: ReturnType<typeof setInterval> | undefined

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
  if (slug.value === 'pitch-distribution') {
    distributionTimer = setInterval(() => {
      distributionIndex.value = (distributionIndex.value + 1) % DISTRIBUTION_TYPES.length
    }, 1200)
  }
  // 比球的 500ms 慢得多：框的高度變化要看得清楚，跟著球一起快跳只會眼花
  if (slug.value === 'strike-zone-grid') {
    levelTimer = setInterval(() => {
      levelIndex.value = (levelIndex.value + 1) % LEVEL_SEQUENCE.length
    }, 1500)
  }
})
onBeforeUnmount(() => {
  clearInterval(rotateTimer)
  clearInterval(spinTimer)
  clearInterval(distributionTimer)
  clearInterval(levelTimer)
})

const currentPitch = computed(() => pitches.value[rotatingIndex.value] ?? null)
const trajectory = computed(() => currentPitch.value?.trajectory ?? [])

// 身高不寫死數字——單一來源是 BATTER_LEVELS
const zone = computed(() =>
  strikeZoneFromHeight(BATTER_LEVELS[LEVEL_SEQUENCE[levelIndex.value]!].referenceHeightCm),
)
/**
 * 顯示最近幾球而非只有當前那一球：資料裡有離群到 x=98cm 的球，只畫一顆時
 * poster 有機會拍到「空的好球帶」，看起來像壞掉。窗口式顯示還讓輪播看得出
 * 球在流動（新的進、舊的出）。
 */
const PITCH_WINDOW = 6
const shownPitches = computed(() => {
  const list = pitches.value
  if (!list.length)
    return []
  const size = Math.min(PITCH_WINDOW, list.length)
  return Array.from({ length: size }, (_, i) => {
    const index = (rotatingIndex.value - i + list.length) % list.length
    return pitchFromStrikeZonePoint(list[index]!.strikeZonePoint)
  })
})

const distributionZone = getStrikeZoneForLevel('adult')
const shownDistribution = computed(() =>
  filterPitches(distributionPitches.value, {
    pitchType: DISTRIBUTION_TYPES[distributionIndex.value] ?? null,
  }),
)

// --- pose3d 兩個模組：rAF 時鐘本身就是動畫 ---
// 預設 0.25× 是給人細看用的，做成幾秒的循環預覽會顯得停滯，這裡調快
const { pitch: poseClip, clockMs, rate } = usePose3dClip()
rate.value = 0.7

// 全部模組一律黑底：卡片牆上七張縮圖底色不一（原本兩黑五白）看起來很雜。
// 光把背景刷黑不夠——SVG 模組的線條是 stroke-neutral-600 這類深色，黑底上會消失，
// 所以根節點掛 dark class 讓元件自己的 dark: variant 生效（Tailwind 的 dark 是
// class-based，祖先有 .dark 就成立），內容跟著切到深色模式。

// 錄製腳本靠這個旗標判斷「內容已就緒、可以開錄」
const ready = computed(() => {
  if (needsBt3d.value)
    return trajectory.value.length > 0
  if (needsPose.value)
    return poseClip.value != null
  if (needsSpin.value)
    return spinData.value != null
  if (slug.value === 'pitch-distribution')
    return distributionPitches.value.length > 0
  return false
})
</script>

<template>
  <div
    class="dark flex items-center justify-center overflow-hidden bg-black"
    :style="{ width: `${PREVIEW_WIDTH}px`, height: `${PREVIEW_HEIGHT}px`, zoom: scale }"
    :data-preview-ready="ready"
  >
    <!-- viewer 內部是 aspect-square，需要外層給定尺寸才撐得開；
         留白邊讓球不要頂到畫布邊緣（卡片上是 object-cover，上下會再裁掉約 7%） -->
    <div v-if="slug === 'baseball-spin'" :style="{ width: `${SPIN_SIZE}px`, height: `${SPIN_SIZE}px` }">
      <!-- 1/8 是對照後端 gif 的慢速；預覽要看得出「在轉」，調到 1/3 -->
      <BaseballSpinViewer
        :data="spinData ?? null"
        :model-url="asset('/models/baseball_detail.glb')"
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

    <div v-else-if="slug === 'strike-zone-grid'" :style="{ width: `${SZ_WIDTH}px` }">
      <!-- padding 放大到 1：資料裡有幾顆離群球（x 可達 98cm），預設 0.6 的框會把它們裁在邊緣 -->
      <StrikeZone
        :zone="zone"
        :pitches="shownPitches"
        :padding-fraction="1"
        :pitch-radius="4"
        show-field
      />
    </div>

    <!-- 這裡刻意「不」像 StrikeZone 那樣改成以高度為準：分布圖的 viewBox 近正方形，
         塞進 480×300 會左右各留近百像素白邊。用 svg 原本的 w-full 填滿寬度，
         由外層 overflow-hidden 垂直居中裁掉最外圈的離群球——好球帶仍完整在畫面內。 -->
    <div v-else-if="slug === 'pitch-distribution'" class="w-full">
      <PitchDistribution
        :pitches="shownDistribution"
        :zone="distributionZone"
      />
    </div>

    <!-- dark：這兩支的畫布底色寫在元件內（Plotly 白畫布 / three.js 白場景），
         外層的 bg-black 蓋不到，只能由元件自己翻深 -->
    <Pose3dSkeleton
      v-else-if="slug === 'pitch-pose-skeleton' && poseClip"
      :frames="poseClip.frames"
      :time-ms="clockMs"
      :height="PREVIEW_HEIGHT"
      dark
    />

    <Pose3dHuman
      v-else-if="slug === 'pitch-pose-human' && poseClip"
      :frames="poseClip.frames"
      :time-ms="clockMs"
      :height="PREVIEW_HEIGHT"
      :model-url="asset('/models/Xbot.glb')"
      dark
    />
  </div>
</template>

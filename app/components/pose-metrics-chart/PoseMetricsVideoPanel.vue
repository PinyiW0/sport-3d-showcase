<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { clampFrame, frameToTime, timeToFrame, VIDEO_FPS } from './core/videoSync'

// 三機影片面板：與折線圖共用同一個播放頭（影格序號），播放時由這裡推、
// 拖曳圖表時由外面推。
//
// 刻意不用 NuxtUI（USlider／UIcon）：這個資料夾是可攜模組，整包 cp 到沒有
// NuxtUI 的專案要能跑。時間軸用原生 <input type="range">，順便免費拿到鍵盤
// 左右鍵操作；圖示用 inline SVG。

export interface VideoSource {
  /** 機位代號，也是 v-for 的 key */
  key: string
  /** 顯示名稱（如「本壘後方」） */
  label: string
  src: string
}

const props = withDefaults(
  defineProps<{
    /**
     * 第一支即預設主畫面，其餘依序排成右側縮圖。
     * 版面是「一大兩小」，給超過三支時第三支之後會疊在第二格。
     */
    sources: VideoSource[]
    /**
     * 影片有幾格。折線圖的軸畫到名目長度（750），影片只到實際交付的格數，
     * 超出的影格沒有畫面——那時停在最後一格並明說，不要靜靜凍住。
     */
    frameCount: number
    fps?: number
    /** 當下影格的實際擷取秒數。影片是慢動作重編碼，秒數不能拿影片時間換算 */
    captureSeconds?: number | null
  }>(),
  {
    fps: VIDEO_FPS,
    captureSeconds: null,
  },
)

/** 播放頭。播放中由 rAF 迴圈寫入，暫停中吃外部寫入 */
const frame = defineModel<number>('frame', { default: 0 })
/** 外部把它設成 false 就能叫停（拖曳圖表時用得到） */
const playing = defineModel<boolean>('playing', { default: false })

/** 跟隨機位允許的時間誤差。每格都校正會打斷解碼，比放著漂還糟 */
const DRIFT_TOLERANCE_SEC = 0.12

const PLAYBACK_RATES = [0.5, 1, 2]
const rate = ref(1)

const players = new Map<string, HTMLVideoElement>()

const activeKey = ref('')
const active = computed(() =>
  props.sources.find(source => source.key === activeKey.value) ?? props.sources[0] ?? null,
)
const thumbnails = computed(() => props.sources.filter(source => source.key !== active.value?.key))

const lastFrame = computed(() => Math.max(0, props.frameCount - 1))
/** 播放頭跑到影片之外（軸比影片長）。畫面停在最後一格，讀數區說明原因 */
const beyondVideo = computed(() => props.frameCount > 0 && frame.value > lastFrame.value)
const scrubValue = computed(() => Math.min(frame.value, lastFrame.value))

/**
 * 格線位置。三支影片的 DOM 順序固定不動，切主畫面只換 class——
 * 把 <video> 搬到另一個容器會重新掛載，等於整支影片重載、畫面閃一下。
 *
 * 寬螢幕是三欄兩列、主畫面佔 2×2：主畫面的 4:3 決定總高，剩下那欄的兩格剛好
 * 也是 4:3，三個畫面都不必裁也不留黑邊。窄畫面改成堆疊——一大兩小擠進 390px
 * 時主畫面只剩不到 200px 寬，看不清骨架，不如讓它滿版、縮圖並排在下面。
 */
function cellClass(key: string) {
  if (key === active.value?.key)
    return 'col-start-1 col-span-2 row-start-1 sm:row-span-2'
  return thumbnails.value[0]?.key === key
    ? 'col-start-1 row-start-2 sm:col-start-3 sm:row-start-1'
    : 'col-start-2 row-start-2 sm:col-start-3 sm:row-start-2'
}

function registerPlayer(key: string, el: unknown) {
  if (el instanceof HTMLVideoElement) {
    el.playbackRate = rate.value
    players.set(key, el)
  }
  else {
    players.delete(key)
  }
}

/** 把所有機位對到指定影格。差距不到半格就跳過——重設 currentTime 會讓解碼重來 */
function seekAll(target: number) {
  const time = frameToTime(clampFrame(target, props.frameCount), props.fps)
  const tolerance = 0.5 / props.fps
  for (const video of players.values()) {
    if (Math.abs(video.currentTime - time) > tolerance)
      video.currentTime = time
  }
}

let rafId: number | undefined

function stopLoop() {
  if (rafId !== undefined) {
    cancelAnimationFrame(rafId)
    rafId = undefined
  }
}

/**
 * 播放中的同步：主畫面自己解碼，rAF 只負責讀它的時間換算成影格。
 *
 * 不對每一格下 currentTime——那等於逐格 seek，硬體解碼的優勢會整個丟掉。
 * 跟隨機位同理，漂超過門檻才拉回來。
 */
function tick() {
  const main = active.value ? players.get(active.value.key) : undefined
  if (!main || !playing.value) {
    stopLoop()
    return
  }

  const next = clampFrame(timeToFrame(main.currentTime, props.fps), props.frameCount)
  if (next !== frame.value)
    frame.value = next

  for (const [key, video] of players) {
    if (key !== active.value?.key && Math.abs(video.currentTime - main.currentTime) > DRIFT_TOLERANCE_SEC)
      video.currentTime = main.currentTime
  }

  if (main.ended) {
    playing.value = false
    return
  }
  rafId = requestAnimationFrame(tick)
}

watch(playing, (value) => {
  if (value) {
    // 播完了再按播放就從頭來，不然按下去沒反應
    if (frame.value >= lastFrame.value)
      seekAll(0)
    for (const video of players.values())
      void video.play()?.catch(() => {})
    stopLoop()
    rafId = requestAnimationFrame(tick)
  }
  else {
    stopLoop()
    for (const video of players.values())
      video.pause()
  }
})

// 播放中的 frame 變動是自己寫的，再 seek 一次會跟解碼打架
watch(frame, (value) => {
  if (!playing.value)
    seekAll(value)
})

watch(rate, (value) => {
  for (const video of players.values())
    video.playbackRate = value
})

// 換一批來源時舊的 activeKey 可能已不存在，清掉讓 computed 退回第一支
watch(() => props.sources, () => {
  if (!props.sources.some(source => source.key === activeKey.value))
    activeKey.value = ''
})

onBeforeUnmount(stopLoop)

/** 影片就緒才設得動 currentTime，所以每支載完 metadata 各自對一次位 */
function onLoadedMetadata(key: string) {
  const video = players.get(key)
  if (!video)
    return
  video.playbackRate = rate.value
  video.currentTime = frameToTime(clampFrame(frame.value, props.frameCount), props.fps)
}

function onScrub(event: Event) {
  playing.value = false
  frame.value = clampFrame(Number((event.target as HTMLInputElement).value), props.frameCount)
}

const secondsLabel = computed(() =>
  props.captureSeconds === null ? null : `${props.captureSeconds.toFixed(2)} 秒`,
)
</script>

<template>
  <div class="space-y-2" data-testid="pose-metrics-video">
    <!-- 限寬是必要的：主畫面佔 3/4 欄寬，在寬螢幕上會長到 800px 高，
         把折線圖整個擠到摺線下——影片與曲線同時看得到才是這個版面的目的 -->
    <div class="mx-auto grid w-full max-w-3xl grid-cols-2 gap-2 sm:grid-cols-3 sm:grid-rows-2">
      <div
        v-for="source in sources"
        :key="source.key"
        class="relative min-w-0 bg-neutral-900"
        :class="cellClass(source.key)"
        :data-testid="`pose-metrics-video-cell-${source.key}`"
        :data-active="source.key === active?.key"
      >
        <!-- 主畫面的 4:3 撐出整個格線的高度；縮圖在寬螢幕靠絕對定位填滿分到的
             格子，窄畫面回到常規流、自己用 4:3 撐高 -->
        <video
          :ref="el => registerPlayer(source.key, el)"
          :src="source.src"
          class="h-full w-full object-contain"
          :class="source.key === active?.key ? 'aspect-4/3' : 'aspect-4/3 sm:absolute sm:inset-0 sm:aspect-auto'"
          muted
          playsinline
          preload="auto"
          @loadedmetadata="onLoadedMetadata(source.key)"
        />
        <span class="absolute left-1.5 top-1.5 bg-neutral-900/80 px-1.5 py-0.5 text-xs text-white">
          {{ source.label }}
        </span>
        <!-- 縮圖整格可點；蓋在影片上而不是包住它，換主畫面時 <video> 不會重新掛載 -->
        <button
          v-if="source.key !== active?.key"
          type="button"
          class="absolute inset-0 focus-visible:ring-2 focus-visible:ring-primary-500"
          :aria-label="`切換到${source.label}`"
          :data-testid="`pose-metrics-video-thumb-${source.key}`"
          @click="activeKey = source.key"
        />
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <button
        type="button"
        class="flex h-8 w-8 shrink-0 items-center justify-center border border-neutral-300 text-neutral-800 focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-neutral-700 dark:text-neutral-100"
        :aria-label="playing ? '暫停' : '播放'"
        data-testid="pose-metrics-video-play"
        @click="playing = !playing"
      >
        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor" aria-hidden="true">
          <path v-if="playing" d="M6 5h4v14H6zM14 5h4v14h-4z" />
          <path v-else d="M8 5v14l11-7z" />
        </svg>
      </button>

      <input
        type="range"
        min="0"
        :max="lastFrame"
        step="1"
        :value="scrubValue"
        class="min-w-40 flex-1 accent-primary-500"
        aria-label="影片時間軸"
        data-testid="pose-metrics-video-scrub"
        @input="onScrub"
      >

      <div class="flex shrink-0 items-center gap-1">
        <button
          v-for="value in PLAYBACK_RATES"
          :key="value"
          type="button"
          class="border px-2 py-1 text-xs tabular-nums focus-visible:ring-2 focus-visible:ring-primary-500"
          :class="rate === value
            ? 'border-neutral-800 text-neutral-900 dark:border-neutral-200 dark:text-neutral-100'
            : 'border-neutral-300 text-neutral-500 dark:border-neutral-700'"
          :aria-pressed="rate === value"
          @click="rate = value"
        >
          {{ value }}×
        </button>
      </div>

      <p class="text-sm tabular-nums text-neutral-600 dark:text-neutral-400" data-testid="pose-metrics-video-readout">
        第 {{ frame }} 影格<template v-if="secondsLabel">
          · {{ secondsLabel }}
        </template>
        <span v-if="beyondVideo" class="text-neutral-500"> · 此影格無影像</span>
      </p>
    </div>

    <p class="text-xs text-neutral-500 dark:text-neutral-400">
      影片是 {{ fps }}fps 的慢動作重編碼，1× 約等於實際速度的 1/8；秒數取自實際擷取時間，不是影片時間。
    </p>
  </div>
</template>

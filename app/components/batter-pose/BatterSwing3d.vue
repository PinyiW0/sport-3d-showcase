<script setup lang="ts">
import type { BpeSwing } from '../bpe-data/core/types'
import type { SwingView } from './core/swingFraming'
/**
 * 打者揮棒 3D 動畫（three.js）。由父層（播放時鐘）餵 `frame`，每次變動就把
 * 當下幀套進場景。
 *
 * 本元件只是薄殼：場景邏輯全在 core/swingScene.ts（框架無關的 class），
 * 換到 React／Svelte 只要重寫這幾十行。three 於 onMounted 內動態 import，
 * SSR 安全且不進 server bundle。
 *
 * 沿用 pitch-pose/Pose3dSkeleton.vue 的 onMounted 動態 import 後 disposed 檢查
 * ——那是修過的 WebGL context 洩漏（await 期間卸載）。
 */
import type { SwingScene } from './core/swingScene'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { BALL_FALLBACK_COLOR, swingTheme, toCssColor } from './core/swingTheme'

const props = withDefaults(
  defineProps<{
    swing: BpeSwing
    /** 目前顯示第幾幀（幀索引，非時間）。 */
    frame: number
    height?: number
    /** 深色畫布（放進深色版面時開啟）。 */
    dark?: boolean
    /**
     * 球的 glTF 模型網址；給了就用模型畫拖尾的球，不給就畫規範預設的紅球。
     * 只在建立場景時讀一次（換模型的需求少，不值得做熱替換）。
     */
    ballModelUrl?: string
    /**
     * 可互動時才疊上「擊球瞬間」標籤、操作提示與視角切換。不能操作的縮圖（預覽影片）關掉：
     * 標籤在循環播放時只會閃一幀，看起來像畫面壞掉。
     */
    interactive?: boolean
  }>(),
  {
    height: 440,
    dark: false,
    ballModelUrl: undefined,
    interactive: true,
  },
)

/**
 * stats：疊在畫布右上角的數據面板，內容由呼叫端決定（例如本次揮棒的核心數據）。
 * 面板的底色與框線由本元件依畫布深淺提供；給了 stats，右上角的操作提示就讓位，由呼叫端另外放。
 */
const slots = defineSlots<{ stats?: () => unknown }>()

/** 視角按鈕：標籤兩個字，手機上五顆排得下；完整說明放提示，點目前這一顆也會重新取景 */
const VIEW_OPTIONS: Array<{ value: SwingView, label: string, title: string }> = [
  { value: 'overview', label: '全景', title: '全景：框住整段揮棒與球（預設）' },
  { value: 'batter', label: '特寫', title: '打者特寫：只框打者身體，球棒揮到最高處與球可能出框' },
  { value: 'side', label: '側面', title: '側面：從一壘側平視，看跨步距離與球棒高低' },
  { value: 'pitcher', label: '投手', title: '投手方向：從投手的位置往本壘看' },
  { value: 'top', label: '俯視', title: '俯視：從上方看打者與球相對本壘板的位置' },
]
const VIEW_TITLE_SUFFIX = '（再按一次可重設視角）'

const hostRef = ref<HTMLDivElement | null>(null)
const view = ref<SwingView>('overview')
let scene: SwingScene | null = null
/** 卸載旗標。onMounted 的 await 期間就可能卸載，續行前必須重新確認元件還活著。 */
let disposed = false

const isContactFrame = computed(() => props.swing.contactFrame != null && props.swing.contactFrame === props.frame)

/**
 * 圖例色塊直接讀場景用的同一份配色（core/swingTheme.ts），不另外維護一組 Tailwind class。
 * 骨頭與球棒畫成短線、球畫成圓點，對得上畫面上的形狀。
 */
const legend = computed(() => {
  const theme = swingTheme(props.dark)
  return [
    { label: '左半身', color: toCssColor(theme.left) },
    { label: '右半身', color: toCssColor(theme.right) },
    { label: '軀幹', color: toCssColor(theme.core) },
    { label: '球棒', color: toCssColor(theme.bat) },
  ]
})
/**
 * 球的圖例要跟畫面一致：棒球模型真的換上去才畫成白球（淡灰外框，淺底上才看得到），
 * 沒用模型、模型還沒到手或載入失敗時，畫面上是規範的紅球，圖例也畫紅球。
 * 以前白底紅圈會讓人以為畫面上有紅色的東西。
 */
const ballModelLoaded = ref(false)
const ballSwatchStyle = computed(() => (ballModelLoaded.value
  ? { backgroundColor: '#ffffff', borderColor: props.dark ? 'rgba(255, 255, 255, 0.35)' : 'rgba(15, 23, 42, 0.3)' }
  : { backgroundColor: toCssColor(BALL_FALLBACK_COLOR), borderColor: 'transparent' }))

/** 疊在畫布上的面板底色：跟著畫布深淺，半透明加一點模糊，字不會跟格線疊在一起 */
const panelClass = computed(() => (props.dark
  ? 'border-white/10 bg-neutral-950/60 text-neutral-200'
  : 'border-neutral-900/10 bg-white/70 text-neutral-700'))

/** 冪等釋放，卸載與 await 後的卸載分支共用。 */
function teardown() {
  disposed = true
  scene?.dispose()
  scene = null
}

function markBallModelLoaded() {
  ballModelLoaded.value = true
}

/** 直接呼叫而不是 watch view：點目前這個選項也要重新取景（使用者轉歪了想回來） */
function selectView(next: SwingView) {
  view.value = next
  scene?.setView(next)
}

onMounted(async () => {
  if (!hostRef.value)
    return
  const { SwingScene } = await import('./core/swingScene')
  // 卸載落在 await 期間時 onBeforeUnmount 早已跑完（當時 scene 還是 null，什麼都沒清），
  // 這裡再建場景就會留下一個沒人回收的 WebGL context
  if (disposed || !hostRef.value)
    return
  scene = new SwingScene(hostRef.value, props.swing, {
    dark: props.dark,
    ballModelUrl: props.ballModelUrl,
    onBallModelLoaded: markBallModelLoaded,
  })
  if (view.value !== 'overview')
    scene.setView(view.value)
  scene.setFrame(props.frame)
})

watch(() => props.frame, frame => scene?.setFrame(frame))
watch(() => props.swing, (swing) => {
  scene?.setSwing(swing)
  scene?.setFrame(props.frame)
})
watch(() => props.dark, dark => scene?.setDark(dark))

onBeforeUnmount(teardown)
</script>

<template>
  <!-- relative：圖例、標籤、提示、視角切換與 hover 標籤以絕對定位掛在這一層 -->
  <div
    ref="hostRef"
    class="relative w-full overflow-hidden"
    :style="{ height: `${props.height}px` }"
    data-testid="batter-swing-3d"
  >
    <!-- 擊球瞬間：疊在畫布上，出現／消失都不會推動下方的控制列 -->
    <span
      v-if="props.interactive && isContactFrame"
      class="pointer-events-none absolute left-3 top-3 bg-amber-400 px-2 py-0.5 text-xs font-semibold tracking-wider text-neutral-950"
    >
      擊球瞬間
    </span>

    <!-- 右上角：有 stats 就放數據面板；沒有才放操作提示（手機上滾輪與右鍵都不適用，只在寬螢幕顯示） -->
    <div
      v-if="slots.stats"
      class="pointer-events-none absolute right-3 top-3 border px-3 py-2 backdrop-blur-sm"
      :class="panelClass"
      data-testid="batter-swing-3d-stats"
    >
      <slot name="stats" />
    </div>
    <p
      v-else-if="props.interactive"
      class="pointer-events-none absolute right-3 top-3 hidden text-xs text-neutral-500 sm:block"
    >
      拖曳旋轉 · 滾輪縮放 · 右鍵平移
    </p>

    <!-- 圖例：固定顯示全部項目，即使這筆沒有球體座標。
         pointer-events-none 避免擋住 OrbitControls 的拖曳。 -->
    <div
      class="pointer-events-none absolute bottom-3 left-3 flex flex-col gap-1 border px-2.5 py-2 text-xs backdrop-blur-sm"
      :class="panelClass"
      data-testid="batter-swing-3d-legend"
    >
      <span v-for="item in legend" :key="item.label" class="flex items-center gap-2">
        <span class="h-0.5 w-3.5" :style="{ backgroundColor: item.color }" />{{ item.label }}
      </span>
      <span class="flex items-center gap-2">
        <span class="mx-0.5 h-2.5 w-2.5 rounded-full border" :style="ballSwatchStyle" />球
      </span>
    </div>

    <!-- 視角切換：兼當「重設視角」——點目前這個選項也會重新取景 -->
    <div
      v-if="props.interactive"
      class="absolute bottom-3 right-3 flex border text-xs backdrop-blur-sm"
      :class="panelClass"
      role="group"
      aria-label="視角"
    >
      <button
        v-for="option in VIEW_OPTIONS"
        :key="option.value"
        type="button"
        class="px-2 py-1 transition-colors focus-visible:ring-2 focus-visible:ring-green-500 sm:px-2.5"
        :class="view === option.value
          ? (props.dark ? 'bg-white/15 text-white' : 'bg-neutral-900/10 text-neutral-900')
          : (props.dark ? 'text-neutral-400 hover:text-neutral-100' : 'text-neutral-500 hover:text-neutral-900')"
        :aria-pressed="view === option.value"
        :title="option.title + VIEW_TITLE_SUFFIX"
        @click="selectView(option.value)"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>

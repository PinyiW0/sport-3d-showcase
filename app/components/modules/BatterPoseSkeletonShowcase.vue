<script setup lang="ts">
import type { BpeMetricKey } from '~/components/bpe-data/core/types'
import BatterSwing3d from '~/components/batter-pose/BatterSwing3d.vue'
import { contactOffsetMs, formatContactOffset } from '~/components/batter-pose/core/contactOffset'
import { computeSwingStats } from '~/components/batter-pose/core/swingStats'
import { eventLabel, formatMetric, formatMetricBrief, formatNumber } from '~/components/bpe-data/core/format'
import { pickMetrics } from '~/components/bpe-data/core/parseBpeResult'
import { SWING_METRIC_KEYS } from '~/components/bpe-data/core/types'
import { BPE_PLAYBACK_RATES, useBpePlayback } from '~/composables/useBpePlayback'
import BpeMetricList from './BpeMetricList.vue'

// batter-pose 模組的「模組呈現」互動元件：3D 揮棒動畫的播放、時間軸、控制列與數值面板。
//
// 播放時鐘（useBpePlayback）與畫面（BatterSwing3d）分離：前者只認幀索引與秒數，
// 3D 元件只負責畫，換事件、拖曳時間軸、逐幀操作都經由同一組 API，行為天生一致。

const asset = useAssetUrl()
const { entries, selected, outcome, error } = useBpeEvents(0)

const eventOptions = computed(() =>
  entries.value.map((entry, i) => ({
    label: `${eventLabel(i, entry)} · 球 ${entry.ball_frames ?? 0} 幀`,
    value: i,
  })),
)

const result = computed(() => (outcome.value?.ok ? outcome.value.result : null))
const swing = computed(() => result.value?.swing ?? null)

const { frame, playing, rate, loop, toggle, step, seek, jumpToContact } = useBpePlayback(swing)

// 畫布配色：預設跟著頁面，可以切成淺色畫布（規則見 useLightCanvas）
const lightCanvas = useLightCanvas()
const dark = computed(() => !lightCanvas.value)

/** USlider 需要可寫的 v-model，拖曳時直接呼叫 seek()（暫停並跳到該幀）。 */
const sliderFrame = computed<number>({
  get: () => frame.value,
  set: seek,
})

/** 幀數輸入框：輸入或按 ±1 就暫停並跳過去；清空（null）時不動，維持目前這一幀。 */
const frameInput = computed<number | null>({
  get: () => frame.value,
  set: (value) => {
    if (value != null)
      seek(value)
  },
})

/** Shift + 方向鍵與 «／» 按鈕一次跳的幀數：125 fps 下約 0.08 秒 */
const FAST_STEP_FRAMES = 10

/**
 * 鍵盤操作：← → 逐幀、Shift 一次 10 幀、空白鍵播放／暫停。
 * 焦點在會自己用到這些鍵的元件上時不攔：方向鍵讓給輸入框、時間軸、選單；
 * 空白鍵讓給所有可互動元素（按鈕上的空白鍵本來就會觸發點擊，攔了會切兩次）。
 */
function onKeydown(event: KeyboardEvent) {
  if (!swing.value || event.altKey || event.ctrlKey || event.metaKey)
    return
  const target = event.target instanceof HTMLElement ? event.target : null
  const usesArrows = target?.closest('input, textarea, select, [role="slider"], [role="combobox"], [role="listbox"], [contenteditable="true"]')
  if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !usesArrows) {
    step((event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? FAST_STEP_FRAMES : 1))
  }
  else if (event.key === ' ' && !usesArrows && !target?.closest('button, a, [role="switch"]')) {
    toggle()
  }
  else {
    return
  }
  event.preventDefault()
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// value 明確標成 number：rate 本身是可變的 Ref<number>，若讓 items 停留在
// BPE_PLAYBACK_RATES 的字面量聯集型別，USelect 的 v-model 會拒收更寬的 number。
const rateOptions: Array<{ label: string, value: number }> = BPE_PLAYBACK_RATES.map(r => ({ label: `${r}×`, value: r }))

const frameCount = computed(() => swing.value?.frames.length ?? 0)
const lastFrame = computed(() => Math.max(frameCount.value - 1, 0))

const currentTimeS = computed(() => swing.value?.frames[frame.value]?.timeS ?? 0)

const contactPercent = computed(() => {
  const s = swing.value
  if (!s || s.contactFrame == null || s.frames.length < 2)
    return null
  return (s.contactFrame / (s.frames.length - 1)) * 100
})

const contactTitle = computed(() => {
  const s = swing.value
  if (!s || s.contactFrame == null)
    return ''
  return `擊球 第 ${s.contactFrame} 幀 · ${formatNumber(s.frames[s.contactFrame]!.timeS)} 秒`
})

const swingStats = computed(() => (swing.value ? computeSwingStats(swing.value.jointNames, swing.value.frames) : null))

/** 目前幀相對擊球的時間（「距擊球 −120 ms」）；沒有擊球點時為 null，時間軸下方改顯示絕對時間 */
const contactOffset = computed(() => (swing.value ? contactOffsetMs(swing.value, frame.value) : null))

/**
 * 本次揮棒最常看的三項：放大成主卡片，也疊在畫布右上角，第一屏就能把姿態和數字連起來。
 * 其餘三項（攻擊方向、揮棒平面傾角、揮棒長度）放次層。缺值的項目不顯示（pickMetrics 已濾掉）。
 */
const KEY_METRIC_KEYS: readonly BpeMetricKey[] = ['bat_speed', 'attack_angle', 'time_to_contact']
const keyMetrics = computed(() => (result.value ? pickMetrics(result.value.metrics, KEY_METRIC_KEYS) : []))

/** 容易跟「預測落點球場圖」的數字搞混的兩項先講清楚；也說明這些是整次揮棒的摘要，不隨幀數變 */
const METRIC_DESCRIPTION = '整次揮棒的摘要，不隨目前這一幀變動。棒速是球棒的速度，不是擊球初速；'
  + '攻擊角描述揮棒路徑，不是球飛出去的仰角——擊球初速與仰角在「預測落點球場圖」。'
</script>

<template>
  <div class="space-y-4">
    <UAlert
      v-if="error"
      color="error"
      title="樣本載入失敗"
      :description="String(error)"
    />

    <!-- 控制列：事件選單放最前面 -->
    <div class="flex flex-wrap items-center gap-3">
      <USelect v-model="selected" :items="eventOptions" size="sm" class="w-72" aria-label="選擇事件" />
    </div>

    <!-- 檢查關卡沒過：整個呈現都不畫 -->
    <UAlert
      v-if="outcome && !outcome.ok"
      color="error"
      title="結果檔未通過檢查關卡，不繪製"
      :description="`status = ${outcome.status ?? '（缺少）'} · error：${outcome.errorText ?? '（未提供）'}`"
    />

    <template v-else-if="result">
      <div v-if="swing" class="border border-neutral-200 dark:border-neutral-800">
        <BatterSwing3d
          :swing="swing"
          :frame="frame"
          :height="440"
          :dark="dark"
          :ball-model-url="asset('/models/baseball_detail.glb')"
        >
          <!-- 畫布右上角：本次揮棒的三項核心數據（寬螢幕排成一列，手機疊成三行） -->
          <template v-if="keyMetrics.length" #stats>
            <dl class="flex flex-col gap-1 sm:flex-row sm:gap-5">
              <div
                v-for="metric in keyMetrics"
                :key="metric.key"
                class="flex items-baseline justify-between gap-3 sm:block"
                :title="`${metric.key} = ${formatMetric(metric.value, metric.unit)}（原始值）`"
              >
                <dt class="text-xs opacity-70">
                  {{ metric.label }}
                </dt>
                <dd class="text-sm font-semibold tabular-nums sm:text-base">
                  {{ formatMetricBrief(metric.value, metric.unit) }}
                </dd>
              </div>
            </dl>
          </template>
        </BatterSwing3d>
      </div>
      <p v-else class="border border-dashed border-neutral-300 py-16 text-center text-sm text-neutral-400 dark:border-neutral-700">
        這筆結果沒有骨架或動畫資料，依規範不畫。
      </p>

      <template v-if="swing">
        <!-- 播放列（影片播放器的排法）：播放與跳至擊球在時間軸左邊；時間軸上方標出「擊球」，
             下方左邊是相對擊球的時間、右邊是目前／總長。三列共用同一欄寬，刻度與文字才對得齊時間軸。
             擊球一律用琥珀色：畫布上的標籤、時間軸刻度、跳至擊球按鈕、相對時間的 0 ms -->
        <div class="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1">
          <span aria-hidden="true" />
          <div class="relative h-5">
            <span
              v-if="contactPercent !== null"
              class="absolute bottom-0 flex -translate-x-1/2 flex-col items-center"
              :style="{ left: `${contactPercent}%` }"
              :title="contactTitle"
              data-testid="batter-swing-contact-tick"
            >
              <span class="text-xs font-medium leading-none text-amber-500 dark:text-amber-400">擊球</span>
              <span class="mt-0.5 h-1.5 w-0.5 bg-amber-400" />
            </span>
          </div>

          <div class="flex items-center gap-2">
            <UButton
              size="sm"
              square
              :icon="playing ? 'i-heroicons-pause-solid' : 'i-heroicons-play-solid'"
              :aria-label="playing ? '暫停' : '播放'"
              :title="playing ? '暫停（空白鍵）' : '播放（空白鍵）'"
              @click="toggle"
            />
            <UButton
              size="sm"
              color="warning"
              variant="soft"
              icon="i-heroicons-bolt"
              aria-label="跳至擊球"
              title="跳至擊球幀並暫停"
              :disabled="swing.contactFrame == null"
              @click="jumpToContact"
            >
              <!-- 手機上時間軸只剩兩百來像素，按鈕只留圖示 -->
              <span class="hidden sm:inline">跳至擊球</span>
            </UButton>
          </div>
          <USlider
            v-model="sliderFrame"
            :min="0"
            :max="lastFrame"
            :step="1"
            size="sm"
            aria-label="時間軸"
          />

          <span aria-hidden="true" />
          <!-- 時間固定三位小數：formatNumber 會把 0.800 收成 0.8，播放時字寬跟著跳 -->
          <div class="flex items-baseline justify-between gap-3 tabular-nums">
            <span
              v-if="contactOffset !== null"
              class="text-sm font-medium"
              :class="contactOffset === 0 ? 'text-amber-500 dark:text-amber-400' : 'text-neutral-700 dark:text-neutral-200'"
              data-testid="batter-swing-contact-offset"
            >
              {{ formatContactOffset(contactOffset) }}
            </span>
            <span v-else class="text-xs text-neutral-500 dark:text-neutral-400">這筆沒有擊球點</span>
            <span class="text-xs text-neutral-500 dark:text-neutral-400">
              {{ currentTimeS.toFixed(3) }} / {{ swing.durationS.toFixed(3) }} s
            </span>
          </div>
        </div>

        <!-- 逐幀在左（暫停後調幀數看畫面：±10、±1、直接輸入），播放設定在右 -->
        <div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div class="flex flex-wrap items-center gap-2" role="group" aria-label="逐幀控制">
            <span class="text-xs font-semibold uppercase tracking-wider text-neutral-500">逐幀</span>
            <UButton
              size="sm"
              square
              color="neutral"
              variant="outline"
              icon="i-heroicons-chevron-double-left"
              :aria-label="`往前 ${FAST_STEP_FRAMES} 幀`"
              :title="`往前 ${FAST_STEP_FRAMES} 幀（Shift + ←）`"
              @click="step(-FAST_STEP_FRAMES)"
            />
            <UInputNumber
              v-model="frameInput"
              :min="0"
              :max="lastFrame"
              :step="1"
              :format-options="{ useGrouping: false }"
              size="sm"
              color="neutral"
              class="w-32 tabular-nums"
              decrement-icon="i-heroicons-chevron-left"
              increment-icon="i-heroicons-chevron-right"
              aria-label="目前幀"
              title="上一幀／下一幀（← →），也可以直接輸入幀數"
            />
            <UButton
              size="sm"
              square
              color="neutral"
              variant="outline"
              icon="i-heroicons-chevron-double-right"
              :aria-label="`往後 ${FAST_STEP_FRAMES} 幀`"
              :title="`往後 ${FAST_STEP_FRAMES} 幀（Shift + →）`"
              @click="step(FAST_STEP_FRAMES)"
            />
            <span class="text-sm tabular-nums text-neutral-500 dark:text-neutral-400">/ {{ lastFrame }}</span>
          </div>
          <div class="flex flex-wrap items-center gap-4">
            <USelect
              v-model="rate"
              :items="rateOptions"
              size="sm"
              class="w-24"
              aria-label="播放速率"
            />
            <USwitch v-model="loop" label="循環播放" />
            <USwitch v-model="lightCanvas" label="淺色畫布" />
          </div>
        </div>

        <!-- 操作說明：手機沒有實體鍵盤與滑鼠，只在寬螢幕顯示。畫布右上角放了數據，滑鼠提示移到這裡 -->
        <p class="hidden flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500 sm:flex dark:text-neutral-400">
          <span class="flex items-center gap-1"><UKbd value="←" /><UKbd value="→" />逐幀</span>
          <span class="flex items-center gap-1"><UKbd value="Shift" />+<UKbd value="←" /><UKbd value="→" />一次 {{ FAST_STEP_FRAMES }} 幀</span>
          <span class="flex items-center gap-1"><UKbd value="Space" />播放／暫停</span>
          <span>滑鼠：拖曳旋轉 · 滾輪縮放 · 右鍵平移</span>
        </p>
      </template>

      <BpeMetricList
        :metrics="result.metrics"
        :keys="SWING_METRIC_KEYS"
        :primary="KEY_METRIC_KEYS"
        title="本次揮棒數據"
        :description="METRIC_DESCRIPTION"
      />

      <!-- 資料完整度：原本跟播放時間擠在同一行，但這是這筆資料的性質，不隨播放改變 -->
      <div v-if="swing" class="space-y-1">
        <p class="text-xs font-semibold uppercase tracking-wider text-neutral-500">
          資料完整度
        </p>
        <p class="text-sm tabular-nums text-neutral-700 dark:text-neutral-300">
          共 {{ frameCount }} 幀 · 有球體座標 {{ swing.ballFrameCount }} 幀 ·
          骨架全缺 {{ swingStats?.allMissingFrames ?? 0 }} 幀 · 球棒缺點 {{ swingStats?.batMissingFrames ?? 0 }} 幀
        </p>
        <p v-if="!swing.hasBallField" class="text-xs text-neutral-500 dark:text-neutral-400">
          這筆是舊格式，沒有球體座標。
        </p>
      </div>

      <p class="text-xs text-neutral-500 dark:text-neutral-400">
        原始擷取約 125 fps、單筆約 2.3 秒。缺值幀（關節或球體任一為 null）依規範不畫，
        也不沿用上一幀位置；球與關節缺值互相獨立判斷。球體拖尾固定 20 顆物件池，
        大小與透明度是顯示設定、不代表量測出的球體尺寸——顯示第 i 幀時第 age 顆取
        第 i − age 幀的球，只看最近 20 幀的時間視窗，中間缺值就隱藏那一顆，不往更早的幀找補。
        球用專案的 3D 棒球模型呈現（規範預設是紅球，這裡刻意換成白球紅縫線），滾輪拉近才看得到縫線；
        球棒照標準木棒的輪廓畫在兩端點之間，外型與粗細是顯示設定，資料只有握把端與棒頭兩個點。
        3D 座標與擊球點九宮格、預測落點球場圖是同一套座標系，原點皆為本壘板尖端。
      </p>
    </template>
  </div>
</template>

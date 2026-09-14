<script setup lang="ts">
import type { BpeMetricKey } from '~/components/bpe-data/core/types'
import { eventLabel, formatExitDirectionBrief, formatMetricBrief, formatNumber, outcomeLabel } from '~/components/bpe-data/core/format'
import { FLIGHT_METRIC_KEYS } from '~/components/bpe-data/core/types'
import { computeFieldViewport } from '~/components/landing-field-chart/core/fieldChart'
import LandingFieldChart from '~/components/landing-field-chart/LandingFieldChart.vue'
import BpeMetricList from '~/components/modules/BpeMetricList.vue'

// landing-field-chart 模組的「模組呈現」互動元件：把 predicted_landing_point_m
// 換算成球場圖上的一個點。事件 #5 預設進場——落點 y = 56 m，是 23 筆裡落在場內最遠的一筆
// （distance 最大的是事件 #11 的 60 m，但它落在本壘後方），一開始就能看出球場比例。
//
// 版面：桌機左邊畫布、右邊數值，手機上下疊。落點旁只寫距離與方向（要貼著點看的兩個數），
// 原始座標放滑鼠提示，畫布下不再重寫一次。
const { entries, selected, outcome, error } = useBpeEvents(5)
const result = computed(() => (outcome.value?.ok ? outcome.value.result : null))

const showDecorations = ref(true)

// 畫布配色：預設跟著頁面，可以切成淺色畫布（規則見 useLightCanvas）
const lightCanvas = useLightCanvas()

// index.json 的 landing 欄位標 none 時代表這筆沒有預測落點，選單先講在前面，
// 選了才發現沒東西可看會讓人以為畫面壞了
const eventOptions = computed(() =>
  entries.value.map((e, i) => ({
    label: eventLabel(i, e) + (e.landing === 'none' ? ' · 無落點' : ''),
    value: i,
  })),
)
const { canPrev, canNext, prev, next } = useBpeEventStepper(selected, () => entries.value.length)

// 元件只吃 { x, y }：payload 的 z 恆為 0（落地高度），元件本來就不用
const landing = computed(() => {
  const point = result.value?.landingM
  return point ? { x: point[0], y: point[1] } : null
})

/** 落點旁兩行：預測飛行距離、擊球方向（偏哪一側）。缺值的那行不寫；兩行都缺就交給元件寫「預測落點」 */
const landingLabel = computed(() => {
  const metrics = result.value?.metrics ?? []
  const distance = metrics.find(m => m.key === 'distance')
  const direction = metrics.find(m => m.key === 'exit_direction')
  const lines = [
    ...(distance ? [formatMetricBrief(distance.value, distance.unit)] : []),
    ...(direction && direction.unit === 'degree' ? [formatExitDirectionBrief(direction.value)] : []),
  ]
  return lines.length ? lines : undefined
})

/** 滑鼠停在落點上：原始座標（z 也列出來但註明不使用） */
const pointTitle = computed(() => {
  const point = result.value?.landingM
  return point
    ? `預測落點原始座標 (${formatNumber(point[0])}, ${formatNumber(point[1])}) m · z ${formatNumber(point[2])}（不使用）`
    : undefined
})

// 視野是否擴大由 core 的 computeFieldViewport 判斷，跟元件內部用的是同一份規則，
// 這裡只用來顯示視野擴大的提示，不重算落點怎麼畫
const viewport = computed(() => computeFieldViewport(landing.value))

/** 距離作為主要數值，其餘飛行數據用對齊的列呈現，避免窄欄卡片擠字。 */
const PRIMARY_FLIGHT_KEYS: readonly BpeMetricKey[] = ['distance']

const outcomeText = computed(() => outcomeLabel(result.value?.outcome ?? null))
/** 判定結果標籤前的色點：擊中用綠色，判定不確定用琥珀色，其他值中性灰 */
const outcomeDotClass = computed(() => {
  const value = result.value?.outcome
  if (value === 'hit')
    return 'bg-green-500'
  return value === 'uncertain' ? 'bg-amber-400' : 'bg-neutral-400'
})

/** 疊在畫布上的標籤底色：跟著畫布深淺（與打擊姿態畫布上的面板同一組） */
const panelClass = computed(() => (lightCanvas.value
  ? 'border-neutral-900/10 bg-white/70 text-neutral-700'
  : 'border-white/10 bg-neutral-950/60 text-neutral-200'))
</script>

<template>
  <div class="space-y-4">
    <UAlert
      v-if="error"
      color="error"
      title="樣本載入失敗"
      :description="String(error)"
    />

    <div class="flex flex-wrap items-end justify-between gap-4">
      <div class="flex w-full min-w-0 items-center gap-2 sm:w-auto">
        <UButton
          size="sm"
          square
          color="neutral"
          variant="outline"
          icon="i-heroicons-chevron-left"
          aria-label="上一筆"
          title="上一筆（←）"
          :disabled="!canPrev"
          @click="prev"
        />
        <USelect
          v-model="selected"
          :items="eventOptions"
          size="sm"
          class="min-w-0 flex-1 sm:w-64 sm:flex-none"
          aria-label="選擇事件"
        />
        <UButton
          size="sm"
          square
          color="neutral"
          variant="outline"
          icon="i-heroicons-chevron-right"
          aria-label="下一筆"
          title="下一筆（→）"
          :disabled="!canNext"
          @click="next"
        />
      </div>
      <div class="flex flex-wrap items-center gap-4 border-neutral-200 sm:border-l sm:pl-4 dark:border-neutral-700">
        <USwitch v-model="showDecorations" size="sm" label="距離弧與內野" />
        <USwitch v-model="lightCanvas" size="sm" label="淺色畫布" />
      </div>
    </div>

    <UAlert
      v-if="outcome && !outcome.ok"
      color="error"
      title="結果檔未通過檢查關卡，不繪製"
      :description="`status = ${outcome.status ?? '（缺少）'} · error：${outcome.errorText ?? '（未提供）'}`"
    />

    <div v-else-if="result" class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <!-- 畫布：上排判定結果與視野提示、中間球場圖、下排圖例。標籤排在圖的上下而不是疊在圖上，手機上才不會蓋住方位字 -->
      <div
        class="flex min-w-0 flex-col gap-3 rounded-xl border border-neutral-200 p-2 sm:p-5 dark:border-neutral-800"
        :class="lightCanvas ? 'bg-neutral-100' : 'bg-neutral-950'"
        data-testid="landing-field-canvas"
      >
        <div class="flex flex-wrap items-center justify-between gap-2 px-2 pt-2 text-xs sm:px-0 sm:pt-0">
          <div>
            <h3 class="text-sm font-semibold" :class="lightCanvas ? 'text-neutral-800' : 'text-neutral-100'">
              落點位置
            </h3>
            <p class="mt-1" :class="lightCanvas ? 'text-neutral-600' : 'text-neutral-400'">
              俯視球場 · 單位 m
            </p>
          </div>
          <span
            v-if="outcomeText"
            class="flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium"
            :class="panelClass"
            :title="`outcome = ${result.outcome}`"
          >
            <span class="size-2 rounded-full" :class="outcomeDotClass" />{{ outcomeText }}
          </span>
          <span
            v-if="viewport.expanded"
            class="border px-2 py-0.5"
            :class="[panelClass, lightCanvas ? 'text-amber-700' : 'text-amber-400']"
          >落點在預設視野外，已擴大視野照座標顯示</span>
        </div>

        <div class="mx-auto w-full max-w-xl">
          <LandingFieldChart
            :landing="landing"
            :label="landingLabel"
            :show-decorations="showDecorations"
            :dark="!lightCanvas"
            :point-title="pointTitle"
          />
        </div>

        <div
          class="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 pb-2 text-xs sm:px-0 sm:pb-0"
          :class="lightCanvas ? 'text-neutral-600' : 'text-neutral-400'"
          data-testid="landing-field-legend"
        >
          <span v-if="landing" class="flex items-center gap-1.5">
            <span class="size-2.5 rounded-full" :class="lightCanvas ? 'bg-red-600' : 'bg-red-500'" />本次預測落點
          </span>
        </div>
      </div>

      <div class="space-y-5 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <BpeMetricList
          :metrics="result.metrics"
          :keys="FLIGHT_METRIC_KEYS"
          :primary="PRIMARY_FLIGHT_KEYS"
          title="擊球飛行數值"
        />

        <!-- 操作說明：手機沒有實體鍵盤，只在寬螢幕顯示 -->
        <p class="hidden flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500 sm:flex dark:text-neutral-400">
          <span class="flex items-center gap-1"><UKbd value="←" /><UKbd value="→" />上一筆／下一筆</span>
        </p>
      </div>
    </div>

    <UCollapsible :unmount-on-hide="false" class="border-t border-neutral-200 pt-2 dark:border-neutral-800">
      <UButton
        label="資料說明"
        color="neutral"
        variant="ghost"
        size="sm"
        trailing-icon="i-heroicons-chevron-down"
        class="group -ml-2.5"
        :ui="{ trailingIcon: 'transition-transform duration-150 group-data-[state=open]:rotate-180' }"
      />
      <template #content>
        <ul class="list-disc space-y-1 pb-1 pl-5 pt-1 text-xs text-neutral-500 dark:text-neutral-400">
          <li>
            球場邊界（界外線、外野弧）是規範給的固定公式，一律照畫；距離弧、紅土內野、壘包、打擊區與投手丘是方便閱讀的示意裝飾，
            關掉「距離弧與內野」不影響落點位置。
          </li>
          <li>
            落點在界外或本壘後方（例如事件 #11）一樣照座標畫，不判斷界內外、也不 clamp 到畫面邊緣。
          </li>
          <li>
            23 筆裡有 6 筆沒有預測落點，依規範不畫點；沒有擊球點不代表沒有落點——事件 #3、#13、#20
            都是有落點但沒有擊球點的例子，兩者互相獨立判斷。
          </li>
          <li>
            擊球方向的正負規範沒有定義。這裡把正值寫成「一壘側」是從樣本推定的：有落點的 17 筆裡 16 筆方向與落點同側，
            待演算法端確認。
          </li>
          <li>
            預測飛行距離只用擊球初速與出射角推算，不含球的旋轉（Magnus 力）與空氣阻力，只能當粗估參考
            （出處：團隊內部研究筆記「擊球數據研究」）。事件 #11 落在本壘後方 59 m、擊球方向 172.6°，是待演算法端確認的異常值。
          </li>
        </ul>
      </template>
    </UCollapsible>
  </div>
</template>

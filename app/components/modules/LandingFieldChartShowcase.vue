<script setup lang="ts">
import type { BpeMetricKey } from '~/components/bpe-data/core/types'
import type { FieldMarker } from '~/components/landing-field-chart/core/fieldChart'
import { eventLabel, formatExitDirectionBrief, formatMetricBrief, formatNumber, outcomeLabel } from '~/components/bpe-data/core/format'
import { FLIGHT_METRIC_KEYS } from '~/components/bpe-data/core/types'
import { computeFieldViewport, isInViewport } from '~/components/landing-field-chart/core/fieldChart'
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
// 這裡只是外面想知道要不要多講一句解釋、有幾個灰點落在視野外，不重算落點怎麼畫
const viewport = computed(() => computeFieldViewport(landing.value))

// 其他事件的落點疊在同一張圖上：一樣過檢查關卡、沒有落點的不畫
const overview = useBpeOverview(entries)
const others = computed<FieldMarker[]>(() => overview.value.flatMap(({ index, outcome: item }) => {
  if (index === selected.value || !item.ok || !item.result.landingM)
    return []
  const [x, y] = item.result.landingM
  const distance = item.result.metrics.find(m => m.key === 'distance')
  const detail = distance ? formatMetricBrief(distance.value, distance.unit) : `(${formatMetricBrief(x, '')}, ${formatMetricBrief(y, '')}) m`
  return [{ id: index, x, y, label: `事件 #${index} · ${detail}` }]
}))
const othersOutOfView = computed(() => others.value.filter(marker => !isInViewport(viewport.value, marker)).length)

/** 飛行數值的主次：距離、初速、仰角放大，方向與滯空時間縮成一行一項 */
const PRIMARY_FLIGHT_KEYS: readonly BpeMetricKey[] = ['distance', 'exit_velocity', 'launch_angle']

const outcomeText = computed(() => outcomeLabel(result.value?.outcome ?? null))
/** 判定結果標籤前的色點：擊中用主色，判定不確定用琥珀色，其他值中性灰 */
const outcomeDotClass = computed(() => {
  const value = result.value?.outcome
  if (value === 'hit')
    return 'bg-primary-500'
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

    <div class="flex flex-wrap items-center gap-3">
      <div class="flex items-center gap-1">
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
          class="w-60 sm:w-72"
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
      <USwitch v-model="showDecorations" label="距離弧與內野" />
      <USwitch v-model="lightCanvas" label="淺色畫布" />
    </div>

    <UAlert
      v-if="outcome && !outcome.ok"
      color="error"
      title="結果檔未通過檢查關卡，不繪製"
      :description="`status = ${outcome.status ?? '（缺少）'} · error：${outcome.errorText ?? '（未提供）'}`"
    />

    <div v-else-if="result" class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <!-- 畫布：上排判定結果與視野提示、中間球場圖、下排圖例。標籤排在圖的上下而不是疊在圖上，手機上才不會蓋住方位字 -->
      <div
        class="flex min-w-0 flex-col gap-3 border border-neutral-200 p-3 dark:border-neutral-800"
        :class="lightCanvas ? 'bg-neutral-100' : 'bg-neutral-900'"
        data-testid="landing-field-canvas"
      >
        <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span
            v-if="outcomeText"
            class="flex items-center gap-1.5 border px-2 py-0.5 font-medium"
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

        <div class="mx-auto w-full max-w-lg">
          <LandingFieldChart
            :landing="landing"
            :label="landingLabel"
            :show-decorations="showDecorations"
            :dark="!lightCanvas"
            :others="others"
            :point-title="pointTitle"
            @select="selected = $event"
          />
        </div>

        <div
          class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
          :class="lightCanvas ? 'text-neutral-600' : 'text-neutral-400'"
          data-testid="landing-field-legend"
        >
          <span v-if="landing" class="flex items-center gap-1.5">
            <span class="size-2.5 rounded-full" :class="lightCanvas ? 'bg-red-600' : 'bg-red-500'" />本次預測落點
          </span>
          <span v-if="others.length" class="flex items-center gap-1.5">
            <span class="size-2 rounded-full" :class="lightCanvas ? 'bg-neutral-500/45' : 'bg-neutral-400/45'" />其他 {{ others.length }} 筆（點一下切換）
          </span>
          <span v-if="othersOutOfView">{{ othersOutOfView }} 筆在目前視野外，沒有畫出</span>
        </div>
      </div>

      <div class="space-y-5">
        <BpeMetricList
          :metrics="result.metrics"
          :keys="FLIGHT_METRIC_KEYS"
          :primary="PRIMARY_FLIGHT_KEYS"
          title="擊球飛行數值"
        />

        <!-- 操作說明：手機沒有實體鍵盤，只在寬螢幕顯示 -->
        <p class="hidden flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500 sm:flex dark:text-neutral-400">
          <span class="flex items-center gap-1"><UKbd value="←" /><UKbd value="→" />上一筆／下一筆</span>
          <span>點圖上的灰點切換到該事件</span>
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
            球場邊界（界外線、外野弧）是規範給的固定公式，一律照畫；距離弧、內野菱形、投手板點只是方便閱讀的裝飾，
            關掉「距離弧與內野」不影響落點位置。
          </li>
          <li>
            落點在界外或本壘後方（例如事件 #11）一樣照座標畫，不判斷界內外、也不 clamp 到畫面邊緣。
            其他事件的灰點不會讓視野擴大，落在視野外的不畫，圖例會註明有幾筆。
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

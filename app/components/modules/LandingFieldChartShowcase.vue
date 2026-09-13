<script setup lang="ts">
import { eventLabel, formatMetric, formatNumber } from '~/components/bpe-data/core/format'
import { FLIGHT_METRIC_KEYS } from '~/components/bpe-data/core/types'
import { computeFieldViewport } from '~/components/landing-field-chart/core/fieldChart'
import LandingFieldChart from '~/components/landing-field-chart/LandingFieldChart.vue'
import BpeMetricList from '~/components/modules/BpeMetricList.vue'

// landing-field-chart 模組的「模組呈現」互動元件：把 predicted_landing_point_m
// 換算成球場圖上的一個點。事件 #5 預設進場——落點 y = 56 m，是 23 筆裡落在場內最遠的一筆
// （distance 最大的是事件 #11 的 60 m，但它落在本壘後方），一開始就能看出球場比例。
const { entries, selected, outcome, error } = useBpeEvents(5)
const result = computed(() => (outcome.value?.ok ? outcome.value.result : null))

const showDecorations = ref(true)

// index.json 的 landing 欄位標 none 時代表這筆沒有預測落點，選單先講在前面，
// 選了才發現沒東西可看會讓人以為畫面壞了
const eventOptions = computed(() =>
  entries.value.map((e, i) => ({
    label: eventLabel(i, e) + (e.landing === 'none' ? ' · 無落點' : ''),
    value: i,
  })),
)

// 元件只吃 { x, y }：payload 的 z 恆為 0（落地高度），元件本來就不用
const landing = computed(() => {
  const point = result.value?.landingM
  return point ? { x: point[0], y: point[1] } : null
})

const distanceMetric = computed(() => result.value?.metrics.find(m => m.key === 'distance') ?? null)
const landingLabel = computed(() =>
  distanceMetric.value ? `預測飛行距離 ${formatMetric(distanceMetric.value.value, distanceMetric.value.unit)}` : undefined,
)

// 視野是否擴大由 core 的 computeFieldViewport 判斷，跟元件內部用的是同一份規則，
// 這裡只是外面想知道要不要多講一句解釋，不重算落點怎麼畫
const viewExpanded = computed(() => computeFieldViewport(landing.value).expanded)
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
      <USelect
        v-model="selected"
        :items="eventOptions"
        size="sm"
        class="w-72"
        aria-label="選擇事件"
      />
      <USwitch v-model="showDecorations" label="距離弧與內野" />
    </div>

    <UAlert
      v-if="outcome && !outcome.ok"
      color="error"
      title="結果檔未通過檢查關卡，不繪製"
      :description="`status = ${outcome.status ?? '（缺少）'} · error：${outcome.errorText ?? '（未提供）'}`"
    />

    <template v-else-if="result">
      <div class="mx-auto w-full max-w-lg">
        <LandingFieldChart
          :landing="landing"
          :label="landingLabel"
          :show-decorations="showDecorations"
        />
      </div>

      <p class="text-center text-sm text-neutral-500">
        <template v-if="landing">
          落點 x {{ formatNumber(landing.x) }} · y {{ formatNumber(landing.y) }} m（z 不使用）
          <template v-if="viewExpanded">
            · 落點在預設視野外（例：本壘後方），視野已擴大以照座標顯示
          </template>
        </template>
        <template v-else>
          這筆結果沒有預測落點，依規範不畫
        </template>
      </p>

      <BpeMetricList :metrics="result.metrics" :keys="FLIGHT_METRIC_KEYS" title="擊球飛行數值" />
    </template>

    <p class="text-xs text-neutral-500 dark:text-neutral-400">
      球場邊界（界外線、外野弧）是規範給的固定公式，一律照畫；距離弧、內野菱形、投手板點只是方便閱讀的裝飾，
      關掉「距離弧與內野」不影響落點位置。落點在界外或本壘後方（例如事件 #11）一樣照座標畫，
      不判斷界內外、也不 clamp 到畫面邊緣。23 筆裡有 6 筆沒有預測落點，依規範不畫點；
      沒有擊球點不代表沒有落點——事件 #3、#13、#20 都是有落點但沒有擊球點的例子，兩者互相獨立判斷。
      預測飛行距離只用擊球初速與出射角推算，不含球的旋轉（Magnus 力）與空氣阻力，只能當粗估參考
      （出處：團隊內部研究筆記「擊球數據研究」）。事件 #11 落在本壘後方 59 m、擊球方向 172.6°，
      是待演算法端確認的異常值。
    </p>
  </div>
</template>

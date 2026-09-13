<script setup lang="ts">
import type { BatterLevel } from '~/components/baseball-field/core/batterLevels'
import type { ContactGridMarker } from '~/components/contact-point-grid/core/contactGridScale'
import {
  BATTER_LEVEL_ORDER,
  BATTER_LEVELS,
  getStrikeZoneForLevel,
} from '~/components/baseball-field/core/batterLevels'
import { getZoneCell, isStrike } from '~/components/baseball-field/core/fieldGeometry'
import { eventLabel, formatMetricBrief, formatNumber, outcomeLabel } from '~/components/bpe-data/core/format'
import { CONTACT_METRIC_KEYS } from '~/components/bpe-data/core/types'
import ContactPointGrid from '~/components/contact-point-grid/ContactPointGrid.vue'
import { isInView, useContactGridScale } from '~/components/contact-point-grid/core/contactGridScale'
import BpeMetricList from '~/components/modules/BpeMetricList.vue'

// contact-point-grid 模組的「模組呈現」互動元件：選事件、看擊球點落在九宮格哪裡。
//
// 好球帶不在 BPE 結果裡，由這裡依打者級別推算（做法照 StrikeZoneGridShowcase）：
// 左右恆為本壘板寬，上下隨級別代表身高變動，所以切級別只會讓框變高／變矮。
//
// 版面：桌機左邊畫布、右邊數值（並排才不用捲動就能把點和數字連起來），手機上下疊。
// 同一個數字只在一個地方出現：點旁標籤一位小數、數值卡片一位小數＋提示原始值，畫布下不再重寫一次。

const { entries, selected, outcome, error } = useBpeEvents(0)
const result = computed(() => (outcome.value?.ok ? outcome.value.result : null))

const eventOptions = computed(() =>
  entries.value.map((e, i) => ({
    label: eventLabel(i, e) + (e.contact === false ? ' · 無擊球點' : ''),
    value: i,
  })),
)
const { canPrev, canNext, prev, next } = useBpeEventStepper(selected, () => entries.value.length)

const level = ref<BatterLevel>('adult')
const levelSpec = computed(() => BATTER_LEVELS[level.value])
const zone = computed(() => getStrikeZoneForLevel(level.value))
const levelOptions = BATTER_LEVEL_ORDER.map(key => ({
  label: `${BATTER_LEVELS[key].label} ${BATTER_LEVELS[key].referenceHeightCm} cm`,
  value: key,
}))

const showGuides = ref(true)

// 畫布配色：預設跟著頁面，可以切成淺色畫布（規則見 useLightCanvas）
const lightCanvas = useLightCanvas()

// 只用 point_cm 的 x 與 z（規範第 3 節），y 不使用；contact 為 null 時不畫
const contactPoint = computed(() => {
  const contact = result.value?.contact
  return contact ? { x: contact.pointCm[0], z: contact.pointCm[2] } : null
})

/** 滑鼠停在擊球點上：原始座標，y 也列出來但註明不使用 */
const pointTitle = computed(() => {
  const point = result.value?.contact?.pointCm
  return point
    ? `擊球點原始座標 x ${formatNumber(point[0])} · y ${formatNumber(point[1])}（不使用）· z ${formatNumber(point[2])} cm`
    : undefined
})

// 與 <ContactPointGrid> 內部同一份純函式，這裡另外算一次是為了拿 expanded 旗標與視野邊界
// 顯示在畫布標籤——元件本身不外露內部 scale，這是刻意的（見元件 README）。
const scale = useContactGridScale(zone, contactPoint)

// 落在好球帶第幾格（格號與圖上淡淡標的 1～9 同一套）；框外不 clamp 出格號，只講「好球帶外」
const cellText = computed(() => {
  const p = contactPoint.value
  if (!p)
    return null
  if (!isStrike(p.x, p.z, zone.value))
    return '好球帶外'
  const cell = getZoneCell(p.x, p.z, zone.value)
  return `好球帶第 ${cell.row * 3 + cell.col + 1} 格`
})

// 其他事件的擊球點疊在同一張圖上：一樣過檢查關卡、contact 為 null 的不畫
const overview = useBpeOverview(entries)
const others = computed<ContactGridMarker[]>(() => overview.value.flatMap(({ index, outcome: item }) => {
  if (index === selected.value || !item.ok || !item.result.contact)
    return []
  const [x, , z] = item.result.contact.pointCm
  return [{ id: index, x, z, label: `事件 #${index} · x ${formatMetricBrief(x, '')} · z ${formatMetricBrief(z, '')} cm` }]
}))
const othersOutOfView = computed(() => others.value.filter(marker => !isInView(scale.value, marker)).length)

const outcomeText = computed(() => outcomeLabel(result.value?.outcome ?? null))
/** 判定結果標籤前的色點：擊中用綠色（與九宮格的擊球點同色），判定不確定用琥珀色，其他值中性灰 */
const outcomeDotClass = computed(() => {
  const value = result.value?.outcome
  if (value === 'hit')
    return 'bg-green-500'
  return value === 'uncertain' ? 'bg-amber-400' : 'bg-neutral-400'
})

/** 疊在畫布上的標籤與圖例底色：跟著畫布深淺（與打擊姿態畫布上的面板同一組） */
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
      <USelect
        v-model="level"
        :items="levelOptions"
        size="sm"
        class="w-40"
        aria-label="打者級別"
      />
      <USwitch v-model="showGuides" label="輔助線" />
      <USwitch v-model="lightCanvas" label="淺色畫布" />
    </div>

    <!-- 檢查關卡沒過：整個呈現都不畫 -->
    <UAlert
      v-if="outcome && !outcome.ok"
      color="error"
      title="結果檔未通過檢查關卡，不繪製"
      :description="`status = ${outcome.status ?? '（缺少）'} · error：${outcome.errorText ?? '（未提供）'}`"
    />

    <div v-else-if="result" class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <!-- 畫布：上排判定結果與格位、中間九宮格、下排圖例。標籤排在圖的上下而不是疊在圖上，手機上才不會蓋住刻度 -->
      <div
        class="flex min-w-0 flex-col gap-3 border border-neutral-200 p-3 dark:border-neutral-800"
        :class="lightCanvas ? 'bg-neutral-100' : 'bg-neutral-900'"
        data-testid="contact-grid-canvas"
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
          <span class="flex flex-wrap items-center gap-2">
            <span v-if="cellText" class="border px-2 py-0.5 font-medium tabular-nums" :class="panelClass">{{ cellText }}</span>
            <span v-if="scale.expanded" class="border px-2 py-0.5" :class="[panelClass, lightCanvas ? 'text-amber-700' : 'text-amber-400']">超出預設視野，已自動擴大</span>
          </span>
        </div>

        <div class="mx-auto w-full max-w-sm">
          <ContactPointGrid
            :zone="zone"
            :point="contactPoint"
            :show-guides="showGuides"
            :dark="!lightCanvas"
            :others="others"
            :point-title="pointTitle"
            @select="selected = $event"
          />
        </div>

        <div
          class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
          :class="lightCanvas ? 'text-neutral-600' : 'text-neutral-400'"
          data-testid="contact-grid-legend"
        >
          <span v-if="contactPoint" class="flex items-center gap-1.5">
            <span class="size-2.5 rounded-full" :class="lightCanvas ? 'bg-green-600' : 'bg-green-500'" />本次擊球點
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
          :keys="CONTACT_METRIC_KEYS"
          :primary="CONTACT_METRIC_KEYS"
          title="擊球點數值"
        />

        <div class="space-y-1">
          <p class="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            好球帶
          </p>
          <p class="text-sm tabular-nums text-neutral-700 dark:text-neutral-300">
            {{ zone.bottom.toFixed(1) }}–{{ zone.top.toFixed(1) }} cm
          </p>
          <p class="text-xs text-neutral-500 dark:text-neutral-400">
            由「{{ levelSpec.label }}」代表身高 {{ levelSpec.referenceHeightCm }} cm 推算，不是量測資料
          </p>
        </div>

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
          <li>九宮格採捕手視角，只用擊球點的 x（水平）與 z（高度），忽略 y——與 3D 骨架、球場圖使用同一份座標，但只取這兩軸。</li>
          <li>
            好球帶不在 BPE 結果裡，由打者級別的代表身高推算，不是量測資料；左右恆為本壘板寬（±21.59 cm），
            切級別只會讓框變高或變矮。格號由上而下、由三壘側到一壘側排 1～9。
          </li>
          <li>
            視野固定 150 × 200 cm，所有事件的擊球點畫在同一張圖上直接比位置。選中的那筆落在視野外時照座標畫、
            自動擴大視野，不裁切也不強行縮進框內；灰點不會讓視野擴大。
          </li>
          <li>contact 為 null 時不畫擊球點（23 筆樣本裡有 9 筆是這樣：8 筆 outcome 為 uncertain，另有事件 #20 雖是 hit 也沒有擊球點）。</li>
          <li>
            擊球點是球棒碰到球的實際位置，不是好壞球判定——高於好球帶上緣也可能出現（例如事件 #7 高達 168 cm），
            這個數值是否合理已列入待演算法端確認的事項，畫面上一律照座標畫。
          </li>
        </ul>
      </template>
    </UCollapsible>
  </div>
</template>

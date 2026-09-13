<script setup lang="ts">
import type { BatterLevel } from '~/components/baseball-field/core/batterLevels'
import {
  BATTER_LEVEL_ORDER,
  BATTER_LEVELS,
  getStrikeZoneForLevel,
} from '~/components/baseball-field/core/batterLevels'
import { getZoneCell, isStrike } from '~/components/baseball-field/core/fieldGeometry'
import { eventLabel, formatNumber } from '~/components/bpe-data/core/format'
import { CONTACT_METRIC_KEYS } from '~/components/bpe-data/core/types'
import ContactPointGrid from '~/components/contact-point-grid/ContactPointGrid.vue'
import { useContactGridScale } from '~/components/contact-point-grid/core/contactGridScale'
import BpeMetricList from '~/components/modules/BpeMetricList.vue'

// contact-point-grid 模組的「模組呈現」互動元件：選事件、看擊球點落在九宮格哪裡。
//
// 好球帶不在 BPE 結果裡，由這裡依打者級別推算（做法照 StrikeZoneGridShowcase）：
// 左右恆為本壘板寬，上下隨級別代表身高變動，所以切級別只會讓框變高／變矮。

const { entries, selected, outcome, error } = useBpeEvents(0)
const result = computed(() => (outcome.value?.ok ? outcome.value.result : null))

const eventOptions = computed(() =>
  entries.value.map((e, i) => ({
    label: eventLabel(i, e) + (e.contact === false ? ' · 無擊球點' : ''),
    value: i,
  })),
)

const level = ref<BatterLevel>('adult')
const levelSpec = computed(() => BATTER_LEVELS[level.value])
const zone = computed(() => getStrikeZoneForLevel(level.value))
const levelOptions = BATTER_LEVEL_ORDER.map(key => ({
  label: `${BATTER_LEVELS[key].label} ${BATTER_LEVELS[key].referenceHeightCm} cm`,
  value: key,
}))

const showGuides = ref(true)

// 只用 point_cm 的 x 與 z（規範第 3 節），y 不使用；contact 為 null 時不畫
const contactPoint = computed(() => {
  const contact = result.value?.contact
  return contact ? { x: contact.pointCm[0], z: contact.pointCm[2] } : null
})
/** y 只顯示不使用，另外算是為了不在 template 對 result.contact 寫非空斷言 */
const contactY = computed(() => result.value?.contact?.pointCm[1] ?? null)

// 與 <ContactPointGrid> 內部同一份純函式，這裡另外算一次是為了拿 expanded 旗標
// 顯示在資訊列——元件本身不外露內部 scale，這是刻意的（見元件 README）。
const scale = useContactGridScale(zone, contactPoint)

// 落在好球帶第幾格；框外不 clamp 出格號，只講「好球帶外」
const cellText = computed(() => {
  const p = contactPoint.value
  if (!p)
    return null
  if (!isStrike(p.x, p.z, zone.value))
    return '好球帶外'
  const cell = getZoneCell(p.x, p.z, zone.value)
  return `第 ${cell.row * 3 + cell.col + 1} 格`
})
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
      <USelect
        v-model="level"
        :items="levelOptions"
        size="sm"
        class="w-40"
        aria-label="打者級別"
      />
      <USwitch v-model="showGuides" label="輔助線" />
    </div>

    <!-- 檢查關卡沒過：整個呈現都不畫 -->
    <UAlert
      v-if="outcome && !outcome.ok"
      color="error"
      title="結果檔未通過檢查關卡，不繪製"
      :description="`status = ${outcome.status ?? '（缺少）'} · error：${outcome.errorText ?? '（未提供）'}`"
    />

    <template v-else-if="result">
      <div class="mx-auto w-full max-w-sm">
        <ContactPointGrid :zone="zone" :point="contactPoint" :show-guides="showGuides" />
      </div>

      <p class="text-center text-sm text-neutral-500">
        <template v-if="contactPoint">
          擊球點 x {{ formatNumber(contactPoint.x) }} · z {{ formatNumber(contactPoint.z) }} cm
          <template v-if="contactY !== null">
            （y {{ formatNumber(contactY) }} cm 不使用）
          </template>·
          好球帶 {{ zone.bottom.toFixed(1) }}–{{ zone.top.toFixed(1) }} cm
          （{{ levelSpec.label }} 代表身高 {{ levelSpec.referenceHeightCm }} cm）·
          {{ cellText }}
          <template v-if="scale.expanded">
            · 這球超出預設視野，畫面已自動擴大顯示
          </template>
        </template>
        <template v-else>
          這筆結果沒有擊球點，依規範不畫
        </template>
      </p>

      <BpeMetricList :metrics="result.metrics" :keys="CONTACT_METRIC_KEYS" title="擊球點數值" />
    </template>

    <p class="text-xs text-neutral-500 dark:text-neutral-400">
      九宮格採捕手視角，只用擊球點的 x（水平）與 z（高度），忽略 y——與
      3D 骨架、球場圖使用同一份座標，但只取這兩軸。好球帶不在 BPE 結果裡，
      由打者級別的代表身高推算，不是量測資料；左右恆為本壘板寬（±21.59 cm），
      切級別只會讓框變高或變矮。視野固定 150 × 200 cm，讓不同事件的擊球點可以
      直接比位置，落在視野外時會照座標畫、自動擴大視野，不裁切也不強行縮進框內。
      contact 為 null 時不畫擊球點（23 筆樣本裡有 9 筆是這樣：8 筆 outcome 為
      uncertain，另有事件 #20 雖是 hit 也沒有擊球點）。擊球點是球棒碰到球的實際位置，不是好壞球判定——
      高於好球帶上緣也可能出現（例如事件 #7 高達 168 cm），這個數值是否合理
      已列入待演算法端確認的事項，畫面上一律照座標畫。
    </p>
  </div>
</template>

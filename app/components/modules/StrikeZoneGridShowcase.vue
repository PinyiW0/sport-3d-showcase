<script setup lang="ts">
import type { BatterLevel } from '~/components/baseball-field/core/batterLevels'
import {
  BATTER_LEVEL_ORDER,
  BATTER_LEVELS,
  getStrikeZoneForLevel,
} from '~/components/baseball-field/core/batterLevels'
import {
  isStrike,
  pitchFromStrikeZonePoint,
  strikeZoneFromHeight,
  useStrikeZoneScale,
} from '~/components/strike-zone-grid/core/useStrikeZoneScale'
import StrikeZone from '~/components/strike-zone-grid/StrikeZone.vue'

// strike-zone-grid 模組的「模組呈現」互動元件：選球、看落點落在九宮格哪一格。
// 完整 25 球列表與好壞球統計在獨立頁 /bt3d-demo。

// 後端 analysis_result.json 只給落點與身高，好球帶框由打者級別的代表身高推算：
// 左右恆為本壘板寬，上下隨身高變動，所以切級別只會讓框變高／變矮，不會變寬。
const level = ref<BatterLevel>('adult')
const levelSpec = computed(() => BATTER_LEVELS[level.value])
const zone = computed(() => strikeZoneFromHeight(levelSpec.value.referenceHeightCm))
const zoneCm = computed(() => getStrikeZoneForLevel(level.value))
const scale = useStrikeZoneScale(() => zone.value)

// 選項直接標出代表身高——好球帶高度就是這個身高算出來的，不標的話切了看不出依據。
const levelOptions = BATTER_LEVEL_ORDER.map(key => ({
  label: `${BATTER_LEVELS[key].label} ${BATTER_LEVELS[key].referenceHeightCm} cm`,
  value: key,
}))

// 代表身高的推導過程，攤在頁面上（見下方 <details>）。逐列由 BATTER_LEVELS 算出而非
// 寫死，之後改身高表這裡會自動跟上，不會變成對不上的過期說明。
const levelRows = computed(() =>
  BATTER_LEVEL_ORDER.map((key) => {
    const spec = BATTER_LEVELS[key]
    const z = getStrikeZoneForLevel(key)
    return {
      key,
      label: spec.label,
      grades: spec.grades,
      ages: `${spec.ages[0]}–${spec.ages[1]} 歲`,
      formula: `(${spec.pr50ByAge.join(' + ')}) ÷ ${spec.pr50ByAge.length}`,
      height: spec.referenceHeightCm,
      zoneText: `${z.bottom.toFixed(1)}–${z.top.toFixed(1)}`,
    }
  }),
)

const { pitches, error } = useBt3dSamples()

const items = computed(() =>
  pitches.value.map((pitch) => {
    const location = pitchFromStrikeZonePoint(pitch.strikeZonePoint, pitch.time)
    return { ...pitch, location, strike: isStrike(scale.value, location) }
  }),
)

const selected = ref(0)
const current = computed(() => items.value[selected.value] ?? null)
const shownPitches = computed(() => (current.value ? [current.value.location] : []))

const showLabels = ref(true)
const showField = ref(true)

const pitchOptions = computed(() =>
  items.value.map(item => ({
    label: `#${item.index + 1} · ${item.time} · ${item.strike ? '好球' : '壞球'}`,
    value: item.index,
  })),
)
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
        v-model="level"
        :items="levelOptions"
        size="sm"
        class="w-40"
        aria-label="打者級別與代表身高"
      />
      <USelect
        v-model="selected"
        :items="pitchOptions"
        size="sm"
        class="w-56"
        :disabled="!pitchOptions.length"
        aria-label="選擇投球"
      />
      <USwitch v-model="showLabels" label="格號" />
      <USwitch v-model="showField" label="本壘板" />
    </div>

    <div class="mx-auto w-full max-w-sm">
      <StrikeZone
        :zone="zone"
        :pitches="shownPitches"
        :pitch-radius="5"
        :show-labels="showLabels"
        :show-field="showField"
      />
    </div>

    <p class="text-center text-xs text-neutral-500 dark:text-neutral-400">
      {{ levelSpec.label }}（{{ levelSpec.grades }}）· 代表身高 {{ levelSpec.referenceHeightCm }} cm ·
      好球帶 {{ zoneCm.bottom.toFixed(1) }}–{{ zoneCm.top.toFixed(1) }} cm ·
      帶高 {{ (zoneCm.top - zoneCm.bottom).toFixed(1) }} cm
    </p>

    <details class="text-xs text-neutral-600 dark:text-neutral-400">
      <summary class="cursor-pointer text-neutral-500 transition hover:text-neutral-800 dark:hover:text-neutral-200">
        代表身高是怎麼算出來的？
      </summary>

      <div class="mt-3 space-y-3">
        <p>
          好球帶左右由本壘板寬固定（±21.59 cm），上下依打者身高算：
          <span class="font-mono">上緣 = 身高 × 0.535</span>、
          <span class="font-mono">下緣 = 身高 × 0.27</span>。
          所以「不同級別的好球帶」就是「不同的代表身高」——級別只讓框變高／變矮，不會變寬。
        </p>

        <p>
          代表身高取<strong class="font-medium">該級距內各年齡 PR50（均標）的算術平均</strong>：
          取平均而非單一年齡，是因為級距內各年齡人數大致均等，只取最大年齡會讓低年級打者的框整體偏高；
          取 PR50 而非 PR75，是因為好球帶要對典型打者成立，不是對高個子。
        </p>

        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-left">
            <thead class="border-b border-neutral-300 font-semibold dark:border-neutral-700">
              <tr>
                <th class="py-1.5 pr-3 font-semibold">
                  級別
                </th>
                <th class="py-1.5 pr-3 font-semibold">
                  學制
                </th>
                <th class="py-1.5 pr-3 font-semibold">
                  年齡
                </th>
                <th class="py-1.5 pr-3 font-semibold">
                  各年齡 PR50 平均
                </th>
                <th class="py-1.5 pr-3 font-semibold">
                  代表身高
                </th>
                <th class="py-1.5 font-semibold">
                  好球帶 (cm)
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in levelRows"
                :key="row.key"
                class="border-b border-neutral-200 dark:border-neutral-800"
                :class="row.key === level ? 'text-neutral-900 dark:text-neutral-100' : ''"
              >
                <td class="py-1.5 pr-3 font-medium">
                  {{ row.label }}
                </td>
                <td class="py-1.5 pr-3">
                  {{ row.grades }}
                </td>
                <td class="py-1.5 pr-3">
                  {{ row.ages }}
                </td>
                <td class="py-1.5 pr-3 font-mono">
                  {{ row.formula }}
                </td>
                <td class="py-1.5 pr-3 font-mono">
                  {{ row.height }}
                </td>
                <td class="py-1.5 font-mono">
                  {{ row.zoneText }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p>
          身高資料來源：新版 WHO 生長曲線圖 &amp; 台灣兒科醫師研究團隊（男童身高）。
          年齡分組照學制切（少棒＝小三–小六、青少棒＝國中、青棒＝高中、成棒＝18 歲以上）。
          完整推導與待確認事項見
          <span class="font-mono">spec/domain/baseball-field-coordinates.md §5</span>。
        </p>

        <p class="text-neutral-500 dark:text-neutral-400">
          注意：算術平均等於假設該級別各年齡球員人數均等。有實際名冊時應改用年齡分布加權，
          <span class="font-mono">BATTER_LEVELS[*].pr50ByAge</span> 保留了各年齡原始值供重算。
          另外橫向格寬固定 14.39 cm，少棒的格子長寬比僅 0.82（明顯偏扁），九宮格不可假設為正方形。
        </p>
      </div>
    </details>

    <p v-if="current" class="text-center text-sm text-neutral-500">
      第 {{ current.index + 1 }} 球 · {{ current.time }} ·
      落點 x {{ current.strikeZonePoint[0].toFixed(1) }} ·
      z {{ current.strikeZonePoint[2].toFixed(1) }} cm ·
      <span :class="current.strike ? 'text-primary' : 'text-error'">
        {{ current.strike ? '好球' : '壞球' }}
      </span>
    </p>
  </div>
</template>

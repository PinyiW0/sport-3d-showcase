<script setup lang="ts">
import {
  isStrike,
  pitchFromStrikeZonePoint,
  strikeZoneFromHeight,
  useStrikeZoneScale,
} from '~/components/strike-zone-grid/core/useStrikeZoneScale'
import StrikeZone from '~/components/strike-zone-grid/StrikeZone.vue'

// strike-zone-grid 模組的「模組呈現」互動元件：選球、看落點落在九宮格哪一格。
// 完整 25 球列表與好壞球統計在獨立頁 /bt3d-demo。

// 後端 analysis_result.json 只給落點，好球帶框用固定 175cm 標準框推算。
const zone = strikeZoneFromHeight(175)
const scale = useStrikeZoneScale(() => zone)

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
        v-model="selected"
        :items="pitchOptions"
        size="sm"
        class="w-56"
        :disabled="!pitchOptions.length"
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

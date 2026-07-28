<script setup lang="ts">
import {
  isStrike,
  pitchFromStrikeZonePoint,
  strikeZoneFromHeight,
  useStrikeZoneScale,
} from '~/components/strike-zone-grid/core/useStrikeZoneScale'
import StrikeZone from '~/components/strike-zone-grid/StrikeZone.vue'

// strike-zone-grid 模組驗證頁：25 球逐球檢視落點與好壞球判定。
// 好球帶為固定 175cm 標準框（後端資料不含打者身高）。

const zone = strikeZoneFromHeight(175)
const scale = useStrikeZoneScale(() => zone)

const { pitches, error } = useBt3dSamples()

const items = computed(() =>
  pitches.value.map((pitch) => {
    const location = pitchFromStrikeZonePoint(pitch.strikeZonePoint, pitch.time)
    return { ...pitch, location, strike: isStrike(scale.value, location) }
  }),
)
const strikeCount = computed(() => items.value.filter(item => item.strike).length)

const selected = ref(0)
const current = computed(() => items.value[selected.value] ?? null)
const shownPitches = computed(() => (current.value ? [current.value.location] : []))
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6 p-8">
    <div>
      <h1 class="text-2xl font-bold">
        BT3D 落點圖驗證（{{ items.length }} 球）
      </h1>
      <p class="mt-1 text-sm text-neutral-500">
        點選左側任一球，右側顯示該球落點。
        <span class="text-primary">好球 {{ strikeCount }}</span> ·
        <span class="text-error">壞球 {{ items.length - strikeCount }}</span>
      </p>
    </div>

    <UAlert
      v-if="error"
      color="error"
      title="樣本載入失敗"
      :description="String(error)"
    />

    <div class="grid grid-cols-1 gap-6 md:grid-cols-[1fr_340px]">
      <ul class="flex max-h-130 flex-col gap-1 overflow-y-auto rounded-lg border border-neutral-200 p-2 dark:border-neutral-700">
        <li v-for="item in items" :key="item.ts">
          <button
            type="button"
            class="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors"
            :class="item.index === selected
              ? 'bg-primary/10 ring-1 ring-primary'
              : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'"
            @click="selected = item.index"
          >
            <span class="flex items-center gap-2">
              <span
                class="inline-block size-2.5 rounded-full"
                :class="item.strike ? 'bg-primary' : 'bg-error'"
              />
              <span class="font-medium tabular-nums">#{{ item.index + 1 }}</span>
              <span class="text-neutral-400 tabular-nums">{{ item.time }}</span>
            </span>
            <span class="flex items-center gap-3">
              <span class="text-neutral-500 tabular-nums">
                x {{ item.strikeZonePoint[0].toFixed(1) }} · z {{ item.strikeZonePoint[2].toFixed(1) }} cm
              </span>
              <span :class="item.strike ? 'text-primary' : 'text-error'">
                {{ item.strike ? '好球' : '壞球' }}
              </span>
            </span>
          </button>
        </li>
      </ul>

      <div class="flex flex-col gap-2">
        <div class="rounded-lg border border-neutral-200 p-4 dark:border-neutral-700">
          <StrikeZone :zone="zone" :pitches="shownPitches" :pitch-radius="5" show-field />
        </div>
        <p v-if="current" class="text-center text-sm text-neutral-500">
          第 {{ current.index + 1 }} 球 · {{ current.time }} ·
          <span :class="current.strike ? 'text-primary' : 'text-error'">
            {{ current.strike ? '好球' : '壞球' }}
          </span>
        </p>
      </div>
    </div>
  </div>
</template>

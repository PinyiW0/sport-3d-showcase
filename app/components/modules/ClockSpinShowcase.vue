<script setup lang="ts">
import type { PointerStyle } from '~/components/clock-spin/SpinTiltClock.vue'
import { parseSpinResult } from '~/components/baseball-spin/core/types'

// clock-spin 模組的「模組呈現」互動元件：選 sample、看該球的轉軸落在時鐘幾點。
// 與 3D 轉軸的並排對照在獨立頁 /clock-demo。

import SpinTiltClock from '~/components/clock-spin/SpinTiltClock.vue'

const sampleIds = ['sample1', 'sample2', 'sample3']
const selected = ref('sample1')

// 兩種指針樣式並存，來源不同專案，留著讓人挑
const pointerOptions: { label: string, value: PointerStyle }[] = [
  { label: 'V 形（project-c）', value: 'chevron' },
  { label: '箭頭（project-a）', value: 'arrow' },
]
const pointer = ref<PointerStyle>('chevron')

// server: false — public/ 靜態檔在 dev SSR 的 nitro 內部 fetch 拿不到（404），只在 client 抓
const { data: spinData, error } = useFetch(
  () => `/samples/spin/${selected.value}/result.json`,
  { server: false, transform: json => parseSpinResult(json) },
)

const tilt = computed(() => spinData.value?.spinTilt ?? null)
const dir = computed(() => spinData.value?.spinDir ?? null)
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-3">
      <UTabs
        v-model="selected"
        :items="sampleIds.map(id => ({ label: id, value: id }))"
        :content="false"
        size="sm"
      />
      <USelect v-model="pointer" :items="pointerOptions" size="sm" class="w-36" />
    </div>

    <UAlert
      v-if="error"
      color="error"
      title="樣本載入失敗"
      :description="String(error)"
    />

    <div class="mx-auto w-full max-w-xs">
      <SpinTiltClock
        v-if="tilt"
        :degrees="tilt.degrees"
        :hhmm="tilt.hhmm"
        :pointer="pointer"
      />
    </div>

    <dl v-if="tilt && dir" class="grid grid-cols-3 gap-3 text-sm">
      <div>
        <dt class="opacity-60">
          轉軸（spin_tilt）
        </dt>
        <dd class="font-mono">
          {{ tilt.hhmm }}
        </dd>
      </div>
      <div>
        <dt class="opacity-60">
          轉軸角度
        </dt>
        <dd class="font-mono">
          {{ tilt.degrees }}°
        </dd>
      </div>
      <div>
        <dt class="opacity-60">
          方向（spin_dir）
        </dt>
        <dd class="font-mono">
          {{ dir.hhmm }}
        </dd>
      </div>
    </dl>
  </div>
</template>

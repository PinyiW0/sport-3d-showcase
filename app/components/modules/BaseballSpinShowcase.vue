<script setup lang="ts">
import type { SpinResult } from '~/components/baseball-spin/core/types'
import { parseSpinResult } from '~/components/baseball-spin/core/types'

// baseball-spin 模組的「模組呈現」互動元件：選 sample、播放/暫停、調速、看關鍵數據。
// 完整驗證（與後端 gif 並排）在獨立頁 /spin-demo。

const sampleIds = ['sample1', 'sample2', 'sample3']
const selected = ref('sample1')

const asset = useAssetUrl()

// server: false — public/ 靜態檔在 dev SSR 的 nitro 內部 fetch 拿不到（404），只在 client 抓
const { data: spinData, error } = useFetch(
  () => asset(`/samples/spin/${selected.value}/result.json`),
  { server: false, transform: json => parseSpinResult(json) },
)

const speedOptions = [
  { label: '1/80x', value: 1 / 80 },
  { label: '1/70x', value: 1 / 70 },
  { label: '1/60x（對照後端 gif）', value: 1 / 60 },
  { label: '1/50x', value: 1 / 50 },
  { label: '1/45x', value: 1 / 45 },
  { label: '1/30x', value: 1 / 30 },
  { label: '1/8x（慢動作）', value: 0.125 },
  { label: '1x（真實轉速）', value: 1 },
]
const speed = ref(1 / 60)
const showArrow = ref(true)
const showRing = ref(true)

const viewerRef = ref<{ play: () => void, pause: () => void } | null>(null)

const metrics = computed(() => {
  const d: SpinResult | undefined = spinData.value ?? undefined
  if (!d)
    return []
  return [
    { label: '轉速', value: `${Math.floor(d.rpm)} rpm` },
    { label: '轉軸', value: `${d.spinTilt.hhmm}（${d.spinTilt.degrees}°）` },
    { label: '方向', value: `${d.spinDir.hhmm}（${d.spinDir.degrees}°）` },
  ]
})
</script>

<template>
  <div class="space-y-4">
    <UTabs
      v-model="selected"
      :items="sampleIds.map(id => ({ label: id, value: id }))"
      :content="false"
      size="sm"
    />

    <UAlert
      v-if="error"
      color="error"
      title="樣本載入失敗"
      :description="String(error)"
    />

    <div class="mx-auto w-full max-w-sm overflow-hidden bg-black">
      <BaseballSpinViewer
        ref="viewerRef"
        :data="spinData ?? null"
        :model-url="asset('/models/baseball_detail.glb')"
        :speed="speed"
        :show-axis-arrow="showArrow"
        :show-direction-ring="showRing"
      />
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <UButton size="sm" @click="viewerRef?.play()">
        播放
      </UButton>
      <UButton size="sm" variant="outline" @click="viewerRef?.pause()">
        暫停
      </UButton>
      <USelect v-model="speed" :items="speedOptions" size="sm" class="w-48" />
      <USwitch v-model="showArrow" label="轉軸指針" />
      <USwitch v-model="showRing" label="方向環" />
    </div>

    <dl v-if="metrics.length" class="grid grid-cols-3 gap-3 text-sm">
      <div v-for="mt in metrics" :key="mt.label">
        <dt class="opacity-60">
          {{ mt.label }}
        </dt>
        <dd class="font-mono">
          {{ mt.value }}
        </dd>
      </div>
    </dl>
  </div>
</template>

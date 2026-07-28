<script setup lang="ts">
import PitchTrajectoryChart from '~/components/pitch-trajectory/PitchTrajectoryChart.vue'

// pitch-trajectory 模組的「模組呈現」互動元件：選球、看該球 3D 軌跡與入壘點。
// 完整球列表與逐球比對在獨立頁 /pitch3d-demo。

const { pitches, error } = useBt3dSamples()

const selected = ref(0)
const current = computed(() => pitches.value[selected.value] ?? null)
const trajectory = computed(() => current.value?.trajectory ?? [])

const pitchOptions = computed(() =>
  pitches.value.map(p => ({
    label: `#${p.index + 1} · ${p.time} · ${p.velocity != null ? `${p.velocity.toFixed(1)} km/h` : '— km/h'}`,
    value: p.index,
  })),
)

const metrics = computed(() => {
  const p = current.value
  if (!p)
    return []
  return [
    { label: '球速', value: p.velocity != null ? `${p.velocity.toFixed(1)} km/h` : '—' },
    { label: '入壘點 x', value: `${p.strikeZonePoint[0].toFixed(1)} cm` },
    { label: '入壘點 z', value: `${p.strikeZonePoint[2].toFixed(1)} cm` },
    { label: '軌跡點數', value: String(p.trajectory.length) },
  ]
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

    <USelect
      v-model="selected"
      :items="pitchOptions"
      size="sm"
      class="w-full max-w-xs"
      :disabled="!pitchOptions.length"
    />

    <!-- 圖表為暗色主題（沿用 project-b 鷹眼系統配色），容器同步壓深避免黑圖貼白框 -->
    <div class="overflow-x-auto rounded-lg bg-neutral-950">
      <PitchTrajectoryChart
        :trajectory="trajectory"
        :width="620"
        :height="420"
      />
    </div>

    <dl v-if="metrics.length" class="grid grid-cols-4 gap-3 text-sm">
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

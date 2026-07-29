<script setup lang="ts">
/**
 * 換頁進度指示：一顆球沿投球弧線從左飛到右，飛完＝頁面就緒。
 *
 * 進度接 Nuxt 內建的 useLoadingIndicator()，不自己聽 router 事件。
 *
 * 弧線是二次貝茲 M0,H Q50,C 100,H。控制點 x 取正中間時，貝茲的 x(t) 剛好等於
 * 100t——也就是水平位置與進度成正比，球才不會在中段忽快忽慢。
 */

const ARC_HEIGHT = 14 // 弧線兩端的 y（px），數字越大弧越深
const APEX = 2 // 弧頂距離頂端的 y（px）
// 由「頂點 = 0.5*(H + C)」反解控制點
const CONTROL = 2 * APEX - ARC_HEIGHT
const TRACK_PATH = `M0,${ARC_HEIGHT} Q50,${CONTROL} 100,${ARC_HEIGHT}`
const TRACK_HEIGHT = ARC_HEIGHT + 6

const { progress, isLoading } = useLoadingIndicator()

/** 球在弧線上的垂直位置（同一條貝茲，取 y(t)） */
const ballY = computed(() => {
  const t = Math.min(Math.max(progress.value / 100, 0), 1)
  const inv = 1 - t
  return inv * inv * ARC_HEIGHT + 2 * inv * t * CONTROL + t * t * ARC_HEIGHT
})
</script>

<template>
  <Transition name="pitch-fade">
    <div
      v-show="isLoading"
      class="pointer-events-none fixed inset-x-0 top-0 z-[9998]"
      :style="{ height: `${TRACK_HEIGHT}px` }"
      role="progressbar"
      aria-label="頁面載入進度"
      :aria-valuenow="Math.round(progress)"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <!-- preserveAspectRatio=none 讓弧線橫向填滿；non-scaling-stroke 保住線寬不被一起拉扁 -->
      <svg
        class="size-full"
        :viewBox="`0 0 100 ${TRACK_HEIGHT}`"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          :d="TRACK_PATH"
          class="pitch-progress__track"
          vector-effect="non-scaling-stroke"
        />
      </svg>

      <div
        class="pitch-progress__ball"
        :style="{ left: `${progress}%`, top: `${ballY}px` }"
      />
    </div>
  </Transition>
</template>

<style scoped>
.pitch-progress__track {
  fill: none;
  stroke: currentColor;
  stroke-width: 1;
  opacity: 0.2;
}

.pitch-progress__ball {
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%; /* 這顆是球，直角規則不適用 */
  background: var(--ui-primary);
  box-shadow: 0 0 8px var(--ui-primary);
  transform: translate(-50%, -50%);
}

/* 只動 opacity，收在 creative-direction §4 的三檔內 */
.pitch-fade-enter-active,
.pitch-fade-leave-active {
  transition: opacity 250ms var(--ease-standard);
}

.pitch-fade-enter-from,
.pitch-fade-leave-to {
  opacity: 0;
}
</style>

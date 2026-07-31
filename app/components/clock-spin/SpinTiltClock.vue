<script setup lang="ts">
import { computed } from 'vue'
import { clockNumberPositions } from './core/clock-geometry'

// 轉軸時鐘面板（模組唯一對外元件）。
// 可攜性約束：純 SVG、只用相對 import、不用 NuxtUI，也沒有 3D 函式庫依賴。
// 呈現方式就是把 spin_tilt.degrees 直接餵給 SVG rotate()，指針預設指向 12 點。
export type PointerStyle = 'chevron' | 'arrow'

const props = withDefaults(defineProps<{
  /** 轉軸角度（度）；後端 spin_tilt.degrees，順時針、12 點為 0 */
  degrees: number
  /** 時鐘制標籤（HH:mm），例如 "01:47"；不給就不顯示標籤列 */
  hhmm?: string
  /** 標籤列文字，預設「轉軸方向」 */
  label?: string
  /**
   * 指針樣式：
   * - `chevron`：5 個 V 形沿軸排列
   * - `arrow`：單一實心箭頭加陰影
   */
  pointer?: PointerStyle
}>(), {
  hhmm: '',
  label: '轉軸方向',
  pointer: 'chevron',
})

const clockNumbers = clockNumberPositions()

/** 指針上 5 個 chevron 的 y 位置（沿轉軸等距排列，尖端一律朝上） */
const CHEVRON_POSITIONS = [68, 88, 108, 128, 148]

const rotation = computed(() => `rotate(${props.degrees} 100 100)`)
</script>

<template>
  <div class="flex flex-col items-center">
    <div v-if="hhmm" class="mb-2 flex shrink-0 items-center justify-center gap-4">
      <div class="text-lg font-semibold whitespace-nowrap text-neutral-600">
        {{ label }}
      </div>
      <div class="font-mono text-xl font-medium whitespace-nowrap text-neutral-500">
        {{ hhmm }}
      </div>
    </div>

    <svg
      viewBox="0 0 200 200"
      class="min-h-0 w-full flex-1"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      :aria-label="hhmm ? `轉軸方向 ${hhmm}` : '轉軸方向'"
      data-testid="spin-tilt-clock"
    >
      <!-- 盤面（靜態，不隨資料變化） -->
      <g>
        <circle cx="100" cy="100" r="84" fill="#E5E5E5" />
        <g
          fill="#404040"
          font-family="Inter, system-ui, sans-serif"
          font-size="11"
          font-weight="600"
          text-anchor="middle"
          dominant-baseline="middle"
        >
          <text v-for="c in clockNumbers" :key="c.num" :x="c.x" :y="c.y">{{ c.num }}</text>
        </g>
        <circle cx="100" cy="100" r="62" fill="#FFFFFF" />
        <g stroke="#D4D4D4" stroke-width="0.8" opacity="0.6">
          <line x1="100" y1="44" x2="100" y2="156" />
          <line x1="44" y1="100" x2="156" y2="100" />
        </g>
      </g>

      <!-- 轉軸指針：整組繞中心旋轉 spin_tilt.degrees。兩種樣式同幾何、僅畫法不同。 -->
      <!-- chevron：多個 V 形沿軸排列，看得出「軸」的走向 -->
      <g v-if="pointer === 'chevron'" :transform="rotation" data-testid="spin-tilt-arrow">
        <polyline
          v-for="cy in CHEVRON_POSITIONS"
          :key="cy"
          :points="`90,${cy} 100,${cy - 16} 110,${cy}`"
          fill="none"
          stroke="#404040"
          stroke-width="6"
          stroke-linejoin="miter"
        />
      </g>

      <!-- arrow：單一實心箭頭，指向明確 -->
      <g
        v-else
        :transform="rotation"
        style="filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.15));"
        data-testid="spin-tilt-arrow"
      >
        <line
          x1="100"
          y1="148"
          x2="100"
          y2="66"
          stroke="#404040"
          stroke-width="5"
          stroke-linecap="round"
        />
        <polygon points="100,48 90,68 110,68" fill="#404040" />
      </g>
    </svg>
  </div>
</template>

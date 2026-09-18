<script setup lang="ts">
// 來源：Vue Bits 的 LineSidebar（TypeScript + Tailwind 版）。
// 三處為配合本專案規範調整，改動理由寫在各自位置：
//   1. 顏色預設吃 Nuxt UI 的主題變數，不寫死 hex（visual-hierarchy-check 擋 class 任意值色彩）
//   2. 補 prefers-reduced-motion：本元件的位移是 JS rAF 驅動，main.css 的 CSS guard 管不到
//   3. 項目補 role/tabindex/keydown，鍵盤才走得到（原版只有 click）
import type { ComponentPublicInstance, CSSProperties } from 'vue'

export type Falloff = 'linear' | 'smooth' | 'sharp'

interface LineSidebarProps {
  items?: string[]
  accentColor?: string
  textColor?: string
  markerColor?: string
  showIndex?: boolean
  showMarker?: boolean
  proximityRadius?: number
  maxShift?: number
  falloff?: Falloff
  markerLength?: number
  markerGap?: number
  tickScale?: number
  scaleTick?: boolean
  itemGap?: number
  fontSize?: number
  smoothing?: number
  defaultActive?: number | null
}

const props = withDefaults(defineProps<LineSidebarProps>(), {
  items: () => [],
  accentColor: 'var(--ui-primary)',
  textColor: 'var(--ui-text-muted)',
  markerColor: 'var(--ui-border-accented)',
  showIndex: true,
  showMarker: true,
  proximityRadius: 100,
  maxShift: 30,
  falloff: 'smooth',
  markerLength: 60,
  markerGap: 0,
  tickScale: 0.5,
  scaleTick: true,
  itemGap: 20,
  fontSize: 1,
  smoothing: 100,
  defaultActive: null,
})

const emit = defineEmits<{ itemClick: [index: number, label: string] }>()

const FALLOFF_CURVES: Record<Falloff, (p: number) => number> = {
  linear: p => p,
  smooth: p => p * p * (3 - 2 * p),
  sharp: p => p * p * p,
}

const listRef = ref<HTMLUListElement | null>(null)
const itemRefs = ref<(HTMLLIElement | null)[]>([])
const activeIndex = ref<number | null>(null)
const reducedMotion = ref(false)

let targets: number[] = []
const current: number[] = []
let rafId: number | null = null
let last = 0
let motionQuery: MediaQueryList | null = null

function setItemRef(el: Element | ComponentPublicInstance | null, index: number) {
  itemRefs.value[index] = el as HTMLLIElement | null
}

function runFrame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.05)
  last = now
  const tau = Math.max(props.smoothing, 1) / 1000
  const k = 1 - Math.exp(-dt / tau)

  let moving = false
  const els = itemRefs.value
  for (let i = 0; i < els.length; i++) {
    const el = els[i]
    if (!el)
      continue
    const target = Math.max(targets[i] || 0, activeIndex.value === i ? 1 : 0)
    const cur = current[i] || 0
    // 減少動態偏好開啟時直接跳到終點，不做逐幀漸變
    const next = reducedMotion.value ? target : cur + (target - cur) * k
    const settled = Math.abs(target - next) < 0.0015
    const value = settled ? target : next
    current[i] = value
    el.style.setProperty('--effect', value.toFixed(4))
    if (!settled)
      moving = true
  }

  rafId = moving ? requestAnimationFrame(runFrame) : null
}

function startLoop() {
  if (rafId != null)
    return
  last = performance.now()
  rafId = requestAnimationFrame(runFrame)
}

function handlePointerMove(e: PointerEvent) {
  const list = listRef.value
  // 減少動態偏好開啟時不追游標，只留選中項的高亮
  if (!list || reducedMotion.value)
    return
  const rect = list.getBoundingClientRect()
  const pointerY = e.clientY - rect.top
  const ease = FALLOFF_CURVES[props.falloff] ?? FALLOFF_CURVES.linear
  const els = itemRefs.value
  for (let i = 0; i < els.length; i++) {
    const el = els[i]
    if (!el)
      continue
    const center = el.offsetTop + el.offsetHeight / 2
    const distance = Math.abs(pointerY - center)
    targets[i] = ease(Math.max(0, 1 - distance / props.proximityRadius))
  }
  startLoop()
}

function handlePointerLeave() {
  targets = targets.map(() => 0)
  startLoop()
}

function handleSelect(index: number, label: string) {
  activeIndex.value = index
  emit('itemClick', index, label)
}

function handleMotionChange(e: MediaQueryListEvent) {
  reducedMotion.value = e.matches
  startLoop()
}

/** 分隔短刻度：畫在兩項之間，最後一項不畫 */
function tickClass(): string {
  if (!props.showMarker)
    return ''
  const base = `after:absolute after:left-[calc(-1*var(--marker-length)-var(--marker-gap))] after:top-[calc(100%+var(--item-gap)/2)] after:h-px after:opacity-50 after:content-[''] last:after:content-none after:[background-color:var(--marker-color)] after:[width:calc(var(--marker-length)*var(--tick-scale))]`
  return props.scaleTick
    ? `${base} after:origin-left after:[transform:translateY(-50%)_scaleX(calc(0.7+var(--effect,0)*0.6))]`
    : `${base} after:-translate-y-1/2`
}

// defaultActive 走 watch 而非在 root scope 直接取值：後者會失去響應性（vue/no-setup-props-reactivity-loss）
watch(() => props.defaultActive, (value) => {
  activeIndex.value = value
}, { immediate: true })
watch(activeIndex, () => startLoop(), { immediate: true })

onMounted(() => {
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  reducedMotion.value = motionQuery.matches
  motionQuery.addEventListener('change', handleMotionChange)
})

onUnmounted(() => {
  if (rafId != null)
    cancelAnimationFrame(rafId)
  motionQuery?.removeEventListener('change', handleMotionChange)
})
</script>

<template>
  <nav
    class="relative flex justify-start"
    :class="{ 'pl-[calc(var(--marker-length)+var(--marker-gap))]': showMarker }"
    :style="{
      '--accent-color': accentColor,
      '--text-color': textColor,
      '--marker-color': markerColor,
      '--marker-length': `${markerLength}px`,
      '--marker-gap': `${markerGap}px`,
      '--tick-scale': tickScale,
      '--max-shift': `${maxShift}px`,
      '--item-gap': `${itemGap}px`,
      '--font-size': `${fontSize}rem`,
      '--smoothing': `${smoothing}ms`,
    } as CSSProperties"
  >
    <ul
      ref="listRef"
      class="m-0 flex list-none flex-col gap-(--item-gap) py-4"
      @pointermove="handlePointerMove"
      @pointerleave="handlePointerLeave"
    >
      <li
        v-for="(label, index) in items"
        :key="`${label}-${index}`"
        :ref="el => setItemRef(el, index)"
        role="link"
        tabindex="0"
        :aria-current="activeIndex === index ? 'true' : undefined"
        :class="`relative cursor-pointer before:absolute before:-inset-x-12 before:-inset-y-1.5 before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--accent-color) ${tickClass()}`"
        @click="handleSelect(index, label)"
        @keydown.enter.prevent="handleSelect(index, label)"
        @keydown.space.prevent="handleSelect(index, label)"
      >
        <span
          v-if="showMarker"
          aria-hidden="true"
          class="absolute top-1/2 left-[calc(-1*var(--marker-length)-var(--marker-gap))] h-px w-(--marker-length) origin-left bg-[color-mix(in_srgb,var(--accent-color)_calc(var(--effect,0)*100%),var(--marker-color))] transform-[translateY(-50%)_scaleX(calc(0.7+var(--effect,0)*0.5))]"
        />
        <span
          class="relative inline-flex items-baseline [font-size:var(--font-size)] leading-[1.2] text-[color-mix(in_srgb,var(--accent-color)_calc(var(--effect,0)*100%),var(--text-color))] transform-[translateX(calc(var(--effect,0)*var(--max-shift)))]"
        >
          <span v-if="showIndex" class="mr-[0.6rem] font-mono text-[0.85em] opacity-[calc(0.55+var(--effect,0)*0.45)]">
            {{ String(index + 1).padStart(2, '0') }}
          </span>
          <span>{{ label }}</span>
        </span>
      </li>
    </ul>
  </nav>
</template>

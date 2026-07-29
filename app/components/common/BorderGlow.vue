<script setup lang="ts">
/**
 * 游標感應的漸層光暈邊框。
 *
 * 機制取自 Vue Bits 的 BorderGlow：追蹤指標到卡片中心的方位角與「離邊緣多近」，
 * 用 conic-gradient 遮罩讓亮邊只出現在游標那一側，越靠邊越亮。
 *
 * 依本專案規範改寫的三處（creative-direction.md）：
 * - duration 收進 250/400 兩檔（原版 0.75s 不在檔位），easing 走 --ease-standard token
 * - 配色改用專案色板（primary/secondary/info），原版的紫→粉→藍在 §3「AI 模板味」避免清單上
 * - 背景吃 var(--ui-bg) 跟隨明暗主題，不寫死深色
 */

interface Props {
  /** 指標要多靠近邊緣才亮（0–100，越大越晚亮） */
  edgeSensitivity?: number
  /** 外光暈顏色，HSL 三值字串 "H S L"；不給就用隨主題切換的預設值 */
  glowColor?: string
  /** 卡片底色；預設跟隨 NuxtUI 主題變數 */
  backgroundColor?: string
  /** 圓角（px），要與外層卡片一致；預設 0＝直角，與站上其他載體一致 */
  borderRadius?: number
  /** 外光暈延伸距離（px） */
  glowRadius?: number
  /** 光暈強度倍率 */
  glowIntensity?: number
  /** 亮邊圓錐遮罩寬度（%） */
  coneSpread?: number
  /** 漸層邊框用的三個色（依序分配到 7 個位置） */
  colors?: [string, string, string]
  /** 內部漸層填充的透明度 */
  fillOpacity?: number
}

const props = withDefaults(defineProps<Props>(), {
  edgeSensitivity: 30,
  glowColor: '',
  backgroundColor: 'var(--ui-bg)',
  borderRadius: 0,
  glowRadius: 32,
  glowIntensity: 1,
  coneSpread: 25,
  // 預設走 <style> 裡隨主題切換的變數：淺色底用深階（對比才夠），深色底用亮階
  colors: () => ['var(--bg-glow-1)', 'var(--bg-glow-2)', 'var(--bg-glow-3)'],
  fillOpacity: 0.5,
})

const WHITESPACE = /\s+/g

/** 沒指定 glowColor 就吃 CSS 變數，讓明暗主題各自取用適合的亮度 */
const glowHsl = computed(() => (props.glowColor ? props.glowColor.replace(WHITESPACE, ' ') : 'var(--bg-glow-hsl)'))

/** 亮邊的七個 radial-gradient 落點與取色順序（維持原版的不規則分布） */
const GRADIENT_POSITIONS = ['80% 55%', '69% 34%', '8% 6%', '41% 38%', '86% 85%', '82% 18%', '51% 4%']
const COLOR_MAP = [0, 1, 2, 0, 1, 2, 1]

/** "H S L" 三值字串 */
const HSL_PATTERN = /([\d.]+)\s+([\d.]+)%?\s+([\d.]+)%?/

const cardRef = useTemplateRef<HTMLDivElement>('cardRef')
const isHovered = ref(false)
const cursorAngle = ref(45)
const edgeProximity = ref(0)

/** 指標位置 → 「離邊緣多近」(0=中心, 1=貼邊) 與方位角（12 點為 0°，順時針） */
function handlePointerMove(event: PointerEvent) {
  const card = cardRef.value
  if (!card)
    return
  const rect = card.getBoundingClientRect()
  const cx = rect.width / 2
  const cy = rect.height / 2
  const dx = event.clientX - rect.left - cx
  const dy = event.clientY - rect.top - cy

  const kx = dx === 0 ? Number.POSITIVE_INFINITY : cx / Math.abs(dx)
  const ky = dy === 0 ? Number.POSITIVE_INFINITY : cy / Math.abs(dy)
  edgeProximity.value = Math.min(Math.max(1 / Math.min(kx, ky), 0), 1)

  if (dx !== 0 || dy !== 0) {
    const degrees = Math.atan2(dy, dx) * (180 / Math.PI) + 90
    cursorAngle.value = degrees < 0 ? degrees + 360 : degrees
  }
}

/** 外光暈：同色多層 box-shadow 疊出擴散感（內外各一組） */
const boxShadow = computed(() => {
  const match = props.glowColor ? props.glowColor.match(HSL_PATTERN) : null
  const base = match ? `${match[1]}deg ${match[2]}% ${match[3]}%` : glowHsl.value
  const layers: [number, number, number][] = [
    [1, 0, 60],
    [3, 0, 50],
    [6, 0, 40],
    [15, 0, 30],
    [25, 2, 20],
    [50, 2, 10],
  ]
  const build = (inset: boolean) =>
    layers.map(([blur, spread, alpha]) =>
      `${inset ? 'inset ' : ''}0 0 ${blur}px ${spread}px hsl(${base} / ${Math.min(alpha * props.glowIntensity, 100)}%)`,
    )
  return [`inset 0 0 0 1px hsl(${base} / 100%)`, ...build(true), ...build(false)].join(', ')
})

const meshGradients = computed(() =>
  GRADIENT_POSITIONS.map((pos, i) =>
    `radial-gradient(at ${pos}, ${props.colors[COLOR_MAP[i]!]} 0px, transparent 50%)`,
  ).concat(`linear-gradient(${props.colors[0]} 0 100%)`),
)

const angle = computed(() => `${cursorAngle.value.toFixed(2)}deg`)
/** 邊框比外光暈晚 20 點才亮，兩者才有層次 */
const borderOpacity = computed(() => {
  if (!isHovered.value)
    return 0
  const threshold = props.edgeSensitivity + 20
  return Math.max(0, (edgeProximity.value * 100 - threshold) / (100 - threshold))
})
const glowOpacity = computed(() => {
  if (!isHovered.value)
    return 0
  return Math.max(0, (edgeProximity.value * 100 - props.edgeSensitivity) / (100 - props.edgeSensitivity))
})

/** hover 時快速亮起、離開時慢一點淡出（兩檔皆在 creative-direction §4 允許值內） */
const fade = computed(() =>
  isHovered.value ? 'opacity 250ms var(--ease-standard)' : 'opacity 400ms var(--ease-standard)',
)

const coneMask = computed(() =>
  `conic-gradient(from ${angle.value} at center, black ${props.coneSpread}%, transparent ${props.coneSpread + 15}%, transparent ${100 - props.coneSpread - 15}%, black ${100 - props.coneSpread}%)`,
)
const glowMask = computed(() =>
  `conic-gradient(from ${angle.value} at center, black 2.5%, transparent 10%, transparent 90%, black 97.5%)`,
)
</script>

<template>
  <!-- 靜態邊框畫在這層；hover 時亮邊層（z-0）疊上去取代它 -->
  <div
    ref="cardRef"
    class="border-glow relative isolate border border-neutral-200 dark:border-neutral-800"
    :style="{ borderRadius: `${borderRadius}px` }"
    @pointermove="handlePointerMove"
    @pointerenter="isHovered = true"
    @pointerleave="isHovered = false"
  >
    <!-- 漸層亮邊：只在游標那一側顯現。
         -inset-px 讓它正好蓋在 root 的 1px 邊框上——slot 內容只填到 padding box，
         碰不到這圈，所以卡片內容（例如鋪滿的預覽影片）不會把亮邊遮掉。 -->
    <div
      class="pointer-events-none absolute -inset-px z-0 rounded-[inherit]"
      :style="{
        border: '1px solid transparent',
        background: [
          `linear-gradient(${backgroundColor} 0 100%) padding-box`,
          'linear-gradient(rgb(255 255 255 / 0%) 0% 100%) border-box',
          ...meshGradients.map(g => `${g} border-box`),
        ].join(', '),
        opacity: borderOpacity,
        maskImage: coneMask,
        WebkitMaskImage: coneMask,
        transition: fade,
      }"
    />

    <!-- 內部漸層暈染：soft-light 疊在卡面上，量很淡 -->
    <div
      class="pointer-events-none absolute inset-0 z-0 rounded-[inherit]"
      :style="{
        background: meshGradients.map(g => `${g} padding-box`).join(', '),
        opacity: borderOpacity * fillOpacity,
        mixBlendMode: 'soft-light',
        maskImage: `radial-gradient(ellipse at 50% 50%, transparent 40%, black 75%)`,
        WebkitMaskImage: `radial-gradient(ellipse at 50% 50%, transparent 40%, black 75%)`,
        transition: fade,
      }"
    />

    <!-- 外光暈：溢出卡片邊界的擴散光。
         混色模式寫在 <style> 而非 inline——inline 優先級最高，dark 主題就蓋不掉。 -->
    <span
      class="border-glow__aura pointer-events-none absolute z-1 rounded-[inherit]"
      :style="{
        inset: `-${glowRadius}px`,
        maskImage: glowMask,
        WebkitMaskImage: glowMask,
        opacity: glowOpacity,
        transition: fade,
      }"
    >
      <span class="absolute rounded-[inherit]" :style="{ inset: `${glowRadius}px`, boxShadow }" />
    </span>

    <div class="relative z-1 h-full rounded-[inherit]">
      <slot />
    </div>
  </div>
</template>

<style scoped>
/*
 * 光暈配色隨明暗主題切換——用 CSS 變數而非 JS 判斷主題，避免 SSR / client 首幀不一致。
 * 淺色底取 600 階（白底上要夠深才有對比），深色底取 400 階。
 */
.border-glow {
  --bg-glow-1: #16a34a; /* green-600 */
  --bg-glow-2: #0284c7; /* sky-600 */
  --bg-glow-3: #2563eb; /* blue-600 */
  --bg-glow-hsl: 142deg 76% 36%;
}

:where(.dark) .border-glow {
  --bg-glow-1: #4ade80; /* green-400 */
  --bg-glow-2: #38bdf8; /* sky-400 */
  --bg-glow-3: #60a5fa; /* blue-400 */
  --bg-glow-hsl: 142deg 69% 58%;
}

/*
 * plus-lighter 是加亮混色，在白底（白已是最亮）上等於無效——
 * 預覽影片有一半是白底，淺色主題下光暈會整個消失，所以只在深色主題啟用。
 */
.border-glow__aura {
  mix-blend-mode: normal;
}

:where(.dark) .border-glow__aura {
  mix-blend-mode: plus-lighter;
}
</style>

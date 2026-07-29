<script setup lang="ts">
/**
 * 逐字洗牌進場：每個字元變成一條可滑動的字條，滑過幾個亂序字後停在正確的字上。
 *
 * 機制取自 Vue Bits 的 Shuffle：用 GSAP SplitText 拆字，每個字元外面包一層
 * overflow-hidden 的框，框內排「原字 → 亂序字 → 原字」，再把整條平移。
 *
 * 依本專案規範改寫的四處：
 * - reduced-motion 時文字照樣顯示：原版在這個分支直接 return，而可見性由
 *   ready 控制，結果是偏好減少動態的使用者永遠看不到這行字（a11y 硬傷）
 * - 拿掉硬編碼的 uppercase 與超大字級：字級與大小寫該由使用端決定，
 *   元件把字級寫死也會撞上 visual-hierarchy 的字級檢查
 * - 拿掉 'Press Start 2P' 這個像素字體 fallback：專案沒有這個字體，
 *   而且風格對不上，改成繼承外層字體
 * - 完成回呼改用 emit，不走 prop callback
 */

import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText as GSAPSplitText } from 'gsap/SplitText'

type ShuffleDirection = 'left' | 'right' | 'up' | 'down'
type AnimationMode = 'random' | 'evenodd'
type TagName = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span'

interface Props {
  /** 要洗牌的文字 */
  text: string
  /** 字條滑出的方向 */
  shuffleDirection?: ShuffleDirection
  /** 每個字條滑動的秒數 */
  duration?: number
  /** random 模式下每條字的最大隨機延遲 */
  maxDelay?: number
  ease?: string
  /** 元素進入視野多少比例才開始 */
  threshold?: number
  /** ScrollTrigger 的起始偏移 */
  rootMargin?: string
  /** 渲染成哪個標籤 */
  tag?: TagName
  /** 停在正確字之前先滑過幾個亂序字 */
  shuffleTimes?: number
  /** evenodd＝奇偶錯開；random＝每條字各自隨機延遲 */
  animationMode?: AnimationMode
  loop?: boolean
  loopDelay?: number
  /** evenodd 模式的錯開秒數 */
  stagger?: number
  /** 亂序字的取樣字元；留空就用原字的複本 */
  scrambleCharset?: string
  colorFrom?: string
  colorTo?: string
  /** 只在第一次進入視野時跑 */
  triggerOnce?: boolean
  /** 偏好減少動態時略過動畫 */
  respectReducedMotion?: boolean
  /** 跑完後可用 hover 重播 */
  triggerOnHover?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  shuffleDirection: 'right',
  duration: 0.35,
  maxDelay: 0,
  ease: 'power3.out',
  threshold: 0.1,
  rootMargin: '-100px',
  tag: 'p',
  shuffleTimes: 1,
  animationMode: 'evenodd',
  loop: false,
  loopDelay: 0,
  stagger: 0.03,
  scrambleCharset: '',
  colorFrom: undefined,
  colorTo: undefined,
  triggerOnce: true,
  respectReducedMotion: true,
  triggerOnHover: true,
})

const emit = defineEmits<{ shuffleComplete: [] }>()

gsap.registerPlugin(ScrollTrigger, GSAPSplitText)

const MARGIN_PATTERN = /^(-?\d+(?:\.\d+)?)(px|em|rem|%)?$/

const elRef = useTemplateRef<HTMLElement>('elRef')
const fontsLoaded = ref(false)
const ready = ref(false)

let split: GSAPSplitText | null = null
let wrappers: HTMLElement[] = []
let tl: gsap.core.Timeline | null = null
let playing = false
let hoverHandler: (() => void) | null = null
let scrollTrigger: ScrollTrigger | null = null

const scrollTriggerStart = computed(() => {
  const startPct = (1 - props.threshold) * 100
  const m = MARGIN_PATTERN.exec(props.rootMargin || '')
  const value = m ? Number.parseFloat(m[1]!) : 0
  const unit = m ? m[2] || 'px' : 'px'
  const sign = value === 0 ? '' : value < 0 ? `-=${Math.abs(value)}${unit}` : `+=${value}${unit}`
  return `top ${startPct}%${sign}`
})

function rand(set: string) {
  return set.charAt(Math.floor(Math.random() * set.length)) || ''
}

function removeHover() {
  if (hoverHandler && elRef.value) {
    elRef.value.removeEventListener('mouseenter', hoverHandler)
    hoverHandler = null
  }
}

/** 把字條還原成原本的字元，並把 SplitText 拆過的結構收回去 */
function teardown() {
  tl?.kill()
  tl = null
  wrappers.forEach((wrap) => {
    const inner = wrap.firstElementChild
    const orig = inner?.querySelector('[data-orig="1"]')
    if (orig && wrap.parentNode)
      wrap.parentNode.replaceChild(orig, wrap)
  })
  wrappers = []
  try {
    split?.revert()
  }
  catch {
    // revert 失敗就算了，DOM 已經還原
  }
  split = null
  playing = false
}

function getInners() {
  return wrappers.map(w => w.firstElementChild as HTMLElement)
}

function randomizeScrambles() {
  if (!props.scrambleCharset)
    return
  wrappers.forEach((w) => {
    const strip = w.firstElementChild
    if (!strip)
      return
    const kids = Array.from(strip.children) as HTMLElement[]
    for (let i = 1; i < kids.length - 1; i++)
      kids[i]!.textContent = rand(props.scrambleCharset)
  })
}

/** 動畫結束後只留真正的那個字，把字條的 transform 清掉 */
function cleanupToStill() {
  wrappers.forEach((w) => {
    const strip = w.firstElementChild as HTMLElement | null
    const real = strip?.querySelector('[data-orig="1"]')
    if (!strip || !real)
      return
    strip.replaceChildren(real)
    strip.style.transform = 'none'
    strip.style.willChange = 'auto'
  })
}

function build() {
  const el = elRef.value
  if (!el)
    return
  teardown()

  const computedFont = getComputedStyle(el).fontFamily
  split = new GSAPSplitText(el, {
    type: 'chars',
    charsClass: 'shuffle-char',
    wordsClass: 'shuffle-word',
    linesClass: 'shuffle-line',
    smartWrap: true,
    reduceWhiteSpace: false,
  })

  const chars = (split.chars || []) as HTMLElement[]
  wrappers = []
  const rolls = Math.max(1, Math.floor(props.shuffleTimes))
  const isVertical = props.shuffleDirection === 'up' || props.shuffleDirection === 'down'

  chars.forEach((ch) => {
    const parent = ch.parentElement
    if (!parent)
      return
    const { width: w, height: h } = ch.getBoundingClientRect()
    if (!w)
      return

    const wrap = document.createElement('span')
    wrap.className = 'inline-block overflow-hidden text-left'
    Object.assign(wrap.style, {
      width: `${w}px`,
      height: isVertical ? `${h}px` : 'auto',
      verticalAlign: 'bottom',
    })

    const inner = document.createElement('span')
    inner.className = `inline-block will-change-transform origin-left transform-gpu ${
      isVertical ? 'whitespace-normal' : 'whitespace-nowrap'}`

    parent.insertBefore(wrap, ch)
    wrap.appendChild(inner)

    const charClass = `text-left ${isVertical ? 'block' : 'inline-block'}`
    const firstOrig = ch.cloneNode(true) as HTMLElement
    firstOrig.className = charClass
    Object.assign(firstOrig.style, { width: `${w}px`, fontFamily: computedFont })

    ch.setAttribute('data-orig', '1')
    ch.className = charClass
    Object.assign(ch.style, { width: `${w}px`, fontFamily: computedFont })

    inner.appendChild(firstOrig)
    for (let k = 0; k < rolls; k++) {
      const c = ch.cloneNode(true) as HTMLElement
      if (props.scrambleCharset)
        c.textContent = rand(props.scrambleCharset)
      c.className = charClass
      Object.assign(c.style, { width: `${w}px`, fontFamily: computedFont })
      inner.appendChild(c)
    }
    inner.appendChild(ch)

    const steps = rolls + 1
    let startX = 0
    let finalX = 0
    let startY = 0
    let finalY = 0

    if (props.shuffleDirection === 'right')
      startX = -steps * w
    else if (props.shuffleDirection === 'left')
      finalX = -steps * w
    else if (props.shuffleDirection === 'down')
      startY = -steps * h
    else if (props.shuffleDirection === 'up')
      finalY = -steps * h

    // right / down 是「從外面滑進來」，真正的字要先排到最前面才會停在正確位置
    if (props.shuffleDirection === 'right' || props.shuffleDirection === 'down') {
      const firstCopy = inner.firstElementChild
      const real = inner.lastElementChild
      if (real)
        inner.insertBefore(real, inner.firstChild)
      if (firstCopy)
        inner.appendChild(firstCopy)
    }

    if (isVertical) {
      gsap.set(inner, { x: 0, y: startY, force3D: true })
      inner.setAttribute('data-start-y', String(startY))
      inner.setAttribute('data-final-y', String(finalY))
    }
    else {
      gsap.set(inner, { x: startX, y: 0, force3D: true })
      inner.setAttribute('data-start-x', String(startX))
      inner.setAttribute('data-final-x', String(finalX))
    }

    if (props.colorFrom)
      inner.style.color = props.colorFrom

    wrappers.push(wrap)
  })
}

function play() {
  const strips = getInners()
  if (!strips.length)
    return

  playing = true
  const isVertical = props.shuffleDirection === 'up' || props.shuffleDirection === 'down'
  const axis = isVertical ? 'y' : 'x'
  const startAttr = isVertical ? 'data-start-y' : 'data-start-x'

  tl = gsap.timeline({
    smoothChildTiming: true,
    repeat: props.loop ? -1 : 0,
    repeatDelay: props.loop ? props.loopDelay : 0,
    onRepeat: () => {
      if (props.scrambleCharset)
        randomizeScrambles()
      gsap.set(strips, {
        [axis]: (_i: number, t: HTMLElement) => Number.parseFloat(t.getAttribute(startAttr) || '0'),
      })
      emit('shuffleComplete')
    },
    onComplete: () => {
      playing = false
      if (props.loop)
        return
      cleanupToStill()
      if (props.colorTo)
        gsap.set(strips, { color: props.colorTo })
      emit('shuffleComplete')
      armHover()
    },
  })

  function addTween(targets: HTMLElement[], at: number) {
    tl!.to(targets, {
      [axis]: (_i: number, t: HTMLElement) =>
        Number.parseFloat(t.getAttribute(isVertical ? 'data-final-y' : 'data-final-x') || '0'),
      duration: props.duration,
      ease: props.ease,
      force3D: true,
      stagger: props.animationMode === 'evenodd' ? props.stagger : 0,
    }, at)

    if (props.colorFrom && props.colorTo)
      tl!.to(targets, { color: props.colorTo, duration: props.duration, ease: props.ease }, at)
  }

  if (props.animationMode === 'evenodd') {
    const odd = strips.filter((_el, i) => i % 2 === 1)
    const even = strips.filter((_el, i) => i % 2 === 0)
    // 奇數條先跑，偶數條在它們跑到七成時接上，整排字才有波浪感
    const oddTotal = props.duration + Math.max(0, odd.length - 1) * props.stagger
    if (odd.length)
      addTween(odd, 0)
    if (even.length)
      addTween(even, odd.length ? oddTotal * 0.7 : 0)
  }
  else {
    strips.forEach((strip) => {
      addTween([strip], Math.random() * props.maxDelay)
    })
  }
}

function armHover() {
  if (!props.triggerOnHover || !elRef.value)
    return
  removeHover()
  hoverHandler = () => {
    if (playing)
      return
    build()
    if (props.scrambleCharset)
      randomizeScrambles()
    play()
  }
  elRef.value.addEventListener('mouseenter', hoverHandler)
}

function create() {
  build()
  if (props.scrambleCharset)
    randomizeScrambles()
  play()
  armHover()
  ready.value = true
}

function initScrollTrigger() {
  if (!elRef.value)
    return

  // 偏好減少動態時不跑動畫，但文字必須照常顯示——
  // 原版在這裡直接 return，而可見性綁在 ready 上，字會整個不見
  if (props.respectReducedMotion && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    ready.value = true
    emit('shuffleComplete')
    return
  }

  scrollTrigger = ScrollTrigger.create({
    trigger: elRef.value,
    start: scrollTriggerStart.value,
    once: props.triggerOnce,
    onEnter: create,
  })
}

function destroyScrollTrigger() {
  scrollTrigger?.kill()
  scrollTrigger = null
  removeHover()
  teardown()
  ready.value = false
}

onMounted(() => {
  // 等字體載完再量字寬，否則字條寬度會用 fallback 字體算，換字體後就對不齊
  if ('fonts' in document) {
    if (document.fonts.status === 'loaded')
      fontsLoaded.value = true
    else
      document.fonts.ready.then(() => (fontsLoaded.value = true))
  }
  else {
    fontsLoaded.value = true
  }
})

watch(fontsLoaded, (loaded) => {
  if (loaded)
    initScrollTrigger()
})

watch(
  () => [props.text, props.shuffleDirection, props.shuffleTimes, props.animationMode, props.loop, props.scrambleCharset],
  () => {
    if (!fontsLoaded.value)
      return
    destroyScrollTrigger()
    initScrollTrigger()
  },
)

onBeforeUnmount(destroyScrollTrigger)
</script>

<template>
  <!-- 字級、大小寫、字體都由使用端給，元件不預設 -->
  <component
    :is="tag"
    ref="elRef"
    class="inline-block break-words whitespace-normal will-change-transform"
    :class="ready ? 'visible' : 'invisible'"
  >
    {{ text }}
  </component>
</template>

<script setup lang="ts">
/**
 * 取代原生游標的準星：平常緩慢自轉，指到目標元素時四個角會張開框住它。
 *
 * 機制取自 Vue Bits 的 TargetCursor：一個 fixed 的零尺寸容器跟著滑鼠跑，
 * 內含中心點與四個角；hover 到 targetSelector 命中的元素時停止自轉、
 * 用 gsap.ticker 把四角逐幀補間到目標的四個角落。
 *
 * 依本專案規範改寫的三處：
 * - 配色改吃 currentColor：原版四角與圓點寫死 border-white／bg-white，
 *   本專案 colorMode 預設是 light，白底上整個游標會消失
 * - reduced-motion 不自轉：自轉是 gsap timeline，繞得過 main.css 的 CSS guard
 *   （creative-direction §4 硬原則 1）。吸附仍在，只是不轉
 * - gsap timeline 與 DOM 參照不放 ref：Vue 的深層代理會包住 timeline 的內部狀態，
 *   這些值也從來不需要響應式
 */

import { gsap } from 'gsap'

interface Props {
  /** 會觸發吸附的元素選擇器 */
  targetSelector?: string
  /** 自轉一圈的秒數 */
  spinDuration?: number
  /** 是否隱藏原生游標 */
  hideDefaultCursor?: boolean
  /** 吸附到目標的過渡秒數 */
  hoverDuration?: number
  /** 吸附狀態下四角是否跟著指標微幅移動 */
  parallaxOn?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  targetSelector: '.cursor-target',
  spinDuration: 2,
  hideDefaultCursor: true,
  hoverDuration: 0.2,
  parallaxOn: true,
})

const BORDER_WIDTH = 3
const CORNER_SIZE = 12
const MOBILE_UA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/

const cursorRef = useTemplateRef<HTMLDivElement>('cursorRef')
const dotRef = useTemplateRef<HTMLDivElement>('dotRef')

// 觸控裝置沒有游標可取代，整個元件不掛
const isMobile = computed(() => {
  if (typeof window === 'undefined')
    return false
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
  const isSmall = window.innerWidth <= 768
  const ua = (navigator.userAgent || navigator.vendor).toLowerCase()
  return (hasTouch && isSmall) || MOBILE_UA.test(ua)
})

let spinTl: gsap.core.Timeline | null = null
let corners: HTMLDivElement[] = []
let cornerTargets: { x: number, y: number }[] | null = null
let tickerFn: (() => void) | null = null
let cleanupFn: (() => void) | null = null

/** 吸附程度 0→1，由 gsap 補間，ticker 每幀讀它決定四角走多少 */
const strength = { current: 0 }

function setup() {
  const cursor = cursorRef.value
  if (isMobile.value || !cursor)
    return

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  const originalCursor = document.body.style.cursor
  if (props.hideDefaultCursor)
    document.body.style.cursor = 'none'

  corners = Array.from(cursor.querySelectorAll<HTMLDivElement>('.target-cursor-corner'))

  let activeTarget: Element | null = null
  let currentLeaveHandler: (() => void) | null = null
  let resumeTimeout: ReturnType<typeof setTimeout> | null = null

  gsap.set(cursor, {
    xPercent: -50,
    yPercent: -50,
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  })

  // 減少動態時不自轉；spinTl 留 null，後面所有 ?. 呼叫自然跳過
  function createSpinTimeline() {
    spinTl?.kill()
    spinTl = motionQuery.matches
      ? null
      : gsap.timeline({ repeat: -1 }).to(cursor, { rotation: '+=360', duration: props.spinDuration, ease: 'none' })
  }
  createSpinTimeline()

  tickerFn = () => {
    if (!cornerTargets || strength.current === 0)
      return
    const cursorX = gsap.getProperty(cursor, 'x') as number
    const cursorY = gsap.getProperty(cursor, 'y') as number

    corners.forEach((corner, i) => {
      const currentX = gsap.getProperty(corner, 'x') as number
      const currentY = gsap.getProperty(corner, 'y') as number
      const targetX = cornerTargets![i]!.x - cursorX
      const targetY = cornerTargets![i]!.y - cursorY
      const duration = strength.current >= 0.99 ? (props.parallaxOn ? 0.2 : 0) : 0.05

      gsap.to(corner, {
        x: currentX + (targetX - currentX) * strength.current,
        y: currentY + (targetY - currentY) * strength.current,
        duration,
        ease: duration === 0 ? 'none' : 'power1.out',
        overwrite: 'auto',
      })
    })
  }

  function moveHandler(e: MouseEvent) {
    gsap.to(cursor, { x: e.clientX, y: e.clientY, duration: 0.1, ease: 'power3.out' })
  }

  // 捲動時目標可能已經滑走，指標卻沒動過——補一次離開判定
  function scrollHandler() {
    if (!activeTarget)
      return
    const x = gsap.getProperty(cursor, 'x') as number
    const y = gsap.getProperty(cursor, 'y') as number
    const under = document.elementFromPoint(x, y)
    const stillOver = under && (under === activeTarget || under.closest(props.targetSelector) === activeTarget)
    if (!stillOver)
      currentLeaveHandler?.()
  }

  function mouseDownHandler() {
    if (dotRef.value)
      gsap.to(dotRef.value, { scale: 0.7, duration: 0.3 })
    gsap.to(cursor, { scale: 0.9, duration: 0.2 })
  }

  function mouseUpHandler() {
    if (dotRef.value)
      gsap.to(dotRef.value, { scale: 1, duration: 0.3 })
    gsap.to(cursor, { scale: 1, duration: 0.2 })
  }

  function enterHandler(e: MouseEvent) {
    // 從事件目標往上找最近的可吸附祖先
    let current: Element | null = e.target as Element
    let target: Element | null = null
    while (current && current !== document.body) {
      if (current.matches(props.targetSelector)) {
        target = current
        break
      }
      current = current.parentElement
    }

    if (!target || activeTarget === target)
      return
    if (activeTarget && currentLeaveHandler) {
      activeTarget.removeEventListener('mouseleave', currentLeaveHandler)
      currentLeaveHandler = null
    }
    if (resumeTimeout) {
      clearTimeout(resumeTimeout)
      resumeTimeout = null
    }

    activeTarget = target
    corners.forEach(corner => gsap.killTweensOf(corner))
    gsap.killTweensOf(cursor, 'rotation')
    spinTl?.pause()
    gsap.set(cursor, { rotation: 0 })

    const rect = target.getBoundingClientRect()
    const cursorX = gsap.getProperty(cursor, 'x') as number
    const cursorY = gsap.getProperty(cursor, 'y') as number
    cornerTargets = [
      { x: rect.left - BORDER_WIDTH, y: rect.top - BORDER_WIDTH },
      { x: rect.right + BORDER_WIDTH - CORNER_SIZE, y: rect.top - BORDER_WIDTH },
      { x: rect.right + BORDER_WIDTH - CORNER_SIZE, y: rect.bottom + BORDER_WIDTH - CORNER_SIZE },
      { x: rect.left - BORDER_WIDTH, y: rect.bottom + BORDER_WIDTH - CORNER_SIZE },
    ]

    gsap.ticker.add(tickerFn!)
    gsap.to(strength, { current: 1, duration: props.hoverDuration, ease: 'power2.out' })
    corners.forEach((corner, i) => {
      gsap.to(corner, {
        x: cornerTargets![i]!.x - cursorX,
        y: cornerTargets![i]!.y - cursorY,
        duration: 0.2,
        ease: 'power2.out',
      })
    })

    function leaveHandler() {
      gsap.ticker.remove(tickerFn!)
      cornerTargets = null
      gsap.set(strength, { current: 0, overwrite: true })
      activeTarget = null

      // 四角收回原本圍著中心點的位置
      gsap.killTweensOf(corners)
      const home = [
        { x: -CORNER_SIZE * 1.5, y: -CORNER_SIZE * 1.5 },
        { x: CORNER_SIZE * 0.5, y: -CORNER_SIZE * 1.5 },
        { x: CORNER_SIZE * 0.5, y: CORNER_SIZE * 0.5 },
        { x: -CORNER_SIZE * 1.5, y: CORNER_SIZE * 0.5 },
      ]
      const tl = gsap.timeline()
      corners.forEach((corner, i) => {
        tl.to(corner, { x: home[i]!.x, y: home[i]!.y, duration: 0.3, ease: 'power3.out' }, 0)
      })

      // 從當前角度轉完剩下的一圈再交還給無限迴圈，避免恢復自轉時角度跳一下
      resumeTimeout = setTimeout(() => {
        if (!activeTarget && spinTl) {
          const rotation = (gsap.getProperty(cursor, 'rotation') as number) % 360
          spinTl.kill()
          spinTl = gsap.timeline({ repeat: -1 }).to(cursor, {
            rotation: '+=360',
            duration: props.spinDuration,
            ease: 'none',
          })
          gsap.to(cursor, {
            rotation: rotation + 360,
            duration: props.spinDuration * (1 - rotation / 360),
            ease: 'none',
            onComplete: () => spinTl?.restart(),
          })
        }
        resumeTimeout = null
      }, 50)

      target!.removeEventListener('mouseleave', leaveHandler)
      currentLeaveHandler = null
    }

    currentLeaveHandler = leaveHandler
    target.addEventListener('mouseleave', leaveHandler)
  }

  window.addEventListener('mousemove', moveHandler)
  window.addEventListener('mouseover', enterHandler)
  window.addEventListener('scroll', scrollHandler, { passive: true })
  window.addEventListener('mousedown', mouseDownHandler)
  window.addEventListener('mouseup', mouseUpHandler)
  motionQuery.addEventListener('change', createSpinTimeline)

  cleanupFn = () => {
    if (tickerFn)
      gsap.ticker.remove(tickerFn)
    window.removeEventListener('mousemove', moveHandler)
    window.removeEventListener('mouseover', enterHandler)
    window.removeEventListener('scroll', scrollHandler)
    window.removeEventListener('mousedown', mouseDownHandler)
    window.removeEventListener('mouseup', mouseUpHandler)
    motionQuery.removeEventListener('change', createSpinTimeline)
    if (resumeTimeout)
      clearTimeout(resumeTimeout)
    if (activeTarget && currentLeaveHandler)
      activeTarget.removeEventListener('mouseleave', currentLeaveHandler)
    spinTl?.kill()
    spinTl = null
    cornerTargets = null
    strength.current = 0
    document.body.style.cursor = originalCursor
  }
}

onMounted(setup)

onBeforeUnmount(() => {
  cleanupFn?.()
  cleanupFn = null
})

watch(() => ({ ...props }), () => {
  cleanupFn?.()
  setup()
}, { deep: true })
</script>

<template>
  <!-- 四角與圓點都吃 currentColor，配色只需在這一層指定。
       試過 mix-blend-difference 自動反白，但 fixed + z-index 的堆疊脈絡下四角會整個消失 -->
  <div
    v-if="!isMobile"
    ref="cursorRef"
    class="pointer-events-none fixed top-0 left-0 z-[9999] size-0 text-neutral-900 will-change-transform dark:text-neutral-100"
  >
    <div ref="dotRef" class="absolute top-1/2 left-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" />
    <div class="target-cursor-corner absolute top-1/2 left-1/2 size-3 -translate-x-[150%] -translate-y-[150%] border-[3px] border-r-0 border-b-0 border-current" />
    <div class="target-cursor-corner absolute top-1/2 left-1/2 size-3 translate-x-1/2 -translate-y-[150%] border-[3px] border-b-0 border-l-0 border-current" />
    <div class="target-cursor-corner absolute top-1/2 left-1/2 size-3 translate-x-1/2 translate-y-1/2 border-[3px] border-t-0 border-l-0 border-current" />
    <div class="target-cursor-corner absolute top-1/2 left-1/2 size-3 -translate-x-[150%] translate-y-1/2 border-[3px] border-t-0 border-r-0 border-current" />
  </div>
</template>

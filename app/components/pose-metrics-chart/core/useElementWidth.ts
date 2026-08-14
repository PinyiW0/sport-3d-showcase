/**
 * 量元素的實際渲染寬度。
 *
 * 圖表的字級是 SVG user unit，會跟著 viewBox 一起縮放——960 寬的圖塞進 375px
 * 的手機時，13 單位的字實際只剩約 5px。要在窄畫面加大字級、減少刻度，就得知道
 * 真正被渲染成多寬，viewBox 本身看不出來。
 *
 * 只依賴 vue 與瀏覽器的 ResizeObserver，沒有 npm 依賴，整包搬走仍可用。
 * SSR 與不支援的環境回傳 0，呼叫端據此走預設值。
 */

import type { Ref } from 'vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'

export function useElementWidth(target: Ref<Element | null>): Ref<number> {
  const width = ref(0)
  let observer: ResizeObserver | undefined

  onMounted(() => {
    const element = target.value
    if (!element || typeof ResizeObserver === 'undefined')
      return
    observer = new ResizeObserver((entries) => {
      width.value = entries[0]?.contentRect.width ?? 0
    })
    observer.observe(element)
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = undefined
  })

  return width
}

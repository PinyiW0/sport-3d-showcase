import type { MaybeRefOrGetter, Ref } from 'vue'

// 事件的「上一筆／下一筆」：按鈕與鍵盤 ← → 共用。擊球點九宮格與球場圖用；
// 打擊姿態的 ← → 是逐幀，不用這支。
//
// 到頭就停、不繞回：按鈕到頭會變灰，看得出已經是第一筆或最後一筆；繞回去反而分不出是不是按過頭。

/** 焦點在會自己用到方向鍵的元件上時不攔：輸入框、選單、滑桿 */
const USES_ARROWS = 'input, textarea, select, [role="slider"], [role="combobox"], [role="listbox"], [contenteditable="true"]'

export function useBpeEventStepper(selected: Ref<number>, count: MaybeRefOrGetter<number>) {
  const canPrev = computed(() => selected.value > 0)
  const canNext = computed(() => selected.value < toValue(count) - 1)

  function prev() {
    if (canPrev.value)
      selected.value--
  }
  function next() {
    if (canNext.value)
      selected.value++
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
      return
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
      return
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest(USES_ARROWS))
      return
    event.preventDefault()
    if (event.key === 'ArrowLeft')
      prev()
    else
      next()
  }
  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

  return { canPrev, canNext, prev, next }
}

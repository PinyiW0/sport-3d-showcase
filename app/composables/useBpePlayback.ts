import type { Ref } from 'vue'
import type { BpeSwing } from '~/components/bpe-data/core/types'
import { advanceClock } from '~/components/batter-pose/core/playback'
import { frameAtTime } from '~/components/bpe-data/core/parseBpeResult'

// 打擊姿態 3D 骨架的播放時鐘：rAF 推進 + 逐幀操作，純數學（推進/循環/到底停）
// 委給 core/playback.ts 測試，這裡只管瀏覽器介面。125fps 高速攝影，1× 太快看不清，
// 預設 0.25×。

export const BPE_PLAYBACK_RATES = [0.1, 0.25, 0.5, 1] as const

export function useBpePlayback(swing: Ref<BpeSwing | null>) {
  const clockS = ref(0)
  const playing = ref(false)
  const rate = ref<number>(BPE_PLAYBACK_RATES[1])
  const loop = ref(true)

  const frame = computed(() => (swing.value ? frameAtTime(swing.value.frames, clockS.value) : 0))

  let rafHandle = 0
  let lastTick = 0

  function tick(now: number) {
    const current = swing.value
    if (playing.value && current) {
      const result = advanceClock({
        clockS: clockS.value,
        deltaS: (now - lastTick) / 1000,
        rate: rate.value,
        durationS: current.durationS,
        loop: loop.value,
      })
      clockS.value = result.clockS
      if (result.finished)
        playing.value = false
    }
    lastTick = now
    rafHandle = requestAnimationFrame(tick)
  }

  onMounted(() => {
    lastTick = performance.now()
    rafHandle = requestAnimationFrame(tick)
  })
  onBeforeUnmount(() => cancelAnimationFrame(rafHandle))

  /** 暫停並跳到指定幀（越界會夾在有效範圍內）；沒有動畫時不動作。 */
  function seek(target: number) {
    const current = swing.value
    if (!current || current.frames.length === 0)
      return
    playing.value = false
    const clamped = Math.min(Math.max(target, 0), current.frames.length - 1)
    clockS.value = current.frames[clamped]!.timeS
  }

  /** 暫停並前後移動 delta 幀（逐幀是 ±1，快速跳是 ±10）；越界夾在頭尾。 */
  function step(delta: number) {
    seek(frame.value + delta)
  }

  /** 跳至擊球並暫停；沒有擊球點時不動作（呼叫端應把按鈕設 disabled）。 */
  function jumpToContact() {
    const current = swing.value
    if (!current || current.contactFrame == null)
      return
    seek(current.contactFrame)
  }

  function toggle() {
    const current = swing.value
    if (!current)
      return
    // 關閉循環播到底時時鐘停在 durationS；不先歸零的話，下一個 tick 的 advanceClock
    // 會立刻回報「已播完」又把 playing 關掉，按播放看起來毫無反應
    if (!playing.value && clockS.value >= current.durationS)
      clockS.value = 0
    playing.value = !playing.value
  }

  // 載入與換事件：一律停在擊球幀（沒有擊球點就停在第 0 幀），不自動播放——先讓人看懂這一下
  // 在哪裡碰到球，再自己按播放。也順帶滿足規範的「減少動態效果偏好仍適用，不自動播放」。
  // immediate 讓第一次拿到資料時也套用同一套規則。
  watch(swing, (next) => {
    playing.value = false
    clockS.value = next && next.contactFrame != null ? next.frames[next.contactFrame]!.timeS : 0
  }, { immediate: true })

  return { frame, clockS, playing, rate, loop, toggle, step, seek, jumpToContact }
}

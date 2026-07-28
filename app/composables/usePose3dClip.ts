import type { PitchPose3d, RawPitchOutcome } from '~/components/pitch-pose/core/parsePitchOutcome'
import { parsePitchOutcome } from '~/components/pitch-pose/core/parsePitchOutcome'

// pose3d 樣本的讀取＋播放時鐘：pitch-pose 的骨架版與真人版共用。
// 250fps 高速攝影約 3 秒，用 rAF 時鐘驅動，預設 0.25× 慢速播放。

export const POSE3D_RATES = [0.05, 0.1, 0.25, 0.5, 1]

export function usePose3dClip() {
  const pitch = shallowRef<PitchPose3d | null>(null)
  const loadError = ref<string | null>(null)

  const clockMs = ref(0)
  const playing = ref(false)
  const rate = ref(0.25)

  let rafHandle = 0
  let lastTick = 0

  function tick(now: number) {
    const duration = pitch.value?.durationMs ?? 0
    if (playing.value && duration > 0)
      clockMs.value = (clockMs.value + (now - lastTick) * rate.value) % duration
    lastTick = now
    rafHandle = requestAnimationFrame(tick)
  }

  onMounted(async () => {
    lastTick = performance.now()
    rafHandle = requestAnimationFrame(tick)
    try {
      // client-side fetch：public/ 靜態檔在 dev SSR 的 nitro 內部 fetch 拿不到
      const raw = await $fetch<RawPitchOutcome>('/samples/pose3d/outcome.json')
      pitch.value = parsePitchOutcome(raw)
      playing.value = true
    }
    catch (error) {
      loadError.value = error instanceof Error ? error.message : String(error)
    }
  })

  onBeforeUnmount(() => cancelAnimationFrame(rafHandle))

  /** 跳到出手瞬間並暫停（沒有 release 資料時不動作）。 */
  function jumpToRelease() {
    if (pitch.value?.releaseMs != null) {
      clockMs.value = pitch.value.releaseMs
      playing.value = false
    }
  }

  return { pitch, loadError, clockMs, playing, rate, jumpToRelease }
}

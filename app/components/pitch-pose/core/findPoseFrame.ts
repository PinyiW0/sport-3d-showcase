/** 播放時鐘 → frame 查找的純邏輯（無 DOM 依賴，繪製在元件層）。 */

/** 超過這個間隔沒有骨架資料就視為資料空洞，不畫（避免骨架凍在畫面上）。 */
export const DEFAULT_MAX_GAP_MS = 250

/**
 * Binary search 找「最後一個 timestampMs <= timeMs」的 frame。
 * 在第一筆之前、或距離該 frame 超過 `maxGapMs`（資料空洞 / 播過尾端）
 * 時回傳 null → 呼叫端清空畫布即可。
 * 泛型：任何帶 timestampMs 的 frame 都適用。
 */
export function findPoseFrame<T extends { timestampMs: number }>(
  frames: readonly T[],
  timeMs: number,
  maxGapMs: number = DEFAULT_MAX_GAP_MS,
): T | null {
  if (frames.length === 0 || timeMs < frames[0]!.timestampMs)
    return null

  let lo = 0
  let hi = frames.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (frames[mid]!.timestampMs <= timeMs)
      lo = mid
    else
      hi = mid - 1
  }

  const frame = frames[lo]!
  return timeMs - frame.timestampMs > maxGapMs ? null : frame
}

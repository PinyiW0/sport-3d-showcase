/**
 * 播放時鐘推進（純函式，無 rAF、無 DOM）。
 * `useBpePlayback` 每個 rAF tick 呼叫本函式算出下一個時鐘值，本檔只管數學，
 * 不碰 requestAnimationFrame——這樣循環與到底停下的邏輯才能離開瀏覽器單獨測試。
 */
export interface AdvanceClockInput {
  /** 目前時鐘（秒）。 */
  clockS: number
  /** 這次 tick 經過的真實時間（秒）。 */
  deltaS: number
  /** 播放倍率。 */
  rate: number
  /** 這段動作的總長度（秒），等於 swing.durationS。 */
  durationS: number
  /** 播到底要不要繞回開頭。 */
  loop: boolean
}

export interface AdvanceClockResult {
  clockS: number
  /** true 表示這次推進播到底且未循環，呼叫端要把 playing 設回 false。 */
  finished: boolean
}

export function advanceClock(input: AdvanceClockInput): AdvanceClockResult {
  const { clockS, deltaS, rate, durationS, loop } = input
  if (durationS <= 0)
    return { clockS: 0, finished: false }

  const next = clockS + deltaS * rate
  if (next < durationS)
    return { clockS: next, finished: false }

  if (loop)
    return { clockS: next % durationS, finished: false }

  // 停在最後一幀：clockS 設成 durationS 即可，frameAtTime 對任何 ≥ 最後一幀
  // 時間的查詢都會飽和在最後一幀，不需要另外找最後一幀的精確 time_s。
  return { clockS: durationS, finished: true }
}

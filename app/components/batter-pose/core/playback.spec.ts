import { describe, expect, it } from 'vitest'
import { advanceClock } from './playback'

describe('advanceClock', () => {
  it('正常推進：時鐘加上 經過時間 × 倍率', () => {
    const result = advanceClock({ clockS: 1, deltaS: 0.5, rate: 2, durationS: 10, loop: true })
    expect(result).toEqual({ clockS: 2, finished: false })
  })

  it('循環開啟時播到底會取餘數繞回開頭附近', () => {
    const result = advanceClock({ clockS: 9, deltaS: 2, rate: 1, durationS: 10, loop: true })
    expect(result.clockS).toBeCloseTo(1)
    expect(result.finished).toBe(false)
  })

  it('循環關閉時播到底會停在最後（finished: true）', () => {
    const result = advanceClock({ clockS: 9, deltaS: 2, rate: 1, durationS: 10, loop: false })
    expect(result.clockS).toBe(10)
    expect(result.finished).toBe(true)
  })

  it('倍率會直接乘進經過時間，0.25× 只推進四分之一', () => {
    const result = advanceClock({ clockS: 0, deltaS: 1, rate: 0.25, durationS: 10, loop: true })
    expect(result.clockS).toBeCloseTo(0.25)
  })

  it('durationS 為 0（沒有動畫）時不推進，也不 finished', () => {
    const result = advanceClock({ clockS: 5, deltaS: 1, rate: 1, durationS: 0, loop: false })
    expect(result).toEqual({ clockS: 0, finished: false })
  })
})

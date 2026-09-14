import type { BpeFrame } from '../../bpe-data/core/types'
import { describe, expect, it } from 'vitest'
import { contactOffsetMs, formatContactOffset } from './contactOffset'

function frames(times: number[]): BpeFrame[] {
  return times.map(timeS => ({ timeS, joints: [], ball: null }))
}

describe('contactOffsetMs', () => {
  const swing = { frames: frames([0.864, 0.872, 0.88, 0.992, 1.072]), contactFrame: 3 }

  it('擊球前為負、擊球後為正，取整到毫秒（不帶浮點誤差）', () => {
    expect(contactOffsetMs(swing, 1)).toBe(-120)
    expect(contactOffsetMs(swing, 4)).toBe(80)
  })

  it('擊球幀本身是 0', () => {
    expect(contactOffsetMs(swing, 3)).toBe(0)
  })

  it('沒有擊球點或幀越界時回傳 null', () => {
    expect(contactOffsetMs({ ...swing, contactFrame: null }, 1)).toBeNull()
    expect(contactOffsetMs(swing, 99)).toBeNull()
  })
})

describe('formatContactOffset', () => {
  it('依前後寫成教練習慣的說法', () => {
    expect(formatContactOffset(-120)).toBe('距擊球 −120 ms')
    expect(formatContactOffset(0)).toBe('擊球 0 ms')
    expect(formatContactOffset(80)).toBe('擊球後 +80 ms')
  })
})

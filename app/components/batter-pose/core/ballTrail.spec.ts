import type { BpeFrame } from '../../bpe-data/core/types'
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseBpeResult } from '../../bpe-data/core/parseBpeResult'
import { BALL_TRAIL_LENGTH, sampleBallTrail } from './ballTrail'

/** 只需要 ball 欄位，其餘幀資料以 0 補；joints 長度與內容不影響拖尾取樣。 */
function frame(timeS: number, ball: BpeFrame['ball']): BpeFrame {
  return { timeS, joints: [], ball }
}

describe('sampleBallTrail', () => {
  it('永遠回傳 20 顆', () => {
    const frames = [frame(0, [0, 0, 0])]
    expect(sampleBallTrail(frames, 0)).toHaveLength(BALL_TRAIL_LENGTH)
  })

  it('可見與否等於對應幀的 ball 是否有效', () => {
    const frames = [frame(0, [1, 1, 1]), frame(0.008, null), frame(0.016, [3, 3, 3])]
    const samples = sampleBallTrail(frames, 2)
    // age 0 → frame 2（有值）、age 1 → frame 1（null）、age 2 → frame 0（有值）
    expect(samples[0]!.point).toEqual([3, 3, 3])
    expect(samples[1]!.point).toBeNull()
    expect(samples[2]!.point).toEqual([1, 1, 1])
  })

  it('負索引（目標幀往前不足 age 幀）視為缺值', () => {
    const frames = [frame(0, [1, 1, 1]), frame(0.008, [2, 2, 2])]
    const samples = sampleBallTrail(frames, 1)
    expect(samples[0]!.point).toEqual([2, 2, 2])
    expect(samples[1]!.point).toEqual([1, 1, 1])
    // age 2 對應 frame -1，不存在
    expect(samples[2]!.point).toBeNull()
  })

  it('不往更早的幀找補：中間缺值的那一齡球就是隱藏，不會跳去更舊的有效點', () => {
    const frames = [frame(0, [9, 9, 9]), frame(0.008, null), frame(0.016, [3, 3, 3])]
    const samples = sampleBallTrail(frames, 2)
    // age 1（frame 1）是 null，即使 age 更大的 frame 0 有值，age 1 那顆仍隱藏
    expect(samples[1]!.point).toBeNull()
  })

  it('越舊的球 scale 與 opacity 越小（單調遞減）', () => {
    const frames = Array.from({ length: BALL_TRAIL_LENGTH }, (_, i) => frame(i * 0.008, [i, i, i]))
    const samples = sampleBallTrail(frames, BALL_TRAIL_LENGTH - 1)
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]!.scale).toBeLessThan(samples[i - 1]!.scale)
      expect(samples[i]!.opacity).toBeLessThan(samples[i - 1]!.opacity)
    }
    // age 0：scale 1、opacity 1（最新、最大、不透明）
    expect(samples[0]!.scale).toBe(1)
    expect(samples[0]!.opacity).toBe(1)
    // age 19：scale 0.2、opacity 0.15（規範下限）
    expect(samples[19]!.scale).toBeCloseTo(0.2)
    expect(samples[19]!.opacity).toBeCloseTo(0.15)
  })
})

// 以下用真實樣本核對：事件 #13（130 幀球體）找得到某幀 20 顆全亮
const SAMPLE_PATH = 'public/samples/bpe/events/longtan_20260512_152951_715.json'

describe.skipIf(!existsSync(SAMPLE_PATH))('真實樣本（事件 #13）', () => {
  it('第 224 幀（最長連續球體區間的尾端）拖尾 20 顆全部可見', () => {
    const raw = JSON.parse(readFileSync(SAMPLE_PATH, 'utf8'))
    const outcome = parseBpeResult(raw)
    if (!outcome.ok)
      throw new Error('樣本應通過檢查關卡')
    const swing = outcome.result.swing!
    const samples = sampleBallTrail(swing.frames, 224)
    expect(samples.every(s => s.point !== null)).toBe(true)
  })
})

import type { BpeFrame } from '../../bpe-data/core/types'
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseBpeResult } from '../../bpe-data/core/parseBpeResult'
import { computeSwingStats } from './swingStats'

const NAMES = ['left_wrist', 'right_wrist', 'bat_knob', 'bat_head']

function frame(joints: BpeFrame['joints']): BpeFrame {
  return { timeS: 0, joints, ball: null }
}

describe('computeSwingStats', () => {
  it('整幀全缺才算骨架全缺幀', () => {
    const frames = [
      frame([null, null, null, null]),
      frame([[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]),
    ]
    expect(computeSwingStats(NAMES, frames).allMissingFrames).toBe(1)
  })

  it('人體齊全、球棒任一點缺才算球棒缺點幀', () => {
    const frames = [
      // 人體齊全，球棒一點缺
      frame([[0, 0, 0], [0, 0, 0], null, [0, 0, 0]]),
      // 人體齊全，球棒兩點都在
      frame([[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]),
      // 整幀全缺不算球棒缺點（已計入骨架全缺）
      frame([null, null, null, null]),
    ]
    const stats = computeSwingStats(NAMES, frames)
    expect(stats.batMissingFrames).toBe(1)
    expect(stats.allMissingFrames).toBe(1)
  })

  it('人體本身有缺（非全缺）時不計入球棒缺點幀', () => {
    const frames = [frame([null, [0, 0, 0], null, [0, 0, 0]])]
    expect(computeSwingStats(NAMES, frames).batMissingFrames).toBe(0)
  })
})

// 以下用交接報告的逐筆數字核對真實樣本
const SAMPLE_DIR = 'public/samples/bpe/events'

describe.skipIf(!existsSync(`${SAMPLE_DIR}/longtan_20260512_152809_185.json`))('真實樣本', () => {
  function loadSwing(eventId: string) {
    const raw = JSON.parse(readFileSync(`${SAMPLE_DIR}/${eventId}.json`, 'utf8'))
    const outcome = parseBpeResult(raw)
    if (!outcome.ok)
      throw new Error(`樣本 ${eventId} 應通過檢查關卡`)
    return outcome.result.swing!
  }

  it('事件 #1（longtan_20260512_152809_185）：骨架全缺 7 幀、球棒缺點 30 幀', () => {
    const swing = loadSwing('longtan_20260512_152809_185')
    expect(computeSwingStats(swing.jointNames, swing.frames)).toEqual({
      allMissingFrames: 7,
      batMissingFrames: 30,
    })
  })

  it('事件 #5（longtan_20260512_152858_574）：骨架全缺 0 幀、球棒缺點 0 幀', () => {
    const swing = loadSwing('longtan_20260512_152858_574')
    expect(computeSwingStats(swing.jointNames, swing.frames)).toEqual({
      allMissingFrames: 0,
      batMissingFrames: 0,
    })
  })
})

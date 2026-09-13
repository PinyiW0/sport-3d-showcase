import type { BpeFrame } from '../../bpe-data/core/types'
import { describe, expect, it } from 'vitest'
import { collectFramingPoints } from './swingFraming'

const NAMES = ['left_wrist', 'right_wrist', 'bat_knob', 'bat_head']

function frame(joints: BpeFrame['joints'], ball: BpeFrame['ball'] = null): BpeFrame {
  return { timeS: 0, joints, ball }
}

describe('collectFramingPoints', () => {
  it('全景收進所有幀的有效關節（含球棒）與有效球體座標', () => {
    const frames = [
      frame([[-10, 0, 20], [10, 5, 30], [0, 0, 100], null], [200, 300, 10]),
      frame([[0, -20, 5], null, null, null], null),
    ]
    expect(collectFramingPoints(frames, NAMES, 'overview')).toEqual([
      [-10, 0, 20],
      [10, 5, 30],
      [0, 0, 100],
      [200, 300, 10],
      [0, -20, 5],
    ])
  })

  it('快捷視角（側面、投手、俯視）取景的點跟全景一樣，含球', () => {
    const frames = [frame([[1, 2, 3], null, [0, 0, 100], null], [200, 300, 10])]
    const overview = collectFramingPoints(frames, NAMES, 'overview')
    for (const view of ['side', 'pitcher', 'top'] as const)
      expect(collectFramingPoints(frames, NAMES, view)).toEqual(overview)
  })

  it('打者特寫只收人體關節，不收球棒點也不收球', () => {
    const frames = [frame([[1, 2, 3], null, [0, 0, 100], [50, 50, 250]], [200, 300, 10])]
    expect(collectFramingPoints(frames, NAMES, 'batter')).toEqual([[1, 2, 3]])
  })

  it('打者特寫沒有任何人體關節時退回全景的點', () => {
    const frames = [frame([null, null, [0, 0, 100], null], [200, 300, 10])]
    expect(collectFramingPoints(frames, NAMES, 'batter')).toEqual([[0, 0, 100], [200, 300, 10]])
  })

  it('全缺時回傳 0～100 cm 方盒的兩個對角', () => {
    const frames = [frame([null, null, null, null]), frame([null, null, null, null])]
    expect(collectFramingPoints(frames, NAMES, 'overview')).toEqual([[0, 0, 0], [100, 100, 100]])
    expect(collectFramingPoints(frames, NAMES, 'batter')).toEqual([[0, 0, 0], [100, 100, 100]])
  })

  it('替代範圍每次回傳新陣列，呼叫端改了也不會污染下一次', () => {
    const frames = [frame([null, null, null, null])]
    const first = collectFramingPoints(frames, NAMES, 'overview')
    first[0]![0] = 999
    expect(collectFramingPoints(frames, NAMES, 'overview')[0]).toEqual([0, 0, 0])
  })
})

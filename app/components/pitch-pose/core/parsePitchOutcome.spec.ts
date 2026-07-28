import type { RawPitchOutcome } from './parsePitchOutcome'
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { findPoseFrame } from './findPoseFrame'
import { parseOutcomeTimestampMs, parsePitchOutcome } from './parsePitchOutcome'

/** 17 個 keypoint 的最小 pose_3d;可抽掉某個 id 或給非法座標(驗缺測處理)。 */
function makePose3d(x = 10, omitId?: number, brokenId?: number) {
  const entries = Array.from({ length: 17 }, (_, id) => {
    if (id === omitId)
      return null
    const position = id === brokenId ? { x: Number.NaN, y: 0, z: 0 } : { x, y: 1600 + id, z: 100 + id }
    return [String(id), { position }] as const
  }).filter(e => e !== null)
  return Object.fromEntries(entries)
}

const fixture: RawPitchOutcome = {
  pitch_id: 'p1',
  release: { frame_index: 1 },
  clip: {
    throwing_hand: 'THROWING_HAND_LEFT',
    frames: [
      {
        aligned: { timestamp: '20260624_152027.000000' },
        reconstruction: { timestamp: '20260624_152027.000500', pose_3d: makePose3d(10) },
      },
      {
        aligned: { timestamp: '20260624_152027.004000' },
        reconstruction: { timestamp: '20260624_152027.004500', pose_3d: makePose3d(20, 4, 5) },
      },
      {
        // 沒有 reconstruction → 跳過
        aligned: { timestamp: '20260624_152027.008000' },
      },
    ],
  },
}

describe('parseOutcomeTimestampMs', () => {
  it('parses the YYYYMMDD_HHMMSS.micro format with sub-ms precision', () => {
    const a = parseOutcomeTimestampMs('20260624_152027.597899')!
    const b = parseOutcomeTimestampMs('20260624_152027.597399')!
    expect(a - b).toBeCloseTo(0.5, 6)
  })

  it('returns null for malformed timestamps', () => {
    expect(parseOutcomeTimestampMs('not-a-timestamp')).toBeNull()
    expect(parseOutcomeTimestampMs('20260624152027.5')).toBeNull()
  })
})

describe('parsePitchOutcome', () => {
  const result = parsePitchOutcome(fixture)

  it('extracts pose_3d frames with timestamps relative to the first frame', () => {
    expect(result.frames.map(f => f.timestampMs)).toEqual([0, 4])
    expect(result.durationMs).toBe(4)
    expect(result.pitchId).toBe('p1')
    expect(result.throwingHand).toBe('THROWING_HAND_LEFT')
  })

  it('keeps 17 slots per frame, ordered by COCO id', () => {
    const frame = result.frames[0]!
    expect(frame.points).toHaveLength(17)
    // id 3 的合成座標 y = 1600 + id
    expect(frame.points[3]).toEqual([10, 1603, 103])
  })

  it('marks missing or non-finite keypoints as null', () => {
    const frame = result.frames[1]!
    expect(frame.points[4]).toBeNull() // 缺 id
    expect(frame.points[5]).toBeNull() // NaN 座標
    expect(frame.points[6]).toEqual([20, 1606, 106])
  })

  it('resolves releaseMs from release.frame_index', () => {
    expect(result.releaseMs).toBe(4)
  })

  it('works with the generic findPoseFrame for playback lookup', () => {
    expect(findPoseFrame(result.frames, 3.9)?.timestampMs).toBe(0)
    expect(findPoseFrame(result.frames, 4)?.timestampMs).toBe(4)
  })
})

// 真實資料驗收:pitch3d/outcome.json 在的時候才跑
const OUTCOME_PATH = 'public/samples/pose3d/outcome.json'

describe.skipIf(!existsSync(OUTCOME_PATH))('parsePitchOutcome × real outcome.json', () => {
  const raw = JSON.parse(readFileSync(OUTCOME_PATH, 'utf8')) as RawPitchOutcome
  const result = parsePitchOutcome(raw)

  it('covers the full ~3s clip at ~250fps with ascending timestamps', () => {
    expect(result.frames.length).toBeGreaterThan(700)
    expect(result.durationMs).toBeGreaterThan(2900)
    expect(result.durationMs).toBeLessThan(3100)
    for (let i = 1; i < result.frames.length; i++)
      expect(result.frames[i]!.timestampMs).toBeGreaterThan(result.frames[i - 1]!.timestampMs)
  })

  it('keeps 17 slots everywhere with plausible cm-scale coordinates', () => {
    for (const frame of result.frames) {
      expect(frame.points).toHaveLength(17)
      for (const point of frame.points) {
        if (!point)
          continue
        expect(point[2]).toBeGreaterThan(-50) // 高度不會鑽到地下
        expect(point[2]).toBeLessThan(300) // 也不會飛到天上
      }
    }
  })

  it('resolves the release moment inside the clip', () => {
    expect(result.releaseMs).toBeGreaterThan(0)
    expect(result.releaseMs!).toBeLessThan(result.durationMs)
  })
})

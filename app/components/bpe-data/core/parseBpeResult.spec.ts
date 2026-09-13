import type { RawBpeEnvelope, RawBpeIndexEntry } from './types'
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { frameAtTime, isPoint3, nearestFrame, parseBpeResult, pickMetrics } from './parseBpeResult'
import { BPE_METRICS, CONTACT_METRIC_KEYS, FLIGHT_METRIC_KEYS, SWING_METRIC_KEYS } from './types'

/** 3 個關節（含球棒兩點）、3 幀、間隔 8ms 的最小資料 */
function makeRaw(overrides: Partial<RawBpeEnvelope['payload'] & object> = {}, envelope: Partial<RawBpeEnvelope> = {}): RawBpeEnvelope {
  return {
    schema_version: '2.0.0',
    payload_schema_version: '2.1.0',
    module: 'bpe',
    pitch_id: 'test-pitch',
    status: 'success',
    error: null,
    payload: {
      outcome: 'hit',
      timestamps: { detected_at: '2026-05-12T15:28:05.373386' },
      skeleton: {
        joint_names: ['left_wrist', 'bat_knob', 'bat_head'],
        bones: [[0, 1], [1, 2]],
      },
      animation: {
        sample_period_s: 0.008,
        frame_count: 3,
        frames: [
          { time_s: 0, joints_cm: [[0, 0, 100], [1, 1, 101], [2, 2, 102]], ball_cm: null },
          { time_s: 0.008, joints_cm: [[0, 0, 100], null, [2, 2, 102]], ball_cm: [10, 20, 30] },
          { time_s: 0.016, joints_cm: [null, null, null], ball_cm: [11, 21, 31] },
        ],
      },
      contact: { time_s: 0.009, point_cm: [0.5, 80, 49] },
      predicted_landing_point_m: [-6.9, 1.9, 0],
      metrics: {
        exit_velocity: { value: 33.4, unit: 'km/h' },
        launch_angle: { value: null, unit: 'degree' },
        bat_speed: { value: 67.538, unit: 'km/h' },
      },
      ...overrides,
    },
    ...envelope,
  }
}

function parseOk(raw: unknown) {
  const outcome = parseBpeResult(raw)
  if (!outcome.ok)
    throw new Error('預期通過檢查關卡')
  return outcome.result
}

describe('檢查關卡', () => {
  it('status 不是 success 時不進入繪製流程，並帶出 status 與 error', () => {
    const outcome = parseBpeResult(makeRaw({}, { status: 'failed', error: { code: 'E_TRACK', message: '追蹤失敗' } }))
    expect(outcome).toEqual({ ok: false, status: 'failed', errorText: '{"code":"E_TRACK","message":"追蹤失敗"}' })
  })

  it('status 是 success 但 payload 為 null，同樣四項都不畫', () => {
    const outcome = parseBpeResult({ ...makeRaw(), payload: null })
    expect(outcome.ok).toBe(false)
  })

  it('error 是字串時原樣帶出、缺少時為 null', () => {
    expect(parseBpeResult(makeRaw({}, { status: 'error', error: 'timeout' }))).toMatchObject({ errorText: 'timeout' })
    expect(parseBpeResult(makeRaw({}, { status: 'error', error: undefined }))).toMatchObject({ errorText: null })
  })

  it('根本不是物件（壞 JSON、陣列）時不拋錯，回傳未通過', () => {
    for (const bad of [null, 'text', 42, []])
      expect(parseBpeResult(bad).ok).toBe(false)
  })
})

describe('3D 揮棒動畫', () => {
  it('骨頭依兩端點名稱分成人體與球棒，不寫死索引', () => {
    const swing = parseOk(makeRaw()).swing!
    expect(swing.bones).toEqual([
      { from: 0, to: 1, kind: 'body' },
      { from: 1, to: 2, kind: 'bat' },
    ])
  })

  it('單一關節缺值只影響那一格；整幀缺值時每格都是 null，不沿用上一幀', () => {
    const { frames } = parseOk(makeRaw()).swing!
    expect(frames[1]!.joints).toEqual([[0, 0, 100], null, [2, 2, 102]])
    expect(frames[2]!.joints).toEqual([null, null, null])
  })

  it('球與關節各自處理缺值：骨架全缺的幀照樣有球', () => {
    const swing = parseOk(makeRaw()).swing!
    expect(swing.frames.map(f => f.ball)).toEqual([null, [10, 20, 30], [11, 21, 31]])
    expect(swing.ballFrameCount).toBe(2)
    expect(swing.hasBallField).toBe(true)
  })

  it('2.0.0 舊檔的幀沒有 ball_cm 欄位：不畫球，骨架照播', () => {
    const raw = makeRaw()
    for (const frame of raw.payload!.animation!.frames!)
      delete frame.ball_cm
    const swing = parseOk(raw).swing!
    expect(swing.hasBallField).toBe(false)
    expect(swing.ballFrameCount).toBe(0)
    expect(swing.frames[0]!.joints[0]).toEqual([0, 0, 100])
  })

  it('非有限數值或長度不對的座標一律視為缺值', () => {
    const raw = makeRaw()
    raw.payload!.animation!.frames![0]!.joints_cm = [[0, 0, Number.NaN], [1, 1] as never, ['1', 1, 1] as never]
    raw.payload!.animation!.frames![0]!.ball_cm = [Infinity, 0, 0]
    const frame = parseOk(raw).swing!.frames[0]!
    expect(frame.joints).toEqual([null, null, null])
    expect(frame.ball).toBeNull()
  })

  it('skeleton 或 animation 任一為 null 就不畫動畫，其餘三項不受影響', () => {
    for (const overrides of [{ skeleton: null }, { animation: null }]) {
      const result = parseOk(makeRaw(overrides))
      expect(result.swing).toBeNull()
      expect(result.contact).not.toBeNull()
      expect(result.landingM).not.toBeNull()
    }
  })

  it('擊球幀取 time_s 最接近 contact.time_s 的那一幀', () => {
    expect(parseOk(makeRaw()).swing!.contactFrame).toBe(1)
  })

  it('沒有擊球點時擊球幀為 null（跳至擊球要停用）', () => {
    expect(parseOk(makeRaw({ contact: null })).swing!.contactFrame).toBeNull()
  })

  it('總長 = 最後一幀的 time_s 再加一個幀間隔', () => {
    expect(parseOk(makeRaw()).swing!.durationS).toBeCloseTo(0.024)
  })
})

describe('擊球點與落點', () => {
  it('contact 存在但 point_cm 缺少時不畫擊球點', () => {
    expect(parseOk(makeRaw({ contact: { time_s: 0.5 } })).contact).toBeNull()
  })

  it('沒有擊球點不代表沒有落點——兩項各自判斷', () => {
    const result = parseOk(makeRaw({ contact: null }))
    expect(result.contact).toBeNull()
    expect(result.landingM).toEqual([-6.9, 1.9, 0])
  })

  it('落點為 null 時不畫', () => {
    expect(parseOk(makeRaw({ predicted_landing_point_m: null })).landingM).toBeNull()
  })
})

describe('13 項數值', () => {
  it('value 為 null 或整個 metric 缺少的項目不出現，其餘依規範順序排列', () => {
    const { metrics } = parseOk(makeRaw())
    expect(metrics.map(m => m.key)).toEqual(['exit_velocity', 'bat_speed'])
    expect(metrics[0]).toEqual({ key: 'exit_velocity', label: '擊球初速', value: 33.4, unit: 'km/h' })
  })

  it('unit 缺少時不拿規範表的單位補上，只留空字串', () => {
    const { metrics } = parseOk(makeRaw({ metrics: { distance: { value: 7.1 } } }))
    expect(metrics).toEqual([{ key: 'distance', label: '預測飛行距離', value: 7.1, unit: '' }])
  })

  it('metrics 整個是 null 時回傳空陣列', () => {
    expect(parseOk(makeRaw({ metrics: null })).metrics).toEqual([])
  })

  it('三個模組的分組合起來剛好是 13 項、互不重複', () => {
    const all = [...SWING_METRIC_KEYS, ...CONTACT_METRIC_KEYS, ...FLIGHT_METRIC_KEYS]
    expect(new Set(all).size).toBe(13)
    expect([...all].sort()).toEqual(BPE_METRICS.map(m => m.key).sort())
  })

  it('pickMetrics 依給定順序挑出有值的項目', () => {
    const { metrics } = parseOk(makeRaw())
    expect(pickMetrics(metrics, ['bat_speed', 'launch_angle', 'exit_velocity']).map(m => m.key))
      .toEqual(['bat_speed', 'exit_velocity'])
  })
})

describe('播放時鐘查幀', () => {
  const frames = parseOk(makeRaw()).swing!.frames

  it('取最後一個 time_s ≤ 時鐘的幀', () => {
    expect(frameAtTime(frames, 0)).toBe(0)
    expect(frameAtTime(frames, 0.0079)).toBe(0)
    expect(frameAtTime(frames, 0.008)).toBe(1)
    expect(frameAtTime(frames, 0.02)).toBe(2)
  })

  it('超出兩端時夾在第一幀與最後一幀', () => {
    expect(frameAtTime(frames, -1)).toBe(0)
    expect(frameAtTime(frames, 99)).toBe(2)
  })

  it('nearestFrame 在空陣列時回傳 null', () => {
    expect(nearestFrame([], 0)).toBeNull()
  })

  it('isPoint3 只接受恰好三個有限數字', () => {
    expect(isPoint3([1, 2, 3])).toBe(true)
    expect(isPoint3([1, 2])).toBe(false)
    expect(isPoint3(null)).toBe(false)
  })
})

// 以下用真實樣本核對交接報告第 4 節的逐筆數字（報告是程式逐筆讀 JSON 得到的）
const SAMPLE_DIR = 'public/samples/bpe'

describe.skipIf(!existsSync(`${SAMPLE_DIR}/index.json`))('真實樣本（23 筆龍潭實測）', () => {
  const index = JSON.parse(readFileSync(`${SAMPLE_DIR}/index.json`, 'utf8')) as RawBpeIndexEntry[]
  const results = index.map(entry => parseOk(JSON.parse(readFileSync(`${SAMPLE_DIR}/events/${entry.event_id}.json`, 'utf8'))))

  it('23 筆全部通過檢查關卡，且都有 3D 動畫', () => {
    expect(results).toHaveLength(23)
    expect(results.every(r => r.swing !== null)).toBe(true)
  })

  it('四類分布：hit 完整 14、hit 無擊球點 1、uncertain 部分 2、uncertain 全缺 6', () => {
    const classify = (r: typeof results[number]) => `${r.outcome}/${r.contact ? 'c' : '-'}/${r.landingM ? 'l' : '-'}/${r.metrics.length}`
    const counts: Record<string, number> = {}
    for (const r of results)
      counts[classify(r)] = (counts[classify(r)] ?? 0) + 1
    expect(counts).toEqual({ 'hit/c/l/13': 14, 'hit/-/l/11': 1, 'uncertain/-/l/5': 2, 'uncertain/-/-/0': 6 })
  })

  it('#20 是 hit 但無擊球點、有落點，缺的正好是擊球點左右與高度', () => {
    const r = results[20]!
    expect(r.contact).toBeNull()
    expect(r.landingM).not.toBeNull()
    const keys = r.metrics.map(m => m.key)
    expect(keys).not.toContain('contact_side')
    expect(keys).not.toContain('contact_height')
  })

  it('有擊球點的 14 筆，contact_side／contact_height 與 point_cm 的 x／z 完全相等', () => {
    const withContact = results.filter(r => r.contact)
    expect(withContact).toHaveLength(14)
    for (const r of withContact) {
      const [side, height] = pickMetrics(r.metrics, CONTACT_METRIC_KEYS)
      expect(side!.value).toBe(r.contact!.pointCm[0])
      expect(height!.value).toBe(r.contact!.pointCm[2])
    }
  })

  it('球體幀數與 index.json 的 ball_frames 一致（#13 有 130 幀，拖尾可湊滿 20 顆）', () => {
    index.forEach((entry, i) => expect(results[i]!.swing!.ballFrameCount).toBe(entry.ball_frames))
    expect(results[13]!.swing!.ballFrameCount).toBe(130)
  })

  it('幀間隔全部是 0.008 秒，每筆 287–288 幀', () => {
    for (const r of results) {
      expect(r.swing!.samplePeriodS).toBe(0.008)
      expect(r.swing!.frames.length).toBeGreaterThanOrEqual(287)
      expect(r.swing!.frames.length).toBeLessThanOrEqual(288)
    }
  })

  it('人體關節不會單獨缺，只有球棒兩點會', () => {
    for (const r of results) {
      const { jointNames, frames } = r.swing!
      const body = jointNames.map((name, j) => (name.startsWith('bat_') ? -1 : j)).filter(j => j >= 0)
      for (const frame of frames) {
        const missing = body.filter(j => frame.joints[j] === null).length
        expect(missing === 0 || missing === body.length).toBe(true)
      }
    }
  })

  it('#11 的落點在本壘後方 59 m、#7 的擊球點高 168 cm（兩個要照畫的異常值）', () => {
    expect(results[11]!.landingM![1]).toBeCloseTo(-59.458)
    expect(results[7]!.contact!.pointCm[2]).toBeCloseTo(167.997)
  })
})

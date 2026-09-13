import { describe, expect, it } from 'vitest'
import { eventLabel, formatExitDirectionBrief, formatMetric, formatMetricBrief, formatNumber, formatUnit, outcomeLabel, parseEventId } from './format'

describe('數值格式化', () => {
  it('原樣顯示、不四捨五入：小數位數不固定是資料本身的樣子', () => {
    expect(formatNumber(67.538)).toBe('67.538')
    expect(formatNumber(140.3)).toBe('140.3')
  })

  it('負號換成 Unicode 減號', () => {
    expect(formatNumber(-28.5)).toBe('−28.5')
  })

  it('degree 顯示為度數符號並緊貼數字，其餘單位前留空白', () => {
    expect(formatUnit('degree')).toBe('°')
    expect(formatMetric(-8.58, 'degree')).toBe('−8.58°')
    expect(formatMetric(33.4, 'km/h')).toBe('33.4 km/h')
  })

  it('表上沒有的單位原樣顯示，空字串時只顯示數字', () => {
    expect(formatMetric(1, 'rpm')).toBe('1 rpm')
    expect(formatMetric(1, '')).toBe('1')
  })
})

describe('精簡寫法', () => {
  it('四捨五入到一位小數，整數也補上 .0，字寬才不會跳', () => {
    expect(formatMetricBrief(67.538, 'km/h')).toBe('67.5 km/h')
    expect(formatMetricBrief(-8.58, 'degree')).toBe('−8.6°')
    expect(formatMetricBrief(4, 'degree')).toBe('4.0°')
  })

  it('不到 1 秒改成毫秒整數，1 秒以上留在秒', () => {
    expect(formatMetricBrief(0.236, 's')).toBe('236 ms')
    expect(formatMetricBrief(0.16, 's')).toBe('160 ms')
    expect(formatMetricBrief(2.82, 's')).toBe('2.8 s')
  })

  it('趨近 0 的負數不會顯示成「−0.0」', () => {
    expect(formatMetricBrief(-0.04, 'degree')).toBe('0.0°')
  })

  it('擊球方向講偏哪一邊：正值一壘側、負值三壘側，角度取絕對值', () => {
    expect(formatExitDirectionBrief(2.9)).toBe('一壘側 2.9°')
    expect(formatExitDirectionBrief(-35.64)).toBe('三壘側 35.6°')
  })

  it('擊球方向四捨五入後是 0 就寫正中，不硬分邊', () => {
    expect(formatExitDirectionBrief(0.04)).toBe('正中 0.0°')
    expect(formatExitDirectionBrief(-0.04)).toBe('正中 0.0°')
  })
})

describe('事件編號', () => {
  it('拆出場地、日期與時間（毫秒三位）', () => {
    expect(parseEventId('longtan_20260512_152805_378')).toEqual({
      site: 'longtan',
      date: '2026-05-12',
      time: '15:28:05.378',
    })
  })

  it('格式不符回傳 null', () => {
    expect(parseEventId('pitch_123')).toBeNull()
  })

  it('判定結果換成中文，表上沒有的值原樣顯示，null 不給標籤', () => {
    expect(outcomeLabel('hit')).toBe('擊中')
    expect(outcomeLabel('uncertain')).toBe('判定不確定')
    expect(outcomeLabel('foul_tip')).toBe('foul_tip')
    expect(outcomeLabel(null)).toBeNull()
  })

  it('選單標籤帶陣列索引，與參考實作網址 hash 同一套編號', () => {
    expect(eventLabel(13, { event_id: 'longtan_20260512_152951_715', outcome: 'uncertain' }))
      .toBe('#13 · 15:29:51.715 · uncertain')
    expect(eventLabel(0, { event_id: 'odd-id' })).toBe('#0 · odd-id')
  })
})

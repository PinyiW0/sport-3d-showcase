import { describe, expect, it } from 'vitest'
import { clampFrame, frameToTime, timeToFrame, VIDEO_FPS } from './videoSync'

describe('frameToTime', () => {
  it('取影格正中間，不取起點', () => {
    expect(frameToTime(0)).toBeCloseTo(0.5 / 30, 6)
    expect(frameToTime(30)).toBeCloseTo(30.5 / 30, 6)
  })

  it('可換 fps', () => {
    expect(frameToTime(10, 60)).toBeCloseTo(10.5 / 60, 6)
  })
})

describe('timeToFrame', () => {
  it('落在同一格內的任何時間都回同一格', () => {
    expect(timeToFrame(100 / 30)).toBe(100)
    expect(timeToFrame(100.5 / 30)).toBe(100)
    expect(timeToFrame(100.99 / 30)).toBe(100)
    expect(timeToFrame(101 / 30)).toBe(101)
  })
})

describe('往返一致', () => {
  it('每一格轉成時間再轉回來都是原本那格', () => {
    // 748 = 交付樣本的影格數，整段掃過確保沒有累積誤差
    for (let frame = 0; frame < 748; frame++)
      expect(timeToFrame(frameToTime(frame))).toBe(frame)
  })

  it('換 fps 也成立', () => {
    for (let frame = 0; frame < 200; frame++)
      expect(timeToFrame(frameToTime(frame, 25), 25)).toBe(frame)
  })
})

describe('clampFrame', () => {
  it('夾在 0 到最後一格之間', () => {
    expect(clampFrame(-5, 748)).toBe(0)
    expect(clampFrame(747, 748)).toBe(747)
    // 軸畫到 750 但影片只有 748 格，越界要停在最後一格
    expect(clampFrame(750, 748)).toBe(747)
  })

  it('小數會取整', () => {
    expect(clampFrame(12.4, 748)).toBe(12)
    expect(clampFrame(12.6, 748)).toBe(13)
  })

  it('沒有影格時回 0', () => {
    expect(clampFrame(100, 0)).toBe(0)
  })
})

describe('影片影格率', () => {
  it('用的是交付影片的編碼影格率 30，不是擷取的 250', () => {
    expect(VIDEO_FPS).toBe(30)
  })
})

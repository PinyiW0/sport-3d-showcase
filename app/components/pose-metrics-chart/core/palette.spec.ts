import { describe, expect, it } from 'vitest'
import { chartPalette, metricStyle } from './palette'
import { SERIES_METRIC_KEYS } from './types'

const THEMES = ['dark', 'light'] as const

describe('chartPalette', () => {
  it('兩套主題都給齊七條指標的樣式', () => {
    for (const theme of THEMES) {
      const palette = chartPalette(theme)
      for (const key of SERIES_METRIC_KEYS) {
        expect(palette.metrics[key].stroke).toMatch(/^stroke-/)
        expect(palette.metrics[key].swatch).toMatch(/^bg-/)
        expect(palette.metrics[key].fill).toMatch(/^fill-/)
      }
    }
  })

  it('同一條指標在深淺兩套是不同色階，不是同一個 class 沿用', () => {
    for (const key of SERIES_METRIC_KEYS)
      expect(chartPalette('dark').metrics[key].stroke).not.toBe(chartPalette('light').metrics[key].stroke)
  })

  it('深色版用亮色階、淺色版用深色階——反過來線會淡到看不見', () => {
    for (const key of SERIES_METRIC_KEYS) {
      const darkShade = Number(chartPalette('dark').metrics[key].stroke.match(/-(\d+)$/)![1])
      const lightShade = Number(chartPalette('light').metrics[key].stroke.match(/-(\d+)$/)![1])
      expect(darkShade).toBeLessThan(lightShade)
    }
  })

  it('七條在同一套主題內互不同色', () => {
    for (const theme of THEMES) {
      const strokes = SERIES_METRIC_KEYS.map(key => chartPalette(theme).metrics[key].stroke)
      expect(new Set(strokes).size).toBe(SERIES_METRIC_KEYS.length)
    }
  })

  it('每套主題的色塊與線條同色，圖例才對得回曲線', () => {
    for (const theme of THEMES) {
      for (const key of SERIES_METRIC_KEYS) {
        const { stroke, swatch, fill } = chartPalette(theme).metrics[key]
        const shade = stroke.replace('stroke-', '')
        expect(swatch).toBe(`bg-${shade}`)
        expect(fill).toBe(`fill-${shade}`)
      }
    }
  })

  it('淺色版的繪圖區要有外框——白底與頁面同色，沒框就看不出邊界', () => {
    expect(chartPalette('light').canvasBorder).toMatch(/^stroke-/)
    expect(chartPalette('dark').canvasBorder).toBe('')
  })

  it('數值面板跟著繪圖區同色系——色塊是線條的色階，配相反的底會偏暗或淡掉', () => {
    // 深色版：深底面板配反白字；淺色版：白底面板配深字
    expect(chartPalette('dark').tooltipTitle).toBe('fill-white')
    expect(chartPalette('light').tooltipTitle).toBe('fill-neutral-900')
    expect(chartPalette('light').tooltipSurface).toBe('fill-white')
    expect(chartPalette('dark').tooltipSurface).not.toBe('fill-white')
  })

  it('兩套面板都有外框——淺色版白對白要靠它分界，深色版靠它與繪圖區分層', () => {
    for (const theme of THEMES)
      expect(chartPalette(theme).tooltipBorder).toMatch(/^stroke-/)
  })

  it('metricStyle 預設仍是深色版，維持既有呼叫端的行為', () => {
    expect(metricStyle('trunk_rotation')).toEqual(chartPalette('dark').metrics.trunk_rotation)
    expect(metricStyle('trunk_rotation', 'light')).toEqual(chartPalette('light').metrics.trunk_rotation)
  })
})

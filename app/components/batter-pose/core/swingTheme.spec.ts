import { describe, expect, it } from 'vitest'
import { BALL_FALLBACK_COLOR, SWING_THEME, swingTheme, tintTowardWhite, toCssColor } from './swingTheme'

describe('tintTowardWhite', () => {
  it('0 維持原色、1 變純白', () => {
    expect(tintTowardWhite(0x7FA8F8, 0)).toBe(0x7FA8F8)
    expect(tintTowardWhite(0x7FA8F8, 1)).toBe(0xFFFFFF)
  })

  it('各色版分開往白色混，四捨五入到整數', () => {
    // 0x00 → 128（0 + 255 × 0.5 = 127.5 → 128）；0x80 → 192（128 + 127 × 0.5 = 191.5 → 192）
    expect(tintTowardWhite(0x000080, 0.5)).toBe(0x8080C0)
  })
})

describe('toCssColor', () => {
  it('轉成六碼小寫 hex，前導 0 不會掉', () => {
    expect(toCssColor(0x0B0E13)).toBe('#0b0e13')
    expect(toCssColor(0xFFFFFF)).toBe('#ffffff')
    expect(toCssColor(0)).toBe('#000000')
  })
})

describe('swingTheme', () => {
  it('依 dark 取對應的配色', () => {
    expect(swingTheme(true)).toBe(SWING_THEME.dark)
    expect(swingTheme(false)).toBe(SWING_THEME.light)
  })

  it('兩套配色的左右半身、球棒、紅球都不同色（規範：球用與球棒不同的紅色）', () => {
    for (const theme of Object.values(SWING_THEME)) {
      const colors = [theme.left, theme.right, theme.bat, BALL_FALLBACK_COLOR]
      expect(new Set(colors).size).toBe(colors.length)
    }
  })
})

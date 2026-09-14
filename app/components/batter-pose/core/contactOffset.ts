/**
 * 相對擊球的時間（純函式）：教練看揮棒是以擊球那一刻為基準——「擊球前 120 ms 手在哪」
 * 比「第 0.872 秒手在哪」好判讀。
 */
import type { BpeSwing } from '../../bpe-data/core/types'

/** 目前幀距離擊球幀幾毫秒（負 = 擊球前、正 = 擊球後）；沒有擊球點或幀不存在時為 null */
export function contactOffsetMs(swing: Pick<BpeSwing, 'frames' | 'contactFrame'>, frame: number): number | null {
  if (swing.contactFrame == null)
    return null
  const current = swing.frames[frame]
  const contact = swing.frames[swing.contactFrame]
  if (!current || !contact)
    return null
  // 兩個 time_s 相減會帶浮點誤差（0.872 − 0.992 = −0.12000000000000001），取整到毫秒
  return Math.round((current.timeS - contact.timeS) * 1000)
}

/** 「距擊球 −120 ms」／「擊球 0 ms」／「擊球後 +80 ms」；負號用 Unicode 減號，與正號同寬 */
export function formatContactOffset(ms: number): string {
  if (ms === 0)
    return '擊球 0 ms'
  return ms < 0 ? `距擊球 −${-ms} ms` : `擊球後 +${ms} ms`
}

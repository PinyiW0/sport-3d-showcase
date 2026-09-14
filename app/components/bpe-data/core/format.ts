/**
 * 顯示用的格式化（純函式）。
 *
 * 兩種寫法：
 * - `formatMetric`：原樣顯示、不四捨五入。演算法端給的小數位數不固定（1～3 位），
 *   且 23 筆都還沒經過人工確認，要看精確值時一律用它（提示、資料檢視）。
 * - `formatMetricBrief`：卡片與畫布上的精簡寫法，一位小數、秒改毫秒，方便一眼讀。
 *   只是顯示，旁邊的提示一定要附上 formatMetric 的原始值。
 */
import type { RawBpeIndexEntry } from './types'

/** 負號換成 Unicode 減號（U+2212），與正數同寬、不會被斷行在負號後面 */
export function formatNumber(value: number): string {
  return String(value).replace('-', '−')
}

/**
 * 單位的顯示寫法。資料裡的 unit 是機器字串（例：`degree`），畫面上換成符號；
 * 表上沒有的單位原樣顯示，不擋也不猜。
 */
const UNIT_DISPLAY: Record<string, string> = {
  degree: '°',
}

export function formatUnit(unit: string): string {
  return UNIT_DISPLAY[unit] ?? unit
}

/** 數值加單位；度數符號緊貼數字，其餘單位前留一個空白 */
export function formatMetric(value: number, unit: string): string {
  return joinUnit(formatNumber(value), unit)
}

/**
 * 精簡寫法：不到 1 秒的時間改成毫秒整數（0.236 s → 236 ms，揮棒時間用毫秒讀比較直覺；
 * 滯空時間 2.82 s 這種就留在秒，寫成 2820 ms 反而難讀），其餘四捨五入到一位小數
 * （67.538 km/h → 67.5 km/h）。固定一位小數，播放或換事件時字寬不會跳。
 */
export function formatMetricBrief(value: number, unit: string): string {
  if (unit === 's' && Math.abs(value) < 1)
    return `${formatNumber(Math.round(value * 1000))} ms`
  // 先四捨五入再 toFixed：-0.04 會變成 -0，toFixed 把 -0 寫成 "0.0"，不會出現「−0.0」
  return joinUnit((Math.round(value * 10) / 10).toFixed(1).replace('-', '−'), unit)
}

/**
 * 擊球方向的精簡寫法：講偏哪一邊，角度取絕對值（2.9 → 「一壘側 2.9°」）。
 *
 * 規範只寫「擊球方向（左右）」，沒有定義正負代表哪一邊。這裡的「正值＝一壘側」是從樣本推定的：
 * 23 筆裡有落點的 17 筆，16 筆的方向與落點 x（規範明定 +x 為一壘方向）同號；
 * 唯一例外事件 #20 的落點 x 是 −0.11 m，幾乎在正中。演算法端確認前都只是推定。
 * 四捨五入到一位小數後是 0 的寫「正中」，不硬分邊。
 */
export function formatExitDirectionBrief(value: number): string {
  const rounded = Math.round(value * 10) / 10
  if (rounded === 0)
    return '正中 0.0°'
  return `${rounded > 0 ? '一壘側' : '三壘側'} ${Math.abs(rounded).toFixed(1)}°`
}

function joinUnit(text: string, unit: string): string {
  const shown = formatUnit(unit)
  if (shown === '')
    return text
  return shown === '°' ? `${text}°` : `${text} ${shown}`
}

/**
 * 判定結果的中文：畫布左上角的標籤用。表上沒有的值原樣顯示，不猜；null 回傳 null（不畫標籤）。
 * 規範只列出值、沒有逐一定義，uncertain 寫「判定不確定」而不是「沒打到」。
 */
const OUTCOME_LABELS: Record<string, string> = {
  hit: '擊中',
  uncertain: '判定不確定',
}

export function outcomeLabel(outcome: string | null): string | null {
  if (outcome == null)
    return null
  return OUTCOME_LABELS[outcome] ?? outcome
}

export interface BpeEventIdParts {
  /** 場地代號，例：longtan */
  site: string
  /** YYYY-MM-DD */
  date: string
  /** HH:MM:SS.mmm */
  time: string
}

const EVENT_ID_RE = /^([a-z]+)_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_(\d{3})$/i

/** `longtan_20260512_152805_378` → { site, date: '2026-05-12', time: '15:28:05.378' }；格式不符回傳 null */
export function parseEventId(eventId: string): BpeEventIdParts | null {
  const m = eventId.match(EVENT_ID_RE)
  if (!m)
    return null
  const [, site, y, mo, d, h, mi, s, ms] = m
  return { site: site!, date: `${y}-${mo}-${d}`, time: `${h}:${mi}:${s}.${ms}` }
}

/**
 * 事件選單的標籤：`#0 · 15:28:05.378 · hit`。
 * `#` 後面是 index.json 的陣列索引，與參考實作網址的 hash 同一套編號，方便對照。
 */
export function eventLabel(index: number, entry: RawBpeIndexEntry): string {
  const time = parseEventId(entry.event_id)?.time ?? entry.event_id
  return entry.outcome ? `#${index} · ${time} · ${entry.outcome}` : `#${index} · ${time}`
}

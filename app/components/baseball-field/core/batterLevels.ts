/**
 * 打者級別與代表身高——好球帶上下緣的預設來源。
 *
 * 好球帶左右由本壘板寬固定(各級別都用 17 吋板),上下依打者身高計算,
 * 所以「不同級別的好球帶」實際上就是「不同的代表身高」。
 *
 * 身高資料:新版 WHO 生長曲線圖 & 台灣兒科醫師研究團隊(男童身高)。
 * 代表身高取「級距內各年齡 PR50(均標)的算術平均」——級距內各年齡人數大致
 * 均等,取單一年齡會讓低年級的好球帶整體偏高;取 PR50 而非 PR75,是因為好球帶
 * 要對典型打者成立,不是對高個子。
 *
 * 上述推導出的平均值再經與業界教練討論後定案為現行的 referenceHeightCm——
 * 各級皆在平均之上取整、幅度不超過 1 cm。所以代表身高不是 pr50ByAge 平均的
 * 直接輸出,改 pr50ByAge 時不要順手把代表身高改回算術平均。
 *
 * 規格見 spec/domain/baseball-field-coordinates.md §5
 */

import type { StrikeZoneBounds } from './fieldGeometry'
import { getStrikeZone } from './fieldGeometry'

export type BatterLevel = 'little' | 'junior' | 'senior' | 'adult'

export interface BatterLevelSpec {
  key: BatterLevel
  /** 中文級別名 */
  label: string
  /** 對應學制 */
  grades: string
  /** 年齡範圍 [最小, 最大] */
  ages: [number, number]
  /** 各年齡的 PR50 身高(cm),依年齡由小到大 */
  pr50ByAge: readonly number[]
  /** 代表身高(cm):pr50ByAge 平均經教練校準後的定案值 */
  referenceHeightCm: number
  /** 身高涵蓋範圍(cm) = [最小年齡 PR3, 最大年齡 PR97],供 UI 的身高輸入範圍用 */
  heightRangeCm: [number, number]
}

/** 由小到大,可直接用來排 UI 的級別選單 */
export const BATTER_LEVEL_ORDER: readonly BatterLevel[] = ['little', 'junior', 'senior', 'adult']

export const BATTER_LEVELS: Record<BatterLevel, BatterLevelSpec> = {
  little: {
    key: 'little',
    label: '少棒',
    grades: '小三–小六',
    ages: [8, 11],
    pr50ByAge: [126.8, 131.8, 136.5, 142],
    referenceHeightCm: 135,
    heightRangeCm: [117, 156.1],
  },
  junior: {
    key: 'junior',
    label: '青少棒',
    grades: '國一–國三',
    ages: [12, 14],
    pr50ByAge: [148.8, 156.9, 163.7],
    referenceHeightCm: 157,
    heightRangeCm: [135.6, 176],
  },
  senior: {
    key: 'senior',
    label: '青棒',
    grades: '高一–高三',
    ages: [15, 17],
    pr50ByAge: [167.6, 170, 171.5],
    referenceHeightCm: 170,
    heightRangeCm: [155.5, 181.5],
  },
  adult: {
    key: 'adult',
    label: '成棒',
    grades: '18 歲以上',
    ages: [18, 18],
    pr50ByAge: [172],
    referenceHeightCm: 172,
    heightRangeCm: [161.5, 182],
  },
}

/**
 * 取該級別代表身高的好球帶邊界。
 *
 * 只是 `getStrikeZone(BATTER_LEVELS[level].referenceHeightCm)` 的捷徑——
 * **知道實際打者身高時一律直接用 `getStrikeZone(身高)`**,級別預設是身高
 * 缺漏時的 fallback,不是取代品。
 */
export function getStrikeZoneForLevel(level: BatterLevel): StrikeZoneBounds {
  return getStrikeZone(BATTER_LEVELS[level].referenceHeightCm)
}

/** 身高落在哪個級別的涵蓋範圍;跨級別重疊時回傳最小的級別,都不符則回傳 null */
export function inferLevelFromHeight(heightCm: number): BatterLevel | null {
  return BATTER_LEVEL_ORDER.find((key) => {
    const [min, max] = BATTER_LEVELS[key].heightRangeCm
    return heightCm >= min && heightCm <= max
  }) ?? null
}

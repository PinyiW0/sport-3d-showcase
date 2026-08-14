/**
 * 姿態數據線性圖的型別與指標字典。
 *
 * 原始欄位名一律維持後端 biomech.json 的 snake_case，交接時可直接餵後端原檔；
 * 轉成前端結構是 `parseBiomech.ts` 的責任，這裡只放常數與型別。
 *
 * 純 TS、零依賴（連 vue 都不 import），可單獨在 node 端跑統計。
 */

/** 有逐影格時間序列、畫得出曲線的指標 */
export type MetricKey
  = | 'shoulder_external_rotation_angle'
    | 'shoulder_internal_rotation_angle'
    | 'elbow_flexion_angle'
    | 'lead_knee_flexion'
    | 'trunk_rotation'
    | 'trunk_anterior_tilt'
    | 'pelvis_rotation'

export interface MetricInfo {
  /** 顯示名稱 */
  label: string
  /** 顯示單位，接在數值後面 */
  unit: string
  /**
   * 是否為 ±180 環繞角。通過邊界時數值會整圈翻轉，畫線要斷開，
   * 否則會出現一條貫穿整張圖的假垂直線。
   */
  wraps?: boolean
  /** 這個指標不是獨立量測時，說明它從哪來 */
  derivedFrom?: string
}

/**
 * 所有出現過的指標的顯示資訊——含只有單點值（peak / at_release / at_foot_plant）
 * 的那些。後端 schema 之後新增欄位時，沒登錄在這裡的會退回顯示原始 key，
 * 不會炸掉，但也不會有中文名與單位。
 */
export const METRIC_INFO: Readonly<Record<string, MetricInfo>> = {
  shoulder_external_rotation_angle: { label: '肩膀外旋', unit: '°' },
  shoulder_internal_rotation_angle: {
    label: '肩膀內旋',
    unit: '°',
    derivedFrom: 'shoulder_external_rotation_angle',
  },
  shoulder_abduction_angle: { label: '肩外展角', unit: '°' },
  shoulder_horizontal_abduction_angle: { label: '肩水平外展角', unit: '°' },
  elbow_flexion_angle: { label: '手肘彎曲', unit: '°' },
  elbow_varus_torque: { label: '肘內翻力矩', unit: 'N·m' },
  lead_knee_flexion: { label: '前腳彎曲', unit: '°' },
  trunk_rotation: { label: '軀幹旋轉', unit: '°', wraps: true },
  trunk_anterior_tilt: { label: '軀幹前傾', unit: '°' },
  trunk_lateral_tilt: { label: '軀幹側傾角', unit: '°' },
  // 欄位名是 pelvis（骨盆），顯示名沿用需求方的用語「髖部旋轉」
  pelvis_rotation: { label: '髖部旋轉', unit: '°', wraps: true },
  hip_shoulder_separation: { label: '髖肩分離角', unit: '°' },
  stride_length: { label: '跨步距離', unit: 'cm' },
  arm_extension: { label: '手臂伸展距離', unit: 'cm' },
  release_height: { label: '出手高度', unit: 'cm' },
  release_side: { label: '出手橫向位置', unit: 'cm' },
  vertical_release_angle: { label: '垂直出手角', unit: '°' },
  horizontal_release_angle: { label: '水平出手角', unit: '°' },
}

/**
 * 可畫成曲線的指標，順序即 UI 選單順序。
 *
 * 只有 7 條，是因為後端 biomech.json 的 `timeseries` 只給這 7 條。同一批交付的
 * xlsx 另有 6 條逐影格指標（肩外展、髖肩分離、肘內翻力矩、跨步距離、軀幹側傾、
 * 肩水平外展），在 JSON 裡只剩 peak / at_release 的單點值——落差與待確認事項
 * 記在 doc/投手姿態frame.md。
 */
export const SERIES_METRIC_KEYS: readonly MetricKey[] = [
  'shoulder_external_rotation_angle',
  'shoulder_internal_rotation_angle',
  'lead_knee_flexion',
  'trunk_rotation',
  'trunk_anterior_tilt',
  'pelvis_rotation',
  'elbow_flexion_angle',
]

/**
 * 共用的角度軸範圍。
 *
 * 固定 ±180 而不隨資料縮放，理由是這張圖的價值在於七條疊起來互相比較——
 * 軸一動，兩次觀察就不能直接對照。取 ±180 是因為軀幹與髖部旋轉是環繞角，
 * 實測會走到 -178.7 與 -176.7（那是越過 ±180 邊界的另一半表示法，不是雜訊），
 * 收窄到 -90 會裁掉其中 14.8% 與 19.2% 的點，包含踏地到出手那整段。
 */
export const ANGLE_DOMAIN: readonly [number, number] = [-180, 180]

/**
 * X 軸的名目長度（影格）。
 *
 * 擷取窗約 3 秒 × 250fps，實際交付常少於此數（手上這顆是 748）。biomech.json
 * 沒有任何欄位宣告這個長度——`frame_count` 講的是實際交付幾格，不是窗有多長
 * ——所以 750 是設定值不是量測值，換一套擷取設定就要跟著改。
 *
 * 軸固定在這個長度而不是跟著資料伸縮：交付不足時右邊留白，一眼看得出這球短；
 * 不同球用同一條軸，並排才比得起來。代價是**超過這個長度的影格畫不出來**
 * ——軸不會自動延伸，這是刻意的取捨。
 */
export const NOMINAL_FRAME_SPAN = 750

/** 事件的顯示名稱，順序即時間順序 */
export const EVENT_LABELS: Readonly<Record<string, string>> = {
  leg_lift: '抬腿',
  foot_plant: '踏地',
  release: '出手',
}

/** 查指標資訊，沒登錄過的退回用原始 key 當名稱、單位留空 */
export function metricInfo(key: string): MetricInfo {
  return METRIC_INFO[key] ?? { label: key, unit: '' }
}

// ---- 後端原始格式（biomech.json，schema_version 6）----

export interface RawBiomechEvent {
  frame_index?: number
  timestamp?: string
  /** 事件落在影片起點之前、只抓到片段時為 true */
  truncated?: boolean
}

export interface RawBiomechPeak {
  /** 平滑後的峰值，UI 顯示用 */
  value?: number
  /** 未平滑的原始峰值 */
  raw_value?: number
  frame_index?: number
  timestamp?: string
  /** 取峰值的區間，如 'foot_plant→release' */
  window?: string
  /** 演算法端對這個峰值的信心；false 時 UI 必須標示 */
  reliable?: boolean
}

/**
 * `timestamp` 是影格時間戳，其餘 key 是指標的逐影格數值（缺測為 null）。
 * 兩者長度都等於 frame_count。
 */
export interface RawBiomechTimeseries {
  timestamp?: string[]
  [metric: string]: string[] | (number | null)[] | undefined
}

export interface RawBiomech {
  schema_version?: number
  pitch_id?: string
  /** 'right' | 'left' */
  throwing_hand?: string
  frame_count?: number
  units?: Record<string, string>
  events?: Record<string, RawBiomechEvent>
  release?: { frame_index?: number, timestamp?: string }
  timeseries?: RawBiomechTimeseries
  at_release?: Record<string, number>
  at_foot_plant?: Record<string, number>
  peak?: Record<string, RawBiomechPeak>
}

// ---- 前端結構 ----

export interface PoseMetricEvent {
  key: string
  label: string
  frameIndex: number
  /** 相對第一格的毫秒 */
  timeMs: number
  truncated: boolean
}

export interface PoseMetricPeak {
  key: string
  label: string
  unit: string
  /** 後端平滑後的峰值，數值顯示用 */
  value: number
  frameIndex: number
  timeMs: number
  window: string
  reliable: boolean
  /** 有對應的曲線，可以標在圖上；否則只能當數值顯示 */
  onSeries: boolean
  /**
   * 圖上標記要用的 y，一律取自 `series[key][frameIndex]`。
   *
   * 不能用 `value` 或 `raw_value`：`value` 是平滑後的值（肩外旋實測 158.49 對
   * 曲線上的 143.23），而肩內旋的 `raw_value` 還帶著外旋的正負號（-90.26 對
   * 序列裡的 +90.26）。拿它們當座標，標記會浮在曲線外面。
   */
  plotValue: number | null
}

/** peak / at_release / at_foot_plant 這類沒有時間序列的單點值 */
export interface PoseMetricValue {
  key: string
  label: string
  unit: string
  value: number
}

export interface PoseMetrics {
  pitchId: string
  /** 'right' | 'left'，缺值為 null */
  throwingHand: string | null
  frameCount: number
  /** 每影格相對第一格的毫秒，長度 = frameCount */
  timesMs: number[]
  /** 逐影格數值，缺測保留 null（不填 0、不內插） */
  series: Partial<Record<MetricKey, (number | null)[]>>
  events: PoseMetricEvent[]
  peaks: PoseMetricPeak[]
  /** 出手瞬間的單點值 */
  atRelease: PoseMetricValue[]
  /** 踏地瞬間的單點值 */
  atFootPlant: PoseMetricValue[]
}

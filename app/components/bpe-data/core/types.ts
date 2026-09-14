/**
 * BPE 揮棒結果的型別與 13 項數值定義（渲染器無關，零 npm 依賴）。
 *
 * 規格出處：演算法端 `frontend-render-guide.md`（2026-09-07 參考包）。
 * 外層為 result-envelope-v2，內層為 bpe-payload-v2。
 *
 * 座標系與本 repo 的 spec/domain/baseball-field-coordinates.md 完全相同：
 * 原點本壘板尖端、+x 一壘、+y 投手／中外野、+z 向上，右手座標系。
 * 所有 `*_cm` 欄位為公分，唯一例外是 `predicted_landing_point_m`（公尺）。
 */

/** 座標點 [x, y, z]；單位看欄位名（`*_cm` 公分、`*_m` 公尺） */
export type BpePoint3 = [number, number, number]

// ---------------------------------------------------------------------------
// wire 型別（原檔）：一律視為不可信，欄位全部可選／可為 null，解析時才檢查
// ---------------------------------------------------------------------------

export interface RawBpeMetric {
  value?: number | null
  unit?: string | null
}

export interface RawBpeFrame {
  time_s?: number | null
  /** 長度等於 joint_names；整幀缺測時每個元素都是 null，不是整個欄位 null */
  joints_cm?: Array<BpePoint3 | null> | null
  /** payload_schema_version 2.1.0 起必有；2.0.0 舊檔沒有這個欄位 */
  ball_cm?: BpePoint3 | null
}

export interface RawBpeSkeleton {
  joint_names?: string[] | null
  bones?: Array<[number, number]> | null
}

export interface RawBpeAnimation {
  time_origin?: string
  sample_period_s?: number | null
  frame_count?: number | null
  /** 前端不使用（規範明示） */
  trigger_time_s?: number | null
  frames?: RawBpeFrame[] | null
}

export interface RawBpeContact {
  time_s?: number | null
  point_cm?: BpePoint3 | null
}

export interface RawBpePayload {
  timestamps?: { detected_at?: string, fanout_at?: string, generated_at?: string } | null
  settings_version?: string
  outcome?: string | null
  coordinate_system?: unknown
  skeleton?: RawBpeSkeleton | null
  animation?: RawBpeAnimation | null
  contact?: RawBpeContact | null
  predicted_landing_point_m?: BpePoint3 | null
  metrics?: Record<string, RawBpeMetric | null> | null
}

export interface RawBpeEnvelope {
  schema_version?: string
  payload_schema_version?: string
  module?: string
  module_version?: string
  pitch_id?: string
  status?: string
  error?: unknown
  payload?: RawBpePayload | null
}

/**
 * 參考包 `events/index.json` 的一筆摘要。
 * 只拿來排事件選單；是否繪製一律以結果檔本身為準（這裡的品質欄位意義未定義）。
 */
export interface RawBpeIndexEntry {
  event_id: string
  outcome?: string
  /** 結果檔的 contact 是否非 null */
  contact?: boolean
  /** track / polar / none；none = 無預測落點，另兩者的差別未寫進文件 */
  landing?: string
  frames?: number
  ball_frames?: number
  null_metrics?: number
  notes?: string
}

/**
 * 樣本的 `overview.json` 一筆：同一份結果檔拿掉 payload 的 skeleton 與 animation
 * （scripts/import-bpe-samples.mjs 產生）。順序與 index.json 相同。
 */
export interface RawBpeOverviewEntry {
  event_id: string
  result: RawBpeEnvelope
}

// ---------------------------------------------------------------------------
// 13 項數值
// ---------------------------------------------------------------------------

export type BpeMetricKey
  = | 'exit_velocity'
    | 'launch_angle'
    | 'exit_direction'
    | 'distance'
    | 'contact_side'
    | 'contact_height'
    | 'bat_speed'
    | 'attack_angle'
    | 'attack_direction'
    | 'swing_path_tilt'
    | 'time_to_contact'
    | 'swing_length'
    | 'estimated_hang_time'

export interface BpeMetricDef {
  key: BpeMetricKey
  label: string
  /** 規範表列的單位，只供文件與測試對照；畫面一律顯示資料本身的 unit，缺少時不拿這個補 */
  unit: string
}

/** 規範第 5 節的 13 項，陣列順序即顯示順序 */
export const BPE_METRICS: readonly BpeMetricDef[] = [
  { key: 'exit_velocity', label: '擊球初速', unit: 'km/h' },
  { key: 'launch_angle', label: '擊球仰角', unit: 'degree' },
  { key: 'exit_direction', label: '擊球方向（左右）', unit: 'degree' },
  { key: 'distance', label: '預測飛行距離', unit: 'm' },
  { key: 'contact_side', label: '擊球點左右位置', unit: 'cm' },
  { key: 'contact_height', label: '擊球點高度', unit: 'cm' },
  { key: 'bat_speed', label: '棒速', unit: 'km/h' },
  { key: 'attack_angle', label: '攻擊角', unit: 'degree' },
  { key: 'attack_direction', label: '攻擊方向', unit: 'degree' },
  { key: 'swing_path_tilt', label: '揮棒平面傾角', unit: 'degree' },
  { key: 'time_to_contact', label: '啟動到擊球時間', unit: 's' },
  { key: 'swing_length', label: '揮棒長度', unit: 'cm' },
  { key: 'estimated_hang_time', label: '預估滯空時間', unit: 's' },
]

/**
 * 三個模組各自顯示的數值（依規範順序）。13 項依性質拆分，三組合起來剛好是全部：
 * - 揮棒（打擊姿態）：球棒怎麼揮
 * - 擊球點（擊球點九宮格）：球棒在哪裡碰到球
 * - 飛行（預測落點球場圖）：球被打出去之後怎麼飛
 */
export const SWING_METRIC_KEYS: readonly BpeMetricKey[] = [
  'bat_speed',
  'attack_angle',
  'attack_direction',
  'swing_path_tilt',
  'time_to_contact',
  'swing_length',
]
export const CONTACT_METRIC_KEYS: readonly BpeMetricKey[] = ['contact_side', 'contact_height']
export const FLIGHT_METRIC_KEYS: readonly BpeMetricKey[] = [
  'exit_velocity',
  'launch_angle',
  'exit_direction',
  'distance',
  'estimated_hang_time',
]

/** 解析後的一項數值：value 必為有限數字，缺值的項目根本不會出現 */
export interface BpeMetricValue {
  key: BpeMetricKey
  label: string
  value: number
  unit: string
}

// ---------------------------------------------------------------------------
// 解析後的結果
// ---------------------------------------------------------------------------

export type BpeBoneKind = 'body' | 'bat'

export interface BpeBone {
  from: number
  to: number
  /** 兩端都是球棒點（bat_*）才算球棒，其餘為人體 */
  kind: BpeBoneKind
}

export interface BpeFrame {
  /** 相對第一幀的秒數 */
  timeS: number
  /** 長度恆等於 jointNames；缺測為 null */
  joints: Array<BpePoint3 | null>
  /** 缺測、欄位不存在（2.0.0 舊檔）都是 null */
  ball: BpePoint3 | null
}

/** 3D 揮棒動畫：skeleton 與 animation 兩者齊全才會有 */
export interface BpeSwing {
  jointNames: string[]
  bones: BpeBone[]
  /** 幀間隔（秒）；原檔缺少時為 null，播放改以 time_s 對齊 */
  samplePeriodS: number | null
  /** 最後一幀的 time_s 再加一個幀間隔 */
  durationS: number
  frames: BpeFrame[]
  /** 幀內有沒有 ball_cm 欄位（2.1.0 起必有）；舊檔為 false，圖例仍照常顯示「球」 */
  hasBallField: boolean
  /** ball_cm 為有效座標的幀數 */
  ballFrameCount: number
  /** time_s 最接近 contact.time_s 的幀；沒有擊球點時為 null */
  contactFrame: number | null
}

export interface BpeContact {
  /** 原檔 contact.time_s；缺少時為 null（仍可畫九宮格，只是無法標出擊球幀） */
  timeS: number | null
  /** [x, y, z] 公分。九宮格只用 x 與 z */
  pointCm: BpePoint3
}

export interface BpeResult {
  pitchId: string | null
  outcome: string | null
  schemaVersion: string | null
  payloadSchemaVersion: string | null
  /** payload.timestamps.detected_at（原字串，未轉時區） */
  detectedAt: string | null
  swing: BpeSwing | null
  contact: BpeContact | null
  /** [x, y, z] 公尺，落地時 z 為 0 */
  landingM: BpePoint3 | null
  /** 13 項中有值的項目，依規範順序 */
  metrics: BpeMetricValue[]
}

/**
 * 檢查關卡的結果。`ok: false` 時四項都不畫，只顯示 error。
 */
export type BpeParseOutcome
  = | { ok: true, result: BpeResult }
    | { ok: false, status: string | null, errorText: string | null }

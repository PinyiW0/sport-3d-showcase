/**
 * BPE result envelope → 可畫的資料。檢查關卡與缺值規則只在這裡寫一次，三個模組共用。
 *
 * 缺值規則（規範第 6 節）：欄位缺少或為 null 就不畫、不顯示——不推算、
 * 不沿用上一幀、不補預設值。四項（動畫／擊球點／落點／數值）互相獨立，
 * 各自判斷；沒有擊球點不代表沒有落點（樣本裡有 3 筆就是這樣）。
 */
import type {
  BpeBone,
  BpeContact,
  BpeFrame,
  BpeMetricKey,
  BpeMetricValue,
  BpeParseOutcome,
  BpePoint3,
  BpeResult,
  BpeSwing,
  RawBpeAnimation,
  RawBpeContact,
  RawBpeEnvelope,
  RawBpePayload,
  RawBpeSkeleton,
} from './types'
import { BPE_METRICS } from './types'

/** 恰好三個有限數字才算有效座標；null、長度不符、NaN、字串一律視為缺值 */
export function isPoint3(value: unknown): value is BpePoint3 {
  return Array.isArray(value)
    && value.length === 3
    && value.every(v => typeof v === 'number' && Number.isFinite(v))
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/** 球棒點以名稱判定（bat_knob、bat_head），不寫死索引 */
export function isBatJoint(name: string): boolean {
  return name.startsWith('bat_')
}

function toErrorText(error: unknown): string | null {
  if (error == null)
    return null
  if (typeof error === 'string')
    return error
  try {
    return JSON.stringify(error)
  }
  catch {
    return String(error)
  }
}

/**
 * 解析一筆 BPE 結果。
 *
 * 檢查關卡：`status === "success"` 且 `payload` 是物件才進入繪製流程，
 * 否則回傳 `ok: false`，呼叫端四項都不畫、改顯示 error。
 */
export function parseBpeResult(raw: unknown): BpeParseOutcome {
  if (!isObject(raw))
    return { ok: false, status: null, errorText: null }

  const envelope = raw as RawBpeEnvelope
  const status = stringOrNull(envelope.status)
  if (status !== 'success' || !isObject(envelope.payload))
    return { ok: false, status, errorText: toErrorText(envelope.error) }

  const payload = envelope.payload as RawBpePayload
  const contact = parseContact(payload.contact)
  const swing = parseSwing(payload.skeleton, payload.animation, contact)

  const result: BpeResult = {
    pitchId: stringOrNull(envelope.pitch_id),
    outcome: stringOrNull(payload.outcome),
    schemaVersion: stringOrNull(envelope.schema_version),
    payloadSchemaVersion: stringOrNull(envelope.payload_schema_version),
    detectedAt: isObject(payload.timestamps) ? stringOrNull(payload.timestamps.detected_at) : null,
    swing,
    contact,
    landingM: isPoint3(payload.predicted_landing_point_m) ? [...payload.predicted_landing_point_m] : null,
    metrics: parseMetrics(payload.metrics),
  }
  return { ok: true, result }
}

function parseContact(raw: RawBpeContact | null | undefined): BpeContact | null {
  if (!isObject(raw) || !isPoint3(raw.point_cm))
    return null
  return {
    timeS: isFiniteNumber(raw.time_s) ? raw.time_s : null,
    pointCm: [...raw.point_cm],
  }
}

function parseMetrics(raw: RawBpePayload['metrics']): BpeMetricValue[] {
  if (!isObject(raw))
    return []
  const out: BpeMetricValue[] = []
  for (const def of BPE_METRICS) {
    const metric = raw[def.key]
    // metric 物件整個缺少、為 null、或 value 為 null → 該項不顯示
    if (!isObject(metric) || !isFiniteNumber(metric.value))
      continue
    out.push({
      key: def.key,
      label: def.label,
      value: metric.value,
      // unit 缺少時不拿規範表的單位補上（規範通則：不補預設值），畫面只顯示數字
      unit: typeof metric.unit === 'string' ? metric.unit : '',
    })
  }
  return out
}

function parseSwing(
  rawSkeleton: RawBpeSkeleton | null | undefined,
  rawAnimation: RawBpeAnimation | null | undefined,
  contact: BpeContact | null,
): BpeSwing | null {
  // skeleton 或 animation 任一缺少 → 不畫動畫
  if (!isObject(rawSkeleton) || !isObject(rawAnimation))
    return null

  const jointNames = rawSkeleton.joint_names
  if (!Array.isArray(jointNames) || jointNames.length === 0 || !jointNames.every(n => typeof n === 'string'))
    return null
  if (!Array.isArray(rawSkeleton.bones) || !Array.isArray(rawAnimation.frames))
    return null

  const jointCount = jointNames.length
  const isIndex = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < jointCount

  const bones: BpeBone[] = []
  for (const pair of rawSkeleton.bones) {
    if (!Array.isArray(pair) || !isIndex(pair[0]) || !isIndex(pair[1]))
      continue
    const [from, to] = pair
    bones.push({ from, to, kind: isBatJoint(jointNames[from]!) && isBatJoint(jointNames[to]!) ? 'bat' : 'body' })
  }

  let hasBallField = false
  let ballFrameCount = 0
  const frames: BpeFrame[] = []
  for (const rawFrame of rawAnimation.frames) {
    // 沒有 time_s 的幀放不上時間軸，整幀略過（不猜它的時間）
    if (!isObject(rawFrame) || !isFiniteNumber(rawFrame.time_s))
      continue
    if ('ball_cm' in rawFrame)
      hasBallField = true
    const rawJoints = Array.isArray(rawFrame.joints_cm) ? rawFrame.joints_cm : []
    const joints = Array.from({ length: jointCount }, (_, j) => {
      const point = rawJoints[j]
      return isPoint3(point) ? [...point] as BpePoint3 : null
    })
    const ball = isPoint3(rawFrame.ball_cm) ? [...rawFrame.ball_cm] as BpePoint3 : null
    if (ball)
      ballFrameCount++
    frames.push({ timeS: rawFrame.time_s, joints, ball })
  }
  if (frames.length === 0)
    return null

  const samplePeriodS = isFiniteNumber(rawAnimation.sample_period_s) && rawAnimation.sample_period_s > 0
    ? rawAnimation.sample_period_s
    : null

  return {
    jointNames: [...jointNames],
    bones,
    samplePeriodS,
    durationS: frames.at(-1)!.timeS + (samplePeriodS ?? 0),
    frames,
    hasBallField,
    ballFrameCount,
    contactFrame: contact?.timeS == null ? null : nearestFrame(frames, contact.timeS),
  }
}

/** time_s 最接近 timeS 的幀索引（線性掃描；一筆不到 300 幀，不值得二分） */
export function nearestFrame(frames: readonly BpeFrame[], timeS: number): number | null {
  let best: number | null = null
  let bestDiff = Infinity
  for (let i = 0; i < frames.length; i++) {
    const diff = Math.abs(frames[i]!.timeS - timeS)
    if (diff < bestDiff) {
      best = i
      bestDiff = diff
    }
  }
  return best
}

/**
 * 播放時鐘（秒）→ 該顯示哪一幀：最後一個 time_s ≤ timeS 的幀。
 * 早於第一幀回傳 0，晚於最後一幀回傳最後一幀。frames 必須依 time_s 遞增。
 */
export function frameAtTime(frames: readonly BpeFrame[], timeS: number): number {
  if (frames.length === 0 || timeS <= frames[0]!.timeS)
    return 0
  let lo = 0
  let hi = frames.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (frames[mid]!.timeS <= timeS)
      lo = mid
    else
      hi = mid - 1
  }
  return lo
}

/** 依給定 key 的順序挑出有值的數值；缺值的 key 直接略過 */
export function pickMetrics(metrics: readonly BpeMetricValue[], keys: readonly BpeMetricKey[]): BpeMetricValue[] {
  return keys.flatMap((key) => {
    const found = metrics.find(m => m.key === key)
    return found ? [found] : []
  })
}

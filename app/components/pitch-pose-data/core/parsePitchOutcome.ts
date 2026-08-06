/**
 * 演算法 outcome.json → 3D 骨架動畫資料的 adapter。
 *
 * 來源:clip.frames[].reconstruction.pose_3d
 *   - key = COCO-17 keypoint id("0"~"16"),定義同 mmpose COCO
 *     (https://mmpose.readthedocs.io/en/latest/dataset_zoo/2d_body_keypoint.html#coco),
 *     與 app/types/api/pose.ts 的 COCO_KEYPOINT_NAMES / SKELETON_EDGES 一致。
 *   - position 單位 cm,座標系同軌跡模組:x 左右、y 投手方向距離、z 高度。
 *   - 實測 749/749 frames 都有 pose_3d,缺測 keypoint 約 0.5%(以 null 佔位)。
 *
 * 時間軸:取第一個 frame 的 timestamp 為 0,輸出相對毫秒
 * (250fps 高速攝影,間隔 ~4ms,保留小數)。
 */
import type { Point3D } from './types'

interface RawPose3dKeypoint {
  position?: { x?: number, y?: number, z?: number }
  interpolated?: boolean
}

interface RawFrame {
  aligned?: { timestamp?: string }
  reconstruction?: {
    timestamp?: string
    pose_3d?: Record<string, RawPose3dKeypoint>
  }
}

export interface RawPitchOutcome {
  pitch_id?: string
  release?: { frame_index?: number }
  clip?: {
    frames?: RawFrame[]
    throwing_hand?: string
  }
}

export interface Pose3dFrame {
  /** 相對第一個 frame 的毫秒。 */
  timestampMs: number
  /** 17 個槽位,依 COCO id;缺測為 null。座標 [x, y, z](cm)。 */
  points: Array<Point3D | null>
}

export interface PitchPose3d {
  pitchId: string
  throwingHand: string | null
  durationMs: number
  /** 出手瞬間的相對毫秒;來源缺 release 時為 null。 */
  releaseMs: number | null
  frames: Pose3dFrame[]
}

const KEYPOINT_COUNT = 17

const TS_RE = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})\.(\d{1,6})$/

/** "20260624_152027.597899" → epoch 毫秒(含微秒小數);格式不符回傳 null。 */
export function parseOutcomeTimestampMs(ts: string): number | null {
  const m = ts.match(TS_RE)
  if (!m)
    return null
  const [, y, mo, d, h, mi, s, frac] = m
  const micro = Number(frac!.padEnd(6, '0'))
  return Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, +s!) + micro / 1000
}

function isFinitePosition(p?: { x?: number, y?: number, z?: number }): p is { x: number, y: number, z: number } {
  return p != null && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)
}

function frameTimestampMs(frame: RawFrame): number | null {
  const ts = frame.reconstruction?.timestamp ?? frame.aligned?.timestamp
  return ts ? parseOutcomeTimestampMs(ts) : null
}

export function parsePitchOutcome(raw: RawPitchOutcome): PitchPose3d {
  const rawFrames = raw.clip?.frames ?? []

  let t0: number | null = null
  const frames: Pose3dFrame[] = []

  for (const rawFrame of rawFrames) {
    const pose3d = rawFrame.reconstruction?.pose_3d
    const absMs = frameTimestampMs(rawFrame)
    if (!pose3d || absMs == null)
      continue
    t0 ??= absMs

    const points: Array<Point3D | null> = Array.from({ length: KEYPOINT_COUNT }, (_, id) => {
      const position = pose3d[String(id)]?.position
      return isFinitePosition(position) ? [position.x, position.y, position.z] : null
    })
    frames.push({ timestampMs: absMs - t0, points })
  }

  // 出手瞬間:release.frame_index 指向 clip.frames
  const releaseIndex = raw.release?.frame_index
  let releaseMs: number | null = null
  if (t0 != null && releaseIndex != null) {
    const abs = rawFrames[releaseIndex] ? frameTimestampMs(rawFrames[releaseIndex]) : null
    releaseMs = abs == null ? null : abs - t0
  }

  return {
    pitchId: raw.pitch_id ?? 'unknown',
    throwingHand: raw.clip?.throwing_hand ?? null,
    durationMs: frames.at(-1)?.timestampMs ?? 0,
    releaseMs,
    frames,
  }
}

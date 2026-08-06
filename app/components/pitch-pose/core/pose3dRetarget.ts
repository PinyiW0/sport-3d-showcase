import type { Object3D } from 'three'
/**
 * COCO-17 3D keypoints → Mixamo 人形骨架的 retarget 邏輯(純計算,無 DOM)。
 *
 * 資料端只有 17 個關節「位置」,rigged 模型吃的是每根骨頭的「旋轉」,轉換分兩類:
 * - 軀幹(骨盆 / 胸腔 / 頭):左右對稱點夠多,直接建正交基底求完整朝向(含扭轉)。
 * - 四肢:只知道兩端點,取「模型當下骨頭方向 → 資料方向」的最小旋轉。
 *   由親到子逐根套用,親骨已把子骨帶到目標附近,殘餘旋轉小、不會在
 *   反向姿勢(如投球揮臂)時翻轉,扭轉也由軀幹基底自然傳遞下來。
 *
 * COCO-17 沒有的資訊(手腕/腳踝旋轉、脊椎逐節彎曲)保持模型 rest pose。
 */
import type { Pose3dFrame } from '../../pitch-pose-data/core/parsePitchOutcome'
import { Matrix4, Quaternion, Vector3 } from 'three'

/** COCO-17 keypoint id(順序同 types/api/pose 的 COCO_KEYPOINT_NAMES)。 */
const KP = {
  nose: 0,
  leftEar: 3,
  rightEar: 4,
  leftShoulder: 5,
  rightShoulder: 6,
  leftElbow: 7,
  rightElbow: 8,
  leftWrist: 9,
  rightWrist: 10,
  leftHip: 11,
  rightHip: 12,
  leftKnee: 13,
  rightKnee: 14,
  leftAnkle: 15,
  rightAnkle: 16,
} as const

export interface Pose3dFrameVec {
  timestampMs: number
  /** 17 個槽位,three.js 座標(公尺、y-up);缺測為 null。 */
  points: Array<Vector3 | null>
}

/**
 * 缺測 keypoint 補幀:每個槽位沿時間軸線性插值,頭尾缺測取最近已知值。
 * 模型骨頭不能像 Plotly 那樣「不畫」,缺一點整條手臂就會凍住,必須先補滿。
 */
export function interpolateMissingPoints(frames: readonly Pose3dFrame[]): Pose3dFrame[] {
  const out = frames.map(frame => ({ timestampMs: frame.timestampMs, points: [...frame.points] }))
  const keypointCount = out[0]?.points.length ?? 0

  for (let k = 0; k < keypointCount; k++) {
    // prevKnown[i] / nextKnown[i]:frame i 前後最近的已知 frame index
    const prevKnown: Array<number | null> = Array.from({ length: out.length })
    const nextKnown: Array<number | null> = Array.from({ length: out.length })
    let last: number | null = null
    for (let i = 0; i < out.length; i++) {
      if (out[i]!.points[k])
        last = i
      prevKnown[i] = last
    }
    last = null
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i]!.points[k])
        last = i
      nextKnown[i] = last
    }

    for (let i = 0; i < out.length; i++) {
      if (out[i]!.points[k])
        continue
      const prev = prevKnown[i] ?? null
      const next = nextKnown[i] ?? null
      if (prev == null && next == null)
        continue // 整段全缺,只能保持 null
      if (prev == null || next == null) {
        out[i]!.points[k] = [...out[(prev ?? next)!]!.points[k]!]
        continue
      }
      const pa = out[prev]!.points[k]!
      const pb = out[next]!.points[k]!
      const ta = out[prev]!.timestampMs
      const tb = out[next]!.timestampMs
      const t = tb === ta ? 0 : (out[i]!.timestampMs - ta) / (tb - ta)
      out[i]!.points[k] = [
        pa[0] + (pb[0] - pa[0]) * t,
        pa[1] + (pb[1] - pa[1]) * t,
        pa[2] + (pb[2] - pa[2]) * t,
      ]
    }
  }
  return out
}

/**
 * 資料座標(cm、z-up:x 左右、y 投手方向、z 高度)→ three.js(公尺、y-up)。
 * 繞 x 軸 -90° 的純旋轉,保持右手座標系,身體左右不會鏡像。
 */
export function toThreeSpace(frames: readonly Pose3dFrame[]): Pose3dFrameVec[] {
  return frames.map(frame => ({
    timestampMs: frame.timestampMs,
    points: frame.points.map(p => (p ? new Vector3(p[0], p[2], -p[1]).multiplyScalar(0.01) : null)),
  }))
}

/** 每幀左右腿長(髖→膝→踝)平均的中位數,供模型等比縮放。 */
export function medianLegLengthM(frames: readonly Pose3dFrameVec[]): number | null {
  const lengths: number[] = []
  for (const frame of frames) {
    const sides: Array<[number, number, number]> = [
      [KP.leftHip, KP.leftKnee, KP.leftAnkle],
      [KP.rightHip, KP.rightKnee, KP.rightAnkle],
    ]
    const legs = sides.flatMap(([hip, knee, ankle]) => {
      const h = frame.points[hip]
      const k = frame.points[knee]
      const a = frame.points[ankle]
      return h && k && a ? [h.distanceTo(k) + k.distanceTo(a)] : []
    })
    if (legs.length > 0)
      lengths.push(legs.reduce((sum, v) => sum + v, 0) / legs.length)
  }
  if (lengths.length === 0)
    return null
  lengths.sort((a, b) => a - b)
  return lengths[Math.floor(lengths.length / 2)]!
}

/** x 軸方向 + 近似 up → 正交基底旋轉(y 對齊 up 的投影)。 */
function basisFromXY(xDir: Vector3, upApprox: Vector3): Quaternion {
  const x = xDir.clone().normalize()
  const z = new Vector3().crossVectors(x, upApprox).normalize()
  const y = new Vector3().crossVectors(z, x)
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z))
}

/** x 軸方向 + 近似 forward(z)→ 正交基底旋轉,給頭部(耳線 + 鼻子朝向)用。 */
function basisFromXZ(xDir: Vector3, forwardApprox: Vector3): Quaternion {
  const x = xDir.clone().normalize()
  const y = new Vector3().crossVectors(forwardApprox, x).normalize()
  const z = new Vector3().crossVectors(x, y)
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z))
}

function mid(a: Vector3, b: Vector3): Vector3 {
  return a.clone().add(b).multiplyScalar(0.5)
}

const MIXAMO_PREFIX_RE = /^mixamorig:?/i

/** Mixamo 骨骼名稱(允許 "mixamorig:" / "mixamorig" 前綴)找骨頭。 */
function findBone(root: Object3D, suffix: string): Object3D {
  let found: Object3D | null = null
  root.traverse((node) => {
    if (!found && node.name.replace(MIXAMO_PREFIX_RE, '') === suffix)
      found = node
  })
  if (!found)
    throw new Error(`模型缺少骨骼:${suffix}`)
  return found
}

const BONE_NAMES = [
  'Hips',
  'Spine2',
  'Neck',
  'Head',
  'LeftArm',
  'LeftForeArm',
  'LeftHand',
  'RightArm',
  'RightForeArm',
  'RightHand',
  'LeftUpLeg',
  'LeftLeg',
  'LeftFoot',
  'RightUpLeg',
  'RightLeg',
  'RightFoot',
] as const

type BoneName = (typeof BONE_NAMES)[number]

/** 四肢與脖子:骨頭 → 對準的子關節,及對應的 keypoint 端點。 */
const DIRECTION_RULES: ReadonlyArray<readonly [BoneName, BoneName, number, number]> = [
  ['LeftUpLeg', 'LeftLeg', KP.leftHip, KP.leftKnee],
  ['LeftLeg', 'LeftFoot', KP.leftKnee, KP.leftAnkle],
  ['RightUpLeg', 'RightLeg', KP.rightHip, KP.rightKnee],
  ['RightLeg', 'RightFoot', KP.rightKnee, KP.rightAnkle],
  ['LeftArm', 'LeftForeArm', KP.leftShoulder, KP.leftElbow],
  ['LeftForeArm', 'LeftHand', KP.leftElbow, KP.leftWrist],
  ['RightArm', 'RightForeArm', KP.rightShoulder, KP.rightElbow],
  ['RightForeArm', 'RightHand', KP.rightElbow, KP.rightWrist],
]

export class PoseRetargeter {
  private bones: Record<BoneName, Object3D>
  private restWorldQuat = new Map<Object3D, Quaternion>()
  private hipsRestBasisInv: Quaternion
  private chestRestBasisInv: Quaternion
  /** 模型 rest pose 的腿長(髖→膝→踝),供呼叫端算縮放比例。 */
  readonly legLength: number

  constructor(root: Object3D) {
    this.bones = Object.fromEntries(
      BONE_NAMES.map(name => [name, findBone(root, name)]),
    ) as Record<BoneName, Object3D>

    root.updateWorldMatrix(true, true)
    for (const bone of Object.values(this.bones))
      this.restWorldQuat.set(bone, bone.getWorldQuaternion(new Quaternion()))

    const worldPos = (name: BoneName) => this.bones[name].getWorldPosition(new Vector3())

    // rest 基底由模型自身關節位置建立,不假設模型朝向哪個世界軸
    const midUpLeg = mid(worldPos('LeftUpLeg'), worldPos('RightUpLeg'))
    const midArm = mid(worldPos('LeftArm'), worldPos('RightArm'))
    const torsoUp = midArm.clone().sub(midUpLeg)
    this.hipsRestBasisInv = basisFromXY(worldPos('LeftUpLeg').sub(worldPos('RightUpLeg')), torsoUp).invert()
    this.chestRestBasisInv = basisFromXY(worldPos('LeftArm').sub(worldPos('RightArm')), torsoUp).invert()

    this.legLength
      = (worldPos('LeftUpLeg').distanceTo(worldPos('LeftLeg'))
        + worldPos('LeftLeg').distanceTo(worldPos('LeftFoot'))
        + worldPos('RightUpLeg').distanceTo(worldPos('RightLeg'))
        + worldPos('RightLeg').distanceTo(worldPos('RightFoot'))) / 2
  }

  /** 以 world quaternion 設定骨頭(轉回 local,考慮親骨當下狀態)。 */
  private setWorldQuat(bone: Object3D, world: Quaternion) {
    const parentWorld = bone.parent!.getWorldQuaternion(new Quaternion())
    bone.quaternion.copy(parentWorld.invert().multiply(world))
  }

  /** 軀幹基底類:rest 基底 → 目標基底的世界旋轉,套在 rest world quat 上。 */
  private applyBasis(bone: Object3D, targetBasis: Quaternion, restBasisInv: Quaternion) {
    const world = targetBasis.clone().multiply(restBasisInv).multiply(this.restWorldQuat.get(bone)!)
    this.setWorldQuat(bone, world)
  }

  /** 方向類:模型當下骨頭方向 → 目標方向的最小世界旋轉。 */
  private aimBone(bone: Object3D, child: Object3D, targetDir: Vector3) {
    const bonePos = bone.getWorldPosition(new Vector3())
    const childPos = child.getWorldPosition(new Vector3())
    const currentDir = childPos.sub(bonePos)
    if (currentDir.lengthSq() === 0 || targetDir.lengthSq() === 0)
      return
    const delta = new Quaternion().setFromUnitVectors(currentDir.normalize(), targetDir.clone().normalize())
    const world = delta.multiply(bone.getWorldQuaternion(new Quaternion()))
    this.setWorldQuat(bone, world)
  }

  /**
   * 把一幀 keypoints 套到模型上,並平移 container 使骨盆落在資料位置。
   * 軀幹四點(雙肩雙髖)缺任一時整幀跳過(回傳 false,模型維持上一幀)。
   */
  apply(points: ReadonlyArray<Vector3 | null>, container: Object3D): boolean {
    const lShoulder = points[KP.leftShoulder]
    const rShoulder = points[KP.rightShoulder]
    const lHip = points[KP.leftHip]
    const rHip = points[KP.rightHip]
    if (!lShoulder || !rShoulder || !lHip || !rHip)
      return false

    const hipCenter = mid(lHip, rHip)
    const shoulderCenter = mid(lShoulder, rShoulder)
    const torsoUp = shoulderCenter.clone().sub(hipCenter)

    // 軀幹:骨盆與胸腔各自的完整朝向(由上往下套,子骨轉 local 時親骨已就位)
    this.applyBasis(this.bones.Hips, basisFromXY(lHip.clone().sub(rHip), torsoUp), this.hipsRestBasisInv)
    this.applyBasis(this.bones.Spine2, basisFromXY(lShoulder.clone().sub(rShoulder), torsoUp), this.chestRestBasisInv)

    // 脖子:肩膀中點 → 耳朵中點
    const lEar = points[KP.leftEar]
    const rEar = points[KP.rightEar]
    if (lEar && rEar)
      this.aimBone(this.bones.Neck, this.bones.Head, mid(lEar, rEar).sub(shoulderCenter))

    // 頭:耳線 + 鼻子朝向(rest 基底同胸腔:T-pose 頭與胸同向)
    const nose = points[KP.nose]
    if (lEar && rEar && nose)
      this.applyBasis(this.bones.Head, basisFromXZ(lEar.clone().sub(rEar), nose.clone().sub(mid(lEar, rEar))), this.chestRestBasisInv)

    for (const [boneName, childName, fromKp, toKp] of DIRECTION_RULES) {
      const from = points[fromKp]
      const to = points[toKp]
      if (from && to)
        this.aimBone(this.bones[boneName], this.bones[childName], to.clone().sub(from))
    }

    // 平移 container 使模型骨盆對到資料的髖中點(container 需為 scene 直屬子節點)
    const hipsWorld = this.bones.Hips.getWorldPosition(new Vector3())
    container.position.add(hipCenter.clone().sub(hipsWorld))
    return true
  }
}

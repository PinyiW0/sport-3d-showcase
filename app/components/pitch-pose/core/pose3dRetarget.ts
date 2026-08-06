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

/* ------------------------------------------------------------------ *
 * 骨長校正(骨頭拉伸)
 * ------------------------------------------------------------------ */

/**
 * 比例夾限。遮擋或重建失敗會產生離譜骨長,原封套用會把蒙皮網格扯壞;
 * 夾限外的段落會列進 report.clamped,那通常代表該段資料有問題值得追。
 */
const RATIO_MIN = 0.7
const RATIO_MAX = 1.4

/**
 * 校正回合數。共線時一回合就精確——修正量是「把差額加到鏈長」而非「span 乘比例」:
 * 軀幹量的是髖→肩中心,但被縮放的脊椎鏈只佔其中一段(肩膀還要再經 Shoulder 骨
 * 往上往外),乘法更新在鏈比 span 短時的收斂因子是 −偏移/目標,絕對值可能 >1
 * 而發散振盪;加法補差額沒這個問題。多跑幾回合是為了非共線的殘差與鏈間耦合。
 */
const CALIBRATION_PASSES = 3

export interface SkeletonCalibrationReport {
  /** 各段實際套用的比例(已對稱化、已夾限)。 */
  ratios: Record<string, number>
  /** 被夾限的段落——資料異常的訊號。 */
  clamped: string[]
  /** 資料不足而跳過的段落(該段 keypoint 整段缺測)。 */
  skipped: string[]
}

/** 一段可校正的骨長:量模型、量資料,再把整條鏈的 local position 等比縮放。 */
interface CalibrationSegment {
  key: string
  /**
   * 要縮放 local position 的骨頭。整條鏈一起縮,鏈本身的總長才會剛好等比——
   * 鏈上每段位移都乘 k,累加後的端點位移也恰好是 k 倍。
   */
  chain: Object3D[]
  /** 被縮放的那條鏈本身的端到端長度。 */
  measureChain: () => number
  /**
   * 要對上資料的那段距離。多數段落與 measureChain 相同;軀幹與頸部量的距離
   * 跨越了鏈以外的骨頭(肩膀的橫向偏移),兩者不等,修正量才要走加法。
   */
  measureSpan: () => number
  /** 單幀的資料長度;該幀缺測回 null。 */
  dataLength: (points: ReadonlyArray<Vector3 | null>) => number | null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function median(values: readonly number[]): number | null {
  if (values.length === 0)
    return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]!
}

/** 兩個 keypoint 的距離;任一缺測回 null。 */
function kpSpan(points: ReadonlyArray<Vector3 | null>, a: number, b: number): number | null {
  const pa = points[a]
  const pb = points[b]
  return pa && pb ? pa.distanceTo(pb) : null
}

/** 左右同名段的兩組端點:[左起, 左訖, 右起, 右訖]。 */
type SpanKeypoints = readonly [number, number, number, number]

/** 左右同名段取平均:真人身體接近對稱,平均可降噪並避免做出歪斜的人偶。 */
function symmetricSpan(
  points: ReadonlyArray<Vector3 | null>,
  leftA: number,
  leftB: number,
  rightA: number,
  rightB: number,
): number | null {
  const sides = [kpSpan(points, leftA, leftB), kpSpan(points, rightA, rightB)]
    .filter((v): v is number => v != null)
  return sides.length > 0 ? sides.reduce((sum, v) => sum + v, 0) / sides.length : null
}

function midOrNull(a: Vector3 | null | undefined, b: Vector3 | null | undefined): Vector3 | null {
  return a && b ? mid(a, b) : null
}

/**
 * 從 descendant 往上收集到 ancestor(不含 ancestor)的骨頭鏈。
 * 走不到 ancestor 回傳 null——rig 拓樸不符時寧可跳過該段,不要亂縮一通。
 */
function chainBetween(ancestor: Object3D, descendant: Object3D): Object3D[] | null {
  const chain: Object3D[] = []
  let node: Object3D | null = descendant
  while (node && node !== ancestor) {
    chain.push(node)
    node = node.parent
  }
  return node === ancestor ? chain : null
}

/**
 * 依資料量到的骨長校正模型骨架,讓身高、肩寬、軀幹長對上這名選手。
 *
 * **改的是子骨的 local position,不是 `bone.scale`。** 骨架裡一段骨頭的長度
 * 就是子骨相對親骨的位移;改 scale 會連帶縮放粗細、往下傳遞到整條子鏈
 * (得逐層反向補償)、且非等比 scale 在關節處產生剪切。改位置全部避開。
 *
 * **改完不要呼叫 `skeleton.calculateInverses()`。** 蒙皮矩陣是
 * `bone.matrixWorld × 綁定時的逆矩陣`,保留原始綁定網格才會跟著骨頭被拉長;
 * 重算逆矩陣等於重新綁定,骨頭移動了網格卻留在原處,校正就失效了。
 *
 * **必須在 `new PoseRetargeter()` 之前呼叫**——retargeter 建構時捕捉 rest
 * 姿態的四元數與腿長,要看到校正後的骨架(校正後 `fitModelScale()` 的整體
 * 等比縮放會自然收斂到約 1,留著當保險不影響結果)。
 *
 * 精度上限:COCO-17 的肩膀是體表標記點、Mixamo 的 `LeftArm` 是關節旋轉中心,
 * 兩者天生差幾公分,校正後仍有系統性殘差,不會完美貼合。
 */
export function calibrateSkeleton(
  root: Object3D,
  frames: readonly Pose3dFrameVec[],
): SkeletonCalibrationReport {
  root.updateWorldMatrix(true, true)

  const bones = Object.fromEntries(
    BONE_NAMES.map(name => [name, findBone(root, name)]),
  ) as Record<BoneName, Object3D>
  const worldPos = (name: BoneName) => bones[name].getWorldPosition(new Vector3())
  /**
   * 模型的肩中心。注意不能拿 Spine2 當肩線——Mixamo 的 Spine2 是胸椎骨,
   * 位置在肩線以下,肩膀還要再經 Shoulder 骨往上往外。用它當參考點會讓
   * 軀幹量得太短、頸部量得太長(兩個誤差還互相補償,不容易發現)。
   */
  const modelShoulderCenter = () => mid(worldPos('LeftArm'), worldPos('RightArm'))

  /** 左右同名段的模型長度平均,對應資料端的 symmetricSpan。 */
  const symmetricModelLength = (
    leftA: BoneName,
    leftB: BoneName,
    rightA: BoneName,
    rightB: BoneName,
  ) => (worldPos(leftA).distanceTo(worldPos(leftB)) + worldPos(rightA).distanceTo(worldPos(rightB))) / 2

  const segments: CalibrationSegment[] = []
  const skipped: string[] = []

  /** 四肢:左右成對,子骨即該段的長度載體。 */
  const limbs = [
    {
      key: '上臂',
      chain: [bones.LeftForeArm, bones.RightForeArm],
      model: () => symmetricModelLength('LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm'),
      kps: [KP.leftShoulder, KP.leftElbow, KP.rightShoulder, KP.rightElbow] as SpanKeypoints,
    },
    {
      key: '前臂',
      chain: [bones.LeftHand, bones.RightHand],
      model: () => symmetricModelLength('LeftForeArm', 'LeftHand', 'RightForeArm', 'RightHand'),
      kps: [KP.leftElbow, KP.leftWrist, KP.rightElbow, KP.rightWrist] as SpanKeypoints,
    },
    {
      key: '大腿',
      chain: [bones.LeftLeg, bones.RightLeg],
      model: () => symmetricModelLength('LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg'),
      kps: [KP.leftHip, KP.leftKnee, KP.rightHip, KP.rightKnee] as SpanKeypoints,
    },
    {
      key: '小腿',
      chain: [bones.LeftFoot, bones.RightFoot],
      model: () => symmetricModelLength('LeftLeg', 'LeftFoot', 'RightLeg', 'RightFoot'),
      kps: [KP.leftKnee, KP.leftAnkle, KP.rightKnee, KP.rightAnkle] as SpanKeypoints,
    },
  ]
  for (const limb of limbs) {
    segments.push({
      key: limb.key,
      chain: limb.chain,
      measureChain: limb.model,
      measureSpan: limb.model, // 量的就是被縮放的那一段
      dataLength: points => symmetricSpan(points, ...limb.kps),
    })
  }

  // 肩寬:縮放 Spine2→兩側 Arm 的整條鏈,兩臂根部的間距即等比變化
  const leftArmChain = chainBetween(bones.Spine2, bones.LeftArm)
  const rightArmChain = chainBetween(bones.Spine2, bones.RightArm)
  if (leftArmChain && rightArmChain) {
    segments.push({
      key: '肩寬',
      chain: [...leftArmChain, ...rightArmChain],
      // 兩側鏈同時等比縮放,兩臂根部的間距就是等比變化,鏈長即 span
      measureChain: () => worldPos('LeftArm').distanceTo(worldPos('RightArm')),
      measureSpan: () => worldPos('LeftArm').distanceTo(worldPos('RightArm')),
      dataLength: points => kpSpan(points, KP.leftShoulder, KP.rightShoulder),
    })
  }
  else {
    skipped.push('肩寬')
  }

  // 軀幹長:資料的髖中點→肩中點,長度載體是脊椎鏈(只佔這段距離的一部分,靠迭代收斂)
  const spineChain = chainBetween(bones.Hips, bones.Spine2)
  if (spineChain) {
    segments.push({
      key: '軀幹',
      chain: spineChain,
      measureChain: () => worldPos('Hips').distanceTo(worldPos('Spine2')),
      measureSpan: () => worldPos('Hips').distanceTo(modelShoulderCenter()),
      dataLength: (points) => {
        const hipCenter = midOrNull(points[KP.leftHip], points[KP.rightHip])
        const shoulderCenter = midOrNull(points[KP.leftShoulder], points[KP.rightShoulder])
        return hipCenter && shoulderCenter ? hipCenter.distanceTo(shoulderCenter) : null
      },
    })
  }
  else {
    skipped.push('軀幹')
  }

  // 頸+頭:資料的肩中點→耳中點,長度載體是 Neck→Head 鏈
  const headChain = chainBetween(bones.Spine2, bones.Head)
  if (headChain) {
    segments.push({
      key: '頸與頭',
      chain: headChain,
      measureChain: () => worldPos('Spine2').distanceTo(worldPos('Head')),
      measureSpan: () => modelShoulderCenter().distanceTo(worldPos('Head')),
      dataLength: (points) => {
        const shoulderCenter = midOrNull(points[KP.leftShoulder], points[KP.rightShoulder])
        const earCenter = midOrNull(points[KP.leftEar], points[KP.rightEar])
        return shoulderCenter && earCenter ? shoulderCenter.distanceTo(earCenter) : null
      },
    })
  }
  else {
    skipped.push('頸與頭')
  }

  // 資料端的目標長度只算一次(不受骨頭變動影響)
  const targets = new Map<string, number>()
  for (const segment of segments) {
    const samples = frames
      .map(frame => segment.dataLength(frame.points))
      .filter((v): v is number => v != null && v > 0)
    const target = median(samples)
    if (target == null)
      skipped.push(segment.key)
    else
      targets.set(segment.key, target)
  }

  // 定點迭代:每回合重量模型、只補殘差,累積比例才是最終套用值
  const ratios: Record<string, number> = {}
  const clampedSet = new Set<string>()
  for (let pass = 0; pass < CALIBRATION_PASSES; pass++) {
    for (const segment of segments) {
      const target = targets.get(segment.key)
      if (target == null)
        continue
      const chainLength = segment.measureChain()
      if (chainLength <= 0)
        continue
      const applied = ratios[segment.key] ?? 1
      // 把 span 的差額直接補到鏈長上,而非讓 span 乘比例——後者在鏈比 span 短時發散
      const wanted = applied * ((chainLength + target - segment.measureSpan()) / chainLength)
      const next = clamp(wanted, RATIO_MIN, RATIO_MAX)
      if (Math.abs(next - wanted) > 1e-9)
        clampedSet.add(segment.key)
      else
        clampedSet.delete(segment.key)
      for (const bone of segment.chain)
        bone.position.multiplyScalar(next / applied)
      ratios[segment.key] = next
      // 下一段要量到最新的世界座標,鏈與鏈之間有耦合(縮肩寬會動到肩中心)
      root.updateWorldMatrix(true, true)
    }
  }

  return { ratios, clamped: [...clampedSet], skipped }
}

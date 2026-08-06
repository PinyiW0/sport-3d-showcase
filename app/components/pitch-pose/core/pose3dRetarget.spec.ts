import type { Pose3dFrame } from '../../pitch-pose-data/core/parsePitchOutcome'
import { Bone, Group, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import {
  calibrateSkeleton,
  interpolateMissingPoints,
  medianLegLengthM,
  PoseRetargeter,
  toThreeSpace,
} from './pose3dRetarget'

/** COCO id 對照(同 COCO_KEYPOINT_NAMES 順序)。 */
const NOSE = 0
const L_EAR = 3
const R_EAR = 4
const L_SHOULDER = 5
const R_SHOULDER = 6
const L_ELBOW = 7
const R_ELBOW = 8
const L_WRIST = 9
const R_WRIST = 10
const L_HIP = 11
const R_HIP = 12
const L_KNEE = 13
const R_KNEE = 14
const L_ANKLE = 15
const R_ANKLE = 16

function frame(timestampMs: number, points: Array<[number, number, number] | null>): Pose3dFrame {
  return { timestampMs, points }
}

function nulls(count: number): null[] {
  return Array.from({ length: count }).fill(null) as null[]
}

describe('interpolateMissingPoints', () => {
  it('中段缺測依時間軸線性插值', () => {
    const frames = [
      frame(0, [[0, 0, 0], ...nulls(16)]),
      frame(10, [null, ...nulls(16)]),
      frame(40, [[40, 80, 120], ...nulls(16)]),
    ]
    const filled = interpolateMissingPoints(frames)
    expect(filled[1]!.points[0]).toEqual([10, 20, 30])
  })

  it('頭尾缺測取最近已知值;整段全缺維持 null;原資料不被改動', () => {
    const frames = [
      frame(0, [null, ...nulls(16)]),
      frame(10, [[5, 5, 5], null, ...nulls(15)]),
      frame(20, [null, ...nulls(16)]),
    ]
    const filled = interpolateMissingPoints(frames)
    expect(filled[0]!.points[0]).toEqual([5, 5, 5])
    expect(filled[2]!.points[0]).toEqual([5, 5, 5])
    expect(filled[0]!.points[1]).toBeNull()
    expect(frames[0]!.points[0]).toBeNull()
  })
})

describe('toThreeSpace', () => {
  it('cm z-up → m y-up,繞 x 軸 -90° 保持右手系', () => {
    const [converted] = toThreeSpace([frame(0, [[100, 200, 300], ...nulls(16)])])
    expect(converted!.points[0]).toEqual(new Vector3(1, 3, -2))
    expect(converted!.points[1]).toBeNull()
  })
})

/**
 * 最小 Mixamo 拓樸的測試 rig:T-pose、面向 +z、腿長 0.9m(0.45 + 0.45)。
 * 骨骼名稱帶 "mixamorig:" 前綴,驗證命名剝除。
 */
function makeRig() {
  const bones: Record<string, Bone> = {}
  function bone(name: string, parent: Bone | Group, position: [number, number, number]) {
    const b = new Bone()
    b.name = `mixamorig:${name}`
    b.position.set(...position)
    parent.add(b)
    bones[name] = b
    return b
  }
  const root = new Group()
  const hips = bone('Hips', root, [0, 1, 0])
  const spine2 = bone('Spine2', hips, [0, 0.3, 0])
  const neck = bone('Neck', spine2, [0, 0.2, 0])
  bone('Head', neck, [0, 0.1, 0])
  for (const [side, sign] of [['Left', 1], ['Right', -1]] as const) {
    const arm = bone(`${side}Arm`, spine2, [sign * 0.2, 0.15, 0])
    const foreArm = bone(`${side}ForeArm`, arm, [sign * 0.3, 0, 0])
    bone(`${side}Hand`, foreArm, [sign * 0.25, 0, 0])
    const upLeg = bone(`${side}UpLeg`, hips, [sign * 0.1, -0.05, 0])
    const leg = bone(`${side}Leg`, upLeg, [0, -0.45, 0])
    bone(`${side}Foot`, leg, [0, -0.45, 0])
  }
  root.updateWorldMatrix(true, true)
  return { root, bones }
}

/** 一組「面向 +x、右臂前平舉」的 keypoints(three 座標、公尺)。 */
function makeTargetPoints(): Array<Vector3 | null> {
  const points: Array<Vector3 | null> = nulls(17)
  // 面向 +x → 身體左側在 -z
  points[L_HIP] = new Vector3(0, 1, -0.1)
  points[R_HIP] = new Vector3(0, 1, 0.1)
  points[L_SHOULDER] = new Vector3(0, 1.5, -0.2)
  points[R_SHOULDER] = new Vector3(0, 1.5, 0.2)
  points[L_ELBOW] = new Vector3(0, 1.2, -0.25)
  points[L_WRIST] = new Vector3(0, 0.95, -0.25)
  points[R_ELBOW] = new Vector3(0.3, 1.5, 0.2) // 右臂朝 +x 前平舉
  points[R_WRIST] = new Vector3(0.55, 1.5, 0.2)
  points[L_KNEE] = new Vector3(0.05, 0.55, -0.1)
  points[R_KNEE] = new Vector3(-0.05, 0.55, 0.1)
  points[L_ANKLE] = new Vector3(0.05, 0.1, -0.1)
  points[R_ANKLE] = new Vector3(-0.05, 0.1, 0.1)
  points[NOSE] = new Vector3(0.12, 1.72, 0)
  points[L_EAR] = new Vector3(0, 1.72, -0.08)
  points[R_EAR] = new Vector3(0, 1.72, 0.08)
  return points
}

function worldDir(from: Bone, to: Bone): Vector3 {
  return to.getWorldPosition(new Vector3()).sub(from.getWorldPosition(new Vector3())).normalize()
}

describe('poseRetargeter', () => {
  it('rest 腿長由模型關節距離算出', () => {
    const { root } = makeRig()
    expect(new PoseRetargeter(root).legLength).toBeCloseTo(0.9, 6)
  })

  it('套用一幀後,模型骨頭方向對齊 keypoint 方向、骨盆對齊髖中點', () => {
    const { root, bones } = makeRig()
    const retargeter = new PoseRetargeter(root)
    const container = new Group()
    container.add(root)
    const points = makeTargetPoints()

    expect(retargeter.apply(points, container)).toBe(true)
    container.updateWorldMatrix(true, true)

    const cases: Array<[string, string, number, number]> = [
      ['LeftArm', 'LeftForeArm', L_SHOULDER, L_ELBOW],
      ['LeftForeArm', 'LeftHand', L_ELBOW, L_WRIST],
      ['RightArm', 'RightForeArm', R_SHOULDER, R_ELBOW],
      ['RightForeArm', 'RightHand', R_ELBOW, R_WRIST],
      ['LeftUpLeg', 'LeftLeg', L_HIP, L_KNEE],
      ['LeftLeg', 'LeftFoot', L_KNEE, L_ANKLE],
      ['RightUpLeg', 'RightLeg', R_HIP, R_KNEE],
      ['RightLeg', 'RightFoot', R_KNEE, R_ANKLE],
    ]
    for (const [bone, child, fromKp, toKp] of cases) {
      const target = points[toKp]!.clone().sub(points[fromKp]!).normalize()
      expect(worldDir(bones[bone]!, bones[child]!).dot(target), `${bone} 方向`).toBeGreaterThan(0.999)
    }

    // 骨盆(髖線)轉向:模型左髖 → 世界 -z(面向 +x 時身體左側)
    const hipLine = worldDir(bones.RightUpLeg!, bones.LeftUpLeg!)
    expect(hipLine.dot(new Vector3(0, 0, -1))).toBeGreaterThan(0.99)

    // container 平移後,模型骨盆位於資料髖中點
    const hipsWorld = bones.Hips!.getWorldPosition(new Vector3())
    expect(hipsWorld.distanceTo(new Vector3(0, 1, 0))).toBeLessThan(1e-6)
  })

  it('軀幹 keypoint 缺任一 → 整幀跳過且不動骨頭', () => {
    const { root, bones } = makeRig()
    const retargeter = new PoseRetargeter(root)
    const container = new Group()
    container.add(root)
    const before = bones.Hips!.quaternion.clone()

    const points = makeTargetPoints()
    points[L_SHOULDER] = null
    expect(retargeter.apply(points, container)).toBe(false)
    expect(bones.Hips!.quaternion.equals(before)).toBe(true)
  })
})

/**
 * 校正測試用的一幀。makeRig() 的 rest 量測值:上臂 0.3、前臂 0.25、大腿 0.45、
 * 小腿 0.45、肩寬 0.4、髖→肩中心 0.45、肩中心→Head 0.15。
 * 目標一律設成 1.2 倍(肩寬 1.25 倍),校正後模型應剛好等於這裡的距離。
 *
 * 注意「髖→肩中心」不是「Hips→Spine2」:Spine2 是胸椎骨,肩膀還要再經
 * Shoulder 骨往上往外——這正是校正要處理的偏移。
 */
function makeCalibrationPoints(): Array<Vector3 | null> {
  const points: Array<Vector3 | null> = nulls(17)
  points[L_HIP] = new Vector3(0.1, 1.2, 0)
  points[R_HIP] = new Vector3(-0.1, 1.2, 0)
  points[L_SHOULDER] = new Vector3(0.25, 1.74, 0) // 軀幹 0.54 = 0.45 × 1.2
  points[R_SHOULDER] = new Vector3(-0.25, 1.74, 0) // 肩寬 0.5 = 0.4 × 1.25
  points[L_ELBOW] = new Vector3(0.25, 1.38, 0) // 上臂 0.36 = 0.3 × 1.2
  points[R_ELBOW] = new Vector3(-0.25, 1.38, 0)
  points[L_WRIST] = new Vector3(0.25, 1.08, 0) // 前臂 0.3 = 0.25 × 1.2
  points[R_WRIST] = new Vector3(-0.25, 1.08, 0)
  points[L_KNEE] = new Vector3(0.1, 0.66, 0) // 大腿 0.54 = 0.45 × 1.2
  points[R_KNEE] = new Vector3(-0.1, 0.66, 0)
  points[L_ANKLE] = new Vector3(0.1, 0.12, 0) // 小腿 0.54 = 0.45 × 1.2
  points[R_ANKLE] = new Vector3(-0.1, 0.12, 0)
  points[L_EAR] = new Vector3(0.08, 1.92, 0) // 肩中→耳中 0.18 = 0.15 × 1.2
  points[R_EAR] = new Vector3(-0.08, 1.92, 0)
  return points
}

function boneSpan(a: Bone, b: Bone): number {
  return a.getWorldPosition(new Vector3()).distanceTo(b.getWorldPosition(new Vector3()))
}

/** 模型的肩中心 = 雙臂根部中點(不是 Spine2)。 */
function shoulderCenterOf(bones: Record<string, Bone>): Vector3 {
  return bones.LeftArm!.getWorldPosition(new Vector3())
    .add(bones.RightArm!.getWorldPosition(new Vector3()))
    .multiplyScalar(0.5)
}

describe('calibrateSkeleton', () => {
  it('各段骨長拉伸到資料量到的長度,肩寬與軀幹一併對上', () => {
    const { root, bones } = makeRig()
    const frames = [{ timestampMs: 0, points: makeCalibrationPoints() }]

    const report = calibrateSkeleton(root, frames)

    expect(report.clamped).toEqual([])
    expect(report.skipped).toEqual([])
    expect(report.ratios['上臂']).toBeCloseTo(1.2, 6)
    expect(report.ratios['肩寬']).toBeCloseTo(1.25, 6)

    const shoulderCenter = shoulderCenterOf(bones)
    const cases: Array<[string, number, number]> = [
      ['上臂', boneSpan(bones.LeftArm!, bones.LeftForeArm!), 0.36],
      ['前臂', boneSpan(bones.LeftForeArm!, bones.LeftHand!), 0.3],
      ['大腿', boneSpan(bones.LeftUpLeg!, bones.LeftLeg!), 0.54],
      ['小腿', boneSpan(bones.LeftLeg!, bones.LeftFoot!), 0.54],
      ['肩寬', boneSpan(bones.LeftArm!, bones.RightArm!), 0.5],
      ['軀幹（髖→肩中心）', bones.Hips!.getWorldPosition(new Vector3()).distanceTo(shoulderCenter), 0.54],
      ['頸與頭（肩中心→頭）', shoulderCenter.distanceTo(bones.Head!.getWorldPosition(new Vector3())), 0.18],
    ]
    for (const [label, actual, expected] of cases)
      expect(actual, label).toBeCloseTo(expected, 6)
  })

  it('校正後 retargeter 的腿長等於資料腿長(等比縮放收斂到 1)', () => {
    const { root } = makeRig()
    const frames = [{ timestampMs: 0, points: makeCalibrationPoints() }]

    calibrateSkeleton(root, frames)

    // 大腿 0.54 + 小腿 0.54;等比縮放 = 資料腿長 / 模型腿長
    expect(new PoseRetargeter(root).legLength).toBeCloseTo(1.08, 6)
    expect(medianLegLengthM(frames)!).toBeCloseTo(1.08, 6)
  })

  it('離譜比例夾限在 1.4 倍並列進 report.clamped', () => {
    const { root, bones } = makeRig()
    const points = makeCalibrationPoints()
    // 大腿拉到 1.35(模型 0.45 的 3 倍),遠超上限
    points[L_KNEE] = new Vector3(0.1, -0.15, 0)
    points[R_KNEE] = new Vector3(-0.1, -0.15, 0)

    const report = calibrateSkeleton(root, [{ timestampMs: 0, points }])

    expect(report.clamped).toContain('大腿')
    expect(report.ratios['大腿']).toBeCloseTo(1.4, 6)
    expect(boneSpan(bones.LeftUpLeg!, bones.LeftLeg!)).toBeCloseTo(0.45 * 1.4, 6)
  })

  it('該段 keypoint 整段缺測時跳過該段,不動骨頭', () => {
    const { root, bones } = makeRig()
    const points = makeCalibrationPoints()
    points[L_ELBOW] = null
    points[R_ELBOW] = null
    const before = boneSpan(bones.LeftArm!, bones.LeftForeArm!)

    const report = calibrateSkeleton(root, [{ timestampMs: 0, points }])

    expect(report.skipped).toContain('上臂')
    expect(report.ratios['上臂']).toBeUndefined()
    expect(boneSpan(bones.LeftArm!, bones.LeftForeArm!)).toBeCloseTo(before, 6)
  })

  it('左右不對稱的資料取兩側平均,做出的人偶仍左右對稱', () => {
    const { root, bones } = makeRig()
    const points = makeCalibrationPoints()
    // 左大腿 0.45(1.0×)、右大腿 0.63(1.4×) → 平均 0.54(1.2×)
    points[L_KNEE] = new Vector3(0.1, 0.75, 0)
    points[R_KNEE] = new Vector3(-0.1, 0.57, 0)
    // 小腿改由膝蓋量起,兩側膝蓋高度不同不影響本測試的斷言

    const report = calibrateSkeleton(root, [{ timestampMs: 0, points }])

    expect(report.ratios['大腿']).toBeCloseTo(1.2, 6)
    expect(boneSpan(bones.LeftUpLeg!, bones.LeftLeg!))
      .toBeCloseTo(boneSpan(bones.RightUpLeg!, bones.RightLeg!), 6)
  })

  it('取中位數而非平均,單幀離群值不影響校正', () => {
    const { root, bones } = makeRig()
    const clean = makeCalibrationPoints()
    const outlier = makeCalibrationPoints()
    outlier[L_ELBOW] = new Vector3(0.25, -3, 0) // 單幀重建爆掉
    outlier[R_ELBOW] = new Vector3(-0.25, -3, 0)

    const report = calibrateSkeleton(root, [
      { timestampMs: 0, points: clean },
      { timestampMs: 1, points: makeCalibrationPoints() },
      { timestampMs: 2, points: outlier },
    ])

    expect(report.ratios['上臂']).toBeCloseTo(1.2, 6)
    expect(boneSpan(bones.LeftArm!, bones.LeftForeArm!)).toBeCloseTo(0.36, 6)
  })
})

describe('medianLegLengthM', () => {
  it('取每幀左右腿平均的中位數,無腿部資料回傳 null', () => {
    const makeVecFrame = (scale: number) => ({
      timestampMs: 0,
      points: Array.from({ length: 17 }, (_, id) => {
        if (id === L_HIP || id === R_HIP)
          return new Vector3(0, 1 * scale, 0)
        if (id === L_KNEE || id === R_KNEE)
          return new Vector3(0, 0.5 * scale, 0)
        if (id === L_ANKLE || id === R_ANKLE)
          return new Vector3(0, 0, 0)
        return null
      }),
    })
    expect(medianLegLengthM([makeVecFrame(1), makeVecFrame(2), makeVecFrame(3)])).toBeCloseTo(2, 6)
    expect(medianLegLengthM([{ timestampMs: 0, points: nulls(17) }])).toBeNull()
  })
})

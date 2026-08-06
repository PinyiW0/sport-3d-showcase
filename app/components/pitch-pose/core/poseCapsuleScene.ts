/**
 * 程式生成素體場景（框架無關，同 poseSkeletonScene.ts 的範式）。
 *
 * 不載任何外部模型檔：每幀直接以 17 個 COCO keypoint 組出人形——
 * 四肢圓柱、關節球、依肩髖四點定向的橢球軀幹、頭與脖子。
 * keypoints 直接驅動幾何，沒有 retarget 的近似誤差（對照 Pose3dHuman 的
 * 「手腕、脊椎為近似值」限制）；左半身橘、右半身藍，部位對應一眼可辨。
 *
 * 座標同骨架場景：資料原生 cm、z-up，直接當世界單位。
 */
import type { Pose3dFrame } from '../../pitch-pose-data/core/parsePitchOutcome'
import type { AxisBox } from '../../scene3d/core/axisBox'
import type { HoverLabel } from '../../scene3d/core/hoverLabel'
import {
  Box3,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from 'three'
import { findPoseFrame } from '../../pitch-pose-data/core/findPoseFrame'
import { computeSkeletonBounds } from '../../pitch-pose-data/core/skeletonBounds'
import { COCO_KEYPOINT_NAMES } from '../../pitch-pose-data/core/types'
import { AXIS_THEME, createAxisBox, LABEL_MARGIN, rangeToBounds, SCENE_BG } from '../../scene3d/core/axisBox'
import { createHoverLabel } from '../../scene3d/core/hoverLabel'
import { Viewport } from '../../scene3d/core/viewport'
import { SkeletonOverlay } from './skeletonOverlay'

export interface PoseCapsuleSceneOptions {
  /** 深色畫布，預設 false。 */
  dark?: boolean
  /** 骨架疊顯初始顯示狀態，預設開。 */
  skeleton?: boolean
}

/** 左半身（樣本投手為左投的投球手側）橘、右半身藍、軀幹與頭中性。 */
const BODY_COLOR = { left: 0xF97316, right: 0x38BDF8, core: 0xB8B2A7 } as const

/** COCO-17 keypoint 索引（types.ts 的 COCO_KEYPOINT_NAMES 順序）。 */
const KP = {
  nose: 0,
  leftEar: 3,
  rightEar: 4,
  leftShoulder: 5,
  rightShoulder: 6,
  leftHip: 11,
  rightHip: 12,
} as const

type Side = 'left' | 'right'

/** 四肢：兩端 keypoint、半徑（cm，近端粗遠端細由幾何錐度處理）、左右側。 */
const LIMBS: ReadonlyArray<{ a: number, b: number, radius: number, side: Side }> = [
  { a: 5, b: 7, radius: 5.2, side: 'left' }, // 上臂
  { a: 7, b: 9, radius: 4.0, side: 'left' }, // 前臂
  { a: 6, b: 8, radius: 5.2, side: 'right' },
  { a: 8, b: 10, radius: 4.0, side: 'right' },
  { a: 11, b: 13, radius: 7.5, side: 'left' }, // 大腿
  { a: 13, b: 15, radius: 5.5, side: 'left' }, // 小腿
  { a: 12, b: 14, radius: 7.5, side: 'right' },
  { a: 14, b: 16, radius: 5.5, side: 'right' },
]

/** 關節球：蓋住四肢圓柱的接縫；手（腕）與腳（踝）也以球收尾。 */
const JOINTS: ReadonlyArray<{ i: number, radius: number, side: Side }> = [
  { i: 5, radius: 5.5, side: 'left' },
  { i: 6, radius: 5.5, side: 'right' },
  { i: 7, radius: 4.5, side: 'left' },
  { i: 8, radius: 4.5, side: 'right' },
  { i: 9, radius: 4.5, side: 'left' },
  { i: 10, radius: 4.5, side: 'right' },
  { i: 11, radius: 6.2, side: 'left' },
  { i: 12, radius: 6.2, side: 'right' },
  { i: 13, radius: 5.8, side: 'left' },
  { i: 14, radius: 5.8, side: 'right' },
  { i: 15, radius: 4.8, side: 'left' },
  { i: 16, radius: 4.8, side: 'right' },
]

/** 骨架疊顯的關節球半徑（cm），同 poseSkeletonScene 的取值。 */
const OVERLAY_JOINT_RADIUS_CM = 3.2
/** 預設視角：三壘側斜上方，同骨架場景。 */
const DEFAULT_EYE_DIR = new Vector3(2.4, -1.8, 0.9)
/** 圓柱幾何的原生軸向，setSegment 以此對到兩關節連線方向。 */
const UNIT_Y = new Vector3(0, 1, 0)

/** 兩點中點；任一為 null 回傳另一點（都缺回 null）。 */
function mid(a: Vector3 | null, b: Vector3 | null): Vector3 | null {
  if (a && b)
    return a.clone().add(b).multiplyScalar(0.5)
  return a ?? b
}

export class PoseCapsuleScene {
  private viewport: Viewport
  private axes: AxisBox
  private hover: HoverLabel
  private overlay: SkeletonOverlay

  /** 素體所有部位掛在同一個 group，查無幀時整組隱藏。 */
  private body = new Group()
  private limbMeshes: Mesh[]
  private jointMeshes: Mesh[]
  private torso: Mesh
  private head: Mesh
  private neck: Mesh

  /** 當下幀關節座標：hover 判定與骨架疊顯共用；缺測為 null。 */
  private hoverPoints: Array<Vector3 | null> = COCO_KEYPOINT_NAMES.map(() => null)

  private frames: readonly Pose3dFrame[]
  private dark: boolean
  private disposed = false

  private tmpV = new Vector3()
  private tmpM = new Matrix4()

  constructor(
    container: HTMLElement,
    frames: readonly Pose3dFrame[],
    opts: PoseCapsuleSceneOptions = {},
  ) {
    this.frames = frames
    this.dark = opts.dark ?? false

    this.viewport = new Viewport(container, {
      background: this.dark ? SCENE_BG.dark : SCENE_BG.light,
    })

    // MeshStandardMaterial 需要光源（骨架場景全用 MeshBasicMaterial 所以不用）。
    // HemisphereLight 的天光方向取自 position 向量：z-up 世界要指 +z 才是「上」。
    const sky = new HemisphereLight(0xFFFFFF, 0x556677, 2.2)
    sky.position.set(0, 0, 1)
    this.viewport.scene.add(sky)
    const sun = new DirectionalLight(0xFFFFFF, 2)
    const { min, max } = rangeToBounds(computeSkeletonBounds(frames))
    const center = min.clone().add(max).multiplyScalar(0.5)
    sun.position.copy(center).add(new Vector3(300, -500, 800))
    sun.target.position.copy(center)
    this.viewport.scene.add(sun, sun.target)

    const materials: Record<Side | 'core', MeshStandardMaterial> = {
      left: new MeshStandardMaterial({ color: BODY_COLOR.left, roughness: 0.55 }),
      right: new MeshStandardMaterial({ color: BODY_COLOR.right, roughness: 0.55 }),
      core: new MeshStandardMaterial({ color: BODY_COLOR.core, roughness: 0.65 }),
    }
    const unitSphere = new SphereGeometry(1, 20, 14)

    this.limbMeshes = LIMBS.map((limb) => {
      // 單位高圓柱，每幀以 scale.y 拉成兩關節間距；0.82 錐度讓遠端略細
      const mesh = new Mesh(new CylinderGeometry(limb.radius, limb.radius * 0.82, 1, 14), materials[limb.side])
      this.body.add(mesh)
      return mesh
    })
    this.jointMeshes = JOINTS.map((joint) => {
      const mesh = new Mesh(unitSphere, materials[joint.side])
      mesh.scale.setScalar(joint.radius)
      this.body.add(mesh)
      return mesh
    })
    this.torso = new Mesh(unitSphere, materials.core)
    this.head = new Mesh(unitSphere, materials.core)
    this.neck = new Mesh(new CylinderGeometry(4.5, 4.5, 1, 12), materials.core)
    this.body.add(this.torso, this.head, this.neck)

    // 每幀就地改 transform 不重算 bounding sphere，開著剔除部位會消失
    this.body.traverse((node) => {
      node.frustumCulled = false
    })
    this.viewport.scene.add(this.body)

    this.overlay = new SkeletonOverlay(this.viewport.scene, {
      jointRadius: OVERLAY_JOINT_RADIUS_CM,
    })
    this.overlay.setVisible(opts.skeleton ?? true)

    this.axes = this.buildAxes()

    this.hover = createHoverLabel(
      container,
      this.viewport.camera,
      () => ({ points: this.hoverPoints, names: COCO_KEYPOINT_NAMES }),
    )

    this.viewport.onResize((width, height) => {
      this.overlay.setResolution(width, height)
    })

    this.frameCamera()
    this.viewport.start(() => {
      this.axes.update(this.viewport.camera)
      this.hover.update()
    })
  }

  /** 顯示指定時間的幀；null 或查無對應幀時隱藏素體。 */
  setTime(timeMs: number | null): void {
    if (this.disposed)
      return
    const frame = timeMs == null ? null : findPoseFrame(this.frames, timeMs)
    this.applyFrame(frame)
  }

  setFrames(frames: readonly Pose3dFrame[]): void {
    if (this.disposed)
      return
    this.frames = frames
    this.rebuildAxes()
    this.frameCamera()
  }

  setSkeletonVisible(visible: boolean): void {
    if (!this.disposed)
      this.overlay.setVisible(visible)
  }

  setDark(dark: boolean): void {
    if (this.disposed || dark === this.dark)
      return
    this.dark = dark
    this.viewport.setBackground(dark ? SCENE_BG.dark : SCENE_BG.light)
    this.rebuildAxes()
  }

  dispose(): void {
    this.disposed = true
    this.hover.dispose()
    this.axes.dispose()
    // viewport.dispose() 會遍歷場景釋放 geometry / material，素體與疊顯層都在裡面
    this.viewport.dispose()
  }

  private buildAxes(): AxisBox {
    const axes = createAxisBox({
      range: computeSkeletonBounds(this.frames),
      colors: this.dark ? AXIS_THEME.dark : AXIS_THEME.light,
    })
    this.viewport.scene.add(axes)
    return axes
  }

  private rebuildAxes(): void {
    this.viewport.scene.remove(this.axes)
    this.axes.dispose()
    this.axes = this.buildAxes()
  }

  private frameCamera(): void {
    const { min, max, span } = rangeToBounds(computeSkeletonBounds(this.frames))
    const box = new Box3(min, max).expandByVector(span.multiplyScalar(LABEL_MARGIN))
    this.viewport.frameBox(box, DEFAULT_EYE_DIR)
  }

  /** 圓柱從 a 拉到 b：位置取中點、scale.y 取間距、姿態由局部 +y 對到 ab 方向。 */
  private setSegment(mesh: Mesh, a: Vector3 | null, b: Vector3 | null): void {
    if (!a || !b) {
      mesh.visible = false
      return
    }
    mesh.visible = true
    mesh.position.copy(a).add(b).multiplyScalar(0.5)
    this.tmpV.copy(b).sub(a)
    mesh.scale.y = Math.max(this.tmpV.length(), 0.01)
    mesh.quaternion.setFromUnitVectors(UNIT_Y, this.tmpV.normalize())
  }

  private applyFrame(frame: Pose3dFrame | null): void {
    if (!frame) {
      this.body.visible = false
      this.hoverPoints.fill(null)
      return
    }
    this.body.visible = true

    // tuple → Vector3 快取：hover、疊顯、素體幾何共用同一份
    for (let i = 0; i < COCO_KEYPOINT_NAMES.length; i++) {
      const point = frame.points[i]
      this.hoverPoints[i] = point
        ? (this.hoverPoints[i] ?? new Vector3()).set(point[0], point[1], point[2])
        : null
    }
    const p = this.hoverPoints
    this.overlay.apply(p)

    LIMBS.forEach((limb, i) => this.setSegment(this.limbMeshes[i]!, p[limb.a] ?? null, p[limb.b] ?? null))
    JOINTS.forEach((joint, i) => {
      const mesh = this.jointMeshes[i]!
      const point = p[joint.i]
      mesh.visible = !!point
      if (point)
        mesh.position.copy(point)
    })

    // 軀幹：肩髖四點 → 有朝向的橢球（y 軸沿脊柱、x 軸沿雙肩、z 軸前後）
    const shoulderCenter = mid(p[KP.leftShoulder] ?? null, p[KP.rightShoulder] ?? null)
    const hipCenter = mid(p[KP.leftHip] ?? null, p[KP.rightHip] ?? null)
    if (shoulderCenter && hipCenter) {
      this.torso.visible = true
      this.torso.position.copy(shoulderCenter).add(hipCenter).multiplyScalar(0.5)
      const spine = this.tmpV.copy(shoulderCenter).sub(hipCenter)
      const torsoLength = spine.length()
      spine.normalize()
      const lShoulder = p[KP.leftShoulder]
      const rShoulder = p[KP.rightShoulder]
      const across = lShoulder && rShoulder
        ? lShoulder.clone().sub(rShoulder)
        : new Vector3(1, 0, 0)
      across.sub(spine.clone().multiplyScalar(across.dot(spine))).normalize()
      const front = new Vector3().crossVectors(across, spine)
      this.torso.quaternion.setFromRotationMatrix(this.tmpM.makeBasis(across, spine, front))
      const shoulderWidth = lShoulder && rShoulder ? lShoulder.distanceTo(rShoulder) : 36
      this.torso.scale.set(shoulderWidth * 0.66, torsoLength * 0.72, shoulderWidth * 0.42)
    }
    else {
      this.torso.visible = false
    }

    // 頭：雙耳中點（缺測退用鼻子）；脖子接肩膀中心
    const headCenter = mid(p[KP.leftEar] ?? null, p[KP.rightEar] ?? null) ?? p[KP.nose] ?? null
    if (headCenter) {
      this.head.visible = true
      this.head.position.copy(headCenter)
      this.head.scale.set(9.5, 10.5, 11.5)
    }
    else {
      this.head.visible = false
    }
    this.setSegment(this.neck, shoulderCenter, headCenter)
  }
}

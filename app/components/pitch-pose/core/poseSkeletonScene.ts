/**
 * 3D 骨架場景（框架無關，同 baseball-spin/core/scene.ts 的範式）。
 *
 * 取代原本的 Plotly scatter3d 實作。換掉之後消失的三個包袱：
 * - 不再需要讀 Plotly 私有結構 `gd._fullLayout.scene._scene.getCamera()` 保視角
 * - 不再需要「拖曳時暫停重繪」的 workaround：OrbitControls 與資料更新天生解耦
 * - 不再需要隱形 anchor trace 與 aspectratio 人工換算：真實 3D 空間天然等比例
 *
 * 渲染物件建構一次，之後每幀只覆寫 buffer 內容，不重配置。
 */
import type { InterleavedBufferAttribute } from 'three'
import type { Pose3dFrame } from '../../pitch-pose-data/core/parsePitchOutcome'
import type { AxisBox } from '../../scene3d/core/axisBox'
import type { HoverLabel } from '../../scene3d/core/hoverLabel'
import {
  BackSide,
  Box3,
  Color,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  SphereGeometry,
  Vector3,
} from 'three'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'
import { findPoseFrame } from '../../pitch-pose-data/core/findPoseFrame'
import { computeSkeletonBounds } from '../../pitch-pose-data/core/skeletonBounds'
import { COCO_KEYPOINT_NAMES, SKELETON_EDGES } from '../../pitch-pose-data/core/types'
import { AXIS_THEME, createAxisBox, LABEL_MARGIN, rangeToBounds, SCENE_BG } from '../../scene3d/core/axisBox'
import { createHoverLabel } from '../../scene3d/core/hoverLabel'
import { Viewport } from '../../scene3d/core/viewport'

export interface PoseSkeletonSceneOptions {
  /** 骨架顏色，預設綠。 */
  color?: string
  /** 深色畫布，預設 false。 */
  dark?: boolean
}

/**
 * 關節球半徑（cm）。要明顯大於骨頭線寬的投影寬度，否則關節會整顆埋進骨頭裡看不見——
 * 骨頭線寬是像素單位（6px），這裡是 world 單位，預設視角下 3.2cm 約當 9px。
 */
const JOINT_RADIUS_CM = 3.2
/**
 * 關節外框球的放大倍率。白色關節配淺色畫布時，沒有外框根本看不出來
 * （Plotly 版的 marker 是「白色填充 + 骨架色 1px 邊框」，這裡要還原那圈邊框）。
 * 做法是 inverted hull：稍大的球只畫背面，正面被白球擋住，只露出邊緣一圈。
 */
const JOINT_OUTLINE_SCALE = 1.3
/** 骨頭線寬（像素），對齊原 Plotly 版的 `line.width: 6`。 */
const BONE_WIDTH_PX = 6
/** 預設視角：三壘側斜上方，沿用 Plotly 版的相機方向比例。 */
const DEFAULT_EYE_DIR = new Vector3(2.4, -1.8, 0.9)

export class PoseSkeletonScene {
  private viewport: Viewport
  private axes: AxisBox
  private hover: HoverLabel

  private boneGeometry = new LineSegmentsGeometry()
  private boneMaterial: LineMaterial
  private bones: LineSegments2
  /** 骨頭端點的 buffer，直接由 LineSegmentsGeometry 共用，每幀就地覆寫。 */
  private bonePositions = new Float32Array(SKELETON_EDGES.length * 6)

  private joints: InstancedMesh
  /** 關節的外框層（骨架色，只畫背面），讓白色關節在淺色畫布上也分得出來。 */
  private jointOutline: InstancedMesh
  private jointOutlineMaterial: MeshBasicMaterial
  private jointDummy = new Object3D()

  /** 當下幀的關節世界座標，供 hover 判定；缺測為 null。 */
  private hoverPoints: Array<Vector3 | null> = COCO_KEYPOINT_NAMES.map(() => null)

  private frames: readonly Pose3dFrame[]
  private color: string
  private dark: boolean
  private disposed = false

  constructor(
    container: HTMLElement,
    frames: readonly Pose3dFrame[],
    opts: PoseSkeletonSceneOptions = {},
  ) {
    this.frames = frames
    this.color = opts.color ?? '#22c55e'
    this.dark = opts.dark ?? false

    this.viewport = new Viewport(container, {
      background: this.dark ? SCENE_BG.dark : SCENE_BG.light,
    })

    this.boneMaterial = new LineMaterial({
      color: new Color(this.color).getHex(),
      linewidth: BONE_WIDTH_PX,
    })
    this.boneGeometry.setPositions(this.bonePositions)
    this.bones = new LineSegments2(this.boneGeometry, this.boneMaterial)
    // 每幀就地改 buffer 不重算 bounding sphere，開著剔除模型會整個消失
    this.bones.frustumCulled = false
    this.viewport.scene.add(this.bones)

    // 先加外框層再加白球：兩者同位置，靠 BackSide 與半徑差讓外框只露出邊緣
    this.jointOutlineMaterial = new MeshBasicMaterial({
      color: new Color(this.color).getHex(),
      side: BackSide,
    })
    this.jointOutline = new InstancedMesh(
      new SphereGeometry(JOINT_RADIUS_CM * JOINT_OUTLINE_SCALE, 12, 8),
      this.jointOutlineMaterial,
      COCO_KEYPOINT_NAMES.length,
    )
    this.jointOutline.frustumCulled = false
    this.viewport.scene.add(this.jointOutline)

    this.joints = new InstancedMesh(
      new SphereGeometry(JOINT_RADIUS_CM, 12, 8),
      new MeshBasicMaterial({ color: 0xFFFFFF }),
      COCO_KEYPOINT_NAMES.length,
    )
    this.joints.frustumCulled = false
    this.viewport.scene.add(this.joints)

    this.axes = this.buildAxes()

    this.hover = createHoverLabel(
      container,
      this.viewport.camera,
      () => ({ points: this.hoverPoints, names: COCO_KEYPOINT_NAMES }),
    )

    // Line2 系列的線寬要靠畫布尺寸換算，resize 沒同步 resolution 線寬就會失真
    this.viewport.onResize((width, height) => {
      this.boneMaterial.resolution.set(width, height)
    })

    this.frameCamera()
    this.viewport.start(() => {
      this.axes.update(this.viewport.camera)
      this.hover.update()
    })
  }

  /** 顯示指定時間的幀；null 或查無對應幀時清空骨架。 */
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

  setColor(color: string): void {
    if (this.disposed)
      return
    this.color = color
    this.boneMaterial.color.set(color)
    this.jointOutlineMaterial.color.set(color)
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
    // viewport.dispose() 會遍歷場景釋放 geometry / material，骨頭與關節都在裡面
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

  /** 相機拉到框住整段動作的位置；框的範圍含軸盒標籤那一圈，刻度才不會被裁掉。 */
  private frameCamera(): void {
    const { min, max, span } = rangeToBounds(computeSkeletonBounds(this.frames))
    const box = new Box3(min, max).expandByVector(span.multiplyScalar(LABEL_MARGIN))
    this.viewport.frameBox(box, DEFAULT_EYE_DIR)
  }

  private applyFrame(frame: Pose3dFrame | null): void {
    const positions = this.bonePositions

    for (let i = 0; i < SKELETON_EDGES.length; i++) {
      const [a, b] = SKELETON_EDGES[i]!
      const pa = frame?.points[a]
      const pb = frame?.points[b]
      const offset = i * 6
      if (!pa || !pb) {
        // 缺測邊的兩端寫同一點：退化成零長線段，不會被光柵化即等同「不畫」
        positions.fill(0, offset, offset + 6)
        continue
      }
      positions[offset] = pa[0]
      positions[offset + 1] = pa[1]
      positions[offset + 2] = pa[2]
      positions[offset + 3] = pb[0]
      positions[offset + 4] = pb[1]
      positions[offset + 5] = pb[2]
    }
    const boneAttr = this.boneGeometry.getAttribute('instanceStart') as InterleavedBufferAttribute
    boneAttr.data.needsUpdate = true

    for (let i = 0; i < COCO_KEYPOINT_NAMES.length; i++) {
      const point = frame?.points[i]
      if (point) {
        this.jointDummy.position.set(point[0], point[1], point[2])
        this.jointDummy.scale.setScalar(1)
        this.hoverPoints[i] = (this.hoverPoints[i] ?? new Vector3()).set(point[0], point[1], point[2])
      }
      else {
        // 縮到 0 等於不可見，比從場景移除便宜
        this.jointDummy.scale.setScalar(0)
        this.hoverPoints[i] = null
      }
      this.jointDummy.updateMatrix()
      this.joints.setMatrixAt(i, this.jointDummy.matrix)
      // 外框層共用同一組矩陣，半徑差已經寫死在幾何上
      this.jointOutline.setMatrixAt(i, this.jointDummy.matrix)
    }
    this.joints.instanceMatrix.needsUpdate = true
    this.jointOutline.instanceMatrix.needsUpdate = true
  }
}

/**
 * 骨架疊顯層（框架無關）：骨頭線 + 關節球，疊在人形模型上標出骨架對應的身體部位。
 *
 * 所有材質關閉 depthTest（x-ray）：骨架埋在模型體內也看得見，這正是疊顯的目的；
 * 靠 renderOrder 固定繪製順序（骨頭 → 關節外框 → 白心），不依賴深度緩衝。
 *
 * 單位無關：座標由呼叫端提供（素體場景是 cm、真人模型場景是 m），
 * `jointRadius` 跟著呼叫端的單位走；骨頭線寬是像素單位，天生跨單位。
 */
import type { InterleavedBufferAttribute, Vector3 } from 'three'
import {
  BackSide,
  Color,
  Group,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  SphereGeometry,
} from 'three'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'
import { COCO_KEYPOINT_NAMES, SKELETON_EDGES } from '../../pitch-pose-data/core/types'

export interface SkeletonOverlayOptions {
  /** 關節球半徑（呼叫端的世界單位）。 */
  jointRadius: number
  /** 骨架顏色，預設同骨架版的綠。 */
  color?: string
  /** 骨頭線寬（像素）。 */
  lineWidthPx?: number
}

/** 關節外框放大倍率，同 poseSkeletonScene 的 inverted hull 做法。 */
const OUTLINE_SCALE = 1.3

export class SkeletonOverlay {
  private group = new Group()
  private parent: Object3D

  private boneGeometry = new LineSegmentsGeometry()
  private boneMaterial: LineMaterial
  private bonePositions = new Float32Array(SKELETON_EDGES.length * 6)

  private joints: InstancedMesh
  private jointOutline: InstancedMesh
  private dummy = new Object3D()

  constructor(parent: Object3D, opts: SkeletonOverlayOptions) {
    this.parent = parent
    const color = new Color(opts.color ?? '#22c55e').getHex()

    this.boneMaterial = new LineMaterial({
      color,
      linewidth: opts.lineWidthPx ?? 4,
      depthTest: false,
      transparent: true,
    })
    this.boneGeometry.setPositions(this.bonePositions)
    const bones = new LineSegments2(this.boneGeometry, this.boneMaterial)
    bones.frustumCulled = false
    bones.renderOrder = 998
    this.group.add(bones)

    this.jointOutline = new InstancedMesh(
      new SphereGeometry(opts.jointRadius * OUTLINE_SCALE, 12, 8),
      new MeshBasicMaterial({ color, side: BackSide, depthTest: false, transparent: true }),
      COCO_KEYPOINT_NAMES.length,
    )
    this.jointOutline.frustumCulled = false
    this.jointOutline.renderOrder = 999
    this.group.add(this.jointOutline)

    this.joints = new InstancedMesh(
      new SphereGeometry(opts.jointRadius, 12, 8),
      new MeshBasicMaterial({ color: 0xFFFFFF, depthTest: false, transparent: true }),
      COCO_KEYPOINT_NAMES.length,
    )
    this.joints.frustumCulled = false
    this.joints.renderOrder = 1000
    this.group.add(this.joints)

    parent.add(this.group)
  }

  /** 套用當下幀的關節座標；缺測 keypoint 給 null，對應的骨頭與關節即不畫。 */
  apply(points: ReadonlyArray<Vector3 | null>): void {
    const positions = this.bonePositions
    for (let i = 0; i < SKELETON_EDGES.length; i++) {
      const [a, b] = SKELETON_EDGES[i]!
      const pa = points[a]
      const pb = points[b]
      const offset = i * 6
      if (!pa || !pb) {
        // 缺測邊兩端寫同一點：零長線段不被光柵化，等同不畫
        positions.fill(0, offset, offset + 6)
        continue
      }
      positions[offset] = pa.x
      positions[offset + 1] = pa.y
      positions[offset + 2] = pa.z
      positions[offset + 3] = pb.x
      positions[offset + 4] = pb.y
      positions[offset + 5] = pb.z
    }
    const boneAttr = this.boneGeometry.getAttribute('instanceStart') as InterleavedBufferAttribute
    boneAttr.data.needsUpdate = true

    for (let i = 0; i < COCO_KEYPOINT_NAMES.length; i++) {
      const point = points[i]
      if (point) {
        this.dummy.position.copy(point)
        this.dummy.scale.setScalar(1)
      }
      else {
        this.dummy.scale.setScalar(0)
      }
      this.dummy.updateMatrix()
      this.joints.setMatrixAt(i, this.dummy.matrix)
      this.jointOutline.setMatrixAt(i, this.dummy.matrix)
    }
    this.joints.instanceMatrix.needsUpdate = true
    this.jointOutline.instanceMatrix.needsUpdate = true
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible
  }

  /** Line2 線寬需要畫布尺寸換算，宿主 resize 時必須同步。 */
  setResolution(width: number, height: number): void {
    this.boneMaterial.resolution.set(width, height)
  }

  /** 從場景移除；geometry / material 交由宿主場景的統一釋放流程處理。 */
  dispose(): void {
    this.parent.remove(this.group)
  }
}

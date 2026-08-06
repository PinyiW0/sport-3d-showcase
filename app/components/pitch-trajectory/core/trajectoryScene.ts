import type { Point3D } from '../../pitch-trajectory-data/core/trajectoryGeometry'
/**
 * 3D 投球軌跡場景（框架無關，同 baseball-spin/core/scene.ts 的範式）。
 *
 * 取代原本的 Plotly scatter3d + mesh3d 實作。幾何與配色仍由 pitch-trajectory-data 供應
 * （`buildHomePlateGeometry` / `buildStrikeZoneLines` / `computeTrajectoryRange` /
 * `CHART_THEME`），兩個渲染器共用同一份計算，形狀與顏色不會分岔。
 *
 * 空間比例不需要 Plotly 那套 aspectratio 換算：three 的世界單位直接就是 cm，
 * 1cm 在三軸的視覺長度天生一致。
 */
import type { AxisBox } from '../../scene3d/core/axisBox'
import {
  AmbientLight,
  Box3,
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  SphereGeometry,
  Vector3,
} from 'three'
import { Line2 } from 'three/addons/lines/Line2.js'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'
import {
  buildHomePlateGeometry,
  buildStrikeZoneCorners,
  buildStrikeZoneLines,
  CHART_THEME,
  computeTrajectoryRange,
  PLATE_HALF_WIDTH_CM,
} from '../../pitch-trajectory-data/core/trajectoryGeometry'
import { createAxisBox, LABEL_MARGIN, rangeToBounds } from '../../scene3d/core/axisBox'
import { disposeObject3D, Viewport } from '../../scene3d/core/viewport'

export interface TrajectorySceneOptions {
  /** 打者身高(cm),用來推算九宮格上下緣。 */
  batterHeightCm?: number
  /** 相機距離倍率:>1 拉遠、<1 拉近。 */
  zoom?: number
  /** 完整覆寫相機方向(aspect 單位)。 */
  cameraEye?: { x: number, y: number, z: number }
}

/** 線寬（像素），對齊 Plotly 版的 `line.width`。 */
const WIDTH_PX = { trajectory: 2, zoneOutline: 3, zoneGrid: 1.5 } as const
/**
 * 軌跡取樣點大小（像素，不隨距離衰減）。
 * 這一項刻意用螢幕空間而非 world 單位：場景 y 深達 1800cm，world 單位的小球投影後
 * 不到 1px 就消失了，而「軌跡是離散取樣的」正是這些點要傳達的資訊。
 */
const PATH_DOT_PX = 3.5
/** 出手點／入壘點半徑（cm）。這兩顆是空間中的實體位置，用 world 單位才有 3D 縱深感。 */
const MARKER_RADIUS_CM = { release: 6, landing: 8 } as const
/** aspectratio 的換算基準，沿用 Plotly 版：每 200cm 對應 1 個視覺單位。 */
const CM_PER_ASPECT_UNIT = 200

export class TrajectoryScene {
  private viewport: Viewport
  private axes: AxisBox | null = null
  /** 隨每球重建的內容（軌跡、標記、九宮格）；本壘板與燈光不在其中。 */
  private content = new Group()
  private materials: LineMaterial[] = []

  private batterHeightCm: number
  private zoom: number
  private cameraEye?: { x: number, y: number, z: number }
  private disposed = false

  constructor(container: HTMLElement, opts: TrajectorySceneOptions = {}) {
    this.batterHeightCm = opts.batterHeightCm ?? 175
    this.zoom = opts.zoom ?? 1
    this.cameraEye = opts.cameraEye

    this.viewport = new Viewport(container, {
      background: new Color(CHART_THEME.paper).getHex(),
    })
    this.viewport.scene.add(this.content)

    // 本壘板是實體 mesh,要打光才有立體感(Plotly 的 mesh3d flatshading 等效)
    this.viewport.scene.add(new AmbientLight(0xFFFFFF, 1.8))
    const key = new DirectionalLight(0xFFFFFF, 1.6)
    key.position.set(200, -400, 500)
    this.viewport.scene.add(key)

    this.viewport.scene.add(this.buildHomePlate())

    this.viewport.onResize((width, height) => {
      for (const material of this.materials)
        material.resolution.set(width, height)
    })

    this.viewport.start(() => this.axes?.update(this.viewport.camera))
  }

  /** 換一球：重建軌跡、標記與九宮格，並把相機重新框到新的資料範圍。 */
  setTrajectory(points: Point3D[]): void {
    if (this.disposed)
      return

    disposeObject3D(this.content)
    this.content.clear()
    this.materials = []
    if (this.axes) {
      this.viewport.scene.remove(this.axes)
      this.axes.dispose()
      this.axes = null
    }

    const range = computeTrajectoryRange(points)
    this.axes = createAxisBox({
      range,
      labels: { x: 'X (cm)', y: 'Y (cm)', z: 'Z (cm)' },
      colors: {
        box: 0x666666,
        grid: new Color(CHART_THEME.grid).getHex(),
        text: CHART_THEME.axisText,
      },
    })
    this.viewport.scene.add(this.axes)

    if (points.length >= 2) {
      this.content.add(this.buildPath(points))
      this.content.add(this.buildMarkers(points))
      this.content.add(this.buildStrikeZone(points))
    }

    this.frameCamera(range)
    // 新建的 LineMaterial 尚未拿到畫布尺寸，補一次
    this.viewport.resize()
  }

  setOptions(opts: TrajectorySceneOptions): void {
    if (this.disposed)
      return
    this.batterHeightCm = opts.batterHeightCm ?? this.batterHeightCm
    this.zoom = opts.zoom ?? this.zoom
    this.cameraEye = opts.cameraEye ?? this.cameraEye
  }

  dispose(): void {
    this.disposed = true
    this.axes?.dispose()
    this.viewport.dispose()
  }

  /** 軌跡線：連續折線用 Line2（LineBasicMaterial 的 linewidth 在多數平台恆為 1px）。 */
  private buildPath(points: Point3D[]): Line2 {
    const geometry = new LineGeometry()
    geometry.setPositions(points.flat())
    const material = new LineMaterial({
      color: new Color(CHART_THEME.trajectory).getHex(),
      linewidth: WIDTH_PX.trajectory,
    })
    this.materials.push(material)
    const line = new Line2(geometry, material)
    line.computeLineDistances()
    return line
  }

  /** 軌跡取樣點 + 出手點 + 入壘點，對應 Plotly 的三個 marker trace。 */
  private buildMarkers(points: Point3D[]): Group {
    const group = new Group()
    const trajectoryColor = new Color(CHART_THEME.trajectory).getHex()

    const dotGeometry = new BufferGeometry()
    dotGeometry.setAttribute('position', new Float32BufferAttribute(points.flat(), 3))
    group.add(new Points(dotGeometry, new PointsMaterial({
      color: trajectoryColor,
      size: PATH_DOT_PX,
      // 關掉距離衰減 = 螢幕空間固定大小，遠端的取樣點才不會消失
      sizeAttenuation: false,
    })))

    const release = new Mesh(
      new SphereGeometry(MARKER_RADIUS_CM.release, 16, 12),
      new MeshStandardMaterial({ color: trajectoryColor }),
    )
    release.position.set(...points[0]!)
    group.add(release)

    const landing = new Mesh(
      new SphereGeometry(MARKER_RADIUS_CM.landing, 16, 12),
      new MeshStandardMaterial({ color: new Color(CHART_THEME.landing).getHex() }),
    )
    landing.position.set(...points.at(-1)!)
    group.add(landing)

    return group
  }

  /** 九宮格：外框一條閉合折線 + 4 條內部分隔線。 */
  private buildStrikeZone(points: Point3D[]): Group {
    const yPlane = points.at(-1)?.[1] ?? PLATE_HALF_WIDTH_CM
    const { outline, grid } = buildStrikeZoneLines(
      buildStrikeZoneCorners(this.batterHeightCm, yPlane),
    )
    const zoneColor = new Color(CHART_THEME.strikeZone).getHex()
    const group = new Group()

    const outlineGeometry = new LineGeometry()
    outlineGeometry.setPositions(outline.flat())
    const outlineMaterial = new LineMaterial({
      color: zoneColor,
      linewidth: WIDTH_PX.zoneOutline,
    })
    this.materials.push(outlineMaterial)
    group.add(new Line2(outlineGeometry, outlineMaterial))

    const gridGeometry = new LineSegmentsGeometry()
    gridGeometry.setPositions(grid.flat(2))
    const gridMaterial = new LineMaterial({
      color: zoneColor,
      linewidth: WIDTH_PX.zoneGrid,
    })
    this.materials.push(gridMaterial)
    group.add(new LineSegments2(gridGeometry, gridMaterial))

    return group
  }

  private buildHomePlate(): Mesh {
    const { vertices, faces } = buildHomePlateGeometry()
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(vertices.flat(), 3))
    geometry.setIndex(faces.flat())
    // flat shading 需要面法線,由索引幾何自動計算
    geometry.computeVertexNormals()
    return new Mesh(
      geometry,
      new MeshStandardMaterial({
        color: new Color(CHART_THEME.homePlate).getHex(),
        flatShading: true,
      }),
    )
  }

  /**
   * 相機方向沿用 Plotly 版的 eye 比例：本壘板後方、略高於打者，
   * 讓完整拋物線斜向入鏡。距離由 frameBox 依資料範圍算，再乘上 zoom。
   */
  private frameCamera(range: ReturnType<typeof computeTrajectoryRange>): void {
    const aspect = {
      x: (range.x[1] - range.x[0]) / CM_PER_ASPECT_UNIT,
      y: (range.y[1] - range.y[0]) / CM_PER_ASPECT_UNIT,
      z: (range.z[1] - range.z[0]) / CM_PER_ASPECT_UNIT,
    }
    const eye = this.cameraEye ?? {
      x: aspect.x * 1.4,
      y: -aspect.y * 1.1,
      z: aspect.z * 0.5,
    }
    // 框的是「盒子 + 標籤那一圈」：刻度與軸標題掛在盒外，只框盒子會把它們裁掉
    const { min, max, span } = rangeToBounds(range)
    const box = new Box3(min, max).expandByVector(span.multiplyScalar(LABEL_MARGIN))
    this.viewport.frameBox(box, new Vector3(eye.x, eye.y, eye.z), this.zoom)
  }
}

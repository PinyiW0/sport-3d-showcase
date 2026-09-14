/**
 * three 場景樣板（框架無關）：renderer、相機、OrbitControls、resize、rAF 迴圈與資源釋放。
 *
 * 相機 up 預設 z-up，直接拿資料原生座標（cm、z 為高度）當世界單位——棒球資料的
 * 座標系本來就是 z-up，硬轉成 three 慣例的 y-up 只會讓每個模組都得記一次轉換規則。
 * 且真實 3D 空間天然等比例，不需要 Plotly 那套「每 200cm 對應 1 視覺單位」的
 * aspectratio 人工換算。
 *
 * 用法：由各模組的 scene class 持有一個 Viewport，把自己的物件加進 `scene`，
 * 每幀要做的事交給 `start(onFrame)`。
 */
import type { Mesh, Object3D } from 'three'
import {
  Box3,
  Color,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  Texture,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

/** fitPointsInView 的置中輪數：每輪把注視點挪到投影範圍中心再重算距離，幾輪就收斂 */
const FIT_POINTS_PASSES = 8

export interface PointsFit {
  /** 相機注視點（也是 OrbitControls 的旋轉中心） */
  target: Vector3
  /** 相機沿 eyeDir 離注視點的距離，剛好讓最外側的點貼齊畫面邊緣 */
  distance: number
}

/**
 * 沿 eyeDir 看、剛好框住所有點的注視點與距離（純數學，不碰 renderer，可單元測試）。
 *
 * 與 frameBox 的差別：只框真正有東西的點，不框方盒的空角落；並把注視點挪到點的投影範圍中心。
 * 資料偏在一側時（打者在三壘側、球從投手方向來），方盒中心會讓畫面一邊留大片空白。
 * 置中用迭代：透視投影下挪動注視點會改變所需距離，一次算不準，挪幾輪就穩定。
 */
export function fitPointsInView(
  points: readonly Vector3[],
  eyeDir: Vector3,
  up: Vector3,
  fovDeg: number,
  aspect: number,
): PointsFit | null {
  if (!points.length)
    return null
  const forward = eyeDir.clone().normalize().negate()
  const right = new Vector3().crossVectors(forward, up).normalize()
  const screenUp = new Vector3().crossVectors(right, forward).normalize()
  const tanV = Math.tan((fovDeg * Math.PI) / 360)
  const tanH = tanV * aspect
  const target = new Box3().setFromPoints(points as Vector3[]).getCenter(new Vector3())
  const rel = new Vector3()

  // 每個點要落在視錐內：|橫向| <= (d + 深度) · tan(半視角)，解出所需的最小 d（同 frameBox）
  function requiredDistance(): number {
    let distance = 0
    for (const point of points) {
      rel.subVectors(point, target)
      const depth = rel.dot(forward)
      distance = Math.max(
        distance,
        Math.abs(rel.dot(right)) / tanH - depth,
        Math.abs(rel.dot(screenUp)) / tanV - depth,
      )
    }
    return distance
  }

  let distance = requiredDistance()
  for (let pass = 0; pass < FIT_POINTS_PASSES; pass++) {
    // 各點投影到畫面後的範圍（-1～1），把注視點往範圍中心挪
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const point of points) {
      rel.subVectors(point, target)
      const along = distance + rel.dot(forward)
      if (along <= 0)
        continue
      const x = rel.dot(right) / (along * tanH)
      const y = rel.dot(screenUp) / (along * tanV)
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
    target
      .addScaledVector(right, ((minX + maxX) / 2) * distance * tanH)
      .addScaledVector(screenUp, ((minY + maxY) / 2) * distance * tanV)
    distance = requiredDistance()
  }
  return { target, distance }
}

export interface ViewportOptions {
  /** 場景底色。 */
  background?: number
  /** 相機 up 向量，預設 z-up（對齊資料座標系）。 */
  cameraUp?: [number, number, number]
  /** devicePixelRatio 上限，避免高 DPI 螢幕過度渲染。 */
  pixelRatioCap?: number
  /** 垂直視野角（度），預設 45。 */
  fov?: number
}

export class Viewport {
  readonly scene = new Scene()
  readonly camera: PerspectiveCamera
  readonly controls: OrbitControls

  private renderer: WebGLRenderer
  private container: HTMLElement
  private resizeObserver: ResizeObserver
  private resizeListeners: Array<(width: number, height: number) => void> = []
  private rafId = 0
  private onFrame: (() => void) | null = null
  private disposed = false

  constructor(container: HTMLElement, opts: ViewportOptions = {}) {
    this.container = container

    this.renderer = new WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, opts.pixelRatioCap ?? 2))
    container.appendChild(this.renderer.domElement)

    this.scene.background = new Color(opts.background ?? 0x000000)

    // near/far 以 cm 為單位取值：0.1cm 夠近看細節，20000cm（200m）遠超投手丘到本壘的距離
    this.camera = new PerspectiveCamera(opts.fov ?? 45, 1, 0.1, 20000)
    // up 必須在 OrbitControls 建立前設好——controls 拿它當球座標的極軸
    this.camera.up.set(...(opts.cameraUp ?? [0, 0, 1]))

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true

    this.resize()
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
  }

  setBackground(color: number): void {
    this.scene.background = new Color(color)
  }

  /**
   * 柔和的室內環境反射貼圖（three 內建 RoomEnvironment，經 PMREM 預過濾）：給受光材質當 envMap，
   * 表面才有真實的高光變化、不像塑膠。產生一次就好，呼叫端負責 dispose。
   */
  createRoomEnvironment(): Texture {
    const pmrem = new PMREMGenerator(this.renderer)
    const room = new RoomEnvironment()
    const texture = pmrem.fromScene(room, 0.04).texture
    room.dispose()
    pmrem.dispose()
    return texture
  }

  /**
   * 註冊 resize 回呼。Line2 的 LineMaterial 需要畫布尺寸算線寬，
   * 尺寸變了不更新 resolution，線寬就會失真。
   */
  onResize(fn: (width: number, height: number) => void): void {
    this.resizeListeners.push(fn)
    fn(this.container.clientWidth, this.container.clientHeight)
  }

  /**
   * 相機拉到剛好框住 box 的位置。
   * @param box 要框進畫面的世界座標範圍
   * @param eyeDir 相機相對於 box 中心的方向（不需正規化）
   * @param distanceScale >1 拉遠、<1 拉近
   */
  frameBox(box: Box3, eyeDir: Vector3, distanceScale = 1): void {
    if (box.isEmpty())
      return
    const center = box.getCenter(new Vector3())
    const dir = eyeDir.clone().normalize()

    // 逐角投影而非用 bounding sphere：sphere 對細長的盒子過度保守——軌跡圖的 y 深
    // 1800cm、x 只有 400cm，深度方向撐大了半徑卻幾乎不佔畫面，相機會拉到很遠、
    // 場景縮成畫面中央一小塊。
    const forward = dir.clone().negate()
    const right = new Vector3().crossVectors(forward, this.camera.up).normalize()
    const up = new Vector3().crossVectors(right, forward).normalize()

    const tanV = Math.tan((this.camera.fov * Math.PI) / 180 / 2)
    const tanH = tanV * this.camera.aspect

    const corner = new Vector3()
    let distance = 0
    for (let i = 0; i < 8; i++) {
      corner.set(
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z,
      ).sub(center)
      // 該角要落在視錐內：|橫向| <= (d + 深度) · tan(半視角)，解出所需的 d
      const depth = corner.dot(forward)
      distance = Math.max(
        distance,
        Math.abs(corner.dot(right)) / tanH - depth,
        Math.abs(corner.dot(up)) / tanV - depth,
      )
    }

    this.camera.position.copy(center).add(dir.multiplyScalar(distance * distanceScale))
    this.controls.target.copy(center)
    this.controls.update()
  }

  /**
   * 相機拉到剛好框住所有點的位置，注視點取點的投影範圍中心（見 fitPointsInView）。
   * margin 大於 1 時在四周留白（1.1 = 距離多拉一成，最外側的點離邊緣約一成）。
   */
  framePoints(points: readonly Vector3[], eyeDir: Vector3, margin = 1): void {
    const fit = fitPointsInView(points, eyeDir, this.camera.up, this.camera.fov, this.camera.aspect)
    if (!fit)
      return
    this.camera.position.copy(fit.target).addScaledVector(eyeDir.clone().normalize(), fit.distance * margin)
    this.controls.target.copy(fit.target)
    this.controls.update()
  }

  /** 啟動 rAF 迴圈；onFrame 在每次渲染前呼叫（更新資料用）。 */
  start(onFrame?: () => void): void {
    this.onFrame = onFrame ?? null
    if (this.rafId !== 0 || this.disposed)
      return
    const tick = (): void => {
      if (this.disposed)
        return
      this.controls.update()
      this.onFrame?.()
      this.renderer.render(this.scene, this.camera)
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  stop(): void {
    cancelAnimationFrame(this.rafId)
    this.rafId = 0
  }

  /** 手動渲染一幀（未啟動 rAF 迴圈時用）。 */
  renderOnce(): void {
    if (!this.disposed)
      this.renderer.render(this.scene, this.camera)
  }

  resize(): void {
    const width = this.container.clientWidth
    const height = this.container.clientHeight
    if (width === 0 || height === 0)
      return
    this.renderer.setSize(width, height)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    for (const fn of this.resizeListeners)
      fn(width, height)
  }

  /** 螢幕座標換算用（hoverLabel 需要畫布位置與尺寸）。 */
  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement
  }

  dispose(): void {
    this.stop()
    this.disposed = true
    this.resizeObserver.disconnect()
    this.resizeListeners = []
    this.controls.dispose()
    disposeObject3D(this.scene)
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.renderer.domElement.remove()
  }
}

/**
 * 釋放物件樹的 geometry / material / texture。
 * WebGL 資源不受 GC 管，漏了就是顯示卡記憶體一路長到 context lost。
 */
export function disposeObject3D(root: Object3D): void {
  root.traverse((node) => {
    const holder = node as Partial<Mesh> & {
      material?: Mesh['material']
      geometry?: Mesh['geometry']
    }
    holder.geometry?.dispose()
    const materials = Array.isArray(holder.material)
      ? holder.material
      : holder.material
        ? [holder.material]
        : []
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof Texture)
          value.dispose()
      }
      material.dispose()
    }
  })
}

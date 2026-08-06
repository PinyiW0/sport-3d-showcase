/**
 * 3D 軸盒：外框 + 三面背板格線 + 刻度數字 + 軸標題。
 *
 * 這是 Plotly gl3d 免費附贈、換到 three 後必須自己畫的部分。行為刻意對齊 Plotly：
 * - 背板永遠貼在「背對相機」的那三個面，旋轉時自動換邊，不會擋住資料
 * - 刻度標籤跟著背板走，恆定落在外緣可見處
 * - 標籤大小做距離補償，視覺尺寸不隨 zoom 改變（Sprite 預設是 world-space 會忽大忽小）
 *
 * 座標系為 z-up（見 viewport.ts）。呼叫端每幀呼叫 `update(camera)` 讓換邊生效。
 */
import type { PerspectiveCamera } from 'three'
import {
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  LinearFilter,
  LineBasicMaterial,
  LineSegments,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three'

export interface Range3 { x: [number, number], y: [number, number], z: [number, number] }

export interface AxisBoxOptions {
  range: Range3
  /** 軸標題，預設 x/y/z (cm)。 */
  labels?: { x: string, y: string, z: string }
  /** 刻度級距，'auto' 依跨度自動選（預設）。 */
  tickStep?: number | 'auto'
  colors?: {
    /** 外框線 */
    box?: number
    /** 背板格線 */
    grid?: number
    /** 刻度與標題文字 */
    text?: string
  }
  /** 刻度文字佔畫面高度的比例，預設 0.032。 */
  labelScreenHeight?: number
}

export interface AxisBox extends Group {
  /** 每幀呼叫：依相機位置把背板與標籤換到背面，並補償標籤尺寸。 */
  update: (camera: PerspectiveCamera) => void
  dispose: () => void
}

const DEFAULT_COLORS = { box: 0x666666, grid: 0x333333, text: '#cccccc' } as const

/**
 * 依跨度選刻度級距，目標是每軸 4~6 個刻度。
 * 候選值限定在人看得懂的整數級距（1/2/5 系列），避免出現 37.5 這種刻度。
 */
export function chooseTickStep(span: number): number {
  const CANDIDATES = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000]
  const target = Math.abs(span) / 5
  return CANDIDATES.find(step => step >= target) ?? CANDIDATES.at(-1)!
}

/** 產生 [min, max] 內對齊 step 倍數的刻度值。 */
export function axisTicks(min: number, max: number, step: number): number[] {
  if (step <= 0 || !Number.isFinite(step))
    return []
  const ticks: number[] = []
  const first = Math.ceil(min / step) * step
  // 浮點累加會漂移（0.1+0.2 那類），用整數倍數還原
  for (let i = 0; first + i * step <= max + step * 1e-6; i++)
    ticks.push(Math.round((first + i * step) * 1e6) / 1e6)
  return ticks
}

/** 刻度文字：整數不帶小數點，非整數留一位。 */
function formatTick(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

/**
 * 文字 → Sprite。canvas 以 64px 字級繪製後由 sprite.scale 縮放，
 * 這樣放大看也不糊（等同於 supersampling）。
 */
function makeTextSprite(text: string, color: string): Sprite {
  const FONT_PX = 64
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  ctx.font = `${FONT_PX}px sans-serif`
  canvas.width = Math.max(1, Math.ceil(ctx.measureText(text).width))
  canvas.height = Math.ceil(FONT_PX * 1.3)
  // 改 canvas 尺寸會重置 context，字型設定要再來一次
  ctx.font = `${FONT_PX}px sans-serif`
  ctx.fillStyle = color
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 0, canvas.height / 2)

  const texture = new CanvasTexture(canvas)
  // 非 2 的次方尺寸不能產 mipmap，指定線性過濾避免 three 警告與黑圖
  texture.minFilter = LinearFilter
  const sprite = new Sprite(new SpriteMaterial({
    map: texture,
    transparent: true,
    // 標籤永遠可見：被骨架或軌跡遮住的刻度沒有意義
    depthTest: false,
  }))
  sprite.renderOrder = 10
  sprite.userData.aspect = canvas.width / canvas.height
  return sprite
}

/** 一個平面的格線（建在原點所在的平面上，由 group.position 決定貼哪一面）。 */
function buildPlaneGrid(
  axis: 'x' | 'y' | 'z',
  range: Range3,
  ticks: { x: number[], y: number[], z: number[] },
  color: number,
): LineSegments {
  const points: number[] = []
  const push = (a: Vector3, b: Vector3) => points.push(a.x, a.y, a.z, b.x, b.y, b.z)

  if (axis === 'x') {
    // YZ 平面：沿 y 的線 + 沿 z 的線
    for (const z of ticks.z)
      push(new Vector3(0, range.y[0], z), new Vector3(0, range.y[1], z))
    for (const y of ticks.y)
      push(new Vector3(0, y, range.z[0]), new Vector3(0, y, range.z[1]))
  }
  else if (axis === 'y') {
    for (const z of ticks.z)
      push(new Vector3(range.x[0], 0, z), new Vector3(range.x[1], 0, z))
    for (const x of ticks.x)
      push(new Vector3(x, 0, range.z[0]), new Vector3(x, 0, range.z[1]))
  }
  else {
    for (const y of ticks.y)
      push(new Vector3(range.x[0], y, 0), new Vector3(range.x[1], y, 0))
    for (const x of ticks.x)
      push(new Vector3(x, range.y[0], 0), new Vector3(x, range.y[1], 0))
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(points, 3))
  return new LineSegments(geometry, new LineBasicMaterial({ color }))
}

/** bounding box 的 12 條邊。 */
function buildBoxLines(range: Range3, color: number): LineSegments {
  const [x0, x1] = range.x
  const [y0, y1] = range.y
  const [z0, z1] = range.z
  const corners: Array<[number, number, number]> = [
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y1, z0],
    [x0, y1, z0],
    [x0, y0, z1],
    [x1, y0, z1],
    [x1, y1, z1],
    [x0, y1, z1],
  ]
  const edges = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0], // 底
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4], // 頂
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7], // 柱
  ]
  const points = edges.flatMap(([a, b]) => [...corners[a!]!, ...corners[b!]!])
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(points, 3))
  return new LineSegments(geometry, new LineBasicMaterial({ color }))
}

export function createAxisBox(opts: AxisBoxOptions): AxisBox {
  const { range } = opts
  const colors = { ...DEFAULT_COLORS, ...opts.colors }
  const labels = opts.labels ?? { x: 'x (cm)', y: 'y (cm)', z: 'z (cm)' }
  const screenHeight = opts.labelScreenHeight ?? 0.032

  const span = {
    x: range.x[1] - range.x[0],
    y: range.y[1] - range.y[0],
    z: range.z[1] - range.z[0],
  }
  // 每軸各自算級距，不是三軸共用一個。共用的話「格子是正方形」，但軸跨度差很多時
  // 短軸會只剩一個刻度（軌跡圖 y 深 1800cm 算出級距 500，套到 x 的 400cm 就只有 0）。
  // 空間等比不靠格子形狀維持——three 的世界單位直接是 cm，1cm 在三軸本來就一樣長。
  const stepOf = (span: number) =>
    opts.tickStep && opts.tickStep !== 'auto' ? opts.tickStep : chooseTickStep(span)
  const step = { x: stepOf(span.x), y: stepOf(span.y), z: stepOf(span.z) }
  const ticks = {
    x: axisTicks(range.x[0], range.x[1], step.x),
    y: axisTicks(range.y[0], range.y[1], step.y),
    z: axisTicks(range.z[0], range.z[1], step.z),
  }
  const center = new Vector3(
    (range.x[0] + range.x[1]) / 2,
    (range.y[0] + range.y[1]) / 2,
    (range.z[0] + range.z[1]) / 2,
  )
  /**
   * 刻度離盒邊的外推距離，每軸各自取該軸跨度的 6%。
   * 刻度貼在兩個面的交線上，要離開盒子就得往兩個面的法線方向同時推，所以是對角外推。
   *
   * 不能用「三軸最大跨度」統一算：軌跡圖的 y 深 1800cm、z 只有 300cm，統一 pad 會
   * 把 z 的刻度推到盒外 99cm——比 z 軸自己的一格刻度還遠，整排數字直接飛出畫面。
   */
  const pad = { x: span.x * 0.06, y: span.y * 0.06, z: span.z * 0.06 }

  const root = new Group() as AxisBox
  root.add(buildBoxLines(range, colors.box))

  const planes = {
    x: buildPlaneGrid('x', range, ticks, colors.grid),
    y: buildPlaneGrid('y', range, ticks, colors.grid),
    z: buildPlaneGrid('z', range, ticks, colors.grid),
  }
  root.add(planes.x, planes.y, planes.z)

  // 刻度 sprite 建一次，位置在 update() 裡隨背板換邊
  const tickSprites = {
    x: ticks.x.map(v => ({ value: v, sprite: makeTextSprite(formatTick(v), colors.text) })),
    y: ticks.y.map(v => ({ value: v, sprite: makeTextSprite(formatTick(v), colors.text) })),
    z: ticks.z.map(v => ({ value: v, sprite: makeTextSprite(formatTick(v), colors.text) })),
  }
  for (const axis of ['x', 'y', 'z'] as const) {
    for (const { sprite } of tickSprites[axis])
      root.add(sprite)
  }

  const titles = {
    x: makeTextSprite(labels.x, colors.text),
    y: makeTextSprite(labels.y, colors.text),
    z: makeTextSprite(labels.z, colors.text),
  }
  root.add(titles.x, titles.y, titles.z)

  /** 各軸背板貼在 min(0) 還是 max(1) 那面；-1 表示尚未決定。 */
  const side = { x: -1, y: -1, z: -1 }

  /** 盒子四條垂直邊的 (x, y)；z 刻度要挑其中一條掛。 */
  const verticalEdges: Array<[number, number]> = [
    [range.x[0], range.y[0]],
    [range.x[1], range.y[0]],
    [range.x[1], range.y[1]],
    [range.x[0], range.y[1]],
  ]
  /** 目前 z 刻度掛在哪條垂直邊；-1 表示尚未決定。 */
  let zEdge = -1
  const probe = new Vector3()

  /**
   * 挑投影後最靠畫面外緣的垂直邊給 z 刻度。
   *
   * 用幾何規則（例如「兩個背板的交線」或「近側面」）挑都會在某些盒子形狀上失效：
   * 交線是最遠的邊，透視下會縮進盒子輪廓、數字疊在資料上；近側面則在細長盒子
   * （軌跡圖 y 深 1800cm）會被推到相機的正側面，整排飛出視野。直接看投影結果最穩。
   */
  function pickZEdge(camera: PerspectiveCamera): number {
    let best = 0
    let bestScore = -Infinity
    for (let i = 0; i < verticalEdges.length; i++) {
      const [ex, ey] = verticalEdges[i]!
      probe.set(ex, ey, center.z).project(camera)
      // 在相機背後或裁切面外的邊不能用
      if (probe.z < -1 || probe.z > 1)
        continue
      if (Math.abs(probe.x) > bestScore) {
        bestScore = Math.abs(probe.x)
        best = i
      }
    }
    return best
  }

  function layout(): void {
    const edge = {
      x: range.x[side.x]!,
      y: range.y[side.y]!,
      z: range.z[side.z]!,
    }
    planes.x.position.x = edge.x
    planes.y.position.y = edge.y
    planes.z.position.z = edge.z

    // 標籤往盒外推，避免壓在格線上
    const out = {
      x: Math.sign(edge.x - center.x) * pad.x,
      y: Math.sign(edge.y - center.y) * pad.y,
      z: Math.sign(edge.z - center.z) * pad.z,
    }

    // 刻度掛「近側」的底邊，不是背板那側。背板在遠端，遠端底邊投影後會收縮成短短
    // 一截（軌跡圖的 x 軸 400cm 只剩 90px），整排數字就疊在一起。近側底邊投影最長，
    // 刻度才分得開——Plotly gl3d 也是把刻度畫在近側。
    const near = { x: range.x[1 - side.x]!, y: range.y[1 - side.y]! }
    const nearOut = {
      x: Math.sign(near.x - center.x) * pad.x,
      y: Math.sign(near.y - center.y) * pad.y,
    }
    for (const { value, sprite } of tickSprites.x)
      sprite.position.set(value, near.y + nearOut.y, edge.z + out.z)
    for (const { value, sprite } of tickSprites.y)
      sprite.position.set(near.x + nearOut.x, value, edge.z + out.z)

    // z 刻度掛在 pickZEdge() 選出的垂直邊，並沿該角的對角線往盒外推。
    // 外推量取一半：這條邊已經是投影後最靠畫面外緣的，全額外推容易直接推出視野。
    const [zx, zy] = verticalEdges[zEdge]!
    const zOut = {
      x: Math.sign(zx - center.x) * pad.x * 0.5,
      y: Math.sign(zy - center.y) * pad.y * 0.5,
    }
    for (const { value, sprite } of tickSprites.z)
      sprite.position.set(zx + zOut.x, zy + zOut.y, value)

    // 軸標題放該軸中點，沿「垂直於軸」的方向推得比刻度更外面（2.4 倍）。
    //
    // 不放軸的延長線末端：x 標題會落在「x 軸近端 × y 近側」、y 標題落在
    // 「y 軸近端 × x 近側」，兩者收斂到同一個角落直接疊在一起。中點則各自
    // 待在自己那條邊的中央，天然分開。
    const TITLE_OUT = 2.4
    titles.x.position.set(center.x, near.y + nearOut.y * TITLE_OUT, edge.z + out.z * TITLE_OUT)
    titles.y.position.set(near.x + nearOut.x * TITLE_OUT, center.y, edge.z + out.z * TITLE_OUT)
    // 跟著 z 刻度貼同一條垂直邊
    titles.z.position.set(zx + zOut.x * TITLE_OUT, zy + zOut.y * TITLE_OUT, center.z)
  }

  const cameraPos = new Vector3()

  root.update = (camera: PerspectiveCamera): void => {
    camera.getWorldPosition(cameraPos)

    // 背板貼在相機的對側，才不會擋在資料前面
    const next = {
      x: cameraPos.x > center.x ? 0 : 1,
      y: cameraPos.y > center.y ? 0 : 1,
      z: cameraPos.z > center.z ? 0 : 1,
    }
    const nextZEdge = pickZEdge(camera)
    if (next.x !== side.x || next.y !== side.y || next.z !== side.z || nextZEdge !== zEdge) {
      Object.assign(side, next)
      zEdge = nextZEdge
      layout()
    }

    // 距離補償：sprite 是 world-space 尺寸，不補償的話 zoom 進去文字會撐滿畫面。
    // 目標高度 = 畫面高度 × screenHeight，換算回 world 尺寸即 2·d·tan(fov/2)·比例
    const tanHalfFov = Math.tan((camera.fov * Math.PI) / 180 / 2)
    for (const axis of ['x', 'y', 'z'] as const) {
      for (const { sprite } of tickSprites[axis])
        scaleSprite(sprite, cameraPos, tanHalfFov, screenHeight)
      scaleSprite(titles[axis], cameraPos, tanHalfFov, screenHeight * 1.15)
    }
  }

  root.dispose = (): void => {
    root.traverse((node) => {
      if (node instanceof LineSegments) {
        node.geometry.dispose()
        ;(node.material as LineBasicMaterial).dispose()
      }
      else if (node instanceof Sprite) {
        const material = node.material as SpriteMaterial
        material.map?.dispose()
        material.dispose()
      }
    })
  }

  return root
}

function scaleSprite(
  sprite: Sprite,
  cameraPos: Vector3,
  tanHalfFov: number,
  screenHeight: number,
): void {
  const distance = sprite.position.distanceTo(cameraPos)
  const height = 2 * distance * tanHalfFov * screenHeight
  const aspect = (sprite.userData.aspect as number) ?? 1
  sprite.scale.set(height * aspect, height, 1)
}

/**
 * 軸盒的標籤會掛在盒子外緣，framing 時要把這圈空間一起算進去，否則刻度數字
 * 會被裁在畫面外。呼叫端用 `box.expandByVector(spanOf(range) * LABEL_MARGIN)`。
 */
export const LABEL_MARGIN = 0.2

/** 把 Range3 轉成 three 的 Box3 邊界值，省得每個模組各寫一次。 */
export function rangeToBounds(range: Range3): { min: Vector3, max: Vector3, span: Vector3 } {
  const min = new Vector3(range.x[0], range.y[0], range.z[0])
  const max = new Vector3(range.x[1], range.y[1], range.z[1])
  return { min, max, span: max.clone().sub(min) }
}

/** 深色／淺色兩套軸盒配色，供模組的 dark prop 切換。 */
export const AXIS_THEME = {
  dark: { box: 0x555555, grid: 0x2A2A2A, text: '#cccccc' },
  light: { box: 0xBBBBBB, grid: 0xE2E2E2, text: '#444444' },
} as const

/** 對應的場景底色（同 pitch-trajectory 的 CHART_THEME.paper 與 Pose3dHuman 的 SCENE_BG）。 */
export const SCENE_BG = { dark: 0x000000, light: 0xFAFAFA } as const

export { Color }

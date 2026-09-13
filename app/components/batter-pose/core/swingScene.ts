/**
 * 打者揮棒 3D 場景（框架無關），同 pitch-pose/core/poseSkeletonScene.ts 的範式。
 *
 * 與 poseSkeletonScene 的差異：
 * - 骨架拓樸不寫死（COCO_KEYPOINT_NAMES／SKELETON_EDGES 常數），一律讀
 *   `swing.jointNames`／`swing.bones`，因為球棒兩點是否存在、名稱是什麼都由資料決定。
 * - 細線分析骨架（同演算法端參考實作的風格）：骨頭是固定像素寬的細線（LineSegments2），
 *   關節是小顆、霧面的亮點（InstancedMesh）。線寬用像素不用公分——1 cm 粗的線在全景下只剩 1px 左右
 *   會閃爍，像素線寬在每個視角、縮放下都一樣俐落。顏色依關節名稱分角色（core/skeletonStyle.ts）：
 *   四肢左右分色、軀幹中性、頭部細而淡。
 * - 球棒照真實木棒的輪廓做成旋轉體（握把尾端圓頭、細握把、漸粗過渡、打擊區、圓弧棒頭），
 *   木紋貼圖加亮光漆（clearcoat）、握把包深色握把布、環境反射，看起來才像一根木棒而不是塑膠棍。
 * - 多了球體拖尾（固定 20 顆物件池）與貼地本壘板參考面，這兩者 poseSkeletonScene 沒有。
 * - 背景是漸層、地面有微光與漸層淡出的格線（配色在 core/swingTheme.ts）。
 * - `setSwing()` 换事件時整組骨架/關節物件重建（poseSkeletonScene 的 `setFrames()`
 *   只換資料，keypoint 數目固定不必重建）——因為理論上不同事件的關節/骨頭數可能不同，
 *   不能假設沿用舊的 buffer 大小。
 *
 * 渲染物件建構一次，之後每幀只覆寫 buffer 內容與 instance 矩陣，不重配置。
 */
import type { InterleavedBufferAttribute, Material, Texture } from 'three'
import type { BpeBone, BpeFrame, BpePoint3, BpeSwing } from '../../bpe-data/core/types'
import type { HoverLabel } from '../../scene3d/core/hoverLabel'
import type { SwingView } from './swingFraming'
import type { SwingTheme } from './swingTheme'
import {
  ArrowHelper,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  InstancedMesh,
  LatheGeometry,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from 'three'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { HOME_PLATE_POINTS } from '../../baseball-field/core/fieldGeometry'
import { applyUnitSphereNormalization, computeUnitSphereNormalization } from '../../baseball-spin/core/normalize-model'
import { isBatJoint } from '../../bpe-data/core/parseBpeResult'
import { createHoverLabel } from '../../scene3d/core/hoverLabel'
import { Viewport } from '../../scene3d/core/viewport'
import { BALL_TRAIL_LENGTH, BALL_TRAIL_RADIUS_CM, sampleBallTrail } from './ballTrail'
import { boneRole, jointRole } from './skeletonStyle'
import { collectFramingPoints, SWING_VIEW_EYE } from './swingFraming'
import { BALL_FALLBACK_COLOR, JOINT_TINT, swingTheme, tintTowardWhite, toCssColor } from './swingTheme'

export interface SwingSceneOptions {
  /** 深色畫布，預設 false。 */
  dark?: boolean
  /**
   * 球的 glTF 模型網址（例：baseball-spin 用的 baseball_detail.glb）。給了就把拖尾的球換成模型；
   * 不給、或載入失敗時畫規範預設的紅球（規範：球用與球棒不同的紅色）。
   */
  ballModelUrl?: string
}

/**
 * 骨頭線寬（像素）：四肢與軀幹、頭部。參考實作是 1px，retina 螢幕上太細；2px 看起來仍偏細，取 3px。
 * 頭部五點擠在十幾公分內，線再細一點才不會糊成一團。
 */
const BODY_LINE_WIDTH_PX = 3
const HEAD_LINE_WIDTH_PX = 1.75
/**
 * 關節球半徑（cm）：參考實作的 2.3 cm，小顆的亮點標出關節位置、不搶骨頭的線；頭部再縮小。
 * 顯示設定，不是量測值——資料只有關節中心點。
 */
const JOINT_RADIUS_CM = 2.3
const HEAD_JOINT_RADIUS_CM = 1.2
/**
 * 球棒兩點（knob／head）的小球：只在那一幀畫不出球棒（另一端缺值）時才顯示，
 * 讓單獨有效的那個點仍然看得到；球棒畫得出來時，握把圓頭與棒頭本身就標出了這兩點。
 */
const BAT_JOINT_RADIUS_CM = 2.4
/**
 * 木棒外型（旋轉體輪廓）：[沿棒身的位置 t（0 = 握把尾端、1 = 棒頭端）, 半徑 cm]。
 * 參考標準成人木棒：握把尾端圓頭直徑約 4.5 cm、握把約 2.4 cm、打擊區約 6.6 cm，棒頭收成圓弧。
 * 長度方向依資料的 knob → head 距離縮放，半徑固定——資料只有兩個端點，這是顯示設定，不是量測值。
 */
const BAT_PROFILE: ReadonlyArray<readonly [t: number, radiusCm: number]> = [
  [0, 0],
  [0, 1.7],
  [0.005, 2.15],
  [0.013, 2.25],
  [0.022, 1.9],
  [0.032, 1.35],
  [0.045, 1.2],
  [0.3, 1.22],
  [0.4, 1.45],
  [0.5, 2.05],
  [0.58, 2.7],
  [0.66, 3.1],
  [0.75, 3.28],
  [0.93, 3.3],
  [0.965, 3.2],
  [0.985, 2.7],
  [0.996, 1.7],
  [1, 0],
]
/** 握把布：包在握把段外面、略粗一點的深色套筒，順便標出哪一端是握把 */
const BAT_GRIP = { from: 0.045, to: 0.29, radiusCm: 1.34, color: 0x24262B, roughness: 0.85 } as const
/** 旋轉體繞一圈的分段數：太少棒身會看出稜角 */
const BAT_RADIAL_SEGMENTS = 40
/**
 * 木棒材質：木紋貼圖乘上配色的球棒色，外面一層亮光漆（clearcoat）反射環境，
 * 高光沿著棒身滑動才有「上過漆的木頭」的感覺。
 */
const BAT_MATERIAL = { roughness: 0.45, clearcoat: 0.7, clearcoatRoughness: 0.25, envMapIntensity: 0.9 } as const
/** 短於這個長度（cm）的球棒不畫：兩點幾乎重合時算不出方向 */
const MIN_SEGMENT_CM = 1e-3
/** LatheGeometry 的軸向是 +Y，每幀把它轉到球棒兩端點的方向 */
const CYLINDER_AXIS = new Vector3(0, 1, 0)
/**
 * 打光（場景是 z-up，HemisphereLight 的天空方向要手動設成 +z，預設把 +y 當天空）：
 * - 天光：上白下石板灰，陰影面不會死黑
 * - 主光：從預設視角的方向略往上打，看得到的那面最亮；太高的話朝下的上臂整段落在陰影裡，
 *   顏色暗到跟圖例對不上
 * - 輪廓光：投手側後上方，勾出骨架背面的邊，跟背景拉開
 * three r155 起不再有舊版光照模式，強度要比參考實作（r128）的 0.85／0.55 高才亮得起來。
 */
const HEMI_LIGHT = { sky: 0xFFFFFF, ground: 0x566070, intensity: 2.3 }
const KEY_LIGHT = { intensity: 2.0, position: [320, -380, 360] as const }
const RIM_LIGHT = { intensity: 1.0, position: [-160, 420, 260] as const }
/** 本壘板貼地時的 z 偏移（cm），略高於 0 避免與地面格線 z-fighting。 */
const PLATE_Z_OFFSET_CM = 0.3
/**
 * 地面格線：每格 20 cm，只畫本壘板尖端周圍 GRID_RADIUS_CM 內，從 GRID_FADE_START_CM 起
 * 往外漸層淡出。格線是參照物不是主角——整片鋪到地平線時，遠處的細線擠成一片灰，
 * 會跟骨架搶注意力。打者站在離本壘板 1.5 m 內，漸層從那之外才開始。
 */
const GRID_CELL_CM = 20
const GRID_RADIUS_CM = 300
const GRID_FADE_START_CM = 150
/** 地面微光的半徑（cm）與高度：略低於格線，墊在最底下 */
const FLOOR_GLOW_RADIUS_CM = 320
const FLOOR_GLOW_Z_CM = -0.2
/** 指向投手的箭頭（參考實作同款：本壘板前方 60 cm 起、長 45 cm），純裝飾不是資料 */
const PITCHER_ARROW = { startY: 60, length: 45, headLength: 10, headWidth: 6 } as const
/** 取景時四周的留白倍率（Viewport.framePoints 的 margin）：畫布四角還要放圖例、數據與視角按鈕 */
const FRAME_MARGIN = 1.12

/** 一組骨頭線：同一種線寬與材質，每幀只覆寫 positions */
interface BoneLines {
  bones: BpeBone[]
  positions: Float32Array
  geometry: LineSegmentsGeometry
  material: LineMaterial
  object: LineSegments2
}

export class SwingScene {
  private viewport: Viewport
  private grid: LineSegments
  private floorGlow: Mesh
  private arrow: ArrowHelper
  private backdrop: CanvasTexture | null = null
  private hover: HoverLabel
  private homePlate: Mesh
  private plateFill!: MeshBasicMaterial
  private plateEdge!: LineBasicMaterial

  // 下列骨架/關節相關物件的大小由 swing 決定，setSwing() 會整組換掉
  /** 人體骨頭：兩組細線（四肢與軀幹、頭部），每幀只覆寫兩端點座標 */
  private boneLines: BoneLines[] = []
  /** 人體關節：每個一顆單位球（instance），半徑依角色 */
  private bodyJoints!: InstancedMesh
  private bodyJointRadii: number[] = []
  private batJoints!: InstancedMesh

  /**
   * 每條球棒骨頭一根木棒（Group：棒身 ＋ 握把布），共用幾何與材質，長度與方向靠 Group 的 transform。
   * 幾何的長度方向是 −0.5～0.5，Group 放在兩端點中點、scale.y 拉成兩點距離。
   */
  private batGeometry!: LatheGeometry
  private gripGeometry!: LatheGeometry
  private batMaterial!: MeshPhysicalMaterial
  private gripMaterial!: MeshStandardMaterial
  private bats: Group[] = []
  /** 每根木棒的兩端關節索引，握把端（knob）在前 */
  private batEnds: Array<{ knob: number, head: number }> = []
  /** 這一幀有畫出木棒的球棒點；這些點不再另外畫小球 */
  private coveredBatJoints = new Set<number>()
  /** 木棒的環境反射與木紋：跟配色無關，整個場景只建一次 */
  private environment: Texture
  private woodGrain: CanvasTexture

  private dummy = new Object3D()
  private segment = new Vector3()

  /**
   * 拖尾 20 顆，每顆是一個容器 Group：先放單位半徑的紅球，棒球模型載入後換成模型。
   * 大小一律靠容器的 scale（半徑 × 取樣縮放），內容換掉也不用改套用邏輯。
   */
  private trailBalls: Group[] = []
  /** 每顆各自的材質清單（模型可能有好幾個材質），透明度逐顆設定 */
  private trailMaterials: Material[][] = []

  /** 當下幀的關節世界座標，供 hover 判定；缺測為 null。索引對齊 swing.jointNames。 */
  private hoverPoints: Array<Vector3 | null> = []

  private swing: BpeSwing
  private bodyJointIndices: number[] = []
  private batJointIndices: number[] = []

  private dark: boolean
  private view: SwingView = 'overview'
  private disposed = false
  /** 目前顯示的幀；棒球模型晚一步載入、或換配色重建骨架時，用它把畫面重新套一次 */
  private currentFrame = 0

  constructor(container: HTMLElement, swing: BpeSwing, opts: SwingSceneOptions = {}) {
    this.swing = swing
    this.dark = opts.dark ?? false
    const theme = this.theme()

    this.viewport = new Viewport(container, { background: theme.backdrop[1] })
    this.applyBackdrop()
    this.environment = this.viewport.createRoomEnvironment()
    this.woodGrain = createWoodGrainTexture()

    const fallbackBall = new SphereGeometry(1, 10, 8)
    this.trailBalls = Array.from({ length: BALL_TRAIL_LENGTH }, (_, age) => {
      const material = new MeshBasicMaterial({ color: BALL_FALLBACK_COLOR })
      prepareTrailMaterial(material, age)
      this.trailMaterials.push([material])
      const holder = new Group()
      holder.name = `ball-trail-${age}`
      holder.visible = false
      holder.add(new Mesh(fallbackBall, material))
      this.viewport.scene.add(holder)
      return holder
    })
    if (opts.ballModelUrl)
      void this.loadBallModel(opts.ballModelUrl)

    this.homePlate = this.buildHomePlate()
    this.viewport.scene.add(this.homePlate)
    this.floorGlow = this.buildFloorGlow()
    this.viewport.scene.add(this.floorGlow)

    // 光源跟著場景走、不隨 setSwing() 重建
    const hemi = new HemisphereLight(HEMI_LIGHT.sky, HEMI_LIGHT.ground, HEMI_LIGHT.intensity)
    hemi.position.set(0, 0, 1)
    const key = new DirectionalLight(0xFFFFFF, KEY_LIGHT.intensity)
    key.position.set(...KEY_LIGHT.position)
    const rim = new DirectionalLight(0xFFFFFF, RIM_LIGHT.intensity)
    rim.position.set(...RIM_LIGHT.position)
    this.viewport.scene.add(hemi, key, rim)

    // 指向投手的箭頭（照參考實作）：拿掉軸盒後畫面上只剩它標出 +y 是投手方向
    this.arrow = new ArrowHelper(
      new Vector3(0, 1, 0),
      new Vector3(0, PITCHER_ARROW.startY, PLATE_Z_OFFSET_CM * 2),
      PITCHER_ARROW.length,
      theme.arrow,
      PITCHER_ARROW.headLength,
      PITCHER_ARROW.headWidth,
    )
    this.viewport.scene.add(this.arrow)

    this.buildSkeletonObjects()
    this.grid = this.buildGrid()

    this.hover = createHoverLabel(
      container,
      this.viewport.camera,
      () => ({ points: this.hoverPoints, names: this.swing.jointNames }),
    )

    // Line2 系列的線寬要靠畫布尺寸換算，resize 沒同步 resolution 線寬就會失真。
    // 這裡讀 this.boneLines（而非在此捕捉常數），setSwing() 換掉材質後這個回呼一樣會拿到新的那一份。
    this.viewport.onResize((width, height) => {
      for (const lines of this.boneLines)
        lines.material.resolution.set(width, height)
    })

    this.frameCamera()
    this.viewport.start(() => {
      this.hover.update()
    })

    this.setFrame(0)
  }

  /** 顯示指定幀索引；越界或查無資料時清空骨架與拖尾。 */
  setFrame(i: number): void {
    if (this.disposed)
      return
    this.currentFrame = i
    this.applyFrame(this.swing.frames[i] ?? null)
    this.applyTrail(i)
  }

  /** 換事件：骨架/關節數量可能不同，整組重建；拖尾與相機取景一併重算。 */
  setSwing(swing: BpeSwing): void {
    if (this.disposed)
      return
    this.disposeSkeletonObjects()
    this.swing = swing
    this.buildSkeletonObjects()
    this.frameCamera()
  }

  /** 切換取景（全景／打者特寫）。選同一個也會重新取景，當成「重設視角」用。 */
  setView(view: SwingView): void {
    if (this.disposed)
      return
    this.view = view
    this.frameCamera()
  }

  setDark(dark: boolean): void {
    if (this.disposed || dark === this.dark)
      return
    this.dark = dark
    const theme = this.theme()
    this.applyBackdrop()
    this.plateFill.color.set(theme.plate.fill)
    this.plateEdge.color.set(theme.plate.edge)
    this.arrow.setColor(theme.arrow)
    const glow = this.floorGlow.material as MeshBasicMaterial
    glow.color.set(theme.floorGlow.color)
    glow.opacity = theme.floorGlow.opacity
    this.rebuildGrid()
    // 骨架顏色在建構時就寫進頂點色與 instance 色，換配色要整組重建，再套回目前這一幀
    this.disposeSkeletonObjects()
    this.buildSkeletonObjects()
    this.setFrame(this.currentFrame)
  }

  dispose(): void {
    this.disposed = true
    this.hover.dispose()
    // 背景不在物件樹裡，viewport.dispose() 遍歷不到，要自己釋放；環境反射與木紋在這一筆沒有球棒時
    // 也不在樹裡，一併自己釋放（有球棒時遍歷會再釋放一次，three 的 dispose 重複呼叫無害）
    this.viewport.scene.background = null
    this.backdrop?.dispose()
    this.environment.dispose()
    this.woodGrain.dispose()
    // viewport.dispose() 會遍歷場景釋放 geometry / material / texture：骨頭、關節、拖尾球、本壘板、格線、微光、箭頭都在裡面
    this.viewport.dispose()
  }

  private theme(): SwingTheme {
    return swingTheme(this.dark)
  }

  /** 依 swing.jointNames／swing.bones 建立骨頭與關節的渲染物件；setSwing() 換事件時重建整組。 */
  private buildSkeletonObjects(): void {
    const swing = this.swing
    const names = swing.jointNames
    const theme = this.theme()
    const color = new Color()
    this.bodyJointIndices = []
    this.batJointIndices = []
    names.forEach((name, i) => (isBatJoint(name) ? this.batJointIndices : this.bodyJointIndices).push(i))
    this.hoverPoints = names.map(() => null)

    // 人體骨頭：兩組細線。四肢與軀幹逐段給頂點色（左、右、軀幹三色），LineMaterial 的 color 留白色，
    // 乘上頂點色就是原色；頭部的線更細、單色
    const bodyBones = swing.bones.filter(b => b.kind === 'body' && boneRole(names, b) !== 'head')
    const headBones = swing.bones.filter(b => b.kind === 'body' && boneRole(names, b) === 'head')
    const boneColors = new Float32Array(Math.max(bodyBones.length, 1) * 6)
    bodyBones.forEach((bone, i) => {
      color.set(theme[boneRole(names, bone)])
      boneColors.set([color.r, color.g, color.b, color.r, color.g, color.b], i * 6)
    })
    this.boneLines = [
      this.createBoneLines(bodyBones, new LineMaterial({ color: 0xFFFFFF, linewidth: BODY_LINE_WIDTH_PX, vertexColors: true }), boneColors),
      this.createBoneLines(headBones, new LineMaterial({ color: theme.head, linewidth: HEAD_LINE_WIDTH_PX })),
    ]

    // 人體關節：小顆、霧面的亮點（不反光）。顏色是所屬部位色往白色混一段，讀起來是
    // 同一條肢體上較亮的節點，左右仍分得出來；頭部縮小
    this.bodyJoints = new InstancedMesh(
      new SphereGeometry(1, 16, 12),
      new MeshLambertMaterial({ color: 0xFFFFFF }),
      Math.max(this.bodyJointIndices.length, 1),
    )
    this.bodyJointRadii = this.bodyJointIndices.map((jointIndex, slot) => {
      const role = jointRole(names[jointIndex]!)
      this.bodyJoints.setColorAt(slot, color.set(tintTowardWhite(theme[role], JOINT_TINT)))
      return role === 'head' ? HEAD_JOINT_RADIUS_CM : JOINT_RADIUS_CM
    })
    this.bodyJoints.frustumCulled = false
    this.viewport.scene.add(this.bodyJoints)

    // 木棒：旋轉體輪廓的長度方向是 −0.5（握把端）～ 0.5（棒頭端），轉向時 +Y 對到 head
    this.batGeometry = new LatheGeometry(
      BAT_PROFILE.map(([t, radius]) => new Vector2(radius, t - 0.5)),
      BAT_RADIAL_SEGMENTS,
    )
    // 握把布是開口的套筒（不封頭尾），兩端略收，看起來是纏上去的
    this.gripGeometry = new LatheGeometry([
      new Vector2(BAT_GRIP.radiusCm - 0.12, BAT_GRIP.from - 0.5),
      new Vector2(BAT_GRIP.radiusCm, BAT_GRIP.from + 0.006 - 0.5),
      new Vector2(BAT_GRIP.radiusCm, BAT_GRIP.to - 0.006 - 0.5),
      new Vector2(BAT_GRIP.radiusCm - 0.12, BAT_GRIP.to - 0.5),
    ], BAT_RADIAL_SEGMENTS)
    this.batMaterial = new MeshPhysicalMaterial({
      color: theme.bat,
      map: this.woodGrain,
      envMap: this.environment,
      ...BAT_MATERIAL,
    })
    this.gripMaterial = new MeshStandardMaterial({
      color: BAT_GRIP.color,
      roughness: BAT_GRIP.roughness,
      envMap: this.environment,
      envMapIntensity: 0.4,
    })
    this.batEnds = swing.bones.filter(b => b.kind === 'bat').map((bone) => {
      // 握把端（knob）在前；名稱看不出哪端是棒頭時，照骨頭原本的方向把 to 當棒頭
      const fromIsHead = names[bone.from]!.includes('head') && !names[bone.to]!.includes('head')
      return fromIsHead ? { knob: bone.to, head: bone.from } : { knob: bone.from, head: bone.to }
    })
    this.bats = this.batEnds.map(() => {
      const bat = new Group()
      for (const mesh of [new Mesh(this.batGeometry, this.batMaterial), new Mesh(this.gripGeometry, this.gripMaterial)]) {
        mesh.frustumCulled = false
        bat.add(mesh)
      }
      bat.visible = false
      this.viewport.scene.add(bat)
      return bat
    })

    this.batJoints = new InstancedMesh(
      new SphereGeometry(BAT_JOINT_RADIUS_CM, 16, 12),
      new MeshStandardMaterial({ color: theme.bat, roughness: BAT_MATERIAL.roughness }),
      Math.max(this.batJointIndices.length, 1),
    )
    this.batJoints.frustumCulled = false
    this.viewport.scene.add(this.batJoints)

    // 上面用 Math.max(n, 1) 是因為 InstancedMesh 不能開 0 個槽；但 three 會把每個槽初始化成
    // 單位矩陣，沒有資料的那格會在原點（本壘板尖端）多畫一個東西。
    // count 設回實際數量才不畫多出來的那格，再把真實的槽先清成不可見，
    // 避免 setSwing() 之後、下一次 setFrame() 之前，新骨架全疊在原點
    this.bodyJoints.count = this.bodyJointIndices.length
    this.batJoints.count = this.batJointIndices.length
    this.applyFrame(null)

    // 立刻同步一次目前畫布尺寸的線寬——onResize 只在容器實際 resize 時觸發，
    // 換 swing 剛建好的新材質要手動補這一次，否則線寬會維持在建構時的初始值
    // 用 clientWidth（版面尺寸）而不是 getBoundingClientRect：預覽頁外層有 CSS zoom，後者會拿到縮放後的值，
    // 跟 onResize 用的容器尺寸對不上
    const canvas = this.viewport.canvas
    for (const lines of this.boneLines)
      lines.material.resolution.set(canvas.clientWidth, canvas.clientHeight)
  }

  /** 建一組骨頭線加進場景。colors 是逐段的頂點色（每段 6 個數：兩端各 rgb），不給就用材質色。 */
  private createBoneLines(bones: BpeBone[], material: LineMaterial, colors?: Float32Array): BoneLines {
    // 沒有骨頭時留一段零長線段：buffer 不能是 0 長度，零長線段也不會被光柵化
    const positions = new Float32Array(Math.max(bones.length, 1) * 6)
    const geometry = new LineSegmentsGeometry()
    geometry.setPositions(positions)
    if (colors)
      geometry.setColors(colors)
    const object = new LineSegments2(geometry, material)
    object.frustumCulled = false
    this.viewport.scene.add(object)
    return { bones, positions, geometry, material, object }
  }

  private disposeSkeletonObjects(): void {
    for (const lines of this.boneLines) {
      this.viewport.scene.remove(lines.object)
      lines.geometry.dispose()
      lines.material.dispose()
    }
    for (const obj of [this.bodyJoints, this.batJoints, ...this.bats])
      this.viewport.scene.remove(obj)
    for (const mesh of [this.bodyJoints, this.batJoints]) {
      mesh.geometry.dispose()
      ;(mesh.material as Material).dispose()
      // instanceMatrix／instanceColor 的顯卡緩衝區只在 InstancedMesh.dispose() 時才釋放（geometry／material
      // 的 dispose 管不到），漏掉的話每換一次事件就留下一份，要等整個元件卸載才一起回收
      mesh.dispose()
    }
    // 木紋與環境反射是整個場景共用的，material.dispose() 不會連帶釋放貼圖，這裡不動它們
    this.batGeometry.dispose()
    this.gripGeometry.dispose()
    this.batMaterial.dispose()
    this.gripMaterial.dispose()
  }

  /** 背景漸層（上暗下亮）：畫在 2×256 的 canvas 上當 scene.background，three 會把它鋪滿整個畫面 */
  private applyBackdrop(): void {
    const [top, bottom] = this.theme().backdrop
    const canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 256
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      // 拿不到 2D context（極少見）就退回單色，畫面仍然正常
      this.viewport.setBackground(bottom)
      return
    }
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height)
    gradient.addColorStop(0, toCssColor(top))
    gradient.addColorStop(1, toCssColor(bottom))
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    this.viewport.scene.background = texture
    this.backdrop?.dispose()
    this.backdrop = texture
  }

  /**
   * 地面微光：本壘板周圍一圈由中心往外淡出的亮面，像打在地上的燈，讓打者「站」在地上。
   * 顏色與強度由配色決定，貼圖本身只是白色的放射狀透明度。
   */
  private buildFloorGlow(): Mesh {
    const size = 256
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (ctx) {
      const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
      gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, size, size)
    }
    const { color, opacity } = this.theme().floorGlow
    const material = new MeshBasicMaterial({ color, opacity, map: new CanvasTexture(canvas), transparent: true, depthWrite: false })
    const glow = new Mesh(new PlaneGeometry(FLOOR_GLOW_RADIUS_CM * 2, FLOOR_GLOW_RADIUS_CM * 2), material)
    glow.position.z = FLOOR_GLOW_Z_CM
    // 半透明物件依 renderOrder 先後畫：微光墊底、格線其次，拖尾的球最後疊在上面
    glow.renderOrder = -2
    return glow
  }

  /**
   * 貼地本壘板：HOME_PLATE_POINTS 的扇形三角化，雙面、不透明，外加一圈邊框。
   * 尺寸取 fieldGeometry 的官方 17 吋（43.18 cm），參考實作寫的 21.6／43.2 是它取整後的值。
   */
  private buildHomePlate(): Mesh {
    const z = PLATE_Z_OFFSET_CM
    const vertices = HOME_PLATE_POINTS.flatMap(([x, y]) => [x, y, z])
    // 扇形以頂點 0 為中心切三角形。HOME_PLATE_POINTS 在 XY 平面是順時針，
    // 繞向反過來切（0, i+1, i）法線才朝 +z，同 pitch-trajectory 的 buildHomePlateGeometry。
    const faces: number[] = []
    for (let i = 1; i < HOME_PLATE_POINTS.length - 1; i++)
      faces.push(0, i + 1, i)

    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
    geometry.setIndex(faces)
    const { fill, edge } = this.theme().plate
    this.plateFill = new MeshBasicMaterial({ color: fill, side: DoubleSide })
    const plate = new Mesh(geometry, this.plateFill)

    // 邊框比板面再高一點點，才不會跟板面搶深度而閃爍
    const edgePoints = HOME_PLATE_POINTS.map(([x, y]) => new Vector3(x, y, z + PLATE_Z_OFFSET_CM))
    this.plateEdge = new LineBasicMaterial({ color: edge })
    plate.add(new LineLoop(new BufferGeometry().setFromPoints(edgePoints), this.plateEdge))
    return plate
  }

  /**
   * 地面格線（照參考實作只畫在地上，不像 pitch-pose 的軸盒三面都有）：以本壘板尖端為中心，
   * 每格拆成獨立線段、逐頂點給不透明度，離中心越遠越透明——GridHelper 一條線只有一個顏色，
   * 畫不出漸層；用透明度而不是混背景色，是因為背景本身是漸層，混不出單一目標色。
   * 整段都在淡出半徑外的線段直接不建。範圍固定，不隨事件改變。
   */
  private buildGrid(): LineSegments {
    const { color: gridColor, lineOpacity, axisOpacity } = this.theme().grid
    const color = new Color(gridColor)
    const positions: number[] = []
    const colors: number[] = []

    function pushSegment(x0: number, y0: number, x1: number, y1: number, opacity: number): void {
      const r0 = Math.hypot(x0, y0)
      const r1 = Math.hypot(x1, y1)
      if (Math.min(r0, r1) >= GRID_RADIUS_CM)
        return
      for (const [x, y, r] of [[x0, y0, r0], [x1, y1, r1]] as const) {
        positions.push(x, y, 0)
        colors.push(color.r, color.g, color.b, opacity * (1 - MathUtils.smoothstep(r, GRID_FADE_START_CM, GRID_RADIUS_CM)))
      }
    }

    const cells = Math.round(GRID_RADIUS_CM / GRID_CELL_CM)
    for (let i = -cells; i <= cells; i++) {
      const fixed = i * GRID_CELL_CM
      // 過本壘板尖端的兩條（x = 0、y = 0）較明顯
      const opacity = i === 0 ? axisOpacity : lineOpacity
      for (let j = -cells; j < cells; j++) {
        const from = j * GRID_CELL_CM
        const to = from + GRID_CELL_CM
        pushSegment(fixed, from, fixed, to, opacity)
        pushSegment(from, fixed, to, fixed, opacity)
      }
    }

    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    // 4 個分量（rgba）：three 看到 itemSize 4 的 color 會自動啟用頂點透明度
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 4))
    const grid = new LineSegments(geometry, new LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }))
    grid.renderOrder = -1
    this.viewport.scene.add(grid)
    return grid
  }

  private rebuildGrid(): void {
    this.viewport.scene.remove(this.grid)
    this.grid.geometry.dispose()
    ;(this.grid.material as LineBasicMaterial).dispose()
    this.grid = this.buildGrid()
  }

  /**
   * 相機依目前視角取景：全景與快捷視角框住整段動作的有效關節與球（規範：縮放視角時將骨架與有效球體座標
   * 共同納入範圍），打者特寫只框人體關節；看的方向見 SWING_VIEW_EYE。只在建構、換事件、切視角時算，
   * 播放中不重算。
   */
  private frameCamera(): void {
    const points = collectFramingPoints(this.swing.frames, this.swing.jointNames, this.view)
      .map(([x, y, z]) => new Vector3(x, y, z))
    // 本壘板是擊球位置的參照，一併框進來：它在打者腳前、畫面最下方，只框關節時常被裁掉一半
    for (const [x, y] of HOME_PLATE_POINTS)
      points.push(new Vector3(x, y, 0))
    this.viewport.framePoints(points, new Vector3(...SWING_VIEW_EYE[this.view]), FRAME_MARGIN)
  }

  private applyFrame(frame: BpeFrame | null): void {
    for (const lines of this.boneLines)
      this.writeBonePositions(lines, frame)
    this.applyBats(frame)

    this.bodyJointIndices.forEach((jointIndex, slot) => {
      const point = frame?.joints[jointIndex] ?? null
      this.placeJoint(this.bodyJoints, slot, point, this.bodyJointRadii[slot]!)
      this.hoverPoints[jointIndex] = this.toHoverVector(jointIndex, point)
    })
    this.bodyJoints.instanceMatrix.needsUpdate = true

    // 球棒點：這一幀畫出木棒的點由木棒本身標示（握把圓頭、棒頭），只有畫不出木棒時才畫小球
    this.batJointIndices.forEach((jointIndex, slot) => {
      const point = frame?.joints[jointIndex] ?? null
      this.placeJoint(this.batJoints, slot, this.coveredBatJoints.has(jointIndex) ? null : point, 1)
      this.hoverPoints[jointIndex] = this.toHoverVector(jointIndex, point)
    })
    this.batJoints.instanceMatrix.needsUpdate = true
  }

  /** 把一根單位圓柱（instance）放到 a → b 之間；任一端缺值或兩點重合就縮成 0 */
  /** 把每條骨頭的兩端點寫進線段 buffer；缺任一端就寫成零長線段（不畫），不沿用上一幀 */
  private writeBonePositions({ bones, positions, geometry }: BoneLines, frame: BpeFrame | null): void {
    for (let i = 0; i < bones.length; i++) {
      const bone = bones[i]!
      const pa = frame?.joints[bone.from]
      const pb = frame?.joints[bone.to]
      const offset = i * 6
      if (!pa || !pb) {
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
    const attr = geometry.getAttribute('instanceStart') as InterleavedBufferAttribute
    attr.data.needsUpdate = true
  }

  /** 把一顆單位球（instance）放到關節位置；缺值縮成 0，比從場景移除便宜 */
  private placeJoint(mesh: InstancedMesh, slot: number, point: BpePoint3 | null, radius: number): void {
    this.dummy.quaternion.identity()
    if (point) {
      this.dummy.position.set(point[0], point[1], point[2])
      this.dummy.scale.setScalar(radius)
    }
    else {
      this.dummy.scale.setScalar(0)
    }
    this.dummy.updateMatrix()
    mesh.setMatrixAt(slot, this.dummy.matrix)
  }

  /**
   * 把每根木棒放到 knob → head 之間；任一端缺值或兩點重合就藏起來，不沿用上一幀。
   * 順便記下這一幀畫出木棒的球棒點（coveredBatJoints），那些點不再另外畫小球。
   */
  private applyBats(frame: BpeFrame | null): void {
    this.coveredBatJoints.clear()
    this.batEnds.forEach(({ knob, head }, i) => {
      const bat = this.bats[i]!
      const pk = frame?.joints[knob]
      const ph = frame?.joints[head]
      if (!pk || !ph) {
        bat.visible = false
        return
      }
      const dir = this.segment.set(ph[0] - pk[0], ph[1] - pk[1], ph[2] - pk[2])
      const length = dir.length()
      if (length < MIN_SEGMENT_CM) {
        bat.visible = false
        return
      }
      bat.visible = true
      bat.position.set((pk[0] + ph[0]) / 2, (pk[1] + ph[1]) / 2, (pk[2] + ph[2]) / 2)
      bat.scale.set(1, length, 1)
      bat.quaternion.setFromUnitVectors(CYLINDER_AXIS, dir.divideScalar(length))
      this.coveredBatJoints.add(knob).add(head)
    })
  }

  private toHoverVector(jointIndex: number, point: BpePoint3 | null): Vector3 | null {
    if (!point)
      return null
    return (this.hoverPoints[jointIndex] ?? new Vector3()).set(point[0], point[1], point[2])
  }

  /** 依目標幀重設 20 顆拖尾球，不累積歷史（規範 2.4）。 */
  private applyTrail(targetFrame: number): void {
    const samples = sampleBallTrail(this.swing.frames, targetFrame)
    samples.forEach((sample, age) => {
      const holder = this.trailBalls[age]!
      if (!sample.point) {
        holder.visible = false
        return
      }
      holder.visible = true
      holder.position.set(sample.point[0], sample.point[1], sample.point[2])
      holder.scale.setScalar(BALL_TRAIL_RADIUS_CM * sample.scale)
      for (const material of this.trailMaterials[age]!)
        material.opacity = sample.opacity
    })
  }

  /**
   * 載入棒球模型，把 20 顆拖尾的紅球換成模型。模型先歸一化成單位球（沿用 baseball-spin 的做法，
   * 兩個模組的球大小算法一致），每顆各自複製材質才能各自設透明度；幾何共用不複製。
   * 載入失敗就維持紅球——那正是規範的預設畫法，畫面不會壞。
   */
  private async loadBallModel(url: string): Promise<void> {
    let model: Object3D
    try {
      model = (await new GLTFLoader().loadAsync(url)).scene
    }
    catch {
      return
    }
    // await 期間可能已經卸載，這時 viewport 已釋放，不能再往場景加東西
    if (this.disposed)
      return

    const normalized = new Group()
    applyUnitSphereNormalization(normalized, computeUnitSphereNormalization(model))
    normalized.add(model)

    // 紅球的幾何 20 顆共用，換完之後就沒人用了，換之前先記下來再釋放
    const fallbackGeometry = (this.trailBalls[0]!.children[0] as Mesh).geometry
    this.trailBalls.forEach((holder, age) => {
      const fallback = holder.children[0] as Mesh
      holder.remove(fallback)
      ;(fallback.material as Material).dispose()

      const ball = normalized.clone(true)
      const materials: Material[] = []
      ball.traverse((node) => {
        if (!(node instanceof Mesh))
          return
        const own = (Array.isArray(node.material) ? node.material : [node.material]).map((m: Material) => {
          const copy = m.clone()
          prepareTrailMaterial(copy, age)
          return copy
        })
        node.material = Array.isArray(node.material) ? own : own[0]!
        node.frustumCulled = false
        materials.push(...own)
      })
      holder.add(ball)
      this.trailMaterials[age] = materials
    })
    fallbackGeometry.dispose()
    this.applyTrail(this.currentFrame)
  }
}

/**
 * 木紋貼圖：貼圖的 x 繞棒身一圈、y 沿棒身，所以木紋畫成直條——每條粗細、深淺不一，
 * 白底上的淡褐色條紋乘上配色的球棒色，就是帶紋路的木頭。用固定種子的亂數，每次載入紋路一樣，
 * 截圖與預覽影片才不會每次不同。
 */
function createWoodGrainTexture(): CanvasTexture {
  // 貼圖窄、條紋寬：棒身在畫面上只有幾十像素寬，條紋太細會糊成一片、看不出紋路
  const width = 96
  const height = 8
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    const random = seededRandom(7)
    for (let x = 0; x < width;) {
      const stripe = 1.5 + random() * 4
      ctx.fillStyle = `rgba(84, 48, 16, ${(0.12 + random() * 0.3).toFixed(3)})`
      ctx.fillRect(x, 0, stripe, height)
      x += stripe + 1 + random() * 6
    }
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = RepeatWrapping
  return texture
}

/** 固定種子的亂數（mulberry32）：同一個種子每次產生同一串數字 */
function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6D2B79F5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 拖尾材質的共同設定：一律可透明；只有最新（age 0）那顆寫深度——其餘半透明球彼此不比深度，
 * 開著反而會讓後畫的舊球被先畫的擋住，出現忽隱忽現的排序問題。
 */
function prepareTrailMaterial(material: Material, age: number): void {
  material.transparent = true
  material.depthWrite = age === 0
}

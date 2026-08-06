<script setup lang="ts">
/**
 * 真人模型 3D 動態圖(three.js + Mixamo rigged 角色)。
 * 由父層時鐘餵 `timeMs`,每個 rAF tick 找當下 frame,把 COCO-17 keypoints
 * retarget 成骨骼旋轉套到 /models/Xbot.glb(Adobe Mixamo 角色,取自 three.js 官方範例)。
 *
 * 與 Plotly 版不同,OrbitControls 的視角操作和資料更新天生解耦,
 * 播放中拖曳旋轉不需要任何 workaround。
 */
import type { Mesh, MeshStandardMaterial, Object3D } from 'three'
import type { Pose3dFrame } from '../pitch-pose-data/core/parsePitchOutcome'
import type { SkeletonCalibrationReport } from './core/pose3dRetarget'
import {
  Box3,
  Color,
  DirectionalLight,
  GridHelper,
  Group,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
// 路徑統一走 three/addons/（同 baseball-spin 與 scene3d）：與 three/examples/jsm/
// 混用會讓 Vite 各自預打包，同頁載入兩份 three core，觸發 "Multiple instances" 警告
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { findPoseFrame } from '../pitch-pose-data/core/findPoseFrame'
import {
  calibrateSkeleton,
  interpolateMissingPoints,
  medianLegLengthM,
  PoseRetargeter,
  toThreeSpace,
} from './core/pose3dRetarget'
import { SkeletonOverlay } from './core/skeletonOverlay'

const props = withDefaults(
  defineProps<{
    frames: readonly Pose3dFrame[]
    /** 目前播放時間(毫秒);null 或無對應 frame 時模型定格在上一幀。 */
    timeMs: number | null
    height?: number
    /**
     * 深色場景。預設的近白背景放進深色版面(如索引頁的預覽卡)會突兀;
     * 開啟後只換場景底色,打光與模型維持不變。預設 false 以維持既有呈現。
     */
    dark?: boolean
    /** Mixamo 角色模型位置。宿主部署在子路徑時要自行接上 baseURL。 */
    modelUrl?: string
    /** 骨架疊顯（骨頭線 + 關節球，x-ray 貼在模型上）。預設關閉以維持既有呈現。 */
    skeleton?: boolean
    /**
     * 骨長校正：載入時依資料量到的骨長拉伸模型骨架，讓身高、肩寬、軀幹長
     * 對上這名選手。關閉則只套等比縮放（模型維持自身比例）。
     * 校正在模型載入時做一次，切換此值需重新掛載元件才會生效。
     */
    calibrate?: boolean
  }>(),
  { height: 480, dark: false, modelUrl: '/models/Xbot.glb', skeleton: false, calibrate: true },
)

const emit = defineEmits<{ calibrated: [report: SkeletonCalibrationReport] }>()

/**
 * 場景底色與地板網格。深色值對齊 pitch-trajectory 的 CHART_THEME。
 * 網格得跟著翻深——底色轉黑但網格留在近白，那片地板會變成畫面裡最亮的東西，
 * 反而蓋過模型本身。
 */
const SCENE_BG = { light: 0xFAFAFA, dark: 0x000000 } as const
const GRID_COLOR = {
  light: { center: 0xBBBBBB, lines: 0xE2E2E2 },
  dark: { center: 0x555555, lines: 0x333333 },
} as const

/**
 * 模型改為灰階(Xbot 原色是粉膚色)。兩段明暗對應模型自帶的兩個材質——
 * 亮色身體與暗色關節,保留原本的明暗差,不然形體會糊成一片。
 * 中間調在淺色與深色場景都讀得出來,`dark` 時不另外換色。
 */
const MODEL_GREY = { body: 0xB4B4B4, joints: 0x505050 } as const
/** 亮度門檻:分辨模型自帶的亮色(身體)與暗色(關節)材質。 */
const BODY_LUMINANCE_MIN = 0.4

const hostRef = ref<HTMLDivElement | null>(null)
const loading = ref(true)
const loadError = ref<string | null>(null)

/** 缺測補幀 + 座標轉換(cm z-up → m y-up),只在 frames 變更時算一次。 */
const preparedFrames = computed(() => toThreeSpace(interpolateMissingPoints(props.frames)))

let renderer: WebGLRenderer | null = null
let controls: OrbitControls | null = null
let scene: Scene | null = null
let camera: PerspectiveCamera | null = null
let container: Group | null = null
let retargeter: PoseRetargeter | null = null
let overlay: SkeletonOverlay | null = null
let resizeObserver: ResizeObserver | null = null
let rafHandle = 0
let appliedFrame: unknown = null
/** 疊顯與模型分開記錄已套用的幀：模型載入前疊顯就能先動。 */
let overlayFrame: unknown = null

function applyCurrentFrame() {
  if (props.timeMs == null)
    return
  const frame = findPoseFrame(preparedFrames.value, props.timeMs)
  if (!frame)
    return
  if (frame !== overlayFrame) {
    overlay?.apply(frame.points)
    overlayFrame = frame
  }
  if (!retargeter || !container || frame === appliedFrame)
    return
  if (retargeter.apply(frame.points, container))
    appliedFrame = frame
}

/**
 * 模型材質改灰。以材質原本的亮度分辨身體與關節,而非寫死材質名稱——
 * 換其他 Mixamo 角色時仍然適用。
 */
function applyGreyMaterial(node: Object3D) {
  const materials = (node as Mesh).material
  if (!materials)
    return
  for (const material of Array.isArray(materials) ? materials : [materials]) {
    const color = (material as MeshStandardMaterial).color
    if (!color)
      continue
    const luminance = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b
    color.setHex(luminance >= BODY_LUMINANCE_MIN ? MODEL_GREY.body : MODEL_GREY.joints)
  }
}

function fitModelScale() {
  if (!retargeter || !container)
    return
  const dataLegLength = medianLegLengthM(preparedFrames.value)
  if (dataLegLength != null && retargeter.legLength > 0)
    container.scale.setScalar(dataLegLength / retargeter.legLength)
}

/** 資料 bounding box → 相機初始位置(三壘側斜上方)與地面網格範圍。 */
function frameScene() {
  if (!scene || !camera || !controls)
    return
  const bounds = new Box3()
  for (const frame of preparedFrames.value) {
    for (const point of frame.points) {
      if (point)
        bounds.expandByPoint(point)
    }
  }
  if (bounds.isEmpty())
    bounds.set(new Vector3(-1, 0, -1), new Vector3(1, 2, 1))

  const center = bounds.getCenter(new Vector3())
  const size = bounds.getSize(new Vector3())
  const extent = Math.max(size.x, size.y, size.z, 2)

  camera.position.copy(center).add(new Vector3(extent * 1.1, extent * 0.7, extent * 1.1))
  controls.target.copy(center)
  controls.update()

  const gridSize = Math.ceil(Math.max(size.x, size.z)) + 4
  const gridColor = props.dark ? GRID_COLOR.dark : GRID_COLOR.light
  const grid = new GridHelper(gridSize, gridSize * 2, gridColor.center, gridColor.lines)
  grid.position.set(center.x, 0, center.z)
  scene.add(grid)
}

function resize() {
  if (!renderer || !camera || !hostRef.value)
    return
  const width = hostRef.value.clientWidth
  if (width === 0)
    return
  renderer.setSize(width, props.height)
  camera.aspect = width / props.height
  camera.updateProjectionMatrix()
  // Line2 線寬靠畫布尺寸換算，不同步 resolution 線寬會失真
  overlay?.setResolution(width, props.height)
}

function renderLoop() {
  controls?.update()
  applyCurrentFrame()
  if (renderer && scene && camera)
    renderer.render(scene, camera)
  rafHandle = requestAnimationFrame(renderLoop)
}

onMounted(async () => {
  const host = hostRef.value!

  renderer = new WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  host.appendChild(renderer.domElement)

  scene = new Scene()
  scene.background = new Color(props.dark ? SCENE_BG.dark : SCENE_BG.light)
  scene.add(new HemisphereLight(0xFFFFFF, 0x8D8D9A, 2.6))
  const sun = new DirectionalLight(0xFFFFFF, 2)
  sun.position.set(3, 8, 5)
  scene.add(sun)

  camera = new PerspectiveCamera(45, 1, 0.01, 200)
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true

  // 本場景單位是 m（y-up），關節球半徑對齊骨架版的 3.2cm
  overlay = new SkeletonOverlay(scene, { jointRadius: 0.032 })
  overlay.setVisible(props.skeleton)

  resize()
  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(host)

  frameScene()
  rafHandle = requestAnimationFrame(renderLoop)

  try {
    const gltf = await new GLTFLoader().loadAsync(props.modelUrl)
    // 投球位移大,骨架動畫下 bounding sphere 不可靠,關掉視錐剔除避免模型消失
    gltf.scene.traverse((node) => {
      if ('isSkinnedMesh' in node && node.isSkinnedMesh)
        node.frustumCulled = false
      applyGreyMaterial(node)
    })
    // 校正必須早於 retargeter：建構時會捕捉 rest 姿態的四元數與腿長
    if (props.calibrate)
      emit('calibrated', calibrateSkeleton(gltf.scene, preparedFrames.value))
    retargeter = new PoseRetargeter(gltf.scene)
    container = new Group()
    container.add(gltf.scene)
    scene.add(container)
    fitModelScale()
    loading.value = false
  }
  catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
    loading.value = false
  }
})

// frames 更新(重新載入資料)時重算縮放,並讓下個 tick 重套姿勢
watch(preparedFrames, () => {
  appliedFrame = null
  overlayFrame = null
  fitModelScale()
})
watch(() => props.height, resize)
watch(() => props.skeleton, visible => overlay?.setVisible(visible))

onBeforeUnmount(() => {
  cancelAnimationFrame(rafHandle)
  resizeObserver?.disconnect()
  controls?.dispose()
  if (scene) {
    scene.traverse((node) => {
      const mesh = node as { geometry?: { dispose: () => void }, material?: { dispose: () => void } | Array<{ dispose: () => void }> }
      mesh.geometry?.dispose()
      if (Array.isArray(mesh.material))
        mesh.material.forEach(m => m.dispose())
      else
        mesh.material?.dispose()
    })
  }
  renderer?.dispose()
  renderer?.domElement.remove()
})
</script>

<template>
  <div ref="hostRef" class="relative w-full overflow-hidden" :style="{ height: `${props.height}px` }" data-testid="pose3d-human">
    <div
      v-if="loading"
      class="absolute inset-0 flex items-center justify-center text-sm text-neutral-400"
      data-testid="pose3d-human-loading"
    >
      載入人物模型中…
    </div>
    <div
      v-else-if="loadError"
      class="absolute inset-0 flex items-center justify-center text-sm text-red-500"
      data-testid="pose3d-human-error"
    >
      人物模型載入失敗:{{ loadError }}
    </div>
  </div>
</template>

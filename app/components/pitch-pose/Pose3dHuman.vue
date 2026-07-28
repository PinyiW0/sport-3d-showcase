<script setup lang="ts">
/**
 * 真人模型 3D 動態圖(three.js + Mixamo rigged 角色)。
 * 由父層時鐘餵 `timeMs`,每個 rAF tick 找當下 frame,把 COCO-17 keypoints
 * retarget 成骨骼旋轉套到 /models/Xbot.glb(Adobe Mixamo 角色,取自 three.js 官方範例)。
 *
 * 與 Plotly 版不同,OrbitControls 的視角操作和資料更新天生解耦,
 * 播放中拖曳旋轉不需要任何 workaround。
 */
import type { Pose3dFrame } from './core/parsePitchOutcome'
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
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { findPoseFrame } from './core/findPoseFrame'
import {
  interpolateMissingPoints,
  medianLegLengthM,
  PoseRetargeter,
  toThreeSpace,
} from './core/pose3dRetarget'

const props = withDefaults(
  defineProps<{
    frames: readonly Pose3dFrame[]
    /** 目前播放時間(毫秒);null 或無對應 frame 時模型定格在上一幀。 */
    timeMs: number | null
    height?: number
  }>(),
  { height: 480 },
)

const MODEL_URL = '/models/Xbot.glb'

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
let resizeObserver: ResizeObserver | null = null
let rafHandle = 0
let appliedFrame: unknown = null

function applyCurrentFrame() {
  if (!retargeter || !container || props.timeMs == null)
    return
  const frame = findPoseFrame(preparedFrames.value, props.timeMs)
  if (!frame || frame === appliedFrame)
    return
  if (retargeter.apply(frame.points, container))
    appliedFrame = frame
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
  const grid = new GridHelper(gridSize, gridSize * 2, 0xBBBBBB, 0xE2E2E2)
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
  scene.background = new Color(0xFAFAFA)
  scene.add(new HemisphereLight(0xFFFFFF, 0x8D8D9A, 2.6))
  const sun = new DirectionalLight(0xFFFFFF, 2)
  sun.position.set(3, 8, 5)
  scene.add(sun)

  camera = new PerspectiveCamera(45, 1, 0.01, 200)
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true

  resize()
  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(host)

  frameScene()
  rafHandle = requestAnimationFrame(renderLoop)

  try {
    const gltf = await new GLTFLoader().loadAsync(MODEL_URL)
    // 投球位移大,骨架動畫下 bounding sphere 不可靠,關掉視錐剔除避免模型消失
    gltf.scene.traverse((node) => {
      if ('isSkinnedMesh' in node && node.isSkinnedMesh)
        node.frustumCulled = false
    })
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
  fitModelScale()
})
watch(() => props.height, resize)

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

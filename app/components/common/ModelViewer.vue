<script setup lang="ts">
/**
 * 3D 模型展示台：載入 glb/gltf/fbx/obj，滑鼠拖曳轉動、hover 視差、滾輪縮放。
 *
 * 取自 Vue Bits 的 ModelViewer，底層是 TresJS（Vue 的 three.js 渲染層）。
 *
 * 依本專案規範改寫的兩處：
 * - autoRotate 尊重 reduced-motion：自轉跑在 useLoop 的 render loop 裡，
 *   main.css 的 CSS guard 管不到（creative-direction §4 硬原則 1）
 * - 截圖鈕改直角並中文化，與站上其他載體一致
 */

import type { TresContext } from '@tresjs/core'
import { ContactShadows, Environment, OrbitControls, useFBX, useGLTF } from '@tresjs/cientos'
import { TresCanvas, useLoop, useTres } from '@tresjs/core'
import * as THREE from 'three'
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { defineComponent, h, shallowRef } from 'vue'

export interface ModelViewerProps {
  /** 模型檔網址（glb/gltf/fbx/obj） */
  url: string
  width?: number | string
  height?: number | string
  /** 模型水平／垂直偏移 */
  modelXOffset?: number
  modelYOffset?: number
  /** 初始旋轉（度） */
  defaultRotationX?: number
  defaultRotationY?: number
  /** 初始與可縮放的距離範圍 */
  defaultZoom?: number
  minZoomDistance?: number
  maxZoomDistance?: number
  enableMouseParallax?: boolean
  enableManualRotation?: boolean
  enableHoverRotation?: boolean
  enableManualZoom?: boolean
  ambientIntensity?: number
  keyLightIntensity?: number
  fillLightIntensity?: number
  rimLightIntensity?: number
  environmentPreset?: 'city' | 'sunset' | 'night' | 'dawn' | 'studio' | 'hangar' | 'urban' | 'modern' | 'none'
  /** 自動把模型框進視野 */
  autoFrame?: boolean
  /** 載入中顯示的佔位圖 */
  placeholderSrc?: string
  showScreenshotButton?: boolean
  fadeIn?: boolean
  autoRotate?: boolean
  autoRotateSpeed?: number
}

const props = withDefaults(defineProps<ModelViewerProps>(), {
  width: 400,
  height: 400,
  modelXOffset: 0,
  modelYOffset: 0,
  defaultRotationX: -50,
  defaultRotationY: 20,
  defaultZoom: 0.5,
  minZoomDistance: 0.5,
  maxZoomDistance: 10,
  enableMouseParallax: true,
  enableManualRotation: true,
  enableHoverRotation: true,
  enableManualZoom: true,
  ambientIntensity: 0.3,
  keyLightIntensity: 1,
  fillLightIntensity: 0.5,
  rimLightIntensity: 0.8,
  environmentPreset: 'city',
  autoFrame: false,
  placeholderSrc: '',
  showScreenshotButton: true,
  fadeIn: false,
  autoRotate: false,
  autoRotateSpeed: 0.35,
})

const emit = defineEmits<{ (e: 'modelLoaded'): void }>()

function deg2rad(d: number) {
  return (d * Math.PI) / 180
}

const ROTATE_SPEED = 0.005
const INERTIA = 0.925
const PARALLAX_MAG = 0.05
const PARALLAX_EASE = 0.12
const HOVER_MAG = deg2rad(6)
const HOVER_EASE = 0.15
const DECIDE = 8
const FADE_SPEED = 3

const isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)
// 自轉是 render loop 驅動的，CSS 的 reduced-motion guard 攔不到，得自己問一次
const prefersReducedMotion = typeof window !== 'undefined'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const containerRef = useTemplateRef<HTMLDivElement>('containerRef')
const contactGroupRef = useTemplateRef<THREE.Group>('contactGroupRef')

const isLoaded = shallowRef(false)
const pivot = new THREE.Vector3()

// @ready 給的是完整的 TresContext（renderer 是 manager、有 .value），
// 與 useTres() 的 TresPartialContext 不同型別
let tres: TresContext | null = null

// TresJS 執行期收陣列，但型別要 Vector3；這些位置是固定值，先建好省得每次渲染重配
const KEY_LIGHT_POS = new THREE.Vector3(5, 5, 5)
const FILL_LIGHT_POS = new THREE.Vector3(-5, 2, 5)
const RIM_LIGHT_POS = new THREE.Vector3(0, 4, -5)
const CONTACT_SHADOW_POS = new THREE.Vector3(0, -0.5, 0)

function toCssSize(value: number | string) {
  return typeof value === 'number' ? `${value}px` : value
}

const containerStyle = computed(() => ({
  width: toCssSize(props.width),
  height: toCssSize(props.height),
  touchAction: 'pan-y pinch-zoom' as const,
}))

const initYaw = computed(() => deg2rad(props.defaultRotationX))
const initPitch = computed(() => deg2rad(props.defaultRotationY))
const camZ = computed(() => Math.min(Math.max(props.defaultZoom, props.minZoomDistance), props.maxZoomDistance))
const camPosition = computed(() => new THREE.Vector3(0, 0, camZ.value))

// 'none' 由 v-if 擋掉；這裡只是把型別收窄給 cientos 的 <Environment>
const scenePreset = computed(() => props.environmentPreset as Exclude<ModelViewerProps['environmentPreset'], 'none'>)

function handleReady(context: TresContext) {
  tres = context
}

function handleLoaded() {
  isLoaded.value = true
  emit('modelLoaded')
}

/** 截圖：先關陰影與接觸陰影，重畫一幀再取 canvas */
function captureScreenshot() {
  if (!tres)
    return
  // TresContext 的 renderer 是 manager（實例在 .instance）、camera 是 manager（目前這台在 .activeCamera）
  const renderer = tres.renderer.instance
  const scene = tres.scene.value
  const camera = tres.camera.activeCamera.value
  if (!renderer || !scene || !camera)
    return

  renderer.shadowMap.enabled = false
  const restore: { light: THREE.Light, cast: boolean }[] = []
  scene.traverse((object: THREE.Object3D) => {
    const light = object as THREE.Light
    if (light.isLight && 'castShadow' in light) {
      restore.push({ light, cast: light.castShadow })
      light.castShadow = false
    }
  })

  const contactGroup = contactGroupRef.value
  if (contactGroup)
    contactGroup.visible = false

  renderer.render(scene, camera)
  const anchor = document.createElement('a')
  anchor.download = 'model.png'
  anchor.href = renderer.domElement.toDataURL('image/png')
  anchor.click()

  renderer.shadowMap.enabled = true
  restore.forEach(({ light, cast }) => (light.castShadow = cast))
  if (contactGroup)
    contactGroup.visible = true
}

/* ------------------------------------------------------------------ */
/*  ModelInner — 載模型並驅動旋轉／視差／hover。                        */
/*  必須放在 <TresCanvas> 內才 inject 得到 Tres context。               */
/* ------------------------------------------------------------------ */
const ModelInner = defineComponent({
  name: 'ModelInner',
  props: {
    url: { type: String, required: true },
    xOff: { type: Number, default: 0 },
    yOff: { type: Number, default: 0 },
    pivot: { type: Object as () => THREE.Vector3, required: true },
    initYaw: { type: Number, default: 0 },
    initPitch: { type: Number, default: 0 },
    minZoom: { type: Number, default: 0.5 },
    maxZoom: { type: Number, default: 10 },
    enableMouseParallax: { type: Boolean, default: true },
    enableManualRotation: { type: Boolean, default: true },
    enableHoverRotation: { type: Boolean, default: true },
    enableManualZoom: { type: Boolean, default: true },
    autoFrame: { type: Boolean, default: false },
    fadeIn: { type: Boolean, default: false },
    autoRotate: { type: Boolean, default: false },
    autoRotateSpeed: { type: Number, default: 0.35 },
  },
  emits: ['loaded'],
  setup(innerProps, { emit: innerEmit }) {
    // TresJS 5 的 useTres().renderer 是 renderer 本身、不是 ref（camera 才是）。
    // 照舊寫成 renderer.value 會拿到 undefined，被 ?. 吞掉後拖曳與觸控互動全部靜默失效
    const { camera, renderer } = useTres()
    const outerRef = shallowRef<THREE.Group | null>(null)
    const innerRef = shallowRef<THREE.Group | null>(null)
    const content = shallowRef<THREE.Object3D | null>(null)
    const pivotW = new THREE.Vector3()
    const ndcScratch = new THREE.Vector3()

    function setOpacity(root: THREE.Object3D, value: number) {
      root.traverse((object: THREE.Object3D) => {
        const mesh = object as THREE.Mesh
        if (!mesh.isMesh)
          return
        const material = mesh.material as THREE.Material | THREE.Material[]
        if (Array.isArray(material))
          material.forEach(m => (m.opacity = value))
        else if (material)
          material.opacity = value
      })
    }

    const vel = { x: 0, y: 0 }
    const tPar = { x: 0, y: 0 }
    const cPar = { x: 0, y: 0 }
    const tHov = { x: 0, y: 0 }
    const cHov = { x: 0, y: 0 }
    const cleanups: (() => void)[] = []

    // layout() 會寫這個值，宣告必須在它前面
    let fadeProgress = -1 // -1 = 沒在淡入；0..1 = 淡入中

    /** 等 ref 從 null 變成有值。載入已由 useGLTF/useFBX 的 immediate 觸發 */
    function untilResolved<T>(source: Ref<T | null>): Promise<T> {
      if (source.value)
        return Promise.resolve(source.value)
      return new Promise((resolve) => {
        const stop = watch(source, (value) => {
          if (value) {
            stop()
            resolve(value)
          }
        })
      })
    }

    // cientos 5.x 的 useGLTF/useFBX 不是 async 函式，回傳的是 { state, isLoading, execute }，
    // 且呼叫當下就開始載（immediate）。這裡只等 state 填值——execute() 會整包重新下載一次。
    function loadModel(): Promise<THREE.Object3D | null> {
      const ext = innerProps.url.split('.').pop()?.toLowerCase()
      if (ext === 'glb' || ext === 'gltf') {
        const { state } = useGLTF(innerProps.url)
        return untilResolved(state).then(gltf => gltf.scene.clone())
      }
      if (ext === 'fbx') {
        const { state } = useFBX(innerProps.url)
        return untilResolved(state).then(fbx => fbx.clone())
      }
      if (ext === 'obj')
        return new OBJLoader().loadAsync(innerProps.url)
      console.error('ModelViewer: 不支援的格式:', ext)
      return Promise.resolve(null)
    }

    /** 量測模型尺寸 → 置中、正規化縮放、套初始角度 */
    function layout() {
      const group = innerRef.value
      const outer = outerRef.value
      if (!group || !outer || !content.value)
        return

      // 先歸零再量：render loop 可能已經推過 outer，而 setFromObject 取的是世界座標
      outer.position.set(0, 0, 0)
      outer.rotation.set(0, 0, 0)
      outer.updateWorldMatrix(true, true)
      group.updateWorldMatrix(true, true)
      const sphere = new THREE.Box3().setFromObject(group).getBoundingSphere(new THREE.Sphere())
      const scale = 1 / (sphere.radius * 2)
      group.position.set(-sphere.center.x, -sphere.center.y, -sphere.center.z)
      group.scale.setScalar(scale)

      group.traverse((object: THREE.Object3D) => {
        const mesh = object as THREE.Mesh
        if (!mesh.isMesh)
          return
        mesh.castShadow = true
        mesh.receiveShadow = true
        if (innerProps.fadeIn) {
          const material = mesh.material as THREE.Material | THREE.Material[]
          ;(Array.isArray(material) ? material : [material]).forEach((m) => {
            if (!m)
              return
            m.transparent = true
            m.opacity = 0
          })
        }
      })

      group.getWorldPosition(pivotW)
      innerProps.pivot.copy(pivotW)
      outer.rotation.set(innerProps.initPitch, innerProps.initYaw, 0)

      const cam = camera.value as THREE.PerspectiveCamera | undefined
      if (innerProps.autoFrame && cam?.isPerspectiveCamera) {
        const fitRadius = sphere.radius * scale
        const distance = (fitRadius * 1.2) / Math.sin((cam.fov * Math.PI) / 180 / 2)
        cam.position.set(pivotW.x, pivotW.y, pivotW.z + distance)
        cam.near = distance / 10
        cam.far = distance * 10
        cam.updateProjectionMatrix()
      }

      if (innerProps.fadeIn)
        fadeProgress = 0
      else innerEmit('loaded')
    }

    // layout 要等 render loop 確認模型真的掛進 group 了才跑：首次掛載時
    // <primitive> 可能比 content 晚一兩幀插入，用 nextTick 會量到空的 group
    let pendingLayout = false
    loadModel().then((object) => {
      content.value = object
      if (object)
        pendingLayout = true
      else innerEmit('loaded')
    })

    /** 桌機：指標拖曳轉動 */
    function setupDesktopRotation() {
      const el = renderer?.domElement
      if (!el || !innerProps.enableManualRotation || isTouch)
        return

      let dragging = false
      let lastX = 0
      let lastY = 0

      function onPointerDown(e: PointerEvent) {
        if (e.pointerType !== 'mouse' && e.pointerType !== 'pen')
          return
        dragging = true
        lastX = e.clientX
        lastY = e.clientY
        window.addEventListener('pointerup', onPointerUp)
      }
      function onPointerMove(e: PointerEvent) {
        if (!dragging || !outerRef.value)
          return
        const dx = e.clientX - lastX
        const dy = e.clientY - lastY
        lastX = e.clientX
        lastY = e.clientY
        outerRef.value.rotation.y += dx * ROTATE_SPEED
        outerRef.value.rotation.x += dy * ROTATE_SPEED
        vel.x = dx * ROTATE_SPEED
        vel.y = dy * ROTATE_SPEED
      }
      function onPointerUp() {
        dragging = false
      }

      el.addEventListener('pointerdown', onPointerDown)
      el.addEventListener('pointermove', onPointerMove)
      cleanups.push(() => {
        el.removeEventListener('pointerdown', onPointerDown)
        el.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', onPointerUp)
      })
    }

    /** 觸控：單指拖曳轉動、雙指捏合縮放 */
    function setupTouch() {
      const el = renderer?.domElement
      if (!el || !isTouch)
        return

      const points = new Map<number, { x: number, y: number }>()
      type Mode = 'idle' | 'decide' | 'rotate' | 'pinch'
      let mode: Mode = 'idle'
      let startX = 0
      let startY = 0
      let lastX = 0
      let lastY = 0
      let startDist = 0
      let startZ = 0

      function onPointerDown(e: PointerEvent) {
        if (e.pointerType !== 'touch')
          return
        points.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (points.size === 1) {
          mode = 'decide'
          startX = lastX = e.clientX
          startY = lastY = e.clientY
        }
        else if (points.size === 2 && innerProps.enableManualZoom) {
          mode = 'pinch'
          const [p1, p2] = [...points.values()]
          startDist = Math.hypot(p1!.x - p2!.x, p1!.y - p2!.y)
          startZ = camera.value?.position.z ?? 0
          e.preventDefault()
        }
      }

      function onPointerMove(e: PointerEvent) {
        const point = points.get(e.pointerId)
        if (!point)
          return
        point.x = e.clientX
        point.y = e.clientY

        // 先判斷這一劃是要轉模型還是要捲頁面，別把垂直捲動吃掉
        if (mode === 'decide') {
          const dx = e.clientX - startX
          const dy = e.clientY - startY
          if (Math.abs(dx) > DECIDE || Math.abs(dy) > DECIDE) {
            if (innerProps.enableManualRotation && Math.abs(dx) > Math.abs(dy)) {
              mode = 'rotate'
              el!.setPointerCapture(e.pointerId)
            }
            else {
              mode = 'idle'
              points.clear()
            }
          }
        }

        if (mode === 'rotate' && outerRef.value) {
          e.preventDefault()
          const dx = e.clientX - lastX
          const dy = e.clientY - lastY
          lastX = e.clientX
          lastY = e.clientY
          outerRef.value.rotation.y += dx * ROTATE_SPEED
          outerRef.value.rotation.x += dy * ROTATE_SPEED
          vel.x = dx * ROTATE_SPEED
          vel.y = dy * ROTATE_SPEED
        }
        else if (mode === 'pinch' && points.size === 2 && camera.value) {
          e.preventDefault()
          const [p1, p2] = [...points.values()]
          const dist = Math.hypot(p1!.x - p2!.x, p1!.y - p2!.y)
          camera.value.position.z = THREE.MathUtils.clamp(
            startZ * (startDist / dist),
            innerProps.minZoom,
            innerProps.maxZoom,
          )
        }
      }

      function onPointerUp(e: PointerEvent) {
        points.delete(e.pointerId)
        if (mode === 'rotate' && points.size === 0)
          mode = 'idle'
        if (mode === 'pinch' && points.size < 2)
          mode = 'idle'
      }

      el.addEventListener('pointerdown', onPointerDown, { passive: true })
      window.addEventListener('pointermove', onPointerMove, { passive: false })
      window.addEventListener('pointerup', onPointerUp, { passive: true })
      window.addEventListener('pointercancel', onPointerUp, { passive: true })
      cleanups.push(() => {
        el.removeEventListener('pointerdown', onPointerDown)
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', onPointerUp)
        window.removeEventListener('pointercancel', onPointerUp)
      })
    }

    /** 滑鼠視差與 hover 轉動的目標值 */
    function setupParallax() {
      if (isTouch)
        return
      function onMove(e: PointerEvent) {
        if (e.pointerType !== 'mouse')
          return
        const nx = (e.clientX / window.innerWidth) * 2 - 1
        const ny = (e.clientY / window.innerHeight) * 2 - 1
        if (innerProps.enableMouseParallax) {
          tPar.x = -nx * PARALLAX_MAG
          tPar.y = -ny * PARALLAX_MAG
        }
        if (innerProps.enableHoverRotation) {
          tHov.x = ny * HOVER_MAG
          tHov.y = nx * HOVER_MAG
        }
      }
      window.addEventListener('pointermove', onMove)
      cleanups.push(() => window.removeEventListener('pointermove', onMove))
    }

    onMounted(() => {
      setupDesktopRotation()
      setupTouch()
      setupParallax()
    })

    onBeforeUnmount(() => {
      cleanups.forEach(fn => fn())
      cleanups.length = 0
      content.value?.traverse((object: THREE.Object3D) => {
        const mesh = object as THREE.Mesh
        if (!mesh.isMesh)
          return
        mesh.geometry?.dispose()
        const material = mesh.material as THREE.Material | THREE.Material[]
        if (Array.isArray(material))
          material.forEach(m => m.dispose())
        else material?.dispose()
      })
    })

    const { onBeforeRender } = useLoop()
    onBeforeRender(({ delta }) => {
      const outer = outerRef.value
      const cam = camera.value
      if (!outer || !cam)
        return

      // 一次性 layout，等模型真的進 group 了才做
      if (pendingLayout && innerRef.value && innerRef.value.children.length > 0) {
        pendingLayout = false
        layout()
      }

      // 跟著幀走的淡入（用 delta，與更新率無關）
      if (fadeProgress >= 0) {
        fadeProgress = Math.min(fadeProgress + delta * FADE_SPEED, 1)
        if (innerRef.value)
          setOpacity(innerRef.value, fadeProgress)
        if (fadeProgress >= 1) {
          fadeProgress = -1
          innerEmit('loaded')
        }
      }

      cPar.x += (tPar.x - cPar.x) * PARALLAX_EASE
      cPar.y += (tPar.y - cPar.y) * PARALLAX_EASE

      const prevHoverX = cHov.x
      const prevHoverY = cHov.y
      cHov.x += (tHov.x - cHov.x) * HOVER_EASE
      cHov.y += (tHov.y - cHov.y) * HOVER_EASE

      const ndc = ndcScratch.copy(pivotW).project(cam)
      ndc.x += innerProps.xOff + cPar.x
      ndc.y += innerProps.yOff + cPar.y
      outer.position.copy(ndc.unproject(cam))

      outer.rotation.x += cHov.x - prevHoverX
      outer.rotation.y += cHov.y - prevHoverY

      if (innerProps.autoRotate && !prefersReducedMotion)
        outer.rotation.y += innerProps.autoRotateSpeed * delta

      outer.rotation.y += vel.x
      outer.rotation.x += vel.y
      vel.x *= INERTIA
      vel.y *= INERTIA
    })

    return () =>
      h('TresGroup', { ref: outerRef }, [
        h('TresGroup', { ref: innerRef }, [content.value ? h('primitive', { object: content.value }) : null]),
      ])
  },
})

/* ------------------------------------------------------------------ */
/*  DesktopControls — 只留縮放的 OrbitControls，target 跟著 pivot 走。   */
/* ------------------------------------------------------------------ */
const DesktopControls = defineComponent({
  name: 'DesktopControls',
  props: {
    pivot: { type: Object as () => THREE.Vector3, required: true },
    min: { type: Number, default: 0.5 },
    max: { type: Number, default: 10 },
    zoomEnabled: { type: Boolean, default: true },
  },
  setup(controlProps) {
    const controlsRef = shallowRef<{ instance?: { value?: unknown } | unknown } | null>(null)

    const { onBeforeRender } = useLoop()
    onBeforeRender(() => {
      const exposed = controlsRef.value as { instance?: unknown } | null
      const maybe = exposed?.instance as { value?: unknown } | undefined
      const control = (maybe && 'value' in maybe ? maybe.value : maybe) as { target?: THREE.Vector3 } | undefined
      if (control?.target?.copy)
        control.target.copy(controlProps.pivot)
    })

    return () =>
      h(OrbitControls, {
        ref: controlsRef,
        makeDefault: true,
        enablePan: false,
        enableRotate: false,
        enableZoom: controlProps.zoomEnabled,
        minDistance: controlProps.min,
        maxDistance: controlProps.max,
      })
  },
})
</script>

<template>
  <div ref="containerRef" class="model-viewer" :style="containerStyle">
    <button v-if="showScreenshotButton" type="button" class="model-viewer-screenshot" @click="captureScreenshot">
      截圖
    </button>

    <div v-if="!isLoaded" class="model-viewer-loader">
      <img
        v-if="placeholderSrc"
        :src="placeholderSrc"
        width="128"
        height="128"
        class="model-viewer-placeholder"
        alt=""
      >
      <span v-else class="model-viewer-progress">載入中…</span>
    </div>

    <!-- alpha + clearAlpha 0：原版沒設，canvas 會是一塊不透明黑底，
         嵌進頁面就是一個突兀的方塊 -->
    <TresCanvas
      shadows
      :alpha="true"
      :clear-alpha="0"
      :preserve-drawing-buffer="true"
      :tone-mapping="ACESFilmicToneMapping"
      :output-color-space="SRGBColorSpace"
      @ready="handleReady"
    >
      <TresPerspectiveCamera :position="camPosition" :fov="50" :near="0.01" :far="100" />

      <Environment v-if="environmentPreset !== 'none'" :preset="scenePreset" :background="false" />

      <TresAmbientLight :intensity="ambientIntensity" />
      <TresDirectionalLight :position="KEY_LIGHT_POS" :intensity="keyLightIntensity" cast-shadow />
      <TresDirectionalLight :position="FILL_LIGHT_POS" :intensity="fillLightIntensity" />
      <TresDirectionalLight :position="RIM_LIGHT_POS" :intensity="rimLightIntensity" />

      <!-- scale 原版是 10：透明背景下那片平面會鋪滿整個視野，變成一塊看得見邊界的灰矩形。
           收到剛好罩住模型下方即可 -->
      <TresGroup ref="contactGroupRef">
        <ContactShadows :position="CONTACT_SHADOW_POS" :opacity="0.35" :scale="2.5" :blur="2.5" />
      </TresGroup>

      <ModelInner
        :url="url"
        :x-off="modelXOffset"
        :y-off="modelYOffset"
        :pivot="pivot"
        :init-yaw="initYaw"
        :init-pitch="initPitch"
        :min-zoom="minZoomDistance"
        :max-zoom="maxZoomDistance"
        :enable-mouse-parallax="enableMouseParallax"
        :enable-manual-rotation="enableManualRotation"
        :enable-hover-rotation="enableHoverRotation"
        :enable-manual-zoom="enableManualZoom"
        :auto-frame="autoFrame"
        :fade-in="fadeIn"
        :auto-rotate="autoRotate"
        :auto-rotate-speed="autoRotateSpeed"
        @loaded="handleLoaded"
      />

      <DesktopControls
        v-if="!isTouch"
        :pivot="pivot"
        :min="minZoomDistance"
        :max="maxZoomDistance"
        :zoom-enabled="enableManualZoom"
      />
    </TresCanvas>
  </div>
</template>

<style scoped>
.model-viewer {
  position: relative;
}

.model-viewer :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}

/* 直角＋中性色，與站上其他載體一致（原版是白框圓角） */
.model-viewer-screenshot {
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 10;
  padding: 0.375rem 0.75rem;
  border: 1px solid currentColor;
  background: transparent;
  color: inherit;
  font-size: 0.75rem;
  cursor: pointer;
  transition:
    background-color 250ms var(--ease-standard),
    color 250ms var(--ease-standard);
}

.model-viewer-screenshot:hover {
  background: currentColor;
}

.model-viewer-loader {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.model-viewer-placeholder {
  filter: blur(16px);
}

.model-viewer-progress {
  font-size: 0.875rem;
  letter-spacing: 0.05em;
  opacity: 0.6;
}
</style>

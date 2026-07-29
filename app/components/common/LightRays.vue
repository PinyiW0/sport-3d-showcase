<script setup lang="ts">
/**
 * 從指定角落打出來的體積光。
 *
 * 機制取自 Vue Bits 的 LightRays：一張全屏三角形，fragment shader 依
 * 「像素到光源的方向」與參考方向的夾角算強度，兩組不同種子疊出光束的疏密。
 *
 * 依本專案規範改寫的三處：
 * - reduced-motion 不跑動畫：rAF 迴圈繞得過 main.css 的 CSS guard
 *   （creative-direction §4 硬原則 1）。改成只畫一幀靜態光束
 * - 拿掉寫死的 z-[3]：這層是背景，z 順序交給使用它的版面決定，
 *   原版會蓋在 hero 文字上
 * - ogl 物件不放 ref：Vue 的深層代理會包住 renderer 與 program 的內部狀態
 */

import { Mesh, Program, Renderer, Triangle } from 'ogl'

export type RaysOrigin
  = | 'top-center' | 'top-left' | 'top-right' | 'right'
    | 'left' | 'bottom-center' | 'bottom-right' | 'bottom-left'

interface Props {
  /** 光源位置 */
  raysOrigin?: RaysOrigin
  /** 光線顏色（hex） */
  raysColor?: string
  raysSpeed?: number
  /** 光束擴散程度，越小越集中 */
  lightSpread?: number
  /** 光線長度 */
  rayLength?: number
  pulsating?: boolean
  /** 從光源開始衰減的距離 */
  fadeDistance?: number
  saturation?: number
  /** 光線是否轉向游標 */
  followMouse?: boolean
  mouseInfluence?: number
  /** 顆粒感 */
  noiseAmount?: number
  /** 波形扭曲 */
  distortion?: number
}

const props = withDefaults(defineProps<Props>(), {
  raysOrigin: 'top-center',
  raysColor: '#ffffff',
  raysSpeed: 1,
  lightSpread: 1,
  rayLength: 2,
  pulsating: false,
  fadeDistance: 1,
  saturation: 1,
  followMouse: true,
  mouseInfluence: 0.1,
  noiseAmount: 0,
  distortion: 0,
})

const HEX_PATTERN = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i

/** "#rrggbb" → 0–1 的 rgb 三元組 */
function hexToRgb(hex: string): [number, number, number] {
  const m = HEX_PATTERN.exec(hex)
  if (!m)
    return [1, 1, 1]
  return [
    Number.parseInt(m[1]!, 16) / 255,
    Number.parseInt(m[2]!, 16) / 255,
    Number.parseInt(m[3]!, 16) / 255,
  ]
}

/** 光源錨點與參考方向；outside 讓光源落在畫面外一點，光束才不會從邊緣硬切 */
function getAnchorAndDir(origin: RaysOrigin, w: number, h: number) {
  const outside = 0.2
  switch (origin) {
    case 'top-left': return { anchor: [0, -outside * h] as [number, number], dir: [0, 1] as [number, number] }
    case 'top-right': return { anchor: [w, -outside * h] as [number, number], dir: [0, 1] as [number, number] }
    case 'left': return { anchor: [-outside * w, 0.5 * h] as [number, number], dir: [1, 0] as [number, number] }
    case 'right': return { anchor: [(1 + outside) * w, 0.5 * h] as [number, number], dir: [-1, 0] as [number, number] }
    case 'bottom-left': return { anchor: [0, (1 + outside) * h] as [number, number], dir: [0, -1] as [number, number] }
    case 'bottom-center': return { anchor: [0.5 * w, (1 + outside) * h] as [number, number], dir: [0, -1] as [number, number] }
    case 'bottom-right': return { anchor: [w, (1 + outside) * h] as [number, number], dir: [0, -1] as [number, number] }
    default: return { anchor: [0.5 * w, -outside * h] as [number, number], dir: [0, 1] as [number, number] }
  }
}

const vertexShader = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`

const fragmentShader = `precision highp float;

uniform float iTime;
uniform vec2  iResolution;
uniform vec2  rayPos;
uniform vec2  rayDir;
uniform vec3  raysColor;
uniform float raysSpeed;
uniform float lightSpread;
uniform float rayLength;
uniform float pulsating;
uniform float fadeDistance;
uniform float saturation;
uniform vec2  mousePos;
uniform float mouseInfluence;
uniform float noiseAmount;
uniform float distortion;

varying vec2 vUv;

float noise(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

float rayStrength(vec2 raySource, vec2 rayRefDirection, vec2 coord,
                  float seedA, float seedB, float speed) {
  vec2 sourceToCoord = coord - raySource;
  vec2 dirNorm = normalize(sourceToCoord);
  float cosAngle = dot(dirNorm, rayRefDirection);

  float distortedAngle = cosAngle + distortion * sin(iTime * 2.0 + length(sourceToCoord) * 0.01) * 0.2;
  float spreadFactor = pow(max(distortedAngle, 0.0), 1.0 / max(lightSpread, 0.001));

  float distance = length(sourceToCoord);
  float maxDistance = iResolution.x * rayLength;
  float lengthFalloff = clamp((maxDistance - distance) / maxDistance, 0.0, 1.0);
  float fadeFalloff = clamp((iResolution.x * fadeDistance - distance) / (iResolution.x * fadeDistance), 0.5, 1.0);
  float pulse = pulsating > 0.5 ? (0.8 + 0.2 * sin(iTime * speed * 3.0)) : 1.0;

  float baseStrength = clamp(
    (0.45 + 0.15 * sin(distortedAngle * seedA + iTime * speed)) +
    (0.3 + 0.2 * cos(-distortedAngle * seedB + iTime * speed)),
    0.0, 1.0
  );

  return baseStrength * lengthFalloff * fadeFalloff * spreadFactor * pulse;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 coord = vec2(fragCoord.x, iResolution.y - fragCoord.y);

  vec2 finalRayDir = rayDir;
  if (mouseInfluence > 0.0) {
    vec2 mouseScreenPos = mousePos * iResolution.xy;
    vec2 mouseDirection = normalize(mouseScreenPos - rayPos);
    finalRayDir = normalize(mix(rayDir, mouseDirection, mouseInfluence));
  }

  vec4 rays1 = vec4(1.0) * rayStrength(rayPos, finalRayDir, coord, 36.2214, 21.11349, 1.5 * raysSpeed);
  vec4 rays2 = vec4(1.0) * rayStrength(rayPos, finalRayDir, coord, 22.3991, 18.0234, 1.1 * raysSpeed);

  fragColor = rays1 * 0.5 + rays2 * 0.4;

  if (noiseAmount > 0.0) {
    float n = noise(coord * 0.01 + iTime * 0.1);
    fragColor.rgb *= (1.0 - noiseAmount + noiseAmount * n);
  }

  float brightness = 1.0 - (coord.y / iResolution.y);
  fragColor.x *= 0.1 + brightness * 0.8;
  fragColor.y *= 0.3 + brightness * 0.6;
  fragColor.z *= 0.5 + brightness * 0.5;

  if (saturation != 1.0) {
    float gray = dot(fragColor.rgb, vec3(0.299, 0.587, 0.114));
    fragColor.rgb = mix(vec3(gray), fragColor.rgb, saturation);
  }

  fragColor.rgb *= raysColor;
}

void main() {
  vec4 color;
  mainImage(color, gl_FragCoord.xy);
  gl_FragColor = color;
}`

const containerRef = useTemplateRef<HTMLDivElement>('containerRef')

interface Uniforms {
  iTime: { value: number }
  iResolution: { value: [number, number] }
  rayPos: { value: [number, number] }
  rayDir: { value: [number, number] }
  raysColor: { value: [number, number, number] }
  raysSpeed: { value: number }
  lightSpread: { value: number }
  rayLength: { value: number }
  pulsating: { value: number }
  fadeDistance: { value: number }
  saturation: { value: number }
  mousePos: { value: [number, number] }
  mouseInfluence: { value: number }
  noiseAmount: { value: number }
  distortion: { value: number }
}

let renderer: Renderer | null = null
let uniforms: Uniforms | null = null
let mesh: Mesh | null = null
let cleanup: (() => void) | null = null

const mouse = { x: 0.5, y: 0.5 }
const smoothMouse = { x: 0.5, y: 0.5 }
const isVisible = ref(false)
let observer: IntersectionObserver | null = null

function init() {
  const container = containerRef.value
  if (!container)
    return

  // 建不出 context 就放棄——這是裝飾層，不能讓它拖垮整頁
  try {
    renderer = new Renderer({
      dpr: Math.min(window.devicePixelRatio || 1, 2),
      alpha: true,
      antialias: false,
      powerPreference: 'high-performance',
    })
  }
  catch {
    renderer = null
    return
  }

  const gl = renderer.gl
  gl.canvas.style.width = '100%'
  gl.canvas.style.height = '100%'
  container.replaceChildren(gl.canvas)

  uniforms = {
    iTime: { value: 0 },
    iResolution: { value: [1, 1] },
    rayPos: { value: [0, 0] },
    rayDir: { value: [0, 1] },
    raysColor: { value: hexToRgb(props.raysColor) },
    raysSpeed: { value: props.raysSpeed },
    lightSpread: { value: props.lightSpread },
    rayLength: { value: props.rayLength },
    pulsating: { value: props.pulsating ? 1 : 0 },
    fadeDistance: { value: props.fadeDistance },
    saturation: { value: props.saturation },
    mousePos: { value: [0.5, 0.5] },
    mouseInfluence: { value: props.mouseInfluence },
    noiseAmount: { value: props.noiseAmount },
    distortion: { value: props.distortion },
  }

  mesh = new Mesh(gl, {
    geometry: new Triangle(gl),
    program: new Program(gl, { vertex: vertexShader, fragment: fragmentShader, uniforms }),
  })

  function updatePlacement() {
    if (!container || !renderer || !uniforms)
      return
    const { clientWidth: wCss, clientHeight: hCss } = container
    renderer.setSize(wCss, hCss)
    const w = wCss * renderer.dpr
    const h = hCss * renderer.dpr
    uniforms.iResolution.value = [w, h]
    const { anchor, dir } = getAnchorAndDir(props.raysOrigin, w, h)
    uniforms.rayPos.value = anchor
    uniforms.rayDir.value = dir
  }

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  let raf: number | null = null

  function renderFrame(t: number) {
    raf = null
    if (!renderer || !uniforms || !mesh)
      return
    uniforms.iTime.value = t * 0.001

    if (props.followMouse && props.mouseInfluence > 0) {
      const smoothing = 0.92
      smoothMouse.x = smoothMouse.x * smoothing + mouse.x * (1 - smoothing)
      smoothMouse.y = smoothMouse.y * smoothing + mouse.y * (1 - smoothing)
      uniforms.mousePos.value = [smoothMouse.x, smoothMouse.y]
    }

    renderer.render({ scene: mesh })
    // 減少動態時只畫這一幀：光束還在，但不再流動
    if (isVisible.value && !motionQuery.matches)
      raf = requestAnimationFrame(renderFrame)
  }

  function start() {
    if (raf === null)
      raf = requestAnimationFrame(renderFrame)
  }

  let resizeTimer: ReturnType<typeof setTimeout> | null = null
  function handleResize() {
    if (resizeTimer)
      clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      updatePlacement()
      start()
      resizeTimer = null
    }, 16)
  }

  let mouseRaf: number | null = null
  function handleMouseMove(e: MouseEvent) {
    if (!container || mouseRaf !== null)
      return
    mouseRaf = requestAnimationFrame(() => {
      const rect = container.getBoundingClientRect()
      mouse.x = (e.clientX - rect.left) / rect.width
      mouse.y = (e.clientY - rect.top) / rect.height
      mouseRaf = null
    })
  }

  window.addEventListener('resize', handleResize, { passive: true })
  motionQuery.addEventListener('change', start)
  if (props.followMouse)
    window.addEventListener('mousemove', handleMouseMove, { passive: true })

  updatePlacement()
  start()

  cleanup = () => {
    if (raf !== null)
      cancelAnimationFrame(raf)
    if (mouseRaf !== null)
      cancelAnimationFrame(mouseRaf)
    if (resizeTimer)
      clearTimeout(resizeTimer)
    window.removeEventListener('resize', handleResize)
    window.removeEventListener('mousemove', handleMouseMove)
    motionQuery.removeEventListener('change', start)
    renderer?.gl.getExtension('WEBGL_lose_context')?.loseContext()
    gl.canvas.remove()
    renderer = null
    uniforms = null
    mesh = null
  }
}

// 只有捲進視野才開跑，離開就停——首頁往下捲時不必一直畫
onMounted(() => {
  const container = containerRef.value
  if (!container)
    return
  observer = new IntersectionObserver(
    ([entry]) => (isVisible.value = entry?.isIntersecting ?? false),
    { threshold: 0.1, rootMargin: '50px' },
  )
  observer.observe(container)
})

watch(isVisible, (visible) => {
  if (visible && !renderer)
    init()
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  cleanup?.()
  cleanup = null
})
</script>

<template>
  <div ref="containerRef" class="relative size-full overflow-hidden" />
</template>

<script setup lang="ts">
/**
 * 飄動的細線束背景。
 *
 * 機制取自 Vue Bits 的 Threads：全屏三角形，fragment shader 疊 40 條線，
 * 每條線的縱向位置由 Perlin noise 隨時間推移，越靠下的線越淡。
 *
 * 依本專案規範改寫的四處：
 * - reduced-motion 不跑動畫：rAF 迴圈繞得過 main.css 的 CSS guard
 *   （creative-direction §4 硬原則 1）。停在當下那一幀，線還在、只是不飄
 * - 離開視野就停：每像素要跑 40 次 Perlin noise，是頁面上最重的一層，
 *   捲走了還在畫純屬浪費
 * - WebGL 建不出來就靜默放棄，不讓裝飾層拖垮整頁
 * - props 變動只更新 uniforms，不整個重建場景（原版連 WebGL context 一起重來）
 */

import type { OGLRenderingContext } from 'ogl'
import { Color, Mesh, Program, Renderer, Triangle } from 'ogl'

interface Props {
  /** 線條顏色，RGB 各 0–1 */
  color?: [number, number, number]
  /** 波動幅度 */
  amplitude?: number
  /** 線與線的間距；0 表示不散開 */
  distance?: number
  /** 線條是否跟著指標擺動 */
  enableMouseInteraction?: boolean
  /** 弧度：正值＝開口向上（兩端翹、中間垂）；0＝水平直線 */
  curvature?: number
  /** 弧線最低點的水平位置，0＝最左、1＝最右 */
  curveCenter?: number
  /** 弧線最低點的垂直位置，0＝底部、1＝頂部 */
  baseline?: number
}

const props = withDefaults(defineProps<Props>(), {
  color: () => [1, 1, 1],
  amplitude: 1,
  distance: 0,
  enableMouseInteraction: false,
  curvature: 0,
  curveCenter: 0.5,
  baseline: 0.5,
})

const vertexShader = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const fragmentShader = `
precision highp float;

uniform float iTime;
uniform vec3 iResolution;
uniform vec3 uColor;
uniform float uAmplitude;
uniform float uDistance;
uniform vec2 uMouse;
uniform float uCurvature;
uniform float uCurveCenter;
uniform float uBaseline;

#define PI 3.1415926538

const int u_line_count = 40;
const float u_line_width = 7.0;
const float u_line_blur = 10.0;

float Perlin2D(vec2 P) {
    vec2 Pi = floor(P);
    vec4 Pf_Pfmin1 = P.xyxy - vec4(Pi, Pi + 1.0);
    vec4 Pt = vec4(Pi.xy, Pi.xy + 1.0);
    Pt = Pt - floor(Pt * (1.0 / 71.0)) * 71.0;
    Pt += vec2(26.0, 161.0).xyxy;
    Pt *= Pt;
    Pt = Pt.xzxz * Pt.yyww;
    vec4 hash_x = fract(Pt * (1.0 / 951.135664));
    vec4 hash_y = fract(Pt * (1.0 / 642.949883));
    vec4 grad_x = hash_x - 0.49999;
    vec4 grad_y = hash_y - 0.49999;
    vec4 grad_results = inversesqrt(grad_x * grad_x + grad_y * grad_y)
        * (grad_x * Pf_Pfmin1.xzxz + grad_y * Pf_Pfmin1.yyww);
    grad_results *= 1.4142135623730950;
    vec2 blend = Pf_Pfmin1.xy * Pf_Pfmin1.xy * Pf_Pfmin1.xy
               * (Pf_Pfmin1.xy * (Pf_Pfmin1.xy * 6.0 - 15.0) + 10.0);
    vec4 blend2 = vec4(blend, vec2(1.0 - blend));
    return dot(grad_results, blend2.zxzx * blend2.wwyy);
}

float pixel(float count, vec2 resolution) {
    return (1.0 / max(resolution.x, resolution.y)) * count;
}

float lineFn(vec2 st, float width, float perc, float offset, vec2 mouse, float time, float amplitude, float distance) {
    float split_offset = (perc * 0.4);
    float split_point = 0.1 + split_offset;

    float amplitude_normal = smoothstep(split_point, 0.7, st.x);
    float amplitude_strength = 0.5;
    float finalAmplitude = amplitude_normal * amplitude_strength
                           * amplitude * (1.0 + (mouse.y - 0.5) * 0.2);

    float time_scaled = time / 10.0 + (mouse.x - 0.5) * 1.0;
    float blur = smoothstep(split_point, split_point + 0.05, st.x) * perc;

    float xnoise = mix(
        Perlin2D(vec2(time_scaled, st.x + perc) * 2.5),
        Perlin2D(vec2(time_scaled, st.x + time_scaled) * 3.5) / 1.5,
        st.x * 0.3
    );

    // 線束沿一條拋物線走：基準線不再是固定的 0.5，而是隨 st.x 變化的曲線。
    // uCurvature = 0 時退化成原本的水平線束
    float dx = st.x - uCurveCenter;
    float curveY = uBaseline + uCurvature * dx * dx;

    float y = curveY + (perc - 0.5) * distance + xnoise / 2.0 * finalAmplitude;

    float line_start = smoothstep(
        y + (width / 2.0) + (u_line_blur * pixel(1.0, iResolution.xy) * blur),
        y,
        st.y
    );

    float line_end = smoothstep(
        y,
        y - (width / 2.0) - (u_line_blur * pixel(1.0, iResolution.xy) * blur),
        st.y
    );

    return clamp(
        (line_start - line_end) * (1.0 - smoothstep(0.0, 1.0, pow(perc, 0.3))),
        0.0,
        1.0
    );
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;

    float line_strength = 1.0;
    for (int i = 0; i < u_line_count; i++) {
        float p = float(i) / float(u_line_count);
        line_strength *= (1.0 - lineFn(
            uv,
            u_line_width * pixel(1.0, iResolution.xy) * (1.0 - p),
            p,
            (PI * 1.0) * p,
            uMouse,
            iTime,
            uAmplitude,
            uDistance
        ));
    }

    float colorVal = 1.0 - line_strength;
    fragColor = vec4(uColor * colorVal, colorVal);
}

void main() {
    mainImage(gl_FragColor, gl_FragCoord.xy);
}
`

const containerRef = useTemplateRef<HTMLDivElement>('containerRef')

let renderer: Renderer | null = null
let gl: OGLRenderingContext | null = null
let program: Program | null = null
let mesh: Mesh | null = null
let cleanup: (() => void) | null = null

const currentMouse: [number, number] = [0.5, 0.5]
const targetMouse: [number, number] = [0.5, 0.5]
const isVisible = ref(false)
let observer: IntersectionObserver | null = null

function init() {
  const container = containerRef.value
  if (!container)
    return

  // 建不出 context 就放棄——這是裝飾層，不能讓它拖垮整頁
  try {
    renderer = new Renderer({ alpha: true })
  }
  catch {
    renderer = null
    return
  }

  gl = renderer.gl
  gl.clearColor(0, 0, 0, 0)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

  program = new Program(gl, {
    vertex: vertexShader,
    fragment: fragmentShader,
    uniforms: {
      iTime: { value: 0 },
      iResolution: {
        value: new Color(gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height),
      },
      uColor: { value: new Color(...props.color) },
      uAmplitude: { value: props.amplitude },
      uDistance: { value: props.distance },
      uMouse: { value: new Float32Array([0.5, 0.5]) },
      uCurvature: { value: props.curvature },
      uCurveCenter: { value: props.curveCenter },
      uBaseline: { value: props.baseline },
    },
  })
  mesh = new Mesh(gl, { geometry: new Triangle(gl), program })

  const canvas = gl.canvas as HTMLCanvasElement
  canvas.style.cssText = 'width:100%;height:100%;display:block'
  container.appendChild(canvas)

  function resize() {
    if (!container || !renderer || !program)
      return
    const { clientWidth, clientHeight } = container
    renderer.setSize(clientWidth, clientHeight)
    const res = program.uniforms.iResolution!.value as Color
    res.r = clientWidth
    res.g = clientHeight
    res.b = clientWidth / Math.max(clientHeight, 1)
  }

  // 掛 window 而不是 container：這層當背景用時是 pointer-events-none，
  // 容器自己收不到任何指標事件，互動會整個失效
  function handleMouseMove(e: MouseEvent) {
    if (!container)
      return
    const rect = container.getBoundingClientRect()
    targetMouse[0] = (e.clientX - rect.left) / rect.width
    targetMouse[1] = 1 - (e.clientY - rect.top) / rect.height
  }

  function handleMouseLeave() {
    targetMouse[0] = 0.5
    targetMouse[1] = 0.5
  }

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  let raf: number | null = null

  function renderFrame(t: number) {
    raf = null
    if (!program || !renderer || !mesh)
      return

    const mouseUniform = program.uniforms.uMouse!.value as Float32Array
    if (props.enableMouseInteraction) {
      const smoothing = 0.05
      currentMouse[0] += smoothing * (targetMouse[0]! - currentMouse[0]!)
      currentMouse[1] += smoothing * (targetMouse[1]! - currentMouse[1]!)
      mouseUniform[0] = currentMouse[0]!
      mouseUniform[1] = currentMouse[1]!
    }
    else {
      mouseUniform[0] = 0.5
      mouseUniform[1] = 0.5
    }

    program.uniforms.iTime!.value = t * 0.001
    renderer.render({ scene: mesh })

    // 減少動態時只畫這一幀：線還在，但不再飄
    if (isVisible.value && !motionQuery.matches)
      raf = requestAnimationFrame(renderFrame)
  }

  function start() {
    if (raf === null)
      raf = requestAnimationFrame(renderFrame)
  }

  window.addEventListener('resize', resize)
  motionQuery.addEventListener('change', start)
  if (props.enableMouseInteraction) {
    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    window.addEventListener('mouseleave', handleMouseLeave, { passive: true })
  }

  resize()
  start()

  cleanup = () => {
    if (raf !== null)
      cancelAnimationFrame(raf)
    window.removeEventListener('resize', resize)
    motionQuery.removeEventListener('change', start)
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseleave', handleMouseLeave)
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    canvas.remove()
    renderer = null
    gl = null
    program = null
    mesh = null
  }
}

// 只有在視野內才跑；hero 捲出畫面就停
onMounted(() => {
  const container = containerRef.value
  if (!container)
    return
  observer = new IntersectionObserver(
    ([entry]) => (isVisible.value = entry?.isIntersecting ?? false),
    { threshold: 0, rootMargin: '50px' },
  )
  observer.observe(container)
})

watch(isVisible, (visible) => {
  if (visible && !renderer)
    init()
})

// props 變動只改 uniforms，不重建 WebGL context
watch(
  () => [props.color, props.amplitude, props.distance, props.curvature, props.curveCenter, props.baseline] as const,
  () => {
    if (!program)
      return
    const color = program.uniforms.uColor!.value as Color
    color.set(...props.color)
    program.uniforms.uAmplitude!.value = props.amplitude
    program.uniforms.uDistance!.value = props.distance
    program.uniforms.uCurvature!.value = props.curvature
    program.uniforms.uCurveCenter!.value = props.curveCenter
    program.uniforms.uBaseline!.value = props.baseline
  },
  { deep: true },
)

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  cleanup?.()
  cleanup = null
})
</script>

<template>
  <div ref="containerRef" class="relative size-full" />
</template>

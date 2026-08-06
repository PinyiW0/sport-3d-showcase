/**
 * 滑鼠停留在 3D 點上時顯示名稱的浮層，取代 Plotly 免費附的 `hoverinfo`。
 *
 * 判定走「投影到螢幕座標比像素距離」而非 Raycaster：目標只有十幾個點，
 * 投影一輪比建 Raycaster + 處理 InstancedMesh 的 instanceId 單純得多，
 * 而且命中半徑直接就是像素值，調起來直觀（Raycaster 的 threshold 是 world 單位，
 * 會隨 zoom 變成忽大忽小的命中框）。
 */
import type { PerspectiveCamera, Vector3 } from 'three'

export interface HoverTargets {
  /** 世界座標點；null 表示該槽位缺測，跳過不判定。 */
  points: ReadonlyArray<Vector3 | null>
  /** 與 points 同長度的名稱。 */
  names: ReadonlyArray<string>
}

export interface HoverLabelOptions {
  /** 命中半徑（像素），預設 14。 */
  thresholdPx?: number
  /** 浮層文字色，預設白。 */
  color?: string
  /** 浮層底色，預設半透明黑。 */
  background?: string
}

export interface HoverLabel {
  /** 每幀呼叫：相機或資料變動後重算命中。 */
  update: () => void
  dispose: () => void
}

/**
 * @param container 需為 `position: relative` 的容器，浮層以絕對定位掛在裡面
 * @param camera 投影用的相機，需與 Viewport 同一顆
 * @param getTargets 每次判定時取得當下的點與名稱（資料逐幀變動，不能只傳一次快照）
 * @param opts 命中半徑與配色
 */
export function createHoverLabel(
  container: HTMLElement,
  camera: PerspectiveCamera,
  getTargets: () => HoverTargets,
  opts: HoverLabelOptions = {},
): HoverLabel {
  const threshold = opts.thresholdPx ?? 14

  const el = document.createElement('div')
  el.style.cssText = [
    'position:absolute',
    'padding:2px 6px',
    'border-radius:3px',
    'font-size:12px',
    'line-height:1.4',
    'white-space:nowrap',
    // 浮層本身不能吃到滑鼠事件，否則游標一碰到它就離開了目標點，標籤會閃爍
    'pointer-events:none',
    'transform:translate(-50%,-140%)',
    'display:none',
    'z-index:1',
    `color:${opts.color ?? '#ffffff'}`,
    `background:${opts.background ?? 'rgba(0,0,0,0.75)'}`,
  ].join(';')
  container.appendChild(el)

  /** 游標在容器內的像素座標；null 表示游標不在容器上。 */
  let pointer: { x: number, y: number } | null = null

  function onPointerMove(event: PointerEvent): void {
    const rect = container.getBoundingClientRect()
    pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  function onPointerLeave(): void {
    pointer = null
    el.style.display = 'none'
  }

  container.addEventListener('pointermove', onPointerMove)
  container.addEventListener('pointerleave', onPointerLeave)

  function update(): void {
    if (!pointer) {
      return
    }
    const width = container.clientWidth
    const height = container.clientHeight
    if (width === 0 || height === 0)
      return

    const { points, names } = getTargets()
    let bestIndex = -1
    let bestDistance = threshold
    let bestScreen = { x: 0, y: 0 }

    for (let i = 0; i < points.length; i++) {
      const point = points[i]
      if (!point)
        continue
      const projected = point.clone().project(camera)
      // z 超出 [-1,1] 表示在相機背後或裁切面外
      if (projected.z < -1 || projected.z > 1)
        continue
      const screen = {
        x: (projected.x + 1) / 2 * width,
        y: (1 - projected.y) / 2 * height,
      }
      const distance = Math.hypot(screen.x - pointer.x, screen.y - pointer.y)
      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = i
        bestScreen = screen
      }
    }

    if (bestIndex < 0) {
      el.style.display = 'none'
      return
    }
    el.textContent = names[bestIndex] ?? ''
    el.style.left = `${bestScreen.x}px`
    el.style.top = `${bestScreen.y}px`
    el.style.display = 'block'
  }

  function dispose(): void {
    container.removeEventListener('pointermove', onPointerMove)
    container.removeEventListener('pointerleave', onPointerLeave)
    el.remove()
  }

  return { update, dispose }
}

import { PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { fitPointsInView } from './viewport'

const UP = new Vector3(0, 0, 1)
const EYE = new Vector3(2, -2.4, 1)
const FOV = 45
const ASPECT = 16 / 9

/** 依擬合結果擺相機，回傳所有點投影後的畫面範圍（-1～1） */
function projectedExtent(points: Vector3[]) {
  const fit = fitPointsInView(points, EYE, UP, FOV, ASPECT)!
  const camera = new PerspectiveCamera(FOV, ASPECT, 0.1, 100000)
  camera.up.copy(UP)
  camera.position.copy(fit.target).addScaledVector(EYE.clone().normalize(), fit.distance)
  camera.lookAt(fit.target)
  camera.updateMatrixWorld()
  const ndc = points.map(p => p.clone().project(camera))
  return {
    minX: Math.min(...ndc.map(v => v.x)),
    maxX: Math.max(...ndc.map(v => v.x)),
    minY: Math.min(...ndc.map(v => v.y)),
    maxY: Math.max(...ndc.map(v => v.y)),
  }
}

describe('fitPointsInView', () => {
  it('沒有點時回傳 null', () => {
    expect(fitPointsInView([], EYE, UP, FOV, ASPECT)).toBeNull()
  })

  it('所有點都落在畫面內，且最外側的點貼近邊緣（不是鬆鬆地框一大圈）', () => {
    // 模擬打者偏在一側、球從另一個方向延伸出去的點雲
    const points = [
      new Vector3(-160, -50, 0),
      new Vector3(-100, 20, 210),
      new Vector3(20, 130, 180),
      new Vector3(30, 300, 120),
    ]
    const e = projectedExtent(points)
    for (const v of [e.minX, e.maxX, e.minY, e.maxY])
      expect(Math.abs(v)).toBeLessThanOrEqual(1 + 1e-6)
    expect(Math.max(e.maxX - e.minX, e.maxY - e.minY)).toBeGreaterThan(1.9)
  })

  it('點偏在一側時會把注視點挪過去，投影範圍大致置中', () => {
    const points = [
      new Vector3(-160, -50, 0),
      new Vector3(-150, 0, 220),
      new Vector3(40, 320, 100),
    ]
    const e = projectedExtent(points)
    expect(Math.abs((e.minX + e.maxX) / 2)).toBeLessThan(0.05)
    expect(Math.abs((e.minY + e.maxY) / 2)).toBeLessThan(0.05)
  })
})

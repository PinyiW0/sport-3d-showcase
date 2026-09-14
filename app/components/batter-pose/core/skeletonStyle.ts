/**
 * 骨架的顯示分類（純函式，無 three）：依關節名稱決定每條骨頭、每個關節的顯示角色。
 *
 * 只看名稱、不寫死索引（同 swingScene 讀 jointNames／bones 的原則）。認不出來的名稱一律歸軀幹色、
 * 照常畫出來——分類只決定顏色與粗細，不決定畫不畫。
 */
import type { BpeBone } from '../../bpe-data/core/types'

export type BodySide = 'left' | 'right' | 'center'

/**
 * - `left`／`right`：左右半身的四肢（左右是打者自己的左右），分色才看得出前腳、前手
 * - `core`：軀幹（肩、髖四角之間）與跨左右的線，用中性色把人體的「中軸」穩住
 * - `head`：頭部五點與耳到肩的頸線，畫得細、畫得淡——五點擠在十幾公分內，照四肢畫會糊成一團
 */
export type SkeletonRole = 'left' | 'right' | 'core' | 'head'

/** COCO-17 的頭部五點：nose、left/right_eye、left/right_ear */
const HEAD_JOINT_PATTERN = /(?:^|_)(?:nose|eye|ear)$/
/** 軀幹四角：left/right_shoulder、left/right_hip */
const TORSO_JOINT_PATTERN = /(?:^|_)(?:shoulder|hip)$/

/** 以 `left_`／`right_` 前綴判定左右；其餘（nose、球棒點）歸中線。 */
export function jointSide(name: string): BodySide {
  if (name.startsWith('left_'))
    return 'left'
  if (name.startsWith('right_'))
    return 'right'
  return 'center'
}

export function isHeadJoint(name: string): boolean {
  return HEAD_JOINT_PATTERN.test(name)
}

export function isTorsoJoint(name: string): boolean {
  return TORSO_JOINT_PATTERN.test(name)
}

/** 頭部點 → head；軀幹四角 → core；其餘依左右，沒有左右前綴的歸 core。 */
export function jointRole(name: string): SkeletonRole {
  if (isHeadJoint(name))
    return 'head'
  if (isTorsoJoint(name))
    return 'core'
  const side = jointSide(name)
  return side === 'center' ? 'core' : side
}

/**
 * 任一端是頭部點 → head（含耳到肩的頸線）；兩端都是軀幹四角 → core（肩線、髖線、軀幹兩側）；
 * 其餘兩端同側 → 那一側，跨左右或接到中線點 → core。
 */
export function boneRole(jointNames: readonly string[], bone: BpeBone): SkeletonRole {
  const from = jointNames[bone.from]!
  const to = jointNames[bone.to]!
  if (isHeadJoint(from) || isHeadJoint(to))
    return 'head'
  if (isTorsoJoint(from) && isTorsoJoint(to))
    return 'core'
  const side = jointSide(from)
  return side !== 'center' && side === jointSide(to) ? side : 'core'
}

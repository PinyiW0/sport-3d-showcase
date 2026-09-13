import type { BpeBone } from '../../bpe-data/core/types'
import { describe, expect, it } from 'vitest'
import { boneRole, isHeadJoint, isTorsoJoint, jointRole, jointSide } from './skeletonStyle'

// 交付資料實際的 19 點名稱（COCO-17 ＋ 球棒兩點）
const NAMES = [
  'nose',
  'left_eye',
  'right_eye',
  'left_ear',
  'right_ear',
  'left_shoulder',
  'right_shoulder',
  'left_elbow',
  'right_elbow',
  'left_wrist',
  'right_wrist',
  'left_hip',
  'right_hip',
  'left_knee',
  'right_knee',
  'left_ankle',
  'right_ankle',
  'bat_knob',
  'bat_head',
]

function bone(from: number, to: number): BpeBone {
  return { from, to, kind: 'body' }
}

describe('jointSide', () => {
  it('依 left_／right_ 前綴分左右', () => {
    expect(jointSide('left_knee')).toBe('left')
    expect(jointSide('right_wrist')).toBe('right')
  })

  it('沒有左右前綴的點歸中線', () => {
    expect(jointSide('nose')).toBe('center')
    expect(jointSide('bat_head')).toBe('center')
  })
})

describe('isHeadJoint／isTorsoJoint', () => {
  it('頭部五點都認得出來', () => {
    expect(NAMES.filter(isHeadJoint)).toEqual(['nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear'])
  })

  it('軀幹四角是左右肩與左右髖', () => {
    expect(NAMES.filter(isTorsoJoint)).toEqual(['left_shoulder', 'right_shoulder', 'left_hip', 'right_hip'])
  })

  it('名稱裡剛好含 head 的球棒點不算頭部', () => {
    expect(isHeadJoint('bat_head')).toBe(false)
  })
})

describe('jointRole', () => {
  it('四肢關節依左右、軀幹四角歸 core、頭部歸 head', () => {
    expect(jointRole('left_knee')).toBe('left')
    expect(jointRole('right_elbow')).toBe('right')
    expect(jointRole('left_shoulder')).toBe('core')
    expect(jointRole('right_ear')).toBe('head')
  })

  it('認不出左右的點歸 core', () => {
    expect(jointRole('pelvis')).toBe('core')
  })
})

describe('boneRole', () => {
  it('四肢骨頭依左右', () => {
    expect(boneRole(NAMES, bone(15, 13))).toBe('left') // 左踝–左膝
    expect(boneRole(NAMES, bone(8, 10))).toBe('right') // 右肘–右腕
    expect(boneRole(NAMES, bone(5, 7))).toBe('left') // 左肩–左肘：一端是軀幹也算四肢
  })

  it('軀幹的肩線、髖線、兩側都歸 core', () => {
    expect(boneRole(NAMES, bone(5, 6))).toBe('core')
    expect(boneRole(NAMES, bone(11, 12))).toBe('core')
    expect(boneRole(NAMES, bone(5, 11))).toBe('core')
  })

  it('臉上的骨頭與耳到肩的頸線都歸 head', () => {
    expect(boneRole(NAMES, bone(1, 2))).toBe('head')
    expect(boneRole(NAMES, bone(3, 5))).toBe('head')
  })

  it('跨左右的四肢骨頭歸 core', () => {
    expect(boneRole(NAMES, bone(13, 14))).toBe('core')
  })
})

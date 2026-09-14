/**
 * 揮棒動畫的缺值統計（純函式），供資訊列顯示用：
 * 骨架整幀全缺的幀數，以及人體齊全但球棒兩點有缺的幀數。
 */
import type { BpeFrame } from '../../bpe-data/core/types'
import { isBatJoint } from '../../bpe-data/core/parseBpeResult'

export interface SwingStats {
  /** 整幀（含球棒）所有關節皆為 null 的幀數。 */
  allMissingFrames: number
  /** 人體關節齊全、但至少一個 bat_* 點為 null 的幀數。 */
  batMissingFrames: number
}

export function computeSwingStats(jointNames: readonly string[], frames: readonly BpeFrame[]): SwingStats {
  const bodyIndices: number[] = []
  const batIndices: number[] = []
  jointNames.forEach((name, i) => (isBatJoint(name) ? batIndices : bodyIndices).push(i))

  let allMissingFrames = 0
  let batMissingFrames = 0
  for (const frame of frames) {
    if (frame.joints.every(joint => joint === null)) {
      allMissingFrames++
      continue
    }
    const bodyComplete = bodyIndices.every(i => frame.joints[i] !== null)
    const batMissing = batIndices.some(i => frame.joints[i] === null)
    if (bodyComplete && batMissing)
      batMissingFrames++
  }
  return { allMissingFrames, batMissingFrames }
}

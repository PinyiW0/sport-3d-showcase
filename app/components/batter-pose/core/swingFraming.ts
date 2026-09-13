/**
 * 取景要框進畫面的點（純計算，無 DOM／three），同 pitch-pose-data/core/skeletonBounds.ts 的範式。
 *
 * 範圍由「整段動作」決定、播放中永不重算——若跟著當下 frame 的資料範圍適配，
 * 空間大小會逐幀改變，看起來像在「呼吸」。這是已知地雷。
 *
 * 回傳點而不是軸範圍：相機依點本身取景（Viewport.framePoints），不框方盒的空角落。
 * 打者在三壘側、球從投手方向來，方盒的遠上角是一片空，框進去打者就縮成一小塊。
 */
import type { BpeFrame, BpePoint3 } from '../../bpe-data/core/types'
import { isBatJoint } from '../../bpe-data/core/parseBpeResult'

/**
 * - `overview`：全景，照規範把骨架（含球棒）與有效球體座標一起框進來（預設）
 * - `batter`：打者特寫，只框人體關節——球棒在預備與收棒時會揮到頭頂上方，
 *   連它一起框就跟全景差不多大。球棒與球可能出框，使用者自己切過去才用
 * - `side`／`pitcher`／`top`：快捷視角（一壘側平視、投手方向、俯視），取景的點同全景，只換看的方向
 */
export type SwingView = 'overview' | 'batter' | 'side' | 'pitcher' | 'top'

/**
 * 各視角的相機方向（相對注視點，不必正規化；場景 z-up、+x 一壘、+y 投手）：
 * - 全景／特寫：一壘側、捕手後方、略高——右打者站三壘側、面向 +x，看得到揮棒正面與弧線
 * - 側面：一壘側平視（略高一點點），跨步方向在畫面上是左右，看得出跨步距離與球棒高低
 * - 投手：從投手方向往本壘看
 * - 俯視：幾乎正上方；稍微往捕手側偏，畫面「上」才穩定指向投手（正上方時相機 up 與視線平行，方向不定）
 */
export const SWING_VIEW_EYE: Readonly<Record<SwingView, readonly [number, number, number]>> = {
  overview: [2.0, -2.4, 1.0],
  batter: [2.0, -2.4, 1.0],
  side: [1, 0, 0.12],
  pitcher: [0, 1, 0.3],
  top: [0, -0.12, 1],
}

/** 資料全缺時的替代範圍：0～100 cm 方盒的兩個對角，避免相機拿到空陣列無處可看 */
const EMPTY_FALLBACK: readonly BpePoint3[] = [[0, 0, 0], [100, 100, 100]]

/**
 * 整段動作裡要框進畫面的點。打者特寫：有效的人體關節（`bat_*` 以外）；其餘視角：所有有效關節
 * 與有效球體座標。打者特寫一個點都沒有時退回全景的點；全景也沒有才用替代範圍。
 */
export function collectFramingPoints(frames: readonly BpeFrame[], jointNames: readonly string[], view: SwingView): BpePoint3[] {
  const points: BpePoint3[] = []
  const bodyOnly = view === 'batter'
  const skipJoint = jointNames.map(name => bodyOnly && isBatJoint(name))
  for (const frame of frames) {
    frame.joints.forEach((joint, i) => {
      if (joint && !skipJoint[i])
        points.push(joint)
    })
    if (!bodyOnly && frame.ball)
      points.push(frame.ball)
  }
  if (points.length)
    return points
  if (view === 'batter')
    return collectFramingPoints(frames, jointNames, 'overview')
  return EMPTY_FALLBACK.map(point => [...point])
}
